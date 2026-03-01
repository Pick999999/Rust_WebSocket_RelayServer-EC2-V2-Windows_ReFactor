/**
 * DerivAPI Class
 * จัดการการเชื่อมต่อกับ Deriv WebSocket API
 * รองรับทั้ง Historical และ Live Data
 * Fixed: Proper handling of multiple concurrent requests with unique req_id tracking
 */
class DerivAPI {
  constructor(appId = "1089") {
    this.appId = appId;
    this.websocket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.connectionCallbacks = [];

    // Track pending requests by req_id
    this.pendingRequests = new Map();

    // General message handlers (for subscriptions)
    this.messageHandlers = new Map();

    // Subscription tracking
    this.activeSubscriptions = new Map();

    // Request counter for unique IDs
    this.requestCounter = 0;
  }

  /**
   * Generate unique request ID (numeric only - Deriv API requirement)
   */
  generateReqId() {
    this.requestCounter++;
    // Deriv API only accepts numeric req_id
    return this.requestCounter;
  }

  /**
   * เชื่อมต่อกับ Deriv WebSocket
   */
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        this.websocket = new WebSocket(
          `wss://ws.derivws.com/websockets/v3?app_id=${this.appId}`,
        );

        this.websocket.onopen = () => {
          console.log("✅ Connected to Deriv API");
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.notifyConnection(true);
          resolve();
        };

