# Strategy Plan 2: กลยุทธ์การเทรดแบบครบวงจรจาก indicator_math (V2)

> เอกสารนี้เป็นการขยายจาก `strategy_plan_1.md` โดยรวบรวม **ทุกกลยุทธ์ที่เป็นไปได้** จากการสังเคราะห์ตัวแปรใน `AnalysisResult` / `FullAnalysis` ของไลบรารี `indicator_math_v2`
> ครอบคลุม **EMA (Short/Medium/Long), RSI, ADX, ATR, BB, Choppy Index, MACD-like Convergence/Divergence, Candle Anatomy, EMA Cut/Cross, Consecutive EMA Counters** และ **Status Code**

---

## สารบัญ (Table of Contents)

| # | ชื่อกลยุทธ์ | ประเภท | Indicators หลัก |
|---|---|---|---|
| 1 | Triple EMA Alignment (ราชสีห์จัดหมู่) | Trend | EMA x3 |
| 2 | ADX Power Trend (เทรนด์ทรงพลัง) | Trend | ADX + EMA |
| 3 | Choppy Filter Trend (ตลาดวิ่งแน่ ถึงเข้า) | Trend | Choppy + EMA + ADX |
| 4 | RSI Overbought/Oversold Reversal (สวนเทรนด์ RSI) | Reversal | RSI |
| 5 | BB Bounce (เด้งขอบ Bollinger) | Reversal | BB + RSI |
| 6 | BB + Wick Rejection (ทิ้งไส้ที่ขอบ) | Reversal | BB + Wick% |
| 7 | EMA Short TurnUp/TurnDown (จับจุดหักหัว) | Reversal | EMA Turn Type |
| 8 | Golden/Death Cross (จุดตัดทอง) | Early Trend | EMA Cross + Candles Since |
| 9 | MACD Divergence Acceleration (ถ่างเร่ง) | Momentum | MACD_12/23 + Convergence |
| 10 | MACD Convergence Squeeze (ลู่บีบ) | Anticipation | MACD Convergence |
| 11 | Range Ping-Pong (ปิงปองในกรอบ) | Sideway | Choppy + BB + RSI |
| 12 | Volatility Breakout (ระเบิดราคา) | Breakout | ATR + Abnormal + BB |
| 13 | BB Squeeze → Breakout (บีบแล้วแตก) | Breakout | BB Width + ATR |
| 14 | Candle Anatomy Engulfing (กลืนทั้งแท่ง) | Price Action | Body% + Wick% + Color |
| 15 | Price Position vs EMA (ราคาทะลุ/หลุดเส้น) | Trend Confirm | EMA Cut Position |
| 16 | Consecutive EMA Combo (นับมัดต่อเนื่อง) | Momentum | up/down_con_medium/long |
| 17 | Multi-Timeframe EMA Consensus | Trend | Long + Medium + Short Direction |
| 18 | RSI + ADX Trend Acceleration | Trend | RSI + ADX |
| 19 | Status Code Pattern Matching (สูตรลับรหัส) | Composite | status_desc + status_code |
| 20 | ATR-Based Stop Loss / Take Profit | Risk Mgmt | ATR |

---

## 1. 🦁 Triple EMA Alignment (ราชสีห์จัดหมู่)

**แนวคิด:** เมื่อเส้น EMA ทั้ง 3 เส้น (20, 50, 200) เรียงตัวในทิศทางเดียวกัน มันคือสุดยอดสัญญาณเทรนด์ที่แข็งแกร่งที่สุด

### 🟢 Call (Long)
| ตัวแปร | เงื่อนไข |
|---|---|
| `ema_short_direction` | `"Up"` |
| `ema_medium_direction` | `"Up"` |
| `ema_long_direction` | `"Up"` |
| `ema_above` | `"ShortAbove"` (EMA20 > EMA50) |
| `ema_long_above` | `"MediumAbove"` (EMA50 > EMA200) |

### 🔴 Put (Short)
| ตัวแปร | เงื่อนไข |
|---|---|
| `ema_short_direction` | `"Down"` |
| `ema_medium_direction` | `"Down"` |
| `ema_long_direction` | `"Down"` |
| `ema_above` | `"MediumAbove"` (EMA50 > EMA20) |
| `ema_long_above` | `"LongAbove"` (EMA200 > EMA50) |

**ข้อบังคับ:** `is_abnormal_candle == false`

---

## 2. 💪 ADX Power Trend (เทรนด์ทรงพลัง)

**แนวคิด:** ใช้ ADX เป็นตัวยืนยันความแข็งแกร่งของเทรนด์ EMA

### 🟢 Call
| ตัวแปร | เงื่อนไข | เหตุผล |
|---|---|---|
| `adx_value` | `> 25.0` | เทรนด์แข็ง |
| `ema_short_direction` | `"Up"` | EMA ยังชี้ขึ้น |
| `ema_above` | `"ShortAbove"` | ลำดับเส้นถูกต้อง |
| `color` | `"Green"` | แท่งเขียวยืนยัน |

### 🔴 Put
| ตัวแปร | เงื่อนไข |
|---|---|
| `adx_value` | `> 25.0` |
| `ema_short_direction` | `"Down"` |
| `ema_above` | `"MediumAbove"` |
| `color` | `"Red"` |

