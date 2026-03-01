# 📘 Strategy Plan 3 — กลยุทธ์การเทรดจาก indicator_math_v2

> **ไลบรารีอ้างอิง:** `indicator_math_v2` (Rust)  
> **อินดิเคเตอร์พื้นฐาน:** EMA, BB (Bollinger Bands), RSI, ADX, ATR, Choppy Index  
> **ข้อมูล Output:** `AnalysisResult` struct ที่ส่งกลับจาก `process_tick()`

---

## ⚙️ ค่าเกณฑ์มาตรฐาน (Threshold Reference)

| อินดิเคเตอร์ | เกณฑ์ | ความหมาย |
|---|---|---|
| RSI | > 70 | Overbought (เกินซื้อ) |
| RSI | < 30 | Oversold (เกินขาย) |
| RSI | 40–60 | Neutral Zone |
| ADX | > 25 | เทรนด์แข็งแกร่ง |
| ADX | < 20 | ไม่มีเทรนด์ / Sideways |
| Choppy Index | > 61.8 | ตลาด Choppy ไม่ควรเทรด |
| Choppy Index | < 38.2 | เทรนด์แข็งแรงสุดๆ |
| ATR / is_abnormal_candle | true | ข่าวลากราคา ห้ามเทรด |
| EMA Direction | "Up" / "Down" / "Flat" | ทิศทางเส้นค่าเฉลี่ย |
| BB Position | NearUpper / NearLower / Middle | ตำแหน่งราคาในแถบ BB |

---

## 🛡️ กฎระบบป้องกัน (Global Guard Rules)

> **ต้องตรวจสอบก่อนทุกกลยุทธ์ด้านล่าง — ถ้าเข้าเงื่อนไขใดเงื่อนไขหนึ่ง ให้ `pause_trading()` ทันที**

```rust
// ❌ ห้ามเทรดเมื่อ:
if analysis.is_abnormal_candle                          // แท่งช็อกตลาด (ข่าว)
|| analysis.is_abnormal_atr                             // ATR ผิดปกติ
|| analysis.choppy_indicator.unwrap_or(100.0) > 61.8    // ตลาด Sideways / Choppy
{
    pause_trading(asset);
    return;
}
```

---

## 📋 รายการกลยุทธ์ทั้งหมด

| # | ชื่อกลยุทธ์ | สไตล์ | ความเสี่ยง |
|---|---|---|---|
| S01 | Triple EMA Trend Follow | Trend Following | ⭐⭐ |
| S02 | BB Reversal with Wick | Mean Reversion | ⭐⭐⭐ |
| S03 | RSI Oversold/Overbought + EMA Filter | Oscillator | ⭐⭐ |
| S04 | ADX Breakout Confirmation | Trend Breakout | ⭐⭐ |
| S05 | Golden/Death Cross Entry | Crossover | ⭐⭐⭐ |
| S06 | BB Squeeze + Choppy Release | Volatility Breakout | ⭐⭐⭐ |
| S07 | EMA Turn Sniper | Reversal Scalp | ⭐⭐⭐⭐ |
| S08 | RSI Divergence + BB Extreme | Confluence Reversal | ⭐⭐⭐ |
| S09 | Trend Continuation (Pullback) | Pullback | ⭐⭐ |
| S10 | Full Confluence Power Entry | Multi-filter | ⭐ |
| S11 | ATR Volatility Filter Scalp | Volatility Scalp | ⭐⭐⭐ |
| S12 | Combo Counter Momentum | Momentum Counter | ⭐⭐ |

---

## 🟢 S01 — Triple EMA Trend Follow (เล่นตามเทรนด์ 3 เส้น)

### แนวคิด
เล่นตามแนวโน้มหลักโดยดูว่าเส้น EMA ทั้ง 3 ชั้น (Short, Medium, Long) เรียงตัวกันทิศเดียวกันหมด แปลว่าตลาดมีเทรนด์ชัดเจน

