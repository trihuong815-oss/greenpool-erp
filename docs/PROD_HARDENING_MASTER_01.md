# PROD-HARDENING-MASTER-01 REPORT

**Date:** 2026-06-30
**Author:** Audit-only, no production changes
**Scope:** Full production readiness checkpoint before July real data entry
**Target:** ~50–150 users initial wave, scale to 300 users over 12 months

> Audit-only report. No code/data/secret/DNS/schedule changes.

---

## 1. Executive conclusion — **GO with warnings**

App production-ready cho **employees nhập real data từ tháng 7**, KHI thoả 3 điều kiện trước go-live:

1. ✅ **(DONE)** App Hosting URL ổn định, login/2FA/session làm việc đúng
2. ⚠️ **MUST DO trước go-live**: thực hiện **Firestore backup baseline** (script đã có sẵn — chỉ cần run)
3. ⚠️ **SHOULD DO trước go-live**: smoke notification cleanup dryRun với CRON_SECRET đúng (verify production scope; KHÔNG xoá data)

Mọi P0 từ DATA-SCALE-AUDIT-01 đã clear. Còn P1/P2 nhưng KHÔNG block go-live.

---

## 2. Latest commit + deployment status

| Item | Value |
|------|-------|
| Branch | `main` |
| Latest commit | `656a64c` — `feat: add dry run for notification cleanup` |
| Git tree | **clean** (no untracked, no staged) |
| App Hosting Rollout | ✅ **success** (firebase-app-hosting suite) |
| Quality Gate (GitHub Actions) | ✅ **success** (TS Check, Vitest, Next.js Build, Firestore Rules Compile) |
| Vercel Suite | queued (irrelevant — Vercel chỉ backup, không deploy thật) |

Recent 8 commits (đường đi roadmap):
```
656a64c feat: add dry run for notification cleanup
3c96852 feat: add notification retention cleanup
aafd0d0 chore: add customer firestore indexes
6e709dd fix: bound user scans in cron handlers
d93d957 docs: data-scale-audit-01
5a132d7 chore: prepare production domain config
ca29f63 fix: force raw monthly summary for active months
f64e954 chore: rotate cron secret rollout
```

---

## 3. Employee URL decision

**Use exclusively:**
```
https://greenpool-erp--green-pool-system.asia-southeast1.hosted.app
```

**ABSOLUTELY DO NOT use** `https://greenpool-erp.vercel.app` cho real data entry trong tháng 7:
- Vercel URL còn live (backup cho rollback) nhưng KHÔNG có schedule cron production
- Vercel deploys không có Quality Gate automation
- Data nhập trên Vercel sẽ vẫn đi vào CÙNG Firestore (cùng project) → an toàn về data, NHƯNG cron sẽ không chạy → noti/cleanup/summary stale

**Khi có DNS** (`erp.greenpool.vn`) → cut-over qua PR-DOMAIN-PREP-02 (xem section 14).

**Communications cho employees:**
- Save bookmark exact URL trên: `https://greenpool-erp--green-pool-system.asia-southeast1.hosted.app`
- iOS: Safari → Share → Add to Home Screen (để FCM noti hoạt động)
- Android: Chrome → menu → Install app

---

## 4. July data entry readiness — Detailed

| Check | Status | Note |
|-------|--------|------|
| Login / session | ✅ GO | Email+password + 2FA hoạt động trên App Hosting (PR-DOMAIN-PREP-01 verified) |
| Role permissions | ✅ GO | Firestore Rules 554 dòng comprehensive; server API có scope enforcement |
| Sales data correctness | ✅ GO | Formulas stable, frozen module + raw fallback luôn có |
| Current month raw guard | ✅ GO | PR-SUMMARY-04B active-month + unlocked-month → luôn raw cho tháng đang nhập |
| Raw fallback | ✅ GO | `/api/sales-v2/monthly-summary` luôn fallback raw nếu summary missing/truncated |
| Customer index readiness | ✅ GO | 2 composite indexes deployed (phoneNormalized+updatedAt, primaryBranchId+updatedAt) cho PR-DATA-02 sẵn sàng |
| Cron safety | ✅ GO | 2 user-scanning cron đã bounded `.limit(500)` (PR-CRON-LIMIT-USERS) |
| Data-scale P0 risks | ✅ CLEARED | 2/2 P0 closed (cron-limit + indexes) |
| Firestore rules compile | ✅ GO | Compile pass trong Quality Gate |
| Notification cleanup safety | ⚠️ DEPLOYED BUT UNTESTED | Endpoint live + auth-gated + dryRun mode + schedule OFF. Production smoke chưa chạy. |
| Backup readiness | ⚠️ SCRIPT EXISTS, NO BASELINE | `scripts/backup-firestore.sh` có sẵn nhưng CHƯA chạy baseline backup |
| Known dangerous items | ⚠️ See section 13 | Không có blocker; có 4 items advisory |