**ข้อสังเกต:** ADX วัดแรงของเทรนด์ ไม่ได้วัดทิศทาง จึงต้องจับคู่กับทิศทาง EMA เสมอ

---

## 3. 🌀 Choppy Filter Trend (ตลาดวิ่งแน่ ถึงเข้า)

**แนวคิด:** Choppy Index ต่ำ = ตลาดมี Trend ล่ะ ไม่ต้องกลัวโดนหลอก

### เงื่อนไขหลัก
| ตัวแปร | เงื่อนไข | ความหมาย |
|---|---|---|
| `choppy_indicator` | `< 38.2` | Fibonacci Level → ตลาดวิ่งเป็นเทรนด์ |
| `adx_value` | `> 20.0` | มีเทรนด์ระดับหนึ่ง |

### 🟢 Call: เพิ่มเงื่อนไข `ema_short_direction == "Up"` + `ema_long_above == "MediumAbove"`
### 🔴 Put: เพิ่มเงื่อนไข `ema_short_direction == "Down"` + `ema_long_above == "LongAbove"`

**จุดแข็ง:** กลยุทธ์นี้มี "ตะแกรงกรอง" ด้วย CI ทำให้กรองตลาด sideway ออกไปได้ก่อน ลด False Signal

---

## 4. 📈 RSI Overbought/Oversold Reversal (สวนเทรนด์ RSI)

**แนวคิด:** RSI ไปถึงโซนสุดขีดแล้วชะลอตัวลง → ราคาพร้อมกลับตัว

### 🟢 Call (ช้อนซื้อก้นบ่อ)
| ตัวแปร | เงื่อนไข | ความหมาย |
|---|---|---|
| `rsi_value` | `< 30.0` | Oversold |
| `color` | `"Green"` | แท่งนี้เริ่มเขียว (ตี Confirm) |
| `ema_short_turn_type` | `"TurnUp"` *(Optional)* | EMA กลับตัวตอบรับ |

### 🔴 Put (ขายจุดสูงสุด)
| ตัวแปร | เงื่อนไข |
|---|---|
| `rsi_value` | `> 70.0` |
| `color` | `"Red"` |
| `ema_short_turn_type` | `"TurnDown"` *(Optional)* |

---

## 5. 🎰 BB Bounce (เด้งขอบ Bollinger)

**แนวคิด:** ราคาชนขอบ BB แล้วเด้งกลับ ตำราคลาสสิคสุดของกลยุทธ์ Reversal

### 🟢 Call
| ตัวแปร | เงื่อนไข |
|---|---|
| `bb_position` | `"NearLower"` |
| `rsi_value` | `< 40` *(ไม่จำเป็นต้อง Oversold เต็มขีดก็ได้)* |
| `color` | `"Green"` *(แท่งเขียวเด้งกลับ)* |

### 🔴 Put
| ตัวแปร | เงื่อนไข |
|---|---|
| `bb_position` | `"NearUpper"` |
| `rsi_value` | `> 60` |
| `color` | `"Red"` |

---

## 6. 🕯️ BB + Wick Rejection (ทิ้งไส้ที่ขอบ = สัญญาณความตั้งใจเด้ง)

**แนวคิด:** ราคาพุ่งไปชนขอบ BB แต่ถูกตีกลับจนเกิดไส้เทียนยาว → มี Buyer/Seller ใหญ่ดันกลับ

### 🟢 Call
| ตัวแปร | เงื่อนไข | ความหมาย |
|---|---|---|
| `bb_position` | `"NearLower"` | ราคาแตะขอบล่าง |
| `l_wick_percent` | `> 50.0` | ไส้เทียนล่างยาวมาก (มีแรงซื้อรับ) |
| `body_percent` | `< 30.0` | เนื้อเทียนเล็ก (หมดแรงขาย) |

### 🔴 Put
| ตัวแปร | เงื่อนไข |
|---|---|
| `bb_position` | `"NearUpper"` |
| `u_wick_percent` | `> 50.0` |
| `body_percent` | `< 30.0` |

**ข้อสังเกต:** กลยุทธ์นี้เหมาะกับตลาด sideway → จับคู่กับ `choppy_indicator > 50` ยิ่งดี

---

## 7. 🔄 EMA Short TurnUp/TurnDown (จับจุดหักหัว)

**แนวคิด:** EMA ระยะสั้นเป็นตัวไวที่สุด เมื่อมันหักหัว (Turn) = ราคากำลังเริ่มเปลี่ยนทิศ

### 🟢 Call
| ตัวแปร | เงื่อนไข | ความหมาย |
|---|---|---|
| `ema_short_turn_type` | `"TurnUp"` | เส้นสั้นหักหัวขึ้น |
| `ema_medium_direction` | `"Up"` หรือ `"Flat"` | เส้นกลางไม่ขัดโดยชี้ลง |
| `rsi_value` | `< 50` *(Optional)* | ยังอยู่โซนต่ำ ยิ่งมีอัพไซด์เยอะ |

### 🔴 Put
| ตัวแปร | เงื่อนไข |
|---|---|
| `ema_short_turn_type` | `"TurnDown"` |
| `ema_medium_direction` | `"Down"` หรือ `"Flat"` |
| `rsi_value` | `> 50` *(Optional)* |

