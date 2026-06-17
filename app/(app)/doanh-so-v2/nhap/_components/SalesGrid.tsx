'use client';

// Sales grid — 11 cột Excel-like cho Sale nhập daily transactions.
// Phase 1 (2026-06-17).

import { useEffect, useMemo, useRef, useState } from 'react';
import { Trash2, AlertCircle } from 'lucide-react';
import type {
  SalesTransaction,
  SalesV2Source,
  TransactionType,
  PaymentMethod,
} from '@/lib/types/sales-v2';
import { SOURCE_LABEL, TRANSACTION_TYPE_LABEL, PAYMENT_METHOD_LABEL } from '@/lib/types/sales-v2';
import type { SalesV2Package } from '@/lib/sales-v2/packages';
import PackagePicker from './PackagePicker';
import { showConfirm } from '@/components/ui/imperative-modal';

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
  transactionType: TransactionType | null;
  paymentMethod: PaymentMethod | null;
  packageValue: string;     // dạng string để input hiển thị OK
  collectedToday: string;
  // V6 PT: số buổi + đơn giá / buổi. Chỉ dùng khi packageIsCustomQuantity=true.
  quantity: string;
  unitPrice: string;
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
    transactionType: null,
    paymentMethod: null,
    packageValue: '',
    collectedToday: '',
    quantity: '',
    unitPrice: '',
    receiptNo: '',
    contractNo: '',
    note: '',
  };
}

/** Validate SĐT VN: 10 số, bắt đầu 0. Empty → false (trống = chưa nhập, không phải sai). */
export function isValidPhone(phone: string): boolean {
  const t = phone.trim();
  return /^0\d{9}$/.test(t);
}

/** Row hoàn toàn rỗng — Sale chưa nhập gì (vd row auto-add trailing). KHÔNG validate + KHÔNG báo lỗi. */
export function isRowEmpty(r: LocalRow): boolean {
  return !r.customerName.trim()
    && !r.phone.trim()
    && !r.guardianName.trim()
    && !r.source
    && !r.packageId
    && !r.transactionType
    && !r.paymentMethod
    && !r.packageValue.trim()
    && !r.collectedToday.trim()
    && !r.quantity.trim()
    && !r.unitPrice.trim()
    && !r.receiptNo.trim()
    && !r.contractNo.trim()
    && !r.note.trim();
}

/** Tính packageValue effective cho 1 row — auto-compute nếu PT, ngược lại lấy field. */
export function effectivePackageValue(r: LocalRow): number {
  if (r.transactionType === 'thanh_toan_not') return 0;
  if (r.packageIsCustomQuantity) {
    const q = Number(r.quantity);
    const u = Number(r.unitPrice);
    if (!Number.isFinite(q) || !Number.isFinite(u) || q <= 0 || u < 0) return 0;
    return q * u;
  }
  return Number(r.packageValue) || 0;
}

/** Validate 1 local row đủ điều kiện POST chưa. */
export function validateRow(r: LocalRow): { ok: true } | { ok: false; error: string } {
  if (!r.customerName.trim()) return { ok: false, error: 'Thiếu tên khách hàng' };
  if (!r.phone.trim()) return { ok: false, error: 'Thiếu SĐT' };
  if (!isValidPhone(r.phone)) return { ok: false, error: 'SĐT phải 10 số bắt đầu bằng 0' };
  if (!r.source) return { ok: false, error: 'Thiếu nguồn' };
  if (!r.packageId) return { ok: false, error: 'Thiếu gói' };
  if (!r.transactionType) return { ok: false, error: 'Thiếu loại giao dịch' };
  if (!r.paymentMethod) return { ok: false, error: 'Thiếu hình thức thu' };
  const ct = Number(r.collectedToday);
  if (!Number.isFinite(ct) || ct < 0) return { ok: false, error: 'Thu hôm nay không hợp lệ' };
  if (r.isChildPackage && !r.guardianName.trim()) return { ok: false, error: 'Gói trẻ em bắt buộc Người giám hộ' };
  // Validate chứng từ
  if (r.transactionType === 'dat_coc' && !r.receiptNo.trim()) {
    return { ok: false, error: 'Đặt cọc bắt buộc Số phiếu thu' };
  }
  if ((r.transactionType === 'thanh_toan_full' || r.transactionType === 'thanh_toan_not') && !r.contractNo.trim()) {
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
    const pv = q * u;
    if (pv <= 0) return { ok: false, error: 'Giá trị gói (số buổi × đơn giá) phải > 0' };
    if (r.transactionType === 'thanh_toan_full' && ct < pv) {
      return { ok: false, error: 'Thanh toán full phải thu đủ giá trị gói' };
    }
    return { ok: true };
  }
  const pv = Number(r.packageValue);
  if (!Number.isFinite(pv) || pv <= 0) return { ok: false, error: 'Giá trị gói phải > 0' };
  if (r.transactionType === 'thanh_toan_full' && ct < pv) {
    return { ok: false, error: 'Thanh toán full phải thu đủ giá trị gói' };
  }
  return { ok: true };
}

