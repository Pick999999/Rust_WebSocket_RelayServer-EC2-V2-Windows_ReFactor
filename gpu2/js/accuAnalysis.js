ำ


/**
 * ฟังก์ชันตรวจสอบความปลอดภัยของแท่งเทียนสำหรับ Accumulator
 * @param {Object} ohlc - ข้อมูลราคา { open, high, low, close }
 * @param {number} maxRatio - อัตราส่วนสูงสุดที่ยอมรับได้ (ค่าเริ่มต้น 3 เท่า)
 * @returns {boolean} - true คือปลอดภัย, false คืออันตราย (ไม่ควรเข้า)
 */


/**
 * ฟังก์ชันตรวจสอบความปลอดภัยขั้นสูงสำหรับ Accumulator (ป้องกัน Spike และ Gap)
 * @param {Array} candles - ชุดข้อมูล OHLC ย้อนหลัง (เช่น 5-10 แท่งล่าสุด)
 * @returns {Object} - { isSafe: boolean, reason: string }
 */
function checkMarketSanity(candles) {
    if (!candles || candles.length < 2) return { isSafe: false, reason: "ข้อมูลไม่พอ" };

    const lastCandle = candles[candles.length - 1];
    const prevCandle = candles[candles.length - 2];

    // 1. เช็คอัตราส่วนไส้ต่อเนื้อ (ฟังก์ชันเดิมของเรา)
    const bodySize = Math.abs(lastCandle.open - lastCandle.close);
    const totalRange = lastCandle.high - lastCandle.low;
    if (bodySize === 0 || (totalRange / bodySize) > 3) {
        return { isSafe: false, reason: "Spike Detected: ไส้เทียนยาวเกินไปเมื่อเทียบกับเนื้อ" };
    }

    // 2. เช็ค "ไส้เทียนข้างเดียว" ที่ยาวผิดปกติ (ป้องกันรูปที่ 3 ที่ไส้ล่างยาวเท่ากันเป๊ะ)
    // ถ้าไส้ล่างยาวกว่าเนื้อเทียน 2 เท่า ถือว่าอันตราย
    const lowerWick = Math.min(lastCandle.open, lastCandle.close) - lastCandle.low;
    if (lowerWick > (bodySize * 2)) {
        return { isSafe: false, reason: "Unbalanced Wick: ไส้ล่างยาวผิดปกติ เสี่ยงโดนดึงลง" };
    }

    // 3. เช็ค Gap (การกระโดดของราคา) - สำหรับรูปที่ 2 และ 3
    // ถ้าราคาเปิดแท่งนี้ ห่างจากราคาปิดแท่งก่อนหน้าเกินไป แสดงว่าสภาพคล่องต่ำ
    const gap = Math.abs(lastCandle.open - prevCandle.close);
    const avgBodySize = candles.reduce((sum, c) => sum + Math.abs(c.open - c.close), 0) / candles.length;
    if (gap > avgBodySize) {
        return { isSafe: false, reason: "Price Gap: ราคากระโดด ขาดสภาพคล่อง" };
    }

    return { isSafe: true, reason: "ปกติ" };
}

// --- วิธีนำไปใช้ในบอท ---
// const marketStatus = checkMarketSanity(historyData);
// if (!marketStatus.isSafe) {
//    console.log("ปิดบอทชั่วคราวเพราะ: " + marketStatus.reason);
//    return; // ไม่ส่งคำสั่งซื้อ
// }


function isSafeToTrade(ohlc, maxRatio = 3) {
    const { open, high, low, close } = ohlc;

    // 1. คำนวณความยาวทั้งหมดของแท่งเทียน (High - Low)
    const candleRange = high - low;

    // 2. คำนวณความยาวของเนื้อเทียน (Body)
    const bodySize = Math.abs(open - close);

    // 3. ป้องกันกรณีเนื้อเทียนเป็น 0 (Doji) ซึ่งอันตรายมากใน Accumulator
    if (bodySize === 0) {
        console.warn("แจ้งเตือน: แท่งเทียน Doji (ไม่มีเนื้อเทียน) เสี่ยงสูงมาก!");
        return false;
    }

    // 4. คำนวณอัตราส่วน ไส้ต่อเนื้อ
    const ratio = candleRange / bodySize;

    // 5. ตัดสินใจ
    if (ratio > maxRatio) {
        console.log(`อันตราย: ไส้เทียนยาวเป็น ${ratio.toFixed(2)} เท่าของเนื้อเทียน!`);
        return false;
    }

    return true; // กราฟดูสมส่วน ปลอดภัยในระดับหนึ่ง
}

/**
 * ฟังก์ชันเช็คว่า "ช่วงเวลานี้" มี Spike ถถี่เกินไปหรือไม่
 * @param {Array} candles - ชุดข้อมูล OHLC ย้อนหลัง (เช่น 5-10 แท่ง)
 * @param {number} maxRatio - อัตราส่วนไส้ต่อเนื้อที่ยอมรับได้
 * @param {number} dangerThreshold - จำนวนแท่งที่อนุญาตให้ผิดปกติได้ (เช่น ถ้าเจอ 2 ใน 5 แท่ง ก็หยุดเลย)
 */
function isMarketVolatile(candles, maxRatio = 3, dangerThreshold = 2) {
    let dangerCount = 0;

    candles.forEach(ohlc => {
        const candleRange = ohlc.high - ohlc.low;
        const bodySize = Math.abs(ohlc.open - ohlc.close);

        // ถ้าเนื้อเทียนเป็น 0 หรือ อัตราส่วนสูงเกินไป นับเป็นแท่งอันตราย
        if (bodySize === 0 || (candleRange / bodySize) > maxRatio) {
            dangerCount++;
        }
    });

    // ถ้าเจอแท่งอันตรายสะสมเกินเกณฑ์ ให้ส่งค่า false (ไม่ปลอดภัย)
    return dangerCount < dangerThreshold;
}

// วิธีใช้: สมมติบอทดึงข้อมูลย้อนหลังมา 5 แท่ง
// const history = [{open:... , high:...}, {...}, ...];
// if (isMarketVolatile(history)) { ลุยต่อ } else { ปิดบอทชั่วคราว }

/*
// --- ตัวอย่างการใช้งาน ---
const candleData = {
    open: 1.0500,
    high: 1.0550, // ไส้บนยาว
    low: 1.0450,  // ไส้ล่างยาว
    close: 1.0505 // เนื้อเทียนนิดเดียว
};

if (isSafeToTrade(candleData)) {
    console.log("ลุยเลย! กราฟทรงนี้เทรด Accumulator ได้");
} else {
    console.log("หยุดก่อน! กราฟแบบนี้มีโอกาสโดน Spike สูง");
}
*/