/**
 * ------------------------------------------------------------------
 * รายการฟังก์ชันใน trader.js และหน้าที่การทำงาน
 * ------------------------------------------------------------------
 * 1. init()
 *    - เริ่มต้นการทำงานของ Module และเรียก bindEvents()
 *
 * 2. bindEvents()
 *    - ผูก Event Handlers กับปุ่มกดและ Input ต่างๆ บนหน้าเว็บ
 *
 * 3. updateSettings()
 *    - อ่านค่าจาก Input (เช่น Token, จำนวนเงิน, Signal) มาเก็บในตัวแปร settings
 *
 * 4. toggleTradingGlobal()
 *    - สลับสถานะการทำงานระหว่าง Start/Stop Trading
 *
 * 5. startTradingGlobal()
 *    - เริ่มต้นระบบเทรด, ตรวจสอบ Token, และเปลี่ยนสถานะปุ่มเป็น Stop
 *
 * 6. stopTradingGlobal()
 *    - หยุดระบบเทรด และเปลี่ยนสถานะปุ่มกลับเป็น Start
 *
 * 7. authorize()
 *    - ทำการ Login เข้าระบบ Deriv ผ่าน WebSocket ด้วย Token
 *
 * 8. checkEntry(symbol, analysisObj)
 *    - ตรวจสอบสัญญาณเทรด (Signal Matched) ว่าตรงกับที่ตั้งไว้หรือไม่
 *    - ถ้าตรงจะเรียก executeTrade()
 *
 * 9. executeTrade(symbol, action)
 *    - คำนวณเงินต้น (Stake) ตาม Money Management (Fixed/Martingale)
 *    - ส่งคำสั่งขอราคา (Proposal) ไปยัง Server
 *
 * 10. handleMessage(msg)
 *     - ฟังก์ชันหลักสำหรับรับข้อความจาก WebSocket
 *     - จัดการ Proposal (เพื่อส่งคำสั่ง Buy)
 *     - จัดการ Buy (เพื่อบันทึกสัญญาที่เปิดแล้ว)
 *     - จัดการ Proposal Open Contract (เพื่อเช็คผล แพ้/ชนะ)
 * ------------------------------------------------------------------
 *
 * Trading Module for Deriv API (Multi-Asset Version)
 * Handles automated trading with Fixed Money and Martingale strategies
 */

