-- ═══════════════════════════════════════════════════════════════════
-- Baseline: production schema snapshot (generated — do not edit by hand)
-- Source : scripts/db/dump-schema.sql → scripts/db/render-baseline.py
-- Safe to replay: every statement is IF NOT EXISTS / OR REPLACE / guarded.
-- ═══════════════════════════════════════════════════════════════════

-- Extensions
create extension if not exists "pg_stat_statements" with schema extensions;
create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

-- Tables
create table if not exists public.brands (
  id uuid default gen_random_uuid() not null,
  code text not null,
  name text not null,
  legal_name text,
  address text,
  tax_id text,
  phone text,
  email text,
  logo_url text,
  bank_account jsonb,
  theme jsonb,
  footer_note text,
  is_default boolean default false not null,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null
);
create table if not exists public.cost_items (
  id uuid default gen_random_uuid() not null,
  item_name text not null,
  supplier_id uuid,
  buy_price numeric not null,
  sell_price numeric not null,
  is_best boolean default false,
  created_at timestamp with time zone default now(),
  item_type text
);
create table if not exists public.customers (
  id uuid default gen_random_uuid() not null,
  code text not null,
  name text not null,
  type text default 'บุคคลธรรมดา'::text,
  contact text,
  phone text,
  email text,
  address text,
  created_at timestamp with time zone default now(),
  tax_id text,
  platform text,
  notes text,
  line text,
  contact_person text,
  drive_folder_id text,
  line_user_id text
);
create table if not exists public.document_sequences (
  doc_type text not null,
  period text not null,
  last_number integer default 0 not null
);
create table if not exists public.invoices (
  id uuid default gen_random_uuid() not null,
  code text not null,
  customer_id uuid,
  quotation_id uuid,
  items jsonb default '[]'::jsonb,
  subtotal numeric default 0,
  discount numeric default 0,
  vat_pct numeric default 0,
  vat_amount numeric default 0,
  total numeric default 0,
  status text default 'รอชำระ'::text,
  due_date date,
  notes text,
  created_at timestamp with time zone default now(),
  wht_pct numeric default 0,
  wht_amount numeric default 0,
  jo_created boolean default false,
  wht_file_url text,
  document_date date default CURRENT_DATE,
  deposit_pct numeric default 50,
  deposit_amount numeric default 0
);
create table if not exists public.job_attachments (
  id uuid default gen_random_uuid() not null,
  job_order_id uuid not null,
  kind text not null,
  side text,
  name text,
  url text not null,
  thumb_url text,
  mime text,
  version integer default 1 not null,
  approved boolean default false not null,
  note text,
  uploaded_by text,
  created_at timestamp with time zone default now()
);
create table if not exists public.job_files (
  id uuid default gen_random_uuid() not null,
  customer_id uuid,
  job_order_id uuid,
  file_type text not null,
  file_name text not null,
  drive_file_id text,
  drive_folder_id text,
  url text not null,
  uploaded_by uuid,
  uploaded_at timestamp with time zone default now() not null
);
create table if not exists public.job_order_items (
  id uuid default gen_random_uuid() not null,
  job_order_id uuid not null,
  seq integer default 0 not null,
  style_name text,
  fabric_type text,
  shirt_color text,
  screen_color text,
  technique text,
  print_position text,
  color_count integer,
  unit_price numeric(12,2),
  note text,
  created_at timestamp with time zone default now() not null,
  quantity numeric default 0 not null,
  unit text default 'ชิ้น'::text not null,
  source_data jsonb,
  production_details jsonb
);
create table if not exists public.job_order_variants (
  id uuid default gen_random_uuid() not null,
  job_order_item_id uuid not null,
  size_label text not null,
  qty integer default 0 not null,
  created_at timestamp with time zone default now() not null
);
create table if not exists public.job_orders (
  id uuid default gen_random_uuid() not null,
  code text not null,
  customer_id uuid,
  item_desc text,
  status text default 'รอมัดจำ'::text,
  total numeric default 0,
  deposit numeric default 0,
  due_date date,
  note text,
  created_at timestamp with time zone default now(),
  qty numeric default 0,
  unit_price numeric default 0,
  invoice_id uuid,
  updated_at timestamp with time zone,
  items jsonb default '[]'::jsonb,
  image_url text,
  document_date date default CURRENT_DATE,
  design_detail jsonb,
  reference_url text,
  job_status text default 'Active'::text not null,
  payment_status text default 'Unpaid'::text not null,
  artwork_status text default 'Not Started'::text not null,
  production_status text default 'Waiting'::text not null,
  next_action text,
  quotation_id uuid,
  assigned_to uuid,
  brand_id uuid,
  created_by uuid,
  is_urgent boolean default false not null,
  artwork_due_date date,
  problem_note text,
  sales_subtotal numeric(12,2),
  discount numeric(12,2) default 0 not null,
  sales_amount numeric(12,2),
  vat_amount numeric(12,2) default 0 not null,
  sales_total numeric(12,2),
  revision integer default 0 not null,
  legacy_invoice_duplicate boolean default false not null,
  legacy_snapshot jsonb,
  line_notified_status text,
  invoice_item_no integer,
  urgent boolean default false,
  drive_folder_id text
);
create table if not exists public.job_status_history (
  id uuid default gen_random_uuid() not null,
  job_order_id uuid not null,
  field_changed text not null,
  previous_value text,
  new_value text,
  note text,
  changed_by uuid,
  changed_at timestamp with time zone default now() not null
);
create table if not exists public.job_step_logs (
  id uuid default gen_random_uuid() not null,
  job_order_id uuid not null,
  step_id uuid,
  step_name text,
  from_status text,
  to_status text,
  detail text,
  changed_by text,
  changed_at timestamp with time zone default now()
);
create table if not exists public.job_steps (
  id uuid default gen_random_uuid() not null,
  job_order_id uuid not null,
  seq integer default 1 not null,
  name text not null,
  phase text default 'ผลิต'::text not null,
  supplier_id uuid,
  assignee text,
  sent_date date,
  due_date date,
  received_date date,
  status text default 'รอเริ่ม'::text not null,
  note text,
  updated_at timestamp with time zone default now(),
  updated_by text,
  created_at timestamp with time zone default now()
);
create table if not exists public.line_leads (
  id uuid default gen_random_uuid() not null,
  line_user_id text not null,
  display_name text,
  contact_name text,
  phone text,
  company text,
  product text,
  qty integer,
  method text,
  positions text,
  color text,
  need_date date,
  note text,
  status text default 'ใหม่'::text,
  customer_id uuid,
  created_at timestamp with time zone default now()
);
create table if not exists public.materials (
  id uuid default gen_random_uuid() not null,
  code text not null,
  name text not null,
  category text,
  unit text default 'ตัว'::text,
  qty numeric default 0,
  min_qty numeric default 0,
  cost_per_unit numeric default 0,
  created_at timestamp with time zone default now()
);
create table if not exists public.profiles (
  id uuid not null,
  full_name text default ''::text not null,
  role text default 'sales'::text not null,
  is_active boolean default false not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);
create table if not exists public.quotations (
  id uuid default gen_random_uuid() not null,
  code text not null,
  customer_id uuid,
  item_desc text,
  total numeric default 0,
  status text default 'รออนุมัติ'::text,
  valid_until date,
  job_order_id uuid,
  created_at timestamp with time zone default now(),
  items jsonb default '[]'::jsonb,
  document_date date default CURRENT_DATE,
  subtotal numeric default 0,
  discount numeric default 0,
  vat_pct numeric default 0,
  vat_amount numeric default 0,
  notes text,
  brand_id uuid,
  due_date date
);
create table if not exists public.receipts (
  id uuid default gen_random_uuid() not null,
  code text not null,
  customer_id uuid,
  job_order_id uuid,
  total numeric default 0,
  paid boolean default false,
  payment_method text,
  paid_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  invoice_id uuid,
  file_url text,
  document_date date default CURRENT_DATE,
  request_id uuid
);
create table if not exists public.settings (
  key text not null,
  value jsonb
);
create table if not exists public.stock_in (
  id uuid default gen_random_uuid() not null,
  code text not null,
  material_id uuid,
  supplier_id uuid,
  qty numeric not null,
  cost_per_unit numeric not null,
  total numeric not null,
  note text,
  received_by text default 'คุณปลา'::text,
  received_at date default CURRENT_DATE,
  created_at timestamp with time zone default now(),
  category text,
  image_url text,
  shipping_cost numeric default 0,
  item_name text,
  vat_pct numeric default 0,
  lot_number text
);
create table if not exists public.stock_movements (
  id uuid default gen_random_uuid() not null,
  request_id uuid not null,
  material_id uuid not null,
  job_order_id uuid,
  stock_in_id uuid,
  kind text not null,
  qty_change numeric not null,
  balance_after numeric not null,
  note text,
  created_by uuid,
  created_at timestamp with time zone default now() not null
);
create table if not exists public.suppliers (
  id uuid default gen_random_uuid() not null,
  code text not null,
  name text not null,
  category text,
  contact text,
  phone text,
  email text,
  rating integer default 3,
  notes text,
  created_at timestamp with time zone default now(),
  address text,
  tax_id text
);
create table if not exists public.transactions (
  id uuid default gen_random_uuid() not null,
  code text not null,
  description text,
  type text not null,
  amount numeric not null,
  category text,
  job_order_id uuid,
  transaction_date date default CURRENT_DATE,
  created_at timestamp with time zone default now(),
  invoice_id uuid,
  note text,
  supplier_id uuid,
  receipt_id uuid
);

