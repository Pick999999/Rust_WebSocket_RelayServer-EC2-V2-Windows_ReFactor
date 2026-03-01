# Plan: Transforming `indicatorMath_ULTRA_Rust` into WebAssembly (Wasm) for CPU

แผนแม่บทฉบับนี้จัดทำขึ้นเพื่อเตรียมความพร้อมวิวัฒนาการในการกระโดดข้ามจากระบบฝั่ง Server สู่หน้าบ้าน (Frontend) โดยตั้งเป้ารองรับการประมวลผลบน **CPU ปกติ** ผ่าน WebAssembly

---

## ⚡ กลยุทธ์การประมวลผลแบบขนาน (Parallelism Strategy) ในหน้าเว็บ
เนื่องจาก WebAssembly รันในเบราว์เซอร์ที่มีข้อจำกัดด้าน Thread เราจึงมีแนวทาง:

**วิธีมาตรฐาน: ใช้ Web Workers (สำหรับงานบน CPU)**
มอบหมายให้ JavaScript เป็นผู้สร้าง `Web Workers` แล้วแบ่งโหลดให้แต่ละ Worker โหลดไฟล์ Wasm ไปรันแยกกัน เช่น แบ่งให้ Worker A คำนวณ 10 เหรียญ Worker B คำนวณอีก 10 เหรียญ วิธีนี้เสถียรที่สุด ใช้ง่าย และเบราว์เซอร์ทุกเจ้าในตลาดรองรับ 100%

---

## 🎯 Phase 1: Wasm For CPU (นำสิ่งที่สร้างไว้ไปสู่ผู้ใช้ทันที)
**ความยาก: 🟢 ต่ำ-ปานกลาง** | **เป้าหมาย:** นำลอจิกคณิตศาสตร์และการประมวลผล Tick/Candle แบบปัจจุบัน ไปฝังลงในหน้าเว็บโดยให้ Browser (JS) เรียกใช้งานได้โดยตรง

### เครื่องมือที่ต้องใช้ (Tech Stack):
- `wasm-pack` (เครื่องมือช่วย Build)
- `wasm-bindgen` (คู่หูที่ช่วยแปลง Rust Struct/Function เป็น JavaScript Interface)

### ขั้นตอนการดำเนินงาน:
1. **เตรียม `Cargo.toml` ใหม่:**
   เพิ่ม Setting บอก Compiler ให้รู้ว่านี่จะเป็นไลบรารีแบบ Dynamic สำหรับแปลงเป็นระบบอื่น:
   ```toml
   [lib]
   crate-type = ["cdylib", "rlib"]

   [dependencies]
   wasm-bindgen = "0.2"
   ```
2. **สร้าง Wasm Wrapper API:**
   ครอบฟังก์ชันและ Struct ที่มีอยู่ด้วยมาโคร `#[wasm_bindgen]` เพื่อให้ฝั่ง JavaScript มองเห็นและเรียกใช้ตัวแปรต่างๆ ของ Rust ได้ เช่น:
   ```rust
   use wasm_bindgen::prelude::*;

   #[wasm_bindgen]
   pub struct WasmAnalysisGenerator {
       internal: AnalysisGenerator,
   }

   #[wasm_bindgen]
   impl WasmAnalysisGenerator {
       #[wasm_bindgen(constructor)]
       pub fn new(...) -> WasmAnalysisGenerator { ... }

       pub fn append_tick(&mut self, price: f64, time: u64) -> JsValue { ... }
   }
   ```
3. **จัดโครงสร้างระบบ (Re-architecture):**
   - **หยุด** ให้ Rust เป็นตัวดึง WebSocket ตรงๆ เนื่องจากในโลกหน้าเว็บเบราว์เซอร์ การจัดการคิว Network ทำบน JS จะเสถียรและราบรื่นกว่า 
   - ให้ฝั่ง **JavaScript/TypeScript** เป็นผู้รับผิดชอบการต่อคิวเว็บซ็อกเก็ต `wss://...` แล้วโยนเพียงกระแสข้อมูลราคา (Tick Data) เข้าสู่ท่อ Wasm ฟังก์ชัน `append_tick` ให้ Rust คายผลลัพธ์อินดิเคเตอร์ออกมาโชว์ขึ้นกราฟแทน
