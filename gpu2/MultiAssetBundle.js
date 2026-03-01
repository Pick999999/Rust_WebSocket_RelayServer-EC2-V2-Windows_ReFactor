/**
 * MultiAssetBundle.js
 *
 * This file consolidates all JavaScript logic used for Multi-Asset Analysis.
 * It includes the following classes:
 *
 * ==================================================================================
 * 1. DerivAPI
 *    - constructor(appId): Initializes the API with an App ID.
 *    - connect(): Establishes a WebSocket connection to Deriv.
 *    - disconnect(): Closes the WebSocket connection.
 *    - getCandles(symbol, granularity, count, start, end): Fetches historical candle data.
 *    - subscribeLiveCandles(symbol, granularity, callback): Subscribes to real-time candle updates.
 *    - unsubscribeSymbol(symbol): Unsubscribes from a specific symbol.
 *    - unsubscribe(): Unsubscribes from all channels.
 *    - getActiveSymbols(): Retrieves a list of available active symbols.
 *    - generateReqId(): Generates a unique request ID.
 *    - getConnectionStatus(): Returns the current connection state.
 *
 * 2. WebGPUIndicators
 *    - initialize(): Initializes the GPU instance (if available).
 *    - ensureInitialized(): Waits for initialization to complete.
 *    - calculateBatch(assetsData, periods): Executes Super Kernel batch processing on GPU.
 *    - calculateSMA(prices, period): Calculates Simple Moving Average.
 *    - calculateEMA(prices, period): Calculates Exponential Moving Average.
 *    - calculateRSI(prices, period): Calculates Relative Strength Index.
 *    - calculateChoppiness(highs, lows, closes, period): Calculates Choppiness Index.
 *    - getGPUStatus(): Returns current GPU availability and mode.
 *
 * 3. MultiAssetLoader
 *    - loadMultipleAssets(symbols, granularity, count, start, end): Loads data for multiple assets in parallel.
 *    - calculateAllIndicators(maType, periods, rsiPeriod, useSuperKernel): Computes indicators for loaded assets.
 *    - loadAndCalculate(options): Main worker method that loads data and computes indicators.
 *      options: { symbols, granularity, count, start, end, maType, useSuperKernel }
 *    - getAsset(symbol): Retrieves data for a specific asset.
 *    - clear(): Clears all stored data.
 *
 * 4. MultiAssetManager (Main Entry Point)
 *    - execute(params): Orchestrates the entire process based on user parameters.
 *      params: {
 *          assets: string[],       // Array of asset symbols (e.g., ['R_50', 'R_100'])
 *          startDate: Date|number, // Optional: Start date (timestamp or Date object)
 *          stopDate: Date|number,  // Optional: Stop date (timestamp or Date object)
 *          latest: number,         // Optional: Number of latest candles to fetch (e.g., 1000)
 *          duration: number,       // Candle duration value (e.g., 1, 5, 60)
 *          durationUnit: string    // Candle duration unit ('s', 'm', 'h', 'd')
 *      }
 * ==================================================================================
 */

// ===========================================
// Class: DerivAPI
// ===========================================
class DerivAPI {
    constructor(appId = "1089") {
        this.appId = appId;
        this.websocket = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.connectionCallbacks = [];
        this.pendingRequests = new Map();
        this.messageHandlers = new Map();
        this.activeSubscriptions = new Map();
        this.requestCounter = 0;
    }

    generateReqId() {
        this.requestCounter++;
        return this.requestCounter;
    }

