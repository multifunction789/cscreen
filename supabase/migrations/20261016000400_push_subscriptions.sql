-- ═══════════════════════════════════════════════════════════════════
-- Chat alerts: Web Push subscriptions (one row per browser/phone)
--
-- Forward-only. Each staff member manages only their own devices.
-- The server (service role) reads them to send "new customer message"
-- pushes and removes endpoints the browser has expired.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz,
  fail_count  integer not null default 0
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon;

drop policy if exists push_own_read   on public.push_subscriptions;
drop policy if exists push_own_insert on public.push_subscriptions;
drop policy if exists push_own_update on public.push_subscriptions;
drop policy if exists push_own_delete on public.push_subscriptions;
create policy push_own_read on public.push_subscriptions for select to authenticated
  using (user_id = auth.uid());
create policy push_own_insert on public.push_subscriptions for insert to authenticated
  with check (user_id = auth.uid() and public.has_role('owner','admin','sales','designer'));
create policy push_own_update on public.push_subscriptions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_own_delete on public.push_subscriptions for delete to authenticated
  using (user_id = auth.uid());

-- who should hear about a new message in this chat:
-- the assigned staff member if any, otherwise every active owner/admin/sales
create or replace function public.chat_alert_targets(p_conversation_id uuid)
returns setof push_subscriptions language sql stable security definer set search_path = public, pg_temp as $$
  select s.* from push_subscriptions s
  join profiles p on p.id = s.user_id and p.is_active
  join conversations c on c.id = p_conversation_id
  where case when c.assigned_to is not null then s.user_id = c.assigned_to
             else p.role in ('owner','admin','sales') end
$$;
revoke all on function public.chat_alert_targets(uuid) from public, anon, authenticated;
grant execute on function public.chat_alert_targets(uuid) to service_role;
grant select, insert, update, delete on public.push_subscriptions to authenticated, service_role;
