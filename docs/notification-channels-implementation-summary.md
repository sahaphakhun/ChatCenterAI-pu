# สรุปการพัฒนา: ระบบแจ้งเตือนออเดอร์ (Notification Channels)

> อัปเดตล่าสุด: 2025-12-17

## ภาพรวม
ระบบนี้ช่วยส่งแจ้งเตือน “ออเดอร์ใหม่” ไปยัง **LINE Group/Room** ได้ โดย:
- แอดมินเลือก **บอทผู้ส่ง (Sender Bot)** ที่จะ `pushMessage` เข้ากลุ่ม
- แอดมินเลือก **บอทต้นทางออเดอร์ (Source Bots)** ได้หลายตัว (ข้ามแพลตฟอร์ม LINE/Facebook ได้) ว่าออเดอร์ของใครบ้างต้องแจ้งเตือน
- ระบบ “จับกลุ่มอัตโนมัติ” จาก LINE webhook (ไม่ต้องกรอก `groupId`)

## แนวคิดสำคัญ: Sender vs Source
- **Sender Bot** = LINE Bot ที่ใช้ส่งข้อความเข้า group/room (ต้องถูกเชิญเข้ากลุ่มนั้นก่อน)
- **Source Bots** = บอท/เพจที่เป็นต้นทางของออเดอร์ (อิงจาก `orders.platform` + `orders.botId`)

ตัวอย่าง:
- ใช้ LINE Bot “Notify” เป็นผู้ส่ง
- แต่ให้แจ้งเตือนเฉพาะออเดอร์จาก LINE Bot A/B และ Facebook Page C

## สิ่งที่เพิ่ม/เปลี่ยนในระบบ

### 1) Capture กลุ่ม LINE อัตโนมัติ
- เมื่อ LINE webhook ได้ event ที่ `source.type = group|room` ระบบจะ:
  - upsert กลุ่มลง `line_bot_groups`
  - พยายามดึงชื่อกลุ่ม/รูป/จำนวนสมาชิกจาก LINE API (ถ้าเรียกได้)
  - **ไม่ประมวลผลแชทกลุ่มต่อ** (ไม่เข้าคิว AI และไม่บันทึกเป็นแชทลูกค้า)

### 2) Notification Channels (ตั้งค่าช่องทางแจ้งเตือน)
- เพิ่ม collection `notification_channels` เพื่อเก็บการตั้งค่าช่องทาง:
  - `senderBotId` (LINE bot ผู้ส่ง)
  - `groupId` (ปลายทาง)
  - เงื่อนไข source (`receiveFromAllBots` หรือ `sources[]`)
  - settings รูปแบบข้อความ (simple text): รายการสินค้า, ที่อยู่, เบอร์โทร, วิธีชำระเงิน, ยอดรวม (เปิด/ปิดได้)

### 3) ส่งแจ้งเตือนเมื่อมีออเดอร์ใหม่
- หลังบันทึกออเดอร์สำเร็จ (`saveOrderToDatabase`) ระบบจะ trigger ส่งแจ้งเตือนแบบ async (ไม่บล็อกเส้นทางหลัก)
- เก็บผลการส่งลง `notification_logs` (success/failed)

### 4) Admin UI (Settings v2)
เพิ่มแท็บใน `/admin/settings2`:
- แสดงรายการ “ช่องทางแจ้งเตือน” (เปิด/ปิด, แก้ไข, ลบ)
- สร้าง/แก้ไขช่องทางผ่าน modal:
  - เลือก Sender Bot
  - เลือกกลุ่มปลายทาง (จากกลุ่มที่ระบบจับได้)
  - เลือก Source Bots (หรือรับจากทุกบอท)
  - ปุ่ม “ทดสอบส่ง”

## โครงสร้างข้อมูล (MongoDB)

### `line_bot_groups`
เก็บกลุ่ม/ห้องที่ LINE Bot เคยเห็นจาก webhook (ใช้ให้ UI เลือก)

ฟิลด์หลัก: `botId`, `sourceType`, `groupId`, `groupName`, `status`, `lastEventAt`

### `notification_channels`
นิยามช่องทางแจ้งเตือน

ฟิลด์หลัก: `name`, `type=line_group`, `senderBotId`, `groupId`, `receiveFromAllBots`, `sources[]`, `settings`, `isActive`

### `notification_logs`
ประวัติการส่งแจ้งเตือน

ฟิลด์หลัก: `channelId`, `orderId`, `eventType`, `status`, `errorMessage`, `createdAt`

## Admin API ที่เพิ่ม
- `GET /admin/api/notification-channels`
- `POST /admin/api/notification-channels`
- `PUT /admin/api/notification-channels/:id`
- `PATCH /admin/api/notification-channels/:id/toggle`
- `DELETE /admin/api/notification-channels/:id`
- `POST /admin/api/notification-channels/:id/test`
- `GET /admin/api/line-bots/:botId/groups`
- `GET /admin/api/notification-logs?channelId=&status=&from=&to=&limit=`

> หมายเหตุ: API ใต้ `/admin/api/*` ใช้ `requireAdmin`

## วิธีใช้งาน (Flow สำหรับแอดมิน)
1. ไปหน้า `/admin/settings2` → “จัดการบอท” → เพิ่ม LINE Bot ที่จะใช้เป็น **Sender Bot**
2. เชิญ Sender Bot เข้ากลุ่ม LINE ที่ต้องการรับแจ้งเตือน
3. พิมพ์ 1 ข้อความในกลุ่ม (เพื่อให้ webhook ส่ง event เข้ามา)
4. ไปแท็บ “แจ้งเตือนออเดอร์” → กด “รีเฟรช” → “สร้างช่องทาง”
5. เลือก:
   - LINE Bot (ผู้ส่ง)
   - กลุ่ม/ห้องปลายทาง (จากรายการที่จับได้)
   - รับจากทุกบอท หรือเลือกบอทต้นทางหลายตัว
6. กด “ทดสอบส่ง” เพื่อเช็คก่อนใช้งานจริง

## ข้อควรระวัง/การแก้ปัญหา
- ถ้า “ไม่พบกลุ่ม” ใน dropdown:
  - ตรวจสอบว่า webhook ของ LINE Bot ชี้มาที่ระบบถูกต้องและเปิดใช้งานแล้ว
  - เชิญบอทเข้ากลุ่ม และพิมพ์ข้อความ 1 ครั้งในกลุ่ม
- ถ้าส่งไม่ออก:
  - ตรวจสอบ quota ของ LINE OA
  - ตรวจสอบว่า Sender Bot ยังอยู่ในกลุ่ม
  - ดู error จาก `GET /admin/api/notification-logs`

## ตัวแปรแวดล้อมที่เกี่ยวข้อง
- `PUBLIC_BASE_URL` ใช้สำหรับแนบลิงก์หน้าออเดอร์ในข้อความ (ถ้าเปิด `includeOrderLink`)

## ไฟล์ที่เกี่ยวข้อง
- Backend: `index.js`, `services/notificationService.js`
- UI: `views/admin-settings-v2.ejs`, `views/partials/modals/notification-channel-modal.ejs`
- Frontend: `public/js/notification-channels.js`, `public/css/admin-settings-v2.css`