**จุดแข็ง:** เข้าไวกว่ากลยุทธ์บริสุทธิ์ EMA Cross เชิงเทียน เหมาะสำหรับ Scalping

---

## 8. ⚔️ Golden/Death Cross (จุดตัดทอง)

**แนวคิด:** จุดที่ EMA Medium ตัดผ่าน EMA Long → เปลี่ยนโครงสร้าง (Phase Shift) ของตลาดเลย

### 🟢 Call (Golden Cross)
| ตัวแปร | เงื่อนไข | ความหมาย |
|---|---|---|
| `ema_cut_long_type` | `"UpTrend"` | EMA50 ตัดขึ้นเหนือ EMA200 |
| `candles_since_ema_cut` | `<= 5` | เพิ่งตัดไม่นาน แรงส่งยังเหลือ |
| `ema_long_convergence_type` | `"D"` (Divergence) | เส้นถ่างออก = แรงเทรนด์ใหม่กำลังมา |

### 🔴 Put (Death Cross)
| ตัวแปร | เงื่อนไข |
|---|---|
| `ema_cut_long_type` | `"DownTrend"` |
| `candles_since_ema_cut` | `<= 5` |
| `ema_long_convergence_type` | `"D"` |

**เสริม:** หากเป็นจุด Cross สดๆ (`candles_since_ema_cut == 0`) สัญญาณจะแรงที่สุด

---

## 9. 📊 MACD Divergence Acceleration (MACD ถ่างเร่ง)

**แนวคิด:** เมื่อระยะห่างระหว่าง EMA กว้างขึ้นเรื่อยๆ (Diverging) = โมเมนตัมแข็ง, เทรนด์ยังไม่จบ

### 🟢 Call
| ตัวแปร | เงื่อนไข | ความหมาย |
|---|---|---|
| `ema_convergence_type` | `"divergence"` | EMA สั้น-กลาง ถ่างออก |
| `ema_long_convergence_type` | `"D"` | EMA กลาง-ยาว ถ่างออกด้วย |
| `macd_12` | `> previous_macd_12` | ห่างมากขึ้นจริงๆ ในเชิงตัวเลข |
| `ema_above` | `"ShortAbove"` | อยู่ด้านบน (Bullish Stance) |

### 🔴 Put
| ตัวแปร | เงื่อนไข |
|---|---|
| `ema_convergence_type` | `"divergence"` |
| `ema_long_convergence_type` | `"D"` |
| `macd_12` | `> previous_macd_12` |
| `ema_above` | `"MediumAbove"` |

---

## 10. 🤏 MACD Convergence Squeeze (ลู่บีบ → เตรียมวิ่ง)

**แนวคิด:** เส้น EMA กำลังลู่เข้าหากัน (Converging) = ตลาดกำลังอัดตัว → เตรียมระเบิดวิ่ง

### เงื่อนไขหลัก
| ตัวแปร | เงื่อนไข | ความหมาย |
|---|---|---|
| `ema_convergence_type` | `"convergence"` | EMA สั้น-กลาง ลู่เข้า |
| `macd_12` | `< macd_narrow (0.15)` หรือ ค่าต่ำลงเรื่อยๆ | เกือบจะชนกันแล้ว |
| `choppy_indicator` | `> 50` → `< 38.2` (ขาลง) | กำลังเปลี่ยนจาก sideway เป็น trend |

### ทิศทางเทรด
- ดู `ema_short_turn_type`: ถ้า `"TurnUp"` → **Call**, ถ้า `"TurnDown"` → **Put**
- หรือดูแท่งเทียนที่ "แหกวง": สีเขียวเนื้อหนา (`color == "Green"` + `body_percent > 60`) → **Call**

---

## 11. 🏓 Range Ping-Pong (ปิงปองในกรอบไซด์เวย์)

**แนวคิด:** ตลาดไร้เทรนด์ → ซื้อ-ขายสวนทุกครั้งที่ราคาวิ่งถึงขอบ

### เงื่อนไขยืนยันตลาด Sideway
| ตัวแปร | เงื่อนไข |
|---|---|
| `choppy_indicator` | `> 61.8` |
| `adx_value` | `< 20.0` |
| `ema_medium_direction` | `"Flat"` *(ยิ่งดี)* |

### 🟢 Call (ซื้อขอบล่าง)
| ตัวแปร | เงื่อนไข |
|---|---|
| `bb_position` | `"NearLower"` |
| `rsi_value` | `< 40` |

### 🔴 Put (ขายขอบบน)
| ตัวแปร | เงื่อนไข |
|---|---|
| `bb_position` | `"NearUpper"` |
| `rsi_value` | `> 60` |

---

## 12. 💥 Volatility Breakout (ระเบิดราคา)

**แนวคิด:** หลังจากตลาดสงบนิ่ง ก็จะมีแท่งเทียนยักษ์พุ่งระเบิดออกมา → เข้าตามทิศทางที่มันวิ่ง

