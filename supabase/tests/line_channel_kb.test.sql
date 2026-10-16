-- Knowledge base: moved Q&A, permissions, internal articles can never be bot answers. Fails by raising.
do $$
declare cid uuid; kid uuid;
begin
  if exists (select 1 from bot_rules where kind = 'answer') then raise exception 'plain Q&A should have moved to kb_articles'; end if;
  if (select count(*) from kb_articles where category = 'คำถามที่พบบ่อย') < 4 then raise exception 'Q&A not copied into the knowledge base'; end if;
  if not exists (select 1 from bot_rules where kind in ('price','payment')) then raise exception 'special bot flows must stay'; end if;

  -- read: chat team; write: owner/admin; production sees nothing
  if pg_temp.run_as('sales', 'select * from kb_articles') < 4 then raise exception 'sales should read the knowledge base'; end if;
  if pg_temp.run_as('designer', 'select * from kb_articles') < 4 then raise exception 'designer should read the knowledge base'; end if;
  if pg_temp.run_as('production', 'select * from kb_articles') <> 0 then raise exception 'production read the knowledge base'; end if;
  if pg_temp.run_as('sales', $q$insert into kb_articles (title, body) values ('x', 'y')$q$) <> -1 then raise exception 'sales wrote an article'; end if;
  if pg_temp.run_as('owner', $q$insert into kb_articles (category, title, body, visibility) values ('ผ้า', 'ผ้า Cotton 100%', 'นุ่ม ระบายอากาศดี', 'customer')$q$) <> 1 then raise exception 'owner cannot write'; end if;

  -- an internal article can never be switched on for the bot or the menu
  if pg_temp.run_as('owner', $q$insert into kb_articles (title, body, visibility, bot_enabled) values ('ต้นทุนผ้า', 'ลับ', 'internal', true)$q$) <> -1 then raise exception 'internal article allowed for bot'; end if;
  if pg_temp.run_as('owner', $q$insert into kb_articles (title, body, visibility, in_menu) values ('ต้นทุนผ้า', 'ลับ', 'internal', true)$q$) <> -1 then raise exception 'internal article allowed in bot menu'; end if;
  if pg_temp.run_as('owner', $q$insert into kb_articles (title, images) values ('รูปเยอะ', array['a','b','c','d','e'])$q$) <> -1 then raise exception 'more than 4 images accepted'; end if;

  -- hits count for knowledge articles too
  select id into kid from kb_articles where title = 'ผ้า Cotton 100%';
  select id into cid from conversations limit 1;
  perform public.record_bot_reply(cid, array['นุ่ม ระบายอากาศดี'], kid, false);
  if (select hits from kb_articles where id = kid) <> 1 then raise exception 'kb hit not counted'; end if;
end $$;
