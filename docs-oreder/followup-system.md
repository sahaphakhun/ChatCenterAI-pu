# ระบบติดตามลูกค้า (Follow-up) ใน ChatCenterAI

## ภาพรวม
- ระบบติดตามลูกค้ามี 3 ส่วนหลัก: การตั้งเวลา (follow_up_tasks), การติดแท็กว่าซื้อแล้ว (follow_up_status), และแดชบอร์ดแอดมิน (/admin/followup)
- การส่งติดตามอิงจากข้อความล่าสุดของลูกค้าและตารางรอบ (rounds) ที่ตั้งไว้ต่อเพจ/บอท
- ใช้โซนเวลา Asia/Bangkok ในการคำนวณเวลาและ dateKey

## โครงสร้างข้อมูล (MongoDB)
### 1) follow_up_tasks
- เก็บงานติดตามรายวันของผู้ใช้แต่ละคน
- ฟิลด์สำคัญ:
  - userId, platform, botId, contextKey, dateKey
  - rounds: array ของรอบส่ง
    - index, delayMinutes, message, images[], scheduledAt, sentAt, status
  - nextRoundIndex, nextScheduledAt, lastSentAt, sentRounds[]
  - lastUserMessageAt, lastUserMessagePreview
  - canceled, completed, cancelReason, canceledAt
  - createdAt, updatedAt
  - configSnapshot (snapshot ของรอบ/autoFollowUpEnabled ตอนสร้างงาน)
- Index:
  - { userId, platform, botId, dateKey }
  - { nextScheduledAt, canceled, completed }
- dateKey เป็น YYYY-MM-DD (Asia/Bangkok) ใช้กรองในแดชบอร์ดและสถิติ

### 2) follow_up_status
- เก็บสถานะว่าลูกค้าถูก “ติดตามว่าเคยซื้อแล้ว” หรือไม่
- ฟิลด์หลัก:
  - senderId (userId)
  - hasFollowUp (true/false)
  - followUpReason
  - followUpUpdatedAt
  - lastAnalyzedAt
  - platform, botId

### 3) follow_up_page_settings
- เก็บการตั้งค่าเฉพาะเพจ/บอท
- ฟิลด์หลัก:
  - platform ("line" หรือ "facebook")
  - botId (null = ค่าเริ่มต้นของแพลตฟอร์มนั้น)
  - settings: { analysisEnabled, showInChat, showInDashboard, autoFollowUpEnabled, rounds, orderPromptInstructions, model }
  - updatedAt
- การ merge config ใช้ลำดับ: baseConfig (settings collection) → platform default (botId:null) → specific botId

### 4) follow_up_assets + GridFS bucket followupAssets
- เก็บรูปภาพที่ใช้ในรอบติดตาม
- follow_up_assets เก็บ metadata (sha256, width/height, url/thumbUrl, fileId)
- ไฟล์จริงเก็บใน GridFS bucket `followupAssets`
- เสิร์ฟผ่าน `/assets/followup/:fileName` หรือ static dir `FOLLOWUP_ASSETS_DIR`

## การตั้งค่า (Settings)
### Global settings ใน collection settings
- enableFollowUpAnalysis (default: true)
- followUpShowInChat (default: true)
- followUpShowInDashboard (default: true)
- followUpAutoEnabled (default: false)
- followUpRounds (default: 2 รอบที่ 10/20 นาที)
- followUpOrderPromptInstructions (default prompt สำหรับสกัดออเดอร์)
- หมายเหตุ: followUpRounds และ followUpAutoEnabled ไม่มีหน้า UI ตรง ต้องปรับผ่าน DB หรือทำ endpoint เพิ่มเอง

### API ที่ใช้ปรับ global
- `GET /api/settings` คืนค่ารวมทั้งหมด
- `POST /api/settings/chat` รองรับ:
  - enableFollowUpAnalysis
  - followUpShowInChat
  - followUpShowInDashboard
  - (และค่าอื่นของหน้า chat settings)
- เมื่อแก้ค่า จะ reset cache ของ follow-up config

### ตั้งค่าต่อเพจ/บอท
- ผ่าน UI `/admin/followup`:
  - เปิด/ปิดส่งอัตโนมัติ (autoFollowUpEnabled)
  - กำหนดรอบติดตาม (delay + message + images)
  - Reset กลับค่าเริ่มต้น (ลบ override → ใช้ base config)
