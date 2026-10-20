-- เฟส 2: ใบงาน Supplier / PO
do $$
declare cust uuid := '20000000-0000-0000-0000-0000000000d1'; sup uuid := '70000000-0000-0000-0000-0000000000d1';
  j1 uuid := '60000000-0000-0000-0000-0000000000d1'; j2 uuid := '60000000-0000-0000-0000-0000000000d2';
  p supplier_pos; p2 supplier_pos; st job_steps; e text; n numeric; c int;
begin
  insert into customers (id, code, name) values (cust, 'C-990', 'ลูกค้าทดสอบ PO') on conflict do nothing;
  insert into suppliers (id, code, name) values (sup, 'S-990', 'ร้านฟิล์มทดสอบ') on conflict do nothing;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid('owner'), 'role', 'authenticated')::text, true);
  insert into job_orders (id, code, customer_id, item_desc) values (j1, 'JO-PO-1', cust, 'เสื้อ A'), (j2, 'JO-PO-2', cust, 'เสื้อ B') on conflict do nothing;

  -- เลขที่ + หน่วยตามประเภท
  insert into supplier_pos (po_type, supplier_id, due_date) values ('dft', sup, current_date + 2) returning * into p;
  if p.code !~ '^SPO-[0-9]{4}-001$' then raise exception 'bad code %', p.code; end if;
  if p.unit <> 'เมตร' then raise exception 'dft must be meters'; end if;
  insert into supplier_pos (po_type, supplier_id) values ('embroidery', sup) returning * into p2;
  if p2.code not like '%-002' or p2.unit <> 'ชิ้น' then raise exception 'second PO % %', p2.code, p2.unit; end if;

  -- แถวของ 2 ใบงาน → ขั้นตอนในแผนผลิตของทั้ง 2 ใบ (ใบละ 1 ขั้น แม้มีหลายแถว)
  insert into supplier_po_lines (po_id, job_order_id, description, qty, meters) values
    (p.id, j1, 'โลโก้อก', 60, 0.4), (p.id, j1, 'ลายหลัง', 60, 6.6), (p.id, j2, 'ลายหน้า', 30, 3.0);
  select count(*) into c from job_steps where supplier_po_id = p.id;
  if c <> 2 then raise exception 'expected 2 PO steps, got %', c; end if;
  select * into st from job_steps where job_order_id = j1 and supplier_po_id = p.id;
  if st.status <> 'รอเริ่ม' or st.supplier_id <> sup or st.name not like 'ส่ง DFT · SPO-%' then raise exception 'bad step % %', st.status, st.name; end if;

  -- แก้สถานะขั้นตอนตรงไม่ได้ ต้องแก้ที่ PO
  e := pg_temp.err_as('production', format($q$update job_steps set status = 'เสร็จแล้ว' where id = %L$q$, st.id));
  if e not like '%อัปเดตจากใบงาน Supplier%' then raise exception 'step status edited directly: %', e; end if;
  if pg_temp.run_as('production', format($q$update job_steps set note = 'ok' where id = %L$q$, st.id)) <> 1 then raise exception 'note edit refused'; end if;
  e := pg_temp.err_as('production', format('delete from job_steps where id = %L', st.id));
  if e not like '%มาจากใบงาน Supplier%' then raise exception 'PO step deleted directly: %', e; end if;

  -- PO เปลี่ยนสถานะ → ขั้นตอนตาม
  update supplier_pos set status = 'ส่งแล้ว', total_meters = 10, unit_price = 100, total_amount = 1000 where id = p.id;
  select * into st from job_steps where id = st.id;
  if st.status <> 'ส่งงานแล้ว' or st.sent_date is null then raise exception 'step not synced: %', st.status; end if;

  -- ต้นทุนแบ่งตามเมตร: j1 = 7/10, j2 = 3/10
  select amount into n from supplier_po_job_costs where po_id = p.id and job_order_id = j1;
  if n <> 700 then raise exception 'j1 cost %', n; end if;
  select amount into n from supplier_po_job_costs where po_id = p.id and job_order_id = j2;
  if n <> 300 then raise exception 'j2 cost %', n; end if;

  -- ปิดใบงานไม่ได้ถ้า PO ยังไม่ปิด
  -- (ปิดกฎ workflow เดิมชั่วคราว เพื่อทดสอบกฎ PO อย่างเดียว)
  alter table job_orders disable trigger trg_guard_job_workflow;
  e := null;
  begin
    update job_orders set job_status = 'Completed' where id = j2;
  exception when others then e := sqlerrm; end;
  if coalesce(e, '') not like '%ใบงาน Supplier ยังไม่ปิด%' then raise exception 'job closed with open PO: %', e; end if;
  alter table job_orders enable trigger trg_guard_job_workflow;

  -- เอาใบงานออกจาก PO → ขั้นตอนหาย
  delete from supplier_po_lines where po_id = p.id and job_order_id = j2;
  if exists (select 1 from job_steps where job_order_id = j2 and supplier_po_id = p.id) then raise exception 'step left after line removed'; end if;

  -- PO ที่ส่งแล้วลบไม่ได้; ร่างลบได้
  e := pg_temp.err_as('owner', format('delete from supplier_pos where id = %L', p.id));
  if e not like '%ลบไม่ได้%' then raise exception 'sent PO deleted: %', e; end if;
  if pg_temp.run_as('sales', format('delete from supplier_pos where id = %L', p2.id)) > 0 then raise exception 'sales deleted a PO'; end if;
  if pg_temp.run_as('owner', format('delete from supplier_pos where id = %L', p2.id)) <> 1 then raise exception 'owner could not delete a draft PO'; end if;

  -- ปิด PO → ขั้นตอนเสร็จ
  update supplier_pos set status = 'ปิดแล้ว' where id = p.id;
  select * into st from job_steps where id = st.id;
  if st.status <> 'เสร็จแล้ว' or st.received_date is null then raise exception 'closed PO step %', st.status; end if;

  -- สิทธิ์
  if pg_temp.run_as('inactive', 'select * from supplier_pos') > 0 then raise exception 'inactive read POs'; end if;
  if pg_temp.run_as('designer', format($q$insert into supplier_pos (po_type, supplier_id) values ('dtg', %L)$q$, sup)) <> 1 then raise exception 'designer cannot create PO'; end if;
end $$;
