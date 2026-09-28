# LINE OA ↔ ERP — ขั้นตอนเปิดใช้งาน

## ค่าที่ตั้งไว้แล้ว
| รายการ | ค่า |
|---|---|
| LINE OA | @cscreen639 (Provider: CSCREEN) |
| Messaging API channel ID | 2009089312 |
| LINE Login channel ID | 2011775359 (Published, ผูกกับ @cscreen639) |
| LIFF ID (ฟอร์มขอใบเสนอราคา) | 2011775359-RT9vNCXi |
| LIFF URL | https://liff.line.me/2011775359-RT9vNCXi |

## 1. Supabase
SQL Editor → รัน `supabase/migration_v10.sql`

## 2. Vercel → Settings → Environment Variables (Production)
| ชื่อ | ค่า / ที่มา |
|---|---|
| `NEXT_PUBLIC_LIFF_ID_QUOTE` | `2011775359-RT9vNCXi` |
| `LINE_LOGIN_CHANNEL_ID` | `2011775359` |
| `LINE_CHANNEL_SECRET` | LINE OA Manager → ตั้งค่า → Messaging API → ความลับแชนแนล |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developers → channel 2009089312 → Messaging API → Channel access token (long-lived) → Issue |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → service_role (ห้ามใส่ใน NEXT_PUBLIC_*) |

แล้ว Redeploy

## 3. Webhook
LINE Developers → channel 2009089312 → Messaging API
- Webhook URL: `https://cscreen.vercel.app/api/line/webhook` → Verify
- Use webhook: เปิด
- Auto-reply / Greeting: ปล่อยให้ OA Manager จัดการต่อ (webhook ตอบเฉพาะคำว่า "สถานะ" / JO-xxxx)

## 4. Rich Menu
เปลี่ยนปุ่ม A "ขอใบเสนอราคา" จาก ข้อความ → ลิงก์ `https://liff.line.me/2011775359-RT9vNCXi`

## การทำงาน
- ลูกค้ากรอกฟอร์ม → `line_leads` → แอดมินเห็นที่เมนู **คำขอจาก LINE** → "เปิดลูกค้าใหม่" หรือ "ผูกลูกค้าเดิม"
- ลูกค้าที่ผูกแล้ว: เมื่อเปลี่ยนสถานะ Job Order เป็น รอออกแบบ / กำลังสกรีน / แพ็คพร้อมส่ง / ส่งงานแล้ว → ส่งการ์ดแจ้งทาง LINE อัตโนมัติ (ไม่ส่งซ้ำ)
- ลูกค้าพิมพ์ "สถานะ" หรือ "JO-0012" → ตอบสถานะงานของตัวเองเท่านั้น
- Push message นับโควต้าแพ็กเกจ LINE OA (ฟรี 300 ข้อความ/เดือน)
