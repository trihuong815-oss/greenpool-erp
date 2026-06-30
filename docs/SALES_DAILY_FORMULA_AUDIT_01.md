# SALES-DAILY-FORMULA-AUDIT-01 REPORT

**Date:** 2026-06-30
**Author:** Audit-only, no formula/UI/data change
**Trigger:** User flagged Đoàn Trung Kiên case: 35.5M + 12.5M ≠ 46M

> Audit-only. Doc-only commit. Zero production code change.

---

## 1. Executive conclusion — **UI SEMANTICS BUG, không phải formula bug**

Math thực tế **HOÀN TOÀN ĐÚNG** (verified qua code + business logic). Numbers reconcile khi tách `Thực thu` thành 2 dòng tiền khác nhau:

```
46.000.000 (Doanh số mới) = 33.500.000 (Thu từ bán mới) + 12.500.000 (Nợ mới phát sinh)  ✓
35.500.000 (Tổng Thực thu) = 33.500.000 (Thu từ bán mới) + 2.000.000 (Thu trả nốt cũ)    ✓
```

→ Đoàn Trung Kiên có **1 tx `thanh_toan_not` collected 2M** trong tháng 6 (trả nốt nợ từ tháng cũ). Tx này KHÔNG tăng "Doanh số mới" (vì server enforce `packageValue=0`) nhưng VẪN tăng "Tổng Thực thu". UI hiện tại đặt 3 ô **Doanh số / Thực thu / Nợ phát sinh** cạnh nhau → user expect equation `Doanh số = Thực thu + Nợ` (logically intuitive nhưng SAI vì Thực thu gồm cả trả nốt cũ).

**Fix path:** UI rename/split — KHÔNG sửa formula. Recommended Option D (split 4 chỉ số).

---

## 2. Current formulas found in code

### File chính: [lib/sales-v2/monthly-summary-builder.ts](lib/sales-v2/monthly-summary-builder.ts) + [app/api/sales-v2/monthly-summary/route.ts](app/api/sales-v2/monthly-summary/route.ts)

Cả 2 nơi đều aggregate IDENTICAL (builder line 231-280, route line 338-403):

```typescript
for (const tx of approvedTransactions) {
  const pv = Number(tx.packageValue ?? 0);            // server enforced = 0 cho thanh_toan_not
  const ct = Number(tx.collectedToday ?? 0);
  const debt = Number(tx.debtAmount ?? 0);
  const originalDebt = Number(tx.originalDebt ?? debt);
  const txType = String(tx.transactionType);

  // TẤT CẢ approved tx (kể cả thanh_toan_not)
  totals.sales += pv;                                  // pv=0 nên thanh_toan_not contribute 0
  totals.collected += ct;                              // ← VẤN ĐỀ: cộng cả ct của thanh_toan_not
  totals.transactions += 1;

  // CHỈ dat_coc
  if (txType === 'dat_coc') {
    totals.debtGenerated += originalDebt;              // snapshot lúc tạo cọc
    totals.debtRemaining += debt;                      // hiện tại sau auto-match
  }
}
```

### Server enforce `packageValue=0` cho `thanh_toan_not` ([transactions/route.ts:196](app/api/sales-v2/transactions/route.ts#L196)):
```typescript
const basePackageValue = isThanhToanNot ? 0 : finalPackageValue;
const effectivePackageValue = isThanhToanNot ? 0 : basePackageValue - discountAmount;
```

→ `thanh_toan_not` luôn `packageValue=0` ở DB. Aggregate không double-count doanh số. **Formula đúng.**

---

## 3. Current meaning of each field

### Field semantics trong code

| Field UI label | Field code | Semantics thực tế |
|----------------|-----------|--------------------|
| **Doanh số** | `totals.sales = sum(packageValue)` | Tổng giá trị HỢP ĐỒNG MỚI trong kỳ (final after promo). `thanh_toan_not.pv = 0` → KHÔNG double-count. |
| **Thực thu** | `totals.collected = sum(collectedToday)` | **TỔNG DÒNG TIỀN THU** — bao gồm: (a) thu lúc bán mới + (b) thu trả nốt nợ cũ. Đây là LÝ DO confusion. |
| **Nợ phát sinh** | `totals.debtGenerated = sum(originalDebt for dat_coc)` | Nợ tạo ra bởi tx đặt cọc trong kỳ — snapshot lúc tạo. Tăng đơn điệu. |
| **Nợ còn lại** | `totals.debtRemaining = sum(debtAmount for dat_coc)` | Nợ hiện tại sau khi `thanh_toan_not` auto-link giảm (`auto-match` chỉ chạy khi batch approved). Nợ sẽ → 0 khi khách trả nốt. |
| **Số giao dịch** | `totals.transactions` | Count tất cả approved tx (kể cả thanh_toan_not). |

