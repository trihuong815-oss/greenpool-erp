'use client';

// Sales grid — 11 cột Excel-like cho Sale nhập daily transactions.
// Phase 1 (2026-06-17).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Trash2, AlertCircle, Tag, X, Search } from 'lucide-react';
import type {
  SalesTransaction,
  SalesV2Source,
  TransactionType,
  PaymentMethod,
} from '@/lib/types/sales-v2';
import { SOURCE_LABEL, TRANSACTION_TYPE_LABEL, PAYMENT_METHOD_LABEL } from '@/lib/types/sales-v2';
// PR-SALES-PAYMENT-SPLIT-SAFE (2026-06-24): split payment helpers.
import {
  isSplitPayment,
  getActivePaymentFields,
  normalizePaymentBreakdown,
  validatePaymentBreakdown,
  type PaymentBucket,
} from '@/lib/sales-v2/payment-split';
import type { SalesV2Package } from '@/lib/sales-v2/packages';
import {
  computeDiscount, isDiscountType, isBonusType,
  type PromoSnapshot, type PromoType,
} from '@/lib/types/sales-program';
import PackagePicker from './PackagePicker';
import { showConfirm } from '@/components/ui/imperative-modal';

interface AvailablePromo {
  id: string;
  promoCode: string;
  name: string;
  promoType: PromoType;
  promoValue: number;
}

export interface LocalRow {
  tempId: string;
  customerName: string;
  phone: string;
  guardianName: string;
  source: SalesV2Source | null;
  packageId: string | null;
  packageCode: string;
  packageName: string;
  serviceGroup: string;
  isChildPackage: boolean;
  // V6 2026-06-17 PT: snapshot từ pkg.isCustomQuantity khi chọn gói (resolve client-side)
  packageIsCustomQuantity: boolean;
  // V8.Y 2026-06-19: Manual mode (HB CLB Kid/Aqua) — Sale tự nhập packageValue + ghi số buổi (note).
  // Mutually exclusive với packageIsCustomQuantity. Không có ô đơn giá.
  packageManualPriceWithQty: boolean;
  transactionType: TransactionType | null;
  paymentMethod: PaymentMethod | null;
  packageValue: string;     // dạng string để input hiển thị OK
  collectedToday: string;
  // PR-SALES-PAYMENT-SPLIT-SAFE (2026-06-24): split payment.
  // - Method single (tien_mat/chuyen_khoan/pos): server tự derive 3 field từ collectedToday.
  // - Method combo (tien_mat_chuyen_khoan/tien_mat_pos/chuyen_khoan_pos):
  //   Sale nhập 2 ô active; collectedToday tự tính = tổng 2 ô active.
  // 3 field optional (string) — chỉ valid khi method combo. Empty = 0.
  paymentCash: string;
  paymentTransfer: string;
  paymentCard: string;
  // V6 PT: số buổi + đơn giá / buổi. Chỉ dùng khi packageIsCustomQuantity=true.
  quantity: string;
  unitPrice: string;
  // V7 Promo (2026-06-18): tối đa 2 promo (1 giảm + 1 tặng) per row.
  // Snapshot lưu inline trong row → preview discount client-side, gửi promoIds lên server lúc POST.
  promoSnapshots: PromoSnapshot[];
  receiptNo: string;
  contractNo: string;
  note: string;
  errorMessage?: string;
}

let _tempIdCounter = 0;
export function makeEmptyRow(): LocalRow {
  _tempIdCounter += 1;
  return {
    tempId: `local-${Date.now()}-${_tempIdCounter}`,
    customerName: '',
    phone: '',
    guardianName: '',
    source: null,
    packageId: null,
    packageCode: '',
    packageName: '',
    serviceGroup: '',
    isChildPackage: false,
    packageIsCustomQuantity: false,
    packageManualPriceWithQty: false,
    transactionType: null,
    paymentMethod: null,
    packageValue: '',
    collectedToday: '',
    paymentCash: '',
    paymentTransfer: '',
    paymentCard: '',
    quantity: '',
    unitPrice: '',
    promoSnapshots: [],
    receiptNo: '',
    contractNo: '',
    note: '',
  };
}

/** Defensive string coerce — undefined/null/number → '' / String(x).
 *  Dùng cho mọi nơi hydrate dữ liệu từ ngoài (localStorage draft cũ, JSON parse, v.v.). */
function s(x: unknown): string {
  if (x === null || x === undefined) return '';
  return typeof x === 'string' ? x : String(x);
}

/** HOTFIX 2026-06-24: chuẩn hoá 1 object bất kỳ thành LocalRow đầy đủ field.
 *  Nguồn gây bug: draft cũ trong localStorage được lưu TRƯỚC khi schema thêm field
 *  (vd 3 field paymentCash/Transfer/Card của PR-SALES-PAYMENT-SPLIT-SAFE) → khi
 *  JSON.parse, các field này = undefined → `r.X.trim()` crash trang.
 *
 *  Mọi entry point đưa data ngoài → LocalRow PHẢI đi qua hàm này:
 *  - localStorage hydrate (NhapClient)
 *  - Server-restored draft
 *  - Bất kỳ tương lai migration nào
 *
 *  Hàm idempotent: gọi 2 lần cho kết quả như nhau. */
export function coerceLocalRow(input: unknown): LocalRow {
  const r = (input ?? {}) as Partial<LocalRow> & Record<string, unknown>;
  _tempIdCounter += 1;
  return {
    tempId: typeof r.tempId === 'string' && r.tempId ? r.tempId : `local-${Date.now()}-${_tempIdCounter}`,
    customerName: s(r.customerName),
    phone: s(r.phone),
    guardianName: s(r.guardianName),
    source: (r.source as SalesV2Source | null | undefined) ?? null,
    packageId: typeof r.packageId === 'string' && r.packageId ? r.packageId : null,
    packageCode: s(r.packageCode),
    packageName: s(r.packageName),
    serviceGroup: s(r.serviceGroup),
    isChildPackage: r.isChildPackage === true,
    packageIsCustomQuantity: r.packageIsCustomQuantity === true,
    packageManualPriceWithQty: r.packageManualPriceWithQty === true,
    transactionType: (r.transactionType as TransactionType | null | undefined) ?? null,
    paymentMethod: (r.paymentMethod as PaymentMethod | null | undefined) ?? null,
    packageValue: s(r.packageValue),
    collectedToday: s(r.collectedToday),
    paymentCash: s(r.paymentCash),
    paymentTransfer: s(r.paymentTransfer),
    paymentCard: s(r.paymentCard),
    quantity: s(r.quantity),
    unitPrice: s(r.unitPrice),
    promoSnapshots: Array.isArray(r.promoSnapshots) ? (r.promoSnapshots as PromoSnapshot[]) : [],
    receiptNo: s(r.receiptNo),
    contractNo: s(r.contractNo),
    note: s(r.note),
    errorMessage: typeof r.errorMessage === 'string' ? r.errorMessage : undefined,
  };
}

/** Validate SĐT VN: 10 số, bắt đầu 0. Empty → false (trống = chưa nhập, không phải sai). */
export function isValidPhone(phone: string): boolean {
  const t = phone.trim();
  return /^0\d{9}$/.test(t);
}

/** Row hoàn toàn rỗng — Sale chưa nhập gì (vd row auto-add trailing). KHÔNG validate + KHÔNG báo lỗi.
 *
 *  Defensive coerce (HOTFIX 2026-06-24): tất cả `r.X.trim()` đều `?? ''` để không crash
 *  nếu LocalRow hydrate từ schema cũ thiếu field. Layer 1 (coerceLocalRow tại hydrate)
 *  là chính; layer này là an toàn cuối cùng. */
export function isRowEmpty(r: LocalRow): boolean {
  return !(r.customerName ?? '').trim()
    && !(r.phone ?? '').trim()
    && !(r.guardianName ?? '').trim()
    && !r.source
    && !r.packageId
    && !r.transactionType
    && !r.paymentMethod
    && !(r.packageValue ?? '').trim()
    && !(r.collectedToday ?? '').trim()
    && !(r.paymentCash ?? '').trim() && !(r.paymentTransfer ?? '').trim() && !(r.paymentCard ?? '').trim()
    && !(r.quantity ?? '').trim()
    && !(r.unitPrice ?? '').trim()
    && (r.promoSnapshots?.length ?? 0) === 0
    && !(r.receiptNo ?? '').trim()
    && !(r.contractNo ?? '').trim()
    && !(r.note ?? '').trim();
}

/** BASE packageValue cho 1 row (TRƯỚC khi áp discount).
 *  - thanh_toan_not → 0
 *  - PT → qty × unitPrice
 *  - Non-PT → field packageValue */
