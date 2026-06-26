'use client';

// PR-NHAPCLIENT-SPLIT-PHASE-1 (2026-06-26): tách atomic primitives khỏi SalesGrid.tsx
// để file gốc dễ đọc hơn. KHÔNG đổi logic, KHÔNG đổi UI, KHÔNG đổi behavior.
//
// File này chứa:
//   • Atomic cells: Th, Td, TextCell, PhoneCell, DocCell, NumberCell
//   • Tone constants: SOURCE_TONE, PAY_TONE
//   • Select primitives: SourceSelect, TxnTypeSelect, PayMethodSelect
//   • Breakdown cells (split payment): SavedTxBreakdownCells, SplitPaymentCells
//   • Promo display + picker: fmtPromoChip, PromoChipsReadonly, PromoCell
//   • Style constants: INPUT_BASE, INPUT_ERROR
//
// Re-export về SalesGrid.tsx — callsite không thay đổi.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Tag, X, Search } from 'lucide-react';
import type {
  SalesTransaction,
  SalesV2Source,
  TransactionType,
  PaymentMethod,
} from '@/lib/types/sales-v2';
import { SOURCE_LABEL, TRANSACTION_TYPE_LABEL, PAYMENT_METHOD_LABEL } from '@/lib/types/sales-v2';
import {
  isSplitPayment,
  getActivePaymentFields,
  type PaymentBucket,
} from '@/lib/sales-v2/payment-split';
import {
  isDiscountType, isBonusType,
  type PromoSnapshot, type PromoType,
} from '@/lib/types/sales-program';
import type { LocalRow } from './SalesGrid';
import { isValidPhone } from './SalesGrid';

// ─── Style constants ────────────────────────────────────────────────
// V8.X (2026-06-18) refactor: viền tím cho mọi ô input. Đỏ chỉ khi có lỗi.
export const INPUT_BASE = 'border border-violet-200 bg-white focus:bg-white focus:border-violet-500 focus:ring-2 focus:ring-violet-100 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-50';
export const INPUT_ERROR = 'border border-rose-400 ring-1 ring-rose-300 bg-rose-50/40 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-50';

// ─── Tone maps ──────────────────────────────────────────────────────
export const SOURCE_TONE: Record<SalesV2Source, string> = {
  ca_nhan: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  walkin:  'bg-sky-50 text-sky-700 ring-sky-200',
  mkt:     'bg-violet-50 text-violet-700 ring-violet-200',
  renew:   'bg-amber-50 text-amber-700 ring-amber-200',
  ref:     'bg-rose-50 text-rose-700 ring-rose-200',
};

export const PAY_TONE: Record<PaymentMethod, string> = {
  tien_mat:                'bg-emerald-50 text-emerald-700 ring-emerald-200',
  chuyen_khoan:            'bg-sky-50 text-sky-700 ring-sky-200',
  pos:                     'bg-amber-50 text-amber-700 ring-amber-200',
  // PR-SALES-PAYMENT-SPLIT-SAFE (2026-06-24): combo methods — violet tone.
  tien_mat_chuyen_khoan:   'bg-violet-50 text-violet-700 ring-violet-200',
  tien_mat_pos:            'bg-violet-50 text-violet-700 ring-violet-200',
  chuyen_khoan_pos:        'bg-violet-50 text-violet-700 ring-violet-200',
};

// ─── Table primitives ──────────────────────────────────────────────
export function Th({ children, width, align = 'left' }: { children?: React.ReactNode; width?: number; align?: 'left' | 'right' }) {
  return (
    <th
      className={`px-2.5 py-2 ${align === 'right' ? 'text-right' : 'text-left'} whitespace-nowrap`}
      style={width ? { width } : undefined}
    >
      {children}
    </th>
  );
}

export function Td({ children, align = 'left', className = '' }: { children?: React.ReactNode; align?: 'left' | 'right' | 'center'; className?: string }) {
  return (
    <td className={`px-2.5 py-1.5 ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'} ${className}`}>
      {children}
    </td>
  );
}

// ─── Atomic cell components ────────────────────────────────────────
export function TextCell({
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
export function PhoneCell({
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
export function DocCell({
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

export function NumberCell({
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

// ─── Selects ────────────────────────────────────────────────────────
export function SourceSelect({ value, disabled, onChange }: {
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

export function TxnTypeSelect({ value, disabled, onChange }: {
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

export function PayMethodSelect({ value, disabled, onChange }: {
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

// ─── Breakdown cells (split payment) ────────────────────────────────
/** PR-SALES-PAYMENT-SPLIT-SAFE (2026-06-24): saved tx breakdown — read-only 3 cell. */
export function SavedTxBreakdownCells({ tx }: { tx: SalesTransaction }) {
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
export function SplitPaymentCells({ row, canEdit, onUpdate }: {
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

// ─── Promo cells (V7) ───────────────────────────────────────────────
const PROMO_TYPE_SHORT: Record<PromoType, string> = {
  percent: '%', fixed_amount: 'VND', bonus_sessions: 'Buổi', bonus_days: 'Ngày',
};

export function fmtPromoChip(s: PromoSnapshot, unitName: string = 'buổi'): string {
  if (s.type === 'percent') return `-${s.value}%`;
  if (s.type === 'fixed_amount') return `-${s.value.toLocaleString()}đ`;
  if (s.type === 'bonus_sessions') return `+${s.value} ${unitName}`;
  if (s.type === 'bonus_days') return `+${s.value} ngày`;
  return String(s.value);
}

/** Readonly chips display cho SavedRow — không cho edit (xoá+tạo lại nếu muốn đổi). */
export function PromoChipsReadonly({ snapshots, discountAmount, bonusQuantity, bonusDays, unitName }: {
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

interface AvailablePromo {
  id: string;
  promoCode: string;
  name: string;
  promoType: PromoType;
  promoValue: number;
}

/** Editable cell cho LocalRow — popover picker + chips. */
export function PromoCell({ row, branchId, batchMonth, canEdit, onUpdate }: {
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
