# Indicator Math V2 (indicator_math_v2) 🚀

ไลบรารี Rust ประสิทธิภาพสูงสำหรับการวิเคราะห์ทางเทคนิคทางการเงิน (Financial Technical Analysis) ที่ถูกออกแบบมาเพื่อ **สืบทอดและเพิ่มประสิทธิภาพ** ของลอจิกจาก `clsAnalysisGenerator.js` โดยเฉพาะ

ด้วยการออกแบบใหม่ทั้งหมด ทำให้ `indicator_math_v2` มีจุดเด่นในเรื่องการประมวลผลแบบขนาน (Parallel Processing) และการวิเคราะห์แบบสะสม (Incremental Analysis) ซึ่งเบาและเร็วกว่าตัวเก่าอย่างเทียบไม่ติด

---

## ✨ คุณสมบัติเด่น (Features)

### 1. ⚡ **Parallel Asset Processing (คำนวณหลายคู่เงินพร้อมกันแบบไร้คอขวด)**
ใช้พลังของ `tokio` (Asynchronous Runtime) และ `rayon` (Data-parallelism) ในการกระจายงานคำนวณอินดิเคเตอร์ของหลายคู่เงินไปรันบน CPU หลายๆ Core พร้อมกัน ทำให้เซิร์ฟเวอร์สามารถรับโหลดได้จำนวนมหาศาล

### 2. 🧠 **Incremental State Management (O(1) Update Time)**
> **ลาก่อนการคำนวณซ้ำ O(N):** 
> ในเวอร์ชันปกตินั้น เวลาคุณมีข้อมูลตั้งต้น 1,000 แท่ง เมื่อมี Tick ใหม่มา 1 ครั้ง ระบบจะคำนวณใหม่ไล่ตั้งแต่แท่งที่ 1 ยัน 1,001 (เสียเวลามาก) 
> 
> **แต่ V2 ฉลาดกว่า:** ระบบมี `GeneratorState` คอยจดจำ "ค่าตัวแปรสุดท้าย" เอาไว้ (เช่น EMA ของแท่งล่าสุด) ทำให้เมื่อมีราคา Tick เข้ามา ระบบจะเอา **ราคาใหม่ + ค่าใน State เดิม** มาคำนวณได้ทันที (ใช้แค่ **1 Operation (O(1))** ไม่ใช่พันครั้ง!) ทำให้เบากระชากใจ

### 3. 🌐 **Built-in Deriv Integration**
มีโค้ดจัดการการดึงข้อมูล OHLC ย้อนหลังจาก **Deriv WebSocket/API** ในตัว ไม่ต้องเขียนโค้ดยิง API เองให้เมื่อย โหลดข้อมูลตั้งต้นเป็นร้อยเป็นพันกราฟได้สบายๆ รวดเดียว

### 4. 🧮 **Comprehensive Indicators**
มีชุดอินดิเคเตอร์ครบครันและได้รับการรีไรต์ให้เข้ากับการทำงานแบบ State (Incremental):
* Moving Averages: **EMA**, **HMA**, **EHMA**, **WMA**
* Momentum/Trend: **RSI**, **MACD**, **ADX**
* Volatility: **ATR**, **Bollinger Bands**, **Choppiness Index (CI)**
* Smart Money Concepts (SMC): **Market Structure (CHoCH, BOS)**, **Swing Points**, **Order Blocks**, **FVG**, **Premium/Discount Zones**

### 5. 🎯 **Status Code Matching**
ตัวนี้ทีเด็ด! มันสามารถวิเคราะห์และรวมอินดิเคเตอร์สิบกว่าตัว แล้วสรุปสถานะแท่งเทียนนั้นออกมาให้เป็น `SeriesCode` ตัวแปรเดียว (เช่น `M-UU-G-C`) ซึ่งตรงกับรูปแบบ `CandleMasterCode` ที่เอาไว้ใช้พิจารณาเข้าเทรดได้เลยอัตโนมัติ ไม่ต้องมานั่งเขียน if-else เอง 
**อัปเดตใหม่:** ระบบรองรับการตั้งค่าดึงกฎแบบ **Dynamic JSON** ในตอนสั่งบิลด์ ทำให้สามารถอ่านและอัปเดตกฎเทรดจากไฟล์ `CodeCandleMaster.json` (จาก root โปรเจกต์) ได้โดยไม่ต้องไปแกะและฮาร์ดโค้ดใน Library อีกต่อไป

