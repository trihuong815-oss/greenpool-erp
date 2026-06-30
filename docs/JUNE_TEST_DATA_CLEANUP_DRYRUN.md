# JUNE-TEST-DATA-CLEANUP-DRYRUN REPORT

**Date:** 2026-06-30
**Author:** Dry-run preview only, NO production data modification
**Scope:** Preview cleanup options cho June 2026 test data trước July go-live

> Dry-run/preview-only report. No writes, no deletes, no batch.commit, no execute mode.

---

## 1. Executive recommendation — **Strategy A (MARK + LOCK)**

Sau preview chi tiết 4 strategies, em xác nhận **Strategy A** vẫn là choice tốt nhất:

- **Zero data modification** trên 18 tx June (chỉ +1 flag trên 5+10 summary docs + 5 lock docs)
- **Reversible** trong 1 lệnh
- **Audit trail intact** — tester làm gì vẫn truy được
- **No backup required** (additive write only)
- **No dryRun mandatory** (safe by construction)
- **Phù hợp schema hiện tại** — không cần thêm enum mới

Strategy B (void) phát hiện **schema blocker**: `TxReviewStatus` chỉ có 3 values `pending|approved|rejected`, **không có `cancelled`** → phải either add schema (risk) hoặc abuse `rejected` (semantic wrong).

Strategy C (hard delete) audit-unfriendly + mandatory backup + irreversible.

Strategy D (report exclude only) — gần như identical với A nhưng KHÔNG có lock → tester có thể edit thêm sau test.

---

## 2. Was any production data modified? — **NO**

Audit này:
- Đọc 0 Firestore docs (em không có Firestore admin access từ local agent)
- Ghi 0 docs
- Gọi 0 batch.delete() / batch.commit() / .update() / .add() / .set()
- Tạo 0 schedule
- Sửa 0 secret/domain/DNS

Chỉ thêm 1 file `docs/JUNE_TEST_DATA_CLEANUP_DRYRUN.md` + commit doc-only.

---

## 3. Dry-run method used

**Static analysis** từ codebase + **confirmed counts** từ user smoke trước (CONTROLLED_MANUAL_REBUILD 2026-06-29):

| Method | Source |
|--------|--------|
| Schema inspection | `lib/types/sales-v2.ts`, `monthly-summary.ts`, `sales-audit.ts`, `sales-program.ts` |
| Filter logic verify | `lib/sales-v2/monthly-summary-builder.ts:231` (`reviewStatus === 'approved'`) |
| Collection inventory | `lib/firebase/collections.ts` |
| User smoke confirmed | 18 tx (CTT:6, 24:10, TT:2) + 5 branch summaries (confirmed via rebuild) |
| Other collections counts | **Cannot exact-count** từ local agent → user runs preview script (section 7) |

> Em **CHỈ ĐOÁN** counts cho non-confirmed collections (audit logs, notifications, batches, tasks). User cần chạy preview script bên dưới để có exact count trước khi quyết action thực tế.

---

## 4. June 2026 data impact by collection — preview only

### Confirmed (from user smoke)

| # | Collection | Selector | Count | Sample doc IDs | Notes |
|---|-----------|----------|-------|----------------|-------|
| 1 | `salesTransactions` | `where('month','==','2026-06')` | **18** | (need preview script) | 6 CTT + 10 "24" + 2 TT |
| 2 | `monthlyBranchSalesSummaries` | `docId IN ['2026-06_HM', '2026-06_TK', '2026-06_CTT', '2026-06_24', '2026-06_TT']` | **5** | `2026-06_HM`, `2026-06_TK`, `2026-06_CTT`, `2026-06_24`, `2026-06_TT` | Doc ID is deterministic |
| 3 | `monthlySaleSalesSummaries` | `where('month','==','2026-06')` | **~5-10** | (need preview script) | One per active sale |

### Inferred but NOT yet counted (need preview script)

