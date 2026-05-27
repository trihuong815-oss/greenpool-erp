-- ============================================================
-- Migration 011: Checklist động (dynamic templates)
-- ============================================================
-- - Thêm checklist_type, scheduled_time, facility_scope cho templates
-- - Thêm is_required, requires_note cho template_items + instance_items
-- - Thêm scheduled_at, checklist_type cho instances
-- - Trigger seed instance_items cập nhật để copy is_required/requires_note
-- - Add role NV_AS (NV An sinh) — chưa có
-- - Seed 4 template mẫu: An sinh + Lễ tân (đầu ca, giao ca, cuối ca)
-- ============================================================

-- ---- 1. Role NV_AS ----
insert into roles (code, name, tier, block_id, dept_id) values
  ('NV_AS', 'NV An sinh', 6, 'KD', null)
on conflict (code) do nothing;

-- ---- 2. Extend templates ----
alter table checklist_templates
  add column if not exists name text,
  add column if not exists checklist_type text default 'custom',
  add column if not exists scheduled_time time,
  add column if not exists facility_scope text default 'all';

alter table checklist_templates drop constraint if exists checklist_templates_type_check;
alter table checklist_templates
  add constraint checklist_templates_type_check
  check (checklist_type in ('opening','handover','closing','incident','custom'));

alter table checklist_templates drop constraint if exists checklist_templates_scope_check;
alter table checklist_templates
  add constraint checklist_templates_scope_check
  check (facility_scope in ('all','specific'));

create index if not exists idx_tpl_type on checklist_templates(checklist_type);
create index if not exists idx_tpl_scope on checklist_templates(facility_scope);

-- ---- 3. Extend template_items ----
alter table checklist_template_items
  add column if not exists is_required boolean default true,
  add column if not exists requires_note boolean default false;

-- ---- 4. Extend instances ----
alter table checklist_instances
  add column if not exists checklist_type text default 'custom',
  add column if not exists scheduled_at timestamptz;

create index if not exists idx_inst_type on checklist_instances(checklist_type);
create index if not exists idx_inst_scheduled on checklist_instances(scheduled_at);

-- ---- 5. Extend instance_items ----
alter table checklist_instance_items
  add column if not exists is_required boolean default true,
  add column if not exists requires_note boolean default false;

-- ---- 6. Update trigger seed instance_items để copy fields mới ----
create or replace function checklist_seed_instance_items() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into checklist_instance_items
    (instance_id, template_item_id, sort_order, content,
     requires_file, is_required, requires_note, is_checked)
  select
    new.id, ti.id, ti.sort_order, ti.content,
    coalesce(ti.requires_file, false),
    coalesce(ti.is_required, true),
    coalesce(ti.requires_note, false),
    false
  from checklist_template_items ti
  where ti.template_id = new.template_id
  on conflict (instance_id, template_item_id) do nothing;
  return new;
end;
$$;

-- ---- 7. Seed 4 template mẫu cho An sinh + Lễ tân ----
do $$
declare
  tpl_id uuid;
