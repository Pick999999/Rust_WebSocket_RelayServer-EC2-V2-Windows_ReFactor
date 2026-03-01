/**
 * ChartManager Class
 * -----------------------------------------------------------------------
 * 📖 คู่มือการใช้งาน (THAI MANUAL)
 * -----------------------------------------------------------------------
 * 
 * 🛠️ สิ่งที่ต้องเตรียมในหน้า Webpage (HTML Requirements):
 * ต้องมี <div> containers จำนวน 4 ตัว (เพิ่ม MACD) โดยกำหนด id ให้ตรงตามนี้:
 * 1. <div id="mainChart"></div>   --> สำหรับแสดงกราฟแท่งเทียนหลักและเส้น MA
 * 2. <div id="rsiChart"></div>    --> สำหรับแสดงกราฟ RSI (แยกต่างหาก)
 * 3. <div id="choppyChart"></div> --> สำหรับแสดงกราฟ Choppiness Index (แยกต่างหาก)
 * 4. <div id="macdChart"></div>   --> สำหรับแสดงกราฟ MACD (แยกต่างหาก) **(NEW)**
 * 
 * ⚠️ หมายเหตุ: ขนาด (Height) ถูกกำหนดไว้ใน code นี้แล้ว (500px, 400px) 
 * หากต้องการปรับขนาด ให้แก้ไขที่ property 'height' ใน method initialize()
 * 
 * ⚙️ วิธีการเรียกใช้งาน (How to use):
 * 1. สร้าง Instance: 
 *    const charts = new ChartManager();
 *    (เมื่อเรียกใช้ กราฟเปล่าจะถูกสร้างขึ้นใน div ที่เตรียมไว้ทันที)
 * 
 * 2. การอัปเดตข้อมูล (Update Data):
 *    - charts.updateCandles(data)  -> อัปเดตกราฟแท่งเทียนทั้งหมด
 *    - charts.updateMA(index, data) -> อัปเดตเส้น MA (index: 0, 1, หรือ 2)
 *    - charts.updateRSI(data)       -> อัปเดตกราฟ RSI
 *    - charts.updateChoppiness(data) -> อัปเดตกราฟ Choppy
 *    - charts.updateMACD(macd, signal, histogram) -> อัปเดตกราฟ MACD ครบชุด **(NEW)**
 *      * charts.updateMACD(
 *      *    [{ time: ..., value: 1.5 }, ...], // macdData
 *      *    [{ time: ..., value: 1.2 }, ...], // signalData
 *      *    [{ time: ..., value: 0.3, color: '#26a69a' }, ...] // histogramData
 *      * );
 * 
 * 3. การอัปเดต Real-time (Update Live):
 *    - charts.updateLiveCandle(point)
 *    - charts.updateLiveMA(index, point)
 *    - charts.updateLiveRSI(point)
 *    - charts.updateLiveChoppiness(point)
 *    - charts.updateLiveMACD(macdPt, signalPt, histPt) **(NEW)**
 *      * charts.updateLiveMACD(
 *      *    { time: ..., value: 1.55 }, // macdPoint
 *      *    { time: ..., value: 1.25 }, // signalPoint
 *      *    { time: ..., value: 0.35, color: '#26a69a' } // histogramPoint
 *      * );
 * -----------------------------------------------------------------------
 */
class ChartManager {
    constructor() {
        this.mainChart = null;
        this.rsiChart = null;
        this.choppyChart = null;
        this.macdChart = null; // New MACD Chart

        this.candleSeries = null;
        this.maSeries = [];
        this.rsiSeries = null;
        this.choppySeries = null;

        // MACD Series
        this.macdSeries = null;
        this.signalSeries = null;
        this.histogramSeries = null;

        this.initialize();
    }

