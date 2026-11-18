-- ใบแจ้งหนี้: แนบรูป Mockup ได้ 1 รูป (ใบเสร็จใช้รูปเดียวกันของใบแจ้งหนี้ที่ผูกอยู่)
-- ใบงานที่สร้างจากใบแจ้งหนี้จะคัดลอกรูปนี้ไปเป็น Mockup ด้านหน้าของใบงาน
-- Forward-only: เพิ่มคอลัมน์ว่างอย่างเดียว ไม่แตะข้อมูลเดิม
alter table public.invoices add column if not exists mockup_url text;
