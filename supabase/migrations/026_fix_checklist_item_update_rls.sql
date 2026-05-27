-- ============================================================
-- 026_fix_checklist_item_update_rls.sql
-- Mở rộng RLS cho checklist_instance_items để Admin/CEO, QLCS,
-- người được giao và shared_shift account đều có thể tick/uncheck
-- đúng phạm vi của mình.
--
-- Nguyên tắc:
-- - Admin/CEO/GĐ Khối: được tick mọi instance (test, hỗ trợ vận hành).
-- - QLCS_xxx: được tick instance trong cơ sở mình quản lý.
-- - Người được giao (assigned_to = self): được tick instance của mình.
-- - shared_shift account: chỉ tick instance khớp 3 chiều
--   facility_id + department_id + shift_type với profile.
-- - Khoá tick/uncheck khi status ∈ (submitted, approved, failed).
-- - Audit log không bị ảnh hưởng — actor_id luôn = auth.uid().
-- - Không public update; không xoá RLS đang bảo vệ.
-- ============================================================

-- ---- 1. Dọn policy cũ ----
drop policy if exists "InstItems: assignee write" on checklist_instance_items;
drop policy if exists "InstItems: admin all"      on checklist_instance_items;
drop policy if exists "InstItems: write scope"    on checklist_instance_items;
drop policy if exists "InstItems: update scope"   on checklist_instance_items;
drop policy if exists "InstItems: insert scope"   on checklist_instance_items;
drop policy if exists "InstItems: delete admin"   on checklist_instance_items;

-- ---- 2. UPDATE: tick/uncheck item, ghi note, gắn file_urls ----
-- Áp dụng cho mọi role có scope; KHÔNG cho update nếu instance đã
-- bị khoá (submitted/approved/failed).
create policy "InstItems: update scope" on checklist_instance_items
  for update
  using (
    exists (
      select 1 from checklist_instances i
      where i.id = checklist_instance_items.instance_id
        and i.status not in ('submitted','approved','failed')
        and (
          current_user_role() in ('CEO','GD_KD','GD_VP')
          or (current_user_role() like 'QLCS\_%' escape '\'
              and i.facility_id = current_user_facility())
          or i.assigned_to = auth.uid()
          or exists (
            select 1 from profiles p
            where p.id = auth.uid()
              and p.is_shared_shift_account = true
              and i.facility_id   = p.facility_id
              and i.department_id = p.department_id
              and i.shift_type    = p.shift_assignment
          )
        )
    )
  )
  with check (
    exists (
      select 1 from checklist_instances i
      where i.id = checklist_instance_items.instance_id
        and i.status not in ('submitted','approved','failed')
        and (
          current_user_role() in ('CEO','GD_KD','GD_VP')
          or (current_user_role() like 'QLCS\_%' escape '\'
              and i.facility_id = current_user_facility())
          or i.assigned_to = auth.uid()
          or exists (
            select 1 from profiles p
            where p.id = auth.uid()
              and p.is_shared_shift_account = true
              and i.facility_id   = p.facility_id
              and i.department_id = p.department_id
              and i.shift_type    = p.shift_assignment
          )
        )
    )
  );

-- ---- 3. INSERT: auto-seed item khi vừa tạo instance ----
-- Không cần check status (luôn 'pending' khi seed), chỉ check scope.
create policy "InstItems: insert scope" on checklist_instance_items
  for insert
  with check (
    exists (
      select 1 from checklist_instances i
      where i.id = checklist_instance_items.instance_id
        and (
          current_user_role() in ('CEO','GD_KD','GD_VP')
          or (current_user_role() like 'QLCS\_%' escape '\'
              and i.facility_id = current_user_facility())
          or i.assigned_to = auth.uid()
          or exists (
            select 1 from profiles p
            where p.id = auth.uid()
              and p.is_shared_shift_account = true
              and i.facility_id   = p.facility_id
              and i.department_id = p.department_id
              and i.shift_type    = p.shift_assignment
          )
        )
    )
  );

-- ---- 4. DELETE: chỉ admin để dọn dữ liệu sai ----
create policy "InstItems: delete admin" on checklist_instance_items
  for delete
  using (current_user_role() in ('CEO','GD_KD','GD_VP'));

-- ---- 5. Reload schema cache PostgREST ----
notify pgrst, 'reload schema';

-- ---- Sanity check ----
do $$
declare
  pol_cnt int;
begin
  select count(*) into pol_cnt
  from pg_policies
  where schemaname = 'public'
    and tablename = 'checklist_instance_items'
    and policyname in (
      'InstItems: read scope',
      'InstItems: update scope',
      'InstItems: insert scope',
      'InstItems: delete admin'
    );
  raise notice '[026] checklist_instance_items policies hiện có: % / 4 (kỳ vọng read + update + insert + delete)', pol_cnt;
end$$;
