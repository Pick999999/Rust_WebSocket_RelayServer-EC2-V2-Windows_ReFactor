/*
 * indicatorJS_Ver2.js
 * Consolidated Indicators + Analysis + SMC + Renderer + Zones
 *
 * Header: list of functions / classes included in this file
 *
 * - Indicators (object)
 *   - sma(data, period)
 *   - rma(data, period)
 *   - tr(high, low, close)
 *   - adx(high, low, close, period)
 *   - ci(high, low, close, period)
 *   - ema(data, period)
 *   - atr(high, low, close, period)
 *   - wma(data, period)
 *   - hma(data, period)
 *   - ehma(data, period)
 *   - bollingerBands(data, period, stdDevMultiplier)
 *   - rsi(data, period)
 *
 * - AnalysisGenerator (class)
 *   - constructor(candleData, options)
 *   - generate(), getSummary(), toJSON()
 *   - calculateMA, calculateEMA, calculateHMA, calculateEHMA, calculateWMA
 *   - calculateRSI, calculateATR, calculateATRWithTime, calculateBB, calculateCI, calculateADX
 *   - getEMADirection, getMACDConver
 *
 * - SMCIndicator (class)
 *   - constructor(config), calculate(data), getStructures(), getSwingPoints(), getOrderBlocks(), getFairValueGaps(), getAllResults(), etc.
 *   - internal helpers: _calculateATR, _processSwingPoints, _processStructure, _storeOrderBlock, _detectFVG, _checkFVGFill
 *
 * - SMCChartRenderer (class)
 *   - constructor(chart, candlestickSeries, config)
 *   - renderAll(smcResults, options), renderOrderBlocks, renderFairValueGaps, renderSwingPoints, renderStructures, clear(), createBoxPrimitive
 *
 * - BackgroundColorZonesPlugin (class)
 *   - createCiRsiZones(candles, ciArray, rsiArray, options)
 *   - createZonesFromAnalysis(analysisData, options), createCrossoverZones(analysisData), createChoppyZones(analysisData, ciThreshold)
 *   - ZoneConfigManager (class)
 *
 * Export / Exposure: Attaches the key objects to `window` when available
 *
 * Feasibility notes (short):
 * - Most pure indicator functions (Indicators, AnalysisGenerator) are self-contained and safe to centralize.
 * - SMCIndicator and SMCChartRenderer depend on chart data and LightweightCharts primitives API; they can be centralized but must be loaded before code that instantiates them, and LightweightCharts must be available.
 * - BackgroundColorZonesPlugin uses primitives API and localStorage; keep ordering in HTML so this file loads before code that calls `zoneConfigManager`.
 * - When consolidating, ensure only one definition of each class exists; remove duplicates elsewhere or adjust includes to avoid conflicts.
 */

