// ============================================================
//  strategy_engine.js — กลยุทธ์รวมทุกตัว (Shared ทุก Version)
//  Choppy Indicator เป็นตัวแบ่งโซนหลัก (Primary Classifier)
// ============================================================

/**
 * Choppy Index Zones:
 *   Zone A: < 38.2   → Strong Trend (ตลาดวิ่งแรง)
 *   Zone B: 38.2–50  → Moderate Trend (เทรนด์ปานกลาง)
 *   Zone C: 50–61.8  → Transition (กำลังเปลี่ยน)
 *   Zone D: > 61.8   → Sideways/Choppy (ตลาดไร้ทิศทาง)
 */

// ==========================================
//  ฟังก์ชันหลัก: evaluateAllStrategies
// ==========================================
function evaluateAllStrategies(a) {

    // ========== 🛡️ SAFETY GUARDS ==========
    const guardResult = checkSafetyGuards(a);
    if (guardResult.block) return wait(guardResult.reason);

    const choppy = a.choppy_indicator || 100;
    const rsi = a.rsi_value || 50;
    const adx = a.adx_value || 0;

    // ========== แบ่งโซนตาม Choppy ==========
    if (choppy < 38.2) {
        return zoneA_StrongTrend(a, rsi, adx, choppy);
    } else if (choppy < 50) {
        return zoneB_ModerateTrend(a, rsi, adx, choppy);
    } else if (choppy <= 61.8) {
        return zoneC_Transition(a, rsi, adx, choppy);
    } else {
        return zoneD_Sideways(a, rsi, adx, choppy);
    }
}

// ==========================================
//  Zone A: Choppy < 38.2 — Strong Trend
//  ตลาดวิ่งเป็นเทรนด์แข็งแกร่ง → เล่นตามน้ำอย่างเดียว
// ==========================================
function zoneA_StrongTrend(a, rsi, adx, choppy) {

    // --- SMC ในเทรนด์ (ถ้ามี) ---
    if (a.smc) {
        const smcSignal = evaluateSMC(a);
        if (smcSignal) return smcSignal;
    }

    // --- A1: Full Confluence (เทรนด์สมบูรณ์แบบ) ---
    if (a.ema_short_direction === "Up" && a.ema_medium_direction === "Up"
        && a.ema_long_direction === "Up" && a.ema_above === "ShortAbove"
        && adx > 25 && rsi > 40 && rsi < 65
        && a.ema_convergence_type === "divergence"
        && a.color === "Green" && a.body_percent > 40)
        return call("A1_FullConfluence");

    if (a.ema_short_direction === "Down" && a.ema_medium_direction === "Down"
        && a.ema_long_direction === "Down"
        && adx > 25 && rsi > 35 && rsi < 60
        && a.ema_convergence_type === "divergence"
        && a.color === "Red" && a.body_percent > 40)
        return put("A1_FullConfluence");

    // --- A2: Triple EMA Alignment ---
    if (a.ema_short_direction === "Up" && a.ema_medium_direction === "Up"
        && a.ema_long_direction === "Up" && a.ema_above === "ShortAbove" && adx > 25)
        return call("A2_TripleEMA");

    if (a.ema_short_direction === "Down" && a.ema_medium_direction === "Down"
        && a.ema_long_direction === "Down" && adx > 25)
        return put("A2_TripleEMA");

    // --- A3: RSI+ADX Acceleration (เทรนด์เร่ง ยังไม่อิ่ม) ---
    if (adx > 25 && rsi > 50 && rsi < 70 && a.ema_short_direction === "Up")
        return call("A3_RSI_ADX_Accel");
    if (adx > 25 && rsi > 30 && rsi < 50 && a.ema_short_direction === "Down")
        return put("A3_RSI_ADX_Accel");

    // --- A4: Consecutive EMA Combo ---
    if ((a.up_con_medium_ema || 0) >= 3 && (a.up_con_long_ema || 0) >= 2 && rsi < 60)
        return call("A4_EMA_Combo");
    if ((a.down_con_medium_ema || 0) >= 3 && (a.down_con_long_ema || 0) >= 2 && rsi > 40)
        return put("A4_EMA_Combo");

    // --- A5: MACD Divergence Acceleration ---
    if (a.ema_convergence_type === "divergence" && a.ema_long_convergence_type === "D"
        && (a.macd_12 || 0) > (a.previous_macd_12 || 0) && a.ema_above === "ShortAbove")
        return call("A5_MACD_Accel");
    if (a.ema_convergence_type === "divergence" && a.ema_long_convergence_type === "D"
        && (a.macd_12 || 0) > (a.previous_macd_12 || 0) && a.ema_above === "MediumAbove")
        return put("A5_MACD_Accel");

    // --- A6: Wave Rider (สวิงยาว) ---
    if (a.ema_long_direction === "Up" && a.ema_long_above === "MediumAbove"
        && a.ema_long_convergence_type === "D" && (a.up_con_long_ema || 0) >= 10 && adx > 25)
        return call("A6_WaveRider");

    // --- A7: Status Code Bullish ---
    if (a.status_desc === "M-UU-G-D" || a.status_desc === "M-UU-G-C")
        return call("A7_StatusCode");
    if (a.status_desc === "L-DD-R-D" || a.status_desc === "L-DD-R-C")
        return put("A7_StatusCode");

    return wait("A_NoSignal");
}

