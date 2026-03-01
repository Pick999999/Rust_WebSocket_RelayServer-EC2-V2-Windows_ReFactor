/**
 * AnalysisGeneratorTick Class (Incremental Mode)
 *
 * สืบทอดจาก AnalysisGenerator (V1) และเพิ่มความสามารถ Incremental Calculation
 * เมื่อมี candle ใหม่เข้ามา ไม่ต้องคำนวณทั้งหมดใหม่ แค่คำนวณต่อจากค่าเดิม
 *
 * ====================================================================================================
 * 📌 Dependencies:
 *    <script src="js/clsAnalysisGenerator.js"></script>  <!-- ต้องโหลดก่อน -->
 *    <script src="js/clsAnalysisGeneratorTick.js"></script>
 *
 * 📌 Usage:
 *    // 1. สร้าง instance พร้อม candle data เริ่มต้น
 *    const gen = new AnalysisGeneratorTick(initialCandles, options);
 *    const result = gen.generate();  // คำนวณทั้งหมดครั้งแรก + บันทึก state
 *
 *    // 2. เมื่อมี candle ใหม่ 1 ตัว
 *    const newEntry = gen.appendCandle(newCandle);  // O(1) ไม่ต้องคำนวณใหม่ทั้งหมด
 *    // newEntry = analysisObj ตัวใหม่ที่เพิ่มเข้ามา
 *    // gen.analysisArray จะถูก update อัตโนมัติ
 *
 *    // 3. สามารถ append ต่อเรื่อยๆ
 *    gen.appendCandle(anotherCandle);
 *    gen.appendCandle(yetAnotherCandle);
 *
 * ====================================================================================================
 */

class AnalysisGeneratorTick extends AnalysisGenerator {

    constructor(candleData, options = {}) {
        super(candleData, options);
        // Initialize Internal State for Incremental Calculation
        this._state = null;
        this.currentCandle = null;
    }

    // ================== INITIAL FULL GENERATE ==================
    // คำนวณใหม่ทั้งหมดครั้งแรก เพื่อเตรียม State สำหรับ Incremental
    generate() {
        const result = super.generate();

        // Save last state from full calculation
        this._saveState();

        // Initialize currentCandle based on the last known data if needed, 
        // or just let the first tick initialize it.
        if (this.candleData.length > 0) {
            const last = this.candleData[this.candleData.length - 1];
            // We don't really want to set currentCandle to the last COMPLETED candle, 
            // because appendTick expects currentCandle to be the FORMING one.
            // So we leave it null until the first real-time tick arrives.
        }

        return result;
    }

    // ================== SAVE STATE ==================
    // บันทึกค่าสุดท้ายของ indicator ทุกตัว สำหรับ appendCandle()

