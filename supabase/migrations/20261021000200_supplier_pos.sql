-- เฟส 2: ใบงาน Supplier / PO
--  supplier_pos        : PO 1 ใบ = supplier 1 เจ้า, ประเภทงาน 1 แบบ, รวมได้หลายใบงาน
--  supplier_po_lines   : แต่ละแถวผูกใบงาน 1 ใบ (ลาย/ตำแหน่ง, ไซซ์→จำนวน, เมตรที่ใช้แบ่งทุน)
--  job_steps.supplier_po_id : แต่ละใบงานที่อยู่ใน PO ได้ขั้นตอนในแผนการผลิตอัตโนมัติ
--                        สถานะ/supplier/วันที่ของขั้นตอนนั้นตาม PO เท่านั้น (แก้ตรงไม่ได้)
--                        → ใบงานจะ "เสร็จแล้ว" ได้ก็ต่อเมื่อ PO ทุกใบปิด
--  supplier_po_job_costs: ต้นทุน PO ที่แบ่งเข้าแต่ละใบงาน (เมตร หรือ จำนวนชิ้น)

create table if not exists public.supplier_pos (
  id            uuid primary key default gen_random_uuid(),
  code          text unique,
  po_type       text not null check (po_type in ('dft','uv_dft','sublimation','ready_made','embroidery','sewing','screen','dtg')),
  supplier_id   uuid references public.suppliers(id) on delete restrict,
  status        text not null default 'ร่าง' check (status in ('ร่าง','ส่งแล้ว','กำลังผลิต','รับของแล้ว','ปิดแล้ว','มีปัญหา','ยกเลิก')),
  sent_date     date,
  due_date      date,
  received_date date,
  unit          text not null default 'ชิ้น' check (unit in ('ชิ้น','เมตร')),
  film_width_cm numeric,
  total_meters  numeric check (total_meters is null or total_meters >= 0),
  unit_price    numeric not null default 0 check (unit_price >= 0),
  total_amount  numeric not null default 0 check (total_amount >= 0),
  remark        text,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  closed_at     timestamptz
);