### เงื่อนไขเข้า CALL (Buy)
```rust
analysis.ema_short_direction == "Up"
&& analysis.ema_medium_direction == "Up"
&& analysis.ema_long_direction == "Up"
&& analysis.ema_above == "ShortAbove"       // เส้นสั้นอยู่เหนือกลาง
&& analysis.ema_long_above == "MediumAbove" // เส้นกลางอยู่เหนือยาว
&& analysis.adx_value.unwrap_or(0.0) > 25.0 // เทรนด์แข็งแกร่ง
&& analysis.color == "Green"                // แท่งปิดเขียว
```

### เงื่อนไขเข้า PUT (Sell)
```rust
analysis.ema_short_direction == "Down"
&& analysis.ema_medium_direction == "Down"
&& analysis.ema_long_direction == "Down"
&& analysis.ema_above == "LongAbove"         // เส้นยาวอยู่เหนือสั้น
&& analysis.adx_value.unwrap_or(0.0) > 25.0
&& analysis.color == "Red"
```

### Status Code เทียบได้กับ
- CALL: `status_desc` มีรูปแบบ `*-UU-U-G-*`
- PUT:  `status_desc` มีรูปแบบ `*-DD-D-R-*`

### จุดแข็ง / จุดอ่อน
- ✅ Win rate สูงในช่วง Trending Market
- ❌ Lag สูง อาจเข้าช้าในตลาดที่วิ่งเร็ว
- ❌ ขาดทุนหนักในช่วง Sideways (ต้องพึ่ง Guard Rules)

---

## 🔵 S02 — BB Reversal with Wick (ชนขอบ BB + ไส้เทียนยาว)

### แนวคิด
ราคาวิ่งไปชนขอบ Bollinger Bands แล้วดีดกลับ โดยใช้ไส้เทียนยาว (Wick) เป็นสัญญาณยืนยันแรงซื้อ/ขายสวน

### เงื่อนไขเข้า CALL (Buy)
```rust
analysis.bb_position == "NearLower"         // ราคาแตะขอบล่าง BB
&& analysis.l_wick_percent > 55.0           // ไส้ล่างยาวกว่า 55% ของแท่ง
&& analysis.rsi_value.unwrap_or(50.0) < 40.0 // RSI ไม่ Overbought
&& analysis.ema_long_direction != "Down"    // เทรนด์ใหญ่ไม่ขาลง
```

### เงื่อนไขเข้า PUT (Sell)
```rust
analysis.bb_position == "NearUpper"
&& analysis.u_wick_percent > 55.0           // ไส้บนยาวกว่า 55%
&& analysis.rsi_value.unwrap_or(50.0) > 60.0
&& analysis.ema_long_direction != "Up"
```

### จุดแข็ง / จุดอ่อน
- ✅ เข้าใกล้จุดกลับตัว Risk/Reward ดี
- ✅ มองเห็นแรงสวนผ่าน Wick ได้ชัด
- ❌ ในตลาด Trending แรง ราคาอาจทะลุ BB ต่อไปได้

---

## 🟡 S03 — RSI Oversold/Overbought + EMA Filter

### แนวคิด
ใช้ RSI หาจุด Extreme แล้วกรองด้วย EMA ทิศทางหลักเพื่อไม่ให้เล่นสวนเทรนด์ใหญ่เกินไป

### เงื่อนไขเข้า CALL (Buy)
```rust
analysis.rsi_value.unwrap_or(50.0) < 35.0      // RSI Oversold
&& analysis.ema_medium_direction == "Up"        // เส้นกลางยังชี้ขึ้น (pullback ชั่วคราว)
&& analysis.ema_short_turn_type == "TurnUp"     // เส้นสั้นกำลังหักหัวขึ้น
```

