-- Migration v9: Google Drive integration + Job order design fields

-- เพิ่ม drive_folder_id ให้ customers (เก็บ Google Drive folder ID ของลูกค้า)
alter table customers add column if not exists drive_folder_id text;

-- เพิ่ม design_detail ให้ job_orders (รายละเอียดลาย เช่น ขนาด ตำแหน่ง สี)
-- เก็บเป็น jsonb เพื่อรองรับหลาย field โดยไม่ต้องเพิ่ม column ใหม่ทีละตัว
alter table job_orders add column if not exists design_detail jsonb;

-- เพิ่ม reference_url สำหรับรูป Reference ที่ลูกค้าต้องการ
alter table job_orders add column if not exists reference_url text;