create table if not exists public.supplier_po_lines (
  id            uuid primary key default gen_random_uuid(),
  po_id         uuid not null references public.supplier_pos(id) on delete cascade,
  job_order_id  uuid references public.job_orders(id) on delete restrict,
  seq           int not null default 1,
  description   text,
  spec          text,
  sizes         jsonb not null default '{}'::jsonb,
  qty           numeric not null default 0 check (qty >= 0),
  meters        numeric check (meters is null or meters >= 0),
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists supplier_po_lines_po_idx  on public.supplier_po_lines (po_id);
create index if not exists supplier_po_lines_job_idx on public.supplier_po_lines (job_order_id);
create index if not exists supplier_pos_sent_idx     on public.supplier_pos (sent_date);

alter table public.job_steps add column if not exists supplier_po_id uuid references public.supplier_pos(id) on delete set null;
create index if not exists job_steps_po_idx on public.job_steps (supplier_po_id);

-- ── ตัวช่วย ───────────────────────────────────────────────────
create or replace function public.po_type_label(t text) returns text language sql immutable as $$
  select case t when 'dft' then 'ส่ง DFT' when 'uv_dft' then 'ส่ง UV DFT' when 'sublimation' then 'ส่งผลิตเสื้อพิมพ์ลาย'
    when 'ready_made' then 'สั่งซื้อสำเร็จ' when 'embroidery' then 'ส่งปัก' when 'sewing' then 'ส่ง ตัด-เย็บ'
    when 'screen' then 'ส่งสกรีน' when 'dtg' then 'ส่ง DTG' else t end
$$;

create or replace function public.po_step_status(s text) returns text language sql immutable as $$
  select case s when 'ส่งแล้ว' then 'ส่งงานแล้ว' when 'กำลังผลิต' then 'กำลังผลิต' when 'รับของแล้ว' then 'รอตรวจ'
    when 'ปิดแล้ว' then 'เสร็จแล้ว' when 'มีปัญหา' then 'ต้องแก้ไข' when 'ยกเลิก' then 'ยกเลิก' else 'รอเริ่ม' end
$$;

-- ── PO: เลขที่ / หน่วย / เวลา ────────────────────────────────
create or replace function public.supplier_po_before() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare prefix text; n int;
begin
  if tg_op = 'INSERT' then
    prefix := 'SPO-' || to_char(now() at time zone 'Asia/Bangkok', 'YYMM') || '-';
    perform pg_advisory_xact_lock(hashtext(prefix));
    select coalesce(max(nullif(regexp_replace(code, '^' || prefix, ''), code)::int), 0) + 1 into n
      from supplier_pos where code like prefix || '%' and code ~ ('^' || prefix || '[0-9]+$');
    new.code := prefix || lpad(n::text, 3, '0');
    new.created_by := auth.uid();
  else
    new.code := old.code; new.created_by := old.created_by; new.created_at := old.created_at;
  end if;
  new.unit := case when new.po_type in ('dft','uv_dft') then 'เมตร' else 'ชิ้น' end;
  if new.unit = 'ชิ้น' then new.film_width_cm := null; new.total_meters := null; end if;
  new.updated_at := now();
  if new.status = 'ปิดแล้ว' and (tg_op = 'INSERT' or old.status <> 'ปิดแล้ว') then new.closed_at := now();
  elsif new.status <> 'ปิดแล้ว' then new.closed_at := null; end if;
  if new.status = 'ส่งแล้ว' and new.sent_date is null then new.sent_date := (now() at time zone 'Asia/Bangkok')::date; end if;
  if new.status in ('รับของแล้ว','ปิดแล้ว') and new.received_date is null then new.received_date := (now() at time zone 'Asia/Bangkok')::date; end if;
  return new;
end $$;
drop trigger if exists trg_supplier_po_before on public.supplier_pos;
create trigger trg_supplier_po_before before insert or update on public.supplier_pos for each row execute function public.supplier_po_before();

create or replace function public.supplier_po_before_delete() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if old.status not in ('ร่าง','ยกเลิก') then raise exception 'PO % ส่งไปแล้ว ลบไม่ได้ — เปลี่ยนเป็น "ยกเลิก" แทน', old.code; end if;
  return old;
end $$;
drop trigger if exists trg_supplier_po_before_delete on public.supplier_pos;
create trigger trg_supplier_po_before_delete before delete on public.supplier_pos for each row execute function public.supplier_po_before_delete();

-- ── PO → ขั้นตอนในแผนการผลิตของทุกใบงานใน PO ─────────────────
create or replace function public.supplier_po_sync_steps() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform set_config('app.po_sync', 'on', true);
  update job_steps set
    status = po_step_status(new.status),
    supplier_id = new.supplier_id,
    sent_date = new.sent_date,
    due_date = new.due_date,
    received_date = case when new.status in ('รับของแล้ว','ปิดแล้ว') then new.received_date else null end,
    name = po_type_label(new.po_type) || ' · ' || new.code,
    updated_at = now()
  where supplier_po_id = new.id;
  perform set_config('app.po_sync', 'off', true);
  return null;
end $$;
drop trigger if exists trg_supplier_po_sync_steps on public.supplier_pos;
create trigger trg_supplier_po_sync_steps after update on public.supplier_pos for each row
  when (old.status is distinct from new.status or old.supplier_id is distinct from new.supplier_id or old.po_type is distinct from new.po_type
        or old.sent_date is distinct from new.sent_date or old.due_date is distinct from new.due_date or old.received_date is distinct from new.received_date)
  execute function public.supplier_po_sync_steps();

create or replace function public.supplier_po_line_steps() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare p supplier_pos; seqn int;
begin
  perform set_config('app.po_sync', 'on', true);
  -- ใบงานที่ไม่มีแถวใน PO นี้แล้ว → เอาขั้นตอนของ PO ออก
  if tg_op in ('DELETE','UPDATE') and old.job_order_id is not null
     and not exists (select 1 from supplier_po_lines where po_id = old.po_id and job_order_id = old.job_order_id) then
    delete from job_steps where job_order_id = old.job_order_id and supplier_po_id = old.po_id;
  end if;
  -- ใบงานใหม่ใน PO → เพิ่มขั้นตอน
  if tg_op in ('INSERT','UPDATE') and new.job_order_id is not null
     and not exists (select 1 from job_steps where job_order_id = new.job_order_id and supplier_po_id = new.po_id) then
    select * into p from supplier_pos where id = new.po_id;
    select coalesce(max(seq), 0) + 1 into seqn from job_steps where job_order_id = new.job_order_id;
    insert into job_steps (job_order_id, seq, name, phase, supplier_id, sent_date, due_date, status, supplier_po_id, note)
    values (new.job_order_id, seqn, po_type_label(p.po_type) || ' · ' || p.code,
            case when p.po_type = 'ready_made' then 'จัดซื้อ' else 'ผลิต' end,
            p.supplier_id, p.sent_date, p.due_date, po_step_status(p.status), p.id, 'อัปเดตจากใบงาน Supplier');
  end if;
  perform set_config('app.po_sync', 'off', true);
  return null;
end $$;
drop trigger if exists trg_supplier_po_line_steps on public.supplier_po_lines;
create trigger trg_supplier_po_line_steps after insert or delete or update of job_order_id on public.supplier_po_lines
  for each row execute function public.supplier_po_line_steps();

-- ขั้นตอนที่มาจาก PO: แก้ชื่อเล่น/ลำดับ/ช่วง/หมายเหตุได้ แต่สถานะ supplier วันที่ ต้องแก้ที่ PO
create or replace function public.guard_po_step() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare c text;
begin
  if coalesce(current_setting('app.po_sync', true), '') = 'on' then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    if old.supplier_po_id is not null and exists (select 1 from supplier_pos where id = old.supplier_po_id) then
      select code into c from supplier_pos where id = old.supplier_po_id;
      raise exception 'ขั้นตอนนี้มาจากใบงาน Supplier % — เอาใบงานออกจาก PO แทน', c;
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if new.supplier_po_id is not null then raise exception 'ขั้นตอนของใบงาน Supplier สร้างจากหน้า PO เท่านั้น'; end if;
    return new;
  end if;
  if new.supplier_po_id is distinct from old.supplier_po_id and new.supplier_po_id is not null then
    raise exception 'ผูกขั้นตอนกับ PO จากหน้า PO เท่านั้น';
  end if;
  if old.supplier_po_id is not null and new.supplier_po_id is not null and (
       new.status is distinct from old.status or new.supplier_id is distinct from old.supplier_id
       or new.sent_date is distinct from old.sent_date or new.due_date is distinct from old.due_date
       or new.received_date is distinct from old.received_date) then
    select code into c from supplier_pos where id = old.supplier_po_id;
    raise exception 'ขั้นตอนนี้อัปเดตจากใบงาน Supplier % — เปลี่ยนสถานะ/วันที่ที่หน้า PO', c;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_po_step on public.job_steps;
create trigger trg_guard_po_step before insert or update or delete on public.job_steps for each row execute function public.guard_po_step();

-- ใบงานปิด (ส่งมอบ/Completed) ไม่ได้ ถ้ายังมี PO ที่ยังไม่ปิด
create or replace function public.guard_job_open_pos() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare c text;
begin
  if new.job_status = 'Completed' and old.job_status is distinct from 'Completed' then
    select string_agg(distinct p.code, ', ') into c
      from supplier_po_lines l join supplier_pos p on p.id = l.po_id
      where l.job_order_id = new.id and p.status not in ('ปิดแล้ว','ยกเลิก');
    if c is not null then raise exception 'ปิดใบงานไม่ได้: ใบงาน Supplier ยังไม่ปิด (%)', c; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_job_open_pos on public.job_orders;
create trigger trg_job_open_pos before update of job_status, production_status on public.job_orders for each row execute function public.guard_job_open_pos();

-- ── ต้นทุน PO ต่อใบงาน (สำหรับ ทุน-กำไร) ─────────────────────
create or replace view public.supplier_po_job_costs with (security_invoker = on) as
with w as (
  select l.po_id, l.job_order_id,
         sum(case when p.unit = 'เมตร' and coalesce(l.meters, 0) > 0 then l.meters else l.qty end) as weight
  from supplier_po_lines l join supplier_pos p on p.id = l.po_id
  where l.job_order_id is not null
  group by l.po_id, l.job_order_id
), t as (
  select po_id, sum(weight) as total_w, count(*) as n from w group by po_id
)
select w.job_order_id, p.id as po_id, p.code, p.po_type, p.supplier_id, p.status, p.sent_date,
       round(case when t.total_w > 0 then p.total_amount * w.weight / t.total_w else p.total_amount / t.n end, 2) as amount
from w join t on t.po_id = w.po_id join supplier_pos p on p.id = w.po_id
where p.status <> 'ยกเลิก';

-- ── สิทธิ์ ──────────────────────────────────────────────────
alter table public.supplier_pos enable row level security;
alter table public.supplier_po_lines enable row level security;
grant select, insert, update, delete on public.supplier_pos, public.supplier_po_lines to authenticated;
grant select on public.supplier_po_job_costs to authenticated;

drop policy if exists supplier_pos_read on public.supplier_pos;
create policy supplier_pos_read on public.supplier_pos for select to authenticated
  using (public.has_role('owner','admin','sales','designer','production','accounting'));
drop policy if exists supplier_pos_write on public.supplier_pos;
create policy supplier_pos_write on public.supplier_pos for insert to authenticated
  with check (public.has_role('owner','admin','sales','designer','production','accounting'));
drop policy if exists supplier_pos_update on public.supplier_pos;
create policy supplier_pos_update on public.supplier_pos for update to authenticated
  using (public.has_role('owner','admin','sales','designer','production','accounting'))
  with check (public.has_role('owner','admin','sales','designer','production','accounting'));
drop policy if exists supplier_pos_delete on public.supplier_pos;
create policy supplier_pos_delete on public.supplier_pos for delete to authenticated
  using (public.has_role('owner','admin'));

drop policy if exists supplier_po_lines_read on public.supplier_po_lines;
create policy supplier_po_lines_read on public.supplier_po_lines for select to authenticated
  using (public.has_role('owner','admin','sales','designer','production','accounting'));
drop policy if exists supplier_po_lines_write on public.supplier_po_lines;
create policy supplier_po_lines_write on public.supplier_po_lines for insert to authenticated
  with check (public.has_role('owner','admin','sales','designer','production','accounting'));
drop policy if exists supplier_po_lines_update on public.supplier_po_lines;
create policy supplier_po_lines_update on public.supplier_po_lines for update to authenticated
  using (public.has_role('owner','admin','sales','designer','production','accounting'))
  with check (public.has_role('owner','admin','sales','designer','production','accounting'));
drop policy if exists supplier_po_lines_delete on public.supplier_po_lines;
create policy supplier_po_lines_delete on public.supplier_po_lines for delete to authenticated
  using (public.has_role('owner','admin','sales','designer','production','accounting'));
