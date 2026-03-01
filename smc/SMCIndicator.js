/**
 * Smart Money Concepts (SMC) Indicator
 * Converted from PineScript to JavaScript for use with LightweightCharts 4.2+
 * 
 * Features:
 * - Market Structure (CHoCH, BOS)
 * - Swing Points (HH, HL, LH, LL)
 * - Order Blocks (Internal & Swing)
 * - Fair Value Gaps (FVG)
 * - Equal Highs/Lows (EQH/EQL)
 * - Premium/Discount Zones
 * - Strong/Weak Highs & Lows
 */

// Constants
const BULLISH = 1;
const BEARISH = -1;
const BULLISH_LEG = 1;
const BEARISH_LEG = 0;

/**
 * @typedef {Object} OHLCV
 * @property {number} time - Unix timestamp in seconds
 * @property {number} open
 * @property {number} high
 * @property {number} low
 * @property {number} close
 * @property {number} [volume]
 */

/**
 * @typedef {Object} StructurePoint
 * @property {number} time
 * @property {number} price
 * @property {'BOS'|'CHoCH'} type
 * @property {'bullish'|'bearish'} direction
 * @property {'internal'|'swing'} level
 * @property {number} startTime - Time where the structure line starts
 */

/**
 * @typedef {Object} SwingPoint
 * @property {number} time
 * @property {number} price
 * @property {'HH'|'HL'|'LH'|'LL'} type
 * @property {'high'|'low'} swing
 */

/**
 * @typedef {Object} OrderBlock
 * @property {number} time
 * @property {number} high
 * @property {number} low
 * @property {'bullish'|'bearish'} bias
 * @property {'internal'|'swing'} level
 * @property {boolean} mitigated
 * @property {number} [mitigatedTime]
 */

/**
 * @typedef {Object} FairValueGap
 * @property {number} time
 * @property {number} top
 * @property {number} bottom
 * @property {'bullish'|'bearish'} bias
 * @property {boolean} filled
 * @property {number} [filledTime]
 */

/**
 * @typedef {Object} EqualHighLow
 * @property {number} time1
 * @property {number} time2
 * @property {number} price
 * @property {'EQH'|'EQL'} type
 */

/**
 * @typedef {Object} PremiumDiscountZone
 * @property {number} startTime
 * @property {number} endTime
 * @property {number} premiumTop
 * @property {number} premiumBottom
 * @property {number} equilibrium
 * @property {number} discountTop
 * @property {number} discountBottom
 */

/**
 * @typedef {Object} StrongWeakLevel
 * @property {number} time
 * @property {number} price
 * @property {'strong'|'weak'} strength
 * @property {'high'|'low'} type
 */

/**
 * @typedef {Object} SMCConfig
 * @property {number} [swingLength=50] - Swing structure lookback period
 * @property {number} [internalLength=5] - Internal structure lookback period
 * @property {boolean} [showInternalStructure=true]
 * @property {boolean} [showSwingStructure=true]
 * @property {boolean} [showOrderBlocks=true]
 * @property {number} [maxOrderBlocks=5]
 * @property {boolean} [showFVG=true]
 * @property {boolean} [showEqualHL=true]
 * @property {number} [equalHLLength=3]
 * @property {number} [equalHLThreshold=0.1]
 * @property {boolean} [showPremiumDiscount=true]
 * @property {'atr'|'range'} [orderBlockFilter='atr']
 * @property {'close'|'highlow'} [orderBlockMitigation='highlow']
 * @property {number} [atrPeriod=200]
 */

class SMCIndicator {
    /**
     * @param {SMCConfig} config
     */
    constructor(config = {}) {
        this.config = {
            swingLength: config.swingLength || 50,
            internalLength: config.internalLength || 5,
            showInternalStructure: config.showInternalStructure !== false,
            showSwingStructure: config.showSwingStructure !== false,
            showOrderBlocks: config.showOrderBlocks !== false,
            maxOrderBlocks: config.maxOrderBlocks || 5,
            showFVG: config.showFVG !== false,
            showEqualHL: config.showEqualHL !== false,
            equalHLLength: config.equalHLLength || 3,
            equalHLThreshold: config.equalHLThreshold || 0.1,
            showPremiumDiscount: config.showPremiumDiscount !== false,
            orderBlockFilter: config.orderBlockFilter || 'atr',
            orderBlockMitigation: config.orderBlockMitigation || 'highlow',
            atrPeriod: config.atrPeriod || 200
        };

        // Internal state
        this._reset();
    }