interface Props {
  packages: SalesV2Package[];
  rows: SalesTransaction[];
  localRows: LocalRow[];
  canEdit: boolean;                  // Sale có thể edit row mới (add/lock-free)
  batchStatus: string;               // V6: dùng để quyết định row nào lock khi returned
  onUpdateLocal: (tempId: string, patch: Partial<LocalRow>) => void;
  onRemoveLocal: (tempId: string) => void;
  onUpdateSaved: (id: string, patch: Partial<SalesTransaction>) => void;
  onRemoveSaved: (id: string) => void;
}

const SOURCE_TONE: Record<SalesV2Source, string> = {
  ca_nhan: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  walkin:  'bg-sky-50 text-sky-700 ring-sky-200',
  mkt:     'bg-violet-50 text-violet-700 ring-violet-200',
  renew:   'bg-amber-50 text-amber-700 ring-amber-200',
  ref:     'bg-rose-50 text-rose-700 ring-rose-200',
};

const PAY_TONE: Record<PaymentMethod, string> = {
  tien_mat:      'bg-emerald-50 text-emerald-700 ring-emerald-200',
  chuyen_khoan:  'bg-sky-50 text-sky-700 ring-sky-200',
  pos:           'bg-amber-50 text-amber-700 ring-amber-200',
};

/** Sale có sửa được tx này không? (theo workflow per-tx review) */
function canSaleEditRow(batchStatus: string, reviewStatus?: string): boolean {
  if (batchStatus === 'draft') return true;
  if (batchStatus === 'returned') return (reviewStatus ?? 'pending') === 'rejected';
  return false;
}

