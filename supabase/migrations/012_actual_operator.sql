-- ============================================================
-- Migration 012: Ghi nhận người thực hiện thực tế
-- ============================================================
-- - Thêm actual_operator_name + actual_operator_role vào instances.
-- - Field này chỉ dùng trong form submit / detail để ghi nhận
--   ai thực sự làm checklist (vì account dùng chung theo bộ phận+ca).
-- - KHÔNG đổi mô hình shared_shift account.
-- - KHÔNG đổi tiêu đề card.
-- ============================================================

alter table checklist_instances
  add column if not exists actual_operator_name text,
  add column if not exists actual_operator_role text;

create index if not exists idx_inst_actual_op on checklist_instances(actual_operator_name)
  where actual_operator_name is not null;

notify pgrst, 'reload schema';
