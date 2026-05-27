-- ============================================================
-- 021_seed_checklist_hoangmai_mvp.sql
-- Test seed: 11 checklist instances cho Green Pool Hoàng Mai
-- Ngày: 2026-05-21
-- Idempotent qua marker name 'SEED-HM-21052026-%'.
-- KHÔNG seed cho 4 cơ sở còn lại.
-- ============================================================

-- ---- 1. Cleanup seed cũ (cascade qua tất cả bảng phụ thuộc) ----
delete from checklist_instance_items where instance_id in (
  select id from checklist_instances where template_id in (
    select id from checklist_templates where name like 'SEED-HM-21052026-%'
  )
);
delete from checklist_audit_log where instance_id in (
  select id from checklist_instances where template_id in (
    select id from checklist_templates where name like 'SEED-HM-21052026-%'
  )
);
delete from checklist_instances where template_id in (
  select id from checklist_templates where name like 'SEED-HM-21052026-%'
);
delete from checklist_template_items where template_id in (
  select id from checklist_templates where name like 'SEED-HM-21052026-%'
);
delete from checklist_templates where name like 'SEED-HM-21052026-%';

-- ---- 2. Templates (11 dòng) ----
insert into checklist_templates (
  name, role_label, block_id, active,
  department_id, shift_type, checklist_group, checklist_type,
  scheduled_time, deadline_time, evidence_type, facility_scope,
  reviewer_role_code, assigned_role_code
) values
  ('SEED-HM-21052026-AT-M-OP',  'NV Kinh doanh',  'KD', true, null, 'morning',   'An toàn - vệ sinh cơ sở', 'opening',  '07:00:00', '09:00:00', 'photo', 'specific', 'QLCS_HM', null),
  ('SEED-HM-21052026-AT-A-HD',  'NV Kinh doanh',  'KD', true, null, 'afternoon', 'An toàn - vệ sinh cơ sở', 'handover', '12:00:00', '13:00:00', 'photo', 'specific', 'QLCS_HM', null),
  ('SEED-HM-21052026-AT-A-CL',  'NV Kinh doanh',  'KD', true, null, 'afternoon', 'An toàn - vệ sinh cơ sở', 'closing',  '19:00:00', '21:00:00', 'photo', 'specific', 'QLCS_HM', null),
  ('SEED-HM-21052026-LT-M-OP',  'NV Lễ tân',      'KD', true, null, 'morning',   'Lễ tân',                  'opening',  '07:30:00', '09:00:00', 'note',  'specific', 'QLCS_HM', null),
  ('SEED-HM-21052026-LT-A-HD',  'NV Lễ tân',      'KD', true, null, 'afternoon', 'Lễ tân',                  'handover', '12:00:00', '13:00:00', 'note',  'specific', 'QLCS_HM', null),
  ('SEED-HM-21052026-LT-A-CL',  'NV Lễ tân',      'KD', true, null, 'afternoon', 'Lễ tân',                  'closing',  '20:00:00', '21:30:00', 'note',  'specific', 'QLCS_HM', null),
  ('SEED-HM-21052026-KTHT-D',   'NV KT Hệ thống', 'KD', true, 'KT', 'allday',    'Kỹ thuật hệ thống',       'custom',   '08:00:00', '17:00:00', 'photo', 'specific', 'QLCS_HM', null),
  ('SEED-HM-21052026-KTXLN-S',  'NV KT XLN',      'KD', true, 'KT', 'allday',    'Kỹ thuật xử lý nước',     'custom',   '08:00:00', '20:00:00', 'photo', 'specific', 'QLCS_HM', null),
  ('SEED-HM-21052026-DT-D',     'Tổ trưởng ĐT',   'KD', true, 'DT', 'allday',    'Đào tạo',                 'custom',   '08:00:00', '18:00:00', 'note',  'specific', 'QLCS_HM', null),
  ('SEED-HM-21052026-KD-D',     'NV Kinh doanh',  'KD', true, null, 'allday',    'Kinh doanh/Sale',         'custom',   '08:00:00', '18:00:00', 'note',  'specific', 'QLCS_HM', null),
  ('SEED-HM-21052026-QL-D',     'QLCS Hoàng Mai', 'KD', true, null, 'allday',    'Quản lý cơ sở',           'custom',   '08:00:00', '20:00:00', 'note',  'specific', null,      'QLCS_HM');

