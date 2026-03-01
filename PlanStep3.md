สร้าง  html page เพื่อเชื่อมโยง กับ project  มี field ตามนี้ 

 1. textarea ไว้เก็บข้อมูล asset + callSignal + putSignal 


 2. กราฟ lightweightChart 4.2.1 
 3. เชื่อมต่อกับ  rust ผ่าน websocket เพื่อรับ ข้อมูลจาก rust มาปรับเปลี่ยน Input หรือ  variable ใน html
 4. ใช้ lib.rs จาก RustLib/indicator_math เพื่อ ทำการ ดึงข้อมูล analysisObject ของแต่ละ asset 
 เมื่อถึง วินาที ที่ 0 ของทุกๆ นาที 
 5. เมื่อได้ analysisObject ให้เอา StatusCode ของ analysisObject ของแต่ละ asset ออกมา ค้นใน 
 textarea ว่า จะใช้ สัญญาณ Call,Put,Idle ของ asset นั้น
 6. เมื่อได้สัญญาณ มาให้ทำการเข้าเทรด Call,Put แบบ Rise/Fall ของ Deriv.com
 7. จำนวนเงิน ในการ เข้าเทรด มีทั้ง แบบ Fix,Martingale
 8. Duration มี 2 Plan 
     -Short--> duration = 55 ; duratuinUnit = 'seconds' 
     -Long-->  duration = 15,30,60, ; durationUnit = 'Minute' 
 9.เงื่อนไขการหยุดเทรด มี 2 แบบ 1. จำนวนเงินตามเป้า  2.กำหนดเวลาหยุด
 10.บันทึกข้อมูลการเทรดได้ 
 11.ให้ทำการเทรด ได้ ต่อเนื่อง จนครบเงื่อนไขการหยุดเทรด  แม้ ปิด Browser ไปแล้ว 
 12.Rust จะต้องมี websocket เพื่อ รับ ข้อมูล จาก page อีกอัน ที่อยู่คนละ Host 

