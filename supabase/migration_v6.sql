-- Migration v6: stock-in ใหม่
alter table stock_in add column if not exists item_name   text;
alter table stock_in add column if not exists vat_pct     numeric default 0;
alter table stock_in add column if not exists lot_number  text;
alter table stock_in add column if not exists note        text;
