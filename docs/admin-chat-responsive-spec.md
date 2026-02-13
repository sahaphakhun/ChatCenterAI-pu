# Admin Chat UI (Responsive + Design) Spec

วันที่: 2025-12-12  
ขอบเขต: หน้า `/admin/chat` (Admin Chat)  
ไฟล์ที่เกี่ยวข้องหลัก:
- `views/admin-chat.ejs`
- `public/css/chat-redesign.css`, `public/css/chat-a11y.css`, `public/css/chat-meta.css`
- `public/js/chat-redesign.js`

> เป้าหมายของเอกสารนี้คือกำหนด “พฤติกรรม UI ตามขนาดหน้าจอ” + “กติกาดีไซน์/การโต้ตอบ” ให้ทีมทำงานได้ตรงกัน โดยพยายามใช้โครง HTML/คลาสเดิมให้มากที่สุด

---

## 1) เป้าหมาย (Goals)

1. รองรับหลายอุปกรณ์จริง: mobile (360–430px), tablet (768–1024px), laptop (1366px), desktop (1440–1920px)
2. อ่านง่าย/กดง่าย: ลดการล้นของปุ่ม, เพิ่ม touch target, ลดการซ้อนทับของ panel/overlay
3. รักษาฟีเจอร์เดิมทั้งหมด: เลือกผู้ใช้, ค้นหา/กรอง, tag, notes, templates, ส่งข้อความ, เปิดรูป, ออเดอร์ (drawer/collapse), แก้ไขออเดอร์
4. สอดคล้อง design system: ใช้ตัวแปรใน `public/css/theme.css`/`public/css/components.css` ผ่าน `var(--...)`
5. Accessibility ขั้นต้น: keyboard ใช้งานได้, focus ชัด, ไม่พึ่ง hover อย่างเดียว

## 2) ไม่อยู่ในขอบเขต (Non-goals)

- ปรับ backend/API หรือ schema ของข้อมูลแชท/ออเดอร์
- ทำ virtualization ของ message list (ทำได้ภายหลังถ้าจำเป็น)
- เปลี่ยนระบบ CSS ทั้งโปรเจกต์หรือเปลี่ยน framework

---

## 3) ภาพรวมโครงสร้างหน้า (Current Layout Model)

โครงปัจจุบันใน `views/admin-chat.ejs` แบ่งเป็น 3 ส่วนหลัก (ภายใน `.chat-app`):

1) Left Sidebar: `.chat-sidebar` (รายชื่อผู้ใช้ + search + filters)  
2) Main: `.chat-main` (header + messages + composer)  
3) Right Sidebar: `.order-sidebar` (ออเดอร์ + ปุ่ม collapse + content)

มี overlay สำหรับ mobile:
- `#sidebarOverlay` (สำหรับ `.chat-sidebar.show`)
- `#orderSidebarOverlay` (สำหรับ `.order-sidebar.show`)

---

## 4) Breakpoints (ยึด Bootstrap 5)

ใช้ breakpoints ตาม Bootstrap:
- `sm`: 576px
- `md`: 768px
- `lg`: 992px
- `xl`: 1200px
- `xxl`: 1400px (ถ้าต้องปรับเพิ่มเติม)

### 4.1 ตารางพฤติกรรมโดยรวม

| ช่วงจอ | Layout หลัก | Left Sidebar | Right Sidebar (Orders) | Header Actions | หมายเหตุ |
|---|---|---|---|---|---|
| `>=1200` (xl+) | 3-column | docked | docked (เปิด) | แสดงเต็ม | โหมดทำงานหลักบน desktop |
| `992–1199` (lg) | 2-column + orders collapse | docked | **collapsed default** (48px) / เปิดได้ | แสดงเต็ม (ถ้าล้นให้ wrap/overflow) | โฟกัสพื้นที่แชทมากขึ้น |
| `768–991` (md) | 2-column | docked แบบ “narrow” | hidden/drawer | ลดปุ่มใน header + overflow menu | เหมาะกับ iPad portrait |
| `<768` (sm-/mobile) | 1-column | off-canvas (overlay) | drawer (overlay) | เหลือปุ่มหลัก + overflow menu | UX แบบแอปแชท |

> เกณฑ์ “md (768–991)” ให้เน้น productivity: มีรายชื่อผู้ใช้ติดข้างซ้าย (แคบลง) เพื่อสลับแชทเร็ว โดยไม่บังคับ off-canvas เหมือนมือถือ

---

## 5) Layout Spec (รายละเอียด)

### 5.1 Container width / max-width

ปัญหาปัจจุบัน: `.app-content` ถูกจำกัด `max-width` (`public/css/components.css`) ทำให้โหมด 3 พาเนลบนจอกว้างรู้สึก “แคบ”

**ข้อกำหนด**
- หน้า chat ต้องสามารถขยายกว้างได้มากกว่า default dashboard
- แนะนำให้เพิ่ม class เฉพาะหน้า เช่น `body.page-chat` แล้ว override:
  - `--app-max-width` เป็น 1440–1600 (หรือ `min(1600px, 100vw)`)
  - ลด padding ด้านข้างในจอเล็กลง