### เงื่อนไขเข้า PUT (Sell)
```rust
analysis.rsi_value.unwrap_or(50.0) > 65.0
&& analysis.ema_medium_direction == "Down"
&& analysis.ema_short_turn_type == "TurnDown"
```

### จุดแข็ง / จุดอ่อน
- ✅ จับ Pullback ในเทรนด์ได้แม่นยำ
- ❌ RSI อาจค้างในโซน Extreme นานในตลาด Strong Trend

---

## 🟠 S04 — ADX Breakout Confirmation (ยืนยัน Breakout ด้วย ADX)

### แนวคิด
รอ ADX พุ่งทะลุ 25 หลังจากช่วง Choppy เพื่อจับตลาดที่เพิ่งเริ่มเทรนด์ใหม่

### เงื่อนไขเข้า CALL (Buy)
```rust
analysis.adx_value.unwrap_or(0.0) > 25.0           // ADX พึ่งทะลุขึ้น
&& analysis.choppy_indicator.unwrap_or(100.0) < 50.0 // Choppy ลดลงแล้ว
&& analysis.ema_short_direction == "Up"
&& analysis.ema_convergence_type == "divergence"    // เส้นกำลังถ่างออก (momentum เพิ่ม)
```

### เงื่อนไขเข้า PUT (Sell)
```rust
analysis.adx_value.unwrap_or(0.0) > 25.0
&& analysis.choppy_indicator.unwrap_or(100.0) < 50.0
&& analysis.ema_short_direction == "Down"
&& analysis.ema_convergence_type == "divergence"
```

### จุดแข็ง / จุดอ่อน
- ✅ จับ Breakout ตัวจริงได้ดี
- ✅ หลีกเลี่ยง False Breakout ในช่วง Choppy
- ❌ เข้าช้ากว่ากลยุทธ์อื่นเล็กน้อย

---

## 🔴 S05 — Golden/Death Cross Entry (จับจุด EMA ตัด)

### แนวคิด
จับสัญญาณทันทีที่เส้น EMA Short ข้ามผ่านเส้น EMA Long (Golden Cross = Buy, Death Cross = Sell)

### เงื่อนไขเข้า CALL (Buy) — Golden Cross
```rust
analysis.ema_above == "ShortAbove"          // เส้นสั้นเพิ่งข้ามขึ้นเหนือเส้นกลาง
&& analysis.candles_since_ema_cut <= 3      // เพิ่งตัดไปไม่เกิน 3 แท่ง (สดใหม่)
&& analysis.ema_cut_long_type == "UpTrend"
&& analysis.adx_value.unwrap_or(0.0) > 20.0
```

### เงื่อนไขเข้า PUT (Sell) — Death Cross
```rust
analysis.ema_above == "LongAbove"           // เส้นยาวอยู่เหนือเส้นสั้น (เส้นสั้นตัดลง)
&& analysis.candles_since_ema_cut <= 3
&& analysis.ema_cut_long_type == "DownTrend"
&& analysis.adx_value.unwrap_or(0.0) > 20.0
```

### จุดแข็ง / จุดอ่อน
- ✅ สัญญาณคลาสสิกที่เชื่อถือได้
- ✅ `candles_since_ema_cut` ช่วยให้ไม่เข้าช้า
- ❌ อาจเจอ Whipsaw บ่อยในช่วง Sideways

---

## 🟣 S06 — BB Squeeze + Choppy Release (ระเบิด Volatility หลัง Squeeze)

### แนวคิด
รอให้ Choppy Index ลดลงต่ำ (ตลาดเริ่มมีทิศ) หลังจาก BB แคบ (Squeeze) แล้วจับทิศที่วิ่งออกมา

### เงื่อนไขเข้า CALL (Buy)
```rust
analysis.choppy_indicator.unwrap_or(100.0) < 45.0   // Choppy ลดลงมาก (เทรนด์กำลังก่อตัว)
&& analysis.bb_position == "NearUpper"               // ราคาวิ่งออกมาทางบน
&& analysis.ema_short_direction == "Up"
&& analysis.color == "Green"
```

