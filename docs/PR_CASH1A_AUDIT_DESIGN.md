# PR-CASH1A Audit/Design — Chi phí cơ sở & Báo cáo thu chi ngày

> **Ngày**: 2026-06-23 (revised v3 — reuse "Tổng hợp doanh thu ngày" làm source of truth)
> **Phạm vi**: Audit + Design — KHÔNG code, KHÔNG commit code nghiệp vụ, KHÔNG deploy
> **Output**: báo cáo design để anh chốt scope PR-CASH1B/C/D/E/F
> **Workstream**: thêm phần CHI + tự động tổng hợp Báo cáo thu-chi ngày → tự động gửi nhiều role

## Changelog

- **2026-06-23 v1**: bản gốc với approval workflow chi (NV_KE → TP_KE duyệt chi)
- **2026-06-23 v2**: bỏ approval workflow chi. Workflow "Nộp báo cáo" → tự động tổng hợp → tự động phân phối. Thêm `dailyCashflowReports` + role THU_QUY + 3 nguồn tự cộng (Sale + Reception + Expense)
- **2026-06-23 v3 (revised theo UI thật)**: app ĐÃ CÓ tab "Tổng hợp doanh thu ngày" trong `/doi-chieu` (API `daily-summary` 238 LOC, grandTotals đã aggregate Sale+Reception). **PR-CASH1 KHÔNG tự cộng lại 2 nguồn**, chỉ **reuse `daily-summary` API** làm source of truth duy nhất cho phần thu. Cashflow chỉ làm phần CHI + tổng hợp Báo cáo thu-chi + nộp/distribute.

---

## 1. Tóm tắt hiện trạng (verified)

### Đã có sẵn trong app
- ✅ **Tổng hợp doanh thu ngày** (V8 Phase 2, 2026-06-18):
  - UI: tab trong `/doanh-so-v2/doi-chieu` → component [DailySummaryView.tsx](app/(app)/doanh-so-v2/doi-chieu/_components/DailySummaryView.tsx) (367 LOC)
  - API: `GET /api/sales-v2/daily-summary?date=YYYY-MM-DD&branchId=X` ([238 LOC](app/api/sales-v2/daily-summary/route.ts))
  - Response shape:
    ```ts
    { ok, date, branchId, branchName, reception, sales, grandTotals }
    grandTotals: { cash, transfer, card, total }   // ĐÃ aggregate Sale + Reception
    ```
  - **Đã gộp**:
    - Doanh thu Sale (gói dịch vụ approved) — 4 groups (I. Thẻ tháng / II. Tích lượt / III. Học bơi / IV. Khác)
    - Doanh thu quầy lễ tân (vé lẻ / đồ bơi / đồ ăn / thuê tủ / bảo lưu)
  - Permission `READ_ROLES`: CEO/ADMIN/CHU_TICH/GD_KD/GD_VP/TP_KE/TP_GS/NV_KE + QLCS (branch scope)

### Chưa có
- ❌ Collection chi phí cơ sở
- ❌ Collection báo cáo thu-chi ngày
- ❌ Workflow "Nộp báo cáo thu-chi"
- ❌ Role THU_QUY
- ❌ Auto distribution cho THU_QUY/TP_KE/TP_KT/TP_GS/lãnh đạo

### Định hướng (chốt user 2026-06-23)
> **PR-CASH1 KHÔNG được xây lại logic tổng hợp thu từ đầu.**
> **PR-CASH1 phải reuse `daily-summary` API làm source of truth cho phần thu.**
> Cashflow chỉ làm: chi hằng ngày + báo cáo thu-chi + nộp/distribute.

---

## 2. Audit phần THU hiện có (verified)

### 2.1 `daily-summary` API là source of truth ✅

**File**: [app/api/sales-v2/daily-summary/route.ts](app/api/sales-v2/daily-summary/route.ts) (238 LOC)

**Logic aggregate**:
```ts
// 1. Reception entries (vé lẻ, đồ bơi,...)
//    → reception.totals: { cash, transfer, card, total }
// 2. Sales V2 transactions approved → map qua auto-map-package.ts thành 4 groups
//    → sales.totals: { cash, transfer, card, total }
// 3. Grand totals = reception + sales
const grandTotals = {
  cash: reception.totals.cash + sales.totals.cash,
  transfer: reception.totals.transfer + sales.totals.transfer,
  card: reception.totals.card + sales.totals.card,
  total: reception.totals.total + sales.totals.total,
};
```

**Trả về**: `{ date, branchId, branchName, reception, sales, grandTotals }`

### 2.2 Naming alignment

| Sales V2 paymentMethod | daily-summary API field | UI label | Cashflow report (em đề xuất) |
|---|---|---|---|
| `tien_mat` | `cash` | Tiền mặt | `cash` |
| `chuyen_khoan` | `transfer` | Chuyển khoản | `transfer` |
| `pos` | `card` | Quẹt thẻ | `card` |
| (không có) | (không có) | (không có) | `other` (chỉ cho expense) |

→ **Em chọn naming cashflow report = `cash/transfer/card/other`** (consistent với daily-summary API).

### 2.3 Permission API `daily-summary`

```ts
const READ_ROLES = new Set([
  'CEO', 'ADMIN', 'CHU_TICH', 'GD_KD', 'GD_VP', 'TP_KE', 'TP_GS', 'NV_KE',
]);
// + QLCS_*: branch scope
```

→ **Đã đủ permission** cho người sẽ nộp báo cáo (NV_KE/QLCS) + người nhận báo cáo (TP_KE/TP_GS/CEO/CHU_TICH/GD).

⚠️ **Em sẽ phải thêm `THU_QUY` vào `READ_ROLES`** trong PR-CASH1B để THU_QUY có thể fetch breakdown.

### 2.4 Khi nào doanh thu ngày "sẵn sàng nộp"?

