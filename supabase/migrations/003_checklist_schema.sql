-- ============================================================
-- Migration 003: RLS + index cho Checklist (không thêm cột mới)
-- ============================================================
-- Schema gốc giữ nguyên: id, role_label, block_id, active, created_at
-- - Index cho query nhanh
-- - RLS: GĐ Khối CRUD template khối mình, NV ghi log của mình
-- - Profile RLS: cho phép self-insert/update
-- ============================================================

create index if not exists idx_checklist_templates_role on checklist_templates(role_label);
create index if not exists idx_checklist_logs_lookup on checklist_logs(user_id, date_completed);
create index if not exists idx_checklist_logs_template_date on checklist_logs(template_id, date_completed);

alter table checklist_items enable row level security;
alter table checklist_logs enable row level security;

drop policy if exists "Templates: read all auth" on checklist_templates;
drop policy if exists "Templates: GD write own block" on checklist_templates;
drop policy if exists "Items: read all auth" on checklist_items;
drop policy if exists "Items: GD write own block" on checklist_items;
drop policy if exists "Logs: self write" on checklist_logs;
drop policy if exists "Logs: managers read" on checklist_logs;

create policy "Templates: read all auth" on checklist_templates
  for select using (auth.uid() is not null);

create policy "Templates: GD write own block" on checklist_templates
  for all using (
    current_user_role() = 'CEO'
    or (current_user_role() = 'GD_KD' and block_id = 'KD')
    or (current_user_role() = 'GD_VP' and block_id = 'VP')
  );

create policy "Items: read all auth" on checklist_items
  for select using (auth.uid() is not null);

create policy "Items: GD write own block" on checklist_items
  for all using (
    exists (
      select 1 from checklist_templates t
      where t.id = checklist_items.template_id
        and (
          current_user_role() = 'CEO'
          or (current_user_role() = 'GD_KD' and t.block_id = 'KD')
          or (current_user_role() = 'GD_VP' and t.block_id = 'VP')
        )
    )
  );

create policy "Logs: self write" on checklist_logs
  for all using (user_id = auth.uid());

create policy "Logs: managers read" on checklist_logs
  for select using (
    current_user_role() in ('CEO','GD_KD','GD_VP','TP_GS','TP_NS')
    or current_user_role() like 'QLCS\_%' escape '\'
  );

-- ============================================================
-- Profile RLS: cho phép self-insert + self-update
-- ============================================================
drop policy if exists "Profiles: self insert" on profiles;
drop policy if exists "Profiles: self update" on profiles;

create policy "Profiles: self insert" on profiles
  for insert with check (auth.uid() = id);

create policy "Profiles: self update" on profiles
  for update using (auth.uid() = id);

-- ============================================================
-- Seed: gán role CEO cho tài khoản trihuong815@gmail.com
-- (chỉ chạy lần đầu)
-- ============================================================
insert into profiles (id, full_name, email, role_code, is_probation, active)
select u.id, 'Trí Hướng', u.email, 'CEO', false, true
from auth.users u
where u.email = 'trihuong815@gmail.com'
on conflict (id) do update set
  role_code = excluded.role_code,
  full_name = excluded.full_name,
  active = true;