- ผ่าน API `POST /admin/followup/page-settings`
  - สามารถส่ง orderPromptInstructions, model เพิ่มได้ (UI ไม่โชว์)
  - ลบ override ด้วย `DELETE /admin/followup/page-settings`

### Environment variables ที่เกี่ยวข้อง
- PUBLIC_BASE_URL: แปลง URL รูปแบบ relative ให้เป็น absolute ตอนส่ง
- FOLLOWUP_ASSETS_DIR: โฟลเดอร์ static สำหรับ `/assets/followup`
- FOLLOWUP_PUBLIC_BASE_URL / FOLLOWUP_ASSETS_BASE_URL: ใช้เพิ่ม CSP allowlist (ถ้ามี)

## Flow การทำงานหลัก
### 1) การสร้าง/อัปเดตงานติดตาม (scheduleFollowUpForUser)
ถูกเรียกเมื่อมีข้อความจากลูกค้า:
- จุดเรียก: `saveChatHistory()` ทุกครั้งที่มีข้อความ user
- ขั้นตอน:
  1. โหลด config ตาม platform/bot (merge base + override)
  2. ถ้า autoFollowUpEnabled = false → ไม่สร้างงาน
  3. ถ้า rounds ว่าง → ไม่สร้างงาน
  4. เช็ค follow_up_status.hasFollowUp หรือมี order อยู่แล้ว → ยกเลิก/ไม่สร้าง
  5. ถ้ามี task ของวันเดียวกันอยู่:
     - ถ้าถูก cancel เพราะ order_exists/order_detected/already_purchased → ไม่ revive
     - ถ้า task completed/canceled ด้วยเหตุอื่น → reset progress
     - rebuild รอบใหม่ โดยอิง timestamp ล่าสุดของลูกค้า
  6. ถ้าไม่เคยมี task → สร้าง task ใหม่ (dateKey ตามวันของข้อความ)

เงื่อนไขสำคัญ:
- dateKey ใช้วันของข้อความล่าสุด (Asia/Bangkok)
- รอบต้องมี `delayMinutes >= 1` และมี message หรือ images อย่างใดอย่างหนึ่ง
- รอบถูก sort ตาม delayMinutes ก่อนบันทึก

### 2) การประมวลผลส่งข้อความ (Worker)
- worker เริ่มหลัง server start (`startFollowUpTaskWorker`)
- interval ทุก 30 วินาที
- ดึง tasks ที่:
  - canceled != true
  - completed != true
  - nextScheduledAt <= now
- จำกัดครั้งละ 10 งาน

การส่งแต่ละรอบ:
- ก่อนส่งตรวจ:
  - follow_up_status.hasFollowUp → cancel (reason: already_purchased)
  - พบ order ล่าสุด → cancel (reason: order_exists) + อัปเดต follow_up_status
- ส่งข้อความ:
  - LINE: แบ่ง chunk ละ 5 messages (ตามข้อจำกัด LINE)
  - Facebook: รวมข้อความ + รูปด้วย token `[cut]` และ `#[IMAGE:label]`
- หลังส่ง:
  - อัปเดตรอบเป็น `sent`
  - set nextRoundIndex และ nextScheduledAt
  - ถ้าหมดรอบ → completed
- ถ้าส่งไม่สำเร็จ:
  - mark รอบเป็น `failed`
  - cancel task (reason: send_failed)

### 3) การติดแท็กลูกค้าว่าซื้อแล้ว (follow_up_status)
อัปเดตจาก:
- maybeAnalyzeFollowUp() หลังบันทึกข้อความ user
- เมื่อมี order ถูกสร้าง/แก้ไข/ลบ (forceUpdate)
- เมื่อ schedule พบว่ามี order อยู่แล้ว

พฤติกรรม:
- ถ้ามี order → hasFollowUp = true, ตั้ง reason จาก order.notes หรือ default
- ถ้าไม่มี order → hasFollowUp = false (เฉพาะกรณีที่ยังไม่เคยเป็น true)
  - ถ้าเคยเป็น true แล้ว ระบบจะไม่ reset เป็น false อัตโนมัติ (กันส่งซ้ำ)
