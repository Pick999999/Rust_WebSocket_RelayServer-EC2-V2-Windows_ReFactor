/**
 * AnalysisGeneratorV2 Class
 * 
 * ====================================================================================================
 * 📌 คำแนะนำการใช้งาน (Usage Instructions)
 * ====================================================================================================
 * 
 * 1. ต้องนำเข้าไฟล์ Script เหล่านี้ในส่วน <head> ของไฟล์ HTML ก่อนเรียกใช้งาน:
 *    <script src="js/indicators.js"></script>       <!-- ไลบรารีคำนวณ Indicator พื้นฐาน -->
 *    <script src="js/SMCIndicator.js"></script>     <!-- ไลบรารีคำนวณ Smart Money Concepts -->
 *    <script src="webgpu-indicators.js"></script>   <!-- ไลบรารี WebGPU (Optional) -->
 *    <script src="js/clsAnalysisGeneratorV2.js"></script> <!-- คลาสนี้ -->
 * 
 * ====================================================================================================
 * 🚀 การใช้งาน GPU (GPU Usage) - For High Performance Analysis
 * ====================================================================================================
 * 
 * คลาสนี้รองรับการใช้งาน WebGPU เพื่อเร่งความเร็วในการคำนวณ Indicator (RSI, Choppiness Index)
 * โดยต้องส่ง instance ของ WebGPUIndicators ที่ initialize แล้วเข้ามาใน constructor
 * 
 * วิธีการเรียกใช้งาน (Example Usage with GPU):
 * 
 *    // 1. สร้างและ Initialize GPU
 *    const gpu = new WebGPUIndicators();
 *    await gpu.initialize(); // ต้องรอให้ GPU พร้อมใช้งาน
 * 
 *    // 2. ส่ง gpu instance เข้าไปใน constructor (Argument ตัวที่ 3)
 *    const generator = new AnalysisGeneratorV2(candleData, options, gpu);
 * 
 *    // 3. สร้างข้อมูลวิเคราะห์ (จะใช้ GPU คำนวณ RSI และ Choppiness โดยอัตโนมัติ)
 *    const analysisList = generator.generate();
 * 
 * 2. วิธีการเรียกใช้งาน (Example Usage):
 *    // เตรียมข้อมูล Candle Data (ต้องมี time, open, high, low, close)
 *    const candleData = [...]; 
 * 
 *    // กำหนด Options (สามารถเว้นว่างเพื่อใช้ค่า Default ได้)
 *    const options = {
 *        ema1Period: 7, ema1Type: 'EMA',
 *        ema2Period: 25, ema2Type: 'EMA',
 *        ema3Period: 99, ema3Type: 'EMA',
 *        ciPeriod: 14,
 *        adxPeriod: 14,
 *        smcSwingLength: 20,    // ความยาว Swing สำหรับ SMC
 *        smcInternalLength: 5   // ความยาว Internal Structure สำหรับ SMC
 *    };
 * 
 *    // สร้าง Instance
 *    const generator = new AnalysisGeneratorV2(candleData, options);
 * 
 *    // สร้างข้อมูลวิเคราะห์
 *    const analysisList = generator.generate();
 * 
 * ====================================================================================================
 * 📊 รายละเอียด Fields ใน analysisList (Data Structure)
 * ====================================================================================================
 * แต่ละ Object ใน analysisList จะประกอบด้วยค่าดังนี้:
 * 
 * [Basic Info]
 * - index              : ลำดับของแท่งเทียน (0, 1, 2, ...)
 * - candletime         : Unix Timestamp ของแท่งเทียน
 * - candletimeDisplay  : เวลาที่แสดงผล (format: HH:mm:ss)
 * - open, high, low, close : ราคา OHLC
 * - color              : สีแท่งเทียน ('Green', 'Red', 'Equal')
 * - pipSize            : ขนาดของแท่งเทียน (Absolute diff between Open/Close)
 * 
 * [Trend Indicators (EMA)]
 * - emaShortValue      : ค่า EMA ระยะสั้น (Default: 7)
 * - emaShortDirection  : ทิศทาง EMA สั้น ('Up', 'Down', 'Flat')
 * - emaMediumValue     : ค่า EMA ระยะกลาง (Default: 25)
 * - emaMediumDirection : ทิศทาง EMA กลาง ('Up', 'Down', 'Flat')
 * - emaLongValue       : ค่า EMA ระยะยาว (Default: 99)
 * - emaLongDirection   : ทิศทาง EMA ยาว ('Up', 'Down', 'Flat')
 * - UpConMediumEMA     : จำนวนแท่งต่อเนื่องที่ EMA กลางชี้ขึ้น
 * - DownConMediumEMA   : จำนวนแท่งต่อเนื่องที่ EMA กลางชี้ลง
 * - UpConLongEMA       : จำนวนแท่งต่อเนื่องที่ EMA ยาวชี้ขึ้น
 * - DownConLongEMA     : จำนวนแท่งต่อเนื่องที่ EMA ยาวชี้ลง
 * 
 * [Volatility Indicators]
 * - choppyIndicator    : ค่า Choppiness Index (CI) บอกความผันผวน (Trending < 38.2, Choppy > 61.8)
 * - atr                : Average True Range บอกระยะการแกว่งตัวเฉลี่ย
 * - bbUpper            : Bollinger Bands เส้นบน
 * - bbLower            : Bollinger Bands เส้นล่าง
 * 
 * [Momentum Indicators]
 * - rsiValue           : Relative Strength Index (Overbought > 70, Oversold < 30)
 * - adxValue           : Average Directional Index บอกความแรงของเทรนด์ (> 25 คือมีเทรนด์)
 * 
 * [Smart Money Concepts (SMC)]
 * - smcSwing           : จุด Swing Points ('HH'=Higher High, 'HL'=Higher Low, 'LH', 'LL')
 * - smcStructure       : การเปลี่ยนโครงสร้างราคา (เช่น 'BOS-bullish' หรือ 'CHoCH-bearish')
 * - smcOrderBlock      : แท่งที่เป็น Order Block ('bullish', 'bearish') หรือ null
 * - smcFVG             : แท่งที่มี Fair Value Gap ('bullish', 'bearish') หรือ null
 * - smcStrongWeak      : ระดับราคาที่แข็งแรง/อ่อนแอ ('strong-high', 'weak-low')
 * 
 * ====================================================================================================
 * 📊 วิธีการนำไปวาดกราฟ (Charting Guide)
 * ====================================================================================================
 * หากต้องการวาดกราฟ SMC (Order Blocks, FVG, Structure) ให้เรียกใช้ method:
 * 
 *    const smcChartData = generator.getSMCChartData();
 * 
 * ข้อมูลที่ได้จะเป็น Object ที่ประกอบด้วย Arrays ของรูปทรงต่างๆ ดังนี้:
 * 
 * 1. smcChartData.orderBlocks (วาดกล่องสี่เหลี่ยม)
 *    - { bias: 'bullish'/'bearish', top: price, bottom: price, time: timestamp, ... }
 * 
 * 2. smcChartData.fairValueGaps (วาดกล่องสี่เหลี่ยม)
 *    - { bias: 'bullish'/'bearish', top: price, bottom: price, time: timestamp, ... }
 * 
 * 3. smcChartData.structures (วาดเส้น Break of Structure)
 *    - { type: 'BOS'/'CHoCH', level: price, time: timestamp, ... }
 * 
 * 4. smcChartData.swingPoints (วาดจุด High/Low)
 *    - { type: 'HH'/'HL', price: price, time: timestamp, ... }
 * 
 * 5. smcChartData.strongWeakLevels (วาดเส้น Strong/Weak High/Low)
 *    - { type: 'strong-high', price: price, time: timestamp, ... }
 * 
 * ====================================================================================================
 */

