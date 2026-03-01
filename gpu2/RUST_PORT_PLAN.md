# Plan for Porting `clsAnalysisGenerator` to Rust (WASM)

This document outlines the step-by-step plan to convert the existing JavaScript analysis classes (`clsAnalysisGenerator.js` and `clsAnalysisGeneratorTick.js`) into a high-performance Rust library compiled to WebAssembly (WASM).

## 1. Project Initialization

### 1.1 Create Rust Library
Initialize a new Rust library project intended for WASM compilation.

```bash
cargo new --lib analysis_generator_rs
```

### 1.2 Configure `Cargo.toml`
Add necessary dependencies for WASM integration and serialization.

```toml
[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
js-sys = "0.3"
```

## 2. Core Data Structures

Define the fundamental data structures that mirror the JS objects.

### 2.1 `Candle` Struct
Represents a single candlestick data point.

```rust
#[derive(Serialize, Deserialize, Clone, Copy)]
pub struct Candle {
    pub time: u64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
}
```

### 2.2 `AnalysisOptions` Struct
Configuration for indicators, matching the JS default options.

```rust
#[derive(Serialize, Deserialize, Clone)]
pub struct AnalysisOptions {
    pub ema1_period: usize,
    pub ema1_type: String, // "EMA", "HMA", "EHMA"
    // ... all other options (ema2, ema3, atr, bb, etc.)
    pub flat_threshold: f64,
    pub macd_narrow: f64,
}
```

### 2.3 `AnalysisResult` Struct
The complex object returned for each analyzed candle. This must match the JS output **exactly** to ensure the frontend works without modification.

```rust
#[derive(Serialize, Deserialize)]
pub struct AnalysisResult {
    pub index: usize,
    pub candletime: u64,
    pub open: f64,
    // ... all other analysis fields (ema values, directions, cuts, signals)
    pub status_code: String,
    // ...
}
```

## 3. Indicator Implementation

Port the calculation logic. Since the JS implementation uses specific formulas (especially for HMA/EHMA and custom ADX/RSI smoothing), we should **manually implement** these functions rather than relying on generic crates to ensure 100% calculation parity.

### 3.1 Base Indicators
Implement functions for:
- `calculate_ema(data: &[f64], period: usize) -> Vec<f64>`
- `calculate_wma` (Helper for HMA)
- `calculate_hma`
- `calculate_ehma`
- `calculate_rsi` (Note the smoothing logic)
- `calculate_atr`
- `calculate_bb` (Bollinger Bands)
- `calculate_ci` (Choppiness Index)
- `calculate_adx` (Note the DX smoothing logic)

### 3.2 Helper Logic
- `get_ema_direction`
- `get_macd_convergence`
- `get_ema_cut_position`
- `status_code_matcher` (Logic to map `seriesDesc` to `StatusCode`)

## 4. `AnalysisGenerator` (Batch Processing)

Implement the main class that processes an array of candles at once.

```rust
#[wasm_bindgen]
pub struct AnalysisGenerator {
    options: AnalysisOptions,
    candles: Vec<Candle>,
    // Cached indicator data
}

#[wasm_bindgen]
impl AnalysisGenerator {
    #[wasm_bindgen(constructor)]
    pub fn new(options: JsValue) -> AnalysisGenerator { ... }

    pub fn load_candles(&mut self, candles: JsValue) { ... }

    pub fn generate(&mut self) -> JsValue { 
        // 1. Calculate all indicators
        // 2. Iterate and build AnalysisResult objects
        // 3. Serialize to JS Object
    }
}
```

## 5. `AnalysisGeneratorTick` (Incremental Processing)

Port the incremental logic from the Tick class. This is critical for performance.

### 5.1 Internal State Struct
Define a struct to hold the "running" state of calculations (e.g., last EMA value, last ATR, sums for ADX).

```rust
struct GeneratorState {
    last_ema1: f64,
    last_ema2: f64,
    last_atr: f64,
    // ... ADX running sums, RSI avg gain/loss
    last_analysis: Option<AnalysisResult>,
}
```

### 5.2 Incremental Methods
- `append_candle(candle: Candle) -> AnalysisResult`: Updates state and returns analysis for the CLOSED candle.
- `append_tick(price: f64, time: u64) -> Option<AnalysisResult>`: Handles tick aggregation. If a candle closes, calls `append_candle`.

## 6. Optimization & Crates.io Preparation

### 6.1 Performance
- Use `f64` for all currency calculations.
- Minimize cloning of `Vec` where possible.
- Use `serde-wasm-bindgen` for efficient data passing between JS and Rust.

### 6.2 Publishing Plan
1.  **Documentation**: Add Rustdoc comments to all public structs and functions.
2.  **Tests**: Create a test suite in logical Rust (`#[test]`) that compares output against known JS outputs to verify accuracy.
3.  **Readme**: Create `README.md` with installation and usage instructions (# Usage in JS).
4.  **CI/CD**: (Optional) GitHub Action to build and test wasm.

## 7. Integration Back to HTML

Explain how to replace the current JS files.

1.  Run `wasm-pack build --target web`.
2.  Import the generated `init` function and classes in HTML.

```html
<script type="module">
    import init, { AnalysisGeneratorTick } from './pkg/analysis_generator_rs.js';

    async function run() {
        await init();
        // Replace old JS class with new WASM class
        const gen = new AnalysisGeneratorTick(options);
        // ...
    }
    run();
</script>
```
