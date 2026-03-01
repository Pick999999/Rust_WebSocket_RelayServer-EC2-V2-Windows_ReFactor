# โครงสร้างข้อมูล Proposal ของ Deriv API

เมื่อส่ง request ขอ `proposal` (เช่น สำหรับ Accumulator) Deriv จะตอบกลับมาด้วย JSON Object ที่มีฟิลด์สำคัญดังนี้:

## 1. ฟิลด์หลัก (Root Level)

| Field Name | Type | Description (คำอธิบาย) |
| :--- | :--- | :--- |
| `echo_req` | Object | ข้อมูล request เดิมที่เราส่งไป (ใช้สำหรับตรวจสอบว่าตอบกลับ request ไหน) |
| `msg_type` | String | ประเภทข้อความตอบกลับ จะเป็น `"proposal"` เสมอ |
| `proposal` | Object | **[สำคัญ]** ข้อมูลรายละเอียดของสัญญาที่เสนอราคามา (ดูรายละเอียดด้านล่าง) |
| `req_id` | Integer | ID ของ request ที่เราส่งไป (ถ้าใส่ไปใน request) |
| `subscription` | Object | ข้อมูล Subscription (ถ้าขอแบบ subscribe) มี `id` สำหรับใช้ในการ `forget` |

---

## 2. รายละเอียดใน `proposal` Object

นี่คือส่วนที่สำคัญที่สุดที่ต้องใช้ในการตัดสินใจเทรด:

| Field Name | Type | Description (คำอธิบาย) |
| :--- | :--- | :--- |
| `ask_price` | String | **ราคาซื้อ** (Price) ที่เราต้องจ่ายเพื่อเปิดสัญญานี้ (เท่ากับ Stake ที่เราตั้ง) |
| `date_start` | Integer | เวลาเริ่มสัญญา (Unix Timestamp) |
| `display_value` | String | มูลค่าที่จะแสดงบนหน้าเว็บ (มักเท่ากับ `ask_price`) |
| `id` | String | **Proposal ID** ใช้สำหรับส่งคำสั่ง `buy` |
| `longcode` | String | คำอธิบายสัญญาแบบยาว เช่น "Win payout if the index price..." |
| `payout` | Float | ผลตอบแทนที่จะได้รับ (Payout) |
| `spot` | Float | **ราคาสินทรัพย์ปัจจุบัน** (Spot Price) ณ เวลาที่ขอ Proposal |
| `spot_time` | Integer | เวลาของราคา Spot (Unix Timestamp) |
| `contract_details` | Object | **[สำคัญมากสำหรับ ACCU]** รายละเอียดเพิ่มเติมของสัญญา (ดูด้านล่าง) |
| `high_barrier` | String | *[บางสัญญา]* ราคา Barrier บน (อาจอยู่ใน `contract_details`) |
| `low_barrier` | String | *[บางสัญญา]* ราคา Barrier ล่าง (อาจอยู่ใน `contract_details`) |
| `barrier` | String | *[บางสัญญา]* ราคา Barrier เดียว (สำหรับสัญญาที่ไม่ใช่ ACCU) |

---

## 3. รายละเอียดใน `contract_details` (สำหรับ Accumulator)

สำหรับสัญญาประเภท Accumulator (`ACCU`) ข้อมูล Barrier จะซ่อนอยู่ในนี้:

| Field Name | Type | Description (คำอธิบาย) |
| :--- | :--- | :--- |
| `high_barrier` | String | **ราคา Barrier บน** ถ้าราคา index ชนหรือทะลุราคานี้ สัญญาจะแพ้ (Knock-out) |
| `low_barrier` | String | **ราคา Barrier ล่าง** ถ้าราคา index ชนหรือทะลุราคานี้ สัญญาจะแพ้ (Knock-out) |
| `barrier_spot_distance` | String | **ระยะห่าง** ระหว่าง Barrier กับ Spot ปัจจุบัน (Gap) |
| `growth_rate` | String | อัตราการเติบโตของกำไรต่อ tick (เช่น 0.03) |
| `tick_size_barrier` | Float | ขนาดของ Barrier ที่จะขยับตาม Spot |
| `maximum_payout` | Float | การจ่ายเงินสูงสุดที่เป็นไปได้ |
| `maximum_ticks` | Integer | จำนวน Tick สูงสุดก่อนสัญญาจะจบอัตโนมัติ |

---

## ตัวอย่าง JSON Response (Accumulator)

```json
{
  "echo_req": { ... },
  "msg_type": "proposal",
  "proposal": {
    "ask_price": "10.00",
    "date_start": 1707901234,
    "display_value": "10.00",
    "id": "c1626002-3112-9828-5678-0123456789ab",
    "longcode": "Win payout if the index price does not touch 1234.56 or 1230.00...",
    "payout": 10.00,
    "spot": 1232.45,
    "spot_time": 1707901234,
    "contract_details": {
      "high_barrier": "1234.56",
      "low_barrier": "1230.00",
      "barrier_spot_distance": "2.11",
      "growth_rate": "0.03",
      "maximum_ticks": 250,
      ...
    }
  },
  "subscription": {
    "id": "b3f94341-..."
  }
}
```
