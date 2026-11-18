-- ใบแจ้งหนี้: แนบรูป Mockup ได้ 2 รูป (แนบที่ฟอร์มแก้ไขใบแจ้งหนี้)
-- mockup_urls = รายการรูป (สูงสุด 2) · mockup_url เดิมยังเก็บรูปแรกไว้ให้เข้ากันได้
-- Forward-only: เพิ่มคอลัมน์ + คัดลอกรูปเดิมเข้าไป ไม่ลบอะไร
alter table public.invoices add column if not exists mockup_urls text[] not null default '{}';

update public.invoices
set mockup_urls = array[mockup_url]
where mockup_url is not null and mockup_url <> '' and cardinality(mockup_urls) = 0;
