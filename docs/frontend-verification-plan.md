# Frontend Fix Verification Plan (Dashboard + Instruction Editors)

เอกสารนี้เป็น “แผน/Checklist สำหรับตรวจสอบว่าแพตช์ที่แก้ไขแล้วใช้งานได้จริงและไม่สร้างปัญหาใหม่” ใช้ควบคู่กับรายงานการตรวจโค้ดที่ `docs/frontend-audit-dashboard-instructions.md`

> วิธีใช้: ทำการตรวจเป็น “รอบ” (Round) แล้วกรอกผลในตารางแต่ละหัวข้อ (PASS/FAIL/N/A) พร้อมคอมเมนต์/หลักฐาน

---

## 0) ข้อมูลรอบการตรวจ (Round Log)

| Round | วันที่ | ผู้ตรวจ | สภาพแวดล้อม (dev/staging/prod) | Browser/OS | Commit/Tag | ผลรวม | คอมเมนต์รวม |
|---|---|---|---|---|---|---|---|
| R-__ | ____-__-__ | __________ | __________ | __________ | __________ | PASS / FAIL | |

---

## 1) Pre-flight (ทำทุกครั้งก่อนเริ่มตรวจ)

| ID | รายการตรวจ | ขั้นตอน | ผลที่คาดหวัง | สถานะ | คอมเมนต์/หลักฐาน |
|---|---|---|---|---|---|
| PF-01 | ล็อกอิน/สิทธิ์แอดมิน | เข้าหน้าแอดมินทุกหน้าหลัก | เข้าได้ปกติ/ไม่ redirect loop |  |  |
| PF-02 | Console errors | เปิด DevTools Console ระหว่างใช้งาน 5–10 นาที | ไม่มี JS error ใหม่ที่กระทบการใช้งาน |  |  |
| PF-03 | Network errors | เปิด DevTools Network (filter: Fetch/XHR) | API สำคัญไม่ 4xx/5xx โดยไม่ตั้งใจ |  |  |
| PF-04 | Cache/asset | Hard refresh / disable cache ชั่วคราว | ไฟล์ JS/CSS โหลดครบ ไม่มี 404 |  |  |
| PF-05 | XSS sanity string | เตรียมสตริงทดสอบเช่น `<img src=x onerror=alert(1)>`, `</script><script>alert(1)</script>` | UI แสดงเป็น “ข้อความ” ไม่ execute |  |  |

---

## 2) Dashboard Instructions V2 (`views/admin-dashboard-v2.ejs`, `public/js/admin-dashboard-v2.js`)

| ID | รายการตรวจ | ขั้นตอน | ผลที่คาดหวัง | สถานะ | คอมเมนต์/หลักฐาน |
|---|---|---|---|---|---|
| DB2-01 | สลับ Instruction เร็ว ๆ (race) | เลือก A→B→C รัว ๆ | editor แสดงข้อมูลของตัวล่าสุดเท่านั้น; loading ไม่เพี้ยน |  |  |
| DB2-02 | ช่องค้นหา Instruction | พิมพ์คำค้นในช่องค้นหา | dropdown filter ตามคำค้น; รายการที่เลือกอยู่ไม่ “หาย” |  |  |
| DB2-03 | Save inline แล้ว label ไม่หาย | แก้ชื่อ/คำอธิบาย แล้วกดบันทึก | label ใน dropdown ยังมี `[instructionId]` + เวลาอัปเดต; updatedAt ใน editor อัปเดต |  |  |
| DB2-04 | Preview modal | กด Preview หลายครั้งหลังแก้ไข | เปิดได้ทุกครั้ง; ข้อมูล preview ตรงกับ server |  |  |
| DB2-05 | Duplicate กันชื่อซ้ำ | กด Duplicate แล้วใส่ชื่อซ้ำกับที่มี | ระบบเตือน/ให้ใส่ใหม่; backend ไม่สร้างชื่อซ้ำ |  |  |
| DB2-06 | Reorder data items มีสถานะ | กดเลื่อนขึ้น/ลงหลายรายการ | ปุ่มมี spinner ระหว่างบันทึก; เรียงลำดับคงอยู่หลัง reload |  |  |
| DB2-07 | ลบ Instruction / Data item | ลองลบและยกเลิก | ถ้ายกเลิกต้องไม่ลบ; ถ้ายืนยันต้องลบและ UI สอดคล้อง |  |  |
| DB2-08 | Accessibility ขั้นต้น | Tab ไปที่ปุ่ม icon-only | screen reader/tooltip อ่านได้ (มี aria-label) |  |  |