    /**
     * Reset internal state
     */
    _reset() {
        // Pivot tracking
        this.swingHigh = { currentLevel: null, lastLevel: null, crossed: false, time: null, index: null };
        this.swingLow = { currentLevel: null, lastLevel: null, crossed: false, time: null, index: null };
        this.internalHigh = { currentLevel: null, lastLevel: null, crossed: false, time: null, index: null };
        this.internalLow = { currentLevel: null, lastLevel: null, crossed: false, time: null, index: null };
        this.equalHigh = { currentLevel: null, lastLevel: null, crossed: false, time: null, index: null };
        this.equalLow = { currentLevel: null, lastLevel: null, crossed: false, time: null, index: null };

        // Trend tracking
        this.swingTrend = 0;
        this.internalTrend = 0;

        // Trailing extremes
        this.trailing = {
            top: null,
            bottom: null,
            topTime: null,
            bottomTime: null,
            barTime: null,
            barIndex: null
        };

        // Results storage
        this.structures = [];
        this.swingPoints = [];
        this.orderBlocks = [];
        this.fairValueGaps = [];
        this.equalHighsLows = [];
        this.strongWeakLevels = [];
        this.premiumDiscountZones = [];

        // Leg tracking
        this.swingLeg = 0;
        this.internalLeg = 0;

        // Data arrays
        this.data = [];
        this.highs = [];
        this.lows = [];
        this.parsedHighs = [];
        this.parsedLows = [];
        this.atrValues = [];
    }

    /**
     * Calculate ATR (Average True Range)
     * @param {OHLCV[]} data
     * @param {number} period
     * @returns {number[]}
     */
    _calculateATR(data, period) {
        const tr = [];
        const atr = [];

        for (let i = 0; i < data.length; i++) {
            if (i === 0) {
                tr.push(data[i].high - data[i].low);
            } else {
                const highLow = data[i].high - data[i].low;
                const highPrevClose = Math.abs(data[i].high - data[i - 1].close);
                const lowPrevClose = Math.abs(data[i].low - data[i - 1].close);
                tr.push(Math.max(highLow, highPrevClose, lowPrevClose));
            }

            if (i < period - 1) {
                atr.push(null);
            } else if (i === period - 1) {
                const sum = tr.slice(0, period).reduce((a, b) => a + b, 0);
                atr.push(sum / period);
            } else {
                atr.push((atr[i - 1] * (period - 1) + tr[i]) / period);
            }
        }

        return atr;
    }

    /**
     * Get highest value in range
     * @param {number[]} arr
     * @param {number} start
     * @param {number} end
     * @returns {number}
     */
    _highest(arr, start, end) {
        let max = -Infinity;
        for (let i = start; i <= end && i < arr.length; i++) {
            if (arr[i] > max) max = arr[i];
        }
        return max;
    }

    /**
     * Get lowest value in range
     * @param {number[]} arr
     * @param {number} start
     * @param {number} end
     * @returns {number}
     */
    _lowest(arr, start, end) {
        let min = Infinity;
        for (let i = start; i <= end && i < arr.length; i++) {
            if (arr[i] < min) min = arr[i];
        }
        return min;
    }

    /**
     * Find index of max value in range
     * @param {number[]} arr
     * @param {number} start
     * @param {number} end
     * @returns {number}
     */
    _indexOfMax(arr, start, end) {
        let maxIdx = start;
        let max = arr[start];
        for (let i = start; i <= end && i < arr.length; i++) {
            if (arr[i] > max) {
                max = arr[i];
                maxIdx = i;
            }
        }
        return maxIdx;
    }

