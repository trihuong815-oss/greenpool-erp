-- ============================================================
-- 023_seed_checklist_mvp_5_facilities.sql
-- Seed MVP: 11 checklist × 5 cơ sở = 55 checklist_instances cho 2026-05-21.
-- Idempotent qua marker template name 'SEED-MVP-%'.
-- KHÔNG seed Storage RLS, KHÔNG pg_cron, KHÔNG UI audit.
-- ============================================================

-- ---- 1. Cleanup seed cũ ----
delete from checklist_instance_items where instance_id in (
  select id from checklist_instances where template_id in (
    select id from checklist_templates where name like 'SEED-MVP-%'
  )
);
delete from checklist_audit_log where instance_id in (
  select id from checklist_instances where template_id in (
    select id from checklist_templates where name like 'SEED-MVP-%'
  )
);
delete from checklist_instances where template_id in (
  select id from checklist_templates where name like 'SEED-MVP-%'
);
delete from checklist_template_items where template_id in (
  select id from checklist_templates where name like 'SEED-MVP-%'
);
delete from checklist_templates where name like 'SEED-MVP-%';

-- ---- 2. Templates: 5 facilities × 11 combos = 55 ----
with
facilities_seed(fac_id, fac_name, qlcs_role) as (
  values
    ('TK',  'Green Pool 20 Thụy Khuê',                    'QLCS_TK'),
    ('HM',  'Green Pool Hoàng Mai',                       'QLCS_HM'),
    ('24',  'Green Pool 24 Nguyễn Cơ Thạch',              'QLCS_24NCT'),
    ('CTT', 'Green Pool Cung Thể thao Dưới nước Mỹ Đình', 'QLCS_CTT'),
    ('TT',  'Green Pool Thanh Trì',                       'QLCS_TT')
),
combos(marker, role_label, dept_id, shift_type, group_label, ck_type, sched_t, dead_t, evidence) as (
  values
    ('AT-M-OP',  'NV Kinh doanh',  null::text, 'morning',   'An toàn vệ sinh cơ sở', 'opening',  '07:00:00'::time, '09:00:00'::time, 'photo'),
    ('AT-A-HD',  'NV Kinh doanh',  null::text, 'afternoon', 'An toàn vệ sinh cơ sở', 'handover', '12:00:00'::time, '13:00:00'::time, 'photo'),
    ('AT-A-CL',  'NV Kinh doanh',  null::text, 'afternoon', 'An toàn vệ sinh cơ sở', 'closing',  '19:00:00'::time, '21:00:00'::time, 'photo'),
    ('LT-M-OP',  'NV Lễ tân',      null::text, 'morning',   'Lễ tân',                'opening',  '07:30:00'::time, '09:00:00'::time, 'note'),
    ('LT-A-HD',  'NV Lễ tân',      null::text, 'afternoon', 'Lễ tân',                'handover', '12:00:00'::time, '13:00:00'::time, 'note'),
    ('LT-A-CL',  'NV Lễ tân',      null::text, 'afternoon', 'Lễ tân',                'closing',  '20:00:00'::time, '21:30:00'::time, 'note'),
    ('KTHT-D',   'NV KT Hệ thống', 'KT',       'allday',    'Kỹ thuật hệ thống',     'custom',   '08:00:00'::time, '17:00:00'::time, 'photo'),
    ('KTXLN-S',  'NV KT XLN',      'KT',       'allday',    'Kỹ thuật xử lý nước',   'custom',   '08:00:00'::time, '20:00:00'::time, 'photo'),
    ('DT-D',     'Tổ trưởng ĐT',   'DT',       'allday',    'Đào tạo',               'custom',   '08:00:00'::time, '18:00:00'::time, 'note'),
    ('KD-D',     'NV Kinh doanh',  null::text, 'allday',    'Kinh doanh/Sale',       'custom',   '08:00:00'::time, '18:00:00'::time, 'note'),
    ('QL-D',     'QLCS',           null::text, 'allday',    'Quản lý cơ sở',         'custom',   '08:00:00'::time, '20:00:00'::time, 'note')
)
insert into checklist_templates (
  name, role_label, block_id, active,
  department_id, shift_type, checklist_group, checklist_type,
  scheduled_time, deadline_time, evidence_type, facility_scope,
  reviewer_role_code, assigned_role_code
)
select
  'SEED-MVP-' || f.fac_id || '-' || c.marker,
  c.role_label, 'KD', true,
  c.dept_id, c.shift_type, c.group_label, c.ck_type,
  c.sched_t, c.dead_t, c.evidence, 'specific',
  case c.marker when 'QL-D' then 'GD_KD' else f.qlcs_role end,
  case c.marker when 'QL-D' then f.qlcs_role else null end
