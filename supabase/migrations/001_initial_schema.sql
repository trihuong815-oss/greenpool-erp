-- ============================================================
-- GREEN POOL ERP — Database Schema v1
-- PostgreSQL / Supabase
-- ============================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";

-- ============================================================
-- 1. CƠ SỞ (Facilities) — 5 cơ sở
-- ============================================================
create table if not exists facilities (
  id text primary key,
  name text not null,
  color text default '#1F3A5F',
  address text,
  created_at timestamptz default now()
);

insert into facilities (id, name, color, address) values
  ('HM',  'Hoàng Mai',         '#1F3A5F', '123 Hoàng Mai, Hà Nội'),
  ('TK',  'Thuỵ Khuê',         '#C9A227', '456 Thuỵ Khuê, Hà Nội'),
  ('CTT', 'Cung Thể Thao Dưới Nước', '#2E8B8B', 'Mỹ Đình, Hà Nội'),
  ('24',  '24 Nguyễn Cơ Thạch','#5B9BD5', '24 NCT, Hà Nội'),
  ('TT',  'Thanh Trì',         '#E07A5F', 'Thanh Trì, Hà Nội')
on conflict (id) do nothing;

-- ============================================================
-- 2. KHỐI (Blocks) — KD và VP
-- ============================================================
create table if not exists blocks (
  id text primary key,
  name text not null,
  color text default '#1F3A5F'
);

insert into blocks (id, name, color) values
  ('KD', 'Khối Kinh doanh', '#1F3A5F'),
  ('VP', 'Khối Văn phòng',  '#7B6CDB')
on conflict (id) do nothing;

-- ============================================================
-- 3. PHÒNG BAN (Departments)
-- ============================================================
create table if not exists departments (
  id text primary key,
  name text not null,
  block_id text references blocks(id) not null,
  color text default '#1F3A5F'
);

insert into departments (id, name, block_id, color) values
  ('KT',  'Phòng Kỹ thuật',  'KD', '#5B9BD5'),
  ('DT',  'Phòng Đào tạo',   'KD', '#7B6CDB'),
  ('MKT', 'Phòng Marketing', 'KD', '#E07A5F'),
  ('TTNB','Tiểu ban Truyền thông Nội bộ', 'KD', '#C9A227'),
  ('GS',  'Phòng Giám sát',  'VP', '#B23A48'),
  ('KE',  'Phòng Kế toán',   'VP', '#C9A227'),
  ('NS',  'Phòng Nhân sự',   'VP', '#2E8B8B')
on conflict (id) do nothing;

-- ============================================================
-- 4. VAI TRÒ (Roles) — 42 vai trò × 5 tầng
-- ============================================================
create table if not exists roles (
  code text primary key,
  name text not null,
  tier int not null,         -- 1-5
  block_id text references blocks(id),
  dept_id text references departments(id),
  facility_id text references facilities(id),
  is_qlcs boolean default false,
  is_tp boolean default false,
  parent_role text,
  description text
);

-- Tầng 1
insert into roles (code, name, tier, description) values
  ('CEO', 'CEO / Chủ đầu tư', 1, 'Toàn quyền hệ thống')
on conflict (code) do nothing;

-- Tầng 2: GĐ Khối
insert into roles (code, name, tier, block_id, parent_role) values
  ('GD_KD', 'Giám đốc Khối Kinh doanh', 2, 'KD', 'CEO'),
  ('GD_VP', 'Giám đốc Khối Văn phòng',   2, 'VP', 'CEO')
on conflict (code) do nothing;

-- Tầng 3: QLCS (5 cơ sở)
insert into roles (code, name, tier, block_id, facility_id, is_qlcs, parent_role) values
  ('QLCS_HM',   'Quản lý CS Hoàng Mai',     3, 'KD', 'HM',  true, 'GD_KD'),
  ('QLCS_TK',   'Quản lý CS Thuỵ Khuê',     3, 'KD', 'TK',  true, 'GD_KD'),
  ('QLCS_CTT',  'Quản lý CS CTT Dưới Nước', 3, 'KD', 'CTT', true, 'GD_KD'),
  ('QLCS_24NCT','Quản lý CS 24 NCT',         3, 'KD', '24',  true, 'GD_KD'),
  ('QLCS_TT',   'Quản lý CS Thanh Trì',     3, 'KD', 'TT',  true, 'GD_KD')