### 5.2 ความสูง viewport (vh pitfalls)

ปัญหาปัจจุบัน: ใช้ `100vh` หัก `--chat-navbar-height` แบบ fixed (`public/css/chat-redesign.css`) ซึ่งคลาดเคลื่อนบน mobile (dynamic toolbar) และบางครั้งบน desktop (font/zoom)

**ข้อกำหนด**
- ใช้ `100dvh` เป็นหลัก (และมี fallback)
- composer (`.message-input-area`) ต้อง “ติดด้านล่าง” เสมอและไม่โดนคีย์บอร์ดบัง (iOS/Android)
- รองรับ safe area (`env(safe-area-inset-*)`) ตามที่มีแล้ว

### 5.3 Layout ตามช่วงจอ

#### A) `>=1200px` (xl+)
- `.chat-sidebar`: กว้าง `360px` (ค่าเดิม `--chat-sidebar-width`)
- `.order-sidebar`: กว้าง `320px` (ค่าเดิม)
- `.chat-main`: เติมพื้นที่ที่เหลือ
- `.order-sidebar` ไม่ auto-collapse (ให้คง state จากผู้ใช้ได้)

#### B) `992–1199px` (lg)
- `.chat-sidebar`: กว้างแนะนำ `320–340px` (ลดจาก 360 เพื่อลดการบีบพื้นที่แชท)
- `.order-sidebar`: default = `collapsed` (48px) เพื่อเพิ่มพื้นที่แชท
  - ผู้ใช้กด expand ได้ และจำ state ไว้ (มีอยู่แล้ว: `orderSidebarCollapsed`)

#### C) `768–991px` (md / tablet)
- `.chat-sidebar`: docked แต่แคบลง (`280–320px`) และสามารถ toggle ซ่อนได้ (optional)
- `.order-sidebar`: ไม่ docked; เปิดเป็น drawer เมื่อกด “ออเดอร์”
- `.chat-header-right`:
  - เหลือปุ่มหลัก 1–2 ปุ่ม (เช่น Orders + More)
  - ปุ่มรองทั้งหมดอยู่ใน overflow menu (⋯)

#### D) `<768px` (mobile)
- `.chat-sidebar`: off-canvas + overlay (แบบปัจจุบัน)
  - เปิดจากปุ่ม hamburger ใน header
  - ปิดเมื่อเลือก user หรือกด overlay
- `.order-sidebar`: drawer + overlay (แบบปัจจุบัน)
- `.chat-header-right`:
  - แสดง: Orders + More (และอาจมี Clear chat เป็น action ใน menu เท่านั้น)
- composer:
  - `textarea` ต้อง font-size 16px เพื่อกัน iOS auto-zoom
  - ปุ่ม icon ต้อง ≥44px

---

## 6) Component Spec

### 6.1 Left Sidebar (User List)

**โครง/องค์ประกอบ**
- Header: ชื่อ “แชท” + badge จำนวนผู้ใช้ + ปุ่มปิด (mobile)
- Search: input + filter button (มี badge จำนวน filter)
- Filter panel: สถานะ + tag filters + summary count
- List: user items + loading/empty state

**ข้อกำหนด UX**
- Search ต้อง debounce (เชิง UX) หรืออย่างน้อยไม่ทำให้ UI กระตุกเมื่อพิมพ์เร็ว
- Filter panel:
  - เปิด/ปิดด้วยปุ่มเดียว
  - กด `Esc` ต้องปิด (มีแล้ว) และ focus กลับปุ่ม filter
  - บน mobile: panel ไม่ควรยาวจนดัน list หาย; ถ้ายาวให้ scroll ภายใน panel
- User item:
  - แสดง: avatar, ชื่อ, เวลา, last message, badges/tags, unread
  - touch target: สูงขั้นต่ำ ~64–72px บน mobile, padding กว้างพอ
  - สถานะ dot ที่พึ่ง hover tooltip ให้มีทางเลือกบน touch:
    - อย่างน้อย `aria-label` บนจุดสถานะ หรือสรุปสถานะเป็น icon/chip ในแถวเดียวกัน

### 6.2 Chat Header (Main)

**องค์ประกอบ**
- Left: (mobile) toggle sidebar + avatar + ชื่อ + meta (จำนวนข้อความ/สถานะ)
- Right: actions

**กติกา action**
- Desktop (`>=992`): แสดง action ได้มากขึ้น แต่ต้องไม่ล้นแนวนอน; ถ้าล้นให้ wrap หรือรวมใน overflow
- Tablet/mobile (`<992`): ใช้ overflow menu เป็นค่าเริ่มต้น

**กลุ่ม action ที่แนะนำ**
- Primary: Orders, Manage Tags/Notes (ถ้าใช้บ่อย), Toggle AI
- Secondary: Refresh Profile
- Destructive: Clear chat (ต้อง confirm และอยู่ใน overflow menu บนจอเล็ก)

### 6.3 Messages

