// ============================================================
// Choppiness Index Lab - FIXED Tooltip + ATR Analysis
// ============================================================
const DERIV_WS_URL = 'wss://ws.derivws.com/websockets/v3?app_id=1089';
let ws, candleData = [], mainChart, ciChart, adxChart, candleSeries, emaSeries = [], ciSeries, adxSeries;
let sidewaysMarkers = [], signalHistory = [], lastSignal = null, allMarkers = [];
let userMarkers = [];
let bbUpperSeries = null, bbMiddleSeries = null, bbLowerSeries = null;
// Background Color Zones Plugin (v4 feature)
let bgZonesPlugin = null;

let isVisibleEMA1 = document.getElementById("ema1Show").checked;
let isVisibleEMA2 = document.getElementById("ema2Show").checked;
let isVisibleEMA3 = document.getElementById("ema3Show").checked;

let isVisibleBB = document.getElementById("BBShow").checked;


let currentCiValues = [], currentAdxValues = [], currentAtrValues = [];
let currentMaData = [[], [], []]; // Store data for 3 lines
let macd12 = [];
let macd23 = [];
var analysisArray = [];
var statusCandleCode = null;

function initCharts() {
    const mainContainer = document.getElementById('mainChart');
    if (!mainContainer) return;

    // Clear and prepare container
    mainContainer.innerHTML = '';
    mainContainer.style.position = 'relative';

    const cfg = {
        layout: {
            background: { type: 'solid', color: '#000' },
            textColor: '#0080ff'
        },
        grid: {
            vertLines: { visible: false, color: '#f0f0f0', style: LightweightCharts.LineStyle.Dashed },
            horzLines: { color: '#f0f0f0', style: LightweightCharts.LineStyle.Dashed }
        },
        rightPriceScale: { borderColor: '#d1d4dc' },
        timeScale: { borderColor: '#d1d4dc', timeVisible: true }
    };

    mainChart = LightweightCharts.createChart(mainContainer, { ...cfg, width: mainContainer.clientWidth, height: 400 });
    candleSeries = mainChart.addCandlestickSeries({ upColor: '#26a69a', downColor: '#ef5350', wickUpColor: '#26a69a', wickDownColor: '#ef5350' });

    bbUpperSeries = mainChart.addLineSeries({ color: 'rgba(156, 39, 176, 0.5)', lineWidth: 3, lineStyle: 2 });
    bbMiddleSeries = mainChart.addLineSeries({ color: 'rgba(156, 39, 176, 0.7)', lineWidth: 3 });
    bbLowerSeries = mainChart.addLineSeries({ color: 'rgba(156, 39, 176, 0.5)', lineWidth: 3, lineStyle: 2 });

    emaSeries = [];
    ['#ffffff', '#00ff00', '#ff0000'].forEach((color, i) => {
        emaSeries.push({
            id: i,
            series: mainChart.addLineSeries({ color: color, lineWidth: 2 })
        });
    });



    ciChart = LightweightCharts.createChart(document.getElementById('ciChart'), { ...cfg, height: 180 });
    ciSeries = ciChart.addLineSeries({ color: '#667eea', lineWidth: 3 });

    adxChart = LightweightCharts.createChart(document.getElementById('adxChart'), { ...cfg, height: 180 });
    adxSeries = adxChart.addLineSeries({ color: '#f45c43', lineWidth: 3 });

    ToggleEMA(1); ToggleEMA(2); ToggleEMA(3); ToggleEMA(4);

    // --- Tooltip Creation ---
    /*const tooltip = document.createElement('div');
    tooltip.id = 'chart-tooltip';
    tooltip.style.position = 'absolute';
    tooltip.style.display = 'none';
    tooltip.style.padding = '10px';
    tooltip.style.boxSizing = 'border-box';
    tooltip.style.fontSize = '12px';
    tooltip.style.color = '#333';
    tooltip.style.backgroundColor = 'rgba(255, 255, 255, 0.96)';
    tooltip.style.border = '1px solid #2196F3';
    tooltip.style.borderRadius = '6px';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.zIndex = '1000';
    tooltip.style.fontFamily = 'Monaco, monospace';
    tooltip.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    tooltip.style.minWidth = '180px';
    tooltip.style.lineHeight = '1.6';
    */

    const tooltip = document.createElement('div');
    tooltip.style.position = 'absolute';
    tooltip.style.display = 'none';
    tooltip.style.padding = '10px';
    tooltip.style.background = 'rgba(0, 0, 0, 0.9)';
    tooltip.style.color = '#fff';
    tooltip.style.borderRadius = '5px';
    tooltip.style.fontSize = '11px';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.zIndex = '10000';
    tooltip.style.minWidth = '220px';
    tooltip.style.boxShadow = '0 2px 10px rgba(0,0,0,0.5)';
    tooltip.style.border = '1px solid #4a9eff';
    //chartContainer.style.position = 'relative';
    mainContainer.appendChild(tooltip);

    // --- Tooltip Handler ---
    mainChart.subscribeCrosshairMove(param => {
        if (!param || !param.point || param.point.x < 0 || param.point.y < 0) {
            tooltip.style.display = 'none';
            return;
        }

        // Get candle data
        let candleD = null;
        if (param.seriesData) {
            candleD = param.seriesData.get(candleSeries);
            //console.log('candleD',candleD);

        }
        //console.log('Step-1-2',candleD)

        if (!candleD || !param.time) {
            tooltip.style.display = 'none';
            //return;
        }
        //analysisArray[]
        const index = analysisArray.findIndex(c => c.candletime === param.time);
        let pipSize = 0;
        let emaShortDirection = '';
        let emaMediumDirection = '';
        let diffEMA = 0;
        let converType = '';
        let cutLongType = '';
        let statusCode = '';
        let DiffMediumValue = 0.0;
        let DiffLongValue = 0.0;
        let statusDesc = '';
        sLocal = new Date(param.time * 1000).toLocaleTimeString('th-TH');
        if (index > 0) {
            pipSize = Math.abs(analysisArray[index].pipSize);
            emaShortDirection = analysisArray[index].emaShortDirection;
            emaShortValue = analysisArray[index].emaShortValue;
            previousEmaShortValue = analysisArray[index].previousEmaShortValue ?? 0;
            diffEMA = Math.abs(emaShortValue - previousEmaShortValue).toFixed(4);
            converType = analysisArray[index].emaLongConvergenceType ?? '-'
            cutLongType = analysisArray[index].emaCutLongType ?? '-'
            atr = analysisArray[index].atr ?? '-'

            DiffMediumValue = analysisArray[index].emaMediumValue - analysisArray[index - 1].emaMediumValue;
            DiffLongValue = analysisArray[index].emaLongValue - analysisArray[index - 1].emaLongValue;

            emaMediumDirection = analysisArray[index].emaMediumDirection ?? '-'
            emaLongDirection = analysisArray[index].emaLongDirection ?? '-'
            statusCode = analysisArray[index].StatusCode ?? '-'
            statusDesc = analysisArray[index].StatusDesc;

            const index2 = statusCandleCode.findIndex(c => c.StatusCode === statusCode);
            if (index2 > 0) {
                //statusCode = statusCandleCode[index2].StatusCode  ;
                //statusDesc = statusCandleCode[index2].StatusDesc  ;
            }
        }
        //console.log('Step-2')
        const x = param.point.x;
        const y = param.point.y;

        // Smart Positioning
        let left = x + 15;
        if (left + 200 > mainContainer.clientWidth) {
            left = x - 200;
        }
        let top = y + 15;
        if (top + 250 > mainContainer.clientHeight) {
            top = y - 150;
        }
        // console.log('Step-3')
        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
        tooltip.style.display = 'block';

        //console.log('Step-4')

        // Find index for data lookup
        const idx = candleData.findIndex(c => c.time === param.time);
        pipSize = Math.abs(candleData[idx].open - candleData[idx].close);
        pipSize = pipSize.toFixed(4);

        // Get indicator values
        const ciVal = (currentCiValues || []).find(v => v.time === param.time)?.value;
        const adxVal = (currentAdxValues || []).find(v => v.time === param.time)?.value;
        const atrVal = (currentAtrValues || []).find(v => v.time === param.time)?.value;

        //console.log('Step-5',ciVal,'-',adxVal,'-',atrVal)

        // Build MA analysis
        let emaContent = '';
        emaContent += `<div style="display:flex; justify-content:space-between; margin:2px 0;">
                    <span style="">Time: ${param.time}</span>
			          Time Disp:: <span style="">Time: ${sLocal}</span>
                    </div>`;
        if (idx !== -1 && currentMaData) {
            const colors = ['#007bff', '#ff9800', '#9c27b0'];
            const vals = [];
            for (let i = 0; i < 3; i++) {
                if (currentMaData[i] && currentMaData[i][idx]) {
                    const val = currentMaData[i][idx].value;
                    const prev = (idx > 0 && currentMaData[i][idx - 1]) ? currentMaData[i][idx - 1].value : val;
                    vals.push(val);
                    crossMark = '❌';

                    const diff = Math.abs(val - prev);
                    let dirIcon = '➖';
                    let dirColor = '#888';
                    if ((val - prev) > 0.0001) { dirIcon = '⬆'; dirColor = 'green'; }
                    else if ((val - prev) < -0.0001) { dirIcon = '⬇'; dirColor = 'red'; }

                    emaContent += `<div style="display:flex; justify-content:space-between; margin:2px 0;">
                        <span style="color:${colors[i]}; font-weight:bold;">EMA-L${i + 1}: ${val.toFixed(2)}</span>
                        <span style="color:${dirColor}">${dirIcon} ${diff.toFixed(4)}</span>
                    </div>`;
                } else {
                    vals.push(null);
                }
            }
            emaContent += '<hr>';
            // Line Diffs
            let macd12 = (vals[0] - vals[1]).toFixed(4);
            macd12 = Math.abs(macd12);
            let macd23 = (vals[1] - vals[2]).toFixed(4);
            macd23 = Math.abs(macd23);

            if (macd12 < 0.18) {
                sMark = crossMark;
            } else {
                sMark = '';
            }
            if (macd23 < 0.18) {
                sMark2 = crossMark;
            } else {
                sMark2 = '';
            }

            if (vals[0] !== null && vals[1] !== null) {
                emaContent += `<div style="color:#ffffff; font-size:14px;">MACD 1-2 => ${macd12} ${sMark}</div>`;
            }
            if (vals[1] !== null && vals[2] !== null) {
                emaContent += `<div style="color:#ffffff; font-size:14px;">MACD 2-3 => ${macd23.toFixed(3)}-${sMark2}</div>`;
            }
            if (pipSize < 0.2) {
                emaContent += `<div style="color:#ffffff; font-size:14px;">pipSize => ${pipSize} ${crossMark}</div>`;
            } else {
                emaContent += `<div style="color:#ffffff; font-size:14px;">pipSize => ${pipSize}</div>`;
            }
            emaContent += `<div style="color:#ffffff; font-size:14px;">emaShortDirection ::  ${emaShortDirection}</div>`;
            emaContent += `<div style="color:#ffffff; font-size:14px;">diffEMA ::  ${diffEMA}</div>`;
            emaContent += `<div style="color:#ffffff; font-size:14px;">ConverType ::  ${converType}</div>`;
            emaContent += `<div style="color:#ffffff; font-size:14px;">Cut Long Type ::  ${cutLongType}</div>`;
            emaContent += '<hr>';
            emaContent += `<div style="color:#ffffff; font-size:14px;">DiffMediumValue ::    ${DiffMediumValue.toFixed(4)}</div>`;
            emaContent += `<div style="color:#ffffff; font-size:14px;">DiffLongValue ::      ${DiffLongValue.toFixed(4)}</div>`;


            emaContent += `<div style="color:#ffffff; font-size:14px;">emaMediumDirection ::  ${emaMediumDirection}</div>`;
            emaContent += `<div style="color:#ffffff; font-size:14px;">emaLongDirection ::  ${emaLongDirection}</div>`;

            emaContent += `<div style="color:#ffffff; font-size:14px;">ATR ::  ${atr}</div>`;
            emaContent += '<hr>';
            emaContent += `<div style="color:#ffffff; font-size:14px;">Code ::  ${statusCode}</div>`;
            emaContent += `<div style="color:#ffffff; font-size:14px;">Desc ::  ${statusDesc}</div>`;






        }

        // === UPDATE STATUS CARDS ON HOVER ===
        // Update CI card
        if (ciVal !== undefined && ciVal !== null) {
            document.getElementById('ciValue').textContent = ciVal.toFixed(1);
            // Update CI card color based on value
            const ciCard = document.getElementById('ciCard');
            if (ciVal > 61.8) {
                ciCard.className = 'status-card choppy';
            } else if (ciVal < 38.2) {
                ciCard.className = 'status-card trending';
            } else {
                ciCard.className = 'status-card neutral';
            }
        }

        // Update ADX card
        if (adxVal !== undefined && adxVal !== null) {
            document.getElementById('adxValue').textContent = adxVal.toFixed(1);
            // Update ADX card color based on value
            const adxCard = document.getElementById('adxCard');
            if (adxVal > 25) {
                adxCard.className = 'status-card trending';
            } else if (adxVal < 20) {
                adxCard.className = 'status-card choppy';
            } else {
                adxCard.className = 'status-card neutral';
            }
        }

        // Update BB Width card
        const bbPeriod = parseInt(document.getElementById('bbPeriod')?.value) || 20;
        if (candleData && candleData.length >= bbPeriod) {
            const bbData = calculateBB(candleData, bbPeriod);
            const bbIdx = bbData.upper.findIndex(v => v.time === param.time);
            if (bbIdx !== -1) {
                const bbWidth = (bbData.upper[bbIdx].value - bbData.lower[bbIdx].value).toFixed(4);
                document.getElementById('bbValue').textContent = bbWidth;
            }
        }

        // Update Market State based on hovered candle
        if (ciVal !== undefined && adxVal !== undefined) {
            let marketState = 'WAIT';
            if (ciVal < 38.2 && adxVal > 25) {
                marketState = 'TREND';
                document.getElementById('marketStateCard').className = 'status-card trending';
            } else if (ciVal > 61.8 || adxVal < 20) {
                marketState = 'RANGE';
                document.getElementById('marketStateCard').className = 'status-card choppy';
            } else {
                marketState = 'NEUTRAL';
                document.getElementById('marketStateCard').className = 'status-card neutral';
            }
            document.getElementById('marketState').textContent = marketState;
        }

        // Update Signal based on EMA crossover detection
        if (idx > 0 && currentMaData[0] && currentMaData[1]) {
            const currShort = currentMaData[0][idx]?.value;
            const currMedium = currentMaData[1][idx]?.value;
            const prevShort = currentMaData[0][idx - 1]?.value;
            const prevMedium = currentMaData[1][idx - 1]?.value;

            if (currShort && currMedium && prevShort && prevMedium) {
                const currShortAbove = currShort > currMedium;
                const prevShortAbove = prevShort > prevMedium;

                if (currShortAbove !== prevShortAbove) {
                    if (currShortAbove) {
                        document.getElementById('tradingSignal').textContent = '📈 UP';
                        document.getElementById('tradingSignal').style.color = '#38ef7d';
                    } else {
                        document.getElementById('tradingSignal').textContent = '📉 DOWN';
                        document.getElementById('tradingSignal').style.color = '#f45c43';
                    }
                } else {
                    document.getElementById('tradingSignal').textContent = '⏸️';
                    document.getElementById('tradingSignal').style.color = '';
                }
            }
        }

        // console.log('Step-9',emaContent)
        tooltip.innerHTML = emaContent; return;

        // Render tooltip

        tooltip.innerHTML = `
            <div style="color:#2196F3; font-weight:bold; border-bottom:1px solid #ddd; padding-bottom:4px; margin-bottom:6px;">
                📊 Candle Analysis
            </div>
            <div style="margin-bottom:4px;">
                <b>Close:</b> ${candleD.close?.toFixed(2) || '--'}
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; margin-bottom:6px;">
                <span style="color:${ciVal > 61.8 ? '#ef5350' : '#26a69a'}">CI: ${ciVal?.toFixed(1) || '-'}</span>
                <span style="color:#f45c43">ADX: ${adxVal?.toFixed(1) || '-'}</span>
                <span style="color:#9c27b0">ATR: ${atrVal?.toFixed(4) || '-'}</span>
            </div>
            ${emaContent ? `<div style="border-top:1px solid #eee; padding-top:6px; margin-top:4px;">
                <div style="font-weight:bold; margin-bottom:4px; color:#555;">📈 MA Lines:</div>
                ${emaContent}
            </div>` : ''}
        `;
    });

    mainChart.subscribeClick(param => {
        if (!param || !param.point || !param.time) return;
        if (document.getElementById("isLabMode").checked) {
            const logicalIndex = mainChart.timeScale().coordinateToLogical(param.point.x);
            const target = document.getElementById('currentIndex');
            if (target) target.value = Math.round(logicalIndex);
            processDataByIndex();
            alert('Lab Mode Start');
        } else {
            document.getElementById("timeCandleSelected").value = param.time;
        }

    });
}