    /**
     * Find index of min value in range
     * @param {number[]} arr
     * @param {number} start
     * @param {number} end
     * @returns {number}
     */
    _indexOfMin(arr, start, end) {
        let minIdx = start;
        let min = arr[start];
        for (let i = start; i <= end && i < arr.length; i++) {
            if (arr[i] < min) {
                min = arr[i];
                minIdx = i;
            }
        }
        return minIdx;
    }

    /**
     * Determine current leg (bullish or bearish)
     * @param {number} index
     * @param {number} size
     * @param {number} prevLeg
     * @returns {number}
     */
    _getLeg(index, size, prevLeg) {
        if (index < size) return prevLeg;

        const currentHigh = this.highs[index - size];
        const currentLow = this.lows[index - size];
        const highestRecent = this._highest(this.highs, index - size + 1, index);
        const lowestRecent = this._lowest(this.lows, index - size + 1, index);

        if (currentHigh > highestRecent) {
            return BEARISH_LEG;
        } else if (currentLow < lowestRecent) {
            return BULLISH_LEG;
        }

        return prevLeg;
    }

    /**
     * Process swing structure
     * @param {number} index
     * @param {number} size
     * @param {boolean} isInternal
     */
    _processStructure(index, size, isInternal) {
        const pivot = isInternal ? this.internalHigh : this.swingHigh;
        const pivotLow = isInternal ? this.internalLow : this.swingLow;
        const trend = isInternal ? this.internalTrend : this.swingTrend;
        const level = isInternal ? 'internal' : 'swing';

        const currentBar = this.data[index];
        const close = currentBar.close;

        // Check bullish structure break (crossover high pivot)
        if (pivot.currentLevel !== null && close > pivot.currentLevel && !pivot.crossed) {
            const structureType = trend === BEARISH ? 'CHoCH' : 'BOS';

            this.structures.push({
                time: currentBar.time,
                price: pivot.currentLevel,
                type: structureType,
                direction: 'bullish',
                level: level,
                startTime: pivot.time
            });

            pivot.crossed = true;
            if (isInternal) {
                this.internalTrend = BULLISH;
            } else {
                this.swingTrend = BULLISH;
            }

            // Store order block
            if (this.config.showOrderBlocks) {
                this._storeOrderBlock(pivot, index, BULLISH, isInternal);
            }
        }

        // Check bearish structure break (crossunder low pivot)
        if (pivotLow.currentLevel !== null && close < pivotLow.currentLevel && !pivotLow.crossed) {
            const currentTrend = isInternal ? this.internalTrend : this.swingTrend;
            const structureType = currentTrend === BULLISH ? 'CHoCH' : 'BOS';

            this.structures.push({
                time: currentBar.time,
                price: pivotLow.currentLevel,
                type: structureType,
                direction: 'bearish',
                level: level,
                startTime: pivotLow.time
            });

            pivotLow.crossed = true;
            if (isInternal) {
                this.internalTrend = BEARISH;
            } else {
                this.swingTrend = BEARISH;
            }

            // Store order block
            if (this.config.showOrderBlocks) {
                this._storeOrderBlock(pivotLow, index, BEARISH, isInternal);
            }
        }
    }