-- ---- 3. Template items (3-5 mỗi template) ----
with src(marker, sort_order, content, req_file, req_required, req_note) as (
  values
    ('AT-M-OP', 1, 'Kiểm tra vị trí trực cứu hộ',                          false, true,  false),
    ('AT-M-OP', 2, 'Kiểm tra phao cứu sinh, sào cứu hộ, móc cứu hộ',       true,  true,  false),
    ('AT-M-OP', 3, 'Kiểm tra khu vực bể, nguy cơ trơn trượt',              false, true,  false),
    ('AT-M-OP', 4, 'Kiểm tra biển cảnh báo / nội quy an toàn',             false, true,  false),
    ('AT-M-OP', 5, 'Kiểm tra phòng thay đồ, nhà tắm',                      false, true,  false),
    ('AT-A-HD', 1, 'Bàn giao tình trạng cứu hộ ca sáng',                   false, true,  true),
    ('AT-A-HD', 2, 'Kiểm tra vệ sinh khu vực bể sau ca sáng',              false, true,  false),
    ('AT-A-HD', 3, 'Cập nhật sự cố / phản ánh trong ca sáng',              false, false, true),
    ('AT-A-HD', 4, 'Xác nhận cứu hộ ca chiều có mặt đầy đủ',               false, true,  false),
    ('AT-A-CL', 1, 'Tổng kiểm tra phao, sào, móc cứu hộ',                  true,  true,  false),
    ('AT-A-CL', 2, 'Kiểm tra sàn bể, khu vực chung sau ca chiều',          false, true,  false),
    ('AT-A-CL', 3, 'Đổ thùng rác, dọn khu phụ trợ',                        false, true,  false),
    ('AT-A-CL', 4, 'Báo cáo sự cố trong ngày (nếu có)',                    false, false, true),
    ('LT-M-OP', 1, 'Quầy lễ tân sạch sẽ, đèn, máy tính bật',               false, true,  false),
    ('LT-M-OP', 2, 'Kiểm tra danh sách khách / lịch học ngày',             false, true,  false),
    ('LT-M-OP', 3, 'Kiểm tra thiết bị thanh toán / POS',                   false, true,  false),
    ('LT-M-OP', 4, 'Sẵn sàng đón khách walk-in',                           false, true,  false),
    ('LT-M-OP', 5, 'Tiền mặt đầu ca khớp sổ',                              false, true,  true),
    ('LT-A-HD', 1, 'Nhận bàn giao tiền mặt và phản ánh từ ca sáng',        false, true,  true),
    ('LT-A-HD', 2, 'Cập nhật danh sách khách walk-in ca sáng',             false, true,  false),
    ('LT-A-HD', 3, 'Kiểm tra thiết bị POS / wifi hoạt động',               false, true,  false),
    ('LT-A-HD', 4, 'Xác nhận lịch ca chiều khớp dữ liệu',                  false, true,  false),
    ('LT-A-CL', 1, 'Đối soát doanh thu cuối ngày',                         false, true,  true),
    ('LT-A-CL', 2, 'Tắt thiết bị, khoá quầy, lưu phiếu',                   false, true,  false),
    ('LT-A-CL', 3, 'Ghi nhận phản ánh khách hàng cuối ngày',               false, false, true),
    ('LT-A-CL', 4, 'Bàn giao chìa khoá quầy cho QLCS',                     false, true,  false),
    ('KTHT-D',  1, 'Kiểm tra máy lọc, máy bơm hoạt động',                  true,  true,  false),
    ('KTHT-D',  2, 'Kiểm tra hệ thống điện, ổ cắm chính',                  false, true,  false),
    ('KTHT-D',  3, 'Kiểm tra đèn chiếu sáng khu vực bể',                   false, true,  false),
    ('KTHT-D',  4, 'Kiểm tra camera an ninh',                              false, true,  false),
    ('KTHT-D',  5, 'Báo sự cố thiết bị (nếu có)',                          true,  false, true),
    ('KTXLN-S', 1, 'Đo pH nước bể',                                        false, true,  true),
    ('KTXLN-S', 2, 'Đo Clo dư',                                            false, true,  true),
    ('KTXLN-S', 3, 'Kiểm tra độ trong / màu nước',                         false, true,  false),
    ('KTXLN-S', 4, 'Đo nhiệt độ nước',                                     false, true,  true),
    ('KTXLN-S', 5, 'Ghi nhật ký hoá chất đã dùng',                         true,  true,  true),
    ('DT-D',    1, 'Kiểm tra lịch lớp trong ngày',                         false, true,  false),
    ('DT-D',    2, 'Kiểm tra giáo viên đủ ca',                             false, true,  false),
    ('DT-D',    3, 'Kiểm tra lớp có học viên đặc biệt',                    false, false, true),
    ('DT-D',    4, 'Kiểm tra điểm danh đầu giờ',                           false, true,  false),
    ('DT-D',    5, 'Ghi nhận phản hồi phụ huynh',                          false, false, true),
    ('KD-D',    1, 'Kiểm tra lead mới trong ngày',                         false, true,  false),
    ('KD-D',    2, 'Follow up khách hàng tiềm năng',                       false, true,  true),
    ('KD-D',    3, 'Cập nhật CRM',                                         false, true,  false),
    ('KD-D',    4, 'Tổng kết doanh thu ca/ngày',                           false, true,  true),
    ('QL-D',    1, 'Đi tour kiểm tra toàn cơ sở',                          false, true,  false),
    ('QL-D',    2, 'Kiểm tra checklist các bộ phận đã nộp',                false, true,  false),
    ('QL-D',    3, 'Duyệt các checklist chờ duyệt',                        false, true,  false),
    ('QL-D',    4, 'Báo cáo sự cố lên GĐ Khối nếu có',                     false, false, true),
    ('QL-D',    5, 'Tổng kết vận hành ngày',                               false, true,  true)
)
insert into checklist_template_items (template_id, content, sort_order, requires_file, is_required, requires_note)
select t.id, src.content, src.sort_order, src.req_file, src.req_required, src.req_note
from src
join checklist_templates t on t.name = 'SEED-HM-21052026-' || src.marker;

