# แผนพัฒนา: ระบบแจ้งเตือนออเดอร์ (Notification Channels)

> **Last updated:** 2025-12-17  
> **Status:** Draft  
> **Priority:** High  
> **Note:** LINE Notify จะยุติบริการ 31 มี.ค. 2025 → ใช้ **LINE Messaging API** เท่านั้น

## เป้าหมาย
- แจ้งเตือน “ออเดอร์ใหม่” ไปยัง **LINE Group** ได้ (รองรับหลายกลุ่ม/หลายช่องทางในอนาคต)
- ตั้งค่าได้เองในหน้าแอดมิน โดย **ไม่ต้องให้ผู้ใช้หา Group ID**
- เลือกได้ว่า “ออเดอร์จากบอทไหน/แพลตฟอร์มไหน” ถึงจะส่งแจ้งเตือน
- มีประวัติการส่ง (success/failed) เพื่อไล่ปัญหา

## ให้สอดคล้องกับโค้ดปัจจุบัน (จุดอ้างอิง)
- Entry point: `index.js` (Express/Socket.IO + MongoDB)
- LINE Webhook: `POST /webhook/line/:botId` → loop `events` → `handleLineEvent(event, queueOptions)`
- บันทึกออเดอร์: `saveOrderToDatabase()` → collection `orders` (ฟิลด์สำคัญ: `platform`, `botId` เป็น string, `orderData.totalAmount`, `extractedAt`)
- หน้าแอดมิน Settings v2: `GET /admin/settings2` → `views/admin-settings-v2.ejs` + `public/js/admin-settings-v2.js` + `public/css/admin-settings-v2.css`
- Endpoint รายชื่อบอท (ใช้ทำ “source selection”): `GET /admin/api/all-bots` (คืน `platform` + `id` + `name`)

## แนวคิดหลัก: Bot ที่ใช้ส่ง (Sender) vs Bot ต้นทางออเดอร์ (Source)
- **Sender Bot**: LINE Bot ที่ใช้ `pushMessage` ไปยังกลุ่ม (ต้องถูกเชิญเข้ากลุ่มนั้นก่อน)
- **Source Bots**: บอท/เพจที่เป็น “ต้นทางออเดอร์” ที่จะ trigger การแจ้งเตือน (อิง `orders.platform` + `orders.botId`)
- ตัวอย่าง: ใช้ LINE Bot “Notify” เป็นผู้ส่ง แต่เลือกให้แจ้งเตือนเฉพาะออเดอร์จาก LINE Bot A/B และ Facebook Page C ได้

## ขอบเขตงาน (MVP)
1. **Auto-capture กลุ่ม**: เก็บ `groupId/roomId` จาก LINE webhook เมื่อบอทถูกเชิญเข้ากลุ่ม (`join`) หรือมี event จากกลุ่ม
2. **Notification Channels**: สร้าง/แก้ไข/เปิด-ปิด “ช่องทางแจ้งเตือน” ได้จากหน้า `/admin/settings2`
3. **Trigger**: ส่งแจ้งเตือนทันทีหลัง “สร้างออเดอร์ใหม่” (หลัง `saveOrderToDatabase()` สำเร็จ)
4. **Logging**: เก็บ log การส่ง (success/failed) เพื่อดูย้อนหลัง

## นอกขอบเขต (เลื่อนไป Phase 2+)
- Flex Message / ปุ่มยืนยันออเดอร์
- Quiet hours / schedule
- Retry/backoff อัตโนมัติ
- ช่องทางอื่น (LINE 1:1, Webhook, ฯลฯ)

## Data Model (MongoDB) — แบบสั้นที่เข้ากับโปรเจ็ก
> โปรเจ็กนี้ใช้ `botId` เป็น **string** ในหลายจุด (เช่น `orders.botId`) จึงยึด pattern เดียวกัน

### 1) `line_bot_groups`
เก็บรายการกลุ่มที่ “แต่ละ LINE Bot” เคย/กำลังอยู่ เพื่อให้ UI เลือกได้โดยไม่ต้องกรอก Group ID

```js
{
  _id: ObjectId,
  botId: String,                // line_bots._id.toString()
  sourceType: "group"|"room",
  groupId: String,              // groupId หรือ roomId

  groupName: String|null,       // จาก LINE API (ถ้าดึงได้)
  pictureUrl: String|null,      // จาก LINE API (ถ้าดึงได้)
  memberCount: Number|null,     // จาก LINE API (ถ้าดึงได้)

  status: "active"|"left",      // leave → left
  joinedAt: Date|null,
  leftAt: Date|null,
  lastEventAt: Date|null,

  createdAt: Date,
  updatedAt: Date
}
```

