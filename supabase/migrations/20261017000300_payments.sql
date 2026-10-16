-- ═══════════════════════════════════════════════════════════════════
-- Phase 8: slips → accounting approval → paid receipt
--
-- Forward-only. Builds on the shop's existing money rules instead of a second
-- ledger: an approved payment IS a paid receipt (receipts + transactions, the
-- same rows create_invoice_receipt / settle_receipt produce).
--
--   payment_submissions  a slip someone recorded — NOT money yet
--   approve_payment_submission   owner/accounting only; one transaction:
--       idempotency key → same result on retry; invoice + slip locked;
--       bank reference unique; never more than the invoice total;
--       creates receipt (REC-…) + income transaction + marks it paid
--   reject_payment_submission / void_payment (owner, with reason, reversing
--       transaction — nothing is deleted)
--   invoice_balances view   paid / pending / balance per invoice
-- ═══════════════════════════════════════════════════════════════════

-- receipts can be cancelled by reversal (kept for audit)
alter table public.receipts add column if not exists voided_at timestamptz;
alter table public.receipts add column if not exists voided_by uuid references public.profiles(id) on delete set null;
alter table public.receipts add column if not exists void_reason text;
alter table public.transactions add column if not exists payment_submission_id uuid;

create table if not exists public.payment_submissions (
  id               uuid primary key default gen_random_uuid(),
  invoice_id       uuid not null references public.invoices(id) on delete restrict,
  customer_id      uuid references public.customers(id) on delete set null,
  conversation_id  uuid references public.conversations(id) on delete set null,
  message_id       uuid references public.messages(id) on delete set null,
  slip             jsonb,                 -- { bucket, path } of the slip picture (chat-media / payment-slips)
  amount_claimed   numeric(14,2) not null check (amount_claimed > 0),
  transfer_at      timestamptz,
  bank_reference   text,
  note             text,
  status           text not null default 'pending' check (status in ('pending','approved','rejected','voided')),
  check_result     jsonb,                 -- slip-check API result (later)
  amount_approved  numeric(14,2),
  method           text,
  paid_at          timestamptz,
  receipt_id       uuid references public.receipts(id) on delete restrict,
  idempotency_key  uuid unique,           -- set by approve; retry with the same key returns the same result
  reject_reason    text,
  created_by       uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  decided_by       uuid references public.profiles(id) on delete set null,
  decided_at       timestamptz
);
create index if not exists payment_submissions_status_idx on public.payment_submissions (status, created_at desc);
create index if not exists payment_submissions_invoice_idx on public.payment_submissions (invoice_id);
-- the same slip message is recorded once (unless it was rejected)
create unique index if not exists payment_submissions_message_uniq on public.payment_submissions (message_id) where message_id is not null and status <> 'rejected';
-- the same bank transfer can be counted once
create unique index if not exists payment_submissions_bankref_uniq on public.payment_submissions (lower(trim(bank_reference))) where bank_reference is not null and status = 'approved';

alter table public.payment_submissions enable row level security;
revoke all on public.payment_submissions from anon;
grant select on public.payment_submissions to authenticated;
grant select, insert, update on public.payment_submissions to service_role;
drop policy if exists payment_submissions_read on public.payment_submissions;
create policy payment_submissions_read on public.payment_submissions for select to authenticated
  using (public.has_role('owner','admin','sales','accounting'));
-- every change goes through the functions below

-- ── balances (no stored copies): paid = confirmed, non-voided receipts
create or replace view public.invoice_balances with (security_invoker = true) as
  select i.id as invoice_id, i.code, i.customer_id, i.total,
         coalesce(i.deposit_amount, 0) as deposit_amount, coalesce(i.deposit_pct, 0) as deposit_pct,
         coalesce(p.paid, 0) as paid,
         coalesce(u.unconfirmed, 0) as unconfirmed_receipts,
         coalesce(s.pending, 0) as pending_slips,
         greatest(i.total - coalesce(p.paid, 0), 0) as balance
  from public.invoices i
  left join lateral (select sum(r.total) paid from public.receipts r where r.invoice_id = i.id and r.paid and r.voided_at is null) p on true
  left join lateral (select sum(r.total) unconfirmed from public.receipts r where r.invoice_id = i.id and not r.paid and r.voided_at is null) u on true
  left join lateral (select sum(ps.amount_claimed) pending from public.payment_submissions ps where ps.invoice_id = i.id and ps.status = 'pending') s on true;
grant select on public.invoice_balances to authenticated;

