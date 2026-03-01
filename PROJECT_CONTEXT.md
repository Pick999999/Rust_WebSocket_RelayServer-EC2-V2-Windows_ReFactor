# Project Context: Rust WebSocket Relay Server & Auto Multi-Trade Dashboard

## ภาพรวมโปรเจค (Project Overview)
โปรเจคนี้คือระบบเทรดอัตโนมัติ (Auto Trade) ที่เชื่อมต่อกับแพลตฟอร์ม Deriv ผ่าน WebSocket 
โดยมีส่วนประกอบ 2 ส่วนหลัก:
1. **Backend (Rust):** ทำหน้าที่เป็น WebSocket Relay Server, จัดการการเชื่อมต่อกับ Deriv API, ดึงข้อมูลแท่งเทียน (Candles), คำนวณอินดิเคเตอร์ผ่านโมดูล `indicator_math` (V2AnalysisGenerator) และจัดการลอจิกการเข้าเทรดแบบ Multi-Asset อัตโนมัติใน Background Task แม้จะปิดเบราว์เซอร์ไปแล้ว
2. **Frontend (HTML/JS):** หน้า Dashboard (`public/tradeauto/trade_dashboard.html`) สำหรับดูสถานะการวิเคราะห์กราฟแต่ละคู่เงิน ควบคุมการเปิด/ปิดบอท และดูตารางออเดอร์ (Active Trades & Trade History) รวมถึงการแสดงผลกราฟแท่งเทียน (Lightweight Charts)

## สถานะล่าสุด (Latest State - 25 Feb 2026)

### สิ่งที่เพิ่งแก้ไขไป (Recent Changes)

#### 1. Historical Markers (Status Code ย้อนหลังบนกราฟ) ✅ แก้แล้ว
- **`connect_to_deriv`**: เปลี่ยนจาก mock status code ("C"/"P"/"-") เป็น `V2AnalysisGenerator` ที่ให้ status code จริง
- **`auto_multi_trade` SYNC handler**: เพิ่มการ re-broadcast `historical_analysis` ให้ทุก asset เมื่อ browser reconnect (SYNC_STATUS)
- **Frontend**: เพิ่ม safety check — ถ้า `historical_analysis` มาก่อน candle data จะ defer markers ผ่าน `_pendingMarkerSync`
- เพิ่มจำนวน markers จาก 100 → 1000 (ทั้ง connect_to_deriv และ auto_multi_trade)

#### 2. Balance Display ✅ แก้แล้ว
- **เพิ่ม `balance` field ใน `LotStatus` struct** — ส่ง balance พร้อม lot_status ทุกครั้ง
- **Frontend อัพเดท balance จาก 3 แหล่ง:**
  - `balance` message (จาก Deriv authorize)
  - `trade_result` message (มี `data.balance` อยู่แล้ว)
  - `lot_status` message (ส่ง balance พร้อม grand_profit)
- **SYNC handler** ใน `auto_multi_trade` ส่ง `BalanceMessage` กลับ browser ด้วย

#### 3. Contract Table Click → สลับกราฟ ✅ ใหม่
- สร้าง function `switchToAssetChart(asset)` — รวมโค้ดเปลี่ยนกราฟไว้ที่เดียว
- ทั้ง **Summary Table** (Tab2) และ **Contract Table** (Tab1 - Active Trades) ใช้ร่วมกัน
- คลิกที่แถวใน contract-table จะ: เคลียร์กราฟ → ส่ง `START_DERIV` ขอข้อมูล asset ใหม่ → สลับไป Tab1
- ป้องกัน: คลิกปุ่ม "Sell" จะไม่ trigger การเปลี่ยนกราฟ

#### 4. Parallel History Fetch ⚡ Performance
- **เดิม (Sequential):** ส่ง request → รอ response → ถัดไป (~3s × 10 assets = 30 วินาที)
- **ใหม่ (Parallel Blast):** ส่ง request ทั้ง 10 assets ออกหมดก่อน (50ms delay) → รับ response match ตาม `echo_req` (~3-5 วินาทีรวม)
- **เร็วขึ้น 6-10 เท่า** สำหรับ initial history load

