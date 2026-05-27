-- ============================================================
-- Migration 018: Refactor checklist dashboard schema
-- ============================================================
-- Thêm các cột phục vụ giao diện dashboard checklist vận hành:
-- Cơ sở → Bộ phận → Ca/Chu kỳ → Checklist + panel chi tiết.
--
-- - Idempotent: tất cả ALTER dùng IF NOT EXISTS.
-- - Không xoá dữ liệu cũ, không archive trong migration này.
-- - Backfill các cột cache (tên cơ sở, tên bộ phận, tên người
--   được gán, tên người duyệt, account_type) từ dữ liệu hiện có.
-- - approved_by/approved_at thêm mới, backfill từ reviewer_id/
--   reviewed_at với status='approved' (giữ tương thích code cũ).
-- ============================================================

-- ---- 1. Thêm cột vào checklist_instances ----
alter table checklist_instances
  -- Cache tên CS/BP để render danh sách không cần JOIN
  add column if not exists facility_name text,
  add column if not exists department_name text,

  -- Phân nhóm checklist nghiệp vụ (an toàn-vệ sinh, lễ tân, KT...)
  add column if not exists checklist_group text,
  -- Nhóm chuyên môn (vd: KT_XLN, KT_HT, DT, MKT...) cho TP theo dõi
  add column if not exists specialty_group text,

  -- Ca làm việc dạng VN ("Ca sáng", "Ca chiều"), cache từ shift_type
  add column if not exists shift_label text,

  -- Người được gán: cache tên hiển thị (assigned_to có thể là shared_shift)
  add column if not exists assigned_display_name text,

  -- Ghi chú riêng cho người thực hiện thực tế (khác general_note)
  add column if not exists actual_operator_note text,

  -- Cache reviewer
  add column if not exists reviewer_name text,
  add column if not exists reviewer_role text,

  -- Theo dõi chuyên môn (TP/PP department) — không duyệt thay QLCS
  add column if not exists functional_reviewer_id uuid references profiles(id) on delete set null,
  add column if not exists functional_reviewer_name text,
  add column if not exists functional_reviewer_role text,

  -- Người submit thực tế (user đăng nhập). assigned_to có thể là account chung.
  add column if not exists submitted_by uuid references profiles(id) on delete set null,

  -- Người duyệt thực tế (user đăng nhập, không phải role). reviewer_id là dự kiến.
  add column if not exists approved_by uuid references profiles(id) on delete set null,
  add column if not exists approved_at timestamptz,

  -- Loại tài khoản đã submit: personal | shared_shift | qlcs
  add column if not exists account_type text;

-- ---- 2. Constraint cho account_type (chỉ nhận giá trị hợp lệ) ----
alter table checklist_instances drop constraint if exists checklist_instances_account_type_check;
alter table checklist_instances
  add constraint checklist_instances_account_type_check
  check (account_type is null or account_type in ('personal','shared_shift','qlcs'));

-- ---- 3. Index phục vụ filter & dashboard ----
create index if not exists idx_inst_checklist_group on checklist_instances(checklist_group);
create index if not exists idx_inst_specialty_group on checklist_instances(specialty_group);
create index if not exists idx_inst_functional_reviewer on checklist_instances(functional_reviewer_id)
  where functional_reviewer_id is not null;
create index if not exists idx_inst_approved_by on checklist_instances(approved_by)
  where approved_by is not null;
create index if not exists idx_inst_submitted_by on checklist_instances(submitted_by)
  where submitted_by is not null;
create index if not exists idx_inst_account_type on checklist_instances(account_type)
  where account_type is not null;

-- ---- 4. Backfill cache tên cơ sở ----
update checklist_instances i
set facility_name = f.name
from facilities f
where i.facility_id = f.id and (i.facility_name is null or i.facility_name = '');

-- ---- 5. Backfill cache tên bộ phận ----
update checklist_instances i
set department_name = d.name
from departments d
where i.department_id = d.id and (i.department_name is null or i.department_name = '');

-- ---- 6. Backfill shift_label từ shift_type ----
update checklist_instances
set shift_label = case shift_type
    when 'morning'   then 'Ca sáng'
    when 'afternoon' then 'Ca chiều'
    when 'evening'   then 'Ca tối'
    when 'night'     then 'Ca đêm'
    when 'allday'    then 'Cả ngày'
    else null
  end
where shift_label is null and shift_type is not null;

-- ---- 7. Backfill checklist_group từ template (nếu template có) ----
update checklist_instances i
set checklist_group = t.checklist_group
from checklist_templates t
where i.template_id = t.id
  and (i.checklist_group is null or i.checklist_group = '')
  and t.checklist_group is not null;

-- ---- 8. Backfill assigned_display_name từ profile ----
update checklist_instances i
set assigned_display_name = p.full_name
from profiles p
where i.assigned_to = p.id and (i.assigned_display_name is null or i.assigned_display_name = '');

-- ---- 9. Backfill reviewer_name / reviewer_role từ profile + roles ----
update checklist_instances i
set
  reviewer_name = p.full_name,
  reviewer_role = coalesce(r.name, p.role_code)
from profiles p
left join roles r on r.code = p.role_code
where i.reviewer_id = p.id
  and (i.reviewer_name is null or i.reviewer_name = '');

-- ---- 10. Backfill approved_by / approved_at từ reviewer + reviewed_at ----
-- Với các instance đã 'approved' trong quá khứ, coi reviewer là người duyệt.
update checklist_instances
set
  approved_by = reviewer_id,
  approved_at = reviewed_at
where status = 'approved'
  and approved_by is null
  and reviewer_id is not null;

-- ---- 11. Backfill account_type ----
-- 'shared_shift' nếu profile có is_shared_shift_account = true,
-- 'qlcs' nếu role_code khớp QLCS_*, mặc định 'personal'.
update checklist_instances i
set account_type = case
    when p.is_shared_shift_account = true then 'shared_shift'
    when p.role_code like 'QLCS\_%' escape '\' then 'qlcs'
    else 'personal'
  end
from profiles p
where i.assigned_to = p.id and i.account_type is null;

-- ---- 12. Reload PostgREST schema cache ----
notify pgrst, 'reload schema';

-- ---- 13. Sanity check ----
do $$
declare
  total int;
  with_facility int;
  with_group int;
  with_account int;
begin
  select count(*) into total from checklist_instances;
  select count(*) into with_facility from checklist_instances where facility_name is not null;
  select count(*) into with_group    from checklist_instances where checklist_group is not null;
  select count(*) into with_account  from checklist_instances where account_type is not null;
  raise notice
    'Migration 018 — instances: % | có facility_name: % | có checklist_group: % | có account_type: %',
    total, with_facility, with_group, with_account;
end$$;
