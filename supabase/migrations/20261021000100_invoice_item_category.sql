-- ใบแจ้งหนี้: รายการเหลือแค่ ชื่อ / ประเภท / ไซซ์ / ราคา (รายละเอียดผลิตย้ายไปอยู่ในใบงาน)
--  1) สำรอง items เดิมของใบแจ้งหนี้ที่มีรายละเอียดผลิต (items[].production = คอ ผ้า สีเสื้อ ฯลฯ)
--  2) ลบ items[].production ออก — ตัวใบแจ้งหนี้ ยอดเงิน ไซซ์ ไม่ถูกแตะ
--  3) sales_by_category: ยอดขายตามประเภท (items[].category) ของใบแจ้งหนี้ที่รับเงินครบแล้ว
--     นับเข้าเดือนของใบเสร็จใบสุดท้ายที่ทำให้ครบ, แบ่งยอดตาม amount ของแต่ละรายการให้รวมเท่ากับยอดใบแจ้งหนี้

create table if not exists public.backup_invoice_items_production (
  invoice_id  uuid not null,
  code        text,
  items       jsonb not null,
  backed_up_at timestamptz not null default now()
);
alter table public.backup_invoice_items_production enable row level security;   -- ไม่มี policy = เปิดได้เฉพาะใน SQL editor
revoke all on public.backup_invoice_items_production from anon, authenticated;

insert into public.backup_invoice_items_production (invoice_id, code, items)
select i.id, i.code, i.items
from public.invoices i
where jsonb_typeof(i.items) = 'array'
  and exists (select 1 from jsonb_array_elements(i.items) e where e ? 'production')
  and not exists (select 1 from public.backup_invoice_items_production b where b.invoice_id = i.id);

update public.invoices i
set items = (select jsonb_agg(e - 'production' order by ord) from jsonb_array_elements(i.items) with ordinality t(e, ord))
where jsonb_typeof(i.items) = 'array'
  and exists (select 1 from jsonb_array_elements(i.items) e where e ? 'production');

create or replace function public.sales_by_category(p_from date, p_to date)
returns table (category text, amount numeric, invoices bigint)
language sql stable security invoker set search_path = public, pg_temp as $$
  with settled as (
    select i.id, i.total, i.items,
           (max(r.paid_at) at time zone 'Asia/Bangkok')::date as settled_on
    from invoices i
    join receipts r on r.invoice_id = i.id and r.paid and r.voided_at is null
    where jsonb_typeof(i.items) = 'array' and coalesce(i.total, 0) > 0
    group by i.id, i.total, i.items
    having sum(r.total) >= i.total
  ), lines as (
    select s.id, s.total,
           coalesce(nullif(trim(e ->> 'category'), ''), 'ไม่ระบุ') as category,
           greatest(coalesce(nullif(e ->> 'amount', '')::numeric, 0), 0) as amt
    from settled s, jsonb_array_elements(s.items) e
    where s.settled_on between p_from and p_to
  ), sums as (
    select id, sum(amt) as total_amt, count(*) as n from lines group by id
  )
  select l.category,
         round(sum(case when su.total_amt > 0 then l.total * l.amt / su.total_amt else l.total / su.n end), 2) as amount,
         count(distinct l.id) as invoices
  from lines l join sums su on su.id = l.id
  group by l.category
  order by 2 desc
$$;
revoke all on function public.sales_by_category(date, date) from public, anon;
grant execute on function public.sales_by_category(date, date) to authenticated;