    async connect() {
        return new Promise((resolve, reject) => {
            try {
                this.websocket = new WebSocket(
                    `wss://ws.derivws.com/websockets/v3?app_id=${this.appId}`
                );

                this.websocket.onopen = () => {
                    console.log("✅ Connected to Deriv API");
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    this.notifyConnection(true);
                    resolve();
                };

                this.websocket.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this.handleMessage(data);
                    } catch (e) {
                        console.error("Failed to parse message:", e);
                    }
                };

                this.websocket.onerror = (error) => {
                    console.error("❌ WebSocket Error:", error);
                    reject(error);
                };

                this.websocket.onclose = () => {
                    console.log("🔌 Disconnected from Deriv API");
                    this.isConnected = false;
                    this.notifyConnection(false);
                    this.pendingRequests.forEach((handler, reqId) => {
                        handler.reject(new Error("Connection closed"));
                    });
                    this.pendingRequests.clear();
                    this.attemptReconnect();
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(
                `🔄 Reconnecting... Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`
            );
            setTimeout(() => this.connect(), 2000 * this.reconnectAttempts);
        } else {
            console.error("❌ Max reconnection attempts reached");
        }
    }

    notifyConnection(connected) {
        this.connectionCallbacks.forEach((callback) => callback(connected));
    }

    onConnectionChange(callback) {
        this.connectionCallbacks.push(callback);
    }

    handleMessage(data) {
        const reqId = data.req_id;

        if (reqId && this.pendingRequests.has(reqId)) {
            const handler = this.pendingRequests.get(reqId);
            this.pendingRequests.delete(reqId);

            if (data.error) {
                console.error(`❌ Request ${reqId} failed:`, data.error);
                handler.reject(data.error);
            } else {
                handler.resolve(data);
            }
            return;
        }

        if (data.ohlc && this.messageHandlers.has("ohlc")) {
            this.messageHandlers.get("ohlc")(data);
        }

        if (data.tick && this.messageHandlers.has("tick")) {
            this.messageHandlers.get("tick")(data);
        }

        if (data.error && !reqId) {
            console.error("API Error (no req_id):", JSON.stringify(data));
        }
    }

    on(messageType, handler) {
        this.messageHandlers.set(messageType, handler);
    }

    off(messageType) {
        this.messageHandlers.delete(messageType);
    }

    sendAndWait(data, timeout = 30000) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected || this.websocket.readyState !== WebSocket.OPEN) {
                reject(new Error("WebSocket is not connected"));
                return;
            }

            const reqId = data.req_id || this.generateReqId();
            data.req_id = reqId;

            const handler = { resolve, reject };
            this.pendingRequests.set(reqId, handler);

            const timeoutId = setTimeout(() => {
                if (this.pendingRequests.has(reqId)) {
                    this.pendingRequests.delete(reqId);
                    reject(new Error("Request timeout"));
                }
            }, timeout);

            const originalResolve = handler.resolve;
            const originalReject = handler.reject;

            handler.resolve = (data) => {
                clearTimeout(timeoutId);
                originalResolve(data);
            };

            handler.reject = (error) => {
                clearTimeout(timeoutId);
                originalReject(error);
            };

