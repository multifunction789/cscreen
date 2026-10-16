-- ═══════════════════════════════════════════════════════════════════
-- Phase 4: LINE OA — receive, send, and a durable task queue
--
-- Forward-only. One new table (channel_tasks) + server-only functions.
-- Everything here is called by the server with the service role
-- (webhook, send API, worker). Browsers get nothing new except reading
-- the queue health (owner/admin).
--
-- Queue: a plain table claimed with FOR UPDATE SKIP LOCKED and a lock
-- timeout (= visibility timeout). Tasks are inserted in the same
-- transaction as the event, so a crash never loses work. After 5 failed
-- attempts a task becomes 'dead' and is shown to owner/admin.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.channel_tasks (
  id           bigint generated always as identity primary key,
  kind         text not null check (kind in ('line.profile','line.content','line.botinfo')),
  payload      jsonb not null default '{}'::jsonb,
  status       text not null default 'queued' check (status in ('queued','done','dead')),
  attempts     integer not null default 0,
  run_after    timestamptz not null default now(),
  locked_until timestamptz,
  last_error   text,
  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);
create index if not exists channel_tasks_ready_idx on public.channel_tasks (run_after, id) where status = 'queued';

alter table public.channel_tasks enable row level security;
revoke all on public.channel_tasks from anon;
drop policy if exists channel_tasks_read on public.channel_tasks;
create policy channel_tasks_read on public.channel_tasks for select to authenticated
  using (public.has_role('owner','admin'));