### 6. 🌍 **WebAssembly (Wasm) First**
คุณสามารถนำคณิตศาสตร์ดั้งเดิมไปรันบน Client/Browser ได้โดยตรง! ตอนนี้เรารองรับโหมด CPU Wasm เพื่อให้นำฟังก์ชันประเมินกราฟราคาแบบ Incremental ไปฝังให้ Web Worker ของโปรเจกต์ React/Vue ใช้งานแบบเรียลไทม์ได้ทันที!

---

## 🏗️ โครงสร้างการทำงานภายใน (Architecture & Concurrency)

เพื่อความเข้าใจที่ถูกต้องในการนำไปใช้งาน ระบบมีการแบ่งการทำงานเป็นจุดต่างๆ ดังนี้:

### 1. แกนหลักการคำนวณ (Core Math) = รันแบบ Sequential (เรียงลำดับ)
โค้ดที่ใช้คำนวณอินดิเคเตอร์ (เช่น `src/generator.rs`) ถูกออกแบบให้ทำงานแบบ **ตามลำดับ (Sequential) และ Stateful** เพราะการคำนวณอย่าง EMA จำเป็นต้องใช้ค่าของแท่งก่อนหน้า จึงไม่สามารถซอยงานของ 1 เหรียญให้ CPU หลาย Core ช่วยทำพร้อมกันได้ แต่เนื่องจากเราใช้ Stateful การคำนวณต่อ 1 Tick จึงกินเวลาเพียงแค่ระดับ `O(1)` เบาหวิวและรวดเร็ว

### 2. โมดูลจัดการคิวหลายเหรียญ (`Manager.rs`) = รันแบบ Parallel / Asynchronous (ฝั่งเซิร์ฟเวอร์เท่านั้น)
หากนำโค้ดไปรันบนคอมพิวเตอร์เซิร์ฟเวอร์ (Native Rust / Backend) ตัว `AnalysisManager` จะใช้พลังของ `tokio` และ `DashMap` เพื่อกระจายโหลด คอยบริการเหรียญ 10 เหรียญพร้อมกัน 10 คอร์ แบบ **คู่ขนาน (Parallel)** ได้อย่างเต็มประสิทธิภาพ

### 3. ฝั่งหน้าเว็บ (`WebAssembly CPU`) = รันแบบ Single-Threaded 
สถาปัตยกรรม Wasm ปกติบนเบราว์เซอร์จะรันได้แค่ 1 แกน ไม่สามารถเรียกฟีเจอร์ Multi-core อย่าง `tokio` หรือ `rayon` ได้ (ฟังก์ชันดังกล่าวจะถูกตัดออกไปอัตโนมัติตอนคอมไพล์) ฉะนั้นงานของ WASM CPU จึงเป็น Single-Thread แต่ด้วยความที่เป็นสูตรคณิตศาสตร์เพียวๆ จึงยังลื่นไหลแม้ไม่มี Parallel ก็ตาม

*(หมายเหตุ: หากต้องการเร่งสปีดประมวลผลข้อมูลนับล้านแท่งแบบขนานบนหน้าเว็บจริงๆ ให้สลับไปใช้โหมด Wasm + WebGPU ซึ่งจะเข้าถึง Hardware VRAM แทนตามไฟล์ `wasm_gpu_example.html`)*

---

## 🛠️ โครงสร้างฟังก์ชันหลัก (Key Functions)

ตัวจัดการหลักของไลบรารีนี้คือ **`AnalysisManager`** ซึ่งมีฟังก์ชันที่คุณจะได้ใช้บ่อยๆ ดังนี้:

### `1. AnalysisManager::new(options, master_codes)`
* **ใช้ทำอะไร:** สร้าง Instance บริหารการคำนวณขึ้นมาใหม่
* **พารามิเตอร์ที่รับ:** รับ `AnalysisOptions` (ตั้งค่าว่าจะเอา Period เท่าไหร่) และ `master_codes` (กติกา Status Code ว่าแบบไหนเรียกว่าอะไร)

### `2. manager.initialize(ws_url, assets).await`
* **ใช้ทำอะไร:** ดึงข้อมูลแท่งเทียนย้อนหลังของรายชื่อเหรียญ (`assets`) ผ่าน Web Socket URL ที่ให้ไป จากนั้นมันจะคำนวณอินดิเคเตอร์ย้อนหลังทั้งหมดทีเดียวและเก็บข้อมูลไว้ใน State ให้พร้อมใช้งาน
* **เหมาะสำหรับ:** การบู้ท (Boot Up) ระบบครั้งแรก

