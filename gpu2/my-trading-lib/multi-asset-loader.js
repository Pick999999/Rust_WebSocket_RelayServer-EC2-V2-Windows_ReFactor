/**
 * MultiAssetLoader Class
 * ดึงข้อมูล candles จากหลาย assets พร้อมกัน (Parallel)
 */
class MultiAssetLoader {
  constructor(derivAPI, indicators) {
    this.derivAPI = derivAPI;
    this.indicators = indicators;
    this.assets = {};
  }

  /**
   * ดึงข้อมูลหลาย assets พร้อมกัน (PARALLEL - เร็วมาก!)
   */
  async loadMultipleAssets(symbols, granularity = 60, count = 1000) {
    console.time("⏱️ Load Multiple Assets");
    console.log(`📊 Loading ${symbols.length} assets...`);

    try {
      // สร้าง promises สำหรับแต่ละ symbol
      const promises = symbols.map((symbol) =>
        this.derivAPI
          .getHistoricalCandles(symbol, granularity, count)
          .then((candles) => {
            console.log(`✅ ${symbol}: Received ${candles ? candles.length : 0} candles`);
            return {
              symbol: symbol,
              candles: DerivAPI.formatCandles(candles),
              success: true,
            };
          })
          .catch((error) => {
            const errorMsg =
              error.message || error.code || JSON.stringify(error);
            console.error(`❌ ${symbol}: ${errorMsg}`);
            return {
              symbol: symbol,
              error: errorMsg,
              success: false,
            };
          }),
      );

      // รอให้ทุก request เสร็จพร้อมกัน
      const results = await Promise.all(promises);

      // จัดเก็บข้อมูล
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
          console.log(
            `📈 ${result.symbol}: Stored ${result.candles.length} candles`,
          );
        } else {
          failedCount++;
          console.warn(
            `⚠️ ${result.symbol}: Failed - ${result.error || "No candles received"}`,
          );
        }
      });

      console.timeEnd("⏱️ Load Multiple Assets");
      console.log(
        `📊 Summary: ${loadedCount} loaded, ${failedCount} failed out of ${symbols.length} total`,
      );

      return {
        success: loadedCount > 0,
        loaded: loadedCount,
        failed: failedCount,
        assets: this.assets,
        errors: results.filter((r) => !r.success).map((r) => r.error),
      };
    } catch (error) {
      console.error("Failed to load assets:", error);
      console.timeEnd("⏱️ Load Multiple Assets");
      return {
        success: false,
        error: error.message,
        loaded: 0,
        failed: symbols.length,
      };
    }
  }

  /**
   * คำนวณ indicators สำหรับทุก assets
   * Uses WebGPU with CPU fallback or Super Kernel (Batch Mode).
   * useSuperKernel: If true, uses Super Kernel Batch Processing.
   */
  calculateAllIndicators(
    maType = "ema",
    periods = [9, 21, 50],
    rsiPeriod = 14,
    useSuperKernel = false
  ) {
    const assetKeys = Object.keys(this.assets);
    if (assetKeys.length === 0) {
      console.warn("⚠️ No assets to calculate indicators for");
      return {};
    }

    if (!this.indicators) {
      console.error("Cannot calculate: Indicators module not provided");
      return {};
    }

    const results = {};

    // --- SUPER KERNEL MODE (Batch Processing) ---
    if (useSuperKernel && this.indicators.isGPUAvailable) {
      console.time("🚀 Super Kernel Calculation");
      try {
        console.log("🔥 Starting Super Kernel Batch Process...");

        // 1. Prepare Data Batch
        // We need rectangular arrays (same length). Find max length.
        let maxLength = 0;
        assetKeys.forEach(key => {
          if (this.assets[key].closes.length > maxLength) maxLength = this.assets[key].closes.length;
        });

        // Create 2D arrays (Assets x Candles)
        const batchCloses = [];
        const batchHighs = [];
        const batchLows = [];

        assetKeys.forEach(key => {
          const asset = this.assets[key];
          const currentLen = asset.closes.length;
          const padLen = maxLength - currentLen;

          // If asset is shorter, pad with last value (or 0) to match maxLength
          if (padLen > 0) {
            const lastClose = currentLen > 0 ? asset.closes[currentLen - 1] : 0;
            const lastHigh = currentLen > 0 ? asset.highs[currentLen - 1] : 0;
            const lastLow = currentLen > 0 ? asset.lows[currentLen - 1] : 0;

            batchCloses.push(asset.closes.concat(new Array(padLen).fill(lastClose)));
            batchHighs.push(asset.highs.concat(new Array(padLen).fill(lastHigh)));
            batchLows.push(asset.lows.concat(new Array(padLen).fill(lastLow)));
          } else {
            batchCloses.push(asset.closes);
            batchHighs.push(asset.highs);
            batchLows.push(asset.lows);
          }
        });

        // 2. Execute Super Kernel
        const batchResults = this.indicators.calculateBatch(
          { closes: batchCloses, highs: batchHighs, lows: batchLows },
          { rsi: rsiPeriod, choppy: 14 }
        );

        // 3. Map Results back to Assets
        assetKeys.forEach((symbol, index) => {
          const asset = this.assets[symbol];
          const originalLen = asset.closes.length;
          const batchRes = batchResults[index]; // { rsi: [], choppy: [] }

          // Calculate MA on CPU (EMA is recursive, CPU is optimal)
          // Note: We could do SMA on GPU batch too, but user asked for checkbox logic mainly.
          // Keeping EMA on CPU hybrid is best practice.
          let mas = [];
          if (maType === "ema") {
            mas = periods.map((p) => this.indicators.calculateEMA(asset.closes, p));
          } else if (maType === "sma") {
            mas = periods.map((p) => this.indicators.calculateSMA(asset.closes, p));
          } else if (maType === "hma") {
            mas = periods.map((p) => this.indicators.calculateHMA(asset.closes, p));
          }

          // Slice results back to original length (remove padding)
          results[symbol] = {
            mas: mas,
            rsi: batchRes.rsi.slice(0, originalLen),
            choppy: batchRes.choppy.slice(0, originalLen)
          };
        });

        console.timeEnd("🚀 Super Kernel Calculation");
        return results;

      } catch (e) {
        console.error("Super Kernel failed, falling back to standard mode:", e);
        // Fallthrough to standard mode
      }
    }

    // --- STANDARD MODE (Sequential Loop) ---
    console.time("🎮 Standard Calculation");

    assetKeys.forEach((symbol) => {
      const asset = this.assets[symbol];
      try {
        let mas = [];
        if (maType === "ema") {
          mas = periods.map((p) => this.indicators.calculateEMA(asset.closes, p));
        } else if (maType === "sma") {
          mas = periods.map((p) => this.indicators.calculateSMA(asset.closes, p));
        } else if (maType === "hma") {
          mas = periods.map((p) => this.indicators.calculateHMA(asset.closes, p));
        }

        const rsi = this.indicators.calculateRSI(asset.closes, rsiPeriod);

        const choppy = this.indicators.calculateChoppiness(
          asset.highs,
          asset.lows,
          asset.closes,
          14, // Hardcoded choppy period
        );

        results[symbol] = {
          mas: mas,
          rsi: rsi || [],
          choppy: choppy || [],
        };
      } catch (error) {
        console.error(`❌ ${symbol}: Failed to calculate indicators -`, error);
        results[symbol] = {
          mas: [],
          rsi: [],
          choppy: [],
        };
      }
    });

    console.timeEnd("🎮 Standard Calculation");
    return results;
  }

  /**
   * ดึง + คำนวณทุกอย่างพร้อมกัน (ALL-IN-ONE)
   */
  async loadAndCalculate(
    symbols,
    granularity = 60,
    count = 1000,
    maType = "ema",
    useSuperKernel = false
  ) {
    console.time("🚀 Total Time (Load + Calculate)");

    // Step 1: ดึงข้อมูลทุก assets พร้อมกัน
    const loadResult = await this.loadMultipleAssets(
      symbols,
      granularity,
      count,
    );

    if (!loadResult.success || loadResult.loaded === 0) {
      console.timeEnd("🚀 Total Time (Load + Calculate)");
      const errorDetails = loadResult.errors
        ? loadResult.errors.join(", ")
        : loadResult.error || "Unknown error";
      return {
        success: false,
        error: `No assets loaded. Errors: ${errorDetails}`,
        loaded: 0,
        failed: loadResult.failed,
      };
    }

    // Step 2: คำนวณ indicators
    const indicators = this.calculateAllIndicators(maType, [9, 21, 50], 14, useSuperKernel);

    console.timeEnd("🚀 Total Time (Load + Calculate)");

    // Safety check for UI
    const gpuStatus = this.indicators && this.indicators.getGPUStatus
      ? this.indicators.getGPUStatus().mode
      : "N/A";

    const modeLabel = useSuperKernel ? `${gpuStatus} (Super Kernel)` : gpuStatus;

    return {
      success: true,
      assets: this.assets,
      indicators: indicators,
      stats: {
        totalAssets: Object.keys(this.assets).length,
        gpuMode: modeLabel,
        loaded: loadResult.loaded,
        failed: loadResult.failed,
      },
    };
  }

  /**
   * ดึงข้อมูลแบบ Sequential (ช้า - เพื่อเปรียบเทียบ)
   */
  async loadMultipleAssetsSequential(symbols, granularity = 60, count = 1000) {
    console.time("⏱️ Sequential Load (SLOW)");

    let loaded = 0;
    let failed = 0;

    for (const symbol of symbols) {
      try {
        console.log(`📥 Loading ${symbol}...`);
        const candles = await this.derivAPI.getHistoricalCandles(
          symbol,
          granularity,
          count,
        );

        if (candles && candles.length > 0) {
          const formatted = DerivAPI.formatCandles(candles);
          this.assets[symbol] = {
            candles: formatted,
            closes: formatted.map((c) => c.close),
            highs: formatted.map((c) => c.high),
            lows: formatted.map((c) => c.low),
            opens: formatted.map((c) => c.open),
          };
          loaded++;
          console.log(`✅ ${symbol}: ${candles.length} candles loaded`);
        } else {
          failed++;
          console.warn(`⚠️ ${symbol}: No candles received`);
        }
      } catch (error) {
        failed++;
        const errorMsg = error.message || error.code || JSON.stringify(error);
        console.error(`❌ ${symbol}: ${errorMsg}`);
      }
    }

    console.timeEnd("⏱️ Sequential Load (SLOW)");
    console.log(`📊 Summary: ${loaded} loaded, ${failed} failed`);

    return {
      success: loaded > 0,
      loaded: loaded,
      failed: failed,
      assets: this.assets,
    };
  }

  /**
   * ดูข้อมูล asset ที่โหลดแล้ว
   */
  getAsset(symbol) {
    return this.assets[symbol] || null;
  }

  /**
   * ดูรายการ assets ทั้งหมด
   */
  getLoadedAssets() {
    return Object.keys(this.assets);
  }

  /**
   * ล้างข้อมูลทั้งหมด
   */
  clear() {
    this.assets = {};
    console.log("🗑️ Assets cleared");
  }
}
