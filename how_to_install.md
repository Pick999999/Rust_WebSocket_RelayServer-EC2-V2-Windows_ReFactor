# 🚀 วิธีติดตั้ง Trading Bot (WASM) บน Shared Host (PHP/Apache)

เอกสารนี้รวบรวมขั้นตอนการเตรียมไฟล์ โครงสร้างโฟลเดอร์ และวิธีคอนฟิกเซิร์ฟเวอร์เพื่อให้ WebAssembly (WASM) และ Web Worker ของโปรเจกต์ Trading Bot นี้ สามารถทำงานบน Shared Hosting ทั่วไปได้อย่างสมบูรณ์

---

## 📂 1. โครงสร้างโฟลเดอร์สำหรับอัปโหลดขึ้นโฮสต์

เพื่อความง่ายในการนำไปใช้งานจริงบนโฮสต์ แนะนำให้ **รวมไฟล์ทั้งหมดไว้ในระดับเดียวกัน (Root folder)** ของเว็บไซต์เลย (เช่นใน `public_html` หรือเว็บไดเรกทอรีหลัก)

ไฟล์ที่ต้องนำไปอัปโหลดมีทั้งหมดดังนี้:

```text
public_html/
 │
 ├── index.html                   <-- เปลี่ยนชื่อจาก multi_monitor.html เป็น index.html เพื่อใช้เป็นหน้าเว็บแรก
 │
 ├── strategy_engine.js           <-- ไฟล์คำนวณและเช็คกลยุทธ์ต่างๆ (Logic หลัก)
 ├── strategy_cpu_worker.js       <-- ไฟล์ Wrapper สำหรับคุม Web Worker ฝั่ง Main Thread
 ├── strategy_worker.js           <-- ไฟล์ตัว Worker ทำหน้าที่เปิดและโหลด WebAssembly
 │
 ├── indicatorMath_ULTRA_Rust.js  <-- ไฟล์ JS Bridge สำหรับ WebAssembly (เอามาจากโฟลเดอร์ wasm_dist)
 ├── indicatorMath_ULTRA_Rust_bg.wasm <-- ไฟล์ WebAssembly หลักที่ประมวลผลความเร็วสูง (เอามาจากโฟลเดอร์ wasm_dist)
 │
 └── .htaccess                    <-- ไฟล์สำคัญสำหรับปลดล็อกสิทธิ์ให้รัน .wasm (ต้องสร้างใหม่)
```

**⚠️ ข้อสังเกต:** ไฟล์ `indicatorMath_ULTRA_Rust.js` และไฟล์ `indicatorMath_ULTRA_Rust_bg.wasm` จะต้องถูกก๊อปปี้ออกมาจากโฟลเดอร์เดิม (ที่อยู่ใน `RustLib/indicator_math/wasm_dist/`) มาวางรวมไว้กับไฟล์ HTML เลเวลเดียวกันเลย เพื่อไม่ให้พาท (Path) สับสนครับ

---

## 🛠️ 2. การแก้ไขโค้ด (ปรับ Path ให้โหลดไฟล์เจอกัน)

เนื่องจากเราจับแพ็คเกจย้ายมาอยู่โฟลเดอร์เดียวกันทั้งหมด คุณต้องแก้ไขตัวแปรพาธในไฟล์ **`strategy_worker.js`** เพื่อให้ระบบรู้ว่าไฟล์ WASM กองอยู่ที่เดียวกันแล้ว

เปิดไฟล์ `strategy_worker.js` และไปที่บรรทัดที่ **29** (หรือหาคำว่า `wasmPath`):

**ลบของเดิมออก:**
```javascript
const wasmPath = data.wasmPath || '../../RustLib/indicator_math/wasm_dist/indicatorMath_ULTRA_Rust.js';
```

**เปลี่ยนเป็นค่าใหม่ (ให้อ่านไฟล์จากโฟลเดอร์ปัจจุบัน):**
```javascript
const wasmPath = data.wasmPath || './indicatorMath_ULTRA_Rust.js';
```

---

## ⚙️ 3. การสร้างไฟล์ .htaccess (สำคัญมาก!)

เซิร์ฟเวอร์ Shared Host รุ่นเก่าๆ (Apache) *จะไม่รู้จักไฟล์ `.wasm`* ถ้าดึงข้อมูลไปตรงๆ เว็บเบราว์เซอร์จะ Error เพราะถูกมองว่าเป็นไฟล์ข้อความเปล่า คุณจึงต้องสอนให้โฮสต์รู้จักก่อน

ให้สร้างไฟล์ชื่อ **`.htaccess`** (อย่าลืมใส่จุดด้านหน้า) ไว้ในโฟลเดอร์ `public_html` ระดับเดียวกับ index.html แล้วใส่โค้ดชุดนี้เข้าไป:

```apache
# 1. ปลดล็อก MIME Type ให้เว็บเบราว์เซอร์อ่านไฟล์ WASM ได้ถูกต้อง
<IfModule mod_mime.c>
    AddType application/wasm .wasm
</IfModule>

# 2. ปิด Cache สำหรับไฟล์ JS และ WASM (แนะนำให้เปิดไว้ตอนพัฒนาระบบ จะได้รีเฟรชอัปเดตโค้ดใหม่ได้เลย)
<FilesMatch "\.(wasm|js)$">
    FileETag None
    <IfModule mod_headers.c>
        Header unset ETag
        Header set Cache-Control "max-age=0, no-cache, no-store, must-revalidate"
        Header set Pragma "no-cache"
        Header set Expires "Wed, 11 Jan 1984 05:00:00 GMT"
    </IfModule>
</FilesMatch>
```

---

## 🔒 4. การเปิดใช้งานระบบ HTTPS (SSL)

เว็บแอปพลิเคชันนี้ทำงานกึ่ง Real-time โดยต่อสายตรงไปที่ **WebSocket ความปลอดภัยสูง** (wss://ws.derivws.com) 
ดังนั้น **เว็บไซต์หน้าบ้านของคุณ จะต้องเป็น `https://...` เสมอ** ถ้าเข้าแบบ HTTP ธรรมดา เบราว์เซอร์จะบล็อกการรับส่งข้อมูลทันที

- **วิธีทำ:** ในระบบหลังบ้านของโฮสติ้ง (เช่น cPanel หรือ DirectAdmin) ให้หาเมนู *SSL Certificates* หรือ *Let's Encrypt* แล้วกด Install เพื่อทำเว็บไซต์ให้มีรูปแม่กุญแจปลอดภัยสีเขียวก่อนใช้งานจริง

---

## 🎯 5. ขั้นตอนติดตั้งท้ายสุด

1. จดโดเมน, เช่าโฮสติ้ง, และสร้าง Let's Encrypt SSL ไว้รอ
2. ตั้งชื่อไฟล์ `multi_monitor.html` เป็น `index.html` แล้วคลุมไฟล์ทั้งหมดลากอัปโหลดลง Host
3. แก้ไขบรรทัด Path ควานหาโฟลเดอร์ให้ตรง ในไฟล์ `.js` ตามวิธีด้านบน
4. สร้างไฟล์ `.htaccess` เพื่อแก้ปัญหาการโหลด `application/wasm`
5. เปิดหน้าเว็บโดเมนของคุณ แล้วกดปุ่มเชื่อมต่อ Socket API เพื่อดึงกราฟได้เลย!
