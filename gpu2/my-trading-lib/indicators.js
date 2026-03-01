/**
 * Indicator Math Library
/**
 * ============================================================
 * Indicator Math Library Summary

 * ============================================================
  1. sma(data, period)
      * - Parameter: data (Array), period (Number)
      * - Return: Array (Simple Moving Average values)
  2. rma(data, period)
      * - Parameter: data (Array), period (Number)
      * - Return: Array (Wilder's Smoothing/Relative Moving Average values)
  3. ema(data, period)
      * - Parameter: data (Array), period (Number)
      * - Return: Array (Exponential Moving Average values)
  4. wma(data, period)
      * - Parameter: data (Array), period (Number)
      * - Return: Array (Weighted Moving Average values)
  5. hma(data, period)
      * - Parameter: data (Array), period (Number)
      * - Return: Array (Hull Moving Average values)
  6. ehma(data, period)
      * - Parameter: data (Array), period (Number)
      * - Return: Array (Exponential Hull Moving Average values)

  7. tr(high, low, close)
      ใช้ TR: เมื่อคุณต้องการทราบว่าแท่งเทียนปัจจุบันมีขนาด "ใหญ่ผิดปกติ" หรือไม่ เมื่อเทียบกับแท่งก่อนหน้าโดยตรง
      * - Parameter: high (Array), low (Array), close (Array)
      * - Return: Array (True Range values)
  8. adx(high, low, close, period = 14)
      * - Parameter: high, low, close (Arrays), period (Number)
      * - Return: Array (Average Directional Index values)
  9. ci(high, low, close, period = 14)
      * - Parameter: high, low, close (Arrays), period (Number)
      * - Return: Array (Choppiness Index values)

  10. atr(high, low, close, period = 14)
      * - Parameter: high, low, close (Arrays), period (Number)
      * - Return: Array (Average True Range values)

  11. bollingerBands(data, period = 20, stdDevMultiplier = 2)
      * - Parameter: data (Array), period (Number), stdDevMultiplier (Number)
      * - Return: Object { upper: Array, middle: Array, lower: Array }
  12. rsi(data, period = 14)
      * - Parameter: data (Array), period (Number)
      * - Return: Array (Relative Strength Index values)
 * ============================================================

 */