-- ---- 4. Instances (11 dòng) ----
-- reviewer_id: dò profile QLCS_HM; nếu chưa có thì null.
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
  (select id from profiles where role_code = 'QLCS_HM' and active = true limit 1),
  'HM',
  'Green Pool Hoàng Mai',
  t.department_id,
  case t.department_id
    when 'KT' then 'Kỹ thuật'
    when 'DT' then 'Đào tạo'
    else case t.checklist_group
      when 'Lễ tân'                  then 'Lễ tân'
      when 'Kinh doanh/Sale'         then 'Kinh doanh'
      when 'Quản lý cơ sở'           then 'Quản lý cơ sở'
      when 'An toàn - vệ sinh cơ sở' then 'An toàn - Vệ sinh'
      else null
    end
  end,
  t.checklist_group,
  case t.checklist_group
    when 'Kỹ thuật hệ thống'     then 'KT_HT'
    when 'Kỹ thuật xử lý nước'   then 'KT_XLN'
    when 'Đào tạo'               then 'DT'
    else null
  end,
  date '2026-05-21',
  t.shift_type,
  case t.shift_type
    when 'morning'   then 'Ca sáng'
    when 'afternoon' then 'Ca chiều'
    when 'evening'   then 'Ca tối'
    when 'night'     then 'Ca đêm'
    when 'allday'    then 'Cả ngày'
    else null
  end,
  t.checklist_type,
  ((date '2026-05-21' + t.scheduled_time) at time zone 'Asia/Ho_Chi_Minh'),
  ((date '2026-05-21' + t.deadline_time)  at time zone 'Asia/Ho_Chi_Minh'),
  case t.checklist_group
    when 'Lễ tân'                  then 'TK Lễ tân ca'
    when 'Kỹ thuật hệ thống'       then 'NV KT Hệ thống'
    when 'Kỹ thuật xử lý nước'     then 'NV KT Xử lý nước'
    when 'Đào tạo'                 then 'Tổ trưởng ĐT cơ sở'
    when 'Kinh doanh/Sale'         then 'NV Kinh doanh'
    when 'Quản lý cơ sở'           then 'QLCS Hoàng Mai'
    when 'An toàn - vệ sinh cơ sở' then 'NV Kinh doanh / Cứu hộ'
    else null
  end,
  'QLCS Hoàng Mai',
  'Quản lý cơ sở Hoàng Mai',
  'pending',
  case t.checklist_group
    when 'Quản lý cơ sở' then 'qlcs'
    when 'Kỹ thuật hệ thống'     then 'personal'
    when 'Kỹ thuật xử lý nước'   then 'personal'
    when 'Đào tạo'               then 'personal'
    when 'Kinh doanh/Sale'       then 'personal'
    else 'shared_shift'
  end
from checklist_templates t
where t.name like 'SEED-HM-21052026-%';

-- ---- 5. Instance items (copy từ template items) ----
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
where t.name like 'SEED-HM-21052026-%'
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
    from checklist_templates where name like 'SEED-HM-21052026-%';
  select count(*) into tpl_item_cnt
    from checklist_template_items ti
    join checklist_templates t on t.id = ti.template_id
    where t.name like 'SEED-HM-21052026-%';
  select count(*) into inst_cnt
    from checklist_instances i
    join checklist_templates t on t.id = i.template_id
    where t.name like 'SEED-HM-21052026-%' and i.date = date '2026-05-21';
  select count(*) into inst_item_cnt
    from checklist_instance_items ii
    join checklist_instances i on i.id = ii.instance_id
    join checklist_templates t on t.id = i.template_id
    where t.name like 'SEED-HM-21052026-%' and i.date = date '2026-05-21';
  raise notice 'Seed 021 — templates: % | template_items: % | instances: % | instance_items: %',
    tpl_cnt, tpl_item_cnt, inst_cnt, inst_item_cnt;
end$$;
