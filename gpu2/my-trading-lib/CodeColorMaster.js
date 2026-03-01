async function doAjaxRetrieveCodeCandle() {

    const ajaxurl = 'https://lovetoshopmall.com/SaveColorCodeMaster.php';
    const data = {
        "Mode": 'getCandleMaster',
        "timestamp": new Date().toISOString(),
        "asset": "",
    };


    try {
        // วิธีที่ 1: ใช้ jQuery Ajax (แก้ไขแล้ว)
        const result = await $.ajax({
            url: ajaxurl,
            type: 'POST',
            contentType: 'application/json',  // เพิ่มบรรทัดนี้
            dataType: 'json',
            data: JSON.stringify(data),
            success: function (response, textStatus, jqXHR) {
                console.log('Success:', textStatus + ' - Status: ' + jqXHR.status);
                console.log('Response:', response);
                console.log('📊 NumRec:', response.NumRec);
                console.log('📊 DataResult:', response.DataResult);
                console.log('📊 DataResult length:', response.DataResult ? response.DataResult.length : 0);

                if (response.NumRec === 0) {
                    st = ' 💔💔 ' + response.asset + ' ยังไม่มี ข้อมูล CodeCandle-Master';
                    console.warn('⚠️ No CodeCandle Master data found!');
                    document.getElementById("CodeCandle").value = '';
                } else {
                    const jsonData = JSON.stringify(response.DataResult, null, 2);
                    document.getElementById("CodeCandle").value = jsonData;
                    console.log('✅ CodeCandle textarea updated, length:', jsonData.length);

                    // Debug: Show first record structure
                    if (response.DataResult && response.DataResult.length > 0) {
                        console.log('🔍 First record keys:', Object.keys(response.DataResult[0]));
                        console.log('🔍 First record:', response.DataResult[0]);
                    }

                    st = response.asset + ' มี ข้อมูล CodeCandle-Master จำนวน ' + response.NumRec;
                    document.getElementById("CodeCandleInfo").innerHTML = st;
                }
            },
            error: function (jqXHR, textStatus, errorThrown) {
                console.error('Error:', textStatus + ' - Status: ' + jqXHR.status + ' - ' + errorThrown);
                console.error('Response Text:', jqXHR.responseText);
            }
        });

        console.log('Final Result:', result);
        return result;

    } catch (error) {
        console.error('Catch Error:', error);
        resultDiv.textContent = 'Catch Error: ' + error.message;
        alert('Error: ' + error.message);
    }
}
