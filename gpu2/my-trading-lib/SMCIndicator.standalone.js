/**
 * SMCIndicator Standalone Version
 * For use without ES6 modules
 */
const BULLISH = 1;
const BEARISH = -1;
const BULLISH_LEG = 1;
const BEARISH_LEG = 0;

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
        this.swingTrend = 0;
        this.internalTrend = 0;
        this.trailing = { top: null, bottom: null, topTime: null, bottomTime: null, barTime: null, barIndex: null };
        this.structures = [];
        this.swingPoints = [];
        this.orderBlocks = [];
        this.fairValueGaps = [];
        this.equalHighsLows = [];
        this.strongWeakLevels = [];
        this.premiumDiscountZones = [];
        this.swingLeg = 0;
        this.internalLeg = 0;
        this.data = [];
        this.highs = [];
        this.lows = [];
        this.parsedHighs = [];
        this.parsedLows = [];
        this.atrValues = [];
    }

    _calculateATR(data, period) {
        const tr = [], atr = [];
        for (let i = 0; i < data.length; i++) {
            if (i === 0) tr.push(data[i].high - data[i].low);
            else {
                const hl = data[i].high - data[i].low;
                const hpc = Math.abs(data[i].high - data[i - 1].close);
                const lpc = Math.abs(data[i].low - data[i - 1].close);
                tr.push(Math.max(hl, hpc, lpc));
            }
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

    _getLeg(index, size, prevLeg) {
        if (index < size) return prevLeg;
        const ch = this.highs[index - size], cl = this.lows[index - size];
        const hr = this._highest(this.highs, index - size + 1, index);
        const lr = this._lowest(this.lows, index - size + 1, index);
        if (ch > hr) return BEARISH_LEG;
        if (cl < lr) return BULLISH_LEG;
        return prevLeg;
    }

    _processStructure(index, size, isInternal) {
        const pivot = isInternal ? this.internalHigh : this.swingHigh;
        const pivotLow = isInternal ? this.internalLow : this.swingLow;
        const trend = isInternal ? this.internalTrend : this.swingTrend;
        const level = isInternal ? 'internal' : 'swing';
        const bar = this.data[index], close = bar.close;

        if (pivot.currentLevel !== null && close > pivot.currentLevel && !pivot.crossed) {
            const type = trend === BEARISH ? 'CHoCH' : 'BOS';
            this.structures.push({ time: bar.time, price: pivot.currentLevel, type, direction: 'bullish', level, startTime: pivot.time });
            pivot.crossed = true;
            if (isInternal) this.internalTrend = BULLISH; else this.swingTrend = BULLISH;
            if (this.config.showOrderBlocks) this._storeOrderBlock(pivot, index, BULLISH, isInternal);
        }

        if (pivotLow.currentLevel !== null && close < pivotLow.currentLevel && !pivotLow.crossed) {
            const ct = isInternal ? this.internalTrend : this.swingTrend;
            const type = ct === BULLISH ? 'CHoCH' : 'BOS';
            this.structures.push({ time: bar.time, price: pivotLow.currentLevel, type, direction: 'bearish', level, startTime: pivotLow.time });
            pivotLow.crossed = true;
            if (isInternal) this.internalTrend = BEARISH; else this.swingTrend = BEARISH;
            if (this.config.showOrderBlocks) this._storeOrderBlock(pivotLow, index, BEARISH, isInternal);
        }
    }

    _processSwingPoints(index, size, isInternal, forEqualHL = false) {
        if (index < size) return;
        const legRef = isInternal ? 'internalLeg' : 'swingLeg';
        const prevLeg = this[legRef], newLeg = this._getLeg(index, size, prevLeg);
        if (newLeg === prevLeg) return;
        this[legRef] = newLeg;
        const pi = index - size, bar = this.data[pi], atr = this.atrValues[pi] || 0;

        if (newLeg === BULLISH_LEG) {
            const pivot = forEqualHL ? this.equalLow : (isInternal ? this.internalLow : this.swingLow);
            const price = this.lows[pi];
            if (forEqualHL && pivot.currentLevel !== null && Math.abs(pivot.currentLevel - price) < this.config.equalHLThreshold * atr)
                this.equalHighsLows.push({ time1: pivot.time, time2: bar.time, price, type: 'EQL' });
            if (!forEqualHL && !isInternal) {
                const t = (pivot.lastLevel === null || price < pivot.lastLevel) ? 'LL' : 'HL';
                this.swingPoints.push({ time: bar.time, price, type: t, swing: 'low' });
            }
            pivot.lastLevel = pivot.currentLevel; pivot.currentLevel = price; pivot.crossed = false; pivot.time = bar.time; pivot.index = pi;
            if (!forEqualHL && !isInternal) { this.trailing.bottom = price; this.trailing.bottomTime = bar.time; this.trailing.barTime = bar.time; this.trailing.barIndex = pi; }
        } else {
            const pivot = forEqualHL ? this.equalHigh : (isInternal ? this.internalHigh : this.swingHigh);
            const price = this.highs[pi];
            if (forEqualHL && pivot.currentLevel !== null && Math.abs(pivot.currentLevel - price) < this.config.equalHLThreshold * atr)
                this.equalHighsLows.push({ time1: pivot.time, time2: bar.time, price, type: 'EQH' });
            if (!forEqualHL && !isInternal) {
                const t = (pivot.lastLevel === null || price > pivot.lastLevel) ? 'HH' : 'LH';
                this.swingPoints.push({ time: bar.time, price, type: t, swing: 'high' });
            }
            pivot.lastLevel = pivot.currentLevel; pivot.currentLevel = price; pivot.crossed = false; pivot.time = bar.time; pivot.index = pi;
            if (!forEqualHL && !isInternal) { this.trailing.top = price; this.trailing.topTime = bar.time; this.trailing.barTime = bar.time; this.trailing.barIndex = pi; }
        }
    }

    _storeOrderBlock(pivot, currentIndex, bias, isInternal) {
        if (pivot.index === null) return;
        const pi = bias === BEARISH ? this._indexOfMax(this.parsedHighs, pivot.index, currentIndex - 1) : this._indexOfMin(this.parsedLows, pivot.index, currentIndex - 1);
        if (pi < 0 || pi >= this.data.length) return;
        this.orderBlocks.push({ time: this.data[pi].time, high: this.parsedHighs[pi], low: this.parsedLows[pi], bias: bias === BULLISH ? 'bullish' : 'bearish', level: isInternal ? 'internal' : 'swing', mitigated: false, mitigatedTime: null });
        const max = this.config.maxOrderBlocks * 4;
        if (this.orderBlocks.length > max) this.orderBlocks = this.orderBlocks.slice(-max);
    }

    _checkOrderBlockMitigation(index) {
        const bar = this.data[index];
        const mh = this.config.orderBlockMitigation === 'close' ? bar.close : bar.high;
        const ml = this.config.orderBlockMitigation === 'close' ? bar.close : bar.low;
        for (const ob of this.orderBlocks) {
            if (ob.mitigated) continue;
            if (ob.bias === 'bearish' && mh > ob.high) { ob.mitigated = true; ob.mitigatedTime = bar.time; }
            else if (ob.bias === 'bullish' && ml < ob.low) { ob.mitigated = true; ob.mitigatedTime = bar.time; }
        }
    }

    _detectFVG(index) {
        if (index < 2) return;
        const b0 = this.data[index], b1 = this.data[index - 1], b2 = this.data[index - 2];
        if (b0.low > b2.high && b1.close > b2.high) this.fairValueGaps.push({ time: b1.time, top: b0.low, bottom: b2.high, bias: 'bullish', filled: false, filledTime: null });
        if (b0.high < b2.low && b1.close < b2.low) this.fairValueGaps.push({ time: b1.time, top: b2.low, bottom: b0.high, bias: 'bearish', filled: false, filledTime: null });
    }

    _checkFVGFill(index) {
        const bar = this.data[index];
        for (const fvg of this.fairValueGaps) {
            if (fvg.filled) continue;
            if (fvg.bias === 'bullish' && bar.low < fvg.bottom) { fvg.filled = true; fvg.filledTime = bar.time; }
            else if (fvg.bias === 'bearish' && bar.high > fvg.top) { fvg.filled = true; fvg.filledTime = bar.time; }
        }
    }

    _updateTrailingExtremes(index) {
        const bar = this.data[index];
        if (this.trailing.top === null || bar.high > this.trailing.top) { this.trailing.top = bar.high; this.trailing.topTime = bar.time; }
        if (this.trailing.bottom === null || bar.low < this.trailing.bottom) { this.trailing.bottom = bar.low; this.trailing.bottomTime = bar.time; }
    }

    calculate(data) {
        this._reset();
        this.data = data;
        if (data.length === 0) return this;

        this.highs = data.map(d => d.high);
        this.lows = data.map(d => d.low);
        this.atrValues = this._calculateATR(data, this.config.atrPeriod);

        let sumTr = 0;
        for (let i = 0; i < data.length; i++) {
            const tr = i === 0 ? data[i].high - data[i].low : Math.max(data[i].high - data[i].low, Math.abs(data[i].high - data[i - 1].close), Math.abs(data[i].low - data[i - 1].close));
            sumTr += tr;
            const vm = this.config.orderBlockFilter === 'atr' ? (this.atrValues[i] || sumTr / (i + 1)) : sumTr / (i + 1);
            const hvb = (data[i].high - data[i].low) >= 2 * vm;
            this.parsedHighs.push(hvb ? data[i].low : data[i].high);
            this.parsedLows.push(hvb ? data[i].high : data[i].low);
        }

        for (let i = 0; i < data.length; i++) {
            if (this.config.showPremiumDiscount) this._updateTrailingExtremes(i);
            this._processSwingPoints(i, this.config.swingLength, false);
            this._processSwingPoints(i, this.config.internalLength, true);
            if (this.config.showEqualHL) this._processSwingPoints(i, this.config.equalHLLength, false, true);
            if (this.config.showInternalStructure) this._processStructure(i, this.config.internalLength, true);
            if (this.config.showSwingStructure) this._processStructure(i, this.config.swingLength, false);
            if (this.config.showOrderBlocks) this._checkOrderBlockMitigation(i);
            if (this.config.showFVG) { this._detectFVG(i); this._checkFVGFill(i); }
        }
        return this;
    }

    getStructures(f = {}) { let r = this.structures; if (f.level) r = r.filter(s => s.level === f.level); if (f.direction) r = r.filter(s => s.direction === f.direction); if (f.type) r = r.filter(s => s.type === f.type); return r; }
    getSwingPoints(f = {}) { let r = this.swingPoints; if (f.type) r = r.filter(s => s.type === f.type); if (f.swing) r = r.filter(s => s.swing === f.swing); return r; }
    getOrderBlocks(f = {}) { let r = this.orderBlocks; if (f.level) r = r.filter(o => o.level === f.level); if (f.bias) r = r.filter(o => o.bias === f.bias); if (f.mitigated !== undefined) r = r.filter(o => o.mitigated === f.mitigated); return r; }
    getFairValueGaps(f = {}) { let r = this.fairValueGaps; if (f.bias) r = r.filter(g => g.bias === f.bias); if (f.filled !== undefined) r = r.filter(g => g.filled === f.filled); return r; }
    getEqualHighsLows(f = {}) { let r = this.equalHighsLows; if (f.type) r = r.filter(e => e.type === f.type); return r; }
    getTrend(level = 'swing') { const t = level === 'internal' ? this.internalTrend : this.swingTrend; if (t === BULLISH) return 'bullish'; if (t === BEARISH) return 'bearish'; return 'neutral'; }
    getAllResults() { return { structures: this.structures, swingPoints: this.swingPoints, orderBlocks: this.orderBlocks, fairValueGaps: this.fairValueGaps, equalHighsLows: this.equalHighsLows, swingTrend: this.getTrend('swing'), internalTrend: this.getTrend('internal') }; }
}

window.SMCIndicator = SMCIndicator;