function preLoadCandle(symbol) {

    document.getElementById("symbolSelect").value = symbol;
    loadCandleData();



} // end func


function loadCandleData() {


    if (!ws || ws.readyState !== WebSocket.OPEN) return alert("Please Connect WebSocket first!");

    const symbol = document.getElementById('symbolSelect').value;
    document.getElementById("assetSelect").innerHTML = symbol;
    candleSeries.setData([]);
    bbUpperSeries.setData([]);
    //emaSeries = [];




    const granularity = parseInt(document.getElementById('timeframeSelect').value);
    const useLatest = document.getElementById('useLatests').checked;
    let request = { ticks_history: symbol, adjust_start_time: 1, granularity: granularity, style: 'candles' };
    if (useLatest) { request.count = 500; request.end = 'latest'; }
    else {
        const start = document.getElementById('startDate').value; const end = document.getElementById('endDate').value;
        if (!start || !end) return alert("Please select Start and End Date");
        request.start = Math.floor(new Date(start).getTime() / 1000); request.end = Math.floor(new Date(end).getTime() / 1000);
    }
    ws.send(JSON.stringify(request));
    document.getElementById('loadDataBtn').textContent = '⏳ Loading...';
}

function processDataByIndex() {
    const idxInput = document.getElementById('currentIndex');
    const txtArea = document.getElementById("dataAllTxt");
    if (!idxInput || !txtArea.value) return;
    try {
        const allCandles = JSON.parse(txtArea.value);
        const targetIndex = parseInt(idxInput.value);
        if (targetIndex < 0 || targetIndex >= allCandles.length) return;
        const sliced = allCandles.slice(0, targetIndex + 1);
        candleData = sliced.map(c => ({
            time: (c.epoch || c.time) + (7 * 3600), open: +c.open, high: +c.high, low: +c.low, close: +c.close
        }));
        candleSeries.setData(candleData);

        userMarkers = [{ time: candleData[candleData.length - 1].time, position: 'belowBar', color: '#2196F3', shape: 'arrowUp', text: `Idx:${targetIndex}` }];
        calculateAllIndicators();
    } catch (e) { console.error("Process Error:", e); }
}