### เงื่อนไข (เข้าตาม Breakout Direction)
| ตัวแปร | เงื่อนไข | ความหมาย |
|---|---|---|
| `is_abnormal_atr` | `true` | แท่งนี้ขนาดมหึมาเมื่อเทียบ ATR |
| `body_percent` | `> 70.0` | เนื้อเทียนตัน ไม่ทิ้งไส้ (แรงรุนแรง) |
| `adx_value` | `> 20.0` (กำลังเพิ่ม) | มีแรงส่ง |

### ทิศทางเทรด
- `color == "Green"` → **Call** (Breakout ขาขึ้น)
- `color == "Red"` → **Put** (Breakout ขาลง)

**คำเตือน:** อาจจะเป็นข่าวลาก กลยุทธ์นี้ลูกค้า High Risk เท่านั้น ต้องมี Stop Loss ที่ชัดเจน

---

## 13. 🧊 BB Squeeze → Breakout (บีบแล้วแตก)

**แนวคิด:** เมื่อ Bollinger Bands บีบแคบ (BB Width ต่ำ) = ตลาดสะสมพลังงาน → เข้าเมื่อแตกออก

### เงื่อนไข "อยู่ในกรอบบีบ"
| ตัวแปร | เงื่อนไข | ความหมาย |
|---|---|---|
| `bb_upper - bb_lower` | ค่าน้อยกว่าปกติ (เทียบกับแท่งก่อนหน้า) | BB กำลังบีบแคบ |
| `choppy_indicator` | `> 55` | ตลาดยัง sideway อัดตัว |
| `adx_value` | `< 20` | เทรนด์ยังอ่อนแอ |

### เงื่อนไข "ทะลุ Breakout"
| ตัวแปร | เงื่อนไข |
|---|---|
| `close > bb_upper` | ทะลุขอบบน → **Call** |
| `close < bb_lower` | ทะลุขอบล่าง → **Put** |
| `body_percent` | `> 60` (แท่งทะลุต้องตันๆ) |
| `adx_value` | กำลังพุ่งขึ้น (เหนือ 20) |

---

## 14. 🕯️ Candle Anatomy: Engulfing / Hammer / Shooting Star

**แนวคิด:** อ่าน Price Action จากโครงสร้างแท่งเทียน (ไส้, เนื้อ, สัดส่วน)

### 🔨 Hammer (ค้อน → Call)
| ตัวแปร | เงื่อนไข | ความหมาย |
|---|---|---|
| `l_wick_percent` | `> 60.0` | ไส้ล่างยาวมาก |
| `u_wick_percent` | `< 10.0` | ไส้บนแทบไม่มี |
| `body_percent` | `< 30.0` | เนื้อเทียนเล็ก |
| `bb_position` | `"NearLower"` หรือ `"Middle"` | ไม่ได้อยู่ข้างบน |

### ⭐ Shooting Star (ดาวตก → Put)
| ตัวแปร | เงื่อนไข |
|---|---|
| `u_wick_percent` | `> 60.0` |
| `l_wick_percent` | `< 10.0` |
| `body_percent` | `< 30.0` |
| `bb_position` | `"NearUpper"` หรือ `"Middle"` |

### 🐂 Bullish Marubozu (แท่งหุ้มยาวขึ้น → Call)
| ตัวแปร | เงื่อนไข |
|---|---|
| `body_percent` | `> 85.0` |
| `color` | `"Green"` |
| `u_wick_percent` + `l_wick_percent` | ทั้งคู่ < 10% |

### 🐻 Bearish Marubozu (แท่งหุ้มยาวลง → Put)
| ตัวแปร | เงื่อนไข |
|---|---|
| `body_percent` | `> 85.0` |
| `color` | `"Red"` |

### Doji (ลังเล → ห้ามเข้า หรือรอ Confirm)
| ตัวแปร | เงื่อนไข |
|---|---|
| `body_percent` | `< 5.0` |
| `color` | `"Equal"` |

---

## 15. 📍 Price Position vs EMA (ราคาทะลุ/หลุดเส้น EMA)

**แนวคิด:** ใช้ `ema_cut_position` วิเคราะห์ว่าเส้น EMA "ตรึง" อยู่ตรงจุดไหนของแท่งเทียน เพื่อหาแรงกดดัน

### ตำแหน่ง Cut Position (EMA Short เทียบกับแท่งเทียน)
| `ema_cut_position` | ความหมาย | แนวโน้มเทรด |
|---|---|---|
| `"4"` | EMA อยู่ต่ำกว่าขอบล่าง → ราคาอยู่เหนือ EMA มาก | **Call** (เทรนด์แข็งแรงขาขึ้น) |
| `"3"` | EMA อยู่แถวไส้ล่าง → ราคาอยู่เหนือ EMA นิดหน่อย | Call (ระวังถอยตัว) |
| `"B1"` / `"B2"` / `"B3"` | EMA อยู่ในตัวเนื้อแท่งเทียน | สัญญาณคลุมเครือ - หลีกเลี่ยง |
| `"2"` | EMA อยู่แถวไส้บน → ราคาอยู่ใกล้ เตรียมทะลุหรือหลุด | รอดู |
| `"1"` | EMA อยู่สูงกว่าแท่งเทียน → ราคาถูกกดทับ | **Put** (เทรนด์ขาลง) |

