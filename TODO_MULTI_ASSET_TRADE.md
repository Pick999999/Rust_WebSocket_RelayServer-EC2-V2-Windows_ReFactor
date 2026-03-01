# TODO: Multi-Asset Parallel Trade System
> สร้างเมื่อ: 2026-02-19  
> สถานะ: 🔴 ยังไม่สมบูรณ์ — ต้องทำต่อ

---

## 📋 สรุปสิ่งที่ทำไปแล้ว

### ✅ สำเร็จ (Build ผ่าน)
1. **เพิ่มคำสั่ง `START_MULTI_TRADE`** ใน `src/main.rs`
   - สามารถรับคำสั่งจาก browser ผ่าน WebSocket ได้
   - Spawn `connect_multi_asset()` เป็น tokio task

2. **สร้างฟังก์ชัน `connect_multi_asset()`** ใน `src/main.rs` (บรรทัด ~1825-2178)
   - เชื่อมต่อ Deriv API
   - โหลด `tradeSignal.json` เพื่ออ่าน asset list + signal codes
   - Fetch historical candles สำหรับแต่ละ asset
   - Subscribe OHLC real-time
   - เช็ค signal ที่ second 0-2 ของทุกนาที
   - Broadcast `MultiAnalysisMessage` ไปที่ client

3. **สร้าง Structs ใหม่**
   - `TradeSignalEntry` — parse จาก tradeSignal.json
   - `AssetSignalResult` — ผลวิเคราะห์ต่อ asset
   - `MultiAnalysisMessage` — broadcast ไป client
   - เพิ่ม `MultiAnalysis` variant ใน `BroadcastMessage` enum

4. **สร้าง `trade_dashboard.html`** — หน้า UI ใหม่
   - เลือก asset, ตั้งค่า stake/duration/money management
   - โหลด tradeSignal.json อัตโนมัติ
   - กราฟ candlestick (Lightweight Charts 4.2.1)
   - Signal strip แสดงผล CALL/PUT/IDLE
   - Activity log

5. **เพิ่มเมนูการ์ด "Multi-Asset Trade"** ใน `public/index.html`

### ⚠️ แก้ไขแล้วแต่ยังไม่ทดสอบ (Cargo build กำลังรัน)
6. **เพิ่ม `open_time` ใน Candle struct** เพื่อแก้ปัญหากราฟสร้างแท่งเทียนใหม่ทุก tick
   - แก้ `parse_flexible()` ให้ parse `open_time` จาก Deriv API
   - Frontend ใช้ `open_time` เป็น key ของแท่ง (same open_time = update, new open_time = new bar)

7. **เพิ่ม Checkbox "Show StatusCode"** บน chart
   - แสดง markers (ลูกศร + ตัวเลข StatusCode) บนแท่งเทียน

---

## 🔴 ปัญหาที่ยังไม่ได้แก้

### 1. ❌ ไม่ได้ใช้ `RustLib/indicator_math` (ตัวที่มี Parallel)
**ปัญหา:** `Cargo.toml` อ้าง `indicator_math = { path = "indicator_math" }` ซึ่งเป็น crate ใน root  
**ตัวที่ควรใช้:** `RustLib/indicator_math/` ซึ่งมี:
- `manager.rs` → `AnalysisManager` สำหรับ parallel analysis
- `generator.rs` → generator ตัวใหม่
- `structs.rs` → data structures
- `deriv_api.rs` → Deriv API helper

**สิ่งที่ต้องทำ:**
- [ ] เปลี่ยน Cargo.toml ให้ชี้ไปที่ `RustLib/indicator_math`
- [ ] ปรับ import ใน `main.rs` ให้ตรงกับ API ของ crate ใหม่
- [ ] ใช้ `AnalysisManager` จาก `manager.rs` ทำ parallel analysis จริงๆ
- [ ] ตรวจ API difference ระหว่าง crate เก่า vs ใหม่ (struct names, method names)

### 2. ❌ การเทรดไม่อิสระจาก Browser
**ปัญหา:** ปิด browser → WebSocket หลุด → ไม่มีทางสั่ง trade ใหม่  
`connect_to_deriv()` task ยังรันอยู่ แต่ trade logic ผูกกับ browser command

**สิ่งที่ต้องทำ:**
- [ ] ทำให้ Rust server จัดการ trade โดยอิสระ (server-side trading)
- [ ] เก็บ trade config ไว้ที่ server (ไม่ต้องรอ browser ส่ง)
- [ ] Browser ทำหน้าที่แค่ monitor + ปรับ config, ไม่ใช่ตัวสั่ง trade
- [ ] เมื่อ browser reconnect ควรแสดงสถานะปัจจุบันทันที