**Verdict: GO with warnings.** 2 must-do items (section 15) trước employees nhập data.

---

## 5. Data safety / backup readiness

### Existing infrastructure
- **Script available:** [scripts/backup-firestore.sh](scripts/backup-firestore.sh) (50 LOC)
- Sử dụng `gcloud firestore export` (async, Google-managed)
- Destination: `gs://green-pool-system.firebasestorage.app/firestore-backups/<tag>`
- Default tag: timestamp `YYYY-MM-DD_HHMMSS`

### Minimum plan BEFORE July go-live

**Day -1 baseline backup:**
```bash
bash scripts/backup-firestore.sh july-baseline-2026-06-30
```
- 1 lần duy nhất, tag rõ ràng để dễ tìm
- Đợi Google process xong (~1-5 phút) → verify tại Cloud Console
- Restore drill (optional nhưng recommend): export thử vào project staging, verify shape

### Recommended retention plan (post go-live)

| Frequency | Method | Retention | Use case |
|-----------|--------|-----------|----------|
| **Daily 02:00 VN** | Cloud Scheduler trigger | 30 days hot | Routine point-in-time recovery |
| **Weekly Sunday** | Tag-based incremental | 1 year | Historical compliance |
| **Before major op** | Manual `backup-firestore.sh <reason>` | Forever | Migration / destructive PR / month-end lock |
| **Quarterly drill** | Manual restore vào staging | Test pass/fail | Verify backup integrity |

### Collections priority cho backup

| Priority | Collections | Reason |
|----------|------------|--------|
| **Critical (must)** | `salesTransactions`, `salesAuditLogs`, `salesDailyBatches`, `salesMonthLocks`, `customers`, `auditLogs`, `users` | Business + compliance |
| **High** | `tasks`, `tasks/*/comments`, `checklistRunsV2`, `monthlyBranchSalesSummaries`, `monthlySaleSalesSummaries` | Operational |
| **Medium** | `chemicalEntries`, `machineRuns`, `techWork`, `branchDailyExpenses`, `dailyCashflowReports`, `salesPrograms`, `packages*` | Module-specific |
| **Low (auto-cleanup)** | `notifications`, `rateLimits`, `systemErrors`, `chatAccessLogs` | Ephemeral |

> `gcloud firestore export` ALL collections by default; per-collection flag chỉ cần khi muốn skip ephemeral.

### Commands (do NOT run without approval)

**1. Baseline backup before July:**
```bash
bash scripts/backup-firestore.sh july-baseline-2026-06-30
```

**2. List backups:**
```bash
gsutil ls gs://green-pool-system.firebasestorage.app/firestore-backups/
```

**3. Verify backup completed:**
```
Console: https://console.cloud.google.com/firestore/databases/-default-/import-export?project=green-pool-system
```

---

## 6. Auth/session status

| Component | Status |
|-----------|--------|
| Firebase Auth (email+password+2FA) | ✅ Hoạt động trên hosted.app domain |
| Session cookie (`gp_session`) | ✅ HttpOnly + Secure + SameSite=lax + host-only, TTL 14d |
| CSRF origin check (proxy.ts) | ✅ Allowlist origin + hosted.app/vercel.app suffix; HTTP/2 fix verified |
| Middleware top-level try/catch | ✅ Edge Runtime crash returns JSON 500, không text/plain |
| Phase-tagged session route | ✅ Differentiated 400/401/429/500 errors |
| Private key normalize | ✅ Handles multiline + escaped \n + quoted env |
| MONTHLY_SUMMARY_CRON_SECRET v3 | ✅ Rotated + grantaccess success |
| CRON_SECRET | ✅ Existing (chưa rotate) |

**No action needed.** Auth pipeline production-ready.

---

## 7. Sales correctness status

