-- ============================================================
-- CSCREEN Migration v2 — รันใน Supabase SQL Editor
-- ============================================================

-- 1. เพิ่ม columns ใน customers
alter table customers add column if not exists tax_id   text;
alter table customers add column if not exists platform text;
alter table customers add column if not exists notes    text;
alter table customers add column if not exists line     text;

-- 2. สร้าง invoices table ก่อน (ต้องมีก่อนที่ job_orders จะ reference ได้)
create table if not exists invoices (
  id           uuid primary key default gen_random_uuid(),
  code         text unique not null,
  customer_id  uuid references customers(id) on delete set null,
  quotation_id uuid references quotations(id) on delete set null,
  items        jsonb default '[]',
  subtotal     numeric default 0,
  discount     numeric default 0,
  vat_pct      numeric default 0,
  vat_amount   numeric default 0,
  total        numeric default 0,
  status       text default 'รอชำระ',
  due_date     date,
  notes        text,
  created_at   timestamptz default now()
);

-- 3. เพิ่ม columns ใน job_orders (หลังจาก invoices มีอยู่แล้ว)
alter table job_orders add column if not exists qty        numeric default 0;
alter table job_orders add column if not exists unit_price numeric default 0;
alter table job_orders add column if not exists invoice_id uuid references invoices(id) on delete set null;

-- 4. เพิ่ม invoice_id ใน receipts และ transactions
alter table receipts     add column if not exists invoice_id uuid references invoices(id) on delete set null;
alter table transactions add column if not exists invoice_id uuid references invoices(id) on delete set null;

-- 5. settings table (สำหรับ supplier categories)
create table if not exists settings (
  key   text primary key,
  value jsonb
);
insert into settings (key, value)
values ('supplier_categories', '["เสื้อผ้า","หมึก / สี","อุปกรณ์","ถุงผ้า","อื่น ๆ"]')
on conflict (key) do nothing;

-- 6. RLS
alter table invoices enable row level security;
alter table settings  enable row level security;

drop policy if exists "auth_all_invoices" on invoices;
create policy "auth_all_invoices" on invoices
  for all to authenticated using (true) with check (true);

drop policy if exists "auth_all_settings" on settings;
create policy "auth_all_settings" on settings
  for all to authenticated using (true) with check (true);
