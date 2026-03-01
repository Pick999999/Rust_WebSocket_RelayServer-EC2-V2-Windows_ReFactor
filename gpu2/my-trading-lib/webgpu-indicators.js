/**
 * WebGPUIndicators Class
 * คำนวณ Technical Indicators โดยใช้ GPU (Parallelized where possible)
 * Note: Recursive indicators (EMA, MACD) are calculated on CPU for efficiency and stability.
 * Parallelizable indicators (SMA, RSI, Bollinger, TrueRange) use GPU if available, 
 * with automatic CPU fallback.
 */
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
      } else if (typeof self !== "undefined") {
        if (self.GPU && typeof self.GPU.GPU === "function") GPUConstructor = self.GPU.GPU;
        else if (self.GPU && typeof self.GPU === "function") GPUConstructor = self.GPU;
      } else if (typeof GPU !== "undefined") {
        if (typeof GPU.GPU === "function") GPUConstructor = GPU.GPU;
        else if (typeof GPU === "function") GPUConstructor = GPU;
      }

      if (!GPUConstructor) {
        console.warn("GPU.js constructor not found, using CPU mode");
        this.gpuMode = "cpu";
        this.isGPUAvailable = false;
        this._initialized = true;
        return;
      }

      try {
        this.gpu = new GPUConstructor({ mode: "gpu" });
        const testKernel = this.gpu.createKernel(function () { return 1; }).setOutput([1]);
        testKernel();
        this.isGPUAvailable = this.gpu.mode === "gpu";
        this.gpuMode = this.gpu.mode;
        console.log(`GPU Mode Active: ${this.gpuMode.toUpperCase()}`);
        this.createKernels();
      } catch (gpuError) {
        console.warn("GPU init failed, falling back to CPU:", gpuError.message);
        this.gpu = null;
        this.gpuMode = "cpu";
        this.isGPUAvailable = false;
      }
      this._initialized = true;
    } catch (error) {
      console.error("Failed to initialize GPU:", error);
      this.gpuMode = "cpu";
      this.isGPUAvailable = false;
      this._initialized = true;
    }
  }

  waitForGPU(maxAttempts = 50, interval = 100) {
    return new Promise((resolve) => {
      let attempts = 0;
      const check = () => {
        let gpuExists = (typeof window !== "undefined" && window.GPU) ||
          (typeof self !== "undefined" && self.GPU) ||
          (typeof GPU !== "undefined");
        if (gpuExists) { resolve(true); return; }
        attempts++;
        if (attempts >= maxAttempts) {
          resolve(false);
          return;
        }
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

    // Standard Kernels (1D)
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
        const avgGain = gains / period;
        const avgLoss = losses / period;
        if (avgLoss === 0) return 100;
        const rs = avgGain / avgLoss;
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

    // --- SUPER KERNEL BATCH KERNELS (2D Processing) ---
    // thread.y = Asset Index, thread.x = Candle Index

    // Batch Price Changes (Pre-calc for RSI)
    this.kernels.priceChangesBatch = this.gpu.createKernel(function (prices) {
      const assetIdx = this.thread.y;
      const index = this.thread.x;
      if (index === 0) return 0;
      return prices[assetIdx][index] - prices[assetIdx][index - 1];
    });

    // Batch RSI
    this.kernels.rsiBatch = this.gpu.createKernel(function (changes, period) {
      const assetIdx = this.thread.y;
      const index = this.thread.x;
      let gains = 0, losses = 0;

      if (index >= period) {
        for (let i = 0; i < period; i++) {
          const change = changes[assetIdx][index - i];
          if (change > 0) gains += change; else losses -= change;
        }
        const avgGain = gains / period;
        const avgLoss = losses / period;
        if (avgLoss === 0) return 100;
        const rs = avgGain / avgLoss;
        return 100 - 100 / (1 + rs);
      }
      return 50;
    });

    // Batch True Range
    this.kernels.trueRangeBatch = this.gpu.createKernel(function (highs, lows, closes) {
      const assetIdx = this.thread.y;
      const index = this.thread.x;

      if (index === 0) return highs[assetIdx][0] - lows[assetIdx][0];

      const high = highs[assetIdx][index];
      const low = lows[assetIdx][index];
      const prevClose = closes[assetIdx][index - 1]; // Ensure index-1 > 0 check handled by logic

      const hl = high - low;
      const hc = high > prevClose ? high - prevClose : prevClose - high;
      const lc = low < prevClose ? prevClose - low : low - prevClose;

      let maxTR = hl;
      if (hc > maxTR) maxTR = hc;
      if (lc > maxTR) maxTR = lc;
      return maxTR;
    });
  }

  // --- Indicators (Single Asset Mode) ---

  calculateSMA(prices, period = 20) {
    if (!prices || prices.length === 0) return [];
    if (this.isGPUAvailable && this.kernels.sma) {
      try {
        const kernel = this.kernels.sma.setOutput([prices.length]);
        return Array.from(kernel(prices, period));
      } catch (e) {
        console.warn("SMA GPU error, fallback to CPU:", e);
      }
    }
    const result = [];
    for (let i = 0; i < prices.length; i++) {
      if (i < period - 1) { result.push(prices[i]); }
      else { let sum = 0; for (let j = 0; j < period; j++) sum += prices[i - j]; result.push(sum / period); }
    }
    return result;
  }

  calculateEMA(prices, period = 20) {
    if (!prices || prices.length === 0) return [];
    const k = 2 / (period + 1);
    const emaArray = new Array(prices.length);
    emaArray[0] = prices[0];
    for (let i = 1; i < prices.length; i++) {
      emaArray[i] = (prices[i] - emaArray[i - 1]) * k + emaArray[i - 1];
    }
    return emaArray;
  }

  calculateHMA(prices, period = 20) {
    if (!prices || prices.length === 0) return [];
    const halfPeriod = Math.floor(period / 2);
    const sqrtPeriod = Math.floor(Math.sqrt(period));
    const wma1 = this.calculateWMA(prices, halfPeriod);
    const wma2 = this.calculateWMA(prices, period);
    const diff = wma1.map((val, i) => 2 * val - wma2[i]);
    return this.calculateWMA(diff, sqrtPeriod);
  }

  calculateWMA(prices, period) {
    const result = [];
    const weights = [];
    let weightSum = 0;
    for (let i = 1; i <= period; i++) { weights.push(i); weightSum += i; }
    for (let i = 0; i < prices.length; i++) {
      if (i < period - 1) { result.push(prices[i]); }
      else {
        let sum = 0;
        for (let j = 0; j < period; j++) { sum += prices[i - j] * weights[period - 1 - j]; }
        result.push(sum / weightSum);
      }
    }
    return result;
  }

  calculateRSI(prices, period = 14) {
    if (!prices || prices.length === 0) return [];
    if (this.isGPUAvailable && this.kernels.priceChanges && this.kernels.rsi) {
      try {
        const changesKernel = this.kernels.priceChanges.setOutput([prices.length]);
        const changes = changesKernel(prices);
        const changesArr = Array.isArray(changes) ? changes : Array.from(changes);
        const rsiKernel = this.kernels.rsi.setOutput([prices.length]);
        return Array.from(rsiKernel(changesArr, period));
      } catch (e) {
        console.warn("RSI GPU error, fallback to CPU:", e);
      }
    }
    const result = [];
    const changes = [];
    for (let i = 0; i < prices.length; i++) { changes.push(i === 0 ? 0 : prices[i] - prices[i - 1]); }
    for (let i = 0; i < prices.length; i++) {
      if (i < period) { result.push(50); }
      else {
        let gains = 0, losses = 0;
        for (let j = 0; j < period; j++) {
          const change = changes[i - j];
          if (change > 0) gains += change; else losses -= change;
        }
        const avgGain = gains / period; const avgLoss = losses / period;
        if (avgLoss === 0) result.push(100);
        else { const rs = avgGain / avgLoss; result.push(100 - 100 / (1 + rs)); }
      }
    }
    return result;
  }

  calculateChoppiness(highs, lows, closes, period = 14) {
    if (!highs || highs.length === 0) return [];
    let trueRanges = [];
    if (this.isGPUAvailable && this.kernels.trueRange) {
      try {
        const trKernel = this.kernels.trueRange.setOutput([highs.length]);
        trueRanges = Array.from(trKernel(highs, lows, closes));
      } catch (e) {
        console.warn("TR GPU error, fallback to CPU:", e);
        trueRanges = [];
      }
    }
    if (trueRanges.length === 0) {
      for (let i = 0; i < highs.length; i++) {
        if (i === 0) { trueRanges.push(highs[0] - lows[0]); }
        else {
          const hl = highs[i] - lows[i];
          const hc = Math.abs(highs[i] - closes[i - 1]);
          const lc = Math.abs(lows[i] - closes[i - 1]);
          trueRanges.push(Math.max(hl, hc, lc));
        }
      }
    }
    const result = [];
    const logPeriod = Math.log10(period);
    for (let i = 0; i < highs.length; i++) {
      if (i < period) { result.push(50); }
      else {
        let sumTR = 0, maxHigh = highs[i], minLow = lows[i];
        for (let j = 0; j < period; j++) {
          const idx = i - j;
          sumTR += trueRanges[idx];
          if (highs[idx] > maxHigh) maxHigh = highs[idx];
          if (lows[idx] < minLow) minLow = lows[idx];
        }
        const highLowRange = maxHigh - minLow;
        if (highLowRange === 0) { result.push(50); }
        else {
          const chop = (Math.log10(sumTR / highLowRange) / logPeriod) * 100;
          result.push(chop);
        }
      }
    }
    return result;
  }

  // --- BATCH PROCESSING (SUPER KERNEL) ---

  /**
   * Calculates features for multiple assets simultaneously.
   * Input: Arrays of arrays (e.g., closes[assetIndex][candleIndex])
   * Output: Array of result objects { rsi: [], choppy: [] }
   */
  calculateBatch(assetsData, periods = { rsi: 14, choppy: 14 }) {
    if (!this.isGPUAvailable) {
      throw new Error("Batch processing requires active GPU");
    }

    const numAssets = assetsData.closes.length;
    if (numAssets === 0) return [];
    const numCandles = assetsData.closes[0].length; // Assuming padded/same length

    console.log(`🚀 Executing Super Kernel Batch: ${numAssets} Assets x ${numCandles} Candles`);

    // Prepare Results Container
    const results = [];
    // Initialize with empty arrays (so if crash, we have valid structure)
    for (let i = 0; i < numAssets; i++) results.push({ rsi: [], choppy: [] });

    try {
      // 1. RSI BATCH
      // First, calculate price changes for all assets at once
      const changesKernel = this.kernels.priceChangesBatch.setOutput([numCandles, numAssets]);
      const batchChanges = changesKernel(assetsData.closes);

      // Next, calculate RSI for all assets from those changes
      const rsiKernel = this.kernels.rsiBatch.setOutput([numCandles, numAssets]);
      const batchRSI = rsiKernel(batchChanges, periods.rsi);

      // 2. CHOPPINESS BATCH
      // First, calculate True Range for all assets
      const trKernel = this.kernels.trueRangeBatch.setOutput([numCandles, numAssets]);
      const batchTR = trKernel(assetsData.highs, assetsData.lows, assetsData.closes);

      // Second, perform summation logic (Partially CPU for flexibility with loops)
      // Ideally fully GPU, but reduction loops are complex in basic GPU.js v2
      // This hybrid approach is still much faster than full CPU.
      const logPeriod = Math.log10(periods.choppy);

      // Process Choppiness per asset (using the GPU-precalculated TRs)
      for (let a = 0; a < numAssets; a++) {
        const assetChoppy = [];
        const assetHighs = assetsData.highs[a];
        const assetLows = assetsData.lows[a];
        const assetTR = batchTR[a]; // 1D array for this asset from 2D result

        for (let i = 0; i < numCandles; i++) {
          if (i < periods.choppy) {
            assetChoppy.push(50);
          } else {
            let sumTR = 0;
            let maxHigh = assetHighs[i];
            let minLow = assetLows[i];

            // Lookback loop
            for (let j = 0; j < periods.choppy; j++) {
              const idx = i - j;
              sumTR += assetTR[idx];
              if (assetHighs[idx] > maxHigh) maxHigh = assetHighs[idx];
              if (assetLows[idx] < minLow) minLow = assetLows[idx];
            }

            const highLowRange = maxHigh - minLow;
            if (highLowRange === 0) {
              assetChoppy.push(50);
            } else {
              const chop = (Math.log10(sumTR / highLowRange) / logPeriod) * 100;
              assetChoppy.push(chop);
            }
          }
        }
        results[a].choppy = assetChoppy;
      }

      // Map RSI back to results
      for (let a = 0; a < numAssets; a++) {
        // GPU.js returns Float32Array or Array depending on mode, normalize to Array
        results[a].rsi = Array.from(batchRSI[a]);
      }

    } catch (e) {
      console.error("Super Kernel Execution Failed:", e);
      throw e; // Let loader handle fallback
    }

    return results;
  }

  getGPUStatus() {
    return {
      isGPUAvailable: this.isGPUAvailable,
      mode: this.gpuMode,
      displayText: this.gpuMode === "gpu" ? "GPU Accelerated (Hybrid)" : "CPU Mode",
      initialized: this._initialized,
    };
  }
}