### 3. ⚠️ กราฟแท่งเทียนสร้างทุก Tick
**ปัญหา:** `Candle.time` ใช้ `epoch` (เปลี่ยนทุก tick) → chart สร้างแท่งใหม่ทุก tick  
**แก้ไขแล้ว:** เพิ่ม `open_time` ใน Candle struct + parse จาก Deriv API  
**สถานะ:** ⏳ Build กำลังรัน ยังไม่ได้ทดสอบ + ต้อง copy ไฟล์ไป public/

### 4. ⚠️ ไฟล์ต้อง Copy ไป public/ ด้วยมือ
**ไฟล์ที่ต้อง copy จาก root project → `public/`:**
- `trade_dashboard.html` → `public/trade_dashboard.html`
- `tradeSignal.json` → `public/tradeSignal.json`

---

## 📂 ไฟล์ที่เกี่ยวข้อง

| ไฟล์ | คำอธิบาย |
|---|---|
| `src/main.rs` | Server หลัก — มี `connect_multi_asset()`, `connect_to_deriv()`, structs ทั้งหมด |
| `trade_dashboard.html` | หน้า UI สำหรับ multi-asset trading (ที่ root) |
| `public/index.html` | Landing page — เพิ่มเมนู "Multi-Asset Trade" แล้ว |
| `tradeSignal.json` | Config สำหรับ asset list + signal codes |
| `indicator_math/` | Crate ปัจจุบันที่ใช้อยู่ (ไม่มี parallel) |
| `RustLib/indicator_math/` | Crate ใหม่ที่มี `AnalysisManager` (ยังไม่ได้ใช้) |
| `Cargo.toml` | ต้องเปลี่ยน path ของ indicator_math |
| `indicator_config.toml` | Config สำหรับ EMA periods, MA type, trading params |

---

## 🎯 แผนงานพรุ่งนี้ (Priority Order)

### Phase 1: แก้ Bug กราฟ
1. Verify build ผ่านหลังเพิ่ม `open_time`
2. Copy `trade_dashboard.html` + `tradeSignal.json` ไป `public/`
3. ทดสอบว่ากราฟ update แท่งเทียนถูกต้อง
4. ทดสอบ StatusCode markers

### Phase 2: ใช้ RustLib/indicator_math (Parallel Analysis)
1. ศึกษา API ของ `RustLib/indicator_math` (manager.rs, generator.rs, structs.rs)
2. เปลี่ยน Cargo.toml path
3. Refactor `connect_multi_asset()` ให้ใช้ `AnalysisManager`
4. ทำ parallel analysis จริงๆ (ไม่ใช่ sequential)

### Phase 3: Server-Side Trading (อิสระจาก Browser)
1. สร้าง server-side trade manager ที่เก็บ config + state ใน memory
2. API endpoint สำหรับ start/stop trading, update config
3. Trade logic ทำงานบน server ไม่ขึ้นกับ WebSocket connection
4. Browser เป็นแค่ monitor — reconnect แล้วเห็นสถานะเดิม
5. บันทึก trade results ลง Firestore อัตโนมัติ

---

## 📝 หมายเหตุทางเทคนิค

### indicator_math (ตัวที่ใช้อยู่ — root/indicator_math)
```rust
// API Pattern: Batch analysis
use indicator_math::{AnalysisGenerator, AnalysisOptions, FullAnalysis, Candle as IndicatorCandle};

let gen = AnalysisGenerator::new(candles_vec);
let results: Vec<FullAnalysis> = gen.generate();
let last = results.last(); // FullAnalysis { series_code: Option<u32>, status_desc, close, ... }
```

### RustLib/indicator_math (ตัวที่ควรใช้ — มี parallel)
- ต้องศึกษา `manager.rs` ว่ามี API อะไรบ้าง
- ดู `structs.rs` ว่า data types ตรงกันไหม
- ดู `generator.rs` ว่า generate logic ต่างจากตัวเก่ายังไง

### tradeSignal.json Format
```json
[
  {"id":"1", "assetCode":"R_10", "PUTSignal":"12,18,5,6,7,22,52,2", "CallSigNal":"20,36,37,74,76,79,69,80", "isActive":"y"},
  ...
]
```

### Signal Matching Logic
```
series_code จาก FullAnalysis → เทียบกับ CallSigNal/PUTSignal
- ถ้า match CallSigNal → decision = "call"
- ถ้า match PUTSignal → decision = "put"  
- ไม่ match → decision = "idle"
```