Theo logic API hiện có:
- `reception.status`: `'draft' | 'approved'` — quầy lễ tân chốt thì status='approved'
- `sales.batchCount` — số batch Sale đã có (em chưa deep-read full shape, nhưng comment nói "Sale 4 groups Thẻ tháng/Tích lượt/Học bơi/Khác")

→ Em đề xuất "sẵn sàng nộp" = `reception.status === 'approved'` + tất cả batch Sale trong ngày = `'approved'`. Có thể check `reception.exists` ngầm để cho phép submit ngay cả khi 0 reception entries (1 số cơ sở không có quầy lễ tân).

---

## 3. Công thức Báo cáo thu-chi ngày (REVISED — reuse summary)

### Công thức MỚI (chốt v3)

```
dailyCashflowReport = dailyRevenueSummaryFromReconciliation - branchDailyExpenses
```

```ts
// Bước 1: Gọi GET /api/sales-v2/daily-summary?date=&branchId= 
//         → response.grandTotals = { cash, transfer, card, total }
// Bước 2: Aggregate expenses: status='recorded' theo paymentMethod
// Bước 3: Compute net = revenue - expense per method

revenue = {
  cash:     grandTotals.cash,        // ← REUSE từ daily-summary
  transfer: grandTotals.transfer,
  card:     grandTotals.card,
  total:    grandTotals.total,
};

expense = {
  cash:     sum(e.amount WHERE e.paymentMethod='cash' AND e.status='recorded'),
  transfer: sum(...transfer),
  card:     sum(...card),
  other:    sum(...other),
  total:    sum(all),
};

net = {
  cash:     revenue.cash - expense.cash,
  transfer: revenue.transfer - expense.transfer,
  card:     revenue.card - expense.card,
  other:    0 - expense.other,           // revenue không có 'other'
  total:    revenue.total - expense.total,
};
```

### Anti-double-count rule (chốt v3)

> ❌ PR-CASH1 **KHÔNG được** tự query `salesTransactions` + `salesReceptionBatches` rồi cộng lại.
> ✅ PR-CASH1 **CHỈ ĐƯỢC** gọi API `daily-summary` (hoặc dùng helper nội bộ tương đương) — single source of truth.

Lý do: `daily-summary` đã handle:
- Filter `tx.reviewStatus='approved'`
- Filter `batch.status IN ['approved','locked']`
- Map tx → 4 groups (Thẻ tháng/Tích lượt/Học bơi/Khác)
- Cộng reception entries riêng
- Aggregate by paymentMethod đúng

→ Nếu PR-CASH1 tự build sẽ **chắc chắn diverge** với UI hiện có. Bug double-count + diverge UI là HIGH risk.

---

## 4. Data model

### 4.1 Collection `branchDailyExpenses` (NEW)

```ts
export interface BranchDailyExpenseDoc {
  voucherNo: string;            // Số chứng từ (auto-gen: BR_YYYYMM_NNNN)
  date: string;                 // 'YYYY-MM-DD'
  month: string;                // 'YYYY-MM'
  branchId: BranchId;
  branchName: string;
  
  description: string;
  amount: number;               // VND integer
  paymentMethod: 'cash' | 'transfer' | 'card' | 'other';   // align daily-summary naming
  expenseCategory: ExpenseCategory;
  
  counterpartyName: string;
  counterpartyUnit?: string;
  counterpartyAddress?: string;
  
  attachedDocumentType: AttachedDocType;
  attachments: Array<{ fileName, storagePath, url?, mimeType, sizeBytes, uploadedAt, uploadedBy }>;
  note?: string | null;
  
  // Status — KHÔNG có approval workflow (chốt v2)
  status: 'draft' | 'recorded' | 'returned' | 'voided';
  
  createdBy: string;
  createdByName: string;
  createdByRole: string;
  createdAt: Timestamp;
  updatedBy?: string;
  updatedAt: Timestamp;
  
  recordedAt?: Timestamp | null;
  
  returnedBy?: string | null;
  returnedAt?: Timestamp | null;
  returnReason?: string | null;
  
  voidedBy?: string | null;
  voidedAt?: Timestamp | null;
  voidReason?: string | null;
  
  // Reference back tới report ngày (set khi gom vào DailyCashflowReport)
  cashflowReportId?: string | null;
}

export type ExpenseCategory =
  | 'vat_tu' | 'sua_chua' | 'canteen' | 'nhan_su' | 'dien_nuoc'
  | 'marketing' | 'su_kien' | 'thue_ngoai' | 'van_phong_pham' | 'khac';

export type AttachedDocType =
  | 'de_xuat_chi' | 'hoa_don_ban_hang' | 'hoa_don_gtgt'
  | 'bao_gia' | 'anh_chung_tu' | 'khac';
```

**Quy tắc cộng vào báo cáo**: chỉ `status='recorded'` vào aggregate. `draft`/`returned`/`voided` KHÔNG cộng.

### 4.2 Collection `dailyCashflowReports` (NEW — REVISED v3 link revenueSource)

