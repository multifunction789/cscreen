-- ═══════════════════════════════════════════════════════════════════
-- Phase 3: Unified Inbox tables + CRM linking
--
-- Forward-only. New tables only (+1 nullable column on customers).
-- Browser access follows the RLS matrix in the plan; webhooks/workers use the
-- service role. Linking a chat account to a customer needs a staff member, a
-- reason (evidence) and is written to audit_log — never automatic by name.
-- ═══════════════════════════════════════════════════════════════════

alter table public.customers add column if not exists shipping_address text;

-- ── Tables ─────────────────────────────────────────────────────────
create table if not exists public.channel_accounts (
  id               uuid primary key default gen_random_uuid(),
  platform         text not null check (platform in ('line','facebook','tiktok')),
  external_id      text not null,                       -- LINE channel / FB page / TikTok business id
  display_name     text,
  status           text not null default 'not_connected' check (status in ('not_connected','connected','error')),
  last_event_at    timestamptz,
  last_error       text,
  vault_secret_name text,                               -- token lives in Supabase Vault, never in this row
  created_at       timestamptz not null default now(),
  unique (platform, external_id)
);

create table if not exists public.contact_identities (
  id                 uuid primary key default gen_random_uuid(),
  platform           text not null check (platform in ('line','facebook','tiktok')),
  channel_account_id uuid references public.channel_accounts(id) on delete set null,
  external_id        text not null,                     -- LINE userId / PSID / TikTok user id
  display_name       text,
  picture_url        text,
  customer_id        uuid references public.customers(id) on delete set null,
  linked_by          uuid references public.profiles(id) on delete set null,
  linked_at          timestamptz,
  link_evidence      text,
  created_at         timestamptz not null default now(),
  unique (platform, external_id)
);
create index if not exists contact_identities_customer_idx on public.contact_identities (customer_id);

create table if not exists public.conversations (
  id                uuid primary key default gen_random_uuid(),
  identity_id       uuid not null unique references public.contact_identities(id) on delete cascade,
  platform          text not null check (platform in ('line','facebook','tiktok')),
  customer_id       uuid references public.customers(id) on delete set null,
  status            text not null default 'new' check (status in ('new','open','waiting','followup','closed')),
  assigned_to       uuid references public.profiles(id) on delete set null,
  unread            integer not null default 0 check (unread >= 0),
  last_message_at   timestamptz,
  last_message_text text,
  last_inbound_at   timestamptz,
  follow_up_at      timestamptz,
  bot_active        boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists conversations_last_idx on public.conversations (last_message_at desc nulls last);
create index if not exists conversations_customer_idx on public.conversations (customer_id);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  direction       text not null check (direction in ('in','out')),
  kind            text not null default 'text' check (kind in ('text','image','file','video','audio','sticker','location','document','system')),
  text            text,
  attachment      jsonb,                                 -- { bucket, path, name, mime, size }
  document        jsonb,                                 -- { type, id, code, version } when a quotation/receipt was sent
  external_id     text,                                  -- platform message id (dedupe of webhook retries)
  client_key      text,                                  -- one per send button press (dedupe of double sends)
  sent_by         uuid references public.profiles(id) on delete set null,
  sent_by_bot     boolean not null default false,
  status          text not null default 'received' check (status in ('received','sending','sent','failed')),
  error           text,
  created_at      timestamptz not null default now()
);
create unique index if not exists messages_external_uniq on public.messages (conversation_id, external_id) where external_id is not null;
create unique index if not exists messages_client_key_uniq on public.messages (client_key) where client_key is not null;
create index if not exists messages_conv_idx on public.messages (conversation_id, created_at);

create table if not exists public.conversation_notes (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  author          uuid default auth.uid() references public.profiles(id) on delete set null,
  text            text not null check (length(trim(text)) > 0),
  created_at      timestamptz not null default now()
);
create index if not exists conversation_notes_conv_idx on public.conversation_notes (conversation_id, created_at);

create table if not exists public.webhook_events (
  id               uuid primary key default gen_random_uuid(),
  platform         text not null,
  event_id         text not null,
  payload          jsonb not null,
  received_at      timestamptz not null default now(),
  processed_at     timestamptz,
  status           text not null default 'received' check (status in ('received','processed','failed','ignored')),
  attempts         integer not null default 0,
  last_error       text,
  forward_status   text check (forward_status in ('pending','sent','failed','skipped')),
  forward_attempts integer not null default 0,
  forward_error    text,
  unique (platform, event_id)
);

