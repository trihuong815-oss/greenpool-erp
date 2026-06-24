'use client';

// Mobile card view cho Sale nhập daily — thay table khi width <768px.
// Mỗi giao dịch = 1 card có thể expand để edit.
// 2026-06-17 — audit polish commit C.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Trash2, ChevronDown, ChevronRight, AlertCircle, Plus } from 'lucide-react';
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
import { type LocalRow, isRowEmpty, validateRow, isValidPhone, effectivePackageValue, buildPaymentMethodChangePatch } from './SalesGrid';

interface Props {
  packages: SalesV2Package[];
  rows: SalesTransaction[];
  localRows: LocalRow[];
  canEdit: boolean;
  batchStatus: string;
  // V7 Promo (2026-06-18): branchId + batchMonth để fetch /available — Mobile hiện chỉ
  // hiển thị info promo (read-only) cho SavedRow, không cho Sale add từ mobile (popover
  // chật trên màn hình nhỏ). Sale dùng desktop để áp KM mới.
  branchId: string;
  batchMonth: string;
  onUpdateLocal: (tempId: string, patch: Partial<LocalRow>) => void;
  onRemoveLocal: (tempId: string) => void;
  onUpdateSaved: (id: string, patch: Partial<SalesTransaction>) => void;
  onRemoveSaved: (id: string) => void;
}

function canSaleEditSavedRow(batchStatus: string, reviewStatus?: string): boolean {
  if (batchStatus === 'draft') return true;
  if (batchStatus === 'returned') return (reviewStatus ?? 'pending') === 'rejected';
  return false;
}

export default function MobileNhapView({
  packages, rows, localRows, canEdit, batchStatus,
  branchId: _branchId, batchMonth: _batchMonth,  // reserved cho future mobile promo picker
  onUpdateLocal, onRemoveLocal, onUpdateSaved, onRemoveSaved,
}: Props) {
  const totalRows = rows.length + localRows.length;

  if (totalRows === 0) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-400 ring-1 ring-slate-200">
        <div className="text-3xl mb-2">📋</div>
        <div>Chưa có giao dịch. Tự động thêm dòng khi bắt đầu nhập.</div>
      </div>
    );
  }

  return (
    <div className="space-y-2 pb-20">
      {rows.map((r, i) => {
        const rowEditable = canEdit && canSaleEditSavedRow(batchStatus, r.reviewStatus);
        return (
          <SavedCard
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
        const isLast = i === localRows.length - 1;
        const prevHasData = i > 0 && !isRowEmpty(localRows[i - 1]);
        const shouldFocus = isLast && isRowEmpty(r) && prevHasData;
        return (
          <LocalCard
            key={r.tempId}
            idx={rows.length + i + 1}
            row={r}
            packages={packages}
            canEdit={canEdit}
            onUpdate={(patch) => onUpdateLocal(r.tempId, patch)}
            onRemove={() => onRemoveLocal(r.tempId)}
            autoExpand={shouldFocus}
          />
        );
      })}
    </div>
  );
}

// ─── Saved card (đã PATCH lên server) ─────────────────────────────