    initialize() {
        // 1. Main Chart
        this.mainChart = LightweightCharts.createChart(document.getElementById('mainChart'), {
            layout: { background: { color: '#0f1729' }, textColor: '#d1d4dc' },
            grid: { vertLines: { color: '#1a2340' }, horzLines: { color: '#1a2340' } },
            timeScale: { timeVisible: true, secondsVisible: false },
            height: 500
        });

        this.candleSeries = this.mainChart.addCandlestickSeries({
            upColor: '#00ff88', downColor: '#ff4444',
            borderUpColor: '#00ff88', borderDownColor: '#ff4444',
            wickUpColor: '#00ff88', wickDownColor: '#ff4444'
        });

        // MA Lines
        this.maSeries.push(this.mainChart.addLineSeries({ color: '#4a9eff', lineWidth: 2, title: 'MA1' }));
        this.maSeries.push(this.mainChart.addLineSeries({ color: '#ff9500', lineWidth: 2, title: 'MA2' }));
        this.maSeries.push(this.mainChart.addLineSeries({ color: '#00ff88', lineWidth: 2, title: 'MA3' }));

        // 2. RSI Chart
        this.rsiChart = LightweightCharts.createChart(document.getElementById('rsiChart'), {
            layout: { background: { color: '#0f1729' }, textColor: '#d1d4dc' },
            grid: { vertLines: { color: '#1a2340' }, horzLines: { color: '#1a2340' } },
            height: 250
        });
        this.rsiSeries = this.rsiChart.addLineSeries({ color: '#ff9500', lineWidth: 2 });

        // Add RSI levels
        this.rsiChart.addLineSeries({ color: '#666', lineWidth: 1, lineStyle: 2 })
            .setData([{ time: 0, value: 70 }, { time: 9999999999, value: 70 }]);
        this.rsiChart.addLineSeries({ color: '#666', lineWidth: 1, lineStyle: 2 })
            .setData([{ time: 0, value: 30 }, { time: 9999999999, value: 30 }]);

        // 3. Choppiness Chart
        this.choppyChart = LightweightCharts.createChart(document.getElementById('choppyChart'), {
            layout: { background: { color: '#0f1729' }, textColor: '#d1d4dc' },
            grid: { vertLines: { color: '#1a2340' }, horzLines: { color: '#1a2340' } },
            height: 250
        });
        this.choppySeries = this.choppyChart.addLineSeries({ color: '#4a9eff', lineWidth: 2 });

        // Add Choppy levels
        this.choppyChart.addLineSeries({ color: '#00ff88', lineWidth: 1, lineStyle: 2 })
            .setData([{ time: 0, value: 38.2 }, { time: 9999999999, value: 38.2 }]);
        this.choppyChart.addLineSeries({ color: '#ff4444', lineWidth: 1, lineStyle: 2 })
            .setData([{ time: 0, value: 61.8 }, { time: 9999999999, value: 61.8 }]);

        // 4. MACD Chart (NEW)
        const macdEl = document.getElementById('macdChart');
        if (macdEl) {
            this.macdChart = LightweightCharts.createChart(macdEl, {
                layout: { background: { color: '#0f1729' }, textColor: '#d1d4dc' },
                grid: { vertLines: { color: '#1a2340' }, horzLines: { color: '#1a2340' } },
                height: 250
            });

            // Histogram
            this.histogramSeries = this.macdChart.addHistogramSeries({
                color: '#26a69a',
                priceFormat: { type: 'volume' },
                priceScaleId: '', // Overlay style
            });

            // MACD Line (Fast)
            this.macdSeries = this.macdChart.addLineSeries({
                color: '#2962FF', // Blue
                lineWidth: 2,
                title: 'MACD'
            });

            // Signal Line (Slow)
            this.signalSeries = this.macdChart.addLineSeries({
                color: '#FF6D00', // Orange
                lineWidth: 2,
                title: 'Signal'
            });

            // Zero Line
            this.macdChart.addLineSeries({ color: '#666', lineWidth: 1, lineStyle: 2 })
                .setData([{ time: 0, value: 0 }, { time: 9999999999, value: 0 }]);
        }
    }

    // ================= DATA UPDATES =================

    updateCandles(candles) {
        this.candleSeries.setData(candles);
        this.mainChart.timeScale().fitContent();
    }

    updateMA(index, data, visible = true) {
        if (this.maSeries[index]) {
            if (visible) {
                this.maSeries[index].setData(data);
            } else {
                this.maSeries[index].setData([]);
            }
        }
    }

    updateRSI(data) {
        this.rsiSeries.setData(data);
        this.rsiChart.timeScale().fitContent();
    }

    updateChoppiness(data) {
        this.choppySeries.setData(data);
        this.choppyChart.timeScale().fitContent();
    }

    updateMACD(macdData, signalData, histogramData) {
        if (!this.macdChart) return;
        if (macdData) this.macdSeries.setData(macdData);
        if (signalData) this.signalSeries.setData(signalData);
        if (histogramData) this.histogramSeries.setData(histogramData);
        this.macdChart.timeScale().fitContent();
    }

    // ================= LIVE UPDATES =================

    updateLiveCandle(candle) {
        this.candleSeries.update(candle);
    }

    updateLiveMA(index, point) {
        if (this.maSeries[index]) {
            this.maSeries[index].update(point);
        }
    }

    updateLiveRSI(point) {
        this.rsiSeries.update(point);
    }

    updateLiveChoppiness(point) {
        this.choppySeries.update(point);
    }

    updateLiveMACD(macdPoint, signalPoint, histogramPoint) {
        if (!this.macdChart) return;
        if (macdPoint) this.macdSeries.update(macdPoint);
        if (signalPoint) this.signalSeries.update(signalPoint);
        if (histogramPoint) this.histogramSeries.update(histogramPoint);
    }
}