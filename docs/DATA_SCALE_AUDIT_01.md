# DATA-SCALE-AUDIT-01 REPORT

**Date:** 2026-06-30
**Author:** Audit-only, no production changes
**Scope:** Full Green Pool ERP codebase + Firestore data model
**Target scale:** 150–300 users, 5 cơ sở, 3-10 năm production

> Audit-only report. No code/data/secret/DNS/schedule changes.

---

## 1. Executive summary

Green Pool ERP đã có nền tảng tốt: ~50 composite indexes đã deploy, 39 collections SSOT, Firestore Rules 554 dòng comprehensive, audit log coverage cao cho tất cả business mutations, monthly materialized summary đã có raw fallback + active-month guard (PR-04B).

**Risks chính cho long-term scale:**

- **2 cron handlers full-scan `users`** không có `.limit()` (cleanup-stale-fcm, send-morning-summary) → P0 trước 150 users
- **4 module UI vẫn dùng client-side merge / realtime onSnapshot** trên growing collection (giao-viec 7-query merge, tin-nhan conversations + messages, monthly-summary cap 5000) → P1 trước 300 users
- **0 retention policy** cho collections growing forever: `notifications`, `conversations.messages`, `tasks.comments`, `salesAuditLogs`, `personalJournal`, `chatAccessLogs`, `systemErrors`, `salesTransactions`
- **Audit log coverage 100%** ✅ — không phát hiện gap

**Verdict:** Safe đến ~150 users. Nâng đến 300 users cần fix P0 + setup retention crons + extend monthly summary pattern cho 2-3 modules khác.

---

## 2. Overall readiness score (0–10)

| Module | Score | Notes |
|--------|-------|-------|
| Sales (v2 + monthly summary) | **8/10** | Materialized summary + active-month guard + cap 5000 với truncated banner. Thiếu: retention cho `salesTransactions` + `salesAuditLogs`. |
| Task | **6/10** | 7-query merge in-memory + 200 hard cap, không cursor pagination. Audit OK. |
| Checklist (v2) | **8/10** | Soft-delete cron đã có. Bounded ≤30 items/run. |
| Notification / FCM | **5/10** | FCM cleanup cron đã có ✅. NHƯNG `notifications` collection không TTL — grow forever. Bell dropdown limit 50 nhưng base collection unbounded. |
| Accounting / Debt | **7/10** | Composite indexes đã deploy cho `branchDailyExpenses` + `dailyCashflowReports`. Per-month scoped. |
| User / Role | **7/10** | Small (<300 users). Rules comprehensive. Issue: full-scan ở 2 cron. |
| Chat / Tin nhắn | **5/10** | Realtime onSnapshot trên conversations + messages = cost escalate linearly với active users. Limit 100. Không archive. |
| Personal workspace | **7/10** | Owner-only. `personalJournal` grow per user vô hạn nhưng low volume. |
| **WHOLE ERP** | **7/10** | Production-safe ngắn hạn (≤150 users). Cần roadmap retention + cursor pagination. |

---

## 3. Firestore collections inventory

(Source: [lib/firebase/collections.ts](lib/firebase/collections.ts))

### Master / config (rarely change)
| Collection | Purpose | Volume | Risk |
|-----------|---------|--------|------|
| `branches` | 5 cơ sở fixed | 5 docs | None |
| `departments`, `roles` | Org structure | ~20 docs | None |
| `users` | User accounts | 100–300 docs | Medium (cron full scan) |
| `packages`, `packageGroups` | Master gói SP | ~50–200 docs | None |
| `salesReceptionPricing` | Đơn giá lễ tân | 5 docs (1/branch) | None |

### Transactional core (high write volume)
| Collection | Purpose | Volume / year | Risk |
|-----------|---------|---------------|------|
| `salesTransactions` | Mỗi dòng grid 1 doc | 50K–500K/year (5 branches × 10K–100K) | **HIGH** — no retention |
| `salesDailyBatches` | 1 doc / sale / ngày | ~10K–30K/year | High |
| `salesAuditLogs` | Audit kế toán | 15K–60K/year | High |
| `salesPrograms` | Promo theo tháng | ~300–600/year | Low |
| `salesMonthLocks` | DocId deterministic | 60 docs/year | None |
| `tasks` | Giao việc / proposal | 5K–20K/year | Medium |
| `tasks/{id}/comments` | Timeline + approval | 25K–100K/year | High — no retention |
| `checklistRunsV2` | Daily checklist | 50K–150K/year | Medium — soft-delete có |
| `chemicalEntries`, `machineRuns` | KT operational | 10K–30K/year mỗi loại | Medium |
| `techWork` | KT tasks + reports + proposals | 2K–10K/year | Medium |
| `branchDailyExpenses`, `dailyCashflowReports` | Finance daily | 5K–10K/year mỗi loại | Medium |

