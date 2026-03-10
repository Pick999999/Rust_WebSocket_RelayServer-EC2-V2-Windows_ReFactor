# คู่มือการใช้งาน Indicator Math (WASM - GPU Acceleration)

โมดูลนี้ออกแบบมาเพื่อการประมวลผลอินดิเคเตอร์เชิงคณิตศาสตร์ (เช่น SMA) สำหรับข้อมูลหน้าจอจำนวนมหาศาล (เช่น 1,000,000 แท่ง/ราคา) โดยปัดภาระไปใช้การ์ดจอผ่าน **WebGPU (Compute Shaders)** แทนการใช้ CPU ของเบราว์เซอร์ ซึ่งทำความเร็วระดับสุดยอด (น้อยกว่า 1 วินาทีต่อล้านรายการ)

---

## 🛠️ 1. ขั้นตอนการติดตั้งและการเตรียมใช้งาน (Setup)

1. **คอมไพล์ Rust เป็น Wasm (มี wgpu รวมอยู่ด้วย):**
   เปิด Terminal ไปที่โฟลเดอร์โปรเจกต์ (`indicator_math`) แล้วรันคำสั่ง:
   ```bash
   wasm-pack build --target web --out-dir wasm_dist
   ```
2. **รันบน Web Server:** 
   เช่นเดียวกับ Wasm ทั่วไป ห้ามเปิดไฟล์ `html` ตรงๆ จากโปรแกรม File Explorer ต้องรันผ่าน Web Server แนะนำให้ใช้ Live Server extension บน VS Code หรือคำสั่ง `python -m http.server 5500`

3. **เตรียม WebGPU Polyfill ฝั่งเบราว์เซอร์:**
   เพื่อไม่ให้เกิด Error `OperationError: Failed to execute 'requestDevice'` เกี่ยวกับ `maxInterStageShaderComponents` ในเบราว์เซอร์ใหม่ๆ กรุณาวาง Polyfill ดักไว้ก่อนโหลด

   ```javascript
   if (navigator.gpu) {
       const originalRequestDevice = GPUAdapter.prototype.requestDevice;
       GPUAdapter.prototype.requestDevice = function(descriptor) {
           if (descriptor && descriptor.requiredLimits && "maxInterStageShaderComponents" in descriptor.requiredLimits) {
               descriptor.requiredLimits["maxInterStageShaderVariables"] = descriptor.requiredLimits["maxInterStageShaderComponents"];
               delete descriptor.requiredLimits["maxInterStageShaderComponents"];
           }
           return originalRequestDevice.call(this, descriptor);
       };
   }
   
   // Load WASM
   import init, { GpuAnalysisManager } from './wasm_dist/indicatorMath_ULTRA_Rust.js';
   await init(); 
   ```

4. **ตรวจเช็คเบราว์เซอร์ (สำคัญมาก):** 
   ใช้งานผ่านทาง Chrome 113+, Edge 113+ หรือ Brave เท่านั้น Safari และ Firefox ยังไม่รองรับ 100%

---

## 📐 2. โครงสร้างข้อมูลขาเข้า (Input)

WebGPU ไม่รับข้อมูลเป็น JSON Array ทั่วไปแบบ CPU เพราะส่งช้า แต่จะรับเป็น Byte Array ตรงๆ ของฝั่ง JavaScript คือโครงสร้างข้อมูลประเภท `Float32Array`

*   **Prices (ข้อมูลราคาทั้งหมด):** อาเรย์เก็บตัวเลขจำนวนจริง `32-bit Float`
```javascript
const dataSize = 1000000; // สร้างชุดข้อมูล 1 ล้าน record
const prices = new Float32Array(dataSize);

// สมมติ: ทำการลูปยัดราคาแท่งเทียนที่ต้องการให้คำนวณพร้อมกันลงไป
prices[0] = 100.2;
prices[1] = 100.5;
// ...
```

---

## ⚡ 3. วิธีเรียกใช้ฟังก์ชัน (Functions)

การควบคุมต้องทำแบบอะซิงโครนัส (Asynchronous / `await`) ทั้งหมด เพราะต้องสั่งผ่าน API ชั้นล่างไปยัง VRAM

```javascript
// 1. ตรวจสอบว่าเครื่องมี WebGPU ไหม?
if (!navigator.gpu) { console.error("WebGPU Not Supported"); }

// 2. เรียกใช้งาน Adapter และ Device (เปิดช่องทางคุยกับการ์ดจอ)
const gpuManager = await GpuAnalysisManager.initialize();

// 3. ยิงข้อมูลขนาดใหญ่ใส่การ์ดจอ ให้ Compute Shader คำนวณรวดเดียว
const result = await gpuManager.dispatch_compute(prices); // <--- Input prices ต้องเป็น Float32Array
```

---

## 📊 4. โครงสร้างข้อมูลขาออก (Output)

ผลลัพธ์จาก `dispatch_compute` จะเด้งกลับมาหา JavaScript เป็น **`Float32Array`** ชุดใหม่ที่มีขนาดข้อมูล (Length) เท่ากับ Array ที่คุณส่งไปตอนแรก (ตัวอย่างคือ 1 ล้านก้อน) ซึ่งทุกช่องนั้นถูกคำนวณอินดิเคเตอร์ผ่าน GPU เสร็จสิ้นแล้วทั้งหมด

```javascript
// ดึงข้อมูลออกหน้าจอ
console.log(result); // [0.0, 0.0, ..., 99.9187, 99.9059, 99.8939, ...]

// อ้างอิงอินเด็กซ์ตรงกับ Input ฝั่งขาเข้าเป๊ะๆ (เช่น อิงจุดที่ 200,000)
console.log(`SMA 20 ของแท่งที่แสน: ${result[100000]}`); 
```
