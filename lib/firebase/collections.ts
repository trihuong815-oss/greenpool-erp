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
  CHAT_ACCESS_LOGS: 'chatAccessLogs',     // (Phase 13.5 — security audit: log mọi truy cập tin nhắn)
  RATE_LIMITS: 'rateLimits',              // (Phase 13.5 — rate limit counter per user+endpoint)
  NOTIFICATIONS: 'notifications',         // (V6.4 P2 — center thông báo + bell dropdown + lịch sử cá nhân)
  // ─── Module "Doanh số v2" (2026-06-16) ───
  // Song song module sales cũ FROZEN. Workflow: Sale nhập daily batch → Kế toán đối chiếu →
  // Auto-link thanh toán nốt. Xem lib/types/sales-v2.ts.
  SALES_DAILY_BATCHES: 'salesDailyBatches',   // 1 doc / sale / ngày — bảng nhập theo ngày
  SALES_TRANSACTIONS: 'salesTransactions',    // Mỗi dòng grid là 1 doc
  SALES_AUDIT_LOGS: 'salesAuditLogs',          // Log mọi chỉnh sửa của kế toán
  // M2.1 PR-1 (2026-06-20): khoá kỳ tháng × cơ sở. DocId = `${branchId}_${month}`
  // (deterministic). Helper lib/sales-v2/month-lock.ts. PR-3 wire vào tx middleware.
  SALES_MONTH_LOCKS: 'salesMonthLocks',
  // M2.1 PR-5 (2026-06-20): dedupe log cho deadline reminder cron.
  // DocId = `${uid}_${month}_${tag}` (tag: d2/d0/overdue). Doc exists = đã gửi → cron skip.
  SALES_PROGRAM_REMINDER_LOG: 'salesProgramReminderLog',
  SALES_MONTHLY_SUMMARY: 'salesMonthlySummary', // Rebuild via cron daily 23:00
  // ─── V7 Promo (2026-06-18) — Chương trình khuyến mãi theo tháng × cơ sở × gói ───
  // Workflow: QLCS tạo → GD_KD duyệt → GD_VP duyệt → Kế toán cấu hình mã → Sale dùng.
  SALES_PROGRAMS: 'salesPrograms',
  // ─── V8 Reception (2026-06-18) — Doanh thu quầy lễ tân (kế toán nhập daily) ───
  // 1 doc/cơ sở/ngày. Kế toán nhập + self-approve. Aggregate cùng Sale's batches
  // → báo cáo tổng hợp doanh thu ngày của cơ sở (tab mới ở /doi-chieu).
  SALES_RECEPTION_BATCHES: 'salesReceptionBatches',
  // 1 doc/cơ sở — đơn giá mặc định các mục quầy lễ tân (vé lẻ, thuê tủ, làm thẻ...).
  // Admin (ADMIN/CEO/TP_KE) set 1 lần, kế toán nhập daily chỉ cần qty + thực thu.
  SALES_RECEPTION_PRICING: 'salesReceptionPricing',
  // PR-CASH1B (2026-06-23) — Chi phí cơ sở (kế toán cơ sở nhập daily)
  BRANCH_DAILY_EXPENSES: 'branchDailyExpenses',
  // PR-CASH1B (2026-06-23) — Báo cáo thu-chi ngày (auto-aggregate khi NV_KE nộp)
  DAILY_CASHFLOW_REPORTS: 'dailyCashflowReports',
  // PR-DATA-01-CUSTOMER-MASTER-MODEL (2026-06-29) — Customer master (foundation).
  // KHÔNG migration trong PR-01: doc skeleton only, chưa có endpoint write/read.
  // PR-02 sẽ add /api/customers/search; PR-03 sẽ link customerId vào tx mới.
  // Audit 10-year scale: ~500K customers/10y. Phải có index phoneNormalized +
  // customerCode + normalizedName + (primaryBranchId, updatedAt DESC) trước go-live.
  CUSTOMERS: 'customers',
  // PR-SUMMARY-03-WRITE-REBUILD-JOB (2026-06-29) — Monthly materialized summary.
  // DocId pattern: ${month}_${branchId} cho per-branch, ${month}_${saleId} cho per-sale.
  // Rebuild qua POST /api/admin/rebuild-monthly-summary (admin only) hoặc cron daily.
  // Legacy 'salesMonthlySummary' (declared L54) là dead code chưa dùng — GIỮ NGUYÊN
  // không xoá, không write nữa. Mọi write/read mới dùng 2 collection bên dưới.
  // Schema: xem lib/types/monthly-summary.ts (MonthlyBranchSalesSummary,
  // MonthlySaleSalesSummary). Builder: lib/sales-v2/monthly-summary-builder.ts.
  MONTHLY_BRANCH_SALES_SUMMARIES: 'monthlyBranchSalesSummaries',
  MONTHLY_SALE_SALES_SUMMARIES: 'monthlySaleSalesSummaries',
} as const;

// Subcollection names — đứng trong context của doc cha.
export const SUBCOLLECTIONS = {
  ITEMS: 'items',                       // checklists/{id}/items + templates/{id}/items
  EVIDENCE_FILES: 'evidenceFiles',      // checklists/{id}/evidenceFiles
  COMMENTS: 'comments',                 // tasks/{id}/comments — timeline + status change + approval
  MESSAGES: 'messages',                 // conversations/{cid}/messages — Phase 13 chat
} as const;