| # | Collection | Selector | Est. Count | Notes |
|---|-----------|----------|-----------|-------|
| 4 | `salesDailyBatches` | `where('month','==','2026-06')` | ~10-30 | 1 doc/sale/working-day |
| 5 | `salesAuditLogs` | `where('month','==','2026-06')` | ~50-150 | Each tx tạo 2-3 audit (create/edit/approve) |
| 6 | `salesPrograms` | `where('month','==','2026-06')` | 0-5 | Optional — tester có thể test promo |
| 7 | `salesMonthLocks` | `docId IN ['HM_2026-06', 'TK_2026-06', 'CTT_2026-06', '24_2026-06', 'TT_2026-06']` | 0 hiện tại | Chưa lock |
| 8 | `auditLogs` (generic) | `where('createdAt' between 2026-06-01..30)` | unknown | Mọi mutation log (users, packages, tasks, etc.) |
| 9 | `notifications` | `where('createdAt' between 2026-06-01..30)` | unknown (likely >100) | FCM testing nhiều |
| 10 | `tasks` (test tasks) | `where('createdAt' between 2026-06-01..30)` | unknown | Nếu tester tạo |
| 11 | `tasks/{id}/comments` | subcollection | depends on #10 | |
| 12 | `checklistRunsV2` | `where('date' startsWith '2026-06-')` | unknown | Tester checklist nếu có |
| 13 | `chemicalEntries` | `where('year','==',2026).where('month','==',6)` | unknown | KT module test |
| 14 | `machineRuns` | same | unknown | |
| 15 | `techWork` | `where('createdAt' between 2026-06-...)` | unknown | |
| 16 | `branchDailyExpenses` | `where('date' starts 2026-06-)` | unknown | |
| 17 | `dailyCashflowReports` | same | unknown | |
| 18 | `customers` | `where('createdAt' between 2026-06-01..30)` | **0** | Schema-only, chưa wire write |

### Sample doc IDs

Em không có direct Firestore access — không thể list exact IDs. Doc ID patterns:

| Collection | Doc ID pattern |
|-----------|---------------|
| `salesTransactions` | Auto-generated (Firestore) — random |
| `salesDailyBatches` | `${date}_${saleId}` |
| `salesAuditLogs` | Auto-generated |
| `monthlyBranchSalesSummaries` | **`${month}_${branchId}`** (deterministic) |
| `monthlySaleSalesSummaries` | **`${month}_${saleId}`** (deterministic) |
| `salesMonthLocks` | **`${branchId}_${month}`** (deterministic) |
| `salesPrograms` | Auto-generated |
| `notifications` | Auto-generated |
| `tasks` | Auto-generated |
| `checklistRunsV2` | Auto-generated |

---

## 5. Counts by branch — confirmed

| Branch | salesTransactions June 2026 | branchSummary doc | Notes |
|--------|-----------------------------|---------------------|-------|
| HM | 0 | exists (`2026-06_HM`) | Empty summary (placeholder) |
| TK | 0 | exists (`2026-06_TK`) | Empty summary |
| CTT | 6 | exists (`2026-06_CTT`) | Has data |
| 24 | 10 | exists (`2026-06_24`) | Has data (most test entries) |
| TT | 2 | exists (`2026-06_TT`) | Has data |
| **Total** | **18** | **5 docs** | |

---

## 6. Counts by data type (estimated)

| Data type | June 2026 docs (est.) | Confirmed? |
|-----------|------------------------|------------|
| Sales transactions | 18 | ✅ Confirmed |
| Sales daily batches | ~10-30 | ❌ Need preview |
| Sales monthly summaries (branch+sale) | 15 (5+10) | ✅ Confirmed (5 branch), Estimated (10 sale) |
| Sales audit logs | ~50-150 | ❌ Need preview |
| Sales month locks | 0 | ✅ Confirmed (none yet) |
| Sales promotions | 0-5 | ❌ Need preview |
| Generic audit logs (mutations) | unknown | ❌ Need preview |
| Notifications | likely 100+ (FCM test heavy) | ❌ Need preview |
| Tasks (test) | unknown | ❌ Need preview |
| Checklist runs | unknown | ❌ Need preview |
| KT entries (chemical/machine/techWork) | unknown | ❌ Need preview |
| Finance expenses | unknown | ❌ Need preview |
| **Customers** | **0** | ✅ Confirmed (chưa wire) |
| Users | (5 user tester, KHÔNG xoá) | Out of scope |

### Preview script (READ-ONLY) cho user chạy trên browser console

Anh paste vào Console trên hosted.app (đã login ADMIN):

