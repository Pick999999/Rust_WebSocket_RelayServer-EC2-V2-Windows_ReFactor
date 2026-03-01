/**
 * Main Application Logic
 */

const app = {
    state: {
        activeGroup: 'A',
        timeframe: 60, // seconds
        dataSource: 'latest', // 'latest' or 'history' (history logic to be refined if needed)
        assets: {
            'A': [
                { symbol: 'R_10', name: 'Vol 10' },
                { symbol: 'R_25', name: 'Vol 25' },
                { symbol: 'R_50', name: 'Vol 50' },
                { symbol: 'R_75', name: 'Vol 75' },
                { symbol: 'R_100', name: 'Vol 100' }
            ],
            'B': [
                { symbol: '1HZ10V', name: '1HZ Vol 10' },
                { symbol: '1HZ25V', name: '1HZ Vol 25' },
                { symbol: '1HZ50V', name: '1HZ Vol 50' },
                { symbol: '1HZ75V', name: '1HZ Vol 75' },
                { symbol: '1HZ100V', name: '1HZ Vol 100' }
            ]
        },
        params: {
            ciPeriod: 14,
            adxPeriod: 14,
            adxSmoothing: 14
        },
        dataStore: {}, // symbol -> { candles: [], metrics: {} }
        meters: {}, // symbol -> MeterInstance
        reqIdMap: new Map(), // reqId -> symbol
        selectedAssets: new Set(), // symbol
        serverTimeOffset: 0,
        isPolling: true
    },

    init: async () => {
        // UI Bindings
        app.updateStatus('Connecting...', 'disconnected');

        // Connect Deriv
        DerivAPI.onOpen = app.onConnected;
        DerivAPI.onMessage = app.onMessage;

        try {
            await DerivAPI.connect();
        } catch (e) {
            app.updateStatus('Connection Failed', 'disconnected');
        }

        // Clock
        setInterval(app.updateClock, 1000);
    },

    onConnected: () => {
        app.updateStatus('Connected', 'connected');
        app.refreshData();
        // Sync Time Immediately and then every 60s
        app.syncTime();
        setInterval(app.syncTime, 60000);

        // Auto refresh based on timeframe? Or fixed interval?
        // User asked for "Refresh every x mins" setting.
        // For now, we'll set a basic poll.
        app.startPolling();
    },

    syncTime: () => {
        if (DerivAPI.ws && DerivAPI.ws.readyState === 1) {
            DerivAPI.ws.send(JSON.stringify({ time: 1 }));
        }
    },

    startPolling: () => {
        if (app.pollInterval) clearInterval(app.pollInterval);

        // Initial Fetch
        app.refreshData();

        // Schedule next fetches based on timeframe
        // If timeframe is 60s, we refresh every 60s? 
        // For better UX on "Latest", we might want faster updates (e.g. 2s) to see live candle changes.
        // However, sticking to the user's "fetch every 1, 3, 5..." instruction literally:
        // We will refresh at the rate of the timeframe.
        // But for "High Volatility" experience, let's auto-refresh every 5 seconds if timeframe is small, 
        // or just stick to timeframe. 
        // Let's compromise: if "Latest" is active, we refresh every 2 seconds to animate the needle.
        // If "History" is active, we don't auto refresh?

        if (app.state.dataSource === 'latest') {
            // Refresh according to timeframe (e.g. 60s, 180s...)
            const interval = app.state.timeframe * 1000;
            app.pollInterval = setInterval(app.refreshData, interval);
        } else {
            // Static view
        }
    },

    setAssetGroup: (group) => {
        app.state.activeGroup = group;
        document.querySelectorAll('.toggle-group button[data-group]').forEach(b => {
            b.classList.toggle('active', b.dataset.group === group);
        });

        // Clear Grid
        document.getElementById('asset-grid').innerHTML = '';
        app.state.meters = {};
        app.state.dataStore = {};

        app.refreshData();
    },

    setDataSource: (source) => {
        app.state.dataSource = source;
        document.getElementById('btn-latest').classList.toggle('active', source === 'latest');
        document.getElementById('btn-history').classList.toggle('active', source === 'history');
        app.refreshData();
    },

    handleTimeframeChange: () => {
        const select = document.getElementById('timeframe-select');
        app.state.timeframe = parseInt(select.value);
        app.refreshData();
        // restart polling with new timeframe interval
        // restart polling with new timeframe interval
        app.startPolling();
    },

    toggleAsset: (symbol) => {
        const card = document.getElementById(`card-${symbol}`);
        const checkbox = document.getElementById(`chk-${symbol}`);

        if (app.state.selectedAssets.has(symbol)) {
            app.state.selectedAssets.delete(symbol);
            if (card) card.classList.remove('selected');
            if (checkbox) checkbox.checked = false;
        } else {
            app.state.selectedAssets.add(symbol);
            if (card) card.classList.add('selected');
            if (checkbox) checkbox.checked = true;
        }
    },

    goToDetails: (e) => {
        e.preventDefault();
        const selected = Array.from(app.state.selectedAssets);
        if (selected.length === 0) {
            alert('Please select at least one asset to view details.');
            return;
        }
        localStorage.setItem('selectedAssets', JSON.stringify(selected));
        localStorage.setItem('timeframe', app.state.timeframe);
        window.location.href = 'details.html';
    },

    toggleSettings: () => {
        document.getElementById('settings-panel').classList.toggle('hidden');
    },

    applySettings: () => {
        app.state.params.ciPeriod = parseInt(document.getElementById('param-ci-period').value);
        app.state.params.adxPeriod = parseInt(document.getElementById('param-adx-period').value);
        app.state.params.adxSmoothing = parseInt(document.getElementById('param-adx-smoothing').value);
        app.toggleSettings();
        app.refreshData();
    },

    refreshData: () => {
        const group = app.state.assets[app.state.activeGroup];
        if (!DerivAPI.ws || DerivAPI.ws.readyState !== 1) return;

        // Show loading if empty
        const grid = document.getElementById('asset-grid');
        if (grid.children.length === 0) {
            grid.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Fetching Data...</p></div>`;
        }

        group.forEach((asset, index) => {
            const reqId = Date.now() + index;
            app.state.reqIdMap.set(reqId, asset.symbol);

            // Need sufficient data for indicators. 
            // CI uses Period (14). ADX uses Period (14).
            // Need at least Period + some buffer. 100 is safe.
            DerivAPI.getHistory(asset.symbol, app.state.timeframe, 100);

            // Note: We need to pass reqId logic to DerivAPI manually in this simplified setup
            // or modify send to include req_id.
            // Let's modify the call to send raw JSON with req_id here for control.
            const req = {
                ticks_history: asset.symbol,
                adjust_start_time: 1,
                count: 100,
                end: 'latest',
                style: 'candles',
                granularity: app.state.timeframe,
                req_id: reqId
            };
            DerivAPI.ws.send(JSON.stringify(req));
        });
    },

    onMessage: (data) => {
        if (data.msg_type === 'candles') {
            const reqId = data.req_id;
            const symbol = app.state.reqIdMap.get(reqId);
            if (!symbol) return;

            app.processCandles(symbol, data.candles);
        } else if (data.msg_type === 'time') {
            const serverTime = data.time * 1000;
            const localTime = Date.now();
            app.state.serverTimeOffset = serverTime - localTime;
            console.log('Time Synced. Offset:', app.state.serverTimeOffset);
        }
    },

    processCandles: (symbol, candles) => {
        // Convert to Arrays
        const closes = candles.map(c => c.close);
        const highs = candles.map(c => c.high);
        const lows = candles.map(c => c.low);
        const opens = candles.map(c => c.open);

        // Calculate Indicators
        const ci = Indicators.ci(highs, lows, closes, app.state.params.ciPeriod);
        const adx = Indicators.adx(highs, lows, closes, app.state.params.adxPeriod);

        // Get Latest
        const latestCI = ci[ci.length - 1];
        const latestADX = adx[adx.length - 1];
        const latestCandle = candles[candles.length - 1];

        // Score Logic
        // Trend Score = ADX + (100 - CI)
        const trendScore = latestADX + (100 - latestCI);

        // Calculate CI Trend (Last 10 changes)
        // Need at least 11 points to calculate 10 changes
        const trendHistory = [];
        if (ci.length >= 11) {
            // Get last 11 values: ci[n-10] ... ci[n]
            const recentCi = ci.slice(-11);
            // Loop from 1 to 10 (comparing i with i-1)
            for (let i = 1; i < recentCi.length; i++) {
                const prev = recentCi[i - 1];
                const curr = recentCi[i];
                if (curr > prev) trendHistory.push('up');
                else if (curr < prev) trendHistory.push('down');
                else trendHistory.push('flat');
            }
        }

        // Store
        app.state.dataStore[symbol] = {
            symbol: symbol,
            price: latestCandle.close,
            ci: latestCI,
            adx: latestADX,
            score: trendScore,
            isGreen: latestCandle.close >= latestCandle.open,
            recentCandles: candles.slice(-10).map(c => c.close >= c.open ? 'up' : 'down'),
            ciTrend: trendHistory
        };

        app.checkAllDataReceived();
    },

    checkAllDataReceived: () => {
        const group = app.state.assets[app.state.activeGroup];
        const receivedCount = Object.keys(app.state.dataStore).length;

        // Ideally wait for all, but for UI responsiveness we can debounce or just render what we have?
        // Or wait for exact match of current group size.
        // We need to filter dataStore for ONLY current group symbols, as switching groups might leave old data.

        const currentGroupSymbols = group.map(g => g.symbol);
        const currentData = [];

        let allPresent = true;
        for (const sym of currentGroupSymbols) {
            if (app.state.dataStore[sym]) {
                currentData.push(app.state.dataStore[sym]);
            } else {
                allPresent = false;
            }
        }

        if (allPresent) {
            // Sort by Score (Best to Worst -> Hight to Low)
            currentData.sort((a, b) => b.score - a.score);
            app.renderGrid(currentData);
        }
    },

    renderGrid: (dataList) => {
        const grid = document.getElementById('asset-grid');
        grid.innerHTML = ''; // Clear loading

        dataList.forEach((data, index) => {
            const card = document.createElement('div');
            card.className = 'asset-card';

            // Rank
            const rankClass = index === 0 ? 'top-1' : index === 1 ? 'top-2' : index === 2 ? 'top-3' : '';

            // Candle Color Indicator
            const candleColor = data.isGreen ? 'var(--success)' : 'var(--danger)';
            const candleText = data.isGreen ? 'BULL' : 'BEAR';

            // Meter Color Logic override?
            // User: "Chop indicator meter"
            // We use CI value for the meter.

            // Recent Candles HTML
            const candlesHtml = data.recentCandles ? data.recentCandles.map(dir =>
                `<div class="candle-dot ${dir}"></div>`
            ).join('') : '';

            // Choppy Trend HTML
            const trendHtml = data.ciTrend ? data.ciTrend.map(dir => {
                const icon = dir === 'up' ? '▲' : (dir === 'down' ? '▼' : '−');
                return `<div class="trend-icon trend-${dir}">${icon}</div>`
            }).join('') : '';

            const isSelected = app.state.selectedAssets.has(data.symbol);
            const selectedClass = isSelected ? 'selected' : '';
            const checkedAttr = isSelected ? 'checked' : '';

            // Note: onclick on card toggles the asset. 
            // We prevent the checkbox from receiving clicks directly to avoid conflicts, or handle it via the parent.
            // Best approach: Card handles click. Checkbox is visual.
            const cardHtml = `
                <div class="rank-badge ${rankClass}">Rank #${index + 1}</div>
                <div class="card-header">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <h2>${app.getDisplayName(data.symbol)}</h2>
                        <label class="toggle-switch" onclick="event.stopPropagation()">
                            <input type="checkbox" id="chk-${data.symbol}" ${checkedAttr} onchange="app.toggleAsset('${data.symbol}')">
                            <span class="slider"></span>
                        </label>
                    </div>
                    <span class="price">${data.price}</span>
                    <span style="color: ${candleColor}; font-weight: bold; font-size: 0.8em; margin-left: 10px;">${candleText}</span>
                </div>
                <div class="meter-container">
                    <div class="canvas-container">
                        <canvas id="meter-${data.symbol}"></canvas>
                    </div>
                </div>
                <div class="stats-row">
                    <div class="stat-item">
                        <span class="stat-label">Total Score</span>
                        <span class="stat-value" style="color: var(--primary)">${data.score.toFixed(1)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">ADX</span>
                        <span class="stat-value">${data.adx ? data.adx.toFixed(1) : '-'}</span>
                    </div>
                </div>
                <div style="margin-top: 10px; text-align: center;">
                    <span style="font-size: 0.75rem; color: var(--text-muted);">Choppy Trend (Last 10)</span>
                    <div class="trend-strip">
                        ${trendHtml}
                    </div>
                </div>
                 <div class="candle-strip">
                    ${candlesHtml}
                </div>
            `;

            card.innerHTML = cardHtml;
            card.id = `card-${data.symbol}`;
            card.onclick = (e) => {
                // Ignore if clicked on the checkbox/label directly (handled by onchange/stopPropagation)
                if (e.target.closest('.toggle-switch')) return;
                app.toggleAsset(data.symbol);
            };
            if (isSelected) card.classList.add('selected');

            grid.appendChild(card);

            // Init Meter
            const meter = new ChoppyMeter(`meter-${data.symbol}`, {
                // Zone Colors logic
                zones: [
                    { from: 0, to: 38.2, color: '#22c55e' }, // Trending
                    { from: 38.2, to: 61.8, color: '#eab308' },
                    { from: 61.8, to: 100, color: '#ef4444' } // Choppy
                ]
            });
            meter.setValue(data.ci);

            app.state.meters[data.symbol] = meter;
        });
    },

    getDisplayName: (symbol) => {
        const groupA = app.state.assets.A.find(a => a.symbol === symbol);
        if (groupA) return groupA.name;
        const groupB = app.state.assets.B.find(a => a.symbol === symbol);
        if (groupB) return groupB.name;
        return symbol;
    },

    updateStatus: (text, type) => {
        const el = document.getElementById('connection-status');
        el.className = `status-pill ${type}`;
        el.innerHTML = `<span class="dot"></span> ${text}`;
    },

    updateClock: () => {
        // Get Time for Thailand (UTC+7)
        // Method: Get UTC time, add 7 hours, PLUS server offset
        const systemTime = Date.now();
        const serverTime = systemTime + app.state.serverTimeOffset;
        const now = new Date(serverTime);

        // Shift to UTC+7
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const thaiTime = new Date(utc + (3600000 * 7));

        const h = thaiTime.getHours();
        const m = thaiTime.getMinutes();
        const s = thaiTime.getSeconds();

        // Digital Clock
        const timeString = thaiTime.toLocaleTimeString('en-US', { hour12: false });
        // Optionally add date: thaiTime.toLocaleDateString()
        const dateString = thaiTime.toLocaleDateString('en-GB');
        document.getElementById('server-time').innerText = `${timeString} (TH)`;

        // Analog Clock
        const hDeg = (h % 12) * 30 + m * 0.5; // 360 / 12 = 30
        const mDeg = m * 6; // 360 / 60 = 6
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
        if (app.state.isPolling) {
            // Stop
            app.state.isPolling = false;
            if (app.pollInterval) clearInterval(app.pollInterval);
            if (DerivAPI.ws) DerivAPI.ws.close();

            app.updateStatus('Stopped', 'disconnected');
            btn.innerHTML = '<i data-lucide="play"></i> Start';
            btn.classList.add('stopped');
        } else {
            // Start
            app.state.isPolling = true;
            app.init(); // Re-run init to connect
            btn.innerHTML = '<i data-lucide="power"></i> Stop';
            btn.classList.remove('stopped');
            // Re-create icons for the new button content
            setTimeout(() => lucide.createIcons(), 100);
        }
    }
};

// Start
document.addEventListener('DOMContentLoaded', app.init);
