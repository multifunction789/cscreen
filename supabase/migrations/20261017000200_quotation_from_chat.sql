-- ═══════════════════════════════════════════════════════════════════
-- Phase 7: quotations from the chat + versioned PDFs
--
-- Forward-only. Uses the existing quotations table and QT-#### numbering.
-- Every time a quotation is sent, an immutable snapshot (quotation_versions)
-- is stored with its PDF path and sha256; editing later makes a new version,
-- the PDF the customer already has never changes.
-- ═══════════════════════════════════════════════════════════════════

alter table public.quotations add column if not exists current_version integer not null default 0;
alter table public.quotations add column if not exists sent_at timestamptz;
alter table public.quotations add column if not exists conversation_id uuid references public.conversations(id) on delete set null;

create table if not exists public.quotation_versions (
  id            uuid primary key default gen_random_uuid(),
  quotation_id  uuid not null references public.quotations(id) on delete cascade,
  version       integer not null check (version > 0),
  snapshot      jsonb not null,           -- shop + customer + quotation as sent (amounts already computed)
  content_hash  text not null,            -- same content → same version (re-sending does not make a new PDF)
  total         numeric(14,2) not null,
  pdf_path      text,                     -- documents/quotations/<code>-v<n>.pdf
  pdf_sha256    text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz,
  sent_message_id uuid references public.messages(id) on delete set null,
  unique (quotation_id, version)
);
create index if not exists quotation_versions_q_idx on public.quotation_versions (quotation_id, version desc);

alter table public.quotation_versions enable row level security;
revoke all on public.quotation_versions from anon;
grant select on public.quotation_versions to authenticated;
grant select, insert, update on public.quotation_versions to service_role;
drop policy if exists quotation_versions_read on public.quotation_versions;
create policy quotation_versions_read on public.quotation_versions for select to authenticated
  using (public.has_role('owner','admin','sales','designer','accounting'));
-- written only by the server (send route) through the functions below

-- ── create a quotation from a chat (amounts computed here, never trusted from the browser)
create or replace function public.create_quotation_from_chat(p_conversation_id uuid, p_data jsonb)
returns quotations language plpgsql security definer set search_path = public, pg_temp as $$
declare
  cv conversations; q quotations; it jsonb; items jsonb := '[]'::jsonb;
  qty numeric; price numeric; amount numeric; sub numeric := 0; disc numeric; vat numeric; vat_amt numeric; nxt int;
begin
  if not public.has_role('owner','admin','sales') then raise exception 'ไม่มีสิทธิ์ออกใบเสนอราคา'; end if;
  select * into cv from conversations where id = p_conversation_id;
  if not found then raise exception 'ไม่พบแชท'; end if;
  if cv.customer_id is null then raise exception 'ผูกแชทกับลูกค้าก่อนออกใบเสนอราคา'; end if;
  if jsonb_typeof(p_data -> 'items') is distinct from 'array' then raise exception 'ไม่มีรายการ'; end if;

  for it in select value from jsonb_array_elements(p_data -> 'items') loop
    qty := coalesce(nullif(it ->> 'qty', '')::numeric, 0);
    price := round(coalesce(nullif(it ->> 'price', '')::numeric, 0), 2);
    continue when nullif(trim(coalesce(it ->> 'desc', '')), '') is null or qty <= 0;
    if price < 0 then raise exception 'ราคาต่อหน่วยติดลบไม่ได้'; end if;
    amount := round(qty * price, 2);
    sub := sub + amount;
    items := items || jsonb_build_array(jsonb_build_object('desc', trim(it ->> 'desc'), 'qty', qty, 'price', price, 'amount', amount,
             'sizes', coalesce(it -> 'sizes', '{}'::jsonb)));
  end loop;
  if jsonb_array_length(items) = 0 then raise exception 'ใส่รายการอย่างน้อย 1 รายการ (ชื่อ + จำนวน)'; end if;
  disc := least(greatest(round(coalesce(nullif(p_data ->> 'discount', '')::numeric, 0), 2), 0), sub);
  vat := case when coalesce(nullif(p_data ->> 'vat_pct', '')::numeric, 0) = 7 then 7 else 0 end;
  vat_amt := round((sub - disc) * vat / 100, 2);

  -- same QT-#### series as the quotation page
  perform pg_advisory_xact_lock(hashtext('quotations.code'));
  select greatest(coalesce(max(nullif(regexp_replace(code, '\D', '', 'g'), '')::int), 1000) + 1, 1001) into nxt
    from quotations where code ~ '^QT-\d+$';
  insert into quotations (code, customer_id, items, subtotal, discount, vat_pct, vat_amount, total, status,
                          document_date, valid_until, notes, conversation_id, item_desc)
  values ('QT-' || lpad(nxt::text, 4, '0'), cv.customer_id, items, sub, disc, vat, vat_amt, sub - disc + vat_amt, 'รออนุมัติ',
          (now() at time zone 'Asia/Bangkok')::date,
          coalesce(nullif(p_data ->> 'valid_until', '')::date, ((now() at time zone 'Asia/Bangkok')::date + 15)),
          nullif(trim(coalesce(p_data ->> 'notes', '')), ''), cv.id,
          (select string_agg(value ->> 'desc', ', ') from jsonb_array_elements(items)))
  returning * into q;

  -- the chat's sales deal follows the quotation
  if exists (select 1 from deals where conversation_id = cv.id) then
    update deals set quotation_id = q.id, value = q.total, customer_id = cv.customer_id,
      stage = case when stage in ('New Lead','Waiting for Details') then 'Quotation Draft' else stage end
    where conversation_id = cv.id;
  else
    insert into deals (conversation_id, customer_id, quotation_id, value, stage, owner)
    values (cv.id, cv.customer_id, q.id, q.total, 'Quotation Draft', auth.uid());
  end if;
  insert into audit_log (action, entity, entity_id, detail) values ('create', 'quotations', q.id::text, jsonb_build_object('code', q.code, 'total', q.total, 'conversation_id', cv.id));
  return q;