// ==========================================
//  Zone B: Choppy 38.2–50 — Moderate Trend
//  เทรนด์กำลังก่อตัว → ใช้ Crossover / Pullback
// ==========================================
function zoneB_ModerateTrend(a, rsi, adx, choppy) {

    // --- SMC ---
    if (a.smc) {
        const smcSignal = evaluateSMC(a);
        if (smcSignal) return smcSignal;
    }

    // --- B1: Golden / Death Cross ---
    if (a.ema_cut_long_type === "UpTrend" && (a.candles_since_ema_cut || 99) <= 3
        && adx > 20 && a.ema_long_convergence_type === "D")
        return call("B1_GoldenCross");
    if (a.ema_cut_long_type === "DownTrend" && (a.candles_since_ema_cut || 99) <= 3
        && adx > 20 && a.ema_long_convergence_type === "D")
        return put("B1_DeathCross");

    // --- B2: Pullback Entry ---
    if (a.ema_long_above === "MediumAbove" && (a.up_con_long_ema || 0) >= 5
        && rsi >= 35 && rsi <= 50 && a.ema_short_turn_type === "TurnUp")
        return call("B2_Pullback");
    if (a.ema_long_above === "LongAbove" && (a.down_con_long_ema || 0) >= 5
        && rsi >= 50 && rsi <= 65 && a.ema_short_turn_type === "TurnDown")
        return put("B2_Pullback");

    // --- B3: ADX Breakout Confirmation ---
    if (adx > 25 && a.ema_short_direction === "Up"
        && a.ema_convergence_type === "divergence")
        return call("B3_ADX_Breakout");
    if (adx > 25 && a.ema_short_direction === "Down"
        && a.ema_convergence_type === "divergence")
        return put("B3_ADX_Breakout");

    // --- B4: Multi-TF EMA Consensus (2/3 ชี้) ---
    const dirs = [a.ema_short_direction, a.ema_medium_direction, a.ema_long_direction];
    if (dirs.filter(d => d === "Up").length >= 2 && a.color === "Green")
        return call("B4_EMA_Consensus");
    if (dirs.filter(d => d === "Down").length >= 2 && a.color === "Red")
        return put("B4_EMA_Consensus");

    return wait("B_NoSignal");
}

// ==========================================
//  Zone C: Choppy 50–61.8 — Transition
//  ตลาดกำลังเปลี่ยนสถานะ → เทรดระวัง จับ Breakout/Squeeze
// ==========================================
function zoneC_Transition(a, rsi, adx, choppy) {

    // --- C1: BB Squeeze → Breakout ---
    if (a.bb_position === "NearUpper" && a.ema_short_direction === "Up"
        && a.color === "Green" && a.body_percent > 60)
        return call("C1_BB_Squeeze_Breakout");
    if (a.bb_position === "NearLower" && a.ema_short_direction === "Down"
        && a.color === "Red" && a.body_percent > 60)
        return put("C1_BB_Squeeze_Breakout");

    // --- C2: MACD Convergence Squeeze → EMA Turn ---
    if (a.ema_convergence_type === "convergence"
        && a.ema_short_turn_type === "TurnUp" && a.color === "Green")
        return call("C2_MACD_Squeeze_Turn");
    if (a.ema_convergence_type === "convergence"
        && a.ema_short_turn_type === "TurnDown" && a.color === "Red")
        return put("C2_MACD_Squeeze_Turn");

    // --- C3: RSI Oversold/Overbought + EMA Filter ---
    if (rsi < 35 && a.ema_medium_direction === "Up"
        && a.ema_short_turn_type === "TurnUp")
        return call("C3_RSI_EMA_Filter");
    if (rsi > 65 && a.ema_medium_direction === "Down"
        && a.ema_short_turn_type === "TurnDown")
        return put("C3_RSI_EMA_Filter");

    // --- C4: Candle Anatomy (Hammer / Shooting Star) ---
    if (a.l_wick_percent > 60 && a.u_wick_percent < 10 && a.body_percent < 30
        && a.bb_position !== "NearUpper")
        return call("C4_Hammer");
    if (a.u_wick_percent > 60 && a.l_wick_percent < 10 && a.body_percent < 30
        && a.bb_position !== "NearLower")
        return put("C4_ShootingStar");

    return wait("C_NoSignal");
}

