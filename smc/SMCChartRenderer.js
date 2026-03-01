/**
 * SMC Chart Renderer for LightweightCharts 4.2+
 * Renders SMC indicators (structures, order blocks, FVGs, etc.) on a LightweightCharts chart
 */

/**
 * @typedef {Object} SMCRendererConfig
 * @property {Object} colors
 * @property {string} [colors.bullishStructure='#089981']
 * @property {string} [colors.bearishStructure='#F23645']
 * @property {string} [colors.bullishOB='rgba(49, 121, 245, 0.2)']
 * @property {string} [colors.bearishOB='rgba(247, 124, 128, 0.2)']
 * @property {string} [colors.bullishFVG='rgba(0, 255, 104, 0.3)']
 * @property {string} [colors.bearishFVG='rgba(255, 0, 8, 0.3)']
 * @property {string} [colors.premiumZone='rgba(242, 54, 69, 0.2)']
 * @property {string} [colors.discountZone='rgba(8, 153, 129, 0.2)']
 * @property {string} [colors.equilibrium='rgba(135, 139, 148, 0.2)']
 * @property {string} [colors.strongLevel='#2962FF']
 * @property {string} [colors.weakLevel='#787B86']
 */

class SMCChartRenderer {
    /**
     * @param {Object} chart - LightweightCharts chart instance
     * @param {Object} candlestickSeries - Main candlestick series
     * @param {SMCRendererConfig} config
     */
    constructor(chart, candlestickSeries, config = {}) {
        this.chart = chart;
        this.series = candlestickSeries;

        // Default colors
        this.colors = {
            bullishStructure: config.colors?.bullishStructure || '#089981',
            bearishStructure: config.colors?.bearishStructure || '#F23645',
            bullishOB: config.colors?.bullishOB || 'rgba(49, 121, 245, 0.2)',
            bearishOB: config.colors?.bearishOB || 'rgba(247, 124, 128, 0.2)',
            bullishFVG: config.colors?.bullishFVG || 'rgba(0, 255, 104, 0.3)',
            bearishFVG: config.colors?.bearishFVG || 'rgba(255, 0, 8, 0.3)',
            premiumZone: config.colors?.premiumZone || 'rgba(242, 54, 69, 0.2)',
            discountZone: config.colors?.discountZone || 'rgba(8, 153, 129, 0.2)',
            equilibrium: config.colors?.equilibrium || 'rgba(135, 139, 148, 0.2)',
            strongLevel: config.colors?.strongLevel || '#2962FF',
            weakLevel: config.colors?.weakLevel || '#787B86'
        };

        // Store primitives for cleanup
        this.primitives = [];
        this.markers = [];
        this.lineSeries = [];
    }

    /**
     * Clear all rendered elements
     */
    clear() {
        // Remove markers
        this.series.setMarkers([]);
        this.markers = [];

        // Remove primitives
        for (const primitive of this.primitives) {
            try {
                this.series.detachPrimitive(primitive);
            } catch (e) {
                // Primitive may already be detached
            }
        }
        this.primitives = [];

        // Remove additional line series
        for (const lineSeries of this.lineSeries) {
            try {
                this.chart.removeSeries(lineSeries);
            } catch (e) {
                // Series may already be removed
            }
        }
        this.lineSeries = [];
    }

    /**
     * Render swing point markers (HH, HL, LH, LL)
     * @param {SwingPoint[]} swingPoints
     */
    renderSwingPoints(swingPoints) {
        const markers = swingPoints.map(sp => ({
            time: sp.time,
            position: sp.swing === 'high' ? 'aboveBar' : 'belowBar',
            color: sp.swing === 'high' ? this.colors.bearishStructure : this.colors.bullishStructure,
            shape: sp.swing === 'high' ? 'arrowDown' : 'arrowUp',
            text: sp.type,
            size: 1
        }));

        this.markers = [...this.markers, ...markers];
        this.series.setMarkers(this.markers.sort((a, b) => a.time - b.time));
    }

    /**
     * Render structure labels (CHoCH, BOS)
     * @param {StructurePoint[]} structures
     */
    renderStructures(structures) {
        const markers = structures.map(s => ({
            time: s.time,
            position: s.direction === 'bullish' ? 'aboveBar' : 'belowBar',
            color: s.direction === 'bullish' ? this.colors.bullishStructure : this.colors.bearishStructure,
            shape: 'circle',
            text: s.type,
            size: 0.5
        }));

        this.markers = [...this.markers, ...markers];
        this.series.setMarkers(this.markers.sort((a, b) => a.time - b.time));
    }

