# Trading SDK Migration Guide

Since you have a long-term plan, we have set up a separate structure for your libraries called `trading-sdk`. This allows you to maintain the core logic separately from your HTML interface.

## 📂 Project Structure
```
trading-sdk/
├── package.json          # Dependency management
├── rollup.config.mjs     # Build configuration
└── src/                  # YOUR SOURCE CODE GOES HERE
    ├── index.js          # Main entry point (Exports everything)
    ├── indicators.js
    ├── smc.js
    ├── analysis.js
    ├── loader.js
    └── webgpu.js
```

## 🚀 How to set up

1.  **Open Terminal** in `trading-sdk` folder.
2.  Run `npm install` to install build tools (Rollup).
3.  **Copy your JS files** into `src/` folder.
4.  **Refactor**: You need to add `export` to your classes/functions to make them work in this system.

### Example Refactoring

**Old (js/clsAnalysisGeneratorV2.js):**
```javascript
class AnalysisGeneratorV2 { ... }
```

**New (src/analysis.js):**
```javascript
import { SMCIndicator } from './smc.js'; // Import dependencies explicitly

export class AnalysisGeneratorV2 {       // Add 'export'
    ...
}
```

**New (src/index.js):**
```javascript
export { Indicators } from './indicators.js';
export { SMCIndicator } from './smc.js';
export { AnalysisGeneratorV2 } from './analysis.js';
export { MultiAssetLoader } from './loader.js';
```

## 📦 How to Build
Run:
```bash
npm run build
```
This will generate files in the `dist/` folder:
-   `trading-sdk.js`: Use this in your HTML `<script src="trading-sdk/dist/trading-sdk.js"></script>`
-   `trading-sdk.esm.js`: Use this in modern apps `import { ... } from '...'`

## 🌐 Usage in HTML
Once built, you can replace all those multiple script tags with just one:

```html
<script src="trading-sdk/dist/trading-sdk.min.js"></script>
<script>
    // Access everything via the global TradingSDK object
    const api = new DerivAPI(...);
    const loader = new TradingSDK.MultiAssetLoader(api, TradingSDK.Indicators);
    const generator = new TradingSDK.AnalysisGeneratorV2(...);
</script>
```
