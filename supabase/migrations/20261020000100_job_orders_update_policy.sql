-- ใบงานแก้ไข/ลบจากหน้าเว็บไม่ได้: job_orders มี policy แค่ select + insert
-- ไม่มี policy update/delete → RLS กรองแถวออกเงียบๆ (บันทึกแล้วไม่มีอะไรเปลี่ยน ไม่มี error)
-- สิทธิ์ละเอียด (ใบงานที่ปิดแล้ว, การเปลี่ยนสถานะ) ยังคุมโดย trigger guard_job_workflow เหมือนเดิม

drop policy if exists job_orders_update on public.job_orders;
create policy job_orders_update on public.job_orders as permissive for update to authenticated
  using (public.has_role('owner', 'admin', 'sales', 'designer', 'production', 'accounting'))
  with check (public.has_role('owner', 'admin', 'sales', 'designer', 'production', 'accounting'));

drop policy if exists job_orders_delete on public.job_orders;
create policy job_orders_delete on public.job_orders as permissive for delete to authenticated
  using (public.has_role('owner', 'admin'));
