# รายงานตรวจสอบปัญหา Frontend (Static Scan)
วันที่ตรวจสอบ: 2025-01-17  
ขอบเขต: `views/**/*.ejs`, `public/js/**/*.js`, `public/css/**/*.css`  
หมายเหตุ: ตรวจด้วยการอ่านโค้ดทั้งหมดแบบ static ไม่ได้รันระบบจริง

## Critical
- ไม่พบประเด็นระดับ Critical จาก static scan

## Major
- M-001 ระบบ Preview ในหน้า Broadcast ไม่ทำงาน: ปุ่ม `ดูตัวอย่าง` และการ์ด preview ไม่มี handler/การอัปเดตสถานะ ทำให้ UI แสดงผลค้างตลอด; หลักฐาน `views/admin-broadcast.ejs:45`, `views/admin-broadcast.ejs:229`, `views/admin-broadcast.ejs:243`, `public/js/admin-broadcast.js`.
- M-002 พิมพ์ใบปะหน้าในหน้า Orders ใช้งานไม่ได้: ปุ่มพิมพ์ผูก event แต่ไม่มีทางเข้าถึง `detailOrderId`; หลักฐาน `views/admin-orders.ejs:179`, `views/admin-orders.ejs:203`, `public/js/admin-orders-v2.js:27`.
- M-003 หัวตาราง Orders แสดงไอคอน Sort แต่ไม่มีการจัดลำดับจริง: มี state `sort` และ markup `sortable` แต่ไม่มี event/logic ใช้งาน; หลักฐาน `views/admin-orders.ejs:96`, `public/js/admin-orders-v2.js:24`.
- M-004 Template Modal ในหน้าแชทยังไม่ถูก implement: ปุ่ม Templates เรียกฟังก์ชันที่เป็น TODO และไม่เปิด modal/โหลดข้อมูล; หลักฐาน `views/admin-chat.ejs:274`, `views/admin-chat.ejs:392`, `public/js/chat-redesign.js:391`, `public/js/chat-redesign.js:1890`.
- M-005 V2 Table Editor ไม่มีการเตือนก่อนออกจากหน้า: ผู้ใช้กด “ยกเลิก/Back” แล้วข้อมูลที่ยังไม่บันทึกจะหายทันที เพราะไม่มี `beforeunload`/dirty guard; หลักฐาน `views/edit-data-item-v2.ejs:747`, `views/edit-data-item-v2.ejs`.
- M-006 เสี่ยง XSS ในหน้า Dashboard (Import Preview): นำ `p.name`/`p.description` ไป render ด้วย `innerHTML` โดยไม่ escape; หลักฐาน `public/js/admin-dashboard-v2.js:850`.
- M-007 เสี่ยง XSS ในรายละเอียด Orders: ฟิลด์โทรศัพท์/อีเมล/ไปรษณีย์/การชำระ/เพจ ใส่ลง DOM โดยไม่ escape; หลักฐาน `public/js/admin-orders-v2.js:624`, `public/js/admin-orders-v2.js:683`.

## Minor
- m-001 ปุ่มทดสอบ API Key ใน modal ยังทดสอบ “คีย์ใหม่” ไม่ได้ (แสดงข้อความให้บันทึกก่อนเท่านั้น); หลักฐาน `views/partials/modals/api-key-modal.ejs:49`, `public/js/admin-settings-v2.js:1779`.
- m-002 ปุ่ม Emoji ในหน้าแชทไม่มี handler; คลิกแล้วไม่เกิดผลใด ๆ; หลักฐาน `views/admin-chat.ejs:281`, `public/js/chat-redesign.js`.
