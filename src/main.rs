use axum::{
    extract::Request,
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    http::StatusCode,
    response::Response,
    response::{Html, IntoResponse, Redirect},
    routing::{get, post},
    Router,
};

use futures_util::{SinkExt, StreamExt};

// New parallel analysis lib (RustLib/indicator_math)
use indicator_math_v2::{
    AnalysisGenerator as V2AnalysisGenerator, AnalysisOptions as V2AnalysisOptions,
    Candle as V2Candle,
};
use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};

use sysinfo::{Pid, System};
use time::Duration;
use tokio::sync::broadcast;
use tokio::task::JoinHandle;
use tokio_tungstenite::tungstenite::Message as TungsteniteMessage;
use tower::ServiceExt;
use tower_http::services::ServeDir;
use tower_sessions::{Expiry, MemoryStore, Session, SessionManagerLayer};

// Firestore Module
mod firestore_manager;
use firestore_manager::{GlobalFirestore, ScanRecord, TradeRecord};

// Market Scanner Module
mod market_scanner;
use market_scanner::{AssetConfig, MarketScanner, ScanConfig};

// Extracted modules (Task 1, 3 & 7 of refactorPlan.md)
mod models;
use models::*;

mod config;
use config::*;

mod deriv_common;
use deriv_common::*;

mod deriv_single;
mod auto_trade;

// Version tracking
const VERSION: &str = "1.2.0";

struct AppState {
    tx: broadcast::Sender<BroadcastMessage>,
    current_conn: Arc<Mutex<Option<(JoinHandle<()>, tokio::sync::mpsc::Sender<String>)>>>,
    firestore: Arc<tokio::sync::Mutex<GlobalFirestore>>,
    scanner: Arc<tokio::sync::RwLock<Option<MarketScanner>>>,
    // Auto-trade handle — persists beyond browser disconnect
    auto_trade: Arc<Mutex<Option<(JoinHandle<()>, tokio::sync::mpsc::Sender<String>)>>>,
}