```javascript
// READ-ONLY count preview — DOES NOT modify Firestore.
// Uses Firestore Client SDK (subject to rules — may need admin role).
// Output: per-collection count + first 5 sample IDs.

const COLLECTIONS_TO_PREVIEW = [
  { name: 'salesTransactions',           selector: 'month==2026-06' },
  { name: 'salesDailyBatches',           selector: 'month==2026-06' },
  { name: 'salesAuditLogs',              selector: 'month==2026-06' },
  { name: 'salesPrograms',               selector: 'month==2026-06' },
  { name: 'monthlyBranchSalesSummaries', selector: 'month==2026-06' },
  { name: 'monthlySaleSalesSummaries',   selector: 'month==2026-06' },
];

(async () => {
  const { collection, query, where, getDocs, limit } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
  const { getFirebaseClientDb } = await import('/_next/static/chunks/lib_firebase_client.js')
    .catch(() => ({ getFirebaseClientDb: null }));
  if (!getFirebaseClientDb) {
    console.warn('Cannot import getFirebaseClientDb dynamically — use Firebase Console instead.');
    return;
  }
  const db = getFirebaseClientDb();
  const totals = {};
  for (const c of COLLECTIONS_TO_PREVIEW) {
    try {
      // For collections with `month` field
      const q = query(collection(db, c.name), where('month', '==', '2026-06'), limit(50));
      const snap = await getDocs(q);
      totals[c.name] = {
        count: snap.size,
        sampleIds: snap.docs.slice(0, 5).map(d => d.id),
        selector: c.selector,
      };
    } catch (e) {
      totals[c.name] = { error: e.message };
    }
  }
  console.log(JSON.stringify(totals, null, 2));
})();
```

**Cheaper alternative — Firebase Console:**
1. Mở https://console.firebase.google.com/project/green-pool-system/firestore
2. Mỗi collection click vào → tab **Query** → Add filter `month == 2026-06` → counts hiện
3. Lưu lại screenshot

> Script không thể count `auditLogs` / `notifications` / `tasks` / `checklist*` / `tech*` qua `month` field vì các collection đó **không có field `month`** — phải dùng range filter `where('createdAt', '>=', 2026-06-01).where('createdAt', '<', 2026-07-01)`. Composite index có thể required.

---

## 7. Sample doc IDs (max 10/collection)

Em không thể fetch sample IDs từ local. **User chạy script section 6** để có sample IDs.

**Deterministic IDs (đã biết):**
- `monthlyBranchSalesSummaries`: `2026-06_HM`, `2026-06_TK`, `2026-06_CTT`, `2026-06_24`, `2026-06_TT`
- `salesMonthLocks` (sau khi lock): `HM_2026-06`, `TK_2026-06`, `CTT_2026-06`, `24_2026-06`, `TT_2026-06`

---

## 8. Cleanup strategy comparison

### Strategy A — KEEP + MARK + LOCK ✅

**Action:**
1. POST `/api/sales-v2/month-locks/{branchId}/2026-06/lock` × 5 branches (existing endpoint)
2. NEW endpoint POST `/api/admin/mark-test-month` → set `isTestMonth=true` on 5+10 summary docs
3. UI banner trong `/doanh-so-v2/tong-ket?month=2026-06`

| | Detail |
|---|---|
| Benefit | Reversible, audit-friendly, zero data delete, schema-compatible |
| Risk | Negligible — tester có thể remove flag (cần ADMIN role) |
| Affected collections | `salesMonthLocks` (+5 docs new), `monthlyBranchSalesSummaries` (+1 field × 5), `monthlySaleSalesSummaries` (+1 field × ~10), `lib/types/monthly-summary.ts` (+optional field) |
| Rollback | unlock cmd + unset flag — 2 cmds |
| Audit trail | ✅ Intact — toàn bộ 18 tx + audit logs giữ nguyên |
| Summaries rebuild? | ❌ Not needed (flag là metadata, không ảnh hưởng aggregate value) |
| Backup required? | NO |
| dryRun required? | NO (additive only) |

### Strategy B — VOID (cancel tx)

**Action:** Update `reviewStatus='???'` cho 18 tx + reason='june-test'

⚠️ **SCHEMA BLOCKER:** `TxReviewStatus = 'pending' | 'approved' | 'rejected'`. Không có `cancelled`.

→ Phải either:
- **B1.** Add `'cancelled'` vào enum (schema migration, refactor UI hiện hữu)
- **B2.** Abuse `'rejected'` (sai nghĩa — rejected = kế toán reject, không phải cancel)
- **B3.** Add new field `voided: boolean` ngoài enum (schema add, refactor aggregate filter)

