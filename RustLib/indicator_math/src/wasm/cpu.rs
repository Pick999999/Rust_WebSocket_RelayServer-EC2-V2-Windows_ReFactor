use crate::generator::AnalysisGenerator;
use crate::structs::{AnalysisOptions, Candle};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct WasmAnalysisGenerator {
    internal: AnalysisGenerator,
}

#[wasm_bindgen]
impl WasmAnalysisGenerator {
    #[wasm_bindgen(constructor)]
    pub fn new(options_json: &str) -> Result<WasmAnalysisGenerator, JsValue> {
        let options: AnalysisOptions = serde_json::from_str(options_json)
            .map_err(|e| JsValue::from_str(&format!("Invalid options JSON: {}", e)))?;

        let master_codes = std::sync::Arc::new(vec![]);
        Ok(WasmAnalysisGenerator {
            internal: AnalysisGenerator::new(options, master_codes),
        })
    }

    pub fn initialize(&mut self, history_json: &str) -> Result<(), JsValue> {
        let history: Vec<Candle> = serde_json::from_str(history_json)
            .map_err(|e| JsValue::from_str(&format!("Invalid history JSON: {}", e)))?;

        for candle in history {
            self.internal.append_candle(candle);
        }
        Ok(())
    }

    pub fn append_tick(&mut self, price: f64, time: u64) -> Result<JsValue, JsValue> {
        if let Some(result) = self.internal.append_tick(price, time) {
            let js_value = serde_wasm_bindgen::to_value(&result)
                .map_err(|e| JsValue::from_str(&e.to_string()))?;
            Ok(js_value)
        } else {
            Ok(JsValue::NULL)
        }
    }
}