export default function SalesGrid({
  packages, rows, localRows, canEdit, batchStatus,
  onUpdateLocal, onRemoveLocal, onUpdateSaved, onRemoveSaved,
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
        <table className="w-full min-w-[2400px] text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
            <tr>
              <Th width={40}>#</Th>
              <Th width={230}>Tên khách hàng *</Th>
              <Th width={140}>SĐT *</Th>
              <Th width={150}>Người giám hộ</Th>
              <Th width={120}>Nguồn *</Th>
              <Th width={180}>Gói *</Th>
              <Th width={140}>Loại GD *</Th>
              <Th width={130}>HT thu *</Th>
              <Th width={120}>Số phiếu thu</Th>
              <Th width={120}>Số HĐ</Th>
              <Th width={90} align="right">Số buổi</Th>
              <Th width={130} align="right">Đơn giá / buổi</Th>
              <Th width={120} align="right">Giá trị gói *</Th>
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
                  onUpdate={(patch) => onUpdateLocal(r.tempId, patch)}
                  onRemove={() => onRemoveLocal(r.tempId)}
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
function SavedRow({ idx, row, packages, canEdit, batchStatus, onUpdate, onRemove }: {
  idx: number;
  row: SalesTransaction;
  packages: SalesV2Package[];
  canEdit: boolean;
  batchStatus: string;
  onUpdate: (patch: Partial<SalesTransaction>) => void;
  onRemove: () => void;
}) {
  // PT mode: snapshot từ doc (packageIsCustomQuantity). Doc cũ chưa có field → false.
  const isPT = row.packageIsCustomQuantity === true;
  const qty = row.quantity ?? 0;
  const up = row.unitPrice ?? 0;
  // PT: pv tính lại từ qty/up (tránh stale khi user vừa edit qty, server PATCH chưa response)
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
        <TextCell value={row.customerName} disabled={!canEdit} onCommit={(v) => onUpdate({ customerName: v })} />
      </Td>
      <Td>
        <PhoneCell value={row.phone} disabled={!canEdit} onCommit={(v) => onUpdate({ phone: v })} placeholder="0901234567" />
      </Td>
      <Td>
        {row.isChildPackage ? (
          <TextCell value={row.guardianName ?? ''} disabled={!canEdit} onCommit={(v) => onUpdate({ guardianName: v || null })} />
        ) : (
          <span className="text-slate-300 text-xs">—</span>
        )}
      </Td>
      <Td>
        <SourceSelect value={row.source} disabled={!canEdit} onChange={(v) => onUpdate({ source: v })} />
      </Td>
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
              };
              // PT → seed unitPrice from default nếu doc chưa có; clear quantity
              if (pkg.isCustomQuantity) {
                patch.unitPrice = up > 0 ? up : (pkg.defaultUnitPrice ?? null);
                patch.quantity = null;
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
      <Td>
        <DocCell
          value={row.receiptNo ?? ''}
          disabled={!canEdit}
          required={row.transactionType === 'dat_coc'}
          hideForType={row.transactionType === 'thanh_toan_full'}
          placeholder={row.transactionType === 'thanh_toan_not' ? 'Số PT cũ (để link)' : 'PT...'}
          onCommit={(v) => onUpdate({ receiptNo: v || null })}
        />
      </Td>
      <Td>
        <DocCell
          value={row.contractNo ?? ''}
          disabled={!canEdit}
          required={row.transactionType === 'thanh_toan_full' || row.transactionType === 'thanh_toan_not'}
          hideForType={row.transactionType === 'dat_coc'}
          placeholder="HĐ..."
          onCommit={(v) => onUpdate({ contractNo: v || null })}
        />
      </Td>
      <Td align="right">
        {isPT && row.transactionType !== 'thanh_toan_not'
          ? <NumberCell value={qty} disabled={!canEdit} onCommit={(v) => onUpdate({ quantity: v > 0 ? v : null })} />
          : <span className="text-slate-300 text-xs">—</span>
        }
      </Td>
      <Td align="right">
        {isPT && row.transactionType !== 'thanh_toan_not'
          ? <NumberCell value={up} disabled={!canEdit} onCommit={(v) => onUpdate({ unitPrice: v >= 0 ? v : null })} />
          : <span className="text-slate-300 text-xs">—</span>
        }
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
      <Td align="right">
        <NumberCell value={row.collectedToday} disabled={!canEdit} onCommit={(v) => onUpdate({ collectedToday: v })} />
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
function LocalRowItem({ idx, row, packages, canEdit, onUpdate, onRemove, autoFocusFirstCell }: {
  idx: number;
  row: LocalRow;
  packages: SalesV2Package[];
  canEdit: boolean;
  onUpdate: (patch: Partial<LocalRow>) => void;
  onRemove: () => void;
  autoFocusFirstCell?: boolean;
}) {
  // 'thanh_toan_not' = trả nốt → KHÔNG tính doanh số mới + debt = 0 (sẽ link gd cũ)
  const isThanhToanNot = row.transactionType === 'thanh_toan_not';
  const isPT = row.packageIsCustomQuantity;
  const qty = Number(row.quantity) || 0;
  const up = Number(row.unitPrice) || 0;
  // PT: pv = qty × up (computed). Non-PT: lấy từ field.
  const pv = isThanhToanNot ? 0 : (isPT ? qty * up : (Number(row.packageValue) || 0));
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
        <TextCell value={row.customerName} disabled={!canEdit} onCommit={(v) => onUpdate({ customerName: v })} placeholder="Tên KH..." inputRef={firstCellRef} />
      </Td>
      <Td>
        <PhoneCell value={row.phone} disabled={!canEdit} onCommit={(v) => onUpdate({ phone: v })} placeholder="0901234567" />
      </Td>
      <Td>
        {row.isChildPackage ? (
          <TextCell value={row.guardianName} disabled={!canEdit} onCommit={(v) => onUpdate({ guardianName: v })} placeholder="Người giám hộ..." />
        ) : (
          <span className="text-slate-300 text-xs">—</span>
        )}
      </Td>
      <Td>
        <SourceSelect value={row.source} disabled={!canEdit} onChange={(v) => onUpdate({ source: v })} />
      </Td>
      <Td>
        <PackagePicker
          packages={packages}
          value={row.packageId}
          disabled={!canEdit}
          onChange={async (pkg) => {
            if (!pkg) {
              onUpdate({
                packageId: null, packageCode: '', packageName: '', serviceGroup: '',
                isChildPackage: false, packageIsCustomQuantity: false,
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
                packageValue: '', // auto-compute, không dùng
                unitPrice: seededUnitPrice,
                // Giữ nguyên row.quantity nếu user đã nhập (vd đổi gói PT khác)
              });
              return;
            }
            // Gói cố định: logic gốc + clear PT fields
            const currentPv = Number(row.packageValue) || 0;
            const newPv = pkg.defaultPrice;
            let packageValueToSet = row.packageValue;
            if (!currentPv && newPv > 0) {
              packageValueToSet = String(newPv);
            } else if (currentPv > 0 && newPv > 0 && currentPv !== newPv) {
              const ok = await showConfirm({
                title: 'Cập nhật giá theo gói mới?',
                description: `Giá hiện tại: ${currentPv.toLocaleString()}đ\nGiá mặc định của "${pkg.name}": ${newPv.toLocaleString()}đ`,
                confirmText: 'Cập nhật giá',
                cancelText: 'Giữ giá cũ',
              });
              if (ok) packageValueToSet = String(newPv);
            }
            onUpdate({
              packageId: pkg.id,
              packageCode: pkg.code,
              packageName: pkg.name,
              serviceGroup: pkg.serviceGroup,
              isChildPackage: pkg.isChildPackage,
              packageIsCustomQuantity: false,
              packageValue: packageValueToSet,
              quantity: '',
              unitPrice: '',
            });
          }}
        />
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
      <Td>
        <DocCell
          value={row.receiptNo}
          disabled={!canEdit}
          required={row.transactionType === 'dat_coc'}
          hideForType={row.transactionType === 'thanh_toan_full'}
          placeholder={row.transactionType === 'thanh_toan_not' ? 'Số PT cũ (để link)' : 'PT...'}
          onCommit={(v) => onUpdate({ receiptNo: v })}
        />
      </Td>
      <Td>
        <DocCell
          value={row.contractNo}
          disabled={!canEdit}
          required={row.transactionType === 'thanh_toan_full' || row.transactionType === 'thanh_toan_not'}
          hideForType={row.transactionType === 'dat_coc'}
          placeholder="HĐ..."
          onCommit={(v) => onUpdate({ contractNo: v })}
        />
      </Td>
      <Td align="right">
        {isPT && !isThanhToanNot
          ? <NumberCell value={qty} disabled={!canEdit} onCommit={(v) => onUpdate({ quantity: v > 0 ? String(v) : '' })} />
          : <span className="text-slate-300 text-xs">—</span>
        }
      </Td>
      <Td align="right">
        {isPT && !isThanhToanNot
          ? <NumberCell value={up} disabled={!canEdit} onCommit={(v) => onUpdate({ unitPrice: v >= 0 ? String(v) : '' })} />
          : <span className="text-slate-300 text-xs">—</span>
        }
      </Td>
      <Td align="right">
        {isThanhToanNot ? (
          <span className="text-slate-300 text-xs" title="Thanh toán nốt — không tính doanh số mới (sẽ link với GD cũ)">—</span>
        ) : isPT ? (
          <span
            className="block text-right tabular-nums text-slate-700 font-medium px-2 py-1 bg-slate-50 rounded"
            title="Auto = Số buổi × Đơn giá / buổi"
          >
            {pv.toLocaleString()}
          </span>
        ) : (
          <NumberCell value={pv} disabled={!canEdit} onCommit={(v) => onUpdate({ packageValue: String(v) })} />
        )}
      </Td>
      <Td align="right">
        <NumberCell value={ct} disabled={!canEdit} onCommit={(v) => onUpdate({ collectedToday: String(v) })} />
      </Td>
      <Td align="right" className="tabular-nums text-slate-600 font-medium">
        {debt > 0 ? <span className="text-rose-600">{debt.toLocaleString()}</span> : <span className="text-slate-300">0</span>}
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
        {(row.errorMessage || !validation.ok) && (
          <div title={row.errorMessage ?? (validation.ok ? '' : validation.error)}>
            <AlertCircle size={12} className="mx-auto mt-1 text-amber-600" />
          </div>
        )}
      </Td>
    </tr>
  );
}

// ─── Atomic cell components ────────────────────────────────────────

function TextCell({
  value, disabled, onCommit, placeholder, inputRef,
}: {
  value: string;
  disabled: boolean;
  onCommit: (v: string) => void;
  placeholder?: string;
  inputRef?: React.MutableRefObject<HTMLInputElement | null>;
}) {
  return (
    <input
      ref={(el) => { if (inputRef) inputRef.current = el; }}
      type="text"
      defaultValue={value}
      disabled={disabled}
      placeholder={placeholder}
      onBlur={(e) => {
        const v = e.target.value;
        if (v !== value) onCommit(v);
      }}
      className="w-full px-2 py-1 rounded border border-transparent bg-transparent text-sm focus:bg-white focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100 focus:outline-none disabled:cursor-not-allowed"
    />
  );
}

/** Phone cell: text input + đỏ ring nếu không hợp lệ (10 số bắt đầu 0). Empty không đỏ. */
function PhoneCell({
  value, disabled, onCommit, placeholder,
}: {
  value: string;
  disabled: boolean;
  onCommit: (v: string) => void;
  placeholder?: string;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  const trimmed = local.trim();
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
      title={invalid ? 'SĐT phải 10 số bắt đầu bằng 0 (vd: 0901234567)' : ''}
      className={`w-full px-2 py-1 rounded border text-sm focus:bg-white focus:ring-2 focus:outline-none disabled:cursor-not-allowed ${
        invalid
          ? 'border-rose-400 bg-rose-50 text-rose-700 focus:border-rose-500 focus:ring-rose-100'
          : 'border-transparent bg-transparent focus:border-emerald-300 focus:ring-emerald-100'
      }`}
    />
  );
}

/** Số phiếu thu / Số HĐ. Required màu amber khi cần điền. Hide cho loại không cần. */
function DocCell({
  value, disabled, required, hideForType, placeholder, onCommit,
}: {
  value: string;
  disabled: boolean;
  required: boolean;
  hideForType: boolean;
  placeholder?: string;
  onCommit: (v: string) => void;
}) {
  if (hideForType) {
    return <span className="text-slate-300 text-xs px-2">—</span>;
  }
  // Defensive: caller có thể truyền null/undefined dù type khai báo string
  const v = (value ?? '') as string;
  const isEmpty = !v.trim();
  return (
    <input
      type="text"
      // key=v forces re-mount khi giá trị từ ngoài thay đổi (vd auto-clear sau đổi loại GD)
      key={v}
      defaultValue={v}
      disabled={disabled}
      placeholder={placeholder}
      maxLength={50}
      onBlur={(e) => { const nv = e.target.value.trim(); if (nv !== v) onCommit(nv); }}
      title={required && isEmpty ? 'Bắt buộc nhập' : ''}
      className={`w-full px-2 py-1 rounded border text-xs focus:bg-white focus:ring-2 focus:outline-none disabled:cursor-not-allowed ${
        required && isEmpty
          ? 'border-amber-300 bg-amber-50/40 placeholder-amber-500 focus:border-amber-400 focus:ring-amber-100'
          : 'border-transparent bg-transparent focus:border-emerald-300 focus:ring-emerald-100'
      }`}
    />
  );
}

function NumberCell({
  value, disabled, onCommit,
}: {
  value: number;
  disabled: boolean;
  onCommit: (v: number) => void;
}) {
  // Format thousand separator khi blur; khi focus hiển thị raw số để dễ edit.
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState<string>(value > 0 ? String(value) : '');
  useEffect(() => {
    if (!editing) setRaw(value > 0 ? String(value) : '');
  }, [value, editing]);
  const display = editing ? raw : (value > 0 ? value.toLocaleString() : '');
  return (
    <input
      type="text"
      inputMode="numeric"
      value={display}
      disabled={disabled}
      onFocus={() => setEditing(true)}
      onChange={(e) => setRaw(e.target.value.replace(/[^\d]/g, ''))}
      onBlur={() => {
        setEditing(false);
        const v = Number(raw) || 0;
        if (v !== value) onCommit(v);
      }}
      className="w-full px-2 py-1 rounded border border-transparent bg-transparent text-sm text-right tabular-nums focus:bg-white focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100 focus:outline-none disabled:cursor-not-allowed"
    />
  );
}

function SourceSelect({ value, disabled, onChange }: {
  value: SalesV2Source | null;
  disabled: boolean;
  onChange: (v: SalesV2Source) => void;
}) {
  return (
    <select
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as SalesV2Source)}
      className={`w-full px-2 py-1 rounded border text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed ${
        value ? `${SOURCE_TONE[value]} ring-1 border-transparent` : 'bg-white text-slate-400 border-slate-200'
      }`}
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
  return (
    <select
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as TransactionType)}
      className="w-full px-2 py-1 rounded border border-slate-200 bg-white text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed"
    >
      <option value="">— Chọn —</option>
      {(Object.keys(TRANSACTION_TYPE_LABEL) as TransactionType[]).map((k) => (
        <option key={k} value={k}>{TRANSACTION_TYPE_LABEL[k]}</option>
      ))}
    </select>
  );
}

function PayMethodSelect({ value, disabled, onChange }: {
  value: PaymentMethod | null;
  disabled: boolean;
  onChange: (v: PaymentMethod) => void;
}) {
  return (
    <select
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as PaymentMethod)}
      className={`w-full px-2 py-1 rounded border text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed ${
        value ? `${PAY_TONE[value]} ring-1 border-transparent` : 'bg-white text-slate-400 border-slate-200'
      }`}
    >
      <option value="">— Chọn —</option>
      {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((k) => (
        <option key={k} value={k}>{PAYMENT_METHOD_LABEL[k]}</option>
      ))}
    </select>
  );
}