| Item | Status |
|------|--------|
| Monthly summary builder | ✅ Stable (PR-SUMMARY-02, 03, 03A) |
| Materialized rebuild service | ✅ POST `/api/admin/rebuild-monthly-summary` (ADMIN/CEO only) |
| Active-month raw guard (PR-04B) | ✅ Current VN month luôn raw → realtime tháng đang nhập |
| Unlocked-month raw guard | ✅ Month chưa locked → raw → bắt new entry |
| Locked historical | ✅ May use materialized summary nếu eligible |
| Raw fallback | ✅ Luôn fallback raw nếu summary missing/truncated |
| Source observability | ✅ Response có `_source: 'summary'\|'raw'` + `_sourceReason` |
| 5 composite indexes salesTransactions | ✅ Deployed (PR-INDEX-PLAN-SALESTRANSACTIONS) |
| Cron rebuild endpoint | ✅ POST `/api/cron/rebuild-monthly-summary` (secret-gated) |
| Cron rebuild schedule | ❌ **NOT scheduled** (per design — manual until validated) |

**Formula immutability:** Không thay đổi. Active-month guard + raw fallback đảm bảo tháng đang nhập luôn từ raw → đáng tin 100%.

---

## 8. Firestore rules / data isolation status

### Strengths
- **554 lines** comprehensive coverage
- Helper-based check (`isAdmin`, `isQLCS`, `isTP`, `userFacility`, `userDepartment`)
- Catch-all deny ở cuối
- Append-only audit log
- 39 collections + 4 subcollections có rules riêng

### P1 — Should fix before 150 users
1. **Verify rules trùng server API scope** cho `sales-v2`, `chat`, `notifications`
   - Server API là layer 1 (admin SDK bypass rules); rules là layer 2
   - Drift có thể tồn tại nếu API extend mà rules quên update
   - PR-RULES-AUDIT-PASS sẽ verify systematic

2. **Verify `notifications.userId === request.auth.uid` cho read** (line 335) — đảm bảo user không đọc noti của người khác qua client SDK

3. **Verify `chatAccessLogs` append-only** (line 344) — chỉ create, không update/delete

### P2 — Monitor
- Legacy `profiles/{id}` rule (line 312) — Phase 4 đã migrate sang `users`. Có thể remove sau 2-3 tháng quan sát
- Legacy `facilities/{id}` rule (line 189) — backward compat. Low risk

**No P0.** Rules production-safe ngắn hạn.

---

## 9. Cron / schedule safety status

### Inventory (16 endpoints + 1 workflow)

| Route | Auth | Scheduled? | Modifies prod data | dryRun | Bounded read | Safe? |
|-------|------|-----------|---------------------|--------|--------------|-------|
| `cleanup-stale-fcm` | Bearer | ✅ Daily 03:00 UTC | ✅ (update user.fcmDevices) | ❌ | ✅ `.limit(500)` | ✅ |
| `cleanup-checklists` | Bearer | ✅ Hourly | ✅ (soft-delete checklist) | ❌ | ✅ `.limit(500)` | ✅ |
| `cleanup-notifications` | Bearer | ❌ **Manual only** | ✅ (hard-delete >30d) | ✅ **YES** | ✅ `.limit(500)` | ✅ |
| `rebuild-monthly-summary` | Bearer (MONTHLY_SUMMARY_CRON_SECRET) | ❌ **Manual only** | ✅ (write summary docs) | ❌ | ✅ batch + truncated | ✅ |
| `retry-failed-push` | Bearer | ✅ */5min | ✅ (FCM push) | ❌ | ✅ `.limit(200)` | ✅ |
| `proposal-overdue` | Bearer | ✅ Hourly | ✅ (audit log) | ❌ | ✅ | ✅ |
| `dispatch-overdue` | Bearer | ✅ Hourly | ✅ (audit log) | ❌ | ✅ | ✅ |
| `action-required-stuck` | Bearer | ✅ Hourly | ✅ (notify) | ❌ | ✅ `.limit(200)` | ✅ |
| `proposal-stale-recipient` | Bearer | ✅ Hourly | ✅ (cancel proposal+dispatch) | ❌ | ✅ `.limit(200)` | ⚠️ N+1 user lookup (P1) |
| `program-deadline-reminder` | Bearer | ✅ Daily 02:00 UTC | ✅ (notify) | ❌ | ✅ | ✅ |
| `program-approval-overdue` | Bearer | ✅ Hourly | ✅ (escalate) | ❌ | ✅ | ✅ |
| `program-auto-expire` | Bearer | ✅ Daily | ✅ (set status) | ❌ | ✅ `.limit(500)` | ✅ |
| `send-morning-summary` | Bearer | ✅ Daily 00:00 UTC | ✅ (FCM push + dedup transaction) | ❌ | ✅ `.limit(500)` | ✅ |
| `send-evening-summary` | Bearer | ✅ Daily 13:00 UTC | ✅ (FCM push) | ❌ | ✅ | ✅ |
| `send-reminders` | Bearer | ✅ */5min | ✅ (FCM push) | ❌ | ✅ `.limit(500)` | ✅ |
| `checklist-reminder-{morning,afternoon,evening}` | Bearer | ✅ Per shift | ✅ (notify) | ❌ | ✅ | ✅ |

