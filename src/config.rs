// config.rs — Indicator configuration loading, saving, and defaults
// Extracted from main.rs (Task 7 of refactorPlan.md)

use crate::models::EmaPoint;
use indicator_math::{ehma, ema, hma, sma, wma, Candle as IndicatorCandle, MaType};
use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndicatorConfig {
    pub indicators: IndicatorsSection,
    #[serde(default)]
    pub chart: ChartSection,
    #[serde(default)]
    pub trading: TradingSection,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndicatorsSection {
    pub short_ema_type: String,
    pub short_ema_period: usize,
    #[serde(default = "default_medium_ema_type")]
    pub medium_ema_type: String,
    #[serde(default = "default_medium_ema_period")]
    pub medium_ema_period: usize,
    pub long_ema_type: String,
    pub long_ema_period: usize,
    #[serde(default = "default_action_mode")]
    pub action_mode: String, // "simple", "cut_type_short", "cut_type_long"
}

fn default_medium_ema_type() -> String {
    "ema".to_string()
}
fn default_medium_ema_period() -> usize {
    8
}
fn default_action_mode() -> String {
    "cut_type_long".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ChartSection {
    #[serde(default = "default_short_color")]
    pub short_ema_color: String,
    #[serde(default = "default_long_color")]
    pub long_ema_color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TradingSection {
    #[serde(default = "default_target_profit")]
    pub target_grand_profit: f64,
    #[serde(default = "default_target_win")]
    pub target_win_count: u32,
}

fn default_short_color() -> String {
    "#00BFFF".to_string()
}
fn default_long_color() -> String {
    "#FF6347".to_string()
}
fn default_target_profit() -> f64 {
    10.0
}
fn default_target_win() -> u32 {
    5
}

pub fn load_indicator_config() -> IndicatorConfig {
    match fs::read_to_string("config.toml") {
        Ok(content) => match toml::from_str::<IndicatorConfig>(&content) {
            Ok(config) => {
                println!("📊 Loaded config: short {} period {}, medium {} period {}, long {} period {}, action_mode: {}",
                        config.indicators.short_ema_type, config.indicators.short_ema_period,
                        config.indicators.medium_ema_type, config.indicators.medium_ema_period,
                        config.indicators.long_ema_type, config.indicators.long_ema_period,
                        config.indicators.action_mode);
                config
            }
            Err(e) => {
                println!("⚠️ Config parse error, using defaults: {}", e);
                default_indicator_config()
            }
        },
        Err(_) => {
            println!("⚠️ config.toml not found, using defaults");
            default_indicator_config()
        }
    }
}

pub fn save_indicator_config(config: &IndicatorConfig) {
    match toml::to_string_pretty(config) {
        Ok(toml_str) => {
            if let Err(e) = fs::write("config.toml", toml_str) {
                println!("❌ Failed to save config: {}", e);
            } else {
                println!("💾 Config saved successfully.");
            }
        }
        Err(e) => println!("❌ Failed to serialize config: {}", e),
    }
}

pub fn default_indicator_config() -> IndicatorConfig {
    IndicatorConfig {
        indicators: IndicatorsSection {
            short_ema_type: "ema".to_string(),
            short_ema_period: 3,
            medium_ema_type: "ema".to_string(),
            medium_ema_period: 8,
            long_ema_type: "ema".to_string(),
            long_ema_period: 21,
            action_mode: "cut_type_long".to_string(),
        },
        chart: ChartSection {
            short_ema_color: "#00BFFF".to_string(),
            long_ema_color: "#FF6347".to_string(),
        },
        trading: TradingSection {
            target_grand_profit: 10.0,
            target_win_count: 5,
        },
    }
}

pub fn calculate_indicator(
    candles: &[IndicatorCandle],
    indicator_type: &str,
    period: usize,
) -> Vec<EmaPoint> {
    let result = match indicator_type.to_lowercase().as_str() {
        "sma" => sma(candles, period),
        "wma" => wma(candles, period),
        "hma" => hma(candles, period),
        "ehma" => ehma(candles, period),
        _ => ema(candles, period), // default to EMA
    };

    result
        .into_iter()
        .map(|v| EmaPoint {
            time: v.time,
            value: v.value,
        })
        .collect()
}

// Parse string to MaType enum
pub fn parse_ma_type(type_str: &str) -> MaType {
    match type_str.to_lowercase().as_str() {
        "sma" => MaType::SMA,
        "wma" => MaType::WMA,
        "hma" => MaType::HMA,
        "ehma" => MaType::EHMA,
        _ => MaType::EMA,
    }
}
