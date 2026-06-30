# JUNE-TEST-DATA-AUDIT-01 REPORT

**Date:** 2026-06-30
**Author:** Audit-only, no production data modification
**Scope:** June 2026 test data shape + July go-live impact + safe handling options

> Audit-only report. No data deleted, voided, or modified.

---

## 1. Executive recommendation — **MARK + LOCK** (no delete, no void)

Em đề xuất **không xoá** + **không void** June test data. Thay vào đó:

1. **LOCK** `salesMonthLocks/{branchId}_2026-06` cho cả 5 cơ sở → tester không thể edit thêm
2. **MARK** test-data banner ở UI khi user xem báo cáo tháng 2026-06 (display-only, không động data)
3. **EXCLUDE** từ MoM (Month-over-Month) calculation trong July báo cáo via một flag mới `isTestMonth` trên `monthlyBranchSalesSummaries`

Lý do chọn approach này:
- **Audit-friendly**: giữ trace data tester đã nhập → debug được sau này
- **Zero data risk**: không xoá → không cần backup-trước-action
- **Reversible**: chỉ cần unset flag/unlock để dùng lại
- **July real reporting đúng**: report tháng 7 query `where(month='2026-07')` → June data không xen vào
- **Cost: < 30 phút work**, low blast radius

Trường hợp anh muốn "sạch tuyệt đối" → cần làm follow-up PR `JUNE-TEST-DATA-CLEANUP-DRYRUN` (xem section 11).

---

## 2. June 2026 test data inventory

### Confirmed counts (từ CONTROLLED_MANUAL_REBUILD smoke 2026-06-29)

| Collection | Doc count (June 2026) | Source |
|-----------|----------------------|--------|
| `salesTransactions` | **18 tx total** (HM:0, TK:0, CTT:6, **24:10**, TT:2) | Confirmed |
| `monthlyBranchSalesSummaries` | **5 docs** (1/branch) | Rebuilt qua manual cron |
| `monthlySaleSalesSummaries` | **~5-10 docs** (per sale per branch active in June) | Rebuilt cùng lượt |

### Inferred presence (chưa count exact — anh chạy script bên dưới để verify)

| Collection | Expected June count | Key field | Affects July? |
|-----------|---------------------|-----------|---------------|
| `salesDailyBatches` | ~10-20 docs (1/sale/day) | `month='2026-06'` | ❌ No — query theo month |
| `salesAuditLogs` | ~50-100 docs (mỗi tx mutation log 2-3 entries) | `month='2026-06'`, `changedAt` | ❌ No — audit chỉ trace |
| `auditLogs` | nhiều (tasks, users, packages mutations) | `createdAt` (no month field) | ⚠️ Conditional — xem section 3 |
| `notifications` | nhiều (FCM testing + business events) | `createdAt` | ⚠️ Conditional — xem section 3 |
| `tasks` | optional (nếu tester tạo task test) | `createdAt`, no month | ⚠️ Conditional |
| `tasks/{id}/comments` | optional | `createdAt` | ⚠️ Conditional |
| `checklistRunsV2` | có thể (1/branch/shift/day) | `date` ISO | ⚠️ Conditional |
| `chemicalEntries`, `machineRuns` | tester có thể nhập KT | `date` | ⚠️ Conditional |
| `salesPrograms` | optional (1 program/branch nếu test) | `month='2026-06'` | ❌ No — query theo month |
| `salesMonthLocks` | 0 docs (chưa lock June) | `docId=branchId_2026-06` | n/a |

### Customers collection
- **Status:** 0 docs (PR-DATA-01 schema-only, no production write endpoint exists yet)
- **June impact:** ZERO — không có customer record nào được tạo
- **Debt continuity:** N/A — debt tracking trong `salesTransactions.debtAmount` field, không phải customer master

### Read-only count script (anh chạy local để verify exact)

Em không có direct Firestore access. Anh chạy script sau qua **Browser Console** trên hosted.app (đã login ADMIN/CEO):

