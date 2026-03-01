class MovingAverages {
    static calculate(type, data, period) {
        if (!data || data.length === 0 || period <= 0) return [];
        
        switch (type.toLowerCase()) {
            case 'sma':
                return this.SMA(data, period);
            case 'ema':
                return this.EMA(data, period);
            case 'wma':
                return this.WMA(data, period);
            case 'hma':
                return this.HMA(data, period);
            case 'ehma':
                return this.EHMA(data, period);
            default:
                return this.EMA(data, period);
        }
    }

    static SMA(data, period) {
        const result = [];
        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) continue;
            let sum = 0;
            for (let j = 0; j < period; j++) {
                sum += data[i - j].close;
            }
            result.push({ time: data[i].time, value: sum / period });
        }
        return result;
    }

    static EMA(data, period) {
        const result = [];
        const k = 2 / (period + 1);
        
        let ema = data[0].close;
        result.push({ time: data[0].time, value: ema });
        
        for (let i = 1; i < data.length; i++) {
            ema = (data[i].close - ema) * k + ema;
            result.push({ time: data[i].time, value: ema });
        }
        return result;
    }

    static calcEMAArray(prices, period) {
        const result = new Array(prices.length).fill(null);
        if (prices.length === 0) return result;
        const k = 2 / (period + 1);
        let ema = prices[0];
        result[0] = ema;
        for (let i = 1; i < prices.length; i++) {
            ema = (prices[i] - ema) * k + ema;
            result[i] = ema;
        }
        return result;
    }
    
    static calcWMAArray(prices, period) {
        const result = new Array(prices.length).fill(null);
        if (period === 0) return result;
        const weightSum = (period * (period + 1)) / 2;
        for (let i = period - 1; i < prices.length; i++) {
            let sum = 0;
            for (let j = 0; j < period; j++) {
                sum += prices[i - j] * (period - j);
            }
            result[i] = sum / weightSum;
        }
        return result;
    }

    static WMA(data, period) {
        const prices = data.map(d => d.close);
        const wmaArray = this.calcWMAArray(prices, period);
        const result = [];
        for (let i = 0; i < data.length; i++) {
            if (wmaArray[i] !== null) {
                result.push({ time: data[i].time, value: wmaArray[i] });
            }
        }
        return result;
    }

    static HMA(data, period) {
        const halfPeriod = Math.floor(period / 2);
        const sqrtPeriod = Math.floor(Math.sqrt(period));
        const prices = data.map(d => d.close);
        
        const wma_half = this.calcWMAArray(prices, halfPeriod);
        const wma_full = this.calcWMAArray(prices, period);
        
        const diff = new Array(prices.length).fill(0);
        for (let i = 0; i < prices.length; i++) {
            if (wma_half[i] !== null && wma_full[i] !== null) {
                diff[i] = 2 * wma_half[i] - wma_full[i];
            } else if (wma_half[i] !== null) {
                diff[i] = wma_half[i];
            } else {
                diff[i] = prices[i];
            }
        }
        
        const hmaArray = this.calcWMAArray(diff, sqrtPeriod);
        const result = [];
        for (let i = 0; i < data.length; i++) {
            if (hmaArray[i] !== null && i >= period - 1) {
                result.push({ time: data[i].time, value: hmaArray[i] });
            }
        }
        return result;
    }

    static EHMA(data, period) {
        const halfPeriod = Math.floor(period / 2);
        const sqrtPeriod = Math.floor(Math.sqrt(period));
        const prices = data.map(d => d.close);
        
        const ema_half = this.calcEMAArray(prices, halfPeriod);
        const ema_full = this.calcEMAArray(prices, period);
        
        const diff = new Array(prices.length).fill(0);
        for (let i = 0; i < prices.length; i++) {
            diff[i] = 2 * ema_half[i] - ema_full[i];
        }
        
        const ehmaArray = this.calcEMAArray(diff, sqrtPeriod);
        const result = [];
        for (let i = 0; i < data.length; i++) {
            result.push({ time: data[i].time, value: ehmaArray[i] });
        }
        return result;
    }
}