### เงื่อนไขเข้า PUT (Sell)
```rust
analysis.choppy_indicator.unwrap_or(100.0) < 45.0
&& analysis.bb_position == "NearLower"               // ราคาวิ่งออกมาทางล่าง
&& analysis.ema_short_direction == "Down"
&& analysis.color == "Red"
```

### จุดแข็ง / จุดอ่อน
- ✅ จับ Momentum หลัง Consolidation ได้ดีเยี่ยม
- ✅ Risk/Reward ดีมากเพราะมักวิ่งต่อเนื่อง
- ❌ ต้องรอนาน (ต้องมี Squeeze ก่อน)

---

## ⚡ S07 — EMA Turn Sniper (จับจุดหักหัวของเส้นสั้น)

### แนวคิด
ใช้ `ema_short_turn_type` จับทันทีที่เส้น EMA Short หักหัวกลับทิศ ถือเป็นสัญญาณเร็วสุดก่อนที่ราคาจะเปลี่ยนทิศ

### เงื่อนไขเข้า CALL (Buy)
```rust
analysis.ema_short_turn_type == "TurnUp"     // เส้นสั้นกำลังหักหัวขึ้น (จุดสำคัญมาก)
&& analysis.ema_medium_direction != "Down"   // เส้นกลางยังไม่ขาลง
&& analysis.rsi_value.unwrap_or(50.0) < 55.0 // RSI ยังไม่ Overbought
&& analysis.l_wick_percent > 40.0            // มีไส้ล่างยาวพอสมควร (rejection)
```

### เงื่อนไขเข้า PUT (Sell)
```rust
analysis.ema_short_turn_type == "TurnDown"
&& analysis.ema_medium_direction != "Up"
&& analysis.rsi_value.unwrap_or(50.0) > 45.0
&& analysis.u_wick_percent > 40.0
```

### จุดแข็ง / จุดอ่อน
- ✅ เข้าเร็วที่สุดในทุกกลยุทธ์
- ✅ เหมาะกับการเทรดแบบ Scalp
- ❌ False Signal สูงกว่ากลยุทธ์อื่น ต้องใช้ Filter เพิ่ม

---

## 💎 S08 — RSI Divergence + BB Extreme (Confluence Reversal)

### แนวคิด
รวมสัญญาณ RSI Extreme กับราคาชน BB ขอบในทิศเดียวกัน แล้วรอยืนยัน EMA หักตัว — Confluence สูงสุด

### เงื่อนไขเข้า CALL (Buy)
```rust
analysis.rsi_value.unwrap_or(50.0) < 30.0        // RSI Oversold รุนแรง
&& analysis.bb_position == "NearLower"            // ราคาชนขอบล่าง BB
&& analysis.ema_short_turn_type == "TurnUp"       // เส้นสั้นหักหัวขึ้นแล้ว
&& analysis.l_wick_percent > 50.0                 // ไส้ล่างยาว = มีแรงซื้อเข้ามา
```

### เงื่อนไขเข้า PUT (Sell)
```rust
analysis.rsi_value.unwrap_or(50.0) > 70.0
&& analysis.bb_position == "NearUpper"
&& analysis.ema_short_turn_type == "TurnDown"
&& analysis.u_wick_percent > 50.0
```

### จุดแข็ง / จุดอ่อน
- ✅ Confluence สูงสุด — Signal คุณภาพดีที่สุด
- ✅ เหมาะกับตลาดที่มี Mean Reversion สูง
- ❌ Signal เกิดน้อย (เงื่อนไขเยอะ)

---

## 🌊 S09 — Trend Continuation Pullback (เข้าจุด Pullback ในเทรนด์)

### แนวคิด
รอให้ราคา Pullback มาแตะแนว EMA Medium แล้วดีดต่อในทิศเทรนด์หลัก

