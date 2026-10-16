-- ═══════════════════════════════════════════════════════════════════
-- Phase 4B: auto-reply bot (no AI)
--
-- Forward-only. The bot only sends what the shop wrote here (Q&A rules,
-- greeting, payment details, a "starting price" table) — it never makes up
-- prices or delivery dates. It is OFF until an owner/admin switches it on,
-- answers with LINE's free Reply API, stops by itself in a chat as soon as a
-- staff member replies, and hands everything else to staff.
-- ═══════════════════════════════════════════════════════════════════

alter table public.conversations add column if not exists bot_handoff_at timestamptz;

create table if not exists public.bot_settings (
  id              boolean primary key default true check (id),   -- single row
  enabled         boolean not null default false,
  greeting        text,            -- sent when someone adds the OA as a friend
  handoff         text,            -- sent once when the bot has no answer
  payment_text    text,            -- bank / account name / number, shown with the QR
  qr_url          text,            -- public https image (LINE fetches it)
  updated_at      timestamptz not null default now(),
  updated_by      uuid default auth.uid() references public.profiles(id) on delete set null
);
insert into public.bot_settings (id) values (true) on conflict do nothing;

create table if not exists public.bot_rules (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(trim(title)) > 0),
  kind        text not null default 'answer' check (kind in ('answer','payment','price')),
  keywords    text[] not null default '{}',
  answer      text,
  in_menu     boolean not null default false,   -- shown as a quick-reply button
  enabled     boolean not null default true,
  sort        integer not null default 100,
  hits        integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.bot_prices (
  id          uuid primary key default gen_random_uuid(),
  product     text not null check (length(trim(product)) > 0),     -- เสื้อยืด / โปโล / ...
  technique   text not null check (length(trim(technique)) > 0),   -- สกรีน / DTF / ปัก / ...
  min_qty     integer not null check (min_qty > 0),
  price_from  numeric(10,2) not null check (price_from > 0),       -- "เริ่มต้น" per piece
  note        text,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (product, technique, min_qty)
);

drop trigger if exists trg_bot_rules_touch on public.bot_rules;
create trigger trg_bot_rules_touch before update on public.bot_rules for each row execute function public.touch_updated_at();
drop trigger if exists trg_bot_settings_touch on public.bot_settings;
create trigger trg_bot_settings_touch before update on public.bot_settings for each row execute function public.touch_updated_at();

alter table public.bot_settings enable row level security;
alter table public.bot_rules    enable row level security;
alter table public.bot_prices   enable row level security;
revoke all on public.bot_settings, public.bot_rules, public.bot_prices from anon;
grant select, insert, update, delete on public.bot_settings, public.bot_rules, public.bot_prices to authenticated, service_role;

do $$ declare t text; begin
  foreach t in array array['bot_settings','bot_rules','bot_prices'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.has_role(''owner'',''admin'',''sales'',''designer''))', t || '_read', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.has_role(''owner'',''admin'')) with check (public.has_role(''owner'',''admin''))', t || '_write', t);
  end loop;
end $$;

-- QR / images the bot sends must be public URLs (LINE downloads them)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bot-assets', 'bot-assets', true, 5242880, array['image/jpeg','image/png'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "admin upload bot-assets" on storage.objects;
drop policy if exists "admin change bot-assets" on storage.objects;
create policy "admin upload bot-assets" on storage.objects for insert to authenticated
  with check (bucket_id = 'bot-assets' and public.has_role('owner','admin'));
create policy "admin change bot-assets" on storage.objects for update to authenticated
  using (bucket_id = 'bot-assets' and public.has_role('owner','admin'));