            try {
                this.websocket.send(JSON.stringify(data));
            } catch (error) {
                this.pendingRequests.delete(reqId);
                clearTimeout(timeoutId);
                reject(error);
            }
        });
    }

    send(data) {
        if (this.isConnected && this.websocket.readyState === WebSocket.OPEN) {
            data.req_id = data.req_id || this.generateReqId();
            this.websocket.send(JSON.stringify(data));
            return true;
        }
        return false;
    }

    /**
     * Unified method to get candles
     * @param {string} symbol
     * @param {number} granularity
     * @param {number} count
     * @param {number|Date} start
     * @param {number|Date} end
     */
    async getCandles(symbol, granularity = 60, count = 1000, start = null, end = "latest") {
        const reqId = this.generateReqId();
        const requestParams = {
            ticks_history: symbol,
            adjust_start_time: 1,
            granularity: granularity,
            style: "candles",
            req_id: reqId,
        };

        if (start) {
            // Range request (start is provided)
            requestParams.start = typeof start === 'object' ? Math.floor(start.getTime() / 1000) : start;
            requestParams.end = (end === "latest")
                ? "latest"
                : (typeof end === 'object' ? Math.floor(end.getTime() / 1000) : end);
        } else {
            // Latest count request (no start provided)
            requestParams.count = count;
            requestParams.end = "latest";
        }

        try {
            const response = await this.sendAndWait(requestParams);
            if (response.candles) {
                return response.candles;
            } else if (response.history && response.history.prices) {
                return response.history.prices.map((price, i) => ({
                    epoch: response.history.times[i],
                    open: price,
                    high: price,
                    low: price,
                    close: price,
                }));
            } else {
                throw new Error("No candles in response");
            }
        } catch (error) {
            console.error(`❌ Failed to get candles for ${symbol}:`, error);
            throw error;
        }
    }

    // Proxy for backward compatibility calling convention
    async getHistoricalCandles(symbol, granularity, count) {
        return this.getCandles(symbol, granularity, count, null, "latest");
    }

    subscribeLiveCandles(symbol, granularity = 60, callback) {
        if (this.activeSubscriptions.has(symbol)) {
            this.unsubscribeSymbol(symbol);
        }
        const reqId = this.generateReqId();
        this.activeSubscriptions.set(symbol, { reqId, subscriptionId: null });

        this.on("ohlc", (data) => {
            if (data.ohlc && data.ohlc.symbol === symbol) callback(data);
        });

        this.send({
            ticks_history: symbol,
            adjust_start_time: 1,
            count: 1,
            end: "latest",
            granularity: granularity,
            style: "candles",
            subscribe: 1,
            req_id: reqId,
        });
        return reqId;
    }

    unsubscribeSymbol(symbol) {
        const subscription = this.activeSubscriptions.get(symbol);
        if (subscription && subscription.subscriptionId) {
            this.send({ forget: subscription.subscriptionId });
        }
        this.activeSubscriptions.delete(symbol);
    }

    unsubscribe() {
        this.activeSubscriptions.forEach((sub) => {
            if (sub.subscriptionId) this.send({ forget: sub.subscriptionId });
        });
        this.activeSubscriptions.clear();
        this.off("ohlc");
    }

    async getActiveSymbols() {
        const reqId = this.generateReqId();
        const response = await this.sendAndWait({
            active_symbols: "brief",
            product_type: "basic",
            req_id: reqId,
        });
        return response.active_symbols;
    }

    disconnect() {
        if (this.websocket) {
            this.unsubscribe();
            this.websocket.close();
            this.isConnected = false;
        }
    }

    static formatCandles(candles) {
        if (!candles || candles.length === 0) return [];
        return candles.map((candle) => ({
            time: candle.epoch,
            open: parseFloat(candle.open),
            high: parseFloat(candle.high),
            low: parseFloat(candle.low),
            close: parseFloat(candle.close),
        }));
    }
}

// ===========================================
// Class: WebGPUIndicators
// ===========================================
class WebGPUIndicators {
    constructor() {
        this.gpu = null;
        this.isGPUAvailable = false;
        this.gpuMode = "cpu";
        this.kernels = {};
        this._initialized = false;
        this._initPromise = this.initialize();
    }

    async initialize() {
        await this.waitForGPU();
        try {
            let GPUConstructor = null;
            if (typeof window !== "undefined") {
                if (window.GPU && typeof window.GPU.GPU === "function") GPUConstructor = window.GPU.GPU;
                else if (window.GPU && typeof window.GPU === "function") GPUConstructor = window.GPU;
            }

            if (!GPUConstructor) {
                console.warn("GPU.js constructor not found, using CPU mode");
                this.gpuMode = "cpu";
                this.isGPUAvailable = false;
                this._initialized = true;
                return;
            }

            this.gpu = new GPUConstructor({ mode: "gpu" });
            const testKernel = this.gpu.createKernel(function () { return 1; }).setOutput([1]);
            testKernel();
            this.isGPUAvailable = this.gpu.mode === "gpu";
            this.gpuMode = this.gpu.mode;
            this.createKernels();
        } catch (error) {
            console.warn("GPU init failed, falling back to CPU:", error.message);
            this.gpuMode = "cpu";
            this.isGPUAvailable = false;
        }
        this._initialized = true;
    }

    waitForGPU(maxAttempts = 50, interval = 100) {
        return new Promise((resolve) => {
            let attempts = 0;
            const check = () => {
                let gpuExists = (typeof window !== "undefined" && window.GPU);
                if (gpuExists) { resolve(true); return; }
                attempts++;
                if (attempts >= maxAttempts) { resolve(false); return; }
                setTimeout(check, interval);
            };
            check();
        });
    }

    async ensureInitialized() {
        if (!this._initialized) await this._initPromise;
    }

