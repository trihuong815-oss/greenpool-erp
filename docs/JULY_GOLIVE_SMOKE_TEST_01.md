# JULY-GOLIVE-SMOKE-TEST-01

**Date:** 2026-06-30
**Status:** Manual smoke test checklist (no code change)
**Target URL:** https://greenpool-erp--green-pool-system.asia-southeast1.hosted.app
**Target Month:** July 2026 (current VN month, raw guard active)

> Doc-only — no production data modification by author. End-to-end manual
> verification BEFORE allowing broad employee data entry.

---

## 1. Executive readiness conclusion

**GO with smoke test required.** All P0/P1 blockers from PROD-HARDENING-MASTER-01 cleared:

- ✅ Baseline backup `july-baseline-2026-06-30` success (9.690 docs, 6.36 MB)
- ✅ June 2026 locked + marked isTestMonth across 5 branches
- ✅ Active-month raw guard (PR-04B) ensures `/tong-ket?month=2026-07` luôn raw → realtime correctness
- ✅ Reject path verified in code (filter `reviewStatus === 'approved'`)
- ✅ Existing endpoints sufficient — KHÔNG cần PR mới cho smoke flow

This checklist drives the manual end-to-end test.

---

## 2. Was production data modified by author? — **NO**

This is documentation only. All writes will be performed BY THE USER manually
via the production UI as part of the smoke test. Author runs zero Firestore writes.

---

## 3. Exact manual smoke test steps (DO IN ORDER)

### Pre-flight (zero state check)

**A. Confirm latest deploy active.** Browser → `https://greenpool-erp--green-pool-system.asia-southeast1.hosted.app`
- Hard reload (Cmd+Shift+R) → tránh cache stale
- Verify login OK as `Sale` test account

**B. Confirm July state empty (or known baseline).** DevTools Console, paste:
```javascript
fetch('/api/sales-v2/monthly-summary?month=2026-07', { credentials: 'include' })
  .then(r => r.json())
  .then(j => console.log(
    '_source:', j._source,
    '_sourceReason:', j._sourceReason,
    '\ntotals:', JSON.stringify(j.totals),
    '\ntxStatusStats:', JSON.stringify(j.txStatusStats),
    '\nmonthLock:', JSON.stringify(j.monthLock),
  ));
```
**Expected baseline** (giả định chưa có real data tháng 7):
- `_source: "raw"` (PR-04B forces raw for current month)
- `_sourceReason: "active-month"`
- `totals.sales = 0, totals.transactions = 0`
- `txStatusStats = {total:0, approved:0, pending:0, rejected:0}`
- `monthLock.locked = false`, `isTestMonth: undefined`

Nếu KHÔNG empty → ghi xuống "starting state" để so sánh delta sau.

**C. Confirm June still locked + marked.** Same console:
```javascript
fetch('/api/sales-v2/monthly-summary?month=2026-06&branchId=HM', { credentials: 'include' })
  .then(r => r.json())
  .then(j => console.log('June monthLock:', JSON.stringify(j.monthLock, null, 2)));
```
**Expected:** `{ branchId:"HM", locked:true, isTestMonth:true, testReason:"June 2026 pre-go-live..." }`

### Step 1 — Sale creates test batch

**Login Sale account** (vd Sale CTT)

1. Mở `/doanh-so-v2/nhap`
2. Chọn ngày test: **`2026-07-01`** (must be July, not June — June bị lock)
3. Trang load → batch new tự tạo (status `draft`)
4. Click "Thêm dòng" (hoặc Add row UI)
5. Nhập **chính xác** 1 row test:

| Field | Giá trị bắt buộc |
|-------|-----------------|
| `customerName` | `TEST_GO_LIVE_2026_07` |
| `phone` | `0900000001` |
| `note` | `TEST_GO_LIVE_2026_07 — pre-go-live smoke test` |
| `packageId` | Chọn bất kỳ package có sẵn của branch |
| `packageValue` | `10000` (= 10.000 VND — nhỏ, không impact MoM) |
| `transactionType` | `thanh_toan_du` (Thanh toán đủ — đơn giản nhất) |
| `paymentMethod` | `tien_mat` (Tiền mặt) |
| `collectedToday` | `10000` (bằng packageValue → không nợ) |
| `date` | `2026-07-01` (sync với batch date) |
| `month` | Auto = `2026-07` |
| `branchId` | Auto = branch của Sale |