### `cleanup-notifications` status snapshot

```
DEPLOYED          : YES (commit 656a64c rolled out success)
AUTH-GATE PASS    : YES (timing-safe Bearer CRON_SECRET, 401/405 verified)
DRYRUN-PROD-SMOKE : PENDING (CRON_SECRET/env mismatch reported by user)
SCHEDULE OFF      : YES (no .github/workflows entry — verified via test #25)
```

**Recommendation:** **Defer secret/env mismatch fix** đến khi anh chuẩn bị activate schedule. Endpoint live nhưng không gọi được = không risk. Khi anh muốn turn on schedule sẽ:
1. Verify CRON_SECRET đúng (rotate nếu cần)
2. Smoke dryRun trước (trả 200 + dryRun:true + processed:N)
3. Smoke real cleanup với 1 lần manual
4. Sau 1-2 lần ổn → wire vào `.github/workflows/cron-reminders.yml`

---

## 10. Large-data readiness status

### P0 — **CLEARED**
- ✅ Cron full-scan bounded (PR-CRON-LIMIT-USERS, commit 6e709dd)
- ✅ Customer composite indexes deployed (PR-INDEX-CUSTOMERS, commit aafd0d0)

### P1 — Status after recent work

| Item | Status |
|------|--------|
| Notification retention | ✅ Endpoint deployed (PR-NOTIFICATION-RETENTION + DRYRUN). Schedule deferred |
| Tasks 7-query cursor pagination | ⏳ Not started. **Does NOT block July go-live** (200 task/scope cap đủ cho 50 users) |
| Sales summary extend (eliminate raw 5000 cap) | ⏳ Not started. **Does NOT block** (truncated banner UI fall-back) |
| Rules audit pass | ⏳ Not started. **SHOULD do** sau 1-2 tuần observe |
| chatAccessLogs retention | ⏳ Not started. Cleanup pattern reusable from cleanup-notifications |
| systemErrors retention | ⏳ Not started. Cleanup pattern reusable |

### P2 — Long-term roadmap
- Read-model: daily branch sales summary, checklist completion summary
- Chat message archival (>1 year cold storage)
- Algolia/Meilisearch khi >300 users

---

## 11. Performance risks

| Risk | Where | Priority | Note |
|------|-------|----------|------|
| **Tasks list 7-query merge** (~1400 docs/load) | `app/api/tasks/route.ts:114-172` + `GiaoViecClient.tsx` | P1 | OK đến 50-100 users; refactor trước 200 |
| **Chat realtime onSnapshot cost** | `TinNhanClient.tsx` + `MessageThread.tsx` | P1 | Cost grow linear với active users; OK đến 100 |
| **Sales summary raw cap 5000 (dynamic fields)** | `monthly-summary/route.ts:212-215` | P1 | Truncated banner cảnh báo; chỉ vấn đề nếu 1 branch >5000 tx/month (hiện <100) |
| **Users full-scan** | `chat/users/search/route.ts:19` | P2 | OK đến 300; cần Algolia khi vượt |
| **Tasks comments unbounded** | `TaskDetailModal.tsx` timeline | P2 | Per-task comments grow over time; load all OK đến 100/task |
| **No daily summary** | sales/checklist | P2 | Hiện dùng on-demand aggregate; OK |

**Must fix before July:** Zero.
**Should fix before 150 users:** Tasks cursor + chat onSnapshot pattern.
**Should fix before 300 users:** Algolia search + daily summary + chat archive.

---

