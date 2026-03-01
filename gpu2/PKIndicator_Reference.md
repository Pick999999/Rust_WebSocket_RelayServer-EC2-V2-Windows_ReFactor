# PKIndicator Library Reference
เอกสารอ้างอิงฟังก์ชันทั้งหมดใน PKIndicator Library

---

## 1. `deriv-api.js` (Class: `DerivAPI`)
จัดการการเชื่อมต่อ WebSocket กับ Deriv API

**Constructor:** `new DerivAPI(appId = "1089")`

| Function Name | Parameters | Description | Input/Output |
| :--- | :--- | :--- | :--- |
| `connect` | - | เชื่อมต่อ WebSocket | Promise |
| `disconnect` | - | ปิดการเชื่อมต่อ | - |
| `getHistoricalCandles` | `symbol` (String), `granularity` (Int), `count` (Int) | ดึงข้อมูลแท่งเทียนย้อนหลัง | **Input**: `("R_50", 60, 1000)`<br>**Output**: `Promise<Array[{time, open, high, low, close}]>` |
| `subscribeLiveCandles` | `symbol`, `granularity`, `callback` | สมัครรับข้อมูลแท่งเทียนล่าสุด (Real-time) | **Callback Data**: `{ ohlc: { symbol, open, high... } }` |
| `unsubscribeSymbol` | `symbol` | ยกเลิกการติดตามเหรียญนั้น | - |
| `unsubscribe` | - | ยกเลิกการติดตามทั้งหมด | - |
| `getActiveSymbols` | - | ดึงรายชื่อคู่เงินทั้งหมดที่เทรดได้ | `Promise<Array>` |
| `send` | `data` (Object) | ส่งคำสั่ง API แบบ Fire-and-forget | `true`/`false` |
| `sendAndWait` | `data` (Object), `timeout` (ms) | ส่งคำสั่งและรอผลลัพธ์ (Promise) | `Promise<ResponseObject>` |
| `getConnectionStatus` | - | เช็คสถานะการเชื่อมต่อ | `{ connected: boolean, ... }` |

---

## 2. `multi-asset-loader.js` (Class: `MultiAssetLoader`)
เครื่องมือโหลดข้อมูลหลายคู่เงินพร้อมกัน

**Constructor:** `new MultiAssetLoader(derivAPI, indicators)`

| Function Name | Parameters | Description | Input/Output |
| :--- | :--- | :--- | :--- |
| `loadMultipleAssets` | `symbols` (Array), `granularity` (Int), `count` (Int) | โหลดข้อมูลหลายตัวพร้อมกัน (Parallel) | **Input**: `(["R_50", "R_100"], 60, 1000)`<br>**Output**: `{ success: true, assets: { "R_50": {...} }, ... }` |
| `calculateAllIndicators` | `maType`, `periods`, `rsiPeriod`, `useSuperKernel` | คำนวณอินดิเคเตอร์ให้ทุก Asset ที่โหลดไว้ | **Output**: `{ "R_50": { mas: [], rsi: [], choppy: [] } }` |
| `loadAndCalculate` | `symbols`, `granularity`, `count`, `maType`, `useSuperKernel` | (All-in-One) โหลดและคำนวณในคำสั่งเดียว | `Promise<ResultObject>` |
| `getAsset` | `symbol` | ดึงข้อมูลดิบของ Asset นั้น | `{ candles: [], closes: [], ... }` |
| `clear` | - | ล้างข้อมูลในหน่วยความจำ | - |

---

## 3. `indicators.js` (Object: `Indicators`)
สูตรคำนวณคณิตศาสตร์พื้นฐาน (Pure Functions)

