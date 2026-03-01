/**
 * Configuration Manager for Trading Application
 * จัดการค่าเริ่มต้นและการสื่อสารระหว่างหน้าเว็บ
 * บันทึกลงไฟล์ config.json ผ่าน API แทน localStorage
 */

const CONFIG_API_URL = '/api/trading-config';

// ค่าเริ่มต้น (Default Values)
const DEFAULT_CONFIG = {
    // 0. Username
    username: 'default',

    // 1. Asset List - รายการสินทรัพย์
    assetList: [
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

    // 2. Default Asset - สินทรัพย์เริ่มต้น
    defaultAsset: 'R_10',

    // 3. Start Money Trade - เงินเริ่มต้นสำหรับเทรด
    startMoneyTrade: 100,

    // 4. Money Martingale - ลำดับเงินสำหรับ Martingale
    moneyMartinGale: [1, 2, 6, 8, 16, 54, 162],

    // 5. Trade Type - ประเภทการเทรด
    tradeTypes: ['FixTrade', 'MartinGaleTrade'],
    selectedTradeType: 'FixTrade',

    // 6. Target Money - เป้าหมายเงิน
    targetMoney: 1000,

    // 7. EMA Settings - ค่า EMA
    emaShortType: 'ema',
    emaShortPeriod: 3,
    emaMediumType: 'ema',
    emaMediumPeriod: 8,
    emaLongType: 'ema',
    emaLongPeriod: 21,

    // 8. Thresholds - ค่า Threshold สำหรับแต่ละ asset
    thresholds: []
};

// BroadcastChannel สำหรับการสื่อสารระหว่างหน้าเว็บ
const configChannel = new BroadcastChannel('trading_config_channel');

/**
 * ConfigManager - จัดการการโหลด/บันทึก/อัพเดตค่า
 * ใช้ API สำหรับบันทึก/โหลดค่าจากไฟล์ config.json
 */
class ConfigManager {
    constructor() {
        this.config = { ...DEFAULT_CONFIG };
        this.listeners = [];
        this.isLoading = false;
        this.setupChannelListener();
    }

    /**
     * Initialize - โหลดค่าจาก API
     */
    async initialize() {
        await this.loadFromAPI();
        return this.config;
    }

    /**
     * โหลดค่าจาก API (config.json)
     */
    async loadFromAPI() {
        if (this.isLoading) return this.config;
        this.isLoading = true;

        try {
            const response = await fetch(CONFIG_API_URL);
            if (response.ok) {
                const serverConfig = await response.json();
                // Merge กับ DEFAULT_CONFIG เพื่อให้แน่ใจว่ามี property ครบ
                this.config = { ...DEFAULT_CONFIG, ...serverConfig };
                console.log('✅ Config loaded from server:', this.config);
            } else {
                console.warn('⚠️ Failed to load config from API, using defaults');
                this.config = { ...DEFAULT_CONFIG };
            }
        } catch (error) {
            console.error('❌ Error loading config from API:', error);
            this.config = { ...DEFAULT_CONFIG };
        }

        this.isLoading = false;
        return this.config;
    }

    /**
     * โหลดค่าจาก API (sync wrapper)
     */
    loadConfig() {
        // Return current config synchronously
        // For actual API load, use initialize() or loadFromAPI()
        return { ...this.config };
    }

    /**
     * บันทึกค่าลง API (config.json) และแจ้งหน้าอื่นๆ
     */
    async saveConfigAsync(newConfig = this.config) {
        try {
            this.config = { ...this.config, ...newConfig };

            const response = await fetch(CONFIG_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(this.config)
            });

            if (response.ok) {
                const result = await response.json();

                // แจ้งหน้าอื่นๆ ผ่าน BroadcastChannel
                configChannel.postMessage({
                    type: 'CONFIG_UPDATED',
                    config: this.config,
                    timestamp: Date.now()
                });

                // เรียก local listeners
                this.notifyListeners();

                console.log('✅ Config saved to server:', result);
                return true;
            } else {
                console.error('❌ Failed to save config to API');
                return false;
            }
        } catch (error) {
            console.error('❌ Error saving config to API:', error);
            return false;
        }
    }

    /**
     * บันทึกค่า (sync wrapper - returns Promise)
     */
    saveConfig(newConfig = this.config) {
        // For backwards compatibility, return immediately but trigger async save
        this.saveConfigAsync(newConfig);
        return true;
    }

    /**
     * รีเซ็ตเป็นค่าเริ่มต้น
     */
    async resetToDefault() {
        this.config = { ...DEFAULT_CONFIG };
        await this.saveConfigAsync();
        return this.config;
    }

    /**
     * ดึงค่า config ปัจจุบัน
     */
    getConfig() {
        return { ...this.config };
    }

    /**
     * ดึงค่าเฉพาะ key
     */
    get(key) {
        return this.config[key];
    }

    /**
     * ตั้งค่าเฉพาะ key
     */
    set(key, value) {
        this.config[key] = value;
        this.saveConfigAsync();
    }

    /**
     * ลงทะเบียน listener เมื่อ config เปลี่ยน
     */
    onConfigChange(callback) {
        if (typeof callback === 'function') {
            this.listeners.push(callback);
        }
    }

    /**
     * เอา listener ออก
     */
    removeListener(callback) {
        this.listeners = this.listeners.filter(cb => cb !== callback);
    }

    /**
     * แจ้ง listeners ทั้งหมด
     */
    notifyListeners() {
        this.listeners.forEach(callback => {
            try {
                callback(this.config);
            } catch (error) {
                console.error('Error in config listener:', error);
            }
        });
    }

    /**
     * ตั้งค่า listener สำหรับ BroadcastChannel
     */
    setupChannelListener() {
        configChannel.onmessage = (event) => {
            if (event.data.type === 'CONFIG_UPDATED') {
                console.log('📡 Config update received from another page');
                this.config = event.data.config;
                this.notifyListeners();
            }
        };
    }

    /**
     * ดึง asset list เฉพาะ symbols
     */
    getAssetSymbols() {
        return this.config.assetList.map(a => a.symbol);
    }

    /**
     * ดึงชื่อ asset จาก symbol
     */
    getAssetName(symbol) {
        const asset = this.config.assetList.find(a => a.symbol === symbol);
        return asset ? asset.name : symbol;
    }

    /**
     * ดึง martingale amount ตาม step
     */
    getMartingaleAmount(step) {
        const amounts = this.config.moneyMartinGale;
        if (step < 0) return amounts[0];
        if (step >= amounts.length) return amounts[amounts.length - 1];
        return amounts[step];
    }

    /**
     * ดึง threshold สำหรับ asset
     */
    getThreshold(asset) {
        return this.config.thresholds.find(t => t.asset === asset) || null;
    }

    /**
     * ตั้งค่า threshold สำหรับ asset
     */
    setThreshold(asset, macd12, macd23, slopeValue) {
        const existing = this.config.thresholds.findIndex(t => t.asset === asset);
        const newThreshold = { asset, macd12, macd23, slopeValue };

        if (existing >= 0) {
            this.config.thresholds[existing] = newThreshold;
        } else {
            this.config.thresholds.push(newThreshold);
        }

        this.saveConfigAsync();
    }

    /**
     * ลบ threshold สำหรับ asset
     */
    removeThreshold(asset) {
        this.config.thresholds = this.config.thresholds.filter(t => t.asset !== asset);
        this.saveConfigAsync();
    }
}

// สร้าง instance เดียวสำหรับใช้ทั้ง application
const configManager = new ConfigManager();

// Export สำหรับใช้งาน
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ConfigManager, configManager, DEFAULT_CONFIG };
}
