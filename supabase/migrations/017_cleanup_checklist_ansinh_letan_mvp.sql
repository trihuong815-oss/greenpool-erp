-- ============================================================
-- Migration 017: MVP Checklist cho An sinh + Lễ tân
-- ============================================================
-- - Thêm 2 bộ phận: AS (An sinh), LT (Lễ tân)
-- - Thêm profile.shift_assignment + is_shared_shift_account
-- - Archive (active=false) tất cả template cũ Cứu hộ + An sinh/Lễ tân dup từ 011
-- - Seed 6 template MVP chuẩn: 4 nhóm (AS/LT × sáng/chiều)
--   với items theo nhóm Cứu hộ an toàn / Vệ sinh / Sự cố / Bàn giao
-- - KHÔNG xoá data cũ
-- ============================================================

-- ---- 1. Departments AS + LT ----
insert into departments (id, name, block_id, color) values
  ('AS', 'An sinh', 'KD', '#0ea5e9'),
  ('LT', 'Lễ tân',  'KD', '#8b5cf6')
on conflict (id) do nothing;

-- ---- 2. Profile shift_assignment + shared_shift flag ----
alter table profiles
  add column if not exists shift_assignment text,
  add column if not exists is_shared_shift_account boolean default false;

alter table profiles drop constraint if exists profiles_shift_check;
alter table profiles
  add constraint profiles_shift_check
  check (shift_assignment is null or shift_assignment in ('morning','afternoon','evening','night'));

create index if not exists idx_profiles_shift on profiles(shift_assignment, department_id);
create index if not exists idx_profiles_shared on profiles(is_shared_shift_account) where is_shared_shift_account = true;

-- ---- 3. Archive template cũ không hợp MVP ----
-- Gồm: Cứu hộ (NV_CH) + An sinh/Lễ tân từ migration 011 (chưa có dept_id)
update checklist_templates
set active = false
where (
  -- Cứu hộ: bất kỳ template gắn NV_CH
  assigned_role_code = 'NV_CH'
  or role_label = 'NV Cứu hộ'
  -- An sinh/Lễ tân cũ: chưa gắn department_id AS/LT
  or (assigned_role_code = 'NV_AS' and (department_id is null or department_id != 'AS'))
  or (assigned_role_code = 'NV_LT' and (department_id is null or department_id != 'LT'))
)
and active = true;

-- ---- 4. Seed 6 template MVP ----
do $$
declare
  tpl_id uuid;
