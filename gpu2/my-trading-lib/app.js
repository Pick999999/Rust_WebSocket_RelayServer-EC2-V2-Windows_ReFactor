/**
 * Main Application
 */
class TradingApp {
    constructor() {
        this.derivAPI = new DerivAPI('1089');
        this.indicators = new WebGPUIndicators();
        this.chartManager = new ChartManager();
        this.currentData = { candles: [], highs: [], lows: [], closes: [] };
        this.isLiveActive = false;

        // รอให้ GPU initialize ก่อน
        this.waitForGPU().then(() => {
            this.initialize();
        });
    }

    async waitForGPU() {
        // รอจนกว่า GPU จะพร้อม
        let attempts = 0;
        while (!this.indicators.gpu && attempts < 20) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        console.log('GPU Ready!');
    }

    async initialize() {
        this.updateGPUStatus();
        this.setupEventListeners();
        try {
            await this.derivAPI.connect();
        } catch (error) {
            this.showError('Failed to connect: ' + error.message);
        }
        this.derivAPI.onConnectionChange((connected) => {
            this.updateConnectionStatus(connected);
        });
    }

    updateGPUStatus() {
        const status = this.indicators.getGPUStatus();
        const statusEl = document.getElementById('gpuStatus');
        statusEl.textContent = status.displayText;
        statusEl.className = 'gpu-status ' + status.mode;
    }

    updateConnectionStatus(connected) {
        const statusEl = document.getElementById('connectionStatus');
        statusEl.textContent = connected ? 'Connected' : 'Disconnected';
        statusEl.className = 'connection-status ' + (connected ? 'connected' : 'disconnected');
    }

    setupEventListeners() {
        document.getElementById('loadHistoryBtn').addEventListener('click', () => this.loadHistory());
        document.getElementById('startLiveBtn').addEventListener('click', () => this.startLive());
        document.getElementById('stopLiveBtn').addEventListener('click', () => this.stopLive());
        document.getElementById('updateIndicatorsBtn').addEventListener('click', () => this.updateIndicators());
        document.getElementById('toggleMA1').addEventListener('change', (e) => this.toggleMA(0, e.target.checked));
        document.getElementById('toggleMA2').addEventListener('change', (e) => this.toggleMA(1, e.target.checked));
        document.getElementById('toggleMA3').addEventListener('change', (e) => this.toggleMA(2, e.target.checked));
    }

    async loadHistory() {
        const symbol = document.getElementById('symbolSelect').value;
        const granularity = parseInt(document.getElementById('timeframeSelect').value);
        this.showLoading('Loading history...');
        try {
            const candles = await this.derivAPI.getHistoricalCandles(symbol, granularity, 1000);
            this.currentData.candles = DerivAPI.formatCandles(candles);
            this.currentData.closes = this.currentData.candles.map(c => c.close);
            this.currentData.highs = this.currentData.candles.map(c => c.high);
            this.currentData.lows = this.currentData.candles.map(c => c.low);
            this.chartManager.updateCandles(this.currentData.candles);
            this.calculateAndUpdateIndicators();
            this.updateStats();
            this.clearError();
        } catch (error) {
            this.showError('Failed to load history: ' + error.message);
        }
    }

