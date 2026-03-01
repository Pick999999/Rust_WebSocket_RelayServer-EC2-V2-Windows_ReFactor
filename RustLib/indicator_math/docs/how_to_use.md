# วิธีการใช้งาน (How to Use) - `indicatorMath_ULTRA_Rust`

คู่มือสำหรับการนำ Crate สู่การใช้งานจริงในโปรเจกต์ของคุณ ทั้งหน้าบ้านและหลังบ้าน

## 📦 การติดตั้ง 

เพิ่มใน `Cargo.toml` 
```toml
[dependencies]
indicatorMath_ULTRA_Rust = "1.1.0"
```

## 🚀 ตัวอย่างโค้ด (Rust Backend)
```rust
use indicator_math_ultra_rust::{AnalysisOptions, AnalysisGenerator, Candle};

fn main() {
    // 1. ตั้งค่าพื้นฐาน (สไตล์การวิเคราะห์แบบ Ultra)
    let options = AnalysisOptions::default();
    
    // 2. กำหนด Generator ประจำสกุลเงินนั้นๆ (เช่น R_100)
    let mut generator = AnalysisGenerator::new(options);
    
    // 3. ป้อนประวัติแท่งเทียน (History Calibration)
    let history_data = vec![
        Candle { time: 1000, open: 1.0, high: 2.0, low: 0.5, close: 1.5 },
        Candle { time: 1060, open: 1.5, high: 2.5, low: 1.0, close: 2.0 }
    ];
    generator.initialize(history_data);
    
    // 4. รอรับ Tick ปัจจุบัน (Live Streaming Data)
    // ถ้าราคาที่วิ่งมาขึ้นนาทีใหม่ (แท่งใหม่) ฟังก์ชันจะ return AnalysisResult กลับมาให้ทันที
    if let Some(analysis) = generator.append_tick(2.1, 1120) {
        println!("ผลการวิเคราะห์ล่าสุด: {:?}", analysis.status_desc);
        
        // เข้าถึงข้อมูลเจาะลึก SMC ได้ทันทีหากต้องการ
        if let Some(smc_data) = analysis.smc {
            println!("เจอ Order Blocks: {:?}", smc_data.order_blocks.len());
            println!("เทรนด์ของ SMC ตอนนี้: {}", smc_data.swing_trend);
        }
    }
}
```

## 🔎 ข้อมูลที่วิเคราะห์ให้สำเร็จรูป
เพียงแค่ป้อนราคาเข้ามาไลบรารีก็จะสกัดสิ่งที่จำเป็นต่อการเข้าเทรดมาให้ครบถ้วน:

1. **Indicator คลาสสิก**: EMA, RSI, MACD, Bollinger Bands, ATR, ADX `(เช่น rsi_value, ema_short_value, bb_position)`
2. **ข้อมูล SMC รายใหญ่**: Order Blocks, Structure Breaks (BOS/CHoCH), FVGs, Premium/Discount Zones `(อยู่ในฟิลด์ .smc)`
3. **Candle Anatomy**: สัดส่วนไส้บน ไส้ล่าง เนื้อเทียน ขนาดกระชาก เพื่อใช้ประกอบ Price Action `(เช่น u_wick_percent, l_wick_percent)`
4. **Master Status Code**: เข็มทิศแบบออโต้ประมวลรวมสัญญาณทุกตัวให้เป็น Code `(เช่น L-DU-U-R-C หรือ 13)` ดูผ่าน Configuration JSON ได้เลย