## 12. UI/UX / operation risks cho non-tech employees

| Check | Status |
|-------|--------|
| One clear production URL? | ✅ hosted.app domain stable |
| Dangerous admin/cron visible to user? | ✅ `/api/admin/*` và `/api/cron/*` đều auth-gated; UI không lộ link |
| Role menus separated? | ✅ Sidebar render theo role (Sale chỉ thấy doanh số, QLCS thấy cơ sở mình…) |
| Error states understandable? | ✅ Vietnamese error messages (proxy CSRF, session 4xx, rate limit 429) |
| Dashboards readable? | ✅ KPI cards + status chips + tabular numbers — chuẩn |
| Mojibake (encoding)? | ✅ Clean — đã grep `Ã/Â/áº` zero hit |
| Mobile/PWA work? | ✅ Manifest + SW deployed; iOS cần Add to Home Screen cho noti |

**Must-fix usability issues blocking July: NONE.**

Advisory cho roll-out:
- Employees training 30 phút: login + 2FA + add-to-home-screen
- Quan trọng: dạy QLCS biết phân biệt "đang xử lý" vs "chờ duyệt" trong sidebar badge
- ADMIN/CEO biết bookmark `/audit-history` cho compliance trace

---

## 13. Remaining dangerous items + mitigation

| # | Item | Risk | Mitigation |
|---|------|------|-----------|
| 1 | `cleanup-notifications` chưa smoke production | Low — endpoint auth-gated + dryRun + no schedule | Anh chạy dryRun với secret đúng trước khi activate schedule (PR sau) |
| 2 | `rebuild-monthly-summary` chưa schedule | Low — manual rebuild đã verified (5 branches × 2026-06 done) | Wire schedule (PR-SUMMARY-06-SCHEDULE-ACTIVATION) sau khi quan sát 1-2 tuần |
| 3 | Không có backup baseline trước July | Medium — nếu có incident dữ liệu sẽ mất tới Phase 5.A snapshot cũ | Chạy `bash scripts/backup-firestore.sh july-baseline-2026-06-30` (1 phút) |
| 4 | Vercel domain còn live | Low — Vercel & App Hosting same Firestore project nên data integrity OK, nhưng cron không chạy trên Vercel | Communicate cho employees CHỈ dùng App Hosting URL; sau cut-over disable Vercel deploys |
| 5 | `.vercel.app/.hosted.app` suffix allowlist còn rộng | Low — defense-in-depth với SameSite=lax cookie | Remove qua PR-DOMAIN-PREP-02 sau cut-over erp.greenpool.vn |

**Không có blocker.** Tất cả mitigation low/medium effort.

---

## 14. Recommended next PRs (max 8, exact order)

### Trước July go-live (must)

#### 1. **PR-BACKUP-BASELINE-JULY** (P0, 5 phút, zero risk)
- **Goal:** Run baseline Firestore backup trước employees nhập data
- **Files:** None (chỉ chạy script đã có)
- **Risk:** ZERO — backup là read-only export
- **Modifies prod data:** NO
- **Rollout needed:** NO
- **Can do before domain:** YES
- **Rollback:** N/A (additive)
- **Command:** `bash scripts/backup-firestore.sh july-baseline-2026-06-30`

#### 2. **PR-CLEANUP-NOTIF-DRYRUN-SMOKE** (P0, 5 phút, zero risk)
- **Goal:** Verify production scope của notification cleanup TRƯỚC khi schedule
- **Files:** None
- **Risk:** ZERO — dryRun không write
- **Modifies prod data:** NO
- **Command:** Browser console với `prompt()` (em đã gửi snippet)

### Sau July (1-2 tuần observe)

#### 3. **PR-RULES-AUDIT-PASS** (P1, ~2h, low risk)
- **Goal:** Verify Firestore Rules trùng server API scope cho sales-v2, chat, notifications
- **Files:** `firebase/firestore.rules` (audit only — fix any drift)
- **Risk:** Low (rules là layer 2, server enforcement vẫn ổn)
- **Rollback:** revert single commit

#### 4. **PR-SYSTEM-ERRORS-RETENTION** (P1, ~1h)
- **Goal:** Cron hard-delete `systemErrors` handled >180d
- **Files:** new `app/api/cron/cleanup-system-errors/route.ts` + tests
- **Pattern:** Reuse from cleanup-notifications
- **Risk:** Low (manual-only, dryRun)
- **Rollback:** revert commit

