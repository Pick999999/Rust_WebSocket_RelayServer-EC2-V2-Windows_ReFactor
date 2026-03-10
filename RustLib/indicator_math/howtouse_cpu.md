# คู่มือการใช้งาน Indicator Math (WASM - CPU Version)

โมดูลนี้ถูกคอมไพล์จาก Rust เป็น WebAssembly (Wasm) เพื่อประมวลผลอินดิเคเตอร์เชิงคณิตศาสตร์ (EMA, MACD, RSI, ADX, บลาๆ) บน Browser ผ่าน CPU ล้วนๆ ข้อดีคือมีความแม่นยำสูง รวดเร็ว และทำงานแบบ **Stateful** (คำนวณเชื่อมต่อจากแท่งเทียนก่อนหน้า ไม่กินสเปคเมื่อ Feed ข้อมูล Live)

---

## 🚀 1. ขั้นตอนการติดตั้งและการเตรียมใช้งาน (Setup)

1. **คอมไพล์ Rust เป็น Wasm:**
   เปิด Terminal ไปที่โฟลเดอร์โปรเจกต์ (ที่มีไฟล์ `Cargo.toml`) แล้วรันคำสั่ง:
   ```bash
   wasm-pack build --target web --out-dir wasm_dist
   ```
2. **รันบน Web Server:** 
   ไม่สามารถเปิดไฟล์ HTML รันตรงๆ (`file:///`) ได้เนื่องจากข้อจำกัด CORS ของ Wasm ต้องรันผ่าน Web Server จำลอง เช่น Live Server ใน VS Code หรือคำสั่ง `python -m http.server 5500`
3. **การ Import ในไฟล์ HTML/JS:**
   ```javascript
   // ต้องประกาศ script type="module"
   import init, { WasmAnalysisGenerator } from './wasm_dist/indicatorMath_ULTRA_Rust.js';
   
   await init(); // รอโหลดโมดูลให้เสร็จก่อนเริ่มทำงาน
   ```

---

## 📥 2. โครงสร้างข้อมูลขาเข้า (Input)

โมดูลต้องการข้อมูลตั้งต้น 3 ส่วนด้วยกัน:

1. **Options (การตั้งค่า Indicator)** - ส่งเป็น *JSON String*
   ```javascript
   const options = {
       ema1_period: 20, ema1_type: "EMA",
       ema2_period: 50, ema2_type: "EMA",
       ema3_period: 200, ema3_type: "EMA",
       atr_period: 14, atr_multiplier: 2.0,
       bb_period: 20, ci_period: 14,
       adx_period: 14, rsi_period: 14,
       flat_threshold: 0.1, macd_narrow: 0.05
   };
   ```
2. **History Candles (ประวัติกราฟย้อนหลัง)** - ส่งเป็น *JSON String*
   เพื่อวอร์มเครื่องสร้างค่าเฉลี่ยตั้งต้นให้กับระบบ (ควรส่งอย่างน้อย 200 แท่งให้ครอบคลุม EMA200)
   ```javascript
   const history = [
       { time: 1700000000, open: 100, high: 105, low: 98, close: 102 },
       { time: 1700000060, open: 102, high: 103, low: 101, close: 101.5 }
   ]; // ข้อมูลเวลา time คือ Timestamp วินาที
   ```
3. **Live Ticks (ราคาสด)**
   - `price` (Number): ราคาล่าสุด
   - `time` (BigInt): Timestamp ของราคาล่าสุด **(สำคัญมาก: ฝั่ง JS วิงวอนให้ต้องครอบด้วยคำสั่ง `BigInt()`)**

---

## ⚙️ 3. วิธีเรียกใช้ฟังก์ชัน (Functions)

```javascript
// 1. สร้าง Instance ระบบ (โยนค่า Settings เข้าไปตัวแรกสุด)
const generator = new WasmAnalysisGenerator(JSON.stringify(options));

// 2. Feed ข้อมูลประวัติกราฟก้อนใหญ่เข้าไป (วอร์มอัพ State)
generator.initialize(JSON.stringify(history));

// 3. ยิงราคาสดแบบ Real-time เข้าไประบบ (ยิงรัวๆ ได้เลย ข้อมูล Stateful)
let result = generator.append_tick(102.5, BigInt(1700017940));
```

---

## 📤 4. โครงสร้างข้อมูลขาออก (Output)

ผลลัพธ์จาก `generator.append_tick(...)` จะมี **2 สถานะ**

*   **คืนค่า `null` หรือ `undefined`:** แปลว่าเวลายังไม่ปิดแท่งเทียน ฟังก์ชันจะรอเก็บข้อมูลไปก่อน (ไม่คายอะไรออกมา)
*   **คืนค่า `Object (AnalysisResult)`:** แท่งเทียนปิดเรียบร้อย รวบรวม Indicator ทั้งหมดโยนกลับออกมาให้

**ตัวอย่างโครงสร้าง Object ล่าสุดที่ได้กลับมา:**
```javascript
{
  "index": 1,
  "candletime": 1700017940,
  "candletime_display": "14:12:20",
  "open": 100.2,
  "high": 105.1,
  "low": 98.4,
  "close": 104.5,
  "color": "Green",
  "next_color": null,
  "pip_size": 4.3,
  "ema_short_value": 104.2,
  "ema_short_direction": "Up",
  "ema_short_turn_type": "TurnUp",
  "ema_medium_value": 102.1,
  "ema_medium_direction": "Up",
  "ema_long_value": 98.5,
  "ema_long_direction": "Flat",
  "ema_above": "ShortAbove",
  "ema_long_above": "MediumAbove",
  "macd_12": 2.1,
  "macd_23": 3.6,
  "previous_ema_short_value": 103.8,
  "previous_ema_medium_value": 101.9,
  "previous_ema_long_value": 98.6,
  "previous_macd_12": 1.9,
  "previous_macd_23": 3.3,
  "ema_convergence_type": "divergence",
  "ema_long_convergence_type": "D",
  "choppy_indicator": 45.2,
  "adx_value": 25.4,
  "rsi_value": 65.4,
  "bb_values": {
    "upper": 106.2,
    "middle": 102.1,
    "lower": 98.0
  },
  "bb_position": "NearUpper",
  "atr": 0.0054,
  "is_abnormal_candle": false,
  "is_abnormal_atr": false,
  "u_wick": 0.6,
  "u_wick_percent": 8.95,
  "body": 4.3,
  "body_percent": 64.18,
  "l_wick": 1.8,
  "l_wick_percent": 26.87,
  "ema_cut_position": "1",
  "ema_cut_long_type": "UpTrend",
  "candles_since_ema_cut": 5,
  "up_con_medium_ema": 12,
  "down_con_medium_ema": 0,
  "up_con_long_ema": 45,
  "down_con_long_ema": 0,
  "is_mark": "n",
  "status_code": "ST01",
  "status_desc": "Trend Up Strong",
  "status_desc_0": "Wait for pullback",
  "hint_status": "Good condition to Buy",
  "suggest_color": "Green",
  "win_status": "Wait",
  "win_con": 0,
  "loss_con": 0,
  "smc": null
}
```
