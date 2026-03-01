// deriv_common.rs — Shared Deriv API utilities
// Extracted from main.rs (Task 3 of refactorPlan.md)
// Contains functions duplicated between connect_to_deriv, connect_multi_asset, and auto_multi_trade

use crate::models::*;
use indicator_math_v2::{
    AnalysisGenerator as V2AnalysisGenerator, AnalysisOptions as V2AnalysisOptions,
    Candle as V2Candle, CandleMasterCode,
};
use std::sync::Arc;

/// Build CandleMasterCode list from the same mapping as old lib's build_status_code_map.
/// Used by V2AnalysisGenerator for StatusCode resolution.
pub fn build_candle_master_codes() -> Vec<CandleMasterCode> {
    let pairs: Vec<(&str, u32)> = vec![
        ("L-D-D-G-C", 2),
        ("L-D-D-G-D", 3),
        ("L-D-D-G-N", 4),
        ("L-D-D-R-C", 5),
        ("L-D-D-R-D", 6),
        ("L-D-D-R-N", 7),
        ("L-D-F-G-C", 8),
        ("L-D-F-G-D", 9),
        ("L-D-F-G-N", 10),
        ("L-D-F-R-C", 11),
        ("L-D-F-R-D", 12),
        ("L-D-F-R-N", 13),
        ("L-D-U-G-C", 14),
        ("L-D-U-G-D", 15),
        ("L-D-U-G-N", 16),
        ("L-D-U-R-C", 17),
        ("L-D-U-R-D", 18),
        ("L-D-U-R-N", 19),
        ("L-F-D-G-C", 20),
        ("L-F-D-G-N", 21),
        ("L-F-D-R-C", 22),
        ("L-F-D-R-N", 23),
        ("L-F-F-G-C", 24),
        ("L-F-F-G-N", 25),
        ("L-F-F-R-N", 26),
        ("L-F-U-G-C", 27),
        ("L-F-U-G-D", 28),
        ("L-F-U-G-N", 29),
        ("L-F-U-R-D", 30),
        ("L-F-U-R-N", 31),
        ("L-U-D-G-C", 32),
        ("L-U-D-G-N", 33),
        ("L-U-D-R-C", 34),
        ("L-U-D-R-N", 35),
        ("L-U-F-G-C", 36),
        ("L-U-F-G-N", 37),
        ("L-U-U-G-C", 38),
        ("L-U-U-G-D", 39),
        ("L-U-U-G-N", 40),
        ("L-U-U-R-D", 41),
        ("L-U-U-R-N", 42),
        ("M-D-D-G-C", 43),
        ("M-D-D-G-D", 44),
        ("M-D-D-G-N", 45),
        ("M-D-D-R-C", 46),
        ("M-D-D-R-D", 47),
        ("M-D-D-R-N", 48),
        ("M-D-F-G-C", 49),
        ("M-D-F-G-N", 50),
        ("M-D-F-R-C", 51),
        ("M-D-F-R-N", 52),
        ("M-D-U-G-C", 53),
        ("M-D-U-G-N", 54),
        ("M-D-U-R-C", 55),
        ("M-D-U-R-N", 56),
        ("M-F-D-G-C", 57),
        ("M-F-D-G-D", 58),
        ("M-F-D-G-N", 59),
        ("M-F-D-R-D", 60),
        ("M-F-D-R-N", 61),
        ("M-F-U-G-C", 62),
        ("M-F-U-G-N", 63),
        ("M-F-U-R-C", 64),
        ("M-F-U-R-N", 65),
        ("M-U-D-G-C", 67),
        ("M-U-D-G-D", 68),
        ("M-U-D-G-N", 69),
        ("M-U-D-R-C", 70),
        ("M-U-D-R-D", 71),
        ("M-U-D-R-N", 72),
        ("M-U-F-G-C", 73),
        ("M-U-F-G-D", 74),
        ("M-U-F-G-N", 75),
        ("M-U-F-R-D", 76),
        ("M-U-U-G-C", 79),
        ("M-U-U-G-D", 80),
        ("M-U-U-G-N", 81),
        ("M-U-U-R-C", 82),
        ("M-U-U-R-D", 83),
        ("M-U-U-R-N", 84),
    ];
    pairs
        .into_iter()
        .map(|(desc, code)| CandleMasterCode {
            status_desc: desc.to_string(),
            status_code: code.to_string(),
        })
        .collect()
}

/// Load trade signal entries from tradeSignal.json.
/// Returns Ok(entries) or Err(error_message).
pub fn load_trade_signals() -> Result<Vec<TradeSignalEntry>, String> {
    match std::fs::read_to_string("tradeSignal.json") {
        Ok(content) => match serde_json::from_str(&content) {
            Ok(entries) => Ok(entries),
            Err(e) => Err(format!("Failed to parse tradeSignal.json: {}", e)),
        },
        Err(e) => Err(format!("Failed to read tradeSignal.json: {}", e)),
    }
}