    createKernels() {
        if (!this.gpu) return;

        // One-dimensional kernels
        this.kernels.sma = this.gpu.createKernel(function (prices, period) {
            const index = this.thread.x;
            let sum = 0;
            if (index >= period - 1) {
                for (let i = 0; i < period; i++) sum += prices[index - i];
                return sum / period;
            }
            return prices[index];
        });

        this.kernels.priceChanges = this.gpu.createKernel(function (prices) {
            const index = this.thread.x;
            if (index === 0) return 0;
            return prices[index] - prices[index - 1];
        });

        this.kernels.rsi = this.gpu.createKernel(function (changes, period) {
            const index = this.thread.x;
            let gains = 0, losses = 0;
            if (index >= period) {
                for (let i = 0; i < period; i++) {
                    const change = changes[index - i];
                    if (change > 0) gains += change; else losses -= change;
                }
                const avgLoss = losses / period;
                if (avgLoss === 0) return 100;
                const rs = (gains / period) / avgLoss;
                return 100 - 100 / (1 + rs);
            }
            return 50;
        });

        this.kernels.trueRange = this.gpu.createKernel(function (highs, lows, closes) {
            const index = this.thread.x;
            if (index === 0) return highs[0] - lows[0];
            const high = highs[index];
            const low = lows[index];
            const prevClose = closes[index - 1];
            const hl = high - low;
            const hc = high > prevClose ? high - prevClose : prevClose - high;
            const lc = low < prevClose ? prevClose - low : low - prevClose;
            let maxTR = hl;
            if (hc > maxTR) maxTR = hc;
            if (lc > maxTR) maxTR = lc;
            return maxTR;
        });

        // Batch Kernels (2D) - Super Kernel
        this.kernels.priceChangesBatch = this.gpu.createKernel(function (prices) {
            const assetIdx = this.thread.y;
            const index = this.thread.x;
            if (index === 0) return 0;
            return prices[assetIdx][index] - prices[assetIdx][index - 1];
        });

        this.kernels.rsiBatch = this.gpu.createKernel(function (changes, period) {
            const assetIdx = this.thread.y;
            const index = this.thread.x;
            let gains = 0, losses = 0;
            if (index >= period) {
                for (let i = 0; i < period; i++) {
                    const change = changes[assetIdx][index - i];
                    if (change > 0) gains += change; else losses -= change;
                }
                const avgLoss = losses / period;
                if (avgLoss === 0) return 100;
                return 100 - 100 / (1 + (gains / period) / avgLoss);
            }
            return 50;
        });

        this.kernels.trueRangeBatch = this.gpu.createKernel(function (highs, lows, closes) {
            const assetIdx = this.thread.y;
            const index = this.thread.x;
            if (index === 0) return highs[assetIdx][0] - lows[assetIdx][0];
            const high = highs[assetIdx][index];
            const low = lows[assetIdx][index];
            const prevClose = closes[assetIdx][index - 1];
            const hl = high - low;
            const hc = high > prevClose ? high - prevClose : prevClose - high;
            const lc = low < prevClose ? prevClose - low : low - prevClose;
            let maxTR = hl;
            if (hc > maxTR) maxTR = hc;
            if (lc > maxTR) maxTR = lc;
            return maxTR;
        });
    }

    calculateBatch(assetsData, periods = { rsi: 14, choppy: 14 }) {
        if (!this.isGPUAvailable) throw new Error("Batch processing requires active GPU");

        const numAssets = assetsData.closes.length;
        if (numAssets === 0) return [];
        const numCandles = assetsData.closes[0].length;
        const results = [];
        for (let i = 0; i < numAssets; i++) results.push({ rsi: [], choppy: [] });

        const changesKernel = this.kernels.priceChangesBatch.setOutput([numCandles, numAssets]);
        const batchChanges = changesKernel(assetsData.closes);
        const rsiKernel = this.kernels.rsiBatch.setOutput([numCandles, numAssets]);
        const batchRSI = rsiKernel(batchChanges, periods.rsi);

        const trKernel = this.kernels.trueRangeBatch.setOutput([numCandles, numAssets]);
        const batchTR = trKernel(assetsData.highs, assetsData.lows, assetsData.closes);

        const logPeriod = Math.log10(periods.choppy);

        // Hybrid Choppiness Calculation
        for (let a = 0; a < numAssets; a++) {
            const assetChoppy = [];
            const assetHighs = assetsData.highs[a];
            const assetLows = assetsData.lows[a];
            const assetTR = batchTR[a];

            for (let i = 0; i < numCandles; i++) {
                if (i < periods.choppy) {
                    assetChoppy.push(50);
                } else {
                    let sumTR = 0, maxHigh = assetHighs[i], minLow = assetLows[i];
                    for (let j = 0; j < periods.choppy; j++) {
                        const idx = i - j;
                        sumTR += assetTR[idx];
                        if (assetHighs[idx] > maxHigh) maxHigh = assetHighs[idx];
                        if (assetLows[idx] < minLow) minLow = assetLows[idx];
                    }
                    const range = maxHigh - minLow;
                    if (range === 0) assetChoppy.push(50);
                    else assetChoppy.push((Math.log10(sumTR / range) / logPeriod) * 100);
                }
            }
            results[a].choppy = assetChoppy;
            results[a].rsi = Array.from(batchRSI[a]);
        }
        return results;
    }