#[tokio::main]
async fn main() {
    dotenv::dotenv().ok();

    // Session setup
    let session_store = MemoryStore::default();
    let session_layer = SessionManagerLayer::new(session_store)
        .with_secure(false)
        .with_expiry(Expiry::OnInactivity(Duration::minutes(60)));

    let (tx, _) = broadcast::channel::<BroadcastMessage>(1024);

    // Initialize Firestore
    let mut firestore = GlobalFirestore::new();
    let project_id =
        env::var("FIRESTORE_PROJECT_ID").unwrap_or_else(|_| "your-project-id".to_string());
    if project_id != "your-project-id" {
        if let Err(e) = firestore.initialize(&project_id).await {
            println!("⚠️ Firestore initialization warning: {}", e);
        }
    } else {
        println!("⚠️ FIRESTORE_PROJECT_ID not set in .env - Firestore disabled");
    }

    let firestore_arc = Arc::new(tokio::sync::Mutex::new(firestore));

    // Initialize Market Scanner
    let scanner = MarketScanner::new(firestore_arc.clone());
    println!("📊 Market Scanner initialized");

    let state = Arc::new(AppState {
        tx,
        current_conn: Arc::new(Mutex::new(None)),
        firestore: firestore_arc,
        scanner: Arc::new(tokio::sync::RwLock::new(Some(scanner))),
        auto_trade: Arc::new(Mutex::new(None)),
    });

    let app = Router::new()
        .route("/login", get(serve_login_html).post(login_handler))
        .route("/logout", get(logout_handler))
        .route("/ws", get(websocket_handler))
        // Protected fallback using manual handler
        .route("/save_tick_history", post(save_tick_history_handler))
        .route("/api/save_scan", post(save_scan_handler))
        // Scanner API endpoints
        .route("/api/scanner/start", post(scanner_start_handler))
        .route("/api/scanner/stop", post(scanner_stop_handler))
        .route("/api/scanner/status", get(scanner_status_handler))
        .route("/api/system/resources", get(system_resources_handler)) // NEW
        // Trade Logging API endpoint
        .route("/api/save-trade", post(save_trade_handler))
        .route(
            "/api/trade_history/today",
            get(get_today_trade_history_handler),
        )
        // Trading Config API endpoints
        .route(
            "/api/trading-config",
            get(get_trading_config_handler).post(save_trading_config_handler),
        )
        .fallback(get(protected_file_handler))
        .layer(session_layer)
        .with_state(state);

    println!("-----------------------------------------");
    println!(
        "🚀 RELAY SERVER v{} STARTING AT http://localhost:8080",
        VERSION
    );
    println!("🔐 Authentication Enabled (User from .env)");
    println!("📂 Make sure 'public/index.html' exists!");
    println!("-----------------------------------------");

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

// Auth Handlers
async fn serve_login_html() -> Html<String> {
    match fs::read_to_string("public/login.html") {
        Ok(content) => Html(content),
        Err(_) => Html("<h1>Login page not found</h1>".to_string()),
    }
}

async fn login_handler(
    session: Session,
    axum::Json(payload): axum::Json<LoginPayload>,
) -> Response {
    let env_user = env::var("APP_USER").unwrap_or_else(|_| "admin".to_string());
    let env_pass = env::var("APP_PASSWORD").unwrap_or_else(|_| "password".to_string());

    if payload.username == env_user && payload.password == env_pass {
        let _ = session.insert("user", "authenticated").await;
        // Return 200 OK
        return Response::builder().status(200).body("OK".into()).unwrap();
    }

    Response::builder()
        .status(401)
        .body("Invalid credentials".into())
        .unwrap()
}

async fn logout_handler(session: Session) -> Redirect {
    let _ = session.delete().await;
    Redirect::to("/login")
}

async fn protected_file_handler(session: Session, req: Request) -> Response {
    if session
        .get::<String>("user")
        .await
        .unwrap_or(None)
        .is_some()
    {
        let service = ServeDir::new("public");
        match service.oneshot(req).await {
            Ok(res) => res.into_response(),
            Err(err) => {
                (StatusCode::INTERNAL_SERVER_ERROR, format!("Error: {}", err)).into_response()
            }
        }
    } else {
        Redirect::to("/login").into_response()
    }
}

async fn websocket_handler(
    ws: WebSocketUpgrade,
    session: Session,
    State(state): State<Arc<AppState>>,
) -> Response {
    if session
        .get::<String>("user")
        .await
        .unwrap_or(None)
        .is_none()
    {
        return Redirect::to("/login").into_response();
    }
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: Arc<AppState>) {
    println!("🔌 New Browser connected");
    let (mut sender, mut receiver) = socket.split();
    let mut rx = state.tx.subscribe();

    let mut send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            if let Ok(json) = serde_json::to_string(&msg) {
                if sender.send(Message::Text(json)).await.is_err() {
                    break;
                }
            }
        }
    });

    let state_clone = state.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            if let Message::Text(text) = msg {
                println!("📥 Browser sent: {}", text);

                match serde_json::from_str::<ClientCommand>(&text) {
                    Ok(req) => {
                        if req.command == "START_DERIV" {
                            println!("🎯 Valid Command! Requesting Asset: {}", req.asset);

                            let old_conn = {
                                let mut conn_guard = state_clone.current_conn.lock().unwrap();
                                conn_guard.take()
                            };

                            if let Some((old_handle, old_tx)) = old_conn {
                                println!("🛑 Stopping old connection...");
                                let _ = old_tx.send("FORGET".to_string()).await;
                                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                                old_handle.abort();
                            }

                            let tx = state_clone.tx.clone();
                            let (cmd_tx, cmd_rx) = tokio::sync::mpsc::channel::<String>(10);
                            let firestore = state_clone.firestore.clone();

                            let handle = tokio::spawn(async move {
                                connect_to_deriv(tx, req, cmd_rx, firestore).await;
                            });

                            {
                                let mut conn_guard = state_clone.current_conn.lock().unwrap();
                                *conn_guard = Some((handle, cmd_tx));
                            }
                        } else if req.command == "UPDATE_MODE" {
                            println!("🔄 Request to Update Trade Mode: {}", req.trade_mode);
                            // Send to current_conn (single asset viewer)
                            let cmd_tx = {
                                state_clone
                                    .current_conn
                                    .lock()
                                    .unwrap()
                                    .as_ref()
                                    .map(|(_, tx)| tx.clone())
                            };
                            if let Some(tx) = cmd_tx {
                                let _ = tx.send(format!("MODE:{}", req.trade_mode)).await;
                            }

                            // ALSO send to auto_trade task as JSON
                            let auto_tx = {
                                state_clone
                                    .auto_trade
                                    .lock()
                                    .unwrap()
                                    .as_ref()
                                    .map(|(_, tx)| tx.clone())
                            };
                            if let Some(tx) = auto_tx {
                                let _ = tx.send(text.clone()).await;
                            }
                        } else if req.command == "UPDATE_PARAMS" {
                            println!("🔄 Request to Update Params: Money={}, Stake={}, Duration={} {}, Targets=P:{}/W:{}",
                                req.money_mode, req.initial_stake, req.duration, req.duration_unit, req.target_profit, req.target_win);

                            // Load config, update, and save
                            let mut config = load_indicator_config();
                            config.trading.target_grand_profit = req.target_profit;
                            config.trading.target_win_count = req.target_win;
                            save_indicator_config(&config);

                            // Send to current_conn (single asset)
                            let cmd_tx = {
                                state_clone
                                    .current_conn
                                    .lock()
                                    .unwrap()
                                    .as_ref()
                                    .map(|(_, tx)| tx.clone())
                            };
                            if let Some(tx) = cmd_tx {
                                let _ = tx
                                    .send(format!(
                                        "PARAMS:{}:{}:{}:{}:{}:{}",
                                        req.money_mode,
                                        req.initial_stake,
                                        req.duration,
                                        req.duration_unit,
                                        req.target_profit,
                                        req.target_win
                                    ))
                                    .await;
                            }

                            // ALSO send to auto_trade task as JSON
                            let auto_tx = {
                                state_clone
                                    .auto_trade
                                    .lock()
                                    .unwrap()
                                    .as_ref()
                                    .map(|(_, tx)| tx.clone())
                            };
                            if let Some(tx) = auto_tx {
                                let _ = tx.send(text.clone()).await;
                            }
                        } else if req.command == "SELL" {
                            println!("🔻 Request to Sell Contract: {}", req.contract_id);
                            // Send to current_conn
                            let cmd_tx = {
                                state_clone
                                    .current_conn
                                    .lock()
                                    .unwrap()
                                    .as_ref()
                                    .map(|(_, tx)| tx.clone())
                            };
                            if let Some(tx) = cmd_tx {
                                let _ = tx.send(format!("SELL:{}", req.contract_id)).await;
                            }

                            // ALSO send to auto_trade task
                            let auto_tx = {
                                state_clone
                                    .auto_trade
                                    .lock()
                                    .unwrap()
                                    .as_ref()
                                    .map(|(_, tx)| tx.clone())
                            };
                            if let Some(tx) = auto_tx {
                                let _ = tx.send(format!("SELL:{}", req.contract_id)).await;
                            }
                        } else if req.command == "STOP_STREAMS" {
                            println!("🛑 Request to Stop Streams (Keep Alive)");
                            let cmd_tx = {
                                state_clone
                                    .current_conn
                                    .lock()
                                    .unwrap()
                                    .as_ref()
                                    .map(|(_, tx)| tx.clone())
                            };
                            if let Some(tx) = cmd_tx {
                                let _ = tx.send("STOP_STREAMS".to_string()).await;
                            } else {
                                println!("⚠️ No active connection to update.");
                            }
                        } else if req.command == "START_MULTI_TRADE" {
                            println!(
                                "🎯 START_MULTI_TRADE: Starting multi-asset parallel analysis"
                            );

                            // Stop existing connection if any
                            let old_conn = {
                                let mut conn_guard = state_clone.current_conn.lock().unwrap();
                                conn_guard.take()
                            };
                            if let Some((old_handle, old_tx)) = old_conn {
                                println!("🛑 Stopping old connection...");
                                let _ = old_tx.send("FORGET".to_string()).await;
                                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                                old_handle.abort();
                            }

                            let tx = state_clone.tx.clone();
                            let (cmd_tx, cmd_rx) = tokio::sync::mpsc::channel::<String>(10);
                            let firestore = state_clone.firestore.clone();

                            let handle = tokio::spawn(async move {
                                connect_multi_asset(tx, req, cmd_rx, firestore).await;
                            });

                            {
                                let mut conn_guard = state_clone.current_conn.lock().unwrap();
                                *conn_guard = Some((handle, cmd_tx));
                            }
                        } else if req.command == "START_AUTO_MULTI" {
                            println!(
                                "🎯 START_AUTO_MULTI: Starting browser-independent multi-asset auto-trade"
                            );
                            println!("   Assets: {:?}", req.assets);

                            // Stop existing auto-trade if any
                            let old_auto = {
                                let mut auto_guard = state_clone.auto_trade.lock().unwrap();
                                auto_guard.take()
                            };
                            if let Some((old_handle, old_tx)) = old_auto {
                                println!("🛑 Stopping previous auto-trade...");
                                let _ = old_tx.send("STOP".to_string()).await;
                                tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
                                old_handle.abort();
                            }

                            let tx = state_clone.tx.clone();
                            let (cmd_tx, cmd_rx) = tokio::sync::mpsc::channel::<String>(10);
                            let firestore = state_clone.firestore.clone();

                            let handle = tokio::spawn(async move {
                                auto_multi_trade(tx, req, cmd_rx, firestore).await;
                            });

                            {
                                let mut auto_guard = state_clone.auto_trade.lock().unwrap();
                                *auto_guard = Some((handle, cmd_tx));
                            }
                        } else if req.command == "SYNC_STATUS" {
                            println!("🔄 Request to Sync Status from Browser");
                            let single_tx = {
                                state_clone
                                    .current_conn
                                    .lock()
                                    .unwrap()
                                    .as_ref()
                                    .map(|(_, tx)| tx.clone())
                            };
                            if let Some(tx) = single_tx {
                                let _ = tx.send("SYNC".to_string()).await;
                            }

                            let auto_tx = {
                                state_clone
                                    .auto_trade
                                    .lock()
                                    .unwrap()
                                    .as_ref()
                                    .map(|(_, tx)| tx.clone())
                            };
                            if let Some(tx) = auto_tx {
                                let _ = tx.send("SYNC".to_string()).await;
                            }
                        } else if req.command == "STOP_AUTO_TRADE" {
                            println!("🛑 STOP_AUTO_TRADE: Stopping auto-trade task");
                            let old_auto = {
                                let mut auto_guard = state_clone.auto_trade.lock().unwrap();
                                auto_guard.take()
                            };
                            if let Some((old_handle, old_tx)) = old_auto {
                                let _ = old_tx.send("STOP".to_string()).await;
                                tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
                                old_handle.abort();
                                println!("✅ Auto-trade stopped.");
                            } else {
                                println!("⚠️ No auto-trade running.");
                            }
                        }
                    }
                    Err(e) => println!("⚠️ JSON Parse Error: {}", e),
                }
            }
        }
    });

    tokio::select! {
        _ = (&mut send_task) => println!("📤 Send task ended"),
        _ = (&mut recv_task) => println!("📥 Receive task ended"),
    };
}