### กลยุทธ์ "ทะลุ EMA"
- ถ้าแท่งก่อนหน้า `ema_cut_position == "1"` แล้วแท่งนี้ `== "B1"` หรือ `"2"` → ราคากำลังไต่ขึ้น ตีทะลุ EMA → **Call**
- ถ้าแท่งก่อนหน้า `ema_cut_position == "4"` แล้วแท่งนี้ `== "B3"` หรือ `"3"` → ราคากำลังร่วง หลุด EMA → **Put**

---

## 16. 🔢 Consecutive EMA Combo (นับมัดต่อเนื่อง)

**แนวคิด:** ยิ่ง EMA ชี้ไปทิศเดียวกันหลายแท่งติดกัน แปลว่าเทรนด์มั่นคง

### 🟢 Call (ขาขึ้นต่อเนื่อง)
| ตัวแปร | เงื่อนไข | ความหมาย |
|---|---|---|
| `up_con_medium_ema` | `>= 5` | EMA กลาง ชี้ขึ้นแล้ว 5 แท่งติดๆ |
| `up_con_long_ema` | `>= 3` | EMA ยาว ชี้ขึ้นแล้ว 3 แท่ง (อันนี้ช้ากว่า แต่แรงกว่า) |
| `ema_above` | `"ShortAbove"` | เรียงตัวถูกต้อง |

### 🔴 Put (ขาลงต่อเนื่อง)
| ตัวแปร | เงื่อนไข |
|---|---|
| `down_con_medium_ema` | `>= 5` |
| `down_con_long_ema` | `>= 3` |
| `ema_above` | `"MediumAbove"` |

**จุดสังเกตเพิ่มเติม:** หาก Combo กำลังจะสิ้นสุด (เช่น `up_con_medium_ema` เพิ่งรีเซ็ตจาก 10 เป็น 0) → สัญญาณเตือนเทรนด์อ่อนแรง

---

## 17. 🌐 Multi-Timeframe EMA Consensus (สองในสามชี้ = เชื่อได้)

**แนวคิด:** ไม่จำเป็นต้องชี้ทิศทางเดียวกันหมด "สองในสาม" ก็เพียงพอแล้ว

### 🟢 Call (สองในสามชี้ขึ้น)
- `ema_short_direction == "Up"` + `ema_medium_direction == "Up"` (Long อาจ Flat ก็ได้)
- หรือ `ema_medium_direction == "Up"` + `ema_long_direction == "Up"` (Short อาจกำลัง TurnUp)

### 🔴 Put (สองในสามชี้ลง)
- `ema_short_direction == "Down"` + `ema_medium_direction == "Down"`
- หรือ `ema_medium_direction == "Down"` + `ema_long_direction == "Down"`

**เสริม:** ถ้า Short ชี้ทิศทางตรงกันข้ามกับ Medium+Long → เป็นสัญญาณ "Pullback ระยะสั้น" ให้รอ Short กลับตัวก่อนค่อยเข้า

---

## 18. ⚡ RSI + ADX Trend Acceleration (เทรนด์เร่งความเร็ว)

**แนวคิด:** ใช้ RSI เช็คว่าเทรนด์จะไหวต่อไหม (ดูว่ายังไม่อิ่มตัว) + ADX เช็คว่ากำลังแข็ง

### 🟢 Call (เทรนด์ขึ้นกำลังเร่ง)
| ตัวแปร | เงื่อนไข | ความหมาย |
|---|---|---|
| `adx_value` | `> 25.0` | เทรนด์แข็ง |
| `rsi_value` | `50 - 70` | ยังไม่ Overbought (ไม่อิ่ม) |
| `ema_short_direction` | `"Up"` | ทิศทางถูก |
| `choppy_indicator` | `< 50` | ไม่ Choppy |

### 🔴 Put (เทรนด์ลงกำลังเร่ง)
| ตัวแปร | เงื่อนไข |
|---|---|
| `adx_value` | `> 25.0` |
| `rsi_value` | `30 - 50` |
| `ema_short_direction` | `"Down"` |
| `choppy_indicator` | `< 50` |

**จุดแข็ง:** RSI อยู่โซนกลาง = ยังมี "Runway" ให้วิ่งต่อ ไม่ต้องกลัวว่าจะ OB/OS ทันที

---

## 19. 🔐 Status Code Pattern Matching (สูตรลับรหัส)

**แนวคิด:** ระบบ `status_desc` สรุปทุกอย่างมาในรหัสเดียว เทรดเดอร์สามารถสร้าง "สูตร" จาก Pattern ที่เคย Backtest แล้ว

### โครงสร้าง `status_desc`
```
{EMA_Long_Above}-{Medium_Dir}{Long_Dir}-{Color}-{Long_Convergence}
ตัวอย่าง: "M-UU-G-D"
```
- ตัวที่ 1: `M` (Medium Above) / `L` (Long Above)
- ตัวที่ 2-3: `UU`, `UD`, `DD`, `DU`, `FU`, `FD`, `FF`, `UF`, `DF` (ทิศทาง Medium + Long)
- ตัวที่ 4: `G` (Green) / `R` (Red) / `E` (Equal)
- ตัวที่ 5: `C` (Converge) / `D` (Diverge) / `N` (Narrow/Neutral)

### ตัวอย่างกลยุทธ์สำเร็จรูป