-- starter Q&A from the shop's stated terms — the bot stays OFF until reviewed
insert into public.bot_rules (title, kind, keywords, answer, in_menu, sort)
select * from (values
  ('ขอราคา', 'price', array['ราคา','เท่าไหร่','เท่าไร','กี่บาท','ขอราคา','price'], null::text, true, 10),
  ('ระยะเวลาผลิต', 'answer', array['กี่วัน','นานไหม','ระยะเวลา','ได้เมื่อไหร่','ผลิตกี่วัน','ทันไหม'],
     'งานสกรีนและงานปักใช้เวลาผลิตประมาณ 7–14 วัน หลังยืนยันแบบและชำระมัดจำค่ะ ถ้ามีวันที่ต้องใช้งาน แจ้งได้เลยนะคะ พนักงานจะเช็กคิวให้ค่ะ', true, 20),
  ('การชำระเงิน / มัดจำ', 'payment', array['โอน','เลขบัญชี','บัญชี','มัดจำ','ชำระ','จ่ายเงิน','qr','คิวอาร์','พร้อมเพย์'],
     'ร้านรับมัดจำ 50% ผ่าน QR / โอนเข้าบัญชีร้าน ส่วนที่เหลือชำระก่อนจัดส่งค่ะ โอนแล้วส่งสลิปในแชทนี้ได้เลย พนักงานจะตรวจสอบและยืนยันให้ค่ะ', true, 30),
  ('ค่าจัดส่ง', 'answer', array['ค่าส่ง','จัดส่ง','ส่งยังไง','ส่งต่างจังหวัด','ขนส่ง'],
     'ร้านจัดส่งทั่วประเทศ คิดค่าส่งตามจริงค่ะ', false, 40),
  ('ใบกำกับภาษี', 'answer', array['ใบกำกับ','vat','ใบเสร็จ','ภาษี','หัก ณ ที่จ่าย'],
     'ร้านออกใบกำกับภาษี (VAT) ได้ค่ะ แจ้งชื่อบริษัท ที่อยู่ และเลขประจำตัวผู้เสียภาษีในแชทได้เลยนะคะ', false, 50),
  ('เวลาทำการ', 'answer', array['เปิดกี่โมง','ปิดกี่โมง','เวลาทำการ','เปิดไหม','วันหยุด'],
     'ร้านตอบแชททุกวัน 09:00–21:00 น. ค่ะ', false, 60)
) v(title, kind, keywords, answer, in_menu, sort)
where not exists (select 1 from public.bot_rules);

update public.bot_settings set
  greeting = coalesce(greeting, 'ขอบคุณที่เพิ่มเพื่อนค่ะ 🙏 รับสกรีน ปัก ตัดเย็บ และออกแบบเสื้อ สอบถามได้เลย หรือกดเมนูด้านล่างค่ะ'),
  handoff  = coalesce(handoff, 'ได้รับข้อความแล้วค่ะ พนักงานจะรีบตอบกลับโดยเร็วที่สุด (ตอบแชท 09:00–21:00 น.) 🙏')
where id;

-- a chat goes back to the bot when staff close it
create or replace function public.bot_resume_on_close()
returns trigger language plpgsql as $$
begin
  if new.status = 'closed' and old.status is distinct from 'closed' then new.bot_active := true; new.bot_handoff_at := null; end if;
  return new;
end $$;
drop trigger if exists trg_conversations_bot_resume on public.conversations;
create trigger trg_conversations_bot_resume before update on public.conversations for each row execute function public.bot_resume_on_close();

-- what the bot said (server only): never touches assignment, never pauses itself
create or replace function public.record_bot_reply(p_conversation_id uuid, p_texts text[], p_rule_id uuid default null, p_handoff boolean default false)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare t text;
begin
  foreach t in array p_texts loop
    insert into messages (conversation_id, direction, kind, text, sent_by_bot, status) values (p_conversation_id, 'out', 'text', t, true, 'sent');
  end loop;
  update conversations set
    last_message_at = now(),
    last_message_text = coalesce(p_texts[array_length(p_texts, 1)], last_message_text),
    bot_handoff_at = case when p_handoff then now() else bot_handoff_at end
  where id = p_conversation_id;
  if p_rule_id is not null then update bot_rules set hits = hits + 1 where id = p_rule_id; end if;
end $$;
revoke all on function public.record_bot_reply(uuid, text[], uuid, boolean) from public, anon, authenticated;
grant execute on function public.record_bot_reply(uuid, text[], uuid, boolean) to service_role;

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
     or ev_type not in ('message', 'follow', 'unfollow', 'postback') then
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

  insert into conversations (identity_id, platform, customer_id, status, bot_active)
  values (ident.id, 'line', ident.customer_id, 'new', true)   -- a new chat starts with the bot (if the bot is switched on)
  on conflict (identity_id) do nothing;
  select * into conv from conversations where identity_id = ident.id for update;

  if new_ident or (ident.display_name is null and not exists (
        select 1 from channel_tasks where kind = 'line.profile' and status = 'queued' and payload ->> 'identity_id' = ident.id::text)) then
    insert into channel_tasks (kind, payload) values ('line.profile', jsonb_build_object('identity_id', ident.id, 'user_id', user_id));
  end if;

  if ev_type = 'follow' then
    m_kind := 'system'; m_text := 'ลูกค้าเพิ่มเพื่อน LINE OA';
  elsif ev_type = 'postback' then   -- customer tapped a bot button: data = "<label>|<action>"
    m_kind := 'text'; m_text := '👆 ' || split_part(p_event -> 'postback' ->> 'data', '|', 1);
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
  return jsonb_build_object('status', 'processed', 'conversation_id', conv.id, 'message_id', m_id,
    'event_type', ev_type, 'kind', m_kind, 'new_contact', new_ident,
    'bot_active', conv.bot_active, 'bot_handoff_at', conv.bot_handoff_at);
end $$;

revoke all on function public.ingest_line_event(text, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_line_event(text, jsonb) to service_role;
