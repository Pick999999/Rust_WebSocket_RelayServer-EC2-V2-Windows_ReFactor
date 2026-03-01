# 🌟 Strategy Plan Master — กลยุทธ์รวมทั้งหมด

> Choppy Indicator เป็นตัวแบ่งโซนหลัก (Primary Classifier)
> รองรับ 3 โหมด: **WASM CPU**, **WASM GPU**, **Rust WebSocket**

---

## 📁 โครงสร้างไฟล์

```
public/strategy/
├── strategy_engine.js   ← กลยุทธ์รวม (Shared ทุก Version)
├── strategy_cpu.js      ← Version CPU (WASM ใน Browser)
├── strategy_gpu.js      ← Version GPU (WebGPU + WASM)
└── strategy_rust.js     ← Version Rust (WebSocket จาก Server)
```

---

## 🧭 Choppy Index — ระบบแบ่งโซนหลัก

| โซน | Choppy | สถานะตลาด | กลยุทธ์ที่ใช้ |
|---|---|---|---|
| **Zone A** | < 38.2 | 🔥 เทรนด์แข็งแรง | A1–A7 (ตามน้ำ) |
| **Zone B** | 38.2–50 | 🌊 เทรนด์ปานกลาง | B1–B4 (Crossover/Pullback) |
| **Zone C** | 50–61.8 | ⚡ กำลังเปลี่ยน | C1–C4 (Squeeze/Breakout) |
| **Zone D** | > 61.8 | 🏓 ไซด์เวย์ | D1–D4 (สวนเทรนด์/เด้งขอบ) |

SMC (M01, M02) ใช้ได้ทุกโซน — ตรวจสอบก่อนกลยุทธ์อื่นเสมอ

---

## 🛡️ Safety Guards (ด่านแรก)

* `is_abnormal_candle` → ข่าวลาก ห้ามเทรด
* `is_abnormal_atr` → ATR ผิดปกติ ห้ามเทรด
* `color === "Equal"` + `body_percent < 5` → Doji ห้ามเทรด
* `loss_con >= 3` → แพ้ติด 3 ไม้ หยุดพัก

---

## 🔥 Zone A: Strong Trend (Choppy < 38.2)

| ID | ชื่อ | เงื่อนไขหลัก |
|---|---|---|
| A1 | Full Confluence | EMA 3 เส้น Up + ADX>25 + RSI 40-65 + Divergence + Green + Body>40% |
| A2 | Triple EMA | EMA 3 เส้น Up + ShortAbove + ADX>25 |
| A3 | RSI+ADX Accel | ADX>25 + RSI 50-70 + EMA Short Up |
| A4 | EMA Combo | up_con_medium>=3 + up_con_long>=2 + RSI<60 |
| A5 | MACD Accel | Divergence ทั้งคู่ + MACD กว้างขึ้น |
| A6 | Wave Rider | EMA Long Up + Diverge + ชี้ขึ้น 10+ แท่ง |
| A7 | Status Code | `M-UU-G-D` / `M-UU-G-C` |

---

## 🌊 Zone B: Moderate Trend (Choppy 38.2–50)

| ID | ชื่อ | เงื่อนไขหลัก |
|---|---|---|
| B1 | Golden/Death Cross | ema_cut_long_type + candles<=3 + ADX>20 |
| B2 | Pullback | เทรนด์ใหญ่ขึ้น + RSI ย่อ 35-50 + TurnUp |
| B3 | ADX Breakout | ADX>25 + EMA Divergence |
| B4 | EMA Consensus | 2/3 EMA ชี้ทิศเดียว + สีแท่งตรง |

---

## ⚡ Zone C: Transition (Choppy 50–61.8)

| ID | ชื่อ | เงื่อนไขหลัก |
|---|---|---|
| C1 | BB Squeeze Breakout | BB NearUpper/Lower + EMA Dir + Body>60% |
| C2 | MACD Squeeze Turn | Convergence + EMA TurnUp/Down |
| C3 | RSI + EMA Filter | RSI<35 + EMA Medium Up + TurnUp |
| C4 | Candle Anatomy | Hammer (ไส้ล่าง>60%) / Shooting Star |

---

## 🏓 Zone D: Sideways (Choppy > 61.8)

| ID | ชื่อ | เงื่อนไขหลัก |
|---|---|---|
| D1 | BB+RSI Extreme | RSI<30 + BB Lower + TurnUp + Wick>50% |
| D2 | BB Bounce+Wick | BB Lower + RSI<40 + Wick>50% + Body<30% |
| D3 | Ping-Pong | BB Lower + RSI<40 |
| D4 | EMA Turn Sniper | TurnUp + Medium ไม่ลง + RSI<55 + Wick>40% |

---

## 🏛️ SMC (ใช้ได้ทุกโซน)

| ID | ชื่อ | เงื่อนไข |
|---|---|---|
| M01 | Discount+OB | swing_trend bullish + close<=equilibrium + Bullish OB unmitigated |
| M02 | Premium+OB | swing_trend bearish + close>=equilibrium + Bearish OB unmitigated |

---

## 📐 เปรียบเทียบ 3 Version

| | 🟢 CPU | 🟡 GPU | 🔵 Rust |
|---|---|---|---|
| **ไฟล์** | `strategy_cpu.js` | `strategy_gpu.js` | `strategy_rust.js` |
| **คำนวณที่** | Browser CPU | Browser GPU | Server Rust |
| **ต้อง Server?** | ❌ | ❌ | ✅ |
| **Real-time** | ✅ `onTick()` | ✅ `onTick()` | ✅ WebSocket |
| **Batch/Backtest** | ⚠️ ช้า | ✅ `batchSMA()` | ⚠️ ต้อง implement |
| **Multi-client** | ❌ | ❌ | ✅ Broadcast |
| **วิธีใช้** | `.setup()` → `.loadHistory()` → `.onTick()` | เหมือน CPU + `batchSMA()` | `.connect()` → `.startDeriv()` |

### วิธีเรียกใช้ (ทุก Version)
```html
<!-- 1. โหลด Engine กลาง -->
<script src="strategy/strategy_engine.js"></script>

<!-- 2. เลือก Version (เลือก 1 อัน) -->
<script src="strategy/strategy_cpu.js"></script>
<!-- หรือ <script src="strategy/strategy_gpu.js"></script> -->
<!-- หรือ <script src="strategy/strategy_rust.js"></script> -->
```

---

> ⚠️ ต้อง Backtest กับข้อมูลจริงก่อนใช้งาน — ค่า Threshold ปรับได้ตาม Asset/Timeframe