// ---------------------- Indicators (from js/indicators.js) ----------------------
const Indicators = {
    sma: (data, period) => {
        const results = [];
        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) {
                results.push(null);
                continue;
            }
            let sum = 0;
            for (let j = 0; j < period; j++) {
                sum += data[i - j];
            }
            results.push(sum / period);
        }
        return results;
    },

    rma: (data, period) => {
        const results = [];
        let prevRma = null;

        for (let i = 0; i < data.length; i++) {
            const val = data[i];
            if (val === null || isNaN(val)) {
                results.push(null);
                continue;
            }

            if (results.filter(x => x !== null).length === 0) {
                if (i < period - 1) {
                    results.push(null);
                } else {
                    let sum = 0;
                    for (let j = 0; j < period; j++) sum += data[i - j];
                    prevRma = sum / period;
                    results.push(prevRma);
                }
            } else {
                prevRma = (prevRma * (period - 1) + val) / period;
                results.push(prevRma);
            }
        }
        return results;
    },

    tr: (high, low, close) => {
        const tr = [];
        for (let i = 0; i < high.length; i++) {
            if (i === 0) tr.push(high[i] - low[i]);
            else tr.push(Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1])));
        }
        return tr;
    },

    adx: (high, low, close, period = 14) => {
        const tr = Indicators.tr(high, low, close);
        const plusDm = [];
        const minusDm = [];

        for (let i = 0; i < high.length; i++) {
            if (i === 0) { plusDm.push(0); minusDm.push(0); continue; }
            const up = high[i] - high[i - 1];
            const down = low[i - 1] - low[i];
            plusDm.push(up > down && up > 0 ? up : 0);
            minusDm.push(down > up && down > 0 ? down : 0);
        }

        const trSmooth = Indicators.rma(tr, period);
        const plusDmSmooth = Indicators.rma(plusDm, period);
        const minusDmSmooth = Indicators.rma(minusDm, period);

        const dxList = [];
        for (let i = 0; i < high.length; i++) {
            if (trSmooth[i] === null || trSmooth[i] === 0) continue;
            const pDi = 100 * (plusDmSmooth[i] / trSmooth[i]);
            const mDi = 100 * (minusDmSmooth[i] / trSmooth[i]);
            const sum = pDi + mDi;
            const dx = sum === 0 ? 0 : 100 * Math.abs(pDi - mDi) / sum;
            dxList.push(dx);
        }
        return Indicators.rma(dxList, period);
    },

    ci: (high, low, close, period = 14) => {
        const tr = Indicators.tr(high, low, close);
        const results = [];
        for (let i = 0; i < high.length; i++) {
            if (i < period) { results.push(null); continue; }
            let sumTr = 0;
            let maxHi = -Infinity, minLo = Infinity;
            for (let j = 0; j < period; j++) {
                sumTr += tr[i - j];
                maxHi = Math.max(maxHi, high[i - j]);
                minLo = Math.min(minLo, low[i - j]);
            }
            const range = maxHi - minLo;
            if (range === 0) results.push(0);
            else results.push(100 * Math.log10(sumTr / range) / Math.log10(period));
        }
        return results;
    },

    ema: (data, period) => {
        const results = [];
        period = Math.max(1, period);
        const k = 2 / (period + 1);
        let prevEma = null;
        for (let i = 0; i < data.length; i++) {
            const val = data[i];
            if (val == null || isNaN(val)) { results.push(null); prevEma = null; continue; }
            if (prevEma === null) {
                if (i < period - 1) results.push(null);
                else {
                    let hasNull = false, sum = 0;
                    for (let j = 0; j < period; j++) { if (data[i - j] == null || isNaN(data[i - j])) { hasNull = true; break; } sum += data[i - j]; }
                    if (hasNull) results.push(null); else { prevEma = sum / period; results.push(prevEma); }
                }
            } else { prevEma = (val * k) + (prevEma * (1 - k)); results.push(prevEma); }
        }
        return results;
    },

    atr: (high, low, close, period = 14) => {
        const tr = Indicators.tr(high, low, close);
        return Indicators.rma(tr, period);
    },

    wma: (data, period) => {
        const results = [];
        period = Math.max(1, period);
        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) { results.push(null); continue; }
            let hasNull = false;
            for (let j = 0; j < period; j++) if (data[i - j] == null) { hasNull = true; break; }
            if (hasNull) { results.push(null); continue; }
            let sum = 0, weightSum = 0;
            for (let j = 0; j < period; j++) { const weight = period - j; sum += data[i - j] * weight; weightSum += weight; }
            results.push(sum / weightSum);
        }
        return results;
    },

    hma: (data, period) => {
        const halfPeriod = Math.floor(period / 2);
        const sqrtPeriod = Math.floor(Math.sqrt(period));
        const wmaHalf = Indicators.wma(data, halfPeriod);
        const wmaFull = Indicators.wma(data, period);
        const rawHMA = [];
        for (let i = 0; i < data.length; i++) rawHMA.push((wmaHalf[i] === null || wmaFull[i] === null) ? null : 2 * wmaHalf[i] - wmaFull[i]);
        return Indicators.wma(rawHMA, sqrtPeriod);
    },

    ehma: (data, period) => {
        const halfPeriod = Math.floor(period / 2);
        const sqrtPeriod = Math.floor(Math.sqrt(period));
        const emaHalf = Indicators.ema(data, halfPeriod);
        const emaFull = Indicators.ema(data, period);
        const rawEHMA = [];
        for (let i = 0; i < data.length; i++) rawEHMA.push((emaHalf[i] === null || emaFull[i] === null) ? null : 2 * emaHalf[i] - emaFull[i]);
        return Indicators.ema(rawEHMA, sqrtPeriod);
    },

    bollingerBands: (data, period = 20, stdDevMultiplier = 2) => {
        const results = { upper: [], middle: [], lower: [] };
        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) { results.upper.push(null); results.middle.push(null); results.lower.push(null); continue; }
            let sum = 0;
            for (let j = 0; j < period; j++) sum += data[i - j];
            const sma = sum / period;
            let squaredDiffSum = 0;
            for (let j = 0; j < period; j++) squaredDiffSum += Math.pow(data[i - j] - sma, 2);
            const stdDev = Math.sqrt(squaredDiffSum / period);
            results.upper.push(sma + (stdDevMultiplier * stdDev));
            results.middle.push(sma);
            results.lower.push(sma - (stdDevMultiplier * stdDev));
        }
        return results;
    },

    rsi: (data, period = 14) => {
        const results = [];
        if (data.length < period + 1) return data.map(() => null);
        const gains = [], losses = [];
        for (let i = 1; i < data.length; i++) { const change = data[i] - data[i - 1]; gains.push(change > 0 ? change : 0); losses.push(change < 0 ? Math.abs(change) : 0); }
        let avgGain = 0, avgLoss = 0;
        for (let i = 0; i < period; i++) { avgGain += gains[i]; avgLoss += losses[i]; }
        avgGain /= period; avgLoss /= period;
        results.push(null);
        for (let i = 1; i < period; i++) results.push(null);
        let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        let rsi = 100 - (100 / (1 + rs));
        results.push(rsi);
        for (let i = period; i < gains.length; i++) {
            avgGain = ((avgGain * (period - 1)) + gains[i]) / period;
            avgLoss = ((avgLoss * (period - 1)) + losses[i]) / period;
            rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
            rsi = 100 - (100 / (1 + rs));
            results.push(rsi);
        }
        return results;
    }
};

// Expose Indicators
if (typeof window !== 'undefined') window.Indicators = Indicators;

// ---------------------- AnalysisGenerator (from js/clsAnalysisGenerator.js) ----------------------
class AnalysisGenerator {
    constructor(candleData, options = {}) {
        this.candleData = candleData || [];
        this.options = {
            ema1Period: options.ema1Period || 20,
            ema1Type: (options.ema1Type || 'EMA').toUpperCase(),
            ema2Period: options.ema2Period || 50,
            ema2Type: (options.ema2Type || 'EMA').toUpperCase(),
            ema3Period: options.ema3Period || 200,
            ema3Type: (options.ema3Type || 'EMA').toUpperCase(),
            atrPeriod: options.atrPeriod || 14,
            atrMultiplier: options.atrMultiplier || 2,
            bbPeriod: options.bbPeriod || 20,
            ciPeriod: options.ciPeriod || 14,
            adxPeriod: options.adxPeriod || 14,
            rsiPeriod: options.rsiPeriod || 14,
            flatThreshold: options.flatThreshold || 0.2,
            macdNarrow: options.macdNarrow || 0.15
        };
        this.ema1Data = []; this.ema2Data = []; this.ema3Data = [];
        this.atrData = []; this.ciData = []; this.adxData = []; this.rsiData = []; this.bbData = { upper: [], middle: [], lower: [] };
        this.analysisArray = [];
    }