class AnalysisGeneratorV2 {
    constructor(candleData, options = {}, gpu = null) {
        this.candleData = candleData || [];
        this.gpu = gpu; // WebGPUIndicators instance (Optional)

        // กำหนดค่า Options (Trend, Volatility, Momentum, SMC)
        this.options = {
            // Trend & Indicators
            ema1Period: options.ema1Period || 7,
            ema1Type: (options.ema1Type || 'EMA').toUpperCase(),
            ema2Period: options.ema2Period || 25,
            ema2Type: (options.ema2Type || 'EMA').toUpperCase(),
            ema3Period: options.ema3Period || 99,
            ema3Type: (options.ema3Type || 'EMA').toUpperCase(),

            // Volatility
            atrPeriod: options.atrPeriod || 14,
            atrMultiplier: options.atrMultiplier || 1.5,
            bbPeriod: options.bbPeriod || 20,
            bbStdDev: options.bbStdDev || 2,
            ciPeriod: options.ciPeriod || 14,

            // Momentum
            adxPeriod: options.adxPeriod || 14,
            rsiPeriod: options.rsiPeriod || 14,

            // Logic Thresholds
            flatThreshold: options.flatThreshold || 0.0001,
            macdNarrow: options.macdNarrow || 0.15,

            // Smart Money Concepts (SMC)
            smcSwingLength: options.smcSwingLength || 20,
            smcInternalLength: options.smcInternalLength || 5,
            smcShowInternal: options.smcShowInternal !== false // Default true
        };

        // ตัวแปรสำหรับเก็บค่าที่คำนวณแล้ว
        this.ema1Data = [];
        this.ema2Data = [];
        this.ema3Data = [];
        this.atrData = [];
        this.ciData = [];
        this.adxData = [];
        this.rsiData = [];
        this.bbData = { upper: [], middle: [], lower: [] };

        // SMC Data
        this.smcData = null;
        this.smcChartData = null; // Raw Data for Charting

        // ผลลัพธ์สุดท้าย
        this.analysisArray = [];
    }

