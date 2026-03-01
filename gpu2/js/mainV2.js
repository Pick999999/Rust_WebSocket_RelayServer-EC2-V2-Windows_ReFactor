/**
 * Main Application Logic V2
 * Shows Top 8 Best Choppy Indicator + Candle Color Assets
 * With Chart Display and EMA Crossover Alerts
 */

const appV2 = {
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
        chartTooltip: null // Chart tooltip element
    },

    init: async () => {
        appV2.updateStatus('Connecting...', 'disconnected');

        // Load saved settings from localStorage first
        appV2.loadSavedSettings();

        // Load EMA settings from inputs
        appV2.loadEmaSettings();

        // Connect Deriv
        DerivAPI.onOpen = appV2.onConnected;
        DerivAPI.onMessage = appV2.onMessage;

        try {
            await DerivAPI.connect();
        } catch (e) {
            appV2.updateStatus('Connection Failed', 'disconnected');
        }

        // Clock
        setInterval(appV2.updateClock, 1000);

        // Initialize audio context on user interaction
        document.addEventListener('click', () => {
            if (!appV2.state.audioContext) {
                appV2.state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
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
                    appV2.state.timeframe = settings.timeframe;
                }
                if (settings.refreshInterval) {
                    document.getElementById('refresh-interval-select').value = settings.refreshInterval;
                    appV2.state.refreshInterval = settings.refreshInterval;
                }
                if (settings.beepEnabled !== undefined) {
                    document.getElementById('beep-toggle').checked = settings.beepEnabled;
                    appV2.state.beepEnabled = settings.beepEnabled;
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
                    appV2.state.analysisSettings = { ...appV2.state.analysisSettings, ...settings.analysisSettings };
                }

                // Tooltip Fields
                if (settings.tooltipFields) {
                    appV2.state.tooltipFields = { ...appV2.state.tooltipFields, ...settings.tooltipFields };
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
                timeframe: appV2.state.timeframe,
                refreshInterval: appV2.state.refreshInterval,
                beepEnabled: appV2.state.beepEnabled,
                emaShort: appV2.state.params.emaShort,
                emaMedium: appV2.state.params.emaMedium,
                emaLong: appV2.state.params.emaLong,
                atr: appV2.state.params.atr,
                analysisSettings: appV2.state.analysisSettings,
                tooltipFields: appV2.state.tooltipFields,
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
        appV2.state.params.emaShort = {
            type: document.getElementById('ema-short-type').value,
            period: parseInt(document.getElementById('ema-short-period').value),
            show: document.getElementById('ema-short-show').checked
        };
        appV2.state.params.emaMedium = {
            type: document.getElementById('ema-medium-type').value,
            period: parseInt(document.getElementById('ema-medium-period').value),
            show: document.getElementById('ema-medium-show').checked
        };
        appV2.state.params.emaLong = {
            type: document.getElementById('ema-long-type').value,
            period: parseInt(document.getElementById('ema-long-period').value),
            show: document.getElementById('ema-long-show').checked
        };
        appV2.state.params.atr = {
            period: parseInt(document.getElementById('atr-period').value),
            multiplier: parseFloat(document.getElementById('atr-multiplier').value),
            show: document.getElementById('atr-show').checked
        };
    },

    onConnected: () => {
        appV2.updateStatus('Connected', 'connected');
        appV2.refreshData();
        appV2.syncTime();
        setInterval(appV2.syncTime, 60000);
        appV2.startPolling();

        // Get account balance for trading
        if (typeof DerivTrader !== 'undefined') {
            DerivTrader.getBalance();
        }
    },

    syncTime: () => {
        if (DerivAPI.ws && DerivAPI.ws.readyState === 1) {
            DerivAPI.ws.send(JSON.stringify({ time: 1 }));
        }
    },

    startPolling: () => {
        if (appV2.pollInterval) clearInterval(appV2.pollInterval);

        appV2.state.nextUpdateTime = Date.now() + appV2.state.refreshInterval;
        appV2.pollInterval = setInterval(() => {
            appV2.refreshData();
            appV2.state.nextUpdateTime = Date.now() + appV2.state.refreshInterval;
        }, appV2.state.refreshInterval);
    },

    handleTimeframeChange: () => {
        const select = document.getElementById('timeframe-select');
        appV2.state.timeframe = parseInt(select.value);
        appV2.state.dataStore = {}; // Clear old data
        appV2.state.candleStore = {};
        appV2.saveSettings();
        appV2.refreshData();
    },

    handleRefreshIntervalChange: () => {
        const select = document.getElementById('refresh-interval-select');
        appV2.state.refreshInterval = parseInt(select.value);
        appV2.saveSettings();
        appV2.startPolling();
    },

    toggleBeep: () => {
        appV2.state.beepEnabled = document.getElementById('beep-toggle').checked;
        appV2.saveSettings();
    },

    refreshData: () => {
        if (!DerivAPI.ws || DerivAPI.ws.readyState !== 1) return;

        // Reload EMA settings before fetching
        appV2.loadEmaSettings();

        const grid = document.getElementById('asset-grid');
        if (grid.children.length === 0 || grid.querySelector('.loading-state')) {
            grid.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Fetching Data...</p></div>`;
        }

        appV2.state.assets.forEach((asset, index) => {
            const reqId = Date.now() + index;
            appV2.state.reqIdMap.set(reqId, asset.symbol);

            // Need at least 150 candles for EMA calculations
            const req = {
                ticks_history: asset.symbol,
                adjust_start_time: 1,
                count: 150,
                end: 'latest',
                style: 'candles',
                granularity: appV2.state.timeframe,
                req_id: reqId
            };
            DerivAPI.ws.send(JSON.stringify(req));
        });
    },

    onMessage: (data) => {
        if (data.msg_type === 'candles') {
            const reqId = data.req_id;
            const symbol = appV2.state.reqIdMap.get(reqId);
            if (!symbol) return;

            // Check if this is a chart poll request (not a full refresh)
            if (reqId === appV2.state.chartReqId) {
                // Chart polling - only update chart, don't re-render grid
                appV2.processChartData(symbol, data.candles);
            } else {
                // Full refresh - update grid and meters
                appV2.processCandles(symbol, data.candles);
            }
        } else if (data.msg_type === 'time') {
            const serverTime = data.time * 1000;
            const localTime = Date.now();
            appV2.state.serverTimeOffset = serverTime - localTime;
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
        appV2.state.candleStore[symbol] = candles;

        const closes = candles.map(c => c.close);
        const highs = candles.map(c => c.high);
        const lows = candles.map(c => c.low);

        // Calculate Indicators
        const ci = Indicators.ci(highs, lows, closes, appV2.state.params.ciPeriod);
        const adx = Indicators.adx(highs, lows, closes, appV2.state.params.adxPeriod);

        // Calculate EMAs
        const emaShort = appV2.calculateMA(closes, appV2.state.params.emaShort.type, appV2.state.params.emaShort.period);
        const emaMedium = appV2.calculateMA(closes, appV2.state.params.emaMedium.type, appV2.state.params.emaMedium.period);
        const emaLong = appV2.calculateMA(closes, appV2.state.params.emaLong.type, appV2.state.params.emaLong.period);

        // Calculate ATR for abnormal candle detection
        const atr = Indicators.atr(highs, lows, closes, appV2.state.params.atr.period);

        // Calculate Bollinger Bands
        const bbSettings = appV2.state.analysisSettings;
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
        const shortMediumCrossover = appV2.detectCrossover(emaShort, emaMedium);
        const mediumLongCrossover = appV2.detectCrossover(emaMedium, emaLong);

        // Check for new crossover alert - only for selected asset
        if (appV2.state.beepEnabled && symbol === appV2.state.selectedSymbol) {
            const prevMediumLong = appV2.state.previousCrossovers[symbol]?.mediumLong || null;
            if (prevMediumLong !== null && mediumLongCrossover !== 'none' && prevMediumLong !== mediumLongCrossover) {
                appV2.playBeep(mediumLongCrossover === 'golden' ? 800 : 400);
            }
        }

        // Store previous crossovers
        appV2.state.previousCrossovers[symbol] = {
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

        appV2.state.dataStore[symbol] = {
            symbol: symbol,
            name: appV2.state.assets.find(a => a.symbol === symbol)?.name || symbol,
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
        appV2.generateAnalysisData(symbol, candles, emaArrays, ci, adx, atr, bbValues);

        appV2.checkAllDataReceived();
    },

    // Process chart data without re-rendering grid (for 2-second chart polling)
    processChartData: (symbol, candles) => {
        // Store raw candles for chart
        appV2.state.candleStore[symbol] = candles;

        const closes = candles.map(c => c.close);
        const highs = candles.map(c => c.high);
        const lows = candles.map(c => c.low);

        // Calculate Indicators
        const ci = Indicators.ci(highs, lows, closes, appV2.state.params.ciPeriod);
        const adx = Indicators.adx(highs, lows, closes, appV2.state.params.adxPeriod);

        // Calculate EMAs
        const emaShort = appV2.calculateMA(closes, appV2.state.params.emaShort.type, appV2.state.params.emaShort.period);
        const emaMedium = appV2.calculateMA(closes, appV2.state.params.emaMedium.type, appV2.state.params.emaMedium.period);
        const emaLong = appV2.calculateMA(closes, appV2.state.params.emaLong.type, appV2.state.params.emaLong.period);

        // Calculate ATR
        const atr = Indicators.atr(highs, lows, closes, appV2.state.params.atr.period);

        // Calculate Bollinger Bands
        const bbSettings = appV2.state.analysisSettings;
        const bbValues = Indicators.bollingerBands(closes, bbSettings.bbPeriod, bbSettings.bbStdDev);

        const emaArrays = {
            short: emaShort,
            medium: emaMedium,
            long: emaLong
        };

        // Update dataStore for this symbol (for chart rendering)
        if (appV2.state.dataStore[symbol]) {
            appV2.state.dataStore[symbol].emaArrays = emaArrays;
            appV2.state.dataStore[symbol].atrArray = atr;
            appV2.state.dataStore[symbol].ciArray = ci;
            appV2.state.dataStore[symbol].adxArray = adx;
            appV2.state.dataStore[symbol].bbValues = bbValues;
        }

        // Generate analysis data for tooltip
        appV2.generateAnalysisData(symbol, candles, emaArrays, ci, adx, atr, bbValues);

        // Only update chart, do NOT re-render grid
        if (appV2.state.selectedSymbol === symbol && appV2.state.chart) {
            appV2.updateSelectedChart();
            appV2.renderSelectedAnalysis(appV2.state.dataStore[symbol]);
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
        if (!appV2.state.audioContext) {
            appV2.state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        const ctx = appV2.state.audioContext;
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
        const receivedCount = Object.keys(appV2.state.dataStore).length;

        if (receivedCount >= appV2.state.assets.length) {
            // Sort by Score (Best to Worst)
            const sortedData = Object.values(appV2.state.dataStore)
                .sort((a, b) => b.score - a.score)
                .slice(0, 8); // Top 8 only

            appV2.renderGrid(sortedData);

            // Update chart if asset is selected
            if (appV2.state.selectedSymbol) {
                appV2.updateSelectedChart();
            }
        }
    },

    renderGrid: (dataList) => {
        const grid = document.getElementById('asset-grid');
        grid.innerHTML = '';

        dataList.forEach((data, index) => {
            const card = document.createElement('div');
            const isSelected = appV2.state.selectedSymbol === data.symbol;
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
            card.addEventListener('click', () => appV2.selectAsset(data.symbol));

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
                appV2.state.meters[data.symbol] = meter;
            }, 50);
        });
    },

    selectAsset: (symbol) => {
        appV2.state.selectedSymbol = symbol;

        // Update card selection visual
        document.querySelectorAll('.top8-card').forEach(card => {
            card.classList.toggle('selected-asset', card.dataset.symbol === symbol);
        });

        // Show chart panel
        const panel = document.getElementById('selected-chart-panel');
        panel.classList.remove('hidden');

        // Update header
        const assetData = appV2.state.dataStore[symbol];
        if (assetData) {
            document.getElementById('selected-asset-name').textContent = assetData.name;
            document.getElementById('selected-asset-symbol').textContent = symbol;
        }

        // Initialize or update chart
        appV2.initChart();
        appV2.updateSelectedChart();

        // Start polling for chart updates every 2 seconds
        appV2.startChartPolling();

        // Update trading symbol for DerivTrader
        if (typeof DerivTrader !== 'undefined') {
            DerivTrader.setTradingSymbol(symbol);
        }

        // Update Lucide icons for new elements
        lucide.createIcons();

        // Scroll to chart panel
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    // Start polling for selected asset chart every 2 seconds
    startChartPolling: () => {
        // Clear existing interval if any
        if (appV2.state.chartPollInterval) {
            clearInterval(appV2.state.chartPollInterval);
        }

        // Fetch immediately
        appV2.fetchSelectedAssetData();

        // Then poll every 2 seconds
        appV2.state.chartPollInterval = setInterval(() => {
            appV2.fetchSelectedAssetData();
        }, 2000);
    },

    // Stop chart polling
    stopChartPolling: () => {
        if (appV2.state.chartPollInterval) {
            clearInterval(appV2.state.chartPollInterval);
            appV2.state.chartPollInterval = null;
        }
    },

    // Fetch data for selected asset only
    fetchSelectedAssetData: () => {
        const symbol = appV2.state.selectedSymbol;
        if (!symbol) return;
        if (!DerivAPI.ws || DerivAPI.ws.readyState !== 1) return;

        // Reload EMA settings
        appV2.loadEmaSettings();

        const reqId = Date.now() + 999; // Unique ID for chart request
        appV2.state.chartReqId = reqId;
        appV2.state.reqIdMap.set(reqId, symbol);

        const req = {
            ticks_history: symbol,
            adjust_start_time: 1,
            count: 150,
            end: 'latest',
            style: 'candles',
            granularity: appV2.state.timeframe,
            req_id: reqId
        };
        DerivAPI.ws.send(JSON.stringify(req));
    },

    closeChartPanel: () => {
        // Stop chart polling
        appV2.stopChartPolling();

        appV2.state.selectedSymbol = null;
        document.getElementById('selected-chart-panel').classList.add('hidden');

        // Remove selection from cards
        document.querySelectorAll('.top8-card').forEach(card => {
            card.classList.remove('selected-asset');
        });

        // Destroy chart
        if (appV2.state.chart) {
            appV2.state.chart.remove();
            appV2.state.chart = null;
            appV2.state.candleSeries = null;
            appV2.state.emaShortSeries = null;
            appV2.state.emaMediumSeries = null;
            appV2.state.emaLongSeries = null;
        }
    },

    initChart: () => {
        const container = document.getElementById('main-chart-container');

        // Destroy existing chart if any
        if (appV2.state.chart) {
            appV2.state.chart.remove();
        }

        // Create new chart (v4.x compatible)
        appV2.state.chart = LightweightCharts.createChart(container, {
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
        appV2.state.candleSeries = appV2.state.chart.addCandlestickSeries({
            upColor: '#22c55e',
            downColor: '#ef4444',
            borderVisible: false,
            wickUpColor: '#22c55e',
            wickDownColor: '#ef4444',
        });

        // EMA Short (Green)
        appV2.state.emaShortSeries = appV2.state.chart.addLineSeries({
            color: '#22c55e',
            lineWidth: 2,
            title: 'EMA Short'
        });

        // EMA Medium (Yellow)
        appV2.state.emaMediumSeries = appV2.state.chart.addLineSeries({
            color: '#eab308',
            lineWidth: 2,
            title: 'EMA Medium'
        });

        // EMA Long (Red)
        appV2.state.emaLongSeries = appV2.state.chart.addLineSeries({
            color: '#ef4444',
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
        appV2.state.chartTooltip = tooltip;

        // Subscribe to crosshair move for tooltip
        appV2.state.chart.subscribeCrosshairMove((param) => {
            if (!param.time || !param.point || param.point.x < 0 || param.point.y < 0) {
                tooltip.style.display = 'none';
                return;
            }

            const symbol = appV2.state.selectedSymbol;
            const analysisData = appV2.state.analysisDataStore[symbol];
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
            const fields = appV2.state.tooltipFields;
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
            appV2.state.chart.resize(container.clientWidth, 400);
        };
        window.addEventListener('resize', resizeHandler);
    },

    updateSelectedChart: () => {
        const symbol = appV2.state.selectedSymbol;
        if (!symbol || !appV2.state.chart) return;

        const candles = appV2.state.candleStore[symbol];
        const assetData = appV2.state.dataStore[symbol];
        if (!candles || !assetData) return;

        // Get ATR array and multiplier for abnormal detection
        const atrArray = assetData.atrArray || [];
        const atrMultiplier = appV2.state.params.atr.multiplier;
        const showAtrHighlight = appV2.state.params.atr.show;

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
            if (emaArrays.short[i] != null && appV2.state.params.emaShort.show) {
                emaShortData.push({ time: candles[i].epoch, value: emaArrays.short[i] });
            }
            if (emaArrays.medium[i] != null && appV2.state.params.emaMedium.show) {
                emaMediumData.push({ time: candles[i].epoch, value: emaArrays.medium[i] });
            }
            if (emaArrays.long[i] != null && appV2.state.params.emaLong.show) {
                emaLongData.push({ time: candles[i].epoch, value: emaArrays.long[i] });
            }
        }

        // Set data to series
        appV2.state.candleSeries.setData(lwcData);
        appV2.state.emaShortSeries.setData(emaShortData);
        appV2.state.emaMediumSeries.setData(emaMediumData);
        appV2.state.emaLongSeries.setData(emaLongData);

        // Update visibility based on show settings
        appV2.state.emaShortSeries.applyOptions({ visible: appV2.state.params.emaShort.show });
        appV2.state.emaMediumSeries.applyOptions({ visible: appV2.state.params.emaMedium.show });
        appV2.state.emaLongSeries.applyOptions({ visible: appV2.state.params.emaLong.show });

        // Update analysis panel
        appV2.renderSelectedAnalysis(assetData);
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
                        <div class="ema-type">Short (${appV2.state.params.emaShort.period})</div>
                        <div class="ema-val">${analysis.shortValue ? analysis.shortValue.toFixed(4) : '-'}</div>
                    </div>
                    <div class="ema-value-item medium">
                        <div class="ema-type">Medium (${appV2.state.params.emaMedium.period})</div>
                        <div class="ema-val">${analysis.mediumValue ? analysis.mediumValue.toFixed(4) : '-'}</div>
                    </div>
                    <div class="ema-value-item long">
                        <div class="ema-type">Long (${appV2.state.params.emaLong.period})</div>
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
                    <span>EMA Short (${appV2.state.params.emaShort.period})</span>
                </div>
                <div class="legend-item">
                    <span class="legend-color medium"></span>
                    <span>EMA Medium (${appV2.state.params.emaMedium.period})</span>
                </div>
                <div class="legend-item">
                    <span class="legend-color long"></span>
                    <span>EMA Long (${appV2.state.params.emaLong.period})</span>
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
        const serverTime = systemTime + appV2.state.serverTimeOffset;
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
        if (appV2.state.isPolling) {
            appV2.state.isPolling = false;
            if (appV2.pollInterval) clearInterval(appV2.pollInterval);
            if (DerivAPI.ws) DerivAPI.ws.close();

            appV2.updateStatus('Stopped', 'disconnected');
            btn.innerHTML = '<i data-lucide="play"></i> Start';
            btn.classList.add('stopped');
        } else {
            appV2.state.isPolling = true;
            appV2.init();
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
        const settings = appV2.state.analysisSettings;

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
        appV2.state.analysisSettings = {
            flatThreshold: parseFloat(document.getElementById('flat-threshold').value),
            macdThreshold: parseFloat(document.getElementById('macd-threshold').value),
            hmaPeriod: parseInt(document.getElementById('hma-period').value),
            ehmaPeriod: parseInt(document.getElementById('ehma-period').value),
            bbPeriod: parseInt(document.getElementById('bb-period').value),
            bbStdDev: parseFloat(document.getElementById('bb-stddev').value)
        };

        appV2.saveSettings();
        appV2.closeAnalysisSettingsModal();

        // Recalculate with new settings
        appV2.state.dataStore = {};
        appV2.state.candleStore = {};
        appV2.state.analysisDataStore = {};
        appV2.refreshData();

        console.log('Analysis settings saved:', appV2.state.analysisSettings);
    },

    openTooltipFieldsModal: () => {
        const modal = document.getElementById('tooltip-fields-modal');
        const fields = appV2.state.tooltipFields;

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
            appV2.state.tooltipFields[field] = checkbox.checked;
        });

        appV2.saveSettings();
        appV2.closeTooltipFieldsModal();
        console.log('Tooltip fields saved:', appV2.state.tooltipFields);
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
        const analysisData = [];
        const flatThreshold = appV2.state.analysisSettings.flatThreshold;
        const macdThreshold = appV2.state.analysisSettings.macdThreshold;
        const atrMultiplier = appV2.state.params.atr.multiplier;

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
        appV2.state.analysisDataStore[symbol] = analysisData;
        return analysisData;
    }
};

// Start
document.addEventListener('DOMContentLoaded', appV2.init);

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
                appV2.loadEmaSettings();
                appV2.saveSettings(); // Save to localStorage
                appV2.state.dataStore = {}; // Reset to recalculate
                appV2.state.candleStore = {};
                appV2.refreshData();
            });
        }
    });
});

