# Order Creation Paths (System Survey)
# เส้นทางการสร้างออเดอร์ (สำรวจระบบ)

This document lists every code path that creates a document in the `orders`
collection and summarizes how each path works.

เอกสารนี้สรุปทุกเส้นทางในโค้ดที่สร้างเอกสารในคอลเลกชัน `orders`
พร้อมอธิบายการทำงานของแต่ละเส้นทางโดยย่อ

## Creation paths
## เส้นทางการสร้างออเดอร์

1. AI tool `create_order` (text-only chat)
   - Trigger: OpenAI tool call in `getAssistantResponseTextOnly` after a
     customer confirms an order.
   - Flow: AI must call `get_orders` first (duplicate check) -> tool handler ->
     `createOrderFromTool` -> `saveOrderToDatabase`.
   - Source tags: `extractedFrom: "ai_tool"`, `isManualExtraction: false`,
     `status` defaults to `pending` unless provided.
   - Socket: emits `orderExtracted` to update the admin chat UI.

2. AI tool `create_order` (multimodal chat)
   - Trigger: OpenAI tool call in `getAssistantResponseMultimodal` (same
     tool set as text-only).
   - Flow and side effects are identical to the text-only path.

There is no admin API or UI route that creates new orders directly. Admin
endpoints only update or delete existing orders.

1. เครื่องมือ AI `create_order` (แชทแบบข้อความล้วน)
   - Trigger: OpenAI เรียกเครื่องมือใน `getAssistantResponseTextOnly`
     หลังลูกค้ายืนยันการสั่งซื้อ
   - Flow: AI ต้องเรียก `get_orders` ก่อนเสมอ (ตรวจซ้ำ) -> tool handler ->
     `createOrderFromTool` -> `saveOrderToDatabase`
   - Source tags: `extractedFrom: "ai_tool"`, `isManualExtraction: false`,
     ค่า `status` เป็น `pending` หากไม่ได้ระบุ
   - Socket: ยิง event `orderExtracted` เพื่ออัปเดตหน้าแชทแอดมิน

2. เครื่องมือ AI `create_order` (แชทแบบมีรูป/มัลติโหมด)
   - Trigger: OpenAI เรียกเครื่องมือใน `getAssistantResponseMultimodal`
     (ใช้ชุดเครื่องมือเดียวกับข้อความล้วน)
   - Flow และผลข้างเคียงเหมือนเส้นทางข้อความล้วน

ไม่มี API หรือ UI ฝั่งแอดมินที่สร้างออเดอร์ใหม่โดยตรง
โดย endpoint ฝั่งแอดมินมีไว้แก้ไขหรือลบออเดอร์เท่านั้น

## Validation and normalization
## การตรวจสอบและปรับรูปแบบข้อมูล

Order payloads are validated and normalized before insertion:

- `buildOrderDataForTool` normalizes items and optional fields.
  - Items require `product`, `quantity`, and `price`.
  - Optional item fields: `shippingName`, `color`, `width`, `length`,
    `height`, `weight`.
  - `totalAmount` is required; if missing or invalid, it is calculated from
    items.
  - `shippingCost`, `customerName`, `recipientName`, `shippingAddress`,
    `phone`, `email`, `paymentMethod`, and address parts are normalized.
- `orderRequiredFields` controls required data (default: items only).
  - If a required field is missing, `createOrderFromTool` returns an error so
    the assistant can ask for missing details.
- Duplicate guard: `createOrderFromTool` blocks creating a new order if the
  latest order for the same user was created within the last hour and the
  item list matches (product + quantity).

ระบบจะตรวจสอบและปรับรูปแบบข้อมูลก่อนบันทึก:

- `buildOrderDataForTool` ปรับรูปแบบรายการสินค้าและฟิลด์เสริม
  - รายการสินค้าต้องมี `product`, `quantity`, และ `price`
  - ฟิลด์เสริมของสินค้า: `shippingName`, `color`, `width`, `length`,
    `height`, `weight`
  - ต้องมี `totalAmount`; ถ้าขาดหรือไม่ถูกต้อง จะคำนวณจากรายการสินค้า
  - `shippingCost`, `customerName`, `recipientName`, `shippingAddress`,
    `phone`, `email`, `paymentMethod`, และส่วนของที่อยู่จะถูก normalize
- `orderRequiredFields` ควบคุมข้อมูลที่จำเป็น (ค่าเริ่มต้น: ต้องมีแค่ items)
  - หากขาดข้อมูลที่จำเป็น `createOrderFromTool` จะคืน error ให้ผู้ช่วยถามต่อ