```javascript
// COUNT-ONLY — không write, không delete
const collections = [
  'salesTransactions', 'salesDailyBatches', 'salesAuditLogs',
  'auditLogs', 'notifications', 'tasks', 'checklistRunsV2',
  'salesPrograms', 'chemicalEntries', 'machineRuns',
];

async function countJuneDocs() {
  const results = {};
  for (const col of collections) {
    try {
      // Try filter by month='2026-06' first
      let r = await fetch(`/api/admin/count-docs?collection=${col}&month=2026-06`, { credentials: 'include' });
      if (!r.ok) {
        // Fallback: filter by createdAt range
        r = await fetch(`/api/admin/count-docs?collection=${col}&fromDate=2026-06-01&toDate=2026-06-30`, { credentials: 'include' });
      }
      results[col] = r.ok ? await r.json() : { error: r.status };
    } catch (e) {
      results[col] = { error: e.message };
    }
  }
  console.log(JSON.stringify(results, null, 2));
}
// runCount(); // uncomment để chạy
```

> ⚠️ **Note:** endpoint `/api/admin/count-docs` chưa tồn tại. Anh chạy script này chỉ có effect khi em làm `PR-ADMIN-COUNT-DOCS` (chưa làm). **Alternative cheaper:** mở Firebase Console → Firestore → Data tab → mỗi collection click "Query" để filter `month == 2026-06` → đếm thủ công.

---

## 3. Does June test data affect July real data?

### Direct write impact: **NO**

July sẽ có:
- `salesTransactions` với `month='2026-07'` → query không trùng June
- `salesDailyBatches` với `month='2026-07'`
- `monthlyBranchSalesSummaries/2026-07_<branchId>` (new docs)
- `salesAuditLogs.month='2026-07'`
- `salesPrograms.month='2026-07'` (nếu QLCS tạo programs mới)

**Conclusion:** June test data **không bị mix vào** July reads/writes nếu user query đúng `month` field.

### Indirect concern: **MoM/YoY comparison**

UI `/doanh-so-v2/tong-ket` của tháng 7 hiện compute MoM (Month-over-Month) growth bằng cách fetch tháng trước (`prevMonth`) → đối chiếu doanh số 7 vs 6.

→ Nếu June có 73M doanh số test, July sẽ show "MoM delta = July - 73M" → **misleading**.

→ Đây là LÝ DO cần MARK June là test month + EXCLUDE từ MoM compute.

### Customer debt continuity: **NO IMPACT**

