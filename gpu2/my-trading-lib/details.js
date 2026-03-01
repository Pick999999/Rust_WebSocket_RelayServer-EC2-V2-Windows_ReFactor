/**
 * Details Page Logic
 */

const detailsApp = {
    state: {
        selectedAssets: [],
        timeframe: 60,
        charts: {}, // symbol -> { chart, candleSeries, maShortSeries, maLongSeries }
        reqIdMap: new Map(),
        maShortPeriod: 20,
        maLongPeriod: 50
    },

    init: async () => {
        // Load Selection
        const selected = localStorage.getItem('selectedAssets');
        const timeframe = localStorage.getItem('timeframe');

        if (!selected) {
            window.location.href = 'index.html';
            return;
        }

        detailsApp.state.selectedAssets = JSON.parse(selected);
        detailsApp.state.timeframe = parseInt(timeframe) || 60;

        // Render Containers
        // Render Containers
        detailsApp.renderChartContainers();
        detailsApp.renderTradePanels();


        // Connect Deriv
        DerivAPI.onOpen = detailsApp.onConnected;
        DerivAPI.onMessage = detailsApp.onMessage;

        detailsApp.updateStatus('Connecting...', 'disconnected');
        try {
            await DerivAPI.connect();
        } catch (e) {
            detailsApp.updateStatus('Connection Failed', 'disconnected');
        }

        // Clock
        setInterval(detailsApp.updateClock, 1000);
    },

    onConnected: () => {
        detailsApp.updateStatus('Connected', 'connected');
        detailsApp.initCharts();
        detailsApp.startPolling();
    },

    renderChartContainers: () => {
        const list = document.getElementById('charts-list');
        list.innerHTML = '';

        detailsApp.state.selectedAssets.forEach(symbol => {
            const card = document.createElement('div');
            card.id = `chart-card-${symbol}`;
            card.className = 'glass-panel';
            card.style.padding = '20px';

            card.innerHTML = `
                <div style="margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center;">
                    <h2>${symbol}</h2>
                    <div>
                        <span style="color: #22c55e;">EMA 20</span> | 
                        <span style="color: #ef4444;">EMA 50</span>
                    </div>
                </div>
                <div id="chart-container-${symbol}" style="width: 100%; height: 400px;"></div>
                <div class="trade-result-box" id="result-${symbol}">
                    Waiting for signal...
                </div>
            `;
            list.appendChild(card);
        });
    },

    renderTradePanels: () => {
        const list = document.getElementById('trade-panel-list');
        list.innerHTML = '';

        detailsApp.state.selectedAssets.forEach(symbol => {
            const panel = document.createElement('aside');
            panel.className = 'trade-panel glass-panel';
            panel.style.marginBottom = '0'; // handled by flex gap

            // For Sync scrolling or highlight (optional)

            panel.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h2>${symbol} Execution</h2>
                </div>
                
                <div class="control-group" style="margin-top:10px;">
                    <label>Suggested Action</label>
                    <select id="action-${symbol}">
                        <option value="IDLE">IDLE</option>
                        <option value="CALL">CALL (UP Trend)</option>
                <div class="control-group" style="margin-top:10px;">
                    <label>Suggested Action</label>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <input type="checkbox" id="lock-action-${symbol}" title="Lock Suggestion">
                        <select id="action-${symbol}" style="flex:1">
                            <option value="IDLE">IDLE</option>
                            <option value="CALL">CALL (UP Trend)</option>
                            <option value="PUT">PUT (DOWN Trend)</option>
                        </select>
                    </div>
                </div>

                <div class="control-group">
                    <label>Money Management</label>
                    <div style="display:flex; gap:15px; margin-top:5px; font-size:0.9em;">
                        <label style="display:flex; align-items:center; gap:5px; cursor:pointer;">
                            <input type="radio" name="mm-${symbol}" value="fixed" checked> Fixed
                        </label>
                        <label style="display:flex; align-items:center; gap:5px; cursor:pointer;">
                            <input type="radio" name="mm-${symbol}" value="martingale"> Martingale
                        </label>
                    </div>
                </div>

                <div class="control-group">
                    <label>Trade Amount ($)</label>
                    <input type="number" id="amount-${symbol}" value="10" placeholder="10">
                </div>
                <div class="control-group">
                    <label>Duration</label>
                    <div style="display:flex; gap:8px;">
                        <input type="number" id="duration-val-${symbol}" value="5" placeholder="5" style="flex:1">
                        <select id="duration-unit-${symbol}" style="width:100px;">
                            <option value="t">Ticks</option>
                            <option value="s">Seconds</option>
                            <option value="m">Minutes</option>
                        </select>
                    </div>
                </div>
                <div class="control-group">
                    <label>Limit Logic</label>
                    <select id="logic-${symbol}">
                        <option value="wait">Wait for Signal</option>
                        <option value="now">Immediate</option>
                    </select>
                </div>
                <button class="btn-primary" onclick="detailsApp.startTrade('${symbol}')" style="margin-top: 10px; justify-content: center;">
                    <i data-lucide="play"></i> Start Auto-Trade
                </button>
            `;
            list.appendChild(panel);
        });

        // Final Global Stats Panel? 
        // User asked for "Trade Execution separate for each asset".
    },

    startTrade: (symbol) => {
        alert(`Starting trade for ${symbol}...\n(Logic pending implementation)`);
    },

    initCharts: () => {
        detailsApp.state.selectedAssets.forEach(symbol => {
            const container = document.getElementById(`chart-container-${symbol}`);
            const chart = LightweightCharts.createChart(container, {
                width: container.clientWidth,
                height: 400,
                layout: {
                    backgroundColor: '#1e293b', // Match card bg
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
            });

            const candleSeries = chart.addCandlestickSeries({
                upColor: '#22c55e',
                downColor: '#ef4444',
                borderVisible: false,
                wickUpColor: '#22c55e',
                wickDownColor: '#ef4444',
            });

            const maShortSeries = chart.addLineSeries({
                color: '#22c55e', // Short MA Color
                lineWidth: 2,
            });

            const maLongSeries = chart.addLineSeries({
                color: '#ef4444', // Long MA Color
                lineWidth: 2,
            });

            detailsApp.state.charts[symbol] = {
                chart,
                candleSeries,
                maShortSeries,
                maLongSeries
            };
        });

        // Resize observer
        window.addEventListener('resize', () => {
            detailsApp.state.selectedAssets.forEach(symbol => {
                const container = document.getElementById(`chart-container-${symbol}`);
                if (container && detailsApp.state.charts[symbol]) {
                    detailsApp.state.charts[symbol].chart.resize(container.clientWidth, 400);
                }
            });
        });
    },

    startPolling: () => {
        // Initial Fetch
        detailsApp.fetchAllData();

        // Poll every 2 seconds
        setInterval(detailsApp.fetchAllData, 2000);
    },

    fetchAllData: () => {
        if (!DerivAPI.ws || DerivAPI.ws.readyState !== 1) return;

        detailsApp.state.selectedAssets.forEach((symbol, index) => {
            const reqId = Date.now() + index; // Simple unique ID enough? collision possible on fast poll?
            // Safer ID:
            const safeId = (Date.now() * 100) + index;
            detailsApp.state.reqIdMap.set(safeId, symbol);

            // Fetch history + candles for EMA calc
            // Need enough history for EMA 50
            const msg = {
                ticks_history: symbol,
                adjust_start_time: 1,
                count: 100, // Sufficient for EMA 50
                end: 'latest',
                style: 'candles',
                granularity: detailsApp.state.timeframe,
                req_id: safeId
            };
            DerivAPI.ws.send(JSON.stringify(msg));
        });
    },

    onMessage: (data) => {
        if (data.msg_type === 'candles') {
            const reqId = data.req_id;
            const symbol = detailsApp.state.reqIdMap.get(reqId);
            if (!symbol) return;
            detailsApp.updateChart(symbol, data.candles);
        }
    },

    updateChart: (symbol, candles) => {
        const chartObj = detailsApp.state.charts[symbol];
        if (!chartObj) return;

        // Process Data for LWC
        const lwcData = candles.map(c => ({
            time: c.epoch,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close
        }));

        // Calculate EMAs
        const closes = candles.map(c => c.close);
        const emaShort = Indicators.ema(closes, detailsApp.state.maShortPeriod);
        const emaLong = Indicators.ema(closes, detailsApp.state.maLongPeriod);

        // Process EMA for LWC
        const emaShortData = [];
        const emaLongData = [];

        for (let i = 0; i < candles.length; i++) {
            if (emaShort[i] !== null) {
                emaShortData.push({ time: candles[i].epoch, value: emaShort[i] });
            }
            if (emaLong[i] !== null) {
                emaLongData.push({ time: candles[i].epoch, value: emaLong[i] });
            }
        }

        // Set Data
        chartObj.candleSeries.setData(lwcData);
        chartObj.maShortSeries.setData(emaShortData);
        chartObj.maLongSeries.setData(emaLongData);

        // Suggest Action Logic
        // Check Last EMA values
        const lastShort = emaShort[emaShort.length - 1];
        const lastLong = emaLong[emaLong.length - 1];

        const actionSelect = document.getElementById(`action-${symbol}`);
        if (actionSelect && lastShort !== null && lastLong !== null) {
            let recommended = 'IDLE';
            if (lastShort > lastLong) {
                recommended = 'CALL';
                actionSelect.style.color = 'var(--success)';
            } else if (lastShort < lastLong) {
                recommended = 'PUT';
                actionSelect.style.color = 'var(--danger)';
            } else {
                actionSelect.style.color = 'var(--text-muted)';
            }

            // Only update if user hasn't manually changed it (or should we force update?)
            // Requirement says "suggest action", usually implies automatic. 
            // If it's a list box "adjustable", the user might want to override.
            // But if we override it every update (2s), user can't change it.
            // We should setting the value but maybe visual highlight?
            // "Adjustable" suggests user sets it. "Suggest action" suggests system sets it.
            // Compromise: We only set it if it's currently IDLE or matches logic, 
            // OR we just provide a visual hint text separate from the selection.
            // Re-reading: "Suggested Action let be a List Box so can adjust".
            // So the select box is for the USER to choose what to do, but we should probably default it or suggest it.
            // Let's set the value automatically for now as that seems to be the intent of "Suggest".
            // If user changes it, it might get overwritten 2s later. 
            // Better: Add a "Auto-Select" logic or just update it. 

            // Update only if NOT locked
            const lockCheck = document.getElementById(`lock-action-${symbol}`);
            if (lockCheck && !lockCheck.checked) {
                actionSelect.value = recommended;
            }
        }
    },

    updateStatus: (text, type) => {
        const el = document.getElementById('connection-status');
        if (el) {
            el.className = `status-pill ${type}`;
            el.innerHTML = `<span class="dot"></span> ${text}`;
        }
    },

    updateClock: () => {
        const now = new Date();
        const el = document.getElementById('server-time');
        if (el) el.innerText = now.toUTCString().split(' ')[4] + ' UTC';
    }
};

document.addEventListener('DOMContentLoaded', detailsApp.init);
