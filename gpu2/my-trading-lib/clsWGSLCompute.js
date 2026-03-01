/**
 * ============================================================================
 * clsWGSLCompute.js — WebGPU (WGSL) Compute Engine for Technical Indicators
 * ============================================================================
 * 
 * คลาสสำหรับคำนวณ Technical Indicators (EMA, RSI, Choppiness Index)
 * โดยใช้ Native WebGPU (WGSL Shaders) + Smart CPU/GPU auto-selection
 * 
 * ============================================================================
 * วิธีนำไปใช้ (HOW TO USE)
 * ============================================================================
 * 
 * 1. ใส่ <script> ใน HTML:
 *    <script src="js/clsWGSLCompute.js"></script>
 * 
 * 2. สร้าง instance (ใช้ getInstance() เพื่อ cache):
 *    const engine = await WGSLComputeEngine.getInstance();
 * 
 * 3. เรียกใช้งาน:
 * 
 *    // === วิธีที่ 1: compute() — คำนวณทุก indicator ให้อัตโนมัติ (แนะนำ) ===
 *    const results = await engine.compute(assetsData, options);
 * 
 *    // === วิธีที่ 2: เรียกแต่ละ indicator แยก ===
 *    const ema = engine.computeEMA(closes, 9);
 *    const rsi = engine.computeRSI(closes, 14);
 *    const ci  = engine.computeCI(highs, lows, closes, 14);
 * 
 *    // === วิธีที่ 3: batch GPU compute (สำหรับ data มาก > 1000 points) ===
 *    const gpuResults = await engine.computeGPU(assetsData, 14, 14);
 * 
 * ============================================================================
 * INPUT — สำหรับ compute() (วิธีที่ 1)
 * ============================================================================
 * 
 * @param {Array<Object>} assetsData — Array ของ asset data:
 *   [
 *     {
 *       closes: [100.5, 101.2, 99.8, ...],  // Array<number> — ราคาปิด
 *       highs:  [101.0, 102.0, 100.5, ...],  // Array<number> — ราคาสูงสุด
 *       lows:   [99.0, 100.0, 98.5, ...]     // Array<number> — ราคาต่ำสุด
 *     },
 *     { closes: [...], highs: [...], lows: [...] },  // asset 2
 *     ...
 *   ]
 * 
 * @param {Object} options — (optional) ตั้งค่า:
 *   {
 *     emaPeriods: { short: 9, medium: 25, long: 99 },  // EMA periods
 *     rsiPeriod: 14,                                     // RSI period
 *     ciPeriod: 14,                                      // Choppiness Index period
 *     forceGPU: false,                                   // บังคับใช้ GPU (default: auto)
 *     forceCPU: false,                                   // บังคับใช้ CPU (default: auto)
 *     gpuThreshold: 1000                                 // จำนวน data points ที่จะสลับไป GPU
 *   }
 * 
 * ============================================================================
 * OUTPUT — สำหรับ compute() (วิธีที่ 1)
 * ============================================================================
 * 
 * @returns {Object} — ผลลัพธ์:
 *   {
 *     results: [                              // Array ตาม assets ที่ส่งเข้ามา
 *       {
 *         ema: {
 *           short:  [100.5, 100.8, ...],      // EMA short period
 *           medium: [100.5, 100.6, ...],      // EMA medium period
 *           long:   [100.5, 100.5, ...]       // EMA long period
 *         },
 *         rsi: [50, 50, ..., 65.3, 58.1, ...],  // RSI values (index < period = 50)
 *         ci:  [50, 50, ..., 42.1, 55.8, ...]   // Choppiness Index (index < period = 50)
 *       },
 *       { ema: {...}, rsi: [...], ci: [...] },   // asset 2
 *       ...
 *     ],
 *     timing: {
 *       total: 5.23,          // ms — เวลารวม
 *       dataPrep: 0.12,       // ms — เตรียมข้อมูล
 *       compute: 3.45,        // ms — คำนวณ RSI + CI
 *       ema: 1.66,            // ms — คำนวณ EMA
 *       method: 'GPU (WGSL)'  // วิธีที่ใช้: 'GPU (WGSL)' หรือ 'CPU'
 *     }
 *   }
 * 
 * ============================================================================
 * OUTPUT — สำหรับ individual methods (วิธีที่ 2)
 * ============================================================================
 * 
 * computeEMA(prices, period)  → Array<number>  — EMA values (same length as input)
 * computeRSI(prices, period)  → Array<number>  — RSI values (index < period = 50)
 * computeCI(h, l, c, period)  → Array<number>  — CI values  (index < period = 50)
 * 
 * ============================================================================
 * PERFORMANCE NOTES
 * ============================================================================
 * 
 * - Data ≤ 1,000 points: CPU เร็วกว่า (ไม่มี mapAsync overhead)
 * - Data > 1,000 points: GPU (WGSL) เร็วกว่า (parallel compute ชนะ)
 * - Engine ถูก cache → สร้าง device + compile pipeline ครั้งเดียว
 * - GPU batch: ALL assets → 1 encoder → 1 submit → 1 mapAsync
 * - EMA ทำบน CPU เสมอ (เพราะเป็น sequential: ema[i] = f(ema[i-1]))
 * 
 * ============================================================================
 * BROWSER REQUIREMENTS
 * ============================================================================
 * 
 * - Chrome 113+ / Edge 113+ / Firefox (Nightly with flag)
 * - ถ้า WebGPU ไม่รองรับ จะ fallback ไป CPU อัตโนมัติ
 * - เปิด flag: chrome://flags/#enable-unsafe-webgpu (ถ้าจำเป็น)
 * 
 * ============================================================================
 * EXAMPLE — ใช้กับ candle data จาก API
 * ============================================================================
 * 
 *   <script src="js/clsWGSLCompute.js"></script>
 *   <script>
 *     async function analyze(candles) {
 *       const engine = await WGSLComputeEngine.getInstance();
 *       
 *       const assetsData = [{
 *         closes: candles.map(c => c.close),
 *         highs:  candles.map(c => c.high),
 *         lows:   candles.map(c => c.low),
 *       }];
 *       
 *       const { results, timing } = await engine.compute(assetsData);
 *       
 *       console.log('RSI:', results[0].rsi);
 *       console.log('CI:', results[0].ci);
 *       console.log('EMA9:', results[0].ema.short);
 *       console.log(`Done in ${timing.total.toFixed(2)}ms using ${timing.method}`);
 *     }
 *   </script>
 * 
 * ============================================================================
 * EXAMPLE — Multi-asset batch
 * ============================================================================
 * 
 *   const engine = await WGSLComputeEngine.getInstance();
 *   
 *   const assetsData = symbols.map(symbol => ({
 *     closes: allCandles[symbol].map(c => c.close),
 *     highs:  allCandles[symbol].map(c => c.high),
 *     lows:   allCandles[symbol].map(c => c.low),
 *   }));
 *   
 *   const { results, timing } = await engine.compute(assetsData, {
 *     emaPeriods: { short: 9, medium: 25, long: 99 },
 *     rsiPeriod: 14,
 *     ciPeriod: 14
 *   });
 *   
 *   results.forEach((r, i) => {
 *     console.log(`${symbols[i]}: RSI=${r.rsi.at(-1)?.toFixed(2)}, CI=${r.ci.at(-1)?.toFixed(2)}`);
 *   });
 * 
 * ============================================================================
 */

