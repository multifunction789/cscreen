-- Phase 9: pipeline rules, follow-up claims, dashboard numbers. Fails by raising.
do $$
declare cust uuid := '20000000-0000-0000-0000-0000000000f1'; conv uuid := '40000000-0000-0000-0000-0000000000f1';
  dl deals; e text; n int; j jsonb; t0 timestamptz := now() - interval '1 day'; sales uuid := pg_temp.uid('sales'); r record;
begin
  insert into customers (id, code, name) values (cust, 'C-970', 'ลูกค้าทดสอบงานขาย') on conflict do nothing;
  insert into contact_identities (id, platform, external_id, display_name) values ('30000000-0000-0000-0000-0000000000f1', 'line', 'U-sales', 'คุณทดสอบ') on conflict do nothing;
  insert into conversations (id, identity_id, platform, customer_id, assigned_to, created_at) values (conv, '30000000-0000-0000-0000-0000000000f1', 'line', cust, sales, t0) on conflict do nothing;

  -- stage history + timestamps
  perform set_config('request.jwt.claims', json_build_object('sub', sales, 'role', 'authenticated')::text, true);
  insert into deals (conversation_id, customer_id, stage, value, owner) values (conv, cust, 'New Lead', 12000, sales) returning * into dl;
  if (select count(*) from deal_stage_history where deal_id = dl.id) <> 1 then raise exception 'insert not logged'; end if;
  update deals set stage = 'Quotation Sent' where id = dl.id;
  update deals set value = 13000 where id = dl.id;
  if (select count(*) from deal_stage_history where deal_id = dl.id) <> 2 then raise exception 'only stage changes are logged'; end if;
  if (select changed_by from deal_stage_history where deal_id = dl.id and to_stage = 'Quotation Sent') <> sales then raise exception 'who moved it not kept'; end if;

  -- lost needs a reason (through RLS as sales)
  e := pg_temp.err_as('sales', format($q$update deals set stage = 'Cancelled / Lost' where id = %L$q$, dl.id));
  if e not like '%เหตุผล%' then raise exception 'lost without reason allowed: %', e; end if;
  if pg_temp.run_as('sales', format($q$update deals set stage = 'Cancelled / Lost', lost_reason = 'ราคาสูงกว่าเจ้าอื่น' where id = %L$q$, dl.id)) <> 1 then raise exception 'sales could not mark lost'; end if;
  if (select closed_at from deals where id = dl.id) is null then raise exception 'closed_at not set'; end if;
  update deals set stage = 'Follow-up' where id = dl.id;
  if (select lost_reason from deals where id = dl.id) is not null or (select closed_at from deals where id = dl.id) is not null then raise exception 'reopened deal kept lost data'; end if;
  if pg_temp.run_as('designer', format($q$update deals set stage = 'Confirmed' where id = %L$q$, dl.id)) > 0 then raise exception 'designer moved a deal'; end if;
  if pg_temp.run_as('sales', 'insert into deal_stage_history (deal_id, to_stage) select id, $x$Completed$x$ from deals limit 1') <> -1 then raise exception 'browser wrote history'; end if;

  -- follow-ups: due ones claimed once; a new time can alert again
  update deals set follow_up_at = now() - interval '5 minutes', title = 'โทรตามแบบเสื้อ' where id = dl.id;
  update conversations set follow_up_at = now() - interval '1 minute' where id = conv;
  select count(*) into n from public.claim_due_follow_ups(50) x where x.id in (dl.id, conv);
  if n <> 2 then raise exception 'expected 2 due follow-ups, got %', n; end if;
  for r in select * from public.claim_due_follow_ups(50) loop
    if r.id in (dl.id, conv) then raise exception 'follow-up alerted twice'; end if;
  end loop;
  update deals set follow_up_at = now() - interval '1 minute' where id = dl.id;
  select * into r from public.claim_due_follow_ups(50) x where x.id = dl.id;
  if r.title <> 'โทรตามแบบเสื้อ' or r.user_id <> sales or r.kind <> 'deal' then raise exception 'bad claim row %', r; end if;
  e := pg_temp.err_as('owner', 'select * from public.claim_due_follow_ups(5)');
  if e not like '%permission denied%' then raise exception 'browser could claim follow-ups: %', e; end if;

  -- dashboard: response time during business hours, funnel, scope
  insert into messages (conversation_id, direction, kind, text, status, created_at) values
    (conv, 'in', 'text', 'สนใจเสื้อ', 'received', (date_trunc('day', now() at time zone 'Asia/Bangkok') - interval '1 day' + interval '10 hours') at time zone 'Asia/Bangkok'),
    (conv, 'in', 'text', 'ราคาเท่าไร', 'received', (date_trunc('day', now() at time zone 'Asia/Bangkok') - interval '1 day' + interval '10 hours 1 minute') at time zone 'Asia/Bangkok');
  insert into messages (conversation_id, direction, kind, text, status, sent_by_bot, created_at) values
    (conv, 'out', 'text', 'บอท', 'sent', true, (date_trunc('day', now() at time zone 'Asia/Bangkok') - interval '1 day' + interval '10 hours 2 minutes') at time zone 'Asia/Bangkok');
  insert into messages (conversation_id, direction, kind, text, status, sent_by, created_at) values
    (conv, 'out', 'text', 'ตอบ', 'sent', sales, (date_trunc('day', now() at time zone 'Asia/Bangkok') - interval '1 day' + interval '10 hours 12 minutes') at time zone 'Asia/Bangkok');
  update deals set stage = 'Confirmed' where id = dl.id;

  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid('owner'), 'role', 'authenticated')::text, true);
  j := public.sales_dashboard(now() - interval '3 days', now() + interval '1 minute');
  if (j -> 'response' ->> 'asked')::int < 1 then raise exception 'no waits counted: %', j -> 'response'; end if;
  -- first customer message at 10:00, the bot does not count, staff answered 10:12 → 12 minutes
  if not exists (select 1 from jsonb_array_elements(j -> 'people') p where p ->> 'id' = sales::text and (p ->> 'median_reply_min')::numeric = 12) then
    raise exception 'sales median reply should be 12 min: %', j -> 'people'; end if;
  if (j -> 'funnel' ->> 'won')::int < 1 or (j -> 'funnel' ->> 'won_value')::numeric < 13000 then raise exception 'won not counted: %', j -> 'funnel'; end if;
  if j ->> 'scope' <> 'all' or jsonb_array_length(j -> 'people') < 2 then raise exception 'owner should see everyone'; end if;
  if jsonb_array_length(j -> 'daily') < 3 then raise exception 'daily series too short'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', sales, 'role', 'authenticated')::text, true);
  j := public.sales_dashboard(now() - interval '3 days', now());
  if j ->> 'scope' <> 'self' or jsonb_array_length(j -> 'people') <> 1 then raise exception 'sales should see only own row: %', j -> 'people'; end if;
  e := pg_temp.err_as('designer', 'select public.sales_dashboard(now() - interval ''1 day'', now())');
  if e not like '%ไม่มีสิทธิ์%' then raise exception 'designer saw the dashboard: %', e; end if;
  e := pg_temp.err_as('owner', 'select public.sales_dashboard(now(), now() - interval ''1 day'')');
  if e not like '%ช่วงวันที่%' then raise exception 'bad range accepted: %', e; end if;
  perform set_config('request.jwt.claims', '', true);
end $$;