    /**
     * Process swing points and update pivots
     * @param {number} index
     * @param {number} size
     * @param {boolean} isInternal
     * @param {boolean} forEqualHL
     */
    _processSwingPoints(index, size, isInternal, forEqualHL = false) {
        if (index < size) return;

        const legRef = isInternal ? 'internalLeg' : 'swingLeg';
        const prevLeg = this[legRef];
        const newLeg = this._getLeg(index, size, prevLeg);

        if (newLeg !== prevLeg) {
            this[legRef] = newLeg;

            const pivotIndex = index - size;
            const pivotBar = this.data[pivotIndex];
            const atr = this.atrValues[pivotIndex] || 0;

            if (newLeg === BULLISH_LEG) {
                // New low pivot
                const pivot = forEqualHL ? this.equalLow : (isInternal ? this.internalLow : this.swingLow);
                const pivotPrice = this.lows[pivotIndex];

                // Check for equal lows
                if (forEqualHL && pivot.currentLevel !== null) {
                    if (Math.abs(pivot.currentLevel - pivotPrice) < this.config.equalHLThreshold * atr) {
                        this.equalHighsLows.push({
                            time1: pivot.time,
                            time2: pivotBar.time,
                            price: pivotPrice,
                            type: 'EQL'
                        });
                    }
                }

                // Update swing point label
                if (!forEqualHL && !isInternal) {
                    const swingType = (pivot.lastLevel === null || pivotPrice < pivot.lastLevel) ? 'LL' : 'HL';
                    this.swingPoints.push({
                        time: pivotBar.time,
                        price: pivotPrice,
                        type: swingType,
                        swing: 'low'
                    });
                }

                pivot.lastLevel = pivot.currentLevel;
                pivot.currentLevel = pivotPrice;
                pivot.crossed = false;
                pivot.time = pivotBar.time;
                pivot.index = pivotIndex;

                // Update trailing extremes
                if (!forEqualHL && !isInternal) {
                    this.trailing.bottom = pivotPrice;
                    this.trailing.bottomTime = pivotBar.time;
                    this.trailing.barTime = pivotBar.time;
                    this.trailing.barIndex = pivotIndex;
                }

            } else {
                // New high pivot
                const pivot = forEqualHL ? this.equalHigh : (isInternal ? this.internalHigh : this.swingHigh);
                const pivotPrice = this.highs[pivotIndex];

                // Check for equal highs
                if (forEqualHL && pivot.currentLevel !== null) {
                    if (Math.abs(pivot.currentLevel - pivotPrice) < this.config.equalHLThreshold * atr) {
                        this.equalHighsLows.push({
                            time1: pivot.time,
                            time2: pivotBar.time,
                            price: pivotPrice,
                            type: 'EQH'
                        });
                    }
                }

                // Update swing point label
                if (!forEqualHL && !isInternal) {
                    const swingType = (pivot.lastLevel === null || pivotPrice > pivot.lastLevel) ? 'HH' : 'LH';
                    this.swingPoints.push({
                        time: pivotBar.time,
                        price: pivotPrice,
                        type: swingType,
                        swing: 'high'
                    });
                }

                pivot.lastLevel = pivot.currentLevel;
                pivot.currentLevel = pivotPrice;
                pivot.crossed = false;
                pivot.time = pivotBar.time;
                pivot.index = pivotIndex;

                // Update trailing extremes
                if (!forEqualHL && !isInternal) {
                    this.trailing.top = pivotPrice;
                    this.trailing.topTime = pivotBar.time;
                    this.trailing.barTime = pivotBar.time;
                    this.trailing.barIndex = pivotIndex;
                }
            }
        }
    }

    /**
     * Store order block
     * @param {Object} pivot
     * @param {number} currentIndex
     * @param {number} bias
     * @param {boolean} isInternal
     */
    _storeOrderBlock(pivot, currentIndex, bias, isInternal) {
        if (pivot.index === null) return;

        let parsedIndex;
        if (bias === BEARISH) {
            parsedIndex = this._indexOfMax(this.parsedHighs, pivot.index, currentIndex - 1);
        } else {
            parsedIndex = this._indexOfMin(this.parsedLows, pivot.index, currentIndex - 1);
        }

        if (parsedIndex < 0 || parsedIndex >= this.data.length) return;

        this.orderBlocks.push({
            time: this.data[parsedIndex].time,
            high: this.parsedHighs[parsedIndex],
            low: this.parsedLows[parsedIndex],
            bias: bias === BULLISH ? 'bullish' : 'bearish',
            level: isInternal ? 'internal' : 'swing',
            mitigated: false,
            mitigatedTime: null
        });

        // Limit order blocks
        const maxOB = this.config.maxOrderBlocks * 2; // internal + swing
        if (this.orderBlocks.length > maxOB * 2) {
            this.orderBlocks = this.orderBlocks.slice(-maxOB * 2);
        }
    }

