-- ============================================================
-- 024_checklist_audit_actions_extend.sql
-- Cho phép ghi 'check_item' và 'uncheck_item' vào checklist_audit_log
-- Mỗi lần tick/un-tick 1 item là 1 row audit.
-- ============================================================

alter table checklist_audit_log
  drop constraint if exists checklist_audit_log_action_check;

alter table checklist_audit_log
  add constraint checklist_audit_log_action_check
  check (action in (
    'submit','approve','reject','upload_file','remove_file',
    'reopen','password_reset','check_item','uncheck_item'
  ));

notify pgrst, 'reload schema';