-- Columns added after a table first existed (keeps replay on older copies safe)
alter table public.brands add column if not exists id uuid default gen_random_uuid();
alter table public.brands add column if not exists code text;
alter table public.brands add column if not exists name text;
alter table public.brands add column if not exists legal_name text;
alter table public.brands add column if not exists address text;
alter table public.brands add column if not exists tax_id text;
alter table public.brands add column if not exists phone text;
alter table public.brands add column if not exists email text;
alter table public.brands add column if not exists logo_url text;
alter table public.brands add column if not exists bank_account jsonb;
alter table public.brands add column if not exists theme jsonb;
alter table public.brands add column if not exists footer_note text;
alter table public.brands add column if not exists is_default boolean default false;
alter table public.brands add column if not exists is_active boolean default true;
alter table public.brands add column if not exists created_at timestamp with time zone default now();
alter table public.cost_items add column if not exists id uuid default gen_random_uuid();
alter table public.cost_items add column if not exists item_name text;
alter table public.cost_items add column if not exists supplier_id uuid;
alter table public.cost_items add column if not exists buy_price numeric;
alter table public.cost_items add column if not exists sell_price numeric;
alter table public.cost_items add column if not exists is_best boolean default false;
alter table public.cost_items add column if not exists created_at timestamp with time zone default now();
alter table public.cost_items add column if not exists item_type text;
alter table public.customers add column if not exists id uuid default gen_random_uuid();
alter table public.customers add column if not exists code text;
alter table public.customers add column if not exists name text;
alter table public.customers add column if not exists type text default 'บุคคลธรรมดา'::text;
alter table public.customers add column if not exists contact text;
alter table public.customers add column if not exists phone text;
alter table public.customers add column if not exists email text;
alter table public.customers add column if not exists address text;
alter table public.customers add column if not exists created_at timestamp with time zone default now();
alter table public.customers add column if not exists tax_id text;
alter table public.customers add column if not exists platform text;
alter table public.customers add column if not exists notes text;
alter table public.customers add column if not exists line text;
alter table public.customers add column if not exists contact_person text;
alter table public.customers add column if not exists drive_folder_id text;
alter table public.customers add column if not exists line_user_id text;
alter table public.document_sequences add column if not exists doc_type text;
alter table public.document_sequences add column if not exists period text;
alter table public.document_sequences add column if not exists last_number integer default 0;
alter table public.invoices add column if not exists id uuid default gen_random_uuid();
alter table public.invoices add column if not exists code text;
alter table public.invoices add column if not exists customer_id uuid;
alter table public.invoices add column if not exists quotation_id uuid;
alter table public.invoices add column if not exists items jsonb default '[]'::jsonb;
alter table public.invoices add column if not exists subtotal numeric default 0;
alter table public.invoices add column if not exists discount numeric default 0;
alter table public.invoices add column if not exists vat_pct numeric default 0;
alter table public.invoices add column if not exists vat_amount numeric default 0;
alter table public.invoices add column if not exists total numeric default 0;
alter table public.invoices add column if not exists status text default 'รอชำระ'::text;
alter table public.invoices add column if not exists due_date date;
alter table public.invoices add column if not exists notes text;
alter table public.invoices add column if not exists created_at timestamp with time zone default now();
alter table public.invoices add column if not exists wht_pct numeric default 0;
alter table public.invoices add column if not exists wht_amount numeric default 0;
alter table public.invoices add column if not exists jo_created boolean default false;
alter table public.invoices add column if not exists wht_file_url text;
alter table public.invoices add column if not exists document_date date default CURRENT_DATE;
alter table public.invoices add column if not exists deposit_pct numeric default 50;
alter table public.invoices add column if not exists deposit_amount numeric default 0;
alter table public.job_attachments add column if not exists id uuid default gen_random_uuid();
alter table public.job_attachments add column if not exists job_order_id uuid;
alter table public.job_attachments add column if not exists kind text;
alter table public.job_attachments add column if not exists side text;
alter table public.job_attachments add column if not exists name text;
alter table public.job_attachments add column if not exists url text;
alter table public.job_attachments add column if not exists thumb_url text;
alter table public.job_attachments add column if not exists mime text;
alter table public.job_attachments add column if not exists version integer default 1;
alter table public.job_attachments add column if not exists approved boolean default false;
alter table public.job_attachments add column if not exists note text;
alter table public.job_attachments add column if not exists uploaded_by text;
alter table public.job_attachments add column if not exists created_at timestamp with time zone default now();
alter table public.job_files add column if not exists id uuid default gen_random_uuid();
alter table public.job_files add column if not exists customer_id uuid;
alter table public.job_files add column if not exists job_order_id uuid;
alter table public.job_files add column if not exists file_type text;
alter table public.job_files add column if not exists file_name text;
alter table public.job_files add column if not exists drive_file_id text;
alter table public.job_files add column if not exists drive_folder_id text;
alter table public.job_files add column if not exists url text;
alter table public.job_files add column if not exists uploaded_by uuid;
alter table public.job_files add column if not exists uploaded_at timestamp with time zone default now();
alter table public.job_order_items add column if not exists id uuid default gen_random_uuid();
alter table public.job_order_items add column if not exists job_order_id uuid;
alter table public.job_order_items add column if not exists seq integer default 0;
alter table public.job_order_items add column if not exists style_name text;
alter table public.job_order_items add column if not exists fabric_type text;
alter table public.job_order_items add column if not exists shirt_color text;
alter table public.job_order_items add column if not exists screen_color text;
alter table public.job_order_items add column if not exists technique text;
alter table public.job_order_items add column if not exists print_position text;
alter table public.job_order_items add column if not exists color_count integer;
alter table public.job_order_items add column if not exists unit_price numeric(12,2);
alter table public.job_order_items add column if not exists note text;
alter table public.job_order_items add column if not exists created_at timestamp with time zone default now();
alter table public.job_order_items add column if not exists quantity numeric default 0;
alter table public.job_order_items add column if not exists unit text default 'ชิ้น'::text;
alter table public.job_order_items add column if not exists source_data jsonb;
alter table public.job_order_items add column if not exists production_details jsonb;
alter table public.job_order_variants add column if not exists id uuid default gen_random_uuid();
alter table public.job_order_variants add column if not exists job_order_item_id uuid;
alter table public.job_order_variants add column if not exists size_label text;
alter table public.job_order_variants add column if not exists qty integer default 0;
alter table public.job_order_variants add column if not exists created_at timestamp with time zone default now();
alter table public.job_orders add column if not exists id uuid default gen_random_uuid();
alter table public.job_orders add column if not exists code text;
alter table public.job_orders add column if not exists customer_id uuid;
alter table public.job_orders add column if not exists item_desc text;
alter table public.job_orders add column if not exists status text default 'รอมัดจำ'::text;
alter table public.job_orders add column if not exists total numeric default 0;
alter table public.job_orders add column if not exists deposit numeric default 0;
alter table public.job_orders add column if not exists due_date date;
alter table public.job_orders add column if not exists note text;
alter table public.job_orders add column if not exists created_at timestamp with time zone default now();
alter table public.job_orders add column if not exists qty numeric default 0;
alter table public.job_orders add column if not exists unit_price numeric default 0;
alter table public.job_orders add column if not exists invoice_id uuid;
alter table public.job_orders add column if not exists updated_at timestamp with time zone;
alter table public.job_orders add column if not exists items jsonb default '[]'::jsonb;
alter table public.job_orders add column if not exists image_url text;
alter table public.job_orders add column if not exists document_date date default CURRENT_DATE;
alter table public.job_orders add column if not exists design_detail jsonb;
alter table public.job_orders add column if not exists reference_url text;
alter table public.job_orders add column if not exists job_status text default 'Active'::text;
alter table public.job_orders add column if not exists payment_status text default 'Unpaid'::text;
alter table public.job_orders add column if not exists artwork_status text default 'Not Started'::text;
alter table public.job_orders add column if not exists production_status text default 'Waiting'::text;
alter table public.job_orders add column if not exists next_action text;
alter table public.job_orders add column if not exists quotation_id uuid;
alter table public.job_orders add column if not exists assigned_to uuid;
alter table public.job_orders add column if not exists brand_id uuid;
alter table public.job_orders add column if not exists created_by uuid;
alter table public.job_orders add column if not exists is_urgent boolean default false;
alter table public.job_orders add column if not exists artwork_due_date date;
alter table public.job_orders add column if not exists problem_note text;
alter table public.job_orders add column if not exists sales_subtotal numeric(12,2);
alter table public.job_orders add column if not exists discount numeric(12,2) default 0;
alter table public.job_orders add column if not exists sales_amount numeric(12,2);
alter table public.job_orders add column if not exists vat_amount numeric(12,2) default 0;
alter table public.job_orders add column if not exists sales_total numeric(12,2);
alter table public.job_orders add column if not exists revision integer default 0;
alter table public.job_orders add column if not exists legacy_invoice_duplicate boolean default false;
alter table public.job_orders add column if not exists legacy_snapshot jsonb;
alter table public.job_orders add column if not exists line_notified_status text;
alter table public.job_orders add column if not exists invoice_item_no integer;
alter table public.job_orders add column if not exists urgent boolean default false;
alter table public.job_orders add column if not exists drive_folder_id text;
alter table public.job_status_history add column if not exists id uuid default gen_random_uuid();
alter table public.job_status_history add column if not exists job_order_id uuid;
alter table public.job_status_history add column if not exists field_changed text;
alter table public.job_status_history add column if not exists previous_value text;
alter table public.job_status_history add column if not exists new_value text;
alter table public.job_status_history add column if not exists note text;
alter table public.job_status_history add column if not exists changed_by uuid;
alter table public.job_status_history add column if not exists changed_at timestamp with time zone default now();
alter table public.job_step_logs add column if not exists id uuid default gen_random_uuid();
alter table public.job_step_logs add column if not exists job_order_id uuid;
alter table public.job_step_logs add column if not exists step_id uuid;
alter table public.job_step_logs add column if not exists step_name text;
alter table public.job_step_logs add column if not exists from_status text;
alter table public.job_step_logs add column if not exists to_status text;
alter table public.job_step_logs add column if not exists detail text;
alter table public.job_step_logs add column if not exists changed_by text;
alter table public.job_step_logs add column if not exists changed_at timestamp with time zone default now();
alter table public.job_steps add column if not exists id uuid default gen_random_uuid();
alter table public.job_steps add column if not exists job_order_id uuid;
alter table public.job_steps add column if not exists seq integer default 1;
alter table public.job_steps add column if not exists name text;
alter table public.job_steps add column if not exists phase text default 'ผลิต'::text;
alter table public.job_steps add column if not exists supplier_id uuid;
alter table public.job_steps add column if not exists assignee text;
alter table public.job_steps add column if not exists sent_date date;
alter table public.job_steps add column if not exists due_date date;
alter table public.job_steps add column if not exists received_date date;
alter table public.job_steps add column if not exists status text default 'รอเริ่ม'::text;
alter table public.job_steps add column if not exists note text;
alter table public.job_steps add column if not exists updated_at timestamp with time zone default now();
alter table public.job_steps add column if not exists updated_by text;
alter table public.job_steps add column if not exists created_at timestamp with time zone default now();
alter table public.line_leads add column if not exists id uuid default gen_random_uuid();
alter table public.line_leads add column if not exists line_user_id text;
alter table public.line_leads add column if not exists display_name text;
alter table public.line_leads add column if not exists contact_name text;
alter table public.line_leads add column if not exists phone text;
alter table public.line_leads add column if not exists company text;
alter table public.line_leads add column if not exists product text;
alter table public.line_leads add column if not exists qty integer;
alter table public.line_leads add column if not exists method text;
alter table public.line_leads add column if not exists positions text;
alter table public.line_leads add column if not exists color text;
alter table public.line_leads add column if not exists need_date date;
alter table public.line_leads add column if not exists note text;
alter table public.line_leads add column if not exists status text default 'ใหม่'::text;
alter table public.line_leads add column if not exists customer_id uuid;
alter table public.line_leads add column if not exists created_at timestamp with time zone default now();
alter table public.materials add column if not exists id uuid default gen_random_uuid();
alter table public.materials add column if not exists code text;
alter table public.materials add column if not exists name text;
alter table public.materials add column if not exists category text;
alter table public.materials add column if not exists unit text default 'ตัว'::text;
alter table public.materials add column if not exists qty numeric default 0;
alter table public.materials add column if not exists min_qty numeric default 0;
alter table public.materials add column if not exists cost_per_unit numeric default 0;
alter table public.materials add column if not exists created_at timestamp with time zone default now();
alter table public.profiles add column if not exists id uuid;
alter table public.profiles add column if not exists full_name text default ''::text;
alter table public.profiles add column if not exists role text default 'sales'::text;
alter table public.profiles add column if not exists is_active boolean default false;
alter table public.profiles add column if not exists created_at timestamp with time zone default now();
alter table public.profiles add column if not exists updated_at timestamp with time zone default now();
alter table public.quotations add column if not exists id uuid default gen_random_uuid();
alter table public.quotations add column if not exists code text;
alter table public.quotations add column if not exists customer_id uuid;
alter table public.quotations add column if not exists item_desc text;
alter table public.quotations add column if not exists total numeric default 0;
alter table public.quotations add column if not exists status text default 'รออนุมัติ'::text;
alter table public.quotations add column if not exists valid_until date;
alter table public.quotations add column if not exists job_order_id uuid;
alter table public.quotations add column if not exists created_at timestamp with time zone default now();
alter table public.quotations add column if not exists items jsonb default '[]'::jsonb;
alter table public.quotations add column if not exists document_date date default CURRENT_DATE;
alter table public.quotations add column if not exists subtotal numeric default 0;
alter table public.quotations add column if not exists discount numeric default 0;
alter table public.quotations add column if not exists vat_pct numeric default 0;
alter table public.quotations add column if not exists vat_amount numeric default 0;
alter table public.quotations add column if not exists notes text;
alter table public.quotations add column if not exists brand_id uuid;
alter table public.quotations add column if not exists due_date date;
alter table public.receipts add column if not exists id uuid default gen_random_uuid();
alter table public.receipts add column if not exists code text;
alter table public.receipts add column if not exists customer_id uuid;
alter table public.receipts add column if not exists job_order_id uuid;
alter table public.receipts add column if not exists total numeric default 0;
alter table public.receipts add column if not exists paid boolean default false;
alter table public.receipts add column if not exists payment_method text;
alter table public.receipts add column if not exists paid_at timestamp with time zone;
alter table public.receipts add column if not exists created_at timestamp with time zone default now();
alter table public.receipts add column if not exists invoice_id uuid;
alter table public.receipts add column if not exists file_url text;
alter table public.receipts add column if not exists document_date date default CURRENT_DATE;
alter table public.receipts add column if not exists request_id uuid;
alter table public.settings add column if not exists key text;
alter table public.settings add column if not exists value jsonb;
alter table public.stock_in add column if not exists id uuid default gen_random_uuid();
alter table public.stock_in add column if not exists code text;
alter table public.stock_in add column if not exists material_id uuid;
alter table public.stock_in add column if not exists supplier_id uuid;
alter table public.stock_in add column if not exists qty numeric;
alter table public.stock_in add column if not exists cost_per_unit numeric;
alter table public.stock_in add column if not exists total numeric;
alter table public.stock_in add column if not exists note text;
alter table public.stock_in add column if not exists received_by text default 'คุณปลา'::text;
alter table public.stock_in add column if not exists received_at date default CURRENT_DATE;
alter table public.stock_in add column if not exists created_at timestamp with time zone default now();
alter table public.stock_in add column if not exists category text;
alter table public.stock_in add column if not exists image_url text;
alter table public.stock_in add column if not exists shipping_cost numeric default 0;
alter table public.stock_in add column if not exists item_name text;
alter table public.stock_in add column if not exists vat_pct numeric default 0;
alter table public.stock_in add column if not exists lot_number text;
alter table public.stock_movements add column if not exists id uuid default gen_random_uuid();
alter table public.stock_movements add column if not exists request_id uuid;
alter table public.stock_movements add column if not exists material_id uuid;
alter table public.stock_movements add column if not exists job_order_id uuid;
alter table public.stock_movements add column if not exists stock_in_id uuid;
alter table public.stock_movements add column if not exists kind text;
alter table public.stock_movements add column if not exists qty_change numeric;
alter table public.stock_movements add column if not exists balance_after numeric;
alter table public.stock_movements add column if not exists note text;
alter table public.stock_movements add column if not exists created_by uuid;
alter table public.stock_movements add column if not exists created_at timestamp with time zone default now();
alter table public.suppliers add column if not exists id uuid default gen_random_uuid();
alter table public.suppliers add column if not exists code text;
alter table public.suppliers add column if not exists name text;
alter table public.suppliers add column if not exists category text;
alter table public.suppliers add column if not exists contact text;
alter table public.suppliers add column if not exists phone text;
alter table public.suppliers add column if not exists email text;
alter table public.suppliers add column if not exists rating integer default 3;
alter table public.suppliers add column if not exists notes text;
alter table public.suppliers add column if not exists created_at timestamp with time zone default now();
alter table public.suppliers add column if not exists address text;
alter table public.suppliers add column if not exists tax_id text;
alter table public.transactions add column if not exists id uuid default gen_random_uuid();
alter table public.transactions add column if not exists code text;
alter table public.transactions add column if not exists description text;
alter table public.transactions add column if not exists type text;
alter table public.transactions add column if not exists amount numeric;
alter table public.transactions add column if not exists category text;
alter table public.transactions add column if not exists job_order_id uuid;
alter table public.transactions add column if not exists transaction_date date default CURRENT_DATE;
alter table public.transactions add column if not exists created_at timestamp with time zone default now();
alter table public.transactions add column if not exists invoice_id uuid;
alter table public.transactions add column if not exists note text;
alter table public.transactions add column if not exists supplier_id uuid;
alter table public.transactions add column if not exists receipt_id uuid;

