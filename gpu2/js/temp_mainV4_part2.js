
renderSelectedAnalysis: (data) => {
    const container = document.getElementById('selected-analysis-content');
    if (!container || !data) return;
    const analysis = data.emaAnalysis || {};

    const getSlopeIcon = (slope) => {
        if (slope === 'up') return '▲';
        if (slope === 'down') return '▼';
        return '—';
    };

    const getCrossoverStatus = (crossover) => {
        if (crossover === 'golden') return '<span class="crossover-status golden">🔺 Golden Cross</span>';
        if (crossover === 'death') return '<span class="crossover-status death">🔻 Death Cross</span>';
        return '<span class="crossover-status none">No Signal</span>';
    };

    // Helper for SMC text
    let smcHtml = '';
    if (appV4.state.smcSettings.showSMC && data.smcData) {
        const smc = data.smcData;
        smcHtml += `<div class="analysis-section"><div class="analysis-section-title">SMC Analysis</div>`;
        // Last Swing Point
        if (smc.swingPoints && smc.swingPoints.length > 0) {
            const lastSwing = smc.swingPoints[smc.swingPoints.length - 1];
            smcHtml += `<div class="tooltip-row"><span class="tooltip-label">Last Swing:</span><span class="tooltip-value ${lastSwing.swing === 'high' ? 'down' : 'up'}">${lastSwing.type} @ ${lastSwing.price}</span></div>`;
        }
        // Last Structure
        if (smc.structures && smc.structures.length > 0) {
            const lastStruct = smc.structures[smc.structures.length - 1];
            smcHtml += `<div class="tooltip-row"><span class="tooltip-label">Structure:</span><span class="tooltip-value ${lastStruct.direction === 'bullish' ? 'up' : 'down'}">${lastStruct.type} (${lastStruct.direction})</span></div>`;
        }
        smcHtml += `</div>`;
    }

    // Lag detection: medium turned down but long still up
    const lagHtml = (analysis.mediumSlope === 'down' && analysis.longSlope === 'up')
        ? `<div class="slope-lag warning">⚠️ EMA Medium ลง แต่ EMA Long ยังคงขึ้น (Lag)</div>`
        : '';

    container.innerHTML = `
            ${smcHtml}
            <div class="analysis-section">
                <div class="analysis-section-title">EMA Values</div>
                <div class="ema-values-section">
                    <div class="ema-value-item short">
                        <div class="ema-type">Short (${appV4.state.params.emaShort.period})</div>
                        <div class="ema-val">${analysis.shortValue ? analysis.shortValue.toFixed(4) : '-'}</div>
                    </div>
                    <div class="ema-value-item medium">
                        <div class="ema-type">Medium (${appV4.state.params.emaMedium.period})</div>
                        <div class="ema-val">${analysis.mediumValue ? analysis.mediumValue.toFixed(4) : '-'}</div>
                    </div>
                    <div class="ema-value-item long">
                        <div class="ema-type">Long (${appV4.state.params.emaLong.period})</div>
                        <div class="ema-val">${analysis.longValue ? analysis.longValue.toFixed(4) : '-'}</div>
                    </div>
                </div>
            </div>

            <div class="analysis-section">
                <div class="analysis-section-title">Slope Directions</div>
                <div class="slope-indicator">
                    <span class="slope-name">EMA Short</span>
                    <span class="slope-badge ${analysis.shortSlope}">${getSlopeIcon(analysis.shortSlope)} ${analysis.shortSlope ? analysis.shortSlope.toUpperCase() : '-'}</span>
                </div>
                <div class="slope-indicator">
                    <span class="slope-name">EMA Medium</span>
                    <span class="slope-badge ${analysis.mediumSlope}">${getSlopeIcon(analysis.mediumSlope)} ${analysis.mediumSlope ? analysis.mediumSlope.toUpperCase() : '-'}</span>
                </div>
                <div class="slope-indicator">
                    <span class="slope-name">EMA Long</span>
                    <span class="slope-badge ${analysis.longSlope}">${getSlopeIcon(analysis.longSlope)} ${analysis.longSlope ? analysis.longSlope.toUpperCase() : '-'}</span>
                </div>
                ${lagHtml}
            </div>

            <div class="analysis-section">
                <div class="analysis-section-title">Crossover Signals</div>
                <div class="crossover-indicator">
                    <span class="crossover-name">Short ✕ Medium</span>
                    ${getCrossoverStatus(analysis.shortMediumCrossover)}
                </div>
                <div class="crossover-indicator">
                    <span class="crossover-name">Medium ✕ Long</span>
                    ${getCrossoverStatus(analysis.mediumLongCrossover)}
                </div>
            </div>
        `;
},

    // ... Analysis Viewer functions ...
    updateAnalysisDataViewer: (symbol) => {
        const textarea = document.getElementById('analysis-data-textarea');
        const recordCountEl = document.getElementById('analysis-record-count');
        const symbolEl = document.getElementById('analysis-current-symbol');
        if (!textarea) return;

        const data = appV4.state.analysisDataStore[symbol];
        if (!data) {
            textarea.value = 'No data';
            return;
        }

        if (recordCountEl) recordCountEl.textContent = data.length;
        if (symbolEl) symbolEl.textContent = symbol;

        try { textarea.value = JSON.stringify(data, null, 2); } catch (e) { textarea.value = 'Error'; }
    },

        toggleAnalysisViewer: () => {
            const content = document.getElementById('analysis-viewer-content');
            if (content) content.style.display = content.style.display === 'none' ? 'block' : 'none';
        },

            // ... Modals ...
            openAnalysisSettingsModal: () => {
                document.getElementById('analysis-settings-modal').classList.remove('hidden');
            },
                closeAnalysisSettingsModal: () => {
                    document.getElementById('analysis-settings-modal').classList.add('hidden');
                },

                    // ... Status Code Markers ...
                    autoShowStatusCodeMarkers: () => {
                        const chk = document.getElementById('chkAutoShowMarker');
                        if (chk && chk.checked) appV4.showStatusCodeMarkers();
                    },

                        showStatusCodeMarkers: () => {
                            const input = document.getElementById('txtStatusCode');
                            if (!input || !input.value) return;
                            const codes = input.value.split(',').map(s => s.trim());
                            // Logic to find matches in analysisData... 
                            // For V4 MVP, I'm assuming the analysisData has 'StatusCode' field if V2 analysis is used.
                            // If V1, this might be empty.
                            // I'll keep the function stub active.
                        },

                            clearStatusCodeMarkers: () => {
                                // Handled in updateSelectedChart mostly, but if button clicked:
                                if (appV4.state.candleSeries) appV4.state.candleSeries.setMarkers([]);
                            },

                                // ... Zones ...
                                toggleChoppyZones: () => {
                                    appV4.state.zonesEnabled = !appV4.state.zonesEnabled;
                                    appV4.updateSelectedChart(); // Triggers updateChartZones inside
                                },

                                    updateChartZones: () => {
                                        if (!appV4.state.zonesEnabled || !appV4.state.selectedSymbol) return;
                                        // Logic for zones plugin ...
                                        // Requires 'BackgroundColorZonesPlugin' and 'createCiRsiZones' to be defined globally
                                        // assuming they are loaded via script tags.
                                        if (typeof createCiRsiZones === 'function' && appV4.state.candleSeries) {
                                            // ... apply plugin ...
                                        }
                                    },

                                        // ... Helper ...
                                        getEmaColor: (type) => {
                                            if (appV4.state.params[`ema${type.charAt(0).toUpperCase() + type.slice(1)}`].color)
                                                return appV4.state.params[`ema${type.charAt(0).toUpperCase() + type.slice(1)}`].color;
                                            const defaults = { short: '#3b82f6', medium: '#f59e0b', long: '#8b5cf6' };
                                            return defaults[type];
                                        },

                                            updateClock: () => {
                                                const now = new Date(Date.now() + appV4.state.serverTimeOffset);
                                                const el = document.getElementById('server-time');
                                                if (el) el.innerText = now.toLocaleTimeString('en-US', { hour12: false }) + ' (TH)';
                                                // Analog clock hands could be updated here too
                                            },

                                                updateStatus: (text, type) => {
                                                    const el = document.getElementById('connection-status');
                                                    if (el) {
                                                        el.className = `status-pill ${type}`;
                                                        el.innerHTML = `<span class="dot"></span> ${text}`;
                                                    }
                                                },

                                                    generateAnalysisData: (symbol, candles, emaArrays, ci, adx, atr, bbValues) => {
                                                        // Generate Detailed Analysis Array (for Tooltips / Export)
                                                        // Simplified implementation for Part 2
                                                        const data = [];
                                                        // ... Loop candles ...
                                                        candles.forEach((c, i) => {
                                                            data.push({
                                                                index: i,
                                                                candletime: c.epoch,
                                                                candletimeDisplay: new Date(c.epoch * 1000).toLocaleString(),
                                                                color: c.close >= c.open ? 'Green' : 'Red',
                                                                pipSize: c.high - c.low,
                                                                emaShortValue: emaArrays.short[i],
                                                                emaMediumValue: emaArrays.medium[i],
                                                                emaLongValue: emaArrays.long[i],
                                                                choppyIndicator: ci[i],
                                                                adxValue: adx[i],
                                                                atr: atr[i]
                                                                // Add others as needed
                                                            });
                                                        });
                                                        appV4.state.analysisDataStore[symbol] = data;
                                                        return data;
                                                    }
};

// Initialization listener
document.addEventListener('DOMContentLoaded', () => {
    appV4.init();

    // Setting Listeners
    const settingInputs = [
        'ema-short-type', 'ema-short-period', 'ema-short-show',
        'ema-medium-type', 'ema-medium-period', 'ema-medium-show',
        'ema-long-type', 'ema-long-period', 'ema-long-show',
        'atr-period', 'atr-multiplier', 'atr-show'
    ];
    settingInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => {
            appV4.loadEmaSettings();
            appV4.saveSettings();
            appV4.state.dataStore = {};
            appV4.refreshData();
        });
    });

    // Tooltip Fields Checkboxes
    document.querySelectorAll('#tooltip-fields-modal input[type="checkbox"]').forEach(chk => {
        chk.addEventListener('change', () => {
            if (chk.dataset.field) {
                appV4.state.tooltipFields[chk.dataset.field] = chk.checked;
                appV4.saveSettings();
            }
        });
    });
});