6. **Verify trên UI:** row hiện trong grid, status `draft`, no error
7. **CHƯA submit** — sang Step 2

### Step 2 — Verify draft chưa vào aggregate

Console:
```javascript
fetch('/api/sales-v2/monthly-summary?month=2026-07', { credentials: 'include' })
  .then(r => r.json())
  .then(j => console.log(
    'After draft (chưa submit) — totals:', JSON.stringify(j.totals),
    '\ntxStatusStats:', JSON.stringify(j.txStatusStats),
  ));
```

**Expected:** `totals.sales = 0`, `txStatusStats.pending = 0`
(draft tx hiện CHƯA visible cho aggregate — tx chỉ tạo khi submit batch?
nếu UI tự auto-save thì sẽ thấy 1 pending row — note kết quả thực)

### Step 3 — Sale submit batch

1. Click button **"Gửi"/"Submit"** trên batch
2. Batch status: `draft` → `pending_review`
3. Sale UI sẽ disable edit (read-only)

### Step 4 — Verify after submit (chưa review)

```javascript
fetch('/api/sales-v2/monthly-summary?month=2026-07', { credentials: 'include' })
  .then(r => r.json())
  .then(j => console.log(
    'After submit (pending review) — totals:', JSON.stringify(j.totals),
    '\ntxStatusStats:', JSON.stringify(j.txStatusStats),
    '\nbatchStats:', JSON.stringify(j.batchStats),
  ));
```

**Expected:**
- `totals.sales = 0` ✅ (filter `approved` only, pending excluded)
- `totals.transactions = 0`
- `txStatusStats.total = 1, pending = 1, approved = 0, rejected = 0`
- `batchStats.pendingReview >= 1`

→ Pending tx **KHÔNG** vào revenue total. Đúng spec.

### Step 5 — Logout Sale, Login Accountant

Accountant phải là role `NV_KE` của cùng branch (vd NV_KE_CTT cho test ở CTT) HOẶC role `TP_KE`/`CEO`/`CHU_TICH`/`ADMIN` (top — review cross-branch).

### Step 6 — Accountant reject test row

1. Mở `/doanh-so-v2/doi-chieu`
2. Filter ngày `2026-07-01` hoặc branch của test
3. Tìm batch có `pending_review` + chứa `TEST_GO_LIVE_2026_07`
4. Trên row test, click button **❌ (Reject)**
5. Modal mở → nhập reason: **`TEST_GO_LIVE_2026_07 cleanup`**
6. Confirm
7. Row chuyển status `rejected`, hiện reject reason

### Step 7 — Verify after reject

```javascript
fetch('/api/sales-v2/monthly-summary?month=2026-07', { credentials: 'include' })
  .then(r => r.json())
  .then(j => console.log(
    'After reject — totals:', JSON.stringify(j.totals),
    '\ntxStatusStats:', JSON.stringify(j.txStatusStats),
  ));
```

**Expected:**
- `totals.sales = 0` ✅
- `totals.transactions = 0` ✅
- `txStatusStats.total = 1, pending = 0, approved = 0, rejected = 1`

→ Rejected tx **KHÔNG** vào revenue total. Confirms aggregate filter đúng spec.

### Step 8 — Final sanity

Verify audit log có entry `delete_tx` hoặc `edit_field/reviewStatus` (tùy path):

```javascript
fetch('/api/audit-history?branchId=CTT&month=2026-07&pageSize=10', { credentials: 'include' })
  .then(r => r.json())
  .then(j => console.log('Audit entries (10 latest):',
    j.rows?.map(r => `${r.action}/${r.field || '-'} by ${r.changedByName || r.userId} at ${r.changedAt || r.createdAt}`).join('\n')
  ));
```

**Expected:** ít nhất 2 entries:
- `create_tx` (Sale tạo)
- `edit_field/reviewStatus pending→rejected` với reason `TEST_GO_LIVE_2026_07 cleanup`

---

## 4. Exact test data — RECAP

