-- ============================================================
-- Migration 002: Tách Tổ trưởng (TT) khỏi tầng Phó phòng (PP)
-- ============================================================
-- Trước:  Tier 4 = PP + TT,    Tier 5 = NV
-- Sau:    Tier 4 = PP,         Tier 5 = TT,    Tier 6 = NV/GV
--
-- Lý do: Phó phòng quản lý Tổ trưởng (TT.parent_role = PP_xxx),
-- nên cần phản ánh đúng cấp bậc trong sơ đồ tổ chức.
-- ============================================================

-- Nhân viên & Giáo viên: tier 5 → 6
update roles set tier = 6 where tier = 5 and (code like 'NV\_%' escape '\' or code like 'GV\_%' escape '\');

-- Tổ trưởng: tier 4 → 5
update roles set tier = 5 where tier = 4 and code like 'TT\_%' escape '\';

-- Sanity check: in ra phân bố sau migration
do $$
declare
  c1 int; c2 int; c3 int; c4 int; c5 int; c6 int;
begin
  select count(*) into c1 from roles where tier = 1;
  select count(*) into c2 from roles where tier = 2;
  select count(*) into c3 from roles where tier = 3;
  select count(*) into c4 from roles where tier = 4;
  select count(*) into c5 from roles where tier = 5;
  select count(*) into c6 from roles where tier = 6;
  raise notice 'Sau migration — Tier 1: % | 2: % | 3: % | 4 (PP): % | 5 (TT): % | 6 (NV/GV): %', c1, c2, c3, c4, c5, c6;
end$$;