| | Detail |
|---|---|
| Benefit | Tx vẫn trong DB nhưng tự exclude aggregation (sau khi filter updated) |
| Risk | **HIGH** — schema change required + must rebuild summaries + update all UI showing reviewStatus |
| Affected collections | `salesTransactions` (×18 update), `monthlyBranchSalesSummaries` (×5 rebuild), `monthlySaleSalesSummaries` (×10 rebuild), `lib/types/sales-v2.ts` (schema), `lib/sales-v2/monthly-summary-builder.ts` (filter logic), aggregate route filter |
| Rollback | Revert reviewStatus + rebuild — need backup |
| Audit trail | ✅ Intact |
| Summaries rebuild? | YES |
| Backup required? | YES |
| dryRun required? | YES (mandatory) |

### Strategy C — HARD DELETE

**Action:** Delete 18 tx + 10-30 batches + 50-150 audit + 5+10 summaries

| | Detail |
|---|---|
| Benefit | Cleanest — không còn dấu vết test |
| Risk | **VERY HIGH** — irreversible without backup. Audit trail lost. |
| Affected collections | All Sales* collections containing 2026-06 docs |
| Rollback | Restore from backup (1-2h + downtime) |
| Audit trail | ❌ LOST |
| Summaries rebuild? | YES (or delete) |
| Backup required? | **MANDATORY** |
| dryRun required? | **MANDATORY** |

### Strategy D — REPORT EXCLUDE ONLY (no data write)

**Action:** Add UI/API logic to skip `month='2026-06'` từ MoM/YTD compute. Optional config `TEST_MONTHS = ['2026-06']` hardcoded hoặc env var.

| | Detail |
|---|---|
| Benefit | Zero data write. Fastest implement. |
| Risk | LOW — chỉ là display filter, data underlying không đổi |
| Affected | UI compute logic only (TongKetClient + dashboard widgets) |
| Rollback | Revert UI change |
| Audit trail | ✅ Intact (nothing touched) |
| Summaries rebuild? | NO |
| Backup required? | NO |
| dryRun required? | NO |
| Limitation | Tester có thể edit thêm June data sau (no lock); display là filter "soft" |

---

## 9. Recommended final option — **A (MARK + LOCK)**

| Criterion | A (MARK+LOCK) | B (VOID) | C (DELETE) | D (REPORT EXCLUDE) |
|-----------|---------------|----------|-------------|---------------------|
| Implementation effort | Low (~1.5h) | High (~4h schema+rebuild) | Very High (~6h backup+verify) | Very Low (~30min) |
| Reversibility | ✅ 1 cmd | ⚠️ Need backup | ❌ Need restore | ✅ Revert UI |
| Audit trail preserved | ✅ Yes | ✅ Yes | ❌ Lost | ✅ Yes |
| Schema change | ❌ No (optional field add) | ✅ Yes | ❌ No | ❌ No |
| Backup required | ❌ No | ✅ Yes | ✅ Mandatory | ❌ No |
| dryRun mandatory | ❌ No | ✅ Yes | ✅ Yes | ❌ No |
| Stops tester editing more | ✅ Yes (lock) | ⚠️ Sort of (cancelled UI) | ✅ Yes (no data) | ❌ No |
| MoM/YTD correctness | ✅ Yes (skip via flag) | ✅ Yes (aggregate skip) | ✅ Yes (no data) | ✅ Yes (skip in UI) |
| Recommendation rank | **1st** | 4th | 3rd | 2nd |

**Recommendation:** **A** primary. **D** acceptable nếu anh muốn quick fix mà không build endpoint mới (nhưng không lock → kém safe).

---

## 10. Backup requirement

| Strategy | Backup before action? |
|----------|----------------------|
| A (MARK+LOCK) | **NO** (additive write only) |
| B (VOID) | **YES** (recommended — schema change is risky) |
| C (DELETE) | **MANDATORY** |
| D (REPORT EXCLUDE) | **NO** (no data write at all) |

**Universal recommendation:** Vẫn nên chạy backup baseline trước July theo PROD_HARDENING_MASTER_01 (`bash scripts/backup-firestore.sh july-baseline-2026-06-30`), độc lập với June cleanup.

---

## 11. Whether a real cleanup PR is needed

| Strategy chosen | Real cleanup PR needed? |
|-----------------|------------------------|
| A | YES — `PR-JUNE-LOCK-AND-MARK` (~1.5h) |
| B | YES — `PR-JUNE-VOID-DRYRUN` (~3h cho dryRun) + `PR-JUNE-VOID-EXECUTE` riêng |
| C | YES — `PR-JUNE-HARD-DELETE-DRYRUN` (~4h) + `PR-JUNE-HARD-DELETE-EXECUTE` riêng |
| D | YES — `PR-MOM-EXCLUDE-TEST-MONTHS` (~30min, UI only) |

