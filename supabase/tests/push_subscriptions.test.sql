-- Chat alert subscriptions: own rows only, targets follow assignment. Fails by raising.
do $$
declare n int; e text; cid uuid;
begin
  -- staff register their own devices
  if pg_temp.run_as('sales', $q$insert into push_subscriptions (endpoint, p256dh, auth) values ('https://push/sales', 'k', 'a')$q$) <> 1 then raise exception 'sales cannot subscribe'; end if;
  if pg_temp.run_as('owner', $q$insert into push_subscriptions (endpoint, p256dh, auth) values ('https://push/owner', 'k', 'a')$q$) <> 1 then raise exception 'owner cannot subscribe'; end if;
  if pg_temp.run_as('sales2', $q$insert into push_subscriptions (endpoint, p256dh, auth) values ('https://push/sales2', 'k', 'a')$q$) <> 1 then raise exception 'sales2 cannot subscribe'; end if;
  if pg_temp.run_as('designer', $q$insert into push_subscriptions (endpoint, p256dh, auth) values ('https://push/designer', 'k', 'a')$q$) <> 1 then raise exception 'designer cannot subscribe'; end if;
  if pg_temp.run_as('production', $q$insert into push_subscriptions (endpoint, p256dh, auth) values ('https://push/prod', 'k', 'a')$q$) <> -1 then raise exception 'production must not get chat alerts'; end if;
  -- cannot register a device for someone else, nor see / delete theirs
  if pg_temp.run_as('sales', $q$insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ('00000000-0000-0000-0000-0000000000a1', 'https://push/x', 'k', 'a')$q$) <> -1 then raise exception 'subscribed for another user'; end if;
  if pg_temp.run_as('sales', 'select * from push_subscriptions') <> 1 then raise exception 'sales should see only own device'; end if;
  if pg_temp.run_as('sales', $q$delete from push_subscriptions where endpoint = 'https://push/owner'$q$) <> 0 then raise exception 'deleted another user device'; end if;
  if pg_temp.run_as('sales', $q$delete from push_subscriptions where endpoint = 'https://push/sales2'$q$) <> 0 then raise exception 'deleted sales2 device'; end if;

  -- targets: unassigned → owner/admin/sales (not designer); assigned → that person only
  insert into contact_identities (id, platform, external_id) values ('30000000-0000-0000-0000-0000000000b1', 'line', 'U-push') on conflict do nothing;
  insert into conversations (id, identity_id, platform) values ('40000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-0000000000b1', 'line') on conflict do nothing;
  cid := '40000000-0000-0000-0000-0000000000b1';
  select count(*) into n from public.chat_alert_targets(cid);
  if n <> 3 then raise exception 'unassigned targets should be owner + 2 sales, got %', n; end if;
  update conversations set assigned_to = '00000000-0000-0000-0000-0000000000a7' where id = cid;
  if (select string_agg(endpoint, ',') from public.chat_alert_targets(cid)) <> 'https://push/sales2' then raise exception 'assigned chat should alert only the assignee'; end if;
  e := pg_temp.err_as('owner', $q$select * from public.chat_alert_targets('40000000-0000-0000-0000-0000000000b1')$q$);
  if e not like '%permission denied%' then raise exception 'browser could list alert targets: %', e; end if;
end $$;
