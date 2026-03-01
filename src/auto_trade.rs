use crate::models::*;

use crate::deriv_common::*;
use std::sync::Arc;
use tokio::sync::broadcast;
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::tungstenite::Message as TungsteniteMessage;
use chrono::Local;
use indicator_math_v2::{AnalysisGenerator as V2AnalysisGenerator, AnalysisOptions as V2AnalysisOptions, Candle as V2Candle};
use crate::firestore_manager::GlobalFirestore;
use crate::firestore_manager::TradeRecord;

pub async fn auto_multi_trade(
    tx: broadcast::Sender<BroadcastMessage>,
    config: ClientCommand,
    mut cmd_rx: tokio::sync::mpsc::Receiver<String>,
    firestore: Arc<tokio::sync::Mutex<GlobalFirestore>>,
) {
    println!("🤖 ====== AUTO MULTI-TRADE STARTED ======");
    println!("   Assets: {:?}", config.assets);
    println!(
        "   Stake: {}, Mode: {}, Duration: {}{}",
        config.initial_stake, config.money_mode, config.duration, config.duration_unit
    );
    println!(
        "   Target Profit: {}, Target Win: {}",
        config.target_profit, config.target_win
    );

    // 1. Load tradeSignal.json
    let signal_entries: Vec<TradeSignalEntry> = match load_trade_signals() {
        Ok(entries) => entries,
        Err(e) => {
            println!("❌ AutoTrade: {}", e);
            return;
        }
    };

    // Use assets from command (checked checkboxes), filtered by tradeSignal active entries
    let asset_symbols: Vec<String> = if config.assets.is_empty() {
        // Fallback: use all active from tradeSignal.json
        signal_entries
            .iter()
            .filter(|e| e.is_active == "y")
            .map(|e| e.asset_code.clone())
            .collect()
    } else {
        config.assets.clone()
    };

    if asset_symbols.is_empty() {
        println!("❌ AutoTrade: No assets selected!");
        return;
    }

    println!(
        "📊 AutoTrade: {} assets to analyze: {:?}",
        asset_symbols.len(),
        asset_symbols
    );

    // Build CandleMasterCode list for StatusCode resolution
    let master_codes = build_candle_master_codes();
    let master_codes_arc = std::sync::Arc::new(master_codes);
    let v2_options = V2AnalysisOptions::default();

    // 2. Connect to Deriv API
    let url = deriv_ws_url(&config.app_id);
    println!("🌐 AutoTrade: Connecting to Deriv API...");

    match tokio_tungstenite::connect_async(&url).await {
        Ok((ws_stream, _)) => {
            println!("✅ AutoTrade: Connected to Deriv");
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

            // 3. Fetch historical candles and initialize V2 generators per asset (PARALLEL)
            let mut generators: std::collections::HashMap<String, V2AnalysisGenerator> =
                std::collections::HashMap::new();
            let mut current_candle: std::collections::HashMap<String, (u64, f64, f64, f64, f64)> =
                std::collections::HashMap::new();

            for asset in &asset_symbols {
                println!("📥 AutoTrade: Fetching history for {}...", asset);
                let req = serde_json::json!({
                    "ticks_history": asset,
                    "adjust_start_time": 1,
                    "count": 1000,
                    "end": "latest",
                    "style": "candles",
                    "granularity": 60
                });
                let _ = write.send(TungsteniteMessage::Text(req.to_string())).await;

                // Wait for response, skipping non-matching messages
                let timeout = tokio::time::Duration::from_secs(10);
                let start_wait = tokio::time::Instant::now();

                while start_wait.elapsed() < timeout {
                    if let Ok(Some(Ok(TungsteniteMessage::Text(text)))) =
                        tokio::time::timeout(tokio::time::Duration::from_secs(2), read.next()).await
                    {
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
                            if let Some(error) = json.get("error") {
                                println!("❌ AutoTrade history error: {}", error);
                            }
                            if let Some(candles_arr) =
                                json.get("candles").and_then(|c| c.as_array())
                            {
                                // Confirm matching asset
                                let resp_asset = json
                                    .get("echo_req")
                                    .and_then(|e| e.get("ticks_history"))
                                    .and_then(|a| a.as_str())
                                    .unwrap_or("");
                                if resp_asset != *asset {
                                    continue;
                                }

                                let (gen, historical_results, count) = build_historical_analysis(
                                    candles_arr,
                                    asset,
                                    &signal_entries,
                                    master_codes_arc.clone(),
                                    v2_options.clone(),
                                    1000,
                                );

                                if let Some(ref last) = gen.state.last_analysis {
                                    println!(
                                        "  ✅ {} loaded {} candles | StatusCode={} StatusDesc={}",
                                        asset, count, last.status_code, last.status_desc
                                    );
                                } else {
                                    println!(
                                        "  ✅ {} loaded {} candles (no analysis yet)",
                                        asset, count
                                    );
                                }

                                // Send history to frontend
                                let hist_msg = HistoricalAnalysis {
                                    msg_type: "historical_analysis".to_string(),
                                    symbol: asset.clone(),
                                    results: historical_results,
                                };
                                let _ = tx.send(BroadcastMessage::HistoricalAnalysis(hist_msg));

                                generators.insert(asset.clone(), gen);
                                break; // Success, break while loop for this asset
                            }
                        }
                    } else {
                        break; // Timeout or stream closed
                    }
                }
                tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
            }

            println!(
                "📊 AutoTrade: All {} generators ready. Subscribing to live candles...",
                generators.len()
            );

            // Broadcast initial status
            let _ = tx.send(BroadcastMessage::AutoTradeStatus(AutoTradeStatusMessage {
                msg_type: "auto_trade_status".to_string(),
                active: true,
                entries: vec![],
                grand_profit: 0.0,
                trade_count: 0,
                message: format!("Auto-trade started with {} assets", generators.len()),
            }));

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

            // Trading state
            let mut last_check_minute: Option<u64> = None;
            let mut balance: f64 = 1000.0;
            let mut grand_profit: f64 = 0.0;
            let mut win_count: u32 = 0;
            let mut trade_count: u32 = 0;
            let mut lot_active = true;
            let martingale_stakes = vec![1.0, 2.0, 6.0, 18.0, 54.0, 162.0, 384.0, 800.0, 1600.0];
            let mut stake_index_per_asset: std::collections::HashMap<String, usize> =
                std::collections::HashMap::new();
            let mut pending_contracts: std::collections::HashMap<String, String> =
                std::collections::HashMap::new(); // contract_id -> asset

            // === NEW DAY TRADE LOGGING STATE ===
            let mut day_trade_entries: Vec<DayTradeEntry> = Vec::new();
            let mut first_trade_time: Option<String> = None;
            let current_date = Local::now().format("%Y-%m-%d").to_string();

            let mut current_duration = if config.duration == 0 {
                55
            } else {
                config.duration
            };
            let mut current_duration_unit = if config.duration_unit.is_empty() {
                "s".to_string()
            } else {
                config.duration_unit.clone()
            };
            let mut current_initial_stake = if config.initial_stake > 0.0 {
                config.initial_stake
            } else {
                1.0
            };
            let mut target_profit = if config.target_profit > 0.0 {
                config.target_profit
            } else {
                10.0
            };
            let mut target_win = if config.target_win > 0 {
                config.target_win
            } else {
                5
            };
            let mut current_money_mode = config.money_mode.clone();

            // Lot logging
            let folder_name = get_daily_folder_name();
            let folder_path = ensure_daily_folder(&folder_name);
            let lot_no = get_next_lot_no(&folder_path);
            let mut trades_for_lot: Vec<TradeObject> = Vec::new();

            println!("🤖 AutoTrade: Entering main trading loop (Lot #{})", lot_no);
            let mut initial_check_done = false; // Force first signal check immediately

            // 5. Main event loop — browser independent!
            loop {
                tokio::select! {
                    cmd = cmd_rx.recv() => {
                        if let Some(cmd) = cmd {
                            if cmd == "STOP" {
                                println!("🛑 AutoTrade: Stop command received");
                                // Unsubscribe all
                                for id in &sub_ids {
                                    let forget_msg = serde_json::json!({"forget": id});
                                    let _ = write.send(TungsteniteMessage::Text(forget_msg.to_string())).await;
                                }
                                let _ = tx.send(BroadcastMessage::AutoTradeStatus(AutoTradeStatusMessage {
                                    msg_type: "auto_trade_status".to_string(),
                                    active: false,
                                    entries: vec![],
                                    grand_profit,
                                    trade_count,
                                    message: "Auto-trade stopped by user".to_string(),
                                }));
                                break;
                            } else if cmd == "SYNC" {
                                let _ = tx.send(BroadcastMessage::AutoTradeStatus(AutoTradeStatusMessage {
                                    msg_type: "auto_trade_status".to_string(),
                                    active: lot_active,
                                    entries: vec![],
                                    grand_profit,
                                    trade_count,
                                    message: format!("Sync: Auto-trade is {} with P/L: ${:.2}", if lot_active { "Active" } else { "Stopped" }, grand_profit),
                                }));
                                // Send current balance to browser
                                let _ = tx.send(BroadcastMessage::Balance(BalanceMessage {
                                    msg_type: "balance".to_string(),
                                    balance,
                                }));
                                let _ = tx.send(BroadcastMessage::LotStatus(LotStatus {
                                    msg_type: "lot_status".to_string(),
                                    grand_profit,
                                    win_count,
                                    target_profit,
                                    target_win,
                                    lot_active,
                                    balance,
                                }));

                                // Re-broadcast historical_analysis for ALL assets so browser gets markers
                                for (asset_sym, gen) in &generators {
                                    // Rebuild CompactAnalysis from generator's analysis_array
                                    let history_results: Vec<CompactAnalysis> = gen.analysis_array.iter().map(|res| {
                                        let mut decision = "idle".to_string();
                                        if let Some(entry) = signal_entries.iter().find(|e| e.asset_code == *asset_sym) {
                                            let call_codes: Vec<&str> = entry.call_signal.split(',').map(|s| s.trim()).collect();
                                            let put_codes: Vec<&str> = entry.put_signal.split(',').map(|s| s.trim()).collect();
                                            if call_codes.contains(&res.status_code.as_str()) {
                                                decision = "call".to_string();
                                            } else if put_codes.contains(&res.status_code.as_str()) {
                                                decision = "put".to_string();
                                            }
                                        }
                                        CompactAnalysis {
                                            time: res.candletime,
                                            action: decision,
                                            status_code: res.status_code.clone(),
                                        }
                                    }).collect();

                                    if !history_results.is_empty() {
                                        let hist_msg = HistoricalAnalysis {
                                            msg_type: "historical_analysis".to_string(),
                                            symbol: asset_sym.clone(),
                                            results: history_results,
                                        };
                                        let _ = tx.send(BroadcastMessage::HistoricalAnalysis(hist_msg));
                                    }
                                }
                                println!("📡 SYNC: Re-broadcast historical_analysis for {} assets", generators.len());
                            } else if cmd.starts_with("SELL:") {
                                // Handle SELL command forwarded from handle_socket
                                let contract_id = cmd.trim_start_matches("SELL:").to_string();
                                println!("🔻 AutoTrade: Selling contract {}", contract_id);
                                let sell_msg = serde_json::json!({
                                    "sell": contract_id,
                                    "price": 0
                                });
                                let _ = write.send(TungsteniteMessage::Text(sell_msg.to_string())).await;
                            } else if let Ok(json_cmd) = serde_json::from_str::<serde_json::Value>(&cmd) {
                                if let Some(command) = json_cmd.get("command").and_then(|c| c.as_str()) {
                                    if command == "UPDATE_PARAMS" {
                                        if let Some(tp) = json_cmd.get("target_profit").and_then(|v| v.as_f64()) { target_profit = tp; }
                                        if let Some(tw) = json_cmd.get("target_win").and_then(|v| v.as_u64()) { target_win = tw as u32; }
                                        if let Some(stake) = json_cmd.get("initial_stake").and_then(|v| v.as_f64()) { current_initial_stake = stake; }
                                        if let Some(dur) = json_cmd.get("duration").and_then(|v| v.as_u64()) { current_duration = dur; }
                                        if let Some(mm) = json_cmd.get("money_mode").and_then(|v| v.as_str()) { current_money_mode = mm.to_string(); }
                                        if let Some(du) = json_cmd.get("duration_unit").and_then(|v| v.as_str()) { current_duration_unit = du.to_string(); }

                                        println!("🔄 AutoTrade: Settings updated -> Target: ${}, Win: {}, Stake: ${}, Mode: {}, Dur: {}{}",
                                            target_profit, target_win, current_initial_stake, current_money_mode, current_duration, current_duration_unit);

                                        // Broadcast updated lot status to browser
                                        let _ = tx.send(BroadcastMessage::LotStatus(LotStatus {
                                            msg_type: "lot_status".to_string(),
                                            grand_profit,
                                            win_count,
                                            target_profit,
                                            target_win,
                                            lot_active,
                                            balance,
                                        }));
                                    } else if command == "UPDATE_MODE" {
                                        if let Some(tm) = json_cmd.get("trade_mode").and_then(|v| v.as_str()) {
                                            if tm == "idle" {
                                                lot_active = false;
                                                println!("⏸️ AutoTrade: Set to IDLE (Paused).");
                                            } else if tm == "auto" {
                                                lot_active = true;
                                                println!("▶️ AutoTrade: Set to AUTO (Resumed).");
                                            }
                                            // Broadcast mode change to browser
                                            let _ = tx.send(BroadcastMessage::LotStatus(LotStatus {
                                                msg_type: "lot_status".to_string(),
                                                grand_profit,
                                                win_count,
                                                target_profit,
                                                target_win,
                                                lot_active,
                                                balance,
                                            }));
                                        }
                                    }
                                }
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
                                        println!("💰 AutoTrade: Balance = {}", balance);
                                    }
                                }

                                // Handle OHLC updates
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
                                        // Feed completed candle to generator when new candle starts
                                        let prev_open_time = current_candle.get(&symbol).map(|cc| cc.0).unwrap_or(0);

                                        if open_time != prev_open_time && prev_open_time > 0 {
                                            if let Some((pt, po, ph, pl, pc)) = current_candle.get(&symbol) {
                                                if let Some(gen) = generators.get_mut(&symbol) {
                                                    let completed = V2Candle {
                                                        time: *pt, open: *po, high: *ph,
                                                        low: *pl, close: *pc,
                                                    };
                                                    let result = gen.append_candle(completed);
                                                    println!(
                                                        "  📊 AutoTrade {} candle closed | StatusCode={} Desc={}",
                                                        symbol, result.status_code, result.status_desc
                                                    );
                                                }
                                            }
                                        }

                                        current_candle.insert(symbol.clone(), (open_time, o, h, l, c));

                                        // === CHECK AT SECOND 0-5 OF MINUTE (or first check immediately) ===
                                        let current_minute = epoch / 60;
                                        let seconds = epoch % 60;

                                        // Force first check immediately regardless of seconds,
                                        // then check at seconds 0-5 for subsequent minutes
                                        let should_check = if !initial_check_done {
                                            initial_check_done = true;
                                            true
                                        } else {
                                            seconds <= 5 && Some(current_minute) != last_check_minute
                                        };

                                        if should_check && Some(current_minute) != last_check_minute && lot_active {
                                            last_check_minute = Some(current_minute);

                                            // Signal check for ALL selected assets
                                            let mut trade_entries: Vec<AutoTradeEntry> = Vec::new();

                                            for entry in &signal_entries {
                                                if entry.is_active != "y" { continue; }
                                                if !asset_symbols.contains(&entry.asset_code) { continue; }

                                                let asset_code = &entry.asset_code;
                                                if let Some(gen) = generators.get(asset_code) {
                                                    if let Some(ref analysis) = gen.state.last_analysis {
                                                        let code_str = &analysis.status_code;

                                                        // Parse signal codes from tradeSignal.json
                                                        let call_codes: Vec<&str> = entry.call_signal.split(',').map(|s| s.trim()).collect();
                                                        let put_codes: Vec<&str> = entry.put_signal.split(',').map(|s| s.trim()).collect();

                                                        let (decision, _reason) = if call_codes.contains(&code_str.as_str()) {
                                                            ("CALL".to_string(), format!("StatusCode {} matched CallSignal", code_str))
                                                        } else if put_codes.contains(&code_str.as_str()) {
                                                            ("PUT".to_string(), format!("StatusCode {} matched PutSignal", code_str))
                                                        } else {
                                                            ("IDLE".to_string(), format!("StatusCode {} — no match", code_str))
                                                        };

                                                        println!("  📊 AutoTrade {} | Code={} | Desc={} | Decision={}",
                                                            asset_code, code_str, analysis.status_desc, decision);

                                                        // Execute trade if CALL or PUT
                                                        if decision == "CALL" || decision == "PUT" {
                                                            let stake_idx = stake_index_per_asset.get(asset_code).copied().unwrap_or(0);
                                                            let stake = if current_money_mode == "martingale" {
                                                                martingale_stakes[stake_idx.min(martingale_stakes.len() - 1)]
                                                            } else {
                                                                current_initial_stake
                                                            };

                                                            if balance >= stake {
                                                                let buy_msg = serde_json::json!({
                                                                    "buy": "1",
                                                                    "price": stake,
                                                                    "parameters": {
                                                                        "contract_type": decision,
                                                                        "symbol": asset_code,
                                                                        "duration": current_duration,
                                                                        "duration_unit": current_duration_unit,
                                                                        "basis": "stake",
                                                                        "amount": stake,
                                                                        "currency": "USD"
                                                                    }
                                                                });

                                                                println!("📈 AutoTrade: Placing {} on {} with stake ${}", decision, asset_code, stake);
                                                                let _ = write.send(TungsteniteMessage::Text(buy_msg.to_string())).await;

                                                                trade_entries.push(AutoTradeEntry {
                                                                    asset: asset_code.clone(),
                                                                    direction: decision.clone(),
                                                                    status_code: code_str.clone(),
                                                                    stake,
                                                                    timestamp: Local::now().format("%H:%M:%S").to_string(),
                                                                });

                                                                // Small delay between multiple buy orders
                                                                tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
                                                            } else {
                                                                println!("⚠️ AutoTrade: Insufficient balance for {} (need {}, have {})", asset_code, stake, balance);
                                                            }
                                                        }
                                                    }
                                                }
                                            }

                                            // Broadcast trade entries to browser (if connected)
                                            if !trade_entries.is_empty() {
                                                println!("🔥 AutoTrade: {} trades placed this minute", trade_entries.len());
                                                let _ = tx.send(BroadcastMessage::AutoTradeStatus(AutoTradeStatusMessage {
                                                    msg_type: "auto_trade_status".to_string(),
                                                    active: true,
                                                    entries: trade_entries,
                                                    grand_profit,
                                                    trade_count,
                                                    message: format!("Trades placed at minute {}", current_minute),
                                                }));
                                            }

                                            // ALWAYS broadcast multi_analysis every minute for chart markers & signal strip
                                            {
                                                let mut signal_results: Vec<AssetSignalResult> = Vec::new();
                                                for entry in &signal_entries {
                                                    if entry.is_active != "y" { continue; }
                                                    if !asset_symbols.contains(&entry.asset_code) { continue; }
                                                    if let Some(gen) = generators.get(&entry.asset_code) {
                                                        if let Some(ref analysis) = gen.state.last_analysis {
                                                            let code_str = &analysis.status_code;
                                                            let call_codes: Vec<&str> = entry.call_signal.split(',').map(|s| s.trim()).collect();
                                                            let put_codes: Vec<&str> = entry.put_signal.split(',').map(|s| s.trim()).collect();
                                                            let decision = if call_codes.contains(&code_str.as_str()) {
                                                                "call"
                                                            } else if put_codes.contains(&code_str.as_str()) {
                                                                "put"
                                                            } else {
                                                                "idle"
                                                            };
                                                            signal_results.push(AssetSignalResult {
                                                                asset: entry.asset_code.clone(),
                                                                status_code: code_str.clone(),
                                                                status_desc: analysis.status_desc.clone(),
                                                                decision: decision.to_string(),
                                                                reason: format!("AutoTrade StatusCode {}", code_str),
                                                                close_price: analysis.close,
                                                                ema_short_dir: analysis.ema_short_direction.clone(),
                                                                ema_medium_dir: analysis.ema_medium_direction.clone(),
                                                                ema_long_dir: analysis.ema_long_direction.clone(),
                                                            });
                                                        }
                                                    }
                                                }
                                                if !signal_results.is_empty() {
                                                    let _ = tx.send(BroadcastMessage::MultiAnalysis(MultiAnalysisMessage {
                                                        msg_type: "multi_analysis".to_string(),
                                                        timestamp: epoch,
                                                        assets: signal_results,
                                                    }));
                                                }
                                            }
                                        }
                                    }
                                }

                                // Handle buy response
                                if let Some(buy) = json.get("buy") {
                                    let contract_id = buy.get("contract_id")
                                        .and_then(|c| c.as_str().map(|s| s.to_string()))
                                        .or_else(|| buy.get("contract_id").and_then(|c| c.as_u64().map(|n| n.to_string())));

                                    if let Some(cid) = contract_id {
                                        // Find asset from echo_req parameters
                                        let asset_for_contract = json.get("echo_req")
                                            .and_then(|e| e.get("parameters"))
                                            .and_then(|p| p.get("symbol"))
                                            .and_then(|s| s.as_str())
                                            .unwrap_or("")
                                            .to_string();

                                        pending_contracts.insert(cid.clone(), asset_for_contract.clone());
                                        trade_count += 1;

                                        let stake = buy.get("buy_price").and_then(|p| p.as_f64()).unwrap_or(0.0);
                                        println!("✅ AutoTrade: Contract {} opened for {} (stake: ${})", cid, asset_for_contract, stake);

                                        // Broadcast trade_opened
                                        let trade_opened_time = Local::now().format("%H:%M:%S").to_string();
                                        if first_trade_time.is_none() {
                                            first_trade_time = Some(trade_opened_time.clone());
                                        }

                                        let trade_opened = TradeOpened {
                                            msg_type: "trade_opened".to_string(),
                                            contract_id: cid.clone(),
                                            asset: asset_for_contract.clone(),
                                            trade_type: "AUTO".to_string(),
                                            stake,
                                            time: trade_opened_time,
                                        };
                                        let _ = tx.send(BroadcastMessage::TradeOpened(trade_opened));

                                        // Subscribe to contract for result
                                        let proposal_msg = serde_json::json!({
                                            "proposal_open_contract": 1,
                                            "contract_id": cid,
                                            "subscribe": 1
                                        });
                                        let _ = write.send(TungsteniteMessage::Text(proposal_msg.to_string())).await;
                                    }
                                }

                                // Handle contract result
                                if let Some(proposal) = json.get("proposal_open_contract") {
                                    let contract_id = proposal.get("contract_id")
                                        .and_then(|c| c.as_str().map(|s| s.to_string()))
                                        .or_else(|| proposal.get("contract_id").and_then(|c| c.as_u64().map(|n| n.to_string())))
                                        .unwrap_or_default();
                                    let status = proposal.get("status").and_then(|s| s.as_str()).unwrap_or("open");
                                    let is_sold = proposal.get("is_sold").and_then(|v| v.as_u64()).unwrap_or(0) == 1;
                                    let is_expired = proposal.get("is_expired").and_then(|v| v.as_u64()).unwrap_or(0) == 1;
                                    let asset = proposal.get("underlying").and_then(|s| s.as_str()).unwrap_or("").to_string();
                                    let trade_type = proposal.get("contract_type").and_then(|s| s.as_str()).unwrap_or("").to_string();

                                    // Send real-time updates while contract is open
                                    if status == "open" {
                                        let current_spot = proposal.get("current_spot").and_then(|v| v.as_f64())
                                            .or_else(|| proposal.get("current_spot").and_then(|v| v.as_str()?.parse().ok()))
                                            .unwrap_or(0.0);
                                        let entry_spot = proposal.get("entry_spot").and_then(|v| v.as_f64())
                                            .or_else(|| proposal.get("entry_spot").and_then(|v| v.as_str()?.parse().ok()))
                                            .unwrap_or(0.0);
                                        let profit = proposal.get("profit").and_then(|p| p.as_f64()).unwrap_or(0.0);
                                        let profit_percentage = proposal.get("profit_percentage").and_then(|p| p.as_f64()).unwrap_or(0.0);
                                        let payout = proposal.get("payout").and_then(|p| p.as_f64()).unwrap_or(0.0);
                                        let buy_price = proposal.get("buy_price").and_then(|p| p.as_f64()).unwrap_or(0.0);
                                        let date_expiry = proposal.get("date_expiry").and_then(|d| d.as_u64()).unwrap_or(0);
                                        let date_start = proposal.get("date_start").and_then(|d| d.as_u64()).unwrap_or(0);

                                        let trade_update = TradeUpdate {
                                            msg_type: "trade_update".to_string(),
                                            contract_id: contract_id.clone(),
                                            asset: asset.clone(),
                                            trade_type: trade_type.clone(),
                                            current_spot,
                                            entry_spot,
                                            profit,
                                            profit_percentage,
                                            is_sold,
                                            is_expired,
                                            payout,
                                            buy_price,
                                            date_expiry,
                                            date_start,
                                        };
                                        let _ = tx.send(BroadcastMessage::TradeUpdate(trade_update));
                                    }

                                    if status == "sold" || status == "won" || status == "lost" {
                                        let profit = proposal.get("profit").and_then(|p| p.as_f64()).unwrap_or(0.0);
                                        let stake = proposal.get("buy_price").and_then(|p| p.as_f64()).unwrap_or(0.0);
                                        let trade_type = proposal.get("contract_type").and_then(|s| s.as_str()).unwrap_or("").to_string();

                                        balance += profit;
                                        grand_profit += profit;
                                        let is_win = profit > 0.0;
                                        if is_win { win_count += 1; }

                                        // Get asset for this contract
                                        let asset_for_contract = pending_contracts.remove(&contract_id).unwrap_or_default();

                                        // Update martingale state per asset
                                        if is_win {
                                            stake_index_per_asset.insert(asset_for_contract.clone(), 0);
                                        } else if current_money_mode == "martingale" {
                                            let idx = stake_index_per_asset.get(&asset_for_contract).copied().unwrap_or(0);
                                            stake_index_per_asset.insert(asset_for_contract.clone(), (idx + 1).min(martingale_stakes.len() - 1));
                                        }

                                        let icon = if is_win { "🎉" } else { "❌" };
                                        println!("{} AutoTrade: {} {} | Profit: ${:.2} | Balance: ${:.2} | Grand: ${:.2} | Wins: {}",
                                            icon, asset_for_contract, if is_win { "WIN" } else { "LOSS" }, profit, balance, grand_profit, win_count);

                                        // Broadcast result
                                        let _ = tx.send(BroadcastMessage::TradeResult(TradeResult {
                                            msg_type: "trade_result".to_string(),
                                            status: if is_win { "win".to_string() } else { "loss".to_string() },
                                            balance,
                                            stake,
                                            profit,
                                            contract_id: Some(contract_id.clone()),
                                        }));

                                        // Save lot log
                                        let trade_no = trades_for_lot.len() as u32 + 1;
                                        trades_for_lot.push(TradeObject {
                                            lot_no,
                                            trade_no_on_this_lot: trade_no,
                                            trade_time: Local::now().format("%d-%m-%Y %H:%M:%S").to_string(),
                                            asset: asset_for_contract.clone(),
                                            action: trade_type.to_lowercase(),
                                            money_trade: stake,
                                            money_trade_type: if current_money_mode == "fix" { "Fixed".to_string() } else { "Martingale".to_string() },
                                            win_status: if is_win { "win".to_string() } else { "loss".to_string() },
                                            profit,
                                            balance_on_lot: grand_profit,
                                            win_con: target_win.to_string(),
                                            loss_con: target_profit.to_string(),
                                            is_stop_trade: false,
                                        });

                                        let lot_log = LotLog {
                                            lot_no,
                                            trade_object_list: trades_for_lot.clone(),
                                        };
                                        save_lot_log(&ensure_daily_folder(&get_daily_folder_name()), &lot_log);

                                        // Save to Firestore
                                        let date_start_val = proposal.get("date_start").and_then(|d| d.as_u64()).unwrap_or(0);
                                        let date_expiry_val = proposal.get("date_expiry").and_then(|d| d.as_u64()).unwrap_or(0);
                                        let payout_val = proposal.get("payout").and_then(|p| p.as_f64()).unwrap_or(0.0);
                                        let entry_spot_val = proposal.get("entry_spot").and_then(|v| v.as_f64())
                                            .or_else(|| proposal.get("entry_spot").and_then(|v| v.as_str()?.parse().ok()))
                                            .unwrap_or(0.0);
                                            let _exit_spot_val = proposal.get("exit_spot").and_then(|v| v.as_f64())
                                                .or_else(|| proposal.get("exit_spot").and_then(|v| v.as_str()?.parse().ok()))
                                                .unwrap_or(0.0);

                                            let trade_record = TradeRecord {
                                                order_no: trade_no,
                                                contract_id: contract_id.clone(),
                                                symbol: asset_for_contract.clone(),
                                                trade_type: trade_type.clone(),
                                                buy_price: stake,
                                                payout: payout_val,
                                                profit_loss: profit,
                                                buy_time: date_start_val,
                                                expiry_time: date_expiry_val,
                                                time_remaining: 0,
                                                min_profit: profit,
                                                max_profit: profit,
                                                status: if is_win { "win".to_string() } else { "loss".to_string() },
                                                entry_spot: entry_spot_val,
                                                exit_spot: _exit_spot_val,
                                                lot_no,
                                                trade_no_in_lot: trade_no,
                                                trade_date: Local::now().format("%Y-%m-%d").to_string(),
                                                created_at: Local::now().format("%Y-%m-%dT%H:%M:%S").to_string(),
                                            };

                                            // === UPDATE DAY TRADE HISTORY LOGGING ===
                                            let action_str = if is_win { "WIN ✅".to_string() } else { "LOSS ❌".to_string() };
                                            let _status_code_val = entry_spot_val; // For now we keep it simple or zero, ideally it should come from state

                                        // fetch close code from generator state
                                        let mut code_str = String::from("-");
                                        if let Some(gen) = generators.get(&asset_for_contract) {
                                            if let Some(ref analysis) = gen.state.last_analysis {
                                                code_str = analysis.status_code.clone();
                                            }
                                        }

                                        day_trade_entries.push(DayTradeEntry {
                                            no: trade_no,
                                            contract_id: contract_id.clone(),
                                            symbol: asset_for_contract.clone(),
                                            status_code: code_str,
                                            trade_type: trade_type.clone(),
                                            buy_price: stake,
                                            payout: payout_val,
                                            buy_time: date_start_val.to_string(),
                                            expiry: date_expiry_val.to_string(),
                                            remaining: "00:00".to_string(),
                                            min_profit: -stake,
                                            max_profit: payout_val - stake,
                                            profit,
                                            action: action_str,
                                        });

                                        let status_of_trade = if lot_active { "กำลังเทรดอยู่".to_string() } else { "สิ้นสุดการเทรด".to_string() };

                                        let day_trade_wrapper = DayTradeWrapper {
                                            day_trade: DayTradeData {
                                                lot_no_current: lot_no,
                                                day_trade: current_date.clone(),
                                                start_trade_of_day: first_trade_time.clone().unwrap_or_default(),
                                                last_trade_of_day: Local::now().format("%H:%M:%S").to_string(),
                                                total_trade_on_this_day: day_trade_entries.len() as u32,
                                                total_profit: grand_profit,
                                                status_of_trade,
                                                current_profit: profit,
                                                day_trade_list: day_trade_entries.clone(),
                                            }
                                        };
                                        save_day_trade_log(&day_trade_wrapper);
                                        // ========================================

                                        let fs = firestore.lock().await;
                                        match fs.save_trade(&trade_record).await {
                                            Ok(doc_id) => println!("🔥 AutoTrade: Trade saved to Firestore: {}", doc_id),
                                            Err(e) => println!("⚠️ AutoTrade: Firestore save error: {}", e),
                                        }

                                        // Broadcast lot status
                                        let _ = tx.send(BroadcastMessage::LotStatus(LotStatus {
                                            msg_type: "lot_status".to_string(),
                                            grand_profit,
                                            win_count,
                                            target_profit,
                                            target_win,
                                            lot_active,
                                            balance,
                                        }));

                                        // Check stop conditions
                                        let mut stop_trading = false;
                                        if current_money_mode == "fix" {
                                            if grand_profit >= target_profit {
                                                stop_trading = true;
                                                println!("🏆 AutoTrade: TARGET PROFIT REACHED! ${:.2} >= ${:.2}", grand_profit, target_profit);
                                            }
                                        } else if current_money_mode == "martingale" {
                                            if win_count >= target_win {
                                                stop_trading = true;
                                                println!("🏆 AutoTrade: TARGET WIN COUNT REACHED! {} >= {}", win_count, target_win);
                                            }
                                        }

                                        if stop_trading {
                                            let _lot_active = false;
                                            println!("🛑 AutoTrade: STOPPING — conditions met!");

                                            // Unsubscribe
                                            for id in &sub_ids {
                                                let forget_msg = serde_json::json!({"forget": id});
                                                let _ = write.send(TungsteniteMessage::Text(forget_msg.to_string())).await;
                                            }

                                            let _ = tx.send(BroadcastMessage::AutoTradeStatus(AutoTradeStatusMessage {
                                                msg_type: "auto_trade_status".to_string(),
                                                active: false,
                                                entries: vec![],
                                                grand_profit,
                                                trade_count,
                                                message: format!("Auto-trade completed! P/L: ${:.2}, Wins: {}", grand_profit, win_count),
                                            }));
                                            break;
                                        }
                                    }
                                }

                                // Handle errors
                                if let Some(error) = json.get("error") {
                                    println!("❌ AutoTrade API Error: {}",
                                        error.get("message").unwrap_or(&serde_json::json!("Unknown")));
                                }
                            }
                        } else {
                            // WebSocket disconnected from Deriv — try reconnect
                            println!("⚠️ AutoTrade: Deriv WebSocket disconnected");
                            break;
                        }
                    }
                }
            }

            println!(
                "🤖 AutoTrade: Session ended. Grand P/L: ${:.2}, Trades: {}, Wins: {}",
                grand_profit, trade_count, win_count
            );
        }
        Err(e) => println!("❌ AutoTrade: Connection Failed: {}", e),
    }
}