from facilities_seed f cross join combos c;

-- ---- 3. Template items: theo nhóm (apply cho mọi combo cùng nhóm) ----
with group_items(group_key, sort_order, content, req_file, req_required, req_note) as (
  values
    -- A. An toàn vệ sinh cơ sở
    ('an-toan-ve-sinh', 1, 'Kiểm tra vị trí trực cứu hộ',                    false, true,  false),
    ('an-toan-ve-sinh', 2, 'Kiểm tra dụng cụ cứu hộ',                        true,  true,  false),
    ('an-toan-ve-sinh', 3, 'Kiểm tra khu vực bể và nguy cơ trơn trượt',      false, true,  false),
    ('an-toan-ve-sinh', 4, 'Kiểm tra phòng thay đồ / nhà tắm',               false, true,  false),
    ('an-toan-ve-sinh', 5, 'Báo cáo sự cố bất thường nếu có',                false, false, true),
    -- B. Lễ tân
    ('le-tan', 1, 'Kiểm tra quầy lễ tân sạch sẽ',                            false, true,  false),
    ('le-tan', 2, 'Kiểm tra danh sách khách / lịch học trong ngày',          false, true,  false),
    ('le-tan', 3, 'Kiểm tra thiết bị thanh toán / POS',                      false, true,  false),
    ('le-tan', 4, 'Ghi nhận khách walk-in / phản ánh',                       false, true,  true),
    ('le-tan', 5, 'Đối soát / bàn giao cuối ca nếu có',                      false, false, true),
    -- C. Kỹ thuật hệ thống
    ('ky-thuat-he-thong', 1, 'Kiểm tra máy lọc / máy bơm',                   true,  true,  false),
    ('ky-thuat-he-thong', 2, 'Kiểm tra điện / đèn / camera',                 false, true,  false),
    ('ky-thuat-he-thong', 3, 'Kiểm tra thiết bị vận hành cơ bản',            false, true,  false),
    ('ky-thuat-he-thong', 4, 'Báo sự cố thiết bị nếu có',                    true,  false, true),
    -- D. Kỹ thuật xử lý nước
    ('ky-thuat-xu-ly-nuoc', 1, 'Kiểm tra pH',                                false, true,  true),
    ('ky-thuat-xu-ly-nuoc', 2, 'Kiểm tra Clo',                               false, true,  true),
    ('ky-thuat-xu-ly-nuoc', 3, 'Kiểm tra độ trong / nhiệt độ',               false, true,  true),
    ('ky-thuat-xu-ly-nuoc', 4, 'Ghi log nước',                               true,  true,  true),
    ('ky-thuat-xu-ly-nuoc', 5, 'Báo nước bất thường nếu có',                 false, false, true),
    -- E. Đào tạo
    ('dao-tao', 1, 'Kiểm tra lịch lớp trong ngày',                           false, true,  false),
    ('dao-tao', 2, 'Kiểm tra giáo viên đủ ca',                               false, true,  false),
    ('dao-tao', 3, 'Kiểm tra lớp / học viên cần chú ý',                      false, false, true),
    ('dao-tao', 4, 'Kiểm tra điểm danh',                                     false, true,  false),
    ('dao-tao', 5, 'Ghi nhận phản hồi phụ huynh nếu có',                     false, false, true),
    -- F. Kinh doanh / Sale
    ('kinh-doanh-sale', 1, 'Kiểm tra lead mới',                              false, true,  false),
    ('kinh-doanh-sale', 2, 'Kiểm tra khách cần follow',                      false, true,  true),
    ('kinh-doanh-sale', 3, 'Cập nhật trạng thái khách',                      false, true,  false),
    ('kinh-doanh-sale', 4, 'Ghi lý do chưa chốt nếu có',                     false, false, true),
    ('kinh-doanh-sale', 5, 'Báo cáo cơ hội renew / upsell',                  false, false, true),
    -- G. Quản lý cơ sở
    ('quan-ly-co-so', 1, 'Kiểm tra nhân sự đủ ca',                           false, true,  false),
    ('quan-ly-co-so', 2, 'Kiểm tra sẵn sàng vận hành cơ sở',                 false, true,  false),
    ('quan-ly-co-so', 3, 'Kiểm tra tình hình doanh thu / khách trong ngày',  false, true,  false),
    ('quan-ly-co-so', 4, 'Kiểm tra sự cố / phản ánh',                        false, false, true),
    ('quan-ly-co-so', 5, 'Gửi tổng hợp cuối ngày',                           false, true,  true)
),
combo_groups(marker, group_key) as (
  values
    ('AT-M-OP',  'an-toan-ve-sinh'),
    ('AT-A-HD',  'an-toan-ve-sinh'),
    ('AT-A-CL',  'an-toan-ve-sinh'),
    ('LT-M-OP',  'le-tan'),
    ('LT-A-HD',  'le-tan'),
    ('LT-A-CL',  'le-tan'),
    ('KTHT-D',   'ky-thuat-he-thong'),
    ('KTXLN-S',  'ky-thuat-xu-ly-nuoc'),
    ('DT-D',     'dao-tao'),
    ('KD-D',     'kinh-doanh-sale'),
    ('QL-D',     'quan-ly-co-so')
)
insert into checklist_template_items (template_id, content, sort_order, requires_file, is_required, requires_note)
select t.id, gi.content, gi.sort_order, gi.req_file, gi.req_required, gi.req_note
from checklist_templates t
join combo_groups cg on t.name like 'SEED-MVP-%-' || cg.marker
join group_items gi on gi.group_key = cg.group_key
where t.name like 'SEED-MVP-%';

