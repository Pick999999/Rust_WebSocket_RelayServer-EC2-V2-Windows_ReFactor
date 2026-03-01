/**
 * Deriv API Integration with SMC Analysis
 */
class DerivSMC {
    constructor() {
        this.ws = null;
        this.chart = null;
        this.candleSeries = null;
        this.ohlcData = [];
        this.subscriptionId = null;
        this.smcIndicator = null;
        this.isLive = false;
        this.boxPrimitives = []; // Store box primitives for Order Blocks and FVGs
        this.priceLines = []; // Store price lines drawn by user

        this.colors = {
            bullish: '#089981',
            bearish: '#F23645',
            // Order Block colors (semi-transparent)
            bullishOB: 'rgba(8, 153, 129, 0.3)',
            bearishOB: 'rgba(242, 54, 69, 0.3)',
            // FVG colors (semi-transparent)
            bullishFVG: 'rgba(0, 255, 104, 0.25)',
            bearishFVG: 'rgba(255, 82, 82, 0.25)',
            // Price line colors
            support: '#089981',
            resistance: '#F23645'
        };

        this.init();
    }

    init() {
        this.initChart();
        this.initDefaults();
        this.bindEvents();
    }

    initChart() {
        const container = document.getElementById('chart');
        this.chart = LightweightCharts.createChart(container, {
            width: container.clientWidth,
            height: 450,
            layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#a1a1aa' },
            grid: { vertLines: { color: 'rgba(255,255,255,0.05)' }, horzLines: { color: 'rgba(255,255,255,0.05)' } },
            crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
            rightPriceScale: { borderColor: 'rgba(255,255,255,0.1)' },
            timeScale: {
                borderColor: 'rgba(255,255,255,0.1)',
                timeVisible: true,
                tickMarkFormatter: (time, tickMarkType, locale) => {
                    const date = new Date(time * 1000);
                    let options = {};
                    if (tickMarkType === 0) options = { year: 'numeric' };
                    else if (tickMarkType === 1) options = { month: 'short', year: '2-digit' };
                    else if (tickMarkType === 2) options = { day: 'numeric' };
                    else if (tickMarkType === 3) options = { hour: '2-digit', minute: '2-digit' };
                    else if (tickMarkType === 4) options = { hour: '2-digit', minute: '2-digit', second: '2-digit' };
                    else options = { hour: '2-digit', minute: '2-digit' };
                    return date.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', ...options });
                }
            },
            localization: {
                timeFormatter: (time) => {
                    const date = new Date(time * 1000);
                    return date.toLocaleString('th-TH', {
                        timeZone: 'Asia/Bangkok',
                        year: 'numeric', month: '2-digit', day: '2-digit',
                        hour: '2-digit', minute: '2-digit'
                    });
                }
            }
        });

        this.candleSeries = this.chart.addCandlestickSeries({
            upColor: '#089981', downColor: '#F23645',
            borderUpColor: '#089981', borderDownColor: '#F23645',
            wickUpColor: '#089981', wickDownColor: '#F23645'
        });

        this.maSeries = [];
        for (let i = 0; i < 4; i++) {
            this.maSeries.push(this.chart.addLineSeries({
                color: '#ffffff',
                lineWidth: 2,
                crosshairMarkerVisible: true,
                lastValueVisible: true,
                priceLineVisible: true
            }));
        }

        window.addEventListener('resize', () => this.chart.applyOptions({ width: container.clientWidth }));
    }

    initDefaults() {
        const now = new Date();
        const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        document.getElementById('endDate').value = this.formatDateLocal(now);
        document.getElementById('startDate').value = this.formatDateLocal(past);
    }

    formatDateLocal(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const h = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        return `${y}-${m}-${d}T${h}:${min}`;
    }

