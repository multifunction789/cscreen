-- ใบงาน: บทบาทที่ทำงานกับใบงานแก้ไขได้, ลบได้เฉพาะ owner/admin, บัญชีที่ปิดแล้วแก้ไม่ได้
do $$
declare cust uuid := '20000000-0000-0000-0000-0000000000f1'; j uuid := '60000000-0000-0000-0000-0000000000f1'; n int;
begin
  insert into customers (id, code, name) values (cust, 'C-970', 'ลูกค้าทดสอบใบงาน') on conflict do nothing;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid('owner'), 'role', 'authenticated')::text, true);
  insert into job_orders (id, code, customer_id, item_desc) values (j, 'JO-TEST-RLS', cust, 'ทดสอบ') on conflict do nothing;

  if pg_temp.run_as('owner', format($q$update job_orders set note = 'o' where id = %L$q$, j)) <> 1 then raise exception 'owner cannot update a job order'; end if;
  if pg_temp.run_as('sales', format($q$update job_orders set note = 's' where id = %L$q$, j)) <> 1 then raise exception 'sales cannot update a job order'; end if;
  if pg_temp.run_as('designer', format($q$update job_orders set note = 'd' where id = %L$q$, j)) <> 1 then raise exception 'designer cannot update a job order'; end if;
  if pg_temp.run_as('production', format($q$update job_orders set note = 'p' where id = %L$q$, j)) <> 1 then raise exception 'production cannot update a job order'; end if;
  if pg_temp.run_as('inactive', format($q$update job_orders set note = 'x' where id = %L$q$, j)) > 0 then raise exception 'inactive account updated a job order'; end if;
  if (select note from job_orders where id = j) <> 'p' then raise exception 'update did not stick'; end if;

  if pg_temp.run_as('sales', format($q$delete from job_orders where id = %L$q$, j)) > 0 then raise exception 'sales deleted a job order'; end if;
  if pg_temp.run_as('owner', format($q$delete from job_orders where id = %L$q$, j)) <> 1 then raise exception 'owner cannot delete a job order'; end if;
end $$;
