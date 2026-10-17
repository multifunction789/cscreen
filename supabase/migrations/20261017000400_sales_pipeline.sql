-- ═══════════════════════════════════════════════════════════════════
-- Phase 9: sales pipeline (board / table / my tasks), follow-up reminders,
-- sales dashboard. Forward-only.
--
--   deals             + follow_up_at, next_action, stage_changed_at, closed_at
--   deal_stage_history every stage move (who / when), written by trigger
--   claim_due_follow_ups()   service only: due follow-ups (deals + chats), each alerted once
--   sales_dashboard(from, to)  numbers for the dashboard, computed from the real rows
-- ═══════════════════════════════════════════════════════════════════

alter table public.deals add column if not exists title text;
alter table public.deals add column if not exists next_action text;
alter table public.deals add column if not exists follow_up_at timestamptz;
alter table public.deals add column if not exists follow_up_alerted_at timestamptz;
alter table public.deals add column if not exists stage_changed_at timestamptz not null default now();
alter table public.deals add column if not exists closed_at timestamptz;
alter table public.conversations add column if not exists follow_up_alerted_at timestamptz;
create index if not exists deals_stage_idx on public.deals (stage, updated_at desc);
create index if not exists deals_follow_up_idx on public.deals (follow_up_at) where follow_up_at is not null;
create index if not exists conversations_follow_up_idx on public.conversations (follow_up_at) where follow_up_at is not null;
create index if not exists messages_created_idx on public.messages (created_at);

create table if not exists public.deal_stage_history (
  id          bigint generated always as identity primary key,
  deal_id     uuid not null references public.deals(id) on delete cascade,
  from_stage  text,
  to_stage    text not null,
  changed_by  uuid references public.profiles(id) on delete set null,
  changed_at  timestamptz not null default now()
);
create index if not exists deal_stage_history_deal_idx on public.deal_stage_history (deal_id, changed_at);
alter table public.deal_stage_history enable row level security;
revoke all on public.deal_stage_history from anon;
grant select on public.deal_stage_history to authenticated;
grant select, insert on public.deal_stage_history to service_role;
drop policy if exists deal_stage_history_read on public.deal_stage_history;
create policy deal_stage_history_read on public.deal_stage_history for select to authenticated
  using (public.app_role() is not null);

-- stage rules: a lost deal needs a reason; history + timestamps are kept by the database
create or replace function public.deal_stage_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    if new.stage = 'Cancelled / Lost' and nullif(trim(coalesce(new.lost_reason, '')), '') is null then
      raise exception 'กรุณาระบุเหตุผลที่ปิดการขายไม่ได้';
    end if;
    new.stage_changed_at := now();
    new.closed_at := case when new.stage in ('Completed', 'Cancelled / Lost') then now() end;
    if new.stage <> 'Cancelled / Lost' then new.lost_reason := null; end if;
  end if;
  if tg_op = 'UPDATE' and new.follow_up_at is distinct from old.follow_up_at then new.follow_up_alerted_at := null; end if;
  return new;
end $$;
drop trigger if exists trg_deal_stage_guard on public.deals;
create trigger trg_deal_stage_guard before insert or update on public.deals for each row execute function public.deal_stage_guard();

create or replace function public.deal_stage_log()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    insert into deal_stage_history (deal_id, from_stage, to_stage, changed_by)
    values (new.id, case when tg_op = 'UPDATE' then old.stage end, new.stage, auth.uid());
  end if;
  return null;
end $$;
drop trigger if exists trg_deal_stage_log on public.deals;
create trigger trg_deal_stage_log after insert or update on public.deals for each row execute function public.deal_stage_log();

-- a new follow-up time on a chat can be alerted again
create or replace function public.conversation_follow_up_reset()
returns trigger language plpgsql as $$
begin
  if new.follow_up_at is distinct from old.follow_up_at then new.follow_up_alerted_at := null; end if;
  return new;
end $$;
drop trigger if exists trg_conversation_follow_up_reset on public.conversations;
create trigger trg_conversation_follow_up_reset before update on public.conversations for each row execute function public.conversation_follow_up_reset();

