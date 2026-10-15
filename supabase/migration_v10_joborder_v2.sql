-- ═══════════════════════════════════════════════════════════════════
-- Migration v10: ใบงานแบบใหม่ (1 ใบงาน = 1 รายการใน Invoice)
--
-- ปลอดภัยกับข้อมูลเดิม:
--   • เพิ่มคอลัมน์/ตารางใหม่เท่านั้น ไม่ลบ ไม่เปลี่ยนชนิดคอลัมน์เดิม
--   • ใบงานเก่า (items.type = 'size_matrix') ยังเปิด/แก้ได้ตามเดิม
--   • รันซ้ำได้ (if not exists)
-- วิธีรัน: Supabase Dashboard → SQL Editor → วางทั้งไฟล์ → Run
-- ═══════════════════════════════════════════════════════════════════

-- 1) job_orders: ผูกกับ "รายการที่ n" ของ Invoice + ข้อมูลเสริม
alter table job_orders add column if not exists invoice_item_no int;          -- รายการที่เท่าไรใน Invoice (เริ่มที่ 1)
alter table job_orders add column if not exists urgent          boolean default false;
alter table job_orders add column if not exists drive_folder_id text;         -- โฟลเดอร์ Drive ของใบงาน (QR บนใบพิมพ์)
alter table job_orders add column if not exists created_by      text;         -- อีเมลผู้สร้าง

-- กันสร้างใบงานซ้ำจากรายการเดิมของ Invoice เดียวกัน (ใบงานเก่าที่ไม่มี invoice_item_no ไม่โดนบังคับ)
create unique index if not exists job_orders_invoice_item_uniq
  on job_orders (invoice_id, invoice_item_no)
  where invoice_id is not null and invoice_item_no is not null;

-- 2) แผนการผลิต: ขั้นตอนเพิ่ม/ลบ/เรียงเองได้ แต่ละขั้นเลือก Supplier ได้
create table if not exists job_steps (
  id            uuid primary key default gen_random_uuid(),
  job_order_id  uuid not null references job_orders(id) on delete cascade,
  seq           int  not null default 1,
  name          text not null,
  phase         text not null default 'ผลิต',        -- ออกแบบ | จัดซื้อ | ผลิต | QC | ส่งมอบ
  supplier_id   uuid references suppliers(id) on delete set null,
  assignee      text,                                 -- ผู้รับผิดชอบภายใน (ถ้าไม่ใช่ Supplier)
  sent_date     date,
  due_date      date,
  received_date date,
  status        text not null default 'รอเริ่ม',     -- รอเริ่ม | ส่งงานแล้ว | กำลังผลิต | รอตรวจ | ต้องแก้ไข | เสร็จแล้ว | ยกเลิก
  note          text,
  updated_at    timestamptz default now(),
  updated_by    text,
  created_at    timestamptz default now()
);
create index if not exists job_steps_job_idx on job_steps (job_order_id, seq);

-- 3) ประวัติการเปลี่ยนสถานะ (ใคร / เมื่อไร / จากอะไรเป็นอะไร)
create table if not exists job_step_logs (
  id            uuid primary key default gen_random_uuid(),
  job_order_id  uuid not null references job_orders(id) on delete cascade,
  step_id       uuid references job_steps(id) on delete set null,
  step_name     text,
  from_status   text,
  to_status     text,
  detail        text,
  changed_by    text,                                 -- อีเมลผู้แก้ไข
  changed_at    timestamptz default now()
);
create index if not exists job_step_logs_job_idx on job_step_logs (job_order_id, changed_at desc);

-- 4) ไฟล์งาน: ประเภท + เวอร์ชัน + ฉบับที่อนุมัติ
create table if not exists job_files (
  id            uuid primary key default gen_random_uuid(),
  job_order_id  uuid not null references job_orders(id) on delete cascade,
  kind          text not null,                        -- mockup | logo | artwork | pattern | reference | finished
  side          text,                                 -- front | back (เฉพาะ Mockup)
  name          text,
  url           text not null,                        -- ลิงก์เปิดดู
  thumb_url     text,                                 -- รูปย่อ (ถ้าเป็นรูป)
  mime          text,
  version       int  not null default 1,
  approved      boolean not null default false,
  note          text,
  uploaded_by   text,
  created_at    timestamptz default now()
);
create index if not exists job_files_job_idx on job_files (job_order_id, kind, version desc);

-- 5) สิทธิ์: เหมือนตารางอื่นในระบบ — ผู้ใช้ที่ล็อกอินแล้วเท่านั้น
alter table job_steps     enable row level security;
alter table job_step_logs enable row level security;
alter table job_files     enable row level security;

drop policy if exists "auth_all_job_steps"     on job_steps;
drop policy if exists "auth_all_job_files"     on job_files;
create policy "auth_all_job_steps"     on job_steps     for all to authenticated using (true) with check (true);
-- ประวัติ: อ่าน + เพิ่มได้อย่างเดียว (แก้/ลบย้อนหลังไม่ได้ เพื่อให้ตรวจสอบได้จริง)
drop policy if exists "auth_read_job_step_logs"   on job_step_logs;
drop policy if exists "auth_insert_job_step_logs" on job_step_logs;
create policy "auth_read_job_step_logs"   on job_step_logs for select to authenticated using (true);
create policy "auth_insert_job_step_logs" on job_step_logs for insert to authenticated with check (true);
create policy "auth_all_job_files"     on job_files     for all to authenticated using (true) with check (true);
