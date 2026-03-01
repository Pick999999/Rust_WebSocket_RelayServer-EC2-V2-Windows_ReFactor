pub mod batch_math;
#[cfg(not(target_arch = "wasm32"))]
pub mod deriv_api;
pub mod generator;
#[cfg(not(target_arch = "wasm32"))]
pub mod manager;
pub mod smc;
pub mod structs;
pub mod wasm;

pub use generator::AnalysisGenerator;
pub use smc::{SmcConfig, SmcIndicator, SmcResult};
pub use structs::{AnalysisOptions, AnalysisResult, Candle, CandleMasterCode};
