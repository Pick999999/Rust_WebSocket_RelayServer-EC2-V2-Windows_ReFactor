/**
 * Main Application Logic V3
 * Shows Top 8 Best Choppy Indicator + Candle Color Assets
 * With Chart Display and EMA Crossover Alerts
 * Enhanced with Tabbed Settings Modal and EMA Color Customization
 */

const appV3 = {
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
        dataStore: {}, // symbol -> { candles: [], metrics: {}, emaAnalysis: {} }
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
        chartPollInterval: null, // Interval for updating selected chart every 2 seconds
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
        // SMC Visualization
        smcEnabled: false,
        smcIndicator: null,
        smcRenderer: null,
        smcResults: {}, // symbol -> results
        smcConfig: {
            swingLength: 50,
            internalLength: 5,
            showOrderBlocks: true,
            showFVG: true,
            showStructure: true,
            showSwingPoints: true
        }
    },

    init: async () => {
        appV3.updateStatus('Connecting...', 'disconnected');

        // Load saved settings from localStorage first
        appV3.loadSavedSettings();

        // Load EMA settings from inputs
        appV3.loadEmaSettings();

        // Connect Deriv (market data only)
        DerivAPI.onOpen = appV3.onConnected;
        DerivAPI.onMessage = appV3.onMessage;

        try {
            await DerivAPI.connect();
        } catch (e) {
            appV3.updateStatus('Connection Failed', 'disconnected');
        }

        // Clock
        if (appV3._clockInterval) clearInterval(appV3._clockInterval);
        appV3._clockInterval = setInterval(appV3.updateClock, 1000);

        // Initialize audio context on user interaction
        document.addEventListener('click', () => {
            if (!appV3.state.audioContext) {
                appV3.state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
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
                    appV3.state.timeframe = settings.timeframe;
                }
                if (settings.refreshInterval) {
                    document.getElementById('refresh-interval-select').value = settings.refreshInterval;
                    appV3.state.refreshInterval = settings.refreshInterval;
                }
                if (settings.beepEnabled !== undefined) {
                    document.getElementById('beep-toggle').checked = settings.beepEnabled;
                    appV3.state.beepEnabled = settings.beepEnabled;
                }

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

                // Trading Settings (NEW)
                if (settings.tradingSettings) {
                    const durationEl = document.getElementById('trade-duration');
                    const durationUnitEl = document.getElementById('trade-duration-unit');
                    const moneyEl = document.getElementById('trade-money');
                    const tradeTypeEl = document.getElementById('trade-type');
                    const targetEl = document.getElementById('target-money');

                    if (durationEl && settings.tradingSettings.duration) durationEl.value = settings.tradingSettings.duration;
                    if (durationUnitEl && settings.tradingSettings.durationUnit) durationUnitEl.value = settings.tradingSettings.durationUnit;
                    if (moneyEl && settings.tradingSettings.money) moneyEl.value = settings.tradingSettings.money;
                    if (tradeTypeEl && settings.tradingSettings.tradeType) tradeTypeEl.value = settings.tradingSettings.tradeType;
                    if (targetEl && settings.tradingSettings.target) targetEl.value = settings.tradingSettings.target;
                }

                // Analysis Settings
                if (settings.analysisSettings) {
                    appV3.state.analysisSettings = { ...appV3.state.analysisSettings, ...settings.analysisSettings };
                    // Update analysis version dropdown
                    const versionEl = document.getElementById('analysis-version');
                    if (versionEl && settings.analysisSettings.analysisVersion) {
                        versionEl.value = settings.analysisSettings.analysisVersion;
                    }
                }

                // Tooltip Fields
                if (settings.tooltipFields) {
                    appV3.state.tooltipFields = { ...appV3.state.tooltipFields, ...settings.tooltipFields };
                }

                console.log('Settings loaded from localStorage');
            }
        } catch (e) {
            console.error('Error loading settings:', e);
        }
    },

    // Save all settings to localStorage
    saveSettings: () => {
        try {
            // Read trading settings from inputs
            const durationEl = document.getElementById('trade-duration');
            const durationUnitEl = document.getElementById('trade-duration-unit');
            const moneyEl = document.getElementById('trade-money');
            const tradeTypeEl = document.getElementById('trade-type');
            const targetEl = document.getElementById('target-money');

            const settings = {
                timeframe: appV3.state.timeframe,
                refreshInterval: appV3.state.refreshInterval,
                beepEnabled: appV3.state.beepEnabled,
                emaShort: appV3.state.params.emaShort,
                emaMedium: appV3.state.params.emaMedium,
                emaLong: appV3.state.params.emaLong,
                atr: appV3.state.params.atr,
                analysisSettings: appV3.state.analysisSettings,
                tooltipFields: appV3.state.tooltipFields,
                // Trading Settings (NEW)
                tradingSettings: {
                    duration: durationEl ? durationEl.value : 1,
                    durationUnit: durationUnitEl ? durationUnitEl.value : 'seconds',
                    money: moneyEl ? moneyEl.value : 1,
                    tradeType: tradeTypeEl ? tradeTypeEl.value : '1',
                    target: targetEl ? targetEl.value : 10
                }
            };
            localStorage.setItem('choppyMeterV2Settings', JSON.stringify(settings));
            console.log('Settings saved to localStorage');
        } catch (e) {
            console.error('Error saving settings:', e);
        }
    },

    loadEmaSettings: () => {
        appV3.state.params.emaShort = {
            type: document.getElementById('ema-short-type').value,
            period: parseInt(document.getElementById('ema-short-period').value),
            show: document.getElementById('ema-short-show').checked
        };
        appV3.state.params.emaMedium = {
            type: document.getElementById('ema-medium-type').value,
            period: parseInt(document.getElementById('ema-medium-period').value),
            show: document.getElementById('ema-medium-show').checked
        };
        appV3.state.params.emaLong = {
            type: document.getElementById('ema-long-type').value,
            period: parseInt(document.getElementById('ema-long-period').value),
            show: document.getElementById('ema-long-show').checked
        };
        appV3.state.params.atr = {
            period: parseInt(document.getElementById('atr-period').value),
            multiplier: parseFloat(document.getElementById('atr-multiplier').value),
            show: document.getElementById('atr-show').checked
        };
    },

    onConnected: () => {
        appV3.updateStatus('Connected', 'connected');
        appV3.refreshData();
        appV3.syncTime();
        if (appV3._syncTimeInterval) clearInterval(appV3._syncTimeInterval);
        appV3._syncTimeInterval = setInterval(appV3.syncTime, 60000);
        appV3.startPolling();
    },

    syncTime: () => {
        if (DerivAPI.ws && DerivAPI.ws.readyState === 1) {
            DerivAPI.ws.send(JSON.stringify({ time: 1 }));
        }
    },

    startPolling: () => {
        if (appV3.pollInterval) clearInterval(appV3.pollInterval);

        appV3.state.nextUpdateTime = Date.now() + appV3.state.refreshInterval;
        appV3.pollInterval = setInterval(() => {
            appV3.refreshData();
            appV3.state.nextUpdateTime = Date.now() + appV3.state.refreshInterval;
        }, appV3.state.refreshInterval);
    },

    handleTimeframeChange: () => {
        const select = document.getElementById('timeframe-select');
        appV3.state.timeframe = parseInt(select.value);
        appV3.state.dataStore = {}; // Clear old data
        appV3.state.candleStore = {};
        appV3.saveSettings();
        appV3.refreshData();
    },

    handleRefreshIntervalChange: () => {
        const select = document.getElementById('refresh-interval-select');
        appV3.state.refreshInterval = parseInt(select.value);
        appV3.saveSettings();
        appV3.startPolling();
    },

    toggleBeep: () => {
        appV3.state.beepEnabled = document.getElementById('beep-toggle').checked;
        appV3.saveSettings();
    },

    refreshData: () => {
        if (!DerivAPI.ws || DerivAPI.ws.readyState !== 1) return;

        // Reload EMA settings before fetching
        appV3.loadEmaSettings();

        const grid = document.getElementById('asset-grid');
        if (grid.children.length === 0 || grid.querySelector('.loading-state')) {
            grid.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Fetching Data...</p></div>`;
        }

        appV3.state.assets.forEach((asset, index) => {
            const reqId = Date.now() + index;
            appV3.state.reqIdMap.set(reqId, asset.symbol);

            // Need at least 150 candles for EMA calculations
            const req = {
                ticks_history: asset.symbol,
                adjust_start_time: 1,
                count: 150,
                end: 'latest',
                style: 'candles',
                granularity: appV3.state.timeframe,
                req_id: reqId
            };
            DerivAPI.ws.send(JSON.stringify(req));
        });
    },

    onMessage: (data) => {
        if (data.msg_type === 'candles') {
            const reqId = data.req_id;
            const symbol = appV3.state.reqIdMap.get(reqId);
            if (!symbol) return;

            // Check if this is a chart poll request (not a full refresh)
            if (reqId === appV3.state.chartReqId) {
                // Chart polling - only update chart, don't re-render grid
                appV3.processChartData(symbol, data.candles);
            } else {
                // Full refresh - update grid and meters
                appV3.processCandles(symbol, data.candles);
            }
        } else if (data.msg_type === 'time') {
            const serverTime = data.time * 1000;
            const localTime = Date.now();
            appV3.state.serverTimeOffset = serverTime - localTime;
        }
    },

    calculateMA: (data, type, period) => {
        switch (type) {
            case 'SMA':
                return Indicators.sma(data, period);
            case 'WMA':
                return Indicators.wma(data, period);
            case 'HMA':
                return Indicators.hma(data, period);
            case 'EHMA':
                return Indicators.ehma(data, period);
            case 'EMA':
            default:
                return Indicators.ema(data, period);
        }
    },

    calculateWMA: (data, period) => {
        const results = [];
        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) {
                results.push(null);
                continue;
            }
            let sum = 0;
            let weightSum = 0;
            for (let j = 0; j < period; j++) {
                const weight = period - j;
                sum += data[i - j] * weight;
                weightSum += weight;
            }
            results.push(sum / weightSum);
        }
        return results;
    },

    processCandles: (symbol, candles) => {
        // Store raw candles for chart
        appV3.state.candleStore[symbol] = candles;

        const closes = candles.map(c => c.close);
        const highs = candles.map(c => c.high);
        const lows = candles.map(c => c.low);

        // Calculate Indicators
        const ci = Indicators.ci(highs, lows, closes, appV3.state.params.ciPeriod);
        const adx = Indicators.adx(highs, lows, closes, appV3.state.params.adxPeriod);

        // Calculate EMAs
        const emaShort = appV3.calculateMA(closes, appV3.state.params.emaShort.type, appV3.state.params.emaShort.period);
        const emaMedium = appV3.calculateMA(closes, appV3.state.params.emaMedium.type, appV3.state.params.emaMedium.period);
        const emaLong = appV3.calculateMA(closes, appV3.state.params.emaLong.type, appV3.state.params.emaLong.period);

        // Calculate ATR for abnormal candle detection
        const atr = Indicators.atr(highs, lows, closes, appV3.state.params.atr.period);

        // Calculate Bollinger Bands
        const bbSettings = appV3.state.analysisSettings;
        const bbValues = Indicators.bollingerBands(closes, bbSettings.bbPeriod, bbSettings.bbStdDev);

        // Get Latest values
        const latestCI = ci[ci.length - 1];
        const latestADX = adx[adx.length - 1];
        const latestCandle = candles[candles.length - 1];

        const latestEmaShort = emaShort[emaShort.length - 1];
        const latestEmaMedium = emaMedium[emaMedium.length - 1];
        const latestEmaLong = emaLong[emaLong.length - 1];

        const prevEmaShort = emaShort[emaShort.length - 2];
        const prevEmaMedium = emaMedium[emaMedium.length - 2];
        const prevEmaLong = emaLong[emaLong.length - 2];

        // Calculate Slope Directions
        const emaShortSlope = latestEmaShort > prevEmaShort ? 'up' : latestEmaShort < prevEmaShort ? 'down' : 'flat';
        const emaMediumSlope = latestEmaMedium > prevEmaMedium ? 'up' : latestEmaMedium < prevEmaMedium ? 'down' : 'flat';
        const emaLongSlope = latestEmaLong > prevEmaLong ? 'up' : latestEmaLong < prevEmaLong ? 'down' : 'flat';

        // Detect Crossovers
        const shortMediumCrossover = appV3.detectCrossover(emaShort, emaMedium);
        const mediumLongCrossover = appV3.detectCrossover(emaMedium, emaLong);

        // Check for new crossover alert - only for selected asset
        if (appV3.state.beepEnabled && symbol === appV3.state.selectedSymbol) {
            const prevMediumLong = appV3.state.previousCrossovers[symbol]?.mediumLong || null;
            if (prevMediumLong !== null && mediumLongCrossover !== 'none' && prevMediumLong !== mediumLongCrossover) {
                appV3.playBeep(mediumLongCrossover === 'golden' ? 800 : 400);
            }
        }

        // Store previous crossovers
        appV3.state.previousCrossovers[symbol] = {
            shortMedium: shortMediumCrossover,
            mediumLong: mediumLongCrossover
        };

        // Score Logic = ADX + (100 - CI) + Candle Color Bonus
        const candleBonus = latestCandle.close >= latestCandle.open ? 10 : 0;
        const trendScore = (latestADX || 0) + (100 - (latestCI || 50)) + candleBonus;

        // Recent Candles
        const recentCandles = candles.slice(-10).map(c => c.close >= c.open ? 'up' : 'down');

        const emaArrays = {
            short: emaShort,
            medium: emaMedium,
            long: emaLong
        };

        appV3.state.dataStore[symbol] = {
            symbol: symbol,
            name: appV3.state.assets.find(a => a.symbol === symbol)?.name || symbol,
            price: latestCandle.close,
            ci: latestCI,
            adx: latestADX,
            score: trendScore,
            isGreen: latestCandle.close >= latestCandle.open,
            recentCandles: recentCandles,
            emaAnalysis: {
                shortSlope: emaShortSlope,
                mediumSlope: emaMediumSlope,
                longSlope: emaLongSlope,
                shortMediumCrossover: shortMediumCrossover,
                mediumLongCrossover: mediumLongCrossover,
                shortValue: latestEmaShort,
                mediumValue: latestEmaMedium,
                longValue: latestEmaLong
            },
            emaArrays: emaArrays,
            atrArray: atr,
            ciArray: ci,
            adxArray: adx,
            bbValues: bbValues
        };

        // Generate analysis data for tooltip
        appV3.generateAnalysisData(symbol, candles, emaArrays, ci, adx, atr, bbValues);

        appV3.checkAllDataReceived();
    },

    // Process chart data without re-rendering grid (for 2-second chart polling)
    processChartData: (symbol, candles) => {
        // Store raw candles for chart
        appV3.state.candleStore[symbol] = candles;

        const closes = candles.map(c => c.close);
        const highs = candles.map(c => c.high);
        const lows = candles.map(c => c.low);

        // Calculate Indicators
        const ci = Indicators.ci(highs, lows, closes, appV3.state.params.ciPeriod);
        const adx = Indicators.adx(highs, lows, closes, appV3.state.params.adxPeriod);

        // Calculate EMAs
        const emaShort = appV3.calculateMA(closes, appV3.state.params.emaShort.type, appV3.state.params.emaShort.period);
        const emaMedium = appV3.calculateMA(closes, appV3.state.params.emaMedium.type, appV3.state.params.emaMedium.period);
        const emaLong = appV3.calculateMA(closes, appV3.state.params.emaLong.type, appV3.state.params.emaLong.period);

        // Calculate ATR
        const atr = Indicators.atr(highs, lows, closes, appV3.state.params.atr.period);

        // Calculate Bollinger Bands
        const bbSettings = appV3.state.analysisSettings;
        const bbValues = Indicators.bollingerBands(closes, bbSettings.bbPeriod, bbSettings.bbStdDev);

        const emaArrays = {
            short: emaShort,
            medium: emaMedium,
            long: emaLong
        };

        // Update dataStore for this symbol (for chart rendering)
        if (appV3.state.dataStore[symbol]) {
            appV3.state.dataStore[symbol].emaArrays = emaArrays;
            appV3.state.dataStore[symbol].atrArray = atr;
            appV3.state.dataStore[symbol].ciArray = ci;
            appV3.state.dataStore[symbol].adxArray = adx;
            appV3.state.dataStore[symbol].bbValues = bbValues;
        }

        // Generate analysis data for tooltip
        appV3.generateAnalysisData(symbol, candles, emaArrays, ci, adx, atr, bbValues);

        // Only update chart, do NOT re-render grid
        if (appV3.state.selectedSymbol === symbol && appV3.state.chart) {
            appV3.updateSelectedChart();
            appV3.renderSelectedAnalysis(appV3.state.dataStore[symbol]);
        }
    },


    detectCrossover: (fastMA, slowMA) => {
        const len = fastMA.length;
        if (len < 2) return 'none';

        const currFast = fastMA[len - 1];
        const currSlow = slowMA[len - 1];
        const prevFast = fastMA[len - 2];
        const prevSlow = slowMA[len - 2];

        if (currFast === null || currSlow === null || prevFast === null || prevSlow === null) {
            return 'none';
        }

        // Golden Cross: Fast crosses above Slow
        if (prevFast <= prevSlow && currFast > currSlow) {
            return 'golden';
        }
        // Death Cross: Fast crosses below Slow
        if (prevFast >= prevSlow && currFast < currSlow) {
            return 'death';
        }

        return 'none';
    },

    playBeep: (frequency = 800) => {
        if (!appV3.state.audioContext) {
            appV3.state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        const ctx = appV3.state.audioContext;
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.5);
    },

    checkAllDataReceived: () => {
        const receivedCount = Object.keys(appV3.state.dataStore).length;

        if (receivedCount >= appV3.state.assets.length) {
            // Sort by Score (Best to Worst)
            const sortedData = Object.values(appV3.state.dataStore)
                .sort((a, b) => b.score - a.score)
                .slice(0, 8); // Top 8 only

            appV3.renderGrid(sortedData);

            // Update chart if asset is selected
            if (appV3.state.selectedSymbol) {
                appV3.updateSelectedChart();
            }
        }
    },

    renderGrid: (dataList) => {
        const grid = document.getElementById('asset-grid');
        grid.innerHTML = '';

        dataList.forEach((data, index) => {
            const card = document.createElement('div');
            const isSelected = appV3.state.selectedSymbol === data.symbol;
            card.className = `top8-card clickable${index < 3 ? ` rank-${index + 1}` : ''}${isSelected ? ' selected-asset' : ''}`;
            card.dataset.symbol = data.symbol;

            // Rank badge
            let badgeClass = '';
            if (index === 0) badgeClass = 'gold';
            else if (index === 1) badgeClass = 'silver';
            else if (index === 2) badgeClass = 'bronze';

            // Candle Colors HTML
            const candlesHtml = data.recentCandles.map(dir =>
                `<div class="candle-dot-sm ${dir}"></div>`
            ).join('');

            const cardHtml = `
                <span class="rank-badge-sm ${badgeClass}">#${index + 1}</span>
                <div class="card-header-sm">
                    <h3>${data.name}</h3>
                    <span class="symbol">${data.symbol}</span>
                    <span class="price">${data.price.toFixed(4)}</span>
                </div>
                <span class="direction-badge ${data.isGreen ? 'bull' : 'bear'}">
                    ${data.isGreen ? '▲ BULL' : '▼ BEAR'}
                </span>
                <div class="meter-container-sm">
                    <div class="canvas-container-sm">
                        <canvas id="meter-${data.symbol}"></canvas>
                    </div>
                </div>
                <div class="stats-row-sm">
                    <div class="stat-sm">
                        <span class="label">CI</span>
                        <span class="value">${data.ci ? data.ci.toFixed(1) : '-'}</span>
                    </div>
                    <div class="stat-sm">
                        <span class="label">ADX</span>
                        <span class="value">${data.adx ? data.adx.toFixed(1) : '-'}</span>
                    </div>
                    <div class="stat-sm">
                        <span class="label">Score</span>
                        <span class="value" style="color: var(--primary)">${data.score.toFixed(0)}</span>
                    </div>
                </div>
                <div class="candle-strip-sm">
                    ${candlesHtml}
                </div>
            `;

            card.innerHTML = cardHtml;

            // Click handler to show chart
            card.addEventListener('click', () => appV3.selectAsset(data.symbol));

            grid.appendChild(card);

            // Init Meter (smaller version)
            setTimeout(() => {
                const meter = new ChoppyMeter(`meter-${data.symbol}`, {
                    zones: [
                        { from: 0, to: 38.2, color: '#22c55e' },
                        { from: 38.2, to: 61.8, color: '#eab308' },
                        { from: 61.8, to: 100, color: '#ef4444' }
                    ]
                });
                if (data.ci !== null) {
                    meter.setValue(data.ci);
                }
                appV3.state.meters[data.symbol] = meter;
            }, 50);
        });
    },

    selectAsset: (symbol) => {
        appV3.state.selectedSymbol = symbol;

        // Update card selection visual
        document.querySelectorAll('.top8-card').forEach(card => {
            card.classList.toggle('selected-asset', card.dataset.symbol === symbol);
        });

        // Show chart panel
        const panel = document.getElementById('selected-chart-panel');
        panel.classList.remove('hidden');

        // Update header
        const assetData = appV3.state.dataStore[symbol];
        if (assetData) {
            document.getElementById('selected-asset-name').textContent = assetData.name;
            document.getElementById('selected-asset-symbol').textContent = symbol;
        }

        // Initialize or update chart
        appV3.initChart();
        appV3.updateSelectedChart();

        // Start polling for chart updates every 2 seconds
        appV3.startChartPolling();

        // Update trading symbol for DerivTrader
        if (typeof DerivTrader !== 'undefined') {
            DerivTrader.setTradingSymbol(symbol);
        }

        // Update Analysis Data viewer
        appV3.updateAnalysisDataViewer(symbol);

        // Update Lucide icons for new elements
        lucide.createIcons();

        // Scroll to chart panel
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    // Start polling for selected asset chart every 2 seconds
    startChartPolling: () => {
        // Clear existing interval if any
        if (appV3.state.chartPollInterval) {
            clearInterval(appV3.state.chartPollInterval);
        }

        // Fetch immediately
        appV3.fetchSelectedAssetData();

        // Then poll every 2 seconds
        appV3.state.chartPollInterval = setInterval(() => {
            appV3.fetchSelectedAssetData();
        }, 2000);
    },

    // Stop chart polling
    stopChartPolling: () => {
        if (appV3.state.chartPollInterval) {
            clearInterval(appV3.state.chartPollInterval);
            appV3.state.chartPollInterval = null;
        }
    },

    // Fetch data for selected asset only
    fetchSelectedAssetData: () => {
        const symbol = appV3.state.selectedSymbol;
        if (!symbol) return;
        if (!DerivAPI.ws || DerivAPI.ws.readyState !== 1) return;

        // Reload EMA settings
        appV3.loadEmaSettings();

        const reqId = Date.now() + 999; // Unique ID for chart request
        appV3.state.chartReqId = reqId;
        appV3.state.reqIdMap.set(reqId, symbol);

        const req = {
            ticks_history: symbol,
            adjust_start_time: 1,
            count: 150,
            end: 'latest',
            style: 'candles',
            granularity: appV3.state.timeframe,
            req_id: reqId
        };
        DerivAPI.ws.send(JSON.stringify(req));
    },

    closeChartPanel: () => {
        // Stop chart polling
        appV3.stopChartPolling();

        appV3.state.selectedSymbol = null;
        document.getElementById('selected-chart-panel').classList.add('hidden');

        // Remove selection from cards
        document.querySelectorAll('.top8-card').forEach(card => {
            card.classList.remove('selected-asset');
        });

        // Destroy chart
        if (appV3.state.chart) {
            appV3.state.chart.remove();
            appV3.state.chart = null;
            appV3.state.candleSeries = null;
            appV3.state.emaShortSeries = null;
            appV3.state.emaMediumSeries = null;
            appV3.state.emaLongSeries = null;
        }
    },

    initChart: () => {
        const container = document.getElementById('main-chart-container');

        // Destroy existing chart if any
        if (appV3.state.chart) {
            appV3.state.chart.remove();
        }

        // Create new chart (v4.x compatible)
        appV3.state.chart = LightweightCharts.createChart(container, {
            width: container.clientWidth,
            height: 400,
            layout: {
                background: { type: 'solid', color: '#1e293b' },
                textColor: '#f8fafc',
            },
            grid: {
                vertLines: { color: 'rgba(255, 255, 255, 0.1)' },
                horzLines: { color: 'rgba(255, 255, 255, 0.1)' },
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
            },
        });

        // Candlestick series
        appV3.state.candleSeries = appV3.state.chart.addCandlestickSeries({
            upColor: '#22c55e',
            downColor: '#ef4444',
            borderVisible: false,
            wickUpColor: '#22c55e',
            wickDownColor: '#ef4444',
        });

        // EMA Short (customizable color)
        appV3.state.emaShortSeries = appV3.state.chart.addLineSeries({
            color: appV3.getEmaColor('short'),
            lineWidth: 2,
            title: 'EMA Short'
        });

        // EMA Medium (customizable color)
        appV3.state.emaMediumSeries = appV3.state.chart.addLineSeries({
            color: appV3.getEmaColor('medium'),
            lineWidth: 2,
            title: 'EMA Medium'
        });

        // EMA Long (customizable color)
        appV3.state.emaLongSeries = appV3.state.chart.addLineSeries({
            color: appV3.getEmaColor('long'),
            lineWidth: 2,
            title: 'EMA Long'
        });

        // Create tooltip element
        let tooltip = document.getElementById('chart-tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'chart-tooltip';
            tooltip.className = 'chart-tooltip';
            tooltip.style.display = 'none';
            container.appendChild(tooltip);
        }
        appV3.state.chartTooltip = tooltip;

        // Initialize SMC Renderer
        if (typeof SMCChartRenderer !== 'undefined') {
            appV3.state.smcRenderer = new SMCChartRenderer(appV3.state.chart, appV3.state.candleSeries);
        }

        // Subscribe to crosshair move for tooltip
        appV3.state.chart.subscribeCrosshairMove((param) => {
            if (!param.time || !param.point || param.point.x < 0 || param.point.y < 0) {
                tooltip.style.display = 'none';
                return;
            }

            const symbol = appV3.state.selectedSymbol;
            const analysisData = appV3.state.analysisDataStore[symbol];
            if (!analysisData) {
                tooltip.style.display = 'none';
                return;
            }

            // Find the analysis data for this timestamp
            const dataPoint = analysisData.find(d => d.candletime === param.time);
            if (!dataPoint) {
                tooltip.style.display = 'none';
                return;
            }

            // Build tooltip content based on selected fields
            const fields = appV3.state.tooltipFields;
            let html = '';

            // Header
            if (fields.candletime || fields.color) {
                html += '<div class="tooltip-header">';
                if (fields.candletime) {
                    html += `<span class="tooltip-time">${dataPoint.candletimeDisplay}</span>`;
                }
                if (fields.color) {
                    html += `<span class="tooltip-color ${dataPoint.color.toLowerCase()}">${dataPoint.color}</span>`;
                }
                html += '</div>';
            }

            // Basic Info
            let basicHtml = '';
            if (fields.pipSize) basicHtml += `<div class="tooltip-row"><span class="tooltip-label">Pip Size:</span><span class="tooltip-value">${dataPoint.pipSize}</span></div>`;
            if (basicHtml) html += `<div class="tooltip-section">${basicHtml}</div>`;

            // EMA Short
            let emaShortHtml = '';
            if (fields.emaShortValue) emaShortHtml += `<div class="tooltip-row"><span class="tooltip-label">Short:</span><span class="tooltip-value">${dataPoint.emaShortValue || '-'}</span></div>`;
            if (fields.emaShortDirection) emaShortHtml += `<div class="tooltip-row"><span class="tooltip-label">Direction:</span><span class="tooltip-value ${(dataPoint.emaShortDirection || '').toLowerCase()}">${dataPoint.emaShortDirection || '-'}</span></div>`;
            if (fields.emaShortTurnType && dataPoint.emaShortTurnType) emaShortHtml += `<div class="tooltip-row"><span class="tooltip-label">Turn:</span><span class="tooltip-value">${dataPoint.emaShortTurnType}</span></div>`;
            if (emaShortHtml) html += `<div class="tooltip-section"><div class="tooltip-section-title">EMA Short</div>${emaShortHtml}</div>`;

            // EMA Medium
            let emaMediumHtml = '';
            if (fields.emaMediumValue) emaMediumHtml += `<div class="tooltip-row"><span class="tooltip-label">Medium:</span><span class="tooltip-value">${dataPoint.emaMediumValue || '-'}</span></div>`;
            if (fields.emaMediumDirection) emaMediumHtml += `<div class="tooltip-row"><span class="tooltip-label">Direction:</span><span class="tooltip-value ${(dataPoint.emaMediumDirection || '').toLowerCase()}">${dataPoint.emaMediumDirection || '-'}</span></div>`;
            if (fields.emaMediumTurnType && dataPoint.emaMediumTurnType) emaMediumHtml += `<div class="tooltip-row"><span class="tooltip-label">Turn:</span><span class="tooltip-value">${dataPoint.emaMediumTurnType}</span></div>`;
            if (emaMediumHtml) html += `<div class="tooltip-section"><div class="tooltip-section-title">EMA Medium</div>${emaMediumHtml}</div>`;

            // EMA Long
            let emaLongHtml = '';
            if (fields.emaLongValue) emaLongHtml += `<div class="tooltip-row"><span class="tooltip-label">Long:</span><span class="tooltip-value">${dataPoint.emaLongValue || '-'}</span></div>`;
            if (fields.emaLongDirection) emaLongHtml += `<div class="tooltip-row"><span class="tooltip-label">Direction:</span><span class="tooltip-value ${(dataPoint.emaLongDirection || '').toLowerCase()}">${dataPoint.emaLongDirection || '-'}</span></div>`;
            if (fields.emaLongTurnType && dataPoint.emaLongTurnType) emaLongHtml += `<div class="tooltip-row"><span class="tooltip-label">Turn:</span><span class="tooltip-value">${dataPoint.emaLongTurnType}</span></div>`;
            if (emaLongHtml) html += `<div class="tooltip-section"><div class="tooltip-section-title">EMA Long</div>${emaLongHtml}</div>`;

            // Crossover & MACD
            let crossHtml = '';
            if (fields.emashortMediumAbove) crossHtml += `<div class="tooltip-row"><span class="tooltip-label">Short > Medium:</span><span class="tooltip-value">${dataPoint.emashortMediumAbove ? 'Yes' : 'No'}</span></div>`;
            if (fields.emaMediumLongAbove) crossHtml += `<div class="tooltip-row"><span class="tooltip-label">Medium > Long:</span><span class="tooltip-value">${dataPoint.emaMediumLongAbove ? 'Yes' : 'No'}</span></div>`;
            if (fields.macdShortMedium) crossHtml += `<div class="tooltip-row"><span class="tooltip-label">MACD S-M:</span><span class="tooltip-value">${dataPoint.macdShortMedium || '-'}</span></div>`;
            if (fields.macdMediumLong) crossHtml += `<div class="tooltip-row"><span class="tooltip-label">MACD M-L:</span><span class="tooltip-value">${dataPoint.macdMediumLong || '-'}</span></div>`;
            if (fields.emaShortMediumConvergenceType) crossHtml += `<div class="tooltip-row"><span class="tooltip-label">S-M Type:</span><span class="tooltip-value ${(dataPoint.emaShortMediumConvergenceType || '').toLowerCase()}">${dataPoint.emaShortMediumConvergenceType || '-'}</span></div>`;
            if (fields.emaMediumLongConvergenceType) crossHtml += `<div class="tooltip-row"><span class="tooltip-label">M-L Type:</span><span class="tooltip-value ${(dataPoint.emaMediumLongConvergenceType || '').toLowerCase()}">${dataPoint.emaMediumLongConvergenceType || '-'}</span></div>`;
            if (crossHtml) html += `<div class="tooltip-section"><div class="tooltip-section-title">Crossover</div>${crossHtml}</div>`;

            // Indicators
            let indHtml = '';
            if (fields.choppyIndicator) indHtml += `<div class="tooltip-row"><span class="tooltip-label">CI:</span><span class="tooltip-value">${dataPoint.choppyIndicator || '-'}</span></div>`;
            if (fields.adxValue) indHtml += `<div class="tooltip-row"><span class="tooltip-label">ADX:</span><span class="tooltip-value">${dataPoint.adxValue || '-'}</span></div>`;
            if (fields.atr) indHtml += `<div class="tooltip-row"><span class="tooltip-label">ATR:</span><span class="tooltip-value">${dataPoint.atr || '-'}</span></div>`;
            if (fields.isAbnormalCandle) indHtml += `<div class="tooltip-row"><span class="tooltip-label">Abnormal:</span><span class="tooltip-value ${dataPoint.isAbnormalCandle ? 'up' : ''}">${dataPoint.isAbnormalCandle ? 'YES' : 'No'}</span></div>`;
            if (indHtml) html += `<div class="tooltip-section"><div class="tooltip-section-title">Indicators</div>${indHtml}</div>`;

            // Bollinger Bands
            let bbHtml = '';
            if (fields.bbValues && dataPoint.bbValues.upper !== null) {
                bbHtml += `<div class="tooltip-row"><span class="tooltip-label">Upper:</span><span class="tooltip-value">${dataPoint.bbValues.upper}</span></div>`;
                bbHtml += `<div class="tooltip-row"><span class="tooltip-label">Middle:</span><span class="tooltip-value">${dataPoint.bbValues.middle}</span></div>`;
                bbHtml += `<div class="tooltip-row"><span class="tooltip-label">Lower:</span><span class="tooltip-value">${dataPoint.bbValues.lower}</span></div>`;
            }
            if (fields.bbPosition) bbHtml += `<div class="tooltip-row"><span class="tooltip-label">Position:</span><span class="tooltip-value">${dataPoint.bbPosition || '-'}</span></div>`;
            if (bbHtml) html += `<div class="tooltip-section"><div class="tooltip-section-title">Bollinger Bands</div>${bbHtml}</div>`;

            // Candle Structure
            let candleHtml = '';
            if (fields.uWick) candleHtml += `<div class="tooltip-row"><span class="tooltip-label">U.Wick:</span><span class="tooltip-value">${dataPoint.uWick} (${dataPoint.uWickPercent}%)</span></div>`;
            if (fields.body) candleHtml += `<div class="tooltip-row"><span class="tooltip-label">Body:</span><span class="tooltip-value">${dataPoint.body} (${dataPoint.bodyPercent}%)</span></div>`;
            if (fields.lWick) candleHtml += `<div class="tooltip-row"><span class="tooltip-label">L.Wick:</span><span class="tooltip-value">${dataPoint.lWick} (${dataPoint.lWickPercent}%)</span></div>`;
            if (candleHtml) html += `<div class="tooltip-section"><div class="tooltip-section-title">Candle Structure</div>${candleHtml}</div>`;

            // Crossover Positions
            let cutHtml = '';
            if (fields.ShortCutMeduimType && dataPoint.ShortCutMeduimType) cutHtml += `<div class="tooltip-row"><span class="tooltip-label">S-M Cut:</span><span class="tooltip-value">${dataPoint.ShortCutMeduimType}</span></div>`;
            if (fields.candlesNoSinceShortCutMeduimCut && dataPoint.candlesNoSinceShortCutMeduimCut !== null) cutHtml += `<div class="tooltip-row"><span class="tooltip-label">Since S-M:</span><span class="tooltip-value">${dataPoint.candlesNoSinceShortCutMeduimCut} bars</span></div>`;
            if (fields.LongCutMeduimType && dataPoint.LongCutMeduimType) cutHtml += `<div class="tooltip-row"><span class="tooltip-label">M-L Cut:</span><span class="tooltip-value">${dataPoint.LongCutMeduimType}</span></div>`;
            if (fields.candlesNoSinceLongCutMeduimCut && dataPoint.candlesNoSinceLongCutMeduimCut !== null) cutHtml += `<div class="tooltip-row"><span class="tooltip-label">Since M-L:</span><span class="tooltip-value">${dataPoint.candlesNoSinceLongCutMeduimCut} bars</span></div>`;
            if (cutHtml) html += `<div class="tooltip-section"><div class="tooltip-section-title">Crossover Position</div>${cutHtml}</div>`;

            if (!html) {
                tooltip.style.display = 'none';
                return;
            }

            tooltip.innerHTML = html;
            tooltip.style.display = 'block';

            // Position tooltip
            const containerRect = container.getBoundingClientRect();
            let left = param.point.x + 15;
            let top = param.point.y + 15;

            // Adjust if tooltip goes outside container
            if (left + tooltip.offsetWidth > containerRect.width) {
                left = param.point.x - tooltip.offsetWidth - 15;
            }
            if (top + tooltip.offsetHeight > containerRect.height) {
                top = param.point.y - tooltip.offsetHeight - 15;
            }

            tooltip.style.left = left + 'px';
            tooltip.style.top = top + 'px';
        });

        // Resize handler
        const resizeHandler = () => {
            appV3.state.chart.resize(container.clientWidth, 400);
        };
        window.addEventListener('resize', resizeHandler);
    },

    updateSelectedChart: () => {
        const symbol = appV3.state.selectedSymbol;
        if (!symbol || !appV3.state.chart) return;

        const candles = appV3.state.candleStore[symbol];
        const assetData = appV3.state.dataStore[symbol];
        if (!candles || !assetData) return;

        // Get ATR array and multiplier for abnormal detection
        const atrArray = assetData.atrArray || [];
        const atrMultiplier = appV3.state.params.atr.multiplier;
        const showAtrHighlight = appV3.state.params.atr.show;

        // Process candle data for chart with ATR-based coloring
        const lwcData = candles.map((c, i) => {
            const candleSize = Math.abs(c.high - c.low);
            const atrValue = atrArray[i];
            const isAbnormal = showAtrHighlight && atrValue !== null && candleSize > (atrValue * atrMultiplier);
            const isUp = c.close >= c.open;

            // Normal colors: #22c55e (green), #ef4444 (red)
            // Bright colors for abnormal: #00ff00 (bright green), #ff0000 (bright red)
            let color, wickColor, borderColor;

            if (isAbnormal) {
                color = isUp ? '#00ff00' : '#ff0000';
                wickColor = isUp ? '#00ff00' : '#ff0000';
                borderColor = isUp ? '#00ff00' : '#ff0000';
            } else {
                color = isUp ? '#22c55e' : '#ef4444';
                wickColor = isUp ? '#22c55e' : '#ef4444';
                borderColor = isUp ? '#22c55e' : '#ef4444';
            }

            return {
                time: c.epoch,
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close,
                color: color,
                wickColor: wickColor,
                borderColor: borderColor
            };
        });

        // Process EMA data - filter out null/undefined values properly
        const emaShortData = [];
        const emaMediumData = [];
        const emaLongData = [];

        const emaArrays = assetData.emaArrays;

        for (let i = 0; i < candles.length; i++) {
            // Use != null to catch both null and undefined
            if (emaArrays.short[i] != null && appV3.state.params.emaShort.show) {
                emaShortData.push({ time: candles[i].epoch, value: emaArrays.short[i] });
            }
            if (emaArrays.medium[i] != null && appV3.state.params.emaMedium.show) {
                emaMediumData.push({ time: candles[i].epoch, value: emaArrays.medium[i] });
            }
            if (emaArrays.long[i] != null && appV3.state.params.emaLong.show) {
                emaLongData.push({ time: candles[i].epoch, value: emaArrays.long[i] });
            }
        }

        // Set data to series
        appV3.state.candleSeries.setData(lwcData);
        appV3.state.emaShortSeries.setData(emaShortData);
        appV3.state.emaMediumSeries.setData(emaMediumData);
        appV3.state.emaLongSeries.setData(emaLongData);

        // Update visibility based on show settings
        appV3.state.emaShortSeries.applyOptions({ visible: appV3.state.params.emaShort.show });
        appV3.state.emaMediumSeries.applyOptions({ visible: appV3.state.params.emaMedium.show });
        appV3.state.emaLongSeries.applyOptions({ visible: appV3.state.params.emaLong.show });

        // Update analysis panel
        appV3.renderSelectedAnalysis(assetData);

        // Update Analysis Data viewer
        appV3.updateAnalysisDataViewer(symbol);

        // Update background zones if enabled
        if (appV3.state.zonesEnabled && typeof appV3.updateChartZones === 'function') {
            appV3.updateChartZones();
        }

        // Auto-show StatusCode markers if checkbox is checked
        if (typeof appV3.autoShowStatusCodeMarkers === 'function') {
            appV3.autoShowStatusCodeMarkers();
        }

        // Update Choppy Indicator display
        if (typeof appV3.updateChoppyIndicatorDisplay === 'function') {
            appV3.updateChoppyIndicatorDisplay(symbol);
        }

        // Update Alternate Color Zones if enabled
        if (typeof appV3.updateAlternateColorZones === 'function') {
            appV3.updateAlternateColorZones();
        }

        // Update SMC Visualization if enabled
        if (appV3.state.smcEnabled) {
            appV3.updateSMCVisualization(symbol, candles);
        } else if (appV3.state.smcRenderer) {
            appV3.state.smcRenderer.clear();
        }
    },


    renderSelectedAnalysis: (data) => {
        const container = document.getElementById('selected-analysis-content');
        const analysis = data.emaAnalysis;

        const getSlopeIcon = (slope) => {
            if (slope === 'up') return '▲';
            if (slope === 'down') return '▼';
            return '—';
        };

        const getCrossoverStatus = (crossover) => {
            if (crossover === 'golden') return '<span class="crossover-status golden">🔺 Golden Cross</span>';
            if (crossover === 'death') return '<span class="crossover-status death">🔻 Death Cross</span>';
            return '<span class="crossover-status none">No Signal</span>';
        };

        // Lag detection: medium turned down but long still up
        const lagHtml = (analysis.mediumSlope === 'down' && analysis.longSlope === 'up')
            ? `<div class="slope-lag warning">⚠️ EMA Medium ลง แต่ EMA Long ยังคงขึ้น (Lag)</div>`
            : '';

        container.innerHTML = `
            <!-- EMA Values -->
            <div class="analysis-section">
                <div class="analysis-section-title">EMA Values</div>
                <div class="ema-values-section">
                    <div class="ema-value-item short">
                        <div class="ema-type">Short (${appV3.state.params.emaShort.period})</div>
                        <div class="ema-val">${analysis.shortValue ? analysis.shortValue.toFixed(4) : '-'}</div>
                    </div>
                    <div class="ema-value-item medium">
                        <div class="ema-type">Medium (${appV3.state.params.emaMedium.period})</div>
                        <div class="ema-val">${analysis.mediumValue ? analysis.mediumValue.toFixed(4) : '-'}</div>
                    </div>
                    <div class="ema-value-item long">
                        <div class="ema-type">Long (${appV3.state.params.emaLong.period})</div>
                        <div class="ema-val">${analysis.longValue ? analysis.longValue.toFixed(4) : '-'}</div>
                    </div>
                </div>
            </div>

            <!-- Slope Directions -->
            <div class="analysis-section">
                <div class="analysis-section-title">Slope Directions</div>
                <div class="slope-indicator">
                    <span class="slope-name">EMA Short</span>
                    <span class="slope-badge ${analysis.shortSlope}">${getSlopeIcon(analysis.shortSlope)} ${analysis.shortSlope.toUpperCase()}</span>
                </div>
                <div class="slope-indicator">
                    <span class="slope-name">EMA Medium</span>
                    <span class="slope-badge ${analysis.mediumSlope}">${getSlopeIcon(analysis.mediumSlope)} ${analysis.mediumSlope.toUpperCase()}</span>
                </div>
                <div class="slope-indicator">
                    <span class="slope-name">EMA Long</span>
                    <span class="slope-badge ${analysis.longSlope}">${getSlopeIcon(analysis.longSlope)} ${analysis.longSlope.toUpperCase()}</span>
                </div>
                ${lagHtml}
            </div>

            <!-- Crossover Signals -->
            <div class="analysis-section">
                <div class="analysis-section-title">Crossover Signals</div>
                <div class="crossover-indicator">
                    <span class="crossover-name">Short ✕ Medium</span>
                    ${getCrossoverStatus(analysis.shortMediumCrossover)}
                </div>
                <div class="crossover-indicator">
                    <span class="crossover-name">Medium ✕ Long</span>
                    ${getCrossoverStatus(analysis.mediumLongCrossover)}
                </div>
            </div>

            <!-- Legend -->
            <div class="chart-legend">
                <div class="legend-item">
                    <span class="legend-color short"></span>
                    <span>EMA Short (${appV3.state.params.emaShort.period})</span>
                </div>
                <div class="legend-item">
                    <span class="legend-color medium"></span>
                    <span>EMA Medium (${appV3.state.params.emaMedium.period})</span>
                </div>
                <div class="legend-item">
                    <span class="legend-color long"></span>
                    <span>EMA Long (${appV3.state.params.emaLong.period})</span>
                </div>
            </div>
        `;
    },

    renderAnalysisPanel: (dataList) => {
        // Kept for reference but hidden by default
        const grid = document.getElementById('ema-analysis-grid');
        grid.innerHTML = '';

        dataList.forEach((data, index) => {
            const analysis = data.emaAnalysis;

            const card = document.createElement('div');
            card.className = 'analysis-card';

            const getSlopeIcon = (slope) => {
                if (slope === 'up') return '▲';
                if (slope === 'down') return '▼';
                return '—';
            };

            const getCrossoverBadge = (crossover) => {
                if (crossover === 'golden') return '<span class="crossover-badge golden">🔺 Golden</span>';
                if (crossover === 'death') return '<span class="crossover-badge death">🔻 Death</span>';
                return '<span class="crossover-badge none">—</span>';
            };

            card.innerHTML = `
                <div class="asset-name">
                    ${data.name}
                    <span class="rank">#${index + 1}</span>
                </div>
                <div class="slopes-section">
                    <div class="slope-row">
                        <span class="slope-label">Short Slope</span>
                        <span class="slope-value ${analysis.shortSlope}">${getSlopeIcon(analysis.shortSlope)} ${analysis.shortSlope.toUpperCase()}</span>
                    </div>
                    <div class="slope-row">
                        <span class="slope-label">Medium Slope</span>
                        <span class="slope-value ${analysis.mediumSlope}">${getSlopeIcon(analysis.mediumSlope)} ${analysis.mediumSlope.toUpperCase()}</span>
                    </div>
                    <div class="slope-row">
                        <span class="slope-label">Long Slope</span>
                        <span class="slope-value ${analysis.longSlope}">${getSlopeIcon(analysis.longSlope)} ${analysis.longSlope.toUpperCase()}</span>
                    </div>
                </div>
                <div class="crossover-section">
                    <div class="crossover-row">
                        <span class="crossover-label">Short ✕ Medium</span>
                        ${getCrossoverBadge(analysis.shortMediumCrossover)}
                    </div>
                    <div class="crossover-row">
                        <span class="crossover-label">Medium ✕ Long</span>
                        ${getCrossoverBadge(analysis.mediumLongCrossover)}
                    </div>
                </div>
            `;

            grid.appendChild(card);
        });
    },

    updateStatus: (text, type) => {
        const el = document.getElementById('connection-status');
        el.className = `status-pill ${type}`;
        el.innerHTML = `<span class="dot"></span> ${text}`;
    },

    updateClock: () => {
        const systemTime = Date.now();
        const serverTime = systemTime + appV3.state.serverTimeOffset;
        const now = new Date(serverTime);

        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const thaiTime = new Date(utc + (3600000 * 7));

        const h = thaiTime.getHours();
        const m = thaiTime.getMinutes();
        const s = thaiTime.getSeconds();

        const timeString = thaiTime.toLocaleTimeString('en-US', { hour12: false });
        document.getElementById('server-time').innerText = `${timeString} (TH)`;

        const hDeg = (h % 12) * 30 + m * 0.5;
        const mDeg = m * 6;
        const sDeg = s * 6;

        const hourHand = document.getElementById('clock-hour');
        const minuteHand = document.getElementById('clock-minute');
        const secondHand = document.getElementById('clock-second');

        if (hourHand) hourHand.style.transform = `translateX(-50%) rotate(${hDeg}deg)`;
        if (minuteHand) minuteHand.style.transform = `translateX(-50%) rotate(${mDeg}deg)`;
        if (secondHand) secondHand.style.transform = `translateX(-50%) rotate(${sDeg}deg)`;
    },

    toggleConnection: () => {
        const btn = document.getElementById('btn-connect-toggle');
        if (appV3.state.isPolling) {
            appV3.state.isPolling = false;
            if (appV3.pollInterval) clearInterval(appV3.pollInterval);
            if (DerivAPI.ws) DerivAPI.ws.close();

            appV3.updateStatus('Stopped', 'disconnected');
            btn.innerHTML = '<i data-lucide="play"></i> Start';
            btn.classList.add('stopped');
        } else {
            appV3.state.isPolling = true;
            appV3.init();
            btn.innerHTML = '<i data-lucide="power"></i> Stop';
            btn.classList.remove('stopped');
            setTimeout(() => lucide.createIcons(), 100);
        }
    },

    // ========================================
    // MODAL FUNCTIONS
    // ========================================

    openAnalysisSettingsModal: () => {
        const modal = document.getElementById('analysis-settings-modal');
        const settings = appV3.state.analysisSettings;

        // Populate inputs with current values
        document.getElementById('flat-threshold').value = settings.flatThreshold;
        document.getElementById('macd-threshold').value = settings.macdThreshold;
        document.getElementById('hma-period').value = settings.hmaPeriod;
        document.getElementById('ehma-period').value = settings.ehmaPeriod;
        document.getElementById('bb-period').value = settings.bbPeriod;
        document.getElementById('bb-stddev').value = settings.bbStdDev;

        modal.classList.remove('hidden');
        lucide.createIcons();
    },

    closeAnalysisSettingsModal: () => {
        document.getElementById('analysis-settings-modal').classList.add('hidden');
    },

    saveAnalysisSettings: () => {
        appV3.state.analysisSettings = {
            analysisVersion: appV3.state.analysisSettings.analysisVersion || 'V1', // Preserve version
            flatThreshold: parseFloat(document.getElementById('flat-threshold').value),
            macdThreshold: parseFloat(document.getElementById('macd-threshold').value),
            hmaPeriod: parseInt(document.getElementById('hma-period').value),
            ehmaPeriod: parseInt(document.getElementById('ehma-period').value),
            bbPeriod: parseInt(document.getElementById('bb-period').value),
            bbStdDev: parseFloat(document.getElementById('bb-stddev').value)
        };

        appV3.saveSettings();
        appV3.closeAnalysisSettingsModal();

        // Recalculate with new settings
        appV3.state.dataStore = {};
        appV3.state.candleStore = {};
        appV3.state.analysisDataStore = {};
        appV3.refreshData();

        console.log('Analysis settings saved:', appV3.state.analysisSettings);
    },

    // Set Analysis Version (V1 = Original, V2 = AnalysisGenerator Class)
    setAnalysisVersion: (version) => {
        console.log(`🔄 Switching to Analysis Version: ${version}`);
        appV3.state.analysisSettings.analysisVersion = version;

        // Save to localStorage
        appV3.saveSettings();

        // Clear cached analysis data to force recalculation
        appV3.state.analysisDataStore = {};
        appV3.state.dataStore = {};
        appV3.state.candleStore = {};

        // Refresh data with new version
        appV3.refreshData();
    },

    // ========================================
    // ANALYSIS DATA VIEWER FUNCTIONS
    // ========================================

    // Update the analysis data textarea
    updateAnalysisDataViewer: (symbol) => {
        const textarea = document.getElementById('analysis-data-textarea');
        const recordCountEl = document.getElementById('analysis-record-count');
        const symbolEl = document.getElementById('analysis-current-symbol');
        const versionEl = document.getElementById('analysis-data-version');

        if (!textarea) return;

        const analysisData = appV3.state.analysisDataStore[symbol];
        const version = appV3.state.analysisSettings.analysisVersion || 'V1';

        // Update version badge
        if (versionEl) {
            versionEl.textContent = version;
            versionEl.style.background = version === 'V2' ? '#10b981' : 'var(--accent-primary)';
        }

        if (!analysisData || analysisData.length === 0) {
            textarea.value = 'No analysis data available for ' + symbol;
            if (recordCountEl) recordCountEl.textContent = '0';
            if (symbolEl) symbolEl.textContent = symbol || '-';
            return;
        }

        // Update stats
        if (recordCountEl) recordCountEl.textContent = analysisData.length;
        if (symbolEl) symbolEl.textContent = symbol;

        // Format JSON with indentation
        try {
            textarea.value = JSON.stringify(analysisData, null, 2);
        } catch (e) {
            textarea.value = 'Error formatting data: ' + e.message;
        }
    },

    // Refresh analysis data for current symbol
    refreshAnalysisData: () => {
        const symbol = appV3.state.selectedSymbol;
        if (!symbol) {
            alert('Please select an asset first');
            return;
        }

        // Clear cached data for this symbol
        delete appV3.state.analysisDataStore[symbol];
        delete appV3.state.dataStore[symbol];
        delete appV3.state.candleStore[symbol];

        // Refresh
        appV3.refreshData();

        // Update viewer after a delay
        setTimeout(() => {
            appV3.updateAnalysisDataViewer(symbol);
        }, 2000);
    },

    // Copy analysis data to clipboard
    copyAnalysisData: () => {
        const textarea = document.getElementById('analysis-data-textarea');
        if (!textarea || !textarea.value) {
            alert('No data to copy');
            return;
        }

        navigator.clipboard.writeText(textarea.value).then(() => {
            // Show feedback
            const btn = document.querySelector('[onclick="appV3.copyAnalysisData()"]');
            if (btn) {
                const originalText = btn.innerHTML;
                btn.innerHTML = '<i data-lucide="check"></i> Copied!';
                btn.style.background = '#10b981';
                setTimeout(() => {
                    btn.innerHTML = originalText;
                    btn.style.background = '';
                    lucide.createIcons();
                }, 1500);
            }
        }).catch(err => {
            console.error('Failed to copy:', err);
            // Fallback
            textarea.select();
            document.execCommand('copy');
        });
    },

    // Toggle analysis viewer visibility
    toggleAnalysisViewer: () => {
        const content = document.getElementById('analysis-viewer-content');
        const btn = document.getElementById('btn-toggle-analysis');

        if (!content) return;

        const isHidden = content.style.display === 'none';
        content.style.display = isHidden ? 'block' : 'none';

        if (btn) {
            btn.innerHTML = isHidden ? '<i data-lucide="chevron-down"></i>' : '<i data-lucide="chevron-right"></i>';
            lucide.createIcons();
        }
    },


    openTooltipFieldsModal: () => {
        const modal = document.getElementById('tooltip-fields-modal');
        const fields = appV3.state.tooltipFields;

        // Set checkbox states based on current selections
        modal.querySelectorAll('[data-field]').forEach(checkbox => {
            const field = checkbox.dataset.field;
            if (fields.hasOwnProperty(field)) {
                checkbox.checked = fields[field];
            }
        });

        modal.classList.remove('hidden');
        lucide.createIcons();
    },

    closeTooltipFieldsModal: () => {
        document.getElementById('tooltip-fields-modal').classList.add('hidden');
    },

    saveTooltipFields: () => {
        const modal = document.getElementById('tooltip-fields-modal');

        modal.querySelectorAll('[data-field]').forEach(checkbox => {
            const field = checkbox.dataset.field;
            appV3.state.tooltipFields[field] = checkbox.checked;
        });

        appV3.saveSettings();
        appV3.closeTooltipFieldsModal();
        console.log('Tooltip fields saved:', appV3.state.tooltipFields);
    },

    selectAllTooltipFields: () => {
        document.querySelectorAll('#tooltip-fields-modal [data-field]').forEach(checkbox => {
            checkbox.checked = true;
        });
    },

    deselectAllTooltipFields: () => {
        document.querySelectorAll('#tooltip-fields-modal [data-field]').forEach(checkbox => {
            checkbox.checked = false;
        });
    },

    // ========================================
    // GENERATE ANALYSIS DATA
    // ========================================

    generateAnalysisData: (symbol, candles, emaArrays, ciArray, adxArray, atrArray, bbValues) => {
        // Check if V2 (AnalysisGenerator Class) should be used
        if (appV3.state.analysisSettings.analysisVersion === 'V2' && typeof AnalysisGenerator !== 'undefined') {
            return appV3.generateAnalysisDataV2(symbol, candles);
        }

        // V1: Original Implementation
        const analysisData = [];
        const flatThreshold = appV3.state.analysisSettings.flatThreshold;
        const macdThreshold = appV3.state.analysisSettings.macdThreshold;
        const atrMultiplier = appV3.state.params.atr.multiplier;

        // Track crossover positions
        let lastShortMediumCut = { type: null, index: null };
        let lastMediumLongCut = { type: null, index: null };

        for (let i = 0; i < candles.length; i++) {
            const candle = candles[i];
            const candletime = candle.epoch;
            const candletimeDisplay = new Date(candletime * 1000).toLocaleString('en-GB', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });

            // Candle color
            const color = candle.close >= candle.open ? 'UP' : 'DOWN';
            const previousColor = i > 0 ? (candles[i - 1].close >= candles[i - 1].open ? 'UP' : 'DOWN') : null;

            // Pip size
            const pipSize = candle.high - candle.low;

            // EMA Values
            const emaShortValue = emaArrays.short[i];
            const emaMediumValue = emaArrays.medium[i];
            const emaLongValue = emaArrays.long[i];

            // Previous EMA Values
            const prevEmaShort = i > 0 ? emaArrays.short[i - 1] : null;
            const prevEmaMedium = i > 0 ? emaArrays.medium[i - 1] : null;
            const prevEmaLong = i > 0 ? emaArrays.long[i - 1] : null;

            // Calculate Direction using flatThreshold
            const getDirection = (current, previous) => {
                if (current === null || previous === null) return null;
                const diff = current - previous;
                if (Math.abs(diff) < flatThreshold) return 'Flat';
                return diff > 0 ? 'Up' : 'Down';
            };

            const emaShortDirection = getDirection(emaShortValue, prevEmaShort);
            const emaMediumDirection = getDirection(emaMediumValue, prevEmaMedium);
            const emaLongDirection = getDirection(emaLongValue, prevEmaLong);

            // Turn Types (direction change from previous)
            const getTurnType = (i, emaArray) => {
                if (i < 2) return null;
                const prevDir = getDirection(emaArray[i - 1], emaArray[i - 2]);
                const currDir = getDirection(emaArray[i], emaArray[i - 1]);
                if (prevDir !== currDir && prevDir !== 'Flat' && currDir !== 'Flat') {
                    return currDir === 'Up' ? 'TurnUp' : 'TurnDown';
                }
                return null;
            };

            const emaShortTurnType = getTurnType(i, emaArrays.short);
            const emaMediumTurnType = getTurnType(i, emaArrays.medium);
            const emaLongTurnType = getTurnType(i, emaArrays.long);

            // Position checks
            const emashortMediumAbove = emaShortValue !== null && emaMediumValue !== null ? emaShortValue > emaMediumValue : null;
            const emaMediumLongAbove = emaMediumValue !== null && emaLongValue !== null ? emaMediumValue > emaLongValue : null;

            // MACD values
            const macdShortMediumValue = emaShortValue !== null && emaMediumValue !== null ? emaShortValue - emaMediumValue : null;
            const macdMediumLongValue = emaMediumValue !== null && emaLongValue !== null ? emaMediumValue - emaLongValue : null;

            // Previous MACD values
            const prevMacdShortMedium = prevEmaShort !== null && prevEmaMedium !== null ? prevEmaShort - prevEmaMedium : null;
            const prevMacdMediumLong = prevEmaMedium !== null && prevEmaLong !== null ? prevEmaMedium - prevEmaLong : null;

            // Convergence/Divergence Type
            const getConvergenceType = (currMacd, prevMacd) => {
                if (currMacd === null || prevMacd === null) return null;
                const diff = Math.abs(currMacd) - Math.abs(prevMacd);
                if (Math.abs(diff) < macdThreshold) return 'Neutral';
                return diff > 0 ? 'Divergence' : 'Convergence';
            };

            const emaShortMediumConvergenceType = getConvergenceType(macdShortMediumValue, prevMacdShortMedium);
            const emaMediumLongConvergenceType = getConvergenceType(macdMediumLongValue, prevMacdMediumLong);

            // Indicators
            const choppyIndicator = ciArray[i] ?? null;
            const adxValue = adxArray[i] ?? null;
            const atr = atrArray[i] ?? null;

            // Abnormal candle detection
            const isAbnormalCandle = atr != null && pipSize > (atr * atrMultiplier);

            // Candle structure
            const bodyTop = Math.max(candle.open, candle.close);
            const bodyBottom = Math.min(candle.open, candle.close);
            const uWick = candle.high - bodyTop;
            const body = bodyTop - bodyBottom;
            const lWick = bodyBottom - candle.low;
            const uWickPercent = pipSize > 0 ? ((uWick / pipSize) * 100).toFixed(1) : 0;
            const bodyPercent = pipSize > 0 ? ((body / pipSize) * 100).toFixed(1) : 0;
            const lWickPercent = pipSize > 0 ? ((lWick / pipSize) * 100).toFixed(1) : 0;

            // EMA Short cut position (relative to candle)
            let emaShortCutCandlePosition = null;
            if (emaShortValue !== null) {
                if (emaShortValue > candle.high) emaShortCutCandlePosition = 'Above';
                else if (emaShortValue < candle.low) emaShortCutCandlePosition = 'Below';
                else emaShortCutCandlePosition = 'Inside';
            }

            // EMA Long cut position
            let emaLongCandleCutPosition = null;
            if (emaLongValue !== null) {
                if (emaLongValue > candle.high) emaLongCandleCutPosition = 'Above';
                else if (emaLongValue < candle.low) emaLongCandleCutPosition = 'Below';
                else emaLongCandleCutPosition = 'Inside';
            }

            // Short-Medium crossover detection
            let ShortCutMeduimType = null;
            let candlesNoSinceShortCutMeduimCut = null;
            if (i > 0 && prevEmaShort !== null && prevEmaMedium !== null && emaShortValue !== null && emaMediumValue !== null) {
                const prevAbove = prevEmaShort > prevEmaMedium;
                const currAbove = emaShortValue > emaMediumValue;
                if (prevAbove !== currAbove) {
                    ShortCutMeduimType = currAbove ? 'Golden' : 'Death';
                    lastShortMediumCut = { type: ShortCutMeduimType, index: i };
                }
            }
            if (lastShortMediumCut.index !== null) {
                ShortCutMeduimType = lastShortMediumCut.type;
                candlesNoSinceShortCutMeduimCut = i - lastShortMediumCut.index;
            }

            // Medium-Long crossover detection
            let LongCutMeduimType = null;
            let candlesNoSinceMongCutMeduimCut = null;
            if (i > 0 && prevEmaMedium !== null && prevEmaLong !== null && emaMediumValue !== null && emaLongValue !== null) {
                const prevAbove = prevEmaMedium > prevEmaLong;
                const currAbove = emaMediumValue > emaLongValue;
                if (prevAbove !== currAbove) {
                    LongCutMeduimType = currAbove ? 'Golden' : 'Death';
                    lastMediumLongCut = { type: LongCutMeduimType, index: i };
                }
            }
            if (lastMediumLongCut.index !== null) {
                LongCutMeduimType = lastMediumLongCut.type;
                candlesNoSinceMongCutMeduimCut = i - lastMediumLongCut.index;
            }

            // BB Position
            let bbPosition = null;
            if (bbValues && bbValues.upper[i] !== null) {
                const close = candle.close;
                if (close >= bbValues.upper[i]) bbPosition = 'Above Upper';
                else if (close <= bbValues.lower[i]) bbPosition = 'Below Lower';
                else if (close > bbValues.middle[i]) bbPosition = 'Upper Half';
                else bbPosition = 'Lower Half';
            }

            const analysisObj = {
                index: i,
                candletime: candletime,
                candletimeDisplay: candletimeDisplay,
                color: color,
                previousColor: previousColor,
                pipSize: parseFloat(pipSize.toFixed(5)),

                emaShortValue: emaShortValue !== null ? parseFloat(emaShortValue.toFixed(5)) : null,
                emaShortDirection: emaShortDirection,
                emaShortTurnType: emaShortTurnType,

                emaMediumValue: emaMediumValue !== null ? parseFloat(emaMediumValue.toFixed(5)) : null,
                emaMediumDirection: emaMediumDirection,
                emaMediumTurnType: emaMediumTurnType,

                emaLongValue: emaLongValue !== null ? parseFloat(emaLongValue.toFixed(5)) : null,
                emaLongDirection: emaLongDirection,
                emaLongTurnType: emaLongTurnType,

                emashortMediumAbove: emashortMediumAbove,
                emaMediumLongAbove: emaMediumLongAbove,

                macdShortMedium: macdShortMediumValue !== null ? parseFloat(macdShortMediumValue.toFixed(5)) : null,
                macdMediumLong: macdMediumLongValue !== null ? parseFloat(macdMediumLongValue.toFixed(5)) : null,

                emaShortMediumConvergenceType: emaShortMediumConvergenceType,
                emaMediumLongConvergenceType: emaMediumLongConvergenceType,
                choppyIndicator: choppyIndicator != null ? parseFloat(choppyIndicator.toFixed(2)) : null,
                adxValue: adxValue != null ? parseFloat(adxValue.toFixed(2)) : null,
                bbValues: {
                    upper: bbValues && bbValues.upper[i] != null ? parseFloat(bbValues.upper[i].toFixed(5)) : null,
                    middle: bbValues && bbValues.middle[i] != null ? parseFloat(bbValues.middle[i].toFixed(5)) : null,
                    lower: bbValues && bbValues.lower[i] != null ? parseFloat(bbValues.lower[i].toFixed(5)) : null
                },
                bbPosition: bbPosition,
                atr: atr != null ? parseFloat(atr.toFixed(5)) : null,
                isAbnormalCandle: isAbnormalCandle,
                uWick: parseFloat(uWick.toFixed(5)),
                uWickPercent: parseFloat(uWickPercent),
                body: parseFloat(body.toFixed(5)),
                bodyPercent: parseFloat(bodyPercent),
                lWick: parseFloat(lWick.toFixed(5)),
                lWickPercent: parseFloat(lWickPercent),
                emaShortCutCandlePosition: emaShortCutCandlePosition,
                emaLongCutCandlePosition: emaLongCandleCutPosition,

                ShortCutMeduimType: ShortCutMeduimType,
                candlesNoSinceShortCutMeduimCut: candlesNoSinceShortCutMeduimCut,

                LongCutMeduimType: LongCutMeduimType,
                candlesNoSinceLongCutMeduimCut: candlesNoSinceMongCutMeduimCut
            };

            analysisData.push(analysisObj);
        }

        // Store for later use
        appV3.state.analysisDataStore[symbol] = analysisData;
        return analysisData;
    },

    // ========================================
    // GENERATE ANALYSIS DATA V2 (Using AnalysisGenerator Class)
    // ========================================
    generateAnalysisDataV2: (symbol, candles) => {
        console.log(`📊 Using AnalysisGenerator V2 for ${symbol}`);

        // Convert candles to format expected by AnalysisGenerator
        // AnalysisGenerator expects: { time, open, high, low, close }
        const candleData = candles.map(c => ({
            time: c.epoch,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close
        }));

        // Build options from current settings
        const options = {
            ema1Period: appV3.state.params.emaShort.period,
            ema1Type: appV3.state.params.emaShort.type,
            ema2Period: appV3.state.params.emaMedium.period,
            ema2Type: appV3.state.params.emaMedium.type,
            ema3Period: appV3.state.params.emaLong.period,
            ema3Type: appV3.state.params.emaLong.type,
            atrPeriod: appV3.state.params.atr.period,
            atrMultiplier: appV3.state.params.atr.multiplier,
            bbPeriod: appV3.state.analysisSettings.bbPeriod,
            ciPeriod: appV3.state.params.ciPeriod,
            adxPeriod: appV3.state.params.adxPeriod,
            rsiPeriod: 14,
            flatThreshold: appV3.state.analysisSettings.flatThreshold,
            macdNarrow: appV3.state.analysisSettings.macdThreshold
        };

        // Create generator and generate analysis
        const generator = new AnalysisGenerator(candleData, options);
        const analysisData = generator.generate();

        // Get CodeCandle Master data from textarea
        let codeCandleData = [];
        try {
            const codeCandleTextarea = document.getElementById('CodeCandle');
            console.log('🔍 CodeCandle textarea found:', !!codeCandleTextarea);
            console.log('🔍 CodeCandle value length:', codeCandleTextarea ? codeCandleTextarea.value.length : 0);

            if (codeCandleTextarea && codeCandleTextarea.value && codeCandleTextarea.value.length > 0) {
                codeCandleData = JSON.parse(codeCandleTextarea.value);
                console.log(`🎨 CodeCandle Master loaded: ${codeCandleData.length} records`);
                // Debug: Show field names from first record
                if (codeCandleData.length > 0) {
                    console.log('🔍 CodeCandle field names:', Object.keys(codeCandleData[0]));
                    console.log('🔍 CodeCandle sample record:', codeCandleData[0]);
                }
            } else {
                console.warn('⚠️ CodeCandle textarea is empty or not found');
            }
        } catch (e) {
            console.warn('⚠️ Failed to parse CodeCandle data:', e);
        }

        // Debug: Show sample seriesDesc from analysisData
        if (analysisData.length > 0) {
            console.log('🔍 AnalysisData sample StatusDesc:', analysisData[analysisData.length - 1].StatusDesc);
            console.log('🔍 AnalysisData sample record:', analysisData[analysisData.length - 1]);
        }

        // Helper function to find StatusCode from CodeCandle by seriesDesc
        const findStatusCode = (seriesDesc) => {
            if (!seriesDesc || codeCandleData.length === 0) return '';

            // Search for matching record in CodeCandle data
            // Assuming CodeCandle data has a field like 'seriesDesc' or 'StatusDesc' and 'StatusCode'
            const matchingRecord = codeCandleData.find(record =>
                record.SeriesDesc === seriesDesc ||
                record.seriesDesc === seriesDesc ||
                record.StatusDesc === seriesDesc ||
                record.statusDesc === seriesDesc
            );

            if (matchingRecord) {
                return matchingRecord.StatusCode || matchingRecord.statusCode || '';
            }
            return '';
        };

        // Map field names to match V1 format (for compatibility) and update StatusCode
        const mappedData = analysisData.map(item => {
            // Find StatusCode from CodeCandle based on seriesDesc (StatusDesc)
            const statusCode = findStatusCode(item.StatusDesc || item.seriesDesc);

            return {
                ...item,
                // Update StatusCode from CodeCandle Master
                StatusCode: statusCode,
                // Map candletime for chart tooltip compatibility
                candletime: item.candletime,
                // Map EMA values
                emashortMediumAbove: item.emaAbove === 'ShortAbove',
                emaMediumLongAbove: item.emaLongAbove === 'MediumAbove',
                // Map MACD
                macdShortMedium: item.macd12,
                macdMediumLong: item.macd23,
                // Map convergence types
                emaShortMediumConvergenceType: item.emaConvergenceType,
                emaMediumLongConvergenceType: item.emaLongConvergenceType,
                // Map crossover types
                ShortCutMeduimType: item.emaCutLongType === 'UpTrend' ? 'Golden' : (item.emaCutLongType === 'DownTrend' ? 'Death' : null),
                candlesNoSinceShortCutMeduimCut: item.candlesSinceEmaCut,
                LongCutMeduimType: item.emaCutLongType,
                candlesNoSinceLongCutMeduimCut: item.candlesSinceEmaCut,
                // Map positions
                emaShortCutCandlePosition: item.emaCutPosition,
                emaLongCutCandlePosition: item.emaCutPosition
            };
        });

        // Log how many StatusCodes were found
        const foundStatusCodes = mappedData.filter(item => item.StatusCode && item.StatusCode !== '').length;
        console.log(`📊 StatusCode lookup: ${foundStatusCodes}/${mappedData.length} items matched from CodeCandle Master`);

        // Store for later use
        appV3.state.analysisDataStore[symbol] = mappedData;

        // Also store summary for quick access
        const summary = generator.getSummary();
        console.log(`📈 V2 Analysis Summary for ${symbol}:`, summary);

        return mappedData;
    },

    // ========================================
    // STATUSCODE MARKER FUNCTIONS
    // ========================================

    // Store markers series reference
    statusCodeMarkerSeries: null,

    // Show StatusCode markers on the chart
    showStatusCodeMarkers: () => {
        const symbol = appV3.state.selectedSymbol;
        if (!symbol) {
            console.warn('⚠️ No asset selected');
            return;
        }

        const inputField = document.getElementById('txtStatusCode');
        if (!inputField || !inputField.value.trim()) {
            console.warn('⚠️ No StatusCode values entered');
            return;
        }

        // Parse input: "25,30,38" -> ["25", "30", "38"]
        const statusCodes = inputField.value.split(',').map(s => s.trim()).filter(s => s);
        console.log(`📍 Looking for StatusCodes:`, statusCodes);

        // Get analysis data
        const analysisData = appV3.state.analysisDataStore[symbol];
        if (!analysisData || analysisData.length === 0) {
            console.warn('⚠️ No analysis data for', symbol);
            return;
        }

        // Debug: Show sample StatusCode values from analysisData
        const sampleStatusCodes = analysisData.slice(-10).map(item => ({
            index: item.index,
            StatusCode: item.StatusCode,
            type: typeof item.StatusCode
        }));
        console.log('🔍 Sample StatusCodes from analysisData (last 10):', sampleStatusCodes);

        // Find matching candles - compare as strings
        const markers = [];
        analysisData.forEach((item, index) => {
            const itemStatusCode = String(item.StatusCode || '');
            if (statusCodes.includes(itemStatusCode) && itemStatusCode !== '') {
                console.log(`✓ Match found at index ${item.index}: StatusCode=${itemStatusCode}`);
                markers.push({
                    time: item.candletime,
                    position: item.color === 'Green' ? 'belowBar' : 'aboveBar',
                    color: '#10b981',
                    shape: 'circle',
                    text: itemStatusCode,
                    size: 2
                });
            }
        });

        console.log(`📍 Found ${markers.length} matching candles for StatusCodes:`, statusCodes);

        // Set markers on candlestick series
        if (appV3.state.candleSeries) {
            appV3.state.candleSeries.setMarkers(markers);
            console.log(`✅ ${markers.length} markers added to chart`);
        } else {
            console.warn('⚠️ candleSeries not available');
        }
    },

    // Clear all StatusCode markers
    clearStatusCodeMarkers: () => {
        if (appV3.state.candleSeries) {
            appV3.state.candleSeries.setMarkers([]);
            console.log('🧹 Markers cleared');
        }
    },

    // Check and auto-show markers (called when new candles arrive)
    autoShowStatusCodeMarkers: () => {
        const autoCheckbox = document.getElementById('chkAutoShowMarker');
        if (autoCheckbox && autoCheckbox.checked) {
            const inputField = document.getElementById('txtStatusCode');
            if (inputField && inputField.value.trim()) {
                appV3.showStatusCodeMarkers();
            }
        }
    },

    // ========================================
    // CHOPPY INDICATOR DISPLAY
    // ========================================

    // Update Choppy Indicator display with current value and direction arrows
    updateChoppyIndicatorDisplay: (symbol) => {
        const valueElement = document.getElementById('ci-current-value');
        const arrowsElement = document.getElementById('ci-direction-arrows');

        if (!valueElement || !arrowsElement) return;

        // Get analysis data
        const analysisData = appV3.state.analysisDataStore[symbol];
        if (!analysisData || analysisData.length < 6) {
            valueElement.textContent = '--';
            arrowsElement.innerHTML = '<span style="color: #666;">-----</span>';
            return;
        }

        // Get last 6 CI values (need 6 to calculate 5 directions)
        const lastItems = analysisData.slice(-6);
        const ciValues = lastItems.map(item => item.choppyIndicator || item.ci || 0);

        // Current CI value (last item)
        const currentCI = ciValues[ciValues.length - 1];
        valueElement.textContent = currentCI.toFixed(1);

        // Set color based on CI value (low = trending green, high = choppy red)
        if (currentCI < 38.2) {
            valueElement.style.color = '#4ade80'; // Green - Trending
        } else if (currentCI > 61.8) {
            valueElement.style.color = '#f87171'; // Red - Choppy
        } else {
            valueElement.style.color = '#fcd34d'; // Yellow - Neutral
        }

        // Calculate 5 directions (comparing consecutive CI values)
        // Direction = current CI vs previous CI
        const arrows = [];
        for (let i = 1; i < ciValues.length; i++) {
            const prevCI = ciValues[i - 1];
            const currCI = ciValues[i];

            if (currCI > prevCI) {
                // CI increasing = more choppy (bad for trending) = red up arrow
                arrows.push('<span style="color: #f87171;">↑</span>');
            } else if (currCI < prevCI) {
                // CI decreasing = less choppy (good for trending) = green down arrow
                arrows.push('<span style="color: #4ade80;">↓</span>');
            } else {
                // No change
                arrows.push('<span style="color: #94a3b8;">→</span>');
            }
        }

        // Display arrows (oldest to newest, left to right)
        arrowsElement.innerHTML = arrows.join('');
    },

    // ========================================
    // ALTERNATE COLOR ZONES
    // ========================================

    // State for alternate color zones
    altColorZonesEnabled: false,
    altColorMarkers: [],

    // Toggle alternate color zones display
    toggleAlternateColorZones: () => {
        appV3.altColorZonesEnabled = !appV3.altColorZonesEnabled;

        // Update button appearance
        const btn = document.getElementById('btn-alt-colors');
        const status = document.getElementById('alt-colors-status');

        if (appV3.altColorZonesEnabled) {
            btn.style.background = 'rgba(236, 72, 153, 0.6)';
            btn.style.borderColor = '#ec4899';
            status.textContent = 'ON';
            appV3.showAlternateColorZones();
        } else {
            btn.style.background = 'rgba(236, 72, 153, 0.3)';
            btn.style.borderColor = 'rgba(236, 72, 153, 0.5)';
            status.textContent = 'OFF';
            appV3.clearAlternateColorZones();
        }

        console.log('🔀 Alternate Color Zones:', appV3.altColorZonesEnabled ? 'ON' : 'OFF');
    },

    // Find and display alternate color zones
    showAlternateColorZones: () => {
        const symbol = appV3.state.selectedSymbol;
        if (!symbol) return;

        const analysisData = appV3.state.analysisDataStore[symbol];
        if (!analysisData || analysisData.length < 4) return;

        // Find alternating color sequences (4+ candles)
        const alternatingZones = [];
        let zoneStart = null;
        let zoneLength = 0;
        let prevColor = null;

        for (let i = 0; i < analysisData.length; i++) {
            const item = analysisData[i];
            const currentColor = item.color; // 'Green' or 'Red'

            if (prevColor && currentColor !== prevColor) {
                // Color changed - continue alternating sequence
                if (zoneStart === null) {
                    zoneStart = i - 1;
                    zoneLength = 2;
                } else {
                    zoneLength++;
                }
            } else {
                // Same color or first candle - end previous sequence if exists
                if (zoneLength >= 4) {
                    alternatingZones.push({
                        startIndex: zoneStart,
                        endIndex: i - 1,
                        length: zoneLength,
                        startTime: analysisData[zoneStart].candletime,
                        endTime: analysisData[i - 1].candletime
                    });
                }
                zoneStart = null;
                zoneLength = 0;
            }
            prevColor = currentColor;
        }

        // Check last sequence
        if (zoneLength >= 4) {
            alternatingZones.push({
                startIndex: zoneStart,
                endIndex: analysisData.length - 1,
                length: zoneLength,
                startTime: analysisData[zoneStart].candletime,
                endTime: analysisData[analysisData.length - 1].candletime
            });
        }

        console.log(`🔀 Found ${alternatingZones.length} alternating color zones:`, alternatingZones);

        // Create markers for each zone
        const markers = [];
        alternatingZones.forEach((zone, zoneIndex) => {
            // Add marker at start of zone
            const startItem = analysisData[zone.startIndex];
            markers.push({
                time: zone.startTime,
                position: 'aboveBar',
                color: '#ec4899',
                shape: 'arrowDown',
                text: `Alt${zone.length}↓`,
                size: 2
            });

            // Add marker at end of zone
            markers.push({
                time: zone.endTime,
                position: 'belowBar',
                color: '#ec4899',
                shape: 'arrowUp',
                text: `↑Alt${zone.length}`,
                size: 2
            });

            // Add small markers for candles in between
            for (let i = zone.startIndex; i <= zone.endIndex; i++) {
                const item = analysisData[i];
                if (i !== zone.startIndex && i !== zone.endIndex) {
                    markers.push({
                        time: item.candletime,
                        position: item.color === 'Green' ? 'belowBar' : 'aboveBar',
                        color: 'rgba(236, 72, 153, 0.6)',
                        shape: 'circle',
                        text: '',
                        size: 1
                    });
                }
            }
        });

        // Merge with existing StatusCode markers if any
        const existingMarkers = appV3.state.candleSeries ? [] : [];

        if (appV3.state.candleSeries) {
            appV3.altColorMarkers = markers;

            // Get StatusCode markers if they exist
            const statusCodeInput = document.getElementById('txtStatusCode');
            if (statusCodeInput && statusCodeInput.value.trim()) {
                // Re-apply status code markers along with alt color markers
                const statusCodes = statusCodeInput.value.split(',').map(s => s.trim()).filter(s => s);
                analysisData.forEach((item) => {
                    const itemStatusCode = String(item.StatusCode || '');
                    if (statusCodes.includes(itemStatusCode) && itemStatusCode !== '') {
                        markers.push({
                            time: item.candletime,
                            position: item.color === 'Green' ? 'belowBar' : 'aboveBar',
                            color: '#10b981',
                            shape: 'circle',
                            text: itemStatusCode,
                            size: 2
                        });
                    }
                });
            }

            appV3.state.candleSeries.setMarkers(markers);
            console.log(`✅ ${markers.length} alternate color markers added`);
        }
    },

    // Clear alternate color zones
    clearAlternateColorZones: () => {
        appV3.altColorMarkers = [];

        // Re-apply only StatusCode markers if they exist
        const statusCodeInput = document.getElementById('txtStatusCode');
        const autoCheck = document.getElementById('chkAutoShowMarker');

        if (statusCodeInput && statusCodeInput.value.trim() && autoCheck && autoCheck.checked) {
            appV3.showStatusCodeMarkers();
        } else if (appV3.state.candleSeries) {
            appV3.state.candleSeries.setMarkers([]);
        }

        console.log('🧹 Alternate color zones cleared');
    },

    // Update alternate color zones (called when chart updates)
    updateAlternateColorZones: () => {
        if (appV3.altColorZonesEnabled) {
            appV3.showAlternateColorZones();
        }
    }
};

// Start
document.addEventListener('DOMContentLoaded', appV3.init);

// Listen for EMA and ATR setting changes
document.addEventListener('DOMContentLoaded', () => {
    const settingInputs = [
        'ema-short-type', 'ema-short-period', 'ema-short-show',
        'ema-medium-type', 'ema-medium-period', 'ema-medium-show',
        'ema-long-type', 'ema-long-period', 'ema-long-show',
        'atr-period', 'atr-multiplier', 'atr-show'
    ];

    settingInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', () => {
                appV3.loadEmaSettings();
                appV3.saveSettings(); // Save to localStorage
                appV3.state.dataStore = {}; // Reset to recalculate
                appV3.state.candleStore = {};
                appV3.refreshData();
            });
        }
    });

    // =============================================
    // V3 SPECIFIC FUNCTIONS - Modal & Tab Management
    // =============================================

    // Switch Tabs in Settings Modal
    appV3.switchTab = (tabName) => {
        // Remove active class from all tabs and contents
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

        // Add active class to selected tab
        const selectedBtn = document.querySelector(`[data-tab="${tabName}"]`);
        const selectedContent = document.getElementById(`tab-${tabName}`);

        if (selectedBtn) selectedBtn.classList.add('active');
        if (selectedContent) selectedContent.classList.add('active');

        // Reinitialize icons after tab switch
        setTimeout(() => lucide.createIcons(), 50);
    };

    // Open Settings Modal
    appV3.openSettingsModal = () => {
        const modal = document.getElementById('settings-modal');
        if (modal) {
            modal.classList.remove('hidden');
            // Default to first tab
            appV3.switchTab('controls');
            lucide.createIcons();
        }
    };

    // Close Settings Modal
    appV3.closeSettingsModal = () => {
        const modal = document.getElementById('settings-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    };

    // Save Settings from Modal (override base saveSettings)
    const originalSaveSettings = appV3.saveSettings;
    appV3.saveSettings = () => {
        // Call original save function
        originalSaveSettings();

        // Save EMA colors
        try {
            const emaColors = {
                short: document.getElementById('ema-short-color')?.value || '#3b82f6',
                medium: document.getElementById('ema-medium-color')?.value || '#f59e0b',
                long: document.getElementById('ema-long-color')?.value || '#8b5cf6'
            };

            // Update state
            // Always update state color values from modal inputs (allow changing colors)
            appV3.state.params.emaShort = { ...appV3.state.params.emaShort, color: emaColors.short };
            appV3.state.params.emaMedium = { ...appV3.state.params.emaMedium, color: emaColors.medium };
            appV3.state.params.emaLong = { ...appV3.state.params.emaLong, color: emaColors.long };

            // Save to localStorage
            const settings = JSON.parse(localStorage.getItem('choppyMeterV2Settings') || '{}');
            settings.emaColors = emaColors;
            localStorage.setItem('choppyMeterV2Settings', JSON.stringify(settings));

            console.log('EMA colors saved:', emaColors);
        } catch (e) {
            console.error('Error saving EMA colors:', e);
        }

        // Load EMA settings and refresh
        appV3.loadEmaSettings();
        appV3.state.dataStore = {};
        appV3.state.candleStore = {};
        appV3.refreshData();

        // Close modal
        appV3.closeSettingsModal();
    };

    // Load EMA Colors from localStorage
    appV3.loadEmaColors = () => {
        try {
            const saved = localStorage.getItem('choppyMeterV2Settings');
            if (saved) {
                const settings = JSON.parse(saved);
                if (settings.emaColors) {
                    const shortColorInput = document.getElementById('ema-short-color');
                    const mediumColorInput = document.getElementById('ema-medium-color');
                    const longColorInput = document.getElementById('ema-long-color');

                    if (shortColorInput) shortColorInput.value = settings.emaColors.short || '#3b82f6';
                    if (mediumColorInput) mediumColorInput.value = settings.emaColors.medium || '#f59e0b';
                    if (longColorInput) longColorInput.value = settings.emaColors.long || '#8b5cf6';

                    // Update state
                    appV3.state.params.emaShort.color = settings.emaColors.short || '#3b82f6';
                    appV3.state.params.emaMedium.color = settings.emaColors.medium || '#f59e0b';
                    appV3.state.params.emaLong.color = settings.emaColors.long || '#8b5cf6';
                }
            }
        } catch (e) {
            console.error('Error loading EMA colors:', e);
        }
    };

    // Get EMA Color for Series
    appV3.getEmaColor = (emaType) => {
        const defaults = {
            short: '#3b82f6',
            medium: '#f59e0b',
            long: '#8b5cf6'
        };

        const colorInput = document.getElementById(`ema-${emaType}-color`);
        if (colorInput) {
            return colorInput.value;
        }

        if (appV3.state.params[`ema${emaType.charAt(0).toUpperCase() + emaType.slice(1)}`]?.color) {
            return appV3.state.params[`ema${emaType.charAt(0).toUpperCase() + emaType.slice(1)}`].color;
        }

        return defaults[emaType];
    };

    // Toggle Connection
    appV3.toggleConnection = async () => {
        const btn = document.getElementById('btn-connect-toggle');
        if (!btn) return;

        if (DerivAPI.ws && DerivAPI.ws.readyState === 1) {
            // Disconnect
            DerivAPI.ws.close();
            appV3.updateStatus('Disconnected', 'disconnected');
            btn.innerHTML = '<i data-lucide="power"></i> Connect';
            appV3.state.isPolling = false;
            if (appV3.pollInterval) clearInterval(appV3.pollInterval);
            appV3.stopChartPolling();
        } else {
            // Connect
            btn.innerHTML = '<i data-lucide="power"></i> Stop';
            try {
                await DerivAPI.connect();
            } catch (e) {
                appV3.updateStatus('Connection Failed', 'disconnected');
                btn.innerHTML = '<i data-lucide="power"></i> Connect';
            }
        }
        lucide.createIcons();
    };
});

// Load EMA colors when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Wait a bit for the main init to complete
    setTimeout(() => {
        if (typeof appV3 !== 'undefined' && appV3.loadEmaColors) {
            appV3.loadEmaColors();
        }
        // Load zones settings
        if (typeof appV3 !== 'undefined') {
            appV3.loadZonesSettings();
        }
    }, 500);
});

// ==================== BACKGROUND ZONES FUNCTIONS ====================

/**
 * Toggle Choppy Zones on/off
 */
appV3.toggleChoppyZones = () => {
    appV3.state.zonesEnabled = !appV3.state.zonesEnabled;

    const btn = document.getElementById('btn-zones-toggle');
    const statusEl = document.getElementById('zones-status');

    if (appV3.state.zonesEnabled) {
        btn.style.background = 'rgba(139, 92, 246, 0.6)';
        btn.style.borderColor = 'rgba(139, 92, 246, 0.8)';
        statusEl.textContent = 'ON';
        statusEl.style.color = '#22c55e';
        console.log('🎨 Choppy Zones Enabled');
    } else {
        btn.style.background = 'rgba(139, 92, 246, 0.3)';
        btn.style.borderColor = 'rgba(139, 92, 246, 0.5)';
        statusEl.textContent = 'OFF';
        statusEl.style.color = '#c4b5fd';
        console.log('🎨 Choppy Zones Disabled');
    }

    // Update chart with zones
    if (appV3.state.selectedSymbol && appV3.state.chart) {
        appV3.updateChartZones();
    }

    // Save state
    appV3.saveZonesSettings();
};

/**
 * Open Zones Settings Modal
 */
appV3.openZonesSettingsModal = () => {
    const modal = document.getElementById('zones-settings-modal');
    if (!modal) return;

    // Populate current values
    const settings = appV3.state.zonesSettings;

    document.getElementById('zones-show-ci').checked = settings.showCiZones;
    document.getElementById('zones-show-rsi').checked = settings.showRsiZones;
    document.getElementById('zones-ci-trending').value = settings.ciTrendingThreshold;
    document.getElementById('zones-ci-choppy').value = settings.ciChoppyThreshold;
    document.getElementById('zones-rsi-oversold').value = settings.rsiOversoldThreshold;
    document.getElementById('zones-rsi-overbought').value = settings.rsiOverboughtThreshold;
    document.getElementById('zones-rsi-period').value = settings.rsiPeriod;
    document.getElementById('zones-show-labels').checked = settings.showLabels;

    modal.style.display = 'flex';
};

/**
 * Close Zones Settings Modal
 */
appV3.closeZonesSettingsModal = () => {
    const modal = document.getElementById('zones-settings-modal');
    if (modal) {
        modal.style.display = 'none';
    }
};

/**
 * Save Zones Settings
 */
appV3.saveZonesSettings = () => {
    // Get values from modal inputs
    const showCiEl = document.getElementById('zones-show-ci');
    const showRsiEl = document.getElementById('zones-show-rsi');
    const ciTrendingEl = document.getElementById('zones-ci-trending');
    const ciChoppyEl = document.getElementById('zones-ci-choppy');
    const rsiOversoldEl = document.getElementById('zones-rsi-oversold');
    const rsiOverboughtEl = document.getElementById('zones-rsi-overbought');
    const rsiPeriodEl = document.getElementById('zones-rsi-period');
    const showLabelsEl = document.getElementById('zones-show-labels');

    if (showCiEl) {
        appV3.state.zonesSettings = {
            showCiZones: showCiEl.checked,
            showRsiZones: showRsiEl?.checked ?? true,
            ciTrendingThreshold: parseFloat(ciTrendingEl?.value) || 38.2,
            ciChoppyThreshold: parseFloat(ciChoppyEl?.value) || 61.8,
            rsiOversoldThreshold: parseFloat(rsiOversoldEl?.value) || 30,
            rsiOverboughtThreshold: parseFloat(rsiOverboughtEl?.value) || 70,
            rsiPeriod: parseInt(rsiPeriodEl?.value) || 14,
            showLabels: showLabelsEl?.checked ?? false
        };
    }

    // Save to localStorage
    try {
        localStorage.setItem('choppyZonesSettings', JSON.stringify({
            enabled: appV3.state.zonesEnabled,
            ...appV3.state.zonesSettings
        }));
        console.log('💾 Zones settings saved');
    } catch (e) {
        console.warn('Failed to save zones settings:', e);
    }

    // Close modal
    appV3.closeZonesSettingsModal();

    // Update chart zones
    if (appV3.state.selectedSymbol && appV3.state.chart) {
        appV3.updateChartZones();
    }
};

/**
 * Load Zones Settings from localStorage
 */
appV3.loadZonesSettings = () => {
    try {
        const saved = localStorage.getItem('choppyZonesSettings');
        if (saved) {
            const settings = JSON.parse(saved);
            appV3.state.zonesEnabled = settings.enabled || false;
            appV3.state.zonesSettings = {
                showCiZones: settings.showCiZones ?? true,
                showRsiZones: settings.showRsiZones ?? true,
                ciTrendingThreshold: settings.ciTrendingThreshold ?? 38.2,
                ciChoppyThreshold: settings.ciChoppyThreshold ?? 61.8,
                rsiOversoldThreshold: settings.rsiOversoldThreshold ?? 30,
                rsiOverboughtThreshold: settings.rsiOverboughtThreshold ?? 70,
                rsiPeriod: settings.rsiPeriod ?? 14,
                showLabels: settings.showLabels ?? false
            };

            // Update UI
            const btn = document.getElementById('btn-zones-toggle');
            const statusEl = document.getElementById('zones-status');

            if (btn && statusEl) {
                if (appV3.state.zonesEnabled) {
                    btn.style.background = 'rgba(139, 92, 246, 0.6)';
                    btn.style.borderColor = 'rgba(139, 92, 246, 0.8)';
                    statusEl.textContent = 'ON';
                    statusEl.style.color = '#22c55e';
                }
            }

            console.log('📂 Zones settings loaded');
        }
    } catch (e) {
        console.warn('Failed to load zones settings:', e);
    }
};

/**
 * Calculate RSI for a symbol
 */
appV3.calculateRsi = (symbol) => {
    const candles = appV3.state.candleStore[symbol];
    if (!candles || candles.length === 0) return [];

    const closes = candles.map(c => c.close);
    const rsiPeriod = appV3.state.zonesSettings.rsiPeriod || 14;

    // Use Indicators.rsi if available
    if (typeof Indicators !== 'undefined' && Indicators.rsi) {
        return Indicators.rsi(closes, rsiPeriod);
    }

    // Fallback RSI calculation
    const results = [];
    if (closes.length < rsiPeriod + 1) {
        return closes.map(() => null);
    }

    const gains = [];
    const losses = [];

    for (let i = 1; i < closes.length; i++) {
        const change = closes[i] - closes[i - 1];
        gains.push(change > 0 ? change : 0);
        losses.push(change < 0 ? Math.abs(change) : 0);
    }

    let avgGain = 0;
    let avgLoss = 0;

    for (let i = 0; i < rsiPeriod; i++) {
        avgGain += gains[i];
        avgLoss += losses[i];
    }
    avgGain /= rsiPeriod;
    avgLoss /= rsiPeriod;

    results.push(null);
    for (let i = 1; i < rsiPeriod; i++) {
        results.push(null);
    }

    let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    let rsi = 100 - (100 / (1 + rs));
    results.push(rsi);

    for (let i = rsiPeriod; i < gains.length; i++) {
        avgGain = ((avgGain * (rsiPeriod - 1)) + gains[i]) / rsiPeriod;
        avgLoss = ((avgLoss * (rsiPeriod - 1)) + losses[i]) / rsiPeriod;
        rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsi = 100 - (100 / (1 + rs));
        results.push(rsi);
    }

    return results;
};

/**
 * Update chart with background zones
 */
appV3.updateChartZones = () => {
    const symbol = appV3.state.selectedSymbol;
    if (!symbol || !appV3.state.chart || !appV3.state.candleSeries) return;

    const candles = appV3.state.candleStore[symbol];
    const assetData = appV3.state.dataStore[symbol];

    if (!candles || !assetData) return;

    // Remove existing zones plugin
    if (appV3.state.zonesPlugin) {
        try {
            appV3.state.candleSeries.detachPrimitive(appV3.state.zonesPlugin);
        } catch (e) {
            // Ignore if not attached
        }
        appV3.state.zonesPlugin = null;
    }

    if (!appV3.state.zonesEnabled) {
        console.log('🎨 Zones disabled - cleared');
        return;
    }

    // Get CI array
    const ciArray = assetData.ciArray || [];

    // Calculate RSI
    const rsiArray = appV3.calculateRsi(symbol);
    appV3.state.rsiArray[symbol] = rsiArray;

    // Create zones using helper function
    if (typeof createCiRsiZones === 'function') {
        const zonesOptions = {
            ciTrendingThreshold: appV3.state.zonesSettings.ciTrendingThreshold,
            ciChoppyThreshold: appV3.state.zonesSettings.ciChoppyThreshold,
            rsiOversoldThreshold: appV3.state.zonesSettings.rsiOversoldThreshold,
            rsiOverboughtThreshold: appV3.state.zonesSettings.rsiOverboughtThreshold,
            showCiZones: appV3.state.zonesSettings.showCiZones,
            showRsiZones: appV3.state.zonesSettings.showRsiZones,
            showLabels: appV3.state.zonesSettings.showLabels
        };

        const zones = createCiRsiZones(candles, ciArray, rsiArray, zonesOptions);

        if (zones.length > 0) {
            // Create and attach plugin
            appV3.state.zonesPlugin = new BackgroundColorZonesPlugin(zones, zonesOptions);
            appV3.state.candleSeries.attachPrimitive(appV3.state.zonesPlugin);
            console.log(`🎨 Applied ${zones.length} background zones`);
        }
    } else {
        console.warn('createCiRsiZones function not found');
    }
};

/**
 * Toggle SMC Visualization
 */
appV3.toggleSMCVisible = () => {
    appV3.state.smcEnabled = !appV3.state.smcEnabled;

    const btn = document.getElementById('btn-smc-toggle');
    const statusEl = document.getElementById('smc-status');

    if (btn && statusEl) {
        if (appV3.state.smcEnabled) {
            btn.style.background = 'rgba(59, 130, 246, 0.6)';
            btn.style.borderColor = 'rgba(59, 130, 246, 0.8)';
            statusEl.textContent = 'ON';
            statusEl.style.color = '#22c55e';
        } else {
            btn.style.background = 'rgba(59, 130, 246, 0.3)';
            btn.style.borderColor = 'rgba(59, 130, 246, 0.5)';
            statusEl.textContent = 'OFF';
            statusEl.style.color = 'rgba(255,255,255,0.7)';
        }
    }

    // Refresh visualization
    if (appV3.state.selectedSymbol) {
        if (appV3.state.smcEnabled) {
            const candles = appV3.state.candleStore[appV3.state.selectedSymbol];
            if (candles) appV3.updateSMCVisualization(appV3.state.selectedSymbol, candles);
        } else {
            if (appV3.state.smcRenderer) appV3.state.smcRenderer.clear();
        }
    }
};

/**
 * Update SMC Visualization
 */
appV3.updateSMCVisualization = (symbol, candles) => {
    if (!appV3.state.smcRenderer || !candles || candles.length === 0) return;

    // Initialize indicator if needed
    if (!appV3.state.smcIndicator) {
        if (typeof SMCIndicator === 'undefined') return;
        appV3.state.smcIndicator = new SMCIndicator(appV3.state.smcConfig);
    }

    // Map candles to OHLCV format expected by SMCIndicator
    const ohlcv = candles.map(c => ({
        time: c.epoch || c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 0
    }));

    // Calculate SMC
    appV3.state.smcIndicator.calculate(ohlcv);
    const results = appV3.state.smcIndicator;

    // Render
    appV3.state.smcRenderer.renderAll(results, {
        showSwingPoints: appV3.state.smcConfig.showSwingPoints,
        showStructures: appV3.state.smcConfig.showStructure,
        showOrderBlocks: appV3.state.smcConfig.showOrderBlocks,
        showFVG: appV3.state.smcConfig.showFVG,
        showEqualHL: true,
        showPremiumDiscount: true,
        showStrongWeak: true
    });
};

