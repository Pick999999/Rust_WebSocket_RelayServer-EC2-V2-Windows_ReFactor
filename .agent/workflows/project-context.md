---
description: อ่านบริบทโปรเจคก่อนเริ่มทำงาน - ให้ Claude เข้าใจโปรเจคทันที
---

# 📋 Project Context Workflow

**ใช้ workflow นี้เมื่อ:** เริ่ม session ใหม่และต้องการทำงานต่อจาก Version ก่อนหน้า

## ขั้นตอน

1. อ่านไฟล์ `PROJECT_CONTEXT.md` ที่ root ของโปรเจค
   ```
   view_file d:\Rust\RustAndSocket\Rust_WebSocket_RelayServer-EC2-V2-Windows\PROJECT_CONTEXT.md
   ```

2. ไฟล์นี้จะมีข้อมูล:
   - Version ปัจจุบัน และ changelog
   - โครงสร้างไฟล์สำคัญ
   - Features ที่มีอยู่แล้ว
   - สถานะ TODO และแผนงานถัดไป
   - Dependencies สำคัญ

3. หลังจากอ่านแล้ว ให้ยืนยันกับ user ว่าเข้าใจบริบทแล้ว และพร้อมทำงานต่อ

---

## หมายเหตุ
- หลังจากสร้าง Feature ใหม่สำเร็จ **ต้องอัพเดต** `PROJECT_CONTEXT.md` ทุกครั้ง
- เพิ่ม Version number และ changelog
- ระบุ Features ใหม่ที่เพิ่มเข้าไป