-- Primary keys
do $$ begin
  alter table public.brands add constraint brands_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.cost_items add constraint cost_items_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.customers add constraint customers_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.document_sequences add constraint document_sequences_pkey PRIMARY KEY (doc_type, period);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.invoices add constraint invoices_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.job_attachments add constraint job_attachments_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.job_files add constraint job_files_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.job_order_items add constraint job_order_items_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.job_order_variants add constraint job_order_variants_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.job_orders add constraint job_orders_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.job_status_history add constraint job_status_history_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.job_step_logs add constraint job_step_logs_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.job_steps add constraint job_steps_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.line_leads add constraint line_leads_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.materials add constraint materials_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.quotations add constraint quotations_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.receipts add constraint receipts_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.settings add constraint settings_pkey PRIMARY KEY (key);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.stock_in add constraint stock_in_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.stock_movements add constraint stock_movements_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.suppliers add constraint suppliers_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.transactions add constraint transactions_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

-- Unique and check constraints
do $$ begin
  alter table public.brands add constraint brands_code_key UNIQUE (code);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.customers add constraint customers_code_key UNIQUE (code);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.document_sequences add constraint document_sequences_doc_type_check CHECK ((doc_type = ANY (ARRAY['JOB'::text, 'PAY'::text, 'QT'::text, 'INV'::text, 'REC'::text])));
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.document_sequences add constraint document_sequences_period_check CHECK ((period ~ '^[0-9]{4}$'::text));
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.invoices add constraint invoices_code_key UNIQUE (code);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.job_files add constraint job_files_file_type_check CHECK ((file_type = ANY (ARRAY['artwork'::text, 'mockup'::text, 'reference'::text, 'production'::text, 'qc'::text, 'customer_document'::text, 'marketing'::text])));
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.job_order_items add constraint job_order_items_quantity_check CHECK ((quantity >= (0)::numeric));
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.job_order_variants add constraint job_order_variants_qty_check CHECK ((qty >= 0));
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.job_orders add constraint job_orders_code_key UNIQUE (code);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.job_orders add constraint job_orders_artwork_status_check CHECK ((artwork_status = ANY (ARRAY['Not Started'::text, 'Designing'::text, 'Waiting Customer Approval'::text, 'Revision'::text, 'Approved'::text])));
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.job_orders add constraint job_orders_job_status_check CHECK ((job_status = ANY (ARRAY['Active'::text, 'On Hold'::text, 'Completed'::text, 'Cancelled'::text])));
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.job_orders add constraint job_orders_payment_status_check CHECK ((payment_status = ANY (ARRAY['Unpaid'::text, 'Partially Paid'::text, 'Paid'::text])));
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.job_orders add constraint job_orders_production_status_check CHECK ((production_status = ANY (ARRAY['Waiting'::text, 'Preparing'::text, 'In Production'::text, 'QC'::text, 'Ready to Deliver'::text, 'Delivered'::text])));
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.materials add constraint materials_code_key UNIQUE (code);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.profiles add constraint profiles_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'sales'::text, 'designer'::text, 'production'::text, 'accounting'::text])));
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.quotations add constraint quotations_code_key UNIQUE (code);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.receipts add constraint receipts_code_key UNIQUE (code);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.receipts add constraint receipts_request_id_key UNIQUE (request_id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.stock_in add constraint stock_in_code_key UNIQUE (code);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.stock_movements add constraint stock_movements_request_id_key UNIQUE (request_id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.stock_movements add constraint stock_movements_kind_check CHECK ((kind = ANY (ARRAY['opening'::text, 'receive'::text, 'issue'::text, 'return'::text])));
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.suppliers add constraint suppliers_code_key UNIQUE (code);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.transactions add constraint transactions_code_key UNIQUE (code);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

-- Foreign keys
do $$ begin
  alter table public.cost_items add constraint cost_items_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.invoices add constraint invoices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.invoices add constraint invoices_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.job_attachments add constraint job_attachments_job_order_id_fkey FOREIGN KEY (job_order_id) REFERENCES job_orders(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.job_files add constraint job_files_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.job_files add constraint job_files_job_order_id_fkey FOREIGN KEY (job_order_id) REFERENCES job_orders(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.job_files add constraint job_files_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES profiles(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.job_order_items add constraint job_order_items_job_order_id_fkey FOREIGN KEY (job_order_id) REFERENCES job_orders(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.job_order_variants add constraint job_order_variants_job_order_item_id_fkey FOREIGN KEY (job_order_item_id) REFERENCES job_order_items(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.job_orders add constraint job_orders_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.job_orders add constraint job_orders_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.job_orders add constraint job_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.job_orders add constraint job_orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.job_orders add constraint job_orders_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.job_orders add constraint job_orders_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.job_status_history add constraint job_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES profiles(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.job_status_history add constraint job_status_history_job_order_id_fkey FOREIGN KEY (job_order_id) REFERENCES job_orders(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.job_step_logs add constraint job_step_logs_job_order_id_fkey FOREIGN KEY (job_order_id) REFERENCES job_orders(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.job_step_logs add constraint job_step_logs_step_id_fkey FOREIGN KEY (step_id) REFERENCES job_steps(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.job_steps add constraint job_steps_job_order_id_fkey FOREIGN KEY (job_order_id) REFERENCES job_orders(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.job_steps add constraint job_steps_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.line_leads add constraint line_leads_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.quotations add constraint quotations_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.quotations add constraint quotations_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.quotations add constraint quotations_job_order_id_fkey FOREIGN KEY (job_order_id) REFERENCES job_orders(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.receipts add constraint receipts_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.receipts add constraint receipts_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.receipts add constraint receipts_job_order_id_fkey FOREIGN KEY (job_order_id) REFERENCES job_orders(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.stock_in add constraint stock_in_material_id_fkey FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.stock_in add constraint stock_in_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.stock_movements add constraint stock_movements_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.stock_movements add constraint stock_movements_job_order_id_fkey FOREIGN KEY (job_order_id) REFERENCES job_orders(id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.stock_movements add constraint stock_movements_material_id_fkey FOREIGN KEY (material_id) REFERENCES materials(id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.stock_movements add constraint stock_movements_stock_in_id_fkey FOREIGN KEY (stock_in_id) REFERENCES stock_in(id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.transactions add constraint transactions_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.transactions add constraint transactions_job_order_id_fkey FOREIGN KEY (job_order_id) REFERENCES job_orders(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.transactions add constraint transactions_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE RESTRICT;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.transactions add constraint transactions_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS customers_line_user_id_key ON public.customers USING btree (line_user_id) WHERE (line_user_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS job_attachments_job_idx ON public.job_attachments USING btree (job_order_id, kind, version DESC);
CREATE UNIQUE INDEX IF NOT EXISTS job_orders_invoice_id_unique ON public.job_orders USING btree (invoice_id) WHERE ((invoice_id IS NOT NULL) AND (NOT legacy_invoice_duplicate) AND (invoice_item_no IS NULL));
CREATE UNIQUE INDEX IF NOT EXISTS job_orders_invoice_item_uniq ON public.job_orders USING btree (invoice_id, invoice_item_no) WHERE ((invoice_id IS NOT NULL) AND (invoice_item_no IS NOT NULL));
CREATE UNIQUE INDEX IF NOT EXISTS job_orders_quotation_id_unique ON public.job_orders USING btree (quotation_id) WHERE (quotation_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS job_step_logs_job_idx ON public.job_step_logs USING btree (job_order_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS job_steps_job_idx ON public.job_steps USING btree (job_order_id, seq);
CREATE UNIQUE INDEX IF NOT EXISTS transactions_receipt_unique ON public.transactions USING btree (receipt_id) WHERE (receipt_id IS NOT NULL);

-- Functions
CREATE OR REPLACE FUNCTION public.confirm_quotation_to_job(p_quotation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare q quotations; jid uuid; iid uuid; it jsonb; sz record; n integer:=0;
begin
  perform workflow_role(array['owner','admin','sales']);
  select * into q from quotations where id=p_quotation_id for update;
  if not found then raise exception 'ไม่พบใบเสนอราคา'; end if;
  select id into jid from job_orders where quotation_id=q.id;
  if jid is not null then return jid; end if;
  if jsonb_typeof(q.items) is distinct from 'array' or jsonb_array_length(q.items)=0 then raise exception 'ใบเสนอราคาไม่มีรายการ'; end if;
  insert into job_orders(code,customer_id,quotation_id,brand_id,item_desc,due_date,note,sales_subtotal,discount,sales_amount,vat_amount,sales_total,total)
  values(next_number('JOB',to_char(now() at time zone 'Asia/Bangkok','YYMM'),'JOB'),q.customer_id,q.id,q.brand_id,
    coalesce(q.item_desc,(select string_agg(value->>'desc',', ') from jsonb_array_elements(q.items))),q.due_date,q.notes,
    q.subtotal,coalesce(q.discount,0),coalesce(q.subtotal,0)-coalesce(q.discount,0),coalesce(q.vat_amount,0),q.total,q.total) returning id into jid;
  for it in select value from jsonb_array_elements(q.items) loop
    insert into job_order_items(job_order_id,seq,style_name,quantity,unit,unit_price,fabric_type,shirt_color,screen_color,technique,print_position,note,source_data,production_details)
    values(jid,n,it->>'desc',coalesce(nullif(it->>'qty','')::numeric,0),coalesce(nullif(it->>'unit',''),'ชิ้น'),nullif(it->>'price','')::numeric,coalesce(it->>'fabric_type',it->'production'->>'fabric_type'),coalesce(it->>'shirt_color',it->'production'->>'shirt_color'),coalesce(it->>'screen_color',it->'production'->>'screen_color'),coalesce(it->>'technique',it->'production'->>'technique'),coalesce(it->>'print_position',it->'production'->>'print_position'),it->>'note',it,it->'production') returning id into iid;
    if jsonb_typeof(it->'sizes')='object' then
      for sz in select key,value from jsonb_each_text(it->'sizes') loop
        if nullif(sz.value,'') is not null then
          if sz.value::numeric<0 or sz.value::numeric<>trunc(sz.value::numeric) then raise exception 'จำนวนไซส์ไม่ถูกต้อง'; end if;
          if sz.value::numeric>0 then insert into job_order_variants(job_order_item_id,size_label,qty) values(iid,sz.key,sz.value::integer); end if;
        end if;
      end loop;
    end if;
    n:=n+1;
  end loop;
  update quotations set status='Confirmed' where id=q.id;
  return jid;
end $function$;

CREATE OR REPLACE FUNCTION public.create_invoice_receipt(p_invoice_id uuid, p_amount numeric, p_request_id uuid DEFAULT gen_random_uuid())
 RETURNS receipts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare inv invoices; rec receipts; reserved numeric;
begin
  perform workflow_role(array['owner','admin','sales','accounting']);
  if p_request_id is null then raise exception 'ไม่มีรหัสคำขอ'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  select * into rec from receipts where request_id=p_request_id;
  if found then
    if rec.invoice_id is distinct from p_invoice_id or rec.total <> round(p_amount,2) then raise exception 'คำขอนี้ถูกใช้กับใบเสร็จอื่นแล้ว'; end if;
    return rec;
  end if;
  select * into inv from invoices where id=p_invoice_id for update;
  if not found then raise exception 'ไม่พบใบแจ้งหนี้'; end if;
  select coalesce(sum(total),0) into reserved from receipts where invoice_id=inv.id;
  if p_amount is null or round(p_amount,2) <= 0 or p_amount::text in ('NaN','Infinity','-Infinity') or round(p_amount,2) > inv.total-reserved then raise exception 'ยอดรับเงินต้องมากกว่าศูนย์และไม่เกินยอดที่ยังไม่ได้ออกใบเสร็จ'; end if;
  insert into receipts(code,invoice_id,customer_id,total,paid,document_date,request_id)
  values(next_number('REC',to_char(now() at time zone 'Asia/Bangkok','YYMM'),'REC'),inv.id,inv.customer_id,round(p_amount,2),false,(now() at time zone 'Asia/Bangkok')::date,p_request_id) returning * into rec;
  return rec;
end $function$;

CREATE OR REPLACE FUNCTION public.create_job_from_invoice(p_invoice_id uuid, p_due_date date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare inv invoices; j job_orders; jid uuid; iid uuid; it jsonb; sz record; n integer:=0; q numeric;
begin
  perform workflow_role(array['owner','admin','sales']);
  select * into inv from invoices where id=p_invoice_id for update;
  if not found then raise exception 'ไม่พบใบแจ้งหนี้'; end if;
  -- Match the quotation lock order used by quotation conversion. The shared
  -- lock stops the two conversion entry points creating independent jobs.
  if inv.quotation_id is not null then perform 1 from quotations where id=inv.quotation_id for update; end if;
  if (select count(*) from job_orders where invoice_id=inv.id)>1 then
    raise exception 'ใบแจ้งหนี้นี้มีใบงานเดิมหลายใบ กรุณาเลือกใบงานจากรายการ';
  end if;
  select * into j from job_orders where invoice_id=inv.id limit 1;
  if found then return j.id; end if;
  if inv.quotation_id is not null then
    select * into j from job_orders where quotation_id=inv.quotation_id for update;
    if found then
      if j.invoice_id is not null then raise exception 'ใบเสนอราคานี้มีใบงานผูกใบแจ้งหนี้อื่นแล้ว'; end if;
      if j.customer_id is distinct from inv.customer_id then raise exception 'ลูกค้าในใบงานและใบแจ้งหนี้ไม่ตรงกัน'; end if;
      update job_orders set invoice_id=inv.id where id=j.id;
      return j.id;
    end if;
  end if;
  if inv.customer_id is null then raise exception 'กรุณาระบุลูกค้าในใบแจ้งหนี้'; end if;
  if jsonb_typeof(inv.items) is distinct from 'array' or jsonb_array_length(inv.items)=0 then raise exception 'ใบแจ้งหนี้ไม่มีรายการ'; end if;
  insert into job_orders(code,customer_id,invoice_id,quotation_id,item_desc,due_date,note,job_status,artwork_status,production_status,sales_subtotal,discount,sales_amount,vat_amount,sales_total,total)
  values(next_number('JOB',to_char(now() at time zone 'Asia/Bangkok','YYMM'),'JOB'),inv.customer_id,inv.id,inv.quotation_id,
    (select string_agg(value->>'desc',', ') from jsonb_array_elements(inv.items)),p_due_date,inv.notes,'Active','Not Started','Waiting',
    inv.subtotal,coalesce(inv.discount,0),coalesce(inv.subtotal,0)-coalesce(inv.discount,0),coalesce(inv.vat_amount,0),inv.total,inv.total) returning id into jid;
  for it in select value from jsonb_array_elements(inv.items) loop
    q:=coalesce(nullif(it->>'qty','')::numeric,0);
    insert into job_order_items(job_order_id,seq,style_name,quantity,unit,unit_price,fabric_type,shirt_color,screen_color,technique,print_position,note,source_data,production_details)
    values(jid,n,it->>'desc',q,coalesce(nullif(it->>'unit',''),'ชิ้น'),nullif(it->>'price','')::numeric,coalesce(it->>'fabric_type',it->'production'->>'fabric_type'),coalesce(it->>'shirt_color',it->'production'->>'shirt_color'),coalesce(it->>'screen_color',it->'production'->>'screen_color'),coalesce(it->>'technique',it->'production'->>'technique'),coalesce(it->>'print_position',it->'production'->>'print_position'),it->>'note',it,it->'production') returning id into iid;
    if jsonb_typeof(it->'sizes')='object' then
      for sz in select key,value from jsonb_each_text(it->'sizes') loop
        if nullif(sz.value,'') is not null then
          if sz.value::numeric < 0 or sz.value::numeric <> trunc(sz.value::numeric) then raise exception 'จำนวนไซส์ไม่ถูกต้อง'; end if;
          if sz.value::numeric > 0 then insert into job_order_variants(job_order_item_id,size_label,qty) values(iid,sz.key,sz.value::integer); end if;
        end if;
      end loop;
    end if;
    n:=n+1;
  end loop;
  return jid;
end $function$;

CREATE OR REPLACE FUNCTION public.create_material(p_name text, p_unit text, p_category text, p_min numeric)
 RETURNS materials
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare m materials;
begin
  perform workflow_role(array['owner','admin','production']);
  if nullif(trim(p_name),'') is null or nullif(trim(p_unit),'') is null or p_min < 0 or p_min::text in ('NaN','Infinity','-Infinity') then raise exception 'ชื่อ หน่วย หรือขั้นต่ำไม่ถูกต้อง'; end if;
  insert into materials(code,name,unit,category,min_qty,qty,cost_per_unit)
  values('M-'||gen_random_uuid()::text,trim(p_name),trim(p_unit),p_category,coalesce(p_min,0),0,0) returning * into m;
  return m;
end $function$;

CREATE OR REPLACE FUNCTION public.guard_job_workflow()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r text;
begin
  r := workflow_role(array['owner','admin','sales','designer','production','accounting']);
  if tg_op='INSERT' then
    new.legacy_invoice_duplicate := false;
  elsif new.legacy_invoice_duplicate is distinct from old.legacy_invoice_duplicate then
    raise exception 'ไม่สามารถเปลี่ยนเครื่องหมายเอกสารซ้ำเดิม';
  end if;
  if new.invoice_id is not null and (tg_op='INSERT' or new.invoice_id is distinct from old.invoice_id) then
    perform 1 from invoices where id=new.invoice_id for update;
    if exists(select 1 from job_orders where invoice_id=new.invoice_id and id<>new.id and (new.invoice_item_no is null or invoice_item_no is null)) then
      raise exception 'ใบแจ้งหนี้นี้มีใบงานแล้ว กรุณาเปิดใบงานเดิม';
    end if;
  end if;
  if tg_op = 'INSERT' then
    if r not in ('owner','admin','sales') then raise exception 'ไม่มีสิทธิ์สร้างใบงาน'; end if;
    new.created_by := auth.uid();
    new.job_status := 'Active';
    new.artwork_status := 'Not Started';
    new.production_status := 'Waiting';
    new.payment_status := 'Unpaid';
  else
    if old.job_status in ('Completed','Cancelled') and
       (to_jsonb(new) - array['payment_status','invoice_id','revision']) is distinct from
       (to_jsonb(old) - array['payment_status','invoice_id','revision']) then
      raise exception 'งานปิดแล้ว ไม่สามารถแก้ไขได้';
    end if;
    if new.payment_status is distinct from old.payment_status and r not in ('owner','admin','accounting') then raise exception 'ไม่มีสิทธิ์แก้สถานะชำระเงิน'; end if;
    if new.artwork_status is distinct from old.artwork_status and r not in ('owner','admin','designer') then raise exception 'ไม่มีสิทธิ์แก้สถานะออกแบบ'; end if;
    if new.production_status is distinct from old.production_status and r not in ('owner','admin','production') then raise exception 'ไม่มีสิทธิ์แก้สถานะผลิต'; end if;
    if new.job_status is distinct from old.job_status and r not in ('owner','admin') then raise exception 'ไม่มีสิทธิ์ปิดหรือพักงาน'; end if;
    if new.status is distinct from old.status then raise exception 'กรุณาเปลี่ยนสถานะผ่านหน้าใบงานหรือติดตามงานใหม่'; end if;
    new.revision := old.revision + 1;
  end if;
  if new.assigned_to is not null and not exists(select 1 from profiles where id=new.assigned_to and is_active) then raise exception 'ผู้รับผิดชอบยังไม่เปิดใช้งาน'; end if;
  if tg_op = 'UPDATE' and new.production_status is distinct from old.production_status then
    if new.job_status = 'On Hold' then raise exception 'กรุณายกเลิกพักงานก่อนเริ่มขั้นผลิต'; end if;
    if new.production_status in ('In Production','QC','Ready to Deliver','Delivered') then
      if new.due_date is null or new.assigned_to is null then raise exception 'กรุณาระบุวันส่งและผู้รับผิดชอบก่อนผลิต'; end if;
      if new.artwork_status <> 'Approved' then raise exception 'กรุณายืนยันอนุมัติแบบก่อนผลิต'; end if;
    end if;
    if new.production_status='Delivered' and old.production_status <> 'Ready to Deliver' then raise exception 'งานต้องพร้อมส่งก่อนยืนยันส่งมอบ'; end if;
    if new.production_status='Delivered' then new.job_status := 'Completed'; end if;
  end if;
  if new.job_status='Completed' and new.production_status <> 'Delivered' then raise exception 'กรุณาส่งมอบงานก่อนปิดงาน'; end if;
  -- Compatibility projection for existing read-only reports; never use this
  -- single status to infer payment or artwork state again.
  new.status := case
    when new.job_status='Cancelled' then 'ยกเลิก'
    when new.job_status='On Hold' then 'พักงาน'
    when new.production_status='Delivered' then 'ส่งงานแล้ว'
    when new.production_status='Ready to Deliver' then 'แพ็คพร้อมส่ง'
    when new.production_status='QC' then 'ตรวจคุณภาพ'
    when new.production_status='In Production' then 'กำลังสกรีน'
    when new.production_status='Preparing' then 'รอทำไฟล์'
    when new.artwork_status <> 'Approved' then 'รอออกแบบ'
    else 'รอทำไฟล์' end;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  insert into profiles (id, full_name, role, is_active)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), 'sales', false)
  on conflict (id) do nothing;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.is_active_owner_or_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1 from profiles where id = auth.uid() and role in ('owner','admin') and is_active
  );
$function$;

CREATE OR REPLACE FUNCTION public.link_job_invoice(p_job_id uuid, p_invoice_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare inv invoices; j job_orders;
begin
  perform workflow_role(array['owner','admin','sales']);
  select * into inv from invoices where id=p_invoice_id for update;
  if not found then raise exception 'ไม่พบใบแจ้งหนี้'; end if;
  select * into j from job_orders where id=p_job_id for update;
  if not found then raise exception 'ไม่พบใบงาน'; end if;
  if j.customer_id is distinct from inv.customer_id then raise exception 'ลูกค้าในใบงานและใบแจ้งหนี้ไม่ตรงกัน'; end if;
  if j.invoice_id=inv.id then return j.id; end if;
  if j.invoice_id is not null or exists(select 1 from job_orders where invoice_id=inv.id) then raise exception 'มีการเชื่อมใบงานกับใบแจ้งหนี้แล้ว'; end if;
  if j.quotation_id is distinct from inv.quotation_id and j.quotation_id is not null then raise exception 'ใบเสนอราคาอ้างอิงไม่ตรงกัน'; end if;
  update job_orders set invoice_id=inv.id where id=j.id;
  insert into job_status_history(job_order_id,field_changed,new_value,changed_by) values(j.id,'invoice_id',inv.code,auth.uid());
  return j.id;
end $function$;

CREATE OR REPLACE FUNCTION public.list_job_assignees()
 RETURNS TABLE(id uuid, full_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform workflow_role(array['owner','admin','sales','designer','production','accounting']);
  return query select p.id,p.full_name from profiles p where p.is_active and p.role <> 'accounting' order by p.full_name;
end $function$;

CREATE OR REPLACE FUNCTION public.log_job_workflow()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare f text;
begin
  if tg_op='INSERT' then
    insert into job_status_history(job_order_id,field_changed,new_value,changed_by)
      values(new.id,'job_status',new.job_status,auth.uid());
  else
    foreach f in array array['job_status','artwork_status','production_status','payment_status','next_action','due_date','artwork_due_date','assigned_to','problem_note','is_urgent','revision'] loop
      if (to_jsonb(old)->f) is distinct from (to_jsonb(new)->f) and f <> 'revision' then
        insert into job_status_history(job_order_id,field_changed,previous_value,new_value,changed_by)
          values(new.id,f,to_jsonb(old)->>f,to_jsonb(new)->>f,auth.uid());
      end if;
    end loop;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.move_job_material(p_request_id uuid, p_material_id uuid, p_job_id uuid, p_kind text, p_qty numeric, p_note text)
 RETURNS stock_movements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare m materials; j job_orders; movement stock_movements; delta numeric; issued numeric;
begin
  perform workflow_role(array['owner','admin','production']);
  if p_request_id is null or p_kind not in ('issue','return') or p_qty is null or p_qty<=0 or p_qty::text in ('NaN','Infinity','-Infinity') then raise exception 'รายการเคลื่อนไหวไม่ถูกต้อง'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  select * into movement from stock_movements where request_id=p_request_id;
  if found then
    if movement.kind<>p_kind or movement.material_id<>p_material_id or movement.job_order_id is distinct from p_job_id or abs(movement.qty_change)<>p_qty then raise exception 'รหัสคำขอถูกใช้กับรายการอื่นแล้ว'; end if;
    return movement;
  end if;
  select * into j from job_orders where id=p_job_id for update;
  if not found then raise exception 'กรุณาเลือกใบงาน'; end if;
  if p_kind='issue' and j.job_status in ('Completed','Cancelled') then raise exception 'ไม่สามารถเบิกให้ใบงานที่ปิดแล้ว'; end if;
  select * into m from materials where id=p_material_id for update;
  if not found then raise exception 'ไม่พบวัตถุดิบ'; end if;
  delta:=case when p_kind='issue' then -p_qty else p_qty end;
  if coalesce(m.qty,0)+delta<0 then raise exception 'สต๊อกไม่พอ คงเหลือ % %',m.qty,m.unit; end if;
  if p_kind='return' then
    select -coalesce(sum(qty_change),0) into issued from stock_movements where material_id=m.id and job_order_id=j.id and kind in ('issue','return');
    if p_qty>issued then raise exception 'คืนเกินจำนวนที่เบิกให้งานนี้'; end if;
  end if;
  update materials set qty=coalesce(qty,0)+delta where id=m.id returning * into m;
  insert into stock_movements(request_id,material_id,job_order_id,kind,qty_change,balance_after,note,created_by)
  values(p_request_id,m.id,j.id,p_kind,delta,m.qty,p_note,auth.uid()) returning * into movement;
  return movement;
end $function$;

CREATE OR REPLACE FUNCTION public.next_number(p_doc_type text, p_period text, p_prefix text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_num       integer;
  v_is_active boolean;
begin
  -- ═══ Authorization ภายใน RPC เอง (Rev.2 เพิ่มใหม่) ═══
  -- next_number() เป็น internal business primitive — GRANT ระดับ Postgres role (authenticated)
  -- บอกได้แค่ "login แล้วหรือยัง" ไม่บอกว่า "ได้รับการ Activate ให้ใช้ Business Data แล้วหรือยัง"
  -- ต้องเช็กเองในนี้ ห้ามพึ่ง Server Action ชั้นเดียว (เช่นเดียวกับหลักการที่ใช้ใน confirm_quotation_to_job())
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select is_active into v_is_active from profiles where id = auth.uid();

  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode = '28000';
  end if;

  if v_is_active is not true then
    raise exception 'ACCOUNT_INACTIVE' using errcode = '28000';
  end if;
  -- หมายเหตุ: ตั้งใจไม่จำกัดเฉพาะ owner/admin — role อื่นที่ active (sales ฯลฯ) อาจต้องออกเอกสารได้เองในอนาคต
  -- เงื่อนไขเดียวที่บังคับคือ "ต้อง active" เท่านั้น

  if p_doc_type not in ('JOB','PAY','QT','INV','REC') then
    raise exception 'INVALID_DOC_TYPE: %', p_doc_type using errcode = '22023';
  end if;

  -- ทุก raise exception ข้างบนออกก่อนถึงบรรทัดนี้เสมอ → เรียกไม่ผ่านจะไม่ consume sequence เด็ดขาด
  insert into document_sequences(doc_type, period, last_number)
  values (p_doc_type, p_period, 1)
  on conflict (doc_type, period)
  do update set last_number = document_sequences.last_number + 1
  returning last_number into v_num;

  return p_prefix || '-' || p_period || '-' || lpad(v_num::text, 4, '0');
end;
$function$;

CREATE OR REPLACE FUNCTION public.promote_legacy_job(p_job_id uuid, p_revision integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare j job_orders; inv invoices; row_data jsonb; sz record; iid uuid; n integer:=0; q numeric; label text;
begin
  perform workflow_role(array['owner','admin','sales','designer']);
  select * into j from job_orders where id=p_job_id for update;
  if not found then raise exception 'ไม่พบใบงาน'; end if;
  if j.items->>'type' is distinct from 'size_matrix' then return j.id; end if;
  if p_revision is null or p_revision<>j.revision then raise exception 'ข้อมูลถูกแก้ไขแล้ว กรุณาโหลดใหม่'; end if;
  if j.job_status in ('Completed','Cancelled') then raise exception 'งานปิดแล้ว'; end if;
  if exists(select 1 from job_order_items where job_order_id=j.id) then raise exception 'พบรายการใหม่อยู่แล้ว กรุณาตรวจข้อมูลก่อนย้าย'; end if;
  if jsonb_typeof(j.items->'rows') is distinct from 'array' then raise exception 'รูปแบบรายการเดิมไม่ถูกต้อง'; end if;
  select * into inv from invoices where id=j.invoice_id;
  for row_data in select value from jsonb_array_elements(j.items->'rows') loop
    label:=coalesce(row_data->>'style',row_data->>'desc','รายการเดิม');
    q:=coalesce(nullif(row_data->>'ordered_qty','')::numeric,nullif(row_data->>'quantity','')::numeric,nullif(row_data->>'qty','')::numeric,0);
    -- Only restore a missing generic quantity when both index and label match;
    -- otherwise leave it unknown for the operator to verify.
    if q=0 and inv.items->n->>'desc'=label then q:=coalesce(nullif(inv.items->n->>'qty','')::numeric,0); end if;
    insert into job_order_items(job_order_id,seq,style_name,quantity,unit,fabric_type,shirt_color,screen_color,technique,print_position,note,production_details)
    values(j.id,n,label,q,coalesce(row_data->>'unit','ชิ้น'),coalesce(row_data->'production'->>'fabric_type',row_data->>'fabric_type',j.items->>'fabric_type'),coalesce(row_data->'production'->>'shirt_color',row_data->>'shirt_color',j.items->>'shirt_color'),coalesce(row_data->'production'->>'screen_color',row_data->>'screen_color',j.items->>'screen_color'),coalesce(row_data->'production'->>'technique',row_data->>'technique',j.items->'design_detail'->>'technique'),coalesce(row_data->'production'->>'print_position',row_data->>'print_position',j.items->'design_detail'->>'position'),row_data->>'note',row_data->'production') returning id into iid;
    if jsonb_typeof(row_data->'qtys')='object' then
      for sz in select key,value from jsonb_each_text(row_data->'qtys') loop
        if nullif(sz.value,'') is not null then
          if sz.value::numeric<0 or sz.value::numeric<>trunc(sz.value::numeric) then raise exception 'จำนวนเดิมไม่ถูกต้อง กรุณาตรวจข้อมูล'; end if;
          if sz.value::numeric>0 then insert into job_order_variants(job_order_item_id,size_label,qty) values(iid,sz.key,sz.value::integer); end if;
        end if;
      end loop;
    end if;
    n:=n+1;
  end loop;
  update job_orders set legacy_snapshot=items,items=jsonb_build_object('type','migrated_legacy') where id=j.id;
  insert into job_status_history(job_order_id,field_changed,new_value,changed_by,note)
    values(j.id,'items','เปิดแก้ไขรายการเดิม',auth.uid(),'เก็บรายการและไฟล์เดิมครบใน legacy_snapshot');
  return j.id;
end $function$;

CREATE OR REPLACE FUNCTION public.protect_paid_receipt()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if tg_op='INSERT' then
    if new.paid then raise exception 'กรุณายืนยันรับเงินจริงหลังสร้างใบเสร็จ'; end if;
    return new;
  end if;
  if tg_op='DELETE' then
    if old.paid then raise exception 'ใบเสร็จรับเงินแล้ว ห้ามลบ ต้องใช้กระบวนการยกเลิกและกลับรายการ'; end if;
    return old;
  end if;
  if old.paid and (new.total is distinct from old.total or new.invoice_id is distinct from old.invoice_id or new.paid is distinct from old.paid) then raise exception 'ไม่สามารถแก้ยอดใบเสร็จที่รับเงินแล้ว'; end if;
  if new.paid and not old.paid and not exists(select 1 from transactions where receipt_id=new.id and amount=new.total) then raise exception 'กรุณายืนยันรับเงินผ่านระบบรับชำระ'; end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.protect_receipt_transaction()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if old.receipt_id is not null then raise exception 'รายการรับเงินจากใบเสร็จต้องแก้ผ่านกระบวนการกลับรายการ'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.receive_material(p_request_id uuid, p_material_id uuid, p_qty numeric, p_cost numeric, p_supplier_id uuid, p_received_at date, p_note text, p_image_url text, p_vat numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare m materials; movement stock_movements; sid uuid; balance numeric;
begin
  perform workflow_role(array['owner','admin','production']);
  if p_request_id is null or p_qty is null or p_qty<=0 or p_cost is null or p_cost<0 or p_vat is null or p_vat<0 or p_vat>100 or p_qty::text in ('NaN','Infinity','-Infinity') or p_cost::text in ('NaN','Infinity','-Infinity') then raise exception 'จำนวนหรือราคาไม่ถูกต้อง'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  select * into movement from stock_movements where request_id=p_request_id;
  if found then
    if movement.kind <> 'receive' or movement.material_id <> p_material_id or movement.qty_change <> p_qty then raise exception 'รหัสคำขอถูกใช้กับรายการอื่นแล้ว'; end if;
    return movement.stock_in_id;
  end if;
  select * into m from materials where id=p_material_id for update;
  if not found then raise exception 'ไม่พบวัตถุดิบ'; end if;
  balance:=coalesce(m.qty,0)+p_qty;
  insert into stock_in(code,material_id,supplier_id,item_name,qty,cost_per_unit,total,vat_pct,received_at,note,image_url,lot_number,received_by)
  values('SI-'||p_request_id::text,m.id,p_supplier_id,m.name,p_qty,p_cost,round(p_qty*p_cost*(1+p_vat/100),2),p_vat,coalesce(p_received_at,(now() at time zone 'Asia/Bangkok')::date),p_note,p_image_url,'LOT-'||p_request_id::text,auth.uid()::text) returning id into sid;
  update materials set qty=balance,cost_per_unit=case when balance>0 then round((coalesce(m.qty,0)*coalesce(m.cost_per_unit,0)+p_qty*p_cost)/balance,4) else p_cost end where id=m.id;
  insert into stock_movements(request_id,material_id,stock_in_id,kind,qty_change,balance_after,note,created_by)
  values(p_request_id,m.id,sid,'receive',p_qty,balance,p_note,auth.uid());
  return sid;
end $function$;

CREATE OR REPLACE FUNCTION public.replace_job_items(p_job_id uuid, p_items jsonb, p_revision integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare j job_orders; it jsonb; v jsonb; iid uuid; n integer := 0; total_qty numeric;
begin
  perform workflow_role(array['owner','admin','sales','designer']);
  select * into j from job_orders where id=p_job_id for update;
  if not found then raise exception 'ไม่พบใบงาน'; end if;
  if j.job_status in ('Completed','Cancelled') then raise exception 'งานปิดแล้ว'; end if;
  if j.items->>'type'='size_matrix' then raise exception 'รายการเดิมเก็บเป็นข้อมูลอ้างอิง ไม่สามารถเขียนทับได้'; end if;
  if p_revision is null or j.revision <> p_revision then raise exception 'ข้อมูลถูกแก้ไขแล้ว กรุณาโหลดใหม่ก่อนบันทึก'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)=0 then raise exception 'ต้องมีรายการสินค้า'; end if;
  delete from job_order_items where job_order_id=p_job_id;
  for it in select value from jsonb_array_elements(p_items) loop
    if nullif(trim(it->>'style_name'),'') is null then raise exception 'กรุณาระบุชื่อรายการ'; end if;
    if jsonb_typeof(it->'variants') is distinct from 'array' then raise exception 'ข้อมูลไซส์ไม่ถูกต้อง'; end if;
    total_qty := coalesce((it->>'quantity')::numeric,0);
    if total_qty < 0 or total_qty::text in ('NaN','Infinity','-Infinity') then raise exception 'จำนวนไม่ถูกต้อง'; end if;
    if (it->>'unit_price')::numeric < 0 or (it->>'color_count')::integer < 0 then raise exception 'ราคา/จำนวนสีไม่ถูกต้อง'; end if;
    if jsonb_array_length(it->'variants') > 0 then
      select sum((value->>'qty')::numeric) into total_qty from jsonb_array_elements(it->'variants');
    end if;
    if total_qty <= 0 or total_qty is null then raise exception 'กรุณาระบุจำนวน'; end if;
    insert into job_order_items(job_order_id,seq,style_name,fabric_type,shirt_color,screen_color,technique,print_position,color_count,unit_price,note,quantity,unit,source_data,production_details)
    values(p_job_id,n,it->>'style_name',coalesce(it->>'fabric_type',it->'production'->>'fabric_type'),coalesce(it->>'shirt_color',it->'production'->>'shirt_color'),coalesce(it->>'screen_color',it->'production'->>'screen_color'),coalesce(it->>'technique',it->'production'->>'technique'),coalesce(it->>'print_position',it->'production'->>'print_position'),(it->>'color_count')::integer,(it->>'unit_price')::numeric,it->>'note',total_qty,coalesce(nullif(it->>'unit',''),'ชิ้น'),it->'source_data',it->'production_details') returning id into iid;
    if exists(select 1 from jsonb_array_elements(it->'variants') group by trim(value->>'size_label') having count(*)>1) then raise exception 'ไซส์ซ้ำ'; end if;
    for v in select value from jsonb_array_elements(it->'variants') loop
      if nullif(trim(v->>'size_label'),'') is null or (v->>'qty')::numeric < 0 or (v->>'qty')::numeric <> trunc((v->>'qty')::numeric) then raise exception 'จำนวน/ไซส์ไม่ถูกต้อง'; end if;
      insert into job_order_variants(job_order_item_id,size_label,qty) values(iid,trim(v->>'size_label'),(v->>'qty')::integer);
    end loop;
    n:=n+1;
  end loop;
  update job_orders set revision=revision+1 where id=p_job_id returning revision into n;
  insert into job_status_history(job_order_id,field_changed,new_value,changed_by) values(p_job_id,'items',jsonb_array_length(p_items)::text || ' รายการ',auth.uid());
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.settle_receipt(p_receipt_id uuid, p_method text)
 RETURNS receipts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare rec receipts; inv invoices; invoice_ref uuid; paid_total numeric;
begin
  perform workflow_role(array['owner','admin','accounting']);
  if p_method not in ('โอน','เงินสด','เช็ค','บัตรเครดิต') then raise exception 'วิธีชำระเงินไม่ถูกต้อง'; end if;
  select invoice_id into invoice_ref from receipts where id=p_receipt_id;
  -- Invoice lock serializes different installments as well as repeated clicks.
  if invoice_ref is null then raise exception 'ต้องเชื่อมใบแจ้งหนี้ก่อนยืนยันรับเงิน'; end if;
  select * into inv from invoices where id=invoice_ref for update;
  select * into rec from receipts where id=p_receipt_id for update;
  if not found then raise exception 'ไม่พบใบเสร็จ'; end if;
  if rec.paid then return rec; end if;
  if rec.total <= 0 or rec.total is null then raise exception 'ยอดรับเงินไม่ถูกต้อง'; end if;
  select coalesce(sum(total),0) into paid_total from receipts where invoice_id=invoice_ref and paid;
  if paid_total+rec.total > inv.total then raise exception 'ยอดรับเงินเกินยอดใบแจ้งหนี้ กรุณาตรวจสอบ'; end if;
  insert into transactions(code,description,type,amount,transaction_date,invoice_id,receipt_id)
  values('TX-'||rec.id::text,'รับชำระ '||rec.code,'รายรับ',rec.total,(now() at time zone 'Asia/Bangkok')::date,rec.invoice_id,rec.id);
  update receipts set paid=true,paid_at=now(),payment_method=p_method where id=rec.id returning * into rec;
  update job_orders set payment_status=case when paid_total+rec.total >= inv.total then 'Paid' else 'Partially Paid' end where invoice_id=inv.id;
  return rec;
end $function$;

CREATE OR REPLACE FUNCTION public.sync_legacy_status_to_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.status is distinct from old.status then
    -- ใช้ Mapping เดียวกับ migration_v21.sql เป๊ะ (ดู Architecture Rev.4 section 19)
    new.job_status        := case when new.status = 'ส่งงานแล้ว' then 'Completed' else 'Active' end;
    new.artwork_status    := case new.status
                                when 'รอมัดจำ'   then 'Not Started'
                                when 'รอออกแบบ'  then 'Designing'
                                else 'Approved' end;
    new.production_status := case new.status
                                when 'รอมัดจำ'      then 'Waiting'
                                when 'รอออกแบบ'     then 'Waiting'
                                when 'รอทำไฟล์'     then 'Preparing'
                                when 'สั่งของ'       then 'Preparing'
                                when 'กำลังสกรีน'    then 'In Production'
                                when 'แพ็คพร้อมส่ง'  then 'Ready to Deliver'
                                when 'ส่งงานแล้ว'    then 'Delivered'
                                else old.production_status end;

    insert into job_status_history (job_order_id, field_changed, previous_value, new_value, note, changed_by)
    values (new.id, 'job_status (legacy sync)', old.status, new.status, 'Auto-sync จากหน้า Job Order เดิม', auth.uid());
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_job_workflow(p_job_id uuid, p_patch jsonb, p_revision integer)
 RETURNS job_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare j job_orders; r text; k text;
begin
  r := workflow_role(array['owner','admin','sales','designer','production']);
  select * into j from job_orders where id=p_job_id for update;
  if not found then raise exception 'ไม่พบใบงาน'; end if;
  if p_revision is null or j.revision <> p_revision then raise exception 'ข้อมูลถูกแก้ไขแล้ว กรุณาโหลดใหม่ก่อนบันทึก'; end if;
  for k in select jsonb_object_keys(p_patch) loop
    if k not in ('job_status','artwork_status','production_status','next_action','due_date','artwork_due_date','assigned_to','problem_note','is_urgent') then raise exception 'ไม่อนุญาตให้แก้ข้อมูลนี้: %',k; end if;
    if k in ('due_date','artwork_due_date','assigned_to','is_urgent') and r not in ('owner','admin','sales') then raise exception 'ไม่มีสิทธิ์จัดแผนงาน'; end if;
  end loop;
  update job_orders set
    job_status=case when p_patch?'job_status' then p_patch->>'job_status' else job_status end,
    artwork_status=case when p_patch?'artwork_status' then p_patch->>'artwork_status' else artwork_status end,
    production_status=case when p_patch?'production_status' then p_patch->>'production_status' else production_status end,
    next_action=case when p_patch?'next_action' then nullif(p_patch->>'next_action','') else next_action end,
    problem_note=case when p_patch?'problem_note' then nullif(p_patch->>'problem_note','') else problem_note end,
    due_date=case when p_patch?'due_date' then nullif(p_patch->>'due_date','')::date else due_date end,
    artwork_due_date=case when p_patch?'artwork_due_date' then nullif(p_patch->>'artwork_due_date','')::date else artwork_due_date end,
    assigned_to=case when p_patch?'assigned_to' then nullif(p_patch->>'assigned_to','')::uuid else assigned_to end,
    is_urgent=case when p_patch?'is_urgent' then (p_patch->>'is_urgent')::boolean else is_urgent end
  where id=p_job_id returning * into j;
  return j;
end $function$;

CREATE OR REPLACE FUNCTION public.workflow_role(p_roles text[])
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r text;
begin
  select role into r from profiles where id = auth.uid() and is_active;
  if r is null or not (r = any(p_roles)) then
    raise exception 'ไม่มีสิทธิ์ดำเนินการ หรือบัญชียังไม่เปิดใช้งาน' using errcode = '42501';
  end if;
  return r;
end $function$;

-- Triggers
drop trigger if exists on_auth_user_created on auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();
drop trigger if exists trg_guard_job_workflow on public.job_orders;
CREATE TRIGGER trg_guard_job_workflow BEFORE INSERT OR UPDATE ON public.job_orders FOR EACH ROW EXECUTE FUNCTION guard_job_workflow();
drop trigger if exists trg_log_job_workflow on public.job_orders;
CREATE TRIGGER trg_log_job_workflow AFTER INSERT OR UPDATE ON public.job_orders FOR EACH ROW EXECUTE FUNCTION log_job_workflow();
drop trigger if exists trg_profiles_touch_updated_at on public.profiles;
CREATE TRIGGER trg_profiles_touch_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
drop trigger if exists trg_protect_paid_receipt on public.receipts;
CREATE TRIGGER trg_protect_paid_receipt BEFORE INSERT OR DELETE OR UPDATE ON public.receipts FOR EACH ROW EXECUTE FUNCTION protect_paid_receipt();
drop trigger if exists trg_protect_receipt_transaction on public.transactions;
CREATE TRIGGER trg_protect_receipt_transaction BEFORE DELETE OR UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION protect_receipt_transaction();

-- Row level security
alter table public.brands enable row level security;
alter table public.cost_items enable row level security;
alter table public.customers enable row level security;
alter table public.document_sequences enable row level security;
alter table public.invoices enable row level security;
alter table public.job_attachments enable row level security;
alter table public.job_files enable row level security;
alter table public.job_order_items enable row level security;
alter table public.job_order_variants enable row level security;
alter table public.job_orders enable row level security;
alter table public.job_status_history enable row level security;
alter table public.job_step_logs enable row level security;
alter table public.job_steps enable row level security;
alter table public.line_leads enable row level security;
alter table public.materials enable row level security;
alter table public.profiles enable row level security;
alter table public.quotations enable row level security;
alter table public.receipts enable row level security;
alter table public.settings enable row level security;
alter table public.stock_in enable row level security;
alter table public.stock_movements enable row level security;
alter table public.suppliers enable row level security;
alter table public.transactions enable row level security;

-- Policies
drop policy if exists brands_select_active_users on public.brands;
create policy brands_select_active_users on public.brands as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND p.is_active))));
drop policy if exists brands_write_owner_admin on public.brands;
create policy brands_write_owner_admin on public.brands as permissive for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND p.is_active AND (p.role = ANY (ARRAY['owner'::text, 'admin'::text]))))))
  with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND p.is_active AND (p.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
drop policy if exists active_account_required on public.cost_items;
create policy active_account_required on public.cost_items as restrictive for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND p.is_active))))
  with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND p.is_active))));
drop policy if exists allow_authenticated on public.cost_items;
create policy allow_authenticated on public.cost_items as permissive for all to authenticated
  using (true)
  with check (true);
drop policy if exists auth_all_cost_items on public.cost_items;
create policy auth_all_cost_items on public.cost_items as permissive for all to authenticated
  using (true)
  with check (true);
drop policy if exists active_account_required on public.customers;
create policy active_account_required on public.customers as restrictive for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND p.is_active))))
  with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND p.is_active))));
drop policy if exists allow_authenticated on public.customers;
create policy allow_authenticated on public.customers as permissive for all to authenticated
  using (true)
  with check (true);
drop policy if exists auth_all_customers on public.customers;
create policy auth_all_customers on public.customers as permissive for all to authenticated
  using (true)
  with check (true);
drop policy if exists active_account_required on public.invoices;
create policy active_account_required on public.invoices as restrictive for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND p.is_active))))
  with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND p.is_active))));