async function connectToDeriv() {
    const btn = document.getElementById('connectBtn');
    btn.textContent = '🔄 Connecting...';
    ws = new WebSocket(DERIV_WS_URL);
    ws.onopen = () => {
        btn.textContent = '✅ Connected';
        btn.style.background = '#66bb6a';
        document.getElementById('loadDataBtn').disabled = false;

        // Auto Loading - เมื่อ connect สำเร็จให้โหลดข้อมูลทันที
        const autoLoadingChk = document.getElementById('autoLoadingChk');
        if (autoLoadingChk && autoLoadingChk.checked) {
            loadCandleData();
        }
    };
    ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        if (data.msg_type === 'candles') {
            document.getElementById("dataAllTxt").value = JSON.stringify(data.candles);
            candleData = data.candles.map(c => ({ time: c.epoch + (7 * 3600), open: +c.open, high: +c.high, low: +c.low, close: +c.close }));
            candleSeries.setData(candleData);
            document.getElementById('currentIndex').value = data.candles.length - 1;
            calculateAllIndicators();
            document.getElementById('loadDataBtn').textContent = '✅ Loaded';
            document.getElementById('updateBtn').disabled = false;
        }
    };
    ws.onerror = () => { btn.textContent = '❌ Error'; btn.style.background = '#ef5350'; };

    // WebSocket Connection Loss - เปลี่ยนสีปุ่มเป็นสีแดงเมื่อ connection หลุด
    ws.onclose = () => {
        btn.textContent = '❌ Disconnected';
        btn.style.background = '#ef5350';
        document.getElementById('loadDataBtn').disabled = true;
    };
}

function ToggleEMA(emano) {

    if (emano === 1) {
        isVisibleEMA1 = document.getElementById("ema1Show").checked;
        //let  isVisibleEMA1 = document.getElementById("").checked ? true : false;
        emaSeries[0].series.applyOptions({
            visible: isVisibleEMA1
        });
    }

    if (emano === 2) {
        isVisibleEMA2 = document.getElementById("ema2Show").checked;
        emaSeries[1].series.applyOptions({
            visible: isVisibleEMA2
        });
    }

    if (emano === 3) {
        isVisibleEMA3 = document.getElementById("ema3Show").checked;
        emaSeries[2].series.applyOptions({
            visible: isVisibleEMA3
        });
    }

    if (emano === 4) {

        isVisibleBB = document.getElementById("BBShow").checked;

        bbUpperSeries.applyOptions({
            visible: isVisibleBB
        });
        bbMiddleSeries.applyOptions({
            visible: isVisibleBB
        });

        bbLowerSeries.applyOptions({
            visible: isVisibleBB
        });

    }



}  // end func

function AdjustDisplayEMA() {

    isVisibleEMA1 = document.getElementById("ema1Show").checked;
    //let  isVisibleEMA1 = document.getElementById("").checked ? true : false;
    emaSeries[0].series.applyOptions({
        visible: isVisibleEMA1
    });

    isVisibleEMA2 = document.getElementById("ema2Show").checked;
    emaSeries[1].series.applyOptions({
        visible: isVisibleEMA2
    });

    isVisibleEMA3 = document.getElementById("ema3Show").checked;
    emaSeries[2].series.applyOptions({
        visible: isVisibleEMA3
    });

    isVisibleBB = document.getElementById("BBShow").checked;

    bbUpperSeries.applyOptions({
        visible: isVisibleBB
    });
    bbMiddleSeries.applyOptions({
        visible: isVisibleBB
    });

    bbLowerSeries.applyOptions({
        visible: isVisibleBB
    });



} // end func


function AddMACD12Markers() {



    const result = macd12.filter(object => object.sMark === "y");
    macdMarker = [];
    for (let i = 0; i <= result.length - 1; i++) {
        sObj = {
            time: result[i].time,
            position: 'aboveBar',
            color: '#ffff00',
            shape: 'arrowDown',
            text: '' + i
        }
        macdMarker.push(sObj);
    }


    candleSeries.setMarkers(macdMarker);


} // end func

function AddChoppyMarkers() {

    let asset = document.getElementById("symbolSelect").value;


    //alert(document.getElementById("symbolSelect").value);
    const result = analysisArray.filter(object => object.choppyIndicator >= 60);
    //alert(result.length + '-' + thereshold);
    console.clear;
    choppyMarker = [];
    for (let i = 0; i <= result.length - 1; i++) {
        sObj = {
            time: result[i].candletime,
            position: 'aboveBar',
            color: '#ffff00',
            shape: 'arrowDown',
            text: 'C' + i
        }
        choppyMarker.push(sObj);
    }
    candleSeries.setMarkers(choppyMarker);
} // end func

function AddEMAConflictMarkers() {

    let newData = analysisArray.map(item => ({
        ...item,
        emaConflict: (item.emaAbove === 'ShortAbove' && item.color === 'Red') ||
            (item.emaAbove === 'MediumAbove' && item.color === 'Green') ? 'y' : 'n',
        suggestAction: item.emaAbove === 'ShortAbove' ? 'CALL' : 'PUT',
        suggestColor: item.emaAbove === 'ShortAbove' ? 'Green' : 'Red'
    }));


    const result = newData.filter(object => object.emaConflict === "y");
    addMarker(result);


} // end func


function addMarker(result) {

    Marker = [];
    for (let i = 0; i <= result.length - 1; i++) {
        sObj = {
            time: result[i].candletime,
            position: 'aboveBar',
            color: '#ffff00',
            shape: 'arrowDown',
            text: 'C' + i
        }
        Marker.push(sObj);
    }
    candleSeries.setMarkers(Marker);

} // end func



function AddPIPSmallMarkers() {

    //alert(analysisArray.length);
    const result = analysisArray.filter(object => object.pipSize < 0.15);
    console.clear;

    pipMarker = [];
    alert(result.length);
    for (let i = 0; i <= result.length - 1; i++) {
        sObj = {
            time: result[i].candletime,
            position: 'aboveBar',
            color: '#ffff00',
            shape: 'arrowDown',
            text: '' + i
        }
        pipMarker.push(sObj);
    }
    candleSeries.setMarkers(pipMarker);

} // end func