---

## 3) Import/Export Modal (`public/js/import-export-manager.js`)

| ID | รายการตรวจ | ขั้นตอน | ผลที่คาดหวัง | สถานะ | คอมเมนต์/หลักฐาน |
|---|---|---|---|---|---|
| IE-01 | เปิด modal หลายครั้ง | เปิด/ปิด modal 5–10 รอบ | ไม่มี toast container ซ้ำ; UI ไม่ช้า/เพี้ยน |  |  |
| IE-02 | Import preview render ปลอดภัย | upload ไฟล์ที่มี sheetName/ชื่อ instruction มี `< > " ' &` | ตาราง mapping แสดงเป็น text; DOM ไม่แตก |  |  |
| IE-03 | Action เปลี่ยนแล้ว target/mode ถูกต้อง | สลับ create/update/ignore | ช่อง target เปลี่ยนตาม; mode enable เฉพาะ update |  |  |
| IE-04 | Token/ไฟล์หมดอายุ | จำลองไฟล์ temp ถูกลบ (ปล่อยทิ้ง/หรือให้ server cleanup) แล้วกด Import | แจ้งเตือนเป็น toast; reset กลับไปอัปโหลดใหม่ได้ |  |  |
| IE-05 | Export list | เปิดแท็บ Export | list โหลดครบ; “เลือกทั้งหมด/ยกเลิกเลือกทั้งหมด” ทำงาน |  |  |
| IE-06 | Export download | เลือกหลาย instruction แล้ว Export | ดาวน์โหลดสำเร็จ; เปิดใน Excel/Sheets ได้ |  |  |

---

## 4) Edit Data Item V2 (Text/Table) (`views/edit-data-item-v2.ejs`)

| ID | รายการตรวจ | ขั้นตอน | ผลที่คาดหวัง | สถานะ | คอมเมนต์/หลักฐาน |
|---|---|---|---|---|---|
| ED2-01 | Querystring toast ปลอดภัย | เปิดหน้าโดยใส่ `?error=<payload>` | แสดงเป็นข้อความ ไม่ execute |  |  |
| ED2-02 | Mobile/table width | ลองหน้าจอแคบ (responsive) | ตารางไม่ “บังคับ” กว้างเกิน; ใช้งานได้ |  |  |
| ED2-03 | Resize handles | ลากปรับขนาด row/col | ลากได้ง่ายขึ้น โดยเฉพาะบน touch |  |  |
| ED2-04 | Flyout ไม่หลุดจอ | เปิด flyout ใกล้ขอบจอ/เลื่อน scroll แล้วเปิด | flyout ถูก clamp ให้อยู่ใน viewport |  |  |
| ED2-05 | Undo/redo global | คลิกพื้นหลัง/หัวข้อ แล้วกด Ctrl/Cmd+Z/Y | undo/redo ทำงานเมื่อไม่อยู่ใน input/textarea อื่น |  |  |

---

## 5) Spreadsheet V3 Editor (`views/edit-data-item-v3.ejs`, backend export)

