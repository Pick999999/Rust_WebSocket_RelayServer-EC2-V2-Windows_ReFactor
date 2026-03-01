# PKIndicator Library

Library รวม JavaScript สำหรับการเทรด, การวิเคราะห์ Technical Analysis, SMC (Smart Money Concepts), และ WebGPU Acceleration

## 📂 โครงสร้างไฟล์
ไฟล์สำคัญทั้งหมดอยู่ในโฟลเดอร์ `my-trading-lib`:
- `deriv-api.js`: API สำหรับเชื่อมต่อ Deriv
- `multi-asset-loader.js`: สำหรับดึงข้อมูลหลายคู่เงินพร้อมกัน
- `webgpu-indicators.js`: คำนวณอินดิเคเตอร์ด้วยการ์ดจอ (WebGPU)
- `indicators.js`: สูตรคำนวณพื้นฐาน (SMA, EMA, RSI, etc.)
- `SMCIndicator.js`: คำนวณ Smart Money Concepts
- `clsAnalysisGeneratorV2.js`: ตัวสร้างการวิเคราะห์รวม (SMC + Basic Indicators)

## 🚀 วิธีใช้งานผ่าน CDN (jsDelivr)

เรียกใช้งานได้ทันทีผ่าน jsDelivr ตามตัวอย่างด้านล่าง:

```html
<!-- 1. Deriv API -->
<script src="https://cdn.jsdelivr.net/gh/Pick999999/PKIndicator@main/my-trading-lib/deriv-api.js"></script>

<!-- 2. Basic Indicators -->
<script src="https://cdn.jsdelivr.net/gh/Pick999999/PKIndicator@main/my-trading-lib/indicators.js"></script>

<!-- 3. SMC Indicator -->
<script src="https://cdn.jsdelivr.net/gh/Pick999999/PKIndicator@main/my-trading-lib/SMCIndicator.standalone.js"></script>

<!-- 4. WebGPU (Optional) -->
<script src="https://cdn.jsdelivr.net/gh/Pick999999/PKIndicator@main/my-trading-lib/webgpu-indicators.js"></script>

<!-- 5. Asset Loader -->
<script src="https://cdn.jsdelivr.net/gh/Pick999999/PKIndicator@main/my-trading-lib/multi-asset-loader.js"></script>

<!-- 6. Analysis Generator -->
<script src="https://cdn.jsdelivr.net/gh/Pick999999/PKIndicator@main/my-trading-lib/clsAnalysisGeneratorV2.js"></script>
```

อ่านรายละเอียดเพิ่มเติมได้ใน [SMC_Integration_Guide.md](SMC_Integration_Guide.md)