- การ clear ต้องทำผ่าน `/admin/followup/clear`

ผลกระทบ:
- hasFollowUp จะทำให้:
  - งานติดตามถูกยกเลิก
  - UI แชทแสดงสถานะ “ซื้อแล้ว” (ถ้าไม่มี manual override)
  - ใช้เป็นเกณฑ์ broadcast แบบ tagged/untagged

### 4) การ clear ลูกค้า (หยุดติดตาม)
- UI ในหน้า follow-up กด “หยุดติดตามวันนี้”
- เรียก `/admin/followup/clear`
- ระบบจะ:
  - cancel tasks ของ user (reason: manual_clear)
  - clear follow_up_status (hasFollowUp = false)
  - emit socket event ให้ UI รีเฟรช

## การจัดการรูปภาพติดตาม
- อัปโหลดผ่าน `/admin/followup/assets`
  - จำกัด 5 รูปต่อครั้ง
  - แปลงเป็น JPG คุณภาพ 88 + สร้าง thumb 512px
  - ใช้ sha256 เพื่อตรวจซ้ำ (duplicate)
- รูปถูกเก็บใน GridFS และ metadata ใน follow_up_assets
- ส่งข้อความ:
  - sanitizeFollowUpImages จะเติม previewUrl และแปลง URL เป็น absolute ถ้า PUBLIC_BASE_URL ตั้งไว้
- ถ้า PUBLIC_BASE_URL ไม่ตั้ง → ระบบจะ warn และรูปแบบ relative อาจส่งไม่สำเร็จ

## หน้าแอดมินที่เกี่ยวข้อง
### /admin/followup
- แสดงสรุปงานติดตาม (Active/Completed/Canceled/Failed)
- เลือกเพจ/บอท (LINE/Facebook)
- ฟิลเตอร์สถานะ + ค้นหา
- ตารางผู้ใช้ + timeline ของแต่ละรอบ
- ตั้งค่าเพจ (auto send, rounds, รูป)
- รองรับ real-time updates ผ่าน socket:
  - followUpTagged
  - followUpScheduleUpdated

### /admin/chat
- ใช้ข้อมูลจาก follow_up_status และ follow_up_tasks เพื่อ:
  - แสดง dot “ติดตาม” (เฉพาะมี task active)
  - แสดงสถานะ “ซื้อแล้ว” (อิง follow_up_status ถ้าไม่มี manual override)
  - ฟิลเตอร์สถานะ followup ใน sidebar

### /admin/customer-stats
- ใช้ follow_up_tasks ช่วงวันที่เลือกเพื่อคำนวณ:
  - active/completed/canceled/failed

### /admin/broadcast
- ใช้ follow_up_status สำหรับเลือกกลุ่มเป้าหมาย:
  - tagged = hasFollowUp true
  - untagged = hasFollowUp false

## Endpoint Summary
- `GET /admin/followup`
- `GET /admin/followup/overview`
- `GET /admin/followup/users?platform=&botId=`
- `POST /admin/followup/clear` { userId }
- `GET /admin/followup/page-settings`
- `POST /admin/followup/page-settings` { platform, botId, settings }
- `DELETE /admin/followup/page-settings` { platform, botId }
- `POST /admin/followup/assets` (multipart)
- `GET /assets/followup/:fileName`

## เงื่อนไข/ข้อควรรู้สำคัญ
- Dashboard แสดงเฉพาะงานของ “วันปัจจุบัน” (dateKey วันนี้)
- งานที่ถูก cancel เพราะ order_exists/order_detected/already_purchased จะไม่ถูก revive แม้มีข้อความใหม่ในวันเดียวกัน
- ถ้ามี manual purchase status ใน `user_purchase_status`:
  - แชทจะแสดงสถานะซื้อตาม manual override
  - แต่การหยุด follow-up อัตโนมัติยังอ้าง follow_up_status (ไม่ใช่ manual)
- ถ้าปิด showInDashboard สำหรับเพจนั้น:
  - `/admin/followup/users` จะส่ง disabled=true
  - UI จะแสดงข้อความว่า “ถูกปิด”
- ถ้าปิด showInChat:
  - แชทจะไม่แสดง badge/สถานะติดตาม (แต่ระบบยัง schedule/ส่งตามปกติ)