window.DerivTrader = {
    // Global Settings
    settings: {
        token: '',
        tradeType: 'fixed', // 'fixed' or 'martingale'
        fixedMoney: 1,
        martingaleSteps: [1, 2, 6, 18, 54, 162],
        duration: 5,
        durationUnit: 't', // t, s, m, h
        signalCall: [], // Array of status codes for CALL
        signalPut: [],  // Array of status codes for PUT
        tradeAllAssets: false,
        accountBalance: 0,
        currency: 'USD',
        isAuthorized: false,
        accountName: ''
    },

    // Per-Asset State
    // Format: "R_10": { isTrading: false, martingaleLevel: 0, activeContract: null, history: [] }
    symbolStates: {},

    // Global State
    isTradingGlobal: false,
    isIdle: false, // New Idle State

    // Map req_id to context (symbol, action, stake, step)
    proposalMap: {},

    // Initialize Trader
    init: () => {
        console.log('DerivTrader Multi-Asset initialized');
        DerivTrader.bindEvents();
    },

    // Bind UI Events
    bindEvents: () => {
        // Start Trade Button
        const btnStart = document.getElementById('btnStartTrade');
        if (btnStart) {
            btnStart.onclick = DerivTrader.toggleTradingGlobal;
        }

        // Input changes - Update settings in real-time
        const ids = [
            'inpFixedMoney', 'fixedMoney', 'martinGale', 'martinGaleMoneyTrade',
            'numDuration', 'durationUnit', 'signalCall', 'signalPut',
            'isTradeAllAssetSelected', 'inpToken'
        ];

        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', DerivTrader.updateSettings);
            }
        });
    },

    // Update internal settings from UI
    updateSettings: () => {
        const s = DerivTrader.settings;

        // Trade Type
        const fixedRadio = document.getElementById('fixedMoney');
        s.tradeType = (fixedRadio && fixedRadio.checked) ? 'fixed' : 'martingale';

        // Money
        const inpFixed = document.getElementById('inpFixedMoney');
        if (inpFixed) s.fixedMoney = parseFloat(inpFixed.value) || 1;

        const inpMartingale = document.getElementById('martinGaleMoneyTrade');
        if (inpMartingale) {
            s.martingaleSteps = inpMartingale.value.split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
        }

        // Duration
        const inpDur = document.getElementById('numDuration');
        if (inpDur) s.duration = parseInt(inpDur.value) || 5;

        const inpDurUnit = document.getElementById('durationUnit');
        if (inpDurUnit) s.durationUnit = inpDurUnit.value;

        // Signals
        const inpCall = document.getElementById('signalCall');
        if (inpCall) s.signalCall = inpCall.value.split(/[,\s]+/).map(v => v.trim()).filter(v => v !== '');

        const inpPut = document.getElementById('signalPut');
        if (inpPut) s.signalPut = inpPut.value.split(/[,\s]+/).map(v => v.trim()).filter(v => v !== '');

        // All Assets Checkbox
        const chkAll = document.getElementById('isTradeAllAssetSelected');
        if (chkAll) s.tradeAllAssets = chkAll.checked;

        // Token
        const inpToken = document.getElementById('inpToken');
        if (inpToken && inpToken.value.trim() !== '') {
            s.token = inpToken.value.trim();
        }

        console.log('Settings Updated:', s);
    },

    // Toggle Global Trading
    toggleTradingGlobal: async () => {
        if (DerivTrader.isTradingGlobal) {
            DerivTrader.stopTradingGlobal();
        } else {
            await DerivTrader.startTradingGlobal();
        }
    },

    startTradingGlobal: async () => {
        // Update settings first
        DerivTrader.updateSettings();

        // 1. Check Token Authorization
        if (!DerivTrader.settings.isAuthorized) {
            if (!DerivTrader.settings.token) {
                alert('Please enter API Token first.');
                return;
            }

            const authorized = await DerivTrader.authorize();
            if (!authorized) return;
        }

        DerivTrader.isTradingGlobal = true;

        // Update UI
        const btn = document.getElementById('btnStartTrade');
        if (btn) {
            const mode = DerivTrader.settings.tradeType === 'fixed' ? 'Fixed' : 'Martingale';
            btn.innerHTML = `🛑 Stop (${mode})`;
            btn.classList.add('btn-danger');
            btn.style.background = 'linear-gradient(135deg, #e74c3c, #c0392b)';
        }

        console.log('Global Trading Started');

        // Initialize States for currently checked assets
        const checkboxes = document.querySelectorAll('.cbAsset:checked');
        checkboxes.forEach(cb => {
            const symbol = cb.value;
            if (!DerivTrader.symbolStates[symbol]) {
                DerivTrader.symbolStates[symbol] = {
                    martingaleLevel: 0,
                    activeContract: null
                };
            }
        });


    },

    stopTradingGlobal: () => {
        DerivTrader.isTradingGlobal = false;

        // Update UI
        const btn = document.getElementById('btnStartTrade');
        if (btn) {
            btn.innerHTML = '🚀 Start Trade';
            btn.classList.remove('btn-danger');
            btn.style.background = 'linear-gradient(135deg, #667eea, #764ba2)';
        }
        console.log('Global Trading Stopped');
    },

    // Toggle Idle Mode
    toggleIdle: (forceState = null) => {
        if (forceState !== null) {
            DerivTrader.isIdle = forceState;
        } else {
            DerivTrader.isIdle = !DerivTrader.isIdle;
        }
        console.log('Idle Mode:', DerivTrader.isIdle);

        const btn = document.getElementById('btnIdleTrade');
        if (btn) {
            if (DerivTrader.isIdle) {
                btn.innerHTML = '▶ Resume Trade';
                btn.style.background = '#ff9800'; // Orange for warning/idle
                btn.style.color = '#fff';
            } else {
                btn.innerHTML = '⏸️ Idle Trade';
                btn.style.background = '#4caf50'; // Greenish/Default
                btn.style.color = '#fff';
            }
        }
        return DerivTrader.isIdle;
    },

    // Authorize with WebSocket
    authorize: () => {
        return new Promise((resolve) => {
            if (!ws || ws.readyState !== 1) { // ws is global variable from testTickAnalysisMulti.html
                alert('WebSocket not connected.');
                resolve(false);
                return;
            }

            const req = { authorize: DerivTrader.settings.token };

            // We need a temporary handler for the auth response
            const authHandler = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.msg_type === 'authorize') {
                        if (data.error) {
                            alert('Auth Failed: ' + data.error.message);
                            resolve(false);
                        } else {
                            DerivTrader.settings.isAuthorized = true;
                            DerivTrader.settings.accountBalance = data.authorize.balance;
                            DerivTrader.settings.currency = data.authorize.currency;
                            DerivTrader.settings.accountName = data.authorize.email;

                            alert(`Authorized: ${data.authorize.email} (Balance: ${data.authorize.balance})`);

                            // Clear token input for security
                            const tokenInput = document.getElementById('inpToken');
                            if (tokenInput) tokenInput.value = '';
                            DerivTrader.settings.token = ''; // Clear from memory too if desired, relying on connection session

                            resolve(true);
                        }
                        // Remove this listener
                        ws.removeEventListener('message', authHandler);
                    }
                } catch (e) {
                    console.error('Auth handler error', e);
                }
            };

            ws.addEventListener('message', authHandler);
            ws.send(JSON.stringify(req));
        });
    },

    // Check Entry Logic - Called from testTickAnalysisMulti.html
    checkEntry: (symbol, analysisObj) => {
        if (!DerivTrader.isTradingGlobal) return;
        if (DerivTrader.isIdle) {
            // console.log(`[Trade] Idle mode is ON. Skipping check for ${symbol}`);
            return;
        }

        // If "Trade All Assets" is UNCHECKED, we should probably still trade the assets that the user manually selected?
        // The user said: "All Assets? หมายถึง ให้ตรวจในทุกแท่งเทียนที่เกิดใหม่" 
        // -> interpreting "Trade All Assets" as "Auto check every new candle for ALL selected assets".
        // If unchecked, does it mean manual only? 
        // Based on typical logic: "Trade All Assets" usually means enable auto-trading for the list.
        // If unchecked, we might stop auto-entry.
        // HOWEVER, let's assume if the user clicked START, they want to trade.
        // Let's stick to the checkbox value strictly.
        // Re-read settings live from DOM
        DerivTrader.updateSettings();

        // Ensure state exists
        if (!DerivTrader.symbolStates[symbol]) {
            DerivTrader.symbolStates[symbol] = {
                martingaleLevel: 0,
                activeContract: null
            };
        }

        const state = DerivTrader.symbolStates[symbol];

        // Don't enter if active contract exists
        if (state.activeContract) {
            console.log(`[Trade] ${symbol}: Skip - active contract exists`);
            return;
        }

        const statusCode = String(analysisObj.StatusCode);

        // Debug Log
        console.log(`[Trade] checkEntry: ${symbol} | StatusCode=${statusCode} | signalCall=[${DerivTrader.settings.signalCall}] | signalPut=[${DerivTrader.settings.signalPut}]`);

        // Check Signals
        let action = null;
        if (DerivTrader.settings.signalCall.includes(statusCode)) {
            action = 'CALL';
        } else if (DerivTrader.settings.signalPut.includes(statusCode)) {
            action = 'PUT';
        }

        if (action) {
            console.log(`✅ Signal Matched [${symbol}]: Code ${statusCode} -> ${action}`);
            DerivTrader.executeTrade(symbol, action);
        } else {
            console.log(`⏸️ [Trade] ${symbol}: StatusCode ${statusCode} not in signals. Idle.`);
        }
    },

    // Execute Trade
    executeTrade: (symbol, action) => {
        // Double check Idle status before execution to prevent race conditions
        if (DerivTrader.isIdle) {
            console.warn(`[Trade] Race condition prevented: Trade for ${symbol} blocked due to Idle.`);
            return;
        }

        const state = DerivTrader.symbolStates[symbol];

        // Calculate Stake
        let stake = 0;
        if (DerivTrader.settings.tradeType === 'fixed') {
            stake = DerivTrader.settings.fixedMoney;
        } else {
            // Martingale
            const steps = DerivTrader.settings.martingaleSteps;
            const level = state.martingaleLevel;
            if (level < steps.length) {
                stake = steps[level];
            } else {
                // Reset to first step if exceeded
                stake = steps[0];
                state.martingaleLevel = 0;
            }
        }

        const req = {
            proposal: 1,
            amount: stake,
            basis: 'stake',
            contract_type: action,
            currency: DerivTrader.settings.currency || 'USD',
            duration: DerivTrader.settings.duration,
            duration_unit: DerivTrader.settings.durationUnit,
            symbol: symbol,
            passthrough: {
                module: 'DerivTrader',
                symbol: symbol,
                action: action,
                stake: stake,
                martingaleLevel: state.martingaleLevel
            }
        };

        // We use req_id to track the PROPOSAL request
        const reqId = Date.now() + Math.floor(Math.random() * 1000);
        req.req_id = reqId;

        // Store context in map
        DerivTrader.proposalMap[reqId] = {
            symbol: symbol,
            action: action,
            stake: stake,
            martingaleLevel: state.martingaleLevel
        };

        console.log(`Placing Trade [${symbol}]: ${action} $${stake} (Step ${state.martingaleLevel})`);

        if (ws && ws.readyState === 1) {
            ws.send(JSON.stringify(req));
        }
    },

    // Track all contracts for the session
    contracts: [],
    updateUI: null, // Callback function to update UI (set from HTML)

    // Handle WebSocket Messages (Routing)
    handleMessage: (msg) => {
        if (!DerivTrader.isTradingGlobal) return;

        const data = JSON.parse(msg.data);

        // 1. Proposal Response
        if (data.msg_type === 'proposal') {
            const reqId = data.req_id;
            const context = DerivTrader.proposalMap[reqId];

            if (context) {
                if (data.error) {
                    console.error(`Proposal Error [${context.symbol}]:`, data.error.message);
                    delete DerivTrader.proposalMap[reqId];
                } else {
                    // Ready to Buy
                    const buyReq = {
                        buy: data.proposal.id,
                        price: data.proposal.ask_price,
                        passthrough: {
                            module: 'DerivTrader',
                            symbol: context.symbol,
                            action: context.action,
                            stake: context.stake,
                            martingaleLevel: context.martingaleLevel
                        }
                    };
                    ws.send(JSON.stringify(buyReq));
                    console.log(`[Trade] Buy Sent for ${context.symbol}`);
                    // We don't delete proposalMap yet, maybe we don't need it if we use passthrough
                    delete DerivTrader.proposalMap[reqId];
                }
            }
        }

        // 2. Buy Response
        if (data.msg_type === 'buy') {
            if (data.error) {
                console.error('Buy Error:', data.error.message);
                return;
            }

            // We need to know which symbol this is for.
            // We can assume we pass it via 'passthrough' if the API supports echoing it back.
            // Standard Deriv API echoes 'passthrough' in the response.

            const pt = data.echo_req.passthrough;
            if (pt && pt.module === 'DerivTrader') {
                const symbol = pt.symbol;
                const contractId = data.buy.contract_id;

                // Register Active Contract
                if (DerivTrader.symbolStates[symbol]) {
                    DerivTrader.symbolStates[symbol].activeContract = {
                        id: contractId,
                        startTime: data.buy.start_time,
                        stake: pt.stake,
                        action: pt.action,
                        martingaleLevel: pt.martingaleLevel,
                        buy_price: data.buy.buy_price,
                        payout: data.buy.payout,
                        symbol: symbol
                    };

                    // Add to global contracts list for Table
                    DerivTrader.contracts.push({
                        contract_id: contractId,
                        symbol: symbol,
                        contract_type: pt.action,
                        buy_price: data.buy.buy_price,
                        payout: data.buy.payout,
                        purchase_time: data.buy.start_time,
                        profit: 0,
                        status: 'open',
                        minProfit: 0,
                        maxProfit: 0
                    });

                    console.log(`Trade Active [${symbol}]: Contract ${contractId}`);

                    // Subscribe to updates for this contract
                    ws.send(JSON.stringify({
                        proposal_open_contract: 1,
                        contract_id: contractId,
                        subscribe: 1
                    }));

                    if (DerivTrader.updateUI) DerivTrader.updateUI();
                }
            }
        }

        // 3. Contract Update (proposal_open_contract)
        if (data.msg_type === 'proposal_open_contract') {
            const poc = data.proposal_open_contract;
            let targetSymbol = null;

            // 1. Update in global list and find symbol
            const contract = DerivTrader.contracts.find(c => c.contract_id === poc.contract_id);
            if (contract) {
                contract.profit = poc.profit;
                contract.expiry_time = poc.expiry_time;
                contract.is_sold = poc.is_sold;
                contract.bid_price = poc.bid_price;
                contract.current_spot = poc.current_spot;

                // Track Min/Max
                if (contract.profit > contract.maxProfit) contract.maxProfit = contract.profit;
                if (contract.profit < contract.minProfit) contract.minProfit = contract.profit;

                if (poc.is_sold) {
                    contract.status = poc.profit >= 0 ? 'won' : 'lost';
                }

                // We know the symbol from our records
                targetSymbol = contract.symbol;
            } else {
                // Fallback: Find who owns this contract by scanning states
                for (const sym in DerivTrader.symbolStates) {
                    const state = DerivTrader.symbolStates[sym];
                    if (state.activeContract && state.activeContract.id == poc.contract_id) {
                        targetSymbol = sym;
                        break;
                    }
                }
            }

            // 2. Clear Active State if Sold
            if (poc.is_sold && targetSymbol) {
                const state = DerivTrader.symbolStates[targetSymbol];

                // Check if this symbol actually has this active contract
                if (state && state.activeContract && state.activeContract.id == poc.contract_id) {
                    const profit = poc.profit;
                    const status = profit >= 0 ? 'WIN' : 'LOSS';

                    console.log(`Trade Finished [${targetSymbol}]: ${status} (${profit})`);

                    // Martingale Logic
                    if (DerivTrader.settings.tradeType === 'martingale') {
                        if (status === 'WIN') {
                            state.martingaleLevel = 0; // Reset
                        } else {
                            state.martingaleLevel++; // Increase Step
                        }
                        console.log(`[${targetSymbol}] Next Martingale Level: ${state.martingaleLevel}`);
                    }

                    // Clear State - CRITICAL for next trade
                    state.activeContract = null;
                    console.log(`[Trade] ${targetSymbol}: State cleared. Ready for next trade.`);

                    // Update Session Profit UI (REALIZED Profit only)
                    if (typeof window.updateSessionProfit === 'function') {
                        window.updateSessionProfit(profit);
                    }
                }
            }

            // Always update UI on POC update to show real-time profit
            if (DerivTrader.updateUI) DerivTrader.updateUI();
        }
    }
};

// Auto-init if document ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', DerivTrader.init);
} else {
    DerivTrader.init();
}
