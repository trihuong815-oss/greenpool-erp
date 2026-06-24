'use client';

// PR-CASH-FILTERS (2026-06-24) — Bộ lọc nâng cao cho /chi-phi-co-so.
//
// UX: button "Lọc nâng cao" với badge số filter active → expand collapse panel.
// Chips show condition đang lọc + X xóa từng filter. Apply / Clear.
// Date + branch quick filter ở header (ChiPhiCoSoClient).

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Filter, X, RotateCcw, Check } from 'lucide-react';
import {
  EMPTY_EXPENSE_FILTERS,
  countActiveExpenseFilters,
  type ExpenseFilters,
} from '@/lib/finance/filter-expenses';
import {
  EXPENSE_PAYMENT_METHOD_LABEL,
  EXPENSE_STATUS_LABEL,
  EXPENSE_CATEGORY_LABEL,
  EXPENSE_BASIS_TYPE_LABEL,
  type ExpensePaymentMethod,
  type ExpenseStatus,
  type ExpenseCategory,
  type ExpenseBasisType,
} from '@/lib/finance/expense-types';

interface Props {
  value: ExpenseFilters;
  onApply: (next: ExpenseFilters) => void;
  onClear: () => void;
}

const INPUT_CLS = 'w-full h-9 px-3 text-sm rounded-lg bg-white ring-1 ring-slate-300 hover:ring-slate-400 focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-colors';