    _saveState() {
        const n = this.candleData.length;
        if (n === 0) return;

        // --- EMA State: ค่าสุดท้ายของแต่ละ EMA ---
        const lastEma1 = this.ema1Data.length > 0 ? this.ema1Data[n - 1].value : 0;
        const lastEma2 = this.ema2Data.length > 0 ? this.ema2Data[n - 1].value : 0;
        const lastEma3 = this.ema3Data.length > 0 ? this.ema3Data[n - 1].value : 0;

        // --- ATR State: ค่า avg สุดท้าย ---
        const lastAtr = this.atrData.length > 0 ? this.atrData[n - 1].value : 0;

        // --- RSI State: ต้อง recalculate เพื่อหา avgGain/avgLoss ---
        const rsiPeriod = this.options.rsiPeriod;
        let rsiAvgGain = 0, rsiAvgLoss = 0;
        if (n > rsiPeriod) {
            const gains = [], losses = [];
            for (let i = 1; i < n; i++) {
                const change = this.candleData[i].close - this.candleData[i - 1].close;
                gains.push(change > 0 ? change : 0);
                losses.push(change < 0 ? Math.abs(change) : 0);
            }
            rsiAvgGain = gains.slice(0, rsiPeriod).reduce((a, b) => a + b, 0) / rsiPeriod;
            rsiAvgLoss = losses.slice(0, rsiPeriod).reduce((a, b) => a + b, 0) / rsiPeriod;
            for (let i = rsiPeriod; i < gains.length; i++) {
                rsiAvgGain = (rsiAvgGain * (rsiPeriod - 1) + gains[i]) / rsiPeriod;
                rsiAvgLoss = (rsiAvgLoss * (rsiPeriod - 1) + losses[i]) / rsiPeriod;
            }
        }

        // --- ADX State: ต้อง recalculate running sums ---
        const adxPeriod = this.options.adxPeriod;
        let trSum = 0, pdmSum = 0, mdmSum = 0;
        let dxValues = [];
        let adxVal = 0;
        if (n > adxPeriod * 2) {
            for (let i = 1; i < n; i++) {
                const upMove = this.candleData[i].high - this.candleData[i - 1].high;
                const downMove = this.candleData[i - 1].low - this.candleData[i].low;
                const pdm = (upMove > downMove && upMove > 0) ? upMove : 0;
                const mdm = (downMove > upMove && downMove > 0) ? downMove : 0;
                const tr = Math.max(
                    this.candleData[i].high - this.candleData[i].low,
                    Math.abs(this.candleData[i].high - this.candleData[i - 1].close),
                    Math.abs(this.candleData[i].low - this.candleData[i - 1].close)
                );
                if (i <= adxPeriod) { trSum += tr; pdmSum += pdm; mdmSum += mdm; }
                else { trSum = trSum - (trSum / adxPeriod) + tr; pdmSum = pdmSum - (pdmSum / adxPeriod) + pdm; mdmSum = mdmSum - (mdmSum / adxPeriod) + mdm; }
                if (i >= adxPeriod) {
                    const diPlus = (pdmSum / trSum) * 100;
                    const diMinus = (mdmSum / trSum) * 100;
                    const dx = Math.abs(diPlus - diMinus) / (diPlus + diMinus) * 100;
                    dxValues.push(dx);
                }
            }
            adxVal = 0;
            for (let j = 0; j < dxValues.length; j++) {
                if (j < adxPeriod) adxVal += dxValues[j] / adxPeriod;
                else adxVal = ((adxVal * (adxPeriod - 1)) + dxValues[j]) / adxPeriod;
            }
        }

        // --- BB State: เก็บ window ของ close ล่าสุด period ตัว ---
        const bbPeriod = this.options.bbPeriod;
        const bbWindow = this.candleData.slice(Math.max(0, n - bbPeriod)).map(c => c.close);

        // --- CI State: เก็บ window data + ATR ---
        const ciPeriod = this.options.ciPeriod;
        const ciWindow = this.candleData.slice(Math.max(0, n - ciPeriod));
        const atrValues = this.calculateATR(this.candleData, ciPeriod);
        const ciAtrWindow = atrValues.slice(Math.max(0, n - ciPeriod));

        // --- Consecutive counters จาก analysisArray ตัวสุดท้าย ---
        const lastAnalysis = this.analysisArray.length > 0 ? this.analysisArray[this.analysisArray.length - 1] : null;
        const prevAnalysis = this.analysisArray.length > 1 ? this.analysisArray[this.analysisArray.length - 2] : null;

        // --- lastEmaCutIndex ---
        let lastEmaCutIndex = null;
        for (let i = this.analysisArray.length - 1; i >= 0; i--) {
            if (this.analysisArray[i].emaCutLongType !== null) {
                lastEmaCutIndex = i;
                break;
            }
        }

        this._state = {
            // EMA
            lastEma1, lastEma2, lastEma3,
            ema1K: 2 / (this.options.ema1Period + 1),
            ema2K: 2 / (this.options.ema2Period + 1),
            ema3K: 2 / (this.options.ema3Period + 1),
            // ATR
            lastAtr, atrPeriod: this.options.atrPeriod,
            // RSI
            rsiAvgGain, rsiAvgLoss, rsiPeriod,
            // ADX
            trSum, pdmSum, mdmSum, adxVal, adxPeriod,
            dxCount: dxValues.length,
            // BB
            bbWindow, bbPeriod,
            // CI
            ciWindow, ciAtrWindow, ciPeriod,
            // Counters
            upConMediumEMA: lastAnalysis ? lastAnalysis.UpConMediumEMA : 0,
            downConMediumEMA: lastAnalysis ? lastAnalysis.DownConMediumEMA : 0,
            upConLongEMA: lastAnalysis ? lastAnalysis.UpConLongEMA : 0,
            downConLongEMA: lastAnalysis ? lastAnalysis.DownConLongEMA : 0,
            lastEmaCutIndex,
            // Previous candle & analysis
            lastCandle: this.candleData[n - 1],
            lastAnalysis,
            prevAnalysis
        };
    }

    // ================== APPEND CANDLE (Incremental) ==================
    // คำนวณ indicator ต่อจากค่าเดิม O(1) ต่อ candle