### `3. manager.process_tick(asset, price, epoch)`
* **ใช้ทำอะไร:** เป็นหัวใจหลักของโหมด Live Trading เมื่อมีสัญญาณราคาขยับ (Tick) ส่งราคาล่าสุด (`price`) ไปให้ มันก็จะเอาไปเช็คดูว่าปิดแท่งเทียนเดิมรึยัง 
  * ถ้าปิดแล้ว ระบบก็จะ "คืนค่า (Return)" ไฟล์ `AnalysisResult` กลับมาบอกผลวิเคราะห์ของแท่งล่าสุดทันที
  * ถ้ายังไม่ปิด มันก็แค่เซฟไว้และคืนค่า `None`
* **ประสิทธิภาพ:** O(1) เร็วและไม่กิน CPU อย่างที่กล่าวไปข้างต้น

### `4. manager.get_all_status()`
* **ใช้ทำอะไร:** สำหรับเรียกดู "สถานะล่าสุด" ของทุกคู่เงินที่เราได้สั่งให้มันทำงานไว้ มันจะรวบรวมข้อมูลสถานะ (Status Code) แปะมาให้ทันที เอาไปโชว์ใน Web / Mobile ได้ง่ายสุดๆ

---

## 📦 วิธีการติดตั้ง

เพิ่มมันลงใน `Cargo.toml` ระบบคุณ ดังนี้:

```toml
[dependencies]
indicator_math_v2 = { package = "indicator_math", path = "RustLib/indicator_math" }
tokio = { version = "1.0", features = ["full"] }
```

*ปล. ต้องใช้คู่กับแพ็กเกจ `tokio` เสมอเพราะมันเป็นระบบทำงานขนานแบบ Asynchronous*

---

## 🔗 วิธีการใช้งาน (Integration Guide)

### 1. การเชื่อมต่อกับ `main.rs` (Backend)

การนำไปใช้ใน `main.rs` นั้น คุณจะต้องสร้าง `AnalysisManager` เอาไว้เป็น Global State/Shared State ผ่านตระกูล `Arc<Mutex<>>` หรือ `Arc<RwLock<>>` เพื่อให้ระบบ WebSocket หรือ Thread ต่างๆ เข้ามาเรียกใช้พร้อมกันได้

**ตัวอย่างโค้ดใน `main.rs`:**

```rust
use indicator_math_v2::{AnalysisManager, AnalysisOptions, CandleMasterCode};
use std::sync::Arc;
use tokio::sync::RwLock;

// สร้างข้อมูล State รวมที่สามารถแชร์ไปใน Axum (หรือ WebSocket) ได้
type SharedManager = Arc<RwLock<AnalysisManager>>;

#[tokio::main]
async fn main() {
    // 1. ตั้งค่าและสร้าง Manager
    let options = AnalysisOptions::default();
    
    // (จำลอง) เตรียม Master Code กติกาเทรด
    let master_codes = vec![
        CandleMasterCode { status_code: "1".to_string(), status_desc: "L-DD-E-D".to_string() },
    ];
    let manager = AnalysisManager::new(options, master_codes);
    let shared_manager: SharedManager = Arc::new(RwLock::new(manager));

    // 2. สั่งให้ Manager โหลดข้อมูลกราฟย้อนหลัง (Initialization)
    let ws_url = "wss://ws.binaryws.com/websockets/v3?app_id=1089";
    let assets = vec!["R_100".to_string(), "R_50".to_string()];
    
    // ดึง Thread ไปรันย้อนหลัง
    {
        let mut mgr = shared_manager.write().await;
        let _ = mgr.initialize(ws_url, assets).await;
        println!("🚀 ดึงข้อมูลกราฟตั้งต้นเสร็จสมบูรณ์");
    }

    // 3. จำลอง Event เวลา Tick เข้ามา (Live Data)
    // ตรงนี้นำไปเชื่อมกับ WebSocket Client ของคุณเวลาได้รับ Tick ใหม่
    let mut mgr = shared_manager.write().await;
    if let Some((asset, result)) = mgr.process_tick("R_100", 123.45, 1700000060) {
        // เมื่อถึงเวลา ปิดแท่ง Manager จะคาย AnalysisResult ออกมาให้
        println!("📊 แท่งเทียนใหม่ปิดแล้ว! {}: โค้ดที่ได้={}", asset, result.status_code);
        
        // 🚨 สั่ง Broadcast (ยิง WebSocket) กลับไปให้ Frontend อัปเดต Lightweight Charts
        // let payload = json!({ "asset": asset, "data": result });
        // tx.send(payload.to_string());
    }
}
```

### 2. ข้อมูลล้ำค่าที่ส่งกลับไปให้ Main (Actionable Data)