### เงื่อนไขเข้า CALL (Buy)
```rust
analysis.ema_long_direction == "Up"              // เทรนด์ใหญ่ขาขึ้น
&& analysis.ema_medium_direction == "Up"
&& analysis.ema_above == "ShortAbove"
&& analysis.up_con_long_ema > 5                  // เส้นยาวชี้ขึ้นมาต่อเนื่องหลายแท่ง
&& analysis.rsi_value.unwrap_or(50.0) < 50.0     // RSI Pullback ลงมาพอสมควร
&& analysis.choppy_indicator.unwrap_or(100.0) < 55.0
```

### เงื่อนไขเข้า PUT (Sell)
```rust
analysis.ema_long_direction == "Down"
&& analysis.ema_medium_direction == "Down"
&& analysis.down_con_long_ema > 5
&& analysis.rsi_value.unwrap_or(50.0) > 50.0
&& analysis.choppy_indicator.unwrap_or(100.0) < 55.0
```

### จุดแข็ง / จุดอ่อน
- ✅ เข้าได้ Risk ต่ำ (Pullback เข้าหาแนวรับ)
- ✅ ตามเทรนด์ใหญ่ — โอกาสชนะสูง
- ❌ ต้องรอ Pullback เกิดขึ้นก่อน

---

## 🏆 S10 — Full Confluence Power Entry (สัญญาณรวมพลัง)

### แนวคิด
รวมทุกอินดิเคเตอร์ตัดสินใจพร้อมกัน — เมื่อทุกตัวชี้ทิศเดียวกัน โอกาสชนะสูงสุด

### เงื่อนไขเข้า CALL (Buy) — ทุกเงื่อนไขต้องผ่าน
```rust
// EMA Triple Alignment
analysis.ema_short_direction == "Up"
&& analysis.ema_medium_direction == "Up"
&& analysis.ema_long_direction == "Up"
&& analysis.ema_above == "ShortAbove"
&& analysis.ema_long_above == "MediumAbove"

// Momentum
&& analysis.adx_value.unwrap_or(0.0) > 25.0
&& analysis.rsi_value.unwrap_or(50.0) > 40.0
&& analysis.rsi_value.unwrap_or(50.0) < 65.0   // RSI อยู่ในโซนดี ไม่ Overbought

// Volatility OK
&& analysis.choppy_indicator.unwrap_or(100.0) < 50.0
&& analysis.ema_convergence_type == "divergence" // Momentum กำลังเพิ่ม

// Candle confirmation
&& analysis.color == "Green"
&& analysis.body_percent > 40.0                 // แท่งเนื้อหนา
```

### เงื่อนไขเข้า PUT (Sell)
```rust
analysis.ema_short_direction == "Down"
&& analysis.ema_medium_direction == "Down"
&& analysis.ema_long_direction == "Down"
&& analysis.adx_value.unwrap_or(0.0) > 25.0
&& analysis.rsi_value.unwrap_or(50.0) > 35.0
&& analysis.rsi_value.unwrap_or(50.0) < 60.0
&& analysis.choppy_indicator.unwrap_or(100.0) < 50.0
&& analysis.ema_convergence_type == "divergence"
&& analysis.color == "Red"
&& analysis.body_percent > 40.0
```

### Status Code Match
- CALL: `status_desc == "L-UU-U-G-D"` หรือ `"M-UU-U-G-D"`
- PUT:  `status_desc == "L-DD-D-R-D"` หรือ `"M-DD-D-R-D"`

### จุดแข็ง / จุดอ่อน
- ✅ Win rate สูงสุดในทุกกลยุทธ์
- ✅ เหมาะกับเงิน Lot ใหญ่
- ❌ Signal เกิดน้อย — ต้องใช้ความอดทน
- ❌ อาจ Miss หลาย Trade ที่ดี

---

## 🌪️ S11 — ATR Volatility Filter Scalp (Scalp ในช่วง Volatility เหมาะสม)