**กติกาการอ่าน**
- Bubble max-width: desktop 520px; mobile ขยายเป็น 85–90% ตามที่มีแล้ว
- Typography: ขนาดตัวอักษร message ควรชัด (mobile แนะนำ 15–16px)
- Separator วันที่ต้องมองเห็นได้แต่ไม่รบกวน (ใช้สี text-muted + เส้นแบ่ง)

**รูปภาพ**
- คลิก/Enter ที่รูปต้องเปิด modal ได้ (มีแล้ว)
- รูปต้องไม่ทำให้เกิด horizontal scroll; ใช้ `max-width: 100%`

### 6.4 Composer (Message Input Area)

**องค์ประกอบ**
- ปุ่ม: templates, extract order, emoji, send
- textarea auto-resize
- footer: char counter + hints

**ข้อกำหนดบน mobile**
- `textarea` font-size >= 16px
- ปุ่ม icon (รวม send) มี hitbox ≥44px
- footer hints อาจซ่อน/ย่อ เพื่อประหยัดพื้นที่

### 6.5 Orders Sidebar (Right)

**โหมด**
- docked (xl+)
- collapsed (lg default)
- drawer (md-/mobile)

**ข้อกำหนด**
- เมื่อ collapsed ต้องมี affordance ชัด (ไอคอน/tooltip/aria) ว่า “กดเพื่อขยาย”
- ใน drawer mode:
  - เปิดจากปุ่ม Orders ใน header
  - ปิดด้วย overlay, ปุ่มปิด/ย้อนกลับ, และ `Esc`

### 6.6 Modals (Image/Tags/Templates/Notes/Order Edit)

**ข้อกำหนด**
- ขนาด modal บน mobile ต้องไม่เกิน viewport และมี scroll ภายใน
- ปุ่มสำคัญใน modal ต้องมีข้อความ/ไอคอนชัด + กดง่าย
- ฟอนต์/spacing ใช้ตัวแปร theme เป็นหลัก

---

## 7) Accessibility Requirements (ขั้นต่ำ)

1. Keyboard:
   - user item กด Enter/Space ได้ (มีแล้ว)
   - filter panel เปิดแล้ว focus ได้ (มีแล้ว) + `Esc` ปิดได้ (มีแล้ว)
   - drawer/off-canvas: `Esc` ปิดได้ + ไม่ทำให้ focus “หลุดไปหลัง overlay”
2. Focus:
   - ใช้ `:focus-visible` หรืออย่างน้อยต้องเห็น focus ring ชัดกับทุกปุ่ม icon-only
3. Touch targets:
   - action/icon buttons ≥44×44px บน mobile
4. Hover-only tooltip:
   - ต้องมี alternative สำหรับ touch (aria-label หรือแสดงสถานะในรูปแบบ non-hover)

---

## 8) Performance Requirements (ขั้นต่ำ)

- การพิมพ์ search ไม่ควรกระตุก (หลีกเลี่ยง rerender หนัก ๆ ทุก keypress ถ้ารายชื่อยาว)
- การเปิดแชทที่มีข้อความยาวมาก:
  - render ต้องไม่ freeze หน้าจอ (ถ้าเริ่มช้า ให้ทำ phase ถัดไป: incremental render/virtualize)
- การ scroll ไปท้ายแชทต้องทำงานคงที่ และไม่ “สู้กับ” การ scroll ของผู้ใช้

---

## 9) Acceptance Criteria (ใช้ตรวจรับงาน)

### 9.1 Visual / Layout

- ไม่มี horizontal scroll ที่ body ในทุก breakpoint (ยกเว้น intentionally ใน content ภายใน)
- `>=1200`: 3 พาเนลเห็นครบ, ข้อความไม่แคบเกิน, header actions ไม่ล้น
- `992–1199`: orders default collapsed, ยังใช้งาน orders ได้ครบ
- `768–991`: มี user list docked, orders เปิดเป็น drawer, header actions ไม่ล้น (มี overflow menu)
- `<768`: user list off-canvas ทำงาน, orders drawer ทำงาน, composer ไม่โดนคีย์บอร์ดบัง

### 9.2 Interaction

- เลือก user แล้ว (mobile) sidebar ปิดเองเสมอ
- เปิด/ปิด drawer ด้วย overlay และ `Esc` ได้
- ปุ่มอันตราย (clear chat) ต้อง confirm และไม่คลิกพลาดง่ายบนจอเล็ก

### 9.3 A11y

- Tab เดินถึง control สำคัญทั้งหมด (sidebar toggle, search, filter, user list, composer, send, orders)
- ทุกปุ่ม icon-only มี label (aria-label หรือ title ที่เหมาะสม)

---

## 10) Rollout Plan (แนะนำ)

1) Phase A — Layout + breakpoints + overflow menu (แก้ปัญหา “ล้น/แคบ” ก่อน)  
2) Phase B — Polish typography/spacing + touch targets + safe-area/viewport height  
3) Phase C — A11y hardening + ปรับ perf เฉพาะจุด (ถ้ารายชื่อ/ข้อความเยอะ)

