-- Phase 4B bot: settings/rules permissions, postback ingest, auto-pause and resume. Fails by raising.
do $$
declare r jsonb; cid uuid; m messages; n int; e text;
begin
  -- starter rules exist, bot is OFF by default
  if (select enabled from bot_settings) then raise exception 'bot must start switched off'; end if;
  if (select count(*) from bot_rules) < 2 then raise exception 'starter rules missing'; end if;

  -- only owner/admin change the bot; sales/designer may read; production sees nothing
  if pg_temp.run_as('owner', 'update bot_settings set enabled = true') <> 1 then raise exception 'owner cannot switch bot on'; end if;
  if pg_temp.run_as('sales', 'update bot_settings set enabled = false') <> 0 then raise exception 'sales changed bot settings'; end if;
  if pg_temp.run_as('sales', 'select * from bot_rules') < 2 then raise exception 'sales should read rules'; end if;
  if pg_temp.run_as('production', 'select * from bot_rules') <> 0 then raise exception 'production read bot rules'; end if;
  if pg_temp.run_as('sales', $q$insert into bot_prices (product, technique, min_qty, price_from) values ('x','y',1,1)$q$) <> -1 then raise exception 'sales edited prices'; end if;
  if pg_temp.run_as('owner', $q$insert into bot_prices (product, technique, min_qty, price_from) values ('เสื้อยืด','สกรีน',30,120)$q$) <> 1 then raise exception 'owner cannot add price'; end if;
  if pg_temp.run_as('owner', $q$insert into bot_prices (product, technique, min_qty, price_from) values ('เสื้อยืด','สกรีน',10,-5)$q$) <> -1 then raise exception 'negative price accepted'; end if;

  -- new chat starts with the bot; postback is stored with its label
  r := public.ingest_line_event('U-bot4b', '{"type":"postback","webhookEventId":"PB-1","source":{"type":"user","userId":"U-4b"},"replyToken":"rt","postback":{"data":"ขอราคา|bot:rule:1"}}');
  if r ->> 'status' <> 'processed' or not (r ->> 'bot_active')::boolean then raise exception 'new chat should be bot_active: %', r; end if;
  cid := (r ->> 'conversation_id')::uuid;
  if (select text from messages where id = (r ->> 'message_id')::uuid) <> '👆 ขอราคา' then raise exception 'postback label not stored'; end if;

  -- bot replies are recorded but do not pause the bot or take the chat
  perform public.record_bot_reply(cid, array['ราคาเริ่มต้นตัวละ 120 บาท'], (select id from bot_rules where kind = 'price' limit 1), false);
  if not (select bot_active from conversations where id = cid) or (select assigned_to from conversations where id = cid) is not null then raise exception 'bot reply changed chat ownership'; end if;
  if (select hits from bot_rules where kind = 'price' limit 1) <> 1 then raise exception 'rule hit not counted'; end if;
  if not exists (select 1 from messages where conversation_id = cid and sent_by_bot and status = 'sent') then raise exception 'bot message not recorded'; end if;
  perform public.record_bot_reply(cid, array['รับเรื่องแล้ว'], null, true);
  if (select bot_handoff_at from conversations where id = cid) is null then raise exception 'handoff time not stored'; end if;

  -- staff reply pauses the bot; closing the chat gives it back
  m := public.reserve_outgoing_message(cid, 'ck-4b', 'สวัสดีค่ะ', 'text', null, '00000000-0000-0000-0000-0000000000a2');
  if (select bot_active from conversations where id = cid) then raise exception 'staff reply should pause the bot'; end if;
  update conversations set status = 'closed' where id = cid;
  if not (select bot_active from conversations where id = cid) or (select bot_handoff_at from conversations where id = cid) is not null then raise exception 'closing should hand the chat back to the bot'; end if;

  e := pg_temp.err_as('owner', $q$select public.record_bot_reply('40000000-0000-0000-0000-000000000001', array['x'])$q$);
  if e not like '%permission denied%' then raise exception 'browser could write bot replies: %', e; end if;
end $$;