-- existing receipt functions ignore voided receipts from now on
create or replace function public.create_invoice_receipt(p_invoice_id uuid, p_amount numeric, p_request_id uuid default gen_random_uuid())
returns receipts language plpgsql security definer set search_path = public, pg_temp as $$
declare inv invoices; rec receipts; reserved numeric;
begin
  perform workflow_role(array['owner','admin','sales','accounting']);
  if p_request_id is null then raise exception 'ไม่มีรหัสคำขอ'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  select * into rec from receipts where request_id=p_request_id;
  if found then
    if rec.invoice_id is distinct from p_invoice_id or rec.total <> round(p_amount,2) then raise exception 'คำขอนี้ถูกใช้กับใบเสร็จอื่นแล้ว'; end if;
    return rec;
  end if;
  select * into inv from invoices where id=p_invoice_id for update;
  if not found then raise exception 'ไม่พบใบแจ้งหนี้'; end if;
  select coalesce(sum(total),0) into reserved from receipts where invoice_id=inv.id and voided_at is null;
  if p_amount is null or round(p_amount,2) <= 0 or p_amount::text in ('NaN','Infinity','-Infinity') or round(p_amount,2) > inv.total-reserved then raise exception 'ยอดรับเงินต้องมากกว่าศูนย์และไม่เกินยอดที่ยังไม่ได้ออกใบเสร็จ'; end if;
  insert into receipts(code,invoice_id,customer_id,total,paid,document_date,request_id)
  values(next_number('REC',to_char(now() at time zone 'Asia/Bangkok','YYMM'),'REC'),inv.id,inv.customer_id,round(p_amount,2),false,(now() at time zone 'Asia/Bangkok')::date,p_request_id) returning * into rec;
  return rec;
end $$;

create or replace function public.settle_receipt(p_receipt_id uuid, p_method text)
returns receipts language plpgsql security definer set search_path = public, pg_temp as $$
declare rec receipts; inv invoices; invoice_ref uuid; paid_total numeric;
begin
  perform workflow_role(array['owner','admin','accounting']);
  if p_method not in ('โอน','เงินสด','เช็ค','บัตรเครดิต') then raise exception 'วิธีชำระเงินไม่ถูกต้อง'; end if;
  select invoice_id into invoice_ref from receipts where id=p_receipt_id;
  if invoice_ref is null then raise exception 'ต้องเชื่อมใบแจ้งหนี้ก่อนยืนยันรับเงิน'; end if;
  select * into inv from invoices where id=invoice_ref for update;
  select * into rec from receipts where id=p_receipt_id for update;
  if not found then raise exception 'ไม่พบใบเสร็จ'; end if;
  if rec.voided_at is not null then raise exception 'ใบเสร็จนี้ถูกยกเลิกแล้ว'; end if;
  if rec.paid then return rec; end if;
  if rec.total <= 0 or rec.total is null then raise exception 'ยอดรับเงินไม่ถูกต้อง'; end if;
  select coalesce(sum(total),0) into paid_total from receipts where invoice_id=invoice_ref and paid and voided_at is null;
  if paid_total+rec.total > inv.total then raise exception 'ยอดรับเงินเกินยอดใบแจ้งหนี้ กรุณาตรวจสอบ'; end if;
  insert into transactions(code,description,type,amount,transaction_date,invoice_id,receipt_id)
  values('TX-'||rec.id::text,'รับชำระ '||rec.code,'รายรับ',rec.total,(now() at time zone 'Asia/Bangkok')::date,rec.invoice_id,rec.id);
  update receipts set paid=true,paid_at=now(),payment_method=p_method where id=rec.id returning * into rec;
  update job_orders set payment_status=case when paid_total+rec.total >= inv.total then 'Paid' else 'Partially Paid' end where invoice_id=inv.id;
  return rec;
end $$;

-- ── record a slip (sales / accounting / owner / admin)
create or replace function public.submit_payment_slip(p_invoice_id uuid, p_amount numeric, p_transfer_at timestamptz default null,
  p_bank_reference text default null, p_note text default null, p_conversation_id uuid default null, p_message_id uuid default null, p_slip jsonb default null)
