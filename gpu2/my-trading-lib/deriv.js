const DerivAPI = {
  appId: 1089,
  ws: null,
  onOpen: null,
  onMessage: null,

  connect: () => {
    return new Promise((resolve, reject) => {
      DerivAPI.ws = new WebSocket(
        `wss://ws.binaryws.com/websockets/v3?app_id=${DerivAPI.appId}`,
      );

      DerivAPI.ws.onopen = (evt) => {
        console.log("Deriv WS Connected");
        if (DerivAPI.onOpen) DerivAPI.onOpen();
        resolve();
      };

      DerivAPI.ws.onerror = (err) => {
        console.error("Deriv WS Error", err);
        reject(err);
      };

      DerivAPI.ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        if (DerivAPI.onMessage) DerivAPI.onMessage(data);
      };
    });
  },

  getHistory: (symbol, granularity, count = 100) => {
    if (!DerivAPI.ws || DerivAPI.ws.readyState !== 1) return;

    const req = {
      ticks_history: symbol,
      adjust_start_time: 1,
      count: count,
      end: "latest",
      start: 1,
      style: "candles",
      granularity: granularity, // 60, 180, 300 etc
    };

    DerivAPI.ws.send(JSON.stringify(req));
  },

  subscribeData: (symbol) => {
    // Basic subscription for ticks if needed, but for candles usually we poll or sub to candles
    // For check, we will use ticks_history with subscribe: 1
    // NOTE: Deriv API allows subscribing to candles via ticks_history
    // Implementation will be handled in main loop request to keep this simple
  },

  // Micro Tick subscription for real tick data
  microTickSubId: null,

  subscribeMicroTicks: (symbol, callback, count = 100) => {
    if (!DerivAPI.ws || DerivAPI.ws.readyState !== 1) return;

    // Request history + subscription for TICKS (not candles)
    // This gives us every price change tick-by-tick
    const req = {
      ticks_history: symbol,
      adjust_start_time: 1,
      count: count,
      end: "latest",
      start: 1,
      style: "ticks",
      subscribe: 1,
      req_id: 99999,
    };

    console.log("[DerivAPI] Subscribing to TICKS:", symbol, "count:", count);

    // Store callback
    DerivAPI.microTickCallback = callback;

    DerivAPI.ws.send(JSON.stringify(req));
  },

  unsubscribeMicroTicks: () => {
    if (
      DerivAPI.microTickSubId &&
      DerivAPI.ws &&
      DerivAPI.ws.readyState === 1
    ) {
      DerivAPI.ws.send(
        JSON.stringify({
          forget: DerivAPI.microTickSubId,
        }),
      );
      DerivAPI.microTickSubId = null;
    }
    DerivAPI.microTickCallback = null;
  },

  microTickCallback: null,
};
