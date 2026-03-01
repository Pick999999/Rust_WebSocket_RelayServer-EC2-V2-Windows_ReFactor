/**
 * Main Application Logic V4
 * Shows Top 8 Best Choppy Indicator + Candle Color Assets
 * With SMC Integration (HH, HL, BOS, CHoCH)
 */

const appV4 = {
    state: {
        timeframe: 60, // seconds
        refreshInterval: 60000, // ms
        // All 10 assets combined
        assets: [
            { symbol: 'R_10', name: 'Volatility 10 Index' },
            { symbol: 'R_25', name: 'Volatility 25 Index' },
            { symbol: 'R_50', name: 'Volatility 50 Index' },
            { symbol: 'R_75', name: 'Volatility 75 Index' },
            { symbol: 'R_100', name: 'Volatility 100 Index' },
            { symbol: '1HZ10V', name: 'Volatility 10 (1s) Index' },
            { symbol: '1HZ25V', name: 'Volatility 25 (1s) Index' },
            { symbol: '1HZ50V', name: 'Volatility 50 (1s) Index' },
            { symbol: '1HZ75V', name: 'Volatility 75 (1s) Index' },
            { symbol: '1HZ100V', name: 'Volatility 100 (1s) Index' }
        ],
        params: {
            ciPeriod: 14,
            adxPeriod: 14,
            adxSmoothing: 14,
            emaShort: { type: 'EMA', period: 7, show: true },
            emaMedium: { type: 'EMA', period: 25, show: true },
            emaLong: { type: 'EMA', period: 99, show: true },
            atr: { period: 14, multiplier: 1.5, show: true }
        },
        // Analysis Settings
        analysisSettings: {
            analysisVersion: 'V1', // 'V1' = Original, 'V2' = AnalysisGenerator Class
            flatThreshold: 0.00001,
            macdThreshold: 0.0001,
            hmaPeriod: 9,
            ehmaPeriod: 9,
            bbPeriod: 20,
            bbStdDev: 2
        },
        // SMC Settings
        smcSettings: {
            showSMC: true,
            swingLength: 20,
            internalLength: 5
        },
        // Tooltip field selections
        tooltipFields: {
            candletime: true,
            color: true,
            pipSize: true,
            emaShortValue: true,
            emaShortDirection: true,
            emaShortTurnType: false,
            emaMediumValue: true,
            emaMediumDirection: true,
            emaMediumTurnType: false,
            emaLongValue: true,
            emaLongDirection: true,
            emaLongTurnType: false,
            emashortMediumAbove: false,
            emaMediumLongAbove: false,
            macdShortMedium: false,
            macdMediumLong: false,
            emaShortMediumConvergenceType: false,
            emaMediumLongConvergenceType: false,
            choppyIndicator: true,
            adxValue: true,
            atr: false,
            isAbnormalCandle: false,
            bbValues: false,
            bbPosition: false,
            uWick: false,
            body: false,
            lWick: false,
            ShortCutMeduimType: false,
            candlesNoSinceShortCutMeduimCut: false,
            LongCutMeduimType: false,
            candlesNoSinceLongCutMeduimCut: false
        },
        dataStore: {}, // symbol -> { candles: [], metrics: {}, emaAnalysis: {}, smcData: {} }
        candleStore: {}, // symbol -> raw candles array
        analysisDataStore: {}, // symbol -> analysisData array
        meters: {}, // symbol -> MeterInstance
        reqIdMap: new Map(), // reqId -> symbol
        serverTimeOffset: 0,
        isPolling: true,
        beepEnabled: false,
        previousCrossovers: {}, // symbol -> { shortMedium, mediumLong }
        audioContext: null,
        nextUpdateTime: null,
        // Chart related
        selectedSymbol: null,
        chart: null,
        candleSeries: null,
        emaShortSeries: null,
        emaMediumSeries: null,
        emaLongSeries: null,
        chartPollInterval: null, // Interval for upgrading selected chart every 2 seconds
        chartReqId: null, // Request ID for selected asset data
        chartTooltip: null, // Chart tooltip element
        // Background Zones
        zonesEnabled: false,
        zonesPlugin: null,
        zonesSettings: {
            showCiZones: true,
            showRsiZones: true,
            ciTrendingThreshold: 38.2,
            ciChoppyThreshold: 61.8,
            rsiOversoldThreshold: 30,
            rsiOverboughtThreshold: 70,
            rsiPeriod: 14,
            showLabels: false
        },
        rsiArray: {}, // symbol -> RSI values array
        altColorZonesEnabled: false,
        altColorMarkers: []
    },

    init: async () => {
        appV4.updateStatus('Connecting...', 'disconnected');

        // Load saved settings from localStorage first
        appV4.loadSavedSettings();
        appV4.loadEmaSettings();

        // Connect Deriv (market data only)
        DerivAPI.onOpen = appV4.onConnected;
        DerivAPI.onMessage = appV4.onMessage;

        try {
            await DerivAPI.connect();
        } catch (e) {
            appV4.updateStatus('Connection Failed', 'disconnected');
        }

        // Clock
        if (appV4._clockInterval) clearInterval(appV4._clockInterval);
        appV4._clockInterval = setInterval(appV4.updateClock, 1000);

        // Initialize audio context on user interaction
        document.addEventListener('click', () => {
            if (!appV4.state.audioContext) {
                appV4.state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
        }, { once: true });
    },

    // Load saved settings from localStorage
    loadSavedSettings: () => {
        try {
            const saved = localStorage.getItem('choppyMeterV2Settings');
            if (saved) {
                const settings = JSON.parse(saved);

                // Apply saved values to inputs
                if (settings.timeframe) {
                    document.getElementById('timeframe-select').value = settings.timeframe;
                    appV4.state.timeframe = settings.timeframe;
                }
                if (settings.refreshInterval) {
                    document.getElementById('refresh-interval-select').value = settings.refreshInterval;
                    appV4.state.refreshInterval = settings.refreshInterval;
                }
                if (settings.beepEnabled !== undefined) {
                    document.getElementById('beep-toggle').checked = settings.beepEnabled;
                    appV4.state.beepEnabled = settings.beepEnabled;
                }

                // Ema Settings Loading... (Simplified for brevity, assuming standard DOM IDs match)
                // EMA Short
                if (settings.emaShort) {
                    if (settings.emaShort.type) document.getElementById('ema-short-type').value = settings.emaShort.type;
                    if (settings.emaShort.period) document.getElementById('ema-short-period').value = settings.emaShort.period;
                    if (settings.emaShort.show !== undefined) document.getElementById('ema-short-show').checked = settings.emaShort.show;
                }
                // EMA Medium
                if (settings.emaMedium) {
                    if (settings.emaMedium.type) document.getElementById('ema-medium-type').value = settings.emaMedium.type;
                    if (settings.emaMedium.period) document.getElementById('ema-medium-period').value = settings.emaMedium.period;
                    if (settings.emaMedium.show !== undefined) document.getElementById('ema-medium-show').checked = settings.emaMedium.show;
                }
                // EMA Long
                if (settings.emaLong) {
                    if (settings.emaLong.type) document.getElementById('ema-long-type').value = settings.emaLong.type;
                    if (settings.emaLong.period) document.getElementById('ema-long-period').value = settings.emaLong.period;
                    if (settings.emaLong.show !== undefined) document.getElementById('ema-long-show').checked = settings.emaLong.show;
                }
                // ATR
                if (settings.atr) {
                    if (settings.atr.period) document.getElementById('atr-period').value = settings.atr.period;
                    if (settings.atr.multiplier) document.getElementById('atr-multiplier').value = settings.atr.multiplier;
                    if (settings.atr.show !== undefined) document.getElementById('atr-show').checked = settings.atr.show;
                }

                // Analysis Settings
                if (settings.analysisSettings) {
                    appV4.state.analysisSettings = { ...appV4.state.analysisSettings, ...settings.analysisSettings };
                    const versionEl = document.getElementById('analysis-version');
                    if (versionEl && settings.analysisSettings.analysisVersion) {
                        versionEl.value = settings.analysisSettings.analysisVersion;
                    }
                }

                // Tooltip Fields
                if (settings.tooltipFields) {
                    appV4.state.tooltipFields = { ...appV4.state.tooltipFields, ...settings.tooltipFields };
                }
            }
        } catch (e) {
            console.error('Error loading settings:', e);
        }
    },

    saveSettings: () => {
        try {
            const settings = {
                timeframe: appV4.state.timeframe,
                refreshInterval: appV4.state.refreshInterval,
                beepEnabled: appV4.state.beepEnabled,
                emaShort: appV4.state.params.emaShort,
                emaMedium: appV4.state.params.emaMedium,
                emaLong: appV4.state.params.emaLong,
                atr: appV4.state.params.atr,
                analysisSettings: appV4.state.analysisSettings,
                tooltipFields: appV4.state.tooltipFields
            };
            localStorage.setItem('choppyMeterV2Settings', JSON.stringify(settings));
        } catch (e) {
            console.error('Error saving settings:', e);
        }
    },

    loadEmaSettings: () => {
        appV4.state.params.emaShort = {
            type: document.getElementById('ema-short-type').value,
            period: parseInt(document.getElementById('ema-short-period').value),
            show: document.getElementById('ema-short-show').checked
        };
        appV4.state.params.emaMedium = {
            type: document.getElementById('ema-medium-type').value,
            period: parseInt(document.getElementById('ema-medium-period').value),
            show: document.getElementById('ema-medium-show').checked
        };
        appV4.state.params.emaLong = {
            type: document.getElementById('ema-long-type').value,
            period: parseInt(document.getElementById('ema-long-period').value),
            show: document.getElementById('ema-long-show').checked
        };
        appV4.state.params.atr = {
            period: parseInt(document.getElementById('atr-period').value),
            multiplier: parseFloat(document.getElementById('atr-multiplier').value),
            show: document.getElementById('atr-show').checked
        };
    },

    onConnected: () => {
        appV4.updateStatus('Connected', 'connected');
        appV4.refreshData();
        appV4.syncTime();
        if (appV4._syncTimeInterval) clearInterval(appV4._syncTimeInterval);
        appV4._syncTimeInterval = setInterval(appV4.syncTime, 60000);
        appV4.startPolling();
    },

    syncTime: () => {
        if (DerivAPI.ws && DerivAPI.ws.readyState === 1) {
            DerivAPI.ws.send(JSON.stringify({ time: 1 }));
        }
    },

    startPolling: () => {
        if (appV4.pollInterval) clearInterval(appV4.pollInterval);
        appV4.state.nextUpdateTime = Date.now() + appV4.state.refreshInterval;
        appV4.pollInterval = setInterval(() => {
            appV4.refreshData();
            appV4.state.nextUpdateTime = Date.now() + appV4.state.refreshInterval;
        }, appV4.state.refreshInterval);
    },

    handleTimeframeChange: () => {
        const select = document.getElementById('timeframe-select');
        appV4.state.timeframe = parseInt(select.value);
        appV4.state.dataStore = {};
        appV4.state.candleStore = {};
        appV4.saveSettings();
        appV4.refreshData();
    },

    handleRefreshIntervalChange: () => {
        const select = document.getElementById('refresh-interval-select');
        appV4.state.refreshInterval = parseInt(select.value);
        appV4.saveSettings();
        appV4.startPolling();
    },

    toggleBeep: () => {
        appV4.state.beepEnabled = document.getElementById('beep-toggle').checked;
        appV4.saveSettings();
    },

    refreshData: () => {
        if (!DerivAPI.ws || DerivAPI.ws.readyState !== 1) return;
        appV4.loadEmaSettings();

        const grid = document.getElementById('asset-grid');
        if (grid.children.length === 0 || grid.querySelector('.loading-state')) {
            grid.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Fetching Data...</p></div>`;
        }

        appV4.state.assets.forEach((asset, index) => {
            const reqId = Date.now() + index;
            appV4.state.reqIdMap.set(reqId, asset.symbol);

            const req = {
                ticks_history: asset.symbol,
                adjust_start_time: 1,
                count: 150,
                end: 'latest',
                style: 'candles',
                granularity: appV4.state.timeframe,
                req_id: reqId
            };
            DerivAPI.ws.send(JSON.stringify(req));
        });
    },

    onMessage: (data) => {
        if (data.msg_type === 'candles') {
            const reqId = data.req_id;
            const symbol = appV4.state.reqIdMap.get(reqId);
            if (!symbol) return;

            if (reqId === appV4.state.chartReqId) {
                appV4.processChartData(symbol, data.candles);
            } else {
                appV4.processCandles(symbol, data.candles);
            }
        } else if (data.msg_type === 'time') {
            const serverTime = data.time * 1000;
            appV4.state.serverTimeOffset = serverTime - Date.now();
        }
    },

    calculateMA: (data, type, period) => {
        switch (type) {
            case 'SMA': return Indicators.sma(data, period);
            case 'WMA': return Indicators.wma(data, period);
            case 'HMA': return Indicators.hma(data, period);
            case 'EHMA': return Indicators.ehma(data, period);
            default: return Indicators.ema(data, period);
        }
    },

    processCandles: (symbol, candles) => {
        appV4.state.candleStore[symbol] = candles;

        const closes = candles.map(c => c.close);
        const highs = candles.map(c => c.high);
        const lows = candles.map(c => c.low);

        // Standard Indicators
        const ci = Indicators.ci(highs, lows, closes, appV4.state.params.ciPeriod);
        const adx = Indicators.adx(highs, lows, closes, appV4.state.params.adxPeriod);
        const emaShort = appV4.calculateMA(closes, appV4.state.params.emaShort.type, appV4.state.params.emaShort.period);
        const emaMedium = appV4.calculateMA(closes, appV4.state.params.emaMedium.type, appV4.state.params.emaMedium.period);
        const emaLong = appV4.calculateMA(closes, appV4.state.params.emaLong.type, appV4.state.params.emaLong.period);
        const atr = Indicators.atr(highs, lows, closes, appV4.state.params.atr.period);
        const bbValues = Indicators.bollingerBands(closes, appV4.state.analysisSettings.bbPeriod, appV4.state.analysisSettings.bbStdDev);

        // SMC Calculation
        let smcData = null;
        if (typeof SMCIndicator !== 'undefined') {
            const smc = new SMCIndicator({
                swingLength: appV4.state.smcSettings.swingLength,
                internalLength: appV4.state.smcSettings.internalLength
            });

            const smcInput = candles.map(c => ({
                time: c.epoch,
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close
            }));

            smc.calculate(smcInput);

            smcData = {
                swingPoints: smc.getSwingPoints(),
                structures: smc.getStructures(),
                orderBlocks: smc.getOrderBlocks(),
                fvg: smc.getFairValueGaps()
            };
        }

        const latestCandle = candles[candles.length - 1];
        const latestCI = ci[ci.length - 1];
        const latestADX = adx[adx.length - 1];

        // Crossover logic (simplified for V4 reproduction)
        const latestEmaShort = emaShort[emaShort.length - 1];
        const latestEmaMedium = emaMedium[emaMedium.length - 1];
        const latestEmaLong = emaLong[emaLong.length - 1];
        const shortMediumCrossover = appV4.detectCrossover(emaShort, emaMedium);
        const mediumLongCrossover = appV4.detectCrossover(emaMedium, emaLong);

        // Score calc
        const candleBonus = latestCandle.close >= latestCandle.open ? 10 : 0;
        const trendScore = (latestADX || 0) + (100 - (latestCI || 50)) + candleBonus;

        const emaArrays = { short: emaShort, medium: emaMedium, long: emaLong };
        const emaAnalysis = {
            shortMediumCrossover,
            mediumLongCrossover,
            shortValue: latestEmaShort,
            mediumValue: latestEmaMedium,
            longValue: latestEmaLong,
            // Slopes can be calculated if needed for UI
            shortSlope: latestEmaShort > emaShort[emaShort.length - 2] ? 'up' : 'down',
            mediumSlope: latestEmaMedium > emaMedium[emaMedium.length - 2] ? 'up' : 'down',
            longSlope: latestEmaLong > emaLong[emaLong.length - 2] ? 'up' : 'down'
        };

        appV4.state.dataStore[symbol] = {
            symbol,
            name: appV4.state.assets.find(a => a.symbol === symbol)?.name || symbol,
            price: latestCandle.close,
            ci: latestCI,
            adx: latestADX,
            score: trendScore,
            isGreen: latestCandle.close >= latestCandle.open,
            recentCandles: candles.slice(-10).map(c => c.close >= c.open ? 'up' : 'down'),
            emaArrays,
            atrArray: atr,
            ciArray: ci,
            adxArray: adx,
            bbValues,
            emaAnalysis,
            smcData
        };

        appV4.generateAnalysisData(symbol, candles, emaArrays, ci, adx, atr, bbValues);
        appV4.checkAllDataReceived();
    },

    processChartData: (symbol, candles) => {
        appV4.processCandles(symbol, candles);
        if (appV4.state.selectedSymbol === symbol && appV4.state.chart) {
            appV4.updateSelectedChart();
            appV4.renderSelectedAnalysis(appV4.state.dataStore[symbol]);
        }
    },

    detectCrossover: (fastMA, slowMA) => {
        const len = fastMA.length;
        if (len < 2) return 'none';
        const currFast = fastMA[len - 1];
        const currSlow = slowMA[len - 1];
        const prevFast = fastMA[len - 2];
        const prevSlow = slowMA[len - 2];
        if (currFast === null || currSlow === null) return 'none';
        if (prevFast <= prevSlow && currFast > currSlow) return 'golden';
        if (prevFast >= prevSlow && currFast < currSlow) return 'death';
        return 'none';
    },

    checkAllDataReceived: () => {
        const receivedCount = Object.keys(appV4.state.dataStore).length;
        if (receivedCount >= appV4.state.assets.length) {
            const sortedData = Object.values(appV4.state.dataStore)
                .sort((a, b) => b.score - a.score)
                .slice(0, 8);
            appV4.renderGrid(sortedData);
            if (appV4.state.selectedSymbol) appV4.updateSelectedChart();
        }
    },

    renderGrid: (dataList) => {
        const grid = document.getElementById('asset-grid');
        grid.innerHTML = '';
        dataList.forEach((data, index) => {
            const card = document.createElement('div');
            const isSelected = appV4.state.selectedSymbol === data.symbol;
            card.className = `top8-card clickable${index < 3 ? ` rank-${index + 1}` : ''}${isSelected ? ' selected-asset' : ''}`;
            card.dataset.symbol = data.symbol;
            card.innerHTML = `
                <span class="rank-badge-sm ${index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : ''}">#${index + 1}</span>
                <div class="card-header-sm">
                    <h3>${data.name}</h3>
                    <span class="symbol">${data.symbol}</span>
                    <span class="price">${data.price.toFixed(4)}</span>
                </div>
                <div class="stats-row-sm">
                    <span class="value" style="color: ${data.ci < 40 ? '#4ade80' : '#f87171'}">CI: ${data.ci ? data.ci.toFixed(1) : '-'}</span>
                    <span class="value">Score: ${data.score.toFixed(0)}</span>
                </div>
            `;
            card.onclick = () => appV4.selectAsset(data.symbol);
            grid.appendChild(card);
            setTimeout(() => {
                const meter = new ChoppyMeter(`meter-${data.symbol}`, { zones: [] });
                if (data.ci !== null) meter.setValue(data.ci);
                appV4.state.meters[data.symbol] = meter;
            }, 50);
        });
    },

    selectAsset: (symbol) => {
        appV4.state.selectedSymbol = symbol;

        document.querySelectorAll('.top8-card').forEach(card => card.classList.toggle('selected-asset', card.dataset.symbol === symbol));
        document.getElementById('selected-chart-panel').classList.remove('hidden');

        const assetData = appV4.state.dataStore[symbol];
        if (assetData) {
            document.getElementById('selected-asset-name').textContent = assetData.name;
            document.getElementById('selected-asset-symbol').textContent = symbol;
        }

        appV4.initChart();
        appV4.updateSelectedChart();
        appV4.startChartPolling();
        appV4.updateAnalysisDataViewer(symbol);
        document.getElementById('selected-chart-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    startChartPolling: () => {
        if (appV4.state.chartPollInterval) clearInterval(appV4.state.chartPollInterval);
        appV4.fetchSelectedAssetData();
        appV4.state.chartPollInterval = setInterval(appV4.fetchSelectedAssetData, 2000);
    },

    stopChartPolling: () => {
        if (appV4.state.chartPollInterval) {
            clearInterval(appV4.state.chartPollInterval);
            appV4.state.chartPollInterval = null;
        }
    },

    fetchSelectedAssetData: () => {
        const symbol = appV4.state.selectedSymbol;
        if (!symbol || !DerivAPI.ws) return;
        appV4.loadEmaSettings();
        const reqId = Date.now() + 999;
        appV4.state.chartReqId = reqId;
        appV4.state.reqIdMap.set(reqId, symbol);
        DerivAPI.ws.send(JSON.stringify({
            ticks_history: symbol,
            adjust_start_time: 1,
            count: 150,
            end: 'latest',
            style: 'candles',
            granularity: appV4.state.timeframe,
            req_id: reqId
        }));
    },

    closeChartPanel: () => {
        appV4.stopChartPolling();
        appV4.state.selectedSymbol = null;
        document.getElementById('selected-chart-panel').classList.add('hidden');
        document.querySelectorAll('.top8-card').forEach(card => card.classList.remove('selected-asset'));
        if (appV4.state.chart) {
            appV4.state.chart.remove();
            appV4.state.chart = null;
        }
    },

    initChart: () => {
        const container = document.getElementById('main-chart-container');
        if (appV4.state.chart) appV4.state.chart.remove();

        appV4.state.chart = LightweightCharts.createChart(container, {
            width: container.clientWidth,
            height: 400,
            layout: { background: { type: 'solid', color: '#1e293b' }, textColor: '#f8fafc' },
            grid: { vertLines: { color: 'rgba(255, 255, 255, 0.1)' }, horzLines: { color: 'rgba(255, 255, 255, 0.1)' } },
            timeScale: { timeVisible: true, secondsVisible: false }
        });

        appV4.state.candleSeries = appV4.state.chart.addCandlestickSeries({
            upColor: '#22c55e', downColor: '#ef4444',
            borderVisible: false, wickUpColor: '#22c55e', wickDownColor: '#ef4444'
        });

        appV4.state.emaShortSeries = appV4.state.chart.addLineSeries({ color: appV4.getEmaColor('short'), lineWidth: 2, title: 'EMA Short' });
        appV4.state.emaMediumSeries = appV4.state.chart.addLineSeries({ color: appV4.getEmaColor('medium'), lineWidth: 2, title: 'EMA Medium' });
        appV4.state.emaLongSeries = appV4.state.chart.addLineSeries({ color: appV4.getEmaColor('long'), lineWidth: 2, title: 'EMA Long' });

        // Tooltip logic omitted for brevity in Part 1, but should be here.
        // I will include tooltip resize handler at least.
        window.addEventListener('resize', () => {
            if (appV4.state.chart) appV4.state.chart.resize(container.clientWidth, 400);
        });
    },

    updateSelectedChart: () => {
        const symbol = appV4.state.selectedSymbol;
        if (!symbol || !appV4.state.chart) return;
        const candles = appV4.state.candleStore[symbol];
        const assetData = appV4.state.dataStore[symbol];
        if (!candles || !assetData) return;

        const atrArray = assetData.atrArray || [];
        const atrMultiplier = appV4.state.params.atr.multiplier;
        const showAtr = appV4.state.params.atr.show;

        const lwcData = candles.map((c, i) => {
            const size = Math.abs(c.high - c.low);
            const atr = atrArray[i];
            const isAbnormal = showAtr && atr && size > (atr * atrMultiplier);
            const isUp = c.close >= c.open;
            const color = isAbnormal ? (isUp ? '#00ff00' : '#ff0000') : (isUp ? '#22c55e' : '#ef4444');
            return { time: c.epoch, open: c.open, high: c.high, low: c.low, close: c.close, color, wickColor: color, borderColor: color };
        });

        appV4.state.candleSeries.setData(lwcData);

        // EMA Data
        const emaArrays = assetData.emaArrays;
        ['short', 'medium', 'long'].forEach(type => {
            const series = appV4.state[`ema${type.charAt(0).toUpperCase() + type.slice(1)}Series`];
            const data = [];
            candles.forEach((c, i) => {
                const val = emaArrays[type][i];
                if (val != null) data.push({ time: c.epoch, value: val });
            });
            series.setData(data);
            series.applyOptions({ visible: appV4.state.params[`ema${type.charAt(0).toUpperCase() + type.slice(1)}`].show });
        });

        // ========================
        // MARKER LOGIC
        // ========================
        let markers = [];

        // 1. Alternate Colors
        if (appV4.state.altColorMarkers) markers = [...appV4.state.altColorMarkers];

        // 2. SMC Markers
        if (appV4.state.smcSettings.showSMC && assetData.smcData) {
            const smc = assetData.smcData;

            // Swing Points
            if (smc.swingPoints) {
                smc.swingPoints.forEach(p => {
                    const isHigh = p.type.includes('H');
                    const isMinor = p.type === 'LH' || p.type === 'HL'; // Not quite true, but let's stick to type

                    markers.push({
                        time: p.time,
                        position: p.swing === 'high' ? 'aboveBar' : 'belowBar',
                        color: p.swing === 'high' ? '#ef4444' : '#22c55e',
                        shape: p.swing === 'high' ? 'arrowDown' : 'arrowUp',
                        text: p.type,
                        size: 2
                    });
                });
            }

            // Structure (BOS/CHoCH)
            if (smc.structures) {
                smc.structures.forEach(s => {
                    const isBullish = s.direction === 'bullish';
                    markers.push({
                        time: s.time,
                        position: isBullish ? 'belowBar' : 'aboveBar',
                        color: isBullish ? '#3b82f6' : '#f59e0b',
                        shape: 'circle',
                        text: s.type,
                        size: 1
                    });
                });
            }
        }

        // Sort and Set
        markers.sort((a, b) => a.time - b.time);
        appV4.state.candleSeries.setMarkers(markers);

        appV4.updateAnalysisDataViewer(symbol);
        if (appV4.state.zonesEnabled) appV4.updateChartZones();
        appV4.renderSelectedAnalysis(assetData);
        appV4.autoShowStatusCodeMarkers();
    },

    toggleSMC: () => {
        appV4.state.smcSettings.showSMC = !appV4.state.smcSettings.showSMC;
        const btn = document.getElementById('btn-smc-toggle');
        const status = document.getElementById('smc-status');

        if (appV4.state.smcSettings.showSMC) {
            btn.style.background = 'rgba(16, 185, 129, 0.3)';
            status.textContent = 'ON';
        } else {
            btn.style.background = 'rgba(16, 185, 129, 0.1)';
            status.textContent = 'OFF';
        }

        appV4.updateSelectedChart();
    },

// ... Part 2 to follow