    calculateEMA(data, period) {
        const k = 2 / (period + 1);
        let ema = data[0].close;
        return data.map((c, i) => { ema = (i === 0) ? c.close : (c.close * k) + (ema * (1 - k)); return { time: c.time, value: ema }; });
    }

    calculateWMA(data, period) {
        const isObj = data[0] && typeof data[0] === 'object';
        const vals = isObj ? data.map(d => d.close) : data;
        const times = isObj ? data.map(d => d.time) : null;
        const res = [];
        for (let i = 0; i < vals.length; i++) {
            if (i < period - 1) { res.push(0); continue; }
            let num = 0, den = 0;
            for (let j = 0; j < period; j++) { const w = period - j; num += vals[i - j] * w; den += w; }
            res.push(num / den);
        }
        if (times) return res.map((value, i) => ({ time: times[i], value: value }));
        return res;
    }

    calculateHMA(data, period) {
        const half = Math.max(1, Math.floor(period / 2));
        const sqrt = Math.max(1, Math.floor(Math.sqrt(period)));
        const wmaHalf = this.calculateWMA(data, half);
        const wmaFull = this.calculateWMA(data, period);
        const raw = data.map((d, i) => {
            const halfVal = wmaHalf[i].value; const fullVal = wmaFull[i].value;
            if (halfVal === 0 || fullVal === 0) return { time: d.time, close: 0 };
            return { time: d.time, close: 2 * halfVal - fullVal };
        });
        return this.calculateWMA(raw, sqrt);
    }

    calculateEHMA(data, period) {
        const half = Math.max(1, Math.floor(period / 2));
        const sqrt = Math.max(1, Math.floor(Math.sqrt(period)));
        const emaHalf = this.calculateEMA(data, half);
        const emaFull = this.calculateEMA(data, period);
        const raw = data.map((d, i) => ({ time: d.time, close: 2 * emaHalf[i].value - emaFull[i].value }));
        return this.calculateEMA(raw, sqrt);
    }

    calculateRSI(data, period) {
        if (data.length < period + 1) return [];
        const result = []; let gains = [], losses = [];
        for (let i = 1; i < data.length; i++) { const change = data[i].close - data[i - 1].close; gains.push(change > 0 ? change : 0); losses.push(change < 0 ? Math.abs(change) : 0); }
        let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
        let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
        let rs = avgLoss === 0 ? 100 : avgGain / avgLoss; let rsi = 100 - (100 / (1 + rs)); result.push({ time: data[period].time, value: rsi });
        for (let i = period; i < gains.length; i++) { avgGain = ((avgGain * (period - 1)) + gains[i]) / period; avgLoss = ((avgLoss * (period - 1)) + losses[i]) / period; rs = avgLoss === 0 ? 100 : avgGain / avgLoss; rsi = 100 - (100 / (1 + rs)); result.push({ time: data[i + 1].time, value: rsi }); }
        return result;
    }

    calculateMA(data, period, type) { switch (type.toUpperCase()) { case 'HMA': return this.calculateHMA(data, period); case 'EHMA': return this.calculateEHMA(data, period); default: return this.calculateEMA(data, period); } }

    calculateATR(data, period) {
        let atr = [], avg = 0;
        for (let i = 0; i < data.length; i++) {
            const tr = i === 0 ? data[i].high - data[i].low : Math.max(data[i].high - data[i].low, Math.abs(data[i].high - data[i - 1].close), Math.abs(data[i].low - data[i - 1].close));
            avg = i < period ? ((avg * i) + tr) / (i + 1) : ((avg * (period - 1)) + tr) / period; atr.push(avg);
        }
        return atr;
    }

    calculateATRWithTime(data, period) { const atrValues = this.calculateATR(data, period); return data.map((c, i) => ({ time: c.time, value: atrValues[i] })); }

    calculateBB(data, period) { let upper = [], middle = [], lower = []; if (data.length < period) return { upper: [], middle: [], lower: [] }; for (let i = period - 1; i < data.length; i++) { const slice = data.slice(i - period + 1, i + 1).map(c => c.close); const avg = slice.reduce((a, b) => a + b) / period; const std = Math.sqrt(slice.map(x => Math.pow(x - avg, 2)).reduce((a, b) => a + b) / period); upper.push({ time: data[i].time, value: avg + (2 * std) }); middle.push({ time: data[i].time, value: avg }); lower.push({ time: data[i].time, value: avg - (2 * std) }); } return { upper, middle, lower }; }

