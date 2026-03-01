# สรุปการทำงานของ Rust Library: `indicator_math`

Library นี้ถูกออกแบบมาเพื่อเป็น Core Engine สำหรับการวิเคราะห์กราฟเทคนิค (Technical Analysis) ประสิทธิภาพสูงด้วยภาษา Rust โดยจำลองตรรกะและอัลกอริทึมมาจาก `clsAnalysisGenerator.js` และ `clsAnalysisGeneratorTick.js` แต่อัปเกรดให้ทำงานแบบ Parallel และ Incremental (Tick-by-Tick) เพื่อความรวดเร็วสูงสุด

## 🚀 จุดเด่นหลัก (Key Features)

1.  **High Performance & Parallel Processing**:
    *   ใช้ **Rust** และ **Tokio** ในการประมวลผลข้อมูลหลาย Asset พร้อมกัน (Concurrency)
    *   ใช้ `DashMap` เพื่อจัดการ State ของแต่ละ Asset อย่างปลอดภัย (Thread-Safe) รวดเร็ว

2.  **Incremental Calculation (Tick-by-Tick)**:
    *   **O(1) Update**: เมื่อมี Tick ใหม่เข้ามา ระบบจะคำนวณเฉพาะจุดข้อมูลล่าสุดต่อจาก State เดิม ไม่ต้องคำนวณย้อนหลังใหม่ทั้งหมด ทำให้ประมวลผล Tick ได้ระดับ microsecond
    *   รองรับการสร้าง Candle จาก Tick แบบ Real-time

3.  **Comprehensive Indicators**:
    *   คำนวณ Indicator ครบถ้วนตาม Logic เดิมของ JS:
        *   **Moving Averages**: รองรับ **EMA**, **HMA** (Hull MA), และ **EHMA** (Exponential Hull MA)
        *   **EMA** (Short, Medium, Long) พร้อมระบบนับ Persistence (Consecutive Up/Down)
        *   **MACD** & Convergence/Divergence Detection
        *   **RSI** (Relative Strength Index)
        *   **ADX** (Average Directional Index) พร้อมระบบ Smoothing
        *   **Bollinger Bands** (Upper, Middle, Lower, Position)
        *   **ATR** (Average True Range) & Abnormal Candle Detection
        *   **Choppiness Index (CI)**
        *   **Trend Status**: วิเคราะห์จุดตัด EMA (Golden/Dead Cross) และรูปแบบแท่งเทียน

4.  **Status Code Matching**:
    *   ระบบจะแปลงค่าทางเทคนิค (Indicator Values) ให้เป็น **Status Description** (เช่น `L-DD-E-D-N`)
    *   จากนั้นจะ Match กับ **`CandleMasterCode`** ที่กำหนดไว้ เพื่อระบุ `StatusCode` สำหรับนำไปตัดสินใจเทรด

5.  **Deriv API Integration**:
    *   มีโมดูลสำหรับดึงข้อมูลแท่งเทียนย้อนหลัง (History Candles) จาก Deriv API ผ่าน WebSocket ได้โดยตรง

---

## 🛠 โครงสร้างภายใน (Internal Structure)

### 1. `AnalysisManager` (`src/manager.rs`)
ตัวจัดการหลักที่ทำหน้าที่:
*   **Initialization**: รับผิดชอบการโหลดข้อมูลย้อนหลังของทุก Asset แบบ Parallel (`initialize`)
*   **Asset Management**: เก็บรักษา Generator ของแต่ละคู่เงินไว้ใน Memory
*   **Tick Routing**: รับ Tick ใหม่เข้ามาแล้วส่งต่อไปยัง Generator ของคู่เงินนั้นๆ นำไปคำนวณต่อทันที

### 2. `AnalysisGenerator` (`src/generator.rs`)
เครื่องจักรคำนวณ (Engine) ของแต่ละ Asset:
*   **State Management**: เก็บค่าสุดท้ายของ Indicator (Last EMA, Running Sums ของ ADX/RSI)
*   **`append_candle(candle)`**: ฟังก์ชันสำหรับใส่ข้อมูลแท่งเทียนที่จบแล้ว (ใช้ตอนโหลด History หรือจบนาที)
*   **`append_tick(price, time)`**: ฟังก์ชันรับราคา Tick เข้ามา Real-time ระบบจะ:
    *   อัปเดตราคา High/Low/Close ของแท่งปัจจุบัน
    *   ถ้าขึ้นนาทีใหม่ -> ตัดจบแท่งเก่า -> เรียก `append_candle` -> คืนค่า `AnalysisResult` -> เริ่มแท่งใหม่