function AddFlatSlopeMarkers() {

    //alert(analysisArray.length);
    //"emaShortDirection": "Flat",
    //emaShortValue, previousEmaShortValue

    // R_10 thereshold =  0.07
    // R_50 thereshold =  0.0007,0.005
    let asset = document.getElementById("symbolSelect").value;
    let thereshold = 0.07;
    let multiply = 1;
    if (asset === 'R_10' || asset === 'R_25' || asset === 'R_100') {
        thereshold = 0.07;
        multiply = 10;
        //thereshold =  0.7;
    }
    if (asset === 'R_50') {
        thereshold = 0.005; multiply = 100;
    }
    if (asset === 'R_75') {
        thereshold = 0.005; multiply = 1;
    }


    //alert(document.getElementById("symbolSelect").value);
    const result = analysisArray.filter(object => Math.abs(object.emaShortValue - object.previousEmaShortValue) <= thereshold);
    //alert(result.length + '-' + thereshold);
    console.clear;



    flatMarker = [];

    for (let i = 0; i <= result.length - 1; i++) {
        sObj = {
            time: result[i].candletime,
            position: 'aboveBar',
            color: '#ffff00',
            shape: 'arrowDown',
            text: '' + i
        }
        flatMarker.push(sObj);
    }
    candleSeries.setMarkers(flatMarker);

} // end func



function getCandleColor(candle, prevCandle, atrValue) {
    // คำนวณ True Range
    const tr = Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - prevCandle.close),
        Math.abs(candle.low - prevCandle.close)
    );

    // กำหนดเกณฑ์
    const threshold = atrValue * 1.2 // 2 เท่าของ ATR
    let thisColor = '';
    if (candle.close > candle.open) {
        thisColor = '#00ff00';
    } else {
        thisColor = '#ff0000';
    }

    if (tr > threshold) {
        // แท่งผิดปกติ - ใช้สีเทา
        return {
            color: thisColor,
            wickColor: 'rgba(128, 128, 128, 0.8)'
        };
    }

    // แท่งปกติ - ไม่ระบุสี (ใช้สีปกติ)
    return {};
}

function isAbnormalATR(curcandle, prevCandle, atrValue) {

    let isATR = false;
    // คำนวณ True Range
    const tr = Math.max(
        curcandle.high - curcandle.low,
        Math.abs(curcandle.high - prevCandle.close),
        Math.abs(curcandle.low - prevCandle.close)
    );

    // กำหนดเกณฑ์
    const threshold = atrValue * 1.2 // 2 เท่าของ ATR
    /*
    let thisColor = '';
    if (curcandle.close > curcandle.open) {
        thisColor = '#00ff00';
    } else {
        thisColor = '#ff0000';
    }
  */
    if (tr > threshold) {
        // แท่งผิดปกติ - ใช้สีเทา
        isATR = true;

    }

    // แท่งปกติ - ไม่ระบุสี (ใช้สีปกติ)
    return isATR;

} // end func


function highlightCandles() {

    // ใช้งาน
    const processedData = candleData.map((candle, i) => {
        if (i === 0) return candle;
        const atr = currentAtrValues[i].value; // ค่า ATR ของแท่งนี้
        //console.log(atr, ' vs ',analysisArray[i].atr);

        const customColor = getCandleColor(candle, candleData[i - 1], atr);

        return {
            ...candle,
            ...customColor
        };
    });
    // console.log('Process Data',processedData) ;


    //alert(processedData.length);
    candleSeries.setData(processedData);

    for (let i = 1; i <= candleData.length - 1; i++) {

        curcandle = candleData[i];
        prevCandle = candleData[i - 1];

        atrValue = currentAtrValues[i].value; // ค่า ATR ของแท่งนี้
        isAbnormal = isAbnormalATR(curcandle, prevCandle, atrValue);
        if (isAbnormal) {
            analysisArray[i].isAbnormal = 'y';
            console.log('y')

        } else {
            analysisArray[i].isAbnormal = 'n';
            console.log('n')
        }
    }
    document.getElementById("analysisDataTxt").value = JSON.stringify(analysisArray, null, 2);



} // end func