-- ── Receive: one LINE webhook event, all-or-nothing ────────────────
-- Returns { status: processed | duplicate | ignored, conversation_id?, message_id? }
create or replace function public.ingest_line_event(p_destination text, p_event jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  ev_id   text := coalesce(p_event ->> 'webhookEventId', md5(p_event::text));
  ev_type text := p_event ->> 'type';
  src     jsonb := p_event -> 'source';
  user_id text := src ->> 'userId';
  msg     jsonb := p_event -> 'message';
  at      timestamptz := to_timestamp(coalesce((p_event ->> 'timestamp')::bigint, (extract(epoch from now()) * 1000)::bigint) / 1000.0);
  acct    channel_accounts;
  ident   contact_identities;
  conv    conversations;
  new_ident boolean := false;
  m_kind  text;
  m_text  text;
  m_att   jsonb;
  m_id    uuid;
  inserted int;
begin
  -- the channel itself: the first event (or LINE's "Verify" button) marks it connected
  insert into channel_accounts (platform, external_id, status, last_event_at)
  values ('line', p_destination, 'connected', now())
  on conflict (platform, external_id) do update set status = 'connected', last_event_at = now(), last_error = null
  returning * into acct;
  if acct.display_name is null and not exists (select 1 from channel_tasks where kind = 'line.botinfo' and status = 'queued') then
    insert into channel_tasks (kind, payload) values ('line.botinfo', jsonb_build_object('channel_account_id', acct.id));
  end if;

  if p_event is null then return jsonb_build_object('status', 'ignored'); end if;

  insert into webhook_events (platform, event_id, payload, status, forward_status)
  values ('line', ev_id, p_event, 'received', 'skipped')
  on conflict (platform, event_id) do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then return jsonb_build_object('status', 'duplicate'); end if;

  -- 1:1 chats only; groups/rooms and unknown events are kept but not shown
  if src ->> 'type' is distinct from 'user' or user_id is null
     or ev_type not in ('message', 'follow', 'unfollow') then
    update webhook_events set status = 'ignored', processed_at = now() where platform = 'line' and event_id = ev_id;
    return jsonb_build_object('status', 'ignored');
  end if;

  insert into contact_identities (platform, channel_account_id, external_id)
  values ('line', acct.id, user_id)
  on conflict (platform, external_id) do nothing
  returning * into ident;
  if ident.id is null then
    select * into ident from contact_identities where platform = 'line' and external_id = user_id;
  else
    new_ident := true;
  end if;

  insert into conversations (identity_id, platform, customer_id, status)
  values (ident.id, 'line', ident.customer_id, 'new')
  on conflict (identity_id) do nothing;
  select * into conv from conversations where identity_id = ident.id for update;

  if new_ident or (ident.display_name is null and not exists (
        select 1 from channel_tasks where kind = 'line.profile' and status = 'queued' and payload ->> 'identity_id' = ident.id::text)) then
    insert into channel_tasks (kind, payload) values ('line.profile', jsonb_build_object('identity_id', ident.id, 'user_id', user_id));
  end if;

  if ev_type = 'follow' then
    m_kind := 'system'; m_text := 'ลูกค้าเพิ่มเพื่อน LINE OA';
  elsif ev_type = 'unfollow' then
    m_kind := 'system'; m_text := 'ลูกค้าบล็อก / เลิกติดตาม LINE OA — ส่งข้อความถึงไม่ได้จนกว่าจะเพิ่มเพื่อนใหม่';
  else
    case msg ->> 'type'
      when 'text' then m_kind := 'text'; m_text := msg ->> 'text';
      when 'image' then m_kind := 'image'; m_text := null;
      when 'video' then m_kind := 'video'; m_text := null;
      when 'audio' then m_kind := 'audio'; m_text := null;
      when 'file' then m_kind := 'file'; m_text := null;
      when 'sticker' then m_kind := 'sticker'; m_text := '[สติกเกอร์]';
      when 'location' then m_kind := 'location';
        m_text := concat_ws(' ', nullif(msg ->> 'title', ''), nullif(msg ->> 'address', ''),
          'https://maps.google.com/?q=' || (msg ->> 'latitude') || ',' || (msg ->> 'longitude'));
      else m_kind := 'text'; m_text := '[ข้อความชนิด ' || coalesce(msg ->> 'type', '?') || ' — เปิดดูในแอป LINE]';
    end case;
    if m_kind in ('image','video','audio','file') then
      m_att := jsonb_build_object('pending', true, 'name', coalesce(msg ->> 'fileName', m_kind), 'size', (msg ->> 'fileSize')::bigint);
    end if;
  end if;

  insert into messages (conversation_id, direction, kind, text, attachment, external_id, status, created_at)
  values (conv.id, 'in', m_kind, m_text, m_att, coalesce(msg ->> 'id', ev_id), 'received', at)
  on conflict do nothing
  returning id into m_id;

  if m_id is not null then
    if m_att is not null and coalesce(msg -> 'contentProvider' ->> 'type', 'line') = 'line' then
      insert into channel_tasks (kind, payload) values ('line.content',
        jsonb_build_object('message_id', m_id, 'line_message_id', msg ->> 'id', 'conversation_id', conv.id, 'kind', m_kind, 'name', msg ->> 'fileName'));
    elsif m_att is not null then  -- content hosted by the sender (external URL)
      update messages set attachment = jsonb_build_object('url', msg -> 'contentProvider' ->> 'originalContentUrl', 'name', m_kind) where id = m_id;
    end if;
    update conversations set
      last_message_at = greatest(coalesce(last_message_at, at), at),
      last_message_text = case when m_kind = 'system' then last_message_text
                               else coalesce(m_text, case m_kind when 'image' then '[รูปภาพ]' when 'video' then '[วิดีโอ]' when 'audio' then '[เสียง]' else '[ไฟล์]' end) end,
      last_inbound_at = case when m_kind = 'system' then last_inbound_at else at end,
      unread = unread + case when m_kind = 'system' then 0 else 1 end,
      status = case when status in ('closed','waiting') and m_kind <> 'system' then 'open' else status end
    where id = conv.id;
  end if;

  update webhook_events set status = 'processed', processed_at = now() where platform = 'line' and event_id = ev_id;
  return jsonb_build_object('status', 'processed', 'conversation_id', conv.id, 'message_id', m_id);
end $$;

-- ── Send: reserve the message first (client_key = idempotency key) ──
-- Returns the message row; if this client_key was already used, the
-- existing row comes back unchanged so the caller never sends twice.
create or replace function public.reserve_outgoing_message(p_conversation_id uuid, p_client_key text, p_text text, p_kind text, p_attachment jsonb, p_sender uuid)
returns messages language plpgsql security definer set search_path = public, pg_temp as $$
declare m messages;
begin
  if nullif(trim(coalesce(p_client_key, '')), '') is null then raise exception 'client_key required'; end if;
  select * into m from messages where client_key = p_client_key;
  if found then
    if m.conversation_id <> p_conversation_id then raise exception 'client_key ถูกใช้กับแชทอื่นแล้ว'; end if;
    return m;
  end if;
  insert into messages (conversation_id, direction, kind, text, attachment, client_key, sent_by, status)
  values (p_conversation_id, 'out', coalesce(p_kind, 'text'), p_text, p_attachment, p_client_key, p_sender, 'sending')
  returning * into m;
  update conversations set
    last_message_at = m.created_at,
    last_message_text = coalesce(nullif(p_text, ''), '[ไฟล์]'),
    assigned_to = coalesce(assigned_to, p_sender),
    status = case when status in ('new','closed') then 'open' else status end,
    bot_active = false
  where id = p_conversation_id;
  return m;
end $$;

create or replace function public.finish_outgoing_message(p_message_id uuid, p_ok boolean, p_error text default null)
returns messages language sql security definer set search_path = public, pg_temp as $$
  update messages set status = case when p_ok then 'sent' else 'failed' end,
                      error = case when p_ok then null else left(p_error, 500) end
  where id = p_message_id and status in ('sending','failed')
  returning *
$$;

-- ── Queue ──────────────────────────────────────────────────────────
create or replace function public.claim_channel_tasks(p_limit int default 10, p_lock_seconds int default 60)
returns setof channel_tasks language sql security definer set search_path = public, pg_temp as $$
  update channel_tasks t set attempts = t.attempts + 1, locked_until = now() + make_interval(secs => p_lock_seconds)
  where t.id in (
    select id from channel_tasks
    where status = 'queued' and run_after <= now() and (locked_until is null or locked_until < now())
    order by run_after, id
    limit greatest(1, least(p_limit, 50))
    for update skip locked)
  returning t.*
$$;

create or replace function public.complete_channel_task(p_id bigint, p_ok boolean, p_error text default null)
returns channel_tasks language sql security definer set search_path = public, pg_temp as $$
  update channel_tasks set
    status = case when p_ok then 'done' when attempts >= 5 then 'dead' else 'queued' end,
    locked_until = null,
    last_error = case when p_ok then null else left(p_error, 500) end,
    run_after = case when p_ok then run_after else now() + make_interval(secs => least(3600, 15 * power(2, attempts)::int)) end,
    finished_at = case when p_ok or attempts >= 5 then now() else null end
  where id = p_id
  returning *
$$;

-- server only: nobody but the service role may call these
revoke all on function public.ingest_line_event(text, jsonb),
  public.reserve_outgoing_message(uuid, text, text, text, jsonb, uuid),
  public.finish_outgoing_message(uuid, boolean, text),
  public.claim_channel_tasks(int, int),
  public.complete_channel_task(bigint, boolean, text) from public, anon, authenticated;
grant execute on function public.ingest_line_event(text, jsonb),
  public.reserve_outgoing_message(uuid, text, text, text, jsonb, uuid),
  public.finish_outgoing_message(uuid, boolean, text),
  public.claim_channel_tasks(int, int),
  public.complete_channel_task(bigint, boolean, text) to service_role;
grant select, insert, update, delete on public.channel_tasks to service_role;