    // ================== INDICATOR CALCULATION METHODS (เหมือน V1) ==================

    calculateEMA(data, period) {
        if (!data || data.length === 0) return [];
        const k = 2 / (period + 1);
        let ema = data[0].close;
        return data.map((c, i) => {
            ema = (i === 0) ? c.close : (c.close * k) + (ema * (1 - k));
            return { time: c.time, value: ema };
        });
    }

    calculateWMA(data, period) {
        if (!data || data.length === 0) return [];
        const isObj = data[0] && typeof data[0] === 'object';
        const vals = isObj ? data.map(d => d.close) : data;
        const times = isObj ? data.map(d => d.time) : null;
        const res = [];

        for (let i = 0; i < vals.length; i++) {
            if (i < period - 1) {
                res.push(0);
                continue;
            }
            let num = 0, den = 0;
            for (let j = 0; j < period; j++) {
                const w = period - j;
                num += vals[i - j] * w;
                den += w;
            }
            res.push(num / den);
        }

        if (times) {
            return res.map((value, i) => ({ time: times[i], value: value }));
        }
        return res;
    }

    calculateHMA(data, period) {
        if (!data || data.length === 0) return [];
        const half = Math.max(1, Math.floor(period / 2));
        const sqrt = Math.max(1, Math.floor(Math.sqrt(period)));

        const wmaHalf = this.calculateWMA(data, half);
        const wmaFull = this.calculateWMA(data, period);

        const raw = data.map((d, i) => {
            const halfVal = wmaHalf[i] ? wmaHalf[i].value : 0;
            const fullVal = wmaFull[i] ? wmaFull[i].value : 0;
            return { time: d.time, close: 2 * halfVal - fullVal };
        });

        return this.calculateWMA(raw, sqrt);
    }

    calculateEHMA(data, period) {
        if (!data || data.length === 0) return [];
        const half = Math.max(1, Math.floor(period / 2));
        const sqrt = Math.max(1, Math.floor(Math.sqrt(period)));

        const emaHalf = this.calculateEMA(data, half);
        const emaFull = this.calculateEMA(data, period);

        const raw = data.map((d, i) => ({
            time: d.time,
            close: 2 * emaHalf[i].value - emaFull[i].value
        }));

        return this.calculateEMA(raw, sqrt);
    }

