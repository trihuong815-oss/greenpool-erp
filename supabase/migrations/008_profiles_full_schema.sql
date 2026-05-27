-- ============================================================
-- Migration 008: Mở rộng profiles cho API tạo user trực tiếp
-- ============================================================
-- Thêm các trường denormalized + audit để hỗ trợ tạo user qua API
-- ============================================================

alter table profiles
  add column if not exists role_level int,
  add column if not exists department_id text references departments(id),
  add column if not exists department_name text,
  add column if not exists facility_name text,
  add column if not exists facilities text[] default '{}',
  add column if not exists block_id text references blocks(id),
  add column if not exists block_name text,
  add column if not exists status text default 'active',
  add column if not exists created_by uuid references profiles(id) on delete set null,
  add column if not exists created_by_role text,
  add column if not exists updated_at timestamptz default now();

alter table profiles drop constraint if exists profiles_status_check;
alter table profiles
  add constraint profiles_status_check
  check (status in ('active','inactive','suspended'));

-- Trigger auto-update updated_at
create or replace function profiles_touch_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_profiles_updated_at on profiles;
create trigger trg_profiles_updated_at before update on profiles
  for each row execute function profiles_touch_updated_at();

-- Backfill từ roles cho các profile hiện có
update profiles p
set
  role_level = r.tier,
  department_id = coalesce(p.department_id, r.dept_id),
  block_id = coalesce(p.block_id, r.block_id)
from roles r
where r.code = p.role_code
  and (p.role_level is null or p.department_id is null or p.block_id is null);

-- Backfill block_name + department_name
update profiles p
set block_name = b.name
from blocks b
where b.id = p.block_id and p.block_name is null;

update profiles p
set department_name = d.name
from departments d
where d.id = p.department_id and p.department_name is null;

update profiles p
set facility_name = f.name
from facilities f
where f.id = p.facility_id and p.facility_name is null;

update profiles set status = case when active then 'active' else 'inactive' end
where status is null or status = '';

create index if not exists idx_profiles_role_level on profiles(role_level);
create index if not exists idx_profiles_facility on profiles(facility_id);
create index if not exists idx_profiles_department on profiles(department_id);
create index if not exists idx_profiles_status on profiles(status);
create index if not exists idx_profiles_created_by on profiles(created_by);

-- ============================================================
-- Drop function cũ admin_upsert_profile
-- (đã thay bằng API route /api/admin/create-user — không cần
-- user phải đăng ký /login trước nữa)
-- ============================================================
drop function if exists admin_upsert_profile(text, text, text, text, text, boolean);

notify pgrst, 'reload schema';