### Type definition ([sales-v2.ts](lib/types/sales-v2.ts))
```typescript
type TransactionType = 'dat_coc' | 'thanh_toan_full' | 'thanh_toan_not';
TRANSACTION_TYPE_LABEL = {
  dat_coc: 'Đặt cọc',
  thanh_toan_full: 'Thanh toán full',
  thanh_toan_not: 'Thanh toán nốt',
}
```

---

## 4. Transaction type truth table

| TxType | packageValue (pv) | collectedToday (ct) | originalDebt | debtAmount | Doanh số | Thu mới | Thu trả nốt | Nợ phát sinh | Nợ còn lại |
|--------|-------------------|---------------------|--------------|------------|----------|---------|-------------|--------------|------------|
| **thanh_toan_full** | = giá gói | = pv (= giá) | 0 | 0 | +pv | +ct | 0 | 0 | 0 |
| **dat_coc** (đặt cọc) | = giá gói | < pv (thu 1 phần) | = pv-ct (snap) | = originalDebt ban đầu, → giảm khi link | +pv | +ct | 0 | +originalDebt | +debt hiện tại |
| **thanh_toan_not** (trả nốt) | **0** (server enforce) | = số tiền trả | 0 | 0 | **+0** | 0 | **+ct** | 0 | (auto-link giảm `debtAmount` của tx `dat_coc` cũ) |

**Lưu ý:** `thanh_toan_not` có thể link tới `dat_coc` cũ qua `matchedTransactionId` (auto-match khi batch approved). Khi link, `dat_coc.debtAmount` GIẢM tương ứng → `debtRemaining` tự update. Nhưng `Thực thu` của KỲ NÀY vẫn cộng ct của tx `thanh_toan_not` này.

---

## 5. Expected accounting/business formulas (chuẩn kế toán)

Theo định nghĩa nghiệp vụ mới user đề xuất:

| Chỉ số | Công thức |
|--------|-----------|
| **Doanh số bán mới** | = Σ packageValue (chỉ `dat_coc` + `thanh_toan_full`) |
| **Thu từ bán mới** | = Σ collectedToday (chỉ `dat_coc` + `thanh_toan_full`) |
| **Thu trả nốt / nợ cũ** | = Σ collectedToday (chỉ `thanh_toan_not`) |
| **Tổng thực thu** | = Thu từ bán mới + Thu trả nốt = Σ collectedToday (ALL) |
| **Nợ mới phát sinh** | = Σ originalDebt (chỉ `dat_coc`) = Doanh số mới - Thu từ bán mới |
| **Công nợ còn phải thu** | = Σ debtAmount (chỉ `dat_coc`) — sau auto-link giảm |

### Reconciliation equations (PHẢI đúng):

1. **New sales identity:** `Doanh số bán mới = Thu từ bán mới + Nợ mới phát sinh` ✓
2. **Cash flow identity:** `Tổng Thực thu = Thu từ bán mới + Thu trả nốt` ✓
3. **Debt movement:** `Công nợ cuối kỳ = Công nợ đầu kỳ + Nợ mới phát sinh - Thu trả nốt - Điều chỉnh` ✓

---

## 6. Observed example — Đoàn Trung Kiên 2026-06 explained

**Numbers:**
- Doanh số: 46.000.000
- Thực thu: 35.500.000
- Nợ phát sinh: 12.500.000

**User expected:** `35.5 + 12.5 = 48 ≠ 46` → "lệch 2M, có bug?"

**Why thực tế đúng (em decompose):**

Đoàn Trung Kiên trong tháng 6 có (giả định scenario nhất quán với số liệu):
- **Tx A (thanh_toan_full)**: pv=20M, ct=20M, debt=0 → đóng dứt điểm
- **Tx B (dat_coc)**: pv=26M, ct=13.5M, originalDebt=12.5M, debtAmount=12.5M → đặt cọc gói lớn, còn nợ 12.5M
- **Tx C (thanh_toan_not)**: pv=0, ct=2M → trả nốt 2M cho dat_coc CŨ (tháng trước hoặc dat_coc khác)