end $$;

-- ── server: snapshot for sending (reuses the latest version when nothing changed)
create or replace function public.snapshot_quotation_version(p_quotation_id uuid, p_shop jsonb, p_prepared_by text, p_terms text, p_actor uuid)
returns quotation_versions language plpgsql security definer set search_path = public, pg_temp as $$
declare q quotations; c customers; v quotation_versions; content jsonb; h text;
begin
  select * into q from quotations where id = p_quotation_id for update;
  if not found then raise exception 'ไม่พบใบเสนอราคา'; end if;
  if coalesce(jsonb_array_length(q.items), 0) = 0 then raise exception 'ใบเสนอราคานี้ไม่มีรายการ'; end if;
  select * into c from customers where id = q.customer_id;
  content := jsonb_build_object(
    'customer', jsonb_build_object('name', c.name, 'contact_person', c.contact_person, 'phone', c.phone, 'address', c.address, 'tax_id', c.tax_id),
    'quotation', jsonb_build_object('code', q.code, 'document_date', q.document_date, 'valid_until', q.valid_until, 'notes', q.notes,
      'items', q.items, 'subtotal', q.subtotal, 'discount', coalesce(q.discount, 0), 'vat_pct', coalesce(q.vat_pct, 0),
      'vat_amount', coalesce(q.vat_amount, 0), 'total', q.total));
  h := md5(content::text);
  select * into v from quotation_versions where quotation_id = q.id order by version desc limit 1;
  if found and v.content_hash = h then return v; end if;
  insert into quotation_versions (quotation_id, version, snapshot, content_hash, total, created_by)
  values (q.id, coalesce(v.version, 0) + 1,
          content || jsonb_build_object('version', coalesce(v.version, 0) + 1, 'shop', p_shop, 'prepared_by', p_prepared_by, 'terms', p_terms),
          h, q.total, p_actor)
  returning * into v;
  update quotations set current_version = v.version where id = q.id;
  return v;
end $$;

-- ── server: the PDF reached the customer
create or replace function public.mark_quotation_sent(p_version_id uuid, p_message_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v quotation_versions; q quotations; cid uuid := (select conversation_id from messages where id = p_message_id);
begin
  update quotation_versions set sent_at = coalesce(sent_at, now()), sent_message_id = coalesce(sent_message_id, p_message_id)
  where id = p_version_id returning * into v;
  update quotations set sent_at = now() where id = v.quotation_id returning * into q;
  if cid is not null and not exists (select 1 from deals where conversation_id = cid) then
    insert into deals (conversation_id, customer_id, quotation_id, value, stage) values (cid, q.customer_id, q.id, q.total, 'Quotation Sent');
  end if;
  update deals set quotation_id = q.id, value = q.total, customer_id = coalesce(customer_id, q.customer_id),
    stage = case when stage in ('New Lead','Waiting for Details','Quotation Draft') then 'Quotation Sent' else stage end
  where conversation_id = cid or quotation_id = q.id;
  update conversations set status = 'waiting' where id = cid and status in ('new','open');
  insert into audit_log (action, entity, entity_id, detail) values ('send', 'quotations', q.id::text, jsonb_build_object('version', v.version, 'total', v.total, 'message_id', p_message_id));
end $$;

revoke all on function public.create_quotation_from_chat(uuid, jsonb) from public, anon;
grant execute on function public.create_quotation_from_chat(uuid, jsonb) to authenticated, service_role;
revoke all on function public.snapshot_quotation_version(uuid, jsonb, text, text, uuid), public.mark_quotation_sent(uuid, uuid) from public, anon, authenticated;
grant execute on function public.snapshot_quotation_version(uuid, jsonb, text, text, uuid), public.mark_quotation_sent(uuid, uuid) to service_role;