### Aggregation / cache
| Collection | Purpose | Volume | Risk |
|-----------|---------|--------|------|
| `monthlyBranchSalesSummaries` | Materialized per branch+month | 60/year | Low |
| `monthlySaleSalesSummaries` | Materialized per sale+month | 600–1200/year | Low |
| `dashboardSnapshots` | KPI snapshots | 30–100/year | Low |

### Personal / user-owned
| Collection | Purpose | Volume / user / year | Risk |
|-----------|---------|----------------------|------|
| `personalTasks` | Cá nhân tasks | 50–200 | Low (limit 200) |
| `personalJournal` | Nhật ký | 100–365 | **Medium** — grow forever per user |
| `personalHabits`, `personalGoals`, `personalLearning` | Owner-only | 5–50 | Low |
| `aiAssistantLogs` | AI history | 50–500 | Medium |

### Communication
| Collection | Purpose | Volume | Risk |
|-----------|---------|--------|------|
| `conversations` | Chat 1-1 + group | 500–3000 lifetime | Medium |
| `conversations/{cid}/messages` | Subcoll messages | 50K–500K lifetime | **HIGH** — no retention, realtime onSnapshot |
| `chatAccessLogs` | Security audit chat | 5K–30K/year | High — no retention |
| `notifications` | Bell + sidebar badge | 10K–60K/year | **HIGH** — no TTL |

### Infrastructure / ops
| Collection | Purpose | Volume | Risk |
|-----------|---------|--------|------|
| `auditLogs` | Generic audit | 7K–36K/year | High — no retention (compliance) |
| `rateLimits` | Counter | <1K (rolling window) | Low |
| `systemErrors` | Error banner | 2K–18K/year | Medium |
| `salesProgramReminderLog` | Cron dedupe | <500/year | Low |

### Foundation (chưa wire write)
| Collection | Status |
|-----------|--------|
| `customers` | Schema-only (PR-DATA-01). Chưa endpoint write/read. |

### Legacy / dead code
| Collection | Status |
|-----------|--------|
| `salesMonthlySummary` | Dead — superseded by `monthlyBranchSalesSummaries` (PR-SUMMARY-03 comment line 78-79) |
| `facilities` | Legacy backup (rules line 189) |

**Total: 39 collections + 4 subcollections.**

---

## 4. High-growth collections

Sorted by projected docs/year at 150 users × 5 branches:

| Collection | docs/year | Bottleneck risk |
|-----------|-----------|------------------|
| `conversations/{cid}/messages` | 100K–500K | Realtime onSnapshot cost; no archive |
| `salesTransactions` | 50K–500K | Per-month aggregation slow without summary; raw cap 5000 |
| `notifications` | 10K–60K | Bell badge query scan; no TTL |
| `salesAuditLogs` | 15K–60K | Compliance retention needed |
| `checklistRunsV2` | 50K–150K | Soft-delete có ✅ |
| `tasks/{id}/comments` | 25K–100K | Timeline read on detail modal |
| `auditLogs` | 7K–36K | Compliance retention needed |

---

## 5. High-risk queries (file:line refs)

### P0 — Fix trước 150 users