#### 🟢 Bullish Codes (Strong Call)
| `status_desc` | `status_code` | ความหมาย |
|---|---|---|
| `"M-UU-G-D"` | `80` | MediumAbove + ทั้งคู่ชี้ขึ้น + แท่งเขียว + ถ่างออก → **Super Bullish** |
| `"M-UU-G-C"` | `79` | เหมือนกัน แต่เส้นลู่เข้า → เทรนด์กำลังจางลง (ใช้จังหวะสั้น) |
| `"M-FU-G-D"` | คำนวณ | Medium Flat + Long ขึ้น + เขียว + ถ่าง → เทรนด์ระยะยาวเข้ม |

#### 🔴 Bearish Codes (Strong Put)
| `status_desc` | `status_code` | ความหมาย |
|---|---|---|
| `"L-DD-R-D"` | `6` | LongAbove + ทั้งคู่ชี้ลง + แท่งแดง + ถ่างออก → **Super Bearish** |
| `"L-DD-R-C"` | `5` | เหมือนกัน แต่ลู่เข้า → ขาลงกำลังอ่อนตัว |
| `"L-FD-R-D"` | `60` | Medium Flat + Long down + แดง + ถ่าง |

#### ⚠️ Warning Codes (ห้ามเทรด)
| `status_desc` ที่มี | ความหมาย |
|---|---|
| `*-FF-*-N` | ทุกเส้น Flat + Narrow → ตลาดตาย ไม่มีจังหวะ |
| `*-*-E-*` | แท่งเสมอ (Equal) → กำลังลังเล |

### การใช้งาน
```rust
// ดักจับ Pattern จากตัวแปรโดยตรง
match analysis.status_desc.as_str() {
    "M-UU-G-D" | "M-UU-G-C" => execute_trade("CALL", asset, amount),
    "L-DD-R-D" | "L-DD-R-C" => execute_trade("PUT", asset, amount),
    desc if desc.contains("-FF-") => pause_trading(asset),
    _ => { /* ไม่ตรงกับสูตร → ข้ามไป */ }
}
```

---

## 20. 📏 ATR-Based Stop Loss / Take Profit (จัดการเงินด้วย ATR)

**แนวคิด:** ไม่ใช่กลยุทธ์ "เข้า" แต่เป็นกลยุทธ์ "จัดการความเสี่ยง" ที่ดีที่สุด

### วิธีคำนวณ
| พารามิเตอร์ | สูตร | ตัวอย่าง (ATR = 1.4) |
|---|---|---|
| **Stop Loss** | `entry_price ± (atr × 1.5)` | 1.4 × 1.5 = 2.1 จุด |
| **Take Profit** | `entry_price ± (atr × 2.0)` | 1.4 × 2.0 = 2.8 จุด |
| **Risk:Reward** | 1 : 1.33 (ขั้นต่ำ) | ยอมเสีย 2.1 เพื่อเอา 2.8 |

### กฎพิเศษ
- ถ้า `is_abnormal_atr == true` → ATR กำลังบวม ให้ **ขยาย** SL/TP เป็น 2× ปกติ
- ถ้า `choppy_indicator > 61.8` → ตลาด sideway ให้ **ลด** TP ลงเหลือ `atr × 1.0` เพราะราคาวิ่งไม่ไกล

---

---

## 🔗 กลยุทธ์ผสม (Composite / Multi-Indicator Strategies)

กลยุทธ์ด้านล่างนี้เป็นการ "ผสม" หลาย Indicator เข้าด้วยกันเพื่อเพิ่มอัตราชนะ (Win Rate)

---

### 21. 🏆 Full Confluence Call (สัญญาณรวมพลังทั้งหมดเห็นพ้อง)

**แนวคิด:** เข้าเทรดก็ต่อเมื่อ **ทุกส่วน** ของระบบชี้ไปในทิศทางเดียวกันหมด

#### 🟢 Call - เงื่อนไขทั้งหมดต้องตรง:
| # | ตัวแปร | เงื่อนไข |
|---|---|---|
| 1 | `ema_short_direction` | `"Up"` |
| 2 | `ema_medium_direction` | `"Up"` |
| 3 | `ema_long_direction` | `"Up"` |
| 4 | `ema_above` | `"ShortAbove"` |
| 5 | `ema_long_above` | `"MediumAbove"` |
| 6 | `adx_value` | `> 25` |
| 7 | `choppy_indicator` | `< 38.2` |
| 8 | `rsi_value` | `50 - 70` (ไม่ OB) |
| 9 | `bb_position` | `"NearUpper"` หรือ `"Middle"` (ไม่ได้เกาะขอบล่าง) |
| 10 | `color` | `"Green"` |
| 11 | `is_abnormal_candle` | `false` |
| 12 | `ema_convergence_type` | `"divergence"` |

**อัตราชนะคาดการณ์:** สูงมาก (70%+) เพราะทุกตัวชี้วัดต่างยืนยัน แต่โอกาสเจอ Setup นี้จะ **หายาก**

---

### 22. 🎯 Pullback Entry (เข้าตอนราคาถอนตัว)

**แนวคิด:** ตลาดมีเทรนด์ดีอยู่แล้ว แต่แทนที่จะเข้าตอน "กำลังวิ่ง" กลับรอให้มัน "ถอยตัวลงมาเบาๆ" แล้วค่อยเข้า

