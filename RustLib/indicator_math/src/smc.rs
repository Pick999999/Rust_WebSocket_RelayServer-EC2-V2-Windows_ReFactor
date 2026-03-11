use crate::structs::Candle;
use serde::{Deserialize, Serialize};

pub const BULLISH: i32 = 1;
pub const BEARISH: i32 = -1;
pub const BULLISH_LEG: i32 = 1;
pub const BEARISH_LEG: i32 = 0;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct StructurePoint {
    pub time: u64,
    pub price: f64,
    pub structure_type: String, // "BOS" | "CHoCH"
    pub direction: String,      // "bullish" | "bearish"
    pub level: String,          // "internal" | "swing"
    pub start_time: u64,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct SwingPoint {
    pub time: u64,
    pub price: f64,
    pub swing_type: String, // "HH" | "HL" | "LH" | "LL"
    pub swing: String,      // "high" | "low"
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct OrderBlock {
    pub time: u64,
    pub high: f64,
    pub low: f64,
    pub bias: String,  // "bullish" | "bearish"
    pub level: String, // "internal" | "swing"
    pub mitigated: bool,
    pub mitigated_time: Option<u64>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct FairValueGap {
    pub time: u64,
    pub top: f64,
    pub bottom: f64,
    pub bias: String, // "bullish" | "bearish"
    pub filled: bool,
    pub filled_time: Option<u64>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct EqualHighLow {
    pub time1: u64,
    pub time2: u64,
    pub price: f64,
    pub eq_type: String, // "EQH" | "EQL"
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct PremiumDiscountZone {
    pub start_time: u64,
    pub end_time: u64,
    pub premium_top: f64,
    pub premium_bottom: f64,
    pub equilibrium: f64,
    pub discount_top: f64,
    pub discount_bottom: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct StrongWeakLevel {
    pub time: u64,
    pub price: f64,
    pub strength: String,   // "strong" | "weak"
    pub level_type: String, // "high" | "low"
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SmcResult {
    pub structures: Vec<StructurePoint>,
    pub swing_points: Vec<SwingPoint>,
    pub order_blocks: Vec<OrderBlock>,
    pub fair_value_gaps: Vec<FairValueGap>,
    pub equal_highs_lows: Vec<EqualHighLow>,
    pub premium_discount_zone: Option<PremiumDiscountZone>,
    pub strong_weak_levels: Vec<StrongWeakLevel>,
    pub swing_trend: String,
    pub internal_trend: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SmcConfig {
    pub swing_length: usize,
    pub internal_length: usize,
    pub show_internal_structure: bool,
    pub show_swing_structure: bool,
    pub show_order_blocks: bool,
    pub max_order_blocks: usize,
    pub show_fvg: bool,
    pub show_equal_hl: bool,
    pub equal_hl_length: usize,
    pub equal_hl_threshold: f64,
    pub show_premium_discount: bool,
    pub order_block_filter: String,     // "atr" | "range"
    pub order_block_mitigation: String, // "close" | "highlow"
    pub atr_period: usize,
}

impl Default for SmcConfig {
    fn default() -> Self {
        Self {
            swing_length: 50,
            internal_length: 5,
            show_internal_structure: true,
            show_swing_structure: true,
            show_order_blocks: true,
            max_order_blocks: 5,
            show_fvg: true,
            show_equal_hl: true,
            equal_hl_length: 3,
            equal_hl_threshold: 0.1,
            show_premium_discount: true,
            order_block_filter: "atr".to_string(),
            order_block_mitigation: "highlow".to_string(),
            atr_period: 200,
        }
    }
}

#[derive(Clone)]
struct PivotState {
    current_level: Option<f64>,
    last_level: Option<f64>,
    crossed: bool,
    time: Option<u64>,
    index: Option<usize>,
}

impl PivotState {
    fn new() -> Self {
        Self {
            current_level: None,
            last_level: None,
            crossed: false,
            time: None,
            index: None,
        }
    }
}

#[derive(Clone)]
pub struct SmcIndicator {
    pub config: SmcConfig,

    // Pivot tracking
    swing_high: PivotState,
    swing_low: PivotState,
    internal_high: PivotState,
    internal_low: PivotState,
    equal_high: PivotState,
    equal_low: PivotState,

    // Trend tracking
    swing_trend: i32,
    internal_trend: i32,

    // Trailing extremes
    trailing_top: Option<f64>,
    trailing_bottom: Option<f64>,
    trailing_top_time: Option<u64>,
    trailing_bottom_time: Option<u64>,
    trailing_bar_time: Option<u64>,
    trailing_bar_index: Option<usize>,

    // Results
    pub structures: Vec<StructurePoint>,
    pub swing_points: Vec<SwingPoint>,
    pub order_blocks: Vec<OrderBlock>,
    pub fair_value_gaps: Vec<FairValueGap>,
    pub equal_highs_lows: Vec<EqualHighLow>,
    pub strong_weak_levels: Vec<StrongWeakLevel>,
    pub premium_discount_zones: Vec<PremiumDiscountZone>,

    swing_leg: i32,
    internal_leg: i32,

    data: Vec<Candle>,
    highs: Vec<f64>,
    lows: Vec<f64>,
    parsed_highs: Vec<f64>,
    parsed_lows: Vec<f64>,
    atr_values: Vec<Option<f64>>,
    last_atr: Option<f64>,
    tr_history: Vec<f64>,
    sum_tr: f64,
    cum_tr: Vec<f64>,
}

impl SmcIndicator {
    pub fn new(config: SmcConfig) -> Self {
        let mut ind = Self {
            config,
            swing_high: PivotState::new(),
            swing_low: PivotState::new(),
            internal_high: PivotState::new(),
            internal_low: PivotState::new(),
            equal_high: PivotState::new(),
            equal_low: PivotState::new(),
            swing_trend: 0,
            internal_trend: 0,
            trailing_top: None,
            trailing_bottom: None,
            trailing_top_time: None,
            trailing_bottom_time: None,
            trailing_bar_time: None,
            trailing_bar_index: None,
            structures: vec![],
            swing_points: vec![],
            order_blocks: vec![],
            fair_value_gaps: vec![],
            equal_highs_lows: vec![],
            strong_weak_levels: vec![],
            premium_discount_zones: vec![],
            swing_leg: 0,
            internal_leg: 0,
            data: vec![],
            highs: vec![],
            lows: vec![],
            parsed_highs: vec![],
            parsed_lows: vec![],
            atr_values: vec![],
            last_atr: None,
            tr_history: vec![],
            sum_tr: 0.0,
            cum_tr: vec![],
        };
        ind._reset();
        ind
    }

    fn _reset(&mut self) {
        self.swing_high = PivotState::new();
        self.swing_low = PivotState::new();
        self.internal_high = PivotState::new();
        self.internal_low = PivotState::new();
        self.equal_high = PivotState::new();
        self.equal_low = PivotState::new();

        self.swing_trend = 0;
        self.internal_trend = 0;

        self.trailing_top = None;
        self.trailing_bottom = None;
        self.trailing_top_time = None;
        self.trailing_bottom_time = None;
        self.trailing_bar_time = None;
        self.trailing_bar_index = None;

        self.structures.clear();
        self.swing_points.clear();
        self.order_blocks.clear();
        self.fair_value_gaps.clear();
        self.equal_highs_lows.clear();
        self.strong_weak_levels.clear();
        self.premium_discount_zones.clear();

        self.swing_leg = 0;
        self.internal_leg = 0;

        self.data.clear();
        self.highs.clear();
        self.lows.clear();
        self.parsed_highs.clear();
        self.parsed_lows.clear();
        self.atr_values.clear();
        self.last_atr = None;
        self.tr_history.clear();
        self.sum_tr = 0.0;
        self.cum_tr.clear();
    }

    fn _calculate_atr(&mut self, data: &[Candle], period: usize) -> Vec<Option<f64>> {
        let mut tr = vec![];
        let mut atr = vec![];

        for i in 0..data.len() {
            if i == 0 {
                tr.push(data[i].high - data[i].low);
            } else {
                let high_low = data[i].high - data[i].low;
                let high_prev_close = (data[i].high - data[i - 1].close).abs();
                let low_prev_close = (data[i].low - data[i - 1].close).abs();
                tr.push(high_low.max(high_prev_close).max(low_prev_close));
            }

            if i < period - 1 {
                atr.push(None);
            } else if i == period - 1 {
                let sum: f64 = tr[0..period].iter().sum();
                atr.push(Some(sum / period as f64));
            } else {
                let prev_atr = atr[i - 1].unwrap();
                atr.push(Some(
                    (prev_atr * (period as f64 - 1.0) + tr[i]) / period as f64,
                ));
            }
        }
        atr
    }

    fn _highest(&self, arr: &[f64], start: usize, end: usize) -> f64 {
        let mut max = f64::NEG_INFINITY;
        for i in start..=end {
            if i < arr.len() && arr[i] > max {
                max = arr[i];
            }
        }
        max
    }

    fn _lowest(&self, arr: &[f64], start: usize, end: usize) -> f64 {
        let mut min = f64::INFINITY;
        for i in start..=end {
            if i < arr.len() && arr[i] < min {
                min = arr[i];
            }
        }
        min
    }

    fn _index_of_max(&self, arr: &[f64], start: usize, end: usize) -> usize {
        let mut max_idx = start;
        let mut max = if start < arr.len() {
            arr[start]
        } else {
            f64::NEG_INFINITY
        };
        for i in start..=end {
            if i < arr.len() && arr[i] > max {
                max = arr[i];
                max_idx = i;
            }
        }
        max_idx
    }

    fn _index_of_min(&self, arr: &[f64], start: usize, end: usize) -> usize {
        let mut min_idx = start;
        let mut min = if start < arr.len() {
            arr[start]
        } else {
            f64::INFINITY
        };
        for i in start..=end {
            if i < arr.len() && arr[i] < min {
                min = arr[i];
                min_idx = i;
            }
        }
        min_idx
    }

    fn _get_leg(&self, index: usize, size: usize, prev_leg: i32) -> i32 {
        if index < size {
            return prev_leg;
        }

        let current_high = self.highs[index - size];
        let current_low = self.lows[index - size];
        let highest_recent = self._highest(&self.highs, index - size + 1, index);
        let lowest_recent = self._lowest(&self.lows, index - size + 1, index);

        if current_high > highest_recent {
            return BEARISH_LEG;
        } else if current_low < lowest_recent {
            return BULLISH_LEG;
        }

        prev_leg
    }

    fn _process_structure(&mut self, index: usize, _size: usize, is_internal: bool) {
        // Clone state temporarily to avoid move issues
        let mut pivot = if is_internal {
            self.internal_high.clone()
        } else {
            self.swing_high.clone()
        };
        let mut pivot_low = if is_internal {
            self.internal_low.clone()
        } else {
            self.swing_low.clone()
        };
        let trend = if is_internal {
            self.internal_trend
        } else {
            self.swing_trend
        };
        let level = if is_internal { "internal" } else { "swing" };

        let current_bar = self.data[index];
        let close = current_bar.close;

        // Bullish break
        if let Some(clevel) = pivot.current_level {
            if close > clevel && !pivot.crossed {
                let structure_type = if trend == BEARISH { "CHoCH" } else { "BOS" };
                self.structures.push(StructurePoint {
                    time: current_bar.time,
                    price: clevel,
                    structure_type: structure_type.to_string(),
                    direction: "bullish".to_string(),
                    level: level.to_string(),
                    start_time: pivot.time.unwrap_or(0),
                });
                pivot.crossed = true;
                if is_internal {
                    self.internal_trend = BULLISH;
                } else {
                    self.swing_trend = BULLISH;
                }

                if self.config.show_order_blocks {
                    self._store_order_block(pivot.index, index, BULLISH, is_internal);
                }
            }
        }

        // Bearish break
        if let Some(clevel_low) = pivot_low.current_level {
            if close < clevel_low && !pivot_low.crossed {
                let current_trend = if is_internal {
                    self.internal_trend
                } else {
                    self.swing_trend
                };
                let structure_type = if current_trend == BULLISH {
                    "CHoCH"
                } else {
                    "BOS"
                };

                self.structures.push(StructurePoint {
                    time: current_bar.time,
                    price: clevel_low,
                    structure_type: structure_type.to_string(),
                    direction: "bearish".to_string(),
                    level: level.to_string(),
                    start_time: pivot_low.time.unwrap_or(0),
                });
                pivot_low.crossed = true;
                if is_internal {
                    self.internal_trend = BEARISH;
                } else {
                    self.swing_trend = BEARISH;
                }

                if self.config.show_order_blocks {
                    self._store_order_block(pivot_low.index, index, BEARISH, is_internal);
                }
            }
        }

        // Write back state
        if is_internal {
            self.internal_high = pivot;
            self.internal_low = pivot_low;
        } else {
            self.swing_high = pivot;
            self.swing_low = pivot_low;
        }
    }

    fn _process_swing_points(
        &mut self,
        index: usize,
        size: usize,
        is_internal: bool,
        for_equal_hl: bool,
    ) {
        if index < size {
            return;
        }

        let prev_leg = if is_internal {
            self.internal_leg
        } else {
            self.swing_leg
        };
        let new_leg = self._get_leg(index, size, prev_leg);

        if new_leg != prev_leg {
            if is_internal {
                self.internal_leg = new_leg;
            } else {
                self.swing_leg = new_leg;
            }

            let pivot_index = index - size;
            let pivot_bar = self.data[pivot_index];
            let atr = self.atr_values[pivot_index].unwrap_or(0.0);

            if new_leg == BULLISH_LEG {
                let pivot_price = self.lows[pivot_index];

                let mut pivot = if for_equal_hl {
                    self.equal_low.clone()
                } else if is_internal {
                    self.internal_low.clone()
                } else {
                    self.swing_low.clone()
                };

                if for_equal_hl {
                    if let Some(clevel) = pivot.current_level {
                        if (clevel - pivot_price).abs() < self.config.equal_hl_threshold * atr {
                            self.equal_highs_lows.push(EqualHighLow {
                                time1: pivot.time.unwrap_or(0),
                                time2: pivot_bar.time,
                                price: pivot_price,
                                eq_type: "EQL".to_string(),
                            });
                        }
                    }
                }

                if !for_equal_hl && !is_internal {
                    let swing_type =
                        if pivot.last_level.is_none() || pivot_price < pivot.last_level.unwrap() {
                            "LL"
                        } else {
                            "HL"
                        };
                    self.swing_points.push(SwingPoint {
                        time: pivot_bar.time,
                        price: pivot_price,
                        swing_type: swing_type.to_string(),
                        swing: "low".to_string(),
                    });
                }

                pivot.last_level = pivot.current_level;
                pivot.current_level = Some(pivot_price);
                pivot.crossed = false;
                pivot.time = Some(pivot_bar.time);
                pivot.index = Some(pivot_index);

                if !for_equal_hl && !is_internal {
                    self.trailing_bottom = Some(pivot_price);
                    self.trailing_bottom_time = Some(pivot_bar.time);
                    self.trailing_bar_time = Some(pivot_bar.time);
                    self.trailing_bar_index = Some(pivot_index);
                }

                if for_equal_hl {
                    self.equal_low = pivot;
                } else if is_internal {
                    self.internal_low = pivot;
                } else {
                    self.swing_low = pivot;
                }
            } else {
                let pivot_price = self.highs[pivot_index];

                let mut pivot = if for_equal_hl {
                    self.equal_high.clone()
                } else if is_internal {
                    self.internal_high.clone()
                } else {
                    self.swing_high.clone()
                };

                if for_equal_hl {
                    if let Some(clevel) = pivot.current_level {
                        if (clevel - pivot_price).abs() < self.config.equal_hl_threshold * atr {
                            self.equal_highs_lows.push(EqualHighLow {
                                time1: pivot.time.unwrap_or(0),
                                time2: pivot_bar.time,
                                price: pivot_price,
                                eq_type: "EQH".to_string(),
                            });
                        }
                    }
                }

                if !for_equal_hl && !is_internal {
                    let swing_type =
                        if pivot.last_level.is_none() || pivot_price > pivot.last_level.unwrap() {
                            "HH"
                        } else {
                            "LH"
                        };
                    self.swing_points.push(SwingPoint {
                        time: pivot_bar.time,
                        price: pivot_price,
                        swing_type: swing_type.to_string(),
                        swing: "high".to_string(),
                    });
                }

                pivot.last_level = pivot.current_level;
                pivot.current_level = Some(pivot_price);
                pivot.crossed = false;
                pivot.time = Some(pivot_bar.time);
                pivot.index = Some(pivot_index);

                if !for_equal_hl && !is_internal {
                    self.trailing_top = Some(pivot_price);
                    self.trailing_top_time = Some(pivot_bar.time);
                    self.trailing_bar_time = Some(pivot_bar.time);
                    self.trailing_bar_index = Some(pivot_index);
                }

                if for_equal_hl {
                    self.equal_high = pivot;
                } else if is_internal {
                    self.internal_high = pivot;
                } else {
                    self.swing_high = pivot;
                }
            }
        }
    }

    fn _store_order_block(
        &mut self,
        pivot_index: Option<usize>,
        current_index: usize,
        bias: i32,
        is_internal: bool,
    ) {
        if let Some(p_idx) = pivot_index {
            let parsed_index = if bias == BEARISH {
                self._index_of_max(&self.parsed_highs, p_idx, current_index.saturating_sub(1))
            } else {
                self._index_of_min(&self.parsed_lows, p_idx, current_index.saturating_sub(1))
            };

            if parsed_index >= self.data.len() {
                return;
            }

            self.order_blocks.push(OrderBlock {
                time: self.data[parsed_index].time,
                high: self.parsed_highs[parsed_index],
                low: self.parsed_lows[parsed_index],
                bias: if bias == BULLISH {
                    "bullish".to_string()
                } else {
                    "bearish".to_string()
                },
                level: if is_internal {
                    "internal".to_string()
                } else {
                    "swing".to_string()
                },
                mitigated: false,
                mitigated_time: None,
            });

            let max_ob = self.config.max_order_blocks * 2;
            if self.order_blocks.len() > max_ob * 2 {
                let keep = max_ob * 2;
                self.order_blocks = self.order_blocks[self.order_blocks.len() - keep..].to_vec();
            }
        }
    }

    fn _check_order_block_mitigation(&mut self, index: usize) {
        let bar = &self.data[index];
        let mitigation_high = if self.config.order_block_mitigation == "close" {
            bar.close
        } else {
            bar.high
        };
        let mitigation_low = if self.config.order_block_mitigation == "close" {
            bar.close
        } else {
            bar.low
        };

        for ob in self.order_blocks.iter_mut() {
            if ob.mitigated {
                continue;
            }

            if ob.bias == "bearish" && mitigation_high > ob.high {
                ob.mitigated = true;
                ob.mitigated_time = Some(bar.time);
            } else if ob.bias == "bullish" && mitigation_low < ob.low {
                ob.mitigated = true;
                ob.mitigated_time = Some(bar.time);
            }
        }
    }

    fn _detect_fvg(&mut self, index: usize) {
        if index < 2 {
            return;
        }

        let bar0 = &self.data[index];
        let bar1 = &self.data[index - 1];
        let bar2 = &self.data[index - 2];

        // Bullish FVG
        if bar0.low > bar2.high && bar1.close > bar2.high {
            self.fair_value_gaps.push(FairValueGap {
                time: bar1.time,
                top: bar0.low,
                bottom: bar2.high,
                bias: "bullish".to_string(),
                filled: false,
                filled_time: None,
            });
        }

        // Bearish FVG
        if bar0.high < bar2.low && bar1.close < bar2.low {
            self.fair_value_gaps.push(FairValueGap {
                time: bar1.time,
                top: bar2.low,
                bottom: bar0.high,
                bias: "bearish".to_string(),
                filled: false,
                filled_time: None,
            });
        }
    }

    fn _check_fvg_fill(&mut self, index: usize) {
        let bar = &self.data[index];

        for fvg in self.fair_value_gaps.iter_mut() {
            if fvg.filled {
                continue;
            }

            if fvg.bias == "bullish" && bar.low < fvg.bottom {
                fvg.filled = true;
                fvg.filled_time = Some(bar.time);
            } else if fvg.bias == "bearish" && bar.high > fvg.top {
                fvg.filled = true;
                fvg.filled_time = Some(bar.time);
            }
        }
    }

    fn _update_trailing_extremes(&mut self, index: usize) {
        let bar = &self.data[index];

        if self.trailing_top.is_none() || bar.high > self.trailing_top.unwrap() {
            self.trailing_top = Some(bar.high);
            self.trailing_top_time = Some(bar.time);
        }

        if self.trailing_bottom.is_none() || bar.low < self.trailing_bottom.unwrap() {
            self.trailing_bottom = Some(bar.low);
            self.trailing_bottom_time = Some(bar.time);
        }
    }

    fn _calculate_premium_discount_zone(&self) -> Option<PremiumDiscountZone> {
        if let (Some(top), Some(bottom), Some(bar_time)) = (
            self.trailing_top,
            self.trailing_bottom,
            self.trailing_bar_time,
        ) {
            let range = top - bottom;
            let equilibrium = (top + bottom) / 2.0;
            let end_time = self.data.last().map(|d| d.time).unwrap_or(0);

            Some(PremiumDiscountZone {
                start_time: bar_time,
                end_time,
                premium_top: top,
                premium_bottom: top - range * 0.05,
                equilibrium,
                discount_top: bottom + range * 0.05,
                discount_bottom: bottom,
            })
        } else {
            None
        }
    }

    fn _calculate_strong_weak_levels(&mut self) {
        if self.trailing_top.is_none() || self.trailing_bottom.is_none() {
            return;
        }

        let is_strong_high = self.swing_trend == BEARISH;
        let is_strong_low = self.swing_trend == BULLISH;

        if let (Some(top_time), Some(top)) = (self.trailing_top_time, self.trailing_top) {
            self.strong_weak_levels.retain(|l| l.level_type != "high");
            self.strong_weak_levels.push(StrongWeakLevel {
                time: top_time,
                price: top,
                strength: if is_strong_high {
                    "strong".to_string()
                } else {
                    "weak".to_string()
                },
                level_type: "high".to_string(),
            });
        }

        if let (Some(bottom_time), Some(bottom)) = (self.trailing_bottom_time, self.trailing_bottom)
        {
            self.strong_weak_levels.retain(|l| l.level_type != "low");
            self.strong_weak_levels.push(StrongWeakLevel {
                time: bottom_time,
                price: bottom,
                strength: if is_strong_low {
                    "strong".to_string()
                } else {
                    "weak".to_string()
                },
                level_type: "low".to_string(),
            });
        }
    }

    pub fn calculate(&mut self, data: &[Candle]) -> SmcResult {
        self._reset();
        for candle in data {
            self.append_candle(*candle);
        }
        self.get_all_results()
    }

    pub fn append_candle(&mut self, candle: Candle) -> SmcResult {
        let i = self.data.len();
        self.data.push(candle);
        self.highs.push(candle.high);
        self.lows.push(candle.low);
        
        let period = self.config.atr_period;
        let tr = if i == 0 {
            candle.high - candle.low
        } else {
            let prev_close = self.data[i - 1].close;
            (candle.high - candle.low)
                .max((candle.high - prev_close).abs())
                .max((candle.low - prev_close).abs())
        };
        self.sum_tr += tr;
        self.cum_tr.push(self.sum_tr / (i as f64 + 1.0));

        self.tr_history.push(tr);
        let current_atr = if i < period - 1 {
            None
        } else if i == period - 1 {
            let sum: f64 = self.tr_history.iter().sum();
            Some(sum / period as f64)
        } else {
            let prev_atr = self.last_atr.unwrap_or(0.0);
            Some((prev_atr * (period as f64 - 1.0) + tr) / period as f64)
        };
        self.last_atr = current_atr;
        self.atr_values.push(current_atr);

        let volatility_measure = if self.config.order_block_filter == "atr" {
            current_atr.unwrap_or(self.cum_tr[i])
        } else {
            self.cum_tr[i]
        };

        let high_volatility_bar = (candle.high - candle.low) >= 2.0 * volatility_measure;

        self.parsed_highs.push(if high_volatility_bar {
            candle.low
        } else {
            candle.high
        });
        self.parsed_lows.push(if high_volatility_bar {
            candle.high
        } else {
            candle.low
        });

        if self.config.show_premium_discount {
            self._update_trailing_extremes(i);
        }

        self._process_swing_points(i, self.config.swing_length, false, false);
        self._process_swing_points(i, self.config.internal_length, true, false);

        if self.config.show_equal_hl {
            self._process_swing_points(i, self.config.equal_hl_length, false, true);
        }

        if self.config.show_internal_structure {
            self._process_structure(i, self.config.internal_length, true);
        }
        if self.config.show_swing_structure {
            self._process_structure(i, self.config.swing_length, false);
        }

        if self.config.show_order_blocks {
            self._check_order_block_mitigation(i);
        }

        if self.config.show_fvg {
            self._detect_fvg(i);
            self._check_fvg_fill(i);
        }

        if self.config.show_premium_discount {
            if let Some(zone) = self._calculate_premium_discount_zone() {
                self.premium_discount_zones = vec![zone];
            }
            self._calculate_strong_weak_levels();
        }

        self.get_all_results()
    }

    pub fn get_trend(&self, level: &str) -> String {
        let trend = if level == "internal" {
            self.internal_trend
        } else {
            self.swing_trend
        };
        if trend == BULLISH {
            "bullish".to_string()
        } else if trend == BEARISH {
            "bearish".to_string()
        } else {
            "neutral".to_string()
        }
    }

    pub fn get_all_results(&self) -> SmcResult {
        SmcResult {
            structures: self.structures.clone(),
            swing_points: self.swing_points.clone(),
            order_blocks: self.order_blocks.clone(),
            fair_value_gaps: self.fair_value_gaps.clone(),
            equal_highs_lows: self.equal_highs_lows.clone(),
            premium_discount_zone: self.premium_discount_zones.first().cloned(),
            strong_weak_levels: self.strong_weak_levels.clone(),
            swing_trend: self.get_trend("swing"),
            internal_trend: self.get_trend("internal"),
        }
    }
}
