-- Migration v4: เพิ่มฟิลด์ใหม่
alter table customers  add column if not exists contact_person text;
alter table stock_in   add column if not exists category       text;
alter table stock_in   add column if not exists image_url      text;