export function basePackageValueOf(r: LocalRow): number {
  if (r.transactionType === 'thanh_toan_not') return 0;
  if (r.packageIsCustomQuantity) {
    const q = Number(r.quantity);
    const u = Number(r.unitPrice);
    if (!Number.isFinite(q) || !Number.isFinite(u) || q <= 0 || u < 0) return 0;
    return q * u;
  }
  return Number(r.packageValue) || 0;
}

/** Tổng discount áp lên 1 row từ promoSnapshots (chỉ percent + fixed_amount). */
export function discountSumOf(r: LocalRow): number {
  const base = basePackageValueOf(r);
  if (base <= 0) return 0;
  let total = 0;
  for (const s of r.promoSnapshots ?? []) {
    if (isDiscountType(s.type)) total += computeDiscount(base, s.type, s.value);
  }
  return Math.min(total, base);
}

/** FINAL packageValue (SAU discount) — khớp với server-stored packageValue. */
export function effectivePackageValue(r: LocalRow): number {
  return Math.max(0, basePackageValueOf(r) - discountSumOf(r));
}

/** PR-SALES-PAYMENT-SPLIT-SAFE (2026-06-24): tính breakdown từ LocalRow.
 *  - Single method → derive từ collectedToday (server cũng tự derive nếu wrapper gửi up).
 *  - Combo method → parse 3 field paymentCash/Transfer/Card; chỉ giữ 2 ô active. */
export function computeBreakdownFromRow(r: LocalRow): { cash: number; transfer: number; card: number } {
  if (!r.paymentMethod) return { cash: 0, transfer: 0, card: 0 };
  const ct = Number(r.collectedToday) || 0;
  return normalizePaymentBreakdown(r.paymentMethod, ct, {
    cash: Number(r.paymentCash) || 0,
    transfer: Number(r.paymentTransfer) || 0,
    card: Number(r.paymentCard) || 0,
  });
}

/** PR-SALES-PAYMENT-SPLIT-SAFE: tổng split cells khi method combo (dùng để compute collectedToday). */
export function sumSplitCells(r: LocalRow): number {
  if (!r.paymentMethod || !isSplitPayment(r.paymentMethod)) return Number(r.collectedToday) || 0;
  const active = getActivePaymentFields(r.paymentMethod);
  let sum = 0;
  for (const k of active) {
    if (k === 'cash') sum += Number(r.paymentCash) || 0;
    if (k === 'transfer') sum += Number(r.paymentTransfer) || 0;
    if (k === 'card') sum += Number(r.paymentCard) || 0;
  }
  return sum;
}

/** Validate 1 local row đủ điều kiện POST chưa. */
export function validateRow(r: LocalRow): { ok: true } | { ok: false; error: string } {
  if (!(r.customerName ?? '').trim()) return { ok: false, error: 'Thiếu tên khách hàng' };
  if (!(r.phone ?? '').trim()) return { ok: false, error: 'Thiếu SĐT' };
  if (!isValidPhone(r.phone)) return { ok: false, error: 'SĐT phải 10 số bắt đầu bằng 0' };
  if (!r.source) return { ok: false, error: 'Thiếu nguồn' };
  if (!r.packageId) return { ok: false, error: 'Thiếu gói' };
  if (!r.transactionType) return { ok: false, error: 'Thiếu loại giao dịch' };
  if (!r.paymentMethod) return { ok: false, error: 'Thiếu hình thức thu' };
  const ct = Number(r.collectedToday);
  if (!Number.isFinite(ct) || ct < 0) return { ok: false, error: 'Thu hôm nay không hợp lệ' };

  // PR-SALES-PAYMENT-SPLIT-SAFE (2026-06-24): split method bắt buộc 2 ô active > 0
  // và tổng = collectedToday. Đối với single method, server tự derive — không cần check.
  if (isSplitPayment(r.paymentMethod)) {
    const bd = computeBreakdownFromRow(r);
    const bdCheck = validatePaymentBreakdown(r.paymentMethod, ct, bd);
    if (!bdCheck.ok) return { ok: false, error: bdCheck.error };
  }
  if (r.isChildPackage && !(r.guardianName ?? '').trim()) return { ok: false, error: 'Gói trẻ em bắt buộc Người giám hộ' };
  // Validate chứng từ
  if (r.transactionType === 'dat_coc' && !(r.receiptNo ?? '').trim()) {
    return { ok: false, error: 'Đặt cọc bắt buộc Số phiếu thu' };
  }
  if ((r.transactionType === 'thanh_toan_full' || r.transactionType === 'thanh_toan_not') && !(r.contractNo ?? '').trim()) {
    return { ok: false, error: 'Thanh toán bắt buộc Số hợp đồng' };
  }
  // 'thanh_toan_not' = trả nốt nợ cũ → chỉ cần collectedToday > 0, packageValue ignore
  if (r.transactionType === 'thanh_toan_not') {
    if (ct <= 0) return { ok: false, error: 'Thanh toán nốt phải có số tiền thu' };
    return { ok: true };
  }
  // V6 PT: gói tính theo buổi → bắt buộc số buổi + đơn giá
  if (r.packageIsCustomQuantity) {
    const q = Number(r.quantity);
    if (!Number.isFinite(q) || q <= 0) return { ok: false, error: 'Gói PT — phải nhập số buổi (> 0)' };
    const u = Number(r.unitPrice);
    if (!Number.isFinite(u) || u < 0) return { ok: false, error: 'Gói PT — đơn giá / buổi không hợp lệ' };
    if (q * u <= 0) return { ok: false, error: 'Giá trị gói (số buổi × đơn giá) phải > 0' };
  } else if (r.packageManualPriceWithQty) {
    // V8.Y manual mode: Sale tự nhập packageValue + ghi số buổi (note bắt buộc >0)
    const q = Number(r.quantity);
    if (!Number.isFinite(q) || q <= 0) return { ok: false, error: 'Gói này phải nhập Số buổi (>0)' };
    const pv = Number(r.packageValue);
    if (!Number.isFinite(pv) || pv <= 0) return { ok: false, error: 'Gói này Sale tự nhập Giá trị gói (>0)' };
  } else {
    const pv = Number(r.packageValue);
    if (!Number.isFinite(pv) || pv <= 0) return { ok: false, error: 'Gói chưa có giá — báo admin cập nhật ở /doanh-so/packages' };
  }
  // V7 Promo: validate combo max 1 discount + 1 bonus
  if ((r.promoSnapshots?.length ?? 0) > 2) return { ok: false, error: 'Tối đa 2 chương trình mỗi giao dịch' };
  const discountCount = (r.promoSnapshots ?? []).filter((s) => isDiscountType(s.type)).length;
  const bonusCount = (r.promoSnapshots ?? []).filter((s) => isBonusType(s.type)).length;
  if (discountCount > 1) return { ok: false, error: 'Chỉ áp được 1 mã giảm giá' };
  if (bonusCount > 1) return { ok: false, error: 'Chỉ áp được 1 mã tặng' };
  // Thu hôm nay không > pv (sau discount)
  const finalPv = effectivePackageValue(r);
  if (r.transactionType === 'thanh_toan_full' && ct < finalPv) {
    return { ok: false, error: 'Thanh toán full phải thu đủ giá trị gói (sau khuyến mãi)' };
  }
  if (ct > finalPv) {
    return { ok: false, error: 'Thu hôm nay không thể lớn hơn giá trị gói' };
  }
  return { ok: true };
}

interface Props {
  packages: SalesV2Package[];
  rows: SalesTransaction[];
  localRows: LocalRow[];
  canEdit: boolean;                  // Sale có thể edit row mới (add/lock-free)
  batchStatus: string;               // V6: dùng để quyết định row nào lock khi returned
  branchId: string;                  // V7 Promo — dùng để fetch /available
  batchMonth: string;                // V7 Promo — promo phải match batch.month, không phải currentMonth
  onUpdateLocal: (tempId: string, patch: Partial<LocalRow>) => void;
  onRemoveLocal: (tempId: string) => void;
  onUpdateSaved: (id: string, patch: Partial<SalesTransaction>) => void;
  onRemoveSaved: (id: string) => void;
  /** HOTFIX UX 2026-06-24: callback khi user click chấm than lỗi → cha hiển thị toast/modal.
   *  Trước đây chỉ có `title` HTML tooltip → mobile + Sale dễ bỏ sót. */
  onShowError?: (msg: string) => void;
}

const SOURCE_TONE: Record<SalesV2Source, string> = {
  ca_nhan: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  walkin:  'bg-sky-50 text-sky-700 ring-sky-200',
  mkt:     'bg-violet-50 text-violet-700 ring-violet-200',
  renew:   'bg-amber-50 text-amber-700 ring-amber-200',
  ref:     'bg-rose-50 text-rose-700 ring-rose-200',
};

