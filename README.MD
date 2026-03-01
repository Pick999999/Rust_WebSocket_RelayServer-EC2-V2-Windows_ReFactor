# 🚀 Deriv Trading Relay Server (Rust)

## 1. System Architecture

### Overview

ระบบถูกออกแบบเป็น **Relay Server** ทำหน้าที่เป็นตัวกลางระหว่าง Browser (Frontend) และ Deriv WebSocket API

```
[ Browser / Dashboard ]
          │
          │ WebSocket (/ws)
          ▼
[ Rust Relay Server (Axum) ]
          │
          │ WebSocket (tokio-tungstenite)
          ▼
[ Deriv WebSocket API ]
```

---

## 2. Component Breakdown

### 2.1 Axum WebSocket Server

หน้าที่:

* รับการเชื่อมต่อจาก Browser
* ส่งข้อมูล Real-time ผ่าน Broadcast Channel
* รับคำสั่งควบคุมระบบ

Endpoint:

* `GET /ws`

---

### 2.2 Broadcast System

ใช้ `tokio::sync::broadcast`

```
Deriv Data
   │
   ▼
broadcast::Sender
   │
   ├── Browser #1
   ├── Browser #2
   └── Browser #N
```

---

### 2.3 Deriv Connector Task

ทำงานใน background task แยกจาก WebSocket Server

หน้าที่:

* เชื่อมต่อ Deriv API
* Subscribe Tick / Candle
* คำนวณ Indicator
* วิเคราะห์ Trend
* ดำเนินการ Trade

---

## 3. Data Flow

### 3.1 Connection Flow

```
Browser
  │ START_DERIV
  ▼
Relay Server
  │ spawn task
  ▼
Deriv Connector
```

หากมีการ START ใหม่:

* ปิด connection เก่า
* unsubscribe ทุก subscription

---

### 3.2 Market Data Flow

```
Deriv Tick / Candle
        │
        ▼
parse_flexible()
        │
        ├─ Candle
        ├─ EMA Calculation
        └─ EMA Analysis
        │
        ▼
Broadcast → Browser
```

---

## 4. Indicator & Analysis Engine

### 4.1 Candle Buffer

* เก็บข้อมูลแท่งเทียนสูงสุด 200 แท่ง
* Normalize เป็นระดับ 1 นาที

### 4.2 Supported Indicators

* EMA
* SMA
* WMA
* HMA
* EHMA

### 4.3 EMA Analysis

ใช้ `analyze_ema()` วิเคราะห์:

* EMA Slope
* EMA Turn
* EMA Cross
* Position (Above / Below)
* Distance Metrics

ส่งผลลัพธ์ทุก 2 วินาที

---

## 5. Trading Engine

### 5.1 Trade Trigger

* วินาทีที่ 0–2 ของแต่ละนาที
* จำกัด 1 trade ต่อ 1 นาที

### 5.2 Trade Mode

| Mode | Behavior                |
| ---- | ----------------------- |
| idle | ไม่เทรด                 |
| call | CALL ทุกนาที            |
| put  | PUT ทุกนาที             |
| auto | ใช้ Action จาก Analysis |

---

### 5.3 Money Management

#### Fix Mode

* ใช้ stake เดิมตลอด

#### Martingale Mode

* เพิ่ม stake เมื่อแพ้
* reset เมื่อชนะ

---

## 6. Command Protocol (Browser → Server)

| Command       | Description                   |
| ------------- | ----------------------------- |
| START_DERIV   | เริ่มเชื่อมต่อ Deriv          |
| UPDATE_MODE   | เปลี่ยน trade mode            |
| UPDATE_PARAMS | เปลี่ยน duration / money mode |
| SELL          | ปิด contract ทันที            |

---

## 7. Message Protocol (Server → Browser)

| Type          | Payload           |
| ------------- | ----------------- |
| candle        | OHLC Data         |
| ema_data      | EMA Lines         |
| analysis_data | Trend Analysis    |
| balance       | Account Balance   |
| trade_opened  | Trade Open Info   |
| trade_update  | Live Trade Status |
| trade_result  | Final Result      |

---

## 8. Fault Tolerance

* Detect Deriv API Error
* Auto stop connection on error
* Safe unsubscribe on reconnect

---

## 9. Design Goals

* Low Latency
* Real-time Streaming
* Decoupled Frontend / Backend
* Extensible Indicator Engine

---

## 11. Multi-Asset Choppy Monitor (New Feature)

ระบบใหม่ล่าสุดสำหรับมอนิเตอร์สัญญาณเทรดจากหลายๆ สินทรัพย์พร้อมกัน (Multi-Asset) โดยเน้นไปที่การทำงานร่วมกับ **Choppy Index** และ Indicator อื่นๆ แบบ Real-time ผ่าน Deriv WebSocket API โดยตรง (ไม่ต้องผ่าน Backend ในเฟสทดสอบ)

### 🌟 ฟีเจอร์หลัก (Features)

1. **Dashboard ภาพรวม (Grid View)**
   - แสดง Asset ยอดนิยม 10 รายการ เช่น R_10, R_25, 1HZ10V ฯลฯ
   - กราฟเข็ม (Gauge Meter) SVG แสดงค่า Choppy Index และแบ่งโซนสี A, B, C, D ชัดเจน
2. **ระบบแจ้งเตือน (Alerts & Logging)**
   - เสียง Beep แจ้งเตือนเมื่อเกิดสัญญาณ CALL (เสียงแหลมสูง) หรือ PUT (เสียงต่ำ)
   - หน้าต่าง Log สัญญาณแบบเรียลไทม์ พร้อมประวัติย้อนหลัง
3. **Live Charts (Lightweight Charts 4.2.1)**
   - คลิกที่ชื่อ Asset เพื่อเปิด Popup กราฟแท่งเทียน (Candlestick) ทันที
   - แสดง Indicator สดๆ: EMA 3 เส้น (20, 50, 200), Bollinger Bands
   - มี Sub-chart แสดงค่า Choppy Index 14 ตรงกับกราฟด้านบน
   - วาด Trade Markers (ลูกศรชี้ขึ้น/ลง) บนแท่งเทียนเมื่อเกิดสัญญาณ
4. **ความยืดหยุ่น (Flexibility)**
   - โหลดข้อมูลประวัติแท่งเทียน 1 นาที 100 แท่งย้อนหลัง ณ วินาทีแรกที่เชื่อมต่อ ทำให้คำนวณ Choppy Index ได้ทันทีไม่ต้องรอ
   - สามารถปรับระยะเวลาอัปเดต (Update Interval) และ App ID ได้ผ่านหน้า UI

### 🚀 วิธีการทดสอบ (How to Run)

เนื่องจากระบบใช้ `import` และ Web Workers ในฝั่ง Browser รวมถึงเชื่อมต่อ WebSockets จึงจำเป็นต้องรันผ่าน Local HTTP Server (ไม่สามารถเปิดไฟล์ `.html` ตรงๆ ผ่าน File Explorer ได้)

```bash
# เปิด Terminal แจ้งโฟลเดอร์โปรเจกต์
cd d:/Rust/Rust_WebSocket_RelayServer-EC2-V2-Windows_Refactor

# รัน HTTP Server ด้วย Python (พอร์ต 5500) ไปที่โฟลเดอร์ที่มีไฟล์
python -m http.server 5500 --directory public\strategy
```

จากนั้นเปิด Web Browser ไปที่: `http://localhost:5500/multi_monitor.html`

---

✅ **Production-ready architecture for real-time trading systems**
