-- Migration v7: เพิ่ม deposit fields ใน invoices
alter table invoices add column if not exists deposit_pct    numeric default 50;
alter table invoices add column if not exists deposit_amount numeric default 0;