// =============================================
// WGSL Shader Code (Native WebGPU)
// =============================================

const _WGSL_PRICE_CHANGES = `
    @group(0) @binding(0) var<storage, read> prices: array<f32>;
    @group(0) @binding(1) var<storage, read_write> changes: array<f32>;

    @compute @workgroup_size(64)
    fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
        let idx = gid.x;
        if (idx >= arrayLength(&prices)) { return; }
        if (idx == 0u) {
            changes[idx] = 0.0;
        } else {
            changes[idx] = prices[idx] - prices[idx - 1u];
        }
    }
`;

const _WGSL_RSI = `
    @group(0) @binding(0) var<storage, read> changes: array<f32>;
    @group(0) @binding(1) var<storage, read_write> rsi_out: array<f32>;
    @group(0) @binding(2) var<uniform> params: vec4<f32>; // x=period

    @compute @workgroup_size(64)
    fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
        let idx = gid.x;
        let len = arrayLength(&changes);
        if (idx >= len) { return; }
        let period = u32(params.x);
        if (idx < period) {
            rsi_out[idx] = 50.0;
            return;
        }
        var gains: f32 = 0.0;
        var losses: f32 = 0.0;
        for (var j: u32 = 0u; j < period; j = j + 1u) {
            let c = changes[idx - j];
            if (c > 0.0) { gains = gains + c; } else { losses = losses - c; }
        }
        let avgLoss = losses / f32(period);
        if (avgLoss == 0.0) {
            rsi_out[idx] = 100.0;
        } else {
            let rs = (gains / f32(period)) / avgLoss;
            rsi_out[idx] = 100.0 - 100.0 / (1.0 + rs);
        }
    }
`;

