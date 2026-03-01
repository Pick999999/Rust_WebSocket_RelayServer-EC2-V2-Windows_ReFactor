# แผนการเชื่อมต่อเว็บภายนอก (thepaper.in) เข้ากับ Rust Relay Server
ไฟล์: `planAddSocket.md`

## เป้าหมาย 
สร้างช่องทางสำหรับเว็บไซต์ภายนอก (เช่น `thepaper.in`) ให้สามารถสื่อสารและแลกเปลี่ยนข้อมูลกับ Rust Relay Server (`pkderiv.shop`) ขณะที่ Task เทรดยังคงทำงานอยู่โดยไม่สะดุด เช่น การส่งคำสั่งไปสั่งติ๊ก checkbox คู่เงินอัตโนมัติที่หน้า Dashboard หรือการดึงสถานะการเทรดกลับไปแสดง

---

## แนวทางการเลือกวิธีเชื่อมต่อ (โปรดยืนยันแนวทางที่ต้องการก่อนเริ่มดำเนินการ)

เราสามารถออกแบบการเชื่อมต่อได้ 3 แนวทางหลัก ขึ้นอยู่กับความต้องการด้าน "ความเรียลไทม์" และ "สถาปัตยกรรมของเว็บภายนอก":

### ตัวเลือกที่ 1: ใช้ HTTP POST ฝั่งเดียว (One-way) - *ตามแผนเดิม*
**เหมาะสำหรับ:** `thepaper.in` ต้องการแค่ **สั่งงาน** (เช่น กดสั่งให้เปิดคู่เงิน) แต่ไม่ต้องรอข้อมูลกราฟวิ่งกลับไปโชว์
*   **รูปแบบ:** `thepaper.in` ยิง HTTP POST เข้ามาที่ `/api/remote-tick` ของ Rust แล้วจบงาน 
*   **ข้อดี:** สร้างง่ายมาก, ปลอดภัยสูง, เซิร์ฟเวอร์ไม่กินแรมเพิ่ม
*   **ข้อเสีย:** `thepaper.in` จะไม่เห็นสถานะแบบสดๆ ว่าการเทรดถึงไหนแล้ว

### ตัวเลือกที่ 2: ใช้ WebSocket ภายนอก (Two-way Real-time)
**เหมาะสำหรับ:** ต้องการให้หน้าเว็บ `thepaper.in` (ที่เป็น HTML/JS) ทั้ง **สั่งงาน** และ **โชว์ข้อมูลสดๆ (กราฟ, ยอดเงิน)** เหมือนหน้า Dashboard 
*   **รูปแบบ:** สร้าง Route ใหม่บน Rust เช่น `wss://pkderiv.shop/ws-external?token=SECRET` ช่องทางนี้จะตัดระบบเซสชัน (Login) ออก แต่ใช้ Token แลกบัตรเพื่อเชื่อมเสียบสายค้างไว้
*   **ข้อดี:** แลกเปลี่ยนข้อมูลได้เร็วสับไปสับมาตลอดเวลาใน 1 คอนเนคชัน
*   **ข้อเสีย:** `thepaper.in` ต้องเขียนสคริปต์เชื่อมต่อและดักจับการหลุด (Reconnect) และตัว Rust ต้องใช้ทรัพยากรจองเส้นสายนี้ไว้ให้กับเว็บภายนอกตลอดเวลาที่เปิดทิ้งไว้

### ตัวเลือกที่ 3: ใช้ HTTP POST + SSE (Server-Sent Events)
**เหมาะสำหรับ:** อยากได้ข้อดีของทั้งข้อ 1 และ 2 โดยไม่ต้องเขียนโค้ดซับซ้อนฝั่ง Frontend
*   **รูปแบบ:** เวลาส่งคำสั่งใช้ `POST /api/remote-tick` เวลาจะรับข้อมูลให้ `thepaper.in` เปิดท่อรับข้อมูล `EventSource('/api/stream')`
*   **ข้อดี:** เบราว์เซอร์มีระบบต่อใหม่อัตโนมัติเวลาเน็ตหลุด ไม่ต้องใช้โค้ดเยอะ เหมาะสำหรับระบบที่เซิร์ฟเวอร์ยิงข้อมูลให้รัวๆ 
*   **ข้อเสีย:** ไม่ได้รวมกันในท่อเดียวกัน (เวลาส่งออกกับส่งเข้าใช้คนละช่องทาง)

**🌟 กรุณาตอบกลับเพื่อยืนยันแนวทางที่คุณต้องการ (เช่น "เลือกแนวทางที่ 2" หรือ "เลือกข้อ 1") ก่อนที่เราจะเริ่มลงมือโค้ดนะครับ**

---

