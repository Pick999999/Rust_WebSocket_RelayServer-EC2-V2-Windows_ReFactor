# 🚀 OHLC Subscription - Quick Reference Guide

## 📖 สรุปสั้นๆ

การอัพเดทครั้งนี้เปลี่ยนจาก **Tick Subscription** (ราคาทีละ tick) เป็น **OHLC Subscription** (แท่งเทียน) เพื่อให้ได้ข้อมูลที่ครบถ้วนและเหมาะสมกับ Candlestick Chart

---

## 🎯 สิ่งที่เปลี่ยนแปลง

### ✅ เปลี่ยนจาก Ticks → OHLC
- **เดิม:** ได้แค่ `value` (ราคา) และ `time`
- **ใหม่:** ได้ `open`, `high`, `low`, `close`, `epoch`

### ⚠️ ปิด Daily Loss Limit
- Bot จะเทรดต่อเนื่องโดยไม่หยุดเมื่อขาดทุนเกิน Daily Loss Limit
- Session Loss และ Consecutive Loss ยังทำงานปกติ

---

## 📊 โครงสร้างข้อมูล OHLC

```javascript
{
  "ohlc": {
    "open": 1049.75,      // ราคาเปิด
    "high": 1049.92,      // ราคาสูงสุด
    "low": 1049.65,       // ราคาต่ำสุด
    "close": 1049.87,     // ราคาปิด
    "epoch": 1770887460,  // Unix timestamp
    "granularity": 60,    // ระยะเวลา (วินาที)
    "id": "abc123...",    // Subscription ID
    "symbol": "R_50"      // Symbol
  }
}
```

---

## 🔧 วิธีใช้งาน

### 1️⃣ Subscribe OHLC (Historical + Real-time)

```javascript
const history = await api.sendAndWait({
    ticks_history: "R_50",      // Symbol
    count: 100,                 // จำนวน candle ย้อนหลัง
    end: "latest",              // ดึงถึงปัจจุบัน
    style: "candles",           // ⭐ ใช้ candles
    granularity: 60,            // 60 วินาที (1 นาที)
    adjust_start_time: 1,
    subscribe: 1                // ✅ Subscribe real-time
});

// รับข้อมูลย้อนหลัง
if (history.candles) {
    console.log('Historical Candles:', history.candles);
}

// รับ subscription ID
if (history.subscription) {
    subscriptionId = history.subscription.id;
}
```

### 2️⃣ รับข้อมูล Real-time

```javascript
api.on("ohlc", (data) => {
    if (data.ohlc) {
        console.log('New Candle:', {
            time: new Date(data.ohlc.epoch * 1000).toLocaleString(),
            O: data.ohlc.open,
            H: data.ohlc.high,
            L: data.ohlc.low,
            C: data.ohlc.close
        });
        
        // อัพเดท Chart
        candleSeries.update({
            time: data.ohlc.epoch,
            open: data.ohlc.open,
            high: data.ohlc.high,
            low: data.ohlc.low,
            close: data.ohlc.close
        });
    }
});
```

### 3️⃣ Unsubscribe

```javascript
await api.send({ forget: subscriptionId });
```

---

## ⚙️ Granularity Options

| Granularity | ระยะเวลา | ใช้เมื่อ |
|------------|---------|---------|
| `60` | 1 นาที | Day Trading |
| `120` | 2 นาที | Scalping |
| `180` | 3 นาที | Short-term |
| `300` | 5 นาที | Medium-term |
| `600` | 10 นาที | Swing Trading |
| `900` | 15 นาที | Position Trading |
| `1800` | 30 นาที | Long-term |
| `3600` | 1 ชั่วโมง | Long-term |

**ในโปรเจกต์นี้ใช้: `60` วินาที (1 นาที)**

---

## 🎨 แสดงผลใน Chart

### Line Chart (ใช้ Close Price)
```javascript
const tick = {
    time: data.ohlc.epoch,
    value: data.ohlc.close,
};
lineSeries.update(tick);
```

### Candlestick Chart (ใช้ OHLC)
```javascript
const candle = {
    time: data.ohlc.epoch,
    open: data.ohlc.open,
    high: data.ohlc.high,
    low: data.ohlc.low,
    close: data.ohlc.close
};
candleSeries.update(candle);
```

---

## 🔍 Debugging Tips

### ✅ ตรวจสอบ Subscription ทำงานหรือไม่
```javascript
// ดูใน Console
if (history.subscription) {
    console.log('✅ Subscribed! ID:', history.subscription.id);
} else {
    console.error('❌ Subscription failed!');
}
```