### 3. `Structs` (`src/structs.rs`)
โครงสร้างข้อมูล (Data Models) ที่สำคัญ:
*   `AnalysisResult`: โครงสร้างผลลัพธ์ที่เหมือนกับ JS Object ทุกประการ (มี field เช่น `ema_short_value`, `status_code`, `color`, etc.)
*   `AnalysisOptions`: ค่า Config ต่างๆ (Period ของ EMA, RSI, ATR ฯลฯ) ซึ่งสามารถกำหนดประเภทของ MA (EMA/HMA/EHMA) ได้อิสระ
*   `CandleMasterCode`: ตารางคู่มือสำหรับแปล Status Description เป็น Code

---

## 💡 วิธีการใช้งาน (Workflow)

1.  **Setup**: กำหนดค่า `AnalysisOptions` และโหลด `CandleMasterCode` (ตารางแปลผล)
    ```rust
    // ตัวอย่างการตั้งค่า Indicator (Custom Config)
    let options = AnalysisOptions {
        // ตั้งค่าเส้นที่ 1 เป็น HMA Period 14
        ema1_type: "HMA".to_string(), 
        ema1_period: 14,

        // ตั้งค่าเส้นที่ 2 เป็น EHMA Period 50
        ema2_type: "EHMA".to_string(),
        ema2_period: 50,

        // ตั้งค่าเส้นที่ 3 เป็น EMA ปกติ Period 200
        ema3_type: "EMA".to_string(),
        ema3_period: 200,

        // ตั้งค่าอื่นๆ (RSI, ATR, etc.)
        rsi_period: 14,
        atr_period: 14,
        ..Default::default() // ใช้ค่า Default สำหรับส่วนที่เหลือ
    };
    ```
    
    หรือ **รับค่าแบบ JSON Array** (ตามที่คุณถาม):
    ```rust
    // JSON String ที่รับมาจากภายนอก (parent)
    let json_config = r#"[
        {"type": "HMA", "period": 14},
        {"type": "EHMA", "period": 50},
        {"type": "EMA", "period": 200}
    ]"#;

    // สร้าง Options จาก JSON
    match AnalysisOptions::from_ma_config_json(json_config, None) {
        Ok(options) => {
             let manager = AnalysisManager::new(options, master_codes);
             // ... ทำงานต่อ
        },
        Err(e) => eprintln!("Invalid Config: {}", e),
    }
    ```

2.  **Init Manager**: สร้าง `AnalysisManager`
3.  **Load History**: เรียก `manager.initialize(ws_url, asset_list)`
    *   ระบบจะยิง Request ไปดึง Candle ย้อนหลังของทุก Asset พร้อมกัน
    *   สร้าง State เริ่มต้นให้แต่ละ Asset
4.  **On Tick (Real-time)**:
    *   เมื่อได้รับ Tick จาก Websocket ให้เรียก `manager.process_tick(asset, price, time)`
    *   ตรวจสอบค่าที่ Return:
        *   ถ้า `Some(result)` แปลว่า **จบแท่งเทียนนาที** -> ได้ `AnalysisResult` ใหม่ออกมา -> **นำไปเช็คเงื่อนไขเข้าเทรด**
        *   ถ้า `None` แปลว่ายังอยู่ในแท่งเดิม (Update High/Low เฉยๆ)

## 📦 การนำไปใช้
Library นี้เป็น **Crate** มาตรฐาน สามารถนำไปใช้ในโปรเจค Rust อื่นๆ (เช่นทำ Trading Bot, Backtest Engine) หรือ compile เป็น **WebAssembly (WASM)** เพื่อนำกลับไปใช้บนหน้าเว็บ JS ได้เช่นกัน

## ❓ FAQ: WebAssembly & GPU
**Q: สามารถใช้ GPU ด้วย WebAssembly (WASM) ในการคำนวณได้ไหม?**
A: **ทำได้ครับ** แต่ต้องพิจารณาความคุ้มค่าดังนี้:

**1. เมื่อไหร่ที่ GPU จะคุ้มค่า? (High Throughput)**
*   เมื่อต้องคำนวณข้อมูลปริมาณมหาศาล **พร้อมกันในคำสั่งเดียว** (Batch Processing)
*   **ตัวอย่าง:** หากคุณต้องการคำนวณ Backtest ย้อนหลัง 10 ปี ของ 100 Assets พร้อมกัน (เช่น Candle 1,000,000 แท่ง x 100 คู่) การส่งข้อมูลก้อนใหญ่นี้ไปให้ GPU คำนวณรวดเดียวจะ **เร็วและคุ้มค่ามาก** ครับ เพราะ GPU มี Core นับพันช่วยกันทำงานขนานกัน