#### 5. Chart Markers (จากรอบก่อนหน้า)
- Checkbox `Show StatusCode` เปิด/ปิดการแสดง markers
- แยกสีและสัญลักษณ์: `call` (สีเขียว, ลูกศรชี้ขึ้น), `put` (สีแดง, ลูกศรชี้ลง), `idle` (วงกลมสีเทา)
- ป้องกัน stacking — ลบ marker เก่าของแท่งเดิมก่อน push ตัวใหม่

#### 6. Idle Mode Toggle ✅
- ปุ่ม `⏸ Idle` / `▶️ Resume Auto` สำหรับหยุด/เริ่มเทรดชั่วคราว
- ส่ง `UPDATE_MODE` → `trade_mode: "idle"` หรือ `"auto"` ไป backend
- Backend ตั้ง `lot_active = false/true` โดยไม่หยุด task

### สถาปัตยกรรมและการทำงานปัจจุบัน (Current Architecture)

#### ไฟล์สำคัญ
| ไฟล์ | หน้าที่ | ขนาด |
|------|--------|------|
| `src/main.rs` | Backend หลัก — WebSocket server, Deriv connection, auto-trade | ~4,200 lines |
| `public/tradeauto/trade_dashboard.html` | Frontend Dashboard — กราฟ, ตาราง, ควบคุมบอท | ~2,430 lines |
| `RustLib/indicator_math/src/generator.rs` | V2AnalysisGenerator — คำนวณ EMA, StatusCode | ~800 lines |
| `RustLib/indicator_math/src/structs.rs` | Data structs: Candle, AnalysisResult, CandleMasterCode | ~183 lines |
| `tradeSignal.json` | Config สัญญาณ: asset, call_signal, put_signal, is_active | JSON |
| `indicatorConfig.json` | Config อินดิเคเตอร์: EMA periods, action_mode, trading params | JSON |

#### Core Message Types (BroadcastMessage enum)
| Message Type | จาก | ไปยัง | คำอธิบาย |
|-------------|------|------|---------|
| `Candle` | connect_to_deriv | Frontend | OHLC data ทุก tick |
| `EmaData` | connect_to_deriv | Frontend | Short/Medium/Long EMA arrays |
| `HistoricalAnalysis` | connect_to_deriv / auto_trade SYNC | Frontend | StatusCode ย้อนหลัง (markers) |
| `MultiAnalysis` | auto_multi_trade | Frontend | StatusCode ทุก asset รายนาที |
| `LotStatus` | auto_multi_trade | Frontend | grand_profit, win_count, balance, lot_active |
| `Balance` | auto_multi_trade | Frontend | ยอด balance ปัจจุบัน |
| `TradeOpened` | auto_multi_trade | Frontend | แจ้งเปิด trade ใหม่ |
| `TradeResult` | auto_multi_trade | Frontend | ผลลัพธ์ trade (win/loss + balance) |
| `TradeUpdate` | auto_multi_trade | Frontend | อัพเดท active trade (profit, spot) |
| `AutoTradeStatus` | auto_multi_trade | Frontend | สถานะ auto-trade (active/stopped) |

#### Frontend Commands (Browser → Rust)
| Command | คำอธิบาย |
|---------|---------|
| `START_DERIV` | เปิด single-asset viewer (กราฟ + EMA) |
| `START_AUTO_TRADE` | เริ่ม auto multi-trade task |
| `STOP_AUTO_TRADE` | หยุด auto-trade task |
| `UPDATE_MODE` | สลับ idle/auto mode |
| `UPDATE_PARAMS` | อัพเดท trade params (stake, duration, target) |
| `SYNC_STATUS` | ขอ sync สถานะทั้งหมดกลับ (เมื่อ browser reconnect) |
| `SELL` | สั่งขาย contract ทันที |