create table if not exists public.deals (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid references public.customers(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  stage           text not null default 'New Lead' check (stage in ('New Lead','Waiting for Details','Quotation Draft','Quotation Sent','Follow-up','Confirmed','Waiting for Deposit','Production','Ready for Delivery','Completed','Cancelled / Lost')),
  value           numeric(14,2),
  quotation_id    uuid references public.quotations(id) on delete set null,
  invoice_id      uuid references public.invoices(id) on delete set null,
  owner           uuid references public.profiles(id) on delete set null,
  lost_reason     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists deals_conversation_idx on public.deals (conversation_id);
create index if not exists deals_customer_idx on public.deals (customer_id);

create table if not exists public.audit_log (
  id        bigint generated always as identity primary key,
  actor     uuid default auth.uid(),
  action    text not null,
  entity    text not null,
  entity_id text,
  detail    jsonb,
  at        timestamptz not null default now()
);
create index if not exists audit_log_entity_idx on public.audit_log (entity, entity_id, at desc);

drop trigger if exists trg_conversations_touch on public.conversations;
create trigger trg_conversations_touch before update on public.conversations for each row execute function public.touch_updated_at();
drop trigger if exists trg_deals_touch on public.deals;
create trigger trg_deals_touch before update on public.deals for each row execute function public.touch_updated_at();

-- ── Audit (who changed assignment / status / customer / stage) ─────
create or replace function public.audit_inbox_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare d jsonb := '{}'::jsonb; k text;
begin
  foreach k in array tg_argv loop
    if (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then
      d := d || jsonb_build_object(k, jsonb_build_array(to_jsonb(old) -> k, to_jsonb(new) -> k));
    end if;
  end loop;
  if d <> '{}'::jsonb then
    insert into audit_log (action, entity, entity_id, detail) values ('update', tg_table_name, new.id::text, d);
  end if;
  return new;
end $$;
drop trigger if exists trg_conversations_audit on public.conversations;
create trigger trg_conversations_audit after update on public.conversations for each row
  execute function public.audit_inbox_change('status', 'assigned_to', 'customer_id', 'follow_up_at');
drop trigger if exists trg_deals_audit on public.deals;
create trigger trg_deals_audit after update on public.deals for each row
  execute function public.audit_inbox_change('stage', 'value', 'customer_id', 'quotation_id', 'invoice_id', 'owner');

-- ── RLS ────────────────────────────────────────────────────────────
alter table public.channel_accounts   enable row level security;
alter table public.contact_identities enable row level security;
alter table public.conversations      enable row level security;
alter table public.messages           enable row level security;
alter table public.conversation_notes enable row level security;
alter table public.webhook_events     enable row level security;
alter table public.deals              enable row level security;
alter table public.audit_log          enable row level security;
revoke all on public.channel_accounts, public.webhook_events, public.audit_log from anon;
revoke all on public.contact_identities, public.conversations, public.messages, public.conversation_notes, public.deals from anon;

-- channel_accounts: no browser policy at all (status via list_channel_status)
drop policy if exists inbox_identities_read  on public.contact_identities;
drop policy if exists inbox_identities_write on public.contact_identities;
create policy inbox_identities_read on public.contact_identities for select to authenticated
  using (public.has_role('owner','admin','sales','designer'));
create policy inbox_identities_write on public.contact_identities for update to authenticated
  using (public.has_role('owner','admin','sales')) with check (public.has_role('owner','admin','sales'));

drop policy if exists inbox_conv_read  on public.conversations;
drop policy if exists inbox_conv_write on public.conversations;
create policy inbox_conv_read on public.conversations for select to authenticated
  using (public.has_role('owner','admin','sales','designer'));
create policy inbox_conv_write on public.conversations for update to authenticated
  using (public.has_role('owner','admin','sales')) with check (public.has_role('owner','admin','sales'));

drop policy if exists inbox_msg_read on public.messages;
create policy inbox_msg_read on public.messages for select to authenticated
  using (public.has_role('owner','admin','sales','designer'));
-- messages are written by the server only (send API + webhooks)

drop policy if exists inbox_notes_read   on public.conversation_notes;
drop policy if exists inbox_notes_insert on public.conversation_notes;
drop policy if exists inbox_notes_change on public.conversation_notes;
drop policy if exists inbox_notes_delete on public.conversation_notes;
create policy inbox_notes_read on public.conversation_notes for select to authenticated
  using (public.has_role('owner','admin','sales','designer'));
create policy inbox_notes_insert on public.conversation_notes for insert to authenticated
  with check (public.has_role('owner','admin','sales') and author = auth.uid());
create policy inbox_notes_change on public.conversation_notes for update to authenticated
  using (public.has_role('owner','admin') or (public.has_role('sales') and author = auth.uid()))
  with check (public.has_role('owner','admin') or (public.has_role('sales') and author = auth.uid()));
create policy inbox_notes_delete on public.conversation_notes for delete to authenticated
  using (public.has_role('owner','admin') or (public.has_role('sales') and author = auth.uid()));

drop policy if exists inbox_events_read on public.webhook_events;
create policy inbox_events_read on public.webhook_events for select to authenticated
  using (public.has_role('owner','admin'));

drop policy if exists deals_read   on public.deals;
drop policy if exists deals_insert on public.deals;
drop policy if exists deals_update on public.deals;
drop policy if exists deals_delete on public.deals;
create policy deals_read on public.deals for select to authenticated
  using (public.app_role() is not null);
create policy deals_insert on public.deals for insert to authenticated
  with check (public.has_role('owner','admin','sales'));
create policy deals_update on public.deals for update to authenticated
  using (public.has_role('owner','admin','sales')) with check (public.has_role('owner','admin','sales'));
create policy deals_delete on public.deals for delete to authenticated
  using (public.has_role('owner','admin'));

drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select to authenticated
  using (public.has_role('owner','admin'));

-- accounting sees which chat belongs to which customer, never the chat text
create or replace view public.conversation_directory with (security_barrier = true) as
  select c.id, c.platform, c.customer_id, c.status, c.assigned_to, c.last_message_at
  from public.conversations c
  where public.has_role('owner','admin','sales','designer','accounting');
revoke all on public.conversation_directory from anon;
grant select on public.conversation_directory to authenticated;

-- ── RPCs ───────────────────────────────────────────────────────────
create or replace function public.list_channel_status()
returns table (platform text, display_name text, status text, last_event_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select platform, display_name, status, last_event_at from channel_accounts
  where public.app_role() is not null order by platform
$$;

-- candidates: exact phone / tax id / email = strong; name only = weak (needs other proof)
create or replace function public.find_customer_candidates(p_phone text default null, p_tax_id text default null, p_email text default null, p_name text default null)
returns table (id uuid, code text, name text, phone text, tax_id text, email text, match text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare ph text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
        tx text := nullif(regexp_replace(coalesce(p_tax_id, ''), '\D', '', 'g'), '');
        em text := nullif(lower(trim(coalesce(p_email, ''))), '');
        nm text := nullif(trim(coalesce(p_name, '')), '');
begin
  if not public.has_role('owner','admin','sales') then raise exception 'ไม่มีสิทธิ์ค้นหาลูกค้าจากแชท'; end if;
  return query
    select s.id, s.code, s.name, s.phone, s.tax_id, s.email, s.m from (
      select c.id, c.code, c.name, c.phone, c.tax_id, c.email,
             case when ph is not null and length(ph) >= 9 and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = ph then 'phone'
                  when tx is not null and regexp_replace(coalesce(c.tax_id, ''), '\D', '', 'g') = tx then 'tax_id'
                  when em is not null and lower(trim(coalesce(c.email, ''))) = em then 'email'
                  else 'name' end as m
      from customers c
      where (ph is not null and length(ph) >= 9 and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = ph)
         or (tx is not null and regexp_replace(coalesce(c.tax_id, ''), '\D', '', 'g') = tx)
         or (em is not null and lower(trim(coalesce(c.email, ''))) = em)
         or (nm is not null and length(nm) >= 2 and c.name ilike '%' || nm || '%')
    ) s
    order by (s.m = 'name'), s.name
    limit 20;
end $$;

-- link / unlink a chat (and its chat account) to a customer — needs a reason, always audited
create or replace function public.link_conversation_customer(p_conversation_id uuid, p_customer_id uuid, p_evidence text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare cv conversations;
begin
  if not public.has_role('owner','admin','sales') then raise exception 'ไม่มีสิทธิ์ผูกลูกค้า'; end if;
  select * into cv from conversations where id = p_conversation_id for update;
  if not found then raise exception 'ไม่พบแชท'; end if;
  if p_customer_id is not null and nullif(trim(coalesce(p_evidence, '')), '') is null then
    raise exception 'กรุณาระบุหลักฐานการยืนยันตัวตน';
  end if;
  if p_customer_id is not null and not exists (select 1 from customers where id = p_customer_id) then raise exception 'ไม่พบลูกค้า'; end if;
  update contact_identities set customer_id = p_customer_id,
         linked_by = case when p_customer_id is null then null else auth.uid() end,
         linked_at = case when p_customer_id is null then null else now() end,
         link_evidence = case when p_customer_id is null then null else trim(p_evidence) end
   where id = cv.identity_id;
  update conversations set customer_id = p_customer_id where id = cv.id;
  update deals set customer_id = p_customer_id where conversation_id = cv.id and customer_id is distinct from p_customer_id;
  insert into audit_log (action, entity, entity_id, detail)
  values (case when p_customer_id is null then 'unlink_customer' else 'link_customer' end, 'contact_identities', cv.identity_id::text,
          jsonb_build_object('conversation_id', cv.id, 'from', cv.customer_id, 'to', p_customer_id, 'evidence', p_evidence));
end $$;

-- create a customer from a chat (code C-### allocated under a lock, no duplicates)
create or replace function public.create_customer_for_conversation(p_conversation_id uuid, p_data jsonb)
returns customers language plpgsql security definer set search_path = public, pg_temp as $$
declare cv conversations; c customers; nxt int;
begin
  if not public.has_role('owner','admin','sales') then raise exception 'ไม่มีสิทธิ์สร้างลูกค้า'; end if;
  if nullif(trim(p_data ->> 'name'), '') is null then raise exception 'กรุณาระบุชื่อลูกค้า'; end if;
  select * into cv from conversations where id = p_conversation_id for update;
  if not found then raise exception 'ไม่พบแชท'; end if;
  if cv.customer_id is not null then raise exception 'แชทนี้ผูกกับลูกค้าแล้ว'; end if;
  perform pg_advisory_xact_lock(hashtext('customers.code'));
  select coalesce(max(nullif(regexp_replace(code, '\D', '', 'g'), '')::int), 0) + 1 into nxt from customers where code ~ '^C-\d+$';
  insert into customers (code, name, type, phone, email, tax_id, address, shipping_address, notes, contact_person, platform)
  values ('C-' || lpad(nxt::text, 3, '0'), trim(p_data ->> 'name'),
          coalesce(nullif(p_data ->> 'type', ''), 'บุคคลธรรมดา'), nullif(p_data ->> 'phone', ''), nullif(p_data ->> 'email', ''),
          nullif(p_data ->> 'tax_id', ''), nullif(p_data ->> 'address', ''), nullif(p_data ->> 'shipping_address', ''),
          nullif(p_data ->> 'notes', ''), nullif(p_data ->> 'contact_person', ''),
          case cv.platform when 'line' then 'Line' when 'facebook' then 'Facebook' else 'TikTok' end)
  returning * into c;
  perform public.link_conversation_customer(cv.id, c.id, 'สร้างลูกค้าใหม่จากแชท');
  return c;
end $$;

-- readers may clear their unread badge even without update rights
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void language sql security definer set search_path = public, pg_temp as $$
  update conversations set unread = 0
  where id = p_conversation_id and unread > 0 and public.has_role('owner','admin','sales','designer')
$$;

revoke all on function public.list_channel_status(), public.find_customer_candidates(text, text, text, text),
  public.link_conversation_customer(uuid, uuid, text), public.create_customer_for_conversation(uuid, jsonb),
  public.mark_conversation_read(uuid), public.audit_inbox_change() from public, anon;
grant execute on function public.list_channel_status(), public.find_customer_candidates(text, text, text, text),
  public.link_conversation_customer(uuid, uuid, text), public.create_customer_for_conversation(uuid, jsonb),
  public.mark_conversation_read(uuid) to authenticated, service_role;

-- ── Realtime (RLS still applies to what each user receives) ────────
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['conversations', 'messages', 'conversation_notes'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