- 0 customer records exist
- Debt tracking ở `salesTransactions.debtAmount` field — June tx debt = trong June tx, July tx debt = trong July tx
- Không có cross-month debt auto-link logic (xem [lib/sales-v2/*]() — không có auto-merge by customer)

### Cron impact: **CONDITIONAL**

- `cleanup-notifications` (>30d): nếu chạy sau 2026-07-31 → June notifications sẽ bị xoá tự nhiên (auto-cleanup)
- `cleanup-stale-fcm` (>7d): không liên quan
- `proposal-overdue/dispatch-overdue/action-required-stuck`: cron filter `createdAt < cutoff` (24-48h) → June tasks sẽ "overdue forever" trừ khi đóng/cancel

→ Nếu June có task test status `pending_approval` chưa close → cron escalate có thể notify ADMIN/CEO mỗi giờ. **Phải close hoặc cancel test tasks**.

---

## 4. Does June test data affect reports/comparisons?

| Report | Affected? | Severity |
|--------|-----------|----------|
| `/doanh-so-v2/tong-ket?month=2026-07` MoM widget | ⚠️ YES — sẽ so July vs June (test data) | HIGH |
| `/doanh-so-v2/tong-ket?month=2026-06` view | ⚠️ YES — sẽ show 73M test as real | MEDIUM (chỉ nếu user mở tháng cũ) |
| YTD (Year-to-Date) sum | ⚠️ YES — sẽ +73M test vào tổng 2026 | HIGH |
| Sale ranking tháng 7 | ❌ NO — query month=2026-07 |  |
| Branch KPI tháng 7 | ❌ NO |  |
| Báo cáo tự động `/bao-cao` | ⚠️ Depends on date range filter | Medium |
| Dashboard CEO/CHU_TICH | ⚠️ YTD section sẽ bị inflated | High |
| `/audit-history` | ✅ OK — đây là audit trail, nên giữ |  |

→ **MUST mark/exclude June** để July report không lệch.

---

## 5. Does June test data affect customers/debt?

**Customers collection: NO impact** (0 docs).

**Debt:**
- June tx với type `dat_coc` (deposit) tạo `debtAmount` (còn nợ) field trong tx
- Nếu có 1 customer trong tháng 7 trùng số phone với June tester → KHÔNG có auto-link (chưa có customer master + chưa có `customerId` field trên salesTransactions)
- Debt trong June stays in June, không "chui" sang July

**Refund:** chưa có refund workflow (chưa wire).

**Conclusion:** debt continuity SAFE. KHÔNG cần manual debt reconciliation.

---

## 6. Monthly summary status for June

| Collection | Doc ID | Count | Source | truncated | Tham khảo |
|-----------|--------|-------|--------|-----------|-----------|
| `monthlyBranchSalesSummaries` | `2026-06_HM` | 1 | Manual rebuild 2026-06-29 | false | sourceTransactionCount: 0 |
| `monthlyBranchSalesSummaries` | `2026-06_TK` | 1 | Manual rebuild | false | sourceTransactionCount: 0 |
| `monthlyBranchSalesSummaries` | `2026-06_CTT` | 1 | Manual rebuild | false | sourceTransactionCount: 6 |
| `monthlyBranchSalesSummaries` | `2026-06_24` | 1 | Manual rebuild | false | sourceTransactionCount: 10 |
| `monthlyBranchSalesSummaries` | `2026-06_TT` | 1 | Manual rebuild | false | sourceTransactionCount: 2 |
| **Total** | | **5 branch docs** | | | **18 total tx** |
| `monthlySaleSalesSummaries` | `2026-06_<saleId>` | ~5-10 | Manual rebuild | false | Per sale với tx >0 |

**Aggregate verified totals (smoke confirmed):**
- Doanh số: **73.000.000 VND** (test data)
- Thực thu: **57.500.000 VND**
- Công nợ phát sinh: **17.500.000 VND**
- Công nợ còn lại: **17.500.000 VND**
- Tổng giao dịch: **18**

**Source:** All từ test data. Computed `computedBy='manual_rebuild'`, `computedAt=2026-06-29`.

→ **Summary docs có `isTestMonth` flag** sẽ giúp UI tự động banner + exclude khỏi MoM.

---

## 7. Safe handling options (pros/cons)

### Option A — KEEP + MARK (recommended) ✅

**Action:** Add `isTestMonth: true` field vào 5 docs `monthlyBranchSalesSummaries/2026-06_*` + UI banner

| | Detail |
|---|---|
| Benefit | Zero data lost. Reversible. UI clearly labels "Test data". MoM/YTD logic skips test months. |
| Risk | Negligible. Tester có thể remove flag nếu confused. |
| Collections affected | 5 + ~10 summary docs (write 1 field) |
| Backup required | NO (additive flag, no destructive change) |
| dryRun required | NO (audit-friendly, count-then-mark) |
| Rollback | `where(isTestMonth=true).update(isTestMonth=null)` 1 cmd |
| LOC for implementation | ~50 LOC (1 endpoint + UI banner + summary type extend) |
| Estimated effort | 1-2 hours |

### Option B — LOCK + KEEP (safer baseline)

**Action:** Set `salesMonthLocks/{branchId}_2026-06.locked=true` cho 5 branches

| | Detail |
|---|---|
| Benefit | Tester không thể edit thêm June. Preserves test data as-is. Pattern đã có sẵn (M2.1 PR-1). |
| Risk | Nếu sau này cần fix legitimate data trong June, phải unlock + reason audit. |
| Collections affected | 5 docs `salesMonthLocks` (create/update) |
| Backup required | NO |
| dryRun required | NO |
| Rollback | unlock endpoint có sẵn |
| LOC | 0 (endpoint POST `/api/sales-v2/month-locks/{branchId}/2026-06/lock` đã có) |
| Effort | 5 phút × 5 branches |

### Option C — VOID transactions (status='cancelled')

**Action:** Update `reviewStatus='cancelled'` cho 18 June tx + reason='june-test-data'

| | Detail |
|---|---|
| Benefit | Tx vẫn hiển thị trong audit nhưng aggregate logic skip cancelled. Báo cáo July không bị influence. |
| Risk | MEDIUM — phải hiểu rõ aggregate logic có skip cancelled chưa. Hiện monthly-summary chỉ filter `reviewStatus='approved'` → cancelled tự bị exclude. ✓ |
| Collections affected | 18 docs `salesTransactions` (update field) + 5 summaries cần rebuild |
| Backup required | YES (audit-friendly) |
| dryRun required | YES (preview 18 IDs trước khi update) |
| Rollback | revert reviewStatus='approved' (cần backup) |
| LOC | ~80 LOC (endpoint + script) |
| Effort | 2-3 hours |

### Option D — HARD DELETE June test data

**Action:** Delete 18 tx + 5 batches + N audit + 5 summaries

| | Detail |
|---|---|
| Benefit | Cleanest — không còn trace nào của test |
| Risk | **HIGH** — mất audit trail. Rollback chỉ qua backup restore. |
| Collections affected | salesTransactions (18), salesDailyBatches (~10), salesAuditLogs (~50), monthlyBranchSalesSummaries (5), monthlySaleSalesSummaries (~10) |
| Backup required | **MANDATORY** trước khi xoá |
| dryRun required | **MANDATORY** |
| Rollback | Restore từ backup baseline (mất 1-2 giờ + downtime risk) |
| LOC | ~150 LOC (cleanup endpoint + dryRun + batch deletes) |
| Effort | 4-6 hours (incl backup verify + dryRun smoke + real delete) |

---

## 8. Recommended option before July go-live — **A + B (combined)**

Em đề xuất **stacked** strategy:

**Step 1 — LOCK 5 branches × 2026-06** (Option B, 5 phút)
- Pattern có sẵn, audit-trail-friendly
- Zero risk
- Ngăn tester accidentally edit thêm

**Step 2 — MARK summaries as test** (Option A, 1-2h via small PR)
- Add field `isTestMonth: true` vào 5 docs `monthlyBranchSalesSummaries/2026-06_*`
- UI banner "🧪 Dữ liệu test — không tính vào báo cáo chính thức"
- MoM compute logic: skip months có `isTestMonth=true` → so July với 2026-05 (hoặc null)
- Add JUNE flag vào sale summaries cũng (10 docs)

**Skip Options C (void) + D (delete)** vì:
- Audit-friendly: giữ trace tester làm gì
- Reversible: chỉ cần unset flag/unlock
- Không cần backup khẩn cấp
- Không cần dryRun

---

## 9. Whether backup is required before action

| Option | Backup required? |
|--------|------------------|
| A (MARK) | **NO** — additive flag write only |
| B (LOCK) | **NO** — additive monthLocks doc only |
| C (VOID) | **YES** (recommended) — update is destructive to aggregate |
| D (DELETE) | **MANDATORY** — irreversible without backup |

**Em recommend approach A+B → KHÔNG cần backup khẩn cấp cho riêng action này.**

NHƯNG vẫn nên chạy backup baseline JULY (theo PROD_HARDENING_MASTER_01) **trước go-live**, độc lập với action June.

---

## 10. Whether a dryRun cleanup PR is needed

**NO** cho approach A+B.

**YES** nếu anh chọn Option C hoặc D — sẽ là PR riêng:

```
PR-JUNE-TEST-DATA-CLEANUP-DRYRUN
  - dryRun=true: count 18 tx + show IDs + check status
  - dryRun=false: void status (Option C) OR delete (Option D)
  - Auth: Bearer CRON_SECRET hoặc ADMIN session
  - Audit log mỗi action
```

→ KHÔNG implement trong audit này. Defer đến khi anh quyết option.

---

## 11. Exact next PR recommendation

### Nếu approach A+B (recommended):

**PR-JUNE-LOCK-AND-MARK** (~1.5h)
- Files:
  - `lib/types/monthly-summary.ts` — add optional field `isTestMonth?: boolean`
  - `lib/sales-v2/monthly-summary-builder.ts` — preserve flag during rebuild
  - `lib/sales-v2/monthly-summary-reader.ts` — return flag to API
  - `app/api/sales-v2/monthly-summary/route.ts` — pass flag in response
  - `app/api/admin/mark-test-month/route.ts` (NEW, 80 LOC) — endpoint set flag + lock
  - `app/(app)/doanh-so-v2/tong-ket/_components/TestMonthBanner.tsx` (NEW)
  - `app/(app)/doanh-so-v2/tong-ket/TongKetClient.tsx` — show banner khi response.isTestMonth=true
  - MoM compute helper — skip months có isTestMonth
  - Tests: 8-12 unit tests cho flag flow
- Manual call sau deploy:
  ```bash
  # Lock 5 branches × June
  for branch in HM TK CTT 24 TT; do
    curl -X POST -H "Authorization: Bearer $SESSION" \
      .../api/sales-v2/month-locks/$branch/2026-06/lock \
      -d '{"reason":"june-2026-test-data"}'
  done

  # Mark 5 summaries
  curl -X POST -H "Authorization: Bearer $SESSION" \
    .../api/admin/mark-test-month \
    -d '{"month":"2026-06","branches":["HM","TK","CTT","24","TT"]}'
  ```
- Risk: Low. Reversible.
- Rollout: needed
- Backup: NO

### Nếu approach C (void):

**PR-JUNE-VOID-DRYRUN** (~3h) — cleanup endpoint với dryRun mandatory

### Nếu approach D (delete):

**PR-JUNE-CLEANUP-DRYRUN** (~4h) — destructive endpoint với dryRun + backup verify

---

## 12. Files changed (in THIS audit PR)

- ✅ **NEW** `docs/JUNE_TEST_DATA_AUDIT_01.md` (file này, ~280 dòng)
- ❌ Không sửa code application
- ❌ Không sửa schema/types
- ❌ Không sửa data

---

## 13. Git status

- Branch: `main`
- Sau commit doc này → thêm 1 commit `docs: audit june test data before july go-live`
- Local tree: clean (chỉ doc mới)
- App Hosting Rollout: KHÔNG trigger (doc-only, code unchanged)

---

## Summary cho anh

**Câu trả lời ngắn:**

| Câu hỏi | Trả lời |
|---------|---------|
| Có cần xoá June không? | **KHÔNG** — keep + mark + lock |
| June có ảnh hưởng July? | Chỉ MoM/YTD — fix bằng `isTestMonth` flag |
| Customers/debt continuity? | Zero impact (chưa có customer master) |
| Cần backup khẩn cấp không? | NO cho A+B |
| Cần dryRun không? | NO cho A+B; YES cho C/D |
| Effort? | A+B = ~1.5h total |

**Em đề xuất:**
1. Anh confirm chọn **A+B**
2. Em sẽ build PR-JUNE-LOCK-AND-MARK trong 1 message
3. Test + commit + push như mọi PR khác
4. Manual call 2 commands sau deploy (lock + mark)
5. Verify trên /tong-ket?month=2026-06 → thấy banner đỏ "Test data"

Hoặc nếu anh muốn **OPTION D (hard delete)** → em chỉ build dryRun version trước. Sau khi anh verify count + approve → mới build real delete.

Anh quyết.

---

*End of audit. No production data, code, secrets, DNS, or schedules modified.*