    calculateAndUpdateIndicators() {
        const maType = document.getElementById('maTypeSelect').value;
        const period1 = parseInt(document.getElementById('maPeriod1').value);
        const period2 = parseInt(document.getElementById('maPeriod2').value);
        const period3 = parseInt(document.getElementById('maPeriod3').value);
        const rsiPeriod = parseInt(document.getElementById('rsiPeriod').value);
        const choppyPeriod = parseInt(document.getElementById('choppyPeriod').value);

        // Calculate MAs
        let ma1, ma2, ma3;
        if (maType === 'ema') {
            ma1 = this.indicators.calculateEMA(this.currentData.closes, period1);
            ma2 = this.indicators.calculateEMA(this.currentData.closes, period2);
            ma3 = this.indicators.calculateEMA(this.currentData.closes, period3);
        } else if (maType === 'sma') {
            ma1 = this.indicators.calculateSMA(this.currentData.closes, period1);
            ma2 = this.indicators.calculateSMA(this.currentData.closes, period2);
            ma3 = this.indicators.calculateSMA(this.currentData.closes, period3);
        } else if (maType === 'hma') {
            ma1 = this.indicators.calculateHMA(this.currentData.closes, period1);
            ma2 = this.indicators.calculateHMA(this.currentData.closes, period2);
            ma3 = this.indicators.calculateHMA(this.currentData.closes, period3);
        }

        // Update MA lines
        this.chartManager.updateMA(0, ma1.map((v, i) => ({ time: this.currentData.candles[i].time, value: v })), document.getElementById('toggleMA1').checked);
        this.chartManager.updateMA(1, ma2.map((v, i) => ({ time: this.currentData.candles[i].time, value: v })), document.getElementById('toggleMA2').checked);
        this.chartManager.updateMA(2, ma3.map((v, i) => ({ time: this.currentData.candles[i].time, value: v })), document.getElementById('toggleMA3').checked);

        // Calculate RSI
        const rsi = this.indicators.calculateRSI(this.currentData.closes, rsiPeriod);
        this.chartManager.updateRSI(rsi.map((v, i) => ({ time: this.currentData.candles[i].time, value: v })));

        // Calculate Choppiness
        const choppy = this.indicators.calculateChoppiness(this.currentData.highs, this.currentData.lows, this.currentData.closes, choppyPeriod);
        this.chartManager.updateChoppiness(choppy.map((v, i) => ({ time: this.currentData.candles[i].time, value: v })));
    }

    updateIndicators() {
        if (this.currentData.candles.length > 0) {
            this.calculateAndUpdateIndicators();
        }
    }

    toggleMA(index, visible) {
        this.updateIndicators();
    }

    startLive() {
        const symbol = document.getElementById('symbolSelect').value;
        const granularity = parseInt(document.getElementById('timeframeSelect').value);
        this.derivAPI.subscribeLiveCandles(symbol, granularity, (data) => {
            if (data.ohlc) {
                const candle = DerivAPI.formatOHLC(data.ohlc);
                this.chartManager.updateLiveCandle(candle);
                const lastIndex = this.currentData.candles.findIndex(c => c.time === candle.time);
                if (lastIndex >= 0) {
                    this.currentData.candles[lastIndex] = candle;
                    this.currentData.closes[lastIndex] = candle.close;
                    this.currentData.highs[lastIndex] = candle.high;
                    this.currentData.lows[lastIndex] = candle.low;
                } else {
                    this.currentData.candles.push(candle);
                    this.currentData.closes.push(candle.close);
                    this.currentData.highs.push(candle.high);
                    this.currentData.lows.push(candle.low);
                }
                this.calculateAndUpdateIndicators();
            }
        });
        this.isLiveActive = true;
        document.getElementById('startLiveBtn').disabled = true;
        document.getElementById('stopLiveBtn').disabled = false;
    }

    stopLive() {
        this.derivAPI.unsubscribe();
        this.isLiveActive = false;
        document.getElementById('startLiveBtn').disabled = false;
        document.getElementById('stopLiveBtn').disabled = true;
    }

    updateStats() {
        const last = this.currentData.candles[this.currentData.candles.length - 1];
        const statsHTML = `
            <div class="stat-item"><div class="stat-label">Open</div><div class="stat-value">${last.open.toFixed(2)}</div></div>
            <div class="stat-item"><div class="stat-label">High</div><div class="stat-value">${last.high.toFixed(2)}</div></div>
            <div class="stat-item"><div class="stat-label">Low</div><div class="stat-value">${last.low.toFixed(2)}</div></div>
            <div class="stat-item"><div class="stat-label">Close</div><div class="stat-value">${last.close.toFixed(2)}</div></div>
        `;
        document.getElementById('priceStats').innerHTML = statsHTML;
    }

    showLoading(message) {
        const errorContainer = document.getElementById('errorContainer');
        errorContainer.innerHTML = `<div class="loading">${message}</div>`;
    }

    showError(message) {
        const errorContainer = document.getElementById('errorContainer');
        errorContainer.innerHTML = `<div class="error">${message}</div>`;
    }

    clearError() {
        document.getElementById('errorContainer').innerHTML = '';
    }
}

// Start the app
const app = new TradingApp();