    /**
     * Create a box primitive for order blocks and FVGs
     * This uses LightweightCharts primitives API
     * @param {number} time1 - Start time
     * @param {number} time2 - End time (or null for extending)
     * @param {number} price1 - Top price
     * @param {number} price2 - Bottom price
     * @param {string} fillColor - Fill color
     * @param {string} [borderColor] - Border color (optional)
     * @returns {Object} Box primitive
     */
    createBoxPrimitive(time1, time2, price1, price2, fillColor, borderColor = null) {
        const boxPrimitive = {
            time1,
            time2,
            price1,
            price2,
            fillColor,
            borderColor,

            // LightweightCharts primitive interface
            updateAllViews() { },

            priceAxisViews() {
                return [];
            },

            timeAxisViews() {
                return [];
            },

            paneViews() {
                return [this];
            },

            // Drawing logic
            renderer() {
                const that = this;
                return {
                    draw(target) {
                        const ctx = target.context;
                        const series = target.series;
                        const timeScale = target.timeScale;

                        if (!series || !timeScale) return;

                        const x1 = timeScale.timeToCoordinate(that.time1);
                        const x2 = that.time2 ? timeScale.timeToCoordinate(that.time2) : target.mediaSize.width;
                        const y1 = series.priceToCoordinate(that.price1);
                        const y2 = series.priceToCoordinate(that.price2);

                        if (x1 === null || y1 === null || y2 === null) return;

                        ctx.fillStyle = that.fillColor;
                        ctx.fillRect(x1, Math.min(y1, y2), (x2 || target.mediaSize.width) - x1, Math.abs(y2 - y1));

                        if (that.borderColor) {
                            ctx.strokeStyle = that.borderColor;
                            ctx.lineWidth = 1;
                            ctx.strokeRect(x1, Math.min(y1, y2), (x2 || target.mediaSize.width) - x1, Math.abs(y2 - y1));
                        }
                    }
                };
            }
        };

        return boxPrimitive;
    }

    /**
     * Render order blocks
     * @param {OrderBlock[]} orderBlocks
     * @param {number} [currentTime] - Current time to extend non-mitigated blocks
     */
    renderOrderBlocks(orderBlocks, currentTime = null) {
        for (const ob of orderBlocks) {
            const endTime = ob.mitigated ? ob.mitigatedTime : currentTime;
            const color = ob.bias === 'bullish' ? this.colors.bullishOB : this.colors.bearishOB;

            const primitive = this.createBoxPrimitive(
                ob.time,
                endTime,
                ob.high,
                ob.low,
                color
            );

            try {
                this.series.attachPrimitive(primitive);
                this.primitives.push(primitive);
            } catch (e) {
                console.warn('Could not attach order block primitive:', e);
            }
        }
    }

    /**
     * Render Fair Value Gaps
     * @param {FairValueGap[]} fvgs
     * @param {number} [currentTime] - Current time for extending unfilled gaps
     */
    renderFairValueGaps(fvgs, currentTime = null) {
        for (const fvg of fvgs) {
            const endTime = fvg.filled ? fvg.filledTime : currentTime;
            const color = fvg.bias === 'bullish' ? this.colors.bullishFVG : this.colors.bearishFVG;

            const primitive = this.createBoxPrimitive(
                fvg.time,
                endTime,
                fvg.top,
                fvg.bottom,
                color
            );

            try {
                this.series.attachPrimitive(primitive);
                this.primitives.push(primitive);
            } catch (e) {
                console.warn('Could not attach FVG primitive:', e);
            }
        }
    }

    /**
     * Render Equal Highs/Lows
     * @param {EqualHighLow[]} equalHLs
     */
    renderEqualHighsLows(equalHLs) {
        const markers = equalHLs.map(eq => ({
            time: eq.time2,
            position: eq.type === 'EQH' ? 'aboveBar' : 'belowBar',
            color: eq.type === 'EQH' ? this.colors.bearishStructure : this.colors.bullishStructure,
            shape: 'circle',
            text: eq.type,
            size: 0.5
        }));

        this.markers = [...this.markers, ...markers];
        this.series.setMarkers(this.markers.sort((a, b) => a.time - b.time));
    }

