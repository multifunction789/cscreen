# ฐานข้อมูล (Supabase)

- `migrations/` — ทุกการเปลี่ยนแปลงฐานข้อมูลตั้งแต่ 16 ต.ค. 2569 เรียงตามเวลาในชื่อไฟล์
  - `20261016000000_baseline.sql` = schema จริงของ production ณ วันนั้น (ตาราง, constraint, index, ฟังก์ชัน, trigger, RLS, policy) — **ไฟล์ generate ห้ามแก้มือ**
  - ไฟล์ถัดไป = การเปลี่ยนแปลงแบบเดินหน้าอย่างเดียว (forward-only)
- `migration_v*.sql`, `schema.sql` — ไฟล์เก่าก่อนมี baseline เก็บไว้อ้างอิง ไม่ต้องรันอีก
- `tests/` — stub ของ Supabase สำหรับทดสอบในเครื่อง + ชุดทดสอบ `*.test.sql`

## กฎ
1. ห้ามแก้ schema ใน Dashboard ตรงๆ — เขียน migration ใหม่ใน repo เสมอ
2. ทดสอบก่อน: `npm run test:db` (รันทุก migration 2 รอบบน Postgres ชั่วคราว + ทดสอบสิทธิ์ทุกบทบาท)
3. สำรองข้อมูลก่อนรันบน production ทุกครั้ง
4. ย้อนกลับ = ย้อนโค้ด (Vercel Instant Rollback) หรือเขียน repair migration ใหม่ — ไม่ drop ตาราง/คอลัมน์ที่มีข้อมูลจริง

## อัปเดต baseline (ถ้า schema ถูกแก้นอก repo)
1. รัน `scripts/db/dump-schema.sql` ใน SQL editor → บันทึกผลเป็น `snapshot.json`
2. `python3 scripts/db/render-baseline.py snapshot.json > supabase/migrations/<เวลา>_resync.sql`
3. `npm run test:db`

## Ops scripts (`supabase/ops/`)

Environment-specific SQL that is not replayed by `npm run test:db`:

- `worker_cron.sql` — every minute, Supabase Cron calls `https://cscreen.vercel.app/api/worker`
  to retry chat background tasks (LINE profile names, customer photos/files). Run once after
  the phase 4 migration.