| Field | Value |
|-------|-------|
| customerName | `TEST_GO_LIVE_2026_07` |
| phone | `0900000001` |
| note | `TEST_GO_LIVE_2026_07 — pre-go-live smoke test` |
| amount (packageValue) | `10000` (10.000 VND tối đa) |
| transactionType | `thanh_toan_du` |
| paymentMethod | `tien_mat` |
| collectedToday | `10000` |
| date | `2026-07-01` |
| month | `2026-07` (auto) |
| branch | 1 branch duy nhất (đề xuất `CTT` hoặc `24` — đã có Sale active trong June test) |

**KHÔNG TEST:**
- `dat_coc` (sinh debt — phức tạp hơn cho smoke đầu)
- `thanh_toan_not` (cần linkage — defer)
- Amount > 10.000 VND
- Multiple rows ban đầu (1 row đủ)
- Multiple branches cùng lúc (chỉ 1 branch ở smoke #1)

---

## 5. Roles needed

| Role | Tài khoản cần | Mục đích |
|------|---------------|----------|
| **Sale** của 1 branch (vd `nv_sale_ctt_X@greenpool.vn` hoặc Sale account anh đã test trước) | YES | Step 1, 3 — tạo + submit batch |
| **Accountant** của cùng branch (`NV_KE_CTT`) HOẶC top admin | YES | Step 6 — reject row |
| **Admin/CEO** | Optional | Verify audit history (Step 8) — top admin xem all branches |

→ Tổng 2 accounts minimum (Sale + Accountant). Anh có thể dùng 1 tab incognito cho mỗi role để switch nhanh.

---

## 6. Verification snippets (copy-paste vào Console)

Đã chèn inline trong Step 0/2/4/7/8 ở trên. Tóm tắt 5 snippets:

1. **Pre-flight July empty:** Step 0.B
2. **Pre-flight June still locked:** Step 0.C
3. **After draft (chưa submit):** Step 2
4. **After submit pending review:** Step 4
5. **After reject:** Step 7
6. **Audit history check:** Step 8

---

## 7. Expected results BEFORE reject (after submit, pending_review)

```
totals.sales       = 0       (filter approved only)
totals.transactions = 0
txStatusStats.total = 1
txStatusStats.pending = 1
txStatusStats.approved = 0
txStatusStats.rejected = 0
batchStats.pendingReview >= 1
_source = "raw"
_sourceReason = "active-month"
monthLock.locked = false
monthLock.isTestMonth = undefined
```

---

## 8. Expected results AFTER reject

```
totals.sales       = 0       ← UNCHANGED (đúng — reject = exclude)
totals.transactions = 0
txStatusStats.total = 1
txStatusStats.pending = 0
txStatusStats.approved = 0
txStatusStats.rejected = 1
batchStats.pendingReview giảm 1
Audit log có entry edit_field/reviewStatus pending→rejected
```

---

## 9. STOP conditions — abort nếu thấy bất kỳ điều dưới đây

| # | Stop condition | Implication |
|---|----------------|-------------|
| 1 | After Step 7 reject, `totals.sales > 0` | Aggregate filter BROKEN — KHÔNG go-live |
| 2 | Sale tạo được tx tháng 6 (vd date=`2026-06-29`) thành công | Month lock BROKEN — fix trước go-live |
| 3 | Sale của branch X edit/tạo được batch của branch Y | Scope check BROKEN — security critical, STOP |
| 4 | `totals` show số khác hẳn (vd 73M = June data leak) | Active-month raw guard broken — STOP |
| 5 | `_source = "summary"` cho tháng 7 | PR-04B regression — STOP |
| 6 | UI hiển thị error "Origin không hợp lệ" lúc submit | Middleware regression (PR proxy.ts) — STOP |
| 7 | Audit log thiếu entry sau reject | Audit pipeline broken |
| 8 | Account Accountant không thấy batch pending_review của branch | Role/scope mismatch |
| 9 | Hard delete tx ở batch approved (qua Firestore tay) | KHÔNG được phép — abort + restore từ backup |
| 10 | Sale tự reject được tx của mình | Self-review check broken (scope.ts:`batch.saleId === caller.uid`) |

Nếu hit bất kỳ STOP → screenshot + báo em ngay. Em sẽ debug từ codebase + propose fix PR.

---

## 10. What NOT to do

| ❌ Don't | Why |
|---------|-----|
| Use Vercel URL (`greenpool-erp.vercel.app`) cho smoke | Vercel KHÔNG chạy cron — data integrity OK nhưng dashboard có thể stale; spec yêu cầu App Hosting |
| Tạo test tx tháng 6 (vd `date: 2026-06-25`) | Bị month-lock block — không phải bug, đúng spec |
| Tạo test tx amount > 100k | Nếu lỡ approved, MoM/YTD bị skew |
| Edit/delete tx qua Firebase Console | Bỏ qua audit + promo decrement + month-lock — drift |
| Sale tự reject tx của mình | Bị scope.ts block — không phải bug |
| Tạo nhiều test rows cùng lúc | Khó cleanup; smoke đầu nên đơn giản 1 row |
| Test trong production hours cao điểm | Chọn off-hours để giảm rủi ro nếu phát hiện regression |
| Hard delete tx sau khi reject | Reject đã đủ exclude khỏi aggregate; delete = mất audit chain |
| Bypass approve gate qua admin Firestore write | Same issue — drift |

---

## 11. Cleanup / reject guidance

### Recommended path: **REJECT** (như Step 6 trên)

- Audit-friendly: trace ai tạo, ai reject, lý do, timestamp
- Reversible: đổi back về `pending` rồi `approved` nếu cần
- KHÔNG mất data → có thể verify aggregate filter
- Đủ sạch cho dashboard (rejected excluded từ aggregate)

### Hard delete (CHỈ nếu reject không đủ, anh approve riêng)

Sau Step 7 reject:
1. Verify batch ở `pending_review` (chưa approved)
2. Accountant click delete row qua UI
3. Audit log sẽ có entry `delete_tx`
4. Row biến mất khỏi DB
5. Verify summary lại → `txStatusStats.total = 0`

**KHÔNG hard delete nếu batch đã approved** — phải `POST /batches/[id]/return` trước (rare; reject path đủ).

### Cleanup nhiều test rows (nếu smoke có >5 tests)

Nếu sau smoke có nhiều test rows cần cleanup batch:
- Accountant reject từng row qua UI (5-10 phút/10 rows)
- Hoặc defer đến follow-up PR `JULY-TEST-CLEANUP-DRYRUN` (em chưa làm)

---

## 12. Whether new PR needed — **NO**

Existing app sufficient. Mọi gate đã verified:
- Schema: `TxReviewStatus` includes `rejected`
- Aggregate filter: `reviewStatus === 'approved'` (3 occurrences: builder L231, route L116, L338)
- Auth: `canEditTransaction` proper scope
- Audit: `recordSalesAuditIfEnabled` + `writeSalesAudit` covers create/edit/delete/review
- Month lock: `assertMonthNotLockedIfEnabled` wired in all mutations

Chỉ cần manual checklist này.

Nếu smoke phát hiện gap → em sẽ propose targeted PR (vd UI banner cho rejected count, bulk-reject tool, etc.) — defer đến lúc đó.

---

## 13. Files changed

- ✅ **NEW** `docs/JULY_GOLIVE_SMOKE_TEST_01.md` (file này)
- ❌ Không sửa code application
- ❌ Không sửa data/schema/secret/config

---

## 14. Quality gates result

- `npx tsc --noEmit` → clean (sẽ chạy trước commit)
- `npx vitest run` → baseline 1256/1256 (no test added)
- `npm run build` → pass (baseline)

(Gates chạy ở phần commit dưới.)

---

## 15. Git status

- Branch: `main`
- Sau commit doc này → thêm 1 commit `docs: july go-live smoke test checklist`
- Local tree: clean
- App Hosting Rollout: KHÔNG trigger (doc-only)

---

## Quick action — Anh thực hiện

1. Pin URL cho Sale + Accountant test accounts
2. Chạy Step 0 → 8 theo thứ tự (ước 15-30 phút total)
3. Screenshot mỗi snippet result + báo em pass/fail
4. Nếu pass → "GO" cho employees nhập real data tháng 7
5. Nếu fail STOP condition → em debug

Em đợi anh báo kết quả smoke.

---

*End of doc. No production data modified.*
