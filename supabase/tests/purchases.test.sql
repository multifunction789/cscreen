-- หน้าจัดซื้อ: constraints, RLS, กันลบใบที่รับเข้าสต๊อกแล้ว, ย้ายข้อมูลเก่าแบบไม่ซ้ำ
do $$
declare n int; e text; sup uuid := gen_random_uuid(); tx uuid := gen_random_uuid(); si uuid := gen_random_uuid(); si2 uuid := gen_random_uuid();
begin
  -- active staff can create / read
  n := pg_temp.run_as('accounting', $q$insert into purchases (purpose, category, items, subtotal, total, status) values ('general', 'ค่าโฆษณา', '[]', 500, 500, 'สั่งแล้ว')$q$);
  if n <> 1 then raise exception 'accounting should insert purchase, got %', n; end if;
  n := pg_temp.run_as('sales', 'select * from purchases');
  if n < 1 then raise exception 'sales should read purchases'; end if;
  -- inactive account refused
  n := pg_temp.run_as('inactive', 'select * from purchases');
  if n <> 0 then raise exception 'inactive account must not see purchases (got %)', n; end if;

  -- code generated as PO-<n>
  if not exists (select 1 from purchases where code like 'PO-%') then raise exception 'code should default to PO-…'; end if;

  -- paid needs paid_at
  e := pg_temp.err_as('owner', $q$insert into purchases (purpose, total, status) values ('job', 100, 'จ่ายแล้ว')$q$);
  if e = '' then raise exception 'paid purchase without paid_at must be refused'; end if;
  e := pg_temp.err_as('owner', $q$insert into purchases (purpose, total, status) values ('other', 100, 'สั่งแล้ว')$q$);
  if e = '' then raise exception 'unknown purpose must be refused'; end if;

  -- stocked purchase cannot be deleted
  insert into purchases (id, purpose, total, status, paid_at, stock_done) values ('40000000-0000-0000-0000-000000000001', 'stock', 10, 'จ่ายแล้ว', current_date, true);
  e := pg_temp.err_as('owner', $q$delete from purchases where id = '40000000-0000-0000-0000-000000000001'$q$);
  if e not like '%ลบไม่ได้%' then raise exception 'stocked purchase delete should be blocked, got: %', e; end if;

  -- legacy import: expense tx → purchase, stock_in → purchase, duplicate-looking stock_in skipped, idempotent
  insert into suppliers (id, code, name) values (sup, 'SUP-T1', 'ร้านทดสอบ');
  insert into transactions (id, code, description, type, amount, category, transaction_date, supplier_id)
    values (tx, 'TX-T1', 'ค่าไฟ ต.ค.', 'รายจ่าย', 1234, 'ค่าไฟ', '2026-10-05', sup);
  insert into transactions (code, description, type, amount, transaction_date) values ('TX-T2', 'ขายหน้าร้าน', 'รายรับ', 999, '2026-10-05');
  insert into stock_in (id, code, item_name, qty, cost_per_unit, total, received_at) values (si, 'SI-T1', 'หมึกขาว', 2, 450, 900, '2026-10-07');
  -- same amount + date as an expense already recorded → must be skipped (no double count)
  insert into transactions (code, description, type, amount, transaction_date) values ('TX-T3', 'ซื้อฟิล์ม', 'รายจ่าย', 300, '2026-10-08');
  insert into stock_in (id, code, item_name, qty, cost_per_unit, total, received_at) values (si2, 'SI-T2', 'ฟิล์ม', 1, 300, 300, '2026-10-08');

  n := public.import_legacy_purchases();
  if n <> 3 then raise exception 'expected 3 imported (2 expense tx + 1 stock_in), got %', n; end if;
  if not exists (select 1 from purchases where legacy_transaction_id = tx and purpose = 'general' and total = 1234 and paid_at = '2026-10-05' and status = 'จ่ายแล้ว') then
    raise exception 'expense transaction not imported correctly'; end if;
  if not exists (select 1 from purchases where legacy_stock_in_id = si and purpose = 'stock' and stock_done and total = 900) then
    raise exception 'stock_in not imported correctly'; end if;
  if exists (select 1 from purchases where legacy_stock_in_id = si2) then raise exception 'duplicate-looking stock_in must be skipped'; end if;
  if exists (select 1 from purchases p join transactions t on t.id = p.legacy_transaction_id where t.type = 'รายรับ') then raise exception 'income must not be imported'; end if;

  n := public.import_legacy_purchases();
  if n <> 0 then raise exception 'import must be idempotent, second run imported %', n; end if;
end $$;
