-- Migration v3 — รันใน Supabase SQL Editor
alter table quotations add column if not exists items      jsonb default '[]';
alter table invoices   add column if not exists wht_pct    numeric default 0;
alter table invoices   add column if not exists wht_amount numeric default 0;
alter table invoices   add column if not exists jo_created boolean default false;
alter table suppliers  add column if not exists address    text;
alter table suppliers  add column if not exists tax_id     text;
alter table job_orders add column if not exists updated_at timestamptz;
alter table job_orders add column if not exists items      jsonb default '[]';