    appendCandle(newCandle) {
        if (!this._state) {
            throw new Error('AnalysisGeneratorTick: ต้องเรียก generate() ก่อน appendCandle()');
        }

        const st = this._state;
        const i = this.candleData.length; // index ของ candle ใหม่
        const prevCandle = st.lastCandle;

        // เพิ่ม candle เข้า data
        this.candleData.push(newCandle);

        // ===== 1. EMA =====
        const close = newCandle.close;
        const newEma1 = close * st.ema1K + st.lastEma1 * (1 - st.ema1K);
        const newEma2 = close * st.ema2K + st.lastEma2 * (1 - st.ema2K);
        const newEma3 = close * st.ema3K + st.lastEma3 * (1 - st.ema3K);

        // EMA Direction
        const ema1Dir = this.getEMADirection(st.lastEma1, newEma1);
        const ema2Dir = this.getEMADirection(st.lastEma2, newEma2);
        const ema3Dir = this.getEMADirection(st.lastEma3, newEma3);

        // EMA Short Turn Type
        let emaShortTurnType = '-';
        if (st.lastAnalysis && st.prevAnalysis) {
            const currDiff = newEma1 - st.lastEma1;
            const prevEma1Before = st.prevAnalysis.emaShortValue;
            if (prevEma1Before !== null) {
                const prevDiff = st.lastEma1 - prevEma1Before;
                const currDirCalc = currDiff > 0.0001 ? 'Up' : (currDiff < -0.0001 ? 'Down' : 'Flat');
                const prevDirCalc = prevDiff > 0.0001 ? 'Up' : (prevDiff < -0.0001 ? 'Down' : 'Flat');
                if (currDirCalc === 'Up' && prevDirCalc === 'Down') emaShortTurnType = 'TurnUp';
                else if (currDirCalc === 'Down' && prevDirCalc === 'Up') emaShortTurnType = 'TurnDown';
            }
        }

        // EMA Consecutives
        let upConMediumEMA = st.upConMediumEMA;
        let downConMediumEMA = st.downConMediumEMA;
        let upConLongEMA = st.upConLongEMA;
        let downConLongEMA = st.downConLongEMA;

        if (ema2Dir === 'Up') { upConMediumEMA++; downConMediumEMA = 0; }
        else if (ema2Dir === 'Down') { downConMediumEMA++; upConMediumEMA = 0; }
        if (ema3Dir === 'Up') { upConLongEMA++; downConLongEMA = 0; }
        else if (ema3Dir === 'Down') { downConLongEMA++; upConLongEMA = 0; }

        // ===== 2. MACD & Convergence =====
        const emaAbove = newEma1 > newEma2 ? 'ShortAbove' : 'MediumAbove';
        const emaLongAbove = newEma2 > newEma3 ? 'MediumAbove' : 'LongAbove';
        const macd12 = Math.abs(newEma1 - newEma2);
        const macd23 = Math.abs(newEma2 - newEma3);
        const prevMacd12 = st.lastAnalysis ? st.lastAnalysis.macd12 : null;
        const prevMacd23 = st.lastAnalysis ? st.lastAnalysis.macd23 : null;

        let emaConvergenceType = null;
        if (prevMacd12 !== null) {
            emaConvergenceType = macd12 > prevMacd12 ? 'divergence' : (macd12 < prevMacd12 ? 'convergence' : 'neutral');
        }

        let emaLongConvergenceType = '';
        if (macd23 !== null && prevMacd23 !== null) {
            if (macd23 > prevMacd23) {
                emaLongConvergenceType = 'D';
            } else if (macd23 < prevMacd23) {
                emaLongConvergenceType = 'C';
            } else {
                emaLongConvergenceType = 'N';
            }
        }
        //let emaLongConvergenceType = this.getMACDConver(prevMacd23, macd23);
        //if (Math.abs(macd23) < 0.15) emaLongConvergenceType = 'N';

        // emaCutLongType
        let emaCutLongType = null;
        const prevMediumAbove = st.lastEma2 > st.lastEma3;
        const currMediumAbove = newEma2 > newEma3;
        if (currMediumAbove !== prevMediumAbove) {
            emaCutLongType = currMediumAbove ? 'UpTrend' : 'DownTrend';
        }
        let lastEmaCutIndex = st.lastEmaCutIndex;
        if (emaCutLongType !== null) lastEmaCutIndex = i;
        const candlesSinceEmaCut = lastEmaCutIndex !== null ? i - lastEmaCutIndex : null;

        // ===== 3. ATR =====
        const tr = prevCandle
            ? Math.max(newCandle.high - newCandle.low, Math.abs(newCandle.high - prevCandle.close), Math.abs(newCandle.low - prevCandle.close))
            : newCandle.high - newCandle.low;
        const newAtr = i < st.atrPeriod
            ? ((st.lastAtr * (i)) + tr) / (i + 1)
            : ((st.lastAtr * (st.atrPeriod - 1)) + tr) / st.atrPeriod;

        // ===== 4. RSI =====
        let rsiValue = null;
        let newRsiAvgGain = st.rsiAvgGain;
        let newRsiAvgLoss = st.rsiAvgLoss;
        if (prevCandle && i >= st.rsiPeriod) {
            const change = close - prevCandle.close;
            const gain = change > 0 ? change : 0;
            const loss = change < 0 ? Math.abs(change) : 0;
            newRsiAvgGain = (st.rsiAvgGain * (st.rsiPeriod - 1) + gain) / st.rsiPeriod;
            newRsiAvgLoss = (st.rsiAvgLoss * (st.rsiPeriod - 1) + loss) / st.rsiPeriod;
            const rs = newRsiAvgLoss === 0 ? 100 : newRsiAvgGain / newRsiAvgLoss;
            rsiValue = 100 - (100 / (1 + rs));
        }

        // ===== 5. BB (Bollinger Bands) =====
        st.bbWindow.push(close);
        if (st.bbWindow.length > st.bbPeriod) st.bbWindow.shift();
        let bbUpper = null, bbMiddle = null, bbLower = null;
        if (st.bbWindow.length >= st.bbPeriod) {
            const avg = st.bbWindow.reduce((a, b) => a + b, 0) / st.bbPeriod;
            const std = Math.sqrt(st.bbWindow.map(x => Math.pow(x - avg, 2)).reduce((a, b) => a + b, 0) / st.bbPeriod);
            bbUpper = avg + 2 * std;
            bbMiddle = avg;
            bbLower = avg - 2 * std;
        }
        let bbPosition = 'Unknown';
        if (bbUpper !== null && bbLower !== null) {
            const bbRange = bbUpper - bbLower;
            const upperZone = bbUpper - (bbRange * 0.33);
            const lowerZone = bbLower + (bbRange * 0.33);
            if (close >= upperZone) bbPosition = 'NearUpper';
            else if (close <= lowerZone) bbPosition = 'NearLower';
            else bbPosition = 'Middle';
        }

        // ===== 6. CI (Choppiness Index) =====
        st.ciWindow.push(newCandle);
        if (st.ciWindow.length > st.ciPeriod) st.ciWindow.shift();
        st.ciAtrWindow.push(newAtr);
        if (st.ciAtrWindow.length > st.ciPeriod) st.ciAtrWindow.shift();
        let choppyIndicator = null;
        if (st.ciWindow.length >= st.ciPeriod) {
            const high = Math.max(...st.ciWindow.map(c => c.high));
            const low = Math.min(...st.ciWindow.map(c => c.low));
            const sumATR = st.ciAtrWindow.reduce((a, b) => a + b, 0);
            if ((high - low) > 0) {
                choppyIndicator = 100 * (Math.log10(sumATR / (high - low)) / Math.log10(st.ciPeriod));
            }
        }

        // ===== 7. ADX =====
        let adxValue = null;
        if (prevCandle) {
            const upMove = newCandle.high - prevCandle.high;
            const downMove = prevCandle.low - newCandle.low;
            const pdm = (upMove > downMove && upMove > 0) ? upMove : 0;
            const mdm = (downMove > upMove && downMove > 0) ? downMove : 0;
            if (i <= st.adxPeriod) {
                st.trSum += tr; st.pdmSum += pdm; st.mdmSum += mdm;
            } else {
                st.trSum = st.trSum - (st.trSum / st.adxPeriod) + tr;
                st.pdmSum = st.pdmSum - (st.pdmSum / st.adxPeriod) + pdm;
                st.mdmSum = st.mdmSum - (st.mdmSum / st.adxPeriod) + mdm;
            }
            if (i >= st.adxPeriod && st.trSum > 0) {
                const diPlus = (st.pdmSum / st.trSum) * 100;
                const diMinus = (st.mdmSum / st.trSum) * 100;
                const sumDi = diPlus + diMinus;
                const dx = sumDi === 0 ? 0 : Math.abs(diPlus - diMinus) / sumDi * 100;
                st.dxCount++;
                if (st.dxCount < st.adxPeriod) st.adxVal += dx / st.adxPeriod;
                else st.adxVal = ((st.adxVal * (st.adxPeriod - 1)) + dx) / st.adxPeriod;
                if (st.dxCount >= st.adxPeriod) adxValue = st.adxVal;
            }
        }

        // ===== 8. Candle Properties =====
        const open = newCandle.open;
        const high2 = newCandle.high;
        const low2 = newCandle.low;
        const color = close > open ? 'Green' : (close < open ? 'Red' : 'Equal');
        const pipSize = Math.abs(close - open);
        const bodyTop = Math.max(open, close);
        const bodyBottom = Math.min(open, close);
        const uWick = high2 - bodyTop;
        const body = Math.abs(close - open);
        const lWick = bodyBottom - low2;
        const fullCandleSize = high2 - low2;
        const bodyPercent = fullCandleSize > 0 ? ((body / fullCandleSize) * 100).toFixed(2) : 0;
        const uWickPercent = fullCandleSize > 0 ? ((uWick / fullCandleSize) * 100).toFixed(2) : 0;
        const lWickPercent = fullCandleSize > 0 ? ((lWick / fullCandleSize) * 100).toFixed(2) : 0;
        let seriesCode = '';

        // isAbnormalCandle
        let isAbnormalCandle = false;
        if (prevCandle && newAtr > 0) {
            const trueRange = Math.max(high2 - low2, Math.abs(high2 - prevCandle.close), Math.abs(low2 - prevCandle.close));
            isAbnormalCandle = trueRange > (newAtr * this.options.atrMultiplier);
        }
        let isAbnormalATR = false;
        if (newAtr > 0) {
            isAbnormalATR = (body > newAtr * this.options.atrMultiplier) || (fullCandleSize > newAtr * this.options.atrMultiplier * 1.5);
        }

        // emaCutPosition
        let emaCutPosition = null;
        if (newEma1 > high2) emaCutPosition = '1';
        else if (newEma1 >= bodyTop && newEma1 <= high2) emaCutPosition = '2';
        else if (newEma1 >= bodyBottom && newEma1 < bodyTop) {
            const bodyRange = bodyTop - bodyBottom;
            if (bodyRange > 0) {
                const pos = (newEma1 - bodyBottom) / bodyRange;
                if (pos >= 0.66) emaCutPosition = 'B1';
                else if (pos >= 0.33) emaCutPosition = 'B2';
                else emaCutPosition = 'B3';
            } else emaCutPosition = 'B2';
        } else if (newEma1 >= low2 && newEma1 < bodyBottom) emaCutPosition = '3';
        else if (newEma1 < low2) emaCutPosition = '4';

        // StatusDesc
        const seriesDesc = (emaLongAbove ? emaLongAbove.substr(0, 1) : '-') + '-' +
            (ema2Dir ? ema2Dir.substr(0, 1) : '-') +
            (ema3Dir ? ema3Dir.substr(0, 1) : '-') + '-' +
            color.substr(0, 1) + '-' + (emaLongConvergenceType || '-');

        let StatusCode = '';
        if (typeof ColorCodeMaster !== 'undefined') {
            for (let i = 0; i < ColorCodeMaster.length; i++) {
                if (ColorCodeMaster[i].StatusDesc === seriesDesc) {
                    StatusCode = ColorCodeMaster[i].StatusCode;
                }
            }
        }

        // ===== Build analysisObj =====
        const candletimeDisplay = new Date(newCandle.time * 1000).toLocaleString('th-TH', {
            year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
        });

        const analysisObj = {
            index: i,
            candletime: newCandle.time,
            candletimeDisplay: candletimeDisplay,
            open: open, high: high2, low: low2, close: close,
            color: color,
            nextColor: null,
            pipSize: parseFloat(pipSize.toFixed(5)),
            emaShortValue: parseFloat(newEma1.toFixed(5)),
            emaShortDirection: ema1Dir,
            emaShortTurnType: emaShortTurnType,
            emaMediumValue: parseFloat(newEma2.toFixed(5)),
            emaMediumDirection: ema2Dir,
            emaLongValue: parseFloat(newEma3.toFixed(5)),
            emaLongDirection: ema3Dir,
            emaAbove: emaAbove,
            emaLongAbove: emaLongAbove,
            macd12: parseFloat(macd12.toFixed(5)),
            macd23: parseFloat(macd23.toFixed(5)),
            previousEmaShortValue: st.lastAnalysis ? st.lastAnalysis.emaShortValue : null,
            previousEmaMediumValue: st.lastAnalysis ? st.lastAnalysis.emaMediumValue : null,
            previousEmaLongValue: st.lastAnalysis ? st.lastAnalysis.emaLongValue : null,
            previousMacd12: prevMacd12 !== null ? parseFloat(prevMacd12.toFixed(5)) : null,
            previousMacd23: prevMacd23 !== null ? parseFloat(prevMacd23.toFixed(5)) : null,
            emaConvergenceType: emaConvergenceType,
            emaLongConvergenceType: emaLongConvergenceType,
            choppyIndicator: choppyIndicator !== null ? parseFloat(choppyIndicator.toFixed(2)) : null,
            adxValue: adxValue !== null ? parseFloat(adxValue.toFixed(2)) : null,
            rsiValue: rsiValue !== null ? parseFloat(rsiValue.toFixed(2)) : null,
            bbValues: {
                upper: bbUpper !== null ? parseFloat(bbUpper.toFixed(5)) : null,
                middle: bbMiddle !== null ? parseFloat(bbMiddle.toFixed(5)) : null,
                lower: bbLower !== null ? parseFloat(bbLower.toFixed(5)) : null
            },
            bbPosition: bbPosition,
            atr: parseFloat(newAtr.toFixed(5)),
            isAbnormalCandle: isAbnormalCandle,
            isAbnormalATR: isAbnormalATR,
            uWick: parseFloat(uWick.toFixed(5)),
            uWickPercent: parseFloat(uWickPercent),
            body: parseFloat(body.toFixed(5)),
            bodyPercent: parseFloat(bodyPercent),
            lWick: parseFloat(lWick.toFixed(5)),
            lWickPercent: parseFloat(lWickPercent),
            emaCutPosition: emaCutPosition,
            emaCutLongType: emaCutLongType,
            candlesSinceEmaCut: candlesSinceEmaCut,
            UpConMediumEMA: upConMediumEMA,
            DownConMediumEMA: downConMediumEMA,
            UpConLongEMA: upConLongEMA,
            DownConLongEMA: downConLongEMA,
            isMark: "n",
            StatusCode: StatusCode,
            StatusDesc: seriesDesc,
            StatusDesc0: seriesDesc,
            hintStatus: "",
            suggestColor: "",
            winStatus: "",
            winCon: 0,
            lossCon: 0
        };

        // Update previous entry's nextColor
        if (this.analysisArray.length > 0) {
            this.analysisArray[this.analysisArray.length - 1].nextColor = color;
        }

        this.analysisArray.push(analysisObj);

        // ===== Update State =====
        st.lastEma1 = newEma1;
        st.lastEma2 = newEma2;
        st.lastEma3 = newEma3;
        st.lastAtr = newAtr;
        st.rsiAvgGain = newRsiAvgGain;
        st.rsiAvgLoss = newRsiAvgLoss;
        st.upConMediumEMA = upConMediumEMA;
        st.downConMediumEMA = downConMediumEMA;
        st.upConLongEMA = upConLongEMA;
        st.downConLongEMA = downConLongEMA;
        st.lastEmaCutIndex = lastEmaCutIndex;
        st.prevAnalysis = st.lastAnalysis;
        st.lastAnalysis = analysisObj;
        st.lastCandle = newCandle;

        return analysisObj;
    }

    // New method to handle raw tick updates and candle formation
    appendTick(price, time) {
        // Initialize current candle if not exists
        if (!this.currentCandle) {
            this.currentCandle = {
                time: Math.floor(time / 60) * 60,
                open: price, high: price, low: price, close: price,
            };
            // Ensure time is Epoch
            return null; // Candle not completed
        }

        // Check if new minute started
        const tickMinute = Math.floor(time / 60) * 60;

        if (tickMinute > this.currentCandle.time) {
            // Complete the previous candle
            const completed = { ...this.currentCandle };

            // Analyze it
            const analysisResult = this.appendCandle(completed);

            // Start new candle
            this.currentCandle = {
                time: tickMinute,
                open: price, high: price, low: price, close: price
            };

            return analysisResult; // Return the analysis of the completed candle
        } else {
            // Update current candle
            this.currentCandle.high = Math.max(this.currentCandle.high, price);
            this.currentCandle.low = Math.min(this.currentCandle.low, price);
            this.currentCandle.close = price;
            return null;
        }
    }
}

// Export for Node.js / CommonJS
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AnalysisGeneratorTick;
}
