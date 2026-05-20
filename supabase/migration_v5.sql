-- Migration v5
alter table stock_in     add column if not exists shipping_cost  numeric default 0;
alter table cost_items   add column if not exists item_type      text;
alter table job_orders   add column if not exists image_url      text;
alter table receipts     add column if not exists file_url       text;
alter table invoices     add column if not exists wht_file_url   text;

-- วันที่เอกสาร (แก้ไขได้)
alter table quotations   add column if not exists document_date  date default current_date;
alter table invoices     add column if not exists document_date  date default current_date;
alter table job_orders   add column if not exists document_date  date default current_date;
alter table receipts     add column if not exists document_date  date default current_date;

-- หมวดหมู่ค่าใช้จ่าย / รายรับ
alter table transactions add column if not exists category       text;
alter table transactions add column if not exists invoice_id     uuid references invoices(id) on delete set null;
alter table transactions add column if not exists note           text;