#### 🟢 Call (Pullback in Uptrend)
| # | ตัวแปร | เงื่อนไข | ความหมาย |
|---|---|---|---|
| 1 | `ema_long_above` | `"MediumAbove"` | เทรนด์ใหญ่ยังเป็นขาขึ้น |
| 2 | `up_con_long_ema` | `>= 5` | EMA Long ชี้ขึ้นนาน → เสาหลักยัง OK |
| 3 | `ema_short_direction` | `"Down"` หรือ `"Flat"` | EMA สั้นกำลังถอยตัว (Pullback) |
| 4 | `bb_position` | `"Middle"` หรือ `"NearLower"` | ถอยมาจนเกือบถึงขอบล่างแล้ว |
| 5 | `rsi_value` | `35 - 50` | RSI ย่อตัวลงมาแต่ยังไม่ oversold |
| 6 | `ema_short_turn_type` | `"TurnUp"` ⭐ | ✅ จังหวะเด็ด: EMA สั้นเพิ่งหักหัวกลับขึ้น! |

#### 🔴 Put (Pullback in Downtrend)
- เงื่อนไขตรงข้าม: เทรนด์ลง + EMA สั้นชี้ขึ้นชั่วคราว + RSI 50-65 + `ema_short_turn_type == "TurnDown"`

---

### 23. 🌊 Wave Rider (ขี่คลื่นเทรนด์ยาว)

**แนวคิด:** ใช้ EMA Long เป็นเสาเข็ม + MACD Divergence เป็นไม้กระดาน เพื่อขี่คลื่นสวิงระยะยาว

#### 🟢 Call
| ตัวแปร | เงื่อนไข |
|---|---|
| `ema_long_direction` | `"Up"` |
| `ema_long_above` | `"MediumAbove"` |
| `ema_long_convergence_type` | `"D"` (Diverge = ถ่างออก) |
| `up_con_long_ema` | `>= 10` (ขึ้นมานาน 10 แท่ง) |
| `adx_value` | `> 25` |

#### ออกเทรด (Exit Condition)
- เมื่อ `ema_long_convergence_type` เปลี่ยนเป็น `"C"` (เริ่มลู่เข้า)
- หรือ `up_con_long_ema` กลายเป็น 0 (EMA Long หยุดชี้ขึ้น)

---

### 24. 🔀 RSI Divergence with Price (ส่วนต่าง RSI กับราคา)

**แนวคิด:** ราคาทำ New High แต่ RSI ไม่ทำตาม (Bearish Divergence) หรือราคาทำ New Low แต่ RSI ไม่ลง (Bullish Divergence)

> ⚠️ หมายเหตุ: กลยุทธ์นี้ต้องเปรียบเทียบ RSI ข้ามแท่ง อาจต้องเก็บ history ไว้เองเพิ่มเติมใน bot logic

#### 🟢 Bullish Divergence → Call
| สิ่งที่เกิด | ความหมาย |
|---|---|
| `close` แท่งนี้ < `close` แท่ง N แท่งก่อน | ราคาทำ lower low |
| `rsi_value` แท่งนี้ > `rsi_value` แท่ง N แท่งก่อน | RSI ปฏิเสธ lower low → แรงซื้อซ่อนอยู่ |

#### 🔴 Bearish Divergence → Put
| สิ่งที่เกิด | ความหมาย |
|---|---|
| `close` แท่งนี้ > `close` จากก่อน | ราคาทำ higher high |
| `rsi_value` แท่งนี้ < `rsi_value` จากก่อน | RSI ปฏิเสธ higher high → แรงขายซ่อนอยู่ |

---

### 25. 🧩 Color + EMA Direction Mismatch (สีขัดทิศ = ตลาดกำลังเปลี่ยน)

**แนวคิด:** ถ้าแท่งเทียนสีขัดกับทิศทาง EMA = ราคากำลังต่อต้านเทรนด์ อาจกำลังจะกลับตัว

#### สัญญาณเตือนก่อนกลับตัว
| สถานการณ์ | ออก/หยุดเทรด |
|---|---|
| `color == "Red"` แต่ `ema_short_direction == "Up"` | ⚠️ ขาขึ้นเริ่มมี Seller เข้ามา |
| `color == "Green"` แต่ `ema_short_direction == "Down"` | ⚠️ ขาลงเริ่มมี Buyer เข้ามา |

ถ้าเกิดเหตุนี้ **ติดต่อกัน 2-3 แท่ง** → เป็นสัญญาณว่ากำลังจะเกิด Reversal

---

## 🛡️ กฎเหล็กความปลอดภัยระดับโปร (Advanced Safety Filters)

### Filter Level 1: ห้ามเทรดเด็ดขาด
| เงื่อนไข | เหตุผล |
|---|---|
| `is_abnormal_candle == true` | ข่าวหลุด กราฟกระชาก |
| `color == "Equal"` + `body_percent < 3.0` | Doji เต็มตัว → ตลาดสนิท |
| `choppy_indicator > 70.0` (เฉพาะกลยุทธ์ Trend) | ตลาด sideway รุนแรง |

