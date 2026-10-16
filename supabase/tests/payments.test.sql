-- Phase 8: slips → accounting approval → paid receipts. Fails by raising.
do $$
declare inv uuid := '50000000-0000-0000-0000-0000000000e1'; cust uuid := '20000000-0000-0000-0000-0000000000e1';
  s1 payment_submissions; s2 payment_submissions; s3 payment_submissions; s4 payment_submissions; s5 payment_submissions;
  r1 jsonb; r1b jsonb; r jsonb; e text; k1 uuid := gen_random_uuid(); bal numeric; rec receipts;
begin
  insert into customers (id, code, name) values (cust, 'C-960', 'ลูกค้าทดสอบรับเงิน') on conflict do nothing;
  insert into invoices (id, code, customer_id, total) values (inv, 'INV-TEST-1', cust, 10000) on conflict do nothing;

  -- who may record a slip
  e := pg_temp.err_as('designer', format('select public.submit_payment_slip(%L, 5000)', inv));
  if e not like '%ไม่มีสิทธิ์%' then raise exception 'designer recorded a slip: %', e; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid('sales'), 'role', 'authenticated')::text, true);
  s1 := public.submit_payment_slip(inv, 5000, now(), null, 'มัดจำ 50%');
  if s1.status <> 'pending' or s1.customer_id <> cust then raise exception 'bad submission'; end if;

  -- a slip is not money
  if (select paid from invoice_balances where invoice_id = inv) <> 0 or (select pending_slips from invoice_balances where invoice_id = inv) <> 5000 then
    raise exception 'pending slip counted as paid'; end if;

  -- sales cannot approve; browser cannot write the table directly
  e := pg_temp.err_as('sales', format('select public.approve_payment_submission(%L, 5000, now(), %L, null, %L)', s1.id, 'โอน', gen_random_uuid()));
  if e not like '%ไม่มีสิทธิ์%' then raise exception 'sales approved money: %', e; end if;
  if pg_temp.run_as('owner', format($q$update payment_submissions set status = 'approved' where id = %L$q$, s1.id)) > 0 then raise exception 'browser updated a submission'; end if;
  if pg_temp.run_as('sales', format($q$insert into payment_submissions (invoice_id, amount_claimed) values (%L, 1)$q$, inv)) <> -1 then raise exception 'browser inserted a submission'; end if;

  -- deposit approved by accounting
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid('accounting'), 'role', 'authenticated')::text, true);
  r1 := public.approve_payment_submission(s1.id, 5000, now(), 'โอน', 'REF-001', k1);
  rec := jsonb_populate_record(null::receipts, r1 -> 'receipt');
  if not rec.paid or rec.total <> 5000 or rec.invoice_id <> inv then raise exception 'receipt not paid'; end if;
  if not exists (select 1 from transactions where receipt_id = rec.id and amount = 5000 and type = 'รายรับ') then raise exception 'no income transaction'; end if;
  if (r1 -> 'balance' ->> 'balance')::numeric <> 5000 then raise exception 'balance after deposit %', r1 -> 'balance'; end if;
  if not exists (select 1 from audit_log where entity = 'payment_submissions' and entity_id = s1.id::text and action = 'approve') then raise exception 'no audit'; end if;

  -- same request again → same result, nothing new
  r1b := public.approve_payment_submission(s1.id, 5000, now(), 'โอน', 'REF-001', k1);
  if r1b -> 'receipt' ->> 'id' <> r1 -> 'receipt' ->> 'id' or not (r1b ->> 'repeated')::boolean then raise exception 'retry made a different result'; end if;
  if (select count(*) from receipts where invoice_id = inv) <> 1 then raise exception 'retry made another receipt'; end if;

  -- a second approval of the same slip (another click / another person) → refused, still one receipt
  e := pg_temp.err_as('owner', format('select public.approve_payment_submission(%L, 5000, now(), %L, null, %L)', s1.id, 'โอน', gen_random_uuid()));
  if e not like '%อนุมัติไปแล้ว%' then raise exception 'double approval allowed: %', e; end if;
  if (select count(*) from receipts where invoice_id = inv) <> 1 then raise exception 'double approval made money'; end if;

  -- installment 1
  s2 := public.submit_payment_slip(inv, 3000);
  r := public.approve_payment_submission(s2.id, null, now(), 'โอน', 'abc-777', gen_random_uuid());
  if (r -> 'balance' ->> 'balance')::numeric <> 2000 then raise exception 'balance after installment 1'; end if;

  -- the same bank transfer again (different spacing / case) → refused
  s3 := public.submit_payment_slip(inv, 2000);
  e := pg_temp.err_as('accounting', format('select public.approve_payment_submission(%L, 2000, now(), %L, %L, %L)', s3.id, 'โอน', ' ABC-777 ', gen_random_uuid()));
  if e not like '%ถูกใช้รับเงินไปแล้ว%' then raise exception 'duplicate bank reference allowed: %', e; end if;

  -- more than the invoice → refused
  e := pg_temp.err_as('accounting', format('select public.approve_payment_submission(%L, 2500, now(), %L, null, %L)', s3.id, 'โอน', gen_random_uuid()));
  if e not like '%เกินยอด%' then raise exception 'over-payment allowed: %', e; end if;
  e := pg_temp.err_as('accounting', format('select public.approve_payment_submission(%L, 0, now(), %L, null, %L)', s3.id, 'โอน', gen_random_uuid()));
  if e not like '%มากกว่าศูนย์%' then raise exception 'zero allowed: %', e; end if;

  -- installment 2 closes the invoice
  r := public.approve_payment_submission(s3.id, 2000, now(), 'เงินสด', null, gen_random_uuid());
  select balance into bal from invoice_balances where invoice_id = inv;
  if bal <> 0 or (select paid from invoice_balances where invoice_id = inv) <> 10000 then raise exception 'deposit + 2 installments should close the invoice: %', bal; end if;
  if (select count(*) from receipts where invoice_id = inv and paid) <> 3 then raise exception 'expected 3 paid receipts'; end if;

  -- nothing left to receive
  s4 := public.submit_payment_slip(inv, 1);
  e := pg_temp.err_as('accounting', format('select public.approve_payment_submission(%L, 1, now(), %L, null, %L)', s4.id, 'โอน', gen_random_uuid()));
  if e not like '%เกินยอด%' then raise exception 'paid invoice accepted more: %', e; end if;

  -- reject needs a reason; rejected slips are not counted
  e := pg_temp.err_as('accounting', format('select public.reject_payment_submission(%L, %L)', s4.id, ' '));
  if e not like '%เหตุผล%' then raise exception 'reject without reason: %', e; end if;
  s4 := public.reject_payment_submission(s4.id, 'สลิปซ้ำ');
  if s4.status <> 'rejected' or (select pending_slips from invoice_balances where invoice_id = inv) <> 0 then raise exception 'reject failed'; end if;

  -- void: owner only, by reversal; nothing deleted
  e := pg_temp.err_as('accounting', format('select public.void_payment(%L, %L)', rec.id, 'ทดสอบ'));
  if e not like '%ไม่มีสิทธิ์%' then raise exception 'accounting voided: %', e; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid('owner'), 'role', 'authenticated')::text, true);
  e := pg_temp.err_as('owner', format('select public.void_payment(%L, %L)', rec.id, ''));
  if e not like '%เหตุผล%' then raise exception 'void without reason: %', e; end if;
  rec := public.void_payment(rec.id, 'ลูกค้าโอนผิดบัญชี');
  if rec.voided_at is null or not rec.paid then raise exception 'void should keep the receipt'; end if;
  if not exists (select 1 from transactions where code = 'TX-VOID-' || rec.id and amount = -5000) then raise exception 'no reversing transaction'; end if;
  if (select status from payment_submissions where id = s1.id) <> 'voided' then raise exception 'submission not voided'; end if;
  if (select balance from invoice_balances where invoice_id = inv) <> 5000 then raise exception 'void should reopen 5000'; end if;
  if (select total from receipts where id = rec.id) <> 5000 then raise exception 'voided receipt changed'; end if;
  -- the voided bank reference can be used again (the real transfer), and the 5000 can be received again
  s5 := public.submit_payment_slip(inv, 5000);
  r := public.approve_payment_submission(s5.id, 5000, now(), 'โอน', 'REF-001', gen_random_uuid());
  if (r -> 'balance' ->> 'balance')::numeric <> 0 then raise exception 'could not re-receive after void'; end if;

  -- old flow ignores voided receipts too
  if (select count(*) from receipts where invoice_id = inv and voided_at is null) <> 3 then raise exception 'active receipt count'; end if;

  -- reading
  if pg_temp.run_as('accounting', 'select * from payment_submissions') < 5 then raise exception 'accounting should read slips'; end if;
  if pg_temp.run_as('production', 'select * from payment_submissions') <> 0 then raise exception 'production read slips'; end if;
  perform set_config('request.jwt.claims', '', true);
end $$;
