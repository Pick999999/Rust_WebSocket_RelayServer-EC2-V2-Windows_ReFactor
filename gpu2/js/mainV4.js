/**
 * Main Application Logic V4
 * Shows Top 8 Best Choppy Indicator + Candle Color Assets
 * With SMC Integration (HH, HL, BOS, CHoCH)
 */

const appV4 = {
  state: {
    timeframe: 60, // seconds
    refreshInterval: 60000, // ms
    // All 10 assets combined
    assets: [
      { symbol: "R_10", name: "Volatility 10 Index" },
      { symbol: "R_25", name: "Volatility 25 Index" },
      { symbol: "R_50", name: "Volatility 50 Index" },
      { symbol: "R_75", name: "Volatility 75 Index" },
      { symbol: "R_100", name: "Volatility 100 Index" },
      { symbol: "1HZ10V", name: "Volatility 10 (1s) Index" },
      { symbol: "1HZ25V", name: "Volatility 25 (1s) Index" },
      { symbol: "1HZ50V", name: "Volatility 50 (1s) Index" },
      { symbol: "1HZ75V", name: "Volatility 75 (1s) Index" },
      { symbol: "1HZ100V", name: "Volatility 100 (1s) Index" },
    ],
    params: {
      ciPeriod: 14,
      adxPeriod: 14,
      adxSmoothing: 14,
      emaShort: { type: "EMA", period: 7, show: true },
      emaMedium: { type: "EMA", period: 25, show: true },
      emaLong: { type: "EMA", period: 99, show: true },
      atr: { period: 14, multiplier: 1.5, show: true },
    },
    // Analysis Settings
    analysisSettings: {
      analysisVersion: "V2", // 'V1' = Original, 'V2' = AnalysisGenerator Class
      flatThreshold: 0.00001,
      macdThreshold: 0.0001,
      hmaPeriod: 9,
      ehmaPeriod: 9,
      bbPeriod: 20,
      bbStdDev: 2,
    },
    // SMC Settings
    smcSettings: {
      showSMC: true,
      swingLength: 20,
      internalLength: 5,
    },
    // SMC display filters
    smcDisplay: {
      obBull: true,
      obBear: true,
      fvgBull: true,
      fvgBear: true,
    },
    // Tooltip field selections
    tooltipFields: {
      candletime: true,
      color: true,
      pipSize: true,
      emaShortValue: true,
      emaShortDirection: true,
      emaMediumValue: true,
      emaMediumDirection: true,
      emaLongValue: true,
      emaLongDirection: true,
      choppyIndicator: true,
      adxValue: true,
    },
    dataStore: {},
    candleStore: {},
    analysisDataStore: {},
    meters: {},
    reqIdMap: new Map(),
    serverTimeOffset: 0,
    isPolling: true,
    beepEnabled: false,
    previousCrossovers: {},
    audioContext: null,
    nextUpdateTime: null,
    // Chart related
    selectedSymbol: null,
    chart: null,
    candleSeries: null,
    emaShortSeries: null,
    emaMediumSeries: null,
    emaLongSeries: null,
    chartPollInterval: null,
    chartReqId: null,
    chartTooltip: null,
    // Background Zones
    zonesEnabled: false,
    zonesPlugin: null,
    zonesSettings: {
      showCiZones: true,
      showRsiZones: true,
      ciTrendingThreshold: 38.2,
      ciChoppyThreshold: 61.8,
      rsiOversoldThreshold: 30,
      rsiOverboughtThreshold: 70,
      rsiPeriod: 14,
      showLabels: false,
    },
    rsiArray: {},
    altColorZonesEnabled: false,
    altColorMarkers: [],
    // Micro Tick Arrows
    microArrowsEnabled: false,
    microIndy: null,
    // Direct tick arrows storage for real-time display
    microTickArrows: [],
    lastTickPrice: null,
    lastTickTime: null,
    maxMicroArrows: 180, // Keep 3 minutes of 1-second data
    renderedArrowCount: 0, // Track for incremental rendering
    currentMinuteKey: null, // Track current minute for summary updates
  },

  init: async () => {
    appV4.updateStatus("Connecting...", "disconnected");
    appV4.loadSavedSettings();
    // Load EMA color inputs (if previously saved)
    appV4.loadEmaColors();
    appV4.loadEmaSettings();
    // Apply SMC display checkbox UI from state
    try {
      const obBull = document.getElementById("chk-ob-bull");
      if (obBull) obBull.checked = !!appV4.state.smcDisplay.obBull;
      const obBear = document.getElementById("chk-ob-bear");
      if (obBear) obBear.checked = !!appV4.state.smcDisplay.obBear;
      const fvgBull = document.getElementById("chk-fvg-bull");
      if (fvgBull) fvgBull.checked = !!appV4.state.smcDisplay.fvgBull;
      const fvgBear = document.getElementById("chk-fvg-bear");
      if (fvgBear) fvgBear.checked = !!appV4.state.smcDisplay.fvgBear;
    } catch (e) {
      /* ignore DOM timing issues */
    }
    DerivAPI.onOpen = appV4.onConnected;
    DerivAPI.onMessage = appV4.onMessage;
    try {
      await DerivAPI.connect();
    } catch (e) {
      appV4.updateStatus("Connection Failed", "disconnected");
    }
    if (appV4._clockInterval) clearInterval(appV4._clockInterval);
    appV4._clockInterval = setInterval(appV4.updateClock, 1000);
    document.addEventListener(
      "click",
      () => {
        if (!appV4.state.audioContext)
          appV4.state.audioContext = new (
            window.AudioContext || window.webkitAudioContext
          )();
      },
      { once: true },
    );

    // Initialize Micro Tick Indy
    if (typeof clsMicroTickIndy !== "undefined") {
      appV4.state.microIndy = new clsMicroTickIndy({
        maxArrows: 40,
        maxChange: 0.5,
        marketType: "volatility",
      });

      // Callback to re-render when arrows update
      appV4.state.microIndy.on("arrowUpdate", (arrows) => {
        if (appV4.state.microArrowsEnabled) {
          appV4.renderMicroArrows(arrows);
        }
      });
    }

    // Expose app for debugging
    window.appV4 = appV4;
  },

  loadSavedSettings: () => {
    try {
      const saved = localStorage.getItem("choppyMeterV2Settings");
      if (saved) {
        const settings = JSON.parse(saved);
        if (settings.timeframe) {
          document.getElementById("timeframe-select").value =
            settings.timeframe;
          appV4.state.timeframe = settings.timeframe;
        }
        if (settings.refreshInterval) {
          document.getElementById("refresh-interval-select").value =
            settings.refreshInterval;
          appV4.state.refreshInterval = settings.refreshInterval;
        }
        if (settings.beepEnabled !== undefined) {
          document.getElementById("beep-toggle").checked = settings.beepEnabled;
          appV4.state.beepEnabled = settings.beepEnabled;
        }

        // Simplified EMA loading
        ["short", "medium", "long"].forEach((t) => {
          const key = "ema" + t.charAt(0).toUpperCase() + t.slice(1);
          if (settings[key]) {
            if (settings[key].type)
              document.getElementById(`ema-${t}-type`).value =
                settings[key].type;
            if (settings[key].period)
              document.getElementById(`ema-${t}-period`).value =
                settings[key].period;
            if (settings[key].show !== undefined) {
              const show = settings[key].show;
              // Modal toggle
              const modalChk = document.getElementById(`ema-${t}-show`);
              if (modalChk) modalChk.checked = show;
              // Quick toggle
              const quickChk = document.getElementById(`quick-ema-${t}`);
              if (quickChk) quickChk.checked = show;
            }
          }
        });

        if (settings.atr) {
          if (settings.atr.period)
            document.getElementById("atr-period").value = settings.atr.period;
          if (settings.atr.multiplier)
            document.getElementById("atr-multiplier").value =
              settings.atr.multiplier;
          if (settings.atr.show !== undefined)
            document.getElementById("atr-show").checked = settings.atr.show;
        }

        if (settings.tooltipFields)
          appV4.state.tooltipFields = {
            ...appV4.state.tooltipFields,
            ...settings.tooltipFields,
          };
        if (settings.smcDisplay)
          appV4.state.smcDisplay = {
            ...appV4.state.smcDisplay,
            ...settings.smcDisplay,
          };
      }
    } catch (e) {
      console.error(e);
    }
  },

  saveSettings: () => {
    try {
      const settings = {
        timeframe: appV4.state.timeframe,
        refreshInterval: appV4.state.refreshInterval,
        beepEnabled: appV4.state.beepEnabled,
        emaShort: appV4.state.params.emaShort,
        emaMedium: appV4.state.params.emaMedium,
        emaLong: appV4.state.params.emaLong,
        atr: appV4.state.params.atr,
        tooltipFields: appV4.state.tooltipFields,
      };
      settings.smcDisplay = appV4.state.smcDisplay;
      // Also read EMA color inputs (if present) and persist them
      try {
        const emaColors = {
          short:
            document.getElementById("ema-short-color")?.value ||
            appV4.state.params.emaShort.color ||
            "#3b82f6",
          medium:
            document.getElementById("ema-medium-color")?.value ||
            appV4.state.params.emaMedium.color ||
            "#f59e0b",
          long:
            document.getElementById("ema-long-color")?.value ||
            appV4.state.params.emaLong.color ||
            "#8b5cf6",
        };

        // Always update state color values from inputs
        appV4.state.params.emaShort = {
          ...appV4.state.params.emaShort,
          color: emaColors.short,
        };
        appV4.state.params.emaMedium = {
          ...appV4.state.params.emaMedium,
          color: emaColors.medium,
        };
        appV4.state.params.emaLong = {
          ...appV4.state.params.emaLong,
          color: emaColors.long,
        };

        settings.emaColors = emaColors;

        // If chart exists, apply colors to series immediately
        try {
          if (appV4.state.chart) {
            if (appV4.state.emaShortSeries)
              appV4.state.emaShortSeries.applyOptions({
                color: emaColors.short,
              });
            if (appV4.state.emaMediumSeries)
              appV4.state.emaMediumSeries.applyOptions({
                color: emaColors.medium,
              });
            if (appV4.state.emaLongSeries)
              appV4.state.emaLongSeries.applyOptions({ color: emaColors.long });
          }
        } catch (e) {
          console.warn("Failed to apply EMA colors to chart series", e);
        }
      } catch (e) {
        console.warn("Failed to read/save EMA colors", e);
      }

      localStorage.setItem("choppyMeterV2Settings", JSON.stringify(settings));
    } catch (e) {
      console.error(e);
    }
  },

  handleSmcDisplayToggle: () => {
    const obBull = document.getElementById("chk-ob-bull");
    const obBear = document.getElementById("chk-ob-bear");
    const fvgBull = document.getElementById("chk-fvg-bull");
    const fvgBear = document.getElementById("chk-fvg-bear");

    appV4.state.smcDisplay.obBull = !!(obBull && obBull.checked);
    appV4.state.smcDisplay.obBear = !!(obBear && obBear.checked);
    appV4.state.smcDisplay.fvgBull = !!(fvgBull && fvgBull.checked);
    appV4.state.smcDisplay.fvgBear = !!(fvgBear && fvgBear.checked);

    appV4.saveSettings();
    appV4.updateSelectedChart();
  },

  loadEmaSettings: () => {
    ["short", "medium", "long"].forEach((t) => {
      appV4.state.params[`ema${t.charAt(0).toUpperCase() + t.slice(1)}`] = {
        type: document.getElementById(`ema-${t}-type`).value,
        period: parseInt(document.getElementById(`ema-${t}-period`).value),
        show: document.getElementById(`ema-${t}-show`).checked,
      };
    });
    appV4.state.params.atr = {
      period: parseInt(document.getElementById("atr-period").value),
      multiplier: parseFloat(document.getElementById("atr-multiplier").value),
      show: document.getElementById("atr-show").checked,
    };
  },

  onConnected: () => {
    appV4.updateStatus("Connected", "connected");
    appV4.refreshData();
    appV4.syncTime();
    if (appV4._syncTimeInterval) clearInterval(appV4._syncTimeInterval);
    appV4._syncTimeInterval = setInterval(appV4.syncTime, 60000);
    appV4.startPolling();
  },

  syncTime: () => {
    if (DerivAPI.ws && DerivAPI.ws.readyState === 1)
      DerivAPI.ws.send(JSON.stringify({ time: 1 }));
  },

  startPolling: () => {
    if (appV4.pollInterval) clearInterval(appV4.pollInterval);
    appV4.state.nextUpdateTime = Date.now() + appV4.state.refreshInterval;
    appV4.pollInterval = setInterval(() => {
      appV4.refreshData();
      appV4.state.nextUpdateTime = Date.now() + appV4.state.refreshInterval;
    }, appV4.state.refreshInterval);
  },

  handleTimeframeChange: () => {
    appV4.state.timeframe = parseInt(
      document.getElementById("timeframe-select").value,
    );
    appV4.state.dataStore = {};
    appV4.state.candleStore = {};
    appV4.saveSettings();
    appV4.refreshData();
  },

  handleRefreshIntervalChange: () => {
    appV4.state.refreshInterval = parseInt(
      document.getElementById("refresh-interval-select").value,
    );
    appV4.saveSettings();
    appV4.startPolling();
  },

  toggleBeep: () => {
    appV4.state.beepEnabled = document.getElementById("beep-toggle").checked;
    appV4.saveSettings();
  },

  refreshData: () => {
    if (!DerivAPI.ws || DerivAPI.ws.readyState !== 1) return;
    appV4.loadEmaSettings();
    const grid = document.getElementById("asset-grid");
    if (grid.children.length === 0 || grid.querySelector(".loading-state"))
      grid.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Fetching Data...</p></div>`;

    appV4.state.assets.forEach((asset, index) => {
      const reqId = Date.now() + index;
      appV4.state.reqIdMap.set(reqId, asset.symbol);
      DerivAPI.ws.send(
        JSON.stringify({
          ticks_history: asset.symbol,
          adjust_start_time: 1,
          count: 150,
          end: "latest",
          style: "candles",
          granularity: appV4.state.timeframe,
          req_id: reqId,
        }),
      );
    });
  },

  onMessage: (data) => {
    if (data.msg_type === "candles") {
      const reqId = data.req_id;

      // Handle Micro Tick subscription (req_id 99999)
      if (reqId === 99999) {
        // This is handled in msg_type === 'history' below
        return;
      }

      const symbol = appV4.state.reqIdMap.get(reqId);
      if (!symbol) return;
      if (reqId === appV4.state.chartReqId)
        appV4.processChartData(symbol, data.candles);
      else appV4.processCandles(symbol, data.candles);
    } else if (data.msg_type === "history") {
      // Handle historical TICKS data (for micro arrows)
      if (data.req_id === 99999 && appV4.state.microArrowsEnabled) {
        const prices = data.history?.prices || [];
        const times = data.history?.times || [];

        console.log("[MicroTick] Received historical ticks:", prices.length);

        // Store subscription ID
        if (data.subscription && data.subscription.id) {
          DerivAPI.microTickSubId = data.subscription.id;
          console.log("[MicroTick] Subscription ID:", data.subscription.id);
        }

        if (prices.length > 1) {
          appV4.state.microTickArrows = [];

          // Set initial price
          appV4.state.lastTickPrice = parseFloat(prices[0]);
          appV4.state.lastTickTime = parseInt(times[0]);

          // Create arrows from tick comparisons
          for (let i = 1; i < prices.length; i++) {
            const currentPrice = parseFloat(prices[i]);
            const previousPrice = parseFloat(prices[i - 1]);
            const currentTime = parseInt(times[i]);

            const priceChange =
              ((currentPrice - previousPrice) / previousPrice) * 100;
            const absChange = Math.abs(priceChange);
            const direction = priceChange >= 0 ? "up" : "down";

            let opacity = absChange / 0.005;
            opacity = Math.max(0.3, Math.min(1.0, opacity));

            appV4.state.microTickArrows.push({
              direction: direction,
              opacity: opacity,
              change: priceChange,
              time: currentTime,
              currentClose: currentPrice,
              previousClose: previousPrice,
              priceChangeAbs: currentPrice - previousPrice,
            });
          }

          // Update last price
          appV4.state.lastTickPrice = parseFloat(prices[prices.length - 1]);
          appV4.state.lastTickTime = parseInt(times[times.length - 1]);

          console.log(
            "[MicroTick] Created",
            appV4.state.microTickArrows.length,
            "arrows from historical ticks",
          );

          appV4.state.lastRenderedArrowCount = 0; // Force full render
          appV4.renderMicroArrows(appV4.state.microTickArrows);
        }
      }
    } else if (data.msg_type === "tick") {
      // Handle real-time TICK updates (for micro arrows)
      if (data.tick && appV4.state.microArrowsEnabled) {
        const tick = data.tick;
        const currentPrice = parseFloat(tick.quote);
        const currentTime = parseInt(tick.epoch);

        // If we have a previous price, add an arrow
        if (
          appV4.state.lastTickPrice !== null &&
          currentPrice !== appV4.state.lastTickPrice
        ) {
          const priceChange =
            ((currentPrice - appV4.state.lastTickPrice) /
              appV4.state.lastTickPrice) *
            100;
          const absChange = Math.abs(priceChange);
          const direction = priceChange >= 0 ? "up" : "down";

          let opacity = absChange / 0.005;
          opacity = Math.max(0.3, Math.min(1.0, opacity));

          const arrow = {
            direction: direction,
            opacity: opacity,
            change: priceChange,
            time: currentTime,
            currentClose: currentPrice,
            previousClose: appV4.state.lastTickPrice,
            priceChangeAbs: currentPrice - appV4.state.lastTickPrice,
          };

          appV4.state.microTickArrows.push(arrow);

          // Keep only last N arrows
          if (appV4.state.microTickArrows.length > appV4.state.maxMicroArrows) {
            appV4.state.microTickArrows = appV4.state.microTickArrows.slice(
              -appV4.state.maxMicroArrows,
            );
            // Reset rendered count when trimming
            appV4.state.renderedArrowCount = 0;
            appV4.renderMicroArrows(appV4.state.microTickArrows);
          } else {
            // Incremental append - only add the new arrow
            appV4.appendMicroArrow(arrow);
          }
        }

        // Update last price
        appV4.state.lastTickPrice = currentPrice;
        appV4.state.lastTickTime = currentTime;
      }
    } else if (data.msg_type === "ohlc") {
      // Legacy OHLC handler (not used for micro arrows anymore)
    } else if (data.msg_type === "time") {
      appV4.state.serverTimeOffset = data.time * 1000 - Date.now();
    }
  },

  calculateMA: (data, type, period) => {
    switch (type) {
      case "SMA":
        return Indicators.sma(data, period);
      case "WMA":
        return Indicators.wma(data, period);
      case "HMA":
        return Indicators.hma(data, period);
      case "EHMA":
        return Indicators.ehma(data, period);
      default:
        return Indicators.ema(data, period);
    }
  },

  processCandles: (symbol, candles, updateGrid = true) => {
    appV4.state.candleStore[symbol] = candles;
    const closes = candles.map((c) => c.close);
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);

    const ci = Indicators.ci(highs, lows, closes, appV4.state.params.ciPeriod);
    const adx = Indicators.adx(
      highs,
      lows,
      closes,
      appV4.state.params.adxPeriod,
    );
    const emaShort = appV4.calculateMA(
      closes,
      appV4.state.params.emaShort.type,
      appV4.state.params.emaShort.period,
    );
    const emaMedium = appV4.calculateMA(
      closes,
      appV4.state.params.emaMedium.type,
      appV4.state.params.emaMedium.period,
    );
    const emaLong = appV4.calculateMA(
      closes,
      appV4.state.params.emaLong.type,
      appV4.state.params.emaLong.period,
    );
    const rsi = Indicators.rsi(closes, 14); // Default RSI 14
    const atr = Indicators.atr(
      highs,
      lows,
      closes,
      appV4.state.params.atr.period,
    );
    const bbValues = Indicators.bollingerBands(
      closes,
      appV4.state.analysisSettings.bbPeriod,
      appV4.state.analysisSettings.bbStdDev,
    );

    // SMC Calc
    let smcData = null;
    if (typeof SMCIndicator !== "undefined") {
      const smc = new SMCIndicator({
        swingLength: appV4.state.smcSettings.swingLength,
        internalLength: appV4.state.smcSettings.internalLength,
        showOrderBlocks: true,
        showFVG: true,
        showEqualHL: true,
        showPremiumDiscount: true,
      });
      smc.calculate(
        candles.map((c) => ({
          time: c.epoch,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        })),
      );

      // Map to structure expected by SMCChartRenderer
      smcData = {
        swingPoints: smc.getSwingPoints(),
        structures: smc.getStructures(),
        orderBlocks: smc.orderBlocks, // Direct access or getter
        fairValueGaps: smc.fairValueGaps, // Direct access or getter
        equalHighsLows: smc.equalHighsLows,
        strongWeakLevels: smc.strongWeakLevels,
        premiumDiscountZone: smc.premiumDiscountZones[0],
      };
    }

    const latestCandle = candles[candles.length - 1];
    const trendScore =
      (adx[adx.length - 1] || 0) +
      (100 - (ci[ci.length - 1] || 50)) +
      (latestCandle.close >= latestCandle.open ? 10 : 0);

    const emaArrays = { short: emaShort, medium: emaMedium, long: emaLong };

    // Compute EMA slopes using analysisSettings.flatThreshold
    const computeSlope = (arr) => {
      if (!arr || arr.length < 2) return "flat";
      // find last two non-null values
      let i = arr.length - 1;
      while (i >= 0 && arr[i] == null) i--;
      if (i <= 0) return "flat";
      const last = arr[i];
      let j = i - 1;
      while (j >= 0 && arr[j] == null) j--;
      if (j < 0) return "flat";
      const prev = arr[j];
      const delta = last - prev;
      const thresh = Math.max(
        Math.abs(last) * appV4.state.analysisSettings.flatThreshold,
        appV4.state.analysisSettings.flatThreshold,
      );
      if (Math.abs(delta) <= thresh) return "flat";
      return delta > 0 ? "up" : "down";
    };

    const emaAnalysis = {
      shortValue: emaShort[emaShort.length - 1],
      mediumValue: emaMedium[emaMedium.length - 1],
      longValue: emaLong[emaLong.length - 1],
      shortMediumCrossover: "none", // will be determined elsewhere
      mediumLongCrossover: "none",
      shortSlope: computeSlope(emaShort),
      mediumSlope: computeSlope(emaMedium),
      longSlope: computeSlope(emaLong),
    };

    // Crossover detection helper: compares latest two non-null points
    const detectCrossover = (arrA, arrB) => {
      if (!arrA || !arrB) return "none";
      // find last index with non-null for both
      let i = Math.min(arrA.length, arrB.length) - 1;
      while (i >= 0 && (arrA[i] == null || arrB[i] == null)) i--;
      if (i <= 0) return "none";
      const lastA = arrA[i],
        lastB = arrB[i];
      let j = i - 1;
      while (j >= 0 && (arrA[j] == null || arrB[j] == null)) j--;
      if (j < 0) return "none";
      const prevA = arrA[j],
        prevB = arrB[j];

      if (prevA <= prevB && lastA > lastB) return "golden";
      if (prevA >= prevB && lastA < lastB) return "death";
      return "none";
    };

    // Determine short x medium and medium x long crossovers
    emaAnalysis.shortMediumCrossover = detectCrossover(emaShort, emaMedium);
    emaAnalysis.mediumLongCrossover = detectCrossover(emaMedium, emaLong);

    const recentCandles = candles
      .slice(-10)
      .map((c) => (c.close >= c.open ? "bull" : "bear"))
      .reverse();

    appV4.state.dataStore[symbol] = {
      symbol,
      name: appV4.state.assets.find((a) => a.symbol === symbol)?.name || symbol,
      price: latestCandle.close,
      ci: ci[ci.length - 1],
      adx: adx[adx.length - 1],
      score: trendScore,
      isGreen: latestCandle.close >= latestCandle.open,
      recentCandles,
      emaArrays,
      atrArray: atr,
      ciArray: ci,
      adxArray: adx,
      rsiArray: rsi,
      bbValues,
      emaAnalysis,
      smcData,
    };

    appV4.generateAnalysisData(
      symbol,
      candles,
      emaArrays,
      ci,
      adx,
      atr,
      bbValues,
    );
    if (updateGrid) appV4.checkAllDataReceived();
  },

  processChartData: (symbol, candles) => {
    appV4.processCandles(symbol, candles, false); // Don't update grid on fast chart poll
    if (appV4.state.selectedSymbol === symbol && appV4.state.chart) {
      appV4.updateSelectedChart();
      appV4.renderSelectedAnalysis(appV4.state.dataStore[symbol]);

      // Feed data to Micro Indy
      if (appV4.state.microIndy && appV4.state.microArrowsEnabled) {
        // Map epoch to time for clsMicroTickIndy
        const mappedCandles = candles.map((c) => ({
          time: c.epoch,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }));
        appV4.state.microIndy.setCandles(mappedCandles);
      }
    }
  },

  checkAllDataReceived: () => {
    if (
      Object.keys(appV4.state.dataStore).length >= appV4.state.assets.length
    ) {
      const sortedData = Object.values(appV4.state.dataStore)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);
      appV4.renderGrid(sortedData);
      if (appV4.state.selectedSymbol) appV4.updateSelectedChart();
    }
  },

  renderGrid: (dataList) => {
    const grid = document.getElementById("asset-grid");
    grid.innerHTML = "";
    dataList.forEach((data, index) => {
      const card = document.createElement("div");
      const isSelected = appV4.state.selectedSymbol === data.symbol;
      card.className = `top8-card clickable${index < 3 ? ` rank-${index + 1}` : ""}${isSelected ? " selected-asset" : ""}`;
      card.dataset.symbol = data.symbol;

      // Rank badge
      let badgeClass = "";
      if (index === 0) badgeClass = "gold";
      else if (index === 1) badgeClass = "silver";
      else if (index === 2) badgeClass = "bronze";

      // Candle Colors HTML
      const candlesHtml = data.recentCandles
        ? data.recentCandles
          .map((dir) => `<div class="candle-dot-sm ${dir}"></div>`)
          .join("")
        : "";

      const cardHtml = `
                <span class="rank-badge-sm ${badgeClass}">#${index + 1}</span>
                <div class="card-header-sm">
                    <h3>${data.name}</h3>
                    <span class="symbol">${data.symbol}</span>
                    <span class="price">${data.price.toFixed(4)}</span>
                </div>
                <span class="direction-badge ${data.isGreen ? "bull" : "bear"}">
                    ${data.isGreen ? "▲ BULL" : "▼ BEAR"}
                </span>
                <div class="meter-wrapper" style="height: 60px; margin-top: 5px; position: relative; width: 100%;">
                    <canvas id="meter-${data.symbol}"></canvas>
                </div>
                <div class="stats-row-sm">
                    <div class="stat-sm">
                        <span class="label">CI</span>
                        <span class="value">${data.ci ? data.ci.toFixed(1) : "-"}</span>
                    </div>
                    <div class="stat-sm">
                        <span class="label">ADX</span>
                        <span class="value">${data.adx ? data.adx.toFixed(1) : "-"}</span>
                    </div>
                    <div class="stat-sm">
                        <span class="label">Score</span>
                        <span class="value" style="color: var(--primary)">${data.score.toFixed(0)}</span>
                    </div>
                </div>
                <div class="candle-strip-sm">
                    ${candlesHtml}
                </div>
            `;

      card.innerHTML = cardHtml;
      card.onclick = () => appV4.selectAsset(data.symbol);
      grid.appendChild(card);

      setTimeout(() => {
        const meter = new ChoppyMeter(`meter-${data.symbol}`, {
          zones: [
            { from: 0, to: 38.2, color: "#4ade80" },
            { from: 38.2, to: 61.8, color: "#eab308" },
            { from: 61.8, to: 100, color: "#ef4444" },
          ],
        });
        if (data.ci !== null) meter.setValue(data.ci);
        appV4.state.meters[data.symbol] = meter;
      }, 50);
    });
  },

  selectAsset: (symbol) => {
    appV4.state.selectedSymbol = symbol;
    document
      .querySelectorAll(".top8-card")
      .forEach((card) =>
        card.classList.toggle("selected-asset", card.dataset.symbol === symbol),
      );
    document.getElementById("selected-chart-panel").classList.remove("hidden");
    if (appV4.state.dataStore[symbol]) {
      document.getElementById("selected-asset-name").textContent =
        appV4.state.dataStore[symbol].name;
      document.getElementById("selected-asset-symbol").textContent = symbol;
    }
    appV4.initChart();
    appV4.updateSelectedChart();
    appV4.startChartPolling();
    appV4.updateAnalysisDataViewer(symbol);

    // Update trading symbol for DerivTrader
    if (typeof DerivTrader !== "undefined" && DerivTrader.setTradingSymbol) {
      DerivTrader.setTradingSymbol(symbol);
    }

    // Re-subscribe micro ticks for the new symbol if enabled
    if (appV4.state.microArrowsEnabled) {
      DerivAPI.unsubscribeMicroTicks();
      // Clear tick arrows data for new symbol
      appV4.state.microTickArrows = [];
      appV4.state.lastTickPrice = null;
      appV4.state.lastTickTime = null;
      if (appV4.state.microIndy) appV4.state.microIndy.clear();
      const container = document.getElementById("micro-arrows-container");
      if (container)
        container.innerHTML =
          '<div style="color: #666; text-align: center; width: 100%; padding: 20px;">Connecting to tick data...</div>';
      DerivAPI.subscribeMicroTicks(symbol, null, 180);
    }

    document
      .getElementById("selected-chart-panel")
      .scrollIntoView({ behavior: "smooth", block: "start" });
  },

  startChartPolling: () => {
    if (appV4.state.chartPollInterval)
      clearInterval(appV4.state.chartPollInterval);
    appV4.fetchSelectedAssetData();
    appV4.state.chartPollInterval = setInterval(
      appV4.fetchSelectedAssetData,
      2000,
    );
  },
  stopChartPolling: () => {
    if (appV4.state.chartPollInterval)
      clearInterval(appV4.state.chartPollInterval);
  },

  fetchSelectedAssetData: () => {
    if (!appV4.state.selectedSymbol || !DerivAPI.ws) return;
    const reqId = Date.now() + 999;
    appV4.state.chartReqId = reqId;
    appV4.state.reqIdMap.set(reqId, appV4.state.selectedSymbol);
    DerivAPI.ws.send(
      JSON.stringify({
        ticks_history: appV4.state.selectedSymbol,
        adjust_start_time: 1,
        count: 150,
        end: "latest",
        style: "candles",
        granularity: appV4.state.timeframe,
        req_id: reqId,
      }),
    );
  },

  closeChartPanel: () => {
    appV4.stopChartPolling();
    appV4.state.selectedSymbol = null;
    document.getElementById("selected-chart-panel").classList.add("hidden");
    document
      .querySelectorAll(".top8-card")
      .forEach((card) => card.classList.remove("selected-asset"));
    if (appV4.state.chart) {
      appV4.state.chart.remove();
      appV4.state.chart = null;
    }
  },

  initChart: () => {
    const container = document.getElementById("main-chart-container");
    if (!container) {
      console.warn("initChart: #main-chart-container not found!");
      return;
    }
    if (appV4.state.chart) appV4.state.chart.remove();
    appV4.state.chart = LightweightCharts.createChart(container, {
      width: container.clientWidth || 800, // Fallback width
      height: 400,
      layout: {
        background: { type: "solid", color: "#000000" },
        textColor: "#f8fafc",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.1)" },
        horzLines: { color: "rgba(255,255,255,0.1)" },
      },
      timeScale: { timeVisible: true, secondsVisible: false },
    });
    appV4.state.candleSeries = appV4.state.chart.addCandlestickSeries({
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    // Reset entry spot lines map
    appV4.state.entrySpotLines = new Map();

    // Restore lines for active contracts of the selected symbol if they were visible
    if (typeof DerivTrader !== 'undefined' && DerivTrader.state && DerivTrader.state.activeContracts) {
      DerivTrader.state.activeContracts.forEach(c => {
        if (c.symbol === appV4.state.selectedSymbol && c.isEntrySpotVisible) {
          // Defer slightly to ensure series is ready
          setTimeout(() => appV4.addEntrySpotLine(c), 10);
        }
      });
    }
    appV4.state.emaShortSeries = appV4.state.chart.addLineSeries({
      color: appV4.getEmaColor("short"),
      lineWidth: 2,
      title: "EMA Short",
    });
    appV4.state.emaMediumSeries = appV4.state.chart.addLineSeries({
      color: appV4.getEmaColor("medium"),
      lineWidth: 2,
      title: "EMA Medium",
    });
    appV4.state.emaLongSeries = appV4.state.chart.addLineSeries({
      color: appV4.getEmaColor("long"),
      lineWidth: 2,
      title: "EMA Long",
    });
    appV4.state.emaLongSeries = appV4.state.chart.addLineSeries({
      color: appV4.getEmaColor("long"),
      lineWidth: 2,
      title: "EMA Long",
    });

    // Initialize SMC Renderer
    if (typeof SMCChartRenderer !== "undefined") {
      appV4.state.smcRenderer = new SMCChartRenderer(
        appV4.state.chart,
        appV4.state.candleSeries,
      );
    }

    window.addEventListener("resize", () => {
      if (appV4.state.chart)
        appV4.state.chart.resize(container.clientWidth, 400);
    });
  },

  updateSelectedChart: () => {
    const symbol = appV4.state.selectedSymbol;
    if (!symbol || !appV4.state.chart) return;
    const candles = appV4.state.candleStore[symbol];
    const assetData = appV4.state.dataStore[symbol];
    if (!candles || !assetData) return;

    appV4.state.candleSeries.setData(
      candles.map((c, i) => {
        const size = Math.abs(c.high - c.low);
        const atr = assetData.atrArray ? assetData.atrArray[i] : null;
        const isAbnormal =
          appV4.state.params.atr.show &&
          atr &&
          size > atr * appV4.state.params.atr.multiplier;
        const color = isAbnormal
          ? c.close >= c.open
            ? "#00ff00"
            : "#ff0000"
          : c.close >= c.open
            ? "#22c55e"
            : "#ef4444";
        return {
          time: c.epoch,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          color,
          wickColor: color,
          borderColor: color,
        };
      }),
    );

    ["short", "medium", "long"].forEach((t) => {
      appV4.state[`ema${t.charAt(0).toUpperCase() + t.slice(1)}Series`].setData(
        candles
          .map((c, i) => ({ time: c.epoch, value: assetData.emaArrays[t][i] }))
          .filter((d) => d.value != null),
      );
      appV4.state[
        `ema${t.charAt(0).toUpperCase() + t.slice(1)}Series`
      ].applyOptions({
        visible:
          appV4.state.params[`ema${t.charAt(0).toUpperCase() + t.slice(1)}`]
            .show,
      });
    });

    // Markers
    if (appV4.state.altColorMarkers) markers = [...appV4.state.altColorMarkers];
    if (appV4.state.statusCodeMarkers)
      markers = [...markers, ...appV4.state.statusCodeMarkers];

    // SMC Rendering via Renderer
    if (appV4.state.smcRenderer && assetData.smcData) {
      // Use the renderer to draw everything (including markers if the renderer handles them)
      // Note: The renderer sets markers on the series, so we need to merge with existing markers carefully
      // Actually, the renderer overwrites markers.
      // Better approach: Let renderer handle SMC markers, and we merge specific others if needed,
      // OR pass options to renderer.

      // For now, let's render SMC visual elements (Boxes, Lines)
      appV4.state.smcRenderer.renderAll(assetData.smcData, {
        showSwingPoints: appV4.state.smcSettings.showSMC,
        showStructures: appV4.state.smcSettings.showSMC,
        showOrderBlocks: appV4.state.smcSettings.showSMC,
        showFVG: appV4.state.smcSettings.showSMC,
        showEqualHL: appV4.state.smcSettings.showSMC,
        showPremiumDiscount: appV4.state.smcSettings.showSMC,
        // bull/bear visibility filters
        showOrderBlocksBull: !!appV4.state.smcDisplay.obBull,
        showOrderBlocksBear: !!appV4.state.smcDisplay.obBear,
        showFvGBull: !!appV4.state.smcDisplay.fvgBull,
        showFvGBear: !!appV4.state.smcDisplay.fvgBear,
      });

      // Get markers generated by renderer to merge with ours?
      // The renderer currently sets markers directly. We might lose altColorMarkers.
      // If strictly following the user request, we use the renderer.

      // Construct markers from SMC data manually if we want to combine with others strictly
      // BUT providing boxes (OB/FVG) requires the renderer.
    } else if (
      appV4.state.smcSettings.showSMC &&
      assetData.smcData &&
      !appV4.state.smcRenderer
    ) {
      // Fallback if renderer is missing (just simple markers)
      const smc = assetData.smcData;
      if (smc.swingPoints)
        smc.swingPoints.forEach((p) =>
          markers.push({
            time: p.time,
            position: p.swing === "high" ? "aboveBar" : "belowBar",
            color: p.swing === "high" ? "#ef4444" : "#22c55e",
            shape: p.swing === "high" ? "arrowDown" : "arrowUp",
            text: p.type,
            size: 2,
          }),
        );
      if (smc.structures)
        smc.structures.forEach((s) =>
          markers.push({
            time: s.time,
            position: s.direction === "bullish" ? "belowBar" : "aboveBar",
            color: s.direction === "bullish" ? "#3b82f6" : "#f59e0b",
            shape: "circle",
            text: s.type,
            size: 1,
          }),
        );
    }

    markers.sort((a, b) => a.time - b.time);
    // appV4.state.candleSeries.setMarkers(markers); // Renderer handles markers now, so careful

    // If we want to keep markers from other features along with SMC renderer:
    if (appV4.state.smcRenderer && appV4.state.smcSettings.showSMC) {
      // Let renderer do its job. It might overwrite markers.
      // If we need both, we should add markers to renderer or append afterwards.
      // Current SMCChartRenderer.js implementation overwrites markers in renderAll -> ...Methods
      // So we append our custom markers to the renderer's marker list if possible or set them after.
      // Hack: Get markers from renderer instance if accessible?
      if (markers.length > 0) {
        const currentMarkers = appV4.state.smcRenderer.markers || [];
        const combined = [...currentMarkers, ...markers];
        combined.sort((a, b) => a.time - b.time);
        appV4.state.candleSeries.setMarkers(combined);
      }
    } else {
      appV4.state.candleSeries.setMarkers(markers);
    }

    appV4.updateAnalysisDataViewer(symbol);
    if (appV4.state.zonesEnabled) appV4.updateChartZones();
    appV4.renderSelectedAnalysis(assetData);
    appV4.autoShowStatusCodeMarkers();

    // LAG detection + audio alert handling (for selected chart)
    try {
      const lagLabel = document.getElementById("lag-status-value");
      const lagCheckbox = document.getElementById("chk-lag-sound");
      const audioEl = document.getElementById("lag-alert-audio");
      const analysis = assetData.emaAnalysis || {};
      const isLag =
        analysis.mediumSlope === "down" && analysis.longSlope === "up";

      if (lagLabel) {
        if (isLag) {
          lagLabel.innerHTML = 'LAG <span class="blink-animation">🧨</span>';
        } else {
          lagLabel.textContent = "OK";
        }
      }

      if (isLag && lagCheckbox && lagCheckbox.checked) {
        // cooldown per symbol to avoid repeated chimes (30s)
        const now = Date.now();
        const last = appV4.state.lastLagAlertTimeBySymbol || {};
        const lastForSymbol = last[symbol] || 0;
        if (now - lastForSymbol > 30000) {
          appV4.state.lastLagAlertTimeBySymbol = {
            ...(appV4.state.lastLagAlertTimeBySymbol || {}),
            [symbol]: now,
          };
          // play audio 3 times, spaced by 700ms
          const playCount = 3;
          const playInterval = 700;
          if (audioEl) {
            let played = 0;
            const playOnce = () => {
              try {
                audioEl.currentTime = 0;
              } catch (e) { }
              const playPromise = audioEl.play();
              if (playPromise && typeof playPromise.then === "function") {
                playPromise
                  .then(() => {
                    played += 1;
                    if (played < playCount) setTimeout(playOnce, playInterval);
                  })
                  .catch(() => {
                    // fallback to WebAudio beeps
                    appV4.playLagBeep(playCount);
                  });
              } else {
                // No promise support, attempt fallback after intervals
                played += 1;
                if (played < playCount) setTimeout(playOnce, playInterval);
              }
            };
            playOnce();
          } else {
            appV4.playLagBeep(playCount, playInterval);
          }
        }
      }
    } catch (e) {
      console.warn("Lag alert handling error", e);
    }

    // Update CI Panel in Header
    const ciValEl = document.getElementById("ci-current-value");
    const ciArrowEl = document.getElementById("ci-direction-arrows");
    if (ciValEl && assetData.ci != null) {
      ciValEl.textContent = assetData.ci.toFixed(1);
      ciValEl.style.color =
        assetData.ci < 40
          ? "#4ade80"
          : assetData.ci > 61.8
            ? "#f87171"
            : "#fcd34d";
    }
    if (ciArrowEl && assetData.recentCandles) {
      const arrowHtml = assetData.recentCandles
        .map(
          (dir) =>
            `<span style="color: ${dir === "bull" ? "#4ade80" : "#f87171"}">${dir === "bull" ? "▲" : "▼"}</span>`,
        )
        .join("");
      ciArrowEl.innerHTML = arrowHtml;
    }
  },

  toggleEma: (type) => {
    // type: 'short', 'medium', 'long'
    const paramKey = `ema${type.charAt(0).toUpperCase() + type.slice(1)}`;
    const currentState = appV4.state.params[paramKey].show;
    const newState = !currentState;
    appV4.state.params[paramKey].show = newState;

    // Update Quick Toggle
    const quickChk = document.getElementById(`quick-ema-${type}`);
    if (quickChk) quickChk.checked = newState;

    // Update Settings Modal Toggle
    const settingsChk = document.getElementById(`ema-${type}-show`);
    if (settingsChk) settingsChk.checked = newState;

    appV4.saveSettings();
    appV4.updateSelectedChart();
  },

  toggleSMC: () => {
    appV4.state.smcSettings.showSMC = !appV4.state.smcSettings.showSMC;
    const btn = document.getElementById("btn-smc-toggle");
    const status = document.getElementById("smc-status");
    if (btn && status) {
      btn.style.background = appV4.state.smcSettings.showSMC
        ? "rgba(16, 185, 129, 0.3)"
        : "rgba(16, 185, 129, 0.1)";
      status.textContent = appV4.state.smcSettings.showSMC ? "ON" : "OFF";
    }
    appV4.updateSelectedChart();
  },

  toggleMicroArrows: () => {
    const chk = document.getElementById("chk-show-micro-arrows");
    if (!chk) return;

    appV4.state.microArrowsEnabled = chk.checked;
    const container = document.getElementById("micro-arrows-container");
    const legend = document.getElementById("micro-arrows-legend");

    if (container) {
      if (appV4.state.microArrowsEnabled) {
        container.style.display = "flex";
        if (legend) legend.style.display = "block";
        container.innerHTML =
          '<div style="color: #666; text-align: center; width: 100%; padding: 20px;">Connecting to tick data...</div>';

        // Clear existing tick arrows data
        appV4.state.microTickArrows = [];
        appV4.state.lastTickPrice = null;
        appV4.state.lastTickTime = null;

        // Clear microIndy if exists
        if (appV4.state.microIndy) {
          appV4.state.microIndy.clear();
        }

        // Subscribe to micro ticks for the currently selected symbol
        const symbol = appV4.state.selectedSymbol || "R_100";
        DerivAPI.subscribeMicroTicks(symbol, null, 180);
      } else {
        container.style.display = "none";
        if (legend) legend.style.display = "none";
        // Unsubscribe from micro ticks
        DerivAPI.unsubscribeMicroTicks();
        // Clear data
        appV4.state.microTickArrows = [];
        appV4.state.lastTickPrice = null;
        appV4.state.lastTickTime = null;
      }
    }
  },

  // Format time as HH:MM
  formatMinuteKey: (ts) => {
    const d = new Date(ts * 1000);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  },

  // Append single arrow without re-rendering everything
  appendMicroArrow: (arrow) => {
    const container = document.getElementById("micro-arrows-container");
    if (!container) return;

    const minuteKey = appV4.formatMinuteKey(arrow.time);
    const isUp = arrow.direction === "up";
    const labelColor = isUp ? "#00aa66" : "#cc3333";
    const opacity = Math.max(0.3, Math.min(1, arrow.opacity || 0.7));
    const changeSign = arrow.change >= 0 ? "+" : "";
    const priceValue = (arrow.currentClose || 0).toFixed(5);

    // Create arrow element
    const arrowDiv = document.createElement("div");
    arrowDiv.className = "arrow-wrapper";
    arrowDiv.innerHTML = `
      <div class="${isUp ? "arrow-up" : "arrow-down"}" style="opacity: ${opacity}"></div>
      <div class="arrow-label" style="color: ${labelColor}">${changeSign}${arrow.change.toFixed(3)}%</div>
      <div class="arrow-change">${priceValue}</div>
      <div class="arrow-time">${minuteKey}</div>
    `;

    // Check if minute changed
    if (appV4.state.currentMinuteKey !== minuteKey) {
      // New minute - update old summary to remove "current" and add new summary
      const oldSummary = container.querySelector(".minute-summary.current");
      if (oldSummary) {
        oldSummary.classList.remove("current");
        const timeEl = oldSummary.querySelector(".minute-summary-time");
        if (timeEl)
          timeEl.textContent = timeEl.textContent.replace(" (Current)", "");
      }

      // Add arrow
      container.appendChild(arrowDiv);

      // Create new summary for new minute
      const summaryDiv = document.createElement("div");
      summaryDiv.className = "minute-summary current";
      summaryDiv.id = `summary-${minuteKey}`;
      appV4.updateSummaryContent(summaryDiv, minuteKey, true);
      container.appendChild(summaryDiv);

      appV4.state.currentMinuteKey = minuteKey;
    } else {
      // Same minute - insert arrow before current summary
      const currentSummary = container.querySelector(".minute-summary.current");
      if (currentSummary) {
        container.insertBefore(arrowDiv, currentSummary);
        // Update summary counts
        appV4.updateSummaryContent(currentSummary, minuteKey, true);
      } else {
        container.appendChild(arrowDiv);
      }
    }

    // Auto-scroll
    container.scrollLeft = container.scrollWidth;
  },

  // Update summary card content
  updateSummaryContent: (summaryEl, minuteKey, isCurrent) => {
    const arrows = appV4.state.microTickArrows;
    let upCount = 0,
      downCount = 0,
      upTotal = 0,
      downTotal = 0,
      basePrice = 0;

    arrows.forEach((a) => {
      if (appV4.formatMinuteKey(a.time) === minuteKey) {
        if (!basePrice) basePrice = a.previousClose || a.currentClose;
        if (a.direction === "up") {
          upCount++;
          upTotal += a.priceChangeAbs || 0;
        } else {
          downCount++;
          downTotal += a.priceChangeAbs || 0;
        }
      }
    });

    const netChange = upTotal + downTotal;
    const netPercent = basePrice ? (netChange / basePrice) * 100 : 0;
    const netColor = netChange >= 0 ? "#00aa66" : "#ff4444";

    summaryEl.innerHTML = `
      <div class="minute-summary-time">⏱️ ${minuteKey}${isCurrent ? " (Current)" : ""}</div>
      <div class="minute-summary-counts">
        <div class="count-badge up">▲ ${upCount}</div>
        <div class="count-badge down">▼ ${downCount}</div>
      </div>
      <div class="minute-summary-impact">
        <div class="impact-row">
          <span class="impact-label">Up Impact:</span>
          <span class="impact-value positive">+${upTotal.toFixed(5)}</span>
        </div>
        <div class="impact-row">
          <span class="impact-label">Down Impact:</span>
          <span class="impact-value negative">${downTotal.toFixed(5)}</span>
        </div>
        <div class="net-impact" style="color: ${netColor}">
          Net: ${netChange >= 0 ? "+" : ""}${netChange.toFixed(5)}<br>
          (${netPercent >= 0 ? "+" : ""}${netPercent.toFixed(3)}%)
        </div>
      </div>
    `;
  },

  // Full render
  renderMicroArrows: (arrows) => {
    const container = document.getElementById("micro-arrows-container");
    if (!container) return;

    if (!arrows || arrows.length === 0) {
      container.innerHTML =
        '<div style="color: #666; text-align: center; width: 100%; padding: 20px;">Waiting for tick data...</div>';
      return;
    }

    // Reset tracking
    appV4.state.renderedArrowCount = arrows.length;
    appV4.state.currentMinuteKey = null;

    // Group arrows by minute
    const minuteGroups = {};
    arrows.forEach((arrow) => {
      const minuteKey = appV4.formatMinuteKey(arrow.time);

      if (!minuteGroups[minuteKey]) {
        minuteGroups[minuteKey] = {
          time: arrow.time,
          arrows: [],
          upCount: 0,
          downCount: 0,
          upTotalChange: 0,
          downTotalChange: 0,
          closePrice: arrow.currentClose || 0,
        };
      }

      minuteGroups[minuteKey].arrows.push(arrow);
      minuteGroups[minuteKey].closePrice =
        arrow.currentClose || minuteGroups[minuteKey].closePrice;

      if (arrow.direction === "up") {
        minuteGroups[minuteKey].upCount++;
        minuteGroups[minuteKey].upTotalChange += arrow.priceChangeAbs || 0;
      } else {
        minuteGroups[minuteKey].downCount++;
        minuteGroups[minuteKey].downTotalChange += arrow.priceChangeAbs || 0;
      }
    });

    // Sort minute keys chronologically
    const sortedMinutes = Object.keys(minuteGroups).sort((a, b) => {
      return minuteGroups[a].time - minuteGroups[b].time;
    });

    // Build HTML string (faster than DOM manipulation)
    let html = "";
    const lastMinuteKey = sortedMinutes[sortedMinutes.length - 1];

    sortedMinutes.forEach((minuteKey) => {
      const group = minuteGroups[minuteKey];
      const isCurrentMinute = minuteKey === lastMinuteKey;

      // Add all arrows for this minute
      group.arrows.forEach((arrow) => {
        const isUp = arrow.direction === "up";
        const labelColor = isUp ? "#00aa66" : "#cc3333";
        const opacity = Math.max(0.3, Math.min(1, arrow.opacity || 0.7));
        const changeSign = arrow.change >= 0 ? "+" : "";
        const priceValue = (arrow.currentClose || 0).toFixed(5);

        html += `<div class="arrow-wrapper">
          <div class="${isUp ? "arrow-up" : "arrow-down"}" style="opacity: ${opacity}"></div>
          <div class="arrow-label" style="color: ${labelColor}">${changeSign}${arrow.change.toFixed(3)}%</div>
          <div class="arrow-change">${priceValue}</div>
          <div class="arrow-time">${minuteKey}</div>
        </div>`;
      });

      // Track current minute
      if (isCurrentMinute) {
        appV4.state.currentMinuteKey = minuteKey;
      }

      // Add summary card
      const netChange = group.upTotalChange + group.downTotalChange;
      const basePrice = group.arrows[0]?.previousClose || group.closePrice || 1;
      const netPercent = (netChange / basePrice) * 100;
      const netColor = netChange >= 0 ? "#00aa66" : "#ff4444";

      html += `<div class="minute-summary ${isCurrentMinute ? "current" : ""}">
        <div class="minute-summary-time">⏱️ ${minuteKey}${isCurrentMinute ? " (Current)" : ""}</div>
        <div class="minute-summary-counts">
          <div class="count-badge up">▲ ${group.upCount}</div>
          <div class="count-badge down">▼ ${group.downCount}</div>
        </div>
        <div class="minute-summary-impact">
          <div class="impact-row">
            <span class="impact-label">Up Impact:</span>
            <span class="impact-value positive">+${group.upTotalChange.toFixed(5)}</span>
          </div>
          <div class="impact-row">
            <span class="impact-label">Down Impact:</span>
            <span class="impact-value negative">${group.downTotalChange.toFixed(5)}</span>
          </div>
          <div class="net-impact" style="color: ${netColor}">
            Net: ${netChange >= 0 ? "+" : ""}${netChange.toFixed(5)}<br>
            (${netPercent >= 0 ? "+" : ""}${netPercent.toFixed(3)}%)
          </div>
        </div>
      </div>`;
    });

    container.innerHTML = html;

    // Auto-scroll to show latest arrows
    container.scrollLeft = container.scrollWidth;
  },

  toggleChoppyZones: () => {
    appV4.state.zonesEnabled = !appV4.state.zonesEnabled;
    const btn = document.getElementById("btn-zones-toggle");
    const status = document.getElementById("zones-status");
    if (btn && status) {
      btn.style.background = appV4.state.zonesEnabled
        ? "rgba(139, 92, 246, 0.3)"
        : "rgba(139, 92, 246, 0.1)";
      status.textContent = appV4.state.zonesEnabled ? "ON" : "OFF";
    }

    // Sync with config manager
    if (typeof ZoneConfigManager !== "undefined") {
      zoneConfigManager.set("enabled", appV4.state.zonesEnabled);
    }

    if (appV4.state.zonesEnabled) appV4.updateChartZones();
    else if (appV4.state.chart) {
      // Clear zones
      if (appV4.state.bgZonesPlugin) appV4.state.bgZonesPlugin.clearZones();
    }
  },

  openZonesSettingsModal: () => {
    const modal = document.getElementById("zones-settings-modal");
    if (!modal) return;

    // Load settings from config manager
    const config = zoneConfigManager.getAll();

    // Populate inputs
    if (document.getElementById("show-ci-zones"))
      document.getElementById("show-ci-zones").checked = config.showCiZones;
    if (document.getElementById("show-rsi-zones"))
      document.getElementById("show-rsi-zones").checked = config.showRsiZones;
    if (document.getElementById("ci-trending-threshold"))
      document.getElementById("ci-trending-threshold").value =
        config.ciTrendingThreshold;
    if (document.getElementById("ci-choppy-threshold"))
      document.getElementById("ci-choppy-threshold").value =
        config.ciChoppyThreshold;
    if (document.getElementById("rsi-oversold-threshold"))
      document.getElementById("rsi-oversold-threshold").value =
        config.rsiOversoldThreshold;
    if (document.getElementById("rsi-overbought-threshold"))
      document.getElementById("rsi-overbought-threshold").value =
        config.rsiOverboughtThreshold;

    modal.classList.remove("hidden");
  },

  closeZonesSettingsModal: () => {
    const modal = document.getElementById("zones-settings-modal");
    if (modal) modal.classList.add("hidden");
  },

  saveZonesSettings: () => {
    // Read inputs
    const newConfig = {
      showCiZones: document.getElementById("show-ci-zones").checked,
      showRsiZones: document.getElementById("show-rsi-zones").checked,
      ciTrendingThreshold: parseFloat(
        document.getElementById("ci-trending-threshold").value,
      ),
      ciChoppyThreshold: parseFloat(
        document.getElementById("ci-choppy-threshold").value,
      ),
      rsiOversoldThreshold: parseFloat(
        document.getElementById("rsi-oversold-threshold").value,
      ),
      rsiOverboughtThreshold: parseFloat(
        document.getElementById("rsi-overbought-threshold").value,
      ),
    };

    // Save to manager
    zoneConfigManager.setAll(newConfig);

    // Close modal and update chart
    appV4.closeZonesSettingsModal();
    appV4.updateChartZones();
  },

  updateChartZones: () => {
    if (
      !appV4.state.chart ||
      !appV4.state.selectedSymbol ||
      !appV4.state.candleSeries
    )
      return;

    const data = appV4.state.dataStore[appV4.state.selectedSymbol];
    if (!data) return;

    // If plugin instance doesn't exist, create it
    if (!appV4.state.bgZonesPlugin) {
      // Create with empty zones
      appV4.state.bgZonesPlugin = new BackgroundColorZonesPlugin(
        [],
        zoneConfigManager.getAll(),
      );
      appV4.state.candleSeries.attachPrimitive(appV4.state.bgZonesPlugin);
    }

    if (appV4.state.zonesEnabled) {
      // Calculate zones
      // Need candle data with epoch time
      const candles = appV4.state.candleStore[appV4.state.selectedSymbol];
      if (!candles || !data.ciArray || !data.rsiArray) return;

      const zones = createCiRsiZones(
        candles,
        data.ciArray,
        data.rsiArray,
        zoneConfigManager.getAll(),
      );

      appV4.state.bgZonesPlugin.setOptions(zoneConfigManager.getAll());
      appV4.state.bgZonesPlugin.setZones(zones);
    } else {
      // Clear zones
      appV4.state.bgZonesPlugin.clearZones();
    }
  },

  // Play fallback beep sequence using WebAudio if MP3 not available or blocked
  playLagBeep: (count = 3, interval = 700) => {
    try {
      if (!appV4.state.audioContext) {
        appV4.state.audioContext = new (
          window.AudioContext || window.webkitAudioContext
        )();
      }
      const ctx = appV4.state.audioContext;
      let played = 0;
      const playTone = () => {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = 880; // A5-ish ding
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.25, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.26);
        played += 1;
        if (played < count) setTimeout(playTone, interval);
      };
      playTone();
    } catch (e) {
      console.warn("playLagBeep failed", e);
    }
  },

  toggleAlternateColorZones: () => {
    appV4.state.altColorsEnabled = !appV4.state.altColorsEnabled;
    const btn = document.getElementById("btn-alt-colors");
    const status = document.getElementById("alt-colors-status");

    if (btn && status) {
      btn.style.background = appV4.state.altColorsEnabled
        ? "rgba(236, 72, 153, 0.3)"
        : "rgba(236, 72, 153, 0.1)";
      status.textContent = appV4.state.altColorsEnabled ? "ON" : "OFF";
    }

    if (appV4.state.altColorsEnabled) {
      appV4.generateAltColorMarkers();
    } else {
      appV4.state.altColorMarkers = [];
      appV4.updateSelectedChart();
    }
  },

  generateAltColorMarkers: () => {
    const symbol = appV4.state.selectedSymbol;
    if (!symbol || !appV4.state.analysisDataStore[symbol]) return;

    const analysisData = appV4.state.analysisDataStore[symbol];
    const markers = [];

    analysisData.forEach((item) => {
      if (item.color && item.color !== "Gray") {
        markers.push({
          time: item.candletime,
          position: item.color === "Green" ? "belowBar" : "aboveBar",
          color: item.color === "Green" ? "#22c55e" : "#ef4444",
          shape: item.color === "Green" ? "arrowUp" : "arrowDown",
          text: "Alt",
          size: 1,
        });
      }
    });

    appV4.state.altColorMarkers = markers;
    appV4.updateSelectedChart();
  },

  showStatusCodeMarkers: () => {
    const symbol = appV4.state.selectedSymbol;
    if (!symbol) {
      alert("No symbol selected");
      return;
    }

    const inputField = document.getElementById("txtStatusCode");
    if (!inputField || !inputField.value.trim()) {
      alert("Please enter StatusCode values (e.g., 25, 30)");
      return;
    }

    // Robust parsing: split, trim, and ensure strings
    const statusCodes = inputField.value
      .split(",")
      .map((s) => String(s).trim())
      .filter((s) => s !== "");

    const analysisData = appV4.state.analysisDataStore[symbol];
    if (!analysisData || analysisData.length === 0) {
      alert(
        `No analysis data available for ${symbol}. Please wait for data to load.`,
      );
      return;
    }

    // Check if data even has StatusCode populated
    const hasStatusCodes = analysisData.some(
      (d) => d.StatusCode && d.StatusCode !== "",
    );
    if (!hasStatusCodes) {
      console.warn(
        `MainV4: Data for ${symbol} has NO StatusCodes populated. Check CodeCandle mapping.`,
      );
    }

    const markers = [];
    analysisData.forEach((item) => {
      // Robust access: handle number/string differences and whitespace
      const itemStatusCode = String(
        item.StatusCode !== undefined && item.StatusCode !== null
          ? item.StatusCode
          : "",
      ).trim();

      if (itemStatusCode !== "" && statusCodes.includes(itemStatusCode)) {
        markers.push({
          time: item.candletime,
          position: item.color === "Green" ? "belowBar" : "aboveBar",
          color: "#10b981",
          shape: "circle",
          text: itemStatusCode,
          size: 2,
        });
      }
    });

    const logMsg = `MainV4: Found ${markers.length} markers for inputs [${statusCodes.join(", ")}] in ${analysisData.length} records.`;
    console.log(logMsg);

    if (markers.length === 0) {
      alert(
        `No matches found for StatusCodes: ${statusCodes.join(", ")}.\nSearched ${analysisData.length} records.\n\nPlease check if your input codes exist in the Analysis Data column.`,
      );
    } else {
      alert(`${logMsg}\n\nMarkers should appear on the chart.`);
      // Force refresh to ensure they appear
      appV4.state.statusCodeMarkers = markers;
      appV4.updateSelectedChart();
    }
  },

  autoShowStatusCodeMarkers: () => {
    // This can be used to re-apply filtering if needed, but current logic handles it in updateSelectedChart via state
  },

  renderSelectedAnalysis: (data) => {
    const container = document.getElementById("selected-analysis-content");
    if (!container || !data) return;
    const analysis = data.emaAnalysis || {};

    const getSlopeIcon = (slope) => {
      if (slope === "up") return "▲";
      if (slope === "down") return "▼";
      return "—";
    };

    const getCrossoverStatus = (crossover) => {
      if (crossover === "golden")
        return '<span class="crossover-status golden">🔺 Golden Cross</span>';
      if (crossover === "death")
        return '<span class="crossover-status death">🔻 Death Cross</span>';
      return '<span class="crossover-status none">No Signal</span>';
    };

    // Lag detection: medium turned down but long still up
    const lagHtml =
      analysis.mediumSlope === "down" && analysis.longSlope === "up"
        ? `<div class="slope-lag warning">⚠️ EMA Medium ลง แต่ EMA Long ยังคงขึ้น (Lag)</div>`
        : "";

    let smcHtml = "";
    if (appV4.state.smcSettings.showSMC && data.smcData) {
      const smc = data.smcData;
      smcHtml += `<div class="analysis-section"><div class="analysis-section-title">SMC Analysis</div>`;
      if (smc.swingPoints && smc.swingPoints.length > 0) {
        const lastSwing = smc.swingPoints[smc.swingPoints.length - 1];
        smcHtml += `<div class="tooltip-row"><span class="tooltip-label">Last Swing:</span><span class="tooltip-value ${lastSwing.swing === "high" ? "down" : "up"}">${lastSwing.type} @ ${lastSwing.price}</span></div>`;
      }
      if (smc.structures && smc.structures.length > 0) {
        const lastStruct = smc.structures[smc.structures.length - 1];
        smcHtml += `<div class="tooltip-row"><span class="tooltip-label">Structure:</span><span class="tooltip-value ${lastStruct.direction === "bullish" ? "up" : "down"}">${lastStruct.type} (${lastStruct.direction})</span></div>`;
      }
      smcHtml += `</div>`;
    }

    container.innerHTML = `
            ${smcHtml}
            <div class="analysis-section">
                <div class="analysis-section-title">EMA Values</div>
                <div class="ema-values-section">
                    <div class="ema-value-item short">
                        <div class="ema-type">Short (${appV4.state.params.emaShort.period})</div>
                        <div class="ema-val" style="color: ${appV4.getEmaColor('short')}">${analysis.shortValue ? analysis.shortValue.toFixed(4) : "-"}</div>
                    </div>
                    <div class="ema-value-item medium">
                        <div class="ema-type">Medium (${appV4.state.params.emaMedium.period})</div>
                        <div class="ema-val" style="color: ${appV4.getEmaColor('medium')}">${analysis.mediumValue ? analysis.mediumValue.toFixed(4) : "-"}</div>
                    </div>
                    <div class="ema-value-item long">
                        <div class="ema-type">Long (${appV4.state.params.emaLong.period})</div>
                        <div class="ema-val" style="color: ${appV4.getEmaColor('long')}">${analysis.longValue ? analysis.longValue.toFixed(4) : "-"}</div>
                    </div>
                </div>
            </div>

            <div class="analysis-section">
                <div class="analysis-section-title">Slope Directions</div>
                <div class="slope-indicator">
                    <span class="slope-name">EMA Short</span>
                    <span class="slope-badge ${analysis.shortSlope}">${getSlopeIcon(analysis.shortSlope)} ${analysis.shortSlope ? analysis.shortSlope.toUpperCase() : "-"}</span>
                </div>
                <div class="slope-indicator">
                    <span class="slope-name">EMA Medium</span>
                    <span class="slope-badge ${analysis.mediumSlope}">${getSlopeIcon(analysis.mediumSlope)} ${analysis.mediumSlope ? analysis.mediumSlope.toUpperCase() : "-"}</span>
                </div>
                <div class="slope-indicator">
                    <span class="slope-name">EMA Long</span>
                    <span class="slope-badge ${analysis.longSlope}">${getSlopeIcon(analysis.longSlope)} ${analysis.longSlope ? analysis.longSlope.toUpperCase() : "-"}</span>
                </div>
                ${lagHtml}
            </div>

            <div class="analysis-section">
                <div class="analysis-section-title">Crossover Signals</div>
                <div class="crossover-indicator">
                    <span class="crossover-name">Short ✕ Medium</span>
                    ${getCrossoverStatus(analysis.shortMediumCrossover)}
                </div>
                <div class="crossover-indicator">
                    <span class="crossover-name">Medium ✕ Long</span>
                    ${getCrossoverStatus(analysis.mediumLongCrossover)}
                </div>
            </div>
        `;
  },

  updateAnalysisDataViewer: (symbol) => {
    const textarea = document.getElementById("analysis-data-textarea");
    const recordCountEl = document.getElementById("analysis-record-count");
    const symbolEl = document.getElementById("analysis-current-symbol");
    if (!textarea) return;

    const data = appV4.state.analysisDataStore[symbol];
    if (!data) {
      textarea.value = "No data";
      return;
    }

    if (recordCountEl) recordCountEl.textContent = data.length;
    if (symbolEl) symbolEl.textContent = symbol;
    try {
      textarea.value = JSON.stringify(data, null, 2);
    } catch (e) {
      textarea.value = "Error";
    }
  },

  setAnalysisVersion: (version) => {
    appV4.state.analysisVersion = version;
    localStorage.setItem("choppy_analysis_version", version);
    console.log(`Analysis Version set to: ${version}`);
    appV4.refreshData(); // Reload data with new version logic if applicable
  },

  toggleAnalysisViewer: () => {
    const content = document.getElementById("analysis-viewer-content");
    if (content)
      content.style.display =
        content.style.display === "none" ? "block" : "none";
    const btn = document.getElementById("btn-toggle-analysis");
    if (btn) {
      btn.innerHTML =
        content.style.display === "none"
          ? '<i data-lucide="chevron-down"></i>'
          : '<i data-lucide="chevron-right"></i>';
      lucide.createIcons();
    }
  },

  openAnalysisSettingsModal: () =>
    document
      .getElementById("analysis-settings-modal")
      .classList.remove("hidden"),
  closeAnalysisSettingsModal: () =>
    document.getElementById("analysis-settings-modal").classList.add("hidden"),

  autoShowStatusCodeMarkers: () => {
    const chk = document.getElementById("chkAutoShowMarker");
    if (chk && chk.checked) appV4.showStatusCodeMarkers();
  },

  showStatusCodeMarkers: () => {
    const input = document.getElementById("txtStatusCode");
    if (!input || !input.value) return;
  },

  clearStatusCodeMarkers: () => {
    if (appV4.state.candleSeries) appV4.state.candleSeries.setMarkers([]);
  },

  // Duplicate removed

  // Duplicate removed

  getEmaColor: (type) => {
    // Prefer color input value (user may change without saving), then state, then defaults
    try {
      const input = document.getElementById(`ema-${type}-color`);
      if (input && input.value) return input.value;
    } catch (e) {
      /* ignore DOM timing */
    }

    const stateColor =
      appV4.state.params[`ema${type.charAt(0).toUpperCase() + type.slice(1)}`]
        ?.color;
    if (stateColor) return stateColor;

    const defaults = { short: "#3b82f6", medium: "#f59e0b", long: "#8b5cf6" };
    return defaults[type];
  },

  updateClock: () => {
    const now = new Date(Date.now() + appV4.state.serverTimeOffset);
    const el = document.getElementById("server-time");
    if (el)
      el.innerText =
        now.toLocaleTimeString("en-US", { hour12: false }) + " (TH)";

    const h = now.getHours();
    const m = now.getMinutes();
    const s = now.getSeconds();
    const hDeg = (h % 12) * 30 + m * 0.5;
    const mDeg = m * 6;
    const sDeg = s * 6;
    const hourHand = document.getElementById("clock-hour");
    const minuteHand = document.getElementById("clock-minute");
    const secondHand = document.getElementById("clock-second");
    if (hourHand)
      hourHand.style.transform = `translateX(-50%) rotate(${hDeg}deg)`;
    if (minuteHand)
      minuteHand.style.transform = `translateX(-50%) rotate(${mDeg}deg)`;
    if (secondHand)
      secondHand.style.transform = `translateX(-50%) rotate(${sDeg}deg)`;
  },

  updateStatus: (text, type) => {
    const el = document.getElementById("connection-status");
    if (el) {
      el.className = `status-pill ${type}`;
      el.innerHTML = `<span class="dot"></span> ${text}`;
    }
  },

  toggleConnection: () => {
    const btn = document.getElementById("btn-connect-toggle");
    if (appV4.state.isPolling) {
      appV4.state.isPolling = false;
      if (appV4.pollInterval) clearInterval(appV4.pollInterval);
      if (appV4.state.chartPollInterval)
        clearInterval(appV4.state.chartPollInterval);
      if (appV4._syncTimeInterval) clearInterval(appV4._syncTimeInterval);
      if (DerivAPI.ws) DerivAPI.ws.close();

      appV4.updateStatus("Stopped", "disconnected");
      if (btn) {
        btn.innerHTML = '<i data-lucide="play"></i> Start';
        btn.classList.add("stopped");
      }
    } else {
      appV4.state.isPolling = true;
      appV4.init();
      if (btn) {
        btn.innerHTML = '<i data-lucide="power"></i> Stop';
        btn.classList.remove("stopped");
      }
      setTimeout(() => lucide.createIcons(), 100);
    }
  },

  saveZonesSettings: () => {
    if (typeof ZoneConfigManager !== "undefined") {
      // Logic moved to main modal save function or handled by zoneConfigManager directly
      // But valid to call zoneConfigManager.save() if needed explicitly
      // zoneConfigManager.save();
    }
  },

  loadZonesSettings: () => {
    // This is likely handled by ZoneConfigManager constructor, but we can sync UI here
    if (typeof zoneConfigManager !== "undefined") {
      const config = zoneConfigManager.getAll();
      // Sync internal state if needed
      if (config.enabled !== undefined)
        appV4.state.zonesEnabled = config.enabled;
    }
  },

  // Load EMA Colors from localStorage and sync inputs/state
  loadEmaColors: () => {
    try {
      const saved = localStorage.getItem("choppyMeterV2Settings");
      if (saved) {
        const settings = JSON.parse(saved);
        if (settings.emaColors) {
          const shortColorInput = document.getElementById("ema-short-color");
          const mediumColorInput = document.getElementById("ema-medium-color");
          const longColorInput = document.getElementById("ema-long-color");

          if (shortColorInput)
            shortColorInput.value = settings.emaColors.short || "#3b82f6";
          if (mediumColorInput)
            mediumColorInput.value = settings.emaColors.medium || "#f59e0b";
          if (longColorInput)
            longColorInput.value = settings.emaColors.long || "#8b5cf6";

          appV4.state.params.emaShort = {
            ...appV4.state.params.emaShort,
            color: settings.emaColors.short || "#3b82f6",
          };
          appV4.state.params.emaMedium = {
            ...appV4.state.params.emaMedium,
            color: settings.emaColors.medium || "#f59e0b",
          };
          appV4.state.params.emaLong = {
            ...appV4.state.params.emaLong,
            color: settings.emaColors.long || "#8b5cf6",
          };

          // If chart exists, apply colors to series
          if (appV4.state.chart) {
            if (appV4.state.emaShortSeries)
              appV4.state.emaShortSeries.applyOptions({
                color: appV4.state.params.emaShort.color,
              });
            if (appV4.state.emaMediumSeries)
              appV4.state.emaMediumSeries.applyOptions({
                color: appV4.state.params.emaMedium.color,
              });
            if (appV4.state.emaLongSeries)
              appV4.state.emaLongSeries.applyOptions({
                color: appV4.state.params.emaLong.color,
              });
          }
        }
      }
    } catch (e) {
      console.error("Error loading EMA colors:", e);
    }
  },

  calculateRsi: (symbol) => {
    return [];
  },

  generateAnalysisData: (
    symbol,
    candles,
    emaArrays,
    ci,
    adx,
    atr,
    bbValues,
  ) => {
    if (
      appV4.state.analysisSettings.analysisVersion === "V2" &&
      typeof AnalysisGenerator !== "undefined"
    ) {
      // Map candles to format expected by AnalysisGenerator (epoch -> time)
      const mappedCandles = candles.map((c) => ({
        time: c.epoch,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));

      const options = {
        ema1Period: appV4.state.params.emaShort.period,
        ema1Type: appV4.state.params.emaShort.type,
        ema2Period: appV4.state.params.emaMedium.period,
        ema2Type: appV4.state.params.emaMedium.type,
        ema3Period: appV4.state.params.emaLong.period,
        ema3Type: appV4.state.params.emaLong.type,
        atrPeriod: appV4.state.params.atr.period,
        atrMultiplier: appV4.state.params.atr.multiplier,
        bbPeriod: appV4.state.analysisSettings.bbPeriod,
        ciPeriod: appV4.state.params.ciPeriod,
        adxPeriod: appV4.state.params.adxPeriod,
        flatThreshold: appV4.state.analysisSettings.flatThreshold,
        macdNarrow: appV4.state.analysisSettings.macdThreshold,
      };

      const generator = new AnalysisGenerator(mappedCandles, options);
      const rawData = generator.generate();

      // --- StatusCode Logic from V3 ---
      // Get CodeCandle Master data from textarea
      let codeCandleData = [];
      try {
        const codeCandleTextarea = document.getElementById("CodeCandle");
        if (
          codeCandleTextarea &&
          codeCandleTextarea.value &&
          codeCandleTextarea.value.length > 0
        ) {
          codeCandleData = JSON.parse(codeCandleTextarea.value);
        } else {
          console.log("MainV4: CodeCandle textarea is empty or not found");
        }
      } catch (e) {
        console.warn("⚠️ MainV4: Failed to parse CodeCandle data:", e);
      }

      // Helper function to find StatusCode
      const findStatusCode = (seriesDesc) => {
        if (!seriesDesc || codeCandleData.length === 0) return "";
        const matchingRecord = codeCandleData.find(
          (record) =>
            (record.SeriesDesc || "").trim() === seriesDesc ||
            (record.seriesDesc || "").trim() === seriesDesc ||
            (record.StatusDesc || "").trim() === seriesDesc ||
            (record.statusDesc || "").trim() === seriesDesc,
        );

        if (matchingRecord) {
          return matchingRecord.StatusCode || matchingRecord.statusCode || "";
        }
        return "";
      };

      // Map data to include StatusCode and log usage
      let matchedCount = 0;
      const data = rawData.map((item) => {
        const sCode = findStatusCode(item.StatusDesc || item.seriesDesc);
        if (sCode) matchedCount++;
        return {
          ...item,
          StatusCode: sCode,
        };
      });

      if (codeCandleData.length > 0) {
        console.log(
          `MainV4: Matched ${matchedCount} StatusCodes out of ${data.length} candles. Sample desc: ${data[data.length - 1].StatusDesc}`,
        );
      }

      appV4.state.analysisDataStore[symbol] = data;
      return data;
    } else {
      // Fallback to V1 (Inline)
      const data = [];
      candles.forEach((c, i) => {
        data.push({
          index: i,
          candletime: c.epoch,
          candletimeDisplay: new Date(c.epoch * 1000).toLocaleString(),
          color: c.close >= c.open ? "Green" : "Red",
          pipSize: c.high - c.low,
          emaShortValue: emaArrays.short[i],
          emaMediumValue: emaArrays.medium[i],
          emaLongValue: emaArrays.long[i],
          choppyIndicator: ci[i],
          adxValue: adx[i],
          atr: atr[i],
          bbValues: {
            upper: bbValues.upper[i],
            middle: bbValues.middle[i],
            lower: bbValues.lower[i],
          },
        });
      });
      appV4.state.analysisDataStore[symbol] = data;
      return data;
    }
  },

  switchTab: (tabName) => {
    document
      .querySelectorAll(".tab-btn")
      .forEach((btn) => btn.classList.remove("active"));
    document
      .querySelectorAll(".tab-content")
      .forEach((content) => content.classList.remove("active"));
    const selectedBtn = document.querySelector(`[data-tab="${tabName}"]`);
    const selectedContent = document.getElementById(`tab-${tabName}`);
    if (selectedBtn) selectedBtn.classList.add("active");
    if (selectedContent) selectedContent.classList.add("active");
    setTimeout(() => lucide.createIcons(), 50);
  },

  openSettingsModal: () => {
    const modal = document.getElementById("settings-modal");
    if (modal) {
      modal.classList.remove("hidden");
      appV4.switchTab("controls");
      lucide.createIcons();
    }
  },

  closeSettingsModal: () => {
    const modal = document.getElementById("settings-modal");
    if (modal) modal.classList.add("hidden");
  },

  addEntrySpotLine: (contract) => {
    if (!appV4.state.candleSeries) return;
    if (!appV4.state.entrySpotLines) appV4.state.entrySpotLines = new Map();
    if (appV4.state.entrySpotLines.has(contract.id)) return;

    // Line Styles
    const color = contract.type === 'CALL' ? '#22c55e' : '#ef4444'; // Green or Red
    // LineStyle: 0 = Solid, 1 = Dotted, 2 = Dashed, 3 = LargeDashed
    const priceLine = {
      price: contract.entrySpot,
      color: color,
      lineWidth: 3,
      lineStyle: 0,
      axisLabelVisible: true,
      title: `${contract.type} @ ${contract.entrySpot}`,
    };

    try {
      const lineObj = appV4.state.candleSeries.createPriceLine(priceLine);
      appV4.state.entrySpotLines.set(contract.id, lineObj);
      console.log(`Added entry spot line for ${contract.id} at ${contract.entrySpot}`);
    } catch (e) {
      console.warn("Error creating price line", e);
    }
  },

  removeEntrySpotLine: (contractId) => {
    if (!appV4.state.candleSeries || !appV4.state.entrySpotLines) return;
    const lineObj = appV4.state.entrySpotLines.get(contractId);
    if (lineObj) {
      appV4.state.candleSeries.removePriceLine(lineObj);
      appV4.state.entrySpotLines.delete(contractId);
      console.log(`Removed entry spot line for ${contractId}`);
    }
  },

  clearAllEntrySpotLines: () => {
    if (!appV4.state.candleSeries || !appV4.state.entrySpotLines) return;

    appV4.state.entrySpotLines.forEach((lineObj, id) => {
      try {
        appV4.state.candleSeries.removePriceLine(lineObj);
      } catch (e) {
        console.warn(`Failed to remove line for ${id}`, e);
      }
    });

    appV4.state.entrySpotLines.clear();
    console.log('Cleared all entry spot lines');
    alert('All price lines cleared.');
  },
};