// ==================================================================
// Generate Analysis Data - สร้างข้อมูล Analysis Array
// ==================================================================
function generateAnalysisDataOld() {

    // Version ใหม่ ถูกย้าย ไปที่ thepapers.in/js/indicator.js
    if (!candleData || candleData.length === 0) {
        alert("กรุณาโหลดข้อมูล Candle ก่อน!");
        return [];
    }

    const atrMultiplier = parseFloat(document.getElementById('atrMultiplier')?.value) || 2;
    const bbPeriod = parseInt(document.getElementById('bbPeriod')?.value) || 20;

    // Get BB data
    const bbData = calculateBB(candleData, bbPeriod);

    // Build analysis array
    analysisArray = [];

    // Track the last EMA crossover index for calculating distance
    let lastEmaCutIndex = null;

    for (let i = 0; i < candleData.length; i++) {
        const candle = candleData[i];
        const prevCandle = i > 0 ? candleData[i - 1] : null;
        const nextCandle = i < candleData.length - 1 ? candleData[i + 1] : null;

        // 1. candletime
        const candletime = candle.time;

        // 2. candletimeDisplay - format to readable datetime
        const date = new Date((candle.time) * 1000);
        const candletimeDisplay = date.toLocaleString('th-TH', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });

        // 3. OHLC
        const open = candle.open;
        const high = candle.high;
        const low = candle.low;
        const close = candle.close;

        // 4. color
        let color = 'Equal';
        if (close > open) color = 'Green';
        else if (close < open) color = 'Red';

        // 5. nextColor
        let nextColor = null;
        if (nextCandle) {
            if (nextCandle.close > nextCandle.open) nextColor = 'Green';
            else if (nextCandle.close < nextCandle.open) nextColor = 'Red';
            else nextColor = 'Equal';
        }

        // 6. pipSize (full candle size)
        const pipSize = Math.abs(close - open);

        // 7. emaShortValue
        const emaShortValue = currentMaData[0] && currentMaData[0][i] ? currentMaData[0][i].value : null;

        // 8. emaShortDirection
        let emaShortDirection = 'Flat';
        if (i > 0 && currentMaData[0] && currentMaData[0][i] && currentMaData[0][i - 1]) {
            const diff = currentMaData[0][i].value - currentMaData[0][i - 1].value;
            if (diff > 0.0001) emaShortDirection = 'Up';
            else if (diff < -0.0001) emaShortDirection = 'Down';
        }

        // 9. emaShortTurnType
        let emaShortTurnType = '-';
        if (i >= 2 && currentMaData[0] && currentMaData[0][i] && currentMaData[0][i - 1] && currentMaData[0][i - 2]) {
            const currDiff = currentMaData[0][i].value - currentMaData[0][i - 1].value;
            const prevDiff = currentMaData[0][i - 1].value - currentMaData[0][i - 2].value;
            const currDir = currDiff > 0.0001 ? 'Up' : (currDiff < -0.0001 ? 'Down' : 'Flat');
            const prevDir = prevDiff > 0.0001 ? 'Up' : (prevDiff < -0.0001 ? 'Down' : 'Flat');

            if (currDir === 'Up' && prevDir === 'Down') emaShortTurnType = 'TurnUp';
            else if (currDir === 'Down' && prevDir === 'Up') emaShortTurnType = 'TurnDown';
        }

        // 10. emaMediumValue
        const emaMediumValue = currentMaData[1] && currentMaData[1][i] ? currentMaData[1][i].value : null;

        // 11. emaMediumDirection
        let emaMediumDirection = 'Flat';
        if (i > 0 && currentMaData[1] && currentMaData[1][i] && currentMaData[1][i - 1]) {
            const diff = currentMaData[1][i].value - currentMaData[1][i - 1].value;
            if (diff > 0.0001) emaMediumDirection = 'Up';
            else if (diff < -0.0001) emaMediumDirection = 'Down';
        }

        // 12. emaAbove (Short above Medium?)
        let emaAbove = null;
        if (emaShortValue !== null && emaMediumValue !== null) {
            emaAbove = emaShortValue > emaMediumValue ? 'ShortAbove' : 'MediumAbove';
        }

        // 13. macd12 = abs(emaShortValue - emaMediumValue)
        let macd12Value = null;
        if (emaShortValue !== null && emaMediumValue !== null) {
            macd12Value = Math.abs(emaShortValue - emaMediumValue);
        }

        // NEW: previousEmaShortValue - ค่า EMA Short ของแท่งก่อนหน้า
        const previousEmaShortValue = (i > 0 && currentMaData[0] && currentMaData[0][i - 1])
            ? currentMaData[0][i - 1].value : null;

        // NEW: previousEmaMediumValue - ค่า EMA Medium ของแท่งก่อนหน้า
        const previousEmaMediumValue = (i > 0 && currentMaData[1] && currentMaData[1][i - 1])
            ? currentMaData[1][i - 1].value : null;

        // NEW: previousEmaLongValue - ค่า EMA Long ของแท่งก่อนหน้า
        const previousEmaLongValue = (i > 0 && currentMaData[2] && currentMaData[2][i - 1])
            ? currentMaData[2][i - 1].value : null;

        // NEW: previousMacd12 - ค่า MACD12 ของแท่งก่อนหน้า
        let previousMacd12 = null;
        if (previousEmaShortValue !== null && previousEmaMediumValue !== null) {
            previousMacd12 = Math.abs(previousEmaShortValue - previousEmaMediumValue);
        }

        // NEW: emaConvergenceType - divergence เมื่อ macd12 ปัจจุบัน > previousMacd12, convergence เมื่อ < previousMacd12
        let emaConvergenceType = null;
        if (macd12Value !== null && previousMacd12 !== null) {
            if (macd12Value > previousMacd12) {
                emaConvergenceType = 'divergence';  // เส้น EMA กำลังแยกตัวออกจากกัน
            } else if (macd12Value < previousMacd12) {
                emaConvergenceType = 'convergence'; // เส้น EMA กำลังเข้าหากัน
            } else {
                emaConvergenceType = 'neutral';     // เท่ากัน
            }
        }

        // NEW FIELD 1: emaCutLongType - ตรวจจับจุดตัดระหว่าง emaShort กับ emaMedium
        let emaCutLongType = null;
        if (i > 0 && emaShortValue !== null && emaMediumValue !== null) {
            const prevEmaShort = currentMaData[0] && currentMaData[0][i - 1] ? currentMaData[0][i - 1].value : null;
            const prevEmaMedium = currentMaData[1] && currentMaData[1][i - 1] ? currentMaData[1][i - 1].value : null;

            if (prevEmaShort !== null && prevEmaMedium !== null) {
                // ตรวจสอบการตัดกัน - เส้นสลับตำแหน่งกัน
                const currentShortAbove = emaShortValue > emaMediumValue;
                const prevShortAbove = prevEmaShort > prevEmaMedium;

                if (currentShortAbove !== prevShortAbove) {
                    // มีการตัดกันเกิดขึ้น
                    if (currentShortAbove) {
                        // emaShort ตัดขึ้นเหนือ emaMedium = Golden Cross = UpTrend
                        emaCutLongType = 'UpTrend';
                    } else {
                        // emaShort ตัดลงใต้ emaMedium = Death Cross = DownTrend
                        emaCutLongType = 'DownTrend';
                    }
                }
            }
        }

        // Update lastEmaCutIndex when crossover detected
        if (emaCutLongType !== null) {
            lastEmaCutIndex = i;
        }

        // NEW FIELD 2: candlesSinceEmaCut - จำนวนแท่งห่างจากจุดตัดล่าสุด
        let candlesSinceEmaCut = null;
        if (lastEmaCutIndex !== null) {
            candlesSinceEmaCut = i - lastEmaCutIndex;
        }

        // 14. choppyIndicator (CI)
        const ciData = currentCiValues.find(v => v.time === candle.time);
        const choppyIndicator = ciData ? ciData.value : null;

        // 15. adxValue
        const adxData = currentAdxValues.find(v => v.time === candle.time);
        const adxValue = adxData ? adxData.value : null;

        // 16. BB (Bollinger Bands values)
        let bbValues = { upper: null, middle: null, lower: null };
        const bbIdx = bbData.upper.findIndex(v => v.time === candle.time);
        if (bbIdx !== -1) {
            bbValues = {
                upper: bbData.upper[bbIdx].value,
                middle: bbData.middle[bbIdx].value,
                lower: bbData.lower[bbIdx].value
            };
        }

        // 17. ตำแหน่งราคาเทียบกับ BB
        let bbPosition = 'Unknown';
        if (bbValues.upper !== null && bbValues.lower !== null) {
            const bbRange = bbValues.upper - bbValues.lower;
            const upperZone = bbValues.upper - (bbRange * 0.33);
            const lowerZone = bbValues.lower + (bbRange * 0.33);

            if (close >= upperZone) bbPosition = 'NearUpper';
            else if (close <= lowerZone) bbPosition = 'NearLower';
            else bbPosition = 'Middle';
        }

        // 18. atr
        const atrData = currentAtrValues.find(v => v.time === candle.time);
        const atr = atrData ? atrData.value : null;

        // 19. isAbnormalCandle - ใช้ True Range เทียบกับ ATR x multiplier
        let isAbnormalCandle = false;
        if (atr !== null && prevCandle) {
            const trueRange = Math.max(
                high - low,
                Math.abs(high - prevCandle.close),
                Math.abs(low - prevCandle.close)
            );
            isAbnormalCandle = trueRange > (atr * atrMultiplier);
        }

        // 20. UWick (Upper Wick)
        const bodyTop = Math.max(open, close);
        const bodyBottom = Math.min(open, close);
        const uWick = high - bodyTop;

        // 21. Body
        const body = Math.abs(close - open);

        // 23. LWick (Lower Wick) - note: 22 skipped in requirements
        const lWick = bodyBottom - low;

        // 24. ตำแหน่งที่ emaShortValue ตัดผ่าน
        let emaCutPosition = null;
        if (emaShortValue !== null) {
            // 1. ถ้าตัดผ่านเหนือ UWick ให้เป็น 1
            if (emaShortValue > high) {
                emaCutPosition = '1'; // Above Upper Wick
            }
            // 2. ถ้าตัดผ่าน UWick กับ Close/Open ให้เป็น 2
            else if (emaShortValue >= bodyTop && emaShortValue <= high) {
                emaCutPosition = '2'; // Between Upper Wick and Body Top
            }
            // 3. ถ้าตัดผ่าน Body - แบ่งเป็น 3 ส่วน (B1, B2, B3)
            else if (emaShortValue >= bodyBottom && emaShortValue < bodyTop) {
                const bodyRange = bodyTop - bodyBottom;
                if (bodyRange > 0) {
                    const positionInBody = (emaShortValue - bodyBottom) / bodyRange;
                    if (positionInBody >= 0.66) {
                        emaCutPosition = 'B1'; // Top 30% of body
                    } else if (positionInBody >= 0.33) {
                        emaCutPosition = 'B2'; // Middle 30% of body
                    } else {
                        emaCutPosition = 'B3'; // Bottom 30% of body
                    }
                } else {
                    emaCutPosition = 'B2'; // Doji - equal open/close
                }
            }
            // 4. ถ้าตัดผ่าน LWick กับ Open/Close ให้เป็น 3
            else if (emaShortValue >= low && emaShortValue < bodyBottom) {
                emaCutPosition = '3'; // Between Body Bottom and Lower Wick
            }
            // 5. ถ้าตัดผ่านใต้ LWick ให้เป็น 4
            else if (emaShortValue < low) {
                emaCutPosition = '4'; // Below Lower Wick
            }
        }

        // Candle body percentages
        const fullCandleSize = high - low;
        const bodyPercent = fullCandleSize > 0 ? ((body / fullCandleSize) * 100).toFixed(2) : 0;
        const uWickPercent = fullCandleSize > 0 ? ((uWick / fullCandleSize) * 100).toFixed(2) : 0;
        const lWickPercent = fullCandleSize > 0 ? ((lWick / fullCandleSize) * 100).toFixed(2) : 0;

        // Build analysis object
        const analysisObj = {
            index: i,
            candletime: candletime,
            candletimeDisplay: candletimeDisplay,
            open: open,
            high: high,
            low: low,
            close: close,
            color: color,
            nextColor: nextColor,
            pipSize: parseFloat(pipSize.toFixed(5)),
            emaShortValue: emaShortValue !== null ? parseFloat(emaShortValue.toFixed(5)) : null,
            emaShortDirection: emaShortDirection,
            emaShortTurnType: emaShortTurnType,
            emaMediumValue: emaMediumValue !== null ? parseFloat(emaMediumValue.toFixed(5)) : null,
            emaMediumDirection: emaMediumDirection,
            emaAbove: emaAbove,
            macd12: macd12Value !== null ? parseFloat(macd12Value.toFixed(5)) : null,
            previousEmaShortValue: previousEmaShortValue !== null ? parseFloat(previousEmaShortValue.toFixed(5)) : null,
            previousEmaMediumValue: previousEmaMediumValue !== null ? parseFloat(previousEmaMediumValue.toFixed(5)) : null,
            previousEmaLongValue: previousEmaLongValue !== null ? parseFloat(previousEmaLongValue.toFixed(5)) : null,
            previousMacd12: previousMacd12 !== null ? parseFloat(previousMacd12.toFixed(5)) : null,
            emaConvergenceType: emaConvergenceType,
            choppyIndicator: choppyIndicator !== null ? parseFloat(choppyIndicator.toFixed(2)) : null,
            adxValue: adxValue !== null ? parseFloat(adxValue.toFixed(2)) : null,
            bbValues: {
                upper: bbValues.upper !== null ? parseFloat(bbValues.upper.toFixed(5)) : null,
                middle: bbValues.middle !== null ? parseFloat(bbValues.middle.toFixed(5)) : null,
                lower: bbValues.lower !== null ? parseFloat(bbValues.lower.toFixed(5)) : null
            },
            bbPosition: bbPosition,
            atr: atr !== null ? parseFloat(atr.toFixed(5)) : null,
            isAbnormalCandle: isAbnormalCandle,
            uWick: parseFloat(uWick.toFixed(5)),
            uWickPercent: parseFloat(uWickPercent),
            body: parseFloat(body.toFixed(5)),
            bodyPercent: parseFloat(bodyPercent),
            lWick: parseFloat(lWick.toFixed(5)),
            lWickPercent: parseFloat(lWickPercent),
            emaCutPosition: emaCutPosition,
            emaCutLongType: emaCutLongType,
            candlesSinceEmaCut: candlesSinceEmaCut
        };

        analysisArray.push(analysisObj);
    }

    // Output to NEW textarea (not overwriting the old one)
    console.log('📊 Analysis Data Generated:', analysisArray);
    document.getElementById("analysisDataTxt").value = JSON.stringify(analysisArray, null, 2);

    // Calculate summary statistics
    const abnormalCount = analysisArray.filter(a => a.isAbnormalCandle).length;
    const greenCount = analysisArray.filter(a => a.color === 'Green').length;
    const redCount = analysisArray.filter(a => a.color === 'Red').length;
    const emaCrossoverCount = analysisArray.filter(a => a.emaCutLongType !== null).length;
    const upTrendCount = analysisArray.filter(a => a.emaCutLongType === 'UpTrend').length;
    const downTrendCount = analysisArray.filter(a => a.emaCutLongType === 'DownTrend').length;

    // Update summary UI
    document.getElementById('analysisCount').textContent = analysisArray.length;
    document.getElementById('emaCrossCount').textContent = emaCrossoverCount;
    document.getElementById('upTrendCount').textContent = upTrendCount;
    document.getElementById('downTrendCount').textContent = downTrendCount;

    // Update status cards with latest values
    if (analysisArray.length > 0) {
        const latest = analysisArray[analysisArray.length - 1];

        // Update CI card
        if (latest.choppyIndicator !== null) {
            document.getElementById('ciValue').textContent = latest.choppyIndicator.toFixed(1);
        }

        // Update ADX card
        if (latest.adxValue !== null) {
            document.getElementById('adxValue').textContent = parseFloat(latest.adxValue).toFixed(1);
        }

        // Update BB Width card
        if (latest.bbValues.upper !== null && latest.bbValues.lower !== null) {
            const bbWidth = (parseFloat(latest.bbValues.upper) - parseFloat(latest.bbValues.lower)).toFixed(4);
            document.getElementById('bbValue').textContent = bbWidth;
        }

        // Update Market State
        let marketState = 'WAIT';
        if (latest.choppyIndicator !== null && latest.adxValue !== null) {
            const ci = latest.choppyIndicator;
            const adx = parseFloat(latest.adxValue);
            if (ci < 38.2 && adx > 25) {
                marketState = 'TREND';
            } else if (ci > 61.8 || adx < 20) {
                marketState = 'RANGE';
            } else {
                marketState = 'NEUTRAL';
            }
        }
        document.getElementById('marketState').textContent = marketState;

        // Update Marker count
        document.getElementById('markerCount').textContent = emaCrossoverCount;
    }

    alert(`📊 Analysis Data Generated!\n\n` +
        `Total Candles: ${analysisArray.length}\n` +
        `Green: ${greenCount}\n` +
        `Red: ${redCount}\n` +
        `Abnormal (ATR x${atrMultiplier}): ${abnormalCount}\n` +
        `EMA Crossovers: ${emaCrossoverCount} (⬆${upTrendCount} / ⬇${downTrendCount})\n\n` +
        `Data saved to Analysis Data textarea below.`);

    //resultAlter = mainAlterColorAnaly(candleData) ;
    //document.getElementById("historyList").innerHTML = JSON.stringify(resultAlter);;


    return analysisArray;
}