    calculateRSI(data, period) {
        // GPU Calculation
        if (this.gpu && this.gpu.isGPUAvailable) {
            try {
                // Prepare array of closes
                const closes = data.map(d => d.close);
                // WebGPU returns array of values (length = data.length)
                // Values < period are usually 50 or similar neutral value
                const rsiValues = this.gpu.calculateRSI(closes, period);

                // Map back to object structure matching CPU output
                // CPU implementation skips first 'period' elements
                const result = [];
                for (let i = period; i < rsiValues.length; i++) {
                    result.push({ time: data[i].time, value: rsiValues[i] });
                }
                return result;
            } catch (e) {
                console.warn("GPU RSI Error, falling back to CPU:", e);
            }
        }

        // CPU Calculation (Fallback)
        if (data.length < period + 1) return [];
        const result = [];
        let gains = [];
        let losses = [];

        for (let i = 1; i < data.length; i++) {
            const change = data[i].close - data[i - 1].close;
            gains.push(change > 0 ? change : 0);
            losses.push(change < 0 ? Math.abs(change) : 0);
        }

        let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
        let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

        let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        let rsi = 100 - (100 / (1 + rs));
        result.push({ time: data[period].time, value: rsi });

        for (let i = period; i < gains.length; i++) {
            avgGain = ((avgGain * (period - 1)) + gains[i]) / period;
            avgLoss = ((avgLoss * (period - 1)) + losses[i]) / period;

            rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
            rsi = 100 - (100 / (1 + rs));
            result.push({ time: data[i + 1].time, value: rsi });
        }
        return result;
    }

    calculateMA(data, period, type) {
        switch (type.toUpperCase()) {
            case 'HMA': return this.calculateHMA(data, period);
            case 'EHMA': return this.calculateEHMA(data, period);
            case 'EMA':
            default: return this.calculateEMA(data, period);
        }
    }

    calculateATR(data, period) {
        let atr = [], avg = 0;
        for (let i = 0; i < data.length; i++) {
            const tr = i === 0
                ? data[i].high - data[i].low
                : Math.max(
                    data[i].high - data[i].low,
                    Math.abs(data[i].high - data[i - 1].close),
                    Math.abs(data[i].low - data[i - 1].close)
                );
            avg = i < period ? ((avg * i) + tr) / (i + 1) : ((avg * (period - 1)) + tr) / period;
            atr.push({ time: data[i].time, value: avg });
        }
        return atr;
    }

    calculateBB(data, period, stdDev = null) {
        let upper = [], middle = [], lower = [];
        if (data.length < period) return { upper: [], middle: [], lower: [] };

        const dev = stdDev || this.options.bbStdDev;

        for (let i = period - 1; i < data.length; i++) {
            const slice = data.slice(i - period + 1, i + 1).map(c => c.close);
            const avg = slice.reduce((a, b) => a + b) / period;
            const std = Math.sqrt(slice.map(x => Math.pow(x - avg, 2)).reduce((a, b) => a + b) / period);
            upper.push({ time: data[i].time, value: avg + (dev * std) });
            middle.push({ time: data[i].time, value: avg });
            lower.push({ time: data[i].time, value: avg - (dev * std) });
        }
        return { upper, middle, lower };
    }