เมื่อ `indicatorMath_ULTRA_Rust` ประมวลผลแท่งเทียนเสร็จ มันจะคายก้อน **`AnalysisResult`** (struct ขนาดใหญ่) ตัดส่งกลับไปให้ `Main` ของ Rust ผ่านฟังก์ชัน `process_tick` โดยแบ่งกลุ่มค่าสำคัญที่ส่งกลับไปพิจารณาการเข้าเทรด ดังนี้:

#### 1. ทิศราชสีห์ (เทรนด์หลักจากเส้น EMA)
มันแยกให้เลยว่าเส้น EMA 3 ระดับกำลังหัวเชิด หรือหัวปัก
*   `ema_short_direction`, `ema_medium_direction`, `ema_long_direction`: (ได้ค่า "Up", "Down", "Flat")
*   `ema_above`, `ema_long_above`: เอาไว้ดูว่าเส้นสั้นอยู่เหนือเส้นยาวไหม ("ShortAbove", "MediumAbove", "LongAbove") ช่วยหาจุด Golden Cross
*   `ema_short_turn_type`: ("TurnUp" หักหัวขึ้น, "TurnDown" หักหัวลง) **อันนี้ใช้จับจุดกลับตัวแบบไวโคตรๆ ได้**

#### 2. สถานะความผันผวนของตลาด (Indicators อื่นๆ)
*   `rsi_value`: ค่า RSI 0-100 ไว้ดู Overbought / Oversold
*   `bb_position`: ราคาอยู่ในโซนไหนของ Bollinger Bands ("NearUpper", "NearLower", "Middle") เหมาะทำสาย Reversal (ชนขอบแล้วเด้งกลับ)
*   `choppy_indicator`: หาว่าตลาดช่วงนี้ "มีเทรนด์" (ค่าน้อย) หรือ "สวิงไซด์เวย์" (ค่ามาก)
*   `adx_value`: วัด "ความแข็งแกร่งของเทรนด์" (ADX > 25 แปลว่าเทรนด์แข็งแรงสุดๆ)

#### 3. ชันสูตรแท่งเทียน (Candlestick Anatomy)
เหมาะกับคนที่เทรดด้วย Price Action หรือล่า Price Rejection (ไส้เทียนยาว)
*   `body_percent`: เนื้อเทียนคิดเป็นกี่เปอร์เซ็นต์ของทั้งแท่ง
*   `u_wick_percent`, `l_wick_percent`: ไส้เทียนบนและล่างยาวกี่เปอร์เซ็นต์ (เช่น ถ้า `l_wick_percent` ยาวมากตอนอยู่แถวแนวรับ ก็อาจจับจังหวะ Call/Buy ได้)
*   `is_abnormal_candle`, `is_abnormal_atr`: ค่า Boolean ห้ามเทรดตอนที่บอกว่า "จริง (True)" เพราะหมายถึงเกิดข่าวลากไส้รุนแรง ราคาช็อกตลาด

#### 4. ร่องรอยรายใหญ่ (Smart Money Concepts - SMC)
วิเคราะห์พฤติกรรมกลไกราคาเชิงลึก:
*   `swing_trend`, `internal_trend`: เทรนด์ของสวิงหลักและสวิงย่อย (`"bullish"`, `"bearish"`)
*   `structures`: จุดทะลุโครงสร้าง CHoCH (Change of Character) และ BOS (Break of Structure)
*   `order_blocks`: โซนคำสั่งซื้อขายก้อนใหญ่ที่เกิดจากการทิ้งตัวแรงๆ (Bullish/Bearish Order Blocks)
*   `fair_value_gaps`: โพรงราคา (FVG) ที่แท่งเทียนพุ่งแรงจนเกิดช่องว่าง
*   `premium_discount_zone`: โซนราคาถูก (Discount) และโซนของแพง (Premium)

#### 5. รหัสลับสถานะ (The Master Code)
ตัวนี้เอาไว้ยัดรวมสภาพตลาดทุกอย่างเป็นบรรทัดเดียว เบ็ดเสร็จ:
*   `status_desc`: เช่น ค่า `"L-DU-U-R-C"` (ยาวกว่า Medium, สั้นตัดกลางทิ่มหัวลง, ยาวชี้หัวขึ้น, แท่งสีแดง, แมคดีชนกัน)
*   `status_code`: โค้ดแปลจากหน้าเทรด เป็นตัวเลขเช่น `"25"`, `"13"`

**ตัวอย่างการนำไปเขียน Logics ตัดสินใจเทรดใน Main:**