drop policy if exists allow_authenticated on public.invoices;
create policy allow_authenticated on public.invoices as permissive for all to authenticated
  using (true)
  with check (true);
drop policy if exists auth_all_invoices on public.invoices;
create policy auth_all_invoices on public.invoices as permissive for all to authenticated
  using (true)
  with check (true);
drop policy if exists auth_all_job_attachments on public.job_attachments;
create policy auth_all_job_attachments on public.job_attachments as permissive for all to authenticated
  using (true)
  with check (true);
drop policy if exists job_files_insert on public.job_files;
create policy job_files_insert on public.job_files as permissive for insert to public
  with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['owner'::text, 'admin'::text, 'sales'::text, 'designer'::text, 'production'::text])) AND p.is_active))));
drop policy if exists job_files_select on public.job_files;
create policy job_files_select on public.job_files as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND p.is_active))));
drop policy if exists job_order_items_select on public.job_order_items;
create policy job_order_items_select on public.job_order_items as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND p.is_active))));
drop policy if exists job_order_variants_select on public.job_order_variants;
create policy job_order_variants_select on public.job_order_variants as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND p.is_active))));
drop policy if exists active_account_required on public.job_orders;
create policy active_account_required on public.job_orders as restrictive for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND p.is_active))))
  with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND p.is_active))));