begin
  -- A. An sinh — Đầu ca sáng 05:30
  if not exists (
    select 1 from checklist_templates
    where assigned_role_code = 'NV_AS' and checklist_type = 'opening' and shift_type = 'morning'
  ) then
    insert into checklist_templates (
      name, role_label, block_id, active, assigned_role_code,
      checklist_type, shift_type, facility_scope, scheduled_time, deadline_time,
      checklist_group, evidence_type
    ) values (
      'An sinh — Đầu ca sáng', 'NV An sinh', 'KD', true, 'NV_AS',
      'opening', 'morning', 'all', '05:30', '05:45',
      'An toàn vận hành', 'none'
    ) returning id into tpl_id;

    insert into checklist_template_items (template_id, content, sort_order, is_required, requires_file, requires_note) values
      (tpl_id, 'Kiểm tra vị trí trực',                   1, true,  false, false),
      (tpl_id, 'Kiểm tra khu vực bể',                    2, true,  true,  false),
      (tpl_id, 'Kiểm tra nội quy / an toàn',             3, true,  false, false),
      (tpl_id, 'Kiểm tra dụng cụ hỗ trợ',                4, true,  false, false),
      (tpl_id, 'Báo cáo bất thường nếu có',              5, false, false, true);
  end if;

  -- B. Lễ tân — Đầu ca sáng 05:30
  if not exists (
    select 1 from checklist_templates
    where assigned_role_code = 'NV_LT' and checklist_type = 'opening' and shift_type = 'morning'
  ) then
    insert into checklist_templates (
      name, role_label, block_id, active, assigned_role_code,
      checklist_type, shift_type, facility_scope, scheduled_time, deadline_time,
      checklist_group, evidence_type
    ) values (
      'Lễ tân — Đầu ca sáng', 'NV Lễ tân', 'KD', true, 'NV_LT',
      'opening', 'morning', 'all', '05:30', '05:45',
      'Vận hành', 'none'
    ) returning id into tpl_id;

    insert into checklist_template_items (template_id, content, sort_order, is_required, requires_file, requires_note) values
      (tpl_id, 'Mở quầy lễ tân',                                       1, true,  false, false),
      (tpl_id, 'Kiểm tra khu vực quầy sạch sẽ',                        2, true,  false, false),
      (tpl_id, 'Kiểm tra máy POS / thiết bị thanh toán',               3, true,  false, false),
      (tpl_id, 'Kiểm tra danh sách khách / lịch học trong ngày',       4, true,  false, false),
      (tpl_id, 'Kiểm tra tiền quỹ đầu ca nếu có',                      5, false, false, true),
      (tpl_id, 'Báo cáo vấn đề phát sinh nếu có',                      6, false, false, true);
  end if;

  -- C. Lễ tân — Giao ca chiều 13:30
  if not exists (
    select 1 from checklist_templates
    where assigned_role_code = 'NV_LT' and checklist_type = 'handover' and shift_type = 'afternoon'
  ) then
    insert into checklist_templates (
      name, role_label, block_id, active, assigned_role_code,
      checklist_type, shift_type, facility_scope, scheduled_time, deadline_time,
      checklist_group, evidence_type
    ) values (
      'Lễ tân — Giao ca chiều', 'NV Lễ tân', 'KD', true, 'NV_LT',
      'handover', 'afternoon', 'all', '13:30', '13:45',
      'Bàn giao', 'none'
    ) returning id into tpl_id;

    insert into checklist_template_items (template_id, content, sort_order, is_required, requires_file, requires_note) values
      (tpl_id, 'Bàn giao tình trạng khách',                            1, true,  false, false),
      (tpl_id, 'Bàn giao sự cố / phản ánh',                            2, true,  false, true),
      (tpl_id, 'Bàn giao tiền / quỹ / chứng từ nếu có',                3, false, false, true),
      (tpl_id, 'Bàn giao nhiệm vụ chưa hoàn thành',                    4, false, false, true);
  end if;

  -- D. Lễ tân — Cuối ca 21:30
  if not exists (
    select 1 from checklist_templates
    where assigned_role_code = 'NV_LT' and checklist_type = 'closing'
  ) then
    insert into checklist_templates (
      name, role_label, block_id, active, assigned_role_code,
      checklist_type, shift_type, facility_scope, scheduled_time, deadline_time,
      checklist_group, evidence_type
    ) values (
      'Lễ tân — Cuối ca', 'NV Lễ tân', 'KD', true, 'NV_LT',
      'closing', 'evening', 'all', '21:30', '21:45',
      'Báo cáo cuối ca', 'none'
    ) returning id into tpl_id;

    insert into checklist_template_items (template_id, content, sort_order, is_required, requires_file, requires_note) values
      (tpl_id, 'Tổng hợp cuối ngày',                                   1, true,  false, true),
      (tpl_id, 'Đối soát thông tin',                                   2, true,  false, false),
      (tpl_id, 'Ghi chú sự cố',                                        3, false, false, true),
      (tpl_id, 'Gửi báo cáo cấp trên',                                 4, true,  false, false);
  end if;

  -- E. An sinh — Cuối ca 21:30 (bonus)
  if not exists (
    select 1 from checklist_templates
    where assigned_role_code = 'NV_AS' and checklist_type = 'closing'
  ) then
    insert into checklist_templates (
      name, role_label, block_id, active, assigned_role_code,
      checklist_type, shift_type, facility_scope, scheduled_time, deadline_time,
      checklist_group, evidence_type
    ) values (
      'An sinh — Cuối ca', 'NV An sinh', 'KD', true, 'NV_AS',
      'closing', 'evening', 'all', '21:30', '21:45',
      'Báo cáo cuối ca', 'none'
    ) returning id into tpl_id;

    insert into checklist_template_items (template_id, content, sort_order, is_required, requires_file, requires_note) values
      (tpl_id, 'Tổng hợp tình hình ca',                                1, true,  false, true),
      (tpl_id, 'Kiểm tra trang thiết bị cuối ca',                      2, true,  true,  false),
      (tpl_id, 'Ghi nhận sự cố / phản ánh',                            3, false, false, true),
      (tpl_id, 'Bàn giao cuối ca cho người kế tiếp',                   4, true,  false, false);
  end if;
end$$;

notify pgrst, 'reload schema';