- ป้องกันออเดอร์ซ้ำ: `createOrderFromTool` จะบล็อกการสร้างใหม่ถ้าออเดอร์ล่าสุด
  ของผู้ใช้คนเดิมถูกสร้างภายใน 1 ชั่วโมง และรายการสินค้าเหมือนกัน
  (เทียบจาก product + quantity)

## Database write
## การเขียนลงฐานข้อมูล

`saveOrderToDatabase` inserts into `orders` with:

- `userId`, `platform`, `botId`
- `orderData` (normalized)
- `status`, `notes`
- `extractedAt`, `extractedFrom`, `isManualExtraction`
- `updatedAt`
- `notificationStatus` (defaults to `pending`)

`saveOrderToDatabase` จะ insert ลง `orders` ด้วยฟิลด์:

- `userId`, `platform`, `botId`
- `orderData` (หลัง normalize)
- `status`, `notes`
- `extractedAt`, `extractedFrom`, `isManualExtraction`
- `updatedAt`
- `notificationStatus` (ค่าเริ่มต้น `pending`)

## Post-create side effects
## ผลข้างเคียงหลังสร้างออเดอร์

After insertion:

- `triggerOrderNotification` sends `new_order` notifications and updates
  `notificationStatus`.
- `maybeAnalyzeFollowUp` updates follow-up state for the user.
- `orderExtracted` Socket.IO event is emitted for admin UI refresh.

หลังการ insert:

- `triggerOrderNotification` ส่งแจ้งเตือน `new_order` และอัปเดต
  `notificationStatus`
- `maybeAnalyzeFollowUp` อัปเดตสถานะ follow-up ของผู้ใช้
- ยิง Socket.IO event `orderExtracted` เพื่อรีเฟรช UI ฝั่งแอดมิน

## Related (non-creation) endpoints
## Endpoint ที่เกี่ยวข้อง (ไม่ใช่การสร้าง)

These endpoints modify or delete existing orders only:

- `PUT /admin/chat/orders/:orderId` (edit order data/status/notes)
- `PATCH /admin/orders/:orderId/status` (status change)
- `PATCH /admin/orders/:orderId/notes` (notes change)
- `DELETE /admin/chat/orders/:orderId` (delete)

Endpoint เหล่านี้แก้ไขหรือลบออเดอร์ที่มีอยู่เท่านั้น:

- `PUT /admin/chat/orders/:orderId` (แก้ไขข้อมูลออเดอร์/สถานะ/โน้ต)
- `PATCH /admin/orders/:orderId/status` (เปลี่ยนสถานะ)
- `PATCH /admin/orders/:orderId/notes` (แก้ไขโน้ต)
- `DELETE /admin/chat/orders/:orderId` (ลบออเดอร์)

## Not wired or disabled
## ส่วนที่มีอยู่แต่ยังไม่ใช้งาน

The following code exists but does not currently create orders:

- `analyzeOrderFromChat` (analysis helper not invoked)
- order buffer/cutoff helpers (no active scheduler)

โค้ดส่วนต่อไปนี้มีอยู่แต่ยังไม่ถูกเรียกใช้เพื่อสร้างออเดอร์:

- `analyzeOrderFromChat` (ตัวช่วยวิเคราะห์ แต่ยังไม่ถูกเรียกใช้งาน)
- order buffer/cutoff helpers (ยังไม่มี scheduler ที่ทำงานอยู่)

## Related files
## ไฟล์ที่เกี่ยวข้อง

- `index.js` (order creation flow, validation, tool wiring, admin endpoints)
- `services/notificationService.js` (new order notification)
- `public/js/chat-redesign.js` (admin UI reacts to `orderExtracted`, order edit UI)
- `public/js/chat-new.js` (legacy admin UI `orderExtracted` handling)
- `views/admin-chat.ejs` (order edit modal in admin chat)
- `views/admin-orders.ejs` (orders admin page, view-only)
- `public/js/admin-orders-v2.js` (orders list UI, view-only)

- `index.js` (เส้นทางสร้างออเดอร์, validation, tool wiring, admin endpoints)
- `services/notificationService.js` (แจ้งเตือนออเดอร์ใหม่)
- `public/js/chat-redesign.js` (UI แอดมินรับ `orderExtracted`, ฟอร์มแก้ไขออเดอร์)
- `public/js/chat-new.js` (UI แอดมินรุ่นเดิม รับ `orderExtracted`)
- `views/admin-chat.ejs` (โมดัลแก้ไขออเดอร์ในแชทแอดมิน)
- `views/admin-orders.ejs` (หน้าออเดอร์แอดมิน, ดูอย่างเดียว)
- `public/js/admin-orders-v2.js` (UI รายการออเดอร์, ดูอย่างเดียว)
