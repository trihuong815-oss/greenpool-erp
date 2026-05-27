-- ============================================================
-- Migration 019: Bảng audit log cho checklist
-- ============================================================
-- Ghi nhận mọi hành động write quan trọng lên checklist_instances:
-- submit, approve, reject, upload_file, remove_file.
--
-- Idempotent: IF NOT EXISTS / DROP IF EXISTS cho policy.
-- ============================================================

create table if not exists checklist_audit_log (
  id          uuid primary key default uuid_generate_v4(),
  instance_id uuid not null references checklist_instances(id) on delete cascade,
  action      text not null,
  actor_id    uuid references profiles(id) on delete set null,
  actor_name  text,
  actor_role  text,
  details     jsonb,
  created_at  timestamptz default now(),
  constraint checklist_audit_log_action_check
    check (action in ('submit','approve','reject','upload_file','remove_file','reopen','password_reset'))
);

create index if not exists idx_audit_instance on checklist_audit_log(instance_id, created_at desc);
create index if not exists idx_audit_actor    on checklist_audit_log(actor_id, created_at desc)
  where actor_id is not null;
create index if not exists idx_audit_action   on checklist_audit_log(action, created_at desc);

-- ---- RLS ----
alter table checklist_audit_log enable row level security;

drop policy if exists "Audit: read scope"   on checklist_audit_log;
drop policy if exists "Audit: insert actor" on checklist_audit_log;
drop policy if exists "Audit: admin all"    on checklist_audit_log;

-- Đọc: cùng phạm vi như checklist_instances (qua subquery)
create policy "Audit: read scope" on checklist_audit_log for select using (
  exists (
    select 1 from checklist_instances i
    where i.id = checklist_audit_log.instance_id
      and (
        i.assigned_to = auth.uid()
        or i.reviewer_id = auth.uid()
        or i.facility_id in (select facility_id from profiles where id = auth.uid())
        or i.department_id in (select department_id from profiles where id = auth.uid())
        or exists (select 1 from profiles
                    where id = auth.uid()
                      and role_code in ('CEO','GD_KD','GD_VP'))
      )
  )
);

-- Insert: chỉ user đăng nhập + actor_id phải khớp auth.uid (chặn giả mạo actor).
create policy "Audit: insert actor" on checklist_audit_log for insert with check (
  auth.uid() is not null and (actor_id is null or actor_id = auth.uid())
);

-- Admin có thể đọc tất cả audit (kể cả instance đã bị xoá soft-delete sau này)
create policy "Audit: admin all" on checklist_audit_log for select using (
  exists (select 1 from profiles
           where id = auth.uid()
             and role_code in ('CEO','GD_KD','GD_VP'))
);

-- ---- Reload PostgREST schema cache ----
notify pgrst, 'reload schema';

-- ---- Sanity check ----
do $$
declare
  cnt int;
begin
  select count(*) into cnt from checklist_audit_log;
  raise notice 'Migration 019 — checklist_audit_log: % rows (lần đầu chạy: 0)', cnt;
end$$;