drop policy if exists job_orders_insert on public.job_orders;
create policy job_orders_insert on public.job_orders as permissive for insert to public
  with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['owner'::text, 'admin'::text, 'sales'::text])) AND p.is_active))));
drop policy if exists job_orders_select on public.job_orders;
create policy job_orders_select on public.job_orders as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND p.is_active))));
drop policy if exists job_status_history_select on public.job_status_history;
create policy job_status_history_select on public.job_status_history as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND p.is_active))));
drop policy if exists auth_insert_job_step_logs on public.job_step_logs;
create policy auth_insert_job_step_logs on public.job_step_logs as permissive for insert to authenticated
  with check (true);
drop policy if exists auth_read_job_step_logs on public.job_step_logs;
create policy auth_read_job_step_logs on public.job_step_logs as permissive for select to authenticated
  using (true);
drop policy if exists auth_all_job_steps on public.job_steps;
create policy auth_all_job_steps on public.job_steps as permissive for all to authenticated
  using (true)
  with check (true);
drop policy if exists auth_all_line_leads on public.line_leads;
create policy auth_all_line_leads on public.line_leads as permissive for all to authenticated
  using (true)
  with check (true);
drop policy if exists active_account_required on public.materials;
create policy active_account_required on public.materials as restrictive for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND p.is_active))))
  with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND p.is_active))));