        this.websocket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
          } catch (e) {
            console.error("Failed to parse message:", e);
          }
        };

        this.websocket.onerror = (error) => {
          console.error("❌ WebSocket Error:", error);
          reject(error);
        };

        this.websocket.onclose = () => {
          console.log("🔌 Disconnected from Deriv API");
          this.isConnected = false;
          this.notifyConnection(false);

          // Reject all pending requests
          this.pendingRequests.forEach((handler, reqId) => {
            handler.reject(new Error("Connection closed"));
          });
          this.pendingRequests.clear();

          this.attemptReconnect();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * พยายามเชื่อมต่อใหม่
   */
  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(
        `🔄 Reconnecting... Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`,
      );
      setTimeout(() => this.connect(), 2000 * this.reconnectAttempts);
    } else {
      console.error("❌ Max reconnection attempts reached");
    }
  }

  /**
   * แจ้งเตือนสถานะการเชื่อมต่อ
   */
  notifyConnection(connected) {
    this.connectionCallbacks.forEach((callback) => callback(connected));
  }

  /**
   * ลงทะเบียน callback สำหรับสถานะการเชื่อมต่อ
   */
  onConnectionChange(callback) {
    this.connectionCallbacks.push(callback);
  }

  /**
   * จัดการข้อความที่ได้รับจาก WebSocket
   */
  handleMessage(data) {
    const reqId = data.req_id;
    const msgType = data.msg_type;

    // Debug logging
    console.log(
      `📨 Received: msg_type=${msgType}, req_id=${reqId}, has_error=${!!data.error}, has_candles=${!!data.candles}`,
    );

    // Check if this is a response to a pending request
    if (reqId && this.pendingRequests.has(reqId)) {
      const handler = this.pendingRequests.get(reqId);
      this.pendingRequests.delete(reqId);

      if (data.error) {
        console.error(`❌ Request ${reqId} failed:`, data.error);
        handler.reject(data.error);
      } else {
        console.log(`✅ Request ${reqId} resolved successfully`);
        handler.resolve(data);
      }
      return;
    }

    // Log unmatched responses
    if (reqId) {
      console.warn(
        `⚠️ Received response for unknown req_id: ${reqId}, pending: ${[...this.pendingRequests.keys()].join(", ")}`,
      );
    }

    // Handle subscription messages (ohlc, tick)
    if (data.ohlc && this.messageHandlers.has("ohlc")) {
      this.messageHandlers.get("ohlc")(data);
    }

    if (data.tick && this.messageHandlers.has("tick")) {
      this.messageHandlers.get("tick")(data);
    }

    // Handle errors without req_id
    if (data.error && !reqId) {
      console.error("API Error (no req_id):", data.error);
      if (this.messageHandlers.has("error")) {
        this.messageHandlers.get("error")(data.error);
      }
    }
  }

  /**
   * ลงทะเบียน handler สำหรับข้อความแต่ละประเภท (for subscriptions)
   */
  on(messageType, handler) {
    this.messageHandlers.set(messageType, handler);
  }

  /**
   * ลบ handler
   */
  off(messageType) {
    this.messageHandlers.delete(messageType);
  }

  /**
   * ส่งข้อความไปยัง API และรอ response
   */
  sendAndWait(data, timeout = 15000) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected || this.websocket.readyState !== WebSocket.OPEN) {
        reject(new Error("WebSocket is not connected"));
        return;
      }

      const reqId = data.req_id || this.generateReqId();
      data.req_id = reqId;

      // Store the promise handlers
      const handler = { resolve, reject };
      this.pendingRequests.set(reqId, handler);

      // Set timeout
      const timeoutId = setTimeout(() => {
        if (this.pendingRequests.has(reqId)) {
          this.pendingRequests.delete(reqId);
          reject(new Error("Request timeout"));
        }
      }, timeout);

      // Wrap handlers to clear timeout
      const originalResolve = handler.resolve;
      const originalReject = handler.reject;

      handler.resolve = (data) => {
        clearTimeout(timeoutId);
        originalResolve(data);
      };

      handler.reject = (error) => {
        clearTimeout(timeoutId);
        originalReject(error);
      };

      // Send the request
      try {
        console.log(`📤 Sending request: ${reqId}`, data);
        this.websocket.send(JSON.stringify(data));
      } catch (error) {
        console.error(`❌ Failed to send request ${reqId}:`, error);
        this.pendingRequests.delete(reqId);
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * ส่งข้อความไปยัง API (fire and forget)
   */
  send(data) {
    if (this.isConnected && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify(data));
      return true;
    } else {
      console.error("❌ WebSocket is not connected");
      return false;
    }
  }

  /**
   * ดึงข้อมูล Historical Candles
   */
  async getHistoricalCandles(symbol, granularity = 60, count = 1000) {
    const reqId = this.generateReqId();

    console.log(`🕯️ Requesting candles for ${symbol} (reqId: ${reqId})`);

    try {
      const response = await this.sendAndWait(
        {
          ticks_history: symbol,
          adjust_start_time: 1,
          count: count,
          end: "latest",
          granularity: granularity,
          style: "candles",
          req_id: reqId,
        },
        30000,
      ); // 30 second timeout for candle requests

      console.log(`🕯️ Response for ${symbol}:`, {
        hasCandles: !!response.candles,
        candleCount: response.candles ? response.candles.length : 0,
        hasHistory: !!response.history,
        msgType: response.msg_type,
      });

      if (response.candles) {
        return response.candles;
      } else if (response.history && response.history.prices) {
        // Some responses come as history instead of candles
        console.log(`📊 ${symbol}: Converting history to candles format`);
        return response.history.prices.map((price, i) => ({
          epoch: response.history.times[i],
          open: price,
          high: price,
          low: price,
          close: price,
        }));
      } else {
        console.error(`❌ ${symbol}: Unexpected response format:`, response);
        throw new Error("No candles in response");
      }
    } catch (error) {
      console.error(`❌ Failed to get candles for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Subscribe ไปยัง Live Candles
   */
  subscribeLiveCandles(symbol, granularity = 60, callback) {
    // Unsubscribe from previous subscription for this symbol
    if (this.activeSubscriptions.has(symbol)) {
      this.unsubscribeSymbol(symbol);
    }

    const reqId = this.generateReqId();

    // Store subscription info
    this.activeSubscriptions.set(symbol, {
      reqId: reqId,
      subscriptionId: null,
    });

    // Set up callback for ohlc messages
    this.on("ohlc", (data) => {
      if (data.ohlc && data.ohlc.symbol === symbol) {
        callback(data);
      }
    });

    // Send subscription request
    this.send({
      ticks_history: symbol,
      adjust_start_time: 1,
      count: 1,
      end: "latest",
      granularity: granularity,
      style: "candles",
      subscribe: 1,
      req_id: reqId,
    });

    console.log(`📡 Subscribed to live candles: ${symbol} (${granularity}s)`);

    return reqId;
  }

  /**
   * Unsubscribe from a specific symbol
   */
  unsubscribeSymbol(symbol) {
    const subscription = this.activeSubscriptions.get(symbol);
    if (subscription && subscription.subscriptionId) {
      this.send({
        forget: subscription.subscriptionId,
      });
    }
    this.activeSubscriptions.delete(symbol);
    console.log(`🛑 Unsubscribed from: ${symbol}`);
  }

  /**
   * Unsubscribe จาก Live Data ทั้งหมด
   */
  unsubscribe() {
    this.activeSubscriptions.forEach((sub, symbol) => {
      if (sub.subscriptionId) {
        this.send({
          forget: sub.subscriptionId,
        });
      }
    });
    this.activeSubscriptions.clear();
    this.off("ohlc");
    console.log("🛑 Unsubscribed from all live data");
  }

  /**
   * ดึงรายการ symbols ที่มี
   */
  async getActiveSymbols() {
    const reqId = this.generateReqId();

    try {
      const response = await this.sendAndWait({
        active_symbols: "brief",
        product_type: "basic",
        req_id: reqId,
      });

      if (response.active_symbols) {
        return response.active_symbols;
      } else {
        throw new Error("No active_symbols in response");
      }
    } catch (error) {
      console.error("Failed to get active symbols:", error);
      throw error;
    }
  }

  /**
   * ปิดการเชื่อมต่อ
   */
  disconnect() {
    if (this.websocket) {
      this.unsubscribe();

      // Clear all pending requests
      this.pendingRequests.forEach((handler, reqId) => {
        handler.reject(new Error("Disconnected"));
      });
      this.pendingRequests.clear();

      this.websocket.close();
      this.isConnected = false;
      this.notifyConnection(false);
    }
  }

  /**
   * แปลงข้อมูล candles เป็น format ที่ใช้งานง่าย
   */
  static formatCandles(candles) {
    if (!candles || candles.length === 0) return [];

    return candles.map((candle) => ({
      time: candle.epoch,
      open: parseFloat(candle.open),
      high: parseFloat(candle.high),
      low: parseFloat(candle.low),
      close: parseFloat(candle.close),
    }));
  }

  /**
   * แปลง OHLC message เป็น format ที่ใช้งานง่าย
   */
  static formatOHLC(ohlc) {
    if (!ohlc) return null;

    return {
      time: ohlc.epoch,
      open: parseFloat(ohlc.open),
      high: parseFloat(ohlc.high),
      low: parseFloat(ohlc.low),
      close: parseFloat(ohlc.close),
      open_time: ohlc.open_time,
    };
  }

  /**
   * ตรวจสอบสถานะการเชื่อมต่อ
   */
  getConnectionStatus() {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      pendingRequests: this.pendingRequests.size,
      activeSubscriptions: this.activeSubscriptions.size,
    };
  }
}