```rust
// ตัวอย่างที่ 1: เล่นตามน้ำ (Follow Trend) จากรหัสสถานะ
if analysis.status_desc == "L-UU-U-G-D" && analysis.adx_value.unwrap_or(0.0) > 25.0 {
    // เทรนด์ขาขึ้น 100% (MediumเหนือLong-ชี้ขึ้นหมด-แท่งเขียว-Divergeออก)
    // แถม ADX บอกเทรนด์แข็งแกร่ง -> ส่งคำสั่ง "BUY (Call)" ไปที่ Exchange ได้เลย!
    execute_trade("CALL", asset, amount);
}

// ตัวอย่างที่ 2: ดักจับจุดกลับตัวแบบมีไส้ (Rejection on BB Lower)
if analysis.bb_position == "NearLower" && analysis.l_wick_percent > 60.0 {
    // ราคาไหลไปแตะขอบล่าง Bollinger Bands แถมทิ้งไส้ล่างยาวเกิน 60% ของแท่ง (มีแรงซื้อสวน)
    // ถือเป็นสัญญาณ Call ระยะสั้นที่ดีมาก
    execute_trade("CALL", asset, amount);
}

// ตัวอย่างที่ 3: ระบบป้องภัย 
if analysis.is_abnormal_candle || analysis.choppy_indicator.unwrap_or(100.0) > 61.8 {
    // แท่งเทียนผันผวนผิดปกติ หรือตลาดแกว่ง Choppy Index สูงเกินไป
    // ให้บอทถือเงินสดไว้เฉยๆ ไม่เสี่ยงเข้าเทรด
    pause_trading(asset);
}
```

### 3. การนำไปใช้กับ Lightweight Charts (Frontend)

เมื่อ Backend รัน `process_tick()` ได้แท่งเทียนปิดและวิเคราะห์เสร็จ มันจะคืนรูปมาเป็นค่าต่างๆ เช่น `open`, `high`, `low`, `close`, `ema_short_value`, `rsi_value` 

สิ่งที่คุณต้องทำบน Frontend (HTML/JS) คือ เอาตัวแปลเหล่านั้นป้อนใส่ **TradingView Lightweight Charts** คล้ายกับวิธีดั้งเดิม:

**ตัวอย่างโค้ดฝั่ง Javascript:**

```javascript
// 1. สร้างชาร์ตแท่งเทียนหลักและเส้น EMA
const chart = LightweightCharts.createChart(document.getElementById('chart'), { width: 800, height: 400 });
const candleSeries = chart.addCandlestickSeries();
const emaSeries = chart.addLineSeries({ color: 'blue', lineWidth: 2 });

// 2. รอรับข้อมูล JSON จาก WebSocket Rust
socket.onmessage = function(event) {
    const msg = JSON.parse(event.data);
    
    // ถ้าข้อความที่ระบุว่าเป็นข้อมูลจากการวิเคราะห์ปิดแท่ง
    if (msg.type === "ANALYSIS_UPDATE" && msg.asset === "R_100") {
        const data = msg.data; // ตรงนี้คือ FullAnalysis ที่แปลงเป็น JSON
        
        // 3. อัปเดตแท่งเทียนราคา
        candleSeries.update({
            time: data.candle_time, // Time stamp (Epoch) ของแท่ง
            open: data.open,
            high: data.high,
            low: data.low,
            close: data.close,
        });

        // 4. วาดตัวชี้วัด (Indicator) บนกราฟเดียวกัน (เช่น เส้น EMA Short)
        if (data.ema_short_value !== null) {
            emaSeries.update({
                time: data.candle_time,
                value: data.ema_short_value,
            });
        }
        
        // *คุณสามารถนำ `data.rsi_value` ไปวาดบนกราฟแยกด้านล่าง (Oscillator Chart) ได้*
        // *หรือนำ `data.suggest_color` มาทำ Indicator สีซื้อขายแปะบนแท่งเทียนได้เช่นกัน*
    }
};
```

### 4. การนำไปใช้บนหน้าเว็บ (WebAssembly Wasm) สำหรับ Frontend แข็งแกร่ง

ในเวอร์ชันนี้ ระบบรองรับการนำไลบรารีไปรันพ่วงกับโปรเจกต์ React/Vue/HTML ดิบ ผ่าน **WebAssembly** ได้โดยตรง ซึ่งมี 2 โหมดการประมวลผล:

#### โหมด CPU Wasm (Incremental Ticking) ⚡
ใช้สำหรับการอัปเดตราคาแบบทีละ Tick ตามเรียลไทม์ แบบเดียวบนฝั่งเซิร์ฟเวอร์ แต่รันผ่าน Web Worker ประจำเครื่องลูกค้าแทน:
```html
<script type="module">
    import init, { WasmAnalysisGenerator } from './wasm_dist/indicatorMath_ULTRA_Rust.js';

    async function run() {
        await init(); // โหลด Wasm

        // 1. จำลองการตั้งค่า Option เหมือนใน Rust
        const options = { ema1_period: 20, ema1_type: "EMA", /*...ตั้งค่าอื่นๆ*/ };
        const generator = new WasmAnalysisGenerator(JSON.stringify(options));

        // 2. ป้อนประวัติเก่าเข้าไปครั้งแรก (Array ของแท่งเทียน)
        generator.initialize(JSON.stringify(history_candles));

        // 3. ป้อนราคา Live Tick สดๆ
        let result = generator.append_tick(150.5, 1700000000); 
        
        if (result) {
            console.log("ปิดแท่งเทียนแล้ว! ได้รหัส:", result.status_desc);
        }
    }
    run();
</script>
```

#### โหมด GPU Wasm (WebGPU Array Computation) 🚀(Experimental)
ใช้พลังมหาศาลของการ์ดจอ (GPU) บนเบราว์เซอร์ คำนวณขนานหลักล้านข้อมูลเสร็จใน 1 มิลลิวินาที! (เหมาะสำหรับโหลด History 10,000 แท่ง หรือดูทีละ 1,000 คู่เหรียญพร้อมกัน):
```html
<script type="module">
    import init, { GpuAnalysisManager } from './wasm_dist/indicatorMath_ULTRA_Rust.js';

    async function run() {
        await init();
        
        // ร้องขอใช้งานการ์ดจอ (GPU) บน Web
        const gpuManager = await GpuAnalysisManager.initialize();
        
        // เตรียมข้อมูลราคานับล้านแท่ง
        const prices = new Float32Array([...หลักล้านตัวเลข...]);

        // ยิงข้อมูลใส่ VRAM เพื่อประมวลผลผ่าน Compute Shader
        const result = await gpuManager.dispatch_compute(prices);
        
        console.log("คำนวณ SMA(20) นับล้านแท่งเสร็จแล้ว:", result);
    }
    run();
</script>
```

---

## 📦 โครงสร้างข้อมูล JSON (AnalysisResult) และคำอธิบายฟิลด์

เมื่อ `indicatorMath_ULTRA_Rust` คำนวณจบแต่ละแท่งเทียน จะทำการคืนค่ากลับมาในรูปแบบ Struct ซึ่งเมื่อส่งข้าม WebSocket ไปยังหน้า Frontend (หรือตอนแปลงเป็น JSON) จะมีหน้าตาและรายละเอียดดังนี้:

```json
{
  "index": 120,
  "candletime": 1700000060,
  "candletime_display": "2024-XX-XX HH:MM:SS",
  "open": 100.5,
  "high": 101.2,
  "low": 99.8,
  "close": 101.0,
  "color": "Green",
  "next_color": null,
  "pip_size": 0.5,
  
  "ema_short_value": 100.8,
  "ema_short_direction": "Up",
  "ema_short_turn_type": "TurnUp",
  
  "ema_medium_value": 100.2,
  "ema_medium_direction": "Up",
  
  "ema_long_value": 99.5,
  "ema_long_direction": "Flat",
  
  "ema_above": "ShortAbove",
  "ema_long_above": "MediumAbove",
  
  "macd_12": 0.6,
  "macd_23": 0.7,
  
  "previous_ema_short_value": 100.6,
  "previous_ema_medium_value": 100.1,
  "previous_ema_long_value": 99.5,
  "previous_macd_12": 0.5,
  "previous_macd_23": 0.6,
  
  "ema_convergence_type": "divergence",
  "ema_long_convergence_type": "D",
  
  "choppy_indicator": 45.2,
  "adx_value": 28.5,
  "rsi_value": 65.4,
  
  "bb_values": {
    "upper": 102.5,
    "middle": 100.0,
    "lower": 97.5
  },
  "bb_position": "NearUpper",
  
  "atr": 1.4,
  "is_abnormal_candle": false,
  "is_abnormal_atr": false,
  
  "u_wick": 0.2,
  "u_wick_percent": 14.28,
  "body": 0.5,
  "body_percent": 35.71,
  "l_wick": 0.7,
  "l_wick_percent": 50.0,
  
  "ema_cut_position": "B1",
  "ema_cut_long_type": "UpTrend",
  "candles_since_ema_cut": 5,
  
  "up_con_medium_ema": 3,
  "down_con_medium_ema": 0,
  "up_con_long_ema": 10,
  "down_con_long_ema": 0,
  
  "is_mark": "n",
  "status_code": "14",
  "status_desc": "M-UU-U-G-D",
  "status_desc_0": "M-UU-U-G-D",
  "hint_status": "",
  "suggest_color": "",
  "win_status": "",
  "win_con": 0,
  "loss_con": 0,
  
  "smc": {
    "structures": [
      {
        "time": 1700000000,
        "price": 99.0,
        "structure_type": "BOS",
        "direction": "bullish",
        "level": "swing",
        "start_time": 1699999000
      }
    ],
    "swing_points": [
      {
        "time": 1700000000,
        "price": 102.0,
        "swing_type": "HH",
        "swing": "high"
      }
    ],
    "order_blocks": [],
    "fair_value_gaps": [],
    "equal_highs_lows": [],
    "premium_discount_zone": {
      "start_time": 1699995000,
      "end_time": 1700000060,
      "premium_top": 105.0,
      "premium_bottom": 104.5,
      "equilibrium": 100.0,
      "discount_top": 95.5,
      "discount_bottom": 95.0
    },
    "strong_weak_levels": [],
    "swing_trend": "bullish",
    "internal_trend": "bearish"
  }
}
```

