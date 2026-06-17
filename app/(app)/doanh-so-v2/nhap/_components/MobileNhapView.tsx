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
import { type LocalRow, isRowEmpty, validateRow, isValidPhone } from './SalesGrid';

interface Props {
  packages: SalesV2Package[];
  rows: SalesTransaction[];
  localRows: LocalRow[];
  canEdit: boolean;
  batchStatus: string;
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

  const debt = Math.max(0, (Number(row.packageValue) || 0) - (Number(row.collectedToday) || 0));

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
                {row.phone} · {row.packageName || '(chưa chọn gói)'} · <span className="text-emerald-700 font-medium">{(Number(row.packageValue) || 0).toLocaleString()}đ</span>
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
  const pvNum = row.savedRow ? (row.packageValue ?? 0) : (Number(row.packageValue) || 0);
  const ctNum = row.savedRow ? (row.collectedToday ?? 0) : (Number(row.collectedToday) || 0);
  const debt = Math.max(0, pvNum - ctNum);

  const setNum = (k: 'packageValue' | 'collectedToday', n: number) => {
    if (row.savedRow) onUpdate({ [k]: n } as any);
    else onUpdate({ [k]: String(n) } as any);
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
              onUpdate({ packageId: null, packageCode: '', packageName: '', serviceGroup: '', isChildPackage: false } as any);
              return;
            }
            const newPv = pkg.defaultPrice;
            let packageValueToSet: any = row.savedRow ? row.packageValue : row.packageValue;
            const currentPv = pvNum;
            if (!currentPv && newPv > 0) {
              packageValueToSet = row.savedRow ? newPv : String(newPv);
            } else if (currentPv > 0 && newPv > 0 && currentPv !== newPv) {
              const ok = await showConfirm({
                title: 'Cập nhật giá theo gói mới?',
                description: `Giá hiện tại: ${currentPv.toLocaleString()}đ\nGiá mặc định: ${newPv.toLocaleString()}đ`,
                confirmText: 'Cập nhật',
                cancelText: 'Giữ giá cũ',
              });
              if (ok) packageValueToSet = row.savedRow ? newPv : String(newPv);
            }
            onUpdate({
              packageId: pkg.id,
              packageCode: pkg.code,
              packageName: pkg.name,
              serviceGroup: pkg.serviceGroup,
              isChildPackage: pkg.isChildPackage,
              packageValue: packageValueToSet,
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
            onChange={(e) => onUpdate({ transactionType: e.target.value as TransactionType } as any)}
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
            onChange={(e) => onUpdate({ paymentMethod: e.target.value as PaymentMethod } as any)}
            className="w-full px-3 py-2 rounded-lg ring-1 ring-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">— Chọn —</option>
            {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((k) => (
              <option key={k} value={k}>{PAYMENT_METHOD_LABEL[k]}</option>
            ))}
          </select>
        </FieldLabel>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <FieldLabel label="Giá trị gói *">
          <MoneyInput value={pvNum} disabled={!canEdit} onCommit={(n) => setNum('packageValue', n)} />
        </FieldLabel>
        <FieldLabel label="Thu hôm nay *">
          <MoneyInput value={ctNum} disabled={!canEdit} onCommit={(n) => setNum('collectedToday', n)} />
        </FieldLabel>
      </div>

      <div className="text-xs text-slate-500 flex items-center justify-between">
        <span>Công nợ phát sinh:</span>
        <span className={`font-bold tabular-nums ${debt > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{debt.toLocaleString()}đ</span>
      </div>

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

// Re-export Plus for caller (NhapClient FAB add button)
export { Plus };
