/**
 * Trading Module for Deriv API
 * Handles automated trading with Fixed Money and Martingale strategies
 */

/**
* ============================================================
* DerivTrader Module Summary
* ============================================================
* 1. getWebSocket()
   * - Param: None
   * - Return: WebSocket object or null
 2. init()
   * - Param: None
   * - Return: Void (Initializes settings, events, and UI)
 3. updateTradingClock()
   * - Param: None
   * - Return: Void (Updates current Thai time on UI)
 4. loadSavedToken() / saveToken(token)
   * - Param: token (String)
   * - Return: Void (Handles localStorage for API token)
 5. authorize()
   * - Param: None
   * - Return: Void (Sends authorization request to WS)
 6. handleAuthorize(data) / handleBalance(data)
   * - Param: data (Object - WS Response)
   * - Return: Void (Updates state and UI from WS response)
 7. loadSettings()
   * - Param: None
   * - Return: Void (Syncs UI input values to internal state)
 8. getCurrentStake()
   * - Param: None
   * - Return: Number (Returns current stake based on strategy)
 9. getAction(analysisData)
   * - Param: analysisData (Array of Objects)
   * - Return: String ('CALL', 'PUT') or null
 10. startTrading() / stopTrading()
   * - Param: None
   * - Return: Void (Controls the trading loop state)
 11. checkEntry()
   * - Param: None
   * - Return: Void (Core logic to decide when to execute trade)
 12. executeTrade(action)
   * - Param: action (String)
   * - Return: Void (Sends proposal request to WS)
 13. handleProposal(data) / handleBuy(data) / handleSell(data)
   * - Param: data (Object - WS Response)
   * - Return: Void (Handles trade execution flow)
 14. subscribeToContract(contractId) / handleContractUpdate(data)
   * - Param: id (String/Number) or data (Object)
   * - Return: Void (Tracks active trade progress)
 15. processTradeResult(contract)
   * - Param: contract (Object)
   * - Return: Void (Calculates P/L and manages Martingale steps)
 16. renderTrackOrderTable()
   * - Param: None
   * - Return: Void (Updates the HTML table with order history)
 17. updateTradingStatus(message, type) / updateUI()
   * - Param: message (String), type (String)
   * - Return: Void (Updates DOM elements)
 18. setTradingSymbol(symbol) / getBalance()
   * - Param: symbol (String)
   * - Return: Void (Internal state management)
 19. playSoldSound()
   * - Param: None
   * - Return: Void (Plays success notification sound)
* ============================================================
*/

// Helper function to get WebSocket (uses jsB global WebSocket if available)
function getWebSocket() {
    // Check various sources for the WebSocket
    if (window.derivWS && window.derivWS.readyState === 1) return window.derivWS;
    if (typeof DerivAPI !== 'undefined' && DerivAPI.ws && DerivAPI.ws.readyState === 1) return DerivAPI.ws;
    if (typeof DerivTrader !== 'undefined' && DerivTrader.ws && DerivTrader.ws.readyState === 1) return DerivTrader.ws;
    return null;
}