### Filter Level 2: ลดขนาดการเทรด (ลด Position Size)
| เงื่อนไข | คำแนะนำ |
|---|---|
| `adx_value` อยู่ระหว่าง 15-20 | เทรนด์อ่อนแอ → เทรดครึ่งไม้ |
| `choppy_indicator` 50-65 | ใกล้จะเป็น sideway → ลดขนาด |
| `is_abnormal_atr == true` | ATR พุ่งแต่ไม่ Abnormal Candle → ตลาดเริ่มมีความตื่น |

### Filter Level 3: Time-Based Cooldown
| เงื่อนไข | คำแนะนำ |
|---|---|
| หลังจาก `is_abnormal_candle == true` | **พักเทรด 3 แท่ง** ก่อนเข้าใหม่ |
| หลังจาก Loss ติดกัน (`loss_con >= 3`) | พักเทรด 5 แท่ง + ลดไม้ 50% |
| หลังจาก Win ติดกัน (`win_con >= 5`) | ⚠️ อาจจะผิดพลาดจากความมั่นใจ → ให้ลด Position Size |

---

## 📋 สรุปตาราง Quick Reference: เลือกกลยุทธ์ตามสภาพตลาด

| สภาพตลาด | Choppy | ADX | กลยุทธ์ที่เหมาะ |
|---|---|---|---|
| 🔥 **เทรนด์แข็งแรง** | < 38.2 | > 25 | #1, #2, #3, #9, #16, #18, #21, #23 |
| 🌊 **เทรนด์ปานกลาง** | 38.2 - 50 | 20-25 | #8, #17, #22 |
| 🏓 **ไซด์เวย์** | > 61.8 | < 20 | #5, #6, #11, #14 |
| 🔄 **จุดกลับตัว** | ค่าใดก็ได้ | ค่าใดก็ได้ | #4, #7, #24, #25 |
| 💥 **ระเบิด Breakout** | กำลังลดลง | กำลังเพิ่มขึ้น | #12, #13 |
| 🚀 **เทรนด์เริ่มต้นใหม่** | > 50 → < 38.2 | < 20 → > 25 | #8, #10 |

---

## 🏗️ Architecture: วิธีติดตั้งกลยุทธ์ใน Rust Bot

```rust
fn evaluate_strategies(analysis: &AnalysisResult) -> Option<TradeSignal> {
    // Safety Filters First (ถ้าไม่ผ่าน → ไม่เทรด)
    if analysis.is_abnormal_candle { return None; }
    if analysis.color == "Equal" && analysis.body_percent < 3.0 { return None; }
    
    let choppy = analysis.choppy_indicator.unwrap_or(100.0);
    let adx = analysis.adx_value.unwrap_or(0.0);
    let rsi = analysis.rsi_value.unwrap_or(50.0);
    
    // === ตลาดมีเทรนด์ (Trending Market) ===
    if choppy < 38.2 && adx > 25.0 {
        // Strategy #1: Triple EMA Alignment
        if analysis.ema_short_direction == "Up" 
            && analysis.ema_medium_direction == "Up"
            && analysis.ema_long_direction == "Up" 
            && analysis.ema_above.as_deref() == Some("ShortAbove") {
            return Some(TradeSignal::Call);
        }
        if analysis.ema_short_direction == "Down"
            && analysis.ema_medium_direction == "Down"
            && analysis.ema_long_direction == "Down"
            && analysis.ema_above.as_deref() == Some("MediumAbove") {
            return Some(TradeSignal::Put);
        }
        
        // Strategy #18: RSI + ADX Acceleration
        if rsi > 50.0 && rsi < 70.0 && analysis.ema_short_direction == "Up" {
            return Some(TradeSignal::Call);
        }
    }
    
    // === ตลาดไซด์เวย์ (Sideway Market) ===
    if choppy > 61.8 && adx < 20.0 {
        // Strategy #11: Range Ping-Pong
        if analysis.bb_position == "NearLower" && rsi < 40.0 {
            return Some(TradeSignal::Call);
        }
        if analysis.bb_position == "NearUpper" && rsi > 60.0 {
            return Some(TradeSignal::Put);
        }
    }
    
    // === Reversal Signals (ตลาดแบบไหนก็จับได้) ===
    // Strategy #6: BB + Wick Rejection
    if analysis.bb_position == "NearLower" && analysis.l_wick_percent > 50.0 {
        return Some(TradeSignal::Call);
    }
    if analysis.bb_position == "NearUpper" && analysis.u_wick_percent > 50.0 {
        return Some(TradeSignal::Put);
    }
    
    // Strategy #7: EMA Turn
    if analysis.ema_short_turn_type == "TurnUp" && rsi < 50.0 {
        return Some(TradeSignal::Call);
    }
    if analysis.ema_short_turn_type == "TurnDown" && rsi > 50.0 {
        return Some(TradeSignal::Put);
    }
    
    None
}
```

---

> **หมายเหตุ:** กลยุทธ์ทั้งหมดข้างต้นเป็น **แนวทาง** ที่ต้องนำไป **Backtest** กับข้อมูลจริงก่อนใช้งาน ค่าพารามิเตอร์ต่างๆ (เช่น RSI 30/70, ADX 25, Choppy 38.2/61.8) สามารถปรับแต่งได้ตาม Asset และ Time Frame ที่เทรด