const _WGSL_TRUE_RANGE = `
    @group(0) @binding(0) var<storage, read> highs: array<f32>;
    @group(0) @binding(1) var<storage, read> lows: array<f32>;
    @group(0) @binding(2) var<storage, read> closes: array<f32>;
    @group(0) @binding(3) var<storage, read_write> tr_out: array<f32>;

    @compute @workgroup_size(64)
    fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
        let idx = gid.x;
        if (idx >= arrayLength(&highs)) { return; }
        if (idx == 0u) {
            tr_out[idx] = highs[0u] - lows[0u];
            return;
        }
        let hl = highs[idx] - lows[idx];
        let hc = abs(highs[idx] - closes[idx - 1u]);
        let lc = abs(lows[idx] - closes[idx - 1u]);
        tr_out[idx] = max(hl, max(hc, lc));
    }
`;

const _WGSL_CHOPPINESS = `
    @group(0) @binding(0) var<storage, read> highs: array<f32>;
    @group(0) @binding(1) var<storage, read> lows: array<f32>;
    @group(0) @binding(2) var<storage, read> tr: array<f32>;
    @group(0) @binding(3) var<storage, read_write> ci_out: array<f32>;
    @group(0) @binding(4) var<uniform> params: vec4<f32>; // x=period, y=logPeriod

    @compute @workgroup_size(64)
    fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
        let idx = gid.x;
        let len = arrayLength(&highs);
        if (idx >= len) { return; }
        let period = u32(params.x);
        let logPeriod = params.y;
        if (idx < period) {
            ci_out[idx] = 50.0;
            return;
        }
        var sumTR: f32 = 0.0;
        var maxH: f32 = highs[idx];
        var minL: f32 = lows[idx];
        for (var j: u32 = 0u; j < period; j = j + 1u) {
            let k = idx - j;
            sumTR = sumTR + tr[k];
            if (highs[k] > maxH) { maxH = highs[k]; }
            if (lows[k] < minL) { minL = lows[k]; }
        }
        let range = maxH - minL;
        if (range == 0.0) {
            ci_out[idx] = 50.0;
        } else {
            ci_out[idx] = (log(sumTR / range) / log(10.0)) / logPeriod * 100.0;
        }
    }
`;


// =============================================
// Global cache for singleton pattern
// =============================================
let _wgslEngineInstance = null;


/**
 * WGSLComputeEngine — WebGPU/CPU Hybrid Compute Engine
 * 
 * Smart engine ที่เลือก GPU หรือ CPU อัตโนมัติตามขนาด data
 * - ≤ 1,000 data points → ใช้ CPU (เร็วกว่า เพราะไม่มี mapAsync overhead)
 * - > 1,000 data points → ใช้ GPU WGSL (parallel compute ชนะ)
 */
class WGSLComputeEngine {

    constructor() {
        /** @type {GPUDevice|null} */
        this.device = null;
        /** @type {Object} - compiled compute pipelines */
        this.pipelines = {};
        /** @type {boolean} - whether WebGPU is available */
        this.gpuAvailable = false;
        /** @type {number} - threshold to switch to GPU (total data points) */
        this.gpuThreshold = 1000;
    }

    // =============================================
    // Singleton — getInstance()
    // Device + pipeline ถูกสร้างครั้งเดียว แล้ว cache ไว้ใช้ซ้ำ
    // =============================================

