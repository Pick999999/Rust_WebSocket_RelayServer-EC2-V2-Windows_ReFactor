// ============================================================
// strategy_cpu_worker.js
// ตัวจำลอง Wrapper คล้ายกับ strategy_cpu.js เดิม
// แต่ทำหน้าที่เชื่อมต่อและส่งงานไปให้ Web Worker ประมวลผล
// ============================================================

class StrategyCPUWorker {
    constructor() {
        this.worker = null;
        this.ready = false;
        this.onSignal = null;
        this.onAnalysis = null;
        // แทร็กการรับกลับของ Promise หากจำเป็น
        this.pendingResolves = {};
    }

    /**
     * สตาร์ท Worker และเชื่อมโยง
     * @param {string} workerUrl - path ไปหา worker script
     */
    async setup(workerUrl, wasmPath, options) {
        return new Promise((resolve, reject) => {
            // สร้าง Worker แบบ Module เพื่อให้สามารถ import WASM (.js) ได้
            this.worker = new Worker(workerUrl, { type: "module" });

            this.worker.onmessage = (e) => {
                const data = e.data;

                if (data.type === 'INIT_SUCCESS') {
                    this.ready = true;
                    console.log("✅ [CPU_Worker] เริ่มทำงานสมบูรณ์");
                    resolve(true);
                }
                else if (data.type === 'TICK_RESULT') {
                    if (this.onAnalysis) this.onAnalysis(data.analysis);
                    if (this.onSignal) this.onSignal(data.signal);
                }
                else if (data.type === 'ERROR') {
                    console.error("❌ [CPU_Worker ERROR]:", data.error);
                    reject(data.error);
                }
                // จัดการประเภทคำตอบอื่นๆ เช่น HISTORY_LOADED
            };

            // โยนคำสั่งให้ตั้งไข่
            this.worker.postMessage({
                type: 'INIT',
                wasmPath: wasmPath,
                options: options
            });
        });
    }

    loadHistory(candles) {
        if (!this.ready) throw new Error("Worker ยังไม่พร้อมใช้งาน");
        this.worker.postMessage({
            type: 'LOAD_HISTORY',
            candles: candles
        });
        console.log(`📡 [CPU_Worker] สางประวัติแท่งเทียน ${candles.length} แท่ง ไปให้ Worker`);
    }

    onTick(price, time) {
        if (!this.ready) return;

        // ส่งเฉพาะข้อมูลดิบไปให้ Worker เพื่อลด Payload (ไม่ต้องส่งทั้ง Class)
        this.worker.postMessage({
            type: 'PROCESS_TICK',
            price: price,
            time: time
        });
    }

    updateOptions(newOptions, currentCandles) {
        if (!this.ready) return;
        this.worker.postMessage({
            type: 'UPDATE_OPTIONS',
            options: newOptions,
            candles: currentCandles
        });
    }
}
