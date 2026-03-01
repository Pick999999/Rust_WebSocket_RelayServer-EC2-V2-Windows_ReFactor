// models.rs — All data structs and enums extracted from main.rs
// This module contains pure data types used across the application.

use chrono::prelude::*;
use chrono::Local;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

// Re-export EmaPoint so it can be used as models::EmaPoint
// (used by config.rs calculate_indicator)

#[derive(Debug, Deserialize)]
pub struct LoginPayload {
    pub username: String,
    pub password: String,
}

// System Status Struct
#[derive(Debug, Serialize)]
pub struct SystemResources {
    pub memory_used_mb: u64,
    pub total_memory_mb: u64,
    pub cpu_usage: f32,
    pub uptime_secs: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Candle {
    pub symbol: String,
    pub time: u64,
    pub open_time: u64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerTime {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub server_time: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeOpened {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub contract_id: String,
    pub asset: String,
    pub trade_type: String,
    pub stake: f64,
    pub time: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeResult {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub status: String,
    pub balance: f64,
    pub stake: f64,
    pub profit: f64,
    pub contract_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeUpdate {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub contract_id: String,
    pub asset: String,
    pub trade_type: String,
    pub current_spot: f64,
    pub entry_spot: f64,
    pub profit: f64,
    pub profit_percentage: f64,
    pub is_sold: bool,
    pub is_expired: bool,
    pub payout: f64,
    pub buy_price: f64,
    pub date_expiry: u64,
    pub date_start: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmaData {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub short_ema: Vec<EmaPoint>,
    pub medium_ema: Vec<EmaPoint>,
    pub long_ema: Vec<EmaPoint>,
    pub short_period: usize,
    pub medium_period: usize,
    pub long_period: usize,
    pub short_type: String,
    pub medium_type: String,
    pub long_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BalanceMessage {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub balance: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmaPoint {
    pub time: u64,
    pub value: f64,
}

// Enhanced Analysis data with ALL fields from generate_analysis_data (v0.7.1)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisData {
    #[serde(rename = "type")]
    pub msg_type: String,

    // Current candle info
    pub time: u64,
    pub index: usize,
    pub color_candle: String,
    pub next_color_candle: String,

    // Short EMA Analysis
    pub ema_short_value: f64,
    pub ema_short_slope_value: f64,
    pub ema_short_slope_direction: String,
    pub is_ema_short_turn_type: String,
    pub ema_short_cut_position: String,

    // Medium EMA Analysis
    pub ema_medium_value: f64,
    pub ema_medium_slope_direction: String,

    // Long EMA Analysis
    pub ema_long_value: f64,
    pub ema_long_slope_direction: String,

    // Relationships
    pub ema_above: String,
    pub ema_long_above: String,

    // MACD Values
    pub macd_12: f64,
    pub macd_23: f64,

    // Previous Values
    pub previous_ema_short_value: f64,
    pub previous_ema_medium_value: f64,
    pub previous_ema_long_value: f64,
    pub previous_macd_12: f64,
    pub previous_macd_23: f64,

    // Convergence Types
    pub ema_convergence_type: String,
    pub ema_long_convergence_type: String,

    // Short/Medium Crossover
    pub ema_cut_short_type: String,
    pub candles_since_short_cut: usize,

    // Medium/Long Crossover
    pub ema_cut_long_type: String,
    pub candles_since_ema_cut: usize,

    // Historical
    pub previous_color_back1: String,
    pub previous_color_back3: String,

    // Action
    pub action: String,
    pub action_source: String, // "simple", "cut_type_short", "cut_type_long", "slope_fallback"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeObject {
    #[serde(rename = "LotNo")]
    pub lot_no: u32,
    #[serde(rename = "TradeNoOnThisLot")]
    pub trade_no_on_this_lot: u32,
    #[serde(rename = "TradeTime")]
    pub trade_time: String,
    pub asset: String,
    pub action: String,
    #[serde(rename = "moneyTrade")]
    pub money_trade: f64,
    #[serde(rename = "MoneyTradeType")]
    pub money_trade_type: String,
    #[serde(rename = "WinStatus")]
    pub win_status: String,
    #[serde(rename = "Profit")]
    pub profit: f64,
    #[serde(rename = "BalanceOnLot")]
    pub balance_on_lot: f64,
    #[serde(rename = "winCon")]
    pub win_con: String,
    #[serde(rename = "lossCon")]
    pub loss_con: String,
    #[serde(rename = "isstopTrade")]
    pub is_stop_trade: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LotLog {
    #[serde(rename = "LotNo")]
    pub lot_no: u32,
    #[serde(rename = "TradeObjectList")]
    pub trade_object_list: Vec<TradeObject>,
}

// ==================== DAY TRADE LOGGING ====================
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DayTradeEntry {
    #[serde(rename = "No")]
    pub no: u32,
    #[serde(rename = "ContractID")]
    pub contract_id: String,
    #[serde(rename = "Symbol")]
    pub symbol: String,
    #[serde(rename = "StatusCode")]
    pub status_code: String,
    #[serde(rename = "Type")]
    pub trade_type: String,
    #[serde(rename = "BuyPrice")]
    pub buy_price: f64,
    #[serde(rename = "Payout")]
    pub payout: f64,
    #[serde(rename = "BuyTime")]
    pub buy_time: String,
    #[serde(rename = "Expiry")]
    pub expiry: String,
    #[serde(rename = "Remaining")]
    pub remaining: String,
    #[serde(rename = "MinProfit")]
    pub min_profit: f64,
    #[serde(rename = "MaxProfit")]
    pub max_profit: f64,
    #[serde(rename = "Profit")]
    pub profit: f64,
    #[serde(rename = "Action")]
    pub action: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DayTradeData {
    #[serde(rename = "LotNoCurrent")]
    pub lot_no_current: u32,
    #[serde(rename = "DayTrade")]
    pub day_trade: String,
    #[serde(rename = "StartTradeOfDay")]
    pub start_trade_of_day: String,
    #[serde(rename = "LastTradeOfDay")]
    pub last_trade_of_day: String,
    #[serde(rename = "TotalTradeOnThisDay")]
    pub total_trade_on_this_day: u32,
    #[serde(rename = "TotalProfit")]
    pub total_profit: f64,
    #[serde(rename = "StatusofTrade")]
    pub status_of_trade: String,
    #[serde(rename = "CurrentProfit")]
    pub current_profit: f64,
    #[serde(rename = "DayTradeList")]
    pub day_trade_list: Vec<DayTradeEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DayTradeWrapper {
    #[serde(rename = "DayTrade")]
    pub day_trade: DayTradeData,
}

// ==================== LOT STATUS (with Default — Task 2) ====================
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LotStatus {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub grand_profit: f64,
    pub win_count: u32,
    pub target_profit: f64,
    pub target_win: u32,
    pub lot_active: bool,
    #[serde(default)]
    pub balance: f64,
}

impl Default for LotStatus {
    fn default() -> Self {
        Self {
            msg_type: "lot_status".to_string(),
            grand_profit: 0.0,
            win_count: 0,
            target_profit: 10.0,
            target_win: 5,
            lot_active: false,
            balance: 0.0,
        }
    }
}

// ============ Multi-Asset Structs ============
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeSignalEntry {
    pub id: String,
    #[serde(rename = "assetCode")]
    pub asset_code: String,
    #[serde(rename = "PUTSignal")]
    pub put_signal: String,
    #[serde(rename = "CallSigNal")]
    pub call_signal: String,
    #[serde(rename = "isActive")]
    pub is_active: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetSignalResult {
    pub asset: String,
    pub status_code: String,
    pub status_desc: String,
    pub decision: String, // "call", "put", "idle"
    pub reason: String,
    pub close_price: f64,
    pub ema_short_dir: String,
    pub ema_medium_dir: String,
    pub ema_long_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultiAnalysisMessage {
    #[serde(rename = "type")]
    pub msg_type: String, // "multi_analysis"
    pub timestamp: u64,
    pub assets: Vec<AssetSignalResult>,
}

#[derive(Serialize, Clone, Debug, Deserialize)]
pub struct CompactAnalysis {
    pub time: u64,
    pub action: String,
    pub status_code: String,
}

#[derive(Serialize, Clone, Debug, Deserialize)]
pub struct HistoricalAnalysis {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub symbol: String,
    pub results: Vec<CompactAnalysis>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum BroadcastMessage {
    Candle(Candle),
    ServerTime(ServerTime),
    TradeOpened(TradeOpened),
    TradeResult(TradeResult),
    TradeUpdate(TradeUpdate),
    EmaData(EmaData),
    Balance(BalanceMessage),
    Analysis(AnalysisData),
    LotStatus(LotStatus),
    MultiAnalysis(MultiAnalysisMessage),
    AutoTradeStatus(AutoTradeStatusMessage),
    HistoricalAnalysis(HistoricalAnalysis),
}

#[derive(Deserialize, Debug, Clone)]
pub struct ClientCommand {
    pub command: String,
    #[serde(default)]
    pub asset: String,
    #[serde(default)]
    pub assets: Vec<String>, // Multi-asset list from checkboxes
    #[serde(default)]
    pub trade_mode: String,
    #[serde(default)]
    pub money_mode: String,
    #[serde(default)]
    pub initial_stake: f64,
    #[serde(default)]
    pub app_id: String,
    #[serde(default)]
    pub api_token: String,
    #[serde(default)]
    pub duration: u64,
    #[serde(default)]
    pub duration_unit: String,
    #[serde(default)]
    pub contract_id: String,
    #[serde(default)]
    pub target_profit: f64,
    #[serde(default)]
    pub target_win: u32,
}

// Auto-trade status message (sent to browser if connected)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutoTradeEntry {
    pub asset: String,
    pub direction: String, // "CALL" or "PUT"
    pub status_code: String,
    pub stake: f64,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutoTradeStatusMessage {
    #[serde(rename = "type")]
    pub msg_type: String, // "auto_trade_status"
    pub active: bool,
    pub entries: Vec<AutoTradeEntry>,
    pub grand_profit: f64,
    pub trade_count: u32,
    pub message: String,
}

// ==================== File I/O Helpers ====================

pub fn ensure_trade_history_folder(folder_date: &str) -> String {
    let path = format!("tradeHistory/{}", folder_date);
    if !Path::new(&path).exists() {
        let _ = fs::create_dir_all(&path);
    }
    path
}

pub fn save_day_trade_log(wrapper: &DayTradeWrapper) {
    let folder_date = &wrapper.day_trade.day_trade;
    let folder_path = ensure_trade_history_folder(folder_date);
    let file_path = format!("{}/trade.json", folder_path);

    if let Ok(json) = serde_json::to_string_pretty(wrapper) {
        let _ = fs::write(file_path, json);
    }
}

pub fn get_daily_folder_name() -> String {
    let local: DateTime<Local> = Local::now();
    local.format("%Y-%m-%d").to_string()
}

pub fn ensure_daily_folder(folder_name: &str) -> String {
    let path = format!("logs/{}", folder_name);
    if !Path::new(&path).exists() {
        let _ = fs::create_dir_all(&path);
    }
    path
}

pub fn get_next_lot_no(folder_path: &str) -> u32 {
    let mut max_lot = 0;
    if let Ok(entries) = fs::read_dir(folder_path) {
        for entry in entries {
            if let Ok(entry) = entry {
                let path = entry.path();
                if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                    if file_name.starts_with("lot_") && file_name.ends_with(".json") {
                        if let Some(num_part) = file_name
                            .trim_start_matches("lot_")
                            .trim_end_matches(".json")
                            .parse::<u32>()
                            .ok()
                        {
                            if num_part > max_lot {
                                max_lot = num_part;
                            }
                        }
                    }
                }
            }
        }
    }
    max_lot + 1
}

pub fn save_lot_log(folder_path: &str, lot_log: &LotLog) {
    let file_path = format!("{}/lot_{}.json", folder_path, lot_log.lot_no);
    if let Ok(json) = serde_json::to_string_pretty(lot_log) {
        let _ = fs::write(file_path, json);
    }
}