-- ── due follow-ups → alerts (each one once). Server (worker) only.
create or replace function public.claim_due_follow_ups(p_limit int default 50)
returns table (kind text, id uuid, conversation_id uuid, user_id uuid, title text, due_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  return query
  with d as (
    update deals x set follow_up_alerted_at = now()
    where x.id in (select y.id from deals y where y.follow_up_at <= now() and y.follow_up_alerted_at is null
                   and y.stage not in ('Completed', 'Cancelled / Lost') order by y.follow_up_at limit p_limit for update skip locked)
    returning x.id as did, x.conversation_id as cid, x.owner as uid, x.title as t, x.follow_up_at as due, x.customer_id as cust
  ), c as (
    update conversations x set follow_up_alerted_at = now()
    where x.id in (select y.id from conversations y where y.follow_up_at <= now() and y.follow_up_alerted_at is null
                   and y.status <> 'closed' order by y.follow_up_at limit p_limit for update skip locked)
    returning x.id as cid, x.assigned_to as uid, x.follow_up_at as due, x.customer_id as cust, x.identity_id as ident
  )
  select 'deal'::text, d.did, d.cid, d.uid,
         coalesce(d.t, (select cu.name from customers cu where cu.id = d.cust), 'งานขาย'), d.due from d
  union all
  select 'chat'::text, c.cid, c.cid, c.uid,
         coalesce((select cu.name from customers cu where cu.id = c.cust),
                  (select ci.display_name from contact_identities ci where ci.id = c.ident), 'แชทลูกค้า'), c.due from c;
end $$;
revoke all on function public.claim_due_follow_ups(int) from public, anon, authenticated;
grant execute on function public.claim_due_follow_ups(int) to service_role;

-- push targets for one person (or every owner/admin/sales when nobody owns it)
create or replace function public.follow_up_alert_targets(p_user_id uuid)
returns setof push_subscriptions language sql stable security definer set search_path = public, pg_temp as $$
  select s.* from push_subscriptions s join profiles p on p.id = s.user_id and p.is_active
  where case when p_user_id is not null then s.user_id = p_user_id else p.role in ('owner', 'admin', 'sales') end
$$;
revoke all on function public.follow_up_alert_targets(uuid) from public, anon, authenticated;
grant execute on function public.follow_up_alert_targets(uuid) to service_role;

-- ── dashboard numbers (owner/admin: everyone; sales: totals + own row)
create or replace function public.sales_dashboard(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); r text := app_role(); out jsonb; won_stages text[] := array['Confirmed','Waiting for Deposit','Production','Ready for Delivery','Completed'];
begin
  if r is null or r not in ('owner', 'admin', 'sales') then raise exception 'ไม่มีสิทธิ์ดูรายงานการขาย'; end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '400 days' then raise exception 'ช่วงวันที่ไม่ถูกต้อง'; end if;

  with
  msgs as (
    select m.*, lag(m.direction) over (partition by m.conversation_id order by m.created_at, m.id) prev_dir
    from messages m where m.kind <> 'system' and m.created_at < p_to and m.created_at >= p_from - interval '7 days'
  ),
  -- a customer message that starts waiting (first, or after we spoke) during business hours 09:00–21:00
  waits as (
    select w.conversation_id, w.created_at asked,
      (select min(o.created_at) from messages o where o.conversation_id = w.conversation_id and o.direction = 'out'
         and not o.sent_by_bot and o.sent_by is not null and o.created_at > w.created_at) answered
    from msgs w
    where w.direction = 'in' and (w.prev_dir is null or w.prev_dir = 'out') and w.created_at >= p_from
      and extract(hour from w.created_at at time zone 'Asia/Bangkok') between 9 and 20
  ),
  replies as (
    select wt.*, extract(epoch from wt.answered - wt.asked) / 60.0 minutes,
      (select o.sent_by from messages o where o.conversation_id = wt.conversation_id and o.created_at = wt.answered and o.direction = 'out' limit 1) responder
    from waits wt
  ),
  staff as (select id, full_name from profiles where is_active and role in ('owner', 'admin', 'sales')),
  quotes as (
    select qv.quotation_id, qv.total, m.sent_by, qv.sent_at from quotation_versions qv left join messages m on m.id = qv.sent_message_id
    where qv.sent_at >= p_from and qv.sent_at < p_to
  ),
  won as (
    select d.*, coalesce(d.owner, c.assigned_to) who from deals d left join conversations c on c.id = d.conversation_id
    where d.stage = any(won_stages) and exists (
      select 1 from deal_stage_history h where h.deal_id = d.id and h.to_stage = any(won_stages) and h.changed_at >= p_from and h.changed_at < p_to)
  ),
  per_person as (
    select s.id, s.full_name,
      (select count(*) from conversations c where c.assigned_to = s.id and c.last_message_at >= p_from and c.created_at < p_to) chats,
      (select count(*) from messages m where m.sent_by = s.id and m.direction = 'out' and m.created_at >= p_from and m.created_at < p_to) sent,
      (select percentile_cont(0.5) within group (order by minutes) from replies where responder = s.id) median_reply_min,
      (select count(distinct quotation_id) from quotes where sent_by = s.id) quotes,
      (select count(*) from won where who = s.id) won,
      (select coalesce(sum(value), 0) from won where who = s.id) won_value
    from staff s
    where r in ('owner', 'admin') or s.id = me
  )
  select jsonb_build_object(
    'range', jsonb_build_object('from', p_from, 'to', p_to),
    'chats', jsonb_build_object(
      'new', (select count(*) from conversations where created_at >= p_from and created_at < p_to),
      'active', (select count(distinct conversation_id) from messages where direction = 'in' and created_at >= p_from and created_at < p_to),
      'inbound', (select count(*) from messages where direction = 'in' and kind <> 'system' and created_at >= p_from and created_at < p_to),
      'staff_sent', (select count(*) from messages where direction = 'out' and not sent_by_bot and created_at >= p_from and created_at < p_to),
      'bot_sent', (select count(*) from messages where direction = 'out' and sent_by_bot and created_at >= p_from and created_at < p_to),
      'by_platform', (select coalesce(jsonb_object_agg(platform, n), '{}') from (select platform, count(*) n from conversations where created_at >= p_from and created_at < p_to group by platform) x)),
    'response', jsonb_build_object(
      'asked', (select count(*) from replies),
      'answered', (select count(*) from replies where answered is not null),
      'unanswered', (select count(*) from replies where answered is null),
      'median_min', (select percentile_cont(0.5) within group (order by minutes) from replies where answered is not null),
      'avg_min', (select avg(minutes) from replies where answered is not null),
      'within_5_min', (select count(*) from replies where minutes <= 5),
      'within_60_min', (select count(*) from replies where minutes <= 60)),
    'funnel', jsonb_build_object(
      'chats', (select count(*) from conversations where created_at >= p_from and created_at < p_to),
      'linked', (select count(*) from conversations where created_at >= p_from and created_at < p_to and customer_id is not null),
      'quoted', (select count(distinct quotation_id) from quotes),
      'quoted_value', (select coalesce(sum(t), 0) from (select distinct on (quotation_id) total t from quotes order by quotation_id, sent_at desc) x),
      'won', (select count(*) from won),
      'won_value', (select coalesce(sum(value), 0) from won),
      'lost', (select count(*) from deals d where d.stage = 'Cancelled / Lost' and d.closed_at >= p_from and d.closed_at < p_to),
      'received', (select coalesce(sum(total), 0) from receipts where paid and paid_at >= p_from and paid_at < p_to and voided_at is null)),
    'pipeline', (select coalesce(jsonb_agg(jsonb_build_object('stage', stage, 'count', n, 'value', v)), '[]') from (
      select stage, count(*) n, coalesce(sum(value), 0) v from deals where stage not in ('Completed', 'Cancelled / Lost') group by stage) x),
    'lost_reasons', (select coalesce(jsonb_agg(jsonb_build_object('reason', lost_reason, 'count', n) order by n desc), '[]') from (
      select lost_reason, count(*) n from deals where stage = 'Cancelled / Lost' and closed_at >= p_from and closed_at < p_to group by lost_reason) x),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', dd, 'inbound', inbound, 'new_chats', new_chats) order by dd), '[]') from (
      select g::date dd,
        (select count(*) from messages m where m.direction = 'in' and m.kind <> 'system' and (m.created_at at time zone 'Asia/Bangkok')::date = g::date) inbound,
        (select count(*) from conversations c where (c.created_at at time zone 'Asia/Bangkok')::date = g::date) new_chats
      from generate_series((p_from at time zone 'Asia/Bangkok')::date, ((p_to - interval '1 second') at time zone 'Asia/Bangkok')::date, interval '1 day') g) x),
    'people', (select coalesce(jsonb_agg(to_jsonb(pp) order by pp.won_value desc, pp.sent desc), '[]') from per_person pp),
    'scope', case when r in ('owner', 'admin') then 'all' else 'self' end
  ) into out;
  return out;
end $$;
revoke all on function public.sales_dashboard(timestamptz, timestamptz) from public, anon;
grant execute on function public.sales_dashboard(timestamptz, timestamptz) to authenticated, service_role;

-- live board
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'deals') then
    alter publication supabase_realtime add table public.deals;
  end if;
end $$;
