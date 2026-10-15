-- ═══════════════════════════════════════════════════════════════════
-- Migration v11: ให้ 1 Invoice มีหลายใบงานได้ (1 ใบงานต่อ 1 รายการ)
--
-- trigger guard_job_workflow เดิมห้าม Invoice มีใบงานเกิน 1 ใบ
-- แก้เฉพาะเงื่อนไขนี้: อนุญาตเมื่อทั้งใบงานใหม่และใบงานที่มีอยู่ผูกกับ "รายการที่ n" (invoice_item_no)
--   • รายการเดียวกันซ้ำ → ยังถูกกันโดย unique index job_orders_invoice_item_uniq
--   • ใบงานแบบเดิม (ไม่มี invoice_item_no) → ยังกันซ้ำเหมือนเดิมทุกกรณี
-- กฎอื่นใน trigger (สิทธิ์ตามบทบาท, สถานะ, ปิดงาน ฯลฯ) ไม่เปลี่ยน
-- ถ้าไม่พบข้อความเดิม จะหยุดและไม่แก้อะไร
-- ═══════════════════════════════════════════════════════════════════
do $$
declare
  src text := pg_get_functiondef('public.guard_job_workflow'::regproc);
  old_cond text := 'where invoice_id=new.invoice_id and id<>new.id)';
  new_cond text := 'where invoice_id=new.invoice_id and id<>new.id and (new.invoice_item_no is null or invoice_item_no is null))';
begin
  if position(new_cond in src) > 0 then
    raise notice 'already applied';
    return;
  end if;
  if position(old_cond in src) = 0 then
    raise exception 'guard_job_workflow: one-job-per-invoice condition not found — nothing changed';
  end if;
  execute replace(src, old_cond, new_cond);
end $$;