drop policy if exists materials_read on public.materials;
create policy materials_read on public.materials as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_active))));
drop policy if exists profiles_select_admin_all on public.profiles;
create policy profiles_select_admin_all on public.profiles as permissive for select to public
  using (is_active_owner_or_admin());
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles as permissive for select to authenticated
  using ((auth.uid() = id));
drop policy if exists profiles_update_admin_only on public.profiles;
create policy profiles_update_admin_only on public.profiles as permissive for update to public
  using (is_active_owner_or_admin());
drop policy if exists active_account_required on public.quotations;
create policy active_account_required on public.quotations as restrictive for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND p.is_active))))
  with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND p.is_active))));
drop policy if exists allow_authenticated on public.quotations;
create policy allow_authenticated on public.quotations as permissive for all to authenticated
  using (true)
  with check (true);
drop policy if exists auth_all_quotations on public.quotations;
create policy auth_all_quotations on public.quotations as permissive for all to authenticated
  using (true)
  with check (true);
drop policy if exists active_account_required on public.receipts;
create policy active_account_required on public.receipts as restrictive for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND p.is_active))))
  with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND p.is_active))));
drop policy if exists allow_authenticated on public.receipts;
create policy allow_authenticated on public.receipts as permissive for all to authenticated
  using (true)
  with check (true);