on conflict (code) do nothing;

-- Tầng 3: TP các phòng
insert into roles (code, name, tier, block_id, dept_id, is_tp, parent_role) values
  ('TP_KT',  'TP Kỹ thuật',     3, 'KD', 'KT',   true, 'GD_KD'),
  ('TP_DT',  'TP Đào tạo',      3, 'KD', 'DT',   true, 'GD_KD'),
  ('TP_MKT', 'TP Marketing',    3, 'KD', 'MKT',  true, 'GD_KD'),
  ('TIBAN_TT','Tiểu ban Truyền thông NB', 3, 'KD', 'TTNB', true, 'GD_KD'),
  ('TP_GS',  'TP Giám sát',     3, 'VP', 'GS',   true, 'GD_VP'),
  ('TP_KE',  'TP Kế toán',      3, 'VP', 'KE',   true, 'GD_VP'),
  ('TP_NS',  'TP Nhân sự',      3, 'VP', 'NS',   true, 'GD_VP')
on conflict (code) do nothing;

-- Tầng 4: Phó phòng + Tổ trưởng
insert into roles (code, name, tier, block_id, dept_id, parent_role) values
  ('PP_MKT',    'Phó phòng Marketing',         4, 'KD', 'MKT', 'TP_MKT'),
  ('PP_DT_CM',  'Phó phòng ĐT - Chuyên môn',   4, 'KD', 'DT',  'TP_DT'),
  ('PP_DT_TC',  'Phó phòng ĐT - Tổ chức TNKH', 4, 'KD', 'DT',  'TP_DT'),
  ('PP_KT_XLN', 'Phó phòng KT - Xử lý nước',   4, 'KD', 'KT',  'TP_KT'),
  ('PP_KT_HT',  'Phó phòng KT - Hệ thống',     4, 'KD', 'KT',  'TP_KT'),
  ('TT_CT',     'Tổ trưởng Content',           4, 'KD', 'MKT', 'PP_MKT'),
  ('TT_TK',     'Tổ trưởng Thiết kế',          4, 'KD', 'MKT', 'PP_MKT'),
  ('TT_ED',     'Tổ trưởng Editor',            4, 'KD', 'MKT', 'PP_MKT'),
  ('TT_DT',     'Tổ trưởng Đào tạo cơ sở',     4, 'KD', 'DT',  'PP_DT_CM'),
  ('TT_AS',     'Tổ trưởng An sinh',           4, 'KD', null,  null),
  ('TT_LT',     'Tổ trưởng Lễ tân',            4, 'KD', null,  null)
on conflict (code) do nothing;

-- Tầng 5: Nhân viên
insert into roles (code, name, tier, block_id, dept_id) values
  ('NV_CT',     'NV Content',     5, 'KD', 'MKT'),
  ('NV_TK',     'NV Thiết kế',    5, 'KD', 'MKT'),
  ('NV_ED',     'NV Editor',      5, 'KD', 'MKT'),
  ('NV_SALE',   'NV Kinh doanh / Sale', 5, 'KD', null),
  ('NV_CH',     'NV Cứu hộ',      5, 'KD', null),
  ('NV_TV',     'NV Tạp vụ',      5, 'KD', null),
  ('NV_LT',     'NV Lễ tân',      5, 'KD', null),
  ('NV_KT_XLN', 'NV KT Xử lý nước',  5, 'KD', 'KT'),
  ('NV_KT_HT',  'NV KT Hệ thống',    5, 'KD', 'KT'),
  ('GV_CB',     'Giáo viên cơ bản',  5, 'KD', 'DT'),
  ('GV_NC',     'Giáo viên nâng cao',5, 'KD', 'DT'),
  ('GV_TG',     'Trợ giảng',         5, 'KD', 'DT'),
  ('NV_GS',     'NV Giám sát',    5, 'VP', 'GS'),
  ('NV_KE',     'NV Kế toán',     5, 'VP', 'KE'),
  ('NV_NS',     'NV Nhân sự',     5, 'VP', 'NS'),
  ('NV_TTNB',   'NV Truyền thông Nội bộ', 5, 'KD', 'TTNB')