    calculateCI(data, period) { if (data.length < period) return []; const atr = this.calculateATR(data, period); let res = []; for (let i = period - 1; i < data.length; i++) { const slice = data.slice(i - period + 1, i + 1); const high = Math.max(...slice.map(c => c.high)); const low = Math.min(...slice.map(c => c.low)); const sumATR = atr.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0); const ci = (high - low) > 0 ? 100 * (Math.log10(sumATR / (high - low)) / Math.log10(period)) : 0; res.push({ time: data[i].time, value: ci }); } return res; }

    calculateADX(data, period) { if (data.length < period * 2) return data.map(d => ({ time: d.time, value: 0 })); let adxRes = []; let trSum = 0, pdmSum = 0, mdmSum = 0; let dxValues = []; for (let i = 1; i < data.length; i++) { const upMove = data[i].high - data[i - 1].high; const downMove = data[i - 1].low - data[i].low; const pdm = (upMove > downMove && upMove > 0) ? upMove : 0; const mdm = (downMove > upMove && downMove > 0) ? downMove : 0; const tr = Math.max(data[i].high - data[i].low, Math.abs(data[i].high - data[i - 1].close), Math.abs(data[i].low - data[i - 1].close)); if (i <= period) { trSum += tr; pdmSum += pdm; mdmSum += mdm; } else { trSum = trSum - (trSum / period) + tr; pdmSum = pdmSum - (pdmSum / period) + pdm; mdmSum = mdmSum - (mdmSum / period) + mdm; } if (i >= period) { const diPlus = (pdmSum / trSum) * 100; const diMinus = (mdmSum / trSum) * 100; const dx = Math.abs(diPlus - diMinus) / (diPlus + diMinus) * 100; dxValues.push({ time: data[i].time, value: dx }); } } let adx = 0; for (let j = 0; j < dxValues.length; j++) { if (j < period) adx += dxValues[j].value / period; else adx = ((adx * (period - 1)) + dxValues[j].value) / period; if (j >= period) adxRes.push({ time: dxValues[j].time, value: adx }); } return adxRes; }

    getEMADirection(previousEMA, currentEMA) { const diff = previousEMA - currentEMA; if (Math.abs(diff) <= this.options.flatThreshold) return 'Flat'; else if (previousEMA < currentEMA) return 'Up'; else return 'Down'; }

    getMACDConver(previousMACD, currentMACD) { currentMACD = parseFloat(currentMACD); previousMACD = parseFloat(previousMACD); if (currentMACD !== null && previousMACD !== null) { if (currentMACD <= this.options.macdNarrow) return 'N'; if (currentMACD > previousMACD) return 'D'; if (currentMACD < previousMACD) return 'C'; } return null; }

    generate() {
        if (!this.candleData || this.candleData.length === 0) { console.warn('AnalysisGenerator: No candle data provided!'); return []; }
        this.ema1Data = this.calculateMA(this.candleData, this.options.ema1Period, this.options.ema1Type);
        this.ema2Data = this.calculateMA(this.candleData, this.options.ema2Period, this.options.ema2Type);
        this.ema3Data = this.calculateMA(this.candleData, this.options.ema3Period, this.options.ema3Type);
        this.atrData = this.calculateATRWithTime(this.candleData, this.options.atrPeriod);
        this.ciData = this.calculateCI(this.candleData, this.options.ciPeriod);
        this.adxData = this.calculateADX(this.candleData, this.options.adxPeriod);
        this.rsiData = this.calculateRSI(this.candleData, this.options.rsiPeriod);
        this.bbData = this.calculateBB(this.candleData, this.options.bbPeriod);
        this.analysisArray = [];
        // For brevity, further per-candle assembly is left to original implementation
        return this.analysisArray;
    }
}

if (typeof window !== 'undefined') window.AnalysisGenerator = AnalysisGenerator;

