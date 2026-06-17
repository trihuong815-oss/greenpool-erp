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
  transactionType: TransactionType | null;
  paymentMethod: PaymentMethod | null;
  packageValue: string;     // dạng string để input hiển thị OK
  collectedToday: string;
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
    transactionType: null,
    paymentMethod: null,
    packageValue: '',
    collectedToday: '',
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
    && !r.note.trim();
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
  const pv = Number(r.packageValue);
  if (!Number.isFinite(pv) || pv < 0) return { ok: false, error: 'Giá trị gói không hợp lệ' };
  const ct = Number(r.collectedToday);
  if (!Number.isFinite(ct) || ct < 0) return { ok: false, error: 'Thu hôm nay không hợp lệ' };
  if (r.isChildPackage && !r.guardianName.trim()) return { ok: false, error: 'Gói trẻ em bắt buộc Người giám hộ' };
  if (r.transactionType === 'thanh_toan_full' && ct < pv) {
    return { ok: false, error: 'Thanh toán full phải thu đủ giá trị gói' };
  }
  return { ok: true };
}

interface Props {
  packages: SalesV2Package[];
  rows: SalesTransaction[];
  localRows: LocalRow[];
  canEdit: boolean;
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

export default function SalesGrid({
  packages, rows, localRows, canEdit,
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
        <table className="w-full min-w-[1900px] text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
            <tr>
              <Th width={40}>#</Th>
              <Th width={270}>Tên khách hàng *</Th>
              <Th width={150}>SĐT *</Th>
              <Th width={170}>Người giám hộ</Th>
              <Th width={130}>Nguồn *</Th>
              <Th width={190}>Gói *</Th>
              <Th width={150}>Loại GD *</Th>
              <Th width={140}>HT thu *</Th>
              <Th width={130} align="right">Giá trị gói *</Th>
              <Th width={130} align="right">Thu hôm nay *</Th>
              <Th width={130} align="right">Công nợ</Th>
              <Th width={180}>Ghi chú</Th>
              <Th width={44}></Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, i) => (
              <SavedRow
                key={r.id}
                idx={i + 1}
                row={r}
                packages={packages}
                canEdit={canEdit}
                onUpdate={(patch) => onUpdateSaved(r.id, patch)}
                onRemove={() => onRemoveSaved(r.id)}
              />
            ))}
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
function SavedRow({ idx, row, packages, canEdit, onUpdate, onRemove }: {
  idx: number;
  row: SalesTransaction;
  packages: SalesV2Package[];
  canEdit: boolean;
  onUpdate: (patch: Partial<SalesTransaction>) => void;
  onRemove: () => void;
}) {
  const debt = Math.max(0, row.packageValue - row.collectedToday);
  return (
    <tr className="hover:bg-slate-50/60">
      <Td align="center" className="text-slate-400 tabular-nums">{idx}</Td>
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
              onUpdate({
                packageId: pkg.id,
                packageCode: pkg.code,
                packageName: pkg.name,
                serviceGroup: pkg.serviceGroup,
                isChildPackage: pkg.isChildPackage,
              });
            }
          }}
        />
      </Td>
      <Td>
        <TxnTypeSelect value={row.transactionType} disabled={!canEdit} onChange={(v) => onUpdate({ transactionType: v })} />
      </Td>
      <Td>
        <PayMethodSelect value={row.paymentMethod} disabled={!canEdit} onChange={(v) => onUpdate({ paymentMethod: v })} />
      </Td>
      <Td align="right">
        <NumberCell value={row.packageValue} disabled={!canEdit} onCommit={(v) => onUpdate({ packageValue: v })} />
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
  const pv = Number(row.packageValue) || 0;
  const ct = Number(row.collectedToday) || 0;
  const debt = Math.max(0, pv - ct);
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
              onUpdate({ packageId: null, packageCode: '', packageName: '', serviceGroup: '', isChildPackage: false });
              return;
            }
            const currentPv = Number(row.packageValue) || 0;
            const newPv = pkg.defaultPrice;
            // Nếu chưa có giá hoặc giá khớp → set/giữ nguyên không hỏi
            let packageValueToSet = row.packageValue;
            if (!currentPv && newPv > 0) {
              packageValueToSet = String(newPv);
            } else if (currentPv > 0 && newPv > 0 && currentPv !== newPv) {
              // Đổi gói có defaultPrice khác giá hiện tại → hỏi
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
              packageValue: packageValueToSet,
            });
          }}
        />
      </Td>
      <Td>
        <TxnTypeSelect value={row.transactionType} disabled={!canEdit} onChange={(v) => onUpdate({ transactionType: v })} />
      </Td>
      <Td>
        <PayMethodSelect value={row.paymentMethod} disabled={!canEdit} onChange={(v) => onUpdate({ paymentMethod: v })} />
      </Td>
      <Td align="right">
        <NumberCell value={pv} disabled={!canEdit} onCommit={(v) => onUpdate({ packageValue: String(v) })} />
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