### แนวคิด
ใช้ ATR คัดกรองให้เทรดเฉพาะช่วงที่ตลาดมีการเคลื่อนที่เพียงพอ (ไม่แฟลตเกินไป ไม่ Spike เกินไป)

### คำนวณ ATR Zone ก่อนเทรด
```rust
let atr_min_threshold = 0.5;   // ATR น้อยเกินไป = ตลาดนิ่ง ไม่เทรด
let atr_max_threshold = 3.0;   // ATR มากเกินไป = ข่าวลาก ไม่เทรด
let atr_ok = analysis.atr > atr_min_threshold && analysis.atr < atr_max_threshold;
```

### เงื่อนไขเข้า CALL (Buy)
```rust
atr_ok
&& analysis.ema_short_direction == "Up"
&& analysis.rsi_value.unwrap_or(50.0) > 45.0
&& analysis.rsi_value.unwrap_or(50.0) < 60.0
&& analysis.bb_position != "NearUpper"           // ไม่เข้าตอนชน BB บน
&& analysis.color == "Green"
```

### เงื่อนไขเข้า PUT (Sell)
```rust
atr_ok
&& analysis.ema_short_direction == "Down"
&& analysis.rsi_value.unwrap_or(50.0) > 40.0
&& analysis.rsi_value.unwrap_or(50.0) < 55.0
&& analysis.bb_position != "NearLower"
&& analysis.color == "Red"
```

### จุดแข็ง / จุดอ่อน
- ✅ ป้องกัน False Signal ในตลาดนิ่งและช่วงข่าว
- ✅ เหมาะกับ Scalper ที่เทรดบ่อย
- ❌ ต้องปรับค่า ATR Threshold ตามแต่ละ Asset

---

## 🎯 S12 — Combo Counter Momentum (นับ Combo เส้น EMA)

### แนวคิด
ใช้ตัวนับ Combo (`up_con_medium_ema`, `down_con_medium_ema`) — ยิ่งเส้น EMA ชี้ทิศเดียวกันต่อเนื่องหลายแท่ง โมเมนตัมยิ่งแข็ง

### เงื่อนไขเข้า CALL (Buy)
```rust
analysis.up_con_medium_ema >= 3                  // เส้นกลางชี้ขึ้นมาต่อเนื่อง 3+ แท่ง
&& analysis.up_con_long_ema >= 2                 // เส้นยาวชี้ขึ้นมาต่อเนื่อง 2+ แท่ง
&& analysis.adx_value.unwrap_or(0.0) > 22.0
&& analysis.rsi_value.unwrap_or(50.0) < 60.0    // ยังไม่ Overbought
&& analysis.choppy_indicator.unwrap_or(100.0) < 55.0
```

### เงื่อนไขเข้า PUT (Sell)
```rust
analysis.down_con_medium_ema >= 3
&& analysis.down_con_long_ema >= 2
&& analysis.adx_value.unwrap_or(0.0) > 22.0
&& analysis.rsi_value.unwrap_or(50.0) > 40.0
&& analysis.choppy_indicator.unwrap_or(100.0) < 55.0
```

### จุดแข็ง / จุดอ่อน
- ✅ ยืนยันได้ว่าเทรนด์ต่อเนื่องจริง ไม่ใช่ spike ชั่วคราว
- ✅ Lag ต่ำกว่า Triple EMA Alignment
- ❌ อาจพลาดจุดเริ่มต้นเทรนด์

---

## 🔧 Template โค้ดสำเร็จรูป (Plug-and-Play)

