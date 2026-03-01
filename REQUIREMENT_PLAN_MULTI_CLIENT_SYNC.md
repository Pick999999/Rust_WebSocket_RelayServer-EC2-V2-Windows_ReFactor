# 📋 Requirement Plan: Multi-Client Synchronization (Remote Control)

## 🎯 Objective
Enable a "Master-Slave" or "Remote Control" capability where one client (e.g., `thwpapers.in`) can update trading parameters on the Rust Server, and those changes are immediately propagated to all other connected clients (e.g., `pkderiv.shop`).

**Use Case:** User changes "Initial Stake" or "Trade Mode" on one device, and it automatically updates on another monitoring device.

---

## 🏗️ Architecture Flow
1. **Source (Client A):** Sends `UPDATE_PARAMS` or `UPDATE_MODE` command via WebSocket.
2. **Server (Rust):**
   - Receives command.
   - Updates internal state (`AppState`, `connect_to_deriv` thread).
   - **NEW:** Broadcasts a comprehensive `SystemConfig` message to *all* connected clients.
3. **Destination (Client B):**
   - Receives `SystemConfig` message.
   - Updates UI elements (Input fields, Dropdowns, Buttons) to match the new server state.

---

## 📝 Implementation Steps

### 1. Backend (Rust) - `src/main.rs`

#### A. Define New Message Struct
Create a new struct to hold the complete system configuration state:
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemConfigMessage {
    #[serde(rename = "type")]
    pub msg_type: String, // "system_config"
    pub trade_mode: String,
    pub money_mode: String,
    pub initial_stake: f64,
    pub duration: u64,
    pub duration_unit: String,
    pub target_profit: f64,
    pub target_win: u32,
    pub asset: String,
}
```

#### B. Update `BroadcastMessage` Enum
Add the new message type to the enum:
```rust
pub enum BroadcastMessage {
    // ... existing variants
    SystemConfig(SystemConfigMessage),
}
```

#### C. Modify Command Handlers
Update `handle_socket` or the loop in `connect_to_deriv` to broadcast `SystemConfigMessage` whenever:
- `UPDATE_PARAMS` is received.
- `UPDATE_MODE` is received.
- `START_DERIV` is received (asset change).

**Implementation detail:**
When `PARAMS:...` command is processed, currently `tx.send(BroadcastMessage::LotStatus(...))` is called. We should *also* (or instead) send the `SystemConfigMessage`.

---

### 2. Frontend (JS) - `dashboard.js`

#### A. Handle New Message Type
Update `handleMessage(event)` to recognize `system_config`:
```javascript
} else if (data.type === "system_config") {
    syncUIWithServer(data);
}
```

#### B. Implement Sync Function
Create `syncUIWithServer(config)` function:
- Update Input fields (`#initialStake`, `#duration`, `#targetMoney`, etc.).
- Update Dropdowns (`#moneyMode`, `#assetSelect`).
- Update Trade Mode buttons (Visual active state).
- **Important:** Add a visual indicator (e.g., a "toast" notification or flash effect) so the user knows settings were updated remotely.

---

## ✅ Expected Outcome
- When `thwpapers.in` changes "Initial Stake" to \$5.
- `Rust Server` saves this state.
- `pkderiv.shop` (and any other open tab) immediately sees the "Initial Stake" input field change to \$5 without refreshing the page.