/// Parse a candle OHLC from a Deriv WebSocket JSON value.
/// Handles both numeric and string-encoded fields (Deriv sometimes returns strings).
pub fn parse_candle_ohlc(c: &serde_json::Value) -> (u64, f64, f64, f64, f64) {
    let time = c.get("epoch").and_then(|v| v.as_u64()).unwrap_or(0);
    let open = c
        .get("open")
        .and_then(|v| v.as_f64())
        .or_else(|| c.get("open").and_then(|v| v.as_str()?.parse().ok()))
        .unwrap_or(0.0);
    let high = c
        .get("high")
        .and_then(|v| v.as_f64())
        .or_else(|| c.get("high").and_then(|v| v.as_str()?.parse().ok()))
        .unwrap_or(0.0);
    let low = c
        .get("low")
        .and_then(|v| v.as_f64())
        .or_else(|| c.get("low").and_then(|v| v.as_str()?.parse().ok()))
        .unwrap_or(0.0);
    let close = c
        .get("close")
        .and_then(|v| v.as_f64())
        .or_else(|| c.get("close").and_then(|v| v.as_str()?.parse().ok()))
        .unwrap_or(0.0);
    (time, open, high, low, close)
}

/// Match a status code against a trade signal entry's call/put signals.
/// Returns "call", "put", or "idle".
pub fn match_signal(status_code: &str, asset: &str, signals: &[TradeSignalEntry]) -> String {
    if let Some(entry) = signals.iter().find(|e| e.asset_code == asset) {
        let call_codes: Vec<&str> = entry.call_signal.split(',').map(|s| s.trim()).collect();
        let put_codes: Vec<&str> = entry.put_signal.split(',').map(|s| s.trim()).collect();
        if call_codes.contains(&status_code) {
            return "call".to_string();
        } else if put_codes.contains(&status_code) {
            return "put".to_string();
        }
    }
    "idle".to_string()
}

/// Parse a Deriv candle OHLC flexibly (handles both string and numeric fields).
/// Used for tick/ohlc messages in connect_to_deriv.
pub fn parse_flexible(data: &serde_json::Value) -> Result<Candle, ()> {
    let to_f64 = |v: Option<&serde_json::Value>| -> Option<f64> {
        let val = v?;
        val.as_f64().or_else(|| val.as_str()?.parse().ok())
    };

    let to_u64 = |v: Option<&serde_json::Value>| -> Option<u64> {
        let val = v?;
        val.as_u64().or_else(|| val.as_str()?.parse().ok())
    };

    let epoch = data.get("epoch").and_then(|v| v.as_u64()).ok_or(())?;
    let open_time = to_u64(data.get("open_time")).unwrap_or(epoch / 60 * 60);

    Ok(Candle {
        symbol: String::new(),
        time: epoch,
        open_time,
        open: to_f64(data.get("open")).ok_or(())?,
        high: to_f64(data.get("high")).ok_or(())?,
        low: to_f64(data.get("low")).ok_or(())?,
        close: to_f64(data.get("close")).ok_or(())?,
    })
}

/// Build historical analysis results for a set of candles using V2AnalysisGenerator.
/// Feeds each candle through the generator, matches signals, and returns CompactAnalysis list
/// along with the generator (for continued use with live data).
///
/// `max_results` — limit the result vec (keeps last N). Use 1000 for typical chart markers.
pub fn build_historical_analysis(
    candles_json: &[serde_json::Value],
    asset: &str,
    signals: &[TradeSignalEntry],
    master_codes_arc: Arc<Vec<CandleMasterCode>>,
    v2_options: V2AnalysisOptions,
    max_results: usize,
) -> (V2AnalysisGenerator, Vec<CompactAnalysis>, usize) {
    let mut gen = V2AnalysisGenerator::new(v2_options, master_codes_arc);
    let mut results = Vec::new();
    let mut count = 0;

    for c in candles_json {
        let (time, open, high, low, close) = parse_candle_ohlc(c);

        let final_state = gen.append_candle(V2Candle {
            time,
            open,
            high,
            low,
            close,
        });

        let decision = match_signal(&final_state.status_code, asset, signals);

        results.push(CompactAnalysis {
            time,
            action: decision,
            status_code: final_state.status_code,
        });
        count += 1;
    }

    // Keep last N markers
    if results.len() > max_results {
        let skip_amt = results.len() - max_results;
        results = results.into_iter().skip(skip_amt).collect();
    }

    (gen, results, count)
}

/// Get the Deriv WebSocket URL for a given app_id.
/// Falls back to default app ID "66726" if empty.
pub fn deriv_ws_url(app_id: &str) -> String {
    let id = if app_id.is_empty() { "66726" } else { app_id };
    format!("wss://ws.derivws.com/websockets/v3?app_id={}", id)
}
