// Single source of truth cho tên collection Firestore.
// Khi rename trong tương lai (vd. Phase 4: profiles → users), chỉ đổi ở đây.
// Cũng đảm bảo không có magic string scattered khắp codebase.

export const COLLECTIONS = {
  BRANCHES: 'branches',                 // (rename Phase 1.5 từ 'facilities')
  USERS: 'users',                       // (chuẩn từ Phase 4 — collection cũ `profiles` deprecated)
  CHECKLISTS: 'checklists',             // (rename Phase 1.5 từ 'checklistInstances')
  TEMPLATES: 'templates',               // (rename Phase 1.5 từ 'checklistTemplates')
  AUDIT_LOGS: 'auditLogs',              // (chuẩn từ Phase 1c, đã drop legacy 'checklistAuditLogs' ở Phase 1.5)
  SALES: 'sales',                       // (Phase 2 tạo mới; Phase 6 redesign schema kèm leadId)
  LEADS: 'leads',                       // (Phase 6 — Lead Pipeline, để CRM sync sau)
  LEAD_ACTIVITIES: 'leadActivities',    // (Phase 6 — lịch sử chăm sóc, để CRM sync sau)
  SALES_ENTRIES: 'salesEntries',        // (Phase 6.E — bảng tổng nhập tay theo period × branch × sale × source)
  PACKAGE_GROUPS: 'packageGroups',      // (Phase 6.G — nhóm gói per branch: member bơi, tích lượt...)
  PACKAGES: 'packages',                 // (Phase 6.G — gói cụ thể trong group, per branch)
  PACKAGE_SALES: 'packageSales',        // (Phase 6.H — entry sales per period × sale × package)
  PACKAGE_QUANTITIES: 'packageQuantities', // (Phase 6.M — số lượng gói bán per (month × branch × package), tách khỏi doanh số)
  DISCREPANCIES: 'discrepancies',      // (Phase 6.N — chênh lệch doanh số per-Sale vs per-Gói; > 24h chưa fix → cảnh báo GD_KD)
  CHEMICAL_ENTRIES: 'chemicalEntries', // (Phase 7.A — KT module: lượng clo/axit xử lý nước per (branch × day × cấp))
  MACHINES: 'machines',                // (Phase 7.B — KT module: setup máy lọc/nhiệt per branch, TP/PP CRUD)
  MACHINE_RUNS: 'machineRuns',         // (Phase 7.B — KT module: giờ chạy máy thực tế per (branch × day × machine))
  TECH_WORK: 'techWork',               // (Phase 7.C — KT module: tasks + reports + proposals; discriminator field `kind`)
  SALES_TARGETS: 'salesTargets',        // (Phase 6.I — mục tiêu doanh số per year × branch, admin set)
  TASKS: 'tasks',                       // (Phase 7 — Đề xuất · Nhiệm vụ · Giao việc với approval cross-block)
  DASHBOARD_SNAPSHOTS: 'dashboardSnapshots', // (Phase 3 tạo mới)
  DEPARTMENTS: 'departments',
  ROLES: 'roles',
  SYSTEM_ERRORS: 'systemErrors',   // (Phase 8 — log lỗi hệ thống, ADMIN xem qua dashboard banner)
  PERSONAL_TASKS: 'personalTasks', // (Phase 9 — không gian làm việc cá nhân; owner-only CRUD, admin KHÔNG đọc)
  PERSONAL_JOURNAL: 'personalJournal', // (Phase 9b — nhật ký công việc hằng ngày; owner-only)
  PERSONAL_HABITS: 'personalHabits',   // (Phase 9b — thói quen + streak; owner-only)
  PERSONAL_GOALS: 'personalGoals',     // (Phase 9b — mục tiêu cá nhân đa lĩnh vực; owner-only)
  PERSONAL_LEARNING: 'personalLearning', // (Phase 9 — mục tiêu học tập cá nhân)
  AI_ASSISTANT_LOGS: 'aiAssistantLogs',   // (Phase 9 — log AI cá nhân, owner-only)
  CHECKLIST_RUNS_V2: 'checklistRunsV2',   // (Phase 10 — module Checklist v2 spec 2026-05-28; song song /checklist cũ)
  CHECKLIST_NOTIFICATIONS_V2: 'checklistNotificationsV2', // (Phase 10 — thông báo cấp trên khi user submit)
  CONVERSATIONS: 'conversations',         // (Phase 13 — Chat: 1-1 + group. Subcollection messages.)
} as const;

// Subcollection names — đứng trong context của doc cha.
export const SUBCOLLECTIONS = {
  ITEMS: 'items',                       // checklists/{id}/items + templates/{id}/items
  EVIDENCE_FILES: 'evidenceFiles',      // checklists/{id}/evidenceFiles
  COMMENTS: 'comments',                 // tasks/{id}/comments — timeline + status change + approval
  MESSAGES: 'messages',                 // conversations/{cid}/messages — Phase 13 chat
} as const;
