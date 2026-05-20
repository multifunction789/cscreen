-- ============================================================
-- CSCREEN ERP — Seed Data (ข้อมูลตัวอย่าง)
-- Run หลังจาก schema.sql เสร็จแล้ว
-- ============================================================

-- ── CUSTOMERS ───────────────────────────────────────────────
insert into customers (code, name, type, contact, phone, email) values
  ('C-001', 'บริษัท ABC จำกัด',  'นิติบุคคล',     'คุณสมชาย',     '081-234-5678', 'abc@example.com'),
  ('C-002', 'ร้านเจริญทรัพย์',   'บุคคลธรรมดา',   'คุณมาลี',       '089-876-5432', 'jaroen@example.com'),
  ('C-003', 'โรงเรียนวัดไทย',    'หน่วยงาน',       'อาจารย์สุภา',   '02-456-7890',  'school@example.com'),
  ('C-004', 'คุณวิชัย พงษ์ดี',   'บุคคลธรรมดา',   'คุณวิชัย',      '095-111-2222', 'wichai@example.com'),
  ('C-005', 'ห้างหุ้นส่วน XYZ',  'นิติบุคคล',     'คุณประสิทธิ์',  '02-555-3333',  'xyz@example.com'),
  ('C-006', 'ร้านสตาร์',          'บุคคลธรรมดา',   'คุณโฟม',        '086-777-8888', 'star@example.com')
on conflict (code) do nothing;

-- ── SUPPLIERS ───────────────────────────────────────────────
insert into suppliers (code, name, category, contact, phone, rating) values
  ('SUP-001', 'บริษัท ผ้าไทย จำกัด', 'เสื้อผ้า',   'คุณวิชัย',    '081-234-5678', 5),
  ('SUP-002', 'บริษัทหมึก Pro',        'หมึก / สี',  'คุณปรีชา',    '082-345-6789', 4),
  ('SUP-003', 'ร้านวัสดุสกรีน',        'อุปกรณ์',    'คุณสมหญิง',   '083-456-7890', 4),
  ('SUP-004', 'โรงงาน A1',             'เสื้อผ้า',   'คุณสมศักดิ์', '084-567-8901', 3),
  ('SUP-005', 'ร้านถุงผ้าสยาม',        'ถุงผ้า',     'คุณนภา',      '085-678-9012', 4)
on conflict (code) do nothing;

-- ── MATERIALS ───────────────────────────────────────────────
insert into materials (code, name, category, unit, qty, min_qty, cost_per_unit) values
  ('M-001', 'เสื้อโปโล (ขาว) Size M',  'เสื้อ',  'ตัว',   450,  100, 85),
  ('M-002', 'เสื้อยืด (ดำ) Size L',    'เสื้อ',  'ตัว',   80,   100, 65),
  ('M-003', 'ถุงผ้าดิบ 12x14 นิ้ว',    'ถุงผ้า', 'ใบ',    1200, 200, 18),
  ('M-004', 'หมึกสกรีน (ดำ)',           'หมึก',   'กิโล', 12,   5,   380),
  ('M-005', 'หมึกสกรีน (แดง)',          'หมึก',   'กิโล', 3,    5,   420),
  ('M-006', 'บาทิก (กลาง)',             'ผ้า',    'เมตร', 200,  50,  120)
on conflict (code) do nothing;