| Function Name | Parameters | Description | Input/Output |
| :--- | :--- | :--- | :--- |
| `sma` | `data` (Array), `period` (Int) | Simple Moving Average | `[null, ..., val, val]` |
| `ema` | `data` (Array), `period` (Int) | Exponential Moving Average | `[val, val, ...]` |
| `wma` | `data` (Array), `period` (Int) | Weighted Moving Average | `[null, ..., val]` |
| `hma` | `data` (Array), `period` (Int) | Hull Moving Average | `[null, ..., val]` |
| `ehma` | `data` (Array), `period` (Int) | Exponential Hull Moving Average | `[null, ..., val]` |
| `rma` | `data` (Array), `period` (Int) | Rolling Moving Average (Wilder's) | `[null, ..., val]` |
| `rsi` | `data` (Array), `period` (Int) | Relative Strength Index | `[null, ..., 0-100]` |
| `atr` | `high`, `low`, `close` (Arrays), `period` | Average True Range | `[null, ..., val]` |
| `adx` | `high`, `low`, `close`, `period` | Average Directional Index | `[null, ..., val]` |
| `ci` | `high`, `low`, `close`, `period` | Choppiness Index | `[null, ..., 0-100]` |
| `bollingerBands` | `data`, `period`, `stdDevMultiplier` | Bollinger Bands | `{ upper: [], middle: [], lower: [] }` |
| `tr` | `high`, `low`, `close` | True Range | `[val, val, ...]` |

---

## 4. `SMCIndicator.js` (Class: `SMCIndicator`)
เครื่องมือวิเคราะห์ Smart Money Concepts

**Constructor:** `new SMCIndicator(config)`
*Config:* `{ swingLength: 50, internalLength: 5, showOrderBlocks: true, ... }`

| Function Name | Parameters | Description | Input/Output |
| :--- | :--- | :--- | :--- |
| `calculate` | `data` (Array of OHLCV) | ประมวลผลข้อมูลทั้งหมด | Returns `this` (Chainable) |
| `getStructures` | `filter` (Object) | ดึงจุด Break of Structure (BOS/CHoCH) | `Array[{ time, price, type: 'BOS'/'CHoCH', ... }]` |
| `getSwingPoints` | `filter` (Object) | ดึงจุด High/Low (HH, HL, LH, LL) | `Array[{ time, price, type: 'HH', ... }]` |
| *Properties* | - | (Access directly after calculate) | `this.orderBlocks`, `this.fairValueGaps`, `this.strongWeakLevels` |

---

## 5. `webgpu-indicators.js` (Class: `WebGPUIndicators`)
ตัวเร่งความเร็วการคำนวณด้วยการ์ดจอ

**Constructor:** `new WebGPUIndicators()`

| Function Name | Parameters | Description | Input/Output |
| :--- | :--- | :--- | :--- |
| `initialize` | - | เริ่มต้นการทำงาน (ต้องเรียกก่อนใช้) | `Promise` |
| `calculateBatch` | `assetsData` (Object), `periods` (Object) | **(Super Kernel)** คำนวณหลาย Asset พร้อมกัน | **Input**: `{ closes: [[...], [...]], ... }`<br>**Output**: `[{ rsi: [], choppy: [] }, ...]` |
| `calculateRSI` | `prices`, `period` | คำนวณ RSI ด้วย GPU | `Array` |
| `calculateChoppiness` | `highs`, `lows`, `closes`, `period` | คำนวณ CI ด้วย GPU | `Array` |
| `getGPUStatus` | - | เช็คสถานะ GPU | `{ isGPUAvailable: true/false, mode: 'gpu'/'cpu' }` |

---

## 6. `clsAnalysisGeneratorV2.js` (Class: `AnalysisGeneratorV2`)
ตัวรวมผลวิเคราะห์ระดับสูง (High-Level Analysis)

**Constructor:** `new AnalysisGeneratorV2(candleData, options, gpu)`

| Function Name | Parameters | Description | Input/Output |
| :--- | :--- | :--- | :--- |
| `generate` | - | สร้างผลวิเคราะห์รวมทุก Indicator + SMC | **Output**: `Array[AnalysisObject]` (ดูรายละเอียดด้านล่าง) |
| `getSMCChartData` | - | ดึงข้อมูล SMC Raw Version สำหรับวาดกราฟ | `{ orderBlocks: [], fairValueGaps: [], ... }` |
| `calculateSMC` | - | (Internal) เรียกใช้ SMCIndicator | `Object` (Aggregated SMC data) |

### Structure of `AnalysisObject` (Output from `.generate()`):
```json
{
  "index": 0,
  "candletime": 1699999999,
  "open": 1.0500, "high": 1.0550, "low": 1.0490, "close": 1.0520,
  "color": "Green",
  
  // Trend
  "emaShortValue": 1.0510, "emaShortDirection": "Up",
  "emaMediumValue": 1.0480, "emaMediumDirection": "Up",
  "emaLongValue": 1.0400, "emaLongDirection": "Up",
  
  // Volatility
  "choppyIndicator": 45.5,
  "atr": 0.0020,
  "bbUpper": 1.0600, "bbMiddle": 1.0500, "bbLower": 1.0400,
  "accuStatus": "Squeeze", // 'Squeeze', 'Expansion', 'Parallel', 'Normal'
  
  // Momentum
  "rsiValue": 65.2,
  "adxValue": 30.5,
  
  // SMC
  "smcSwing": "HH",          // Higher High
  "smcStructure": "BOS-bullish",
  "smcOrderBlock": "bullish",
  "smcFVG": "bullish"
}
```