**Indexes**
- Unique: `{ botId: 1, groupId: 1 }`
- Query: `{ botId: 1, status: 1, lastEventAt: -1 }`

### 2) `notification_channels`
นิยาม “ช่องทางแจ้งเตือน” ว่าจะส่งอะไร ไปที่ไหน ผ่านบอทไหน และรับออเดอร์จาก source ไหน

```js
{
  _id: ObjectId,
  name: String,                 // ชื่อที่ผู้ใช้ตั้ง

  // Target (MVP = LINE group/room)
  type: "line_group",
  senderBotId: String,          // line_bots._id.toString() (บอทที่ใช้ push)
  groupId: String,              // อ้างอิง line_bot_groups.groupId (groupId/roomId)

  // Source filter (อิงกับ orders.platform + orders.botId)
  receiveFromAllBots: Boolean,  // true = ไม่สน bot/platform
  sources: [{                   // ใช้เมื่อ receiveFromAllBots=false
    platform: "line"|"facebook",
    botId: String               // _id.toString() ของ bot ใน platform นั้น
  }],

  // Events (MVP = new_order)
  eventTypes: ["new_order"],

  // Message settings (เริ่มเล็กไว้)
  settings: {
    template: "simple",         // simple|detailed|flex (flex เป็น Phase 2)
    includeCustomer: Boolean,
    includeItemsCount: Boolean,
    includeTotalAmount: Boolean,
    includeOrderLink: Boolean
  },

  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes**
- `{ isActive: 1, type: 1 }`
- `{ senderBotId: 1, groupId: 1 }`
- (ถ้าจำเป็น) partial index บน `sources.platform + sources.botId`

### 3) `notification_logs`
```js
{
  _id: ObjectId,
  channelId: String,            // notification_channels._id.toString()
  orderId: String,              // orders._id.toString()
  eventType: "new_order",

  status: "success"|"failed",
  errorMessage: String|null,
  response: Object|null,
  createdAt: Date
}
```

**Indexes**
- `{ channelId: 1, createdAt: -1 }`
- `{ createdAt: -1 }` (สำหรับหน้า history)

## Backend งานที่ต้องทำ (ผูกกับโค้ดจริง)

### A) Capture กลุ่มจาก LINE Webhook
ตำแหน่งที่เหมาะกับโค้ดปัจจุบัน:
- เพิ่ม logic ที่ต้น `handleLineEvent(event, queueOptions)` ใน `index.js`

พฤติกรรม (MVP):
1. ถ้า `event.source.type` เป็น `group` หรือ `room` → upsert เข้า `line_bot_groups`
2. ถ้า `event.type === "join"` → set `status=active`, `joinedAt`
3. ถ้า `event.type === "leave"` → set `status=left`, `leftAt`
4. เพื่อไม่ให้ “แชทกลุ่ม” ไปปนระบบแชทลูกค้า: เมื่อเป็น group/room event ให้ **capture แล้ว return** (ไม่เข้าคิว AI/ไม่บันทึก chat_history)

### B) Notification Service
เพิ่ม service ใหม่ใน `services/` (เช่น `services/notificationService.js`) เพื่อไม่ให้ `index.js` ยาวกว่าเดิม:
- `sendNewOrder(orderId)`:
  - load `orders` จาก DB
  - หา `notification_channels` ที่ `isActive=true` + match `eventTypes` + match `sources` (หรือ `receiveFromAllBots=true`)
  - สำหรับแต่ละ channel → สร้าง Line client จาก `line_bots` (ตาม pattern ใน `/webhook/line/:botId`) แล้ว `pushMessage(groupId, message)`
  - เขียน `notification_logs`

### C) Trigger หลังสร้างออเดอร์
- ใน `saveOrderToDatabase()` หลัง `insertOne` สำเร็จ → เรียก `NotificationService.sendNewOrder(insertedId)`
- ควรทำแบบ “ไม่ block” เส้นทางหลัก (เช่น `setImmediate`/fire-and-forget + log error) เพื่อไม่ให้ช้าจน webhook ตอบกลับช้า

### D) Admin API (ใช้ `requireAdmin`)
ออกแบบให้สอดคล้องกับที่มีอยู่แล้วใน `index.js` (กลุ่ม `/admin/api/*`)

**Notification Channels**
- `GET /admin/api/notification-channels`
- `POST /admin/api/notification-channels`
- `PUT /admin/api/notification-channels/:id`
- `PATCH /admin/api/notification-channels/:id/toggle`
- `DELETE /admin/api/notification-channels/:id`
- `POST /admin/api/notification-channels/:id/test` (ส่งข้อความทดสอบไปที่ target)

**Groups**
- `GET /admin/api/line-bots/:botId/groups` (คืนจาก `line_bot_groups`)
- `POST /admin/api/line-bots/:botId/groups/:groupId/refresh` (ดึงชื่อ/รูปจาก LINE API ใหม่ — optional)

**Logs**
- `GET /admin/api/notification-logs?channelId=&status=&from=&to=`

### E) MongoDB Indexes
- เพิ่ม `ensureNotificationIndexes(db)` แล้วเรียกใน `connectDB()` คู่กับ `ensureCategoryIndexes()`

## Admin UI (Settings v2)
ตำแหน่ง: `views/admin-settings-v2.ejs`
- เพิ่ม nav item ใน sidebar: `#order-notifications`
- เพิ่ม section “แจ้งเตือนออเดอร์”:
  - เลือก LINE Bot → แสดงกลุ่มที่จับได้จาก `line_bot_groups`
  - รายการช่องทางที่สร้างแล้ว (Active/Inactive)
  - ปุ่ม “สร้างช่องทางใหม่”, “ทดสอบส่ง”, “แก้ไข”, “ปิด/เปิด”
  - ลิงก์/คำแนะนำ “เชิญบอทเข้ากลุ่ม แล้วพิมพ์ 1 ข้อความเพื่อให้ระบบเห็นกลุ่ม”

สคริปต์: เพิ่ม logic ใน `public/js/admin-settings-v2.js` (หรือแยกไฟล์ใหม่แล้ว include เพิ่ม)  
สไตล์: เพิ่ม/ปรับใน `public/css/admin-settings-v2.css` (หลีกเลี่ยงสร้าง CSS ใหม่ถ้าไม่จำเป็น)

## แผนดำเนินงาน (สั้น + ตรวจรับได้)

### Phase 1 (MVP) — LINE Group + New Order
- [ ] DB: สร้าง collections + indexes (`line_bot_groups`, `notification_channels`, `notification_logs`)
- [ ] LINE webhook: capture `groupId/roomId` ใน `handleLineEvent()` และ ignore group chat processing
- [ ] Service: ส่ง “ออเดอร์ใหม่” (simple text) + log
- [ ] Trigger: hook ใน `saveOrderToDatabase()`
- [ ] Admin API: CRUD channels + list groups + test send
- [ ] Admin UI: section ใน `/admin/settings2` ใช้งานได้จริง

**Acceptance**
- เชิญบอทเข้า group → group โผล่ใน UI ภายใน 1–2 event
- สร้างออเดอร์ใหม่ 1 รายการ → ได้ข้อความเข้า group และมี log success/failed

### Phase 2 — UX/ข้อความดีขึ้น
- [ ] Template แบบ detailed (ดึง `orderData.items`, `totalAmount`, `customerName`)
- [ ] หน้า log/history ใน UI + filter
- [ ] Rate limit สำหรับ test send
- [ ] Refresh group profile (ชื่อ/รูป) จาก LINE API

### Phase 3 — Advanced Channels
- [ ] Quiet hours
- [ ] LINE 1:1 (userId)
- [ ] Webhook outbound (สำหรับระบบภายนอก)

## ความเสี่ยง/ข้อควรระวัง
- **Push quota** ของ LINE OA: ควรมี UI/Log แจ้งเมื่อเริ่ม fail ด้วย quota
- **Group summary API** อาจดึงไม่ได้ในบางกรณี: ต้องรองรับการแสดงผลแบบ “ไม่ทราบชื่อกลุ่ม”
- **ความสับสนกับ “แจ้งเตือนแอดมิน” เดิม**: ใน UI ควรใช้คำว่า “แจ้งเตือนออเดอร์” ชัดเจน
- **ความปลอดภัย**: endpoint ใต้ `/admin/api/*` ต้อง `requireAdmin` และห้าม return token/secret ออกไป

## Open Questions
1. ต้องส่งแจ้งเตือนเฉพาะ “ออเดอร์ใหม่” หรือรวม “อัปเดตสถานะ/ยกเลิก” ด้วย?
2. ต้องการส่งหลายช่องทางพร้อมกันได้กี่ช่องทาง (จำกัดเพื่อคุม quota ไหม)?
3. ต้องการเก็บ log ย้อนหลังกี่วัน และต้องมี job ล้าง log ไหม?