const PAY_TONE: Record<PaymentMethod, string> = {
  tien_mat:                'bg-emerald-50 text-emerald-700 ring-emerald-200',
  chuyen_khoan:            'bg-sky-50 text-sky-700 ring-sky-200',
  pos:                     'bg-amber-50 text-amber-700 ring-amber-200',
  // PR-SALES-PAYMENT-SPLIT-SAFE (2026-06-24): combo methods — violet tone.
  tien_mat_chuyen_khoan:   'bg-violet-50 text-violet-700 ring-violet-200',
  tien_mat_pos:            'bg-violet-50 text-violet-700 ring-violet-200',
  chuyen_khoan_pos:        'bg-violet-50 text-violet-700 ring-violet-200',
};

/** Sale có sửa được tx này không? (theo workflow per-tx review) */
function canSaleEditRow(batchStatus: string, reviewStatus?: string): boolean {
  if (batchStatus === 'draft') return true;
  if (batchStatus === 'returned') return (reviewStatus ?? 'pending') === 'rejected';
  return false;
}

export default function SalesGrid({
  packages, rows, localRows, canEdit, batchStatus, branchId, batchMonth,
  onUpdateLocal, onRemoveLocal, onUpdateSaved, onRemoveSaved, onShowError,
}: Props) {
  const totalRows = rows.length + localRows.length;

  if (totalRows === 0) {
    return (
      <div className="card text-center py-16 text-slate-400">
        <div className="text-4xl mb-2">📋</div>
        <div className="text-sm">Chưa có giao dịch nào. Bấm <strong className="text-slate-600">+ Thêm dòng</strong> để bắt đầu.</div>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[2810px] text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
            <tr>
              <Th width={40}>#</Th>
              <Th width={230}>Tên khách hàng *</Th>
              <Th width={140}>SĐT *</Th>
              {/* User chốt 2026-06-18: Gói lên trước vì quyết định các field conditional
                  (isChildPackage → Người giám hộ; isCustomQuantity → Số buổi+Đơn giá).
                  Người giám hộ đặt ngay sau Gói (depend on Gói), Nguồn lùi sau.
                  User 2026-06-19: nới rộng từ 180 → 260 để vừa tên dài như
                  "HB chất lượng cao Ếch TE". */}
              <Th width={260}>Gói *</Th>
              <Th width={150}>Người giám hộ</Th>
              <Th width={120}>Nguồn *</Th>
              {/* V6 PT (2026-06-18): 2 ô PT đặt NGAY CẠNH Gói để Sale thao tác liền mạch */}
              <Th width={90} align="right">Số buổi</Th>
              <Th width={130} align="right">Đơn giá / buổi</Th>
              <Th width={140}>Loại GD *</Th>
              <Th width={130}>HT thu *</Th>
              {/* PR-SALES-PAYMENT-SPLIT-SAFE (2026-06-24): 3 cột tiền theo phương thức,
                  đặt ngay sau HT thu để Sale thao tác liền mạch (User 2026-06-24).
                  - Method single (vd tien_mat) → cell tương ứng = collectedToday, 2 cell khác "—"
                  - Method combo (vd tien_mat_chuyen_khoan) → 2 cell active cho nhập, cell thứ 3 "—" */}
              <Th width={110} align="right">Tiền mặt</Th>
              <Th width={110} align="right">Chuyển khoản</Th>
              <Th width={100} align="right">POS</Th>
              <Th width={120}>Số phiếu thu</Th>
              <Th width={120}>Số HĐ</Th>
              <Th width={120} align="right">Giá trị gói *</Th>
              {/* V7 Promo (2026-06-18): KM chips + Giá trị sau KM (= base − discount) */}
              <Th width={200}>Khuyến mãi</Th>
              <Th width={130} align="right">Giá trị sau KM</Th>
              <Th width={120} align="right">Thu hôm nay *</Th>
              <Th width={120} align="right">Công nợ</Th>
              <Th width={140}>Ghi chú</Th>
              <Th width={44}></Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, i) => {
              // V6 per-tx edit: Sale chỉ sửa được tx có reviewStatus=rejected khi batch=returned
              const rowEditable = canEdit && canSaleEditRow(batchStatus, r.reviewStatus);
              return (
                <SavedRow
                  key={r.id}
                  idx={i + 1}
                  row={r}
                  packages={packages}
                  canEdit={rowEditable}
                  batchStatus={batchStatus}
                  branchId={branchId}
                  onUpdate={(patch) => onUpdateSaved(r.id, patch)}
                  onRemove={() => onRemoveSaved(r.id)}
                />
              );
            })}
            {localRows.map((r, i) => {
              // Auto-focus row cuối nếu nó vừa được auto-add (rỗng + là last + có row trước có data)
              const isLast = i === localRows.length - 1;
              const prevHasData = i > 0 && !isRowEmpty(localRows[i - 1]);
              const shouldFocus = isLast && isRowEmpty(r) && prevHasData;
              return (
                <LocalRowItem
                  key={r.tempId}
                  idx={rows.length + i + 1}
                  row={r}
                  packages={packages}
                  canEdit={canEdit}
                  branchId={branchId}
                  batchMonth={batchMonth}
                  onUpdate={(patch) => onUpdateLocal(r.tempId, patch)}
                  onRemove={() => onRemoveLocal(r.tempId)}
                  onShowError={onShowError}
                  autoFocusFirstCell={shouldFocus}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, width, align = 'left' }: { children?: React.ReactNode; width?: number; align?: 'left' | 'right' }) {
  return (
    <th
      className={`px-2.5 py-2 ${align === 'right' ? 'text-right' : 'text-left'} whitespace-nowrap`}
      style={width ? { width } : undefined}
    >
      {children}
    </th>
  );
}

function Td({ children, align = 'left', className = '' }: { children?: React.ReactNode; align?: 'left' | 'right' | 'center'; className?: string }) {
  return (
    <td className={`px-2.5 py-1.5 ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'} ${className}`}>
      {children}
    </td>
  );
}

/** Row đã save (có id Firestore). Edit gửi PATCH ngay. */
function SavedRow({ idx, row, packages, canEdit, batchStatus, branchId, onUpdate, onRemove }: {
  idx: number;
  row: SalesTransaction;
  packages: SalesV2Package[];
  canEdit: boolean;
  batchStatus: string;
  branchId: string;
  onUpdate: (patch: Partial<SalesTransaction>) => void;
  onRemove: () => void;
}) {
  // PT mode: snapshot từ doc (packageIsCustomQuantity). Doc cũ chưa có field → false.
  const isPT = row.packageIsCustomQuantity === true;
  // V8.Y manual mode: snapshot từ doc (packageManualPriceWithQty). Doc cũ → false.
  const isManual = row.packageManualPriceWithQty === true;
  const qty = row.quantity ?? 0;
  const up = row.unitPrice ?? 0;
  // PT: pv tính lại từ qty/up; manual + non-PT: pv = field packageValue (Sale tự nhập/auto-fill)
  const effectivePv = row.transactionType === 'thanh_toan_not' ? 0 : (isPT ? qty * up : row.packageValue);
  const debt = Math.max(0, effectivePv - row.collectedToday);
  // V6 review status visual indicator: chỉ hiển thị badge khi batch returned
  const showBadge = batchStatus === 'returned';
  const rs = row.reviewStatus ?? 'pending';
  const rowBg = !canEdit && batchStatus === 'returned'
    ? (rs === 'approved' ? 'bg-emerald-50/40' : 'bg-slate-50/40')
    : rs === 'rejected' && batchStatus === 'returned'
      ? 'bg-rose-50/40 hover:bg-rose-50/60'
      : 'hover:bg-slate-50/60';
  return (
    <tr className={rowBg} title={showBadge && rs === 'rejected' && row.rejectReason ? `Kế toán đánh dấu lỗi: ${row.rejectReason}` : undefined}>
      <Td align="center" className="text-slate-400 tabular-nums">
        <div className="flex flex-col items-center">
          <span>{idx}</span>
          {showBadge && rs === 'rejected' && (
            <span className="mt-0.5 text-[8px] uppercase font-bold text-rose-600 bg-rose-100 px-1 py-0.5 rounded">
              Sửa
            </span>
          )}
          {showBadge && rs === 'approved' && (
            <span className="mt-0.5 text-[8px] uppercase font-bold text-emerald-600 bg-emerald-100 px-1 py-0.5 rounded">
              OK
            </span>
          )}
          {showBadge && rs === 'pending' && (
            <span className="mt-0.5 text-[8px] uppercase font-bold text-amber-600 bg-amber-100 px-1 py-0.5 rounded">
              Chờ
            </span>
          )}
        </div>
      </Td>
      <Td>
        <TextCell value={row.customerName} disabled={!canEdit} required onCommit={(v) => onUpdate({ customerName: v })} />
      </Td>
      <Td>
        <PhoneCell value={row.phone} disabled={!canEdit} required onCommit={(v) => onUpdate({ phone: v })} placeholder="0901234567" />
      </Td>
      {/* V8.X swap (2026-06-18): Gói lên trước (quyết định Người giám hộ + Số buổi) */}
      <Td>
        <PackagePicker
          packages={packages}
          value={row.packageId || null}
          disabled={!canEdit}
          onChange={(pkg) => {
            if (pkg) {
              const patch: Partial<SalesTransaction> = {
                packageId: pkg.id,
                packageCode: pkg.code,
                packageName: pkg.name,
                serviceGroup: pkg.serviceGroup,
                isChildPackage: pkg.isChildPackage,
                packageIsCustomQuantity: pkg.isCustomQuantity === true,
                packageManualPriceWithQty: pkg.manualPriceWithQuantity === true,
              };
              // PT → seed unitPrice from default nếu doc chưa có; clear quantity
              if (pkg.isCustomQuantity) {
                patch.unitPrice = up > 0 ? up : (pkg.defaultUnitPrice ?? null);
                patch.quantity = null;
              } else if (pkg.manualPriceWithQuantity) {
                // V8.Y manual mode → Sale tự nhập packageValue + qty (note). Clear unitPrice.
                patch.quantity = null;
                patch.unitPrice = null;
              } else {
                // Không phải PT → clear PT fields để server không auto-compute
                patch.quantity = null;
                patch.unitPrice = null;
              }
              onUpdate(patch);
            }
          }}
        />
      </Td>
      {/* V8.X swap (2026-06-18): Người giám hộ + Nguồn ngay sau Gói */}
      <Td>
        {row.isChildPackage ? (
          <TextCell value={row.guardianName ?? ''} disabled={!canEdit} required onCommit={(v) => onUpdate({ guardianName: v || null })} />
        ) : (
          <span className="text-slate-300 text-xs">—</span>
        )}
      </Td>
      <Td>
        <SourceSelect value={row.source} disabled={!canEdit} onChange={(v) => onUpdate({ source: v })} />
      </Td>
      {/* V6 PT + V8.Y Manual (2026-06-19): Số buổi cho cả PT và Manual; Đơn giá CHỈ PT */}
      <Td align="right">
        {(isPT || isManual) && row.transactionType !== 'thanh_toan_not'
          ? <NumberCell
              value={qty}
              disabled={!canEdit}
              emphasis
              placeholder="Nhập số"
              onCommit={(v) => onUpdate({ quantity: v > 0 ? v : null })}
            />
          : <span className="text-slate-300 text-xs">—</span>
        }
      </Td>
      <Td align="right">
        {isPT && row.transactionType !== 'thanh_toan_not'
          ? <NumberCell
              value={up}
              disabled={!canEdit}
              emphasis
              placeholder="Đơn giá"
              onCommit={(v) => onUpdate({ unitPrice: v >= 0 ? v : null })}
            />
          : <span className="text-slate-300 text-xs">—</span>
        }
      </Td>
      <Td>
        <TxnTypeSelect
          value={row.transactionType}
          disabled={!canEdit}
          onChange={(v) => {
            // ISSUE-1 audit fix: clear field chứng từ không thuộc loại mới (dùng '' để
            // tương thích cả LocalRow string lẫn SavedRow nullable; server normalize → null).
            const patch: Record<string, any> = { transactionType: v };
            if (v === 'thanh_toan_full') patch.receiptNo = '';
            if (v === 'dat_coc') patch.contractNo = '';
            onUpdate(patch as any);
          }}
        />
      </Td>
      <Td>
        <PayMethodSelect value={row.paymentMethod} disabled={!canEdit} onChange={(v) => onUpdate({ paymentMethod: v })} />
      </Td>
      {/* PR-SALES-PAYMENT-SPLIT-SAFE: 3 cell read-only cho saved tx, đặt ngay sau HT thu.
          User 2026-06-24: position theo HT thu để Sale đọc breakdown nhanh. */}
      <SavedTxBreakdownCells tx={row} />
      <Td>
        <DocCell
          value={row.receiptNo ?? ''}
          disabled={!canEdit}
          required={row.transactionType === 'dat_coc'}
          hideForType={row.transactionType === 'thanh_toan_full'}
          prefix="PT"
          placeholder={row.transactionType === 'thanh_toan_not' ? 'số PT cũ' : '001'}
          onCommit={(v) => onUpdate({ receiptNo: v || null })}
        />
      </Td>
      <Td>
        <DocCell
          value={row.contractNo ?? ''}
          disabled={!canEdit}
          required={row.transactionType === 'thanh_toan_full' || row.transactionType === 'thanh_toan_not'}
          hideForType={row.transactionType === 'dat_coc'}
          prefix="HĐ"
          placeholder="001"
          onCommit={(v) => onUpdate({ contractNo: v || null })}
        />
      </Td>
      <Td align="right">
        {row.transactionType === 'thanh_toan_not' ? (
          <span className="text-slate-300 text-xs" title="Thanh toán nốt — không tính doanh số mới">—</span>
        ) : isPT ? (
          <span
            className="block text-right tabular-nums text-slate-700 font-medium px-2 py-1 bg-slate-50 rounded"
            title="Auto = Số buổi × Đơn giá / buổi"
          >
            {(qty * up || 0).toLocaleString()}
          </span>
        ) : (
          <NumberCell value={row.packageValue} disabled={!canEdit} onCommit={(v) => onUpdate({ packageValue: v })} />
        )}
      </Td>
      {/* V7 Promo (2026-06-18) — readonly cho SavedRow (xoá+tạo lại nếu muốn đổi promo) */}
      <Td>
        <PromoChipsReadonly snapshots={row.promoSnapshots ?? []} discountAmount={row.discountAmount ?? 0}
          bonusQuantity={row.bonusQuantity ?? 0} bonusDays={row.bonusDays ?? 0}
          unitName={row.packageUnitName || 'buổi'} />
      </Td>
      {/* Giá trị sau KM = server-stored packageValue (đã trừ discount) */}
      <Td align="right" className="tabular-nums">
        {row.transactionType === 'thanh_toan_not' ? (
          <span className="text-slate-300 text-xs">—</span>
        ) : (row.discountAmount ?? 0) > 0 ? (
          <span className="font-semibold text-emerald-700">{row.packageValue.toLocaleString()}</span>
        ) : (
          <span className="text-slate-600">{row.packageValue.toLocaleString()}</span>
        )}
      </Td>
      <Td align="right">
        <NumberCell value={row.collectedToday} disabled={!canEdit} required onCommit={(v) => onUpdate({ collectedToday: v })} />
      </Td>
      <Td align="right" className="tabular-nums text-slate-600 font-medium">
        {debt > 0 ? <span className="text-rose-600">{debt.toLocaleString()}</span> : <span className="text-slate-300">0</span>}
      </Td>
      <Td>
        <TextCell value={row.note ?? ''} disabled={!canEdit} onCommit={(v) => onUpdate({ note: v || null })} placeholder="—" />
      </Td>
      <Td align="center">
        {canEdit && (
          <button onClick={onRemove} className="p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600" title="Xoá dòng">
            <Trash2 size={14} />
          </button>
        )}
      </Td>
    </tr>
  );
}

/** Row local (chưa save). Edit cập nhật state cha. */
function LocalRowItem({ idx, row, packages, canEdit, branchId, batchMonth, onUpdate, onRemove, onShowError, autoFocusFirstCell }: {
  idx: number;
  row: LocalRow;
  packages: SalesV2Package[];
  canEdit: boolean;
  branchId: string;
  batchMonth: string;
  onUpdate: (patch: Partial<LocalRow>) => void;
  onRemove: () => void;
  onShowError?: (msg: string) => void;
  autoFocusFirstCell?: boolean;
}) {
  // 'thanh_toan_not' = trả nốt → KHÔNG tính doanh số mới + debt = 0 (sẽ link gd cũ)
  const isThanhToanNot = row.transactionType === 'thanh_toan_not';
  const isPT = row.packageIsCustomQuantity;
  // V8.Y manual mode (HB CLB Kid/Aqua) — Sale tự nhập packageValue + ghi số buổi (note)
  const isManual = row.packageManualPriceWithQty;
  const qty = Number(row.quantity) || 0;
  const up = Number(row.unitPrice) || 0;
  // base: PT = qty×up; Manual & Non-PT = packageValue field. Final = base - discount.
  const base = isThanhToanNot ? 0 : (isPT ? qty * up : (Number(row.packageValue) || 0));
  const discount = isThanhToanNot ? 0 : discountSumOf(row);
  const pv = Math.max(0, base - discount);
  const ct = Number(row.collectedToday) || 0;
  const debt = isThanhToanNot ? 0 : Math.max(0, pv - ct);
  const rowEmpty = useMemo(() => isRowEmpty(row), [row]);
  const validation = useMemo(() => (rowEmpty ? { ok: true as const } : validateRow(row)), [row, rowEmpty]);
  const firstCellRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (autoFocusFirstCell) {
      const el = firstCellRef.current;
      if (el) {
        el.focus();
        try { el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch {}
      }
    }
  }, [autoFocusFirstCell]);

  return (
    <tr className={`bg-amber-50/40 hover:bg-amber-50/70 ${!validation.ok ? 'border-l-2 border-amber-400' : ''}`}>
      <Td align="center" className="text-amber-600 tabular-nums font-semibold" >
        <div className="flex flex-col items-center">
          <span>{idx}</span>
          <span className="text-[9px] uppercase font-medium text-amber-600 tracking-wider">mới</span>
        </div>
      </Td>
      <Td>
        <TextCell value={row.customerName} disabled={!canEdit} required onCommit={(v) => onUpdate({ customerName: v })} placeholder="Tên KH..." inputRef={firstCellRef} />
      </Td>
      <Td>
        <PhoneCell value={row.phone} disabled={!canEdit} required onCommit={(v) => onUpdate({ phone: v })} placeholder="0901234567" />
      </Td>
      {/* V8.X swap (2026-06-18): Gói lên trước (quyết định Người giám hộ + Số buổi) */}
      <Td>
        <PackagePicker
          packages={packages}
          value={row.packageId}
          disabled={!canEdit}
          onChange={async (pkg) => {
            if (!pkg) {
              onUpdate({
                packageId: null, packageCode: '', packageName: '', serviceGroup: '',
                isChildPackage: false, packageIsCustomQuantity: false, packageManualPriceWithQty: false,
                quantity: '', unitPrice: '',
              });
              return;
            }
            // V6 PT: gói tính theo buổi → KHÔNG dùng packageValue/defaultPrice trực tiếp.
            // Seed unitPrice từ pkg.defaultUnitPrice nếu user chưa nhập. Clear packageValue (auto).
            if (pkg.isCustomQuantity) {
              const seededUnitPrice = (Number(row.unitPrice) || 0) > 0
                ? row.unitPrice
                : (pkg.defaultUnitPrice != null ? String(pkg.defaultUnitPrice) : '');
              onUpdate({
                packageId: pkg.id,
                packageCode: pkg.code,
                packageName: pkg.name,
                serviceGroup: pkg.serviceGroup,
                isChildPackage: pkg.isChildPackage,
                packageIsCustomQuantity: true,
                packageManualPriceWithQty: false,
                packageValue: '', // auto-compute, không dùng
                unitPrice: seededUnitPrice,
                // Giữ nguyên row.quantity nếu user đã nhập (vd đổi gói PT khác)
              });
              return;
            }
            // V8.Y (2026-06-19) Manual mode (HB CLB Kid/Aqua):
            // Sale TỰ NHẬP packageValue (suggest từ defaultPrice nếu admin có set) + ghi số buổi.
            // KHÔNG có unitPrice.
            if (pkg.manualPriceWithQuantity) {
              onUpdate({
                packageId: pkg.id,
                packageCode: pkg.code,
                packageName: pkg.name,
                serviceGroup: pkg.serviceGroup,
                isChildPackage: pkg.isChildPackage,
                packageIsCustomQuantity: false,
                packageManualPriceWithQty: true,
                // Suggest from defaultPrice nếu admin có; nếu không → trống cho Sale nhập.
                packageValue: pkg.defaultPrice > 0 ? String(pkg.defaultPrice) : '',
                quantity: '', // bắt buộc Sale nhập
                unitPrice: '',
              });
              return;
            }
            // V7 (2026-06-18): Gói cố định → AUTO-FILL packageValue từ pkg.defaultPrice.
            // Sale KHÔNG sửa Giá trị gói (chỉ admin set ở /packages).
            // Nếu pkg.defaultPrice = 0 (chưa setup) → giữ '' → validateRow chặn POST + message rõ.
            onUpdate({
              packageId: pkg.id,
              packageCode: pkg.code,
              packageName: pkg.name,
              serviceGroup: pkg.serviceGroup,
              isChildPackage: pkg.isChildPackage,
              packageIsCustomQuantity: false,
              packageManualPriceWithQty: false,
              packageValue: pkg.defaultPrice > 0 ? String(pkg.defaultPrice) : '',
              quantity: '',
              unitPrice: '',
            });
          }}
        />
      </Td>
      {/* V8.X swap (2026-06-18): Người giám hộ + Nguồn ngay sau Gói */}
      <Td>
        {row.isChildPackage ? (
          <TextCell value={row.guardianName} disabled={!canEdit} required onCommit={(v) => onUpdate({ guardianName: v })} placeholder="Người giám hộ..." />
        ) : (
          <span className="text-slate-300 text-xs">—</span>
        )}
      </Td>
      <Td>
        <SourceSelect value={row.source} disabled={!canEdit} onChange={(v) => onUpdate({ source: v })} />
      </Td>
      {/* V6 PT + V8.Y Manual (2026-06-19): Số buổi cho cả PT và Manual; Đơn giá CHỈ PT */}
      <Td align="right">
        {(isPT || isManual) && !isThanhToanNot
          ? <NumberCell
              value={qty}
              disabled={!canEdit}
              emphasis
              placeholder="Nhập số"
              onCommit={(v) => onUpdate({ quantity: v > 0 ? String(v) : '' })}
            />
          : <span className="text-slate-300 text-xs">—</span>
        }
      </Td>
      <Td align="right">
        {isPT && !isThanhToanNot
          ? <NumberCell
              value={up}
              disabled={!canEdit}
              emphasis
              placeholder="Đơn giá"
              onCommit={(v) => onUpdate({ unitPrice: v >= 0 ? String(v) : '' })}
            />
          : <span className="text-slate-300 text-xs">—</span>
        }
      </Td>
      <Td>
        <TxnTypeSelect
          value={row.transactionType}
          disabled={!canEdit}
          onChange={(v) => {
            // ISSUE-1 audit fix: clear field chứng từ không thuộc loại mới (dùng '' để
            // tương thích cả LocalRow string lẫn SavedRow nullable; server normalize → null).
            const patch: Record<string, any> = { transactionType: v };
            if (v === 'thanh_toan_full') patch.receiptNo = '';
            if (v === 'dat_coc') patch.contractNo = '';
            onUpdate(patch as any);
          }}
        />
      </Td>
      <Td>
        <PayMethodSelect value={row.paymentMethod} disabled={!canEdit} onChange={(v) => onUpdate({ paymentMethod: v })} />
      </Td>
      {/* PR-SALES-PAYMENT-SPLIT-SAFE: 3 cell tiền theo method, đặt ngay sau HT thu.
          User 2026-06-24: re-order để Sale nhập tiền liền mạch sau khi chọn HT thu.
          - Single method: cell active = collectedToday read-only; 2 cell khác "—"
          - Combo method: 2 cell active editable; cell thứ 3 "—" */}
      <SplitPaymentCells row={row} canEdit={canEdit} onUpdate={onUpdate} />
      <Td>
        <DocCell
          value={row.receiptNo}
          disabled={!canEdit}
          required={row.transactionType === 'dat_coc'}
          hideForType={row.transactionType === 'thanh_toan_full'}
          prefix="PT"
          placeholder={row.transactionType === 'thanh_toan_not' ? 'số PT cũ' : '001'}
          onCommit={(v) => onUpdate({ receiptNo: v })}
        />
      </Td>
      <Td>
        <DocCell
          value={row.contractNo}
          disabled={!canEdit}
          required={row.transactionType === 'thanh_toan_full' || row.transactionType === 'thanh_toan_not'}
          hideForType={row.transactionType === 'dat_coc'}
          prefix="HĐ"
          placeholder="001"
          onCommit={(v) => onUpdate({ contractNo: v })}
        />
      </Td>
      <Td align="right">
        {isThanhToanNot ? (
          <span className="text-slate-300 text-xs" title="Thanh toán nốt — không tính doanh số mới (sẽ link với GD cũ)">—</span>
        ) : isPT ? (
          <span className="block text-right tabular-nums text-slate-700 font-medium px-2 py-1 bg-slate-50 rounded"
            title="Auto = Số buổi × Đơn giá / buổi (TRƯỚC khuyến mãi)">
            {base.toLocaleString()}
          </span>
        ) : isManual ? (
          // V8.Y manual mode: Sale TỰ NHẬP giá trị gói (suggest từ defaultPrice nếu admin có)
          <NumberCell
            value={Number(row.packageValue) || 0}
            disabled={!canEdit}
            emphasis
            placeholder="Sale tự nhập"
            onCommit={(v) => onUpdate({ packageValue: v > 0 ? String(v) : '' })}
          />
        ) : base > 0 ? (
          // V7 (2026-06-18): Auto-fill từ pkg.defaultPrice — Sale KHÔNG sửa.
          <span className="block text-right tabular-nums text-slate-700 font-medium px-2 py-1 bg-slate-50 rounded"
            title="Giá gói lấy từ /doanh-so/packages — chỉ admin sửa được">
            {base.toLocaleString()}
          </span>
        ) : (
          // pkg chưa có defaultPrice hoặc chưa chọn gói
          <span className="block text-right text-xs text-amber-600 italic px-2"
            title="Gói chưa có giá — báo admin cập nhật giá ở /doanh-so/packages">
            {row.packageId ? 'Gói chưa có giá' : '—'}
          </span>
        )}
      </Td>
      {/* V7 Promo (2026-06-18) — editable cho LocalRow */}
      <Td>
        <PromoCell
          row={row}
          branchId={branchId}
          batchMonth={batchMonth}
          canEdit={canEdit && !isThanhToanNot}
          onUpdate={(snapshots) => onUpdate({ promoSnapshots: snapshots })}
        />
      </Td>
      {/* Giá trị sau KM = base − discount (auto, readonly) */}
      <Td align="right" className="tabular-nums">
        {isThanhToanNot ? (
          <span className="text-slate-300 text-xs">—</span>
        ) : discount > 0 ? (
          <div>
            <span className="block text-[10px] text-slate-400 leading-tight">−{discount.toLocaleString()}</span>
            <span className="font-semibold text-emerald-700">{pv.toLocaleString()}</span>
          </div>
        ) : (
          <span className="text-slate-600">{pv.toLocaleString()}</span>
        )}
      </Td>
      <Td align="right">
        {/* Combo method: collectedToday tự tính = tổng 2 cell active; read-only */}
        {row.paymentMethod && isSplitPayment(row.paymentMethod) ? (
          <span className="block px-2 py-1 text-xs tabular-nums font-semibold text-violet-700 bg-violet-50/40 rounded ring-1 ring-violet-200">
            {sumSplitCells(row).toLocaleString()}
          </span>
        ) : (
          <NumberCell value={ct} disabled={!canEdit} required onCommit={(v) => onUpdate({ collectedToday: String(v) })} />
        )}
      </Td>
      <Td align="right" className="tabular-nums text-slate-600 font-medium">
        {(() => {
          const realCt = row.paymentMethod && isSplitPayment(row.paymentMethod) ? sumSplitCells(row) : ct;
          const realDebt = isThanhToanNot ? 0 : Math.max(0, pv - realCt);
          return realDebt > 0 ? <span className="text-rose-600">{realDebt.toLocaleString()}</span> : <span className="text-slate-300">0</span>;
        })()}
      </Td>
      <Td>
        <TextCell value={row.note} disabled={!canEdit} onCommit={(v) => onUpdate({ note: v })} placeholder="—" />
      </Td>
      <Td align="center">
        {canEdit && (
          <button onClick={onRemove} className="p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600" title="Bỏ dòng">
            <Trash2 size={14} />
          </button>
        )}
        {(row.errorMessage || !validation.ok) && (() => {
          const msg = row.errorMessage ?? (validation.ok ? '' : validation.error);
          // HOTFIX UX 2026-06-24: chấm than click hiện rõ lỗi qua toast (parent),
          // fallback alert nếu không có callback. Trước đây chỉ HTML title → mobile/Sale
          // dễ bỏ sót lý do dòng có lỗi.
          return (
            <button
              type="button"
              onClick={() => {
                if (!msg) return;
                if (onShowError) onShowError(`Dòng ${idx}: ${msg}`);
                else if (typeof window !== 'undefined') window.alert(`Dòng ${idx}: ${msg}`);
              }}
              title={msg ? `Bấm để xem lỗi · ${msg}` : 'Có lỗi'}
              aria-label={msg ? `Lỗi: ${msg}` : 'Lỗi dòng'}
              className="mx-auto mt-1 p-0.5 rounded hover:bg-amber-100 text-amber-600 hover:text-amber-700 transition-colors block"
            >
              <AlertCircle size={14} />
            </button>
          );
        })()}
      </Td>
    </tr>
  );
}

// ─── Atomic cell components ────────────────────────────────────────

/** V8.X (2026-06-18) refactor — User chốt: TẤT CẢ ô input dùng viền TÍM thống nhất
 *  (signal "đây là ô để nhập"); viền ĐỎ chỉ xuất hiện khi có LỖI (sai format).
 *  Optional fields không có error → vẫn viền tím để rõ ràng là ô nhập. */
const INPUT_BASE = 'border border-violet-200 bg-white focus:bg-white focus:border-violet-500 focus:ring-2 focus:ring-violet-100 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-50';
const INPUT_ERROR = 'border border-rose-400 ring-1 ring-rose-300 bg-rose-50/40 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-50';

function TextCell({
  value, disabled, onCommit, placeholder, inputRef, required,
}: {
  value: string;
  disabled: boolean;
  onCommit: (v: string) => void;
  placeholder?: string;
  inputRef?: React.MutableRefObject<HTMLInputElement | null>;
  required?: boolean;
}) {
  // HOTFIX Layer 4 (2026-06-24): defensive coerce — atomic cell phải an toàn
  // dù caller pass undefined/null. Last line of defense sau coerceLocalRow/
  // ?? '' trong validateRow/isRowEmpty.
  const v = value ?? '';
  return (
    <input
      ref={(el) => { if (inputRef) inputRef.current = el; }}
      type="text"
      defaultValue={v}
      disabled={disabled}
      placeholder={placeholder}
      onBlur={(e) => {
        const next = e.target.value;
        if (next !== v) onCommit(next);
      }}
      title={required && !v.trim() ? 'Bắt buộc nhập' : undefined}
      className={`w-full px-2 py-1 rounded text-sm ${INPUT_BASE}`}
    />
  );
}

/** Phone cell. V8.X: viền tím chung, đỏ CHỈ KHI sai format (>0 ký tự nhưng không match). */
function PhoneCell({
  value, disabled, onCommit, placeholder, required,
}: {
  value: string;
  disabled: boolean;
  onCommit: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  // HOTFIX Layer 4 (2026-06-24): defensive coerce value at boundary.
  const safeValue = value ?? '';
  const [local, setLocal] = useState(safeValue);
  useEffect(() => { setLocal(safeValue); }, [safeValue]);
  const trimmed = (local ?? '').trim();
  const isEmpty = trimmed.length === 0;
  const invalid = !isEmpty && !isValidPhone(trimmed);
  return (
    <input
      type="tel"
      inputMode="numeric"
      maxLength={11}
      value={local}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => setLocal(e.target.value.replace(/[^\d]/g, ''))}
      onBlur={() => { if (local !== value) onCommit(local); }}
      title={invalid ? 'SĐT phải 10 số bắt đầu bằng 0 (vd: 0901234567)' : (required && isEmpty ? 'Bắt buộc nhập' : '')}
      className={`w-full px-2 py-1 rounded text-sm ${invalid ? INPUT_ERROR : INPUT_BASE}`}
    />
  );
}

/** Số phiếu thu / Số HĐ. Required màu amber khi cần điền. Hide cho loại không cần.
 *  V7 (2026-06-18): prefix cố định ('PT' hoặc 'HĐ') hiển thị bên trái — Sale chỉ gõ phần số.
 *  Server lưu full string ('PT001'). Khi receive value đã có prefix → strip để hiển thị. */
function DocCell({
  value, disabled, required, hideForType, placeholder, prefix, onCommit,
}: {
  value: string;
  disabled: boolean;
  required: boolean;
  hideForType: boolean;
  placeholder?: string;
  prefix?: string;
  onCommit: (v: string) => void;
}) {
  if (hideForType) {
    return <span className="text-slate-300 text-xs px-2">—</span>;
  }
  const v = (value ?? '') as string;
  const isEmpty = !v.trim();
  // Strip prefix khỏi value khi display (vd value='PT001' + prefix='PT' → display '001')
  const stripPrefix = (s: string) => {
    if (!prefix) return s;
    const trimmed = s.trim();
    return trimmed.toUpperCase().startsWith(prefix.toUpperCase()) ? trimmed.slice(prefix.length).trim() : trimmed;
  };
  const displayValue = stripPrefix(v);
  // Commit: nối lại prefix nếu user gõ thiếu (nếu user tự gõ 'PT' thì để nguyên)
  const buildFullValue = (userInput: string): string => {
    const t = userInput.trim();
    if (!t) return '';
    if (!prefix) return t;
    if (t.toUpperCase().startsWith(prefix.toUpperCase())) return t;
    return `${prefix}${t}`;
  };
  // V8.X refactor: viền tím chung cho mọi ô input. Đỏ CHỈ khi có lỗi (DocCell
  // hiện chưa có format validation rõ — required-empty không phải lỗi, để Sale
  // thấy "cần nhập" qua header * + tooltip).
  return (
    <div className="w-full flex items-center rounded border border-violet-200 bg-white text-xs focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-100 disabled:cursor-not-allowed"
      title={required && isEmpty ? 'Bắt buộc nhập' : ''}>
      {prefix && (
        <span className="px-1.5 py-1 text-slate-500 font-mono font-semibold bg-slate-100/70 rounded-l border-r border-slate-200 select-none text-[11px]">
          {prefix}
        </span>
      )}
      <input
        type="text"
        // key forces re-mount khi value đổi từ ngoài (vd auto-clear sau đổi loại GD)
        key={v}
        defaultValue={displayValue}
        disabled={disabled}
        placeholder={placeholder ?? '001'}
        maxLength={50 - (prefix?.length ?? 0)}
        onBlur={(e) => {
          const full = buildFullValue(e.target.value);
          if (full !== v) onCommit(full);
        }}
        className="flex-1 min-w-0 px-1.5 py-1 bg-transparent border-0 focus:outline-none text-xs disabled:cursor-not-allowed"
      />
    </div>
  );
}

function NumberCell({
  value, disabled, onCommit, placeholder, emphasis, required,
}: {
  value: number;
  disabled: boolean;
  onCommit: (v: number) => void;
  placeholder?: string;
  // emphasis=true → border + bg visible để Sale dễ thấy đây là ô cần nhập (vd: PT số buổi)
  emphasis?: boolean;
  // V8.X: required → red ring khi empty, green ring khi filled
  required?: boolean;
}) {
  // Format thousand separator khi blur; khi focus hiển thị raw số để dễ edit.
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState<string>(value > 0 ? String(value) : '');
  useEffect(() => {
    if (!editing) setRaw(value > 0 ? String(value) : '');
  }, [value, editing]);
  const display = editing ? raw : (value > 0 ? value.toLocaleString() : '');
  // V8.X refactor: TẤT CẢ ô input dùng viền tím chung. emphasis (PT) đậm hơn nhẹ.
  // Đỏ chỉ khi explicit lỗi (NumberCell hiện chưa có rule lỗi runtime — required check
  // do validateRow handle ở row-level, hiển thị AlertCircle ở cuối row).
  const baseCls = emphasis
    ? `w-full px-2 py-1 rounded text-sm text-right tabular-nums text-violet-900 placeholder-violet-300 font-medium ${INPUT_BASE}`
    : `w-full px-2 py-1 rounded text-sm text-right tabular-nums ${INPUT_BASE}`;
  return (
    <input
      type="text"
      inputMode="numeric"
      value={display}
      disabled={disabled}
      placeholder={placeholder}
      onFocus={() => setEditing(true)}
      onChange={(e) => setRaw(e.target.value.replace(/[^\d]/g, ''))}
      onBlur={() => {
        setEditing(false);
        const v = Number(raw) || 0;
        if (v !== value) onCommit(v);
      }}
      className={baseCls}
    />
  );
}

function SourceSelect({ value, disabled, onChange }: {
  value: SalesV2Source | null;
  disabled: boolean;
  onChange: (v: SalesV2Source) => void;
}) {
  // V8.X refactor: viền tím chung. Khi đã chọn → tone đặc trưng theo SOURCE_TONE để Sale dễ scan.
  const cls = value
    ? `${SOURCE_TONE[value]} border border-transparent ring-1`
    : 'bg-white text-slate-600 border border-violet-200';
  return (
    <select
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as SalesV2Source)}
      title={value ? '' : 'Chọn nguồn khách'}
      className={`w-full px-2 py-1 rounded text-xs font-medium focus:outline-none focus:ring-2 focus:ring-violet-100 focus:border-violet-500 disabled:cursor-not-allowed ${cls}`}
    >
      <option value="">— Chọn —</option>
      {(Object.keys(SOURCE_LABEL) as SalesV2Source[]).map((k) => (
        <option key={k} value={k}>{SOURCE_LABEL[k]}</option>
      ))}
    </select>
  );
}