window.DerivTrader = {
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
        tradeCondition: 'auto', // 'auto', 'call', 'put'

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
        subscribedContracts: new Set(),

        // Symbol Locking
        // Symbol Locking
        // Symbol Locking
        isSymbolLocked: false,

        // Exchange Rate
        exchangeRate: 33.5, // USD to THB


        // Telegram Settings
        telegram: {
            enabled: false,
            token: '',
            chatId: ''
        },

        // Today's Stats
        dailyProfitLoss: 0
    },

    // Initialize trader
    init: () => {
        console.log('DerivTrader initialized');
        DerivTrader.loadSettings();
        DerivTrader.loadSavedToken();
        DerivTrader.loadDailyStats(); // Load today's P/L

        // Initialize Telegram UI from localStorage
        try {
            const savedTg = JSON.parse(localStorage.getItem('telegramSettings'));
            if (savedTg) {
                DerivTrader.state.telegram = { ...DerivTrader.state.telegram, ...savedTg };

                const tgEnable = document.getElementById('telegram-enable');
                const tgToken = document.getElementById('telegram-token');
                const tgChatId = document.getElementById('telegram-chat-id');

                if (tgEnable) tgEnable.checked = DerivTrader.state.telegram.enabled;
                if (tgToken) tgToken.value = DerivTrader.state.telegram.token;
                if (tgChatId) tgChatId.value = DerivTrader.state.telegram.chatId;
            }
        } catch (e) { }

        // Sync with jsB authentication if available
        // Sync with jsB authentication if available
        // Sync with jsB authentication if available
        // Note: We don't assume authorization is complete until the WebSocket confirms it.
        if (window.jsB && window.jsB.isAuthenticated()) {
            console.log('✅ jsB session detected. Waiting for WebSocket authorization...');
            // We could try to auto-authorize here if socket is ready, but typically we wait for user action or socket open event.
        }

        // Listen for jsB authorization events
        window.addEventListener('derivAuthorized', (e) => {
            if (e.detail) {
                DerivTrader.state.isAuthorized = true;
                DerivTrader.state.accountName = e.detail.loginid;
                DerivTrader.state.accountCurrency = e.detail.currency || 'USD';
                DerivTrader.state.currentBalance = parseFloat(e.detail.balance) || 0;
                console.log('✅ Trader synced with jsB authorization event');
                DerivTrader.updateAuthStatus(`✓ ${e.detail.loginid}`, 'authorized');
                DerivTrader.updateUI();
            }
        });

        DerivTrader.updateUI();

        // Start trading clock update
        setInterval(DerivTrader.updateTradingClock, 1000);

        // Attach listeners so changes to the settings immediately update trader state/UI
        try {
            const ids = ['trade-duration', 'trade-duration-unit', 'trade-money', 'trade-type', 'target-money'];
            ids.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.addEventListener('change', () => { DerivTrader.loadSettings(); DerivTrader.updateUI(); });
            });

            // Lock Symbol Listener
            const lockEl = document.getElementById('chk-lock-symbol');
            if (lockEl) {
                lockEl.addEventListener('change', () => DerivTrader.toggleSymbolLock());
            }
            if (lockEl) {
                lockEl.addEventListener('change', () => DerivTrader.toggleSymbolLock());
            }

            // Telegram Settings Listeners
            const tgIds = ['telegram-enable', 'telegram-token', 'telegram-chat-id'];
            tgIds.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.addEventListener('change', () => DerivTrader.loadSettings());
            });
        } catch (e) { /* ignore DOM timing */ }
    },

    // Update trading clock
    updateTradingClock: () => {
        const clockEl = document.getElementById('trading-clock-time');
        if (!clockEl) return;

        // Get server time offset from appV4/appV3/appV2 if available
        const app = typeof appV4 !== 'undefined' ? appV4 : (typeof appV3 !== 'undefined' ? appV3 : (typeof appV2 !== 'undefined' ? appV2 : null));
        const offset = (app && app.state && app.state.serverTimeOffset) || 0;
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

    // Load Daily Stats
    loadDailyStats: () => {
        try {
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            const key = 'daily_stats_' + today;
            const saved = localStorage.getItem(key);
            if (saved) {
                const stats = JSON.parse(saved);
                DerivTrader.state.dailyProfitLoss = parseFloat(stats.dailyProfitLoss) || 0;
            } else {
                DerivTrader.state.dailyProfitLoss = 0;
            }
        } catch (e) {
            console.error('Error loading daily stats:', e);
            DerivTrader.state.dailyProfitLoss = 0;
        }
    },

    // Save Daily Stats
    saveDailyStats: () => {
        try {
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            const key = 'daily_stats_' + today;
            const stats = {
                dailyProfitLoss: DerivTrader.state.dailyProfitLoss
            };
            localStorage.setItem(key, JSON.stringify(stats));
        } catch (e) {
            console.error('Error saving daily stats:', e);
        }
    },

    // Authorize with Deriv API
    authorize: () => {
        const tokenInput = document.getElementById('deriv-token');
        const token = tokenInput ? tokenInput.value.trim() : '';

        if (!token) {
            alert('Please enter your Deriv API token');
            return;
        }

        const ws = getWebSocket();
        if (!ws || ws.readyState !== 1) {
            alert('WebSocket not connected. Please wait and try again.');
            return;
        }

        DerivTrader.updateAuthStatus('Authorizing...', 'pending');

        const authReq = {
            authorize: token
        };

        ws.send(JSON.stringify(authReq));

        // Save token to localStorage
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

        if (statusEl) {
            statusEl.textContent = message;
            statusEl.className = 'auth-status ' + status;
        }

        if (authBtn) {
            if (status === 'authorized') {
                authBtn.classList.add('authorized');
                authBtn.innerHTML = '<i data-lucide="check"></i> Authorized';
            } else {
                authBtn.classList.remove('authorized');
                authBtn.innerHTML = '<i data-lucide="key"></i> Authorize';
            }
            // Refresh lucide icons
            if (typeof lucide !== 'undefined') lucide.createIcons();
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
        if (tradeTypeEl) DerivTrader.state.tradeType = tradeTypeEl.value === '2' ? 'martingale' : 'fixed';
        if (targetMoneyEl) DerivTrader.state.targetMoney = parseFloat(targetMoneyEl.value) || 10;

        // Load Trade Condition
        const conditionEl = document.querySelector('input[name="trade-condition"]:checked');
        if (conditionEl) DerivTrader.state.tradeCondition = conditionEl.value;

        // Load Telegram Settings
        const tgEnable = document.getElementById('telegram-enable');
        const tgToken = document.getElementById('telegram-token');
        const tgChatId = document.getElementById('telegram-chat-id');

        if (tgEnable) DerivTrader.state.telegram.enabled = tgEnable.checked;
        if (tgToken) DerivTrader.state.telegram.token = tgToken.value.trim();
        if (tgChatId) DerivTrader.state.telegram.chatId = tgChatId.value.trim();

        // Save to localStorage
        try {
            localStorage.setItem('telegramSettings', JSON.stringify(DerivTrader.state.telegram));
        } catch (e) { }
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
        // Check if authenticated via jsB (secure login system)
        if (window.jsB && !window.jsB.isAuthenticated()) {
            alert('WebSocket not connected. Please wait for connection or refresh the page.');
            return;
        }

        // Fallback: check local authorization (if not using jsB)
        if (!window.jsB && !DerivTrader.state.isAuthorized) {
            alert('Please authorize with your Deriv API token first.');
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
    stopTrading: (reason = 'Manual Stop') => {
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
        DerivTrader.updateTradingStatus('Trading stopped: ' + reason, 'stopped');

        console.log('Trading stopped. Reason:', reason);

        // Send Telegram Session Summary
        if (DerivTrader.state.telegram.enabled) {
            const totalPL = DerivTrader.state.profitLoss;
            const resultEmoji = totalPL >= 0 ? '✅' : '❌';
            const msg = `
<b>🛑 Trading Stopped</b>
<b>Reason:</b> ${reason}
<b>Total P/L:</b> ${totalPL >= 0 ? '+' : ''}${totalPL.toFixed(2)} USD
<b>Wins:</b> ${DerivTrader.state.numWin} | <b>Losses:</b> ${DerivTrader.state.numLoss}
<b>Max Win Con:</b> ${DerivTrader.state.maxWinCon} | <b>Max Loss Con:</b> ${DerivTrader.state.maxLossCon}
<b>Balance:</b> ${DerivTrader.state.currentBalance.toFixed(2)} USD
<b>Time:</b> ${new Date().toLocaleString('th-TH')}
`;
            DerivTrader.sendTelegram(msg);
        }
    },

    // Start entry check interval
    startEntryCheck: () => {
        if (DerivTrader.state.entryCheckInterval) {
            clearInterval(DerivTrader.state.entryCheckInterval);
        }

        // Check every second
        DerivTrader.state.entryCheckInterval = setInterval(() => {
            DerivTrader.checkEntry();
        }, 1000);
    },

    // Check if we should enter a trade
    checkEntry: (force = false) => {
        if (!DerivTrader.state.isTrading || !DerivTrader.state.isWaitingForEntry) {
            // If forced, we might need to enable trading/waiting temporarily or just proceed if active
            if (force) {
                // If forced, ensure we can trade
                if (!DerivTrader.state.isTrading) {
                    console.warn("Cannot force entry: Trading is stopped.");
                    return;
                }
                // Reset waiting flag if forced to allow re-entry? 
                // Or usually 'force' implies 'do it now even if not at 00s'
                DerivTrader.state.isWaitingForEntry = true;
            } else {
                return;
            }
        }

        // Check if target reached
        if (DerivTrader.state.profitLoss >= DerivTrader.state.targetMoney) {
            DerivTrader.updateTradingStatus('Target reached! Profit: ' + DerivTrader.state.profitLoss.toFixed(2), 'success');
            DerivTrader.stopTrading('Target Reached 🎯');
            return;
        }

        // Detect which app version is available (V4, V3 or V2)
        const app = typeof appV4 !== 'undefined' ? appV4 : (typeof appV3 !== 'undefined' ? appV3 : (typeof appV2 !== 'undefined' ? appV2 : null));

        if (!app) {
            console.log('No app instance found');
            return;
        }

        // Check timeframe only if NOT forced
        if (!force) {
            // Check if we're at second 0 of the timeframe
            const now = new Date();
            const timeframe = app.state.timeframe; // in seconds
            const epochNow = Math.floor(Date.now() / 1000);
            const isNewCandle = (epochNow % timeframe) === 0;

            if (!isNewCandle) {
                return;
            }
        }

        // Get analysis data for the trading symbol
        const symbol = DerivTrader.state.tradingSymbol;
        const analysisData = app.state.analysisDataStore[symbol];

        if (!analysisData || analysisData.length === 0) {
            console.log('No analysis data available for', symbol);
            return;
        }

        // Determine action based on trade condition
        let action = null;

        if (DerivTrader.state.tradeCondition === 'call') {
            action = 'CALL'; // Force CALL
        } else if (DerivTrader.state.tradeCondition === 'put') {
            action = 'PUT'; // Force PUT
        } else {
            // Auto: use analysis signal
            action = DerivTrader.getAction(analysisData);
        }

        if (!action) {
            console.log('No clear action signal (Auto mode)');
            return;
        }

        // Execute trade
        DerivTrader.executeTrade(action);
    },

    // Force start trading immediately (bypass seconds check)
    forceStartTrading: () => {
        if (!DerivTrader.state.isTrading) {
            DerivTrader.startTrading();
        }
        // Wait a small delay to ensure startTrading state is set, then force check
        setTimeout(() => {
            console.log("Force executing trade check...");
            DerivTrader.checkEntry(true);
        }, 100);
    },

    // Execute a trade
    executeTrade: (action) => {
        if (!DerivTrader.state.isTrading) return;

        // Reload settings before trade to get latest values
        DerivTrader.loadSettings();

        const symbol = DerivTrader.state.tradingSymbol;
        const stake = DerivTrader.getCurrentStake();
        const duration = DerivTrader.state.duration;
        const durationUnit = DerivTrader.state.durationUnit;

        // Prevent entering while waiting for a trade to complete
        DerivTrader.state.isWaitingForEntry = false;

        DerivTrader.updateTradingStatus(`Executing ${action} trade...`, 'executing');

        // Build contract type
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

        console.log('Sending proposal:', proposal);

        // Send proposal request
        const reqId = Date.now();
        proposal.req_id = reqId;

        // Store pending proposal
        DerivTrader.pendingProposal = {
            action: action,
            stake: stake,
            reqId: reqId
        };

        // Use global derivWS from jsB
        const ws = getWebSocket();
        ws.send(JSON.stringify(proposal));
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

        // Buy the contract
        const buy = {
            buy: proposal.id,
            price: proposal.ask_price
        };

        console.log('Buying contract:', buy);
        const ws = getWebSocket();
        ws.send(JSON.stringify(buy));
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

        // Add to active contracts
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

        // Subscribe to contract updates
        DerivTrader.subscribeToContract(contractId);

        // Update balance
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

        const ws = getWebSocket();
        ws.send(JSON.stringify(subscribe));

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

        // Update contract info
        contract.profitLoss = poc.profit || 0;
        contract.payout = poc.payout || contract.payout;
        if (poc.entry_spot) {
            contract.entrySpot = poc.entry_spot;
            // If visible, ensure line is drawn (in case it appeared just now or updated)
            if (contract.isEntrySpotVisible) {
                const app = typeof appV4 !== 'undefined' ? appV4 : (typeof appV3 !== 'undefined' ? appV3 : null);
                if (app && app.addEntrySpotLine) app.addEntrySpotLine(contract);
            }
        }

        // Monitor Break-even / Low Profit Logic
        // Requirement: Update normally, BUT IF profit is between 0 and 0.005 -> LOCK the values (do not update) and show Lock Icon.
        if (poc.current_spot && contract.entrySpot) {
            const currentPrice = poc.current_spot;
            // Only update if this is the latest active contract
            const lastContract = DerivTrader.state.activeContracts[DerivTrader.state.activeContracts.length - 1];

            if (lastContract && lastContract.id === contractId) {
                const elProfit = document.getElementById('stat-profit-zero');
                const elEntry = document.getElementById('stat-profit-zero-diff'); // This label is "Entry Price" in HTML
                const elPrice = document.getElementById('stat-zero-current-price'); // This label is "Price" in HTML

                // Check lock condition: Profit in range [0, 0.005]
                // Once locked, it STAYS locked for this contract.
                if (!contract.isStatsLocked && contract.profitLoss >= 0 && contract.profitLoss <= 0.005) {
                    contract.isStatsLocked = true;
                    // Initial update for the locked values
                    if (elProfit) {
                        elProfit.innerHTML = contract.profitLoss.toFixed(4) + ' <span style="font-size:12px">🔒</span>'; // show more precision when locked
                        elProfit.className = 'stat-value text-green';
                    }
                    if (elEntry) elEntry.textContent = contract.entrySpot;
                    if (elPrice) elPrice.textContent = currentPrice;
                    console.log('Stats PERMANENTLY Locked at profit:', contract.profitLoss);
                }

                // If NOT locked, update normally. If locked, DO NOTHING (values persist).
                if (!contract.isStatsLocked) {
                    // UNLOCKED STATE: Update values normally
                    if (elProfit) {
                        elProfit.textContent = contract.profitLoss.toFixed(2);
                        // Color styling
                        if (contract.profitLoss > 0) elProfit.className = 'stat-value text-green';
                        else if (contract.profitLoss < 0) elProfit.className = 'stat-value text-red';
                        else elProfit.className = 'stat-value';
                    }

                    if (elEntry) {
                        elEntry.textContent = contract.entrySpot;
                    }

                    if (elPrice) {
                        elPrice.textContent = currentPrice;
                    }
                }
            }
        }

        if (poc.date_expiry) {
            contract.expiryTime = new Date(poc.date_expiry * 1000).toLocaleString('th-TH');
        }

        // Calculate time remaining and progress
        if (poc.date_expiry) {
            const now = Math.floor(Date.now() / 1000);
            const remaining = poc.date_expiry - now;
            contract.remainingSeconds = remaining > 0 ? remaining : 0;
            contract.timeRemaining = remaining > 0 ? remaining + 's' : 'Expired';

            // Calculate progress (use date_start if available, otherwise just use remaining)
            const startTime = poc.date_start || (contract.startTime / 1000);
            const totalDuration = poc.date_expiry - startTime;
            if (totalDuration > 0) {
                contract.progressPercent = Math.min(100, Math.max(0, (remaining / totalDuration) * 100));
            } else {
                contract.progressPercent = 0;
            }
        }

        // Track min/max profit
        if (contract.profitLoss < contract.minProfit) contract.minProfit = contract.profitLoss;
        if (contract.profitLoss > contract.maxProfit) contract.maxProfit = contract.profitLoss;

        // Auto-sell when target profit reached (if targetProfit set and contract still open)
        try {
            const target = parseFloat(contract.targetProfit || 0);
            if (contract.status === 'open' && target > 0 && contract.profitLoss >= target && !contract._autoSellTriggered) {
                contract._autoSellTriggered = true;
                console.log(`Auto-selling contract ${contractId} because profit ${contract.profitLoss} >= target ${target}`);
                DerivTrader.sellContract(contractId);
            }
        } catch (e) { /* ignore */ }

        // Check if contract is sold/expired
        if (poc.status === 'sold' || poc.is_sold || poc.is_expired) {
            contract.status = 'closed';
            contract.finalProfit = poc.profit || 0;

            // Process result
            DerivTrader.processTradeResult(contract);

            // Remove from active contracts
            DerivTrader.state.activeContracts.splice(contractIndex, 1);

            // Move to history
            DerivTrader.state.contractHistory.push(contract);
        }

        DerivTrader.renderTrackOrderTable();
        DerivTrader.updateUI();
    },

    // Process trade result
    processTradeResult: (contract) => {
        const profit = contract.finalProfit || 0;

        console.log('=== processTradeResult ===');
        console.log('Contract profit:', profit);
        console.log('isTrading:', DerivTrader.state.isTrading);
        console.log('activeContracts:', DerivTrader.state.activeContracts.length);

        // Update balance
        DerivTrader.state.currentBalance += contract.buyPrice + profit;

        // Update profit/loss
        DerivTrader.state.profitLoss += profit;

        // Update daily profit/loss
        DerivTrader.state.dailyProfitLoss += profit;
        DerivTrader.saveDailyStats();

        console.log('Total profitLoss:', DerivTrader.state.profitLoss);
        console.log('Target:', DerivTrader.state.targetMoney);

        // Update win/loss stats
        if (profit >= 0) {
            // Win
            DerivTrader.state.numWin++;
            DerivTrader.state.winCon++;
            DerivTrader.state.lossCon = 0;
            DerivTrader.state.lastWinStatus = 'win';

            if (DerivTrader.state.winCon > DerivTrader.state.maxWinCon) {
                DerivTrader.state.maxWinCon = DerivTrader.state.winCon;
            }

            // Reset martingale on win
            if (DerivTrader.state.tradeType === 'martingale') {
                DerivTrader.state.martingaleStep = 0;
            }

            DerivTrader.updateTradingStatus('WIN! Profit: +' + profit.toFixed(2), 'win');
        } else {
            // Loss
            DerivTrader.state.numLoss++;
            DerivTrader.state.lossCon++;
            DerivTrader.state.winCon = 0;
            DerivTrader.state.lastWinStatus = 'loss';

            if (DerivTrader.state.lossCon > DerivTrader.state.maxLossCon) {
                DerivTrader.state.maxLossCon = DerivTrader.state.lossCon;
            }

            // Increment martingale step on loss
            if (DerivTrader.state.tradeType === 'martingale') {
                DerivTrader.state.martingaleStep++;
                console.log('Martingale step:', DerivTrader.state.martingaleStep, '/', DerivTrader.martingaleMoney.length);

                if (DerivTrader.state.martingaleStep >= DerivTrader.martingaleMoney.length) {
                    DerivTrader.updateTradingStatus('Martingale limit reached!', 'error');
                    DerivTrader.stopTrading('Martingale Limit Reached');
                    DerivTrader.updateUI();
                    return;
                }
            }

            DerivTrader.updateTradingStatus('LOSS: ' + profit.toFixed(2), 'loss');
        }

        // Check if target reached
        if (DerivTrader.state.profitLoss >= DerivTrader.state.targetMoney) {
            console.log('Target reached! Stopping.');
            DerivTrader.updateTradingStatus('🎯 Target reached! Total Profit: ' + DerivTrader.state.profitLoss.toFixed(2), 'success');
            // Play success sound
            DerivTrader.playSoldSound();
            DerivTrader.stopTrading('Target Reached 🎯');
            DerivTrader.updateUI();
            return;
        }

        // Continue trading - wait for next entry
        console.log('Checking continue trading...');
        console.log('isTrading:', DerivTrader.state.isTrading);
        console.log('activeContracts.length:', DerivTrader.state.activeContracts.length);

        if (DerivTrader.state.isTrading) {
            // Always continue waiting for entry after a trade completes (regardless of win/loss)
            DerivTrader.state.isWaitingForEntry = true;
            console.log('Set isWaitingForEntry = true, continuing trading...');

            // Update status after a short delay to show WIN/LOSS status first
            setTimeout(() => {
                if (DerivTrader.state.isTrading && DerivTrader.state.isWaitingForEntry) {
                    DerivTrader.updateTradingStatus('Waiting for next entry...', 'waiting');
                }
            }, 2000);
        }

        DerivTrader.updateUI();

        // Telegram notification handled in stopTrading only

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
            price: 0 // Sell at market price
        };

        console.log('Selling contract:', sell);
        const ws = getWebSocket();
        ws.send(JSON.stringify(sell));
    },

    // Set per-contract target profit (called from input onchange)
    setContractTarget: (contractId, value) => {
        const numeric = parseFloat(value);
        const idx = DerivTrader.state.activeContracts.findIndex(c => String(c.id) === String(contractId));
        if (idx !== -1) {
            DerivTrader.state.activeContracts[idx].targetProfit = isNaN(numeric) ? null : numeric;
        } else {
            // Try history
            const histIdx = DerivTrader.state.contractHistory.findIndex(c => String(c.id) === String(contractId));
            if (histIdx !== -1) {
                DerivTrader.state.contractHistory[histIdx].targetProfit = isNaN(numeric) ? null : numeric;
            }
        }
        DerivTrader.renderTrackOrderTable();
    },

    // Apply batch target profit to all open contracts
    applyBatchTargetProfit: () => {
        const input = document.getElementById('batch-target-profit');
        if (!input) return;

        const value = parseFloat(input.value);
        if (isNaN(value) || value <= 0) {
            alert('Please enter a valid target profit > 0');
            return;
        }

        let count = 0;
        DerivTrader.state.activeContracts.forEach(contract => {
            if (contract.status === 'open') {
                contract.targetProfit = value;
                count++;
            }
        });

        if (count > 0) {
            DerivTrader.renderTrackOrderTable();
            // Optional: clear input after set
            // input.value = ''; 
            console.log(`Applied target profit ${value} to ${count} open contracts`);
        } else {
            alert('No open contracts to update.');
        }
    },

    // Toggle Entry Spot Line
    toggleEntrySpot: (contractId) => {
        const contract = DerivTrader.state.activeContracts.find(c => String(c.id) === String(contractId));
        if (!contract) return;

        contract.isEntrySpotVisible = !contract.isEntrySpotVisible;

        // Call AppV4 to draw/remove line
        const app = typeof appV4 !== 'undefined' ? appV4 : (typeof appV3 !== 'undefined' ? appV3 : null);
        if (app) {
            if (contract.isEntrySpotVisible) {
                if (app.addEntrySpotLine) app.addEntrySpotLine(contract);
                else console.warn('addEntrySpotLine not implemented in app');
            } else {
                if (app.removeEntrySpotLine) app.removeEntrySpotLine(contract.id);
            }
        }

        DerivTrader.renderTrackOrderTable();
    },

    // Handle sell response
    handleSell: (data) => {
        if (data.error) {
            console.error('Sell error:', data.error);
            alert('Sell Error: ' + data.error.message);
            return;
        }

        DerivTrader.playSoldSound();
        console.log('Contract sold:', data);
    },

    // Render track order table
    renderTrackOrderTable: () => {
        const tbody = document.getElementById('track-order-tbody');
        const secondaryTbody = document.getElementById('secondary-track-order-tbody');
        if (!tbody) return;
        // If user is editing a target input inside the table, don't re-render to avoid losing focus
        try {
            const activeElement = document.activeElement;
            if (activeElement && tbody.contains(activeElement) && activeElement.tagName === 'INPUT') {
                return; // skip updating while user types
            }
        } catch (e) { /* ignore DOM access errors */ }

        // Combine active and history (limit history to last 10)
        const recentHistory = DerivTrader.state.contractHistory.slice(-10).reverse();
        const active = [...DerivTrader.state.activeContracts].reverse();
        const allOrders = [...active, ...recentHistory];

        if (allOrders.length === 0) {
            tbody.innerHTML = '<tr><td colspan="13" style="text-align: center; color: var(--text-muted);">No orders yet</td></tr>';
            if (secondaryTbody) secondaryTbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No active orders for this asset</td></tr>';
            return;
        }

        let html = '';
        allOrders.forEach((contract, index) => {
            const isWin = contract.finalProfit > 0;
            const isLoss = contract.finalProfit < 0;
            const profitClass = isWin ? 'text-green' : (isLoss ? 'text-red' : '');
            const profitSign = contract.finalProfit > 0 ? '+' : '';
            const statusClass = contract.status === 'open' ? 'status-open' : 'status-closed';

            // Calculate profit percent
            let profitPercent = 0;
            if (contract.buyPrice > 0) {
                // If closed, use finalProfit. If open, use current profitLoss logic from payout
                const currentPL = contract.status === 'open' ? contract.profitLoss : contract.finalProfit;
                profitPercent = (currentPL / contract.buyPrice) * 100;
            }

            // Action button (Sell for open contracts)
            let actionBtn = '-';
            let spotBtn = '';

            // Generate Spot Button for both tables (if we have entrySpot info)
            const spotActive = contract.isEntrySpotVisible ? 'style="background: #eab308; color: black; border-color: #ca8a04;"' : '';
            const spotBtnHtml = `<button onclick="DerivTrader.toggleEntrySpot('${contract.id}')" class="btn-sm" ${spotActive} title="Toggle Entry Spot Line">🎯</button>`;

            if (contract.status === 'open') {
                actionBtn = `
                <div style="display:flex; gap:4px;">
                    <button onclick="DerivTrader.sellContract('${contract.id}')" class="btn-sell-contract">Sell</button>
                    ${spotBtnHtml}
                </div>`;
            } else {
                actionBtn = `
                <div style="display:flex; gap:4px;">
                    ${spotBtnHtml}
                </div>`;
            }

            html += `
                <tr class="${statusClass}">
                    <td>${allOrders.length - index}</td>
                    <td>${contract.id}</td>
                    <td>${contract.symbol}</td>
                    <td><span class="badge ${contract.type === 'CALL' ? 'badge-call' : 'badge-put'}">${contract.type}</span></td>
                    <td>${contract.buyPrice.toFixed(2)}</td>
                    <td>${contract.payout ? contract.payout.toFixed(2) : '-'}</td>
                    <td class="${profitClass}">${profitSign}${contract.status === 'open' ? contract.profitLoss.toFixed(2) : contract.finalProfit.toFixed(2)} (${profitPercent.toFixed(1)}%)</td>
                    <td>${contract.buyTime.split(' ')[1]}</td>
                    <td>${contract.expiryTime ? contract.expiryTime.split(' ')[1] : '-'}</td>
                    <td>
                        ${contract.timeRemaining}
                        ${contract.status === 'open' ? `<div class="progress-bar"><div class="progress-fill" style="width: ${contract.progressPercent}%"></div></div>` : ''}
                    </td>
                     <td>${contract.minProfit ? contract.minProfit.toFixed(2) : '0.00'}</td>
                    <td>${contract.maxProfit ? contract.maxProfit.toFixed(2) : '0.00'}</td>
                     <td>
                        <div style="display: flex; gap: 4px; align-items: center;">
                            <input type="number" 
                                value="${contract.targetProfit || ''}" 
                                placeholder="TP" 
                                style="width: 50px; padding: 2px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.3); color: white; font-size: 11px;"
                                onchange="DerivTrader.setContractTarget('${contract.id}', this.value)"
                            >
                        </div>
                    </td>
                    <td>${actionBtn}</td>
                </tr>
            `;
        });

        tbody.innerHTML = html;

        // Render Secondary Table (Only for current Selected Symbol)
        if (secondaryTbody) {
            const selectedSymbol = DerivTrader.state.tradingSymbol;
            // Filter only active contracts for this symbol
            const relevantContracts = active.filter(c => c.symbol === selectedSymbol);

            if (relevantContracts.length === 0) {
                secondaryTbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No active orders for ' + (selectedSymbol || 'this asset') + '</td></tr>';
            } else {
                let secHtml = '';
                relevantContracts.forEach(contract => {
                    // Fix color logic
                    const currentPL = contract.profitLoss;
                    const isWin = currentPL > 0;
                    const isLoss = currentPL < 0;
                    const profitClass = isWin ? 'text-green' : (isLoss ? 'text-red' : '');
                    const profitSign = currentPL > 0 ? '+' : '';

                    const spotActive = contract.isEntrySpotVisible ? 'style="background: #eab308; color: black; border-color: #ca8a04; padding:2px 6px;"' : 'style="padding:2px 6px;"';
                    const spotBtnHtml = `<button onclick="DerivTrader.toggleEntrySpot('${contract.id}')" class="btn-sm" ${spotActive} title="Toggle Entry Spot Line">🎯</button>`;

                    let actionBtn = '';
                    if (contract.status === 'open') {
                        actionBtn = `
                        <div style="display:flex; gap:4px; justify-content:flex-end;">
                            <button onclick="DerivTrader.sellContract('${contract.id}')" class="btn-sell-contract" style="padding:2px 8px; font-size:10px;">Sell</button>
                            ${spotBtnHtml}
                        </div>`;
                    } else {
                        actionBtn = `
                        <div style="display:flex; gap:4px; justify-content:flex-end;">
                            ${spotBtnHtml}
                        </div>`;
                    }

                    secHtml += `
                        <tr class="status-open">
                            <td>${contract.id}</td>
                            <td><span class="badge ${contract.type === 'CALL' ? 'badge-call' : 'badge-put'}">${contract.type}</span></td>
                            <td>${contract.buyPrice.toFixed(2)}</td>
                            <td class="${profitClass}">${profitSign}${contract.profitLoss.toFixed(2)}</td>
                            <td>
                                ${contract.timeRemaining}
                                <div class="progress-bar"><div class="progress-fill" style="width: ${contract.progressPercent}%"></div></div>
                            </td>
                            <td>
                                 <div style="display: flex; gap: 4px; align-items: center;">
                                    <input type="number" 
                                        value="${contract.targetProfit || ''}" 
                                        placeholder="TP" 
                                        style="width: 50px; padding: 2px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.3); color: white; font-size: 11px;"
                                        onchange="DerivTrader.setContractTargetProfit('${contract.id}', this.value)"
                                    >
                                </div>
                            </td>
                            <td>${actionBtn}</td>
                        </tr>
                    `;
                });
                secondaryTbody.innerHTML = secHtml;
            }
        }
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
        // Update statistics
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

        // Update target progress
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

        // Update profit/loss color
        const plEl = document.getElementById('stat-profit-loss');
        if (plEl) {
            plEl.className = DerivTrader.state.profitLoss >= 0 ? 'stat-value profit-positive' : 'stat-value profit-negative';
        }

        // Update THB Profit/Loss
        const thbEl = document.getElementById('stat-profit-thb');
        if (thbEl) {
            const thbProfit = DerivTrader.state.profitLoss * DerivTrader.state.exchangeRate;
            thbEl.textContent = `${thbProfit >= 0 ? '+' : ''}฿${thbProfit.toFixed(2)}`;
            thbEl.className = `stat-thb ${thbProfit >= 0 ? 'profit-positive' : 'profit-negative'}`;
            thbEl.style.color = 'yellow';
            thbEl.style.fontSize = '20px';
        }

        // Update Daily Profit/Loss
        const dailyPlEl = document.getElementById('stat-daily-profit-loss');
        if (dailyPlEl) {
            dailyPlEl.textContent = (DerivTrader.state.dailyProfitLoss >= 0 ? '+' : '') + DerivTrader.state.dailyProfitLoss.toFixed(2);
            dailyPlEl.className = DerivTrader.state.dailyProfitLoss >= 0 ? 'stat-value profit-positive' : 'stat-value profit-negative';
        }

        const dailyThbEl = document.getElementById('stat-daily-profit-thb');
        if (dailyThbEl) {
            const dailyThbProfit = (DerivTrader.state.dailyProfitLoss || 0) * DerivTrader.state.exchangeRate;
            dailyThbEl.textContent = `${dailyThbProfit >= 0 ? '+' : ''}฿${dailyThbProfit.toFixed(2)}`;
            dailyThbEl.className = `stat-thb ${dailyThbProfit >= 0 ? 'profit-positive' : 'profit-negative'}`;
            dailyThbEl.style.color = 'yellow';
            dailyThbEl.style.fontSize = '20px';
        }

        // Update win status color
        const wsEl = document.getElementById('stat-win-status');
        if (wsEl) {
            if (DerivTrader.state.lastWinStatus === 'win') {
                wsEl.className = 'stat-value status-win';
            } else if (DerivTrader.state.lastWinStatus === 'loss') {
                wsEl.className = 'stat-value status-loss';
            }
        }

        // Update button states
        const startBtn = document.getElementById('btn-start-trading');
        const stopBtn = document.getElementById('btn-stop-trading');

        if (startBtn) startBtn.disabled = DerivTrader.state.isTrading;
        if (stopBtn) stopBtn.disabled = !DerivTrader.state.isTrading;
    },

    // Set trading symbol
    setTradingSymbol: (symbol) => {
        if (DerivTrader.state.isSymbolLocked && DerivTrader.state.tradingSymbol) {
            console.log('Trading symbol locked. Ignoring switch to:', symbol);
            return;
        }

        DerivTrader.state.tradingSymbol = symbol;
        const symbolEl = document.getElementById('trading-symbol');
        if (symbolEl) symbolEl.textContent = symbol;
    },

    // Toggle symbol lock
    toggleSymbolLock: () => {
        const lockEl = document.getElementById('chk-lock-symbol');
        if (lockEl) {
            DerivTrader.state.isSymbolLocked = lockEl.checked;
            console.log('Symbol Locked:', DerivTrader.state.isSymbolLocked);

            // If locking, ensure we have a symbol
            if (DerivTrader.state.isSymbolLocked && !DerivTrader.state.tradingSymbol) {
                alert('Please select a symbol before locking.');
                lockEl.checked = false;
                DerivTrader.state.isSymbolLocked = false;
            }

            // If unlocking, sync with current chart symbol immediately
            if (!DerivTrader.state.isSymbolLocked) {
                const app = typeof appV4 !== 'undefined' ? appV4 : (typeof appV3 !== 'undefined' ? appV3 : (typeof appV2 !== 'undefined' ? appV2 : null));
                if (app && app.state && app.state.selectedSymbol) {
                    console.log('Unlock: Syncing trading symbol to selected chart:', app.state.selectedSymbol);
                    DerivTrader.setTradingSymbol(app.state.selectedSymbol);
                }
            }
        }
    },

    // Get account balance
    getBalance: () => {
        // Fallback to standard WebSocket request
        if (DerivTrader.state.balanceSubscribed) return;
        DerivTrader.state.balanceSubscribed = true;
        const req = {
            balance: 1,
            subscribe: 1
        };
        const ws = getWebSocket();
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

    // Play sound when target reached or sold
    playSoldSound: () => {
        try {
            // Try playing the user's file first. If it fails, we catch the error.
            // Using a standard notification sound as fallback if specific file is not found is better, 
            // but for now let's try to play a generic success sound from a URL to ensure it works.
            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3'); // "Success chime"
            audio.volume = 0.5;
            const promise = audio.play();
            if (promise !== undefined) {
                promise.catch(error => {
                    console.error('Audio play failed (autoplay policy?):', error);
                });
            }
        } catch (e) {
            console.error('Error playing sound:', e);
        }
    },

    // Send Telegram Notification
    sendTelegram: (message) => {
        const { token, chatId } = DerivTrader.state.telegram;
        if (!token || !chatId) {
            console.warn('Telegram token or chat ID missing');
            return;
        }

        fetch('telegram_proxy.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: token,
                chat_id: chatId,
                message: message
            })
        })
            .then(response => {
                if (!response.ok) throw new Error('Network response was not ok');
                return response.json();
            })
            .then(data => {
                if (data.ok) {
                    console.log('Telegram notification sent successfully');
                } else {
                    console.error('Telegram API Error:', data);
                }
            })
            .catch(error => {
                console.error('Error sending Telegram notification:', error);
            });
    }
};