function clearAllMarkers() {

    candleSeries.setMarkers([]);



} // end func

// Copy Analysis Data to clipboard
function copyAnalysisData() {
    const textarea = document.getElementById('analysisDataTxt');
    if (!textarea.value) {
        alert('ไม่มีข้อมูล Analysis ให้คัดลอก! กรุณากด Generate Analysis ก่อน');
        return;
    }
    navigator.clipboard.writeText(textarea.value).then(() => {
        alert('✅ คัดลอกข้อมูลเรียบร้อยแล้ว!');
    }).catch(err => {
        // Fallback for older browsers
        textarea.select();
        document.execCommand('copy');
        alert('✅ คัดลอกข้อมูลเรียบร้อยแล้ว!');
    });
}

// Download Analysis Data as JSON file
function downloadAnalysisData() {
    const textarea = document.getElementById('analysisDataTxt');
    if (!textarea.value) {
        alert('ไม่มีข้อมูล Analysis ให้ดาวน์โหลด! กรุณากด Generate Analysis ก่อน');
        return;
    }

    const symbol = document.getElementById('symbolSelect').value;
    const timeframe = document.getElementById('timeframeSelect').value;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `analysis_${symbol}_${timeframe}s_${timestamp}.json`;

    const blob = new Blob([textarea.value], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    alert(`✅ ดาวน์โหลดไฟล์ ${filename} เรียบร้อยแล้ว!`);
}

function CreateTradeBackTest() {
    //analysisArray

    let newData = analysisArray.map(item => ({
        ...item,
        emaConflict: (item.emaAbove === 'ShortAbove' && item.color === 'Red') ||
            (item.emaAbove === 'MediumAbove' && item.color === 'Green') ? 'y' : 'n',
        suggestAction: item.emaAbove === 'ShortAbove' ? 'CALL' : 'PUT',
        suggestColor: item.emaAbove === 'ShortAbove' ? 'Green' : 'Red'
    }));

    for (let i = 0; i <= newData.length - 1; i++) {
        if (newData[i].emaConflict === 'y') {
            newData[i].suggestAction = 'Idle';
            newData[i].suggestColor = 'Idle';
            newData[i].winStatus = '';
        }
    }


    for (let i = 0; i <= newData.length - 1; i++) {
        if (newData[i].suggestAction !== 'Idle') {
            if (newData[i].suggestColor === newData[i].nextColor) {
                newData[i].winStatus = 'Win';
            } else {
                newData[i].winStatus = 'Loss';
            }
        }
    }

    const result2 = newData.filter(object => object.suggestAction === "Idle");
    alert(result2.length);


    //document.getElementById("analysisDataTxt").value = JSON.stringify(newData);;




    document.getElementById("analysisDataTxt").value = JSON.stringify(newData, null, 2);
    analysisArray = newData;



    const result = analysisArray.filter(object => object.winStatus === 'Loss');
    const resultWin = analysisArray.filter(object => object.winStatus === 'Win');
    const resultIdle = analysisArray.filter(object => object.suggestColor === 'Idle');
    alert(result.length + '-' + resultWin.length + '-' + resultIdle.length);
    winStatusMarker = [];

    for (let i = 0; i <= result.length - 1; i++) {
        sObj = {
            time: result[i].candletime,
            position: 'aboveBar',
            color: '#ff0000',
            shape: 'arrowDown',
            text: 'l' + i
        }
        winStatusMarker.push(sObj);
    }
    candleSeries.setMarkers(winStatusMarker);






    //const result = analysisArray.filter(object => object.suggestColor === object.nextColor);
    //alert(result.length);



} // end func

function MarkByCase() {

    if (analysisArray.length === 0) {
        alert('กรุณาสร้างข้อมูล Analysis ก่อน');
        return;
    }

    candleSeries.setMarkers([]);

    markTypeCase = document.getElementById("markTypeCase").value;
    flatThereHold = parseFloat(document.getElementById("flatThereshold").value);
    macdThereshold = parseFloat(document.getElementById("macdThereshold").value);
    let result = [];


    //alert(analysisArray.length)
    shape = 'circle';
    if (markTypeCase === 'case1') {
        result = analysisArray.filter(object => object.emaMediumDirection === "Flat");
    }

    if (markTypeCase === 'case2') {
        //alert(macdThereshold);
        result = analysisArray.filter(object => parseFloat(object.macd12) < macdThereshold);
        alert(result.length);
    }

    if (markTypeCase === 'case4') {
        //alert(macdThereshold);
        result = analysisArray.filter(object => parseFloat(object.macd23) < macdThereshold);
        //alert(result.length) ;
    }

    if (markTypeCase === 'case7') {
        //alert(macdThereshold);
        result = analysisArray.filter(object => object.emaCutLongType !== null);
        shape = 'arrowUp';
        alert(result.length);
    }

    if (markTypeCase === 'case8') {
        //alert(macdThereshold);
        result = analysisArray.filter(object => object.emaLongDirection === 'Flat');
        alert(result.length);
    }
    if (markTypeCase === 'case9') {
        //alert(macdThereshold);
        result = analysisArray.filter(object => object.statusCode === 'UU');
        alert(result.length);
    }
    if (markTypeCase === 'case92') {
        //alert(macdThereshold);
        result = analysisArray.filter(object => object.statusCode === 'DD');
        alert(result.length);
    }
    if (markTypeCase === 'case10') {
        //alert(macdThereshold);
        result = analysisArray.filter(object => object.statusCode === 'UF');
        alert(result.length);
    }
    if (markTypeCase === 'case11') {
        result = analysisArray.filter(object => object.statusCode === 'DF');
        alert(markTypeCase + ' - ' + result.length);
    }
    if (markTypeCase === 'case12') {
        result = analysisArray.filter(object => object.statusCode === 'FU');
        alert(result.length);
    }
    if (markTypeCase === 'case13') {
        result = analysisArray.filter(object => object.statusCode === 'FF');
        alert(result.length);
    }

    if (markTypeCase === 'case14') {
        result = analysisArray.filter(object => parseFloat(object.macd23) < 0.1);
        alert(result.length);
    }







    nMarker = [];
    for (let i = 0; i <= result.length - 1; i++) {
        marker = {
            time: result[i].candletime,
            position: 'aboveBar',
            color: '#f68410',
            shape: shape,
            text: i
        }
        nMarker.push(marker);
    }


    candleSeries.setMarkers(nMarker);



} // end func

function MarkByCandleCode() {


    statusCandleCode = JSON.parse(document.getElementById("CodeCandle").value);

    if (statusCandleCode.length === 0) {
        alert('กรุณาสร้างข้อมูล Analysis ก่อน');
        return;
    }

    sCodeToMark = parseInt(document.getElementById("CodeToSearch").value);
    sCodeToMark2 = document.getElementById("CodeToSearch").value;

    //const index = statusCandleCode.findIndex(c => c.StatusCode === sCodeToMark);
    //if (index < 0) {
    //alert('Not Found');
    //return ;
    //}

    // statusDesc = statusCandleCode[index].StatusCode ;

    //alert(statusCandleCode.length);
    //console.clear
    //console.log(statusCandleCode[40]);


    candleSeries.setMarkers([]);


    //alert(sCodeToMark);
    markerList = document.getElementById("CodeToSearch").value;
    if (document.getElementById("CodeToSearchGreen").value !== '') {
        sGreen = document.getElementById("CodeToSearchGreen").value;
        markerList = markerList + ',' + sGreen.trim();
    }
    // alert(markerList)  ;


    markerListAr = markerList.split(',');

    let result = [];
    if (document.getElementById("CodeToSearch").value != '') {
        result = analysisArray.filter(object => markerListAr.indexOf(object.StatusCode) !== -1);
        document.getElementById("labResultA").innerHTML = ' จำนวนแท่งที่พบ = ' + result.length;
        for (let i2 = 0; i2 <= result.length - 1; i2++) {
            index = analysisArray.findIndex(c => c.candletime === result[i2].candletime);
            if (index > 0) {
                analysisArray[index].isMark = 'y';
            }
        }


        document.getElementById("analysisDataTxt").value = JSON.stringify(analysisArray, null, 2);


        resultA = analysisArray.filter(object => object.isMark === "y");
        //alert('จำนวน Mark = '+ resultA.length) ;

        //console.log('Result',result)
    } else {
        result = analysisArray;
    }



    /*
    sCodeToMark2 = 8 ;
    if (document.getElementById("CodeToSearch").value != '') {
      result = analysisArray.filter(object => object.StatusCode === sCodeToMark2  );
      console.log('Result',result)
    } else {
      result = analysisArray ;
    }
    */









    nMarker = [];
    shape = '';
    shape = 'arrowDown';
    for (let i = 0; i <= result.length - 1; i++) {
        marker = {
            time: result[i].candletime,
            position: 'aboveBar',
            color: '#ffff00',
            shape: shape,
            text: result[i].StatusCode
        }
        nMarker.push(marker);
    }


    candleSeries.setMarkers(nMarker);



} // end func

function EvaluateMarket() {

    return;
    //alert(analysisArray.length);
    //console.log(analysisArray[10])
    //emaLongAbove ->"MediumAbove","LongAbove"
    // Step 1  คือ ดูแค่ ว่า อะไร Above
    // Step 2  คือ ดูแค่ ว่า อะไร Above แล้ว สอดคล้อง กับ Direction ของ แต่ะเส้น ไหม
    //   2.1 (MU)MediumAbove และ  MediumDirection = Up  และ
    //		(MD)  MediumAbove และ  MediumDirection = Down และ
    /*
    
    emaMediumAbove,emaLongAbove,
    emaMediumDirection,emaLongDirection
    
    RuleEMA Structure (Relative)emaMediumDirectionemaLongDirectionMarket Sentiment / Action1Medium > Long (Golden Cross)UpUpStrong Bullish: แนวโน้มขาขึ้นแข็งแกร่ง (Follow Trend)2Medium > Long (Golden Cross)DownUpBullish Retracement: พักตัวในขาขึ้น (หาจังหวะ Buy on Dip)3Medium > Long (Golden Cross)DownDownTrend Weakening: ขาขึ้นเริ่มหมดแรง หรืออาจเกิดการกลับตัว4Medium < Long (Death Cross)DownDownStrong Bearish: แนวโน้มขาลงแข็งแกร่ง (Short/Stay Out)5Medium < Long (Death Cross)UpDownBearish Recovery: รีบาวน์ในขาลง (ยังไม่ยืนยันการกลับตัว)6Medium < Long (Death Cross)UpUpTrend Changing: กำลังสะสมพลังเพื่อเปลี่ยนเป็นขาขึ้น
    */

    // Step 3  คือ ดูแค่ ว่า อะไร Above แล้ว สอดคล้อง กับ Direction ของ แต่ะเส้น ไหม



    /*


     distrinctCodeAr = [] ;
     for (let i=0;i<=analysisArray.length-1 ;i++ ) {
         MDirection =  analysisArray[i].emaMediumDirection ;
         LDirection =  analysisArray[i].emaLongDirection ;
         ConverType = analysisArray[i].emaLongDirection ;
         MDirection = MDirection.substr(0,1) ;
         LDirection = LDirection.substr(0,1) ;
         color = analysisArray[i].color;
         emaLongAbove = analysisArray[i].emaLongAbove ;
         if (emaLongAbove ==='MediumAbove') {
            //suggestColor = '<span style="color:#00ff00">🟢</span>';
            suggestColor = '🟢';
            suggestColor = '';
         }
         if (emaLongAbove ==='LongAbove') {
            //suggestColor = '<span style="color:red">🔴</span>';
            suggestColor = '🔴';
            suggestColor = '';
         }

         if (emaLongAbove ==='LongAbove') {
            //suggestColor = '<span style="color:red">🔴</span>';
            LongMACDConver = analysisArray[i].emaLongConvergenceType ;
            LongMACDConver = LongMACDConver.substr(0,1);

         }



         //thisStatusCode = emaLongAbove.substr(0,1)+'-'+ suggestColor+ '-'+MDirection+LDirection +'-'+ color.substr(0,1);
         thisStatusDesc = emaLongAbove.substr(0,1)+ '-'+  MDirection+LDirection +'-'+ color.substr(0,1)+'-'+ LongMACDConver;

         analysisArray[i].StatusDesc = thisStatusDesc ; //emaLongAbove.substr(0,1)+''+ suggestColor+'' + '-'+MDirection+LDirection +'-'+ color.substr(0,1);
         found = false;

         for (let i2=0;i2<=distrinctCodeAr.length-1 ;i2++ ) {
             if (distrinctCodeAr[i2].StatusDesc === thisStatusDesc) {
                analysisArray[i].StatusCode  =distrinctCodeAr[i2].StatusCode ;
                found = true; break;
             } else {
                found = false;
             }
         }
         if (found === false) {
             sObj = {
               StatusCode : distrinctCodeAr.length+1 ,
               StatusDesc : thisStatusDesc
             }
             distrinctCodeAr.push(sObj);
         }

     } // end for
     //console.log('distrinctAr',distrinctCodeAr)

     if (document.getElementById("createNewStatusCandleCode").checked) {
         document.getElementById("CodeCandle").value = JSON.stringify(distrinctCodeAr,null,2);
         statusCandleCode = distrinctCodeAr ;
         Mode = 'saveCandleCode';
         doAjaxPostCandleCode(Mode,distrinctCodeAr);
     }



 document.getElementById("evalResult").innerHTML = st;
 $("#btnEval").addClass('btnSelected');

*/

    distrinctCodeAr = JSON.parse(document.getElementById("CodeCandle").value);
    for (let i = 0; i <= analysisArray.length - 1; i++) {
        thisStatusDesc = analysisArray[i].StatusDesc0;
        const index = distrinctCodeAr.findIndex(c => c.StatusDesc === thisStatusDesc);
        if (index >= 0) {
            analysisArray[i].StatusCode = distrinctCodeAr[index].StatusCode;
        }
    }




    document.getElementById("analysisDataTxt").value = JSON.stringify(analysisArray, null, 2);



    console.log(analysisArray[40])

} // end func

async function doAjaxPostCandleCode(Mode, candleCodeList) {
    //'saveCandleCode'
    let result;
    let ajaxurl = 'AjaxCandleCodeData.php';
    let data = {
        "Mode": Mode,
        "candleCodeList": candleCodeList
    };
    data2 = JSON.stringify(data);

    try {
        result = await $.ajax({
            url: ajaxurl,
            type: 'POST',
            dataType: "json",
            data: data2,
            success: function (data, textStatus, jqXHR) {
                console.log(textStatus + ": " + jqXHR.status);
                // do something with data
            },
            error: function (jqXHR, textStatus, errorThrown) {
                alert(textStatus + ": " + jqXHR.status + " " + errorThrown);
                console.log(textStatus + ": " + jqXHR.status + " " + errorThrown);
            }
        });
        //alert(result);
        //document.getElementById("mainBoxAsset").innerHTML = result ;
        if (Mode === 'getCandleCode') {
            document.getElementById("CodeCandleDB").value = JSON.stringify(result);
            alert(result);
            statusCandleCode = result;
        }


        return result;
    } catch (error) {
        console.error(error);
    }
}


async function doAjaxRetrieveCandleCode(Mode, candleCodeList) {
    //'saveCandleCode'
    let result;
    let ajaxurl = 'AjaxCandleCodeData.php';
    let data = {
        "Mode": Mode,
        "candleCodeList": candleCodeList
    };
    data2 = JSON.stringify(data);

    try {
        result = await $.ajax({
            url: ajaxurl,
            type: 'POST',
            dataType: "json",
            data: data2,
            success: function (data, textStatus, jqXHR) {
                console.log(textStatus + ": " + jqXHR.status);
                // do something with data
            },
            error: function (jqXHR, textStatus, errorThrown) {
                alert(textStatus + ": " + jqXHR.status + " " + errorThrown);
                console.log(textStatus + ": " + jqXHR.status + " " + errorThrown);
            }
        });
        //alert(result);
        //document.getElementById("mainBoxAsset").innerHTML = result ;
        if (Mode === 'getCandleCode') {
            document.getElementById("CodeCandleDB").value = JSON.stringify(result);
            alert(JSON.stringify(result));
            statusCandleCode = result;
        }


        return result;
    } catch (error) {
        console.error(error);
    }
}



document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    document.getElementById('connectBtn').onclick = connectToDeriv;
    document.getElementById('loadDataBtn').onclick = loadCandleData;
    document.getElementById('previousIndex').onclick = () => { let i = document.getElementById('currentIndex'); i.value = Math.max(0, parseInt(i.value) - 1); processDataByIndex(); };
    document.getElementById('nextIndex').onclick = () => { let i = document.getElementById('currentIndex'); i.value = parseInt(i.value) + 1; processDataByIndex(); };

    document.getElementById('updateBtn').onclick = calculateAllIndicators;

    // Auto-update on checkbox toggle
    ['ma1Enabled', 'ma2Enabled', 'ma3Enabled'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', calculateAllIndicators);
    });
    Mode = 'getCandleCode';
    candleCodeList = '';
    document.getElementById("analysisDataTxt").value = '';
    UpdateCandleStatus();
    //doAjaxRetrieveCodeCandle ();
    //doAjaxPostCandleCode(Mode,candleCodeList);



});