const Indicators = {
    /**
     * Calculate Simple Moving Average
     */
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

    /**
     * Calculate Wilder's Smoothing (RMA)
     * RMA element 1 = SMA
     * RMA element x = (Prior RMA * (n-1) + Current) / n
     */
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
                // Initial SMA
                if (i < period - 1) {
                    results.push(null);
                } else {
                    let sum = 0;
                    for (let j = 0; j < period; j++) {
                        sum += data[i - j];
                    }
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

    /**
     * Calculate True Range
     */
    tr: (high, low, close) => {
        const tr = [];
        for (let i = 0; i < high.length; i++) {
            if (i === 0) {
                tr.push(high[i] - low[i]);
            } else {
                const h = high[i];
                const l = low[i];
                const pc = close[i - 1];
                tr.push(Math.max(
                    h - l,
                    Math.abs(h - pc),
                    Math.abs(l - pc)
                ));
            }
        }
        return tr;
    },

    /**
     * Calculate ADX
     */
    adx: (high, low, close, period = 14) => {
        const tr = Indicators.tr(high, low, close);
        const plusDm = [];
        const minusDm = [];

        for (let i = 0; i < high.length; i++) {
            if (i === 0) {
                plusDm.push(0);
                minusDm.push(0);
                continue;
            }
            const up = high[i] - high[i - 1];
            const down = low[i - 1] - low[i];

            if (up > down && up > 0) {
                plusDm.push(up);
            } else {
                plusDm.push(0);
            }

            if (down > up && down > 0) {
                minusDm.push(down);
            } else {
                minusDm.push(0);
            }
        }

        const trSmooth = Indicators.rma(tr, period);
        const plusDmSmooth = Indicators.rma(plusDm, period);
        const minusDmSmooth = Indicators.rma(minusDm, period);

        const adxLine = [];
        const dxList = [];

        for (let i = 0; i < high.length; i++) {
            if (trSmooth[i] === null || trSmooth[i] === 0) {
                adxLine.push(null);
                continue;
            }

            const pDi = 100 * (plusDmSmooth[i] / trSmooth[i]);
            const mDi = 100 * (minusDmSmooth[i] / trSmooth[i]);

            const sum = pDi + mDi;
            const dx = sum === 0 ? 0 : 100 * Math.abs(pDi - mDi) / sum;
            dxList.push(dx);
        }

        // ADX is usually smoothed DX
        return Indicators.rma(dxList, period);
    },

    /**
     * Calculate Choppiness Index (CI)
     * 100 * LOG10( SUM(ATR(1), n) / ( MaxHi(n) - MinLo(n) ) ) / LOG10(n)
     */
    ci: (high, low, close, period = 14) => {
        const tr = Indicators.tr(high, low, close);
        const results = [];

        for (let i = 0; i < high.length; i++) {
            if (i < period) {
                results.push(null);
                continue;
            }

            // Sum TR for last n
            let sumTr = 0;
            let maxHi = -Infinity;
            let minLo = Infinity;

            for (let j = 0; j < period; j++) {
                sumTr += tr[i - j];
                maxHi = Math.max(maxHi, high[i - j]);
                minLo = Math.min(minLo, low[i - j]);
            }

            const range = maxHi - minLo;
            if (range === 0) {
                results.push(0); // Avoid div by zero
            } else {
                const ci = 100 * Math.log10(sumTr / range) / Math.log10(period);
                results.push(ci);
            }
        }
        return results;
    },
    /**
     * Calculate EMA
     * EMA = (Price * k) + (Previous EMA * (1 - k))
     * k = 2 / (period + 1)
     */
    ema: (data, period) => {
        const results = [];
        // Ensure period is at least 1
        period = Math.max(1, period);
        const k = 2 / (period + 1);
        let prevEma = null;

        for (let i = 0; i < data.length; i++) {
            const val = data[i];

            // Check for null/undefined/NaN
            if (val == null || isNaN(val)) {
                results.push(null);
                prevEma = null; // Reset EMA when encountering invalid value
                continue;
            }

            if (prevEma === null) {
                // Initialize with SMA - need to check all values in window
                if (i < period - 1) {
                    results.push(null);
                } else {
                    // Check if all values in window are valid
                    let hasNull = false;
                    let sum = 0;
                    for (let j = 0; j < period; j++) {
                        if (data[i - j] == null || isNaN(data[i - j])) {
                            hasNull = true;
                            break;
                        }
                        sum += data[i - j];
                    }

                    if (hasNull) {
                        results.push(null);
                    } else {
                        prevEma = sum / period;
                        results.push(prevEma);
                    }
                }
            } else {
                prevEma = (val * k) + (prevEma * (1 - k));
                results.push(prevEma);
            }
        }
        return results;
    },

    /**
     * Calculate ATR (Average True Range)
     * ATR = RMA of True Range
     */
    atr: (high, low, close, period = 14) => {
        const tr = Indicators.tr(high, low, close);
        return Indicators.rma(tr, period);
    },

    /**
     * Calculate WMA (Weighted Moving Average)
     * WMA gives more weight to recent data points
     */
    wma: (data, period) => {
        const results = [];
        // Ensure period is at least 1
        period = Math.max(1, period);

        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) {
                results.push(null);
                continue;
            }

            // Check if all values in the window are valid
            let hasNull = false;
            for (let j = 0; j < period; j++) {
                if (data[i - j] == null) {
                    hasNull = true;
                    break;
                }
            }

            if (hasNull) {
                results.push(null);
                continue;
            }

            let sum = 0;
            let weightSum = 0;
            for (let j = 0; j < period; j++) {
                const weight = period - j;
                sum += data[i - j] * weight;
                weightSum += weight;
            }
            results.push(sum / weightSum);
        }
        return results;
    },

    /**
     * Calculate HMA (Hull Moving Average)
     * HMA = WMA(2 * WMA(n/2) - WMA(n), sqrt(n))
     * Provides a faster, smoother moving average
     */
    hma: (data, period) => {
        const halfPeriod = Math.floor(period / 2);
        const sqrtPeriod = Math.floor(Math.sqrt(period));

        // WMA of half period
        const wmaHalf = Indicators.wma(data, halfPeriod);

        // WMA of full period
        const wmaFull = Indicators.wma(data, period);

        // Calculate 2 * WMA(n/2) - WMA(n)
        const rawHMA = [];
        for (let i = 0; i < data.length; i++) {
            if (wmaHalf[i] === null || wmaFull[i] === null) {
                rawHMA.push(null);
            } else {
                rawHMA.push(2 * wmaHalf[i] - wmaFull[i]);
            }
        }

        // Final HMA = WMA of rawHMA with sqrt(n) period
        return Indicators.wma(rawHMA, sqrtPeriod);
    },

    /**
     * Calculate EHMA (Exponential Hull Moving Average)
     * EHMA = EMA(2 * EMA(n/2) - EMA(n), sqrt(n))
     * Uses EMA instead of WMA for even more responsiveness
     */
    ehma: (data, period) => {
        const halfPeriod = Math.floor(period / 2);
        const sqrtPeriod = Math.floor(Math.sqrt(period));

        // EMA of half period
        const emaHalf = Indicators.ema(data, halfPeriod);

        // EMA of full period
        const emaFull = Indicators.ema(data, period);

        // Calculate 2 * EMA(n/2) - EMA(n)
        const rawEHMA = [];
        for (let i = 0; i < data.length; i++) {
            if (emaHalf[i] === null || emaFull[i] === null) {
                rawEHMA.push(null);
            } else {
                rawEHMA.push(2 * emaHalf[i] - emaFull[i]);
            }
        }

        // Final EHMA = EMA of rawEHMA with sqrt(n) period
        return Indicators.ema(rawEHMA, sqrtPeriod);
    },

    /**
     * Calculate Bollinger Bands
     * Returns { upper, middle, lower } arrays
     */
    bollingerBands: (data, period = 20, stdDevMultiplier = 2) => {
        const results = {
            upper: [],
            middle: [],
            lower: []
        };

        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) {
                results.upper.push(null);
                results.middle.push(null);
                results.lower.push(null);
                continue;
            }

            // Calculate SMA (middle band)
            let sum = 0;
            for (let j = 0; j < period; j++) {
                sum += data[i - j];
            }
            const sma = sum / period;

            // Calculate Standard Deviation
            let squaredDiffSum = 0;
            for (let j = 0; j < period; j++) {
                squaredDiffSum += Math.pow(data[i - j] - sma, 2);
            }
            const stdDev = Math.sqrt(squaredDiffSum / period);

            results.upper.push(sma + (stdDevMultiplier * stdDev));
            results.middle.push(sma);
            results.lower.push(sma - (stdDevMultiplier * stdDev));
        }

        return results;
    },

    /**
     * Calculate RSI (Relative Strength Index)
     * RSI = 100 - (100 / (1 + RS))
     * RS = Average Gain / Average Loss over period
     */
    rsi: (data, period = 14) => {
        const results = [];

        if (data.length < period + 1) {
            return data.map(() => null);
        }

        // Calculate gains and losses
        const gains = [];
        const losses = [];

        for (let i = 1; i < data.length; i++) {
            const change = data[i] - data[i - 1];
            gains.push(change > 0 ? change : 0);
            losses.push(change < 0 ? Math.abs(change) : 0);
        }

        // First RSI value using SMA
        let avgGain = 0;
        let avgLoss = 0;

        for (let i = 0; i < period; i++) {
            avgGain += gains[i];
            avgLoss += losses[i];
        }
        avgGain /= period;
        avgLoss /= period;

        // First valid RSI
        results.push(null); // Index 0 has no prior value
        for (let i = 1; i < period; i++) {
            results.push(null);
        }

        let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        let rsi = 100 - (100 / (1 + rs));
        results.push(rsi);

        // Subsequent RSI values using smoothed averages
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
