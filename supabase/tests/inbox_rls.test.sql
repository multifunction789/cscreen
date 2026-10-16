-- Inbox tables, RPCs and RLS matrix (phase 3). Fails by raising an exception.
-- seed as server (superuser = service role)
insert into channel_accounts (id, platform, external_id, display_name, status, vault_secret_name)
values ('10000000-0000-0000-0000-000000000001', 'line', 'U-channel', 'CScreen LINE', 'not_connected', 'line_token')
on conflict do nothing;
insert into customers (id, code, name, phone, tax_id, email)
values ('20000000-0000-0000-0000-000000000001', 'C-900', 'โรงเรียนทดสอบ', '081-234-5678', '0994000000001', 'school@test')
on conflict do nothing;
insert into contact_identities (id, platform, external_id, display_name)
values ('30000000-0000-0000-0000-000000000001', 'line', 'U1234', 'ครูทดสอบ'),
       ('30000000-0000-0000-0000-000000000002', 'facebook', 'PSID-1', 'คุณบี')
on conflict do nothing;
insert into conversations (id, identity_id, platform, unread, last_message_text)
values ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'line', 2, 'สวัสดีค่ะ'),
       ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'facebook', 0, 'ราคาเท่าไหร่')
on conflict do nothing;
insert into messages (conversation_id, direction, text, external_id)
values ('40000000-0000-0000-0000-000000000001', 'in', 'สวัสดีค่ะ', 'm1') on conflict do nothing;
insert into deals (conversation_id, stage) values ('40000000-0000-0000-0000-000000000001', 'New Lead');
insert into webhook_events (platform, event_id, payload) values ('line', 'e1', '{}') on conflict do nothing;

do $$
declare
  fails text[] := '{}';
  c record;
  conv1 constant text := '40000000-0000-0000-0000-000000000001';
  n int;
begin
  -- [role, query, expected rows (-1 = refused)]
  for c in select * from (values
    ('sales',      'select * from channel_accounts', 0),
    ('owner',      'select * from channel_accounts', 0),
    ('sales',      'select * from list_channel_status()', 1),
    ('production', 'select * from list_channel_status()', 1),
    ('inactive',   'select * from list_channel_status()', 0),
    ('sales',      'select * from conversations', 2),
    ('designer',   'select * from conversations', 2),
    ('production', 'select * from conversations', 0),
    ('accounting', 'select * from conversations', 0),
    ('accounting', 'select * from conversation_directory', 2),
    ('production', 'select * from conversation_directory', 0),
    ('inactive',   'select * from conversations', 0),
    ('sales',      'select * from messages', 1),
    ('accounting', 'select * from messages', 0),
    ('production', 'select * from messages', 0),
    ('sales',      $q$insert into messages (conversation_id, direction, text) values ('40000000-0000-0000-0000-000000000001', 'out', 'x')$q$, -1),
    ('sales',      $q$update conversations set assigned_to = '00000000-0000-0000-0000-0000000000a2' where id = '40000000-0000-0000-0000-000000000001'$q$, 1),
    ('designer',   $q$update conversations set status = 'closed' where id = '40000000-0000-0000-0000-000000000001'$q$, 0),
    ('sales',      $q$insert into conversation_notes (conversation_id, text) values ('40000000-0000-0000-0000-000000000001', 'โน้ตของฉัน')$q$, 1),
    ('sales',      $q$insert into conversation_notes (conversation_id, text, author) values ('40000000-0000-0000-0000-000000000001', 'ปลอมชื่อ', '00000000-0000-0000-0000-0000000000a7')$q$, -1),
    ('designer',   $q$insert into conversation_notes (conversation_id, text) values ('40000000-0000-0000-0000-000000000001', 'x')$q$, -1),
    ('sales2',     $q$delete from conversation_notes where text = 'โน้ตของฉัน'$q$, 0),
    ('designer',   'select * from conversation_notes', 1),
    ('production', 'select * from deals', 1),
    ('accounting', 'select * from deals', 1),
    ('production', $q$update deals set stage = 'Completed'$q$, 0),
    ('sales',      $q$update deals set stage = 'Waiting for Details'$q$, 1),
    ('sales',      'select * from webhook_events', 0),
    ('owner',      'select * from webhook_events', 1),
    ('sales',      'select * from audit_log', 0),
    ('owner',      'select * from audit_log', 2)
  ) t(r, q, want) loop
    n := pg_temp.run_as(c.r, c.q);
    if n is distinct from c.want then fails := fails || format('%s: %s → %s (want %s)', c.r, left(c.q, 70), n, c.want); end if;
  end loop;
  if array_length(fails, 1) > 0 then raise exception 'inbox RLS: %', array_to_string(fails, ' | '); end if;