**1. [app/api/cron/cleanup-stale-fcm/route.ts:33-35](app/api/cron/cleanup-stale-fcm/route.ts#L33-L35)**
```ts
.where('status', '==', 'active').get()   // NO LIMIT — full users scan
```
- Risk: tại 300 users, đọc 300 docs/run × loop để filter `fcmDevices` array
- Fix: thêm `.limit(500)` + cursor `startAfter(lastDoc)` loop nếu vượt

**2. [app/api/cron/send-morning-summary/route.ts:50-52](app/api/cron/send-morning-summary/route.ts#L50-L52)**
```ts
.where('status', '==', 'active').get()   // NO LIMIT
```
- Risk: cùng pattern + chạy daily 7:00 VN → spike read sáng
- Fix: cùng cursor pagination như #1

### P1 — Fix trước 300 users

**3. [app/api/tasks/route.ts:114-172](app/api/tasks/route.ts#L114-L172)** — 7 parallel queries merged in-memory
- Mỗi query `.limit(200)` → up to **1400 docs** load + de-dup client-side
- Risk: nếu 1 trong 7 scope > 200 docs → silent drop
- Fix: cursor pagination per query + return total cho UI

**4. [app/api/sales/route.ts:76-86](app/api/sales/route.ts#L76-L86)** — sales list `where(branchId).where(closeSource).where(status).limit(500)`
- No `orderBy` + cursor
- Risk: 5 branches × 500 = 2500 docs max
- Fix: cursor pagination + `orderBy(createdAt desc)`

**5. [app/api/sales/month-detail/route.ts:59-81](app/api/sales/month-detail/route.ts#L59-L81)** — 4 parallel `.get()` **NO LIMIT** trên per-month/branch scope
- Acceptable < 100K docs nhưng nên có guard
- Fix: thêm `.limit(5000)` mỗi query + warning banner nếu hit

**6. [app/api/cron/proposal-stale-recipient/route.ts:45-54](app/api/cron/proposal-stale-recipient/route.ts#L45-L54)** — N+1 user lookup
- Fix: batch lookup `getAll(userRefs)`

**7. [app/api/sales-v2/monthly-summary/route.ts:212-215](app/api/sales-v2/monthly-summary/route.ts#L212-L215)** — raw fallback cap 5000
- Đã có summary fast path (PR-04) + truncated banner UI
- Cần: extend summary pattern cho `salesCustomers`, `adHocSummary`, `batchStats`, `txStatusStats` (hiện vẫn raw cap 5000)

**8. [app/api/chat/users/search/route.ts:19](app/api/chat/users/search/route.ts#L19)** — full users scan
- Comment đã ghi "~50 users OK; >500 needs Algolia"
- Fix khi >300 users: external search service (Algolia/Meilisearch)

### P2 — Monitor

- Personal endpoints (limit 200) — owner-scoped, low volume
- Notification API (limit 50) — well-scoped
- Audit history (cursor-based) — properly paginated
- KT work (limit 200) — index pending production deploy

---

## 6. Pages/APIs likely to slow down

| Page / API | Module | Reason | Risk |
|-----------|--------|--------|------|
| `/giao-viec` GiaoViecClient | Task | 7-query merge → 1400 docs/load | **P1** |
| `/tin-nhan` TinNhanClient | Chat | onSnapshot trên `conversations` (limit 100) | **P1** cost |
| `/tin-nhan/{cid}` MessageThread | Chat | onSnapshot trên `messages` subcoll (limit 100) | **P1** cost |
| `/doanh-so-v2/tong-ket` TongKetClient | Sales | Raw cap 5000 cho dynamic fields | **P1** truncation |
| `/dashboard` | Dashboard | Server-side aggregated — OK | P2 |
| `/users` UsersClient | User mgmt | Fetch all on mount, client filter | P2 (<300) |
| `/sodo` OrgChartClient | Org | Server-side static props | P2 |
| `/checklist-v2` | Checklist | Single-instance per shift | P2 |
| `/cong-viec-ca-nhan` | Personal | limit(200) per panel | P2 |
| `/de-xuat`, `/thong-bao`, `/phe-duyet` | Approval/noti | Server-side bounded | P2 |
| `/audit-history` | Audit | Cursor pagination ✅ | P2 |

---

## 7. Missing pagination/cursor risks

| File | Issue |
|------|-------|
| `app/api/cron/cleanup-stale-fcm/route.ts` | No limit, no cursor — full scan |
| `app/api/cron/send-morning-summary/route.ts` | No limit, no cursor — full scan |
| `app/api/sales/route.ts` | limit 500 nhưng không cursor |
| `app/api/sales/month-detail/route.ts` | 4 queries không limit |
| `app/api/tasks/route.ts` (7 parallel) | limit 200 nhưng không cursor + merge client-side |
| `app/api/chat/users/search/route.ts` | Full scan (comment thừa nhận) |
| `app/(app)/giao-viec/GiaoViecClient.tsx` | Client-side dedupe 1400 docs |
| `app/(app)/tin-nhan/components/MessageThread.tsx` | Realtime onSnapshot không pagination historical |
| `app/(app)/tin-nhan/TinNhanClient.tsx` | onSnapshot 100 conv max — user > 100 groups bị miss |

---

## 8. Missing or likely-needed indexes

### Already deployed (firebase/firestore.indexes.json) — **48 composite indexes**

Good coverage:
- `tasks` × 9 indexes (scope variants)
- `notifications` × 5 indexes (tab/cron variants)
- `techWork` × 4 indexes
- `salesAuditLogs` × 4 indexes
- `salesTransactions` × 5 indexes (PR-INDEX-PLAN-SALESTRANSACTIONS, 2026-06-29)
- `chemicalEntries`, `machineRuns`, `packageSales`, `salesEntries`, `salesPrograms` × 2 mỗi
- `branchDailyExpenses`, `dailyCashflowReports`, `auditLogs`, `discrepancies`, `conversations`, `salesMonthLocks`, `checklistNotificationsV2` × 1-2 mỗi

### Likely missing (cần audit khi feature hit scale)

| Collection | Missing index | Trigger | Priority |
|-----------|---------------|---------|----------|
| `conversations.messages` | `(conversationId, sentAt DESC)` | Khi paginate history | P1 (300 users) |
| `chatAccessLogs` | `(userId, createdAt DESC)` | Khi build audit UI | P2 |
| `systemErrors` | `(handled, createdAt DESC)` | Đã có rule banner | P1 nếu chưa có |
| `salesTransactions` | `(saleId, reviewStatus, date DESC)` | Sale dashboard "my customers" | P1 |
| `customers` | `(phoneNormalized)` + `(primaryBranchId, updatedAt DESC)` | PR-02 customer search | P0 trước go-live customer feature |
| `personalJournal` | `(ownerId, date DESC)` | Khi list journal | P2 (nếu chưa có) |
| `notifications` | `(userId, isRead, isActionRequired, createdAt DESC)` composite 4-field | Bell counter | P2 — current 3-field indexes có thể đủ |

---

## 9. Summary/read-model opportunities

(Beyond existing `monthlyBranchSalesSummaries` + `monthlySaleSalesSummaries`)

| Opportunity | Benefit | Complexity | Priority |
|------------|---------|------------|----------|
| **Daily branch sales summary** (`dailyBranchSalesSummary`) | KPI dashboard không phải re-aggregate | Medium | P1 |
| **Notification counter per user** (denorm count in `users` doc) | Bell badge zero-read | Low | P2 (current query cheap) |
| **Checklist completion summary** (`checklistDailySummary`) | Heatmap không scan runs | Medium | P1 |
| **Task summary by user/month/status** (`taskMonthlySummary`) | GĐ Khối dashboard | Medium | P2 |
| **Debt/payment summary per branch+month** | Accounting dashboard | Medium | P2 |
| **Customer/package summary** (per customer aggregate) | Customer lifetime value | High | P3 (sau khi customer feature ổn) |
| **Approval workflow summary** | Pending queue count | Low | P3 |
| **Audit event summary by entity** | Quick history lookup | Low | P3 |

**Recommended next:** sau khi cut-over domain, focus PR-DAILY-SUMMARY cho sales + checklist (giống pattern PR-SUMMARY-04B nhưng granularity day thay vì month).

---

## 10. Audit log gaps — **NONE FOUND** ✅

(Full coverage verified by agent audit)

| Module | Audit pattern | Status |
|--------|---------------|--------|
| sales-v2 (transactions, programs, batches, month-locks) | `recordSalesAuditIfEnabled` | ✅ |
| tasks (POST, PATCH, approve) | `writeAuditLog` | ✅ |
| packages | `writeAuditLog` | ✅ |
| admin/users PATCH | `writeAuditLog` | ✅ |
| checklist-v2 | `writeAuditLog` | ✅ |
| ky-thuat (chemicals, machines, work) | `writeAuditLog` | ✅ |
| finance/expenses | `writeAuditLog` fire-and-forget | ✅ |
| personal/* | KHÔNG cần (owner-only data) | OK |

**Note:** 2 audit collections song song — `auditLogs` (generic) + `salesAuditLogs` (sales-v2 specific). Có thể merge sau khi cleanup pattern thống nhất.

---

## 11. Archive / retention gaps

**Currently deployed cleanup crons:**
- ✅ `cleanup-stale-fcm` — FCM tokens > 7 days (daily 10:00 VN)
- ✅ `cleanup-checklists` — soft-delete checklist runs/notifications (hourly)
- ✅ `retry-failed-push` — retry backoff (5min)

**Missing retention policy:**

| Collection | Growth | Recommended retention | Priority |
|-----------|--------|------------------------|----------|
| `notifications` | 10K–60K/year | Soft-delete read >30d, hard-delete >90d | **P1** |
| `chatAccessLogs` | 5K–30K/year | Hard-delete >90d (compliance window) | P1 |
| `systemErrors` | 2K–18K/year | Hard-delete handled >180d | P1 |
| `conversations.messages` | 100K–500K | Archive >1 year (cold collection) | P2 |
| `tasks.comments` | 25K–100K | Archive completed >1 year | P2 |
| `salesTransactions` | 50K–500K | Lock month → keep hot. Archive >3 years (compliance) | P2 |
| `auditLogs` + `salesAuditLogs` | 22K–96K | Archive >2 years (compliance). NEVER hard-delete | P2 |
| `personalJournal` | 100–365/user | Owner-controlled retention (UI tool) | P3 |
| `aiAssistantLogs` | 50–500/user | Hard-delete >180d | P3 |

**Suggested retention crons (future PRs):**
1. `cron/cleanup-notifications` — soft-delete read >30d
2. `cron/cleanup-chat-access-logs` — hard-delete >90d
3. `cron/cleanup-system-errors` — hard-delete handled >180d
4. `cron/archive-old-messages` — move >1y messages to cold collection (P2)

---

## 12. Firestore rules / data isolation risks

(Source: [firebase/firestore.rules](firebase/firestore.rules) — 554 lines)

### Strengths ✅
- Helper-based role check (`isAdmin`, `isQLCS`, `isTP`, `userFacility`, `userDepartment`)
- Branch isolation via `matchesUserScope(instanceData)`
- Audit log append-only (line 154)
- catch-all deny ở cuối
- Templates/checklists scope-aware
- Sales-v2 collections có rules riêng (line 406-536)

### Potential risks

| Concern | Location | Risk | Priority |
|---------|----------|------|----------|
| `userProfile()` được gọi mọi check → cost reads | Helpers (line 21) | Cost (per-query 1 extra read) — acceptable | P3 |
| Legacy `profiles/{id}` rule còn (line 312) | Backward compat | Low — Phase 4 đã migrate sang `users` | P3 monitor |
| `facilities/{id}` legacy rule còn (line 189) | Backward compat | Low | P3 |
| Sale chỉ thấy data của mình — check ở **server-side** (API) | Mọi sales-v2 API | Phải verify rules trùng API logic | P1 audit pass |
| `chatAccessLogs` rules cần audit immutable | Line 344 | Check | P1 |
| `notifications` rules cần check userId === request.auth.uid cho read | Line 335 | Check | P1 |

### Read-from-client vs server

App dùng cả 2:
- **Firestore Client SDK** (realtime): chat, FCM badge — phụ thuộc rules
- **Admin SDK** (server API): sales, tasks, audit — bypass rules

→ Rules là **layer 2**. API server-side validate scope là layer 1. OK pattern.

---

## 13. Backup / export recommendations

| Collection | Frequency | Format | Retention | Restore consideration |
|-----------|-----------|--------|-----------|----------------------|
| `salesTransactions` + `salesAuditLogs` | Daily incremental | NDJSON gzip | Forever (compliance) | Mandatory before any migration |
| `salesDailyBatches`, `salesPrograms`, `salesMonthLocks` | Daily | NDJSON gzip | 7 years (compliance) | Critical |
| `users` | Weekly full | JSON | Forever | Critical (auth) |
| `tasks` + `tasks/*/comments` | Daily | NDJSON | 3 years | Important |
| `checklistRunsV2` | Daily | NDJSON | 3 years | Important |
| `monthlyBranchSalesSummaries` + `monthlySaleSalesSummaries` | Daily | NDJSON | Forever | Rebuild from raw if lost |
| `auditLogs` | Daily | NDJSON | Forever (compliance) | Audit trail |
| `customers` (khi có) | Daily | NDJSON | Forever | Critical |
| `personalJournal` etc | Weekly | JSON | Per user retention | Low priority |
| `notifications`, `chatAccessLogs`, `rateLimits`, `systemErrors` | NONE | — | Auto-cleanup | Ephemeral |

**Recommended setup:**
- **Firebase Backup** (native): enable scheduled export to Cloud Storage bucket `gs://greenpool-erp-backups/firestore/{date}`
- **Frequency:** daily 02:00 VN (low-traffic window)
- **Retention:** 30 days hot, 1 year cold
- **Cross-region:** copy backup sang region khác (multi-region resilience)
- **Restore test:** quarterly drill (restore vào staging project, verify)

---

## 14. Priority roadmap

### P0 — Must fix before wider rollout (>150 users)

1. **PR-CRON-LIMIT-USERS** — Add `.limit(500)` + cursor loop cho `cleanup-stale-fcm` + `send-morning-summary` (2 files, ~20 LOC)
2. **PR-INDEX-CUSTOMERS** (chuẩn bị PR-DATA-02) — Add composite indexes `customers (phoneNormalized)` + `(primaryBranchId, updatedAt DESC)` trước khi wire customer write

### P1 — Should fix before 150 users

3. **PR-NOTIFICATION-RETENTION** — Cron soft-delete `notifications` read >30d (1 file ~80 LOC + cron schedule)
4. **PR-CHAT-ACCESS-LOG-RETENTION** — Cron hard-delete `chatAccessLogs` >90d (1 file ~50 LOC)
5. **PR-SYSTEM-ERRORS-RETENTION** — Cron hard-delete `systemErrors` handled >180d (1 file ~50 LOC)
6. **PR-SALES-SUMMARY-EXTEND-PHASE2** — Extend monthly summary cho `salesCustomers` + `adHocSummary` + `batchStats` + `txStatusStats` (eliminate raw 5000 cap completely)
7. **PR-TASKS-CURSOR-PAGINATION** — Replace 7-query in-memory merge with cursor pagination (refactor)
8. **PR-RULES-AUDIT-PASS** — Verify rules trùng server API scope cho sales-v2, chat, notifications (audit + fix any drift)

### P2 — Should fix before 300 users

9. **PR-DAILY-SUMMARY-PATTERN** — Add `dailyBranchSalesSummary` + `checklistDailySummary` (read-model expansion)
10. **PR-CHAT-MESSAGE-PAGINATION** — Infinite-scroll history cho MessageThread
11. **PR-CHAT-MESSAGE-ARCHIVE** — Move messages >1y vào cold collection
12. **PR-TASKS-COMMENTS-PAGINATION** — TaskDetailModal pagination cho timeline
13. **PR-CHAT-USERS-SEARCH-ALGOLIA** — External search service (>500 users)
14. **PR-FIREBASE-BACKUP-SCHEDULE** — Enable Firestore scheduled export
15. **PR-RESTORE-DRILL-DOC** — Documentation cho restore procedure + quarterly drill

---

## 15. Recommended next PRs (small + safe)

Em đề xuất 3 PRs tiếp theo, mỗi PR nhỏ + isolated + có test:

### PR-CRON-LIMIT-USERS (P0, ~1h, low risk)
- Add `.limit(500)` + `startAfter(lastDoc)` loop cho 2 cron handlers
- Test: vitest mock Firestore + verify multi-page iteration
- Build/deploy/smoke production

### PR-NOTIFICATION-RETENTION (P1, ~2h, low risk)
- New cron `cleanup-notifications` daily 03:00 VN
- Soft-delete `isRead=true && createdAt < 30d ago`
- Hard-delete `createdAt < 90d ago`
- Composite index nếu chưa có
- Test + smoke

### PR-DOMAIN-PREP-02 (sau cut-over stable, ~30min)
- Remove `.vercel.app` + `.hosted.app` từ suffix allowlist
- Update tests
- KHÔNG làm trước khi cut-over

---

## 16. Do we need code changes now? — **NO (audit-only)**

**Reason:**
- Current state safe ≤ 150 users
- All identified issues có roadmap rõ ràng
- Domain cut-over chưa diễn ra → focus DNS-prep + summary 04B + secret rotation hoàn tất
- Bất kỳ code change mới sẽ cần test/rollout/risk — không xứng đáng với benefit hiện tại
- 2 P0 (cron limit) là thực sự fix sớm tốt nhưng có thể đợi đến khi user growth chạm 100+ trước khi rollout

**Recommendation:** chấp nhận audit report làm baseline. Mỗi PR roadmap khác (CRON-LIMIT-USERS, NOTIFICATION-RETENTION) launch riêng khi cần, không bundle.

---

*End of audit. No production data, code, secrets, DNS, or schedules modified.*