    /**
     * Check and update order block mitigation
     * @param {number} index
     */
    _checkOrderBlockMitigation(index) {
        const bar = this.data[index];
        const mitigationHigh = this.config.orderBlockMitigation === 'close' ? bar.close : bar.high;
        const mitigationLow = this.config.orderBlockMitigation === 'close' ? bar.close : bar.low;

        for (const ob of this.orderBlocks) {
            if (ob.mitigated) continue;

            if (ob.bias === 'bearish' && mitigationHigh > ob.high) {
                ob.mitigated = true;
                ob.mitigatedTime = bar.time;
            } else if (ob.bias === 'bullish' && mitigationLow < ob.low) {
                ob.mitigated = true;
                ob.mitigatedTime = bar.time;
            }
        }
    }

    /**
     * Detect Fair Value Gaps
     * @param {number} index
     */
    _detectFVG(index) {
        if (index < 2) return;

        const bar0 = this.data[index];
        const bar1 = this.data[index - 1];
        const bar2 = this.data[index - 2];

        // Bullish FVG: current low > 2 bars ago high
        if (bar0.low > bar2.high && bar1.close > bar2.high) {
            this.fairValueGaps.push({
                time: bar1.time,
                top: bar0.low,
                bottom: bar2.high,
                bias: 'bullish',
                filled: false,
                filledTime: null
            });
        }

        // Bearish FVG: current high < 2 bars ago low
        if (bar0.high < bar2.low && bar1.close < bar2.low) {
            this.fairValueGaps.push({
                time: bar1.time,
                top: bar2.low,
                bottom: bar0.high,
                bias: 'bearish',
                filled: false,
                filledTime: null
            });
        }
    }

    /**
     * Check FVG fill/mitigation
     * @param {number} index
     */
    _checkFVGFill(index) {
        const bar = this.data[index];

        for (const fvg of this.fairValueGaps) {
            if (fvg.filled) continue;

            if (fvg.bias === 'bullish' && bar.low < fvg.bottom) {
                fvg.filled = true;
                fvg.filledTime = bar.time;
            } else if (fvg.bias === 'bearish' && bar.high > fvg.top) {
                fvg.filled = true;
                fvg.filledTime = bar.time;
            }
        }
    }

    /**
     * Update trailing extremes for current bar
     * @param {number} index
     */
    _updateTrailingExtremes(index) {
        const bar = this.data[index];

        if (this.trailing.top === null || bar.high > this.trailing.top) {
            this.trailing.top = bar.high;
            this.trailing.topTime = bar.time;
        }

        if (this.trailing.bottom === null || bar.low < this.trailing.bottom) {
            this.trailing.bottom = bar.low;
            this.trailing.bottomTime = bar.time;
        }
    }

    /**
     * Calculate premium/discount zones
     * @returns {PremiumDiscountZone|null}
     */
    _calculatePremiumDiscountZone() {
        if (this.trailing.top === null || this.trailing.bottom === null) return null;

        const range = this.trailing.top - this.trailing.bottom;
        const equilibrium = (this.trailing.top + this.trailing.bottom) / 2;

        return {
            startTime: this.trailing.barTime,
            endTime: this.data[this.data.length - 1].time,
            premiumTop: this.trailing.top,
            premiumBottom: this.trailing.top - range * 0.05,
            equilibrium: equilibrium,
            discountTop: this.trailing.bottom + range * 0.05,
            discountBottom: this.trailing.bottom
        };
    }