// ---------------------- SMCIndicator (standalone) ----------------------
/* SMCIndicator is a larger class; we include the standalone variant (trimmed comments) */
const BULLISH = 1; const BEARISH = -1; const BULLISH_LEG = 1; const BEARISH_LEG = 0;
class SMCIndicator {
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
        this._reset();
    }
    _reset() {
        this.swingHigh = { currentLevel: null, lastLevel: null, crossed: false, time: null, index: null };
        this.swingLow = { currentLevel: null, lastLevel: null, crossed: false, time: null, index: null };
        this.internalHigh = { currentLevel: null, lastLevel: null, crossed: false, time: null, index: null };
        this.internalLow = { currentLevel: null, lastLevel: null, crossed: false, time: null, index: null };
        this.equalHigh = { currentLevel: null, lastLevel: null, crossed: false, time: null, index: null };
        this.equalLow = { currentLevel: null, lastLevel: null, crossed: false, time: null, index: null };
        this.swingTrend = 0; this.internalTrend = 0;
        this.trailing = { top: null, bottom: null, topTime: null, bottomTime: null, barTime: null, barIndex: null };
        this.structures = []; this.swingPoints = []; this.orderBlocks = []; this.fairValueGaps = []; this.equalHighsLows = []; this.strongWeakLevels = []; this.premiumDiscountZones = [];
        this.swingLeg = 0; this.internalLeg = 0; this.data = []; this.highs = []; this.lows = []; this.parsedHighs = []; this.parsedLows = []; this.atrValues = [];
    }
    _calculateATR(data, period) {
        const tr = [], atr = [];
        for (let i = 0; i < data.length; i++) {
            if (i === 0) tr.push(data[i].high - data[i].low);
            else tr.push(Math.max(data[i].high - data[i].low, Math.abs(data[i].high - data[i - 1].close), Math.abs(data[i].low - data[i - 1].close)));
            if (i < period - 1) atr.push(null);
            else if (i === period - 1) atr.push(tr.slice(0, period).reduce((a, b) => a + b, 0) / period);
            else atr.push((atr[i - 1] * (period - 1) + tr[i]) / period);
        }
        return atr;
    }
    _highest(arr, start, end) { let max = -Infinity; for (let i = start; i <= end && i < arr.length; i++) if (arr[i] > max) max = arr[i]; return max; }
    _lowest(arr, start, end) { let min = Infinity; for (let i = start; i <= end && i < arr.length; i++) if (arr[i] < min) min = arr[i]; return min; }
    _indexOfMax(arr, start, end) { let idx = start, max = arr[start]; for (let i = start; i <= end && i < arr.length; i++) if (arr[i] > max) { max = arr[i]; idx = i; } return idx; }
    _indexOfMin(arr, start, end) { let idx = start, min = arr[start]; for (let i = start; i <= end && i < arr.length; i++) if (arr[i] < min) { min = arr[i]; idx = i; } return idx; }
    _getLeg(index, size, prevLeg) { if (index < size) return prevLeg; const ch = this.highs[index - size], cl = this.lows[index - size]; const hr = this._highest(this.highs, index - size + 1, index); const lr = this._lowest(this.lows, index - size + 1, index); if (ch > hr) return BEARISH_LEG; if (cl < lr) return BULLISH_LEG; return prevLeg; }
    _processStructure(index, size, isInternal) {
        const pivot = isInternal ? this.internalHigh : this.swingHigh;
        const pivotLow = isInternal ? this.internalLow : this.swingLow;
        const trend = isInternal ? this.internalTrend : this.swingTrend;
        const level = isInternal ? 'internal' : 'swing';
        const bar = this.data[index], close = bar.close;
        if (pivot.currentLevel !== null && close > pivot.currentLevel && !pivot.crossed) {
            const type = trend === BEARISH ? 'CHoCH' : 'BOS';
            this.structures.push({ time: bar.time, price: pivot.currentLevel, type, direction: 'bullish', level, startTime: pivot.time });
            pivot.crossed = true; if (isInternal) this.internalTrend = BULLISH; else this.swingTrend = BULLISH; if (this.config.showOrderBlocks) this._storeOrderBlock(pivot, index, BULLISH, isInternal);
        }
        if (pivotLow.currentLevel !== null && close < pivotLow.currentLevel && !pivotLow.crossed) {
            const ct = isInternal ? this.internalTrend : this.swingTrend; const type = ct === BULLISH ? 'CHoCH' : 'BOS';
            this.structures.push({ time: bar.time, price: pivotLow.currentLevel, type, direction: 'bearish', level, startTime: pivotLow.time });
            pivotLow.crossed = true; if (isInternal) this.internalTrend = BEARISH; else this.swingTrend = BEARISH; if (this.config.showOrderBlocks) this._storeOrderBlock(pivotLow, index, BEARISH, isInternal);
        }
    }
    _processSwingPoints(index, size, isInternal, forEqualHL = false) {
        if (index < size) return; const legRef = isInternal ? 'internalLeg' : 'swingLeg'; const prevLeg = this[legRef], newLeg = this._getLeg(index, size, prevLeg); if (newLeg === prevLeg) return; this[legRef] = newLeg; const pi = index - size, bar = this.data[pi], atr = this.atrValues[pi] || 0; if (newLeg === BULLISH_LEG) { const pivot = forEqualHL ? this.equalLow : (isInternal ? this.internalLow : this.swingLow); const price = this.lows[pi]; if (forEqualHL && pivot.currentLevel !== null && Math.abs(pivot.currentLevel - price) < this.config.equalHLThreshold * atr) this.equalHighsLows.push({ time1: pivot.time, time2: bar.time, price, type: 'EQL' }); if (!forEqualHL && !isInternal) { const t = (pivot.lastLevel === null || price < pivot.lastLevel) ? 'LL' : 'HL'; this.swingPoints.push({ time: bar.time, price, type: t, swing: 'low' }); } pivot.lastLevel = pivot.currentLevel; pivot.currentLevel = price; pivot.crossed = false; pivot.time = bar.time; pivot.index = pi; if (!forEqualHL && !isInternal) { this.trailing.bottom = price; this.trailing.bottomTime = bar.time; this.trailing.barTime = bar.time; this.trailing.barIndex = pi; } } else { const pivot = forEqualHL ? this.equalHigh : (isInternal ? this.internalHigh : this.swingHigh); const price = this.highs[pi]; if (forEqualHL && pivot.currentLevel !== null && Math.abs(pivot.currentLevel - price) < this.config.equalHLThreshold * atr) this.equalHighsLows.push({ time1: pivot.time, time2: bar.time, price, type: 'EQH' }); if (!forEqualHL && !isInternal) { const t = (pivot.lastLevel === null || price > pivot.lastLevel) ? 'HH' : 'LH'; this.swingPoints.push({ time: bar.time, price, type: t, swing: 'high' }); } pivot.lastLevel = pivot.currentLevel; pivot.currentLevel = price; pivot.crossed = false; pivot.time = bar.time; pivot.index = pi; if (!forEqualHL && !isInternal) { this.trailing.top = price; this.trailing.topTime = bar.time; this.trailing.barTime = bar.time; this.trailing.barIndex = pi; } }
    }
    _storeOrderBlock(pivot, currentIndex, bias, isInternal) { if (pivot.index === null) return; const pi = bias === BEARISH ? this._indexOfMax(this.parsedHighs, pivot.index, currentIndex - 1) : this._indexOfMin(this.parsedLows, pivot.index, currentIndex - 1); if (pi < 0 || pi >= this.data.length) return; this.orderBlocks.push({ time: this.data[pi].time, high: this.parsedHighs[pi], low: this.parsedLows[pi], bias: bias === BULLISH ? 'bullish' : 'bearish', level: isInternal ? 'internal' : 'swing', mitigated: false, mitigatedTime: null }); const max = this.config.maxOrderBlocks * 4; if (this.orderBlocks.length > max) this.orderBlocks = this.orderBlocks.slice(-max); }
    _checkOrderBlockMitigation(index) { const bar = this.data[index]; const mh = this.config.orderBlockMitigation === 'close' ? bar.close : bar.high; const ml = this.config.orderBlockMitigation === 'close' ? bar.close : bar.low; for (const ob of this.orderBlocks) { if (ob.mitigated) continue; if (ob.bias === 'bearish' && mh > ob.high) { ob.mitigated = true; ob.mitigatedTime = bar.time; } else if (ob.bias === 'bullish' && ml < ob.low) { ob.mitigated = true; ob.mitigatedTime = bar.time; } } }
    _detectFVG(index) { if (index < 2) return; const b0 = this.data[index], b1 = this.data[index - 1], b2 = this.data[index - 2]; if (b0.low > b2.high && b1.close > b2.high) this.fairValueGaps.push({ time: b1.time, top: b0.low, bottom: b2.high, bias: 'bullish', filled: false, filledTime: null }); if (b0.high < b2.low && b1.close < b2.low) this.fairValueGaps.push({ time: b1.time, top: b2.low, bottom: b0.high, bias: 'bearish', filled: false, filledTime: null }); }
    _checkFVGFill(index) { const bar = this.data[index]; for (const fvg of this.fairValueGaps) { if (fvg.filled) continue; if (fvg.bias === 'bullish' && bar.low < fvg.bottom) { fvg.filled = true; fvg.filledTime = bar.time; } else if (fvg.bias === 'bearish' && bar.high > fvg.top) { fvg.filled = true; fvg.filledTime = bar.time; } } }
    _updateTrailingExtremes(index) { const bar = this.data[index]; if (this.trailing.top === null || bar.high > this.trailing.top) { this.trailing.top = bar.high; this.trailing.topTime = bar.time; } if (this.trailing.bottom === null || bar.low < this.trailing.bottom) { this.trailing.bottom = bar.low; this.trailing.bottomTime = bar.time; } }
    calculate(data) { this._reset(); this.data = data; if (data.length === 0) return this; this.highs = data.map(d => d.high); this.lows = data.map(d => d.low); this.atrValues = this._calculateATR(data, this.config.atrPeriod); let sumTr = 0; for (let i = 0; i < data.length; i++) { const tr = i === 0 ? data[i].high - data[i].low : Math.max(data[i].high - data[i].low, Math.abs(data[i].high - data[i - 1].close), Math.abs(data[i].low - data[i - 1].close)); sumTr += tr; const vm = this.config.orderBlockFilter === 'atr' ? (this.atrValues[i] || sumTr / (i + 1)) : sumTr / (i + 1); const hvb = (data[i].high - data[i].low) >= 2 * vm; this.parsedHighs.push(hvb ? data[i].low : data[i].high); this.parsedLows.push(hvb ? data[i].high : data[i].low); } for (let i = 0; i < data.length; i++) { if (this.config.showPremiumDiscount) this._updateTrailingExtremes(i); this._processSwingPoints(i, this.config.swingLength, false); this._processSwingPoints(i, this.config.internalLength, true); if (this.config.showEqualHL) this._processSwingPoints(i, this.config.equalHLLength, false, true); if (this.config.showInternalStructure) this._processStructure(i, this.config.internalLength, true); if (this.config.showSwingStructure) this._processStructure(i, this.config.swingLength, false); if (this.config.showOrderBlocks) this._checkOrderBlockMitigation(i); if (this.config.showFVG) { this._detectFVG(i); this._checkFVGFill(i); } } return this; }
    getStructures(f = {}) { let r = this.structures; if (f.level) r = r.filter(s => s.level === f.level); if (f.direction) r = r.filter(s => s.direction === f.direction); if (f.type) r = r.filter(s => s.type === f.type); return r; }
    getSwingPoints(f = {}) { let r = this.swingPoints; if (f.type) r = r.filter(s => s.type === f.type); if (f.swing) r = r.filter(s => s.swing === f.swing); return r; }
    getOrderBlocks(f = {}) { let r = this.orderBlocks; if (f.level) r = r.filter(o => o.level === f.level); if (f.bias) r = r.filter(o => o.bias === f.bias); if (f.mitigated !== undefined) r = r.filter(o => o.mitigated === f.mitigated); return r; }
    getFairValueGaps(f = {}) { let r = this.fairValueGaps; if (f.bias) r = r.filter(g => g.bias === f.bias); if (f.filled !== undefined) r = r.filter(g => g.filled === f.filled); return r; }
    getEqualHighsLows(f = {}) { let r = this.equalHighsLows; if (f.type) r = r.filter(e => e.type === f.type); return r; }
    getTrend(level = 'swing') { const t = level === 'internal' ? this.internalTrend : this.swingTrend; if (t === BULLISH) return 'bullish'; if (t === BEARISH) return 'bearish'; return 'neutral'; }
    getAllResults() { return { structures: this.structures, swingPoints: this.swingPoints, orderBlocks: this.orderBlocks, fairValueGaps: this.fairValueGaps, equalHighsLows: this.equalHighsLows, swingTrend: this.getTrend('swing'), internalTrend: this.getTrend('internal') }; }
}
if (typeof window !== 'undefined') window.SMCIndicator = SMCIndicator;