// Hook into message handler from jsB.js (derivMessage event)
document.addEventListener('DOMContentLoaded', () => {
    console.log('🔧 Setting up DerivTrader message listener...');

    // Listen for derivMessage events from jsB.js
    window.addEventListener('derivMessage', (event) => {
        const data = event.detail;
        if (!data) return;

        // Handle trading-specific messages
        if (data.msg_type === 'authorize') {
            DerivTrader.handleAuthorize(data);
        } else if (data.msg_type === 'proposal') {
            console.log('📥 Received proposal:', data);
            DerivTrader.handleProposal(data);
        } else if (data.msg_type === 'buy') {
            console.log('📥 Received buy:', data);
            DerivTrader.handleBuy(data);
        } else if (data.msg_type === 'proposal_open_contract') {
            DerivTrader.handleContractUpdate(data);
        } else if (data.msg_type === 'sell') {
            console.log('📥 Received sell:', data);
            DerivTrader.handleSell(data);
        } else if (data.msg_type === 'balance') {
            DerivTrader.handleBalance(data);
        }
    });

    console.log('✅ DerivTrader message handler connected to jsB events');

    // Also try to hook into DerivAPI.onMessage for backward compatibility
    setTimeout(() => {
        if (typeof DerivAPI !== 'undefined' && DerivAPI.onMessage) {
            const originalOnMessage = DerivAPI.onMessage;
            DerivAPI.onMessage = (data) => {
                // Call original handler
                if (originalOnMessage) originalOnMessage(data);

                // Handle trading-specific messages
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
            console.log('✅ DerivTrader also hooked into DerivAPI.onMessage (backward compat)');
        }
    }, 100);
});