-- ── JOB ORDERS ──────────────────────────────────────────────
insert into job_orders (code, customer_id, item_desc, status, total, due_date)
select 'JO-0026', id, 'เสื้อยืด 80 ตัว',          'รอมัดจำ',        6400,  current_date + 12 from customers where code = 'C-006' on conflict (code) do nothing;
insert into job_orders (code, customer_id, item_desc, status, total, due_date)
select 'JO-0025', id, 'เสื้อโปโล 50 ตัว',         'รอออกแบบ',       7500,  current_date + 9  from customers where code = 'C-006' on conflict (code) do nothing;
insert into job_orders (code, customer_id, item_desc, status, total, due_date)
select 'JO-0024', id, 'สกรีน 50 ตัว',              'สั่งของ',         3200,  current_date + 8  from customers where code = 'C-002' on conflict (code) do nothing;
insert into job_orders (code, customer_id, item_desc, status, total, due_date)
select 'JO-0023', id, 'ปักโลโก้ 30 ตัว',           'กำลังสกรีน',     4500,  current_date + 1  from customers where code = 'C-005' on conflict (code) do nothing;
insert into job_orders (code, customer_id, item_desc, status, total, due_date)
select 'JO-0022', id, 'แก้วพิมพ์โลโก้ 500 ใบ',     'สั่งผลิต',        15000, current_date + 10 from customers where code = 'C-005' on conflict (code) do nothing;
insert into job_orders (code, customer_id, item_desc, status, total, due_date)
select 'JO-0021', id, 'เสื้อนักเรียน 300 ตัว',     'แพ็คพร้อมส่ง',   28500, current_date + 2  from customers where code = 'C-003' on conflict (code) do nothing;
insert into job_orders (code, customer_id, item_desc, status, total, due_date)
select 'JO-0020', id, 'เสื้อยืด 50 ตัว',           'ส่งงานแล้ว',      4500,  current_date - 0  from customers where code = 'C-004' on conflict (code) do nothing;
insert into job_orders (code, customer_id, item_desc, status, total, due_date)
select 'JO-0019', id, 'ถุงผ้า 200 ใบ',              'เลยกำหนด',        3600,  current_date - 2  from customers where code = 'C-006' on conflict (code) do nothing;

-- ── TRANSACTIONS ────────────────────────────────────────────
insert into transactions (code, description, type, amount, category, transaction_date) values
  ('TX-001', 'รับเงิน JO-0023 บริษัทดาว',       'รายรับ',  4500,  'ค่างาน',             current_date),
  ('TX-002', 'ซื้อเสื้อโปโล 200 ตัว',           'รายจ่าย', 17000, 'วัตถุดิบ',           current_date - 1),
  ('TX-003', 'รับเงิน JO-0022 ห้างหุ้นส่วน XYZ','รายรับ',  15000, 'ค่างาน',             current_date - 2),
  ('TX-004', 'ค่าน้ำ ค่าไฟ',                    'รายจ่าย', 2800,  'ค่าสาธารณูปโภค',    current_date - 3),
  ('TX-005', 'รับเงิน JO-0021 โรงเรียนวัดไทย',  'รายรับ',  28500, 'ค่างาน',             current_date - 5),
  ('TX-006', 'ซื้อหมึกสกรีน Pro 5 กิโล',        'รายจ่าย', 1900,  'วัตถุดิบ',           current_date - 6),
  ('TX-007', 'รับเงิน JO-0020 คุณสมชาย',        'รายรับ',  4500,  'ค่างาน',             current_date - 8),
  ('TX-008', 'ค่าจ้างพนักงานรายวัน',             'รายจ่าย', 3600,  'ค่าแรง',             current_date - 10)
on conflict (code) do nothing;

-- ── STOCK IN ────────────────────────────────────────────────
insert into stock_in (code, material_id, supplier_id, qty, cost_per_unit, total, received_at)
select 'SI-0024', m.id, s.id, 200, 85, 17000, current_date
from materials m, suppliers s where m.code='M-001' and s.code='SUP-001' on conflict (code) do nothing;

insert into stock_in (code, material_id, supplier_id, qty, cost_per_unit, total, received_at)
select 'SI-0023', m.id, s.id, 5, 380, 1900, current_date - 2
from materials m, suppliers s where m.code='M-004' and s.code='SUP-002' on conflict (code) do nothing;

insert into stock_in (code, material_id, supplier_id, qty, cost_per_unit, total, received_at)
select 'SI-0022', m.id, s.id, 500, 18, 9000, current_date - 5
from materials m, suppliers s where m.code='M-003' and s.code='SUP-005' on conflict (code) do nothing;