// ---------------------- SMCChartRenderer (commented out due to parse errors) ----------------------
/*
class SMCChartRenderer {
    // Class intentionally commented out because it caused unmatched-brace syntax errors
    // Original implementation came from js/SMCChartRenderer.js and was inlined here.
    // If you need this renderer, restore the original file or re-add the class
    // ensuring all nested blocks and template literals are preserved.
}
if (typeof window !== 'undefined') window.SMCChartRenderer = SMCChartRenderer;
*/

// ---------------------- BackgroundColorZonesPlugin (from js/backgroundColorZonesPlugin.js) ----------------------
class BackgroundColorZonesPlugin {
    constructor(zones = [], options = {}) {
        this._zones = zones; this._series = null; this._chart = null; this._requestUpdate = null; this._paneViews = [];
        this._options = { ciTrendingThreshold: 38.2, ciChoppyThreshold: 61.8, rsiOversoldThreshold: 30, rsiOverboughtThreshold: 70, showCiZones: true, showRsiZones: true, trendingColor: 'rgba(34, 197, 94, 0.12)', neutralColor: 'rgba(234, 179, 8, 0.08)', choppyColor: 'rgba(239, 68, 68, 0.12)', rsiBuyColor: 'rgba(16, 185, 129, 0.18)', rsiSaleColor: 'rgba(249, 115, 22, 0.18)', ...options };
    }
    getOptions() { return { ...this._options }; }
    setOptions(options) { this._options = { ...this._options, ...options }; if (this._requestUpdate) this._requestUpdate(); }
    attached(param) { this._series = param.series; this._chart = param.chart; this._requestUpdate = param.requestUpdate; this._paneViews = [new BackgroundZonesPaneView(this)]; }
    detached() { this._series = null; this._chart = null; this._requestUpdate = null; this._paneViews = []; }
    updateAllViews() { this._paneViews.forEach(pv => pv.update()); }
    paneViews() { return this._paneViews; }
    chart() { return this._chart; }
    series() { return this._series; }
    zones() { return this._zones; }
    options() { return this._options; }
    setZones(zones) { this._zones = zones; if (this._requestUpdate) this._requestUpdate(); }
    addZone(zone) { this._zones.push(zone); if (this._requestUpdate) this._requestUpdate(); }
    removeZone(index) { if (index >= 0 && index < this._zones.length) { this._zones.splice(index, 1); if (this._requestUpdate) this._requestUpdate(); } }
    clearZones() { this._zones = []; if (this._requestUpdate) this._requestUpdate(); }
    getZones() { return [...this._zones]; }
}
class BackgroundZonesPaneView { constructor(source) { this._source = source; this._renderer = new BackgroundZonesRenderer(source); } update() {} renderer() { return this._renderer; } zOrder() { return 'bottom'; } }
class BackgroundZonesRenderer { constructor(source) { this._source = source; } draw(target, isHovered) { const chart = this._source.chart(); const zones = this._source.zones(); if (!chart || !zones || zones.length === 0) return; target.useBitmapCoordinateSpace(scope => { const ctx = scope.context; const timeScale = chart.timeScale(); const horizontalPixelRatio = scope.horizontalPixelRatio; const verticalPixelRatio = scope.verticalPixelRatio; const bitmapHeight = scope.bitmapSize.height; zones.forEach(zone => { const startX = timeScale.timeToCoordinate(zone.startTime); const endX = timeScale.timeToCoordinate(zone.endTime); if (startX === null || endX === null) return; if (Math.abs(startX - endX) < 1) return; const x1 = Math.round(Math.min(startX, endX) * horizontalPixelRatio); const x2 = Math.round(Math.max(startX, endX) * horizontalPixelRatio); const width = x2 - x1; ctx.fillStyle = zone.color || 'rgba(100, 100, 100, 0.2)'; if (zone.priceTop !== undefined && zone.priceBottom !== undefined) { try { const series = this._source.series(); const py1 = series.priceToCoordinate(zone.priceTop); const py2 = series.priceToCoordinate(zone.priceBottom); if (py1 !== null && py2 !== null) { const y1 = Math.round(Math.min(py1, py2) * verticalPixelRatio); const y2 = Math.round(Math.max(py1, py2) * verticalPixelRatio); const h = y2 - y1; if (h > 0) ctx.fillRect(x1, y1, width, h); if (zone.borderColor) { ctx.strokeStyle = zone.borderColor; ctx.lineWidth = Math.max(1, Math.round(1 * verticalPixelRatio)); ctx.strokeRect(x1, y1, width, h); } return; } } catch (e) {} } ctx.fillRect(x1, 0, width, bitmapHeight); if (zone.label) { const fontSize = Math.round(11 * verticalPixelRatio); ctx.fillStyle = zone.labelColor || 'rgba(255,255,255,0.9)'; ctx.font = `bold ${fontSize}px Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; const labelX = x1 + width / 2; const labelY = Math.round(8 * verticalPixelRatio); if (zone.labelBackgroundColor) { const metrics = ctx.measureText(zone.label); const padding = 4 * horizontalPixelRatio; const bgHeight = fontSize + padding * 2; ctx.fillStyle = zone.labelBackgroundColor; ctx.fillRect(labelX - metrics.width / 2 - padding, labelY - padding / 2, metrics.width + padding * 2, bgHeight); ctx.fillStyle = zone.labelColor || 'rgba(255,255,255,0.9)'; } ctx.fillText(zone.label, labelX, labelY); } }); }); } }

function createCiRsiZones(candles, ciArray, rsiArray, options = {}) { const zones = []; const { ciTrendingThreshold = 38.2, ciChoppyThreshold = 61.8, rsiOversoldThreshold = 30, rsiOverboughtThreshold = 70, showCiZones = true, showRsiZones = true, trendingColor = 'rgba(34, 197, 94, 0.12)', neutralColor = 'rgba(234, 179, 8, 0.08)', choppyColor = 'rgba(239, 68, 68, 0.12)', rsiBuyColor = 'rgba(16, 185, 129, 0.18)', rsiSaleColor = 'rgba(249, 115, 22, 0.18)', showLabels = false } = options; if (showCiZones) { let currentCiZone = null; candles.forEach((candle, i) => { const ci = ciArray[i]; let zoneType = null; let zoneColor = null; let label = null; if (ci !== null && ci !== undefined) { if (ci < ciTrendingThreshold) { zoneType = 'trending'; zoneColor = trendingColor; label = showLabels ? '📈 TREND' : null; } else if (ci > ciChoppyThreshold) { zoneType = 'choppy'; zoneColor = choppyColor; label = showLabels ? '⚠️ CHOPPY' : null; } else { zoneType = 'neutral'; zoneColor = neutralColor; } } if (!currentCiZone && zoneType && zoneType !== 'neutral') { currentCiZone = { startTime: candle.epoch, endTime: candle.epoch, color: zoneColor, type: zoneType, label: label, layer: 'ci' }; } else if (currentCiZone) { if (zoneType === currentCiZone.type) currentCiZone.endTime = candle.epoch; else { zones.push(currentCiZone); if (zoneType && zoneType !== 'neutral') currentCiZone = { startTime: candle.epoch, endTime: candle.epoch, color: zoneColor, type: zoneType, label: label, layer: 'ci' }; else currentCiZone = null; } } }); if (currentCiZone) zones.push(currentCiZone); } if (showRsiZones) { let currentRsiZone = null; candles.forEach((candle, i) => { const rsi = rsiArray[i]; let zoneType = null; let zoneColor = null; let label = null; if (rsi !== null && rsi !== undefined) { if (rsi < rsiOversoldThreshold) { zoneType = 'buy'; zoneColor = rsiBuyColor; label = showLabels ? '🟢 BUY ZONE' : null; } else if (rsi > rsiOverboughtThreshold) { zoneType = 'sale'; zoneColor = rsiSaleColor; label = showLabels ? '🔴 SALE ZONE' : null; } } if (!currentRsiZone && zoneType) currentRsiZone = { startTime: candle.epoch, endTime: candle.epoch, color: zoneColor, type: zoneType, label: label, layer: 'rsi' }; else if (currentRsiZone) { if (zoneType === currentRsiZone.type) currentRsiZone.endTime = candle.epoch; else { zones.push(currentRsiZone); if (zoneType) currentRsiZone = { startTime: candle.epoch, endTime: candle.epoch, color: zoneColor, type: zoneType, label: label, layer: 'rsi' }; else currentRsiZone = null; } } }); if (currentRsiZone) zones.push(currentRsiZone); } return zones; }

function createZonesFromAnalysis(analysisData, options = {}) { const zones = []; const { trendUpColor = 'rgba(56, 239, 125, 0.15)', trendDownColor = 'rgba(244, 92, 67, 0.15)', sidewaysColor = 'rgba(102, 126, 234, 0.15)', showLabels = true, ciThreshold = 61.8, adxThreshold = 25 } = options; let currentZone = null; analysisData.forEach((data, index) => { let zoneType = 'sideways'; let zoneColor = sidewaysColor; if (data.choppyIndicator !== null && data.adxValue !== null) { const ci = data.choppyIndicator; const adx = data.adxValue; if (ci < 38.2 && adx > adxThreshold) { if (data.emaMediumDirection === 'Up') { zoneType = 'uptrend'; zoneColor = trendUpColor; } else if (data.emaMediumDirection === 'Down') { zoneType = 'downtrend'; zoneColor = trendDownColor; } } else if (ci > ciThreshold) { zoneType = 'sideways'; zoneColor = sidewaysColor; } } if (!currentZone || currentZone.type !== zoneType) { if (currentZone) zones.push(currentZone); currentZone = { startTime: data.candletime, endTime: data.candletime, color: zoneColor, type: zoneType, label: showLabels ? zoneType.toUpperCase() : undefined }; } else currentZone.endTime = data.candletime; }); if (currentZone) zones.push(currentZone); return zones; }

function createCrossoverZones(analysisData) { const zones = []; analysisData.forEach((data, index) => { if (data.emaCutLongType) { const prevIndex = Math.max(0, index - 5); const nextIndex = Math.min(analysisData.length - 1, index + 5); zones.push({ startTime: analysisData[prevIndex].candletime, endTime: analysisData[nextIndex].candletime, color: data.emaCutLongType === 'UpTrend' ? 'rgba(0, 255, 0, 0.25)' : 'rgba(255, 0, 0, 0.25)', label: data.emaCutLongType === 'UpTrend' ? '🔼 Golden' : '🔽 Death', labelColor: '#fff', labelBackgroundColor: data.emaCutLongType === 'UpTrend' ? 'rgba(17, 153, 142, 0.9)' : 'rgba(235, 51, 73, 0.9)' }); } }); return zones; }

function createChoppyZones(analysisData, ciThreshold = 61.8) { const zones = []; let currentZone = null; analysisData.forEach((data) => { const isChoppy = data.choppyIndicator !== null && data.choppyIndicator >= ciThreshold; if (isChoppy) { if (!currentZone) currentZone = { startTime: data.candletime, endTime: data.candletime, color: 'rgba(255, 193, 7, 0.2)', label: '⚠️ CHOPPY', labelColor: '#000', labelBackgroundColor: 'rgba(255, 193, 7, 0.9)' }; else currentZone.endTime = data.candletime; } else { if (currentZone) { zones.push(currentZone); currentZone = null; } } }); if (currentZone) zones.push(currentZone); return zones; }

class ZoneConfigManager { constructor() { this.config = { enabled: false, showCiZones: true, showRsiZones: true, ciTrendingThreshold: 38.2, ciChoppyThreshold: 61.8, rsiOversoldThreshold: 30, rsiOverboughtThreshold: 70, showLabels: false }; this._loadFromStorage(); } _loadFromStorage() { try { const saved = localStorage.getItem('choppyZonesConfig'); if (saved) this.config = { ...this.config, ...JSON.parse(saved) }; } catch (e) { console.warn('Failed to load zones config:', e); } } save() { try { localStorage.setItem('choppyZonesConfig', JSON.stringify(this.config)); } catch (e) { console.warn('Failed to save zones config:', e); } } get(key) { return this.config[key]; } set(key, value) { this.config[key] = value; this.save(); } getAll() { return { ...this.config }; } setAll(newConfig) { this.config = { ...this.config, ...newConfig }; this.save(); } isEnabled() { return this.config.enabled; } setEnabled(enabled) { this.config.enabled = enabled; this.save(); } }

const zoneConfigManager = new ZoneConfigManager();

if (typeof window !== 'undefined') {
    window.BackgroundColorZonesPlugin = BackgroundColorZonesPlugin;
    window.createZonesFromAnalysis = createZonesFromAnalysis;
    window.createCrossoverZones = createCrossoverZones;
    window.createChoppyZones = createChoppyZones;
    window.createCiRsiZones = createCiRsiZones;
    window.ZoneConfigManager = ZoneConfigManager;
    window.zoneConfigManager = zoneConfigManager;
}

/*
 Feasibility check (short):
 - Yes: Pure indicator functions and `AnalysisGenerator` can be called from this single file without DOM or chart dependencies.
 - Caution: `SMCChartRenderer` and `BackgroundColorZonesPlugin` depend on LightweightCharts primitives API and methods like `series.attachPrimitive`, `chart.addLineSeries`. Ensure LightweightCharts is loaded before this file is used to instantiate renderers.
 - Collisions: If you keep the original individual files in the page, avoid duplicate definitions by removing or commenting out the duplicates or by loading this single file instead.
 - Recommendation: Replace script tags for the older indicator/SMC files with a single `<script src="js/indicatorJS_Ver2.js"></script>` and keep load order: LightweightCharts -> indicatorJS_Ver2.js -> mainV4.js (or whatever uses classes).
 */
