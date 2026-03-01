// ============================================================
//  strategy_cpu.js — Version CPU (WASM)
//  คำนวณ AnalysisResult ใน Browser ผ่าน WasmAnalysisGenerator
//  ไม่ต้องมี Rust Server
// ============================================================

class StrategyCPU {
    constructor() {
        this.generator = null;
        this.ready = false;
        this.onSignal = null;  // callback(signal)
        this.onAnalysis = null; // callback(analysis) — สำหรับแสดงผล UI
    }

    /**
     * ตั้งค่าและโหลด WASM module
     * @param {string} wasmPath - path ไปหาไฟล์ .wasm (เช่น './pkg/indicator_math_bg.wasm')
     * @param {object} options - AnalysisOptions config
     */
    async setup(wasmPath, options) {
        // โหลด WASM
        const wasm = await import(wasmPath);
        await wasm.default();

        // ค่า default ถ้าไม่ได้ส่งมา
        const defaultOptions = {
            ema1_period: 20, ema1_type: "EMA",
            ema2_period: 50, ema2_type: "EMA",
            ema3_period: 200, ema3_type: "EMA",
            atr_period: 14, atr_multiplier: 2.0,
            bb_period: 20, ci_period: 14, adx_period: 14, rsi_period: 14,
            flat_threshold: 0.2, macd_narrow: 0.15,
            ...options
        };

        this.generator = new wasm.WasmAnalysisGenerator(JSON.stringify(defaultOptions));
        this.ready = true;
        console.log("✅ [CPU] WASM AnalysisGenerator พร้อมใช้งาน");
    }

    /**
     * โหลดแท่งเทียนย้อนหลัง
     * @param {Array} candles - [{time, open, high, low, close}, ...]
     */
    loadHistory(candles) {
        if (!this.ready) throw new Error("ยังไม่ได้ setup()");
        this.generator.initialize(JSON.stringify(candles));
        console.log(`✅ [CPU] โหลดประวัติแท่งเทียน ${candles.length} แท่ง`);
    }

    /**
     * รับ tick ใหม่ → คำนวณ → ประเมินกลยุทธ์
     * @param {number} price - ราคาปัจจุบัน
     * @param {number} time - Unix timestamp (seconds)
     */
    onTick(price, time) {
        if (!this.ready) return;

        const analysis = this.generator.append_tick(price, time);
        if (!analysis) return;

        // ส่ง analysis ไปแสดงผล (ถ้ามี listener)
        if (this.onAnalysis) this.onAnalysis(analysis);

        // ประเมินกลยุทธ์
        const signal = evaluateAllStrategies(analysis);
        signal.choppy_zone = getChoppyZone(analysis.choppy_indicator);
        signal.risk = calculateRisk(analysis);

        if (this.onSignal) this.onSignal(signal);
        return signal;
    }
}

// Helper: บอกโซน Choppy
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
<script src="strategy_cpu.js"></script>
<script>
    const bot = new StrategyCPU();

    // 1. Setup
    await bot.setup('./pkg/indicator_math.js', { ema1_period: 20 });

    // 2. โหลดประวัติ
    bot.loadHistory(candleHistoryArray);

    // 3. ตั้ง callback
    bot.onSignal = (signal) => {
        console.log(`[${signal.choppy_zone}] ${signal.action} → ${signal.strategy}`);
        if (signal.action !== "WAIT") {
            // ส่งคำสั่งเทรดไปยัง Deriv API
        }
    };

    // 4. รับ tick จาก Deriv WebSocket
    derivWs.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.tick) {
            bot.onTick(data.tick.quote, data.tick.epoch);
        }
    };
</script>
*/