    calculateSMA(prices, period = 20) {
        if (this.isGPUAvailable && this.kernels.sma) {
            try {
                return Array.from(this.kernels.sma.setOutput([prices.length])(prices, period));
            } catch (e) {
                console.warn("SMA GPU Fail", e);
            }
        }
        const result = [];
        for (let i = 0; i < prices.length; i++) {
            if (i < period - 1) result.push(prices[i]);
            else {
                let sum = 0;
                for (let j = 0; j < period; j++) sum += prices[i - j];
                result.push(sum / period);
            }
        }
        return result;
    }

    calculateEMA(prices, period = 20) {
        const k = 2 / (period + 1);
        const ema = new Array(prices.length);
        ema[0] = prices[0];
        for (let i = 1; i < prices.length; i++) {
            ema[i] = (prices[i] - ema[i - 1]) * k + ema[i - 1];
        }
        return ema;
    }

    calculateRSI(prices, period = 14) {
        if (this.isGPUAvailable && this.kernels.priceChanges && this.kernels.rsi) {
            try {
                const changes = this.kernels.priceChanges.setOutput([prices.length])(prices);
                return Array.from(this.kernels.rsi.setOutput([prices.length])(changes, period));
            } catch (e) { console.warn("RSI GPU Fail", e); }
        }
        const result = [];
        const changes = [];
        for (let i = 0; i < prices.length; i++) changes.push(i === 0 ? 0 : prices[i] - prices[i - 1]);
        for (let i = 0; i < prices.length; i++) {
            if (i < period) result.push(50);
            else {
                let gains = 0, losses = 0;
                for (let j = 0; j < period; j++) {
                    const c = changes[i - j];
                    if (c > 0) gains += c; else losses -= c;
                }
                const avgLoss = losses / period;
                if (avgLoss === 0) result.push(100);
                else result.push(100 - 100 / (1 + (gains / period) / avgLoss));
            }
        }
        return result;
    }

    calculateChoppiness(highs, lows, closes, period = 14) {
        let trueRanges = [];
        if (this.isGPUAvailable && this.kernels.trueRange) {
            try {
                trueRanges = Array.from(this.kernels.trueRange.setOutput([highs.length])(highs, lows, closes));
            } catch (e) { console.warn("TR GPU Fail", e); }
        }
        // CPU Fallback for TR or if failed
        if (trueRanges.length === 0) {
            for (let i = 0; i < highs.length; i++) {
                if (i === 0) trueRanges.push(highs[0] - lows[0]);
                else {
                    trueRanges.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
                }
            }
        }
        const result = [];
        const logPeriod = Math.log10(period);
        for (let i = 0; i < highs.length; i++) {
            if (i < period) result.push(50);
            else {
                let sumTR = 0, maxH = highs[i], minL = lows[i];
                for (let j = 0; j < period; j++) {
                    const idx = i - j;
                    sumTR += trueRanges[idx];
                    if (highs[idx] > maxH) maxH = highs[idx];
                    if (lows[idx] < minL) minL = lows[idx];
                }
                const range = maxH - minL;
                if (range === 0) result.push(50);
                else result.push((Math.log10(sumTR / range) / logPeriod) * 100);
            }
        }
        return result;
    }

    getGPUStatus() {
        return { isGPUAvailable: this.isGPUAvailable, mode: this.gpuMode };
    }
}

