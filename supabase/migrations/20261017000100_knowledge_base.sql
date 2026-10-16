-- ═══════════════════════════════════════════════════════════════════
-- Knowledge base (คลังความรู้) — one source for staff answers and the bot
--
-- Forward-only. Articles are written by owner/admin and read by the chat team.
--   visibility = 'customer'  → may be sent to customers (by staff, or by the bot
--                               when bot_enabled is on)
--   visibility = 'internal'  → staff reference only; the bot can never use it
-- The bot's plain Q&A rules move here; bot_rules keeps the special flows
-- (payment details, starting price).
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.kb_articles (
  id          uuid primary key default gen_random_uuid(),
  category    text not null default 'ทั่วไป' check (length(trim(category)) > 0),
  title       text not null check (length(trim(title)) > 0),
  body        text not null default '',          -- what the customer receives
  staff_note  text,                              -- tips for staff, never sent
  images      text[] not null default '{}',      -- public https URLs (bot-assets/kb/…), max 4
  keywords    text[] not null default '{}',
  visibility  text not null default 'customer' check (visibility in ('customer','internal')),
  bot_enabled boolean not null default false,
  in_menu     boolean not null default false,
  sort        integer not null default 100,
  hits        integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  constraint kb_images_max check (coalesce(array_length(images, 1), 0) <= 4),
  constraint kb_internal_not_bot check (visibility = 'customer' or (not bot_enabled and not in_menu))
);
create index if not exists kb_articles_category_idx on public.kb_articles (category, sort);

drop trigger if exists trg_kb_touch on public.kb_articles;
create trigger trg_kb_touch before update on public.kb_articles for each row execute function public.touch_updated_at();

alter table public.kb_articles enable row level security;
revoke all on public.kb_articles from anon;
grant select, insert, update, delete on public.kb_articles to authenticated, service_role;
drop policy if exists kb_read  on public.kb_articles;
drop policy if exists kb_write on public.kb_articles;
create policy kb_read on public.kb_articles for select to authenticated
  using (public.has_role('owner','admin','sales','designer'));
create policy kb_write on public.kb_articles for all to authenticated
  using (public.has_role('owner','admin')) with check (public.has_role('owner','admin'));

-- move the bot's plain Q&A into the knowledge base (once)
insert into public.kb_articles (category, title, body, keywords, visibility, bot_enabled, in_menu, sort, hits)
select 'คำถามที่พบบ่อย', r.title, coalesce(r.answer, ''), r.keywords, 'customer', r.enabled, r.in_menu, r.sort, r.hits
from public.bot_rules r
where r.kind = 'answer' and not exists (select 1 from public.kb_articles k where k.title = r.title);
delete from public.bot_rules where kind = 'answer';

-- bot hit counter works for both tables
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
  if p_rule_id is not null then
    update bot_rules set hits = hits + 1 where id = p_rule_id;
    update kb_articles set hits = hits + 1 where id = p_rule_id;
  end if;
end $$;
revoke all on function public.record_bot_reply(uuid, text[], uuid, boolean) from public, anon, authenticated;
grant execute on function public.record_bot_reply(uuid, text[], uuid, boolean) to service_role;
