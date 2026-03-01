# 📈 Strategy Plan 4: Smart Money Concepts (SMC) Entry Strategy

แผนการเทรดนี้ถูกสร้างขึ้นมาเพื่อใช้ประโยชน์จากการวิเคราะห์ SMC (Smart Money Concepts) ที่ถูกเพิ่มเข้ามาใน `analysisResult.smc` โดยเน้นไปที่ **การหาจุดเข้าซื้อที่มีความแม่นยำสูง (High Probability Entries)** ผ่านการอ่านโครงสร้างตลาด, พฤติกรรมราคา และ โซนสภาพคล่อง (Liquidity)

---

## 🧩 1. ภาพรวมของ SMC Components ในระบบ
จากข้อมูลที่อยู่ใน `analysisResult.smc` เรามีอาวุธสำคัญที่จะนำมาใช้ดังนี้:
* **Trend Analysis (`swing_trend`, `internal_trend`)**: บอกทิศทางหลักและทิศทางย่อย
* **Market Structure (`structures`)**: ควบคุมจังหวะ Break of Structure (BOS) และ Change of Character (CHoCH)
* **Premium & Discount Zones (`premium_discount_zone`)**: แบ่งโซนราคาแพง (สำหรับขาย) และราคาถูก (สำหรับซื้อ)
* **Point of Interest / POI (`order_blocks`, `fair_value_gaps`)**: จุดที่คาดว่าจะมีปฏิกิริยาราคา (Order Block และ FVG ที่ยังไม่ถูกใช้ - unmitigated/unfilled)
* **Liquidity (`equal_highs_lows`)**: เช็คจุดที่มี Stop Loss หนาแน่น เพื่อดักรอการกวาดสภาพคล่อง (Sweep) ก่อนเข้าเทรด

---

## 🎯 2. กลยุทธ์การหา "Best Entry" (จุดเข้าซื้อที่ดีที่สุด)

เพื่อให้ได้จุดเข้าเทรด (Trigger) ที่ดีที่สุด เราจะใช้กระบวนการ 4 ขั้นตอน (4-Step SMC Entry Model)

### 🟢 กฎการเข้าออเดอร์ CALL (Buy) - "Discount & Sweep Setup"
1. **Bias (ทิศทางหลัก):** `swing_trend` ต้องเป็น `"bullish"` (แนวโน้มหลักเป็นขาขึ้น)
2. **Zone (รอราคาถูก):** ราคาปัจจุบัน (Close) ต้องย่อลงมาอยู่ในโซน **Discount** (ราคาปิด < `discount_top`)
3. **POI Alert (แตะจุดสนใจ):** ราคาย่อลงมาแตะหรืออยู่ในระยะของ **Bullish Order Block (OB)** ที่ `mitigated == false` หรือกำลังปิด **Bullish FVG**
4. **The Trigger (จุดยิงออเดอร์):**
   * *Best Trigger:* มีการกวาดสภาพคล่อง (Liquidity Sweep) เช่น ราคาทิ่มทะลุลงไปแตะ `Equal Lows (EQL)` แล้วสามารถดึงกลับมาปิดเหนือ EQL ได้ 
   * *Safe Trigger:* เกิดสัญญาณ `"CHoCH"` ขาขึ้น (Bullish CHoCH) ในระดับโครงสร้างย่อย (`internal_trend` พลิกกลับมาเป็น `"bullish"`) ประกอบกับแท่งเทียนปัจจุบันแสดงสัญลักษณ์การปฏิเสธราคา (Lower Wick ยาว ข้อมูลจากตระกูล wick ใน FullAnalysis)
   * **ออกออเดอร์ CALL ทันที** เมื่อจบแท่งเทียนนั้น

### 🔴 กฎการเข้าออเดอร์ PUT (Sell) - "Premium & Sweep Setup"
1. **Bias (ทิศทางหลัก):** `swing_trend` ต้องเป็น `"bearish"` (แนวโน้มหลักเป็นขาลง)
2. **Zone (รอราคาแพง):** ราคาปัจจุบัน (Close) ต้องดีดตัวขึ้นมาอยู่ในโซน **Premium** (ราคาปิด > `premium_bottom`)
3. **POI Alert (แตะจุดสนใจ):** ราคาขึ้นมาแตะหรืออยู่ในระยะของ **Bearish Order Block (OB)** ที่ `mitigated == false` หรือกำลังปิด **Bearish FVG**
4. **The Trigger (จุดยิงออเดอร์):**
   * *Best Trigger:* มีการกวาดสภาพคล่องที่ต้าน (Sweep) เช่น ราคาดีดทะลุไปชน `Equal Highs (EQH)` แล้วโดนทุบกลับมาปิดต่ำกว่า EQH 
   * *Safe Trigger:* เกิดสัญญาณ `"CHoCH"` ขาลง (Bearish CHoCH) ในระดับโครงสร้างย่อย (`internal_trend` แทงลงเปลี่ยนเป็น `"bearish"`) ประกอบกับแท่งเทียนปัจจุบันมีแรงเทขายกดดัน (Upper Wick ยาว)
   * **ออกออเดอร์ PUT ทันที** เมื่อจบแท่งเทียนนั้น