drop policy if exists auth_all_receipts on public.receipts;
create policy auth_all_receipts on public.receipts as permissive for all to authenticated
  using (true)
  with check (true);
drop policy if exists active_account_required on public.settings;
create policy active_account_required on public.settings as restrictive for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND p.is_active))))
  with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND p.is_active))));
drop policy if exists allow_authenticated on public.settings;
create policy allow_authenticated on public.settings as permissive for all to authenticated
  using (true)
  with check (true);
drop policy if exists auth_all_settings on public.settings;
create policy auth_all_settings on public.settings as permissive for all to authenticated
  using (true)
  with check (true);
drop policy if exists active_account_required on public.stock_in;
create policy active_account_required on public.stock_in as restrictive for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND p.is_active))))
  with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND p.is_active))));
drop policy if exists stock_in_read on public.stock_in;
create policy stock_in_read on public.stock_in as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_active))));
drop policy if exists stock_movements_read on public.stock_movements;
create policy stock_movements_read on public.stock_movements as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_active))));
drop policy if exists active_account_required on public.suppliers;
create policy active_account_required on public.suppliers as restrictive for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND p.is_active))))
  with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND p.is_active))));
drop policy if exists allow_authenticated on public.suppliers;
create policy allow_authenticated on public.suppliers as permissive for all to authenticated
  using (true)
  with check (true);
drop policy if exists auth_all_suppliers on public.suppliers;
create policy auth_all_suppliers on public.suppliers as permissive for all to authenticated
  using (true)
  with check (true);
drop policy if exists active_account_required on public.transactions;
create policy active_account_required on public.transactions as restrictive for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND p.is_active))))
  with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND p.is_active))));
drop policy if exists allow_authenticated on public.transactions;
create policy allow_authenticated on public.transactions as permissive for all to authenticated
  using (true)
  with check (true);
drop policy if exists auth_all_transactions on public.transactions;
create policy auth_all_transactions on public.transactions as permissive for all to authenticated
  using (true)
  with check (true);