-- ---- 4. Instances: 55 dòng ----
with
facilities_seed(fac_id, fac_name, qlcs_role) as (
  values
    ('TK',  'Green Pool 20 Thụy Khuê',                    'QLCS_TK'),
    ('HM',  'Green Pool Hoàng Mai',                       'QLCS_HM'),
    ('24',  'Green Pool 24 Nguyễn Cơ Thạch',              'QLCS_24NCT'),
    ('CTT', 'Green Pool Cung Thể thao Dưới nước Mỹ Đình', 'QLCS_CTT'),
    ('TT',  'Green Pool Thanh Trì',                       'QLCS_TT')
),
combos(marker, group_label, group_key, dept_id, shift_type, ck_type, sched_t, dead_t, oper_label, account_type) as (
  values
    ('AT-M-OP', 'An toàn vệ sinh cơ sở', 'an-toan-ve-sinh',     null::text, 'morning',   'opening',  '07:00:00'::time, '09:00:00'::time, 'NV Kinh doanh / QLCS', 'shared_shift'),
    ('AT-A-HD', 'An toàn vệ sinh cơ sở', 'an-toan-ve-sinh',     null::text, 'afternoon', 'handover', '12:00:00'::time, '13:00:00'::time, 'NV Kinh doanh / QLCS', 'shared_shift'),
    ('AT-A-CL', 'An toàn vệ sinh cơ sở', 'an-toan-ve-sinh',     null::text, 'afternoon', 'closing',  '19:00:00'::time, '21:00:00'::time, 'NV Kinh doanh / QLCS', 'shared_shift'),
    ('LT-M-OP', 'Lễ tân',                'le-tan',              null::text, 'morning',   'opening',  '07:30:00'::time, '09:00:00'::time, 'Lễ tân ca',            'shared_shift'),
    ('LT-A-HD', 'Lễ tân',                'le-tan',              null::text, 'afternoon', 'handover', '12:00:00'::time, '13:00:00'::time, 'Lễ tân ca',            'shared_shift'),
    ('LT-A-CL', 'Lễ tân',                'le-tan',              null::text, 'afternoon', 'closing',  '20:00:00'::time, '21:30:00'::time, 'Lễ tân ca',            'shared_shift'),
    ('KTHT-D',  'Kỹ thuật hệ thống',     'ky-thuat-he-thong',   'KT',       'allday',    'custom',   '08:00:00'::time, '17:00:00'::time, 'KTV hệ thống',         'personal'),
    ('KTXLN-S', 'Kỹ thuật xử lý nước',   'ky-thuat-xu-ly-nuoc', 'KT',       'allday',    'custom',   '08:00:00'::time, '20:00:00'::time, 'KTV xử lý nước',       'personal'),
    ('DT-D',    'Đào tạo',               'dao-tao',             'DT',       'allday',    'custom',   '08:00:00'::time, '18:00:00'::time, 'Tổ trưởng đào tạo',    'personal'),
    ('KD-D',    'Kinh doanh/Sale',       'kinh-doanh-sale',     null::text, 'allday',    'custom',   '08:00:00'::time, '18:00:00'::time, 'NV Kinh doanh',        'personal'),
    ('QL-D',    'Quản lý cơ sở',         'quan-ly-co-so',       null::text, 'allday',    'custom',   '08:00:00'::time, '20:00:00'::time, 'QLCS',                 'qlcs')
)
insert into checklist_instances (
  template_id, assigned_to, reviewer_id,
  facility_id, facility_name,
  department_id, department_name,
  checklist_group, specialty_group,
  date, shift_type, shift_label, checklist_type,
  scheduled_at, deadline_at,
  assigned_display_name, reviewer_name, reviewer_role,
  status, account_type
)
select
  t.id,
  null,
  case c.marker
    when 'QL-D' then (select id from profiles where role_code = 'GD_KD' and active = true limit 1)
    else (select id from profiles where role_code = f.qlcs_role and active = true limit 1)
  end,
  f.fac_id, f.fac_name,
  c.dept_id,
  case c.dept_id
    when 'KT' then 'Kỹ thuật'
    when 'DT' then 'Đào tạo'
    else
      case c.group_key
        when 'le-tan'           then 'Lễ tân'
        when 'kinh-doanh-sale'  then 'Kinh doanh'
        when 'quan-ly-co-so'    then 'Quản lý cơ sở'
        when 'an-toan-ve-sinh'  then 'An toàn vệ sinh'
        else null
      end
  end,
  c.group_label,
  case c.group_key
    when 'ky-thuat-he-thong'   then 'KT_HT'
    when 'ky-thuat-xu-ly-nuoc' then 'KT_XLN'
    when 'dao-tao'             then 'DT'
    else null
  end,
  date '2026-05-21',
  c.shift_type,
  case c.shift_type
    when 'morning'   then 'Ca sáng'
    when 'afternoon' then 'Ca chiều'
    when 'allday'    then 'Cả ngày'
    else null
  end,
  c.ck_type,
  ((date '2026-05-21' + c.sched_t) at time zone 'Asia/Ho_Chi_Minh'),
  ((date '2026-05-21' + c.dead_t)  at time zone 'Asia/Ho_Chi_Minh'),
  case c.marker when 'QL-D' then 'QLCS ' || f.fac_name else c.oper_label end,
  case c.marker when 'QL-D' then 'Giám đốc Khối KD' else 'QLCS ' || f.fac_name end,
  case c.marker when 'QL-D' then 'Giám đốc Khối Kinh doanh' else 'Quản lý cơ sở ' || f.fac_name end,
  'pending',
  c.account_type