```ts
export interface DailyCashflowReportDoc {
  id: string;                   // = `${branchId}_${date}` deterministic
  date: string;
  branchId: BranchId;
  branchName: string;
  month: string;
  
  status: 'draft' | 'submitted' | 'sent' | 'checked' | 'returned' | 'locked';
  
  // Submit
  submittedBy: string;
  submittedByName: string;
  submittedByRole: string;
  submittedAt: Timestamp;
  
  // Auto-distribute
  sentAt: Timestamp | null;
  sentTo: {
    treasurerUserIds: string[];        // THU_QUY
    accountingManagerUserIds: string[]; // TP_KE + TP_KT
    supervisionUserIds: string[];       // TP_GS
    leadershipUserIds: string[];        // CEO + CHU_TICH + GD_VP + GD_KD
  };
  
  // Kiểm tra báo cáo (NOT duyệt chi)
  checkedBy?: string | null;
  checkedByName?: string | null;
  checkedAt?: Timestamp | null;
  checkNote?: string | null;
  
  // Trả lại để bổ sung
  returnedBy?: string | null;
  returnedByName?: string | null;
  returnedAt?: Timestamp | null;
  returnReason?: string | null;
  
  // Khóa ngày
  lockedBy?: string | null;
  lockedByName?: string | null;
  lockedAt?: Timestamp | null;
  
  // ─── REVISED v3: Link nguồn thu CHÍNH THỨC ───
  /** Snapshot từ daily-summary tại thời điểm submit. Single source of truth. */
  revenueSource: {
    sourceType: 'daily_revenue_reconciliation_summary';
    date: string;
    branchId: BranchId;
    /** Snapshot grandTotals từ daily-summary API. */
    totalByMethod: {
      cash: number;
      transfer: number;
      card: number;
      total: number;
    };
    /** Optional breakdown — chỉ display, KHÔNG tự tính lại. */
    receptionTotals?: { cash: number; transfer: number; card: number; total: number };
    salesTotals?: { cash: number; transfer: number; card: number; total: number };
  };
  
  // ─── Source refs (link ngược) ───
  sourceRefs: {
    revenueSummaryId?: string;        // null nếu daily-summary chưa persist (compute on-read)
    revenueDate: string;              // = date (duplicate cho clarity)
    revenueBranchId: BranchId;
    revenueBatchIds?: string[];       // Sales V2 batches trong ngày (optional, audit chi tiết)
    expenseEntryIds: string[];        // chi recorded vào aggregate
  };
  
  // ─── Aggregate expense ───
  expense: {
    totalByMethod: {
      cash: number;
      transfer: number;
      card: number;
      other: number;
      total: number;
    };
    count: number;                    // tổng phiếu chi recorded
    missingEvidenceCount: number;     // phiếu thiếu attachments
  };
  
  // ─── Net (revenue - expense) ───
  net: {
    cash: number;                     // = revenueSource.totalByMethod.cash - expense.totalByMethod.cash
    transfer: number;
    card: number;
    other: number;                    // = 0 - expense.other (no revenue)
    total: number;
  };
  
  // ─── Cảnh báo ───
  alerts: Array<{
    code: 'NET_NEGATIVE_CASH' | 'MISSING_EVIDENCE' | 'LARGE_CASH_EXPENSE'
        | 'REVENUE_SUMMARY_NOT_READY' | 'OPENING_BALANCE_MISSING' | 'METHOD_MISMATCH'
        | 'REVENUE_CHANGED_AFTER_SUBMIT';
    severity: 'info' | 'warning' | 'critical';
    message: string;
  }>;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Quan trọng**:
- `revenueSource` = **snapshot từ daily-summary tại thời điểm submit** — KHÔNG tự tính lại
- `sourceRefs.revenueSummaryId` = optional (daily-summary có thể không persist riêng, compute on-read). Em đề xuất chỉ lưu `(date, branchId)` đủ để tra ngược qua API
- KHÔNG cần `revenueSource.salePackageRevenue` + `frontDeskRevenue` riêng — daily-summary đã handle

---

## 5. Workflow chính (REVISED v3 — reuse summary)

```
─── Trong ngày ───────────────────────────────────────
  Sale                  → nhập tx vào Sales V2 (Sales V2 đã có sẵn)
  Lễ tân                → nhập thu quầy lễ tân (Reception đã có sẵn)
  NV_KE                 → nhập khoản chi (branchDailyExpenses — status draft → recorded)
  Kế toán/QLCS          → kiểm tra tab "Tổng hợp doanh thu ngày" trong /doi-chieu

─── Cuối ca / cuối ngày ──────────────────────────────
  NV_KE / QLCS / Lễ tân → vào page "Báo cáo thu-chi"
                        → UI hiển thị card "Tổng thu ngày" (lấy từ daily-summary API)
                        → UI hiển thị list chi đã nhập trong ngày
                        → nhấn nút "Nộp báo cáo thu-chi"
                        
─── Server tự động (action: submit_daily_cashflow_report) ──
  1. Validate quyền user thuộc cơ sở
  2. Validate (date, branchId) chưa locked
  3. ★ Gọi internal helper "fetchDailyRevenueSummary(date, branchId)"
     (cùng logic /api/sales-v2/daily-summary — KHÔNG tự build lại)
     → grandTotals: { cash, transfer, card, total }
  4. Aggregate expenses status='recorded' trong ngày/cơ sở by paymentMethod
  5. Compute net = revenue - expense per method
  6. Build alerts (METHOD_MISMATCH nếu chi vượt thu cùng method, etc.)
  7. Tạo/update dailyCashflowReports/{branchId}_{date}
     - revenueSource = snapshot grandTotals
     - sourceRefs = { revenueDate, revenueBranchId, expenseEntryIds }
  8. Set status='submitted' → 'sent' (atomic)
  9. Resolve sentTo userIds theo role:
       - THU_QUY  → treasurerUserIds
       - TP_KE/TP_KT → accountingManagerUserIds
       - TP_GS    → supervisionUserIds
       - CEO/CHU_TICH/GD_VP/GD_KD → leadershipUserIds
  10. Tạo notification/inbox items cho mỗi userId
  11. Audit log: submit_daily_cashflow_report + generate_daily_cashflow_report + send_daily_cashflow_report

─── Sau khi báo cáo được gửi ─────────────────────────
  THU_QUY               → xem báo cáo, nắm tiền mặt/CK/POS
  TP_KE / TP_KT         → kiểm tra báo cáo thu - chi
                        → nếu OK: nhấn "Đã kiểm tra" (status='checked')
                        → nếu thiếu/sai: nhấn "Trả lại" + reason (status='returned')
  TP_GS                 → giám sát read-only
  Lãnh đạo              → xem tổng hợp