**2. เมื่อไหร่ที่ CPU (Web Workers) จะดีกว่า? (Low Latency)**
*   สำหรับการคำนวณ **Real-time Tick-by-Tick** (แบบระบบนี้)
*   การส่งข้อมูล Tick ใหม่เพียง 1 ค่า ไป-กลับระหว่าง CPU <-> GPU มีค่า Overhead (ค่าโสหุ้ย) สูงกว่าเวลาที่ใช้คำนวณจริงเสียอีก
*   **สรุป:** ระบบ `indicator_math` นี้ออกแบบมาเน้นความเร็วระดับ Microsecond ต่อ Tick จึงใช้ CPU (ผ่าน WASM/Web Workers) จะได้ประสิทธิภาพสูงสุดครับ

**ทางเลือกที่แนะนำ:**
*   **ระบบเทรดจริง (Real-time):** ใช้ **CPU (Web Workers + WASM)** ดีที่สุด
*   **ระบบ Backtest / Optimize:** ถ้าข้อมูลใหญ่มาก อาจพิจารณา **GPU (WebGPU)**

**Q: Web Worker คืออะไร? ปกติเราได้ใช้กันไหม?**
A: **Web Worker** คือฟีเจอร์ของ Browser ที่ช่วยให้เรา **"แยกการคำนวณไปทำหลังบ้าน (Background Thread)"** ครับ

*   **ปกติ:** JavaScript ทำงานบน **Main Thread** เดียวกับ Interface (UI) ถ้าเราสั่งคำนวณหนักๆ (เช่น วนลูปคำนวณ Indicator 15 คู่เงิน) หน้าเว็บจะ **"ค้าง"** หรือ **"กระตุก"** ชั่วขณะ
*   **Web Worker:** เปรียบเสมือนการจ้างลูกน้องเพิ่มอีกคน มานั่งคำนวณให้เราในอีกห้องหนึ่ง เมื่อคำนวณเสร็จค่อยตะโกนบอกผลลัพธ์กลับมา
    *   **ข้อดี:** หน้าเว็บ (UI) จะลื่นไหลตลอดเวลา ไม่มีการกระตุก แม้จะคำนวณหนักแค่ไหนก็ตาม
    *   **ความจำเป็น:** สำหรับโปรแกรมเทรดที่มีหลายจอ หลายกราฟ และข้อมูลวิ่งรัวๆ **"จำเป็นต้องใช้"** ครับ เพื่อประสบการณ์ใช้งานที่ดีที่สุด
    *   **การใช้งานกับ Rust Lib นี้:** เราสามารถโหลดไฟล์ WASM ที่ Compile จาก Rust ไปรันใน Web Worker ได้เลย ทำให้ได้ทั้งความเร็วของ Rust และความลื่นไหลของ Web Worker ครับ


สรุปสิ่งที่ทำเสร็จในวันนี้:

✅ สร้าง Library indicator_math: เป็น Core Engine ภาษา Rust สำหรับคำนวณ Technical Analysis
✅ Parallel Processing: รองรับการโหลดข้อมูลหลาย Asset พร้อมกันด้วย Tokio
✅ Incremental Logic: รองรับการคำนวณแบบ Tick-by-Tick (O(1)) ที่รวดเร็วและแม่นยำ
✅ Advanced Indicators: เพิ่ม support HMA และ EHMA พร้อมระบบเลือก Type ได้อิสระ
✅ Flexible Config: เพิ่มระบบอ่านค่า Setting จาก JSON Array เพื่อเชื่อมต่อกับระบบอื่นได้ง่าย
✅ Documentation: มีคู่มือภาษาไทย 
indicatormath_tick.md
 อธิบายโครงสร้างและ FAQ เรื่อง GPU/Web Worker ครบถ้วน
แผนสำหรับวันพรุ่งนี้ (Next Steps):

นำ indicator_math ไป Integrate เข้ากับ Trade Project (Rust) ตัวเดิมของคุณ
ทดสอบเชื่อมต่อ Real-time WebSocket และเปรียบเทียบค่าที่คำนวณได้กับระบบเดิม (JS) เพื่อ verify ความถูกต้อง 100%