export function ExpenseFilterPanel({ value, onApply, onClear }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ExpenseFilters>(value);
  const activeCount = countActiveExpenseFilters(value);

  // Sync draft khi value đổi từ ngoài (URL back/forward).
  useEffect(() => { setDraft(value); }, [value]);

  const apply = () => { onApply(draft); setOpen(false); };
  const clear = () => { setDraft(EMPTY_EXPENSE_FILTERS); onClear(); };

  const update = <K extends keyof ExpenseFilters>(key: K, v: ExpenseFilters[K]) => {
    setDraft((prev) => ({ ...prev, [key]: v }));
  };

  const removeOne = <K extends keyof ExpenseFilters>(key: K) => {
    const next = { ...value, [key]: EMPTY_EXPENSE_FILTERS[key] };
    onApply(next);
    setDraft(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => { setDraft(value); setOpen((p) => !p); }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ring-1 ring-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <Filter size={12} className="text-emerald-600" />
          Lọc nâng cao
          {activeCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
              {activeCount}
            </span>
          )}
          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={clear}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium ring-1 ring-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors"
            title="Xóa tất cả filter nâng cao"
          >
            <RotateCcw size={11} /> Xóa lọc
          </button>
        )}
        {activeCount > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {value.voucherNo && <Chip label={`Số CT: ${value.voucherNo}`} onRemove={() => removeOne('voucherNo')} />}
            {value.keyword && <Chip label={`Tìm: ${value.keyword}`} onRemove={() => removeOne('keyword')} />}
            {value.counterpartyName && <Chip label={`Người GD: ${value.counterpartyName}`} onRemove={() => removeOne('counterpartyName')} />}
            {value.paymentMethod && <Chip label={`PT chi: ${EXPENSE_PAYMENT_METHOD_LABEL[value.paymentMethod as ExpensePaymentMethod]}`} onRemove={() => removeOne('paymentMethod')} />}
            {value.expenseCategory && <Chip label={`Nhóm: ${EXPENSE_CATEGORY_LABEL[value.expenseCategory as ExpenseCategory]}`} onRemove={() => removeOne('expenseCategory')} />}
            {value.expenseBasisType && <Chip label={`Căn cứ: ${EXPENSE_BASIS_TYPE_LABEL[value.expenseBasisType as ExpenseBasisType]}`} onRemove={() => removeOne('expenseBasisType')} />}
            {value.status && <Chip label={`Trạng thái: ${EXPENSE_STATUS_LABEL[value.status as ExpenseStatus]}`} onRemove={() => removeOne('status')} />}
            {value.amountMin !== null && <Chip label={`Tiền ≥ ${value.amountMin.toLocaleString()}`} onRemove={() => removeOne('amountMin')} />}
            {value.amountMax !== null && <Chip label={`Tiền ≤ ${value.amountMax.toLocaleString()}`} onRemove={() => removeOne('amountMax')} />}
          </div>
        )}
      </div>

      {open && (
        <div className="card shadow-sm space-y-3 ring-1 ring-emerald-100">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Số chứng từ">
              <input type="text" value={draft.voucherNo} onChange={(e) => update('voucherNo', e.target.value)}
                placeholder="vd: PC0123" className={INPUT_CLS} />
            </Field>
            <Field label="Diễn giải / tìm chung">
              <input type="text" value={draft.keyword} onChange={(e) => update('keyword', e.target.value)}
                placeholder="từ khóa diễn giải / NGD / số CT" className={INPUT_CLS} />
            </Field>
            <Field label="Người giao dịch">
              <input type="text" value={draft.counterpartyName} onChange={(e) => update('counterpartyName', e.target.value)}
                placeholder="tên người/đơn vị" className={INPUT_CLS} />
            </Field>
            <Field label="Phương thức chi">
              <select value={draft.paymentMethod} onChange={(e) => update('paymentMethod', e.target.value as ExpenseFilters['paymentMethod'])} className={INPUT_CLS}>
                <option value="">— Tất cả —</option>
                {(Object.keys(EXPENSE_PAYMENT_METHOD_LABEL) as ExpensePaymentMethod[]).map((k) => (
                  <option key={k} value={k}>{EXPENSE_PAYMENT_METHOD_LABEL[k]}</option>
                ))}
              </select>
            </Field>
            <Field label="Nhóm chi">
              <select value={draft.expenseCategory} onChange={(e) => update('expenseCategory', e.target.value as ExpenseFilters['expenseCategory'])} className={INPUT_CLS}>
                <option value="">— Tất cả —</option>
                {(Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[]).map((k) => (
                  <option key={k} value={k}>{EXPENSE_CATEGORY_LABEL[k]}</option>
                ))}
              </select>
            </Field>
            <Field label="Loại căn cứ">
              <select value={draft.expenseBasisType} onChange={(e) => update('expenseBasisType', e.target.value as ExpenseFilters['expenseBasisType'])} className={INPUT_CLS}>
                <option value="">— Tất cả —</option>
                {(Object.keys(EXPENSE_BASIS_TYPE_LABEL) as ExpenseBasisType[]).map((k) => (
                  <option key={k} value={k}>{EXPENSE_BASIS_TYPE_LABEL[k]}</option>
                ))}
              </select>
            </Field>
            <Field label="Trạng thái">
              <select value={draft.status} onChange={(e) => update('status', e.target.value as ExpenseFilters['status'])} className={INPUT_CLS}>
                <option value="">— Tất cả —</option>
                {(Object.keys(EXPENSE_STATUS_LABEL) as ExpenseStatus[]).map((k) => (
                  <option key={k} value={k}>{EXPENSE_STATUS_LABEL[k]}</option>
                ))}
              </select>
            </Field>
            <Field label="Số tiền từ">
              <input type="number" min={0} value={draft.amountMin ?? ''}
                onChange={(e) => update('amountMin', e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0))}
                placeholder="vd: 100000" className={INPUT_CLS} />
            </Field>
            <Field label="Số tiền đến">
              <input type="number" min={0} value={draft.amountMax ?? ''}
                onChange={(e) => update('amountMax', e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0))}
                placeholder="vd: 5000000" className={INPUT_CLS} />
            </Field>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" onClick={() => { setDraft(value); setOpen(false); }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium ring-1 ring-slate-200 bg-white text-slate-600 hover:bg-slate-50">
              Huỷ
            </button>
            <button type="button" onClick={apply}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
              <Check size={12} /> Áp dụng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-600 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-emerald-50 ring-1 ring-emerald-200 text-emerald-700 text-xs">
      {label}
      <button type="button" onClick={onRemove} className="p-0.5 rounded-full hover:bg-emerald-200 text-emerald-600" title="Bỏ filter này">
        <X size={10} />
      </button>
    </span>
  );
}
