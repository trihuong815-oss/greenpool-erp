-- ============================================================
-- Migration 009: Checklist items + Storage
-- ============================================================
-- - Rename checklist_items → checklist_template_items
-- - Thêm requires_file vào template_items
-- - Tạo bảng checklist_instance_items (per-item state)
-- - Thêm general_note vào checklist_instances
-- - Storage bucket "checklist-evidence" + policies
-- - Seed template NV Cứu hộ với 8 items
-- ============================================================

-- ---- 1. Rename + extend template items ----
alter table if exists checklist_items rename to checklist_template_items;

alter table checklist_template_items
  add column if not exists requires_file boolean default false;

-- ---- 2. Bảng instance_items (per checklist item state) ----
create table if not exists checklist_instance_items (
  id uuid primary key default uuid_generate_v4(),
  instance_id uuid not null references checklist_instances(id) on delete cascade,
  template_item_id uuid not null references checklist_template_items(id) on delete cascade,
  sort_order int default 0,
  content text not null,
  requires_file boolean default false,
  is_checked boolean default false,
  checked_at timestamptz,
  checked_by uuid references profiles(id) on delete set null,
  note text,
  file_urls text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(instance_id, template_item_id)
);

create index if not exists idx_inst_items_instance on checklist_instance_items(instance_id);
create index if not exists idx_inst_items_checked on checklist_instance_items(instance_id, is_checked);

-- ---- 3. general_note vào instances ----
alter table checklist_instances
  add column if not exists general_note text;

-- ---- 4. Trigger updated_at ----
create or replace function checklist_instance_items_touch_updated_at()
returns trigger as $$
begin new.updated_at := now(); return new; end;
$$ language plpgsql;

drop trigger if exists trg_inst_items_updated_at on checklist_instance_items;
create trigger trg_inst_items_updated_at before update on checklist_instance_items
  for each row execute function checklist_instance_items_touch_updated_at();

-- ---- 5. RLS instance_items ----
alter table checklist_instance_items enable row level security;

drop policy if exists "InstItems: read scope" on checklist_instance_items;
drop policy if exists "InstItems: assignee write" on checklist_instance_items;
drop policy if exists "InstItems: admin all" on checklist_instance_items;

create policy "InstItems: read scope" on checklist_instance_items for select using (
  exists (
    select 1 from checklist_instances i
    where i.id = checklist_instance_items.instance_id
      and (
        i.assigned_to = auth.uid()
        or i.reviewer_id = auth.uid()
        or current_user_role() in ('CEO','GD_KD','GD_VP','TP_GS','TP_NS')
        or (current_user_role() like 'QLCS\_%' escape '\' and i.facility_id = current_user_facility())
      )
  )
);

create policy "InstItems: assignee write" on checklist_instance_items for all using (
  exists (
    select 1 from checklist_instances i
    where i.id = checklist_instance_items.instance_id
      and i.assigned_to = auth.uid()
  )
) with check (
  exists (
    select 1 from checklist_instances i
    where i.id = checklist_instance_items.instance_id
      and i.assigned_to = auth.uid()
  )
);

create policy "InstItems: admin all" on checklist_instance_items for all using (
  current_user_role() in ('CEO','GD_KD','GD_VP')
);

-- ---- 6. Storage bucket ----
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'checklist-evidence',
  'checklist-evidence',
  false,
  10485760, -- 10MB
  array['image/jpeg','image/png','image/webp','image/heic','application/pdf']
)
on conflict (id) do update set
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','application/pdf'];

-- Storage policies
drop policy if exists "Evidence: auth upload" on storage.objects;
drop policy if exists "Evidence: auth read" on storage.objects;
drop policy if exists "Evidence: owner delete" on storage.objects;

create policy "Evidence: auth upload" on storage.objects
  for insert with check (bucket_id = 'checklist-evidence' and auth.uid() is not null);

create policy "Evidence: auth read" on storage.objects
  for select using (bucket_id = 'checklist-evidence' and auth.uid() is not null);

create policy "Evidence: owner delete" on storage.objects
  for delete using (bucket_id = 'checklist-evidence' and auth.uid() = owner);

-- ============================================================
-- 7. Seed template "NV Cứu hộ" + 8 items
-- ============================================================
do $$
declare tpl_id uuid;
begin
  -- Tìm template hiện có cho NV_CH
  select id into tpl_id from checklist_templates
  where assigned_role_code = 'NV_CH' or role_label = 'NV Cứu hộ'
  limit 1;

  -- Tạo nếu chưa có
  if tpl_id is null then
    insert into checklist_templates (
      role_label, block_id, active, assigned_role_code,
      checklist_group, shift_type, evidence_type
    )
    values (
      'NV Cứu hộ', 'KD', true, 'NV_CH',
      'An toàn vận hành', 'allday', 'photo'
    )
    returning id into tpl_id;
  end if;

  -- Seed items nếu template chưa có
  if not exists (select 1 from checklist_template_items where template_id = tpl_id) then
    insert into checklist_template_items (template_id, content, sort_order, requires_file) values
      (tpl_id, 'Có mặt đúng giờ, mặc đồng phục',          1, false),
      (tpl_id, 'Kiểm tra phao cứu sinh',                   2, true),
      (tpl_id, 'Kiểm tra sào cứu hộ / móc cứu hộ',         3, true),
      (tpl_id, 'Kiểm tra khu vực bể trước ca',             4, true),
      (tpl_id, 'Đứng đúng vị trí quan sát trong ca',        5, false),
      (tpl_id, 'Nhắc nhở khách tuân thủ nội quy',          6, false),
      (tpl_id, 'Ghi nhận sự cố nếu có',                    7, false),
      (tpl_id, 'Bàn giao cuối ca cho người kế tiếp',       8, false);
  end if;
end$$;

notify pgrst, 'reload schema';