// ==========================================
//  Zone D: Choppy > 61.8 — Sideways
//  ตลาดไซด์เวย์ → สวนเทรนด์ เด้งขอบกรอบ
// ==========================================
function zoneD_Sideways(a, rsi, adx, choppy) {

    // --- D1: BB + RSI Extreme Confluence (สัญญาแม่นที่สุดในไซด์เวย์) ---
    if (rsi < 30 && a.bb_position === "NearLower"
        && a.ema_short_turn_type === "TurnUp" && a.l_wick_percent > 50)
        return call("D1_BB_RSI_Extreme");
    if (rsi > 70 && a.bb_position === "NearUpper"
        && a.ema_short_turn_type === "TurnDown" && a.u_wick_percent > 50)
        return put("D1_BB_RSI_Extreme");

    // --- D2: BB Bounce + Wick Rejection ---
    if (a.bb_position === "NearLower" && rsi < 40
        && a.l_wick_percent > 50 && a.body_percent < 30)
        return call("D2_BB_Bounce_Wick");
    if (a.bb_position === "NearUpper" && rsi > 60
        && a.u_wick_percent > 50 && a.body_percent < 30)
        return put("D2_BB_Bounce_Wick");

    // --- D3: Range Ping-Pong (เด้งขอบ) ---
    if (a.bb_position === "NearLower" && rsi < 40)
        return call("D3_PingPong");
    if (a.bb_position === "NearUpper" && rsi > 60)
        return put("D3_PingPong");

    // --- D4: EMA Turn Sniper ---
    if (a.ema_short_turn_type === "TurnUp" && a.ema_medium_direction !== "Down"
        && rsi < 55 && a.l_wick_percent > 40)
        return call("D4_EMA_Turn");
    if (a.ema_short_turn_type === "TurnDown" && a.ema_medium_direction !== "Up"
        && rsi > 45 && a.u_wick_percent > 40)
        return put("D4_EMA_Turn");

    return wait("D_NoSignal");
}

// ==========================================
//  SMC Sub-Module (ใช้ได้ทุกโซน)
// ==========================================
function evaluateSMC(a) {
    const smc = a.smc;
    const pdz = smc.premium_discount_zone;
    if (!pdz) return null;

    // M01: Discount Zone + Bullish OB → CALL
    if (smc.swing_trend === "bullish" && a.close <= pdz.equilibrium) {
        const touchOB = (smc.order_blocks || []).some(ob =>
            ob.bias === "bullish" && !ob.mitigated && a.low <= ob.high && a.close >= ob.low);
        if (touchOB && (smc.internal_trend === "bullish" || a.l_wick_percent > 40))
            return call("M01_SMC_Discount");
    }

    // M02: Premium Zone + Bearish OB → PUT
    if (smc.swing_trend === "bearish" && a.close >= pdz.equilibrium) {
        const touchOB = (smc.order_blocks || []).some(ob =>
            ob.bias === "bearish" && !ob.mitigated && a.high >= ob.low && a.close <= ob.high);
        if (touchOB && (smc.internal_trend === "bearish" || a.u_wick_percent > 40))
            return put("M02_SMC_Premium");
    }

    return null;
}

// ==========================================
//  Safety Guards
// ==========================================
function checkSafetyGuards(a) {
    if (a.is_abnormal_candle) return { block: true, reason: "ABNORMAL_CANDLE" };
    if (a.is_abnormal_atr) return { block: true, reason: "ABNORMAL_ATR" };
    if (a.color === "Equal" && a.body_percent < 5.0) return { block: true, reason: "DOJI" };
    if ((a.loss_con || 0) >= 3) return { block: true, reason: "LOSS_COOLDOWN" };
    return { block: false };
}

// ==========================================
//  Risk Management (ATR-Based)
// ==========================================
function calculateRisk(a) {
    const atr = a.atr || 1.0;
    const choppy = a.choppy_indicator || 50;
    const slMult = a.is_abnormal_atr ? 3.0 : 1.5;
    const tpMult = choppy > 61.8 ? 1.0 : 2.0; // ไซด์เวย์ = TP สั้น
    return {
        stopLoss: atr * slMult,
        takeProfit: atr * tpMult,
        riskReward: tpMult / slMult
    };
}

// ==========================================
//  Helpers
// ==========================================
function call(strategy) { return { action: "CALL", strategy }; }
function put(strategy) { return { action: "PUT", strategy }; }
function wait(reason) { return { action: "WAIT", strategy: reason }; }

// Export สำหรับ Node.js / module
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { evaluateAllStrategies, checkSafetyGuards, calculateRisk };
}

// Export สำหรับ Browser Global & Worker Module
if (typeof self !== 'undefined') {
    self.evaluateAllStrategies = evaluateAllStrategies;
    self.checkSafetyGuards = checkSafetyGuards;
    self.calculateRisk = calculateRisk;
}