    /**
     * Render Premium/Discount Zone
     * @param {PremiumDiscountZone} zone
     */
    renderPremiumDiscountZone(zone) {
        if (!zone) return;

        // Premium Zone (top)
        const premiumPrimitive = this.createBoxPrimitive(
            zone.startTime,
            zone.endTime,
            zone.premiumTop,
            zone.premiumBottom,
            this.colors.premiumZone
        );

        // Discount Zone (bottom)
        const discountPrimitive = this.createBoxPrimitive(
            zone.startTime,
            zone.endTime,
            zone.discountTop,
            zone.discountBottom,
            this.colors.discountZone
        );

        try {
            this.series.attachPrimitive(premiumPrimitive);
            this.series.attachPrimitive(discountPrimitive);
            this.primitives.push(premiumPrimitive, discountPrimitive);
        } catch (e) {
            console.warn('Could not attach zone primitives:', e);
        }
    }

    /**
     * Render Strong/Weak Levels as horizontal lines
     * @param {StrongWeakLevel[]} levels
     * @param {number} endTime - End time for the lines
     */
    renderStrongWeakLevels(levels, endTime) {
        for (const level of levels) {
            const color = level.strength === 'strong' ? this.colors.strongLevel : this.colors.weakLevel;
            const text = level.strength === 'strong'
                ? (level.type === 'high' ? 'Strong High' : 'Strong Low')
                : (level.type === 'high' ? 'Weak High' : 'Weak Low');

            // Create a line series for each level
            const lineSeries = this.chart.addLineSeries({
                color: color,
                lineWidth: 1,
                lineStyle: 0, // Solid
                priceLineVisible: false,
                lastValueVisible: true,
                title: text
            });

            lineSeries.setData([
                { time: level.time, value: level.price },
                { time: endTime, value: level.price }
            ]);

            this.lineSeries.push(lineSeries);
        }
    }

    /**
     * Render all SMC results
     * @param {Object} smcResults - Results from SMCIndicator.getAllResults()
     * @param {Object} [options]
     * @param {boolean} [options.showSwingPoints=true]
     * @param {boolean} [options.showStructures=true]
     * @param {boolean} [options.showOrderBlocks=true]
     * @param {boolean} [options.showFVG=true]
     * @param {boolean} [options.showEqualHL=true]
     * @param {boolean} [options.showPremiumDiscount=true]
     * @param {boolean} [options.showStrongWeak=true]
     */
    renderAll(smcResults, options = {}) {
        const opts = {
            showSwingPoints: options.showSwingPoints !== false,
            showStructures: options.showStructures !== false,
            showOrderBlocks: options.showOrderBlocks !== false,
            showFVG: options.showFVG !== false,
            showEqualHL: options.showEqualHL !== false,
            showPremiumDiscount: options.showPremiumDiscount !== false,
            showStrongWeak: options.showStrongWeak !== false
        };

        // Clear previous renders
        this.clear();

        // Get current time for extending elements
        const currentTime = smcResults.premiumDiscountZone?.endTime || Date.now() / 1000;

        // Render each component based on options
        if (opts.showSwingPoints && smcResults.swingPoints) {
            this.renderSwingPoints(smcResults.swingPoints);
        }

        if (opts.showStructures && smcResults.structures) {
            this.renderStructures(smcResults.structures);
        }

        if (opts.showOrderBlocks && smcResults.orderBlocks) {
            this.renderOrderBlocks(smcResults.orderBlocks, currentTime);
        }

        if (opts.showFVG && smcResults.fairValueGaps) {
            this.renderFairValueGaps(smcResults.fairValueGaps, currentTime);
        }

        if (opts.showEqualHL && smcResults.equalHighsLows) {
            this.renderEqualHighsLows(smcResults.equalHighsLows);
        }

        if (opts.showPremiumDiscount && smcResults.premiumDiscountZone) {
            this.renderPremiumDiscountZone(smcResults.premiumDiscountZone);
        }

        if (opts.showStrongWeak && smcResults.strongWeakLevels) {
            this.renderStrongWeakLevels(smcResults.strongWeakLevels, currentTime);
        }
    }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SMCChartRenderer };
}

if (typeof window !== 'undefined') {
    window.SMCChartRenderer = SMCChartRenderer;
}

export { SMCChartRenderer };