## ขั้นตอนการติดตั้งทางเทคนิค (อ้างอิงจากตัวเลือกที่ 1 HTTP POST)
*(หากเลือกแนวทางอื่น จะปรับแผนด้านล่างนี้ให้สอดคล้องกับแนวทางนั้น)*

### 1. ฝั่ง Backend (Rust - `src/main.rs`)
เพิ่มความสามารถในการรับคำสั่งจากภายนอก

**1.1. เตรียมรับข้อมูลและกำหนดโครงสร้างข้อความ:**
*   สร้าง struct สำหรับรับ HTTP POST Request ที่ส่งมาจากภายนอก พร้อม Token
```rust
#[derive(Deserialize)]
pub struct RemoteRequest {
    pub token: String,       // ใช้ Secret Token ป้องกันคนนอกยิง API
    pub assets: Vec<String>, // [ "EURUSD", "GBPUSD" ]
}
```
*   สร้าง struct แจ้งเตือน (Broadcast message) ตัวใหม่ ในชื่อ `RemoteTickCommand`
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteTickCommand {
    #[serde(rename = "type")]
    pub msg_type: String, // "remote_tick"
    pub assets: Vec<String>,
}
```
*   เพิ่มค่านี้เข้าไปใน enum หลัก (จะได้ส่งผ่าน WebSocket ออกไปที่เบราว์เซอร์ได้)
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum BroadcastMessage {
    // ...
    RemoteTick(RemoteTickCommand),
}
```

**1.2. เพิ่มตัวรับ HTTP (Endpoint handler):**
*   สร้างฟังก์ชันจัดการกับ API endpoint (`POST /api/remote-tick`) เพื่อรับข้อมูล
```rust
async fn remote_tick_handler(
    State(state): State<Arc<AppState>>,
    axum::Json(payload): axum::Json<RemoteRequest>,
) -> axum::response::Response {
    // 1. ตรวจสอบ Token ควบคุมด้วยค่าจาก .env หรือค่า Hard-code เช่น "MY_SECRET_KEY"
    // 2. ถ้าถูก ส่งต่อข้อมูลด้วย `state.tx.send(BroadcastMessage::RemoteTick(...))`
    // 3. ส่ง 200 OK
}
```

**1.3. ลงทะเบียนและอนุญาต Router:**
*   ตั้งค่า `.route("/api/remote-tick", post(remote_tick_handler))` ลงในตัวแปร `app` (Router ของเรา)
*   **สำคัญมาก**: ติดปีกนก (เพิ่ม `tower_http::cors::CorsLayer`) ในจุดนี้ เพื่อให้ `.allow_origin` อนุญาตให้โดเมน `https://thepaper.in` ส่ง POST Request เข้ามาที่เซิร์ฟเวอร์แบบข้ามโดเมนได้ (หรือเปลี่ยนให้ .allow_any() ตามความเหมาะสม)

---

### 2. ฝั่ง Frontend (`public/tradeauto/trade_dashboard.html`)
ตอบกลับคำสั่งที่วิ่งมาตามท่อ WebSocket ภายในฟังก์ชัน `handleServerMessage(data)` 

**2.1. ดักจับคำสั่ง remote_tick** และจัดการกับ UI:
```javascript
if (data.msg_type === 'remote_tick') {
    const assetsToTick = data.assets; 

    // 2.1.2 ล้างค่าเดิมทั้งหมด หรืออัปเดตสถานะการติ๊กของ checkbox (.cbAsset) 
    document.querySelectorAll('.cbAsset').forEach(cb => {
        // ... ให้ checkbox ที่ value ตรงกับข้อมูลถูกติ๊ก 
    });
    updateCbCount(); // รันฟังก์ชันซิงค์ตัวนับ 
    
    // 2.1.3 (ทางเลือก) สั่งการไปที่ tokio auto_trade ให้เปลี่ยนแปลงข้อมูลคู่เงินใหม่ในลูปการเทรดด้วย
    // ตัวอย่างเช่น หากหน้าจอเปิดการออโต้เทรดอยู่ อาจจะต้องหยุดอันเก่าและเริ่มอันใหม่
    // if (autoTradeActive) { 
    //    // รันฟังก์ชันเพื่อให้ tokio task รับพารามิเตอร์ assets อันใหม่ 
    //    sendAutoMultiCommand(assetsToTick, token, ...); 
    // }
}
```

---

### 3. ฝั่งเว็บ External (`thepaper.in` ฝั่งนั้น)
ทำสคริปต์ Javascript ส่งข้อมูลแบบ AJAX POST:
```javascript
const payload = {
    token: "YOUR_SECRET_TOKEN",
    assets: ["EURGBP", "USDJPY"]
};
fetch("https://pkderiv.shop/api/remote-tick", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
});
```