    calculateCI(data, period) {
        if (data.length < period) return [];

        // GPU Calculation
        if (this.gpu && this.gpu.isGPUAvailable) {
            try {
                const highs = data.map(d => d.high);
                const lows = data.map(d => d.low);
                const closes = data.map(d => d.close);

                const ciValues = this.gpu.calculateChoppiness(highs, lows, closes, period);

                // Map back to object structure
                // CPU implementation skips first 'period-1' elements? No, loop starts at i = period - 1
                const result = [];
                for (let i = period - 1; i < data.length; i++) {
                    result.push({ time: data[i].time, value: ciValues[i] });
                }
                return result;
            } catch (e) {
                console.warn("GPU Choppiness Error, falling back to CPU:", e);
            }
        }

        // CPU Calculation (Fallback)
        const atr = this.calculateATR(data, period).map(a => a.value);
        let res = [];
        for (let i = period - 1; i < data.length; i++) {
            const slice = data.slice(i - period + 1, i + 1);
            const high = Math.max(...slice.map(c => c.high));
            const low = Math.min(...slice.map(c => c.low));
            const sumATR = atr.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);

            let ci = 0;
            if ((high - low) > 0) {
                ci = 100 * (Math.log10(sumATR / (high - low)) / Math.log10(period));
            }
            res.push({ time: data[i].time, value: ci });
        }
        return res;
    }

    calculateADX(data, period) {
        if (data.length < period * 2) return data.map(d => ({ time: d.time, value: 0 }));
        let adxRes = [];
        let trSum = 0, pdmSum = 0, mdmSum = 0;
        let dxValues = [];

        for (let i = 1; i < data.length; i++) {
            const upMove = data[i].high - data[i - 1].high;
            const downMove = data[i - 1].low - data[i].low;
            const pdm = (upMove > downMove && upMove > 0) ? upMove : 0;
            const mdm = (downMove > upMove && downMove > 0) ? downMove : 0;
            const tr = Math.max(
                data[i].high - data[i].low,
                Math.abs(data[i].high - data[i - 1].close),
                Math.abs(data[i].low - data[i - 1].close)
            );

            if (i <= period) {
                trSum += tr; pdmSum += pdm; mdmSum += mdm;
            } else {
                trSum = trSum - (trSum / period) + tr;
                pdmSum = pdmSum - (pdmSum / period) + pdm;
                mdmSum = mdmSum - (mdmSum / period) + mdm;
            }

            if (i >= period) {
                const diPlus = trSum === 0 ? 0 : (pdmSum / trSum) * 100;
                const diMinus = trSum === 0 ? 0 : (mdmSum / trSum) * 100;
                const sumDi = diPlus + diMinus;
                const dx = sumDi === 0 ? 0 : Math.abs(diPlus - diMinus) / sumDi * 100;
                dxValues.push({ time: data[i].time, value: dx });
            }
        }

        let adx = 0;
        for (let j = 0; j < dxValues.length; j++) {
            if (j < period) adx += dxValues[j].value / period;
            else adx = ((adx * (period - 1)) + dxValues[j].value) / period;

            if (j >= period) adxRes.push({ time: dxValues[j].time, value: adx });
        }
        return adxRes;
    }

    getEMADirection(prev, curr) {
        const diff = prev - curr;
        if (Math.abs(diff) <= this.options.flatThreshold) return 'Flat';
        return prev < curr ? 'Up' : 'Down';
    }

    // ================== SMC CALCULATION ==================

    calculateSMC() {
        if (typeof SMCIndicator === 'undefined') {
            console.warn('SMCIndicator not found. Jumping SMC calculation.');
            return null;
        }

        try {
            const smc = new SMCIndicator({
                swingLength: this.options.smcSwingLength,
                internalLength: this.options.smcInternalLength,
                showInternalStructure: this.options.smcShowInternal,
                showSwingStructure: true,
                showOrderBlocks: true,
                showFVG: true,
                showEqualHL: true,
                showPremiumDiscount: true
            });

            smc.calculate(this.candleData.map(c => ({
                time: c.time,
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close
            })));

            // Store Raw Data for Charting (สำคัญสำหรับการวาดกราฟ)
            this.smcChartData = {
                swingPoints: smc.getSwingPoints(),
                structures: smc.getStructures(),
                orderBlocks: smc.orderBlocks,
                fairValueGaps: smc.fairValueGaps,
                strongWeakLevels: smc.strongWeakLevels,
                premiumDiscountZones: smc.premiumDiscountZones
            };

            // จัดกลุ่มข้อมูล SMC เพื่อให้ค้นหาง่ายตามเวลา
            const result = {
                swingPoints: {},    // time -> { type: 'HH', swing: 'high', price: ... }
                structures: {},     // time -> { type: 'BOS', direction: 'bullish', ... }
                orderBlocks: {},    // time -> { bias: 'bullish', ... } (Creation time)
                fvgs: {},           // time -> { bias: 'bearish', ... } (Creation time)
                strongWeak: {}
            };

            // Map Swing Points
            this.smcChartData.swingPoints.forEach(p => {
                result.swingPoints[p.time] = { type: p.type, swing: p.swing, price: p.price };
            });

            // Map Structures (BOS/CHoCH)
            this.smcChartData.structures.forEach(s => {
                result.structures[s.time] = { type: s.type, direction: s.direction, level: s.level, price: s.price };
            });

            // Map Order Blocks (Creation)
            this.smcChartData.orderBlocks.forEach(ob => {
                result.orderBlocks[ob.time] = { bias: ob.bias, level: ob.level, high: ob.high, low: ob.low };
            });

            // Map FVG (Creation)
            this.smcChartData.fairValueGaps.forEach(fvg => {
                result.fvgs[fvg.time] = { bias: fvg.bias, top: fvg.top, bottom: fvg.bottom };
            });

            // Map Strong/Weak Levels
            this.smcChartData.strongWeakLevels.forEach(sw => {
                result.strongWeak[sw.time] = { strength: sw.strength, type: sw.type, price: sw.price };
            });

            return result;

        } catch (e) {
            console.error('Error calculating SMC:', e);
            return null;
        }
    }

    /**
     * ดึงข้อมูล SMC แบบ Raw Data สำหรับนำไปวาดกราฟ (Charting)
     * ประกอบด้วย: orderBlocks, fairValueGaps, structures, swingPoints ฯลฯ ที่มีข้อมูลราคาครบถ้วน
     */
    getSMCChartData() {
        return this.smcChartData;
    }

    // ================== GENERATE ==================

    generate() {
        if (!this.candleData || this.candleData.length === 0) return [];

        // 1. Calculate Standard Indicators
        this.ema1Data = this.calculateMA(this.candleData, this.options.ema1Period, this.options.ema1Type);
        this.ema2Data = this.calculateMA(this.candleData, this.options.ema2Period, this.options.ema2Type);
        this.ema3Data = this.calculateMA(this.candleData, this.options.ema3Period, this.options.ema3Type);
        this.atrData = this.calculateATR(this.candleData, this.options.atrPeriod);
        this.ciData = this.calculateCI(this.candleData, this.options.ciPeriod);
        this.adxData = this.calculateADX(this.candleData, this.options.adxPeriod);
        this.rsiData = this.calculateRSI(this.candleData, this.options.rsiPeriod);

        // BB SD 2.0 (Standard)
        this.bbData = this.calculateBB(this.candleData, this.options.bbPeriod, this.options.bbStdDev);
        // BB SD 2.5 (For Outlier/Manual Sell)
        this.bbData25 = this.calculateBB(this.candleData, this.options.bbPeriod, 2.5);

        // Pre-calculate Bandwidth for Squeeze detection
        // Bandwidth = (Upper - Lower) / Middle
        const bandwidths = new Array(this.candleData.length).fill(null);
        this.bbData.upper.forEach((u, idx) => {
            const l = this.bbData.lower[idx];
            const m = this.bbData.middle[idx];
            if (u && l && m && m.value !== 0) {
                // Warning: bbData arrays might not align perfectly with candleData indices if period is skipped
                // calculateBB returns array starting from index (period-1) but mapped to time.
                // It's safer to map by time, but for performance let's rely on the fact that calculateBB pushes in order matching data[i].time
                // Wait, calculateBB returns shorter array? No, it pushes time: data[i].time.
                // Let's create a map for O(1) lookup or just fill the bandwidths array aligned with time.
            }
        });

        // Better approach: Create a map of time -> bandwidth
        const bandwidthMap = {};
        for (let i = 0; i < this.bbData.middle.length; i++) {
            const t = this.bbData.middle[i].time;
            const u = this.bbData.upper[i].value;
            const l = this.bbData.lower[i].value;
            const m = this.bbData.middle[i].value;
            if (m !== 0) {
                bandwidthMap[t] = (u - l) / m;
            }
        }

        // 2. Calculate SMC
        this.smcData = this.calculateSMC();

        this.analysisArray = [];
        let upConMediumEMA = 0;
        let downConMediumEMA = 0;
        let upConLongEMA = 0;
        let downConLongEMA = 0;

        for (let i = 0; i < this.candleData.length; i++) {
            const candle = this.candleData[i];
            const candletime = candle.time;

            // Basic Candle Data
            const open = candle.open;
            const high = candle.high;
            const low = candle.low;
            const close = candle.close;
            const color = close > open ? 'Green' : (close < open ? 'Red' : 'Equal');
            const pipSize = Math.abs(close - open);

            // Fetch Indicator Values
            const ema1Val = this.ema1Data[i] ? this.ema1Data[i].value : null;
            const ema2Val = this.ema2Data[i] ? this.ema2Data[i].value : null;
            const ema3Val = this.ema3Data[i] ? this.ema3Data[i].value : null;

            // EMA Directions
            let ema1Dir = 'Flat', ema2Dir = 'Flat', ema3Dir = 'Flat';
            if (i > 0) {
                if (this.ema1Data[i] && this.ema1Data[i - 1]) ema1Dir = this.getEMADirection(this.ema1Data[i - 1].value, this.ema1Data[i].value);
                if (this.ema2Data[i] && this.ema2Data[i - 1]) ema2Dir = this.getEMADirection(this.ema2Data[i - 1].value, this.ema2Data[i].value);
                if (this.ema3Data[i] && this.ema3Data[i - 1]) ema3Dir = this.getEMADirection(this.ema3Data[i - 1].value, this.ema3Data[i].value);
            }

            // EMA Consecutives
            if (ema2Dir === 'Up') { upConMediumEMA++; downConMediumEMA = 0; }
            else if (ema2Dir === 'Down') { downConMediumEMA++; upConMediumEMA = 0; }

            if (ema3Dir === 'Up') { upConLongEMA++; downConLongEMA = 0; }
            else if (ema3Dir === 'Down') { downConLongEMA++; upConLongEMA = 0; }

            // Other Indicators
            const ciVal = this.ciData.find(v => v.time === candletime)?.value || null;
            const adxVal = this.adxData.find(v => v.time === candletime)?.value || null;
            const rsiVal = this.rsiData.find(v => v.time === candletime)?.value || null;
            const atrVal = this.atrData.find(v => v.time === candletime)?.value || null;

            // BB (SD 2.0)
            const bbUpper = this.bbData.upper.find(v => v.time === candletime)?.value || null;
            const bbMiddle = this.bbData.middle.find(v => v.time === candletime)?.value || null;
            const bbLower = this.bbData.lower.find(v => v.time === candletime)?.value || null;

            // BB (SD 2.5)
            const bbUpper25 = this.bbData25.upper.find(v => v.time === candletime)?.value || null;
            const bbLower25 = this.bbData25.lower.find(v => v.time === candletime)?.value || null;

            // --- Accumulator Logic ---
            let bbBandwidth = null;
            let accuStatus = 'Normal'; // 'Squeeze', 'Parallel', 'Expansion', 'Normal'

            if (bbUpper !== null && bbLower !== null && bbMiddle !== null && bbMiddle !== 0) {
                bbBandwidth = (bbUpper - bbLower) / bbMiddle;

                // 1. Check Previous Slope of Middle Band (for Parallel)
                // Use last 5 candles to check if middle band is relatively flat
                // Or simplified: check slope between current and i-3
                let isParallel = false;
                if (i >= 5) {
                    const prevMiddle = this.bbData.middle.find(v => v.time === this.candleData[i - 3].time)?.value;
                    if (prevMiddle) {
                        const slope = Math.abs((bbMiddle - prevMiddle) / prevMiddle);
                        if (slope < 0.0005) { // Very flat threshold
                            isParallel = true;
                        }
                    }
                }

                // 2. Check Squeeze (Lowest bandwidth in last 50 candles)
                let isSqueeze = false;
                if (i >= 50) {
                    let minBw = bbBandwidth;
                    for (let k = 1; k <= 50; k++) {
                        const t = this.candleData[i - k].time;
                        const bw = bandwidthMap[t];
                        if (bw !== undefined && bw < minBw) {
                            minBw = bw;
                        }
                    }
                    if (Math.abs(bbBandwidth - minBw) < 0.000001) { // Current == Min
                        isSqueeze = true;
                    }
                }

                // 3. Check Expansion
                let isExpansion = false;
                if (i >= 3) {
                    const prevBw = bandwidthMap[this.candleData[i - 1].time];
                    const prevBw2 = bandwidthMap[this.candleData[i - 2].time];
                    if (prevBw !== undefined && prevBw2 !== undefined) {
                        if (bbBandwidth > prevBw && prevBw > prevBw2) {
                            isExpansion = true;
                        }
                    }
                }

                // Evaluate Priority
                if (isSqueeze) accuStatus = 'Squeeze';
                else if (isParallel) accuStatus = 'Parallel'; // Parallel is also good but squeeze is "The Best"
                else if (isExpansion) accuStatus = 'Expansion';
            }

            // SMC Mapping
            let smcSwing = null;
            let smcStructure = null;
            let smcOB = null;
            let smcFVG = null;
            let smcStrongWeak = null;

            if (this.smcData) {
                // Swing Points (HH, HL, LH, LL)
                if (this.smcData.swingPoints[candletime]) {
                    smcSwing = this.smcData.swingPoints[candletime].type; // 'HH' etc.
                }

                // Structures (BOS, CHoCH)
                if (this.smcData.structures[candletime]) {
                    const s = this.smcData.structures[candletime];
                    smcStructure = `${s.type}-${s.direction}`; // 'BOS-bullish'
                }

                // Order Blocks (Created on this candle)
                if (this.smcData.orderBlocks[candletime]) {
                    const ob = this.smcData.orderBlocks[candletime];
                    smcOB = ob.bias; // 'bullish' or 'bearish'
                }

                // FVGs (Created on this candle)
                if (this.smcData.fvgs[candletime]) {
                    const fvg = this.smcData.fvgs[candletime];
                    smcFVG = fvg.bias; // 'bullish' or 'bearish'
                }

                // Strong/Weak Levels
                if (this.smcData.strongWeak[candletime]) {
                    const sw = this.smcData.strongWeak[candletime];
                    smcStrongWeak = `${sw.strength}-${sw.type}`; // 'strong-high'
                }
            }

            // Push to Array
            this.analysisArray.push({
                index: i,
                candletime: candletime,
                candletimeDisplay: new Date(candletime * 1000).toLocaleTimeString('th-TH'),

                // OHLC
                open: open, high: high, low: low, close: close,
                color: color,
                pipSize: parseFloat(pipSize.toFixed(5)),

                // 1. Trend (EMA)
                emaShortValue: ema1Val ? parseFloat(ema1Val.toFixed(5)) : null,
                emaShortDirection: ema1Dir,
                emaMediumValue: ema2Val ? parseFloat(ema2Val.toFixed(5)) : null,
                emaMediumDirection: ema2Dir,
                emaLongValue: ema3Val ? parseFloat(ema3Val.toFixed(5)) : null,
                emaLongDirection: ema3Dir,

                UpConMediumEMA: upConMediumEMA,
                DownConMediumEMA: downConMediumEMA,
                UpConLongEMA: upConLongEMA,
                DownConLongEMA: downConLongEMA,

                // 2. Volatility
                choppyIndicator: ciVal ? parseFloat(ciVal.toFixed(2)) : null,
                atr: atrVal ? parseFloat(atrVal.toFixed(5)) : null,
                bbUpper: bbUpper ? parseFloat(bbUpper.toFixed(5)) : null,
                bbMiddle: bbMiddle ? parseFloat(bbMiddle.toFixed(5)) : null,
                bbLower: bbLower ? parseFloat(bbLower.toFixed(5)) : null,

                // BB V2 (Accumulator)
                bbUpper25: bbUpper25 ? parseFloat(bbUpper25.toFixed(5)) : null,
                bbLower25: bbLower25 ? parseFloat(bbLower25.toFixed(5)) : null,
                bbBandwidth: bbBandwidth ? parseFloat(bbBandwidth.toFixed(6)) : null,
                accuStatus: accuStatus,

                // 3. Momentum
                rsiValue: rsiVal ? parseFloat(rsiVal.toFixed(2)) : null,
                adxValue: adxVal ? parseFloat(adxVal.toFixed(2)) : null,

                // 4. SMC (Smart Money Concepts)
                smcSwing: smcSwing,         // 'HH', 'HL', 'LH', 'LL'
                smcStructure: smcStructure, // 'BOS-bullish', 'CHoCH-bearish'
                smcOrderBlock: smcOB,       // 'bullish', 'bearish'
                smcFVG: smcFVG,             // 'bullish', 'bearish'
                smcStrongWeak: smcStrongWeak // 'strong-high', 'weak-low'
            });
        }

        return this.analysisArray;
    }
}