─── Returned flow ────────────────────────────────────
  Kế toán cơ sở thấy status='returned' + returnReason
  → sửa expense (returned→draft→recorded) hoặc nhập thêm
  → nhấn "Nộp báo cáo" lại → server re-fetch revenueSummary + re-aggregate

─── Revenue changed after submit ─────────────────────
  Nếu daily-summary thay đổi SAU khi submitted (vd batch Sale approved muộn):
  → Em đề xuất: server không tự re-aggregate. Thay vào đó:
    - Cron/check on user view → so revenueSource.totalByMethod.total vs current daily-summary.total
    - Nếu khác → alert REVENUE_CHANGED_AFTER_SUBMIT
    - NV_KE nhấn "Nộp lại" để cập nhật snapshot
  → Tránh report tự đổi sau khi đã sent (TP_KE/THU_QUY thấy số khác sẽ confused)

─── Lock day ─────────────────────────────────────────
  TP_KE / ADMIN nhấn "Khóa ngày" → status='locked'
  → Sau lock: KHÔNG cho submit lại / sửa expense status='recorded' trong ngày
```

⚠️ **Wording chốt** (v2 + v3):
- ❌ KHÔNG dùng: "duyệt chi" / "approve expense" / "TP_KE phê duyệt chi" / "tự build lại revenue aggregation" / "tự cộng lại Sale + Reception"
- ✅ Dùng: "Tổng hợp doanh thu ngày" / "nguồn thu chuẩn từ Đối chiếu doanh số" / "chi hằng ngày do kế toán cơ sở nhập" / "nộp báo cáo thu-chi" / "tự động gửi báo cáo" / "kiểm tra báo cáo" / "trả lại báo cáo" / "chốt/khóa báo cáo ngày"

---

## 6. Phân quyền theo role

| Role | Tạo chi | Edit chi draft/returned | Nhấn "Nộp báo cáo" | Kiểm tra báo cáo | Trả lại báo cáo | Khóa ngày | Xem báo cáo |
|---|:---:|:---:|:---:|:---:|:---:|:---:|---|
| **NV_KE** | ✅ branch mình | ✅ own | ✅ branch mình | ❌ | ❌ | ❌ | Branch mình |
| **QLCS_*** | ❌ giai đoạn đầu | ❌ | ✅ branch mình (chốt #1) | ❌ | ❌ | ❌ | Branch mình |
| **Lễ tân** (chưa có role explicit) | ❌ | (nhập reception) | ✅ branch mình (chốt #1) | ❌ | ❌ | ❌ | Branch mình |
| **TP_KE / TP_KT** | ❌ | ❌ | ❌ | ✅ all | ✅ | ✅ | All |
| **THU_QUY** (NEW) | ❌ | ❌ | ❌ | (xác nhận đã nhận — phase sau) | ❌ | ❌ | Theo phân công |
| **GD_VP / GD_KD** | ❌ | ❌ | ❌ | (view-only) | ❌ | ❌ | All |
| **CEO / CHU_TICH** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | All view-only |
| **TP_GS** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | All read-only |
| **ADMIN** | ✅ technical | ✅ | ✅ | ✅ | ✅ | ✅ | All |
| **NV_SALE/PT/CH** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ KHÔNG thấy module |

**Helper đề xuất** (PR-CASH1B):
- `lib/finance/expense-permissions.ts`:
  - `canCreateExpense(roleCode)` / `canEditExpense` / `canVoidExpense` / `canReadExpense`
- `lib/finance/cashflow-report-permissions.ts`:
  - `canSubmitCashflowReport(roleCode, branchId)` / `canCheckCashflowReport(roleCode)` / `canReturnCashflowReport` / `canLockCashflowDay` / `canReadCashflowReport` / `getReportRecipients(branchId)`

---

## 7. UI/Route/Sidebar đề xuất

### 7.1 Pages

| Page | Route | PR |
|---|---|:---:|
| Nhập chi phí cơ sở | `/doanh-so-v2/chi-phi` | 1C |
| Báo cáo thu-chi ngày (Editor cho người nộp) | `/doanh-so-v2/bao-cao-thu-chi` | 1C |
| Inbox báo cáo thu-chi (Viewer cho người nhận) | `/doanh-so-v2/bao-cao-thu-chi` (tab list cho viewer) HOẶC tab khác | 1D |

### 7.2 UI Báo cáo thu-chi ngày — Editor mode (PR-CASH1C)

- Chọn ngày + cơ sở (NV_KE bị force facility_id)
- **Card "Tổng thu ngày"** — render từ `GET /api/sales-v2/daily-summary` → grandTotals
  - Note: "Số liệu lấy từ Đối chiếu doanh số → Tổng hợp doanh thu ngày. Nếu cần sửa số thu, vào /doi-chieu."
- **Card "Chi trong ngày"** — list expenses status='recorded' + button "+ Nhập chi mới"
- **Card "Net thu-chi"** — preview net per method
- Nút **"Nộp báo cáo thu-chi"** highlight ở cuối page
- Nếu status='returned' → banner đỏ với returnReason
- Sau nhấn "Nộp" → confirm dialog → server submit + redirect / show success

### 7.3 UI Báo cáo thu-chi ngày — Viewer mode (PR-CASH1D)

- THU_QUY/TP_KE/TP_KT/TP_GS/CEO/lãnh đạo: list báo cáo nhận theo ngày/cơ sở/status
- Click report → drawer chi tiết:
  - revenue 3 dòng (cash/transfer/card)
  - expense breakdown by method + list phiếu chi
  - net
  - alerts
- TP_KE/TP_KT có button "Đã kiểm tra" + "Trả lại"
- TP_GS/lãnh đạo chỉ xem

### 7.4 Sidebar

```
Khối Văn phòng
  └─ Tài chính kế toán (nested)
       ├─ Đối chiếu doanh số ← TỔNG HỢP DOANH THU NGÀY ở đây (V8 đã có)
       ├─ Công nợ phải thu
       ├─ Báo cáo doanh thu tháng
       ├─ ... (giữ nguyên KM/lễ tân)
       ├─ Lịch sử thao tác
       ├─ ➕ Chi phí cơ sở              (PR-CASH1C — NV_KE/QLCS/TP_KE/ADMIN)
       └─ ➕ Báo cáo thu-chi ngày       (PR-CASH1C/1D — multi role)
