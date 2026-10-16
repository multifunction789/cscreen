-- Shared test users + helpers (runs first). One active user per role + one inactive.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test'),
  ('00000000-0000-0000-0000-0000000000a2', 'sales@test'),
  ('00000000-0000-0000-0000-0000000000a3', 'designer@test'),
  ('00000000-0000-0000-0000-0000000000a4', 'production@test'),
  ('00000000-0000-0000-0000-0000000000a5', 'accounting@test'),
  ('00000000-0000-0000-0000-0000000000a6', 'inactive@test'),
  ('00000000-0000-0000-0000-0000000000a7', 'sales2@test')
on conflict do nothing;
update profiles set is_active = true, role = case id
  when '00000000-0000-0000-0000-0000000000a1' then 'owner'
  when '00000000-0000-0000-0000-0000000000a2' then 'sales'
  when '00000000-0000-0000-0000-0000000000a3' then 'designer'
  when '00000000-0000-0000-0000-0000000000a4' then 'production'
  when '00000000-0000-0000-0000-0000000000a5' then 'accounting'
  when '00000000-0000-0000-0000-0000000000a7' then 'sales' end
where id <> '00000000-0000-0000-0000-0000000000a6';

create or replace function pg_temp.uid(r text) returns uuid language sql as $$
  select case r when 'owner' then '00000000-0000-0000-0000-0000000000a1'::uuid
                when 'sales' then '00000000-0000-0000-0000-0000000000a2'::uuid
                when 'designer' then '00000000-0000-0000-0000-0000000000a3'::uuid
                when 'production' then '00000000-0000-0000-0000-0000000000a4'::uuid
                when 'accounting' then '00000000-0000-0000-0000-0000000000a5'::uuid
                when 'inactive' then '00000000-0000-0000-0000-0000000000a6'::uuid
                when 'sales2' then '00000000-0000-0000-0000-0000000000a7'::uuid end
$$;

-- run one SQL statement as a role; returns rows affected/returned, or -1 when refused
create or replace function pg_temp.run_as(r text, q text) returns int language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(r), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    if q ~* '^\s*select' then execute 'select count(*) from (' || q || ') _q' into n;
    else execute q; get diagnostics n = row_count; end if;
    execute 'reset role';
    return n;
  exception when others then
    execute 'reset role';
    return -1;
  end;
end $$;

-- same but returns the error text ('' when it worked)
create or replace function pg_temp.err_as(r text, q text) returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(r), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute q;
    execute 'reset role';
    return '';
  exception when others then
    execute 'reset role';
    return sqlerrm;
  end;
end $$;