### ✅ ตรวจสอบ OHLC Updates
```javascript
api.on("ohlc", (data) => {
    console.log('📊 OHLC Received:', data.ohlc);
});
```

### ✅ ตรวจสอบ Candle ล่าสุด
```javascript
console.log('Last Candle:', {
    O: data.ohlc.open,
    H: data.ohlc.high,
    L: data.ohlc.low,
    C: data.ohlc.close,
    Time: new Date(data.ohlc.epoch * 1000).toLocaleString()
});
```

---

## ⚠️ Daily Loss Limit (DISABLED)

### ทำไมถึงปิด?
- เพื่อให้ Bot เทรดต่อเนื่องได้
- ไม่ต้องรอรีเซ็ตวันใหม่

### ฟีเจอร์ที่ยังทำงานอยู่:
- ✅ **Session Loss Limit** - หยุดเมื่อขาดทุนใน session ถึงจำนวนที่กำหนด
- ✅ **Consecutive Loss Limit** - หยุดเมื่อขาดทุนติดต่อกันถึงจำนวนที่กำหนด
- ✅ **Stake Reduction** - ลด stake เมื่อขาดทุน

### ต้องการเปิดกลับมา?
ค้นหาในโค้ด:
```javascript
// ⚠️ DAILY LOSS LIMIT CHECK DISABLED
```
แล้ว uncomment โค้ดด้านล่าง

---

## 📝 ข้อมูลที่แสดงใน Textarea

### Format ใหม่:
```
📊 OHLC Subscription Active (60s Candles)
Total Data Points: 150
Showing Last 100 Close Prices:
================================================================================

2024-01-15 10:31:00 | Close: 1049.8700 | Epoch: 1770887460
2024-01-15 10:30:00 | Close: 1049.6500 | Epoch: 1770887400
```

---

## 🎯 ตัวอย่างการใช้งานจริง

### สถานการณ์: เทรด R_50 ด้วย 1-minute candles

```javascript
// 1. Subscribe
const history = await api.sendAndWait({
    ticks_history: "R_50",
    count: 100,
    end: "latest",
    style: "candles",
    granularity: 60,
    subscribe: 1
});

// 2. แสดง Historical Candles
history.candles.forEach(c => {
    console.log(`${new Date(c.epoch * 1000).toLocaleTimeString()}: O=${c.open} H=${c.high} L=${c.low} C=${c.close}`);
});

// 3. รับ Real-time Updates
api.on("ohlc", (data) => {
    if (data.ohlc) {
        console.log(`NEW CANDLE: ${data.ohlc.close}`);
        
        // อัพเดท Strategy ของคุณที่นี่
        if (data.ohlc.close > data.ohlc.open) {
            console.log('📈 Bullish Candle');
        } else {
            console.log('📉 Bearish Candle');
        }
    }
});
```

---

## 🚨 Common Issues & Solutions

### ❌ ไม่ได้รับข้อมูล OHLC
**เช็ค:**
1. API Token ถูกต้องหรือไม่
2. Subscribe สำเร็จหรือไม่ (ดู `subscription.id`)
3. Message handler ติดตั้งถูกต้องหรือไม่

### ❌ Chart ไม่อัพเดท
**เช็ค:**
1. `candleSeries` สร้างแล้วหรือยัง
2. Time format ถูกต้องหรือไม่ (ต้องเป็น Unix timestamp)
3. ข้อมูลมี OHLC ครบหรือไม่

### ❌ Subscription หลุด
**วิธีแก้:**
```javascript
// Re-subscribe
await subscribeTicks(currentSymbol);
```

---

## 📚 Resources

### Deriv API Documentation
- **OHLC:** https://api.deriv.com/api-explorer#ticks_history
- **Subscribe:** https://api.deriv.com/api-explorer#subscribe

### Support Symbols
- **Volatility Indices:** R_10, R_25, R_50, R_75, R_100
- **Jump Indices:** 1HZ10V, 1HZ25V, 1HZ50V, 1HZ75V, 1HZ100V
- **Crash/Boom:** CRASH300, CRASH500, BOOM300, BOOM500

---

## ✅ Quick Checklist

หลังจากอัพเดท ตรวจสอบ:
- [ ] OHLC Updates แสดงใน Console
- [ ] Candle Chart แสดงแท่งเทียนถูกต้อง
- [ ] Line Chart แสดงราคา Close
- [ ] Textarea แสดงข้อความ "OHLC Subscription Active"
- [ ] Bot เทรดต่อเนื่องได้ (ไม่หยุดเพราะ Daily Loss)

---

**Status:** ✅ Production Ready  
**Version:** 2024.1  
**Last Updated:** January 2024