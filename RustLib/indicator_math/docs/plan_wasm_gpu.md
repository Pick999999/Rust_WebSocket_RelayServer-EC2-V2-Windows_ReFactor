# Plan: Transforming `indicatorMath_ULTRA_Rust` into WebAssembly (Wasm) for GPU

แผนแม่บทฉบับนี้จัดทำขึ้นเพื่อเตรียมความพร้อมวิวัฒนาการในการกระโดดข้ามจากระบบฝั่ง Server สู่หน้าบ้าน (Frontend) โดยตั้งเป้ารองรับการประมวลผลบน **การ์ดจอ (GPU)** บนเว็บทิพย์ผ่าน WebAssembly

---

## ⚡ กลยุทธ์การประมวลผลแบบขนาน (Parallelism Strategy)

**ข้ามขีดจำกัด: ใช้ WebGPU (สำหรับการคำนวณมหาศาลข้ามโลก)**
หากโปรเจคใหญ่ถึงขั้นจะประมวลผล 1,000 คู่เหรียญพร้อมกันในหน้าจอเดียว เราจะไม่พึ่ง CPU แล้ว แต่จะเขียนอัลกอริทึมส่งตรงเข้า **การ์ดจอ (GPU)** เพื่อทำขนานแบบ Parallel Array ให้จบในเสี้ยววินาที

---

## 🚀 Phase 2: Wasm For GPU (รีดเร้นพลังกราฟิก พลิกอุตสาหกรรมการคำนวณ)
**ความยาก: 🔴 สูง** | **เป้าหมาย:** นำการคำนวณแท่งเทียนลึกลงระดับ 10,000 แท่งพร้อมกัน หรือกว่า 1,000 คู่เหรียญ (ฉบับ Batch Array) โยนเข้าการ์ดจอผู้เล่นให้จบใน 1 มิลลิวินาที

แทนที่จะวนลูปทำทีละตัว หรือพึ่ง CPU ที่มีคอร์จำกัด เราจะใช้เทคโนโลยี **WebGPU**

### เครื่องมือที่ต้องใช้ (Tech Stack):
- `wgpu` (WebGPU implementation ใน Rust)
- `WGSL` (WebGPU Shading Language - ภาษาสำหรับคุยกับ GPU)

### ขั้นตอนการดำเนินงาน:
1. **วิเคราะห์สิ่งที่ควรลง GPU:**
   - แบบ "เรียลไทม์ 1 Tick ล่าสุด" (Incremental) **ไม่เหมาะสม** กับ GPU เพราะการรับส่งตัวเลข 1 ตัวระหว่า CPU/GPU จะมีคอขวด 
   - การคำนวณประวัติศาสตร์แบบหลายพันแท่ง (History Batching เช่น ดึงประวัติมาย้อนหลังเปิดจอเทรด) คือจุดที่ **สมบูรณ์แบบ**
2. **เขียน Compute Shaders (WGSL):**
   แปลงสูตรคณิตศาสตร์ก้อนโตจาก Rust (อย่าง EMA, RSI, Bollinger Bands) ไปเป็นภาษา Shader เช่น:
   ```wgsl
   @group(0) @binding(0) var<storage, read> prices: array<f32>;
   @group(0) @binding(1) var<storage, read_write> ema_result: array<f32>;

   @compute @workgroup_size(64)
   fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
       let curr_idx = global_id.x;
       // ... ลอจิกการทอนน้ำหนักแบบขนานอิสระ ... 
   }
   ```
3. **จัดตั้ง GPGPU Pipeline ใน Rust (`wgpu`):**
   - เขียนโค้ด Rust ส่งอาร์เรย์ OHLC เข้าไปใน GPU Buffer Memory
   - สั่งให้เกิดการบรรจุงาน (Dispatch Compute Workgroups) ตามจำนวนข้อมูลที่มี
   - ดูดผลลัพธ์ตาราง EMA, RSI ก้อนมหึมากลับมาในเสี้ยววิ
