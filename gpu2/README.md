# Deriv Trading Chart with WebGPU Indicators

## ไฟล์ทั้งหมด
- `index.html` - หน้าเว็บหลัก
- `deriv-api.js` - Class สำหรับเชื่อมต่อ Deriv API
- `webgpu-indicators.js` - Class คำนวณ indicators ด้วย GPU
- `chart-manager.js` - Class จัดการ Lightweight Charts
- `app.js` - Application หลัก

## วิธีใช้งาน

### 1. เปิดไฟล์ index.html ใน Browser
- ใช้ Chrome, Edge, หรือ Firefox (รุ่นใหม่)
- รองรับ GPU acceleration (ถ้ามี)

### 2. ฟีเจอร์ที่มี
- ✅ ดึงข้อมูล Historical จาก Deriv
- ✅ รับข้อมูล Live Candles แบบ Real-time
- ✅ วาดกราฟด้วย Lightweight Charts 4.2.1
- ✅ คำนวณ MA 3 เส้น (SMA, EMA, HMA)
- ✅ กราฟ RSI
- ✅ กราฟ Choppiness Index
- ✅ Timeframe: 1M, 3M, 15M, 30M
- ✅ ใช้ GPU.js คำนวณ (GPU/CPU mode)
- ✅ แสดงสถานะ GPU/CPU

### 3. การใช้งาน
1. เลือก Symbol (Volatility Index หรือ Forex)
2. เลือก Timeframe
3. คลิก "Load History" เพื่อดึงข้อมูล
4. คลิก "Start Live" เพื่อรับข้อมูล real-time
5. ปรับ MA Type และ Period ตามต้องการ
6. คลิก "Update Indicators" เพื่ออัพเดท

### 4. การใช้ Class ในโปรเจคอื่น

```javascript
// ใช้ DerivAPI
const api = new DerivAPI('YOUR_APP_ID');
await api.connect();
const candles = await api.getHistoricalCandles('R_10', 60, 1000);

// ใช้ WebGPUIndicators
const indicators = new WebGPUIndicators();
const ema = indicators.calculateEMA(prices, 20);
const rsi = indicators.calculateRSI(prices, 14);
const status = indicators.getGPUStatus(); // ตรวจสอบสถานะ GPU

// ใช้ ChartManager
const charts = new ChartManager();
charts.updateCandles(candlesData);
charts.updateMA(0, maData);
```

### 5. GPU Status
- 🟢 **GPU Accelerated** - ใช้ GPU คำนวณ (เร็วกว่า)
- 🟠 **CPU Mode** - ใช้ CPU คำนวณ (ช้ากว่า)

## ข้อกำหนดระบบ
- Browser รุ่นใหม่ (Chrome 90+, Firefox 90+)
- Internet connection สำหรับ Deriv API
- GPU รองรับ WebGL (ถ้าต้องการใช้ GPU mode)

## หมายเหตุ
- ใช้ Deriv Demo App ID (1089) - ฟรี ไม่ต้องสมัคร
- ข้อมูลเป็น demo data จาก Deriv
- สามารถนำ Class ไปใช้ในโปรเจคอื่นได้ทันที