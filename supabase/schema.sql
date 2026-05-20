-- ============================================================
-- CSCREEN ERP — Supabase Schema
-- วิธีใช้: เปิด Supabase Dashboard → SQL Editor → วางทั้งหมด → Run
-- ============================================================

-- ── 1. CUSTOMERS ───────────────────────────────────────────
create table if not exists customers (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,          -- C-001
  name        text not null,
  type        text default 'บุคคลธรรมดา',    -- นิติบุคคล | บุคคลธรรมดา | หน่วยงาน
  contact     text,
  phone       text,
  email       text,
  address     text,
  created_at  timestamptz default now()
);

-- ── 2. SUPPLIERS ───────────────────────────────────────────
create table if not exists suppliers (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,          -- SUP-001
  name        text not null,
  category    text,
  contact     text,
  phone       text,
  email       text,
  rating      int default 3,                -- 1-5
  notes       text,
  created_at  timestamptz default now()
);

-- ── 3. MATERIALS (Stock) ────────────────────────────────────
create table if not exists materials (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null,        -- M-001
  name          text not null,
  category      text,
  unit          text default 'ตัว',
  qty           numeric default 0,
  min_qty       numeric default 0,
  cost_per_unit numeric default 0,
  created_at    timestamptz default now()
);

-- ── 4. STOCK_IN ─────────────────────────────────────────────
create table if not exists stock_in (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null,        -- SI-0001
  material_id   uuid references materials(id) on delete set null,
  supplier_id   uuid references suppliers(id) on delete set null,
  qty           numeric not null,
  cost_per_unit numeric not null,
  total         numeric not null,            -- qty * cost_per_unit (app-computed)
  note          text,
  received_by   text default 'คุณปลา',
  received_at   date default current_date,
  created_at    timestamptz default now()
);

-- ── 5. JOB ORDERS ───────────────────────────────────────────
create table if not exists job_orders (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,          -- JO-0001
  customer_id uuid references customers(id) on delete set null,
  item_desc   text,
  status      text default 'รอมัดจำ',
              -- รอมัดจำ | รอออกแบบ | รอทำไฟล์ | สั่งของ | กำลังสกรีน
              -- สั่งผลิต | แพ็คพร้อมส่ง | ส่งงานแล้ว | เลยกำหนด
  total       numeric default 0,
  deposit     numeric default 0,
  due_date    date,
  note        text,
  created_at  timestamptz default now()
);

-- ── 6. QUOTATIONS ───────────────────────────────────────────
create table if not exists quotations (
  id           uuid primary key default gen_random_uuid(),
  code         text unique not null,         -- QT-0001
  customer_id  uuid references customers(id) on delete set null,
  item_desc    text,
  total        numeric default 0,
  status       text default 'รออนุมัติ',    -- รออนุมัติ | อนุมัติแล้ว | แปลงเป็น JO | ปฏิเสธ
  valid_until  date,
  job_order_id uuid references job_orders(id) on delete set null,
  created_at   timestamptz default now()
);

-- ── 7. RECEIPTS ─────────────────────────────────────────────
create table if not exists receipts (
  id             uuid primary key default gen_random_uuid(),
  code           text unique not null,       -- RC-0001
  customer_id    uuid references customers(id) on delete set null,
  job_order_id   uuid references job_orders(id) on delete set null,
  total          numeric default 0,
  paid           boolean default false,
  payment_method text,                       -- เงินสด | โอน | เช็ค
  paid_at        timestamptz,
  created_at     timestamptz default now()
);

-- ── 8. TRANSACTIONS (Finance) ────────────────────────────────
create table if not exists transactions (
  id               uuid primary key default gen_random_uuid(),
  code             text unique not null,     -- TX-001
  description      text,
  type             text not null,            -- รายรับ | รายจ่าย
  amount           numeric not null,
  category         text,
  job_order_id     uuid references job_orders(id) on delete set null,
  transaction_date date default current_date,
  created_at       timestamptz default now()
);

-- ── 9. COST ITEMS (Cost comparison) ─────────────────────────
create table if not exists cost_items (
  id           uuid primary key default gen_random_uuid(),
  item_name    text not null,
  supplier_id  uuid references suppliers(id) on delete set null,
  buy_price    numeric not null,
  sell_price   numeric not null,
  is_best      boolean default false,
  created_at   timestamptz default now()
);

-- ============================================================
-- RLS — เปิดให้ authenticated user เข้าถึงได้ทั้งหมด
-- ============================================================
alter table customers    enable row level security;
alter table suppliers    enable row level security;
alter table materials    enable row level security;
alter table stock_in     enable row level security;
alter table job_orders   enable row level security;
alter table quotations   enable row level security;
alter table receipts     enable row level security;
alter table transactions enable row level security;
alter table cost_items   enable row level security;

-- Policy: authenticated user CRUD ทุกตาราง (drop if exists ก่อนสร้างใหม่)
do $$
declare
  t text;
begin
  foreach t in array array[
    'customers','suppliers','materials','stock_in',
    'job_orders','quotations','receipts','transactions','cost_items'
  ] loop
    execute format('drop policy if exists "auth_all_%s" on %I;', t, t);
    execute format('
      create policy "auth_all_%s" on %I
      for all to authenticated using (true) with check (true);
    ', t, t);
  end loop;
end$$;
