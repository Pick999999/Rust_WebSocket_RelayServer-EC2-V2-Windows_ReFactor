// ============================================================
//  strategy_gpu.js — Version GPU (WebGPU + WASM)
//  ใช้ GPU คำนวณ Indicator แบบ Parallel
//  Fallback ไป CPU ถ้า WebGPU ไม่รองรับ
// ============================================================

class StrategyGPU {
    constructor() {
        this.gpuManager = null;
        this.cpuGenerator = null; // fallback + tick-by-tick
        this.gpuAvailable = false;
        this.ready = false;
        this.onSignal = null;
        this.onAnalysis = null;
    }

    /**
     * ตั้งค่า GPU + CPU fallback
     * @param {string} wasmPath - path ไปหาไฟล์ WASM
     * @param {object} options - AnalysisOptions config
     */
    async setup(wasmPath, options) {
        const wasm = await import(wasmPath);
        await wasm.default();

        const defaultOptions = {
            ema1_period: 20, ema1_type: "EMA",
            ema2_period: 50, ema2_type: "EMA",
            ema3_period: 200, ema3_type: "EMA",
            atr_period: 14, atr_multiplier: 2.0,
            bb_period: 20, ci_period: 14, adx_period: 14, rsi_period: 14,
            flat_threshold: 0.2, macd_narrow: 0.15,
            ...options
        };

        // CPU Generator (ใช้สำหรับ tick-by-tick เสมอ)
        this.cpuGenerator = new wasm.WasmAnalysisGenerator(JSON.stringify(defaultOptions));

        // GPU Manager (ใช้สำหรับ batch compute)
        try {
            this.gpuManager = await wasm.GpuAnalysisManager.initialize();
            this.gpuAvailable = true;
            console.log("✅ [GPU] WebGPU พร้อมใช้งาน");
        } catch (e) {
            this.gpuAvailable = false;
            console.warn("⚠️ [GPU] WebGPU ไม่รองรับ จะใช้ CPU แทน:", e.message || e);
        }

        this.ready = true;
        console.log("✅ [GPU] ระบบพร้อมใช้งาน (GPU:", this.gpuAvailable ? "ON" : "OFF", ")");
    }

    /**
     * โหลดแท่งเทียนย้อนหลัง
     */
    loadHistory(candles) {
        if (!this.ready) throw new Error("ยังไม่ได้ setup()");
        this.cpuGenerator.initialize(JSON.stringify(candles));
        console.log(`✅ [GPU] โหลดประวัติ ${candles.length} แท่ง (ผ่าน CPU Generator)`);
    }

    /**
     * Batch คำนวณ SMA บน GPU (สำหรับ Backtesting)
     * @param {number[]} prices - array ราคา close
     * @returns {Float32Array} ผลลัพธ์ SMA
     */
    async batchSMA(prices) {
        if (!this.gpuAvailable) {
            console.warn("[GPU] ไม่มี GPU → ใช้ CPU คำนวณ batch แทน");
            return this._cpuBatchSMA(prices);
        }

        const float32 = new Float32Array(prices);
        const result = await this.gpuManager.dispatch_compute(float32);
        console.log(`✅ [GPU] คำนวณ SMA ${prices.length} จุด บน GPU เสร็จ`);
        return result;
    }

    /**
     * CPU fallback สำหรับ batch SMA
     */
    _cpuBatchSMA(prices, period = 20) {
        const result = new Float32Array(prices.length);
        for (let i = 0; i < prices.length; i++) {
            if (i < period - 1) {
                result[i] = 0;
            } else {
                let sum = 0;
                for (let j = i - period + 1; j <= i; j++) sum += prices[j];
                result[i] = sum / period;
            }
        }
        return result;
    }

    /**
     * Real-time tick → AnalysisResult → กลยุทธ์
     * (ใช้ CPU Generator เพราะ GPU ไม่เหมาะกับ tick-by-tick)
     */
    onTick(price, time) {
        if (!this.ready) return;

        const analysis = this.cpuGenerator.append_tick(price, time);
        if (!analysis) return;

        if (this.onAnalysis) this.onAnalysis(analysis);

        const signal = evaluateAllStrategies(analysis);
        signal.choppy_zone = getChoppyZone(analysis.choppy_indicator);
        signal.risk = calculateRisk(analysis);
        signal.gpu_available = this.gpuAvailable;

        if (this.onSignal) this.onSignal(signal);
        return signal;
    }
}

// Helper (ใช้เดียวกับ strategy_cpu.js)
function getChoppyZone(choppy) {
    const c = choppy || 100;
    if (c < 38.2) return "A_StrongTrend";
    if (c < 50) return "B_ModerateTrend";
    if (c <= 61.8) return "C_Transition";
    return "D_Sideways";
}

// ============================================================
//  ตัวอย่างการใช้งาน
// ============================================================
/*
<script src="strategy_engine.js"></script>
<script src="strategy_gpu.js"></script>
<script>
    const bot = new StrategyGPU();

    await bot.setup('./pkg/indicator_math.js', {});
    bot.loadHistory(candleHistoryArray);

    // Backtesting: คำนวณ SMA ทีเดียว 10,000 จุดบน GPU
    const smaResults = await bot.batchSMA(closePricesArray);

    // Real-time
    bot.onSignal = (signal) => {
        console.log(`[${signal.choppy_zone}] ${signal.action} (GPU: ${signal.gpu_available})`);
    };

    derivWs.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.tick) bot.onTick(data.tick.quote, data.tick.epoch);
    };
</script>
*/