// ===========================================
// Class: MultiAssetLoader
// ===========================================
class MultiAssetLoader {
    constructor(derivAPI, indicators) {
        this.derivAPI = derivAPI;
        this.indicators = indicators;
        this.assets = {};
    }

    async loadMultipleAssets(symbols, granularity = 60, count = 1000, start = null, end = "latest") {
        console.log(`📊 Loading ${symbols.length} assets...`);
        const promises = symbols.map((symbol) =>
            this.derivAPI
                .getCandles(symbol, granularity, count, start, end)
                .then((candles) => ({
                    symbol: symbol,
                    candles: DerivAPI.formatCandles(candles),
                    success: true,
                }))
                .catch((error) => ({
                    symbol: symbol,
                    error: error.message || error.code || JSON.stringify(error),
                    success: false,
                }))
        );

        const results = await Promise.all(promises);
        let loadedCount = 0;
        let failedCount = 0;

        results.forEach((result) => {
            if (result.success && result.candles && result.candles.length > 0) {
                this.assets[result.symbol] = {
                    candles: result.candles,
                    closes: result.candles.map((c) => c.close),
                    highs: result.candles.map((c) => c.high),
                    lows: result.candles.map((c) => c.low),
                    opens: result.candles.map((c) => c.open),
                };
                loadedCount++;
            } else {
                failedCount++;
                console.warn(`⚠️ ${result.symbol}: Failed - ${result.error}`);
            }
        });

        return {
            success: loadedCount > 0,
            loaded: loadedCount,
            failed: failedCount,
            assets: this.assets,
            errors: results.filter((r) => !r.success).map((r) => r.error),
        };
    }

    calculateAllIndicators(maType = "ema", periods = [9, 21, 50], rsiPeriod = 14, useSuperKernel = false) {
        const assetKeys = Object.keys(this.assets);
        if (assetKeys.length === 0) return {};
        if (!this.indicators) return {};

        const results = {};

        // Super Kernel Mode
        if (useSuperKernel && this.indicators.isGPUAvailable) {
            try {
                let maxLength = 0;
                assetKeys.forEach(key => {
                    if (this.assets[key].closes.length > maxLength) maxLength = this.assets[key].closes.length;
                });

                const batchCloses = [], batchHighs = [], batchLows = [];
                assetKeys.forEach(key => {
                    const asset = this.assets[key];
                    const len = asset.closes.length;
                    const pad = maxLength - len;
                    const lastC = len > 0 ? asset.closes[len - 1] : 0;
                    const lastH = len > 0 ? asset.highs[len - 1] : 0;
                    const lastL = len > 0 ? asset.lows[len - 1] : 0;

                    if (pad > 0) {
                        batchCloses.push(asset.closes.concat(new Array(pad).fill(lastC)));
                        batchHighs.push(asset.highs.concat(new Array(pad).fill(lastH)));
                        batchLows.push(asset.lows.concat(new Array(pad).fill(lastL)));
                    } else {
                        batchCloses.push(asset.closes);
                        batchHighs.push(asset.highs);
                        batchLows.push(asset.lows);
                    }
                });

                const batchResults = this.indicators.calculateBatch(
                    { closes: batchCloses, highs: batchHighs, lows: batchLows },
                    { rsi: rsiPeriod, choppy: 14 }
                );

                assetKeys.forEach((symbol, index) => {
                    const asset = this.assets[symbol];
                    const originalLen = asset.closes.length;
                    const batchRes = batchResults[index];
                    let mas = [];
                    // Keep EMA on CPU for now as it's recursive
                    if (maType === "ema") mas = periods.map(p => this.indicators.calculateEMA(asset.closes, p));

                    results[symbol] = {
                        mas: mas,
                        rsi: batchRes.rsi.slice(0, originalLen),
                        choppy: batchRes.choppy.slice(0, originalLen)
                    };
                });
                return results;

            } catch (e) {
                console.warn("Super Kernel failed, using standard mode", e);
            }
        }

        // Standard Mode
        assetKeys.forEach((symbol) => {
            const asset = this.assets[symbol];
            const mas = periods.map((p) => this.indicators.calculateEMA(asset.closes, p));
            const rsi = this.indicators.calculateRSI(asset.closes, rsiPeriod);
            const choppy = this.indicators.calculateChoppiness(asset.highs, asset.lows, asset.closes, 14);
            results[symbol] = { mas, rsi, choppy };
        });

        return results;
    }

