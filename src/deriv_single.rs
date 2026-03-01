// deriv_single.rs - Single-asset Deriv WebSocket connection
// Extracted from main.rs (Task 5 of refactorPlan.md)

use chrono::Local;
use futures_util::{SinkExt, StreamExt};
use indicator_math::{
    generate_analysis_data, get_action_by_cut_type, get_action_by_simple,
    Candle as IndicatorCandle, CutStrategy,
};
use indicator_math_v2::{
    AnalysisGenerator as V2AnalysisGenerator, AnalysisOptions as V2AnalysisOptions,
    Candle as V2Candle,
};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::broadcast;
use tokio_tungstenite::{connect_async, tungstenite::Message as TungsteniteMessage};

use crate::config::*;
use crate::deriv_common::*;
use crate::firestore_manager::{GlobalFirestore, TradeRecord};
use crate::models::*;

pub async fn connect_to_deriv(
    tx: broadcast::Sender<BroadcastMessage>,
    config: ClientCommand,
    mut cmd_rx: tokio::sync::mpsc::Receiver<String>,
    firestore: Arc<tokio::sync::Mutex<GlobalFirestore>>,
) {
    let url = deriv_ws_url(&config.app_id);
    println!("🌐 Connecting to Deriv API for asset: {}...", config.asset);

    match connect_async(&url).await {
        Ok((ws_stream, _)) => {
            println!("✅ Connected to Deriv: {}", config.asset);
            let (mut write, mut read) = ws_stream.split();

            let mut tick_sub_id: Option<String> = None;
            let mut candle_sub_id: Option<String> = None;

            // Trading state
            let mut balance = 1000.0;
            let martingale_stakes = vec![1.0, 2.0, 6.0, 18.0, 54.0, 162.0, 384.0, 800.0, 1600.0];
            let mut current_stake_index = 0;
            let mut last_trade_minute: Option<u64> = None;
            let mut _pending_contract_id: Option<String> = None;
            let mut pending_contract_type: Option<String> = None;
            let mut current_trade_mode = config.trade_mode.clone();
            let mut current_money_mode = config.money_mode.clone();

            // Set defaults if missing (though they have defaults in struct) or 0
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

            // Load indicator config
            let mut indicator_config = load_indicator_config();
            let mut candles_for_ema: Vec<IndicatorCandle> = Vec::new();
            let mut last_ema_minute: Option<u64> = None;
            let mut last_analysis_time: Option<u64> = None; // For 2-second analysis interval
            let mut last_action: Option<String> = None; // Store last action from analysis ("call", "put", "hold")

            // LotNo State
            let mut lot_grand_profit = 0.0;
            let mut lot_win_count = 0;
            let mut lot_active = true;

            // Daily Lot Logging
            let mut daily_folder = ensure_daily_folder(&get_daily_folder_name());
            let mut current_lot_no = get_next_lot_no(&daily_folder);
            let mut trades_for_lot: Vec<TradeObject> = Vec::new();
            let mut trade_count_in_lot = 0;

            println!(
                "📂 Current Daily Folder: {}, Starting Lot No: {}",
                daily_folder, current_lot_no
            );

            // Broadcast initial Lot State
            let _ = tx.send(BroadcastMessage::LotStatus(LotStatus {
                msg_type: "lot_status".to_string(),
                grand_profit: lot_grand_profit,
                win_count: lot_win_count,
                target_profit: indicator_config.trading.target_grand_profit,
                target_win: indicator_config.trading.target_win_count,
                lot_active,
                balance: 0.0,
            }));

            // Authorize if token provided
            if !config.api_token.is_empty() {
                let auth_msg = serde_json::json!({
                    "authorize": config.api_token
                });
                let _ = write
                    .send(TungsteniteMessage::Text(auth_msg.to_string()))
                    .await;
                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            }

            // Subscribe tick
            let tick_msg = serde_json::json!({
                "ticks": "R_100",
                "subscribe": 1
            });
            // println!("📊 Subscribe  Tick candles");
            println!("🔥🔥🔥 SUBSCRIBE TICK EXECUTED 🔥🔥🔥");

            let _ = write
                .send(TungsteniteMessage::Text(tick_msg.to_string()))
                .await;
            tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;

            // Subscribe candles
            let sub_msg = serde_json::json!({
                "ticks_history": config.asset,
                "subscribe": 1,
                "style": "candles",
                "granularity": 60,
                "count": 50,
                "end": "latest",
                "adjust_start_time": 1
            });
            let _ = write
                .send(TungsteniteMessage::Text(sub_msg.to_string()))
                .await;

            loop {
                tokio::select! {
                    cmd = cmd_rx.recv() => {
                        if let Some(cmd) = cmd {
                            if cmd == "FORGET" {
                                println!("📤 Sending forget for all subscriptions...");
                                if let Some(id) = tick_sub_id.take() {
                                    let forget_msg = serde_json::json!({"forget": id});
                                    let _ = write.send(TungsteniteMessage::Text(forget_msg.to_string())).await;
                                }
                                if let Some(id) = candle_sub_id.take() {
                                    let forget_msg = serde_json::json!({"forget": id});
                                    let _ = write.send(TungsteniteMessage::Text(forget_msg.to_string())).await;
                                }
                                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                                break;
                            } else if cmd == "STOP_STREAMS" {
                                println!("📤 Sending forget for all subscriptions (Connection Kept Alive)...");
                                if let Some(id) = tick_sub_id.take() {
                                    let forget_msg = serde_json::json!({"forget": id});
                                    let _ = write.send(TungsteniteMessage::Text(forget_msg.to_string())).await;
                                }
                                if let Some(id) = candle_sub_id.take() {
                                    let forget_msg = serde_json::json!({"forget": id});
                                    let _ = write.send(TungsteniteMessage::Text(forget_msg.to_string())).await;
                                }
                                // Reset IDs
                                tick_sub_id = None;
                                candle_sub_id = None;

                                // Set mode to IDLE so we don't try to trade on old data or if streams somehow resume
                                current_trade_mode = "idle".to_string();
                                lot_active = false; // Stop lot logging

                            } else if cmd.starts_with("MODE:") {
                                let new_mode = cmd.replace("MODE:", "");

                                // Reset lot if starting fresh
                                if new_mode != "idle" && current_trade_mode == "idle" {
                                    println!("🆕 Starting new Lot session");
                                    // Update folder and Lot No
                                    daily_folder = ensure_daily_folder(&get_daily_folder_name());
                                    current_lot_no = get_next_lot_no(&daily_folder);
                                    trades_for_lot.clear();
                                    trade_count_in_lot = 0;

                                    lot_grand_profit = 0.0;
                                    lot_win_count = 0;
                                    lot_active = true;

                                    println!("🔢 New Lot No: {}", current_lot_no);

                                    let _ = tx.send(BroadcastMessage::LotStatus(LotStatus {
                                        msg_type: "lot_status".to_string(),
                                        grand_profit: lot_grand_profit,
                                        win_count: lot_win_count,
                                        target_profit: indicator_config.trading.target_grand_profit,
                                        target_win: indicator_config.trading.target_win_count,
                                        lot_active,
                                        balance: 0.0,
                                    }));
                                }

                                current_trade_mode = new_mode;
                                println!("🔄 Trade Mode Updated to: {}", current_trade_mode);

                            } else if cmd.starts_with("PARAMS:") {
                                let parts: Vec<&str> = cmd.split(':').collect();
                                if parts.len() >= 7 {
                                    // format: PARAMS:money_mode:initial_stake:duration:duration_unit:target_profit:target_win
                                    current_money_mode = parts[1].to_string();
                                    if let Ok(stake) = parts[2].parse::<f64>() {
                                        current_initial_stake = stake;
                                    }
                                    if let Ok(d) = parts[3].parse::<u64>() {
                                        current_duration = d;
                                    }
                                    current_duration_unit = parts[4].to_string();

                                    if let Ok(tp) = parts[5].parse::<f64>() {
                                        indicator_config.trading.target_grand_profit = tp;
                                    }
                                    if let Ok(tw) = parts[6].parse::<u32>() {
                                        indicator_config.trading.target_win_count = tw;
                                    }

                                    println!("✅ Params Updated: Money={}, Stake={}, Duration={} {}, T.Profit={}, T.Win={}",
                                        current_money_mode, current_initial_stake, current_duration, current_duration_unit,
                                        indicator_config.trading.target_grand_profit, indicator_config.trading.target_win_count);

                                    // Broadcast new targets
                                    let _ = tx.send(BroadcastMessage::LotStatus(LotStatus {
                                        msg_type: "lot_status".to_string(),
                                        grand_profit: lot_grand_profit,
                                        win_count: lot_win_count,
                                        target_profit: indicator_config.trading.target_grand_profit,
                                        target_win: indicator_config.trading.target_win_count,
                                        lot_active,
                                        balance: 0.0,
                                    }));

                                    // Reset martingale index if switching to fix
                                    if current_money_mode == "fix" {
                                        current_stake_index = 0;
                                    }
                                }
                            } else if cmd.starts_with("SELL:") {
                                let contract_id = cmd.replace("SELL:", "");
                                println!("🔻 Sending Sell Request for: {}", contract_id);
                                let sell_msg = serde_json::json!({
                                    "sell": contract_id,
                                    "price": 0
                                });
                                let _ = write.send(TungsteniteMessage::Text(sell_msg.to_string())).await;
                            } else if cmd == "SYNC" {
                                let _ = tx.send(BroadcastMessage::LotStatus(LotStatus {
                                    msg_type: "lot_status".to_string(),
                                    grand_profit: lot_grand_profit,
                                    win_count: lot_win_count,
                                    target_profit: indicator_config.trading.target_grand_profit,
                                    target_win: indicator_config.trading.target_win_count,
                                    lot_active,
                                    balance: 0.0,
                                }));
                                // Optional auto trade status message, even though this is single trade mode, but good for completeness
                            }
                        }
                    }

                    msg = read.next() => {
                        println!("📊 Received Msg");
                        if let Some(Ok(TungsteniteMessage::Text(raw_text))) = msg {
                            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&raw_text) {

                                if let Some(error) = json.get("error") {
                                    println!("❌ API Error: {}", error.get("message").unwrap_or(&serde_json::json!("Unknown error")));
                                    break;
                                }

                                // Get balance from authorize response
                                if let Some(authorize) = json.get("authorize") {
                                    // let mut initial_analysis_sent = false;
                                    if let Some(bal) = authorize.get("balance").and_then(|b| b.as_f64()) {
                                        balance = bal;
                                        println!("💰 Current Balance: {}", balance);

                                        // Send balance to frontend
                                        let balance_msg = BalanceMessage {
                                            msg_type: "balance".to_string(),
                                            balance,
                                        };
                                        let _ = tx.send(BroadcastMessage::Balance(balance_msg));
                                    }
                                }

                                // Handle subscription IDs
                                if let Some(sub) = json.get("subscription") {
                                    if let Some(id) = sub.get("id").and_then(|i| i.as_str()) {
                                        if tick_sub_id.is_none() && json.get("tick").is_some() {
                                            tick_sub_id = Some(id.to_string());
                                        }
                                        if candle_sub_id.is_none() && (json.get("candles").is_some() || json.get("ohlc").is_some()) {
                                            candle_sub_id = Some(id.to_string());
                                        }
                                    }
                                }

                                // Server time
                                if let Some(tick) = json.get("tick") {
                                    if let Some(epoch) = tick.get("epoch").and_then(|e| e.as_u64()) {
                                        println!("📊 Received Tick candles");
                                        let time_msg = ServerTime {
                                            msg_type: "server_time".to_string(),
                                            server_time: epoch,
                                        };
                                        let _ = tx.send(BroadcastMessage::ServerTime(time_msg));
                                    }
                                }

                                // Historical candles
                                if let Some(candles) = json.get("candles").and_then(|c| c.as_array()) {
                                    println!("📊 Received {} historical candles", candles.len());

                                    // Clear and rebuild candles_for_ema with historical data
                                    //candles_for_ema.clear();

                                    for candle_data in candles {
                                        if let Ok(mut candle) = parse_flexible(candle_data) {
                                            candle.symbol = config.asset.clone();
                                            let _ = tx.send(BroadcastMessage::Candle(candle.clone()));

                                            // Store for EMA calculation
                                            candles_for_ema.push(IndicatorCandle {
                                                time: candle.time,
                                                open: candle.open,
                                                high: candle.high,
                                                low: candle.low,
                                                close: candle.close,
                                            });
                                        }
                                    }

                                    // Calculate and send initial EMA data
                                    if candles_for_ema.len() >= indicator_config.indicators.long_ema_period {
                                        let short_ema = calculate_indicator(
                                            &candles_for_ema,
                                            &indicator_config.indicators.short_ema_type,
                                            indicator_config.indicators.short_ema_period
                                        );
                                        let medium_ema = calculate_indicator(
                                            &candles_for_ema,
                                            &indicator_config.indicators.medium_ema_type,
                                            indicator_config.indicators.medium_ema_period
                                        );
                                        let long_ema = calculate_indicator(
                                            &candles_for_ema,
                                            &indicator_config.indicators.long_ema_type,
                                            indicator_config.indicators.long_ema_period
                                        );

                                        let ema_msg = EmaData {
                                            msg_type: "ema_data".to_string(),
                                            short_ema,
                                            medium_ema,
                                            long_ema,
                                            short_period: indicator_config.indicators.short_ema_period,
                                            medium_period: indicator_config.indicators.medium_ema_period,
                                            long_period: indicator_config.indicators.long_ema_period,
                                            short_type: indicator_config.indicators.short_ema_type.clone(),
                                            medium_type: indicator_config.indicators.medium_ema_type.clone(),
                                            long_type: indicator_config.indicators.long_ema_type.clone(),
                                        };

                                        println!("📈 Sending initial EMA data: short {} points, medium {} points, long {} points",
                                            ema_msg.short_ema.len(), ema_msg.medium_ema.len(), ema_msg.long_ema.len());
                                        let _ = tx.send(BroadcastMessage::EmaData(ema_msg));

                                        // === V2 Analysis: Use V2AnalysisGenerator for REAL status codes ===
                                        let v2_master_codes = build_candle_master_codes();
                                        let v2_master_codes_arc = std::sync::Arc::new(v2_master_codes);
                                        let v2_opts = V2AnalysisOptions::default();
                                        let mut v2_gen = V2AnalysisGenerator::new(v2_opts, v2_master_codes_arc);

                                        // Load tradeSignal.json for signal matching
                                        let signal_entries_for_hist: Vec<TradeSignalEntry> = load_trade_signals().unwrap_or_default();

                                        let mut v2_history = Vec::new();
                                        for ic in &candles_for_ema {
                                            let v2_result = v2_gen.append_candle(V2Candle {
                                                time: ic.time,
                                                open: ic.open,
                                                high: ic.high,
                                                low: ic.low,
                                                close: ic.close,
                                            });

                                            let decision = match_signal(&v2_result.status_code, &config.asset, &signal_entries_for_hist);

                                            v2_history.push(CompactAnalysis {
                                                time: ic.time,
                                                action: decision,
                                                status_code: v2_result.status_code,
                                            });
                                        }

                                        // Keep last 1000 markers
                                        if v2_history.len() > 1000 {
                                            let skip_amt = v2_history.len() - 1000;
                                            v2_history = v2_history.into_iter().skip(skip_amt).collect();
                                        }

                                        println!("🔍 V2 Historical Analysis: {} markers for {}", v2_history.len(), config.asset);

                                        if !v2_history.is_empty() {
                                            let hist_msg = HistoricalAnalysis {
                                                msg_type: "historical_analysis".to_string(),
                                                symbol: config.asset.clone(),
                                                results: v2_history,
                                            };
                                            let _ = tx.send(BroadcastMessage::HistoricalAnalysis(hist_msg));
                                        }

                                        // Also send initial analysis_data for the signal strip (uses old analysis engine)
                                        let short_ma_type = parse_ma_type(&indicator_config.indicators.short_ema_type);
                                        let medium_ma_type = parse_ma_type(&indicator_config.indicators.medium_ema_type);
                                        let long_ma_type = parse_ma_type(&indicator_config.indicators.long_ema_type);

                                        let analysis_result = generate_analysis_data(
                                            &candles_for_ema,
                                            indicator_config.indicators.short_ema_period,
                                            indicator_config.indicators.medium_ema_period,
                                            indicator_config.indicators.long_ema_period,
                                            short_ma_type,
                                            medium_ma_type,
                                            long_ma_type,
                                        );

                                        if !analysis_result.is_empty() {
                                            let last_index = analysis_result.len() - 1;
                                            let latest = &analysis_result[last_index];

                                            // Determine action based on action_mode config
                                            let (action_str, action_source) = match indicator_config.indicators.action_mode.as_str() {
                                                "simple" => {
                                                    let action = get_action_by_simple(&analysis_result, last_index);
                                                    (action.to_string(), "simple".to_string())
                                                }
                                                "cut_type_short" => {
                                                    let action = get_action_by_cut_type(&analysis_result, last_index, CutStrategy::ShortCut);
                                                    if action == "hold" {
                                                        // Fallback to ema_medium_slope_direction
                                                        let fallback = if latest.ema_medium_slope_direction == "Up" { "call" } else { "put" };
                                                        (fallback.to_string(), "slope_fallback".to_string())
                                                    } else {
                                                        (action.to_string(), "cut_type_short".to_string())
                                                    }
                                                }
                                                _ => { // "cut_type_long" (default)
                                                    let action = get_action_by_cut_type(&analysis_result, last_index, CutStrategy::LongCut);
                                                    if action == "hold" {
                                                        // Fallback to ema_medium_slope_direction
                                                        let fallback = if latest.ema_medium_slope_direction == "Up" { "call" } else { "put" };
                                                        (fallback.to_string(), "slope_fallback".to_string())
                                                    } else {
                                                        (action.to_string(), "cut_type_long".to_string())
                                                    }
                                                }
                                            };

                                            let analysis_msg = AnalysisData {
                                                msg_type: "analysis_data".to_string(),
                                                time: latest.time_candle,
                                                index: latest.index,
                                                color_candle: latest.color_candle.clone(),
                                                next_color_candle: latest.next_color_candle.clone(),

                                                // Short EMA
                                                ema_short_value: latest.ema_short_value,
                                                ema_short_slope_value: latest.ema_short_slope_value,
                                                ema_short_slope_direction: latest.ema_short_slope_direction.clone(),
                                                is_ema_short_turn_type: latest.is_ema_short_turn_type.clone(),
                                                ema_short_cut_position: latest.ema_short_cut_position.clone(),

                                                // Medium EMA
                                                ema_medium_value: latest.ema_medium_value,
                                                ema_medium_slope_direction: latest.ema_medium_slope_direction.clone(),

                                                // Long EMA
                                                ema_long_value: latest.ema_long_value,
                                                ema_long_slope_direction: latest.ema_long_slope_direction.clone(),

                                                // Relationships
                                                ema_above: latest.ema_above.clone(),
                                                ema_long_above: latest.ema_long_above.clone(),

                                                // MACD
                                                macd_12: latest.macd_12,
                                                macd_23: latest.macd_23,

                                                // Previous
                                                previous_ema_short_value: latest.previous_ema_short_value,
                                                previous_ema_medium_value: latest.previous_ema_medium_value,
                                                previous_ema_long_value: latest.previous_ema_long_value,
                                                previous_macd_12: latest.previous_macd_12,
                                                previous_macd_23: latest.previous_macd_23,

                                                // Convergence
                                                ema_convergence_type: latest.ema_convergence_type.clone(),
                                                ema_long_convergence_type: latest.ema_long_convergence_type.clone(),

                                                // Crossovers
                                                ema_cut_short_type: latest.ema_cut_short_type.clone(),
                                                candles_since_short_cut: latest.candles_since_short_cut,
                                                ema_cut_long_type: latest.ema_cut_long_type.clone(),
                                                candles_since_ema_cut: latest.candles_since_ema_cut,

                                                // Historical
                                                previous_color_back1: latest.previous_color_back1.clone(),
                                                previous_color_back3: latest.previous_color_back3.clone(),

                                                // Action
                                                action: action_str.clone(),
                                                action_source: action_source.clone(),
                                            };

                                            println!("📊 Initial Analysis Sent: Action={}, Source={}, MediumSlope={}",
                                                action_str, action_source, latest.ema_medium_slope_direction);

                                            let _ = tx.send(BroadcastMessage::Analysis(analysis_msg));
                                        }
                                    }
                                }

                                // Real-time OHLC
                                else if let Some(ohlc) = json.get("ohlc") {
                                    if let Ok(mut candle) = parse_flexible(ohlc) {
                                        candle.symbol = config.asset.clone();
                                        let _ = tx.send(BroadcastMessage::Candle(candle.clone()));

                                        let current_minute = candle.time / 60;
                                        let seconds = candle.time % 60;

                                        // Update or add candle to the EMA calculation buffer
                                        let indicator_candle = IndicatorCandle {
                                            time: (current_minute * 60), // Normalize to minute boundary
                                            open: candle.open,
                                            high: candle.high,
                                            low: candle.low,
                                            close: candle.close,
                                        };

                                        // Find if this minute's candle exists
                                        if let Some(existing) = candles_for_ema.iter_mut().find(|c| c.time / 60 == current_minute) {
                                            // Update existing candle (use same open, update high/low/close)
                                            existing.high = existing.high.max(candle.high);
                                            existing.low = existing.low.min(candle.low);
                                            existing.close = candle.close;
                                        } else {
                                            // Add new candle
                                            candles_for_ema.push(indicator_candle);
                                            // Keep only last 200 candles
                                            if candles_for_ema.len() > 200 {
                                                candles_for_ema.remove(0);
                                            }
                                        }

                                        // Send EMA update when candle closes (new minute starts)
                                        // Check if we're in the first few seconds of a new minute
                                        if seconds <= 5 && Some(current_minute) != last_ema_minute {
                                            last_ema_minute = Some(current_minute);

                                            if candles_for_ema.len() >= indicator_config.indicators.long_ema_period {
                                                let short_ema = calculate_indicator(
                                                    &candles_for_ema,
                                                    &indicator_config.indicators.short_ema_type,
                                                    indicator_config.indicators.short_ema_period
                                                );
                                                let medium_ema = calculate_indicator(
                                                    &candles_for_ema,
                                                    &indicator_config.indicators.medium_ema_type,
                                                    indicator_config.indicators.medium_ema_period
                                                );
                                                let long_ema = calculate_indicator(
                                                    &candles_for_ema,
                                                    &indicator_config.indicators.long_ema_type,
                                                    indicator_config.indicators.long_ema_period
                                                );

                                                let ema_msg = EmaData {
                                                    msg_type: "ema_data".to_string(),
                                                    short_ema,
                                                    medium_ema,
                                                    long_ema,
                                                    short_period: indicator_config.indicators.short_ema_period,
                                                    medium_period: indicator_config.indicators.medium_ema_period,
                                                    long_period: indicator_config.indicators.long_ema_period,
                                                    short_type: indicator_config.indicators.short_ema_type.clone(),
                                                    medium_type: indicator_config.indicators.medium_ema_type.clone(),
                                                    long_type: indicator_config.indicators.long_ema_type.clone(),
                                                };

                                                println!("📈 EMA updated at candle close: minute {}", current_minute);
                                                let _ = tx.send(BroadcastMessage::EmaData(ema_msg));
                                            }
                                        }

                                        // Send analysis data every 2 seconds with FULL fields
                                        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
                                        let should_send_analysis = match last_analysis_time {
                                            Some(last_time) => now >= last_time + 2,
                                            None => true,
                                        };

                                        // Real analysis logic
                                        // Need at least 2x long_period for reliable analysis (safety margin)
                                        let min_candles = indicator_config.indicators.long_ema_period;

                                        if should_send_analysis && candles_for_ema.len() >= min_candles {
                                            last_analysis_time = Some(now);

                                            // Parse MA types for all 3 EMAs
                                            let short_ma_type = parse_ma_type(&indicator_config.indicators.short_ema_type);
                                            let medium_ma_type = parse_ma_type(&indicator_config.indicators.medium_ema_type);
                                            let long_ma_type = parse_ma_type(&indicator_config.indicators.long_ema_type);

                                            // Run generate_analysis_data with 3 EMA lines
                                            let analysis_result = generate_analysis_data(
                                                &candles_for_ema,
                                                indicator_config.indicators.short_ema_period,
                                                indicator_config.indicators.medium_ema_period,
                                                indicator_config.indicators.long_ema_period,
                                                short_ma_type,
                                                medium_ma_type,
                                                long_ma_type,
                                            );

                                            // Get the latest analysis with ALL fields
                                            if !analysis_result.is_empty() {
                                                let last_index = analysis_result.len() - 1;
                                                let latest = &analysis_result[last_index];

                                                // Determine action based on action_mode config
                                                let (action_str, action_source) = match indicator_config.indicators.action_mode.as_str() {
                                                    "simple" => {
                                                        let action = get_action_by_simple(&analysis_result, last_index);
                                                        (action.to_string(), "simple".to_string())
                                                    }
                                                    "cut_type_short" => {
                                                        let action = get_action_by_cut_type(&analysis_result, last_index, CutStrategy::ShortCut);
                                                        if action == "hold" {
                                                            // Fallback to ema_medium_slope_direction
                                                            let fallback = if latest.ema_medium_slope_direction == "Up" { "call" } else { "put" };
                                                            (fallback.to_string(), "slope_fallback".to_string())
                                                        } else {
                                                            (action.to_string(), "cut_type_short".to_string())
                                                        }
                                                    }
                                                    _ => { // "cut_type_long" (default)
                                                        let action = get_action_by_cut_type(&analysis_result, last_index, CutStrategy::LongCut);
                                                        if action == "hold" {
                                                            // Fallback to ema_medium_slope_direction
                                                            let fallback = if latest.ema_medium_slope_direction == "Up" { "call" } else { "put" };
                                                            (fallback.to_string(), "slope_fallback".to_string())
                                                        } else {
                                                            (action.to_string(), "cut_type_long".to_string())
                                                        }
                                                    }
                                                };

                                                // Store action for trading
                                                last_action = Some(action_str.clone());

                                                let analysis_msg = AnalysisData {
                                                    msg_type: "analysis_data".to_string(),
                                                    time: candle.time, // Current time
                                                    index: latest.index,
                                                    color_candle: latest.color_candle.clone(),
                                                    next_color_candle: latest.next_color_candle.clone(),

                                                    // Short EMA
                                                    ema_short_value: latest.ema_short_value,
                                                    ema_short_slope_value: latest.ema_short_slope_value,
                                                    ema_short_slope_direction: latest.ema_short_slope_direction.clone(),
                                                    is_ema_short_turn_type: latest.is_ema_short_turn_type.clone(),
                                                    ema_short_cut_position: latest.ema_short_cut_position.clone(),

                                                    // Medium EMA
                                                    ema_medium_value: latest.ema_medium_value,
                                                    ema_medium_slope_direction: latest.ema_medium_slope_direction.clone(),

                                                    // Long EMA
                                                    ema_long_value: latest.ema_long_value,
                                                    ema_long_slope_direction: latest.ema_long_slope_direction.clone(),

                                                    // Relationships
                                                    ema_above: latest.ema_above.clone(),
                                                    ema_long_above: latest.ema_long_above.clone(),

                                                    // MACD
                                                    macd_12: latest.macd_12,
                                                    macd_23: latest.macd_23,

                                                    // Previous
                                                    previous_ema_short_value: latest.previous_ema_short_value,
                                                    previous_ema_medium_value: latest.previous_ema_medium_value,
                                                    previous_ema_long_value: latest.previous_ema_long_value,
                                                    previous_macd_12: latest.previous_macd_12,
                                                    previous_macd_23: latest.previous_macd_23,

                                                    // Convergence
                                                    ema_convergence_type: latest.ema_convergence_type.clone(),
                                                    ema_long_convergence_type: latest.ema_long_convergence_type.clone(),

                                                    // Crossovers
                                                    ema_cut_short_type: latest.ema_cut_short_type.clone(),
                                                    candles_since_short_cut: latest.candles_since_short_cut,
                                                    ema_cut_long_type: latest.ema_cut_long_type.clone(),
                                                    candles_since_ema_cut: latest.candles_since_ema_cut,

                                                    // Historical
                                                    previous_color_back1: latest.previous_color_back1.clone(),
                                                    previous_color_back3: latest.previous_color_back3.clone(),

                                                    // Action
                                                    action: action_str.clone(),
                                                    action_source: action_source.clone(),
                                                };

                                                let _ = tx.send(BroadcastMessage::Analysis(analysis_msg));
                                            }
                                        }

                                        // Debug log to see trading conditions
                                        if seconds <= 5 {
                                            println!("⏰ Time: {}:{:02} | Mode: {} | Token: {} | LastMin: {:?} | CurMin: {}",
                                                candle.time / 60 % 60, seconds,
                                                current_trade_mode,
                                                if config.api_token.is_empty() { "NO" } else { "YES" },
                                                last_trade_minute,
                                                current_minute
                                            );
                                        }

                                        // Trading logic - trade at second 0-2 of each minute (more flexible)
                                        if current_trade_mode != "idle" && !config.api_token.is_empty() {
                                            // Trade at second 0-2 of each minute, once per minute
                                            if seconds <= 2 && Some(current_minute) != last_trade_minute {
                                                // Determine contract type based on mode
                                                let contract_type = if current_trade_mode == "auto" {
                                                    // AUTO mode: use action from analysis
                                                    match last_action.as_deref() {
                                                        Some("call") => Some("CALL"),
                                                        Some("put") => Some("PUT"),
                                                        Some("hold") | None => None, // Don't trade on Hold
                                                        _ => None,
                                                    }
                                                } else if current_trade_mode == "call" {
                                                    Some("CALL")
                                                } else if current_trade_mode == "put" {
                                                    Some("PUT")
                                                } else {
                                                    None
                                                };

                                                if let Some(ct) = contract_type {
                                                    last_trade_minute = Some(current_minute);

                                                    let stake = if current_money_mode == "martingale" {
                                                        martingale_stakes[current_stake_index.min(martingale_stakes.len() - 1)]
                                                    } else {
                                                        current_initial_stake
                                                    };

                                                    if balance >= stake {
                                                        let buy_msg = serde_json::json!({
                                                            "buy": "1",
                                                            "price": stake,
                                                            "parameters": {
                                                                "contract_type": ct,
                                                                "symbol": config.asset,
                                                                "duration": current_duration,
                                                                "duration_unit": current_duration_unit,
                                                                "basis": "stake",
                                                                "amount": stake,
                                                                "currency": "USD"
                                                            }
                                                        });

                                                        println!("📈 [{}] Placing {} trade with stake: {} (balance: {})",
                                                            if current_trade_mode == "auto" { "AUTO" } else { "MANUAL" },
                                                            ct, stake, balance);
                                                        pending_contract_type = Some(ct.to_string());
                                                        let _ = write.send(TungsteniteMessage::Text(buy_msg.to_string())).await;
                                                    } else {
                                                        println!("⚠️ Insufficient balance: {} < stake: {}", balance, stake);
                                                    }
                                                } else if current_trade_mode == "auto" {
                                                    println!("⏸️ AUTO mode: Hold signal, skipping trade");
                                                }
                                            }
                                        }
                                    }
                                }

                                // Handle buy response - support both string and number contract_id
                                if let Some(buy) = json.get("buy") {
                                    // Try to get contract_id as string first, then as number
                                    let contract_id = buy.get("contract_id")
                                        .and_then(|c| c.as_str().map(|s| s.to_string()))
                                        .or_else(|| buy.get("contract_id").and_then(|c| c.as_u64().map(|n| n.to_string())));

                                    if let Some(contract_id) = contract_id {
                                        _pending_contract_id = Some(contract_id.clone());
                                        println!("✅ Contract opened: {}", contract_id);

                                        // ส่งข้อมูล trade ที่เปิดไปให้ frontend
                                        let now = Local::now();
                                        let stake = buy.get("buy_price").and_then(|p| p.as_f64()).unwrap_or(0.0);

                                        let trade_opened = TradeOpened {
                                            msg_type: "trade_opened".to_string(),
                                            contract_id: contract_id.clone(),
                                            asset: config.asset.clone(),
                                            trade_type: pending_contract_type.clone().unwrap_or_else(|| current_trade_mode.to_uppercase()),
                                            stake,
                                            time: now.format("%H:%M:%S").to_string(),
                                        };
                                        let _ = tx.send(BroadcastMessage::TradeOpened(trade_opened));

                                        // Subscribe to contract for result
                                        let proposal_msg = serde_json::json!({
                                            "proposal_open_contract": 1,
                                            "contract_id": contract_id,
                                            "subscribe": 1
                                        });
                                        let _ = write.send(TungsteniteMessage::Text(proposal_msg.to_string())).await;
                                    } else {
                                        println!("⚠️ Buy response received but no contract_id found: {}", serde_json::to_string_pretty(&buy).unwrap_or_default());
                                    }
                                } else if json.get("error").is_none() && json.get("msg_type").and_then(|m| m.as_str()) == Some("buy") {
                                    // Log if we got a buy response but couldn't parse it
                                    println!("⚠️ Unexpected buy response format: {}", raw_text);
                                }

                                // Handle contract updates and result
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

                                    // Handle final result
                                    if status == "sold" || status == "won" || status == "lost" {
                                        let profit = proposal.get("profit").and_then(|p| p.as_f64()).unwrap_or(0.0);
                                        let stake = proposal.get("buy_price").and_then(|p| p.as_f64()).unwrap_or(0.0);

                                        balance += profit;

                                        let is_win = profit > 0.0;

                                        if lot_active {
                                            lot_grand_profit += profit;
                                            if is_win {
                                                lot_win_count += 1;
                                            }
                                            trade_count_in_lot += 1;
                                        }

                                        if is_win {
                                            current_stake_index = 0;
                                            println!("🎉 WIN! Profit: {}, Balance: {}", profit, balance);
                                        } else {
                                            if current_money_mode == "martingale" {
                                                current_stake_index = (current_stake_index + 1).min(martingale_stakes.len() - 1);
                                            }
                                            println!("❌ LOSS! Loss: {}, Balance: {}", profit, balance);
                                        }

                                        let result = TradeResult {
                                            msg_type: "trade_result".to_string(),
                                            status: if is_win { "win".to_string() } else { "loss".to_string() },
                                            balance,
                                            stake,
                                            profit,
                                            contract_id: Some(contract_id.clone()),
                                        };

                                        let _ = tx.send(BroadcastMessage::TradeResult(result));

                                        // Check Stop Conditions
                                        let mut stop_trading = false;
                                        let mut stop_reason = String::new();

                                        if lot_active {
                                            if current_money_mode == "fix" {
                                                if lot_grand_profit >= indicator_config.trading.target_grand_profit {
                                                    stop_trading = true;
                                                    stop_reason = format!("Target Grand Profit ({}) Reached", indicator_config.trading.target_grand_profit);
                                                }
                                            } else if current_money_mode == "martingale" {
                                                if lot_win_count >= indicator_config.trading.target_win_count {
                                                    stop_trading = true;
                                                    stop_reason = format!("Target Win Count ({}) Reached", indicator_config.trading.target_win_count);
                                                }
                                            }
                                        }

                                        // Save Trade History
                                        if lot_active {
                                            let trade_obj = TradeObject {
                                                lot_no: current_lot_no,
                                                trade_no_on_this_lot: trade_count_in_lot,
                                                trade_time: Local::now().format("%d-%m-%Y %H:%M:%S").to_string(),
                                                asset: config.asset.clone(),
                                                action: trade_type.to_lowercase(),
                                                money_trade: stake,
                                                money_trade_type: if current_money_mode == "fix" { "Fixed".to_string() } else { "Martingale".to_string() },
                                                win_status: if is_win { "win".to_string() } else { "loss".to_string() },
                                                profit,
                                                balance_on_lot: lot_grand_profit,
                                                win_con: indicator_config.trading.target_win_count.to_string(),
                                                loss_con: indicator_config.trading.target_grand_profit.to_string(),
                                                is_stop_trade: stop_trading,
                                            };

                                            trades_for_lot.push(trade_obj);

                                            let lot_log = LotLog {
                                                lot_no: current_lot_no,
                                                trade_object_list: trades_for_lot.clone(),
                                            };
                                            save_lot_log(&ensure_daily_folder(&get_daily_folder_name()), &lot_log);
                                            println!("💾 Saved Trade History for Lot {}", current_lot_no);

                                            // Save to Firestore
                                            let date_start_val = proposal.get("date_start").and_then(|d| d.as_u64()).unwrap_or(0);
                                            let date_expiry_val = proposal.get("date_expiry").and_then(|d| d.as_u64()).unwrap_or(0);
                                            let payout_val = proposal.get("payout").and_then(|p| p.as_f64()).unwrap_or(0.0);
                                            let entry_spot_val = proposal.get("entry_spot").and_then(|v| v.as_f64())
                                                .or_else(|| proposal.get("entry_spot").and_then(|v| v.as_str()?.parse().ok()))
                                                .unwrap_or(0.0);
                                            let exit_spot_val = proposal.get("exit_spot").and_then(|v| v.as_f64())
                                                .or_else(|| proposal.get("exit_spot").and_then(|v| v.as_str()?.parse().ok()))
                                                .unwrap_or(0.0);

                                            let trade_record = TradeRecord {
                                                order_no: trade_count_in_lot,
                                                contract_id: contract_id.clone(),
                                                symbol: config.asset.clone(),
                                                trade_type: trade_type.clone(),
                                                buy_price: stake,
                                                payout: payout_val,
                                                profit_loss: profit,
                                                buy_time: date_start_val,
                                                expiry_time: date_expiry_val,
                                                time_remaining: 0, // Trade has ended
                                                min_profit: profit, // Final value
                                                max_profit: profit, // Final value
                                                status: if is_win { "win".to_string() } else { "loss".to_string() },
                                                entry_spot: entry_spot_val,
                                                exit_spot: exit_spot_val,
                                                lot_no: current_lot_no,
                                                trade_no_in_lot: trade_count_in_lot,
                                                trade_date: Local::now().format("%Y-%m-%d").to_string(),
                                                created_at: Local::now().format("%Y-%m-%dT%H:%M:%S").to_string(),
                                            };

                                            // Save to Firestore asynchronously
                                            let fs = firestore.lock().await;
                                            match fs.save_trade(&trade_record).await {
                                                Ok(doc_id) => println!("🔥 Trade saved to Firestore: {}", doc_id),
                                                Err(e) => println!("⚠️ Firestore save error: {}", e),
                                            }
                                        }

                                        if stop_trading {
                                            println!("🛑 STOPPING TRADE: {}", stop_reason);
                                            current_trade_mode = "idle".to_string();
                                            lot_active = false;
                                        }

                                        // Broadcast Lot Status
                                        let _ = tx.send(BroadcastMessage::LotStatus(LotStatus {
                                            msg_type: "lot_status".to_string(),
                                            grand_profit: lot_grand_profit,
                                            win_count: lot_win_count,
                                            target_profit: indicator_config.trading.target_grand_profit,
                                            target_win: indicator_config.trading.target_win_count,
                                            lot_active, // Frontend should switch to IDLE if this is false
                                            balance: 0.0,
                                        }));
                                    }
                                }
                            }
                        } else {
                            break;
                        }
                    }
                }
            }

            println!("🔌 Deriv connection closed for: {}", config.asset);
        }
        Err(e) => println!("❌ Deriv Connection Failed: {}", e),
    }
}
