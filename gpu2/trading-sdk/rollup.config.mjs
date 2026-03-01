import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

export default {
  input: 'src/index.js',
  output: [
    // 1. Browser-ready UMD build (For <script> tag)
    {
      file: 'dist/trading-sdk.js',
      format: 'umd',
      name: 'TradingSDK', // <--- This will be the global variable name window.TradingSDK
      sourcemap: true
    },
    // 2. Minified UMD build
    {
      file: 'dist/trading-sdk.min.js',
      format: 'umd',
      name: 'TradingSDK',
      plugins: [terser()],
      sourcemap: true
    },
    // 3. ESM build (For 'import ... from ...')
    {
      file: 'dist/trading-sdk.esm.js',
      format: 'es',
      sourcemap: true
    }
  ],
  plugins: [
    resolve(),
    commonjs()
  ]
};