    /**
     * Calculate strong/weak levels
     */
    _calculateStrongWeakLevels() {
        if (this.trailing.top === null || this.trailing.bottom === null) return;

        const isStrongHigh = this.swingTrend === BEARISH;
        const isStrongLow = this.swingTrend === BULLISH;

        // Only add if we have valid trailing data
        if (this.trailing.topTime) {
            // Remove previous strong/weak high entries
            this.strongWeakLevels = this.strongWeakLevels.filter(l => l.type !== 'high');

            this.strongWeakLevels.push({
                time: this.trailing.topTime,
                price: this.trailing.top,
                strength: isStrongHigh ? 'strong' : 'weak',
                type: 'high'
            });
        }

        if (this.trailing.bottomTime) {
            // Remove previous strong/weak low entries
            this.strongWeakLevels = this.strongWeakLevels.filter(l => l.type !== 'low');

            this.strongWeakLevels.push({
                time: this.trailing.bottomTime,
                price: this.trailing.bottom,
                strength: isStrongLow ? 'strong' : 'weak',
                type: 'low'
            });
        }
    }

    /**
     * Process all data and calculate SMC indicators
     * @param {OHLCV[]} data - Array of OHLCV candles
     * @returns {SMCIndicator} - Returns self for chaining
     */
    calculate(data) {
        this._reset();
        this.data = data;

        if (data.length === 0) return this;

        // Pre-calculate arrays
        this.highs = data.map(d => d.high);
        this.lows = data.map(d => d.low);

        // Calculate ATR
        this.atrValues = this._calculateATR(data, this.config.atrPeriod);

        // Calculate volatility measure and parsed highs/lows
        const cumTr = [];
        let sumTr = 0;

        for (let i = 0; i < data.length; i++) {
            const tr = i === 0 ? data[i].high - data[i].low :
                Math.max(
                    data[i].high - data[i].low,
                    Math.abs(data[i].high - data[i - 1].close),
                    Math.abs(data[i].low - data[i - 1].close)
                );
            sumTr += tr;
            cumTr.push(sumTr / (i + 1));

            const volatilityMeasure = this.config.orderBlockFilter === 'atr' ?
                (this.atrValues[i] || cumTr[i]) : cumTr[i];
            const highVolatilityBar = (data[i].high - data[i].low) >= 2 * volatilityMeasure;

            this.parsedHighs.push(highVolatilityBar ? data[i].low : data[i].high);
            this.parsedLows.push(highVolatilityBar ? data[i].high : data[i].low);
        }

        // Process each bar
        for (let i = 0; i < data.length; i++) {
            // Update trailing extremes
            if (this.config.showPremiumDiscount) {
                this._updateTrailingExtremes(i);
            }

            // Process swing points
            this._processSwingPoints(i, this.config.swingLength, false);
            this._processSwingPoints(i, this.config.internalLength, true);

            // Process equal highs/lows
            if (this.config.showEqualHL) {
                this._processSwingPoints(i, this.config.equalHLLength, false, true);
            }

            // Process structure
            if (this.config.showInternalStructure) {
                this._processStructure(i, this.config.internalLength, true);
            }
            if (this.config.showSwingStructure) {
                this._processStructure(i, this.config.swingLength, false);
            }

            // Check order block mitigation
            if (this.config.showOrderBlocks) {
                this._checkOrderBlockMitigation(i);
            }

            // Detect FVG
            if (this.config.showFVG) {
                this._detectFVG(i);
                this._checkFVGFill(i);
            }
        }

        // Calculate final premium/discount zone
        if (this.config.showPremiumDiscount) {
            const zone = this._calculatePremiumDiscountZone();
            if (zone) {
                this.premiumDiscountZones = [zone];
            }
            this._calculateStrongWeakLevels();
        }

        return this;
    }

    /**
     * Get all structure points (CHoCH & BOS)
     * @param {Object} [filter] - Optional filter
     * @param {'internal'|'swing'} [filter.level]
     * @param {'bullish'|'bearish'} [filter.direction]
     * @param {'BOS'|'CHoCH'} [filter.type]
     * @returns {StructurePoint[]}
     */
    getStructures(filter = {}) {
        let results = this.structures;

        if (filter.level) {
            results = results.filter(s => s.level === filter.level);
        }
        if (filter.direction) {
            results = results.filter(s => s.direction === filter.direction);
        }
        if (filter.type) {
            results = results.filter(s => s.type === filter.type);
        }

        return results;
    }

