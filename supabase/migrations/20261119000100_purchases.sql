-- หน้าจัดซื้อ (purchases): รวมการซื้อเพื่องานลูกค้า · ซื้อเข้าสต๊อก · ค่าใช้จ่ายทั่วไป ไว้ที่เดียว
--   purpose = 'job'     → ผูก invoice / job_order = ต้นทุนของ Invoice นั้น
--             'stock'   → รับวัตถุดิบเข้าสต๊อก (สร้างแถว stock_in ตอนรับของ — แทนหน้ารับสินค้าเข้า)
--             'general' → ค่าใช้จ่ายทั่วไป (ค่าเช่า ค่าไฟ เงินเดือน โฆษณา ซ่อมบำรุง …) แยกงบตาม category
-- รายจ่ายนับตาม "วันที่จ่ายเงินจริง" (paid_at) — สถานะ 'จ่ายแล้ว' ต้องมี paid_at
-- Forward-only + replay-safe: ตารางใหม่ + คัดลอกข้อมูลเก่าครั้งเดียว (ไม่ลบ/แก้ transactions หรือ stock_in เดิม)

create sequence if not exists public.purchases_code_seq start 1001;
grant usage, select on sequence public.purchases_code_seq to authenticated;

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  code text not null default ('PO-' || nextval('public.purchases_code_seq')::text),
  purpose text not null default 'job',
  category text,
  supplier_id uuid references public.suppliers(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  job_order_id uuid references public.job_orders(id) on delete set null,
  items jsonb not null default '[]'::jsonb,      -- [{ desc, qty, unit, price, amount, material_id?, stock_in_id? }]
  subtotal numeric not null default 0,
  shipping numeric not null default 0,
  vat_pct numeric not null default 0,
  vat_amount numeric not null default 0,
  total numeric not null default 0,
  status text not null default 'สั่งแล้ว',
  ordered_at date default ((now() at time zone 'Asia/Bangkok')::date),
  paid_at date,
  payment_method text,
  lot_number text,
  stock_done boolean not null default false,      -- purpose='stock': รับเข้าสต๊อกแล้ว (แก้รายการไม่ได้แล้ว)
  image_url text,
  note text,
  legacy_transaction_id uuid,                     -- ย้ายมาจาก transactions (รายจ่ายเดิม)
  legacy_stock_in_id uuid,                        -- ย้ายมาจาก stock_in (หน้ารับสินค้าเข้าเดิม)
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  alter table public.purchases add constraint purchases_code_key unique (code);
exception when duplicate_object or duplicate_table then null; end $$;
do $$ begin
  alter table public.purchases add constraint purchases_purpose_check check (purpose in ('job', 'stock', 'general'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.purchases add constraint purchases_status_check check (status in ('สั่งแล้ว', 'รับของแล้ว', 'จ่ายแล้ว'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.purchases add constraint purchases_paid_date_check check (status <> 'จ่ายแล้ว' or paid_at is not null);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.purchases add constraint purchases_amounts_check check (total >= 0 and subtotal >= 0 and shipping >= 0 and vat_pct >= 0 and vat_pct <= 100);
exception when duplicate_object then null; end $$;

create unique index if not exists purchases_legacy_tx_unique on public.purchases (legacy_transaction_id) where legacy_transaction_id is not null;
create unique index if not exists purchases_legacy_si_unique on public.purchases (legacy_stock_in_id) where legacy_stock_in_id is not null;
create index if not exists purchases_paid_at_idx on public.purchases (paid_at);
create index if not exists purchases_invoice_idx on public.purchases (invoice_id);
create index if not exists purchases_job_idx on public.purchases (job_order_id);

-- RLS: เหมือนตารางเอกสารอื่น — ต้องเป็นบัญชีที่เปิดใช้งาน
alter table public.purchases enable row level security;
drop policy if exists active_account_required on public.purchases;
create policy active_account_required on public.purchases as restrictive for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_active))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.is_active));
drop policy if exists allow_authenticated on public.purchases;
create policy allow_authenticated on public.purchases as permissive for all to authenticated
  using (true) with check (true);

-- กันลบใบจัดซื้อที่รับของเข้าสต๊อกแล้ว (จำนวนในสต๊อกจะไม่ตรง)
create or replace function public.protect_stocked_purchase()
 returns trigger language plpgsql as $function$
begin
  if old.stock_done then raise exception 'ใบจัดซื้อนี้รับของเข้าสต๊อกแล้ว ลบไม่ได้ — ปรับยอดที่หน้าสต๊อกแทน'; end if;
  return old;
end $function$;
drop trigger if exists trg_protect_stocked_purchase on public.purchases;
create trigger trg_protect_stocked_purchase before delete on public.purchases
  for each row execute function public.protect_stocked_purchase();

-- ── ย้ายข้อมูลเก่าครั้งเดียว ───────────────────────────────────────
create or replace function public.import_legacy_purchases()
 returns integer language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare n1 int; n2 int;
begin
  -- 1) รายจ่ายจากหน้ารายรับ-รายจ่าย → ผูกงาน = 'job', ไม่ผูก = 'general' · ถือว่าจ่ายแล้ว ณ วันที่ของรายการ
  insert into public.purchases (code, purpose, category, supplier_id, invoice_id, job_order_id, items, subtotal, total, status, ordered_at, paid_at, note, legacy_transaction_id, created_at)
  select 'PO-' || nextval('public.purchases_code_seq')::text,
         case when t.invoice_id is not null or t.job_order_id is not null then 'job' else 'general' end,
         coalesce(nullif(t.category, ''), 'อื่น ๆ'),
         t.supplier_id, t.invoice_id, t.job_order_id,
         jsonb_build_array(jsonb_build_object('desc', coalesce(nullif(t.description, ''), t.category, 'รายจ่าย'), 'qty', 1, 'unit', '', 'price', coalesce(t.amount, 0), 'amount', coalesce(t.amount, 0))),
         coalesce(t.amount, 0), coalesce(t.amount, 0), 'จ่ายแล้ว',
         coalesce(t.transaction_date, t.created_at::date), coalesce(t.transaction_date, t.created_at::date),
         nullif(trim(concat_ws(' · ', t.note, 'ย้ายจากรายรับ-รายจ่าย ' || t.code)), ''),
         t.id, coalesce(t.created_at, now())
  from public.transactions t
  where t.type = 'รายจ่าย' and coalesce(t.amount, 0) >= 0
    and not exists (select 1 from public.purchases p where p.legacy_transaction_id = t.id)
  order by coalesce(t.transaction_date, t.created_at::date), t.created_at;
  get diagnostics n1 = row_count;

  -- 2) รายการจากหน้ารับสินค้าเข้า → 'stock' (รับเข้าแล้ว) · ข้ามรายการที่น่าจะเคยลงรายจ่ายไว้แล้ว (ยอด + วันที่ตรงกัน) กันนับซ้ำ
  insert into public.purchases (code, purpose, category, supplier_id, items, subtotal, vat_pct, vat_amount, shipping, total, status, ordered_at, paid_at, lot_number, stock_done, image_url, note, legacy_stock_in_id, created_at)
  select 'PO-' || nextval('public.purchases_code_seq')::text, 'stock',
         coalesce(nullif(s.category, ''), 'วัตถุดิบ'), s.supplier_id,
         jsonb_build_array(jsonb_build_object('desc', coalesce(nullif(s.item_name, ''), m.name, 'วัตถุดิบ'), 'qty', s.qty, 'unit', coalesce(m.unit, ''), 'price', s.cost_per_unit,
                                              'amount', round(s.qty * s.cost_per_unit, 2), 'material_id', s.material_id, 'stock_in_id', s.id)),
         round(s.qty * s.cost_per_unit, 2), coalesce(s.vat_pct, 0), round(s.qty * s.cost_per_unit * coalesce(s.vat_pct, 0) / 100, 2), coalesce(s.shipping_cost, 0),
         coalesce(s.total, 0) + coalesce(s.shipping_cost, 0), 'จ่ายแล้ว',
         coalesce(s.received_at, s.created_at::date), coalesce(s.received_at, s.created_at::date),
         s.lot_number, true, s.image_url,
         nullif(trim(concat_ws(' · ', s.note, 'ย้ายจากรับสินค้าเข้า ' || s.code)), ''),
         s.id, coalesce(s.created_at, now())
  from public.stock_in s
  left join public.materials m on m.id = s.material_id
  where not exists (select 1 from public.purchases p where p.legacy_stock_in_id = s.id)
    and not exists (
      select 1 from public.transactions t
      where t.type = 'รายจ่าย' and round(coalesce(t.amount, 0), 2) = round(coalesce(s.total, 0), 2)
        and t.transaction_date = s.received_at
        and (t.supplier_id is null or s.supplier_id is null or t.supplier_id = s.supplier_id))
    -- แถว stock_in ที่หน้าจัดซื้อสร้างเอง (มี stock_in_id ในรายการ) ไม่ต้องย้ายซ้ำ
    and not exists (select 1 from public.purchases p, jsonb_array_elements(p.items) it where it->>'stock_in_id' = s.id::text)
  order by coalesce(s.received_at, s.created_at::date), s.created_at;
  get diagnostics n2 = row_count;
  return n1 + n2;
end $function$;
revoke all on function public.import_legacy_purchases() from public;
revoke all on function public.import_legacy_purchases() from authenticated;

-- ย้ายครั้งเดียวตอนเปิดใช้หน้าจัดซื้อ (รันซ้ำได้ — ไม่ย้ายซ้ำ)
select public.import_legacy_purchases();