// connect_to_deriv moved to deriv_single.rs
async fn connect_to_deriv(
    tx: broadcast::Sender<BroadcastMessage>,
    config: ClientCommand,
    cmd_rx: tokio::sync::mpsc::Receiver<String>,
    firestore: Arc<tokio::sync::Mutex<GlobalFirestore>>,
) {
    deriv_single::connect_to_deriv(tx, config, cmd_rx, firestore).await;
}


// ============================================================================
//  MULTI-ASSET PARALLEL ANALYSIS (V2)
//  Uses incremental V2 AnalysisGenerator from RustLib/indicator_math.
//  Each asset gets its own generator, processing candles incrementally.
//  CandleMasterCode is used for StatusCode resolution.
// ============================================================================

// build_candle_master_codes() moved to deriv_common.rs

async fn connect_multi_asset(
    tx: broadcast::Sender<BroadcastMessage>,
    config: ClientCommand,
    mut cmd_rx: tokio::sync::mpsc::Receiver<String>,
    _firestore: Arc<tokio::sync::Mutex<GlobalFirestore>>,
) {
    // 1. Load tradeSignal.json
    let signal_entries: Vec<TradeSignalEntry> = match load_trade_signals() {
        Ok(entries) => entries,
        Err(e) => {
            println!("❌ {}", e);
            return;
        }
    };

    let active_assets: Vec<&TradeSignalEntry> = signal_entries
        .iter()
        .filter(|e| e.is_active == "y")
        .collect();

    let asset_symbols: Vec<String> = active_assets.iter().map(|a| a.asset_code.clone()).collect();
    println!(
        "📊 Multi-Asset V2: {} active assets: {:?}",
        asset_symbols.len(),
        asset_symbols
    );

    // Build CandleMasterCode list for StatusCode resolution
    let master_codes = build_candle_master_codes();
    let master_codes_arc = std::sync::Arc::new(master_codes);
    let v2_options = V2AnalysisOptions::default();

    // 2. Connect to Deriv API
    let url = deriv_ws_url(&config.app_id);
    println!("🌐 Multi-Asset V2: Connecting to Deriv API...");

    match tokio_tungstenite::connect_async(&url).await {
        Ok((ws_stream, _)) => {
            println!("✅ Multi-Asset V2: Connected to Deriv");
            let (mut write, mut read) = ws_stream.split();

            // Authorize if token provided
            if !config.api_token.is_empty() {
                let auth_msg = serde_json::json!({ "authorize": config.api_token });
                let _ = write
                    .send(TungsteniteMessage::Text(auth_msg.to_string()))
                    .await;

                // Wait and clear the auth response so it doesn't break ticks_history
                if let Ok(Some(Ok(TungsteniteMessage::Text(text)))) =
                    tokio::time::timeout(tokio::time::Duration::from_secs(3), read.next()).await
                {
                    println!(
                        "🔑 Auth response: {}",
                        text.chars().take(200).collect::<String>()
                    );
                }
            }

            // 3. Fetch historical candles and initialize V2 generators per asset
            let mut generators: std::collections::HashMap<String, V2AnalysisGenerator> =
                std::collections::HashMap::new();
            // Track current forming candle per asset (open_time -> OHLC)
            let mut current_candle: std::collections::HashMap<String, (u64, f64, f64, f64, f64)> =
                std::collections::HashMap::new();

            // === PARALLEL FETCH: Send ALL history requests at once, then collect responses ===
            // Instead of: send req → wait → send next → wait (sequential: ~3s × 10 = 30s)
            // Now:         send ALL reqs → collect ALL responses (parallel: ~3-5s total)

            // Step A: Blast out all ticks_history requests at once
            for asset in &asset_symbols {
                println!("📥 Requesting history for {}...", asset);
                let req = serde_json::json!({
                    "ticks_history": asset,
                    "adjust_start_time": 1,
                    "count": 1000,
                    "end": "latest",
                    "style": "candles",
                    "granularity": 60
                });
                let _ = write.send(TungsteniteMessage::Text(req.to_string())).await;
                // Small delay to avoid rate limiting
                tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
            }

            // Step B: Collect ALL responses — match each to its asset via echo_req
            let mut pending_assets: std::collections::HashSet<String> =
                asset_symbols.iter().cloned().collect();
            let fetch_timeout = tokio::time::Duration::from_secs(30);
            let fetch_start = tokio::time::Instant::now();

            while !pending_assets.is_empty() && fetch_start.elapsed() < fetch_timeout {
                if let Ok(Some(Ok(TungsteniteMessage::Text(text)))) =
                    tokio::time::timeout(tokio::time::Duration::from_secs(5), read.next()).await
                {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
                        if let Some(error) = json.get("error") {
                            println!("❌ AutoTrade history error: {}", error);
                        }

                        // Check if this is a candles response
                        if let Some(candles_arr) = json.get("candles").and_then(|c| c.as_array()) {
                            let resp_asset = json
                                .get("echo_req")
                                .and_then(|e| e.get("ticks_history"))
                                .and_then(|a| a.as_str())
                                .unwrap_or("")
                                .to_string();

                            if !pending_assets.contains(&resp_asset) {
                                continue;
                            }

                            // Create V2 generator and feed historical candles
                            let (gen, historical_results, count) = build_historical_analysis(
                                candles_arr,
                                &resp_asset,
                                &signal_entries,
                                master_codes_arc.clone(),
                                v2_options.clone(),
                                1000,
                            );

                            if let Some(ref last) = gen.state.last_analysis {
                                println!(
                                    "  ✅ {} loaded {} candles | StatusCode={} StatusDesc={}",
                                    resp_asset, count, last.status_code, last.status_desc
                                );
                            } else {
                                println!(
                                    "  ✅ {} loaded {} candles (no analysis yet)",
                                    resp_asset, count
                                );
                            }

                            // Send history to frontend
                            let hist_msg = HistoricalAnalysis {
                                msg_type: "historical_analysis".to_string(),
                                symbol: resp_asset.clone(),
                                results: historical_results,
                            };
                            let _ = tx.send(BroadcastMessage::HistoricalAnalysis(hist_msg));

                            generators.insert(resp_asset.clone(), gen);
                            pending_assets.remove(&resp_asset);
                            println!(
                                "  📊 {} remaining: {:?}",
                                pending_assets.len(),
                                pending_assets
                            );
                        }
                    }
                } else {
                    println!(
                        "⏱️ Timeout waiting for history response, {} pending",
                        pending_assets.len()
                    );
                    break;
                }
            }

            if !pending_assets.is_empty() {
                println!("⚠️ Failed to load history for: {:?}", pending_assets);
            }
            println!(
                "⚡ Parallel fetch completed in {:.1}s — {} generators ready",
                fetch_start.elapsed().as_secs_f64(),
                generators.len()
            );

            println!(
                "📊 All {} generators ready. Subscribing to live candles...",
                generators.len()
            );

            // 4. Subscribe to live candles for ALL assets
            let mut sub_ids: Vec<String> = Vec::new();
            for asset in &asset_symbols {
                let sub_msg = serde_json::json!({
                    "ticks_history": asset,
                    "subscribe": 1,
                    "style": "candles",
                    "granularity": 60,
                    "count": 1,
                    "end": "latest",
                    "adjust_start_time": 1
                });
                let _ = write
                    .send(TungsteniteMessage::Text(sub_msg.to_string()))
                    .await;
                tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
            }

            let mut last_check_minute: Option<u64> = None;
            let mut balance = 1000.0;
            let _ = balance; // silence unused assignment warning

            // 5. Main event loop
            loop {
                tokio::select! {
                    cmd = cmd_rx.recv() => {
                        if let Some(cmd) = cmd {
                            if cmd == "FORGET" || cmd == "STOP_STREAMS" {
                                println!("🛑 Multi-Asset V2: Stopping all streams...");
                                for id in &sub_ids {
                                    let forget_msg = serde_json::json!({"forget": id});
                                    let _ = write.send(TungsteniteMessage::Text(forget_msg.to_string())).await;
                                }
                                break;
                            }
                        }
                    }

                    msg = read.next() => {
                        if let Some(Ok(TungsteniteMessage::Text(raw_text))) = msg {
                            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&raw_text) {

                                // Track subscription IDs
                                if let Some(sub) = json.get("subscription") {
                                    if let Some(id) = sub.get("id").and_then(|i| i.as_str()) {
                                        if !sub_ids.contains(&id.to_string()) {
                                            sub_ids.push(id.to_string());
                                        }
                                    }
                                }

                                // Get balance from authorize
                                if let Some(authorize) = json.get("authorize") {
                                    if let Some(bal) = authorize.get("balance").and_then(|b| b.as_f64()) {
                                        balance = bal;
                                        let balance_msg = BalanceMessage {
                                            msg_type: "balance".to_string(),
                                            balance,
                                        };
                                        let _ = tx.send(BroadcastMessage::Balance(balance_msg));
                                    }
                                }

                                // Handle OHLC updates (real-time candle for subscribed assets)
                                if let Some(ohlc) = json.get("ohlc") {
                                    let symbol = ohlc.get("symbol").and_then(|s| s.as_str()).unwrap_or("").to_string();
                                    let epoch = ohlc.get("epoch").and_then(|v| v.as_u64())
                                        .or_else(|| ohlc.get("epoch").and_then(|v| v.as_str()?.parse().ok()))
                                        .unwrap_or(0);
                                    let open_time = ohlc.get("open_time").and_then(|v| v.as_u64())
                                        .or_else(|| ohlc.get("open_time").and_then(|v| v.as_str()?.parse().ok()))
                                        .unwrap_or(0);
                                    let o = ohlc.get("open").and_then(|v| v.as_f64())
                                        .or_else(|| ohlc.get("open").and_then(|v| v.as_str()?.parse().ok())).unwrap_or(0.0);
                                    let h = ohlc.get("high").and_then(|v| v.as_f64())
                                        .or_else(|| ohlc.get("high").and_then(|v| v.as_str()?.parse().ok())).unwrap_or(0.0);
                                    let l = ohlc.get("low").and_then(|v| v.as_f64())
                                        .or_else(|| ohlc.get("low").and_then(|v| v.as_str()?.parse().ok())).unwrap_or(0.0);
                                    let c = ohlc.get("close").and_then(|v| v.as_f64())
                                        .or_else(|| ohlc.get("close").and_then(|v| v.as_str()?.parse().ok())).unwrap_or(0.0);

                                    if !symbol.is_empty() && open_time > 0 {
                                        // Update current forming candle
                                        let prev_open_time = current_candle.get(&symbol).map(|cc| cc.0).unwrap_or(0);

                                        if open_time != prev_open_time && prev_open_time > 0 {
                                            // New candle started → previous candle is complete
                                            // Feed completed candle to V2 generator (incremental)
                                            if let Some((pt, po, ph, pl, pc)) = current_candle.get(&symbol) {
                                                if let Some(gen) = generators.get_mut(&symbol) {
                                                    let completed = V2Candle {
                                                        time: *pt, open: *po, high: *ph,
                                                        low: *pl, close: *pc,
                                                    };
                                                    let result = gen.append_candle(completed);
                                                    println!(
                                                        "  📊 {} candle closed | StatusCode={} Desc={}",
                                                        symbol, result.status_code, result.status_desc
                                                    );
                                                }
                                            }
                                        }

                                        // Update current candle
                                        current_candle.insert(symbol.clone(), (open_time, o, h, l, c));

                                        // Check if we are at second 0-2 of a new minute
                                        let current_minute = epoch / 60;
                                        let seconds = epoch % 60;

                                        if seconds <= 2 && Some(current_minute) != last_check_minute {
                                            last_check_minute = Some(current_minute);

                                            // === SIGNAL CHECK for ALL assets ===
                                            let mut signal_results: Vec<AssetSignalResult> = Vec::new();

                                            for entry in &signal_entries {
                                                if entry.is_active != "y" { continue; }

                                                let asset_code = &entry.asset_code;
                                                // Get latest analysis from V2 generator
                                                if let Some(gen) = generators.get(asset_code) {
                                                    if let Some(ref analysis) = gen.state.last_analysis {
                                                        let code_str = &analysis.status_code;

                                                        // Parse signal codes from tradeSignal.json
                                                        let call_codes: Vec<&str> = entry.call_signal.split(',').map(|s| s.trim()).collect();
                                                        let put_codes: Vec<&str> = entry.put_signal.split(',').map(|s| s.trim()).collect();

                                                        let (decision, reason) = if call_codes.contains(&code_str.as_str()) {
                                                            ("call".to_string(), format!("StatusCode {} matched CallSignal", code_str))
                                                        } else if put_codes.contains(&code_str.as_str()) {
                                                            ("put".to_string(), format!("StatusCode {} matched PutSignal", code_str))
                                                        } else {
                                                            ("idle".to_string(), format!("StatusCode {} — no match", code_str))
                                                        };

                                                        println!("  📊 {} | Code={} | Desc={} | Decision={}",
                                                            asset_code, code_str, analysis.status_desc, decision);

                                                        signal_results.push(AssetSignalResult {
                                                            asset: asset_code.clone(),
                                                            status_code: code_str.clone(),
                                                            status_desc: analysis.status_desc.clone(),
                                                            decision,
                                                            reason,
                                                            close_price: analysis.close,
                                                            ema_short_dir: analysis.ema_short_direction.clone(),
                                                            ema_medium_dir: analysis.ema_medium_direction.clone(),
                                                            ema_long_dir: analysis.ema_long_direction.clone(),
                                                        });
                                                    }
                                                }
                                            }

                                            if !signal_results.is_empty() {
                                                println!("📡 Broadcasting multi_analysis: {} assets at minute {}",
                                                    signal_results.len(), current_minute);

                                                let multi_msg = MultiAnalysisMessage {
                                                    msg_type: "multi_analysis".to_string(),
                                                    timestamp: epoch,
                                                    assets: signal_results,
                                                };
                                                let _ = tx.send(BroadcastMessage::MultiAnalysis(multi_msg));
                                            }
                                        }
                                    }
                                }

                                // Handle errors
                                if let Some(error) = json.get("error") {
                                    println!("❌ Multi-Asset API Error: {}",
                                        error.get("message").unwrap_or(&serde_json::json!("Unknown")));
                                }
                            }
                        } else {
                            break;
                        }
                    }
                }
            }

            println!("🔌 Multi-Asset V2: Connection closed.");
        }
        Err(e) => println!("❌ Multi-Asset V2: Connection Failed: {}", e),
    }
}