begin
  -- (1) An sinh - Ca sáng - Đầu ca
  if not exists (
    select 1 from checklist_templates
    where department_id = 'AS' and shift_type = 'morning' and checklist_type = 'opening' and active = true
  ) then
    insert into checklist_templates (
      name, role_label, block_id, active,
      department_id, checklist_type, shift_type, facility_scope,
      scheduled_time, deadline_time, checklist_group, evidence_type, assigned_role_code
    ) values (
      'Bộ phận An sinh - Ca sáng', 'An sinh', 'KD', true,
      'AS', 'opening', 'morning', 'all',
      '05:30', '05:45', 'An toàn vận hành', 'photo', null
    ) returning id into tpl_id;

    insert into checklist_template_items (template_id, content, sort_order, is_required, requires_file, requires_note) values
      (tpl_id, '[Cứu hộ] Có mặt đúng giờ, mặc đồng phục, đeo phương tiện', 1, true, false, false),
      (tpl_id, '[Cứu hộ] Kiểm tra phao cứu sinh, dây cứu hộ',              2, true, true,  false),
      (tpl_id, '[Cứu hộ] Kiểm tra sào cứu hộ / móc cứu hộ',                3, true, true,  false),
      (tpl_id, '[Cứu hộ] Kiểm tra khu vực bể, độ trong nước',              4, true, true,  false),
      (tpl_id, '[Vệ sinh] Vệ sinh khu vực bể, lối đi',                      5, true, false, false),
      (tpl_id, '[Vệ sinh] Vệ sinh nhà vệ sinh, phòng thay đồ',              6, true, false, false),
      (tpl_id, '[Vệ sinh] Kiểm tra dụng cụ vệ sinh, hoá chất',              7, true, false, false),
      (tpl_id, '[An toàn] Đứng đúng vị trí quan sát trong ca',              8, true, false, false),
      (tpl_id, '[Sự cố] Báo cáo bất thường nếu có',                         9, false, false, true);
  end if;

  -- (2) An sinh - Ca chiều - Giao ca
  if not exists (
    select 1 from checklist_templates
    where department_id = 'AS' and shift_type = 'afternoon' and checklist_type = 'handover' and active = true
  ) then
    insert into checklist_templates (
      name, role_label, block_id, active,
      department_id, checklist_type, shift_type, facility_scope,
      scheduled_time, deadline_time, checklist_group, evidence_type, assigned_role_code
    ) values (
      'Bộ phận An sinh - Ca chiều', 'An sinh', 'KD', true,
      'AS', 'handover', 'afternoon', 'all',
      '13:30', '13:45', 'Bàn giao', 'none', null
    ) returning id into tpl_id;

    insert into checklist_template_items (template_id, content, sort_order, is_required, requires_file, requires_note) values
      (tpl_id, '[Bàn giao] Bàn giao tình trạng khách trong hồ',             1, true,  false, true),
      (tpl_id, '[Bàn giao] Bàn giao thiết bị cứu hộ',                       2, true,  false, false),
      (tpl_id, '[Bàn giao] Bàn giao tình trạng vệ sinh',                    3, true,  false, false),
      (tpl_id, '[Bàn giao] Bàn giao sự cố / phản ánh',                      4, true,  false, true),
      (tpl_id, '[Sự cố] Ghi nhận sự cố nếu có',                             5, false, false, true);
  end if;

  -- (3) An sinh - Ca chiều - Cuối ca
  if not exists (
    select 1 from checklist_templates
    where department_id = 'AS' and shift_type = 'afternoon' and checklist_type = 'closing' and active = true
  ) then
    insert into checklist_templates (
      name, role_label, block_id, active,
      department_id, checklist_type, shift_type, facility_scope,
      scheduled_time, deadline_time, checklist_group, evidence_type, assigned_role_code
    ) values (
      'Bộ phận An sinh - Ca chiều', 'An sinh', 'KD', true,
      'AS', 'closing', 'afternoon', 'all',
      '21:30', '21:45', 'Báo cáo cuối ca', 'photo', null
    ) returning id into tpl_id;

    insert into checklist_template_items (template_id, content, sort_order, is_required, requires_file, requires_note) values
      (tpl_id, '[Cứu hộ] Kiểm tra trang thiết bị cứu hộ cuối ca',           1, true,  true,  false),
      (tpl_id, '[Vệ sinh] Tổng vệ sinh cuối ca',                            2, true,  true,  false),
      (tpl_id, '[Vệ sinh] Khoá kho, tắt thiết bị',                          3, true,  false, false),
      (tpl_id, '[Sự cố] Ghi nhận sự cố / phản ánh',                         4, false, false, true),
      (tpl_id, '[Bàn giao] Bàn giao cuối ca cho người kế tiếp',             5, true,  false, true);
  end if;

  -- (4) Lễ tân - Ca sáng - Đầu ca
  if not exists (
    select 1 from checklist_templates
    where department_id = 'LT' and shift_type = 'morning' and checklist_type = 'opening' and active = true
  ) then
    insert into checklist_templates (
      name, role_label, block_id, active,
      department_id, checklist_type, shift_type, facility_scope,
      scheduled_time, deadline_time, checklist_group, evidence_type, assigned_role_code
    ) values (
      'Bộ phận Lễ tân - Ca sáng', 'Lễ tân', 'KD', true,
      'LT', 'opening', 'morning', 'all',
      '05:30', '05:45', 'Vận hành', 'none', null
    ) returning id into tpl_id;

    insert into checklist_template_items (template_id, content, sort_order, is_required, requires_file, requires_note) values
      (tpl_id, 'Mở quầy lễ tân',                                            1, true,  false, false),
      (tpl_id, 'Kiểm tra khu vực quầy sạch sẽ',                             2, true,  false, false),
      (tpl_id, 'Kiểm tra máy POS / thiết bị thanh toán',                    3, true,  false, false),
      (tpl_id, 'Kiểm tra danh sách khách / lịch học trong ngày',            4, true,  false, false),
      (tpl_id, 'Kiểm tra tiền quỹ đầu ca nếu có',                           5, false, false, true),
      (tpl_id, 'Báo cáo vấn đề phát sinh nếu có',                           6, false, false, true);
  end if;

  -- (5) Lễ tân - Ca chiều - Giao ca
  if not exists (
    select 1 from checklist_templates
    where department_id = 'LT' and shift_type = 'afternoon' and checklist_type = 'handover' and active = true
  ) then
    insert into checklist_templates (
      name, role_label, block_id, active,
      department_id, checklist_type, shift_type, facility_scope,
      scheduled_time, deadline_time, checklist_group, evidence_type, assigned_role_code
    ) values (
      'Bộ phận Lễ tân - Ca chiều', 'Lễ tân', 'KD', true,
      'LT', 'handover', 'afternoon', 'all',
      '13:30', '13:45', 'Bàn giao', 'none', null
    ) returning id into tpl_id;

    insert into checklist_template_items (template_id, content, sort_order, is_required, requires_file, requires_note) values
      (tpl_id, 'Bàn giao tình trạng khách',                                 1, true,  false, false),
      (tpl_id, 'Bàn giao sự cố / phản ánh',                                 2, true,  false, true),
      (tpl_id, 'Bàn giao tiền / quỹ / chứng từ nếu có',                     3, false, false, true),
      (tpl_id, 'Bàn giao nhiệm vụ chưa hoàn thành',                         4, false, false, true);
  end if;

  -- (6) Lễ tân - Ca chiều - Cuối ca
  if not exists (
    select 1 from checklist_templates
    where department_id = 'LT' and shift_type = 'afternoon' and checklist_type = 'closing' and active = true
  ) then
    insert into checklist_templates (
      name, role_label, block_id, active,
      department_id, checklist_type, shift_type, facility_scope,
      scheduled_time, deadline_time, checklist_group, evidence_type, assigned_role_code
    ) values (
      'Bộ phận Lễ tân - Ca chiều', 'Lễ tân', 'KD', true,
      'LT', 'closing', 'afternoon', 'all',
      '21:30', '21:45', 'Báo cáo cuối ca', 'none', null
    ) returning id into tpl_id;

    insert into checklist_template_items (template_id, content, sort_order, is_required, requires_file, requires_note) values
      (tpl_id, 'Tổng hợp cuối ngày',                                        1, true,  false, true),
      (tpl_id, 'Đối soát thông tin',                                        2, true,  false, false),
      (tpl_id, 'Ghi chú sự cố',                                             3, false, false, true),
      (tpl_id, 'Gửi báo cáo cấp trên',                                      4, true,  false, false);
  end if;
end$$;

-- ---- 5. RLS bảo vệ shared_shift account ----
-- Shared shift account không được tự update profile của mình
drop policy if exists "Profiles: self update" on profiles;
create policy "Profiles: self update" on profiles
  for update using (
    auth.uid() = id
    and (is_shared_shift_account is null or is_shared_shift_account = false)
  );

notify pgrst, 'reload schema';
