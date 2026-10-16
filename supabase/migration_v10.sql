-- Migration v10: LINE OA integration
-- วิธีใช้: Supabase Dashboard → SQL Editor → วางทั้งหมด → Run

-- ผูกลูกค้ากับ LINE (userId จาก LINE Login / LIFF)
alter table customers add column if not exists line_user_id text;
create unique index if not exists customers_line_user_id_key
  on customers (line_user_id) where line_user_id is not null;

-- สถานะล่าสุดที่แจ้งลูกค้าทาง LINE แล้ว (กันส่งซ้ำ)
alter table job_orders add column if not exists line_notified_status text;

-- คำขอใบเสนอราคาจากฟอร์มใน LINE
create table if not exists line_leads (
  id            uuid primary key default gen_random_uuid(),
  line_user_id  text not null,
  display_name  text,
  contact_name  text,
  phone         text,
  company       text,
  product       text,          -- โปโล | เสื้อยืด | พิมพ์ลาย | เสื้อทำงาน | อื่นๆ
  qty           integer,
  method        text,          -- สกรีน | ปัก | ยังไม่แน่ใจ
  positions     text,
  color         text,
  need_date     date,
  note          text,
  status        text default 'ใหม่',   -- ใหม่ | ติดต่อแล้ว | เปิดลูกค้าแล้ว | ปิด
  customer_id   uuid references customers(id) on delete set null,
  created_at    timestamptz default now()
);

alter table line_leads enable row level security;
drop policy if exists "auth_all_line_leads" on line_leads;
create policy "auth_all_line_leads" on line_leads
  for all to authenticated using (true) with check (true);