```

---

## 8. Audit log

**Collection**: `auditLogs` + extend `AuditModule` thêm `'finance'`.

### Actions chi (expense level)
| Action | Khi nào |
|---|---|
| `create_expense` | NV_KE tạo (draft) |
| `update_expense` | NV_KE sửa draft/returned |
| `record_expense` | NV_KE confirm draft → recorded |
| `void_expense` | TP_KE/ADMIN void |
| `upload_expense_attachment` | Upload chứng từ |
| `delete_expense_draft` | NV_KE xóa draft |

### Actions báo cáo ngày (report level)
| Action | Khi nào |
|---|---|
| `submit_daily_cashflow_report` | Kế toán/QLCS/Lễ tân nhấn "Nộp báo cáo" |
| `generate_daily_cashflow_report` | Server tự generate kèm submit |
| `send_daily_cashflow_report` | Server tự distribute |
| `check_daily_cashflow_report` | TP_KE đánh dấu "Đã kiểm tra" |
| `return_daily_cashflow_report` | TP_KE trả lại với reason |
| `lock_daily_cashflow_day` | TP_KE/ADMIN khóa ngày |
| `unlock_daily_cashflow_day` | Mở khóa kèm reason |
| `view_daily_cashflow_report` | (optional) |
| `export_daily_cashflow_report` | Export Excel |

→ Reuse 2 composite index `auditLogs` (PR-7B). KHÔNG cần index mới.

---

## 9. Firestore rules / API permission

### API approach

```js
// branchDailyExpenses
match /branchDailyExpenses/{id} {
  allow read: if isSignedIn() && (
    isAdmin() || userRole() == 'CHU_TICH' || userRole() == 'TP_KE' ||
    userRole() == 'TP_GS' || userRole() == 'THU_QUY' ||
    ((userRole() == 'NV_KE' || isQLCS()) && resource.data.branchId == userFacility())
  );
  allow write: if false;
}

