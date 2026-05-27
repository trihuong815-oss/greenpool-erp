-- ============================================================
-- Migration 010: Auto-seed checklist_instance_items + backfill
-- ============================================================
-- - Trigger DB-level: khi tạo checklist_instances mới, tự
--   populate checklist_instance_items từ checklist_template_items
-- - Backfill cho instances đã tồn tại (case: 2 instance hiện tại)
-- - Ensure mỗi template NV_CH đều có 8 items mẫu nếu trống
-- ============================================================

-- ---- 1. Trigger function ----
create or replace function checklist_seed_instance_items() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into checklist_instance_items
    (instance_id, template_item_id, sort_order, content, requires_file, is_checked)
  select
    new.id, ti.id, ti.sort_order, ti.content,
    coalesce(ti.requires_file, false), false
  from checklist_template_items ti
  where ti.template_id = new.template_id
  on conflict (instance_id, template_item_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_checklist_seed_instance_items on checklist_instances;
create trigger trg_checklist_seed_instance_items
  after insert on checklist_instances
  for each row execute function checklist_seed_instance_items();

-- ---- 2. Ensure NV_CH templates đều có 8 items mẫu ----
do $$
declare
  tpl_rec record;
  cnt int;
begin
  for tpl_rec in
    select id from checklist_templates
    where assigned_role_code = 'NV_CH' or role_label = 'NV Cứu hộ'
  loop
    select count(*) into cnt from checklist_template_items where template_id = tpl_rec.id;
    if cnt = 0 then
      insert into checklist_template_items (template_id, content, sort_order, requires_file) values
        (tpl_rec.id, 'Có mặt đúng giờ, mặc đồng phục',           1, false),
        (tpl_rec.id, 'Kiểm tra phao cứu sinh',                    2, true),
        (tpl_rec.id, 'Kiểm tra sào cứu hộ / móc cứu hộ',          3, true),
        (tpl_rec.id, 'Kiểm tra khu vực bể trước ca',              4, true),
        (tpl_rec.id, 'Đứng đúng vị trí quan sát trong ca',         5, false),
        (tpl_rec.id, 'Nhắc nhở khách tuân thủ nội quy',           6, false),
        (tpl_rec.id, 'Ghi nhận sự cố nếu có',                     7, false),
        (tpl_rec.id, 'Bàn giao cuối ca cho người kế tiếp',        8, false);
      raise notice 'Seeded 8 items cho template NV_CH id=%', tpl_rec.id;
    end if;
  end loop;
end$$;

-- ---- 3. Backfill: tạo instance_items cho mọi instance đã tồn tại
--        mà chưa có items ----
insert into checklist_instance_items
  (instance_id, template_item_id, sort_order, content, requires_file, is_checked)
select
  i.id, ti.id, ti.sort_order, ti.content,
  coalesce(ti.requires_file, false), false
from checklist_instances i
join checklist_template_items ti on ti.template_id = i.template_id
where not exists (
  select 1 from checklist_instance_items ii
  where ii.instance_id = i.id and ii.template_item_id = ti.id
);

-- ---- 4. Verify ----
do $$
declare
  inst_count int;
  inst_with_items int;
  total_items int;
begin
  select count(*) into inst_count from checklist_instances;
  select count(distinct instance_id) into inst_with_items from checklist_instance_items;
  select count(*) into total_items from checklist_instance_items;
  raise notice 'Verify: % instances, % có items, tổng % items', inst_count, inst_with_items, total_items;
end$$;

notify pgrst, 'reload schema';