on conflict (code) do nothing;

-- ============================================================
-- 5. USERS — Mở rộng từ auth.users của Supabase
-- ============================================================
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text unique not null,
  phone text,
  role_code text references roles(code) not null,
  facility_id text references facilities(id),
  is_probation boolean default false,
  avatar_url text,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- 6. MODULES — Quy định module nào tồn tại
-- ============================================================
create table if not exists modules (
  code text primary key,
  name text not null,
  icon text,
  sort_order int default 0
);

insert into modules (code, name, icon, sort_order) values
  ('dashboard',         'Dashboard',                 'home',       1),
  ('doanh-so',          'Doanh số',                  'bar-chart',  2),
  ('checklist',         'Checklist vận hành',        'check-list', 3),
  ('quy-trinh',         'Quy trình vận hành phòng ban', 'file-text', 4),
  ('giao-viec',         'Đề xuất · Nhiệm vụ · Giao việc', 'tasks', 5),
  ('sodo',              'Sơ đồ tổ chức',             'users',      6),
  ('luong',             'Lương 3P & KPI',            'dollar',     7),
  ('bao-cao',           'Báo cáo tự động',           'document',   8),
  ('daotao',            'Quản lý Đào tạo (API)',     'graduation', 9),
  ('mkt',               'Quản lý Marketing (API)',   'megaphone',  10),
  ('settings-packages', 'Quản lý gói dịch vụ',       'settings',   11)
on conflict (code) do nothing;

-- ============================================================
-- 7. ROLE_MODULE — Phân quyền vai trò → module
-- ============================================================
create table if not exists role_modules (
  role_code text references roles(code) on delete cascade,
  module_code text references modules(code) on delete cascade,
  can_edit boolean default false,
  primary key (role_code, module_code)
);

-- Phân quyền cho CEO + GĐ Khối + QLCS (xem tất cả)
insert into role_modules (role_code, module_code, can_edit)
select r.code, m.code, true
from roles r cross join modules m
where r.code in ('CEO','GD_KD');

insert into role_modules (role_code, module_code, can_edit)
select r.code, m.code, false
from roles r cross join modules m
where r.code = 'GD_VP' and m.code in ('dashboard','checklist','quy-trinh','giao-viec','sodo','luong','bao-cao');

-- QLCS - tất cả module trừ MKT
insert into role_modules (role_code, module_code, can_edit)
select r.code, m.code, true
from roles r cross join modules m
where r.is_qlcs and m.code in ('dashboard','doanh-so','checklist','quy-trinh','giao-viec','sodo','luong','bao-cao','daotao','mkt','settings-packages');

-- TP chuyên môn KT
insert into role_modules (role_code, module_code, can_edit) values
  ('TP_KT', 'dashboard', false),
  ('TP_KT', 'checklist', false),
  ('TP_KT', 'quy-trinh', true),
  ('TP_KT', 'giao-viec', true),
  ('TP_KT', 'bao-cao', false);

-- TP Đào tạo
insert into role_modules (role_code, module_code, can_edit) values
  ('TP_DT', 'dashboard', false),
  ('TP_DT', 'checklist', false),
  ('TP_DT', 'quy-trinh', true),
  ('TP_DT', 'giao-viec', true),
  ('TP_DT', 'bao-cao', false),
  ('TP_DT', 'daotao', true);

-- TP MKT
insert into role_modules (role_code, module_code, can_edit) values
  ('TP_MKT', 'dashboard', false),
  ('TP_MKT', 'checklist', false),
  ('TP_MKT', 'quy-trinh', true),
  ('TP_MKT', 'giao-viec', true),
  ('TP_MKT', 'bao-cao', false),
  ('TP_MKT', 'mkt', true);

-- TP khối VP
insert into role_modules (role_code, module_code, can_edit) values
  ('TP_GS','dashboard',false),('TP_GS','checklist',false),('TP_GS','quy-trinh',true),('TP_GS','giao-viec',true),('TP_GS','bao-cao',false),('TP_GS','sodo',false),
  ('TP_KE','dashboard',false),('TP_KE','checklist',false),('TP_KE','quy-trinh',true),('TP_KE','giao-viec',true),('TP_KE','bao-cao',false),('TP_KE','luong',false),
  ('TP_NS','dashboard',false),('TP_NS','checklist',false),('TP_NS','quy-trinh',true),('TP_NS','giao-viec',true),('TP_NS','bao-cao',false),('TP_NS','luong',false),('TP_NS','sodo',false);