returns payment_submissions language plpgsql security definer set search_path = public, pg_temp as $$
declare inv invoices; cv conversations; s payment_submissions;
begin
  perform workflow_role(array['owner','admin','sales','accounting']);
  select * into inv from invoices where id = p_invoice_id;
  if not found then raise exception 'ไม่พบใบแจ้งหนี้'; end if;
  if p_amount is null or round(p_amount, 2) <= 0 then raise exception 'ยอดที่ลูกค้าโอนต้องมากกว่าศูนย์'; end if;
  if p_conversation_id is not null then
    select * into cv from conversations where id = p_conversation_id;
    if cv.customer_id is distinct from inv.customer_id then raise exception 'ใบแจ้งหนี้นี้เป็นของลูกค้าคนอื่น'; end if;
  end if;
  if p_message_id is not null then
    select * into s from payment_submissions where message_id = p_message_id and status <> 'rejected';
    if found then return s; end if;          -- this slip is already waiting / done
  end if;
  insert into payment_submissions (invoice_id, customer_id, conversation_id, message_id, slip, amount_claimed, transfer_at, bank_reference, note)
  values (inv.id, inv.customer_id, p_conversation_id, p_message_id, p_slip, round(p_amount, 2), p_transfer_at,
          nullif(trim(coalesce(p_bank_reference, '')), ''), nullif(trim(coalesce(p_note, '')), ''))
  returning * into s;
  insert into audit_log (action, entity, entity_id, detail) values ('submit', 'payment_submissions', s.id::text, jsonb_build_object('invoice', inv.code, 'amount', s.amount_claimed));
  return s;
end $$;

-- ── approve: the only way a slip becomes money
create or replace function public.approve_payment_submission(p_submission_id uuid, p_amount numeric, p_paid_at timestamptz,
  p_method text, p_bank_reference text, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare s payment_submissions; inv invoices; rec receipts; ref text; paid_total numeric; reserved numeric; amt numeric;
begin
  perform workflow_role(array['owner','accounting']);
  if p_idempotency_key is null then raise exception 'ไม่มีรหัสคำขอ'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));
  -- a retry of a request that already went through → same answer
  select * into s from payment_submissions where idempotency_key = p_idempotency_key;
  if found then
    if s.id <> p_submission_id then raise exception 'รหัสคำขอนี้ถูกใช้กับรายการอื่นแล้ว'; end if;
    return jsonb_build_object('submission', to_jsonb(s), 'receipt', (select to_jsonb(r) from receipts r where r.id = s.receipt_id),
      'balance', (select to_jsonb(b) from invoice_balances b where b.invoice_id = s.invoice_id), 'repeated', true);
  end if;

  select invoice_id into inv.id from payment_submissions where id = p_submission_id;
  if inv.id is null then raise exception 'ไม่พบรายการแจ้งชำระ'; end if;
  select * into inv from invoices where id = inv.id for update;            -- one approval per invoice at a time
  select * into s from payment_submissions where id = p_submission_id for update;
  if s.status = 'approved' then raise exception 'รายการนี้อนุมัติไปแล้ว (%)', (select code from receipts where id = s.receipt_id); end if;
  if s.status <> 'pending' then raise exception 'รายการนี้ถูกปฏิเสธ/ยกเลิกแล้ว'; end if;
  if p_method not in ('โอน','เงินสด','เช็ค','บัตรเครดิต') then raise exception 'วิธีชำระเงินไม่ถูกต้อง'; end if;

  amt := round(coalesce(p_amount, s.amount_claimed), 2);
  if amt <= 0 then raise exception 'ยอดรับเงินต้องมากกว่าศูนย์'; end if;
  ref := nullif(trim(coalesce(p_bank_reference, s.bank_reference, '')), '');
  if ref is not null and exists (select 1 from payment_submissions where status = 'approved' and lower(trim(bank_reference)) = lower(ref)) then
    raise exception 'เลขอ้างอิงการโอน % ถูกใช้รับเงินไปแล้ว — อาจเป็นสลิปซ้ำ', ref;
  end if;
  select coalesce(sum(total) filter (where paid), 0), coalesce(sum(total), 0) into paid_total, reserved
    from receipts where invoice_id = inv.id and voided_at is null;
  if reserved + amt > inv.total then
    if reserved > paid_total then
      raise exception 'เกินยอดใบแจ้งหนี้: มีใบเสร็จที่ยังไม่ยืนยันรับเงินอยู่ % บาท — ยืนยันหรือยกเลิกใบนั้นก่อน', reserved - paid_total;
    end if;
    raise exception 'ยอดรับเงินเกินยอดคงเหลือของใบแจ้งหนี้ (คงเหลือ % บาท)', inv.total - paid_total;
  end if;

  -- receipt → income transaction → paid (same rows as the existing receipt flow)
  insert into receipts (code, invoice_id, customer_id, total, paid, document_date, request_id)
  values (next_number('REC', to_char(now() at time zone 'Asia/Bangkok', 'YYMM'), 'REC'), inv.id, inv.customer_id, amt, false,
          (coalesce(p_paid_at, now()) at time zone 'Asia/Bangkok')::date, p_idempotency_key)
  returning * into rec;
  insert into transactions (code, description, type, amount, transaction_date, invoice_id, receipt_id, payment_submission_id)
  values ('TX-' || rec.id::text, 'รับชำระ ' || rec.code || ' (' || inv.code || ')', 'รายรับ', rec.total,
          (coalesce(p_paid_at, now()) at time zone 'Asia/Bangkok')::date, inv.id, rec.id, s.id);
  update receipts set paid = true, paid_at = coalesce(p_paid_at, now()), payment_method = p_method where id = rec.id returning * into rec;
  update job_orders set payment_status = case when paid_total + amt >= inv.total then 'Paid' else 'Partially Paid' end where invoice_id = inv.id;

  update payment_submissions set status = 'approved', amount_approved = amt, method = p_method, paid_at = coalesce(p_paid_at, now()),
    bank_reference = ref, receipt_id = rec.id, idempotency_key = p_idempotency_key, decided_by = auth.uid(), decided_at = now()
  where id = s.id returning * into s;
  insert into audit_log (action, entity, entity_id, detail)
  values ('approve', 'payment_submissions', s.id::text, jsonb_build_object('receipt', rec.code, 'invoice', inv.code, 'amount', amt, 'method', p_method, 'bank_reference', ref));
  return jsonb_build_object('submission', to_jsonb(s), 'receipt', to_jsonb(rec),
    'balance', (select to_jsonb(b) from invoice_balances b where b.invoice_id = inv.id), 'repeated', false);