function TxnTypeSelect({ value, disabled, onChange }: {
  value: TransactionType | null;
  disabled: boolean;
  onChange: (v: TransactionType) => void;
}) {
  // V8.X refactor: viền tím chung cho mọi select input
  return (
    <select
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as TransactionType)}
      title={value ? '' : 'Chọn loại giao dịch'}
      className="w-full px-2 py-1 rounded text-xs font-medium text-slate-700 border border-violet-200 bg-white focus:outline-none focus:ring-2 focus:ring-violet-100 focus:border-violet-500 disabled:cursor-not-allowed"
    >
      <option value="">— Chọn —</option>
      {(Object.keys(TRANSACTION_TYPE_LABEL) as TransactionType[]).map((k) => (
        <option key={k} value={k}>{TRANSACTION_TYPE_LABEL[k]}</option>
      ))}
    </select>
  );
}

/** PR-SALES-PAYMENT-SPLIT-SAFE (2026-06-24): saved tx breakdown — read-only 3 cell. */
function SavedTxBreakdownCells({ tx }: { tx: SalesTransaction }) {
  const bd = (tx.paymentBreakdown && typeof tx.paymentBreakdown.cash === 'number')
    ? tx.paymentBreakdown
    : (() => {
        // Legacy fallback: derive từ paymentMethod + collectedToday cho 3 single method.
        const out = { cash: 0, transfer: 0, card: 0 };
        const amt = Number(tx.collectedToday) || 0;
        if (tx.paymentMethod === 'tien_mat') out.cash = amt;
        else if (tx.paymentMethod === 'chuyen_khoan') out.transfer = amt;
        else if (tx.paymentMethod === 'pos') out.card = amt;
        return out;
      })();
  function cell(v: number) {
    return (
      <Td align="right">
        {v > 0 ? (
          <span className="block px-2 py-1 text-xs tabular-nums font-medium text-slate-700">{v.toLocaleString()}</span>
        ) : (
          <span className="block px-2 py-1 text-xs text-slate-300 text-center">—</span>
        )}
      </Td>
    );
  }
  return <>{cell(bd.cash)}{cell(bd.transfer)}{cell(bd.card)}</>;
}

