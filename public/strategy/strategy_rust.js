// ============================================================
//  strategy_rust.js — Version Rust (WebSocket)
//  รับ AnalysisResult จาก Rust Server ผ่าน WebSocket
//  เหมาะกับ Production / Dashboard / Multi-client
// ============================================================

class StrategyRust {
    constructor() {
        this.ws = null;
        this.ready = false;
        this.onSignal = null;
        this.onAnalysis = null;
        this.onConnectionChange = null; // callback(status)
        this.reconnectInterval = 3000;
        this._serverUrl = "";
    }

    /**
     * เชื่อมต่อ Rust WebSocket Server
     * @param {string} serverUrl - เช่น "ws://localhost:3000/ws"
     */
    connect(serverUrl) {
        this._serverUrl = serverUrl;
        this._initWebSocket();
    }

    _initWebSocket() {
        this.ws = new WebSocket(this._serverUrl);

        this.ws.onopen = () => {
            this.ready = true;
            console.log("✅ [Rust] เชื่อมต่อ Server สำเร็จ:", this._serverUrl);
            if (this.onConnectionChange) this.onConnectionChange("connected");
        };

        this.ws.onclose = () => {
            this.ready = false;
            console.warn("⚠️ [Rust] การเชื่อมต่อขาด — จะลองใหม่ใน", this.reconnectInterval, "ms");
            if (this.onConnectionChange) this.onConnectionChange("disconnected");
            setTimeout(() => this._initWebSocket(), this.reconnectInterval);
        };

        this.ws.onerror = (err) => {
            console.error("❌ [Rust] WebSocket Error:", err);
            if (this.onConnectionChange) this.onConnectionChange("error");
        };

        this.ws.onmessage = (event) => {
            this._handleMessage(event.data);
        };
    }

    /**
     * จัดการข้อความจาก Server
     */
    _handleMessage(rawData) {
        let msg;
        try {
            msg = JSON.parse(rawData);
        } catch (e) {
            return; // ข้อมูลที่ไม่ใช่ JSON — ข้ามไป
        }

        // Rust Server ส่ง analysis_data ที่มี AnalysisResult เต็มรูปแบบ
        if (msg.type === "analysis_data" && msg.data) {
            const analysis = msg.data;

            if (this.onAnalysis) this.onAnalysis(analysis);

            // ประเมินกลยุทธ์
            const signal = evaluateAllStrategies(analysis);
            signal.choppy_zone = getChoppyZone(analysis.choppy_indicator);
            signal.risk = calculateRisk(analysis);
            signal.source = "rust_server";

            if (this.onSignal) this.onSignal(signal);

            // ถ้ามีสัญญาณ → ส่งคำสั่งกลับไปให้ Server
            if (signal.action !== "WAIT") {
                this.sendTradeCommand(signal.action, signal.strategy);
            }
        }
    }

    /**
     * สั่งเริ่มเชื่อมต่อ Deriv API
     */
    startDeriv(token) {
        if (!this.ready) return console.warn("[Rust] ยังไม่เชื่อมต่อ Server");
        this.ws.send(JSON.stringify({ command: "START_DERIV", token }));
        console.log("📡 [Rust] สั่ง START_DERIV");
    }

    /**
     * ส่งคำสั่งเทรด
     */
    sendTradeCommand(action, strategy) {
        if (!this.ready) return;
        this.ws.send(JSON.stringify({
            command: "TRADE",
            action: action,   // "CALL" หรือ "PUT"
            strategy: strategy
        }));
        console.log(`📤 [Rust] ส่งออเดอร์ ${action} (${strategy})`);
    }

    /**
     * อัปเดต Trade Mode
     */
    updateMode(mode) {
        if (!this.ready) return;
        this.ws.send(JSON.stringify({ command: "UPDATE_MODE", mode }));
    }

    /**
     * ตัดการเชื่อมต่อ
     */
    disconnect() {
        this.reconnectInterval = 999999; // หยุด reconnect
        if (this.ws) this.ws.close();
        this.ready = false;
        console.log("🔌 [Rust] ตัดการเชื่อมต่อ");
    }
}

// Helper
function getChoppyZone(choppy) {
    const c = choppy || 100;
    if (c < 38.2) return "A_StrongTrend";
    if (c < 50) return "B_ModerateTrend";
    if (c <= 61.8) return "C_Transition";
    return "D_Sideways";
}

// ============================================================
//  ตัวอย่างการใช้งาน
// ============================================================
/*
<script src="strategy_engine.js"></script>
<script src="strategy_rust.js"></script>
<script>
    const bot = new StrategyRust();

    // ตั้ง callback
    bot.onSignal = (signal) => {
        console.log(`[${signal.choppy_zone}] ${signal.action} → ${signal.strategy}`);
        updateDashboard(signal);
    };

    bot.onAnalysis = (analysis) => {
        updateChart(analysis); // อัปเดตกราฟ Lightweight Charts
    };

    bot.onConnectionChange = (status) => {
        document.getElementById("status").textContent = status;
    };

    // เชื่อมต่อ
    bot.connect("ws://localhost:3000/ws");

    // เริ่มเทรดเมื่อพร้อม
    setTimeout(() => bot.startDeriv("YOUR_DERIV_TOKEN"), 1000);
</script>
*/