| ID | รายการตรวจ | ขั้นตอน | ผลที่คาดหวัง | สถานะ | คอมเมนต์/หลักฐาน |
|---|---|---|---|---|---|
| ED3-01 | โหลด editor ปกติ | เปิดหน้า V3 | ตารางแสดง; ไม่มี error console |  |  |
| ED3-02 | Retry เมื่อโหลด library ไม่สำเร็จ | ทดสอบแบบ offline/บล็อก CDN | แสดงข้อความผิดพลาด + ปุ่ม “ลองใหม่” |  |  |
| ED3-03 | Header parsing | ตั้งชื่อคอลัมน์ที่มี comma/ภาษาไทย | จำนวนคอลัมน์/ชื่อคอลัมน์ถูกต้องใน preview/export |  |  |
| ED3-04 | Ctrl/Cmd+S | แก้ไข แล้วกด Ctrl/Cmd+S | บันทึกทำงาน ไม่ทำให้ browser save page |  |  |
| ED3-05 | beforeunload | แก้ไขให้ dirty แล้วปิดแท็บ/เปลี่ยนหน้า | browser แสดง warning (unsaved changes) |  |  |
| ED3-06 | Export CSV | Export เป็น CSV | ไฟล์ดาวน์โหลดสำเร็จ; ข้อมูล/หัวตารางครบ |  |  |
| ED3-07 | Export XLSX “จริง” | Export เป็น XLSX | ดาวน์โหลด `.xlsx` เปิดใน Excel ไม่ขึ้น “ไฟล์เสียหาย” |  |  |
| ED3-08 | XLSX filename ภาษาไทย | ตั้งชื่อไฟล์ภาษาไทย | ชื่อไฟล์ที่ดาวน์โหลดถูกต้อง/ไม่เพี้ยน |  |  |
| ED3-09 | Backend export route | ดู Network: `POST /admin/instructions-v3/export-xlsx` | ตอบ `200` + content-type xlsx; ไม่ตอบ HTML error |  |  |

---

## 6) Categories / Category Data (`views/admin-categories.ejs`, `views/admin-category-data.ejs`)

| ID | รายการตรวจ | ขั้นตอน | ผลที่คาดหวัง | สถานะ | คอมเมนต์/หลักฐาน |
|---|---|---|---|---|---|
| CAT-01 | ข้อมูล special chars ปลอดภัย | ตั้งชื่อหมวด/คำอธิบาย/คอลัมน์มี `< > " ' &` | หน้าไม่แตก; แสดงเป็น text |  |  |
| CAT-02 | ลิงก์/เมนูไม่เด้งขึ้นบน | คลิก action ที่เคยเป็น `href="#"` | หน้าไม่ scroll-to-top โดยไม่ตั้งใจ |  |  |
| CAT-03 | แก้เซลล์แล้วมีสถานะ | แก้ค่าเซลล์ 3–5 เซลล์ | มีสถานะ saving/saved/error; error แล้ว rollback |  |  |
| CAT-04 | Delete row confirm | ลองลบแถว | มี dialog ยืนยัน; ยกเลิกแล้วไม่ลบ |  |  |

---

## 7) Admin API Usage (`views/admin-api-usage.ejs`, `public/js/admin-api-usage.js`)

| ID | รายการตรวจ | ขั้นตอน | ผลที่คาดหวัง | สถานะ | คอมเมนต์/หลักฐาน |
|---|---|---|---|---|---|
| APIU-01 | Summary cards ไม่ crash | เปิดหน้า/สลับ filter | ไม่มี error จาก `animateValue()`; ตัวเลขอัปเดตได้ |  |  |
| APIU-02 | Expand row | คลิกแถวเพื่อขยายรายละเอียด | ขยาย/ยุบได้; ไม่ error |  |  |

---

## 8) Orders V2 (`views/admin-orders.ejs`, `public/js/admin-orders-v2.js`)

| ID | รายการตรวจ | ขั้นตอน | ผลที่คาดหวัง | สถานะ | คอมเมนต์/หลักฐาน |
|---|---|---|---|---|---|
| ORD-01 | UI โหลด/ตารางทำงาน | เปิดหน้า orders | ตาราง/กรอง/แบ่งหน้าใช้ได้ |  |  |
| ORD-02 | Toast/Error ตอนบันทึก AI settings | เปิด modal ตั้งค่า AI แล้วบันทึก (ทั้ง success/fail) | แจ้งผลด้วย toast; ปุ่มกลับสภาพเดิม |  |  |
| ORD-03 | XSS sanity ใน field | ทดสอบค่า phone/note มี `<script>` ในข้อมูล | UI แสดงเป็น text ไม่ execute |  |  |

---

## 9) Broadcast (`views/admin-broadcast.ejs`, `public/js/admin-broadcast.js`)

