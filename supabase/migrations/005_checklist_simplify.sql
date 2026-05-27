-- ============================================================
-- Migration 005: Đơn giản hoá Checklist
-- ============================================================
-- - Thêm cột incident_report vào instances (báo cáo sự cố)
-- - Mở rộng quyền quản lý template: QLCS + TP cùng được sửa
-- ============================================================

alter table checklist_instances
  add column if not exists incident_report text;

-- Lấy department_id của user hiện tại từ role mapping
create or replace function current_user_dept() returns text as $$
  select roles.dept_id from roles
  where roles.code = (select profiles.role_code from profiles where profiles.id = auth.uid())
$$ language sql security definer;

-- Lấy block_id của user
create or replace function current_user_block() returns text as $$
  select roles.block_id from roles
  where roles.code = (select profiles.role_code from profiles where profiles.id = auth.uid())
$$ language sql security definer;

-- ----- Mở rộng RLS template: QLCS/TP/GĐ/CEO đều quản lý được -----
drop policy if exists "Templates: GD write own block" on checklist_templates;
drop policy if exists "Templates: managers write" on checklist_templates;

create policy "Templates: managers write" on checklist_templates
  for all using (
    -- Admin
    current_user_role() in ('CEO','GD_KD','GD_VP')
    -- GĐ Khối tương ứng
    or (current_user_role() = 'GD_KD' and block_id = 'KD')
    or (current_user_role() = 'GD_VP' and block_id = 'VP')
    -- QLCS quản lý template trong khối KD (vận hành cơ sở)
    or (current_user_role() like 'QLCS\_%' escape '\' and block_id = 'KD')
    -- TP quản lý template phòng mình (department_id khớp)
    or (current_user_role() like 'TP\_%' escape '\' and department_id = current_user_dept())
  );

-- ----- Items: theo cùng nguyên tắc với template -----
drop policy if exists "Items: GD write own block" on checklist_items;
drop policy if exists "Items: managers write" on checklist_items;

create policy "Items: managers write" on checklist_items
  for all using (
    exists (
      select 1 from checklist_templates t
      where t.id = checklist_items.template_id
        and (
          current_user_role() in ('CEO','GD_KD','GD_VP')
          or (current_user_role() = 'GD_KD' and t.block_id = 'KD')
          or (current_user_role() = 'GD_VP' and t.block_id = 'VP')
          or (current_user_role() like 'QLCS\_%' escape '\' and t.block_id = 'KD')
          or (current_user_role() like 'TP\_%' escape '\' and t.department_id = current_user_dept())
        )
    )
  );

notify pgrst, 'reload schema';
