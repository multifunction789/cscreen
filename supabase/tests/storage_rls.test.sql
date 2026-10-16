-- Storage policies per role (RLS matrix, phase 1). Fails by raising an exception.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test'),
  ('00000000-0000-0000-0000-0000000000a2', 'sales@test'),
  ('00000000-0000-0000-0000-0000000000a3', 'designer@test'),
  ('00000000-0000-0000-0000-0000000000a4', 'production@test'),
  ('00000000-0000-0000-0000-0000000000a5', 'accounting@test'),
  ('00000000-0000-0000-0000-0000000000a6', 'inactive@test')
on conflict do nothing;
update profiles set is_active = true, role = case id
  when '00000000-0000-0000-0000-0000000000a1' then 'owner'
  when '00000000-0000-0000-0000-0000000000a2' then 'sales'
  when '00000000-0000-0000-0000-0000000000a3' then 'designer'
  when '00000000-0000-0000-0000-0000000000a4' then 'production'
  when '00000000-0000-0000-0000-0000000000a5' then 'accounting' end
where id in ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a3',
             '00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000a5');
-- a6 stays inactive (new sign-ups start inactive)

-- seed one file per private bucket as superuser (= server / service role)
insert into storage.objects (bucket_id, name) values
  ('wht-files', 'seed/wht.pdf'), ('chat-media', 'seed/chat.jpg'),
  ('payment-slips', 'seed/slip.jpg'), ('documents', 'seed/qt.pdf');

create or replace function pg_temp.uid(r text) returns uuid language sql as $$
  select case r when 'owner' then '00000000-0000-0000-0000-0000000000a1'::uuid
                when 'sales' then '00000000-0000-0000-0000-0000000000a2'::uuid
                when 'designer' then '00000000-0000-0000-0000-0000000000a3'::uuid
                when 'production' then '00000000-0000-0000-0000-0000000000a4'::uuid
                when 'accounting' then '00000000-0000-0000-0000-0000000000a5'::uuid
                when 'inactive' then '00000000-0000-0000-0000-0000000000a6'::uuid end
$$;

create or replace function pg_temp.can_insert(r text, b text) returns boolean language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(r), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into storage.objects (bucket_id, name) values (b, 'test/' || gen_random_uuid());
    execute 'reset role';
    return true;
  exception when insufficient_privilege then
    execute 'reset role';
    return false;
  end;
end $$;

create or replace function pg_temp.can_read(r text, b text) returns boolean language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(r), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from storage.objects where bucket_id = b and name like 'seed/%';
  execute 'reset role';
  return n > 0;
end $$;

create or replace function pg_temp.can_delete(r text, b text) returns boolean language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(r), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  with d as (delete from storage.objects where bucket_id = b and name like 'test/%' returning 1) select count(*) into n from d;
  execute 'reset role';
  return n > 0;
end $$;

do $$
declare
  fails text[] := '{}';
  c record;
begin
  for c in select * from (values
    -- action, role, bucket, expected
    ('insert','owner','job-images',true), ('insert','sales','job-images',true), ('insert','designer','job-images',true),
    ('insert','production','job-images',true), ('insert','accounting','job-images',false), ('insert','inactive','job-images',false),
    ('insert','production','stock-images',true), ('insert','sales','stock-images',false),
    ('insert','accounting','wht-files',true), ('insert','sales','wht-files',true), ('insert','production','wht-files',false),
    ('insert','sales','chat-media',true), ('insert','designer','chat-media',false), ('insert','accounting','chat-media',false),
    ('insert','sales','payment-slips',true), ('insert','accounting','payment-slips',true),
    ('insert','designer','payment-slips',false), ('insert','production','payment-slips',false),
    ('insert','sales','documents',false), ('insert','owner','documents',false),
    ('read','accounting','payment-slips',true), ('read','sales','payment-slips',false), ('read','production','payment-slips',false),
    ('read','designer','chat-media',true), ('read','sales','chat-media',true),
    ('read','accounting','chat-media',false), ('read','production','chat-media',false),
    ('read','accounting','documents',true), ('read','production','documents',false),
    ('read','sales','wht-files',true), ('read','production','wht-files',false), ('read','inactive','wht-files',false),
    ('delete','sales','job-images',false), ('delete','owner','job-images',true)
  ) t(act, r, b, want) loop
    if (case c.act when 'insert' then pg_temp.can_insert(c.r, c.b)
                   when 'read'   then pg_temp.can_read(c.r, c.b)
                   else pg_temp.can_delete(c.r, c.b) end) is distinct from c.want then
      fails := fails || format('%s %s %s expected %s', c.act, c.r, c.b, c.want);
    end if;
  end loop;
  if array_length(fails, 1) > 0 then raise exception 'storage RLS: %', array_to_string(fails, '; '); end if;
end $$;

-- public buckets are the only public ones
do $$ begin
  if (select array_agg(id order by id) from storage.buckets where public) <> array['bot-assets','job-images','stock-images'] then
    raise exception 'unexpected public buckets';
  end if;
end $$;