end $$;

-- link needs evidence and the right role; is audited; candidates rank strong matches first
do $$
declare e text; n int; cand text;
begin
  e := pg_temp.err_as('sales', $q$select link_conversation_customer('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '  ')$q$);
  if e not like '%หลักฐาน%' then raise exception 'link without evidence should fail, got: %', e; end if;
  e := pg_temp.err_as('production', $q$select link_conversation_customer('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'โทรยืนยัน')$q$);
  if e not like '%สิทธิ์%' then raise exception 'production must not link, got: %', e; end if;
  e := pg_temp.err_as('sales', $q$select link_conversation_customer('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'ลูกค้าแจ้งเบอร์ 081-234-5678 ตรงกับในระบบ')$q$);
  if e <> '' then raise exception 'link failed: %', e; end if;
  if (select customer_id from conversations where id = '40000000-0000-0000-0000-000000000001') <> '20000000-0000-0000-0000-000000000001'
     or (select linked_by from contact_identities where id = '30000000-0000-0000-0000-000000000001') <> '00000000-0000-0000-0000-0000000000a2'
     or (select customer_id from deals where conversation_id = '40000000-0000-0000-0000-000000000001') <> '20000000-0000-0000-0000-000000000001'
  then raise exception 'link did not update chat / identity / deal'; end if;
  select count(*) into n from audit_log where action = 'link_customer' and detail ->> 'evidence' like '%081-234-5678%';
  if n <> 1 then raise exception 'link not audited'; end if;

  -- candidates
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid('sales'), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select string_agg(code || ':' || match, ',') into cand from find_customer_candidates('0812345678', null, null, 'โรงเรียน');
  execute 'reset role';
  if cand is null or cand not like 'C-900:phone%' then raise exception 'candidate by phone first, got %', cand; end if;

  -- create customer from the second chat: new code, linked, second call refused
  e := pg_temp.err_as('sales', $q$select create_customer_for_conversation('40000000-0000-0000-0000-000000000002', '{"name":"ร้านใหม่จากแชท","phone":"02-000-0000"}')$q$);
  if e <> '' then raise exception 'create customer failed: %', e; end if;
  if (select c.code from customers c join conversations v on v.customer_id = c.id where v.id = '40000000-0000-0000-0000-000000000002') <> 'C-901'
  then raise exception 'new customer code should be C-901'; end if;
  if (select platform from customers where code = 'C-901') <> 'Facebook' then raise exception 'platform not set from chat'; end if;
  e := pg_temp.err_as('sales', $q$select create_customer_for_conversation('40000000-0000-0000-0000-000000000002', '{"name":"ซ้ำ"}')$q$);
  if e not like '%ผูกกับลูกค้าแล้ว%' then raise exception 'second create should be refused, got: %', e; end if;

  -- designer can clear unread without update rights
  n := pg_temp.run_as('designer', $q$select mark_conversation_read('40000000-0000-0000-0000-000000000001')$q$);
  if (select unread from conversations where id = '40000000-0000-0000-0000-000000000001') <> 0 then raise exception 'mark read failed'; end if;

  -- assignment change is audited
  if not exists (select 1 from audit_log where entity = 'conversations' and detail ? 'assigned_to') then raise exception 'assignment not audited'; end if;

  -- duplicate webhook message is refused by the unique index
  begin
    insert into messages (conversation_id, direction, text, external_id) values ('40000000-0000-0000-0000-000000000001', 'in', 'ซ้ำ', 'm1');
    raise exception 'duplicate external_id accepted';
  exception when unique_violation then null;
  end;
end $$;