    /**
     * Get all swing points (HH, HL, LH, LL)
     * @param {Object} [filter]
     * @param {'HH'|'HL'|'LH'|'LL'} [filter.type]
     * @param {'high'|'low'} [filter.swing]
     * @returns {SwingPoint[]}
     */
    getSwingPoints(filter = {}) {
        let results = this.swingPoints;

        if (filter.type) {
            results = results.filter(s => s.type === filter.type);
        }
        if (filter.swing) {
            results = results.filter(s => s.swing === filter.swing);
        }

        return results;
    }

    /**
     * Get all order blocks
     * @param {Object} [filter]
     * @param {'internal'|'swing'} [filter.level]
     * @param {'bullish'|'bearish'} [filter.bias]
     * @param {boolean} [filter.mitigated]
     * @returns {OrderBlock[]}
     */
    getOrderBlocks(filter = {}) {
        let results = this.orderBlocks;

        if (filter.level) {
            results = results.filter(ob => ob.level === filter.level);
        }
        if (filter.bias) {
            results = results.filter(ob => ob.bias === filter.bias);
        }
        if (filter.mitigated !== undefined) {
            results = results.filter(ob => ob.mitigated === filter.mitigated);
        }

        return results;
    }

    /**
     * Get all Fair Value Gaps
     * @param {Object} [filter]
     * @param {'bullish'|'bearish'} [filter.bias]
     * @param {boolean} [filter.filled]
     * @returns {FairValueGap[]}
     */
    getFairValueGaps(filter = {}) {
        let results = this.fairValueGaps;

        if (filter.bias) {
            results = results.filter(fvg => fvg.bias === filter.bias);
        }
        if (filter.filled !== undefined) {
            results = results.filter(fvg => fvg.filled === filter.filled);
        }

        return results;
    }

    /**
     * Get all Equal Highs/Lows
     * @param {Object} [filter]
     * @param {'EQH'|'EQL'} [filter.type]
     * @returns {EqualHighLow[]}
     */
    getEqualHighsLows(filter = {}) {
        let results = this.equalHighsLows;

        if (filter.type) {
            results = results.filter(eq => eq.type === filter.type);
        }

        return results;
    }

    /**
     * Get Premium/Discount Zone
     * @returns {PremiumDiscountZone|null}
     */
    getPremiumDiscountZone() {
        return this.premiumDiscountZones[0] || null;
    }

    /**
     * Get Strong/Weak Levels
     * @param {Object} [filter]
     * @param {'high'|'low'} [filter.type]
     * @param {'strong'|'weak'} [filter.strength]
     * @returns {StrongWeakLevel[]}
     */
    getStrongWeakLevels(filter = {}) {
        let results = this.strongWeakLevels;

        if (filter.type) {
            results = results.filter(l => l.type === filter.type);
        }
        if (filter.strength) {
            results = results.filter(l => l.strength === filter.strength);
        }

        return results;
    }

    /**
     * Get current trend bias
     * @param {'internal'|'swing'} [level='swing']
     * @returns {'bullish'|'bearish'|'neutral'}
     */
    getTrend(level = 'swing') {
        const trend = level === 'internal' ? this.internalTrend : this.swingTrend;
        if (trend === BULLISH) return 'bullish';
        if (trend === BEARISH) return 'bearish';
        return 'neutral';
    }

    /**
     * Get all results as a single object
     * @returns {Object}
     */
    getAllResults() {
        return {
            structures: this.structures,
            swingPoints: this.swingPoints,
            orderBlocks: this.orderBlocks,
            fairValueGaps: this.fairValueGaps,
            equalHighsLows: this.equalHighsLows,
            premiumDiscountZone: this.getPremiumDiscountZone(),
            strongWeakLevels: this.strongWeakLevels,
            swingTrend: this.getTrend('swing'),
            internalTrend: this.getTrend('internal')
        };
    }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SMCIndicator, BULLISH, BEARISH };
}

if (typeof window !== 'undefined') {
    window.SMCIndicator = SMCIndicator;
}

export { SMCIndicator, BULLISH, BEARISH };