// ============================================================
// Background Color Zones Functions (Lightweight Charts v4 Feature)
// ============================================================

/**
 * Toggle Background Color Zones based on analysis data
 * Call this function after generateAnalysisData() to show market condition zones
 */
function toggleBackgroundZones() {
    if (!mainChart || !candleSeries) {
        console.warn('Chart not initialized');
        return;
    }

    // Remove existing plugin if any
    if (bgZonesPlugin) {
        try {
            candleSeries.detachPrimitive(bgZonesPlugin);
        } catch (e) {
            console.log('No existing plugin to detach');
        }
        bgZonesPlugin = null;
        console.log('📊 Background zones cleared');
        return;
    }

    // Check if analysisArray exists
    if (!analysisArray || analysisArray.length === 0) {
        alert('กรุณา Generate Analysis Data ก่อน!');
        return;
    }

    // Create zones from analysis data
    const zones = createZonesFromAnalysis(analysisArray, {
        trendUpColor: 'rgba(56, 239, 125, 0.15)',
        trendDownColor: 'rgba(244, 92, 67, 0.15)',
        sidewaysColor: 'rgba(102, 126, 234, 0.1)',
        showLabels: false,
        ciThreshold: parseFloat(document.getElementById('ciThreshold')?.value) || 61.8
    });

    // Create and attach plugin
    bgZonesPlugin = new BackgroundColorZonesPlugin(zones);
    candleSeries.attachPrimitive(bgZonesPlugin);
    console.log('📊 Background zones enabled:', zones.length, 'zones');
}