-- Tổ trưởng + Giáo viên
insert into role_modules (role_code, module_code, can_edit) values
  ('TT_DT','dashboard',false),('TT_DT','checklist',false),('TT_DT','quy-trinh',false),('TT_DT','giao-viec',true),('TT_DT','bao-cao',false),
  ('GV_CB','dashboard',false),('GV_CB','checklist',false),('GV_CB','quy-trinh',false),('GV_CB','giao-viec',true),
  ('NV_SALE','dashboard',false),('NV_SALE','checklist',false),('NV_SALE','giao-viec',true),
  ('NV_CH','dashboard',false),('NV_CH','checklist',false),('NV_CH','giao-viec',true);

-- ============================================================
-- 8. GÓI DỊCH VỤ (Service Packages)
-- ============================================================
create table if not exists package_groups (
  id text primary key,
  name text not null,
  icon text,
  color text,
  description text,
  exclusive_facility text references facilities(id),  -- chỉ tại 1 CS (PT, Fitness)
  sort_order int default 0
);

create table if not exists packages (
  id uuid primary key default uuid_generate_v4(),
  group_id text references package_groups(id),
  name text not null,
  sort_order int default 0,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists package_revenue (
  id uuid primary key default uuid_generate_v4(),
  package_id uuid references packages(id) on delete cascade,
  facility_id text references facilities(id),
  period_year int not null,
  period_month int,  -- null = tổng năm
  revenue_million numeric(12,2) default 0,
  updated_at timestamptz default now(),
  unique(package_id, facility_id, period_year, period_month)
);

-- ============================================================
-- 9. DOANH SỐ THÁNG (Monthly Progress)
-- ============================================================
create table if not exists monthly_progress (
  id uuid primary key default uuid_generate_v4(),
  facility_id text references facilities(id) not null,
  period_year int not null,
  period_month int not null check (period_month between 1 and 12),
  target_million numeric(12,2) default 0,
  actual_million numeric(12,2) default 0,
  updated_by uuid references profiles(id),
  updated_at timestamptz default now(),
  unique(facility_id, period_year, period_month)
);

create table if not exists annual_targets (
  facility_id text references facilities(id),
  period_year int,
  target_million numeric(12,2) default 0,
  primary key (facility_id, period_year)
);

-- ============================================================
-- 10. NHIỆM VỤ + ĐỀ XUẤT (Tasks & Proposals)
-- ============================================================
create table if not exists tasks (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text,
  assignee_id uuid references profiles(id),
  from_id uuid references profiles(id),
  facility_id text references facilities(id),
  dept_id text references departments(id),
  status text default 'pending' check (status in ('pending','in_progress','completed','rejected')),
  priority text default 'medium' check (priority in ('low','medium','high')),
  deadline date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists proposals (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text,
  from_id uuid references profiles(id),
  facility_id text references facilities(id),
  dept_id text references departments(id),
  proposal_type text check (proposal_type in ('up','peer','cross-bloc')),
  status text default 'pending' check (status in ('pending','in_approval','approved','rejected','in_execution','completed')),
  priority text default 'medium',
  final_assignee_id uuid references profiles(id),
  created_at timestamptz default now()
);

create table if not exists proposal_approvals (
  id uuid primary key default uuid_generate_v4(),
  proposal_id uuid references proposals(id) on delete cascade,
  approver_role text references roles(code),
  step_order int not null,
  status text default 'pending' check (status in ('pending','approved','rejected')),
  note text,
  approved_at timestamptz,
  unique(proposal_id, step_order)
);

-- ============================================================
-- 11. CHECKLIST
-- ============================================================
create table if not exists checklist_templates (
  id uuid primary key default uuid_generate_v4(),
  role_label text not null,  -- e.g. "NV Cứu hộ"
  block_id text references blocks(id) not null,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists checklist_items (
  id uuid primary key default uuid_generate_v4(),
  template_id uuid references checklist_templates(id) on delete cascade,
  content text not null,
  sort_order int default 0
);

create table if not exists checklist_logs (
  id uuid primary key default uuid_generate_v4(),
  template_id uuid references checklist_templates(id),
  item_id uuid references checklist_items(id),
  user_id uuid references profiles(id),
  facility_id text references facilities(id),
  date_completed date default current_date,
  is_done boolean default false,
  note text,
  created_at timestamptz default now()
);

-- ============================================================
-- 12. QUY TRÌNH VẬN HÀNH (Procedures with versions)
-- ============================================================
create table if not exists procedures (
  id uuid primary key default uuid_generate_v4(),
  dept_id text references departments(id) not null,
  title text not null,
  description text,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists procedure_versions (
  id uuid primary key default uuid_generate_v4(),
  procedure_id uuid references procedures(id) on delete cascade,
  version int not null,
  file_name text not null,
  file_url text,           -- Supabase Storage URL
  file_size bigint,
  change_note text,
  uploaded_by uuid references profiles(id),
  uploaded_at timestamptz default now(),
  unique(procedure_id, version)
);

-- ============================================================
-- 13. THÔNG BÁO (Notifications)
-- ============================================================
create table if not exists notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references profiles(id) on delete cascade,
  type text not null,  -- task_assigned, proposal_approved, etc.
  title text not null,
  link text,           -- module path
  link_tab text,
  related_id uuid,     -- task/proposal id
  is_read boolean default false,
  created_at timestamptz default now()
);

-- ============================================================
-- 14. SALES PERFORMANCE (Hiệu suất Sale)
-- ============================================================
create table if not exists sales_performance (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references profiles(id),
  facility_id text references facilities(id),
  period_year int,
  period_month int,
  revenue_million numeric(12,2) default 0,
  target_million numeric(12,2) default 0,
  leads_contacted int default 0,
  deals_closed int default 0,
  updated_at timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Enable RLS trên tất cả bảng chính
-- ============================================================
alter table profiles enable row level security;
alter table tasks enable row level security;
alter table proposals enable row level security;
alter table monthly_progress enable row level security;
alter table package_revenue enable row level security;
alter table notifications enable row level security;
alter table procedures enable row level security;
alter table procedure_versions enable row level security;
alter table checklist_templates enable row level security;
alter table sales_performance enable row level security;

-- Helper function: lấy role code của user hiện tại
create or replace function current_user_role() returns text as $$
  select profiles.role_code from profiles where profiles.id = auth.uid();
$$ language sql security definer;

-- Helper function: lấy facility của user
create or replace function current_user_facility() returns text as $$
  select profiles.facility_id from profiles where profiles.id = auth.uid();
$$ language sql security definer;

-- Policy: User chỉ đọc profile của chính mình + CEO/GĐ đọc tất cả
create policy "Profiles: self read" on profiles for select
  using (
    auth.uid() = id
    or current_user_role() in ('CEO','GD_KD','GD_VP')
  );

-- Policy: Tasks - thấy task liên quan mình hoặc CS mình
create policy "Tasks: scope visibility" on tasks for select using (
  assignee_id = auth.uid()
  or from_id = auth.uid()
  or current_user_role() in ('CEO','GD_KD','GD_VP')
  or (facility_id is not null and facility_id = current_user_facility())
);

-- Policy: Notifications - chỉ user nhận thấy
create policy "Notifications: self only" on notifications for all
  using (user_id = auth.uid());

-- Policy: Procedures - everyone authenticated có thể đọc
create policy "Procedures: read all auth" on procedures for select
  using (auth.uid() is not null);

-- Index để query nhanh
create index if not exists idx_tasks_assignee on tasks(assignee_id);
create index if not exists idx_tasks_facility on tasks(facility_id);
create index if not exists idx_tasks_status on tasks(status);
create index if not exists idx_proposals_status on proposals(status);
create index if not exists idx_notifications_user_read on notifications(user_id, is_read);
create index if not exists idx_monthly_progress_lookup on monthly_progress(facility_id, period_year, period_month);
create index if not exists idx_package_revenue_lookup on package_revenue(facility_id, period_year);

-- ============================================================
-- END OF SCHEMA v1
-- ============================================================