/** PR-SALES-PAYMENT-SPLIT-SAFE (2026-06-24): 3 cell tiền theo phương thức.
 *  - Cell active (theo method) — viền tím nhẹ, input editable (combo) hoặc display collectedToday (single).
 *  - Cell inactive — hiện "—", disabled, không nhập được. */
function SplitPaymentCells({ row, canEdit, onUpdate }: {
  row: LocalRow;
  canEdit: boolean;
  onUpdate: (patch: Partial<LocalRow>) => void;
}) {
  const method = row.paymentMethod;
  const active = method ? new Set<PaymentBucket>(getActivePaymentFields(method)) : new Set<PaymentBucket>();
  const split = method ? isSplitPayment(method) : false;
  const ct = Number(row.collectedToday) || 0;

  // Single method: cell active hiển thị collectedToday (read-only mirror). Combo: cell active editable, lưu vào paymentCash/Transfer/Card.
  function renderCell(bucket: PaymentBucket, rowField: 'paymentCash' | 'paymentTransfer' | 'paymentCard') {
    if (!method || !active.has(bucket)) {
      return (
        <Td align="right">
          <span className="block px-2 py-1 text-xs text-slate-300 text-center font-medium">—</span>
        </Td>
      );
    }
    if (!split) {
      // Single method: cell active mirror collectedToday (read-only nhưng nền tím nhẹ).
      return (
        <Td align="right">
          <span className="block px-2 py-1 text-xs tabular-nums font-semibold text-violet-700 bg-violet-50/40 rounded ring-1 ring-violet-200">
            {ct.toLocaleString()}
          </span>
        </Td>
      );
    }
    // Combo: editable input, viền tím rõ.
    const v = Number(row[rowField]) || 0;
    return (
      <Td align="right">
        <NumberCell
          value={v}
          disabled={!canEdit}
          required
          onCommit={(val) => onUpdate({ [rowField]: String(val) } as Partial<LocalRow>)}
        />
      </Td>
    );
  }

  return (
    <>
      {renderCell('cash', 'paymentCash')}
      {renderCell('transfer', 'paymentTransfer')}
      {renderCell('card', 'paymentCard')}
    </>
  );
}