from checklist_templates t
join facilities_seed f on t.name like 'SEED-MVP-' || f.fac_id || '-%'
join combos c on t.name = 'SEED-MVP-' || f.fac_id || '-' || c.marker
where t.name like 'SEED-MVP-%';

-- ---- 5. Instance items: copy 1-1 từ template_items ----
insert into checklist_instance_items (
  instance_id, template_item_id, sort_order,
  content, requires_file, is_required, requires_note, is_checked
)
select
  i.id, ti.id, ti.sort_order,
  ti.content, ti.requires_file, ti.is_required, ti.requires_note, false
from checklist_instances i
join checklist_template_items ti on ti.template_id = i.template_id
join checklist_templates t on t.id = i.template_id
where t.name like 'SEED-MVP-%'
  and i.date = date '2026-05-21';

notify pgrst, 'reload schema';

-- ---- Sanity check ----
do $$
declare
  tpl_cnt int;
  tpl_item_cnt int;
  inst_cnt int;
  inst_item_cnt int;
begin
  select count(*) into tpl_cnt
    from checklist_templates where name like 'SEED-MVP-%';
  select count(*) into tpl_item_cnt
    from checklist_template_items ti
    join checklist_templates t on t.id = ti.template_id
    where t.name like 'SEED-MVP-%';
  select count(*) into inst_cnt
    from checklist_instances i
    join checklist_templates t on t.id = i.template_id
    where t.name like 'SEED-MVP-%' and i.date = date '2026-05-21';
  select count(*) into inst_item_cnt
    from checklist_instance_items ii
    join checklist_instances i on i.id = ii.instance_id
    join checklist_templates t on t.id = i.template_id
    where t.name like 'SEED-MVP-%' and i.date = date '2026-05-21';
  raise notice 'Seed 023 — templates: % | template_items: % | instances: % | instance_items: %',
    tpl_cnt, tpl_item_cnt, inst_cnt, inst_item_cnt;
end$$;