    bindEvents() {
        document.getElementById('loadDataBtn').addEventListener('click', () => this.loadHistoricalData());
        document.getElementById('subscribeBtn').addEventListener('click', () => this.toggleLive());
        document.getElementById('analyzeBtn').addEventListener('click', () => this.analyze());
        document.getElementById('clearLinesBtn').addEventListener('click', () => this.clearPriceLines());

        // Add change listeners to all SMC toggle checkboxes
        const smcCheckboxes = ['showSwingPoints', 'showStructures', 'showOrderBlocks', 'showFVG', 'showEqualHL'];
        smcCheckboxes.forEach(id => {
            const checkbox = document.getElementById(id);
            if (checkbox) {
                checkbox.addEventListener('change', () => {
                    if (this.ohlcData.length > 0) {
                        this.analyze();
                    }
                });
            }
        });

        // Add listeners for Moving Averages
        for (let i = 1; i <= 4; i++) {
            ['show', 'type', 'period', 'color'].forEach(prop => {
                const el = document.getElementById(`ma${i}_${prop}`);
                if (el) {
                    el.addEventListener('change', () => {
                        this.updateMovingAverages();
                    });
                }
            });
        }

        // Add listeners for ATR highlighting
        ['show', 'period', 'multiplier', 'bull_color', 'bear_color'].forEach(prop => {
            const el = document.getElementById(`atr_${prop}`);
            if (el) el.addEventListener('change', () => {
                if (this.ohlcData.length > 0) this.analyze();
            });
        });

        // Chart click event for drawing price lines
        this.setupChartClickHandler();
    }

    setupChartClickHandler() {
        const chartContainer = document.getElementById('chart');

        chartContainer.addEventListener('click', (e) => {
            if (this.ohlcData.length === 0) return;

            // Check if Click Draw is enabled
            const isClickDrawEnabled = document.getElementById('userPriceLines').checked;
            if (!isClickDrawEnabled) return;

            // Get clicked coordinates
            const rect = chartContainer.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // Convert to chart coordinates
            const timeScale = this.chart.timeScale();
            const clickedTime = timeScale.coordinateToTime(x);
            const clickedPrice = this.candleSeries.coordinateToPrice(y);

            if (!clickedTime || !clickedPrice) return;

            // Find the candle at clicked time
            const candle = this.ohlcData.find(c => c.time === clickedTime);
            if (!candle) return;

            // Determine if bullish or bearish candle
            const isBullish = candle.close >= candle.open;

            // Draw price line
            // คลิกแท่งแดง (Bearish) → วาดแนวรับ (สีเขียว) ที่ low
            // คลิกแท่งเขียว (Bullish) → วาดแนวต้าน (สีแดง) ที่ high
            if (isBullish) {
                // Bullish candle - draw resistance at high
                this.drawPriceLine(candle.high, 'resistance', `แนวต้าน ${candle.high.toFixed(2)}`);
            } else {
                // Bearish candle - draw support at low
                this.drawPriceLine(candle.low, 'support', `แนวรับ ${candle.low.toFixed(2)}`);
            }
        });
    }

    drawPriceLine(price, type, title) {
        const color = type === 'support' ? this.colors.support : this.colors.resistance;
        const lineStyle = type === 'support' ? 0 : 0; // Solid line

        const priceLine = this.candleSeries.createPriceLine({
            price: price,
            color: color,
            lineWidth: 2,
            lineStyle: lineStyle,
            axisLabelVisible: true,
            title: title
        });

        this.priceLines.push(priceLine);
    }

    clearPriceLines() {
        for (const line of this.priceLines) {
            try {
                this.candleSeries.removePriceLine(line);
            } catch (e) {
                // Line may already be removed
            }
        }
        this.priceLines = [];
        this.setStatus('ลบ Price Lines ทั้งหมดแล้ว', 'success');
    }

    setStatus(msg, type = '') {
        const el = document.getElementById('status');
        el.textContent = msg;
        el.className = 'status ' + type;
    }