function PayMethodSelect({ value, disabled, onChange }: {
  value: PaymentMethod | null;
  disabled: boolean;
  onChange: (v: PaymentMethod) => void;
}) {
  // V8.X refactor: viền tím chung; khi đã chọn → tone đặc trưng theo PAY_TONE để dễ scan
  const cls = value
    ? `${PAY_TONE[value]} border border-transparent ring-1`
    : 'bg-white text-slate-600 border border-violet-200';
  return (
    <select
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as PaymentMethod)}
      title={value ? '' : 'Chọn hình thức thu'}
      className={`w-full px-2 py-1 rounded text-xs font-medium focus:outline-none focus:ring-2 focus:ring-violet-100 focus:border-violet-500 disabled:cursor-not-allowed ${cls}`}
    >
      <option value="">— Chọn —</option>
      {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((k) => (
        <option key={k} value={k}>{PAYMENT_METHOD_LABEL[k]}</option>
      ))}
    </select>
  );
}

// ─── V7 Promo cells ──────────────────────────────────────────

const PROMO_TYPE_SHORT: Record<PromoType, string> = {
  percent: '%', fixed_amount: 'VND', bonus_sessions: 'Buổi', bonus_days: 'Ngày',
};
function fmtPromoChip(s: PromoSnapshot, unitName: string = 'buổi'): string {
  if (s.type === 'percent') return `-${s.value}%`;
  if (s.type === 'fixed_amount') return `-${s.value.toLocaleString()}đ`;
  if (s.type === 'bonus_sessions') return `+${s.value} ${unitName}`;
  if (s.type === 'bonus_days') return `+${s.value} ngày`;
  return String(s.value);
}