/**
 * Show Choppy/Sideways zones only
 */
function showChoppyZones() {
    if (!mainChart || !candleSeries) {
        console.warn('Chart not initialized');
        return;
    }

    // Remove existing plugin
    if (bgZonesPlugin) {
        try {
            candleSeries.detachPrimitive(bgZonesPlugin);
        } catch (e) { }
    }

    if (!analysisArray || analysisArray.length === 0) {
        alert('กรุณา Generate Analysis Data ก่อน!');
        return;
    }

    const ciThreshold = parseFloat(document.getElementById('ciThreshold')?.value) || 61.8;
    const zones = createChoppyZones(analysisArray, ciThreshold);

    bgZonesPlugin = new BackgroundColorZonesPlugin(zones);
    candleSeries.attachPrimitive(bgZonesPlugin);
    console.log('📊 Choppy zones enabled:', zones.length, 'zones');
}

/**
 * Show EMA Crossover zones
 */
function showCrossoverZones() {
    if (!mainChart || !candleSeries) {
        console.warn('Chart not initialized');
        return;
    }

    // Remove existing plugin
    if (bgZonesPlugin) {
        try {
            candleSeries.detachPrimitive(bgZonesPlugin);
        } catch (e) { }
    }

    if (!analysisArray || analysisArray.length === 0) {
        alert('กรุณา Generate Analysis Data ก่อน!');
        return;
    }

    const zones = createCrossoverZones(analysisArray);

    bgZonesPlugin = new BackgroundColorZonesPlugin(zones);
    candleSeries.attachPrimitive(bgZonesPlugin);
    console.log('📊 Crossover zones enabled:', zones.length, 'zones');
}

/**
 * Clear all background zones
 */
function clearBackgroundZones() {
    if (bgZonesPlugin && candleSeries) {
        try {
            candleSeries.detachPrimitive(bgZonesPlugin);
        } catch (e) { }
        bgZonesPlugin = null;
        console.log('📊 Background zones cleared');
    }
}

/**
 * Add custom zone manually
 * @param {number} startTime - Unix timestamp
 * @param {number} endTime - Unix timestamp 
 * @param {string} color - rgba color string
 * @param {string} label - Optional label text
 */
function addCustomZone(startTime, endTime, color, label) {
    if (!bgZonesPlugin) {
        bgZonesPlugin = new BackgroundColorZonesPlugin([]);
        candleSeries.attachPrimitive(bgZonesPlugin);
    }

    bgZonesPlugin.addZone({
        startTime: startTime,
        endTime: endTime,
        color: color || 'rgba(100, 100, 255, 0.2)',
        label: label
    });
    console.log('📊 Custom zone added');
}
