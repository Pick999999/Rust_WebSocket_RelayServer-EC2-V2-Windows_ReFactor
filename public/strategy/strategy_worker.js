// ============================================================
// strategy_worker.js — Web Worker สำหรับประมวลผล WASM (CPU/GPU) แยกจาก Main Thread
// โหลด WASM และทำงานประมวลผล Tick, History, และ กลยุทธ์
// ============================================================

import './strategy_engine.js'; // ต้องมี evaluateAllStrategies, getChoppyZone, calculateRisk

let wasmModule = null;
let generator = null;
let options = {};
let isReady = false;

// รับข้อความจาก Main Thread
self.onmessage = async function (e) {
    const data = e.data;

    switch (data.type) {
        case 'INIT':
            try {
                // Initialize WASM
                // เนื่องจากใน Web Worker ที่ใช้ importScripts กับ ES module WASM 
                // อาจจะต้องใช้ wasm_bindgen ที่ build เป็น no-modules หรือดึงจากไฟล์ JS ที่กำหนด

                // สำหรับ project นี้ (อ้างอิงจาก multi_monitor.html) จะใช้ ES module import
                // แต่กลไก Worker บางตัวถ้าไม่ได้รันเป็น module type อาจจะโหลดตรงๆ ลำบาก
                // ขอใช้วิธี import แบบ module ถ้ารองรับ (ขึ้นกับวิธีเรียก Worker new Worker(..., { type: "module" }))

                // สมมติฐานคือเราจะรัน Worker นี้ด้วย { type: "module" } เพื่อรองรับ import
                const wasmPath = data.wasmPath || '../../RustLib/indicator_math/wasm_dist/indicatorMath_ULTRA_Rust.js';
                const wasm = await import(wasmPath);
                await wasm.default(); // init WASM instance

                wasmModule = wasm;

                options = {
                    ema1_period: 20, ema1_type: "EMA",
                    ema2_period: 50, ema2_type: "EMA",
                    ema3_period: 200, ema3_type: "EMA",
                    atr_period: 14, atr_multiplier: 2.0,
                    bb_period: 20, ci_period: 14, adx_period: 14, rsi_period: 14,
                    flat_threshold: 0.2, macd_narrow: 0.15,
                    ...data.options
                };

                generator = new wasmModule.WasmAnalysisGenerator(JSON.stringify(options));
                isReady = true;

                self.postMessage({ type: 'INIT_SUCCESS', message: 'WASM AnalysisGenerator in Worker พร้อมใช้งาน' });
            } catch (err) {
                self.postMessage({ type: 'ERROR', error: 'Init WASM failed: ' + err.message });
            }
            break;

        case 'LOAD_HISTORY':
            if (!isReady) {
                self.postMessage({ type: 'ERROR', error: 'Worker not ready when calling LOAD_HISTORY' });
                return;
            }
            try {
                // โหลดแท่งเทียนย้อนหลังทั้งหมดทีเดียวเข้าไปสร้างสถานะตั้งต้น
                generator.initialize(JSON.stringify(data.candles));
                self.postMessage({ type: 'HISTORY_LOADED', count: data.candles.length });
            } catch (err) {
                self.postMessage({ type: 'ERROR', error: 'Load history failed: ' + err.message });
            }
            break;

        case 'PROCESS_TICK':
            if (!isReady) return;
            try {
                // ให้ WASM คำนวณ (แปลง time เป็น BigInt ตามที่ Rust/WASM ต้องการ)
                const analysis = generator.append_tick(data.price, BigInt(data.time));
                if (!analysis) return;

                // ประเมินกลยุทธ์จาก strategy_engine.js
                const signal = self.evaluateAllStrategies(analysis);
                signal.choppy_zone = getChoppyZone(analysis.choppy_indicator);
                signal.risk = self.calculateRisk(analysis);

                // ส่งคืนผลลัพธ์กลับไปยัง Main Thread
                self.postMessage({
                    type: 'TICK_RESULT',
                    price: data.price,
                    time: data.time,
                    analysis: analysis,
                    signal: signal
                });
            } catch (err) {
                self.postMessage({ type: 'ERROR', error: 'Process tick failed: ' + err.message });
            }
            break;

        case 'UPDATE_OPTIONS':
            if (!isReady) return;
            try {
                options = { ...options, ...data.options };
                // ต้องล้าง generator เก่าและสร้างใหม่เมื่อเปลี่ยน Options (ตามสถาปัตยกรรมเดิม)
                if (generator) generator.free();
                generator = new wasmModule.WasmAnalysisGenerator(JSON.stringify(options));

                if (data.candles && data.candles.length > 0) {
                    generator.initialize(JSON.stringify(data.candles));
                }

                self.postMessage({ type: 'OPTIONS_UPDATED' });
            } catch (err) {
                self.postMessage({ type: 'ERROR', error: 'Update options failed: ' + err.message });
            }
            break;
    }
};

// Helper: บอกโซน Choppy (จำลองมาจาก strategy_cpu.js กรณีที่ไม่ได้ส่งมาจาก strategy_engine.js โดยตรง)
function getChoppyZone(choppy) {
    const c = choppy || 100;
    if (c < 38.2) return "A_StrongTrend";
    if (c < 50) return "B_ModerateTrend";
    if (c <= 61.8) return "C_Transition";
    return "D_Sideways";
}