/** Readonly chips display cho SavedRow — không cho edit (xoá+tạo lại nếu muốn đổi). */
function PromoChipsReadonly({ snapshots, discountAmount, bonusQuantity, bonusDays, unitName }: {
  snapshots: PromoSnapshot[];
  discountAmount: number;
  bonusQuantity: number;
  bonusDays: number;
  unitName: string;
}) {
  if (snapshots.length === 0) return <span className="text-slate-300 text-xs">—</span>;
  return (
    <div className="flex flex-col gap-0.5">
      {snapshots.map((s) => (
        <div key={s.id} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ring-1 max-w-fit ${
          isDiscountType(s.type) ? 'bg-violet-50 text-violet-700 ring-violet-200' : 'bg-rose-50 text-rose-700 ring-rose-200'
        }`}>
          <span className="font-mono font-bold">{s.code}</span>
          <span className="opacity-60">·</span>
          <span>{fmtPromoChip(s, unitName)}</span>
        </div>
      ))}
      {discountAmount > 0 && (
        <span className="text-[10px] text-emerald-700 tabular-nums">Giảm {discountAmount.toLocaleString()}đ</span>
      )}
      {bonusQuantity > 0 && (
        <span className="text-[10px] text-rose-700 tabular-nums">Tặng {bonusQuantity} {unitName}</span>
      )}
      {bonusDays > 0 && (
        <span className="text-[10px] text-cyan-700 tabular-nums">Tặng {bonusDays} ngày</span>
      )}
    </div>
  );
}

/** Editable cell cho LocalRow — popover picker + chips. */
function PromoCell({ row, branchId, batchMonth, canEdit, onUpdate }: {
  row: LocalRow;
  branchId: string;
  batchMonth: string;
  canEdit: boolean;
  onUpdate: (snapshots: PromoSnapshot[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState<AvailablePromo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const snapshots = row.promoSnapshots ?? [];
  const unitName = row.packageId ? (row.packageIsCustomQuantity ? 'buổi' : '') : '';

  const fetchAvailable = useCallback(async () => {
    if (!row.packageId) return;
    setLoading(true); setError(null);
    try {
      // V7 audit fix: dùng batchMonth (tháng của tx) thay vì current month — đảm bảo
      // promo list khớp với scope server validate (tránh hiện promo tháng này khi tx
      // thuộc tháng trước).
      const qs = new URLSearchParams({ branchId, packageId: row.packageId, month: batchMonth });
      const r = await fetch(`/api/sales-v2/programs/available?${qs.toString()}`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      const j = await r.json();
      setAvailable(j.programs as AvailablePromo[]);
    } catch (e: any) { setError(e?.message ?? 'Lỗi tải'); }
    finally { setLoading(false); }
  }, [branchId, row.packageId, batchMonth]);

  function openPicker() {
    if (!canEdit) return;
    if (!row.packageId) { setError('Chọn gói trước khi thêm khuyến mãi'); return; }
    setOpen(true);
    void fetchAvailable();
  }

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function addPromo(p: AvailablePromo) {
    // Check combo: max 1 discount + 1 bonus
    const newType = p.promoType;
    const sameGroup = snapshots.filter((s) =>
      (isDiscountType(s.type) && isDiscountType(newType)) ||
      (isBonusType(s.type) && isBonusType(newType))
    );
    let nextSnaps = snapshots;
    if (sameGroup.length > 0) {
      // Replace cùng nhóm (vd đã có 1 discount, chọn discount khác → thay)
      nextSnaps = snapshots.filter((s) => s.id !== sameGroup[0].id);
    }
    // Tránh add trùng
    if (nextSnaps.some((s) => s.id === p.id)) return;
    nextSnaps = [...nextSnaps, {
      id: p.id, code: p.promoCode, name: p.name, type: p.promoType, value: p.promoValue,
    }];
    onUpdate(nextSnaps);
    setOpen(false);
  }

  function removePromo(id: string) {
    onUpdate(snapshots.filter((s) => s.id !== id));
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex flex-wrap items-center gap-1">
        {snapshots.map((s) => (
          <span key={s.id} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ring-1 ${
            isDiscountType(s.type) ? 'bg-violet-50 text-violet-700 ring-violet-200' : 'bg-rose-50 text-rose-700 ring-rose-200'
          }`}>
            <span className="font-mono font-bold">{s.code}</span>
            <span className="opacity-60">·</span>
            <span>{fmtPromoChip(s, unitName)}</span>
            {canEdit && (
              <button type="button" onClick={() => removePromo(s.id)} className="opacity-60 hover:opacity-100">
                <X size={10} />
              </button>
            )}
          </span>
        ))}
        {canEdit && snapshots.length < 2 && (
          <button type="button" onClick={openPicker}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-white ring-1 ring-dashed ring-slate-300 text-slate-500 hover:bg-slate-50 hover:ring-emerald-300">
            <Tag size={10} /> + Mã KM
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-30 mt-1 left-0 w-72 max-h-72 overflow-y-auto rounded-lg bg-white shadow-xl ring-1 ring-slate-200">
          <div className="sticky top-0 px-3 py-2 bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
            <Search size={11} /> Chương trình áp dụng cho gói
          </div>
          {loading ? (
            <div className="p-3 text-center text-xs text-slate-400">Đang tải...</div>
          ) : error ? (
            <div className="p-3 text-center text-xs text-rose-600">⚠️ {error}</div>
          ) : !available || available.length === 0 ? (
            <div className="p-3 text-center text-xs text-slate-400">
              Không có chương trình nào active cho gói này tháng này
            </div>
          ) : (
            <div className="py-1">
              {available.map((p) => {
                const already = snapshots.some((s) => s.id === p.id);
                return (
                  <button key={p.id} type="button" disabled={already} onClick={() => addPromo(p)}
                    className={`w-full px-3 py-2 text-left text-xs flex items-center gap-2 ${
                      already ? 'opacity-40 cursor-not-allowed' : 'hover:bg-emerald-50'
                    }`}>
                    <span className={`shrink-0 inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ring-1 ${
                      isDiscountType(p.promoType) ? 'bg-violet-100 text-violet-700 ring-violet-200' : 'bg-rose-100 text-rose-700 ring-rose-200'
                    }`}>{p.promoCode}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-700 truncate">{p.name}</div>
                      <div className="text-[10px] text-slate-500">
                        {PROMO_TYPE_SHORT[p.promoType]} · {fmtPromoChip({id:'',code:'',name:'',type:p.promoType,value:p.promoValue}, unitName)}
                      </div>
                    </div>
                    {already && <span className="text-[10px] text-slate-400">đã chọn</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
