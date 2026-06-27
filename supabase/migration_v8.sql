-- Migration v8: เพิ่ม columns ที่ขาดใน quotations
alter table quotations add column if not exists subtotal   numeric default 0;
alter table quotations add column if not exists discount   numeric default 0;
alter table quotations add column if not exists vat_pct    numeric default 0;
alter table quotations add column if not exists vat_amount numeric default 0;
alter table quotations add column if not exists notes      text;
