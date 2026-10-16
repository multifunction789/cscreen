-- Read-only schema snapshot query (run in Supabase SQL editor or psql).
-- Produces ONE json document that scripts/db/render-baseline.py turns into
-- supabase/migrations/<ts>_baseline.sql. No data rows are read.
select json_build_object(
  'ext',   (select coalesce(json_agg(x order by x.extname), '[]') from (
              select extname, extversion, n.nspname from pg_extension e
              join pg_namespace n on n.oid = e.extnamespace) x),
  'types', (select coalesce(json_agg(x), '[]') from (
              select t.typname, t.typtype,
                     (select string_agg(quote_literal(enumlabel), ', ' order by enumsortorder)
                        from pg_enum where enumtypid = t.oid) labels
              from pg_type t join pg_namespace n on n.oid = t.typnamespace
              where n.nspname = 'public' and t.typtype in ('e','d','c')
                and not exists (select 1 from pg_class c where c.reltype = t.oid)) x),
  'cols',  (select coalesce(json_agg(x order by x.tbl, x.attnum), '[]') from (
              select c.relname tbl, a.attnum, a.attname, format_type(a.atttypid, a.atttypmod) typ,
                     a.attnotnull nn, pg_get_expr(d.adbin, d.adrelid) def, a.attidentity ident, a.attgenerated gen
              from pg_attribute a join pg_class c on c.oid = a.attrelid
              join pg_namespace n on n.oid = c.relnamespace
              left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
              where n.nspname = 'public' and c.relkind in ('r','p') and a.attnum > 0 and not a.attisdropped) x),
  'cons',  (select coalesce(json_agg(x), '[]') from (
              select c.relname tbl, k.conname, k.contype, pg_get_constraintdef(k.oid) def
              from pg_constraint k join pg_class c on c.oid = k.conrelid
              join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'
              order by 1, case k.contype when 'p' then 0 when 'u' then 1 when 'c' then 2 else 3 end, 2) x),
  'idx',   (select coalesce(json_agg(x), '[]') from (
              select i.indexname, i.tablename, i.indexdef from pg_indexes i
              where i.schemaname = 'public' and not exists (
                select 1 from pg_constraint k where k.conname = i.indexname and k.connamespace = 'public'::regnamespace)
              order by 2, 1) x),
  'views', (select coalesce(json_agg(x), '[]') from (
              select c.relname, c.relkind, pg_get_viewdef(c.oid, true) def from pg_class c
              join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relkind in ('v','m') order by 1) x),
  'fns',   (select coalesce(json_agg(x), '[]') from (
              select p.proname, pg_get_functiondef(p.oid) def from pg_proc p
              join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.prokind in ('f','p') order by 1, p.oid) x),
  'trg',   (select coalesce(json_agg(x), '[]') from (
              select n.nspname, c.relname, t.tgname, pg_get_triggerdef(t.oid) def from pg_trigger t
              join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
              join pg_proc p on p.oid = t.tgfoid join pg_namespace pn on pn.oid = p.pronamespace
              where not t.tgisinternal and (n.nspname = 'public' or pn.nspname = 'public') order by 1, 2, 3) x),
  'rls',   (select coalesce(json_agg(x), '[]') from (
              select c.relname, c.relrowsecurity rls, c.relforcerowsecurity frc from pg_class c
              join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relkind = 'r' order by 1) x),
  'pol',   (select coalesce(json_agg(x), '[]') from (
              select tablename, policyname, permissive, roles::text[] roles, cmd, qual, with_check
              from pg_policies where schemaname = 'public' order by 1, 2) x),
  'grants',(select coalesce(json_agg(x), '[]') from (
              select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) privs
              from information_schema.role_table_grants
              where table_schema = 'public' and grantee in ('anon','authenticated','service_role')
              group by 1, 2 order by 1, 2) x),
  'buckets',(select coalesce(json_agg(x), '[]') from (select id, public from storage.buckets order by id) x),
  'storage_policies',(select coalesce(json_agg(x), '[]') from (
              select tablename, policyname, permissive, roles::text[] roles, cmd, qual, with_check
              from pg_policies where schemaname = 'storage' order by 1, 2) x)
) as snapshot;