// ============================================================================
//  AUTO MULTI-ASSET TRADE (Browser-Independent)
//  Runs as a detached tokio task. When browser disconnects, trading continues.
//  Uses indicator_math_v2 (RustLib/indicator_math) for parallel analysis.
//  At second=0 of each minute, checks StatusCode against tradeSignal.json.
//  Trades assets with matching CALL/PUT signals until conditions are met.
// ============================================================================

// auto_multi_trade moved to auto_trade.rs
pub async fn auto_multi_trade(
    tx: broadcast::Sender<BroadcastMessage>,
    config: ClientCommand,
    cmd_rx: tokio::sync::mpsc::Receiver<String>,
    firestore: Arc<tokio::sync::Mutex<GlobalFirestore>>,
) {
    crate::auto_trade::auto_multi_trade(tx, config, cmd_rx, firestore).await;
}


// parse_flexible() moved to deriv_common.rs

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveTickHistoryPayload {
    pub folder_name: String,
    pub filename: String,
    pub data: String,
}

async fn save_tick_history_handler(
    axum::Json(payload): axum::Json<SaveTickHistoryPayload>,
) -> Response {
    let path_str = format!("tickhistory/{}", payload.folder_name);
    let path = Path::new(&path_str);

    if let Err(e) = std::fs::create_dir_all(path) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to create dir: {}", e),
        )
            .into_response();
    }

    let file_path = path.join(format!("{}.json", payload.filename));
    match std::fs::write(&file_path, payload.data) {
        Ok(_) => Response::builder()
            .status(200)
            .body("Saved".into())
            .unwrap(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to write: {}", e),
        )
            .into_response(),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanAssetData {
    pub symbol: String,
    pub price: f64,
    pub ci: f64,
    pub adx: f64,
    pub score: f64,
    pub is_bullish: bool,
    pub recent_candles: String,
    #[serde(default)]
    pub rank: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveScanPayload {
    pub scan_time: String,
    pub timeframe: String,
    pub period: String,
    pub assets: Vec<ScanAssetData>,
}

async fn save_scan_handler(
    State(state): State<Arc<AppState>>,
    axum::Json(payload): axum::Json<SaveScanPayload>,
) -> Response {
    println!(
        "📊 Received scan data: {} assets at {}",
        payload.assets.len(),
        payload.scan_time
    );

    let firestore = state.firestore.lock().await;
    let mut saved_count = 0;
    let mut errors = Vec::new();

    for asset in &payload.assets {
        let record = ScanRecord {
            scan_time: payload.scan_time.clone(),
            timeframe: payload.timeframe.clone(),
            period: payload.period.clone(),
            symbol: asset.symbol.clone(),
            price: asset.price,
            ci: asset.ci,
            adx: asset.adx,
            score: asset.score,
            is_bullish: asset.is_bullish,
            recent_candles: asset.recent_candles.clone(),
            rank: asset.rank.unwrap_or(0),
        };

        match firestore.save_scan(&record).await {
            Ok(_) => saved_count += 1,
            Err(e) => errors.push(format!("{}: {}", asset.symbol, e)),
        }
    }

    if errors.is_empty() {
        Response::builder()
            .status(200)
            .header("Content-Type", "application/json")
            .body(format!("{{\"success\": true, \"saved\": {}}}", saved_count).into())
            .unwrap()
    } else {
        Response::builder()
            .status(207)
            .header("Content-Type", "application/json")
            .body(
                format!(
                    "{{\"success\": true, \"saved\": {}, \"errors\": {:?}}}",
                    saved_count, errors
                )
                .into(),
            )
            .unwrap()
    }
}

// ==================== Scanner API Handlers ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScannerStartPayload {
    pub interval_seconds: u64,
    pub candle_timeframe: u64,
    pub indicator_period: usize,
    pub stop_time: Option<String>,
    #[serde(default = "default_true")]
    pub save_to_firestore: bool,
    pub assets: Vec<AssetConfigPayload>,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetConfigPayload {
    pub symbol: String,
    pub name: String,
}

async fn scanner_start_handler(
    State(state): State<Arc<AppState>>,
    axum::Json(payload): axum::Json<ScannerStartPayload>,
) -> Response {
    println!(
        "📊 Scanner start request: {} assets, interval {}s, save_db: {}",
        payload.assets.len(),
        payload.interval_seconds,
        payload.save_to_firestore
    );

    let config = ScanConfig {
        interval_seconds: payload.interval_seconds,
        candle_timeframe: payload.candle_timeframe,
        indicator_period: payload.indicator_period,
        stop_time: payload.stop_time,
        save_to_firestore: payload.save_to_firestore,
        assets: payload
            .assets
            .into_iter()
            .map(|a| AssetConfig {
                symbol: a.symbol,
                name: a.name,
            })
            .collect(),
    };

    let scanner_lock = state.scanner.read().await;
    if let Some(ref scanner) = *scanner_lock {
        match scanner.start(config).await {
            Ok(_) => Response::builder()
                .status(200)
                .header("Content-Type", "application/json")
                .body("{\"success\": true, \"message\": \"Scanner started\"}".into())
                .unwrap(),
            Err(e) => Response::builder()
                .status(400)
                .header("Content-Type", "application/json")
                .body(format!("{{\"success\": false, \"error\": \"{}\"}}", e).into())
                .unwrap(),
        }
    } else {
        Response::builder()
            .status(500)
            .header("Content-Type", "application/json")
            .body("{\"success\": false, \"error\": \"Scanner not initialized\"}".into())
            .unwrap()
    }
}

async fn scanner_stop_handler(State(state): State<Arc<AppState>>) -> Response {
    println!("📊 Scanner stop request");

    let scanner_lock = state.scanner.read().await;
    if let Some(ref scanner) = *scanner_lock {
        match scanner.stop().await {
            Ok(_) => Response::builder()
                .status(200)
                .header("Content-Type", "application/json")
                .body("{\"success\": true, \"message\": \"Scanner stopped\"}".into())
                .unwrap(),
            Err(e) => Response::builder()
                .status(400)
                .header("Content-Type", "application/json")
                .body(format!("{{\"success\": false, \"error\": \"{}\"}}", e).into())
                .unwrap(),
        }
    } else {
        Response::builder()
            .status(500)
            .header("Content-Type", "application/json")
            .body("{\"success\": false, \"error\": \"Scanner not initialized\"}".into())
            .unwrap()
    }
}

async fn scanner_status_handler(State(state): State<Arc<AppState>>) -> Response {
    let scanner_lock = state.scanner.read().await;
    if let Some(ref scanner) = *scanner_lock {
        let status = scanner.get_status().await;
        match serde_json::to_string(&status) {
            Ok(json) => Response::builder()
                .status(200)
                .header("Content-Type", "application/json")
                .body(json.into())
                .unwrap(),
            Err(e) => Response::builder()
                .status(500)
                .header("Content-Type", "application/json")
                .body(format!("{{\"error\": \"{}\"}}", e).into())
                .unwrap(),
        }
    } else {
        Response::builder()
            .status(500)
            .header("Content-Type", "application/json")
            .body("{\"error\": \"Scanner not initialized\"}".into())
            .unwrap()
    }
}

async fn system_resources_handler() -> Response {
    let mut sys = System::new_all();
    sys.refresh_all();
    let pid = Pid::from_u32(std::process::id());

    let memory_used_mb = if let Some(process) = sys.process(pid) {
        process.memory() / 1024 / 1024
    } else {
        0
    };

    let resources = SystemResources {
        memory_used_mb,
        total_memory_mb: sys.total_memory() / 1024 / 1024,
        cpu_usage: sys.global_cpu_usage(),
        uptime_secs: System::uptime(),
    };

    match serde_json::to_string(&resources) {
        Ok(json) => Response::builder()
            .status(200)
            .header("Content-Type", "application/json")
            .body(json.into())
            .unwrap(),
        Err(e) => Response::builder()
            .status(500)
            .header("Content-Type", "application/json")
            .body(format!("{{\"error\": \"{}\"}}", e).into())
            .unwrap(),
    }
}

// ==================== Trading Config API Handlers ====================

const TRADING_CONFIG_FILE: &str = "public/config.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradingThreshold {
    pub asset: String,
    pub macd12: f64,
    pub macd23: f64,
    #[serde(rename = "slopeValue")]
    pub slope_value: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradingConfigPayload {
    pub username: String,
    #[serde(rename = "assetList")]
    pub asset_list: Vec<AssetItem>,
    #[serde(rename = "defaultAsset")]
    pub default_asset: String,
    #[serde(rename = "startMoneyTrade")]
    pub start_money_trade: f64,
    #[serde(rename = "moneyMartinGale")]
    pub money_martin_gale: Vec<f64>,
    #[serde(rename = "tradeTypes")]
    pub trade_types: Vec<String>,
    #[serde(rename = "selectedTradeType")]
    pub selected_trade_type: String,
    #[serde(rename = "targetMoney")]
    pub target_money: f64,
    // EMA Settings
    #[serde(rename = "emaShortType")]
    pub ema_short_type: String,
    #[serde(rename = "emaShortPeriod")]
    pub ema_short_period: usize,
    #[serde(rename = "emaMediumType")]
    pub ema_medium_type: String,
    #[serde(rename = "emaMediumPeriod")]
    pub ema_medium_period: usize,
    #[serde(rename = "emaLongType")]
    pub ema_long_type: String,
    #[serde(rename = "emaLongPeriod")]
    pub ema_long_period: usize,
    // Thresholds
    pub thresholds: Vec<TradingThreshold>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetItem {
    pub symbol: String,
    pub name: String,
}

fn load_trading_config() -> Option<TradingConfigPayload> {
    match fs::read_to_string(TRADING_CONFIG_FILE) {
        Ok(content) => match serde_json::from_str::<TradingConfigPayload>(&content) {
            Ok(config) => Some(config),
            Err(e) => {
                println!("⚠️ Trading config parse error: {}", e);
                None
            }
        },
        Err(_) => {
            println!("📁 No trading config file found, will create on first save");
            None
        }
    }
}

fn save_trading_config(config: &TradingConfigPayload) -> Result<(), String> {
    match serde_json::to_string_pretty(config) {
        Ok(json_str) => {
            if let Err(e) = fs::write(TRADING_CONFIG_FILE, json_str) {
                Err(format!("Failed to write config file: {}", e))
            } else {
                println!(
                    "💾 Trading config saved successfully for user: {}",
                    config.username
                );
                Ok(())
            }
        }
        Err(e) => Err(format!("Failed to serialize config: {}", e)),
    }
}

fn default_trading_config() -> TradingConfigPayload {
    TradingConfigPayload {
        username: "default".to_string(),
        asset_list: vec![
            AssetItem {
                symbol: "R_10".to_string(),
                name: "Volatility 10 Index".to_string(),
            },
            AssetItem {
                symbol: "R_25".to_string(),
                name: "Volatility 25 Index".to_string(),
            },
            AssetItem {
                symbol: "R_50".to_string(),
                name: "Volatility 50 Index".to_string(),
            },
            AssetItem {
                symbol: "R_75".to_string(),
                name: "Volatility 75 Index".to_string(),
            },
            AssetItem {
                symbol: "R_100".to_string(),
                name: "Volatility 100 Index".to_string(),
            },
        ],
        default_asset: "R_10".to_string(),
        start_money_trade: 100.0,
        money_martin_gale: vec![1.0, 2.0, 6.0, 8.0, 16.0, 54.0, 162.0],
        trade_types: vec!["FixTrade".to_string(), "MartinGaleTrade".to_string()],
        selected_trade_type: "FixTrade".to_string(),
        target_money: 1000.0,
        ema_short_type: "ema".to_string(),
        ema_short_period: 3,
        ema_medium_type: "ema".to_string(),
        ema_medium_period: 8,
        ema_long_type: "ema".to_string(),
        ema_long_period: 21,
        thresholds: vec![],
    }
}

async fn get_trading_config_handler() -> Response {
    match load_trading_config() {
        Some(config) => match serde_json::to_string(&config) {
            Ok(json) => Response::builder()
                .status(200)
                .header("Content-Type", "application/json")
                .body(json.into())
                .unwrap(),
            Err(e) => Response::builder()
                .status(500)
                .header("Content-Type", "application/json")
                .body(format!("{{\"error\": \"{}\"}}", e).into())
                .unwrap(),
        },
        None => {
            // Return default config
            let default_config = default_trading_config();
            match serde_json::to_string(&default_config) {
                Ok(json) => Response::builder()
                    .status(200)
                    .header("Content-Type", "application/json")
                    .body(json.into())
                    .unwrap(),
                Err(e) => Response::builder()
                    .status(500)
                    .header("Content-Type", "application/json")
                    .body(format!("{{\"error\": \"{}\"}}", e).into())
                    .unwrap(),
            }
        }
    }
}

async fn save_trading_config_handler(
    axum::Json(payload): axum::Json<TradingConfigPayload>,
) -> Response {
    println!("📊 Saving trading config for user: {}", payload.username);

    match save_trading_config(&payload) {
        Ok(_) => Response::builder()
            .status(200)
            .header("Content-Type", "application/json")
            .body("{\"success\": true, \"message\": \"Config saved successfully\"}".into())
            .unwrap(),
        Err(e) => Response::builder()
            .status(500)
            .header("Content-Type", "application/json")
            .body(format!("{{\"success\": false, \"error\": \"{}\"}}", e).into())
            .unwrap(),
    }
}

// ==================== SAVE TRADE HANDLER ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveTradePayload {
    pub contract_id: String,
    pub symbol: String,
    pub trade_type: String,
    pub buy_price: f64,
    pub payout: f64,
    pub profit_loss: f64,
    pub status: String,
    pub trade_date: String,
    pub created_at: String,
    #[serde(default)]
    pub buy_time: u64,
    #[serde(default)]
    pub expiry_time: u64,
    #[serde(default)]
    pub entry_spot: f64,
    #[serde(default)]
    pub exit_spot: f64,
}

async fn save_trade_handler(
    State(state): State<Arc<AppState>>,
    axum::Json(payload): axum::Json<SaveTradePayload>,
) -> Response {
    println!(
        "💾 Save trade request: {} {} {} profit: {}",
        payload.contract_id, payload.symbol, payload.status, payload.profit_loss
    );

    // Create TradeRecord from payload
    let trade_record = TradeRecord {
        order_no: 0,
        contract_id: payload.contract_id.clone(),
        symbol: payload.symbol.clone(),
        trade_type: payload.trade_type.clone(),
        buy_price: payload.buy_price,
        payout: payload.payout,
        profit_loss: payload.profit_loss,
        buy_time: payload.buy_time,
        expiry_time: payload.expiry_time,
        time_remaining: 0,
        min_profit: 0.0,
        max_profit: 0.0,
        status: payload.status.clone(),
        entry_spot: payload.entry_spot,
        exit_spot: payload.exit_spot,
        lot_no: 0,
        trade_no_in_lot: 0,
        trade_date: payload.trade_date.clone(),
        created_at: payload.created_at.clone(),
    };

    // Save to Firestore
    let firestore = state.firestore.lock().await;
    match firestore.save_trade(&trade_record).await {
        Ok(doc_id) => {
            println!("✅ Trade saved to Firestore: {}", doc_id);
            Response::builder()
                .status(200)
                .header("Content-Type", "application/json")
                .body(format!("{{\"success\": true, \"doc_id\": \"{}\"}}", doc_id).into())
                .unwrap()
        }
        Err(e) => {
            println!("❌ Failed to save trade: {}", e);
            Response::builder()
                .status(500)
                .header("Content-Type", "application/json")
                .body(format!("{{\"success\": false, \"error\": \"{}\"}}", e).into())
                .unwrap()
        }
    }
}

// ==================== NEW DAY TRADE API ====================
pub async fn get_today_trade_history_handler() -> impl IntoResponse {
    let today = get_daily_folder_name();
    let path = format!("tradeHistory/{}/trade.json", today);

    match std::fs::read_to_string(&path) {
        Ok(contents) => Response::builder()
            .status(StatusCode::OK)
            .header("Content-Type", "application/json")
            .body(axum::body::Body::from(contents))
            .unwrap(),
        Err(_) => {
            // If file doesn't exist, return empty JSON instead of error
            let empty = serde_json::json!({});
            axum::Json(empty).into_response()
        }
    }
}