```rust
use indicator_math_v2::AnalysisResult;

pub enum TradeSignal {
    Call,
    Put,
    NoTrade,
}

pub fn evaluate_signal(analysis: &AnalysisResult) -> TradeSignal {
    // === GLOBAL GUARD — ตรวจก่อนเสมอ ===
    if analysis.is_abnormal_candle
        || analysis.is_abnormal_atr
        || analysis.choppy_indicator.unwrap_or(100.0) > 61.8
    {
        return TradeSignal::NoTrade;
    }

    // === S10: Full Confluence (สัญญาณแรงสุด) ===
    let adx = analysis.adx_value.unwrap_or(0.0);
    let rsi = analysis.rsi_value.unwrap_or(50.0);
    let choppy = analysis.choppy_indicator.unwrap_or(100.0);

    if analysis.ema_short_direction == "Up"
        && analysis.ema_medium_direction == "Up"
        && analysis.ema_long_direction == "Up"
        && analysis.ema_above == "ShortAbove"
        && adx > 25.0
        && rsi > 40.0 && rsi < 65.0
        && choppy < 50.0
        && analysis.color == "Green"
    {
        return TradeSignal::Call;
    }

    if analysis.ema_short_direction == "Down"
        && analysis.ema_medium_direction == "Down"
        && analysis.ema_long_direction == "Down"
        && adx > 25.0
        && rsi > 35.0 && rsi < 60.0
        && choppy < 50.0
        && analysis.color == "Red"
    {
        return TradeSignal::Put;
    }

    // === S08: BB + RSI Extreme Reversal ===
    if rsi < 30.0
        && analysis.bb_position == "NearLower"
        && analysis.ema_short_turn_type == "TurnUp"
        && analysis.l_wick_percent > 50.0
    {
        return TradeSignal::Call;
    }

    if rsi > 70.0
        && analysis.bb_position == "NearUpper"
        && analysis.ema_short_turn_type == "TurnDown"
        && analysis.u_wick_percent > 50.0
    {
        return TradeSignal::Put;
    }

    TradeSignal::NoTrade
}
```

---

## 📊 สรุปภาพรวมกลยุทธ์ทั้งหมด

| กลยุทธ์ | ตลาดที่เหมาะ | Signal บ่อย | Win Rate โดยประมาณ |
|---|---|---|---|
| S01 Triple EMA | Strong Trend | ปานกลาง | สูง |
| S02 BB Reversal | Ranging / Mean Revert | ปานกลาง | ปานกลาง-สูง |
| S03 RSI + EMA | Trend Pullback | บ่อย | ปานกลาง |
| S04 ADX Breakout | Post-Consolidation | น้อย-ปานกลาง | สูง |
| S05 Golden Cross | Trend Change | น้อย | สูง |
| S06 BB Squeeze | Pre-Breakout | น้อย | สูงมาก |
| S07 EMA Turn Sniper | ทุกตลาด | บ่อยมาก | ปานกลาง |
| S08 RSI+BB Confluence | Extreme Reversal | น้อยมาก | สูงมาก |
| S09 Trend Pullback | Trending | ปานกลาง | สูง |
| S10 Full Confluence | Strong Trending | น้อยมาก | สูงที่สุด |
| S11 ATR Scalp | Normal Volatility | บ่อย | ปานกลาง |
| S12 Combo Counter | Trending | ปานกลาง | ปานกลาง-สูง |

---

## ⚠️ ข้อควรระวัง (Disclaimer)

> กลยุทธ์ทั้งหมดนี้เป็น **เพียงโครงสร้างเบื้องต้น** ที่ต้อง **Backtest** กับข้อมูลจริงก่อนนำไปใช้งาน  
> ค่า Threshold ต่างๆ เช่น RSI < 30, ADX > 25, Choppy < 61.8 ควรปรับตาม Asset และ Timeframe ที่ใช้เทรดจริง  
> **ห้าม** ใช้เงินจริงโดยไม่ผ่านการทดสอบย้อนหลัง (Backtesting) อย่างน้อย 500+ แท่ง

---

*สร้างโดย indicator_math_v2 Strategy Plan Generator | อ้างอิงจาก AnalysisResult struct ของ Rust Library*