    async loadAndCalculate(options) {
        // Unpack options
        const {
            symbols,
            granularity = 60,
            count = 1000,
            start = null,
            end = "latest",
            maType = "ema",
            useSuperKernel = false
        } = options;

        // Step 1: Load
        const loadResult = await this.loadMultipleAssets(symbols, granularity, count, start, end);
        if (!loadResult.success) {
            return {
                success: false,
                error: "No assets loaded",
                loaded: 0,
                failed: loadResult.failed
            };
        }

        // Step 2: Calculate
        const indicators = this.calculateAllIndicators(maType, [9, 21, 50], 14, useSuperKernel);

        return {
            success: true,
            assets: this.assets,
            indicators: indicators,
            stats: {
                totalAssets: Object.keys(this.assets).length,
                loaded: loadResult.loaded,
                failed: loadResult.failed,
                gpuMode: useSuperKernel ? "SuperKernel" : "Standard"
            }
        };
    }
}

// ===========================================
// Class: MultiAssetManager (Main Entry Point)
// ===========================================
class MultiAssetManager {
    constructor(appId = "1089") {
        this.appId = appId;
        this.indicators = new WebGPUIndicators();
        this.derivAPI = new DerivAPI(appId);
        this.loader = null;
    }

    /**
     * Parse duration inputs into seconds (granularity)
     * @param {number} duration 
     * @param {string} unit 
     */
    static getGranularityInSeconds(duration, unit) {
        const u = unit.toLowerCase();
        switch (u) {
            case 's': return duration;
            case 'm': return duration * 60;
            case 'h': return duration * 3600;
            case 'd': return duration * 86400;
            default: return duration * 60; // Default to minutes if unknown
        }
    }

    /**
     * Main execution method
     * @param {Object} params
     * @param {string[]} params.assets - Array of asset symbols
     * @param {Date|number} [params.startDate] - Start date
     * @param {Date|number} [params.stopDate] - Stop date
     * @param {number} [params.latest] - Count of latest candles to fetch (if not using dates)
     * @param {number} params.duration - Duration value (e.g. 1)
     * @param {string} params.durationUnit - Duration unit ('m', 'h', etc)
     * @param {boolean} [params.useSuperKernel] - Whether to use GPU Batch processing
     */
    async execute(params) {
        console.log("🚀 MultiAssetManager: Starting execution...", params);

        // 1. Initialize
        await this.indicators.ensureInitialized();
        if (!this.derivAPI.isConnected) {
            await this.derivAPI.connect();
        }

        this.loader = new MultiAssetLoader(this.derivAPI, this.indicators);

        // 2. Prepare parameters
        const granularity = MultiAssetManager.getGranularityInSeconds(
            params.duration || 1,
            params.durationUnit || 'm'
        );

        // Count: matches 'latest' parameter or default 1000
        const count = params.latest || 1000;

        // Start/End
        // If specified, pass them. If 'latest' number is present, priority might be on count.
        // Logic: If startDate is present, use start/end. Else use count.
        const start = params.startDate;
        const end = params.stopDate || "latest";

        const loadOptions = {
            symbols: params.assets,
            granularity: granularity,
            count: count,
            start: start,
            end: end,
            maType: "ema",
            useSuperKernel: params.useSuperKernel || false
        };

        // 3. Execution
        try {
            const result = await this.loader.loadAndCalculate(loadOptions);

            // 4. Analysis (New Step)
            if (result.success) {
                const analysisResult = this.analysisData(result);
                result.analysis = analysisResult; // Attach analysis data to result
            }

            return result;
        } catch (error) {
            console.error("MultiAssetManager execution failed:", error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Analyzes the calculated data (To be implemented)
     * @param {Object} data - The result object from loadAndCalculate
     */
    analysisData(data) {
        // Placeholder for future analysis logic
        console.log("🔍 Analyzing data...", data);
        return {};
    }

    /**
     * Clean up resources
     */
    disconnect() {
        if (this.derivAPI) this.derivAPI.disconnect();
    }
}