---

## 🛠️ 3. แนวทางการเขียน Code Logic สกัดจาก `FullAnalysis`

ตัวอย่าง Logic (Pseudocode/Rust pattern) สำหรับตรวจสอบเงื่อนไขในระบบ Bot Trading ของคุณ:

```rust
// สมมติเรามี analysis_result เป็น struct ของ FullAnalysis

if let Some(smc) = &analysis_result.smc {
    let current_price = analysis_result.close;
    let is_bullish_trend = smc.swing_trend == "bullish" || smc.swing_trend == "1"; // ตาม enum หรือ const ที่ใช้
    
    // 1. หาโซน Premium / Discount
    let is_in_discount = if let Some(pdz) = &smc.premium_discount_zone {
        current_price <= pdz.discount_top
    } else { false };
    
    // 2. ค้นหา Active Order Block แบบ Bullish ที่ยังถูกไม่ได้ใช้งาน (Unmitigated) 
    let mut touching_bullish_ob = false;
    for ob in &smc.order_blocks {
        if ob.bias == "bullish" && !ob.mitigated {
            // ถ้าราคาลงมาชนหรือเหลื่อมล้ำโซน (Low ของแท่งเทียนแตะโซน OB)
            if analysis_result.low <= ob.high && analysis_result.close >= ob.low {
                touching_bullish_ob = true;
                break;
            }
        }
    }
    
    // 3. หาสัญญาณเปลี่ยนแปลงระดับโครงสร้างย่อย (CHoCH) 
    // หรือเช็คจาก internal_trend ที่เพิ่งดีดตัวกลับเป็น bullish
    let is_internal_bullish_choch = smc.internal_trend == "bullish" && /* โครงสร้างก่อนหน้าเป็น bearish */;
    
    // 4. เงื่อนไขรวบยอดสำหรับการยิง CALL
    if is_bullish_trend && is_in_discount && touching_bullish_ob {
        if is_internal_bullish_choch || analysis_result.l_wick_percent > 40.0 {
            // Signal -> "CALL" !!
        }
    }
}
```

---

## 📈 4. รูปแบบแท่งเทียน (Candle Confirmations) เสริมความแม่นยำ
เมื่อใช้ SMC โซนในการรอราคาแล้ว การเช็ค `status_desc` และ Wicks จะช่วยเพิ่มประสิทธิภาพของ Trigger:
* หากราคาตกมาที่โซน Discount และ Order Block แล้ว แท่งเทียนสุดท้ายมีคุณสมบัติดังนี้:
  * มี `l_wick_percent` มากกว่า 30-40% (Pin bar / Hammer)
  * และ `suggest_color` เริ่มเพ่งเล็งไปที่ "Green" หรือมี `Convergence` จาก EMA
  นี่คือส่วนผสมที่ดีที่สุดในการยิง **CALL** ในนาทีต่อไป

## 🔐 5. การจัดการความเสี่ยง (Risk Management)
การใช้ SMC อาจจะไม่ได้เกิดสัญญาณตลอดเวลาเหมือนอินดิเคเตอร์ทั่วไป (ช้าแต่ชัวร์)
* แนะนำให้ใช้ Trade Mode เป็น **"auto"** แบบ Martingale ที่จำนวนการทบจำกัด (เช่น max 3 ไม้) 
* SMC มี Win Rate สูงเมื่อเข้าใน POI ที่มีรอยย่ำของราคานานๆ (Sweep Zone) ดังนั้นหากออเดอร์ถูกลากทะลุ Order Block มักจะแปลว่า Trade Setup นั้นผิดพลาดไปแล้ว ไม่ควรประชิด Martingale ต่อเนื่องในแท่งถัดไปทันที ควรรอ Setup SMC รอบใหม่อีกครั้ง
