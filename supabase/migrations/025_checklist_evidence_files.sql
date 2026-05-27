-- ============================================================
-- 025_checklist_evidence_files.sql
-- Phase 5C: Storage RLS cho bằng chứng + auto-delete sau 7 ngày
-- ============================================================
-- 1) Bảng checklist_evidence_files
-- 2) RLS table + RLS storage.objects (bucket 'checklist-evidence')
-- 3) Bucket setup (idempotent, có fallback nếu phiên bản storage cũ)
-- 4) Cleanup function — đánh dấu deleted_at file quá hạn
-- 5) pg_cron schedule (tự bỏ qua nếu pg_cron chưa bật)
--
-- Lưu ý:
-- - SQL chỉ đánh dấu deleted_at; xoá object thực tế trong storage cần
--   Edge Function gọi storage admin API. Đã ghi TODO.
-- - Không expose SUPABASE_SERVICE_ROLE_KEY ra frontend (FE chỉ dùng anon).
-- ============================================================

-- ---- 1. Table ----
create table if not exists checklist_evidence_files (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references checklist_instances(id) on delete cascade,
  item_id uuid references checklist_instance_items(id) on delete set null,
  facility_id text references facilities(id),
  uploaded_by uuid references profiles(id) on delete set null,
  uploaded_by_name text,
  file_name text not null,
  file_path text not null unique,
  mime_type text,
  file_size bigint,
  created_at timestamptz default now(),
  expires_at timestamptz,
  deleted_at timestamptz
);

create index if not exists idx_evidence_instance on checklist_evidence_files(instance_id);
create index if not exists idx_evidence_item     on checklist_evidence_files(item_id)
  where item_id is not null;
create index if not exists idx_evidence_expires  on checklist_evidence_files(expires_at)
  where deleted_at is null;

-- ---- 2. Trigger set expires_at = created_at + 7 days ----
create or replace function checklist_evidence_set_expires_at()
returns trigger as $$
begin
  if new.expires_at is null then
    new.expires_at := coalesce(new.created_at, now()) + interval '7 days';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_evidence_set_expires on checklist_evidence_files;
create trigger trg_evidence_set_expires before insert on checklist_evidence_files
  for each row execute function checklist_evidence_set_expires_at();

-- ---- 3. RLS table ----
alter table checklist_evidence_files enable row level security;

drop policy if exists "Evidence: read scope"        on checklist_evidence_files;
drop policy if exists "Evidence: insert by writer"  on checklist_evidence_files;
drop policy if exists "Evidence: admin all"         on checklist_evidence_files;

create policy "Evidence: read scope" on checklist_evidence_files for select using (
  exists (
    select 1 from checklist_instances i
    where i.id = checklist_evidence_files.instance_id
      and (
        i.assigned_to = auth.uid()
        or i.reviewer_id = auth.uid()
        or i.facility_id in (select facility_id from profiles where id = auth.uid())
        or i.department_id in (select department_id from profiles where id = auth.uid())
        or exists (select 1 from profiles where id = auth.uid() and role_code in ('CEO','GD_KD','GD_VP'))
      )
  )
);