// dailyCashflowReports
match /dailyCashflowReports/{id} {
  allow read: if isSignedIn() && (
    isAdmin() || userRole() == 'CHU_TICH' || userRole() == 'TP_KE' ||
    userRole() == 'TP_KT' || userRole() == 'TP_GS' || userRole() == 'THU_QUY' ||
    ((userRole() == 'NV_KE' || isQLCS()) && resource.data.branchId == userFacility())
  );
  allow write: if false;
}
```

### Storage rules
Path đề xuất: `expense-attachments/{branchId}/{expenseId}/{filename}`. Scope theo role.

---

## 10. Export tương lai (PR-CASH1F)

### Sổ chi hàng ngày
Cột: Số chứng từ / Ngày / Diễn giải / Số tiền / Hình thức chi / Nhóm chi / Người giao dịch / Đơn vị / Địa chỉ / Chứng từ kèm theo / Trạng thái / Người nhập / Cơ sở

### Báo cáo thu-chi ngày
Theo method × (Thu / Chi / Net). Footer: Người nộp / Người kiểm tra / Người khóa.

### Audit export
`export_daily_cashflow_report`.

---

## 11. Roadmap code sau PR-CASH1A (REVISED v3)

| PR | Scope | LOC ước | Risk |
|---|---|---|:---:|
| **PR-CASH1B** | Data model + API nền: `branchDailyExpenses` + `dailyCashflowReports` + permission helpers + **thêm role THU_QUY** + API endpoints (CRUD expense + submit/check/return/lock report). **Reuse `daily-summary` API qua internal helper** (KHÔNG tự build lại). + audit + tests | ~900-1100 | MED |
| **PR-CASH1C** | UI nhập chi (page + form + upload) + UI Báo cáo thu-chi ngày Editor mode (card tổng thu fetch từ daily-summary + list chi + nút "Nộp báo cáo thu-chi"). KHÔNG nhập lại thu | ~800-1000 | MED |
| **PR-CASH1D** | UI Inbox báo cáo (Viewer mode) cho THU_QUY/TP_KE/TP_KT/TP_GS/lãnh đạo. List + drawer detail + check/return actions | ~600-800 | MED |
| **PR-CASH1E** | Auto distribution (inbox + FCM nếu có) + Lock day + alert REVENUE_CHANGED_AFTER_SUBMIT | ~300-500 | MED |
| **PR-CASH1F** | Export Excel sổ chi + báo cáo thu-chi | ~400-500 | LOW |
| **PR-CASH2** (future) | Opening balance + POS settle T+1/T+2 + Bank reconciliation + liên thông đề xuất chi nếu cần | TBD | TBD |

Tổng PR-CASH1B-F: ~3,000-3,900 LOC.

---

## 12. Risk Register

| # | Rủi ro | Severity | Mitigation |
|:---:|---|:---:|---|
| 1 | **Tự cộng lại Sale+Reception** trong cashflow → diverge UI hiện có | HIGH | **Chốt v3**: Reuse `daily-summary` API, KHÔNG tự query Sales transactions/Reception trong cashflow code |
| 2 | Naming mismatch `tien_mat/chuyen_khoan/pos` vs `cash/transfer/card` | LOW | Cashflow report dùng `cash/transfer/card/other` (align daily-summary). Helper map nếu cần |
| 3 | Doanh thu thay đổi sau khi submitted | MED | **Chốt #3**: Snapshot `revenueSource` lúc submit. Server detect diff → alert `REVENUE_CHANGED_AFTER_SUBMIT`. NV_KE nhấn "Cập nhật/Nộp lại" → tăng `reportVersion` + lưu `revisions[]` history. KHÔNG silent mutate report đã sent |
| 4 | Chi `draft`/`returned`/`voided` cộng vào báo cáo | MED | CHỈ `status='recorded'` vào aggregate |
| 5 | Khoản chi thiếu chứng từ | MED | `missingEvidenceCount` warning. Required cho category ≠ 'khac' |
| 6 | Kế toán nhập sai phương thức chi | MED | UI dropdown rõ + TP_KE kiểm tra báo cáo + alert METHOD_MISMATCH |
| 7 | **QLCS/NV_KE xem vượt cơ sở** | HIGH if fail | Server force `branchId = caller.facility_id`. API + Firestore rules 2 lớp |
| 8 | **TP_GS không read-only đúng** | HIGH if fail | Helper deny mutation |
| 9 | Upload chứng từ — Storage rules | MED | Path-scoped, role scope |
| 10 | Export nhạy cảm | MED | **Chốt #10**: PR đầu TP_GS KHÔNG export (consistent PR-6.3). Export PR-CASH1F ưu tiên TP_KE/THU_QUY/lãnh đạo. Audit `export_daily_cashflow_report` |
| 11 | Khóa ngày ảnh hưởng sửa sai | MED | Pattern `salesMonthLocks`. Unlock cần reason + audit |
| 12 | Tồn đầu kỳ chưa có | MED (intentional) | Note UI. PR-CASH2 thêm openingBalance |
| 13 | POS settle delay | MED | Note UI. PR-CASH2 reconcile |
| 14 | **THU_QUY role chưa có** | HIGH (blocker) | **Chốt #5**: PR-CASH1B BẮT BUỘC thêm role THU_QUY (scope toàn hệ thống, view-only, filter ngày/cơ sở/method) |
| 15 | Submit khi daily-summary chưa ready (reception draft / Sale batch pending / total=0) | MED | **Chốt #2**: KHÔNG chặn cứng. Allow submit + alert `REVENUE_SUMMARY_NOT_READY`. Lý do: có ngày cơ sở chỉ có chi không có thu (nghỉ). Người nhận biết qua alerts |
| 16 | Submit khi ngày đã locked | MED | Server reject + audit attempt |
| 17 | Submit lần 2 trong ngày (upsert) | LOW | DocId deterministic. Audit log mỗi lần |
| 18 | sentTo stale (user nghỉ việc) | LOW | Resolve userIds lúc submit (snapshot) |
| 19 | THU_QUY/lãnh đạo quá nhiều noti | LOW | Email digest cuối ngày (PR-CASH2) |
| 20 | daily-summary API rate limit / load nặng | LOW | Cache server-side ngắn (60s) trong cashflow helper |
| 21 | **VoucherNo duplicate** (NV_KE nhập tay trùng) | LOW/MED | **Chốt #11**: PR đầu nhập tay. Validate uniqueness `(branchId, month)` server + UI hint. Auto-gen `PC.{branchCode}.{YYMM}.{seq}` defer phase sau |
| 22 | **expense `paymentMethod='other'`** không khớp với revenue method | LOW | **Chốt #9**: UI ghi rõ "Khác" là chi không khớp 3 nhóm thu. `net.other = 0 - expense.other` (luôn âm). KHÔNG thêm `other` vào revenue |
| 23 | **THU_QUY toàn hệ thống** xem chéo cơ sở | LOW/MED | **Chốt #5**: View-only + audit `view_daily_cashflow_report`. THU_QUY là role kiểm soát quỹ tổng → cần xem all. PR-CASH2 mở rộng per-branch nếu cần |

---

## 13. Decisions finalized (chốt 2026-06-23 v3)

**Đã có answer technical từ audit**:
- ✅ Source technical của "Tổng hợp doanh thu ngày" = **API `GET /api/sales-v2/daily-summary?date=&branchId=`** (238 LOC). Response: `{ reception, sales, grandTotals: { cash, transfer, card, total } }`

**11 quyết định chốt cuối**:

### 1. Người bấm "Nộp báo cáo thu-chi" = **NV_KE / kế toán cơ sở**
- Sale vẫn nhập thu bán gói/thẻ vào Sales V2 (workflow Sales V2 giữ nguyên)
- Thu quầy lễ tân đã nằm trong `daily-summary` / Đối chiếu doanh số (V8 đã có)
- NV_KE nhập chi + bấm "Nộp báo cáo thu-chi"
- **QLCS KHÔNG bấm nộp** trong PR đầu (defer mở sau nếu nghiệp vụ cần)
- **TP_KE KHÔNG bấm nộp thay cơ sở** (giữ separation of duty)

### 2. Cho nộp khi `daily-summary` chưa đủ/chưa có doanh thu = **CÓ + alerts**
- PR đầu **KHÔNG chặn cứng**
- Cho nộp + hiển thị cảnh báo nếu:
  - `daily-summary.grandTotals.total === 0`
  - reception chưa nhập (`reception.exists === false` hoặc `reception.status === 'draft'`)
  - Sale chưa có batch approved trong ngày
  - daily-summary có signal "chưa hoàn chỉnh"
- Lý do: ngày có thể chỉ có chi mà không có thu (vd ngày nghỉ cơ sở), hoặc data Sale chưa đầy đủ → không nên khóa vận hành
- Báo cáo phải lưu `alerts[]` để người nhận biết tình trạng

### 3. Doanh thu thay đổi sau khi report `submitted`/`sent` = **Alert + reportVersion + nộp lại**
- ❌ **KHÔNG silent mutate** report đã gửi
- Nếu `daily-summary` thay đổi sau khi `dailyCashflowReport` đã submitted/sent:
  - Server detect khi NV_KE/người liên quan view report (so `revenueSource.totalByMethod.total` vs current `daily-summary.grandTotals.total`)
  - Tạo alert: `"Tổng thu ngày đã thay đổi sau khi nộp báo cáo thu-chi"` (code: `REVENUE_CHANGED_AFTER_SUBMIT`)
  - NV_KE nhấn nút **"Cập nhật báo cáo"** hoặc **"Nộp lại báo cáo"**
  - Mỗi lần submit lại → tăng `reportVersion` (1, 2, 3...) + lưu revision history
  - Giữ audit `revenueSource` trước/sau

### 4. Chi status vào báo cáo = **CHỈ `recorded`**
- ✅ Tính: `status === 'recorded'`
- ❌ KHÔNG tính: `draft` / `returned` / `voided`
- TP_KE `checked` báo cáo là kiểm tra cấp REPORT, KHÔNG phải điều kiện cho từng khoản chi
- Khoản chi sai sau khi recorded → `returned` (cho NV_KE sửa) hoặc `voided` (hủy hẳn)

### 5. THU_QUY scope = **Toàn hệ thống giai đoạn đầu** + filter
- Giai đoạn đầu THU_QUY xem **toàn hệ thống**
- Có filter:
  - Ngày
  - Cơ sở
  - paymentMethod (cash/transfer/card/other)
- **View-only**:
  - Không sửa thu (đã immutable qua Sales V2)
  - Không sửa chi
  - Không duyệt chi (không tồn tại approval workflow)
  - Không sửa report
- Nếu sau này cần THU_QUY per cơ sở → mở rộng scope sau (PR-CASH2)

### 6. Lãnh đạo cấp cao nhận báo cáo = **CEO + CHU_TICH + GD_VP + GD_KD**
- 4 role nhận tự động trong `sentTo.leadershipUserIds`
- **ADMIN** có thể xem với tư cách kỹ thuật/quản trị hệ thống (KHÔNG đưa vào leadershipUserIds — tránh spam noti)
- Tất cả lãnh đạo + ADMIN đều **view-only** ở report level

### 7. FCM notification = **PR-CASH1B KHÔNG bắt buộc FCM**
- PR-CASH1B chỉ cần:
  - `sentTo` list trong report doc
  - Dashboard/inbox/module hiển thị báo cáo đã gửi (PR-CASH1D)
  - Audit `sentAt` / `sentTo`
- FCM / app notification / email / Telegram → defer **PR-CASH1E** hoặc **PR-CASH2** nếu scope lớn

### 8. TP_KE check + lock = **Tách riêng**
- `checked` = TP_KE đã kiểm tra báo cáo thu-chi (không lock)
- `locked` = ngày/báo cáo đã chốt, hạn chế sửa/nộp lại
- PR đầu (PR-CASH1B) làm `checked` trước
- `locked` defer **PR-CASH1E** nếu scope lớn (hoặc tích hợp nếu < 100 LOC)

### 9. expense `paymentMethod='other'` = **CÓ enum + Net other compute đúng**
- Chi cho phép 4 enum: `cash` / `transfer` / `card` / `other`
- Thu `daily-summary` hiện chỉ 3: `cash` / `transfer` / `card` (KHÔNG có `other`)
- `net.other = 0 - expense.other` (revenue=0, net luôn âm cho 'other')
- UI ghi rõ: **"Khác"** là phương thức chi không khớp 3 nhóm thu chính
- KHÔNG thêm `other` vào revenue nếu daily-summary chưa có

### 10. TP_GS export = **KHÔNG export trong PR đầu**
- PR đầu TP_GS **read-only xem báo cáo trong app**, KHÔNG export
- Export PR-CASH1F ưu tiên:
  - TP_KE
  - THU_QUY
  - CEO/CHU_TICH/GD_VP/GD_KD (nếu policy cho phép)
- TP_GS export xem xét sau, **không mở mặc định**
- Consistent với Sales V2 PR-6.3 (TP_GS exclude từ Excel export)

### 11. VoucherNo = **Nhập tay PR đầu** + validate uniqueness
- PR đầu cho NV_KE **nhập tay**
- Validate: không trùng trong cùng `(branchId, month)` nếu khả thi (server check + UI hint)
- Auto-gen voucher để **phase sau** nếu cần
- Docs ghi đề xuất format auto tương lai: `PC.{branchCode}.{YYMM}.{seq}` (vd `PC.HM.2606.0001`)
- PR-CASH1B **KHÔNG bắt buộc** auto sequence nếu làm tăng rủi ro (Firestore counter doc + transaction)

---

## 14. Khuyến nghị cuối — PR-CASH1B Foundation (chốt)

### Scope chốt PR-CASH1B (LOC ~1000-1200)

1. **Role THU_QUY**: thêm vào `lib/permissions.ts` + `ROLE_BLOCK` (block='VP') + allow list scope
2. **Collections + types**:
   - `BranchDailyExpenseDoc` + `ExpenseCategory` + `AttachedDocType` enums
   - `DailyCashflowReportDoc` + `revenueSource` + `sourceRefs` + alerts enum
3. **Permission helpers**:
   - `lib/finance/expense-permissions.ts` — 4 hàm
   - `lib/finance/cashflow-report-permissions.ts` — 6 hàm (`canSubmit/Check/Return/Lock/Read` + `getReportRecipients`)
4. **Helper `fetchDailyRevenueSummary(date, branchId)`** — REUSE cùng logic `/api/sales-v2/daily-summary` (import internal hoặc fetch nội bộ). KHÔNG tự build lại
5. **API endpoints (8)**:
   - CRUD expense: POST + GET + PATCH + DELETE + GET list
   - `POST /api/finance/cashflow-reports/submit?date=&branchId=` → atomic: fetch daily-summary + aggregate expense + create/update report + distribute (sentTo) + ghi audit
   - `POST /api/finance/cashflow-reports/[id]/check` (TP_KE đánh dấu "Đã kiểm tra")
   - `POST /api/finance/cashflow-reports/[id]/return` (TP_KE trả lại + reason)
   - `GET /api/finance/cashflow-reports?date=&branchId=` (list / detail)
6. **reportVersion + revision handling** (chốt #3):
   - Field `reportVersion: number` (starts 1, increment mỗi submit lại)
   - Field `revisions: Array<{ version, revenueSource, expense, submittedAt, submittedBy, reason }>` — append history
   - Endpoint resubmit detect `revenueSource.totalByMethod.total` diff → tạo revision
7. **sentTo foundation** (chốt #7):
   - Resolve recipients lúc submit qua helper `getReportRecipients(branchId)`
   - Store snapshot vào `sentTo` field (KHÔNG re-resolve)
   - Inbox foundation: chỉ store `sentTo` array — UI inbox/dashboard sẽ làm PR-CASH1D
   - **FCM/email defer PR-CASH1E** (theo chốt #7)
8. **Firestore rules** template cho `branchDailyExpenses` + `dailyCashflowReports`
9. **Audit log** writeAuditLog module='finance' (cần extend `AuditModule` enum)
10. **70+ tests**:
    - Permission matrix per role (NV_KE/QLCS/TP_KE/THU_QUY/CEO/CHU_TICH/GD/TP_GS/ADMIN/Sale)
    - Aggregate expense per method + edge `other`
    - Snapshot `revenueSource` lúc submit
    - reportVersion increment khi diff
    - Alerts compute (REVENUE_NOT_READY/REVENUE_CHANGED/NET_NEGATIVE/MISSING_EVIDENCE)
    - VoucherNo uniqueness validation
    - Edge: ngày locked → reject submit

### KHÔNG làm trong PR-CASH1B

- ❌ UI page (defer 1C/1D)
- ❌ Upload chứng từ (defer 1C)
- ❌ Inbox UI / FCM (defer 1D/1E)
- ❌ Lock day endpoint (defer 1E nếu scope >100 LOC, hoặc tích hợp nếu nhỏ)
- ❌ Export Excel (defer 1F)
- ❌ Auto-gen voucherNo (chốt #11 nhập tay PR đầu)

### Trade-off

- ✅ PR-CASH1B độc lập, test API qua curl/Postman
- ✅ Foundation chắc trước UI
- ✅ Reuse daily-summary → KHÔNG diverge UI hiện có
- ✅ reportVersion ngay từ đầu → không phải migrate sau
- ✅ sentTo foundation ngay → PR-CASH1D wire inbox dễ
- ⚠ User chưa thấy kết quả trực quan đến PR-CASH1C

---

## Output sau cập nhật v3 (theo template I của user)

| # | Item | Kết quả |
|:---:|---|:---:|
| 1 | Đã đổi source of truth thu thành "Tổng hợp doanh thu ngày" (`daily-summary` API) | ✅ §2.1 + §3 + §5 step 3 + §11 PR-CASH1B helper |
| 2 | Đã bỏ `salePackageRevenue` + `frontDeskRevenue` tự tính trong Cashflow | ✅ §3 anti-double-count rule + §4.2 chỉ snapshot grandTotals |
| 3 | `dailyCashflowReports` đã link `revenueSource`/`sourceRefs` | ✅ §4.2 — revenueSource snapshot + sourceRefs.revenueSummaryId/revenueDate/revenueBranchId |
| 4 | Roadmap PR-CASH1B/C/D đã chỉnh | ✅ §11 — 1B reuse daily-summary helper + 1C UI Editor card "Tổng thu" lấy từ API + 1D Viewer mode |
| 5 | Câu hỏi còn cần chốt | ✅ §13 — 11 câu (giảm từ 16 do answer technical về source) |
| 6 | Git diff summary | File untracked v2→v3 chưa commit, không có git diff. Thay đổi chính: 8 mục lớn theo bảng cuối trang |
| 7 | Git status | `?? docs/PR_CASH1A_AUDIT_DESIGN.md` |
| 8 | Chưa commit | ✅ KHÔNG commit (chờ chốt 11 câu §13) |

### Thay đổi chính so v2

| Hạng mục | v2 | v3 (revised) |
|---|---|---|
| Source of truth thu | Tự cộng `salePackageRevenue + frontDeskRevenue` (2 nguồn) | **Reuse `daily-summary` API grandTotals** (1 source) |
| Anti-double-count | Note warning + PR-CASH1B audit reception schema | **Hard rule**: KHÔNG query Sales/Reception riêng. Chỉ gọi `daily-summary` |
| Naming | `tien_mat/chuyen_khoan/pos` | **`cash/transfer/card/other`** (align daily-summary) |
| `revenueSource` field | salePackages + frontDesk tách riêng | **snapshot grandTotals + optional breakdown** |
| Workflow step 3 | Lấy doanh thu Sale + Reception riêng | **Gọi helper `fetchDailyRevenueSummary`** |
| Risk #1 | Double-count Sale+Reception | **Tự build lại revenue → diverge UI** (HIGH) |
| Roadmap PR-CASH1B | Tự aggregate Sale + Reception | **Reuse daily-summary helper** |
| Câu hỏi technical source | (chưa có answer) | ✅ **API `daily-summary`** — đã verify file 238 LOC |

---

## ⏸ Em dừng ở đây

Em đã hoàn tất v3 — reuse `daily-summary` làm source of truth. **KHÔNG commit file docs này** — chờ anh chốt **11 câu hỏi §13**.

Sau khi anh chốt:
1. Em update file theo quyết định cuối
2. Commit + push docs riêng (em sẽ báo trước khi commit)
3. Bắt đầu PR-CASH1B theo §14 recommendation
