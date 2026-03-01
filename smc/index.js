/**
 * SMC Module Index
 * Smart Money Concepts Indicator for LightweightCharts 4.2+
 * 
 * Converted from PineScript (LuxAlgo Smart Money Concepts)
 */

import { SMCIndicator, BULLISH, BEARISH } from './SMCIndicator.js';
import { SMCChartRenderer } from './SMCChartRenderer.js';

/**
 * High-level SMC integration class
 * Combines SMCIndicator and SMCChartRenderer for easy usage
 */
class SmartMoneyConcepts {
    /**
     * @param {Object} chart - LightweightCharts chart instance
     * @param {Object} candlestickSeries - Main candlestick series
     * @param {Object} [indicatorConfig] - SMCIndicator configuration
     * @param {Object} [rendererConfig] - SMCChartRenderer configuration
     */
    constructor(chart, candlestickSeries, indicatorConfig = {}, rendererConfig = {}) {
        this.indicator = new SMCIndicator(indicatorConfig);
        this.renderer = new SMCChartRenderer(chart, candlestickSeries, rendererConfig);
        this.lastResults = null;
    }

    /**
     * Calculate and render SMC indicators
     * @param {OHLCV[]} data - Array of OHLCV candles
     * @param {Object} [renderOptions] - Rendering options
     * @returns {Object} SMC analysis results
     */
    update(data, renderOptions = {}) {
        // Calculate
        this.indicator.calculate(data);
        this.lastResults = this.indicator.getAllResults();

        // Render
        this.renderer.renderAll(this.lastResults, renderOptions);

        return this.lastResults;
    }

    /**
     * Clear all rendered elements
     */
    clear() {
        this.renderer.clear();
    }

    /**
     * Get current trend
     * @param {'internal'|'swing'} [level='swing']
     * @returns {'bullish'|'bearish'|'neutral'}
     */
    getTrend(level = 'swing') {
        return this.indicator.getTrend(level);
    }

    /**
     * Get filtered results
     * @param {string} type - Type of results to get
     * @param {Object} [filter] - Filter options
     * @returns {Array}
     */
    getFiltered(type, filter = {}) {
        switch (type) {
            case 'structures':
                return this.indicator.getStructures(filter);
            case 'swingPoints':
                return this.indicator.getSwingPoints(filter);
            case 'orderBlocks':
                return this.indicator.getOrderBlocks(filter);
            case 'fairValueGaps':
                return this.indicator.getFairValueGaps(filter);
            case 'equalHighsLows':
                return this.indicator.getEqualHighsLows(filter);
            case 'strongWeakLevels':
                return this.indicator.getStrongWeakLevels(filter);
            default:
                return [];
        }
    }

    /**
     * Get all results
     * @returns {Object}
     */
    getResults() {
        return this.lastResults;
    }

    /**
     * Update indicator configuration
     * @param {Object} config
     */
    setIndicatorConfig(config) {
        this.indicator = new SMCIndicator({
            ...this.indicator.config,
            ...config
        });
    }

    /**
     * Update renderer colors
     * @param {Object} colors
     */
    setColors(colors) {
        this.renderer.colors = {
            ...this.renderer.colors,
            ...colors
        };
    }
}

// Export everything
export {
    SmartMoneyConcepts,
    SMCIndicator,
    SMCChartRenderer,
    BULLISH,
    BEARISH
};

// Default export
export default SmartMoneyConcepts;
