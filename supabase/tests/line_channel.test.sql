-- Phase 4: LINE ingest, outgoing reservation, task queue. Fails by raising an exception.
do $$
declare
  r jsonb; r2 jsonb; cid uuid; ident uuid; m messages; m2 messages; t channel_tasks; n int; e text;
  ev jsonb := '{"type":"message","webhookEventId":"01TEST-A","timestamp":1760600000000,
                "source":{"type":"user","userId":"U-cust-1"},"replyToken":"rt",
                "message":{"id":"m-100","type":"text","text":"สนใจสกรีนเสื้อ 50 ตัวค่ะ"}}';
begin
  -- Verify button: no event, channel becomes connected and bot info is queued once
  r := public.ingest_line_event('U-bot', null);
  if r ->> 'status' <> 'ignored' then raise exception 'verify should be ignored, got %', r; end if;
  if (select status from channel_accounts where platform = 'line' and external_id = 'U-bot') <> 'connected' then raise exception 'channel not connected'; end if;
  perform public.ingest_line_event('U-bot', null);
  if (select count(*) from channel_tasks where kind = 'line.botinfo') <> 1 then raise exception 'botinfo queued twice'; end if;

  -- first text message: identity + conversation + message + profile task
  r := public.ingest_line_event('U-bot', ev);
  if r ->> 'status' <> 'processed' then raise exception 'first event not processed: %', r; end if;
  cid := (r ->> 'conversation_id')::uuid;
  select identity_id into ident from conversations where id = cid;
  if (select external_id from contact_identities where id = ident) <> 'U-cust-1' then raise exception 'identity not created'; end if;
  if (select customer_id from conversations where id = cid) is not null then raise exception 'must never auto-link a customer'; end if;
  if (select unread from conversations where id = cid) <> 1 then raise exception 'unread should be 1'; end if;
  if (select last_message_text from conversations where id = cid) <> 'สนใจสกรีนเสื้อ 50 ตัวค่ะ' then raise exception 'last text not set'; end if;
  if (select count(*) from channel_tasks where kind = 'line.profile' and payload ->> 'user_id' = 'U-cust-1') <> 1 then raise exception 'profile task missing'; end if;

  -- LINE redelivers the same event → no duplicate message
  r2 := public.ingest_line_event('U-bot', ev);
  if r2 ->> 'status' <> 'duplicate' then raise exception 'redelivery should be duplicate, got %', r2; end if;
  if (select count(*) from messages where conversation_id = cid) <> 1 then raise exception 'duplicate message stored'; end if;

  -- image: placeholder attachment + content task, same conversation
  r := public.ingest_line_event('U-bot', '{"type":"message","webhookEventId":"01TEST-B","timestamp":1760600060000,
      "source":{"type":"user","userId":"U-cust-1"},"message":{"id":"m-101","type":"image","contentProvider":{"type":"line"}}}');
  if (r ->> 'conversation_id')::uuid <> cid then raise exception 'second message went to a new chat'; end if;
  select * into m from messages where id = (r ->> 'message_id')::uuid;
  if m.kind <> 'image' or not (m.attachment ->> 'pending')::boolean then raise exception 'image placeholder wrong: %', m.attachment; end if;
  if (select count(*) from channel_tasks where kind = 'line.content' and payload ->> 'line_message_id' = 'm-101') <> 1 then raise exception 'content task missing'; end if;
  if (select last_message_text from conversations where id = cid) <> '[รูปภาพ]' then raise exception 'image preview text'; end if;
  if (select count(*) from channel_tasks where kind = 'line.profile') <> 1 then raise exception 'profile fetched again for known contact'; end if;

  -- group chat and unknown events are kept but not shown
  r := public.ingest_line_event('U-bot', '{"type":"message","webhookEventId":"01TEST-G","source":{"type":"group","groupId":"G1","userId":"U-x"},"message":{"id":"g1","type":"text","text":"hi"}}');
  if r ->> 'status' <> 'ignored' then raise exception 'group should be ignored'; end if;
  if (select status from webhook_events where event_id = '01TEST-G') <> 'ignored' then raise exception 'ignored event not recorded'; end if;

  -- closed chat reopens on a new customer message
  update conversations set status = 'closed' where id = cid;
  perform public.ingest_line_event('U-bot', '{"type":"message","webhookEventId":"01TEST-C","source":{"type":"user","userId":"U-cust-1"},"message":{"id":"m-102","type":"sticker"}}');
  if (select status from conversations where id = cid) <> 'open' then raise exception 'closed chat did not reopen'; end if;
  -- unfollow: system line, does not count as unread
  select unread into n from conversations where id = cid;
  perform public.ingest_line_event('U-bot', '{"type":"unfollow","webhookEventId":"01TEST-U","source":{"type":"user","userId":"U-cust-1"}}');
  if (select unread from conversations where id = cid) <> n then raise exception 'unfollow counted as unread'; end if;
  if not exists (select 1 from messages where conversation_id = cid and kind = 'system' and text like '%บล็อก%') then raise exception 'unfollow note missing'; end if;

  -- outgoing: same client key returns the same row (no double send)
  m := public.reserve_outgoing_message(cid, 'ck-1', 'ราคาตัวละ 189 บาทค่ะ', 'text', null, '00000000-0000-0000-0000-0000000000a2');
  m2 := public.reserve_outgoing_message(cid, 'ck-1', 'ราคาตัวละ 189 บาทค่ะ', 'text', null, '00000000-0000-0000-0000-0000000000a2');
  if m.id <> m2.id or m.status <> 'sending' then raise exception 'client key not idempotent'; end if;
  if (select assigned_to from conversations where id = cid) <> '00000000-0000-0000-0000-0000000000a2' then raise exception 'sender should take the chat'; end if;
  m := public.finish_outgoing_message(m.id, true);
  if m.status <> 'sent' then raise exception 'finish ok'; end if;
  m := public.reserve_outgoing_message(cid, 'ck-2', 'x', 'text', null, null);
  m := public.finish_outgoing_message(m.id, false, 'LINE 400');
  if m.status <> 'failed' or m.error <> 'LINE 400' then raise exception 'finish failed'; end if;
  begin
    perform public.reserve_outgoing_message(cid, '', 'x', 'text', null, null);
    raise exception 'empty client key accepted';
  exception when others then if sqlerrm = 'empty client key accepted' then raise; end if; end;

  -- queue: claim locks, a second claim gets nothing, failures back off, 5 failures = dead
  select count(*) into n from public.claim_channel_tasks(50, 60);
  if n < 3 then raise exception 'claim returned % tasks', n; end if;
  if exists (select 1 from public.claim_channel_tasks(50, 60)) then raise exception 'locked tasks claimed twice'; end if;
  select * into t from channel_tasks where kind = 'line.profile';
  t := public.complete_channel_task(t.id, false, 'timeout');
  if t.status <> 'queued' or t.run_after <= now() or t.locked_until is not null then raise exception 'retry backoff wrong'; end if;
  update channel_tasks set attempts = 5 where id = t.id;
  t := public.complete_channel_task(t.id, false, 'still failing');
  if t.status <> 'dead' then raise exception 'should be dead after 5 attempts'; end if;
  select * into t from channel_tasks where kind = 'line.content';
  t := public.complete_channel_task(t.id, true);
  if t.status <> 'done' or t.finished_at is null then raise exception 'done not recorded'; end if;

  -- browsers cannot call the server functions or touch the queue
  e := pg_temp.err_as('sales', $q$select public.ingest_line_event('U-bot', '{}'::jsonb)$q$);
  if e not like '%permission denied%' then raise exception 'sales could call ingest: %', e; end if;
  e := pg_temp.err_as('owner', $q$select public.claim_channel_tasks(1, 1)$q$);
  if e not like '%permission denied%' then raise exception 'owner could claim tasks: %', e; end if;
  if pg_temp.run_as('owner', 'select * from channel_tasks') < 1 then raise exception 'owner should see queue health'; end if;
  if pg_temp.run_as('sales', 'select * from channel_tasks') <> 0 then raise exception 'sales should not see the queue'; end if;
  if pg_temp.run_as('sales', $q$insert into channel_tasks (kind) values ('line.profile')$q$) <> -1 then raise exception 'sales inserted a task'; end if;
end $$;