-- Insert: phải có quyền write trên instance, và actor = current user
create policy "Evidence: insert by writer" on checklist_evidence_files for insert with check (
  uploaded_by = auth.uid()
  and exists (
    select 1 from checklist_instances i
    where i.id = checklist_evidence_files.instance_id
      and (
        i.assigned_to = auth.uid()
        or exists (
          select 1 from profiles p
          where p.id = auth.uid()
            and (p.role_code in ('CEO','GD_KD','GD_VP')
                 or (p.role_code like 'QLCS\_%' escape '\' and p.facility_id = i.facility_id))
        )
      )
  )
);

-- Admin có thể xem tất cả (kể cả deleted)
create policy "Evidence: admin all" on checklist_evidence_files for select using (
  exists (select 1 from profiles where id = auth.uid() and role_code in ('CEO','GD_KD','GD_VP'))
);

-- ---- 4. Bucket setup ----
-- Path quy định: {facility_id}/{instance_id}/{item_id}/{timestamp}_{filename}
do $$
begin
  begin
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'checklist-evidence', 'checklist-evidence', false,
      10485760,
      array['image/jpeg','image/png','image/webp','application/pdf']
    )
    on conflict (id) do update set
      public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
    raise notice '[025] Bucket checklist-evidence: public=false, limit=10MB, MIME whitelist.';
  exception when undefined_column or undefined_table then
    -- Storage version cũ không có cột file_size_limit/allowed_mime_types
    begin
      insert into storage.buckets (id, name, public)
      values ('checklist-evidence', 'checklist-evidence', false)
      on conflict (id) do nothing;
      raise notice '[025] Bucket checklist-evidence tạo cơ bản. Set giới hạn size/MIME từ Dashboard.';
    exception when insufficient_privilege then
      raise notice '[025] Không đủ quyền tạo bucket qua SQL. Tạo thủ công ở Dashboard > Storage > New bucket.';
    end;
  when insufficient_privilege then
    raise notice '[025] Không đủ quyền insert storage.buckets. Tạo thủ công ở Dashboard.';
  end;
end$$;

-- ---- 5. RLS storage.objects cho bucket checklist-evidence ----
-- Path mới: {facility_id}/{instance_id}/{item_id}/{ts}_{filename}
-- Path cũ:  {instance_id}/{item_id}/{ts}.{ext}  ← hỗ trợ để xem lại file đã upload trước
drop policy if exists "Evidence storage: read scope"     on storage.objects;
drop policy if exists "Evidence storage: insert by user" on storage.objects;
drop policy if exists "Evidence storage: delete admin"   on storage.objects;

create policy "Evidence storage: read scope" on storage.objects for select using (
  bucket_id = 'checklist-evidence'
  and (
    -- Path mới
    exists (
      select 1 from checklist_instances i
      where i.id::text = split_part(name, '/', 2)
        and (
          i.assigned_to = auth.uid()
          or i.reviewer_id = auth.uid()
          or i.facility_id in (select facility_id from profiles where id = auth.uid())
          or i.department_id in (select department_id from profiles where id = auth.uid())
          or exists (select 1 from profiles where id = auth.uid() and role_code in ('CEO','GD_KD','GD_VP'))
        )
    )
    or
    -- Path cũ (backward-compat)
    exists (
      select 1 from checklist_instances i
      where i.id::text = split_part(name, '/', 1)
        and (
          i.assigned_to = auth.uid()
          or i.reviewer_id = auth.uid()
          or i.facility_id in (select facility_id from profiles where id = auth.uid())
          or i.department_id in (select department_id from profiles where id = auth.uid())
          or exists (select 1 from profiles where id = auth.uid() and role_code in ('CEO','GD_KD','GD_VP'))
        )
    )
  )
);

create policy "Evidence storage: insert by user" on storage.objects for insert with check (
  bucket_id = 'checklist-evidence'
  and auth.uid() is not null
);

create policy "Evidence storage: delete admin" on storage.objects for delete using (
  bucket_id = 'checklist-evidence'
  and (
    owner = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and role_code in ('CEO','GD_KD','GD_VP'))
  )
);

-- ---- 6. Cleanup function ----
-- Đánh dấu deleted_at cho mọi record quá hạn.
-- Việc xoá object thực tế trên storage không thể thực hiện an toàn từ SQL.
-- TODO: triển khai Edge Function gọi storage admin API để xoá object
-- với danh sách (file_path) lấy từ checklist_evidence_files WHERE deleted_at IS NOT NULL.
create or replace function checklist_evidence_cleanup_expired()
returns int as $$
declare
  cnt int;
begin
  update checklist_evidence_files
  set deleted_at = now()
  where deleted_at is null
    and expires_at < now();
  get diagnostics cnt = row_count;
  return cnt;
end;
$$ language plpgsql security definer;

-- ---- 7. pg_cron schedule (graceful: bỏ qua nếu extension chưa bật) ----
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('checklist-evidence-cleanup');
    exception when others then null;
    end;
    perform cron.schedule(
      'checklist-evidence-cleanup',
      '0 3 * * *',
      'select checklist_evidence_cleanup_expired();'
    );
    raise notice '[025] pg_cron đã schedule job checklist-evidence-cleanup chạy 3:00 mỗi ngày.';
  else
    raise notice '[025] pg_cron chưa bật. Bật ở Dashboard > Database > Extensions > pg_cron. Function checklist_evidence_cleanup_expired() vẫn có sẵn để gọi tay.';
  end if;
end$$;

notify pgrst, 'reload schema';

-- ---- Sanity check ----
do $$
declare
  has_bucket bool;
  ev_cnt int;
begin
  select exists(select 1 from storage.buckets where id = 'checklist-evidence')
    into has_bucket;
  select count(*) into ev_cnt from checklist_evidence_files;
  raise notice '[025] Bucket exists: % | evidence rows: %', has_bucket, ev_cnt;
end$$;