| ID | รายการตรวจ | ขั้นตอน | ผลที่คาดหวัง | สถานะ | คอมเมนต์/หลักฐาน |
|---|---|---|---|---|---|
| BC-01 | เพิ่มข้อความ/รูป | เพิ่มข้อความ 1–5 รายการ + รูป | UI ไม่พัง; ข้อความคงอยู่ตามที่พิมพ์ |  |  |
| BC-02 | XSS ผ่านข้อความใน textarea | พิมพ์ payload เช่น `</textarea><script>...</script>` | ต้องไม่ execute; UI ต้องไม่แตก |  |  |
| BC-03 | Polling error handling | จำลอง status API fail | แจ้งเตือนด้วย toast ไม่ใช้ alert |  |  |
| BC-04 | จบงานแล้ว reset state | ส่งสำเร็จ/ยกเลิก/ล้มเหลว | state สอดคล้อง (ปุ่ม/สถานะกลับมา); พิจารณาเคลียร์รายการข้อความตาม UX ที่ต้องการ |  |  |

---

## 10) Chat Redesign (`views/admin-chat.ejs`, `public/js/chat-redesign.js`)

| ID | รายการตรวจ | ขั้นตอน | ผลที่คาดหวัง | สถานะ | คอมเมนต์/หลักฐาน |
|---|---|---|---|---|---|
| CHAT-01 | เลือกผู้ใช้ด้วยเมาส์ | คลิก user item | เปิดแชทผู้ใช้ถูกคน |  |  |
| CHAT-02 | เลือกผู้ใช้ด้วยคีย์บอร์ด | Tab ไป user item แล้ว Enter/Space | เปิดแชทได้ |  |  |
| CHAT-03 | Tag filter | คลิก tag filter | filter ทำงาน/สถานะ active ถูกต้อง |  |  |
| CHAT-04 | Tag มี apostrophe | เพิ่มแท็ก `O'Reilly` แล้วลอง add/remove/filter | UI ไม่แตก; add/remove ได้ |  |  |
| CHAT-05 | เปิดรูป | คลิกรูป/Enter ที่รูป | modal เปิดรูปได้ |  |  |
| CHAT-06 | Order actions | กดแก้ไข/ลบออเดอร์ | ปุ่มทำงานผ่าน delegation; ไม่พัง |  |  |
| CHAT-07 | XSS ในข้อความ | มีข้อความที่มี `<b>...</b>`/`<script>` | แสดงเป็นข้อความ ไม่ render HTML |  |  |

---

## 11) Facebook Posts/Comments (`views/admin-facebook-posts.ejs`, `views/admin-facebook-comment.ejs`)

| ID | รายการตรวจ | ขั้นตอน | ผลที่คาดหวัง | สถานะ | คอมเมนต์/หลักฐาน |
|---|---|---|---|---|---|
| FB-01 | อ่าน JSON จาก script tag | เปิดหน้า FB posts | หน้าไม่ error จาก parse JSON |  |  |
| FB-02 | Toast ปลอดภัย | trigger toast จาก error/success | แสดง message เป็น text ไม่ execute |  |  |

---

## 12) Shared Navbar / Logout (`views/partials/admin-navbar.ejs`)

| ID | รายการตรวจ | ขั้นตอน | ผลที่คาดหวัง | สถานะ | คอมเมนต์/หลักฐาน |
|---|---|---|---|---|---|
| NAV-01 | Logout success | กดออกจากระบบ | logout ได้ และไปหน้า login |  |  |
| NAV-02 | Logout fail handling | จำลอง logout fail | แจ้งด้วย toast (ถ้ามี) หรือ alert fallback |  |  |

---

## 13) สรุปประเด็นที่พบ (สำหรับบันทึกในอนาคต)

| วันที่ | หน้า/ฟีเจอร์ | อาการ | ความรุนแรง | วิธีทำให้เกิด | สถานะ (เปิด/ปิด) | คอมเมนต์/ลิงก์ |
|---|---|---|---|---|---|---|
| ____-__-__ | __________ | __________ | P0/P1/P2/P3 | __________ | เปิด/ปิด |  |