### คำอธิบายการใช้งานในแต่ละตัวแปร 📝

**หมวดหมู่ข้อมูลทั่วไปของแท่งเทียน (Basic Candle Info):**
* `index`: ตำแหน่งเรียงลำดับของแท่งเทียนตั้งแต่เริ่ม (History length)
* `candletime`: เวลาของปิดแท่งเทียนฉบับ Epoch Time (วินาที)
* `candletime_display`: เวลาที่ถูกจัดการเป็น String (Optional)
* `open`, `high`, `low`, `close`: ข้อมูลราคาพื้นฐาน
* `color`: สีของแท่งเทียน (`"Green"`, `"Red"`, `"Equal"`)
* `next_color`: ใช้ในกรณีวิเคราะห์แท่งเทียนแบบย้อนหลัง (จะรู้สีแท่งในอนาคตเพื่อการทำ Backtesting ได้)
* `pip_size`: ขนาดส่วนต่างของราคาเปรียบเทียบจาก Open-Close

**หมวดหมู่เส้นค่าเฉลี่ย (Moving Averages - EMA/HMA/WMA):**
* `ema_short_value`, `medium`, `long`: ตำแหน่ง Y ของจุด EMA (เส้นสั้น, กลาง, ยาว) บนกราฟ
* `ema_short_direction`, `medium`, `long`: ทิศทางปัจจุบันของแต่ละเส้น ว่าเงยหน้าขึ้น (`"Up"`), ปักหัวลง (`"Down"`), ไซด์เวย์ (`"Flat"`)
* `ema_short_turn_type`: รูปแบบการกลับตัวของเส้นสั้น (`"TurnUp"`, `"TurnDown"`, `"-"`)
* `ema_above`, `ema_long_above`: เรียงลำดับว่าเส้นสั้นอยู่เหนือกลาง (ShortAbove) หรือกลางอยู่เหนือยาว (MediumAbove)

**หมวดหมู่ MACD และอัตรถ่างขยาย (Convergence/Divergence):**
* `macd_12`, `macd_23`: ความห่างระหว่างเส้น (เหมือน MACD Histogram ยิ่งมากยิ่งห่าง)
* `previous_...`: ค่าประวัติในแท่งก่อนหน้า เพื่อหาโมเมนตัมที่เปลี่ยนไป
* `ema_convergence_type`: โมเมนตัมระหว่างเส้นสั้นกับกลาง (`"convergence"` = ลู่เข้า, `"divergence"` = ถ่างกว้างขึ้นเรื่อยๆ, `"neutral"`)
* `ema_long_convergence_type`: การลู่เข้า/ถ่างออกของเส้นกลางกับยาวย่อตัวอักษรเดียว (`"C"`, `"D"`, `"N"`)

**หมวดหมู่อินดิเคเตอร์วัดระดับ (Oscillators & Volatility):**
* `choppy_indicator`: หาความผันผวนไซด์เวย์ (ยิ่งน้อยเทรนด์ยิ่งแข็ง, ยิ่งมากวิ่งไร้ทิศทาง) 
* `adx_value`: วัดพลังสปีดของเทรนด์ (ถ้า > 25 แปลว่าวิ่งแรง)
* `rsi_value`: ดัชนีความแข็งของราคา ไว้หาจังหวะซื้อมากเกินไป (Overbought/Oversold)
* `bb_values`: { `upper`, `middle`, `lower` } เส้นตำแหน่งของ Bollinger Bands ทั้ง 3 เส้น 
* `bb_position`: ราคาไปเกาะอยู่โซนไหนของ Band (`"NearUpper"`, `"NearLower"`, `"Middle"`)
* `atr`: Average True Range วัดระยะทางเฉลี่ยที่แท่งเทียนสวิงตัว

