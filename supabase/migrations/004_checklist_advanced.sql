-- ============================================================
-- Migration 004: Checklist nâng cao
-- ============================================================
-- - Templates: dept_id, shift_type, checklist_group, evidence_type,
--   deadline_time, reviewer_role_code, assigned_role_code
-- - Enum checklist_status: pending/in_progress/submitted/approved/
--   rejected/overdue/failed
-- - Bảng mới checklist_instances (1 dòng / template / người / ngày)
--   với reviewer + status flow
-- - checklist_logs liên kết instance_id
-- ============================================================

-- ----- 1. Extend templates -----
alter table checklist_templates
  add column if not exists department_id text references departments(id),
  add column if not exists shift_type text,
  add column if not exists checklist_group text,
  add column if not exists evidence_type text default 'none',
  add column if not exists deadline_time time,
  add column if not exists reviewer_role_code text references roles(code),
  add column if not exists assigned_role_code text references roles(code);

alter table checklist_templates drop constraint if exists checklist_templates_shift_check;
alter table checklist_templates
  add constraint checklist_templates_shift_check
  check (shift_type is null or shift_type in ('morning','afternoon','evening','night','allday'));

alter table checklist_templates drop constraint if exists checklist_templates_evidence_check;
alter table checklist_templates
  add constraint checklist_templates_evidence_check
  check (evidence_type in ('none','photo','signature','file','note'));

-- ----- 2. Enum status -----
do $$ begin
  create type checklist_status as enum (
    'pending','in_progress','submitted','approved','rejected','overdue','failed'
  );
exception when duplicate_object then null;
end $$;

-- ----- 3. Bảng instances -----
create table if not exists checklist_instances (
  id uuid primary key default uuid_generate_v4(),
  template_id uuid references checklist_templates(id) on delete cascade not null,
  assigned_to uuid references profiles(id) on delete set null,
  reviewer_id uuid references profiles(id) on delete set null,
  facility_id text references facilities(id),
  department_id text references departments(id),
  date date not null default current_date,
  shift_type text,
  deadline_at timestamptz,
  status checklist_status default 'pending',
  submitted_at timestamptz,
  reviewed_at timestamptz,
  review_note text,
  evidence_urls text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(template_id, assigned_to, date, coalesce(shift_type, 'allday'))
);

create index if not exists idx_inst_assigned_date on checklist_instances(assigned_to, date);
create index if not exists idx_inst_reviewer_status on checklist_instances(reviewer_id, status);
create index if not exists idx_inst_facility_status on checklist_instances(facility_id, status);
create index if not exists idx_inst_dept_status on checklist_instances(department_id, status);
create index if not exists idx_inst_status_deadline on checklist_instances(status, deadline_at);

-- ----- 4. logs liên kết instance -----
alter table checklist_logs
  add column if not exists instance_id uuid references checklist_instances(id) on delete cascade;
create index if not exists idx_checklist_logs_instance on checklist_logs(instance_id);

-- ----- 5. Auto-update updated_at -----
create or replace function checklist_instances_touch_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_inst_updated_at on checklist_instances;
create trigger trg_inst_updated_at before update on checklist_instances
  for each row execute function checklist_instances_touch_updated_at();

-- ----- 6. RLS instances -----
alter table checklist_instances enable row level security;

drop policy if exists "Inst: read scope" on checklist_instances;
drop policy if exists "Inst: assignee write" on checklist_instances;
drop policy if exists "Inst: reviewer review" on checklist_instances;
drop policy if exists "Inst: admin all" on checklist_instances;

-- Đọc: bản thân là người làm / người duyệt / QLCS cùng cơ sở / GĐ-CEO
create policy "Inst: read scope" on checklist_instances for select using (
  assigned_to = auth.uid()
  or reviewer_id = auth.uid()
  or current_user_role() in ('CEO','GD_KD','GD_VP','TP_GS','TP_NS')
  or (current_user_role() like 'QLCS\_%' escape '\' and facility_id = current_user_facility())
);

-- Người được giao: tạo + update status của instance mình
create policy "Inst: assignee write" on checklist_instances for all using (
  assigned_to = auth.uid()
) with check (
  assigned_to = auth.uid()
);

-- Người duyệt: update để approve/reject
create policy "Inst: reviewer review" on checklist_instances for update using (
  reviewer_id = auth.uid()
);

-- GĐ/CEO toàn quyền
create policy "Inst: admin all" on checklist_instances for all using (
  current_user_role() in ('CEO','GD_KD','GD_VP')
);

-- ----- 7. Cập nhật RLS logs cho phép người duyệt đọc -----
drop policy if exists "Logs: managers read" on checklist_logs;
create policy "Logs: managers read" on checklist_logs for select using (
  current_user_role() in ('CEO','GD_KD','GD_VP','TP_GS','TP_NS')
  or current_user_role() like 'QLCS\_%' escape '\'
  or exists (
    select 1 from checklist_instances i
    where i.id = checklist_logs.instance_id
      and (i.assigned_to = auth.uid() or i.reviewer_id = auth.uid())
  )
);

-- ============================================================
-- VERIFY
-- ============================================================
do $$
declare
  cols int;
begin
  select count(*) into cols from information_schema.columns
  where table_name = 'checklist_templates'
    and column_name in ('department_id','shift_type','checklist_group','evidence_type','deadline_time','reviewer_role_code','assigned_role_code');
  raise notice 'Migration 004 đã thêm % cột mới vào checklist_templates (kỳ vọng 7)', cols;
end$$;

notify pgrst, 'reload schema';
