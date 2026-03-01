// Trading Module for Deriv API
// Handles automated trading with Fixed Money and Martingale strategies

(function () {
    const DERIV_APP_ID = 1089;
    const DERIV_WS_URL = `wss://ws.binaryws.com/websockets/v3?app_id=${DERIV_APP_ID}`;

    const DerivTrader = {
        ws: null,

        // Martingale money sequence
        martingaleMoney: [1, 2, 6, 18, 54, 162, 324],

        // Trading state
        state: {
            isTrading: false,
            isWaitingForEntry: false,
            currentBalance: 0,
            startingBalance: 0,
            targetMoney: 0,
            profitLoss: 0,

            // Trade settings
            duration: 1,
            durationUnit: 't', // t=ticks, s=seconds, m=minutes, h=hours
            moneyTrade: 1,
            tradeType: 'fixed', // 'fixed' or 'martingale'

            // Statistics
            numWin: 0,
            numLoss: 0,
            winCon: 0, // Consecutive wins
            lossCon: 0, // Consecutive losses
            maxWinCon: 0,
            maxLossCon: 0,
            lastWinStatus: null, // 'win', 'loss', null

            // Martingale state
            martingaleStep: 0,

            // Active contracts
            activeContracts: [], // Array of contract info
            contractHistory: [], // All completed contracts

            // Polling
            trackOrderInterval: null,
            entryCheckInterval: null,

            // Selected symbol for trading
            tradingSymbol: null,

            // Authorization state
            isAuthorized: false,
            accountName: null,
            accountCurrency: 'USD',

            // Subscriptions
            balanceSubscribed: false,
            subscribedContracts: new Set()
        },

        // Initialize trader
        init: async () => {
            console.log('DerivTrader initialized');
            DerivTrader.loadSettings();
            DerivTrader.loadSavedToken();

            // Require login session (handled by login system)
            if (window.jsB && typeof window.jsB.requireAuth === 'function') {
                if (!window.jsB.requireAuth()) return;
            }

            // Connect own WebSocket and authorize via jsB
            try {
                await DerivTrader.connectAndAuthorize();
            } catch (e) {
                console.error('DerivTrader connect/auth failed:', e);
            }

            DerivTrader.updateUI();

            // Start trading clock update
            if (DerivTrader._clockInterval) clearInterval(DerivTrader._clockInterval);
            DerivTrader._clockInterval = setInterval(DerivTrader.updateTradingClock, 1000);
        },

        connectAndAuthorize: () => {
            return new Promise((resolve, reject) => {
                // Close existing socket if any
                try {
                    if (DerivTrader.ws && DerivTrader.ws.readyState === WebSocket.OPEN) {
                        resolve();
                        return;
                    }
                } catch {
                    // ignore
                }

                const ws = new WebSocket(DERIV_WS_URL);
                DerivTrader.ws = ws;

                ws.onopen = async () => {
                    try {
                        const encryptedToken = sessionStorage.getItem('deriv_token');
                        if (!encryptedToken) {
                            reject(new Error('Missing deriv_token in sessionStorage'));
                            return;
                        }
                        if (!window.jsB || typeof window.jsB.authorizeEncryptedToken !== 'function') {
                            reject(new Error('jsB.authorizeEncryptedToken is not available'));
                            return;
                        }

                        await window.jsB.authorizeEncryptedToken(ws, encryptedToken);
                        resolve();
                    } catch (e) {
                        reject(e);
                    }
                };

                ws.onerror = (err) => {
                    reject(err);
                };

                ws.onclose = () => {
                    DerivTrader.state.isAuthorized = false;
                    DerivTrader.state.balanceSubscribed = false;
                    console.log('DerivTrader WebSocket closed');
                };

                ws.onmessage = (msg) => {
                    let data;
                    try {
                        data = JSON.parse(msg.data);
                    } catch {
                        return;
                    }

                    if (!data || !data.msg_type) return;

                    if (data.msg_type === 'authorize') {
                        DerivTrader.handleAuthorize(data);
                    } else if (data.msg_type === 'proposal') {
                        DerivTrader.handleProposal(data);
                    } else if (data.msg_type === 'buy') {
                        DerivTrader.handleBuy(data);
                    } else if (data.msg_type === 'proposal_open_contract') {
                        DerivTrader.handleContractUpdate(data);
                    } else if (data.msg_type === 'sell') {
                        DerivTrader.handleSell(data);
                    } else if (data.msg_type === 'balance') {
                        DerivTrader.handleBalance(data);
                    }
                };
            });
        },

        // Update trading clock
        updateTradingClock: () => {
            const clockEl = document.getElementById('trading-clock-time');
            if (!clockEl) return;

            // Get server time offset from appV3/appV2 if available
            const offset = (typeof appV3 !== 'undefined' && appV3.state.serverTimeOffset) || (typeof appV2 !== 'undefined' && appV2.state.serverTimeOffset) || 0;
            const serverTime = Date.now() + offset;
            const now = new Date(serverTime);

            // Convert to Thai time (UTC+7)
            const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
            const thaiTime = new Date(utc + (3600000 * 7));

            const h = String(thaiTime.getHours()).padStart(2, '0');
            const m = String(thaiTime.getMinutes()).padStart(2, '0');
            const s = String(thaiTime.getSeconds()).padStart(2, '0');

            clockEl.textContent = `${h}:${m}:${s}`;
        },

        // Load saved token from localStorage
        loadSavedToken: () => {
            try {
                const savedToken = localStorage.getItem('derivApiToken');
                if (savedToken) {
                    const tokenInput = document.getElementById('deriv-token');
                    if (tokenInput) tokenInput.value = savedToken;
                }
            } catch (e) {
                console.error('Error loading saved token:', e);
            }
        },

        // Save token to localStorage
        saveToken: (token) => {
            try {
                localStorage.setItem('derivApiToken', token);
            } catch (e) {
                console.error('Error saving token:', e);
            }
        },

        // Authorize manually (fallback)
        authorize: () => {
            const tokenInput = document.getElementById('deriv-token');
            const token = tokenInput ? tokenInput.value.trim() : '';

            if (!token) {
                alert('Please enter your Deriv API token');
                return;
            }

            const ws = DerivTrader.ws;
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                alert('WebSocket not connected. Please wait and try again.');
                return;
            }

            DerivTrader.updateAuthStatus('Authorizing...', 'pending');

            const authReq = {
                authorize: token
            };

            ws.send(JSON.stringify(authReq));
            DerivTrader.saveToken(token);
        },

        // Handle authorization response
        handleAuthorize: (data) => {
            if (data.error) {
                console.error('Authorization error:', data.error);
                DerivTrader.updateAuthStatus('Auth Failed: ' + data.error.message, 'not-authorized');
                DerivTrader.state.isAuthorized = false;
                return;
            }

            if (data.authorize) {
                DerivTrader.state.isAuthorized = true;
                DerivTrader.state.accountName = data.authorize.fullname || data.authorize.loginid;
                DerivTrader.state.accountCurrency = data.authorize.currency || 'USD';
                DerivTrader.state.currentBalance = parseFloat(data.authorize.balance) || 0;

                try {
                    sessionStorage.setItem('deriv_loginid', data.authorize.loginid);
                    sessionStorage.setItem('deriv_balance', data.authorize.balance);
                    sessionStorage.setItem('deriv_currency', data.authorize.currency);
                } catch {
                    // ignore
                }

                window.dispatchEvent(new CustomEvent('derivAuthorized', { detail: data.authorize }));

                DerivTrader.updateAuthStatus(`✓ ${data.authorize.loginid}`, 'authorized');
                DerivTrader.updateUI();

                // Get real-time balance updates
                DerivTrader.getBalance();

                console.log('Authorized successfully:', data.authorize);
            }
        },

        // Update authorization status UI
        updateAuthStatus: (message, status) => {
            const statusEl = document.getElementById('auth-status');
            const authBtn = document.getElementById('btn-authorize');
            const tokenInput = document.getElementById('deriv-token');

            if (statusEl) {
                statusEl.textContent = message;
                statusEl.className = 'auth-status ' + status;

                // Apply inline styles based on status
                if (status === 'authorized') {
                    statusEl.style.background = 'rgba(16, 185, 129, 0.2)';
                    statusEl.style.color = '#6ee7b7';
                } else if (status === 'pending') {
                    statusEl.style.background = 'rgba(245, 158, 11, 0.2)';
                    statusEl.style.color = '#fcd34d';
                } else {
                    statusEl.style.background = 'rgba(239, 68, 68, 0.2)';
                    statusEl.style.color = '#fca5a5';
                }
            }

            if (authBtn) {
                if (status === 'authorized') {
                    authBtn.classList.add('authorized');
                    authBtn.innerHTML = '✓ Authorized';
                    authBtn.style.background = 'linear-gradient(135deg, #059669, #047857)';
                    if (tokenInput) tokenInput.style.display = 'none';
                } else {
                    authBtn.classList.remove('authorized');
                    authBtn.innerHTML = '🔑 Authorize';
                    authBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
                    if (tokenInput) tokenInput.style.display = 'block';
                }
            }
        },

        // Load settings from inputs
        loadSettings: () => {
            const durationEl = document.getElementById('trade-duration');
            const durationUnitEl = document.getElementById('trade-duration-unit');
            const moneyTradeEl = document.getElementById('trade-money');
            const tradeTypeEl = document.getElementById('trade-type');
            const targetMoneyEl = document.getElementById('target-money');

            if (durationEl) DerivTrader.state.duration = parseInt(durationEl.value) || 1;
            if (durationUnitEl) {
                const unitMap = { 'seconds': 's', 'minutes': 'm', 'hours': 'h', 'ticks': 't' };
                DerivTrader.state.durationUnit = unitMap[durationUnitEl.value] || 's';
            }
            if (moneyTradeEl) DerivTrader.state.moneyTrade = parseFloat(moneyTradeEl.value) || 1;
            if (tradeTypeEl) DerivTrader.state.tradeType = tradeTypeEl.value === '2' ? 'martingale' : 'fixed';
            if (targetMoneyEl) DerivTrader.state.targetMoney = parseFloat(targetMoneyEl.value) || 10;
        },

        // Get current stake based on trade type
        getCurrentStake: () => {
            if (DerivTrader.state.tradeType === 'martingale') {
                const step = Math.min(DerivTrader.state.martingaleStep, DerivTrader.martingaleMoney.length - 1);
                return DerivTrader.martingaleMoney[step];
            }
            return DerivTrader.state.moneyTrade;
        },

        // Get action from analysis data (emaMedium vs emaLong)
        getAction: (analysisData) => {
            if (!analysisData || analysisData.length === 0) {
                return null;
            }

            const latest = analysisData[analysisData.length - 1];
            const emaMediumValue = latest.emaMediumValue;
            const emaLongValue = latest.emaLongValue;

            if (emaMediumValue === null || emaLongValue === null) {
                return null;
            }

            if (emaMediumValue > emaLongValue) {
                return 'CALL';
            } else if (emaMediumValue < emaLongValue) {
                return 'PUT';
            }

            return null;
        },

        // Start trading
        startTrading: () => {
            if (!DerivTrader.ws || DerivTrader.ws.readyState !== WebSocket.OPEN) {
                alert('WebSocket not connected. Please wait for connection or refresh the page.');
                return;
            }

            if (!DerivTrader.state.isAuthorized) {
                alert('Not authorized yet. Please wait for authorization.');
                return;
            }

            if (!DerivTrader.state.tradingSymbol) {
                alert('Please select an asset first by clicking on a meter card.');
                return;
            }

            if (DerivTrader.state.isTrading) {
                console.log('Trading already started');
                return;
            }

            DerivTrader.loadSettings();
            DerivTrader.state.isTrading = true;
            DerivTrader.state.isWaitingForEntry = true;
            DerivTrader.state.startingBalance = DerivTrader.state.currentBalance;
            DerivTrader.state.profitLoss = 0;
            DerivTrader.state.numWin = 0;
            DerivTrader.state.numLoss = 0;
            DerivTrader.state.winCon = 0;
            DerivTrader.state.lossCon = 0;
            DerivTrader.state.maxWinCon = 0;
            DerivTrader.state.maxLossCon = 0;
            DerivTrader.state.martingaleStep = 0;
            DerivTrader.state.lastWinStatus = null;
            DerivTrader.state.contractHistory = [];

            DerivTrader.updateUI();
            DerivTrader.updateTradingStatus('Waiting for entry signal...', 'waiting');

            // Start checking for entry every second
            DerivTrader.startEntryCheck();

            // Start tracking orders every 2 seconds
            DerivTrader.startTrackOrders();

            console.log('Trading started for symbol:', DerivTrader.state.tradingSymbol);
        },

        // Stop trading
        stopTrading: () => {
            DerivTrader.state.isTrading = false;
            DerivTrader.state.isWaitingForEntry = false;

            if (DerivTrader.state.entryCheckInterval) {
                clearInterval(DerivTrader.state.entryCheckInterval);
                DerivTrader.state.entryCheckInterval = null;
            }

            if (DerivTrader.state.trackOrderInterval) {
                clearInterval(DerivTrader.state.trackOrderInterval);
                DerivTrader.state.trackOrderInterval = null;
            }

            DerivTrader.updateUI();
            DerivTrader.updateTradingStatus('Trading stopped', 'stopped');

            console.log('Trading stopped');
        },

        // Start entry check interval
        startEntryCheck: () => {
            if (DerivTrader.state.entryCheckInterval) {
                clearInterval(DerivTrader.state.entryCheckInterval);
            }

            DerivTrader.state.entryCheckInterval = setInterval(() => {
                DerivTrader.checkEntry();
            }, 1000);
        },

        // Check if we should enter a trade
        checkEntry: () => {
            if (!DerivTrader.state.isTrading || !DerivTrader.state.isWaitingForEntry) {
                return;
            }

            // Check if target reached
            if (DerivTrader.state.profitLoss >= DerivTrader.state.targetMoney) {
                DerivTrader.updateTradingStatus('Target reached! Profit: ' + DerivTrader.state.profitLoss.toFixed(2), 'success');
                DerivTrader.stopTrading();
                return;
            }

            const app = typeof appV3 !== 'undefined' ? appV3 : appV2;

            const timeframe = app.state.timeframe; // in seconds
            const epochNow = Math.floor(Date.now() / 1000);
            const isNewCandle = (epochNow % timeframe) === 0;

            if (!isNewCandle) {
                return;
            }

            const symbol = DerivTrader.state.tradingSymbol;
            const analysisData = app.state.analysisDataStore[symbol];

            if (!analysisData || analysisData.length === 0) {
                console.log('No analysis data available for', symbol);
                return;
            }

            const action = DerivTrader.getAction(analysisData);

            if (!action) {
                console.log('No clear action signal');
                return;
            }

            DerivTrader.executeTrade(action);
        },

        // Execute a trade
        executeTrade: (action) => {
            if (!DerivTrader.state.isTrading) return;

            DerivTrader.loadSettings();

            const symbol = DerivTrader.state.tradingSymbol;
            const stake = DerivTrader.getCurrentStake();
            const duration = DerivTrader.state.duration;
            const durationUnit = DerivTrader.state.durationUnit;

            DerivTrader.state.isWaitingForEntry = false;

            DerivTrader.updateTradingStatus(`Executing ${action} trade...`, 'executing');

            const contractType = action === 'CALL' ? 'CALL' : 'PUT';

            const proposal = {
                proposal: 1,
                amount: stake,
                basis: 'stake',
                contract_type: contractType,
                currency: 'USD',
                duration: duration,
                duration_unit: durationUnit,
                symbol: symbol
            };

            const reqId = Date.now();
            proposal.req_id = reqId;

            DerivTrader.pendingProposal = {
                action: action,
                stake: stake,
                reqId: reqId
            };

            DerivTrader.ws.send(JSON.stringify(proposal));
        },

        // Handle proposal response
        handleProposal: (data) => {
            if (data.error) {
                console.error('Proposal error:', data.error);
                DerivTrader.updateTradingStatus('Error: ' + data.error.message, 'error');
                DerivTrader.state.isWaitingForEntry = true;
                return;
            }

            const proposal = data.proposal;
            if (!proposal) return;

            const buy = {
                buy: proposal.id,
                price: proposal.ask_price
            };

            DerivTrader.ws.send(JSON.stringify(buy));
        },

        // Handle buy response
        handleBuy: (data) => {
            if (data.error) {
                console.error('Buy error:', data.error);
                DerivTrader.updateTradingStatus('Buy Error: ' + data.error.message, 'error');
                DerivTrader.state.isWaitingForEntry = true;
                return;
            }

            const buy = data.buy;
            if (!buy) return;

            const contractId = buy.contract_id;
            const buyPrice = buy.buy_price;
            const payout = buy.payout;

            const contract = {
                id: contractId,
                symbol: DerivTrader.state.tradingSymbol,
                type: DerivTrader.pendingProposal?.action || 'UNKNOWN',
                buyPrice: buyPrice,
                payout: payout,
                buyTime: new Date().toLocaleString('th-TH'),
                expiryTime: '-',
                timeRemaining: '-',
                profitLoss: 0,
                minProfit: 0,
                maxProfit: 0,
                status: 'open',
                startTime: Date.now()
            };

            DerivTrader.state.activeContracts.push(contract);
            DerivTrader.renderTrackOrderTable();

            DerivTrader.updateTradingStatus(`Contract ${contractId} opened`, 'open');

            DerivTrader.subscribeToContract(contractId);

            DerivTrader.state.currentBalance -= buyPrice;
            DerivTrader.updateUI();
        },

        // Subscribe to contract updates
        subscribeToContract: (contractId) => {
            if (DerivTrader.state.subscribedContracts && DerivTrader.state.subscribedContracts.has(contractId)) {
                return;
            }

            const subscribe = {
                proposal_open_contract: 1,
                contract_id: contractId,
                subscribe: 1
            };

            DerivTrader.ws.send(JSON.stringify(subscribe));

            if (DerivTrader.state.subscribedContracts) {
                DerivTrader.state.subscribedContracts.add(contractId);
            }
        },

        // Handle contract update
        handleContractUpdate: (data) => {
            const poc = data.proposal_open_contract;
            if (!poc) return;

            const contractId = poc.contract_id;
            const contractIndex = DerivTrader.state.activeContracts.findIndex(c => c.id === contractId);

            if (contractIndex === -1) return;

            const contract = DerivTrader.state.activeContracts[contractIndex];

            contract.profitLoss = poc.profit || 0;
            contract.payout = poc.payout || contract.payout;

            if (poc.date_expiry) {
                contract.expiryTime = new Date(poc.date_expiry * 1000).toLocaleString('th-TH');
            }

            if (poc.date_expiry) {
                const now = Math.floor(Date.now() / 1000);
                const remaining = poc.date_expiry - now;
                contract.timeRemaining = remaining > 0 ? remaining + 's' : 'Expired';
            }

            if (contract.profitLoss < contract.minProfit) contract.minProfit = contract.profitLoss;
            if (contract.profitLoss > contract.maxProfit) contract.maxProfit = contract.profitLoss;

            if (poc.status === 'sold' || poc.is_sold || poc.is_expired) {
                contract.status = 'closed';
                contract.finalProfit = poc.profit || 0;

                DerivTrader.processTradeResult(contract);

                DerivTrader.state.activeContracts.splice(contractIndex, 1);
                DerivTrader.state.contractHistory.push(contract);
            }

            DerivTrader.renderTrackOrderTable();
            DerivTrader.updateUI();
        },

        // Process trade result
        processTradeResult: (contract) => {
            const profit = contract.finalProfit || 0;

            DerivTrader.state.currentBalance += contract.buyPrice + profit;
            DerivTrader.state.profitLoss += profit;

            if (profit >= 0) {
                DerivTrader.state.numWin++;
                DerivTrader.state.winCon++;
                DerivTrader.state.lossCon = 0;
                DerivTrader.state.lastWinStatus = 'win';

                if (DerivTrader.state.winCon > DerivTrader.state.maxWinCon) {
                    DerivTrader.state.maxWinCon = DerivTrader.state.winCon;
                }

                if (DerivTrader.state.tradeType === 'martingale') {
                    DerivTrader.state.martingaleStep = 0;
                }

                DerivTrader.updateTradingStatus('WIN! Profit: +' + profit.toFixed(2), 'win');
            } else {
                DerivTrader.state.numLoss++;
                DerivTrader.state.lossCon++;
                DerivTrader.state.winCon = 0;
                DerivTrader.state.lastWinStatus = 'loss';

                if (DerivTrader.state.lossCon > DerivTrader.state.maxLossCon) {
                    DerivTrader.state.maxLossCon = DerivTrader.state.lossCon;
                }

                if (DerivTrader.state.tradeType === 'martingale') {
                    DerivTrader.state.martingaleStep++;

                    if (DerivTrader.state.martingaleStep >= DerivTrader.martingaleMoney.length) {
                        DerivTrader.updateTradingStatus('Martingale limit reached!', 'error');
                        DerivTrader.stopTrading();
                        DerivTrader.updateUI();
                        return;
                    }
                }

                DerivTrader.updateTradingStatus('LOSS: ' + profit.toFixed(2), 'loss');
            }

            if (DerivTrader.state.profitLoss >= DerivTrader.state.targetMoney) {
                DerivTrader.updateTradingStatus('🎯 Target reached! Total Profit: ' + DerivTrader.state.profitLoss.toFixed(2), 'success');
                DerivTrader.playSoldSound();
                DerivTrader.stopTrading();
                DerivTrader.updateUI();
                return;
            }

            if (DerivTrader.state.isTrading) {
                DerivTrader.state.isWaitingForEntry = true;
                setTimeout(() => {
                    if (DerivTrader.state.isTrading && DerivTrader.state.isWaitingForEntry) {
                        DerivTrader.updateTradingStatus('Waiting for next entry...', 'waiting');
                    }
                }, 2000);
            }

            DerivTrader.updateUI();
        },

        // Start tracking orders
        startTrackOrders: () => {
            if (DerivTrader.state.trackOrderInterval) {
                clearInterval(DerivTrader.state.trackOrderInterval);
            }

            DerivTrader.state.trackOrderInterval = setInterval(() => {
                DerivTrader.renderTrackOrderTable();
            }, 2000);
        },

        // Sell contract
        sellContract: (contractId) => {
            const sell = {
                sell: contractId,
                price: 0
            };

            DerivTrader.ws.send(JSON.stringify(sell));
        },

        // Handle sell response
        handleSell: (data) => {
            if (data.error) {
                console.error('Sell error:', data.error);
                alert('Sell Error: ' + data.error.message);
                return;
            }

            console.log('Contract sold:', data);
        },

        // Render track order table
        renderTrackOrderTable: () => {
            const tbody = document.getElementById('track-order-tbody');
            if (!tbody) return;

            const allContracts = [
                ...DerivTrader.state.activeContracts,
                ...DerivTrader.state.contractHistory.slice(-10)
            ];

            if (allContracts.length === 0) {
                tbody.innerHTML = '<tr><td colspan="13" style="text-align: center; color: var(--text-muted);">No orders yet</td></tr>';
                return;
            }

            tbody.innerHTML = allContracts.map((contract, index) => {
                const profitClass = contract.profitLoss >= 0 ? 'profit-positive' : 'profit-negative';
                const statusClass = contract.status === 'open' ? 'status-open' : (contract.finalProfit >= 0 ? 'status-win' : 'status-loss');

                return `
                <tr class="${statusClass}">
                    <td>${index + 1}</td>
                    <td class="contract-id">${contract.id}</td>
                    <td>${contract.symbol}</td>
                    <td class="trade-type-${contract.type.toLowerCase()}">${contract.type}</td>
                    <td>${contract.buyPrice.toFixed(2)}</td>
                    <td>${contract.payout.toFixed(2)}</td>
                    <td class="${profitClass}">${contract.profitLoss >= 0 ? '+' : ''}${contract.profitLoss.toFixed(2)}</td>
                    <td>${contract.buyTime}</td>
                    <td>${contract.expiryTime}</td>
                    <td>${contract.timeRemaining}</td>
                    <td class="profit-negative">${contract.minProfit.toFixed(2)}</td>
                    <td class="profit-positive">${contract.maxProfit.toFixed(2)}</td>
                    <td>
                        ${contract.status === 'open'
                        ? `<button class="btn-sell" onclick="DerivTrader.sellContract(${contract.id})">Sell</button>`
                        : `<span class="status-badge ${contract.finalProfit >= 0 ? 'win' : 'loss'}">${contract.finalProfit >= 0 ? 'WIN' : 'LOSS'}</span>`
                    }
                    </td>
                </tr>
            `;
            }).join('');
        },

        // Update trading status display
        updateTradingStatus: (message, type) => {
            const statusEl = document.getElementById('trading-status');
            if (statusEl) {
                statusEl.textContent = message;
                statusEl.className = 'trading-status status-' + type;
            }
            console.log('Trading Status:', message);
        },

        // Update UI
        updateUI: () => {
            const elements = {
                'stat-balance': DerivTrader.state.currentBalance.toFixed(2),
                'stat-profit-loss': (DerivTrader.state.profitLoss >= 0 ? '+' : '') + DerivTrader.state.profitLoss.toFixed(2),
                'stat-num-win': DerivTrader.state.numWin,
                'stat-num-loss': DerivTrader.state.numLoss,
                'stat-win-con': DerivTrader.state.winCon,
                'stat-loss-con': DerivTrader.state.lossCon,
                'stat-win-status': DerivTrader.state.lastWinStatus ? DerivTrader.state.lastWinStatus.toUpperCase() : '-',
                'stat-current-stake': DerivTrader.getCurrentStake().toFixed(2),
                'stat-martingale-step': DerivTrader.state.martingaleStep
            };

            for (const [id, value] of Object.entries(elements)) {
                const el = document.getElementById(id);
                if (el) el.textContent = value;
            }

            const targetEl = document.getElementById('stat-target-progress');
            if (targetEl) {
                const target = DerivTrader.state.targetMoney;
                const current = DerivTrader.state.profitLoss;
                const percent = target > 0 ? Math.min((current / target) * 100, 100) : 0;

                if (current >= target) {
                    targetEl.textContent = `🎯 Target Reached!`;
                    targetEl.className = 'stat-target target-reached';
                } else if (current >= 0) {
                    targetEl.textContent = `${current.toFixed(2)} / ${target.toFixed(2)} (${percent.toFixed(0)}%)`;
                    targetEl.className = 'stat-target';
                } else {
                    targetEl.textContent = `${current.toFixed(2)} / ${target.toFixed(2)}`;
                    targetEl.className = 'stat-target target-negative';
                }
            }

            const plEl = document.getElementById('stat-profit-loss');
            if (plEl) {
                plEl.className = DerivTrader.state.profitLoss >= 0 ? 'stat-value profit-positive' : 'stat-value profit-negative';
            }

            const wsEl = document.getElementById('stat-win-status');
            if (wsEl) {
                if (DerivTrader.state.lastWinStatus === 'win') {
                    wsEl.className = 'stat-value status-win';
                } else if (DerivTrader.state.lastWinStatus === 'loss') {
                    wsEl.className = 'stat-value status-loss';
                }
            }

            const startBtn = document.getElementById('btn-start-trading');
            const stopBtn = document.getElementById('btn-stop-trading');

            if (startBtn) startBtn.disabled = DerivTrader.state.isTrading;
            if (stopBtn) stopBtn.disabled = !DerivTrader.state.isTrading;
        },

        // Set trading symbol
        setTradingSymbol: (symbol) => {
            DerivTrader.state.tradingSymbol = symbol;
            const symbolEl = document.getElementById('trading-symbol');
            if (symbolEl) symbolEl.textContent = symbol;
        },

        // Get account balance (subscribe)
        getBalance: () => {
            if (DerivTrader.state.balanceSubscribed) return;
            DerivTrader.state.balanceSubscribed = true;

            const req = {
                balance: 1,
                subscribe: 1
            };

            const ws = DerivTrader.ws;
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(req));
            } else {
                DerivTrader.state.balanceSubscribed = false;
            }
        },

        // Handle balance response
        handleBalance: (data) => {
            if (data.balance) {
                DerivTrader.state.currentBalance = parseFloat(data.balance.balance);
                DerivTrader.updateUI();
            }
        },

        // Play sound when target reached
        playSoldSound: () => {
            try {
                const audio = new Audio('electronic-door-bell-39969.mp3');
                audio.volume = 0.5;
                audio.play().catch(e => console.error('Cannot play sound:', e));
            } catch (e) {
                console.error('Error playing sound:', e);
            }
        }
    };

    window.DerivTrader = DerivTrader;
})();