    /**
     * Get or create cached engine instance
     * @returns {Promise<WGSLComputeEngine>}
     */
    static async getInstance() {
        if (_wgslEngineInstance && _wgslEngineInstance.device) return _wgslEngineInstance;
        const engine = new WGSLComputeEngine();
        await engine.initialize();
        _wgslEngineInstance = engine;
        return engine;
    }

    /**
     * Initialize WebGPU device and compile all shader pipelines
     * ถ้า WebGPU ไม่รองรับ จะ fallback ไป CPU mode อัตโนมัติ
     */
    async initialize() {
        try {
            if (!navigator.gpu) throw new Error('WebGPU not supported');
            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) throw new Error('No GPU adapter found');
            this.device = await adapter.requestDevice();
            this.gpuAvailable = true;
            console.log('[WGSLCompute] WebGPU device initialized ✓');

            // Pre-compile all shader pipelines
            const make = (code) => this.device.createShaderModule({ code });
            this.pipelines.priceChanges = this.device.createComputePipeline({
                layout: 'auto', compute: { module: make(_WGSL_PRICE_CHANGES), entryPoint: 'main' }
            });
            this.pipelines.rsi = this.device.createComputePipeline({
                layout: 'auto', compute: { module: make(_WGSL_RSI), entryPoint: 'main' }
            });
            this.pipelines.trueRange = this.device.createComputePipeline({
                layout: 'auto', compute: { module: make(_WGSL_TRUE_RANGE), entryPoint: 'main' }
            });
            this.pipelines.choppiness = this.device.createComputePipeline({
                layout: 'auto', compute: { module: make(_WGSL_CHOPPINESS), entryPoint: 'main' }
            });
            console.log('[WGSLCompute] Pipelines compiled ✓');
        } catch (e) {
            console.warn('[WGSLCompute] GPU init failed, using CPU mode:', e.message);
            this.gpuAvailable = false;
        }
    }


    // =============================================
    // HIGH-LEVEL API — compute()
    // คำนวณทุก indicator ให้อัตโนมัติ (EMA + RSI + CI)
    // =============================================

    /**
     * Compute all indicators for multiple assets
     * เลือก GPU/CPU อัตโนมัติตามขนาด data
     * 
     * @param {Array<{closes: number[], highs: number[], lows: number[]}>} assetsData
     * @param {Object} [options]
     * @param {Object} [options.emaPeriods] - { short: 9, medium: 25, long: 99 }
     * @param {number} [options.rsiPeriod] - default 14
     * @param {number} [options.ciPeriod] - default 14
     * @param {boolean} [options.forceGPU] - force GPU compute
     * @param {boolean} [options.forceCPU] - force CPU compute
     * @param {number} [options.gpuThreshold] - data points threshold for GPU (default 1000)
     * @returns {Promise<{results: Array, timing: Object}>}
     */
    async compute(assetsData, options = {}) {
        const emaPeriods = options.emaPeriods || { short: 9, medium: 25, long: 99 };
        const rsiPeriod = options.rsiPeriod || 14;
        const ciPeriod = options.ciPeriod || 14;
        const threshold = options.gpuThreshold || this.gpuThreshold;
        const useAnalysisV2 = options.useAnalysisV2 || false;

        const t0 = performance.now();

        // Calculate total data points
        const totalPoints = assetsData.reduce((sum, d) => sum + d.closes.length, 0);

        // Decide compute method
        let useGPU = this.gpuAvailable && totalPoints > threshold;
        if (options.forceGPU && this.gpuAvailable) useGPU = true;
        if (options.forceCPU) useGPU = false;

        const t1 = performance.now();

        // Compute RSI + CI
        let rsiCiResults;
        const computeMethod = useGPU ? 'GPU (WGSL)' : 'CPU';

        if (useGPU) {
            rsiCiResults = await this.computeGPU(assetsData, rsiPeriod, ciPeriod);
        } else {
            rsiCiResults = assetsData.map(d => ({
                rsi: this.computeRSI(d.closes, rsiPeriod),
                ci: this.computeCI(d.highs, d.lows, d.closes, ciPeriod),
            }));
        }

        const t2 = performance.now();

        // Compute EMA (always CPU — sequential operation)
        // Note: needed for the raw output OR if we want to pass to V2 (optimization)
        const results = assetsData.map((d, idx) => ({
            ema: {
                short: this.computeEMA(d.closes, emaPeriods.short),
                medium: this.computeEMA(d.closes, emaPeriods.medium),
                long: this.computeEMA(d.closes, emaPeriods.long),
            },
            rsi: rsiCiResults[idx].rsi,
            ci: rsiCiResults[idx].ci,
        }));

        const t3 = performance.now();
        let finalResults = results;
        let t4 = t3;

        // Integration with AnalysisGeneratorV2
        if (useAnalysisV2 && typeof AnalysisGeneratorV2 !== 'undefined') {
            finalResults = assetsData.map((d, idx) => {
                if (!d.candles) {
                    console.warn(`[WGSLCompute] No candles data for asset ${idx}, skipping V2 analysis`);
                    return [];
                }

                // Create a Proxy GPU object that returns our PRE-CALCULATED results
                // This prevents V2 from re-calculating RSI/CI and allows it to "think" it's using GPU
                const preCalcRsi = results[idx].rsi;
                const preCalcCi = results[idx].ci;

                const gpuProxy = {
                    isGPUAvailable: true,
                    calculateRSI: (closes, period) => preCalcRsi, // Return pre-calc array
                    calculateChoppiness: (h, l, c, period) => preCalcCi // Return pre-calc array
                };

                const genOptions = {
                    ema1Period: emaPeriods.short,
                    ema2Period: emaPeriods.medium,
                    ema3Period: emaPeriods.long,
                    rsiPeriod: rsiPeriod,
                    ciPeriod: ciPeriod,
                    // Pass other options if needed
                };

                const generator = new AnalysisGeneratorV2(d.candles, genOptions, gpuProxy);
                return generator.generate();
            });
            t4 = performance.now();
        }

        return {
            results: finalResults,
            timing: {
                total: t4 - t0,
                dataPrep: t1 - t0,
                compute: t2 - t1,
                ema: t3 - t2,
                analysisV2: useAnalysisV2 ? (t4 - t3) : 0,
                method: computeMethod,
                totalPoints,
                assetsCount: assetsData.length,
            }
        };
    }


    // =============================================
    // INDIVIDUAL INDICATORS — CPU
    // =============================================

    /**
     * Compute EMA (Exponential Moving Average) — CPU only
     * EMA เป็น sequential (ema[i] = f(ema[i-1])) จึงไม่เหมาะกับ GPU
     * 
     * @param {number[]} prices - close prices
     * @param {number} period - EMA period (e.g., 9, 25, 99)
     * @returns {number[]} - EMA values (same length as input)
     */
    computeEMA(prices, period) {
        const k = 2.0 / (period + 1);
        const ema = new Array(prices.length);
        ema[0] = prices[0];
        for (let i = 1; i < prices.length; i++) {
            ema[i] = (prices[i] - ema[i - 1]) * k + ema[i - 1];
        }
        return ema;
    }

    /**
     * Compute RSI (Relative Strength Index) — CPU
     * 
     * @param {number[]} prices - close prices
     * @param {number} period - RSI period (default 14)
     * @returns {number[]} - RSI values (index < period = 50, otherwise 0-100)
     */
    computeRSI(prices, period = 14) {
        const n = prices.length;
        const result = new Array(n).fill(50);

        // Price changes
        const changes = new Array(n);
        changes[0] = 0;
        for (let i = 1; i < n; i++) changes[i] = prices[i] - prices[i - 1];

        // RSI calculation
        for (let i = period; i < n; i++) {
            let gains = 0, losses = 0;
            for (let j = 0; j < period; j++) {
                const c = changes[i - j];
                if (c > 0) gains += c; else losses -= c;
            }
            const avgLoss = losses / period;
            if (avgLoss === 0) {
                result[i] = 100;
            } else {
                const rs = (gains / period) / avgLoss;
                result[i] = 100 - 100 / (1 + rs);
            }
        }
        return result;
    }

    /**
     * Compute Choppiness Index — CPU
     * 
     * @param {number[]} highs - high prices
     * @param {number[]} lows - low prices
     * @param {number[]} closes - close prices
     * @param {number} period - CI period (default 14)
     * @returns {number[]} - CI values (index < period = 50, typically 0-100)
     */
    computeCI(highs, lows, closes, period = 14) {
        const n = highs.length;
        const result = new Array(n).fill(50);
        const logPeriod = Math.log10(period);

        // True Range
        const tr = new Array(n);
        tr[0] = highs[0] - lows[0];
        for (let i = 1; i < n; i++) {
            const hl = highs[i] - lows[i];
            const hc = Math.abs(highs[i] - closes[i - 1]);
            const lc = Math.abs(lows[i] - closes[i - 1]);
            tr[i] = Math.max(hl, hc, lc);
        }

        // Choppiness Index
        for (let i = period; i < n; i++) {
            let sumTR = 0, maxH = highs[i], minL = lows[i];
            for (let j = 0; j < period; j++) {
                const k = i - j;
                sumTR += tr[k];
                if (highs[k] > maxH) maxH = highs[k];
                if (lows[k] < minL) minL = lows[k];
            }
            const range = maxH - minL;
            if (range === 0) {
                result[i] = 50;
            } else {
                result[i] = (Math.log10(sumTR / range) / logPeriod) * 100;
            }
        }
        return result;
    }


    // =============================================
    // GPU BATCH COMPUTE
    // ALL assets → 1 encoder → 1 submit → 1 mapAsync
    // =============================================

    /**
     * Batch compute RSI + CI for multiple assets using WebGPU
     * ใช้เมื่อ data > 1000 points (GPU parallel ชนะ CPU)
     * 
     * @param {Array<{closes: number[], highs: number[], lows: number[]}>} assetsData
     * @param {number} rsiPeriod
     * @param {number} ciPeriod
     * @returns {Promise<Array<{rsi: number[], ci: number[]}>>}
     */
    async computeGPU(assetsData, rsiPeriod = 14, ciPeriod = 14) {
        if (!this.gpuAvailable) {
            // Fallback to CPU
            return assetsData.map(d => ({
                rsi: this.computeRSI(d.closes, rsiPeriod),
                ci: this.computeCI(d.highs, d.lows, d.closes, ciPeriod),
            }));
        }

        const encoder = this.device.createCommandEncoder();
        const allBuffers = [];
        const readbackPairs = [];

        // Shared uniform buffers (same period for all assets)
        const rsiParamBuf = this._createBuffer(new Float32Array([rsiPeriod, 0, 0, 0]), GPUBufferUsage.UNIFORM);
        const ciParamBuf = this._createBuffer(new Float32Array([ciPeriod, Math.log10(ciPeriod), 0, 0]), GPUBufferUsage.UNIFORM);
        allBuffers.push(rsiParamBuf, ciParamBuf);

        for (const assetData of assetsData) {
            const n = assetData.closes.length;
            const byteSize = n * 4;
            const wgCount = Math.ceil(n / 64);

            // Input buffers
            const pricesBuf = this._createBuffer(new Float32Array(assetData.closes), GPUBufferUsage.STORAGE);
            const highsBuf = this._createBuffer(new Float32Array(assetData.highs), GPUBufferUsage.STORAGE);
            const lowsBuf = this._createBuffer(new Float32Array(assetData.lows), GPUBufferUsage.STORAGE);

            // Intermediate + output buffers
            const changesBuf = this.device.createBuffer({ size: byteSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
            const rsiOutBuf = this.device.createBuffer({ size: byteSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
            const trBuf = this.device.createBuffer({ size: byteSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
            const ciOutBuf = this.device.createBuffer({ size: byteSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });

            // Read-back staging buffers
            const rsiReadBuf = this.device.createBuffer({ size: byteSize, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
            const ciReadBuf = this.device.createBuffer({ size: byteSize, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });

            allBuffers.push(pricesBuf, highsBuf, lowsBuf, changesBuf, rsiOutBuf, trBuf, ciOutBuf, rsiReadBuf, ciReadBuf);

            // Bind groups
            const bgChanges = this.device.createBindGroup({
                layout: this.pipelines.priceChanges.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: pricesBuf } },
                    { binding: 1, resource: { buffer: changesBuf } },
                ]
            });
            const bgRSI = this.device.createBindGroup({
                layout: this.pipelines.rsi.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: changesBuf } },
                    { binding: 1, resource: { buffer: rsiOutBuf } },
                    { binding: 2, resource: { buffer: rsiParamBuf } },
                ]
            });
            const bgTR = this.device.createBindGroup({
                layout: this.pipelines.trueRange.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: highsBuf } },
                    { binding: 1, resource: { buffer: lowsBuf } },
                    { binding: 2, resource: { buffer: pricesBuf } },
                    { binding: 3, resource: { buffer: trBuf } },
                ]
            });
            const bgCI = this.device.createBindGroup({
                layout: this.pipelines.choppiness.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: highsBuf } },
                    { binding: 1, resource: { buffer: lowsBuf } },
                    { binding: 2, resource: { buffer: trBuf } },
                    { binding: 3, resource: { buffer: ciOutBuf } },
                    { binding: 4, resource: { buffer: ciParamBuf } },
                ]
            });

            // 4 compute passes per asset (all in SAME encoder)
            const p1 = encoder.beginComputePass();
            p1.setPipeline(this.pipelines.priceChanges);
            p1.setBindGroup(0, bgChanges);
            p1.dispatchWorkgroups(wgCount);
            p1.end();

            const p2 = encoder.beginComputePass();
            p2.setPipeline(this.pipelines.rsi);
            p2.setBindGroup(0, bgRSI);
            p2.dispatchWorkgroups(wgCount);
            p2.end();

            const p3 = encoder.beginComputePass();
            p3.setPipeline(this.pipelines.trueRange);
            p3.setBindGroup(0, bgTR);
            p3.dispatchWorkgroups(wgCount);
            p3.end();

            const p4 = encoder.beginComputePass();
            p4.setPipeline(this.pipelines.choppiness);
            p4.setBindGroup(0, bgCI);
            p4.dispatchWorkgroups(wgCount);
            p4.end();

            // Copy results to staging (still in same encoder!)
            encoder.copyBufferToBuffer(rsiOutBuf, 0, rsiReadBuf, 0, byteSize);
            encoder.copyBufferToBuffer(ciOutBuf, 0, ciReadBuf, 0, byteSize);

            readbackPairs.push({ rsiRead: rsiReadBuf, ciRead: ciReadBuf });
        }

        // 1 SUBMIT for ALL assets
        this.device.queue.submit([encoder.finish()]);

        // 1 BATCH mapAsync for ALL read buffers
        await Promise.all(
            readbackPairs.flatMap(p => [
                p.rsiRead.mapAsync(GPUMapMode.READ),
                p.ciRead.mapAsync(GPUMapMode.READ),
            ])
        );

        // Read results
        const results = readbackPairs.map(p => {
            const rsi = Array.from(new Float32Array(p.rsiRead.getMappedRange()).slice());
            const ci = Array.from(new Float32Array(p.ciRead.getMappedRange()).slice());
            p.rsiRead.unmap();
            p.ciRead.unmap();
            return { rsi, ci };
        });

        // Cleanup
        allBuffers.forEach(b => b.destroy());

        return results;
    }


    // =============================================
    // INTERNAL HELPERS
    // =============================================

    /**
     * Create GPU buffer from Float32Array with mappedAtCreation
     * @private
     */
    _createBuffer(data, usage) {
        const buf = this.device.createBuffer({
            size: data.byteLength,
            usage: usage | GPUBufferUsage.COPY_SRC,
            mappedAtCreation: true,
        });
        new Float32Array(buf.getMappedRange()).set(data);
        buf.unmap();
        return buf;
    }

    /**
     * Check if GPU is available
     * @returns {boolean}
     */
    isGPUAvailable() {
        return this.gpuAvailable;
    }

    /**
     * Get engine info
     * @returns {Object}
     */
    getInfo() {
        return {
            gpuAvailable: this.gpuAvailable,
            gpuThreshold: this.gpuThreshold,
            pipelinesCompiled: Object.keys(this.pipelines).length,
            cached: _wgslEngineInstance === this,
        };
    }
}