function SavedCard({ idx, row, packages, canEdit, batchStatus, onUpdate, onRemove }: {
  idx: number;
  row: SalesTransaction;
  packages: SalesV2Package[];
  canEdit: boolean;
  batchStatus: string;
  onUpdate: (patch: Partial<SalesTransaction>) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const showBadge = batchStatus === 'returned';
  const rs = row.reviewStatus ?? 'pending';
  const cardRing =
    showBadge && rs === 'rejected' ? 'ring-rose-300 bg-rose-50/40' :
    showBadge && rs === 'approved' ? 'ring-emerald-300 bg-emerald-50/40' :
                                     'ring-slate-200';
  return (
    <div className={`rounded-xl bg-white ring-1 overflow-hidden ${cardRing}`}>
      {showBadge && rs === 'rejected' && row.rejectReason && (
        <div className="px-3 py-1.5 bg-rose-100/60 text-[11px] text-rose-700">
          <strong>✗ Cần sửa:</strong> {row.rejectReason}
        </div>
      )}
      {showBadge && rs === 'approved' && (
        <div className="px-3 py-1 bg-emerald-100/60 text-[11px] text-emerald-700">
          <strong>✓ Kế toán đã duyệt</strong> — không sửa được
        </div>
      )}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-3 py-2.5 flex items-center gap-2 text-left hover:bg-slate-50/60"
      >
        <span className="shrink-0 w-7 h-7 rounded-full bg-slate-100 text-slate-500 text-xs font-semibold flex items-center justify-center tabular-nums">{idx}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-800 truncate">
            {row.customerName || <span className="text-slate-300">(chưa có tên)</span>}
            {row.isChildPackage && <span className="text-[9px] uppercase font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded shrink-0">Trẻ em</span>}
          </div>
          <div className="text-xs text-slate-500 truncate">
            {row.phone} · {row.packageName} · <span className="text-emerald-700 font-medium tabular-nums">{row.packageValue.toLocaleString()}đ</span>
          </div>
        </div>
        <div className="shrink-0 text-right text-xs">
          <div className="font-semibold text-sky-700 tabular-nums">{row.collectedToday.toLocaleString()}đ</div>
          {row.debtAmount > 0 && (
            <div className="text-rose-600 font-medium tabular-nums">Nợ {row.debtAmount.toLocaleString()}</div>
          )}
        </div>
        {expanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
      </button>
      {expanded && (
        <CardEditor
          row={{ ...row, savedRow: true }}
          packages={packages}
          canEdit={canEdit}
          onUpdate={(patch) => onUpdate(patch as Partial<SalesTransaction>)}
          onRemove={onRemove}
        />
      )}
    </div>
  );
}

// ─── Local card (chưa POST) ────────────────────────────────────────

function LocalCard({ idx, row, packages, canEdit, onUpdate, onRemove, autoExpand }: {
  idx: number;
  row: LocalRow;
  packages: SalesV2Package[];
  canEdit: boolean;
  onUpdate: (patch: Partial<LocalRow>) => void;
  onRemove: () => void;
  autoExpand?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const rowEmpty = useMemo(() => isRowEmpty(row), [row]);
  const validation = useMemo(() => (rowEmpty ? { ok: true as const } : validateRow(row)), [row, rowEmpty]);

  useEffect(() => {
    if (autoExpand) setExpanded(true);
  }, [autoExpand]);

  // Auto-expand row mới rỗng (để Sale typing ngay)
  useEffect(() => {
    if (rowEmpty && !expanded && !autoExpand) {
      // Don't force expand if user collapsed
    }
  }, [rowEmpty, expanded, autoExpand]);

  // PT: pv = qty × up (compute). Non-PT: lấy từ field. Tránh hiển thị 0 cho PT row.
  const pvPreview = effectivePackageValue(row);
  const debt = Math.max(0, pvPreview - (Number(row.collectedToday) || 0));

  return (
    <div className={`rounded-xl bg-amber-50/40 ring-1 ${!validation.ok ? 'ring-amber-300' : 'ring-amber-200'} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-3 py-2.5 flex items-center gap-2 text-left hover:bg-amber-50/60"
      >
        <span className="shrink-0 w-7 h-7 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold flex items-center justify-center tabular-nums">{idx}</span>
        <div className="flex-1 min-w-0">
          {rowEmpty ? (
            <div className="text-sm text-amber-700 font-medium">+ Dòng mới (bấm để mở)</div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm font-medium text-slate-800 truncate">
                {row.customerName || <span className="text-slate-300">(chưa có tên)</span>}
                {row.isChildPackage && <span className="text-[9px] uppercase font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded shrink-0">Trẻ em</span>}
              </div>
              <div className="text-xs text-slate-500 truncate">
                {row.phone} · {row.packageName || '(chưa chọn gói)'} · <span className="text-emerald-700 font-medium">{pvPreview.toLocaleString()}đ</span>
              </div>
            </>
          )}
        </div>
        {!rowEmpty && (
          <div className="shrink-0 text-right text-xs">
            <div className="font-semibold text-sky-700 tabular-nums">{(Number(row.collectedToday) || 0).toLocaleString()}đ</div>
            {debt > 0 && <div className="text-rose-600 font-medium tabular-nums">Nợ {debt.toLocaleString()}</div>}
          </div>
        )}
        {!validation.ok && <AlertCircle size={14} className="text-amber-600 shrink-0" />}
        {expanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
      </button>
      {expanded && (
        <CardEditor
          row={{ ...row, savedRow: false }}
          packages={packages}
          canEdit={canEdit}
          onUpdate={(patch) => onUpdate(patch as Partial<LocalRow>)}
          onRemove={onRemove}
          errorMessage={row.errorMessage}
          validationError={!validation.ok ? validation.error : undefined}
        />
      )}
    </div>
  );
}

// ─── Card editor (form fields) ─────────────────────────────────────

type AnyRow = (SalesTransaction & { savedRow: true }) | (LocalRow & { savedRow: false });
type AnyPatch = Partial<SalesTransaction> | Partial<LocalRow>;

function CardEditor({
  row, packages, canEdit, onUpdate, onRemove, errorMessage, validationError,
}: {
  row: AnyRow;
  packages: SalesV2Package[];
  canEdit: boolean;
  onUpdate: (patch: AnyPatch) => void;
  onRemove: () => void;
  errorMessage?: string;
  validationError?: string;
}) {
  const focusRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    focusRef.current?.focus();
  }, []);

  const getStr = (k: keyof LocalRow): string => {
    const v = (row as any)[k];
    return v == null ? '' : String(v);
  };

  const updateStr = (k: string, v: string) => onUpdate({ [k]: v || null } as any);

  // packageValue / collectedToday saved row dạng number, local row dạng string
  const isThanhToanNot = (row as any).transactionType === 'thanh_toan_not';
  const isPT = row.savedRow
    ? (row.packageIsCustomQuantity === true)
    : (row.packageIsCustomQuantity);
  // V8.Y manual mode (HB CLB Kid/Aqua) — Sale tự nhập packageValue + ghi số buổi (note)
  const isManual = row.savedRow
    ? (row.packageManualPriceWithQty === true)
    : (row.packageManualPriceWithQty);
  const qtyNum = row.savedRow ? (row.quantity ?? 0) : (Number(row.quantity) || 0);
  const upNum = row.savedRow ? (row.unitPrice ?? 0) : (Number(row.unitPrice) || 0);
  // PT: pv = qty × up (auto). Không PT: pv lấy từ field.
  const pvNum = isThanhToanNot
    ? 0
    : isPT
      ? qtyNum * upNum
      : (row.savedRow ? (row.packageValue ?? 0) : (Number(row.packageValue) || 0));
  const ctNum = row.savedRow ? (row.collectedToday ?? 0) : (Number(row.collectedToday) || 0);
  const debt = isThanhToanNot ? 0 : Math.max(0, pvNum - ctNum);

  const setNum = (k: 'packageValue' | 'collectedToday' | 'quantity' | 'unitPrice', n: number) => {
    if (row.savedRow) {
      // SavedRow: quantity/unitPrice nullable number (null khi user clear ô)
      if (k === 'quantity' || k === 'unitPrice') {
        onUpdate({ [k]: n > 0 ? n : null } as any);
      } else {
        onUpdate({ [k]: n } as any);
      }
    } else {
      // LocalRow tất cả lưu string. Giữ original behavior packageValue/collectedToday
      // (String(n) cả 0); quantity/unitPrice clear thành '' khi 0 (rỗng = chưa nhập).
      if (k === 'quantity' || k === 'unitPrice') {
        onUpdate({ [k]: n > 0 ? String(n) : '' } as any);
      } else {
        onUpdate({ [k]: String(n) } as any);
      }
    }
  };

  return (
    <div className="border-t border-slate-200 p-3 space-y-2.5 bg-white">
      {(errorMessage || validationError) && (
        <div className="rounded-lg bg-amber-50 ring-1 ring-amber-200 px-2.5 py-1.5 text-xs text-amber-800 flex items-start gap-1.5">
          <AlertCircle size={12} className="shrink-0 mt-0.5" />
          <span>{errorMessage ?? validationError}</span>
        </div>
      )}

      <FieldLabel label="Tên khách hàng *">
        <input
          ref={focusRef}
          type="text"
          defaultValue={getStr('customerName')}
          disabled={!canEdit}
          onBlur={(e) => { if (e.target.value !== getStr('customerName')) updateStr('customerName', e.target.value); }}
          className="w-full px-3 py-2 rounded-lg ring-1 ring-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </FieldLabel>

      <FieldLabel label="SĐT *">
        <PhoneInputMobile value={getStr('phone')} disabled={!canEdit} onCommit={(v) => updateStr('phone', v)} />
      </FieldLabel>

      <FieldLabel label="Nguồn *">
        <select
          value={(row.source ?? '') as string}
          disabled={!canEdit}
          onChange={(e) => onUpdate({ source: e.target.value as SalesV2Source } as any)}
          className="w-full px-3 py-2 rounded-lg ring-1 ring-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">— Chọn —</option>
          {(Object.keys(SOURCE_LABEL) as SalesV2Source[]).map((k) => (
            <option key={k} value={k}>{SOURCE_LABEL[k]}</option>
          ))}
        </select>
      </FieldLabel>

      <FieldLabel label="Gói *">
        <PackagePicker
          packages={packages}
          value={getStr('packageId') || null}
          disabled={!canEdit}
          onChange={async (pkg) => {
            if (!pkg) {
              onUpdate({
                packageId: null, packageCode: '', packageName: '', serviceGroup: '',
                isChildPackage: false, packageIsCustomQuantity: false, packageManualPriceWithQty: false,
                quantity: row.savedRow ? null : '', unitPrice: row.savedRow ? null : '',
              } as any);
              return;
            }
            // V6 PT: gói tính theo buổi → seed unitPrice từ default; clear packageValue (auto).
            if (pkg.isCustomQuantity) {
              const seededUnitPrice = upNum > 0
                ? (row.savedRow ? upNum : String(upNum))
                : (pkg.defaultUnitPrice != null ? (row.savedRow ? pkg.defaultUnitPrice : String(pkg.defaultUnitPrice)) : (row.savedRow ? null : ''));
              onUpdate({
                packageId: pkg.id,
                packageCode: pkg.code,
                packageName: pkg.name,
                serviceGroup: pkg.serviceGroup,
                isChildPackage: pkg.isChildPackage,
                packageIsCustomQuantity: true,
                packageManualPriceWithQty: false,
                packageValue: row.savedRow ? 0 : '',
                unitPrice: seededUnitPrice,
              } as any);
              return;
            }
            // V8.Y Manual mode (HB CLB Kid/Aqua): Sale TỰ NHẬP packageValue (suggest từ
            // defaultPrice) + ghi số buổi (note). KHÔNG có unitPrice.
            if (pkg.manualPriceWithQuantity) {
              const newPv = pkg.defaultPrice;
              const packageValueToSet = newPv > 0
                ? (row.savedRow ? newPv : String(newPv))
                : (row.savedRow ? 0 : '');
              onUpdate({
                packageId: pkg.id,
                packageCode: pkg.code,
                packageName: pkg.name,
                serviceGroup: pkg.serviceGroup,
                isChildPackage: pkg.isChildPackage,
                packageIsCustomQuantity: false,
                packageManualPriceWithQty: true,
                packageValue: packageValueToSet,
                quantity: row.savedRow ? null : '', // bắt buộc Sale nhập
                unitPrice: row.savedRow ? null : '',
              } as any);
              return;
            }
            // V7 (2026-06-18): Gói cố định → AUTO-FILL từ pkg.defaultPrice. Sale KHÔNG sửa.
            const newPv = pkg.defaultPrice;
            const packageValueToSet = newPv > 0
              ? (row.savedRow ? newPv : String(newPv))
              : (row.savedRow ? 0 : '');
            onUpdate({
              packageId: pkg.id,
              packageCode: pkg.code,
              packageName: pkg.name,
              serviceGroup: pkg.serviceGroup,
              isChildPackage: pkg.isChildPackage,
              packageIsCustomQuantity: false,
              packageManualPriceWithQty: false,
              packageValue: packageValueToSet,
              quantity: row.savedRow ? null : '',
              unitPrice: row.savedRow ? null : '',
            } as any);
          }}
        />
      </FieldLabel>

      {(row.isChildPackage as boolean) && (
        <FieldLabel label="Người giám hộ *">
          <input
            type="text"
            defaultValue={getStr('guardianName')}
            disabled={!canEdit}
            onBlur={(e) => { if (e.target.value !== getStr('guardianName')) updateStr('guardianName', e.target.value); }}
            className="w-full px-3 py-2 rounded-lg ring-1 ring-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </FieldLabel>
      )}

      <div className="grid grid-cols-2 gap-2">
        <FieldLabel label="Loại GD *">
          <select
            value={(row.transactionType ?? '') as string}
            disabled={!canEdit}
            onChange={(e) => {
              const v = e.target.value as TransactionType;
              const patch: Record<string, any> = { transactionType: v };
              if (v === 'thanh_toan_full') patch.receiptNo = '';
              if (v === 'dat_coc') patch.contractNo = '';
              onUpdate(patch as any);
            }}
            className="w-full px-3 py-2 rounded-lg ring-1 ring-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">— Chọn —</option>
            {(Object.keys(TRANSACTION_TYPE_LABEL) as TransactionType[]).map((k) => (
              <option key={k} value={k}>{TRANSACTION_TYPE_LABEL[k]}</option>
            ))}
          </select>
        </FieldLabel>
        <FieldLabel label="HT thu *">
          <select
            value={(row.paymentMethod ?? '') as string}
            disabled={!canEdit}
            onChange={(e) => onUpdate(buildPaymentMethodChangePatch(row.paymentMethod, (e.target.value || null) as PaymentMethod | null) as any)}
            className="w-full px-3 py-2 rounded-lg ring-1 ring-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">— Chọn —</option>
            {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((k) => (
              <option key={k} value={k}>{PAYMENT_METHOD_LABEL[k]}</option>
            ))}
          </select>
        </FieldLabel>
      </div>

      {/* PR-SALES-PAYMENT-SPLIT-SAFE (2026-06-24): 3 ô tiền split chỉ render khi method combo.
          User 2026-06-24: đặt ngay sau HT thu để Sale nhập tiền liền mạch. */}
      {!row.savedRow && row.paymentMethod && (row.paymentMethod === 'tien_mat_chuyen_khoan' || row.paymentMethod === 'tien_mat_pos' || row.paymentMethod === 'chuyen_khoan_pos') && (
        <div className="grid grid-cols-2 gap-3">
          {(row.paymentMethod === 'tien_mat_chuyen_khoan' || row.paymentMethod === 'tien_mat_pos') && (
            <FieldLabel label="Tiền mặt *">
              <MoneyInput value={Number((row as any).paymentCash) || 0} disabled={!canEdit} onCommit={(n) => onUpdate({ paymentCash: String(n) } as any)} />
            </FieldLabel>
          )}
          {(row.paymentMethod === 'tien_mat_chuyen_khoan' || row.paymentMethod === 'chuyen_khoan_pos') && (
            <FieldLabel label="Chuyển khoản *">
              <MoneyInput value={Number((row as any).paymentTransfer) || 0} disabled={!canEdit} onCommit={(n) => onUpdate({ paymentTransfer: String(n) } as any)} />
            </FieldLabel>
          )}
          {(row.paymentMethod === 'tien_mat_pos' || row.paymentMethod === 'chuyen_khoan_pos') && (
            <FieldLabel label="POS *">
              <MoneyInput value={Number((row as any).paymentCard) || 0} disabled={!canEdit} onCommit={(n) => onUpdate({ paymentCard: String(n) } as any)} />
            </FieldLabel>
          )}
        </div>
      )}

      {/* V6 PT (2026-06-17) + V8.Y Manual (2026-06-19): Số buổi cho cả PT và Manual; Đơn giá CHỈ PT */}
      {(isPT || isManual) && !isThanhToanNot && (
        <div className={`grid ${isPT ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
          <FieldLabel label="Số buổi *">
            <MoneyInput value={qtyNum} disabled={!canEdit} onCommit={(n) => setNum('quantity', n)} />
          </FieldLabel>
          {isPT && (
            <FieldLabel label="Đơn giá / buổi *">
              <MoneyInput value={upNum} disabled={!canEdit} onCommit={(n) => setNum('unitPrice', n)} />
            </FieldLabel>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <FieldLabel label={isThanhToanNot ? 'Giá trị gói' : 'Giá trị gói *'}>
          {isThanhToanNot ? (
            <div className="w-full px-3 py-2 rounded-lg ring-1 ring-slate-200 bg-slate-50 text-xs text-slate-400 italic">
              Không tính (sẽ link với GD cũ)
            </div>
          ) : isPT ? (
            <div
              className="w-full px-3 py-2 rounded-lg ring-1 ring-slate-200 bg-slate-50 text-sm text-right tabular-nums text-slate-700 font-medium"
              title="Auto = Số buổi × Đơn giá / buổi"
            >
              {pvNum.toLocaleString()}đ
            </div>
          ) : isManual ? (
            // V8.Y manual mode: Sale TỰ NHẬP (suggest từ defaultPrice)
            <MoneyInput value={pvNum} disabled={!canEdit} onCommit={(n) => setNum('packageValue', n)} />
          ) : pvNum > 0 ? (
            // V7 (2026-06-18): Auto-fill từ pkg.defaultPrice — Sale KHÔNG sửa.
            <div
              className="w-full px-3 py-2 rounded-lg ring-1 ring-slate-200 bg-slate-50 text-sm text-right tabular-nums text-slate-700 font-medium"
              title="Giá gói lấy từ /doanh-so/packages — admin quản lý"
            >
              {pvNum.toLocaleString()}đ
            </div>
          ) : (
            <div className="w-full px-3 py-2 rounded-lg ring-1 ring-amber-200 bg-amber-50/40 text-xs text-amber-700 italic">
              Gói chưa có giá — báo admin cập nhật
            </div>
          )}
        </FieldLabel>
        <FieldLabel label="Thu hôm nay *">
          {/* PR-SALES-PAYMENT-SPLIT-SAFE (2026-06-24): split method → read-only sum */}
          {row.paymentMethod && (row.paymentMethod === 'tien_mat_chuyen_khoan' || row.paymentMethod === 'tien_mat_pos' || row.paymentMethod === 'chuyen_khoan_pos') ? (
            <div className="w-full px-3 py-2 rounded-lg ring-1 ring-violet-200 bg-violet-50/40 text-violet-700 font-semibold tabular-nums text-sm">
              {((Number((row as any).paymentCash) || 0) + (Number((row as any).paymentTransfer) || 0) + (Number((row as any).paymentCard) || 0)).toLocaleString()}đ
              <div className="text-[10px] font-normal text-violet-600 mt-0.5">Tự tính từ 2 hình thức thu</div>
            </div>
          ) : (
            <MoneyInput value={ctNum} disabled={!canEdit} onCommit={(n) => setNum('collectedToday', n)} />
          )}
        </FieldLabel>
      </div>

      <div className="text-xs text-slate-500 flex items-center justify-between">
        <span>Công nợ phát sinh:</span>
        <span className={`font-bold tabular-nums ${debt > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{debt.toLocaleString()}đ</span>
      </div>
      {/* V7 Promo (2026-06-18) — info promo nếu SavedRow có snapshot */}
      {row.savedRow && (row.promoSnapshots?.length ?? 0) > 0 && (
        <div className="rounded-lg bg-violet-50 ring-1 ring-violet-200 px-2.5 py-2 text-xs">
          <div className="font-semibold text-violet-700 mb-1">Khuyến mãi đã áp:</div>
          {row.promoSnapshots!.map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-violet-700">
              <span className="font-mono font-bold">{s.code}</span>
              <span>·</span>
              <span>{s.name}</span>
            </div>
          ))}
          {(row.discountAmount ?? 0) > 0 && (
            <div className="mt-1 text-emerald-700">Đã giảm: <strong className="tabular-nums">{row.discountAmount!.toLocaleString()}đ</strong></div>
          )}
        </div>
      )}
      {/* V7 Mobile notice (2026-06-18) — LocalRow chưa apply promo, hướng dẫn Sale mở desktop */}
      {!row.savedRow && (row.promoSnapshots?.length ?? 0) === 0 && (
        <div className="rounded-lg bg-amber-50/40 ring-1 ring-amber-200 px-2.5 py-1.5 text-[11px] text-amber-700 italic">
          💡 Áp mã khuyến mãi: vui lòng mở /nhap trên máy tính (mobile chưa hỗ trợ chọn mã)
        </div>
      )}

      {/* Chứng từ — V7 (2026-06-18): prefix cố định 'PT' / 'HĐ' */}
      {(row as any).transactionType === 'dat_coc' && (
        <FieldLabel label="Số phiếu thu *">
          <PrefixedInputMobile prefix="PT" value={getStr('receiptNo')} disabled={!canEdit}
            placeholder="001" onCommit={(v) => updateStr('receiptNo', v)} />
        </FieldLabel>
      )}
      {(row as any).transactionType === 'thanh_toan_not' && (
        <FieldLabel label="Số phiếu thu cũ (để auto-link)">
          <PrefixedInputMobile prefix="PT" value={getStr('receiptNo')} disabled={!canEdit}
            placeholder="số PT đặt cọc cũ" onCommit={(v) => updateStr('receiptNo', v)} />
        </FieldLabel>
      )}
      {((row as any).transactionType === 'thanh_toan_full' || (row as any).transactionType === 'thanh_toan_not') && (
        <FieldLabel label="Số hợp đồng *">
          <PrefixedInputMobile prefix="HĐ" value={getStr('contractNo')} disabled={!canEdit}
            placeholder="001" onCommit={(v) => updateStr('contractNo', v)} />
        </FieldLabel>
      )}

      <FieldLabel label="Ghi chú">
        <input
          type="text"
          defaultValue={getStr('note')}
          disabled={!canEdit}
          onBlur={(e) => { if (e.target.value !== getStr('note')) updateStr('note', e.target.value); }}
          className="w-full px-3 py-2 rounded-lg ring-1 ring-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </FieldLabel>

      {canEdit && (
        <button
          type="button"
          onClick={onRemove}
          className="w-full mt-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-rose-50 text-rose-700 text-sm font-medium ring-1 ring-rose-200 hover:bg-rose-100"
        >
          <Trash2 size={14} /> Xoá dòng
        </button>
      )}
    </div>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

function PhoneInputMobile({ value, disabled, onCommit }: {
  value: string;
  disabled: boolean;
  onCommit: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  const trimmed = local.trim();
  const invalid = trimmed.length > 0 && !isValidPhone(trimmed);
  return (
    <>
      <input
        type="tel"
        inputMode="numeric"
        maxLength={11}
        value={local}
        disabled={disabled}
        onChange={(e) => setLocal(e.target.value.replace(/[^\d]/g, ''))}
        onBlur={() => { if (local !== value) onCommit(local); }}
        className={`w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 disabled:cursor-not-allowed ring-1 ${
          invalid
            ? 'bg-rose-50 text-rose-700 ring-rose-300 focus:ring-rose-400'
            : 'ring-slate-200 focus:ring-emerald-500'
        }`}
      />
      {invalid && (
        <div className="mt-1 text-[11px] text-rose-600">SĐT phải 10 số bắt đầu bằng 0</div>
      )}
    </>
  );
}

function MoneyInput({ value, disabled, onCommit }: {
  value: number;
  disabled: boolean;
  onCommit: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState<string>(value > 0 ? String(value) : '');
  useEffect(() => { if (!editing) setRaw(value > 0 ? String(value) : ''); }, [value, editing]);
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
      className="w-full px-3 py-2 rounded-lg ring-1 ring-slate-200 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500"
    />
  );
}

/** V7 (2026-06-18) — Input có prefix cố định 'PT'/'HĐ', mobile. */
function PrefixedInputMobile({ prefix, value, disabled, placeholder, onCommit }: {
  prefix: string;
  value: string;
  disabled: boolean;
  placeholder?: string;
  onCommit: (fullValue: string) => void;
}) {
  // Strip prefix khi display nếu value đã có
  const stripPrefix = (s: string) => {
    const t = (s ?? '').trim();
    return t.toUpperCase().startsWith(prefix.toUpperCase()) ? t.slice(prefix.length).trim() : t;
  };
  const displayValue = stripPrefix(value);
  const buildFull = (userInput: string): string => {
    const t = userInput.trim();
    if (!t) return '';
    if (t.toUpperCase().startsWith(prefix.toUpperCase())) return t;
    return `${prefix}${t}`;
  };
  return (
    <div className="w-full flex items-center rounded-lg ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-emerald-500 overflow-hidden">
      <span className="px-3 py-2 bg-slate-100 text-slate-600 font-mono font-semibold text-sm select-none border-r border-slate-200">
        {prefix}
      </span>
      <input
        type="text"
        key={value}
        defaultValue={displayValue}
        disabled={disabled}
        placeholder={placeholder ?? '001'}
        maxLength={50 - prefix.length}
        onBlur={(e) => {
          const full = buildFull(e.target.value);
          if (full !== value) onCommit(full);
        }}
        className="flex-1 min-w-0 px-3 py-2 text-sm bg-white focus:outline-none disabled:cursor-not-allowed"
      />
    </div>
  );
}

// Re-export Plus for caller (NhapClient FAB add button)
export { Plus };
