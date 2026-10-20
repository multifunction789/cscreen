-- ยอดตามประเภท: นับเฉพาะใบแจ้งหนี้ที่รับเงินครบ แบ่งยอดตาม amount ของรายการ
do $$
declare cust uuid := '20000000-0000-0000-0000-0000000000c1';
  inv1 uuid := '50000000-0000-0000-0000-0000000000c1'; inv2 uuid := '50000000-0000-0000-0000-0000000000c2';
  r receipts; n numeric; d date := (now() at time zone 'Asia/Bangkok')::date;
begin
  insert into customers (id, code, name) values (cust, 'C-980', 'ลูกค้าทดสอบประเภท') on conflict do nothing;
  -- ใบที่ 1: 2 รายการ 8,000 + 2,000 แต่ยอดสุทธิ 10,700 (VAT) → แบ่ง 8,560 / 2,140
  insert into invoices (id, code, customer_id, total, items) values (inv1, 'INV-CAT-1', cust, 10700,
    '[{"desc":"เสื้อพิมพ์ลาย","category":"เสื้อพิมพ์ลาย","qty":40,"price":200,"amount":8000},{"desc":"หมวก","category":"หมวก","qty":20,"price":100,"amount":2000}]');
  -- ใบที่ 2: รับมัดจำอย่างเดียว ยังไม่ครบ → ไม่นับ
  insert into invoices (id, code, customer_id, total, items) values (inv2, 'INV-CAT-2', cust, 5000,
    '[{"desc":"โปโล","category":"เสื้อโปโล","qty":10,"price":500,"amount":5000}]');

  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid('owner'), 'role', 'authenticated')::text, true);
  r := public.create_invoice_receipt(inv1, 5000); perform public.settle_receipt(r.id, 'โอน');
  if exists (select 1 from public.sales_by_category(d, d)) then raise exception 'counted before fully paid'; end if;
  r := public.create_invoice_receipt(inv1, 5700); perform public.settle_receipt(r.id, 'โอน');
  r := public.create_invoice_receipt(inv2, 2500); perform public.settle_receipt(r.id, 'โอน');

  select amount into n from public.sales_by_category(d, d) where category = 'เสื้อพิมพ์ลาย';
  if n is distinct from 8560 then raise exception 'เสื้อพิมพ์ลาย = %', n; end if;
  select amount into n from public.sales_by_category(d, d) where category = 'หมวก';
  if n is distinct from 2140 then raise exception 'หมวก = %', n; end if;
  if exists (select 1 from public.sales_by_category(d, d) where category = 'เสื้อโปโล') then raise exception 'partly paid invoice counted'; end if;
  if exists (select 1 from public.sales_by_category(d - 40, d - 1)) then raise exception 'counted in the wrong month'; end if;
end $$;