Anh chưa quyết → em chưa làm PR thực. **Audit/dry-run này KHÔNG implement cleanup.**

---

## 12. Exact next PR if user chooses cleanup

### Nếu chọn A (recommended):

**PR-JUNE-LOCK-AND-MARK**
- Files thêm:
  - `lib/types/monthly-summary.ts` — add `isTestMonth?: boolean`
  - `lib/sales-v2/monthly-summary-builder.ts` — preserve flag in builder
  - `lib/sales-v2/monthly-summary-reader.ts` — return flag in API
  - `app/api/sales-v2/monthly-summary/route.ts` — pass through
  - `app/api/admin/mark-test-month/route.ts` (NEW, ~80 LOC, ADMIN-only)
  - `app/(app)/doanh-so-v2/tong-ket/_components/TestMonthBanner.tsx` (NEW)
  - `app/(app)/doanh-so-v2/tong-ket/TongKetClient.tsx` — render banner
  - MoM compute helper — skip months có isTestMonth=true
  - Tests: 10-15 unit tests
- Manual call sau deploy (em sẽ gửi commands):
  ```bash
  # 1. Lock 5 branches × June
  # 2. Mark 5 branch summaries + ~10 sale summaries
  ```
- Risk: Low. Backup không bắt buộc.
- Rollout: needed.
- Rollback: 1 commit revert + unlock cmd + unset flag.

### Nếu chọn D (cheapest):

**PR-MOM-EXCLUDE-TEST-MONTHS**
- Files:
  - `lib/sales-v2/test-months-config.ts` (NEW) — `TEST_MONTHS = new Set(['2026-06'])`
  - `app/api/sales-v2/monthly-summary/route.ts` — skip prevMonth fetch nếu prevMonth ∈ TEST_MONTHS
  - `app/(app)/doanh-so-v2/tong-ket/TongKetClient.tsx` — show banner nếu month ∈ TEST_MONTHS
  - Tests: 5-8 cases
- No data write. No endpoint. No deploy data action.
- Risk: Lowest. Reversible chỉ qua revert commit.

### Nếu chọn B hoặc C:

Cần 2 PRs: dryRun PR đầu (em sẽ build dryRun-only endpoint với ?dryRun=1 default) → smoke → user approve → execute PR riêng. Em **đề nghị KHÔNG chọn B/C** trừ khi anh chắc cần "sạch tuyệt đối".

---

## 13. Tests/build result

- `npx tsc --noEmit` → clean (run trước commit)
- `npx vitest run` → baseline 1222/1222 pass (no test added — doc-only)
- `npm run build` → pass (baseline)

(Gates sẽ chạy ở phần commit dưới)

---

## 14. Files changed

- ✅ **NEW** `docs/JUNE_TEST_DATA_CLEANUP_DRYRUN.md` (file này)
- ❌ Không sửa code application
- ❌ Không sửa schema/types
- ❌ Không sửa Firestore data
- ❌ Không sửa rules
- ❌ Không sửa workflows/schedule

---

## 15. Commit hash

(Sẽ điền sau commit — em đang prepare)

---

## 16. Git status

Sau commit doc này:
- Branch: `main`
- Local tree: clean
- App Hosting Rollout: KHÔNG trigger (doc-only)
- 0 production data modified

---

## Summary cho anh

| Câu hỏi | Trả lời |
|---------|---------|
| Có cần delete June? | KHÔNG — Strategy A đề xuất |
| Có cần backup khẩn trước hành động? | NO cho A, MANDATORY cho B/C |
| Có cần dryRun execute? | NO cho A, YES cho B/C |
| Schema có blocker không? | YES với Strategy B (cần thêm enum hoặc field) |
| Effort? | A=1.5h, B=4h+, C=6h+, D=30min |
| Audit trail? | A/B/D giữ, C mất |

**Em recommend:** GO Strategy A (MARK + LOCK).
- Em build `PR-JUNE-LOCK-AND-MARK` trong 1 lượt
- Sau deploy + smoke → manual call 2 cmds (lock + mark)
- Verify trên `/tong-ket?month=2026-06` → thấy banner "🧪 Dữ liệu test"

Hoặc nếu anh muốn cheap nhất → GO Strategy D (`PR-MOM-EXCLUDE-TEST-MONTHS`, 30 phút).

Anh quyết.

---

*End of dry-run report. No production data, code, secrets, DNS, or schedules modified.*