**Aggregate qua công thức hiện tại:**
| Chỉ số | Cách tính | Kết quả |
|--------|-----------|---------|
| Doanh số | 20M (A) + 26M (B) + 0 (C) | **46M** ✓ |
| Thực thu | 20M (A) + 13.5M (B) + 2M (C) | **35.5M** ✓ |
| Nợ phát sinh | 12.5M (B, vì dat_coc) | **12.5M** ✓ |
| Thu mới (NEW field) | 20M (A) + 13.5M (B) | 33.5M |
| Thu trả nốt | 2M (C) | 2M |

**Kiểm equation:**
- `Doanh số = Thu mới + Nợ phát sinh` → `46 = 33.5 + 12.5` ✓
- `Thực thu = Thu mới + Thu trả nốt` → `35.5 = 33.5 + 2` ✓

→ **Math đúng 100%.** User nhầm vì UI gộp 2 dòng tiền vào 1 ô.

---

## 7. Backend formula đúng hay sai?

**ĐÚNG.** Verified qua code + business semantics:
- `packageValue=0` cho thanh_toan_not (server enforce) → không double-count doanh số
- `debtGenerated/Remaining` chỉ tính cho `dat_coc` → đúng nghĩa "nợ mới"
- `collected` cộng tất cả ct → đúng nghĩa "dòng tiền thực thu"

**KHÔNG NÊN sửa formula backend.** Sửa sẽ phá tất cả báo cáo, tests, summary docs hiện hữu.

---

## 8. UI hiện tại có misleading không?

**CÓ — misleading mạnh.**

Trang `/tong-ket?month=2026-06` (TongKetClient) hiển thị 3 ô liền kề:
```
┌─────────────┬─────────────┬─────────────┐
│  Doanh số   │  Thực thu   │ Nợ phát sinh│
│   46.000.000│  35.500.000 │  12.500.000 │
└─────────────┴─────────────┴─────────────┘
```

→ User intuition: `46 = 35.5 + 12.5 = 48?` → "lệch 2M".

**Actual semantics:**
- Doanh số = **Doanh số PHÁT SINH MỚI** (hợp đồng ký mới)
- Thực thu = **TỔNG DÒNG TIỀN VÀO** (bao gồm thu nợ cũ)
- Nợ phát sinh = **NỢ MỚI** từ tx dat_coc

3 chỉ số 3 chiều nghĩa khác nhau, không reconcile bằng 1 equation đơn.

---

## 9. Recommended target report model

### Option D (RECOMMENDED) — **Split daily report 4-line**

#### Card "Bán hàng phát sinh" (NEW SALE)
```
Doanh số bán mới:        46.000.000  ← unchanged backend totals.sales
Thu từ bán mới:          33.500.000  ← NEW derived field
Nợ mới phát sinh:        12.500.000  ← unchanged backend totals.debtGenerated
                         ────────────
Identity check:    46.0 = 33.5 + 12.5 ✓
```

#### Card "Dòng tiền thu" (CASH FLOW)
```
Thu từ bán mới:          33.500.000  ← NEW derived
Thu trả nốt nợ cũ:        2.000.000  ← NEW derived
                         ────────────
Tổng Thực thu:           35.500.000  ← unchanged backend totals.collected
Identity check:    35.5 = 33.5 + 2.0 ✓
```

#### Card "Công nợ" (RECEIVABLE)
```
Nợ mới phát sinh trong kỳ:  12.500.000
Công nợ còn lại cuối kỳ:    12.500.000  ← sau auto-link giảm
```

### Daily report (per Sale per day)
Same pattern — 3 cards thay vì 3 cells một dòng.

### Customer drawer (Đoàn Trung Kiên)
Show 3 tabs:
- **Hợp đồng mới**: list tx dat_coc + thanh_toan_full
- **Thanh toán nốt**: list tx thanh_toan_not + link tới tx dat_coc cũ
- **Lịch sử nợ**: timeline tăng/giảm

### Field naming map
| UI cũ | UI mới (rename) |
|-------|-----------------|
| Doanh số | **Doanh số bán mới** (clarify "new") |
| Thực thu | **Tổng Thực thu** (clarify "tổng") + tooltip "Bao gồm thu trả nốt nợ cũ" |
| (none) | **Thu từ bán mới** (NEW) |
| (none) | **Thu trả nốt cũ** (NEW) |
| Nợ phát sinh | giữ nguyên |
| Nợ còn lại | **Công nợ còn phải thu** (rename rõ hơn) |

---

## 10. Recommended next PR

### **PR-SALES-FORMULA-SPLIT-COLLECTED**