end $$;

create or replace function public.reject_payment_submission(p_submission_id uuid, p_reason text)
returns payment_submissions language plpgsql security definer set search_path = public, pg_temp as $$
declare s payment_submissions;
begin
  perform workflow_role(array['owner','accounting']);
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'กรุณาระบุเหตุผลที่ไม่ผ่าน'; end if;
  select * into s from payment_submissions where id = p_submission_id for update;
  if not found then raise exception 'ไม่พบรายการแจ้งชำระ'; end if;
  if s.status <> 'pending' then raise exception 'ปฏิเสธได้เฉพาะรายการที่รอตรวจ'; end if;
  update payment_submissions set status = 'rejected', reject_reason = trim(p_reason), decided_by = auth.uid(), decided_at = now()
  where id = s.id returning * into s;
  insert into audit_log (action, entity, entity_id, detail) values ('reject', 'payment_submissions', s.id::text, jsonb_build_object('reason', s.reject_reason));
  return s;
end $$;

-- ── cancel money already received: owner only, by reversal (nothing deleted)
create or replace function public.void_payment(p_receipt_id uuid, p_reason text)
returns receipts language plpgsql security definer set search_path = public, pg_temp as $$
declare rec receipts; inv invoices; paid_total numeric;
begin
  perform workflow_role(array['owner']);
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'กรุณาระบุเหตุผลที่ยกเลิก'; end if;
  select * into rec from receipts where id = p_receipt_id;
  if not found then raise exception 'ไม่พบใบเสร็จ'; end if;
  select * into inv from invoices where id = rec.invoice_id for update;
  select * into rec from receipts where id = p_receipt_id for update;
  if rec.voided_at is not null then return rec; end if;
  if rec.paid then
    insert into transactions (code, description, type, amount, transaction_date, invoice_id, note)
    values ('TX-VOID-' || rec.id::text, 'ยกเลิกรับชำระ ' || rec.code, 'รายรับ', -rec.total, (now() at time zone 'Asia/Bangkok')::date, rec.invoice_id, trim(p_reason));
  end if;
  update receipts set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason) where id = rec.id returning * into rec;
  update payment_submissions set status = 'voided' where receipt_id = rec.id;
  if inv.id is not null then
    select coalesce(sum(total), 0) into paid_total from receipts where invoice_id = inv.id and paid and voided_at is null;
    update job_orders set payment_status = case when paid_total >= inv.total then 'Paid' when paid_total > 0 then 'Partially Paid' else 'Unpaid' end where invoice_id = inv.id;
  end if;
  insert into audit_log (action, entity, entity_id, detail) values ('void', 'receipts', rec.id::text, jsonb_build_object('code', rec.code, 'amount', rec.total, 'reason', rec.void_reason));
  return rec;
end $$;

revoke all on function public.submit_payment_slip(uuid, numeric, timestamptz, text, text, uuid, uuid, jsonb),
  public.approve_payment_submission(uuid, numeric, timestamptz, text, text, uuid),
  public.reject_payment_submission(uuid, text), public.void_payment(uuid, text) from public, anon;
grant execute on function public.submit_payment_slip(uuid, numeric, timestamptz, text, text, uuid, uuid, jsonb),
  public.approve_payment_submission(uuid, numeric, timestamptz, text, text, uuid),
  public.reject_payment_submission(uuid, text), public.void_payment(uuid, text) to authenticated, service_role;
