-- ═══════════════════════════════════════════════════════════════════
-- Phase 1: role helpers + Storage buckets and policies
--
-- Forward-only. Adds functions and buckets; changes no existing table or row.
-- Buckets job-images / stock-images / wht-files are already used by the app
-- but never existed in production (every Supabase upload failed until now).
-- ═══════════════════════════════════════════════════════════════════

-- 1) Role of the signed-in user (null when not signed in or not active)
create or replace function public.app_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from profiles where id = auth.uid() and is_active
$$;

create or replace function public.has_role(variadic roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.app_role() = any(roles), false)
$$;

revoke all on function public.app_role() from public, anon;
revoke all on function public.has_role(text[]) from public, anon;
grant execute on function public.app_role() to authenticated, service_role;
grant execute on function public.has_role(text[]) to authenticated, service_role;

-- 2) Buckets
--    public = readable by URL without login (only non-sensitive photos)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('job-images',    'job-images',    true,  10485760, array['image/jpeg','image/png','image/webp','image/gif','application/pdf']),
  ('stock-images',  'stock-images',  true,  10485760, array['image/jpeg','image/png','image/webp']),
  ('wht-files',     'wht-files',     false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf']),
  ('chat-media',    'chat-media',    false, 52428800, null),
  ('payment-slips', 'payment-slips', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf']),
  ('documents',     'documents',     false, 20971520, array['application/pdf'])
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 3) Policies on storage.objects (service_role bypasses RLS: webhook / worker)
--    Read of public buckets goes through the public URL and needs no policy.
drop policy if exists "staff upload job-images"   on storage.objects;
drop policy if exists "staff manage job-images"   on storage.objects;
drop policy if exists "staff upload stock-images" on storage.objects;
drop policy if exists "staff read photos"         on storage.objects;
drop policy if exists "staff manage stock-images" on storage.objects;
drop policy if exists "staff read wht-files"      on storage.objects;
drop policy if exists "staff upload wht-files"    on storage.objects;
drop policy if exists "read chat-media"           on storage.objects;
drop policy if exists "upload chat-media"         on storage.objects;
drop policy if exists "read payment-slips"        on storage.objects;
drop policy if exists "upload payment-slips"      on storage.objects;
drop policy if exists "read documents"            on storage.objects;
drop policy if exists "admin delete files"        on storage.objects;

create policy "staff upload job-images" on storage.objects for insert to authenticated
  with check (bucket_id = 'job-images' and public.has_role('owner','admin','sales','designer','production'));
create policy "staff manage job-images" on storage.objects for update to authenticated
  using (bucket_id = 'job-images' and public.has_role('owner','admin','sales','designer','production'));
create policy "staff upload stock-images" on storage.objects for insert to authenticated
  with check (bucket_id = 'stock-images' and public.has_role('owner','admin','production'));
-- upload(..., { upsert: true }) also needs select + update on the same bucket
create policy "staff read photos" on storage.objects for select to authenticated
  using (bucket_id in ('job-images','stock-images') and public.app_role() is not null);
create policy "staff manage stock-images" on storage.objects for update to authenticated
  using (bucket_id = 'stock-images' and public.has_role('owner','admin','production'));

create policy "staff read wht-files" on storage.objects for select to authenticated
  using (bucket_id = 'wht-files' and public.has_role('owner','admin','sales','accounting'));
create policy "staff upload wht-files" on storage.objects for insert to authenticated
  with check (bucket_id = 'wht-files' and public.has_role('owner','admin','sales','accounting'));

create policy "read chat-media" on storage.objects for select to authenticated
  using (bucket_id = 'chat-media' and public.has_role('owner','admin','sales','designer'));
create policy "upload chat-media" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-media' and public.has_role('owner','admin','sales'));

create policy "read payment-slips" on storage.objects for select to authenticated
  using (bucket_id = 'payment-slips' and public.has_role('owner','admin','accounting'));
create policy "upload payment-slips" on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-slips' and public.has_role('owner','admin','sales','accounting'));

create policy "read documents" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and public.has_role('owner','admin','sales','designer','accounting'));

create policy "admin delete files" on storage.objects for delete to authenticated
  using (public.has_role('owner','admin'));