**หมวดหมู่อนาโตมีแท่งเทียนและความผิดปกติ (Anatomy & Abnormality):**
* `is_abnormal_candle`: แท่งเทียนกระชากตัวรุนแรง (เทียบกับ ATR ส่วนใหญ่มักเกิดจากข่าวหลุด)
* `is_abnormal_atr`: ค่าแกว่งแท่งนั้นๆ มีปริมาณเนื้อแท่งมหาศาลหรือหดตัวรุนแรงกว่าปกติ
* `u_wick`, `body`, `l_wick`: ราคาจริงของไส้บน, ตัวเนื้อ, รถม้าล่าง
* `u_wick_percent`, `body_percent`, `l_wick_percent`: คิดเป็นตัวเลขกี่ % เมื่อนำความสูงเทียนไปหารกับขนาดทั้งดุ้น (สำคัญต่อสายหาแท่งหางยาว)

**หมวดหมู่เส้นตัดทิศทาง (Crossings & Counters):**
* `ema_cut_position`: จุดที่เส้นราคาตัดกับ EMA (เช่นทะลุตลอดตัว B1, ตัดปลาย 3,4 เป็นต้น)
* `ema_cut_long_type`: `"UpTrend"`, `"DownTrend"` บอกสายลมหลัก
* `candles_since_ema_cut`: ผ่านมากี่แท่งหลังจากจุด Golden Cross (ถ้าน้อยกว่า 3 มักเป็นจุดเพิ่งเริ่มเทรนด์)
* `up_con_medium_ema`, `down_con_medium_ema`...: ดัชนีนับคอมโบ (Combo counters) ของเส้นที่ชี้ขึ้นกี่มัด ชี้ลงกี่มัดรวด

**หมวดหมู่ Smart Money Concepts (SMC):**
* `smc.swing_trend`, `smc.internal_trend`: เทรนด์ปัจจุบันของรอบใหญ่และรอบเล็ก (`"bullish"`, `"bearish"`, `"neutral"`)
* `smc.structures`: อาร์เรย์เก็บประวัติการทำ Break of Structure (BOS) และ Change of Character (CHoCH)
* `smc.swing_points`: อาร์เรย์ระบุจุดกลับตัว High/Low (เช่น `"HH"` Higher-High, `"LL"` Lower-Low)
* `smc.order_blocks`: อาร์เรย์เก็บโซน Order Block (OB) ที่เกิดแท่งอิมบาลานซ์ ระบุเป็นกรอบราคา Upper-Lower
* `smc.fair_value_gaps`: อาร์เรย์เก็บโซน FVG (Fair Value Gap) หรือ Imbalance ที่รอราคาลงมาเติมเต็ม (Mitigate)
* `smc.equal_highs_lows`: อาร์เรย์เก็บคู่ยอดที่ทำ Equal Highs (EQH) ปลายแหลมสองยอด หรือ Equal Lows (EQL)
* `smc.premium_discount_zone`: ข้อมูลกล่องคำนวณแบ่งครึ่งราคา Premium โซนของแพงด้านบน / Discount โซนของถูกด้านล่าง
* `smc.strong_weak_levels`: แนวรับแข็ง/อ่อน (Strong/Weak High-Low)
*(โครงสร้างข้อมูล SMC ทั้งหมดนี้มีแบบเดียวกับไลบรารี SMCIndicator.js ฝั่ง Frontend)*

**หมวดหมู่รหัสสถานะ (Bot Configuration Codes):**
* `status_desc`: "รหัสบรรทัดเดียวครอบจักรวาล" สูตรที่ขยำทุกอย่างมาบอกเช่น `L-DU-U-R-C` แปลความง่ายๆ = Mediumอยู่เหนือยาว(L), กลางลงแต่อุ้มสั้นขึ้น(DU), ยาวเชิดตรง(U), สีแดง(R), ถ่างออก(C)
* `status_code`: Code ตัวเลขเช่น `"13"`, `"25"` ที่แปลงค่า Desc ให้เป็นเลขแมตช์เข้าตาราง
* `is_mark`, `hint_status`, `suggest_color` : ส่วนรองรับอื่นๆ ไว้ฉีดสัญญาณบอกผู้ใช้ในระบบ Frontend
