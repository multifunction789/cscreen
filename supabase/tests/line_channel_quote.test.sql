-- Phase 7: quotation from chat, versions, deal stage. Fails by raising.
do $$
declare cid uuid; q quotations; q2 quotations; v1 quotation_versions; v2 quotation_versions; mid uuid; e text; n int;
begin
  insert into customers (id, code, name, phone) values ('20000000-0000-0000-0000-0000000000c1', 'C-950', 'ร้านทดสอบใบเสนอราคา', '0899999999') on conflict do nothing;
  insert into contact_identities (id, platform, external_id) values ('30000000-0000-0000-0000-0000000000c1', 'line', 'U-quote') on conflict do nothing;
  insert into conversations (id, identity_id, platform) values ('40000000-0000-0000-0000-0000000000c1', '30000000-0000-0000-0000-0000000000c1', 'line') on conflict do nothing;
  cid := '40000000-0000-0000-0000-0000000000c1';

  -- needs a linked customer
  e := pg_temp.err_as('sales', format($q$select public.create_quotation_from_chat(%L, '{"items":[{"desc":"เสื้อ","qty":1,"price":100}]}')$q$, cid));
  if e not like '%ผูกแชทกับลูกค้าก่อน%' then raise exception 'unlinked chat should fail: %', e; end if;
  update conversations set customer_id = '20000000-0000-0000-0000-0000000000c1' where id = cid;

  -- roles
  e := pg_temp.err_as('designer', format($q$select public.create_quotation_from_chat(%L, '{"items":[{"desc":"เสื้อ","qty":1,"price":100}]}')$q$, cid));
  if e not like '%ไม่มีสิทธิ์%' then raise exception 'designer must not quote: %', e; end if;

  -- amounts are computed in the database, browser totals are ignored
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid('sales'), 'role', 'authenticated')::text, true);
  q := public.create_quotation_from_chat(cid, '{"items":[{"desc":"เสื้อยืด","qty":50,"price":120,"amount":1},{"desc":"","qty":5,"price":10},{"desc":"ค่าบล็อก","qty":1,"price":500}],"discount":500,"vat_pct":7,"total":1,"notes":"ด่วน"}');
  if q.subtotal <> 6500 or q.discount <> 500 or q.vat_amount <> 420 or q.total <> 6420 then raise exception 'wrong totals: % % % %', q.subtotal, q.discount, q.vat_amount, q.total; end if;
  if jsonb_array_length(q.items) <> 2 then raise exception 'blank row not dropped'; end if;
  if q.code !~ '^QT-\d{4}$' or q.customer_id <> '20000000-0000-0000-0000-0000000000c1' or q.conversation_id <> cid then raise exception 'bad quotation row %', q.code; end if;
  if q.valid_until is null then raise exception 'valid_until default missing'; end if;
  if (select stage from deals where conversation_id = cid) <> 'Quotation Draft' or (select value from deals where conversation_id = cid) <> 6420 then raise exception 'deal not updated'; end if;
  q2 := public.create_quotation_from_chat(cid, '{"items":[{"desc":"โปโล","qty":1,"price":250}],"vat_pct":10}');
  if q2.vat_pct <> 0 then raise exception 'only 0/7 VAT allowed'; end if;
  if substr(q2.code, 4)::int <> substr(q.code, 4)::int + 1 then raise exception 'codes not sequential: % %', q.code, q2.code; end if;

  -- versions: same content reuses, changed content makes v2
  v1 := public.snapshot_quotation_version(q.id, '{"name":"shop"}', 'มุก', 'terms', null);
  if v1.version <> 1 or (v1.snapshot -> 'quotation' ->> 'total')::numeric <> 6420 or v1.snapshot ->> 'prepared_by' <> 'มุก' then raise exception 'bad v1'; end if;
  if (public.snapshot_quotation_version(q.id, '{"name":"shop"}', 'มุก', 'terms', null)).id <> v1.id then raise exception 'unchanged quotation made a new version'; end if;
  update quotations set notes = 'แก้หมายเหตุ' where id = q.id;
  v2 := public.snapshot_quotation_version(q.id, '{"name":"shop"}', 'มุก', 'terms', null);
  if v2.version <> 2 or (select current_version from quotations where id = q.id) <> 2 then raise exception 'edit should make v2'; end if;
  if (select snapshot -> 'quotation' ->> 'notes' from quotation_versions where id = v1.id) <> 'ด่วน' then raise exception 'v1 snapshot changed'; end if;

  -- sending moves the deal and the chat
  insert into messages (conversation_id, direction, kind, text, status) values (cid, 'out', 'document', 'QT', 'sent') returning id into mid;
  perform public.mark_quotation_sent(v2.id, mid);
  if (select stage from deals where conversation_id = cid) <> 'Quotation Sent' then raise exception 'deal should be Quotation Sent'; end if;
  if (select sent_at from quotations where id = q.id) is null or (select sent_message_id from quotation_versions where id = v2.id) <> mid then raise exception 'sent not recorded'; end if;
  if (select status from conversations where id = cid) <> 'waiting' then raise exception 'chat should wait for the customer'; end if;
  update deals set stage = 'Confirmed' where conversation_id = cid;
  perform public.mark_quotation_sent(v2.id, mid);
  if (select stage from deals where conversation_id = cid) <> 'Confirmed' then raise exception 're-send must not move a deal backwards'; end if;

  -- server-only functions, readable versions
  e := pg_temp.err_as('owner', format($q$select public.snapshot_quotation_version(%L, '{}', 'x', 'x', null)$q$, q.id));
  if e not like '%permission denied%' then raise exception 'browser could snapshot: %', e; end if;
  if pg_temp.run_as('accounting', 'select * from quotation_versions') < 2 then raise exception 'accounting should read versions'; end if;
  if pg_temp.run_as('production', 'select * from quotation_versions') <> 0 then raise exception 'production read versions'; end if;
  if pg_temp.run_as('owner', $q$insert into quotation_versions (quotation_id, version, snapshot, content_hash, total) select id, 9, '{}', 'x', 1 from quotations limit 1$q$) <> -1 then raise exception 'browser inserted a version'; end if;
end $$;