#### Data Flow
```
Deriv API (WebSocket)
    ↓
auto_multi_trade (tokio task)          connect_to_deriv (tokio task)
    ↓ V2AnalysisGenerator                  ↓ V2AnalysisGenerator  
    ↓ StatusCode → match tradeSignal       ↓ EMA + Historical Analysis
    ↓ Trade execution (buy/sell)           ↓ Candle streaming
    ↓                                      ↓
broadcast::Sender<BroadcastMessage> ←——→ broadcast::Sender<BroadcastMessage>
    ↓
handle_socket (axum WebSocket)
    ↓
Browser (trade_dashboard.html)
    ↓ LightweightCharts + Signal Strip + Contract Table
```

### การเลือก Asset
- ควบคุมผ่าน Checkbox บนหน้า UI และอ้างอิงรายชื่อคู่เงินจากไฟล์ `tradeSignal.json` ว่าคู่ไหนเป็น `is_active: "y"`
- **Auto Multi-Trade:** 
  - สั่งงานโดยปุ่ม `Start Auto Multi-Trade` ซึ่งส่งคำสั่ง `START_AUTO_MULTI` ไปยัง Rust Backend
  - Backend เปิด tokio task ทำงานลูปอิสระ 
  - เชื่อมต่อ Deriv รับข้อมูล OHLC และส่งเข้า `V2AnalysisGenerator` 
  - ที่วินาทีที่ 0-2 ของแต่ละนาที Backend ตรวจสอบ `status_code` ของคู่เงินและเทียบกับ `call_signal` / `put_signal` ใน `tradeSignal.json` เพื่อเข้าออเดอร์
- **ข้อมูลลอจิกอินดิเคเตอร์:** อยู่ใน `RustLib/indicator_math` ทำหน้าที่คำนวณ EMA, StatusCode

### Environment & Deployment
- **Development:** Windows (current machine)
- **Production:** AWS EC2 Ubuntu (cross-compile or build on server)
- **Dependencies:** tokio, axum, serde, tokio-tungstenite, dotenv
- **Database:** Firestore (optional, for trade record persistence)
- **Env Variables:** `FIRESTORE_PROJECT_ID`

## สิ่งที่ต้องทำต่อไป (Next Steps / TODOs)

### 🔴 Priority สูง
1. **Refactor `main.rs` (4,200+ lines)** — ดูแผนงานใน `refactorPlan.md`
   - แยก structs → `models.rs`
   - ใช้ `Default` trait กับ `LotStatus` (เพิ่ม field ใหม่ไม่ต้องแก้ 9+ จุด)
   - แยก shared utilities → `deriv_common.rs`
   - แยก `connect_to_deriv` → `deriv_single.rs`
   - แยก `auto_multi_trade` → `auto_trade.rs`

### 🟡 Priority กลาง
2. **ติดตามผลการรันระบบ Auto Multi-Trade:** ว่าทำงานได้เสถียร สมบูรณ์ และนับ Lot / Martingale ได้ถูกต้อง
3. **ตรวจสอบ Firestore:** ว่าบันทึก trade record ครบถ้วน
4. **Sell button error:** ปัจจุบัน sell จาก single-asset viewer ได้ error "Please log in." เพราะ connect_to_deriv ในโหมด idle ไม่ authorize — ควร forward sell ผ่าน auto_trade connection ที่ authorized แล้ว

### 🟢 Priority ต่ำ
5. **แยก Crate Libraries เพิ่ม:** `deriv_api/`, `trade_engine/` (ดูรายละเอียดใน refactorPlan.md)
6. **Config hot-reload:** ให้สามารถเปลี่ยน `tradeSignal.json` ได้โดยไม่ต้อง restart
7. **Logging improvement:** ลด log spam ("📊 Received Msg" ทุก tick) ให้เหลือเฉพาะ event สำคัญ