    connect() {
        return new Promise((resolve, reject) => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                // WebSocket already open, but still setup handler
                this.setupMessageHandler();
                resolve(this.ws);
                return;
            }

            this.ws = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=1089');
            this.ws.onopen = () => {
                this.setupMessageHandler();
                resolve(this.ws);
            };
            this.ws.onerror = (e) => reject(e);
            this.ws.onclose = () => { this.ws = null; this.isLive = false; };
        });
    }

    setupMessageHandler() {
        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.error) {
                this.setStatus('Error: ' + data.error.message, 'error');
                return;
            }

            // Capture subscription ID for later unsubscribe
            if (data.subscription) {
                this.subscriptionId = data.subscription.id;
            }

            if (data.candles) {
                this.ohlcData = data.candles.map(c => ({
                    time: c.epoch,
                    open: parseFloat(c.open),
                    high: parseFloat(c.high),
                    low: parseFloat(c.low),
                    close: parseFloat(c.close)
                }));

                this.candleSeries.setData(this.ohlcData);
                this.chart.timeScale().fitContent();

                // Different status message based on live mode
                if (this.isLive) {
                    this.setStatus(`Live: ${this.ohlcData.length} candles loaded`, 'success');
                } else {
                    this.setStatus(`Loaded ${this.ohlcData.length} candles`, 'success');
                }
                this.analyze();
            }

            // Only process OHLC updates if in live mode
            if (data.ohlc && this.isLive) {
                const candle = {
                    time: parseInt(data.ohlc.epoch),
                    open: parseFloat(data.ohlc.open),
                    high: parseFloat(data.ohlc.high),
                    low: parseFloat(data.ohlc.low),
                    close: parseFloat(data.ohlc.close)
                };
                this.updateCandle(candle);
            }
        };
    }

    async loadHistoricalData() {
        this.setStatus('Connecting to Deriv...', 'loading');

        try {
            await this.connect();

            const symbol = document.getElementById('symbolSelect').value;
            const granularity = parseInt(document.getElementById('granularity').value);
            const startDate = document.getElementById('startDate').value;
            const endDate = document.getElementById('endDate').value;
            const count = parseInt(document.getElementById('candleCount').value) || 200;

            const request = {
                ticks_history: symbol,
                adjust_start_time: 1,
                granularity: granularity,
                style: 'candles'
            };

            if (startDate && endDate) {
                request.start = Math.floor(new Date(startDate).getTime() / 1000);
                request.end = Math.floor(new Date(endDate).getTime() / 1000);
            } else {
                request.count = count;
                request.end = 'latest';
            }

            this.setStatus('Fetching data...', 'loading');

            this.ws.send(JSON.stringify(request));

        } catch (error) {
            this.setStatus('Connection failed: ' + error.message, 'error');
        }
    }

    async toggleLive() {
        const btn = document.getElementById('subscribeBtn');

        if (this.isLive) {
            // Set flag first to stop processing incoming messages
            this.isLive = false;
            this.unsubscribe();
            btn.textContent = '▶️ Live';
            this.setStatus('Live updates stopped', '');
            return;
        }

        try {
            await this.connect();

            const symbol = document.getElementById('symbolSelect').value;
            const granularity = parseInt(document.getElementById('granularity').value);
            const count = parseInt(document.getElementById('candleCount').value) || 200;

            // Clear old data first to avoid mixing different data sets
            this.ohlcData = [];
            this.candleSeries.setData([]);
            this.candleSeries.setMarkers([]);

            this.setStatus('Loading latest data...', 'loading');

            // Request latest candles WITH subscription for real-time updates
            const request = {
                ticks_history: symbol,
                adjust_start_time: 1,
                count: count,
                end: 'latest',
                granularity: granularity,
                style: 'candles',
                subscribe: 1
            };

            this.ws.send(JSON.stringify(request));
            this.isLive = true;
            btn.textContent = '⏹️ Stop';

        } catch (error) {
            this.setStatus('Live subscription failed', 'error');
        }
    }

    unsubscribe() {
        if (this.ws && this.subscriptionId) {
            this.ws.send(JSON.stringify({ forget: this.subscriptionId }));
            this.subscriptionId = null;
        }
    }

    updateCandle(candle) {
        // Get current granularity (in seconds)
        const granularity = parseInt(document.getElementById('granularity').value);

        // Calculate the candle start time based on granularity
        // Floor the epoch to the nearest granularity interval
        const candleTime = Math.floor(candle.time / granularity) * granularity;

        if (this.ohlcData.length === 0) {
            // First candle
            this.ohlcData.push({
                time: candleTime,
                open: candle.open,
                high: candle.high,
                low: candle.low,
                close: candle.close
            });
        } else {
            const lastIdx = this.ohlcData.length - 1;
            const lastCandle = this.ohlcData[lastIdx];

            if (lastCandle.time === candleTime) {
                // Same candle - update high, low, close
                lastCandle.high = Math.max(lastCandle.high, candle.high);
                lastCandle.low = Math.min(lastCandle.low, candle.low);
                lastCandle.close = candle.close;
                this.ohlcData[lastIdx] = lastCandle;
                // Re-analyze on every tick to show real-time changes
                this.analyze();
            } else if (candleTime > lastCandle.time) {
                // New candle - add to data
                this.ohlcData.push({
                    time: candleTime,
                    open: candle.open,
                    high: candle.high,
                    low: candle.low,
                    close: candle.close
                });
                // Re-analyze on new candle
                this.analyze();
            }
        }

        // Update chart with the current candle
        const lastCandle = this.ohlcData[this.ohlcData.length - 1];
        this.candleSeries.update(lastCandle);
    }

    analyze() {
        if (this.ohlcData.length < 10) {
            this.setStatus('Not enough data to analyze', 'error');
            return;
        }

        const config = {
            swingLength: parseInt(document.getElementById('swingLength').value) || 50,
            internalLength: 5,
            showOrderBlocks: document.getElementById('showOrderBlocks').checked,
            showFVG: document.getElementById('showFVG').checked,
            showEqualHL: document.getElementById('showEqualHL').checked
        };

        this.smcIndicator = new SMCIndicator(config);
        this.smcIndicator.calculate(this.ohlcData);

        const results = this.smcIndicator.getAllResults();
        this.renderMarkers(results);
        this.updateInfoPanel(results);
        this.updateAnalysisHint(results);
        this.updateMovingAverages();
    }

    updateMovingAverages() {
        if (!this.ohlcData || this.ohlcData.length === 0) return;

        for (let i = 1; i <= 4; i++) {
            const seriesIndex = i - 1;
            const showCheckbox = document.getElementById(`ma${i}_show`);
            if (!showCheckbox) continue;

            const show = showCheckbox.checked;
            const type = document.getElementById(`ma${i}_type`).value;
            const period = parseInt(document.getElementById(`ma${i}_period`).value) || 14;
            const color = document.getElementById(`ma${i}_color`).value;

            this.maSeries[seriesIndex].applyOptions({ color: color });

            if (show && typeof MovingAverages !== 'undefined') {
                const maData = MovingAverages.calculate(type, this.ohlcData, period);
                this.maSeries[seriesIndex].setData(maData);
            } else {
                this.maSeries[seriesIndex].setData([]);
            }
        }
    }

    renderMarkers(results) {
        const markers = [];

        // Check ATR abnormal logic and modify OHLC colors if needed
        let dataChanged = false;
        if (typeof this.updateATRHighlighting === 'function') {
            dataChanged = this.updateATRHighlighting(markers);
        }

        if (dataChanged) {
            this.candleSeries.setData(this.ohlcData);
        }

        // Clear previous box primitives
        this.clearBoxPrimitives();

        if (document.getElementById('showSwingPoints').checked) {
            for (const sp of results.swingPoints) {
                markers.push({
                    time: sp.time,
                    position: sp.swing === 'high' ? 'aboveBar' : 'belowBar',
                    color: sp.swing === 'high' ? this.colors.bearish : this.colors.bullish,
                    shape: sp.swing === 'high' ? 'arrowDown' : 'arrowUp',
                    text: sp.type,
                    size: 1
                });
            }
        }

        if (document.getElementById('showStructures').checked) {
            for (const s of results.structures) {
                markers.push({
                    time: s.time,
                    position: s.direction === 'bullish' ? 'aboveBar' : 'belowBar',
                    color: s.direction === 'bullish' ? this.colors.bullish : this.colors.bearish,
                    shape: 'circle',
                    text: s.type,
                    size: 0.5
                });
            }
        }

        if (document.getElementById('showEqualHL').checked) {
            for (const eq of results.equalHighsLows) {
                markers.push({
                    time: eq.time2,
                    position: eq.type === 'EQH' ? 'aboveBar' : 'belowBar',
                    color: eq.type === 'EQH' ? this.colors.bearish : this.colors.bullish,
                    shape: 'circle',
                    text: eq.type,
                    size: 0.5
                });
            }
        }

        markers.sort((a, b) => a.time - b.time);
        this.candleSeries.setMarkers(markers);

        // Render Order Blocks as boxes
        if (document.getElementById('showOrderBlocks').checked && results.orderBlocks) {
            this.renderOrderBlocks(results.orderBlocks);
        }

        // Render FVGs as boxes
        if (document.getElementById('showFVG').checked && results.fairValueGaps) {
            this.renderFVGs(results.fairValueGaps);
        }
    }

    updateATRHighlighting(markers) {
        if (!this.ohlcData || this.ohlcData.length === 0) return false;

        const show = document.getElementById('atr_show')?.checked;
        const period = parseInt(document.getElementById('atr_period')?.value) || 14;
        const multiplier = parseFloat(document.getElementById('atr_multiplier')?.value) || 2.0;
        const bullColor = document.getElementById('atr_bull_color')?.value || '#00FFFF';
        const bearColor = document.getElementById('atr_bear_color')?.value || '#FF00FF';

        let dataChanged = false;

        if (!show || this.ohlcData.length <= period) {
            for (let i = 0; i < this.ohlcData.length; i++) {
                if (this.ohlcData[i].color) {
                    delete this.ohlcData[i].color;
                    delete this.ohlcData[i].wickColor;
                    delete this.ohlcData[i].borderColor;
                    dataChanged = true;
                }
            }
            return dataChanged;
        }

        const tr = [0];
        for (let i = 1; i < this.ohlcData.length; i++) {
            const high = this.ohlcData[i].high;
            const low = this.ohlcData[i].low;
            const prevClose = this.ohlcData[i - 1].close;
            tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
        }

        const atr = new Array(this.ohlcData.length).fill(0);
        let sumTR = 0;
        for (let i = 1; i <= period; i++) sumTR += tr[i];
        atr[period] = sumTR / period;

        const alpha = 1 / period;
        for (let i = period + 1; i < this.ohlcData.length; i++) {
            atr[i] = (tr[i] - atr[i - 1]) * alpha + atr[i - 1]; // RMA
        }

        for (let i = 0; i < this.ohlcData.length; i++) {
            const candle = this.ohlcData[i];
            let shouldHighlight = false;
            let cColor = null;

            if (i > period) {
                const prevAtr = atr[i - 1];
                if (prevAtr > 0 && tr[i] > prevAtr * multiplier) {
                    shouldHighlight = true;
                    const isBull = candle.close >= candle.open;
                    cColor = isBull ? bullColor : bearColor;

                    markers.push({
                        time: candle.time,
                        position: isBull ? 'belowBar' : 'aboveBar',
                        color: cColor,
                        shape: isBull ? 'arrowUp' : 'arrowDown',
                        text: 'ATR',
                        size: 1
                    });
                }
            }

            if (shouldHighlight) {
                if (candle.color !== cColor) {
                    candle.color = cColor;
                    candle.wickColor = cColor;
                    candle.borderColor = cColor;
                    dataChanged = true;
                }
            } else {
                if (candle.color) {
                    delete candle.color;
                    delete candle.wickColor;
                    delete candle.borderColor;
                    dataChanged = true;
                }
            }
        }

        return dataChanged;
    }

    clearBoxPrimitives() {
        for (const primitive of this.boxPrimitives) {
            try {
                this.candleSeries.detachPrimitive(primitive);
            } catch (e) {
                // Primitive may already be detached
            }
        }
        this.boxPrimitives = [];
    }

    createBoxPrimitive(time1, time2, price1, price2, fillColor, borderColor = null) {
        const series = this.candleSeries;
        const chart = this.chart;

        // Create a proper primitive object for LightweightCharts 4.2
        class BoxPrimitive {
            constructor(time1, time2, price1, price2, fillColor, borderColor, series, chart) {
                this._time1 = time1;
                this._time2 = time2;
                this._price1 = price1;
                this._price2 = price2;
                this._fillColor = fillColor;
                this._borderColor = borderColor;
                this._series = series;
                this._chart = chart;
            }

            updateAllViews() { }

            priceAxisViews() {
                return [];
            }

            timeAxisViews() {
                return [];
            }

            paneViews() {
                return [new BoxPaneView(this)];
            }
        }

        class BoxPaneView {
            constructor(source) {
                this._source = source;
            }

            zOrder() {
                return 'bottom';
            }

            renderer() {
                return new BoxRenderer(this._source);
            }
        }

        class BoxRenderer {
            constructor(source) {
                this._source = source;
            }

            draw(target) {
                const source = this._source;
                target.useBitmapCoordinateSpace(scope => {
                    const ctx = scope.context;
                    const timeScale = source._chart.timeScale();
                    const hRatio = scope.horizontalPixelRatio;
                    const vRatio = scope.verticalPixelRatio;

                    const x1 = timeScale.timeToCoordinate(source._time1);
                    const x2 = source._time2 ? timeScale.timeToCoordinate(source._time2) : scope.bitmapSize.width / hRatio;
                    const y1 = source._series.priceToCoordinate(source._price1);
                    const y2 = source._series.priceToCoordinate(source._price2);

                    if (x1 === null || y1 === null || y2 === null) return;

                    const bx1 = Math.round(x1 * hRatio);
                    const bx2 = Math.round((x2 !== null ? x2 : scope.bitmapSize.width / hRatio) * hRatio);
                    const by1 = Math.round(y1 * vRatio);
                    const by2 = Math.round(y2 * vRatio);

                    const left = Math.min(bx1, bx2);
                    const right = Math.max(bx1, bx2);
                    const top = Math.min(by1, by2);
                    const bottom = Math.max(by1, by2);
                    const width = right - left;
                    const height = bottom - top;

                    if (width <= 0 || height <= 0) return;

                    ctx.fillStyle = source._fillColor;
                    ctx.fillRect(left, top, width, height);

                    if (source._borderColor) {
                        ctx.strokeStyle = source._borderColor;
                        ctx.lineWidth = Math.max(1, hRatio);
                        ctx.strokeRect(left + 0.5, top + 0.5, width - 1, height - 1);
                    }
                });
            }
        }

        return new BoxPrimitive(time1, time2, price1, price2, fillColor, borderColor, series, chart);
    }

    renderOrderBlocks(orderBlocks) {
        const currentTime = this.ohlcData.length > 0 ? this.ohlcData[this.ohlcData.length - 1].time : null;

        for (const ob of orderBlocks) {
            // Only show non-mitigated order blocks
            if (ob.mitigated) continue;

            const endTime = currentTime; // Extend to current candle
            const fillColor = ob.bias === 'bullish' ? this.colors.bullishOB : this.colors.bearishOB;
            const borderColor = ob.bias === 'bullish' ? this.colors.bullish : this.colors.bearish;

            const primitive = this.createBoxPrimitive(
                ob.time,
                endTime,
                ob.high,
                ob.low,
                fillColor,
                borderColor
            );

            try {
                this.candleSeries.attachPrimitive(primitive);
                this.boxPrimitives.push(primitive);
            } catch (e) {
                console.warn('Could not attach order block primitive:', e);
            }
        }
    }

    renderFVGs(fvgs) {
        const currentTime = this.ohlcData.length > 0 ? this.ohlcData[this.ohlcData.length - 1].time : null;

        for (const fvg of fvgs) {
            // Only show non-filled FVGs
            if (fvg.filled) continue;

            const endTime = currentTime; // Extend to current candle
            const fillColor = fvg.bias === 'bullish' ? this.colors.bullishFVG : this.colors.bearishFVG;
            const borderColor = fvg.bias === 'bullish' ? this.colors.bullish : this.colors.bearish;

            const primitive = this.createBoxPrimitive(
                fvg.time,
                endTime,
                fvg.top,
                fvg.bottom,
                fillColor,
                borderColor
            );

            try {
                this.candleSeries.attachPrimitive(primitive);
                this.boxPrimitives.push(primitive);
            } catch (e) {
                console.warn('Could not attach FVG primitive:', e);
            }
        }
    }

    updateInfoPanel(results) {
        const swingEl = document.getElementById('swingTrend');
        swingEl.textContent = results.swingTrend.toUpperCase();
        swingEl.className = `info-value ${results.swingTrend}`;

        const internalEl = document.getElementById('internalTrend');
        internalEl.textContent = results.internalTrend.toUpperCase();
        internalEl.className = `info-value ${results.internalTrend}`;

        const activeOBs = results.orderBlocks.filter(ob => !ob.mitigated);
        const bullOBs = activeOBs.filter(ob => ob.bias === 'bullish').length;
        const bearOBs = activeOBs.filter(ob => ob.bias === 'bearish').length;
        document.getElementById('orderBlockStats').innerHTML = `
            <span class="badge bullish">Bull: ${bullOBs}</span>
            <span class="badge bearish">Bear: ${bearOBs}</span>
        `;

        const recent = results.structures.slice(-5);
        let html = '';
        for (const s of recent) html += `<span class="badge ${s.direction}">${s.type}</span>`;
        document.getElementById('structureStats').innerHTML = html || '-';
    }

    updateAnalysisHint(results) {
        const hintContent = document.getElementById('hintContent');
        if (!hintContent) return;

        const lastCandle = this.ohlcData[this.ohlcData.length - 1];
        if (!lastCandle) {
            hintContent.innerHTML = '<p class="hint-placeholder">ไม่มีข้อมูล กรุณาโหลดข้อมูลก่อน</p>';
            return;
        }

        const currentPrice = lastCandle.close;
        let hints = [];

        // 1. Current Trend Analysis
        const swingTrend = results.swingTrend;
        const internalTrend = results.internalTrend;
        const trendEmoji = swingTrend === 'bullish' ? '📈' : swingTrend === 'bearish' ? '📉' : '➡️';
        const trendThai = swingTrend === 'bullish' ? 'ขาขึ้น' : swingTrend === 'bearish' ? 'ขาลง' : 'ไม่ชัดเจน';
        hints.push(`
            <div class="hint-item ${swingTrend}">
                <span class="hint-emoji">${trendEmoji}</span>
                <span class="hint-text">แนวโน้ม: <strong>${trendThai}</strong></span>
            </div>
        `);

        // 2. Recent Structure
        const recentStructure = results.structures.slice(-1)[0];
        if (recentStructure) {
            const structEmoji = recentStructure.type === 'CHoCH' ? '🔄' : '💥';
            const structThai = recentStructure.type === 'CHoCH' ? 'เปลี่ยนโครงสร้าง' : 'ทะลุโครงสร้าง';
            const dirThai = recentStructure.direction === 'bullish' ? 'ขาขึ้น' : 'ขาลง';
            hints.push(`
                <div class="hint-item ${recentStructure.direction}">
                    <span class="hint-emoji">${structEmoji}</span>
                    <span class="hint-text">ล่าสุด: <strong>${recentStructure.type}</strong> ${structThai} (${dirThai})</span>
                </div>
            `);
        }

        // 3. Active Order Blocks near price
        const activeOBs = results.orderBlocks.filter(ob => !ob.mitigated);
        const nearbyBullOB = activeOBs.find(ob => ob.bias === 'bullish' && currentPrice >= ob.low && currentPrice <= ob.high * 1.01);
        const nearbyBearOB = activeOBs.find(ob => ob.bias === 'bearish' && currentPrice <= ob.high && currentPrice >= ob.low * 0.99);

        if (nearbyBullOB) {
            hints.push(`
                <div class="hint-item bullish">
                    <span class="hint-emoji">🟢</span>
                    <span class="hint-text">ราคาอยู่ในโซน <strong>Order Block ขาขึ้น</strong></span>
                </div>
            `);
        }
        if (nearbyBearOB) {
            hints.push(`
                <div class="hint-item bearish">
                    <span class="hint-emoji">🔴</span>
                    <span class="hint-text">ราคาอยู่ในโซน <strong>Order Block ขาลง</strong></span>
                </div>
            `);
        }

        // 4. Active FVGs
        const activeFVGs = results.fairValueGaps ? results.fairValueGaps.filter(fvg => !fvg.filled) : [];
        const nearbyBullFVG = activeFVGs.find(fvg => fvg.bias === 'bullish' && currentPrice >= fvg.bottom && currentPrice <= fvg.top);
        const nearbyBearFVG = activeFVGs.find(fvg => fvg.bias === 'bearish' && currentPrice >= fvg.bottom && currentPrice <= fvg.top);

        if (nearbyBullFVG) {
            hints.push(`
                <div class="hint-item bullish">
                    <span class="hint-emoji">⬆️</span>
                    <span class="hint-text">ราคาอยู่ในโซน <strong>FVG ขาขึ้น</strong></span>
                </div>
            `);
        }
        if (nearbyBearFVG) {
            hints.push(`
                <div class="hint-item bearish">
                    <span class="hint-emoji">⬇️</span>
                    <span class="hint-text">ราคาอยู่ในโซน <strong>FVG ขาลง</strong></span>
                </div>
            `);
        }

        // 5. Order Block count
        const bullOBCount = activeOBs.filter(ob => ob.bias === 'bullish').length;
        const bearOBCount = activeOBs.filter(ob => ob.bias === 'bearish').length;
        hints.push(`
            <div class="hint-item info">
                <span class="hint-emoji">📦</span>
                <span class="hint-text">Order Blocks: <strong>${bullOBCount}</strong> ขาขึ้น, <strong>${bearOBCount}</strong> ขาลง</span>
            </div>
        `);

        // 6. Generate Signal/Recommendation
        let signal = '';
        let signalClass = 'wait';
        let signalEmoji = '⏳';
        let signalText = 'รอสัญญาณที่ชัดเจนกว่านี้';

        if (swingTrend === 'bullish' && internalTrend === 'bullish') {
            if (nearbyBullOB || nearbyBullFVG) {
                signalClass = 'buy';
                signalEmoji = '🟢';
                signalText = 'โซน BUY ที่แข็งแกร่ง - แนวโน้มขาขึ้น + ราคาอยู่ที่แนวรับ (OB/FVG)';
            } else {
                signalClass = 'buy';
                signalEmoji = '📈';
                signalText = 'แนวโน้มขาขึ้น - รอราคา Pullback ไปที่ OB/FVG เพื่อเข้า';
            }
        } else if (swingTrend === 'bearish' && internalTrend === 'bearish') {
            if (nearbyBearOB || nearbyBearFVG) {
                signalClass = 'sell';
                signalEmoji = '🔴';
                signalText = 'โซน SELL ที่แข็งแกร่ง - แนวโน้มขาลง + ราคาอยู่ที่แนวต้าน (OB/FVG)';
            } else {
                signalClass = 'sell';
                signalEmoji = '📉';
                signalText = 'แนวโน้มขาลง - รอราคา Pullback ไปที่ OB/FVG เพื่อเข้า';
            }
        } else if (swingTrend !== internalTrend) {
            signalEmoji = '⚠️';
            signalText = 'สัญญาณผสม - แนวโน้มหลักและย่อยขัดแย้งกัน รอการยืนยัน';
        }

        signal = `
            <div class="hint-signal ${signalClass}">
                <span class="hint-emoji">${signalEmoji}</span>
                <span class="hint-text">${signalText}</span>
            </div>
        `;

        hintContent.innerHTML = hints.join('') + signal;
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.derivSMC = new DerivSMC();
});