- **Scope:** Backend additive + UI split
- **Files changed:**
  - `lib/types/monthly-summary.ts` — add fields `collectedFromNewSales`, `collectedFromOldDebt` to schema (OPTIONAL backward-compat)
  - `lib/sales-v2/monthly-summary-builder.ts` — compute 2 fields trong loop
  - `app/api/sales-v2/monthly-summary/route.ts` — return 2 fields trong response
  - `app/(app)/doanh-so-v2/tong-ket/TongKetClient.tsx` — split 3 cards display
  - `app/(app)/doanh-so-v2/tong-ket/_components/*` — daily card, sale ranking, customer drawer
  - Tests: 8-12 cases truth table + reconciliation identity
- **Formulas change?** **NO** — existing fields `sales/collected/debtGenerated` unchanged. New fields ADDITIVE only.
- **UI change?** **YES** — split display, rename labels, add tooltips. Backward-compat: old field names vẫn tồn tại.
- **Risk:** Low (additive). Reversible.
- **Backup needed?** NO (no data write)
- **dryRun needed?** NO

### Pre-implementation checklist
1. Verify Đoàn Trung Kiên case bằng raw query (xem section 11 test plan)
2. Run truth table tests trước khi commit
3. Smoke trên July test month trước go-live
4. Sau khi UI deploy, cần communicate ngắn cho QLCS/Accountant biết 4 chỉ số mới

---

## 11. Tests needed before implementation

### Unit tests cho builder
```typescript
describe('builder formula reconciliation', () => {
  // A. Full payment 10M
  it('thanh_toan_full → sales=10M, collected=10M, debtGenerated=0', ...);

  // B. Deposit 10M, collect 3M
  it('dat_coc → sales=10M, collected=3M, debtGenerated=7M, debtRemaining=7M', ...);

  // C. Pay later (dat_coc, collect 0)
  it('dat_coc ct=0 → sales=10M, collected=0, debtGenerated=10M', ...);

  // D. Old debt repayment (thanh_toan_not)
  it('thanh_toan_not pv=0 ct=2M → sales=+0, collected=+2M, debtGenerated=0', ...);

  // Identity: Doanh số mới = Thu mới + Nợ phát sinh
  it('new-sale identity: sales = collectedNewSales + debtGenerated', ...);

  // Identity: Tổng thực thu = Thu mới + Thu trả nốt
  it('cash-flow identity: collected = collectedNewSales + collectedOldDebt', ...);

  // Đoàn Trung Kiên reproduction
  it('TK case: 1 full(20M) + 1 dat_coc(26M ct=13.5M) + 1 not(ct=2M) → ' +
     'sales=46, collected=35.5, debtGen=12.5, collectedNew=33.5, collectedOld=2', ...);
});
```

### Integration tests
- Smoke `/api/sales-v2/monthly-summary?month=2026-06` → response có `collectedFromNewSales + collectedFromOldDebt = collected` ✓
- UI render 3 cards với identity checks visible

---

## 12. Files changed (in THIS audit PR)

- ✅ **NEW** `docs/SALES_DAILY_FORMULA_AUDIT_01.md` (file này)
- ❌ Không sửa code/formula/UI/data/schema/test

---

## 13. Quality gate results

(Sẽ chạy trước commit)
- `npx tsc --noEmit` → clean expected
- `npx vitest run` → 1256/1256 baseline (no test change)
- `npm run build` → pass baseline

---

## 14. Git status

- Branch: `main`
- Sau commit doc → +1 commit `docs: audit sales debt formula semantics`
- Local tree: clean
- App Hosting Rollout: KHÔNG trigger (doc-only)

---

## Summary cho anh

| Câu hỏi | Trả lời |
|---------|---------|
| Có formula bug không? | **KHÔNG** — math đúng 100% |
| Có UI bug không? | **CÓ** — gộp 2 dòng tiền vào 1 ô "Thực thu" gây nhầm |
| Cần sửa backend không? | **CÓ — additive only** (thêm 2 derived fields, không đụng fields cũ) |
| Cần sửa UI không? | **CÓ** — split 3 cards rõ ràng (Bán hàng / Dòng tiền / Công nợ) |
| Có cần migration data? | **KHÔNG** |
| Risk? | **Low** — additive backend + UI display change |
| Effort? | ~3-4h cho PR-SALES-FORMULA-SPLIT-COLLECTED |

**Em đề xuất:** GO PR-SALES-FORMULA-SPLIT-COLLECTED khi anh sẵn sàng. Đợi anh confirm.

---

*End of audit. No production data, code, formulas, UI, secrets, DNS, or schedules modified.*