document.addEventListener("DOMContentLoaded", () => {
  appV4.init();

  const settingInputs = [
    "ema-short-type",
    "ema-short-period",
    "ema-short-show",
    "ema-medium-type",
    "ema-medium-period",
    "ema-medium-show",
    "ema-long-type",
    "ema-long-period",
    "ema-long-show",
    "atr-period",
    "atr-multiplier",
    "atr-show",
  ];
  settingInputs.forEach((id) => {
    const el = document.getElementById(id);
    if (el)
      el.addEventListener("change", () => {
        appV4.loadEmaSettings();
        appV4.saveSettings();
        appV4.state.dataStore = {};
        appV4.refreshData();
      });
  });

  // Live color input handlers: apply selected color immediately and persist to localStorage
  ["short", "medium", "long"].forEach((t) => {
    const id = `ema-${t}-color`;
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", () => {
        const color = el.value;
        const key = `ema${t.charAt(0).toUpperCase() + t.slice(1)}`;
        // Update state
        appV4.state.params[key] = { ...appV4.state.params[key], color };

        // Apply to series if exists
        try {
          if (t === "short" && appV4.state.emaShortSeries)
            appV4.state.emaShortSeries.applyOptions({ color });
          if (t === "medium" && appV4.state.emaMediumSeries)
            appV4.state.emaMediumSeries.applyOptions({ color });
          if (t === "long" && appV4.state.emaLongSeries)
            appV4.state.emaLongSeries.applyOptions({ color });
        } catch (e) {
          console.warn("Failed to apply EMA color live", e);
        }

        // Persist only emaColors to localStorage to avoid full save UI
        try {
          const saved = JSON.parse(
            localStorage.getItem("choppyMeterV2Settings") || "{}",
          );
          saved.emaColors = saved.emaColors || {};
          saved.emaColors[t] = color;
          localStorage.setItem("choppyMeterV2Settings", JSON.stringify(saved));
        } catch (e) {
          console.warn("Failed to persist EMA color", e);
        }
      });
    }
  });

  document
    .querySelectorAll('#tooltip-fields-modal input[type="checkbox"]')
    .forEach((chk) => {
      chk.addEventListener("change", () => {
        if (chk.dataset.field) {
          appV4.state.tooltipFields[chk.dataset.field] = chk.checked;
          appV4.saveSettings();
        }
      });
    });

  setTimeout(() => {
    if (appV4.loadZonesSettings) appV4.loadZonesSettings();
  }, 500);
});