#### 5. **PR-CHAT-ACCESS-LOG-RETENTION** (P1, ~1h)
- **Goal:** Cron hard-delete `chatAccessLogs` >90d
- **Pattern:** Reuse from cleanup-notifications
- **Risk:** Low

### Sau khi có DNS

#### 6. **PR-DOMAIN-PREP-02** (P1, ~30 phút)
- **Goal:** Remove `.vercel.app/.hosted.app` suffix allowlist sau cut-over
- **Files:** `lib/auth/request-origin.ts` + tests
- **Pre-req:** Cut-over `erp.greenpool.vn` đã stable 1-2 tuần
- **Risk:** Medium (CSRF tighten) — chỉ chạy sau cut-over verified
- **Rollback:** revert commit

### Schedule activation (chỉ sau smoke OK)

#### 7. **PR-NOTIFICATION-RETENTION-ACTIVATE** (P1, ~15 phút)
- **Goal:** Wire `cleanup-notifications` vào `.github/workflows/cron-reminders.yml` daily 03:30 VN
- **Pre-req:** dryRun smoke OK + 1 real cleanup smoke OK
- **Risk:** Low
- **Rollback:** Remove workflow step

#### 8. **PR-SUMMARY-06-SCHEDULE-ACTIVATION** (P1, ~15 phút)
- **Goal:** Wire `rebuild-monthly-summary` vào schedule (daily 23:00 VN — tháng đang chạy + tháng trước)
- **Pre-req:** Manual rebuild stable 1-2 tuần
- **Risk:** Low

---

## 15. What must be done BEFORE employees enter July data

| Step | Time | Status |
|------|------|--------|
| 1. Run `scripts/backup-firestore.sh july-baseline-2026-06-30` | 5 phút | ⏳ TODO |
| 2. Verify backup completed tại Cloud Console | 5 phút | ⏳ TODO |
| 3. Verify CRON_SECRET hợp lệ (rotate nếu nghi leak) | 5 phút | ⏳ optional |
| 4. Smoke `cleanup-notifications?dryRun=1` với secret đúng | 2 phút | ⏳ TODO |
| 5. Communicate URL cố định cho employees: `https://greenpool-erp--green-pool-system.asia-southeast1.hosted.app` | — | ⏳ TODO |
| 6. Training quick session (login + 2FA + add-to-home-screen) | 30 phút | ⏳ TODO |
| 7. ADMIN bookmark `/audit-history` cho compliance trace | 2 phút | ⏳ TODO |

**Total: ~1 giờ work** trước go-live.

---

## 16. What can wait until AFTER July

- PR-RULES-AUDIT-PASS (1-2 tuần observe trước)
- PR-SYSTEM-ERRORS-RETENTION, PR-CHAT-ACCESS-LOG-RETENTION (khi data accumulate)
- PR-TASKS-CURSOR-PAGINATION (trước 150 users)
- PR-SALES-SUMMARY-EXTEND-PHASE2 (khi 1 branch >5000 tx/month)
- PR-CHAT-MESSAGE-PAGINATION + archive (khi cost lo)
- PR-DAILY-SUMMARY (read-model expansion)
- Algolia search (khi >300 users)
- DNS cut-over → PR-DOMAIN-PREP-02 + Auth Console add erp.greenpool.vn

---

## 17. Files changed (in THIS audit PR)

- ✅ **NEW** `docs/PROD_HARDENING_MASTER_01.md` (~ 400 dòng — file này)
- ❌ Không sửa code application
- ❌ Không sửa config/secret/yaml
- ❌ Không sửa rules

---

## 18. Quality gate results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | (sẽ chạy trước commit) |
| `npx vitest run` | (sẽ chạy — baseline 1222/1222) |
| `npm run build` | (sẽ chạy — baseline pass) |

---

## 19. Git status

- Branch: `main`
- Sau commit doc này → `main` thêm 1 commit `docs: production hardening master checkpoint`
- Local tree: clean (chỉ doc mới được add)
- App Hosting Rollout: KHÔNG trigger (doc-only change, code unchanged)

---

*End of audit. No production data, code, secrets, DNS, or schedules modified.*

*Đề xuất next action: chạy 2 must-do items trong section 15 (backup baseline + cleanup-notifications dryRun smoke). Cả 2 đều 5 phút, zero risk.*
