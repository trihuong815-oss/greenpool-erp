'use client';

// PR-CASH1C: Form NV_KE nhập phiếu chi — Lưu nháp / Ghi nhận chi.
// KHÔNG có nút "Duyệt chi" — đề xuất duyệt phải qua Trung tâm Phê duyệt riêng.

import { useEffect, useState } from 'react';
import { Save, CheckCircle, X, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { BranchId } from '@/lib/branches';
import {
  EXPENSE_PAYMENT_METHOD_LABEL,
  EXPENSE_CATEGORY_LABEL,
  EXPENSE_BASIS_TYPE_LABEL,
  type ExpensePaymentMethod,
  type ExpenseCategory,
  type ExpenseBasisType,
} from '@/lib/finance/expense-types';
import type { ExpenseDoc } from '@/lib/services/finance/api-client';
import { createExpense, updateExpense, recordExpense } from '@/lib/services/finance/api-client';

interface Props {
  date: string;
  branchId: BranchId;
  branchName: string;
  editing: ExpenseDoc | null;
  onCancelEdit: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}

const PAYMENT_METHODS: ExpensePaymentMethod[] = ['cash', 'transfer', 'card', 'other'];
const CATEGORIES = Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[];
const BASIS_TYPES = Object.keys(EXPENSE_BASIS_TYPE_LABEL) as ExpenseBasisType[];

interface FormState {
  voucherNo: string;
  description: string;
  amount: string;
  paymentMethod: ExpensePaymentMethod;
  expenseCategory: ExpenseCategory;
  counterpartyName: string;
  counterpartyUnit: string;
  counterpartyAddress: string;
  expenseBasisType: ExpenseBasisType;
  expenseBasisRef: string;
  note: string;
}

const EMPTY: FormState = {
  voucherNo: '',
  description: '',
  amount: '',
  paymentMethod: 'cash',
  expenseCategory: 'khac',
  counterpartyName: '',
  counterpartyUnit: '',
  counterpartyAddress: '',
  expenseBasisType: 'direct_invoice',
  expenseBasisRef: '',
  note: '',
};

function fromDoc(d: ExpenseDoc): FormState {
  return {
    voucherNo: d.voucherNo ?? '',
    description: d.description ?? '',
    amount: String(d.amount ?? ''),
    paymentMethod: d.paymentMethod,
    expenseCategory: d.expenseCategory,
    counterpartyName: d.counterpartyName ?? '',
    counterpartyUnit: d.counterpartyUnit ?? '',
    counterpartyAddress: d.counterpartyAddress ?? '',
    expenseBasisType: d.expenseBasisType,
    expenseBasisRef: d.expenseBasisRef ?? '',
    note: d.note ?? '',
  };
}

export function ExpenseForm({ date, branchId, branchName, editing, onCancelEdit, onSaved, onError }: Props) {
  const isEditing = editing != null;
  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState<null | 'draft' | 'record'>(null);

  // Sync form when editing target changes; clear when leaves edit mode
  useEffect(() => {
    if (editing) setForm(fromDoc(editing));
    else setForm(EMPTY);
  }, [editing?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function reset() {
    setForm(EMPTY);
    onCancelEdit();
  }

  function validate(): string | null {
    if (!form.voucherNo.trim()) return 'Thiếu số chứng từ';
    if (!form.description.trim()) return 'Thiếu nội dung chi';
    const amt = Number(form.amount);
    if (!Number.isFinite(amt) || amt <= 0) return 'Số tiền phải > 0';
    if (!form.counterpartyName.trim()) return 'Thiếu đối tượng nhận tiền';
    return null;
  }

  async function handleSubmit(action: 'draft' | 'record') {
    const err = validate();
    if (err) { onError(err); return; }
    setBusy(action);
    try {
      if (isEditing && editing) {
        await updateExpense(editing.id, {
          description: form.description.trim(),
          amount: Number(form.amount),
          paymentMethod: form.paymentMethod,
          expenseCategory: form.expenseCategory,
          counterpartyName: form.counterpartyName.trim(),
          counterpartyUnit: form.counterpartyUnit.trim() || null,
          counterpartyAddress: form.counterpartyAddress.trim() || null,
          expenseBasisType: form.expenseBasisType,
          expenseBasisRef: form.expenseBasisRef.trim() || null,
          note: form.note.trim() || null,
        });
        if (action === 'record') {
          await recordExpense(editing.id);
        }
      } else {
        await createExpense({
          voucherNo: form.voucherNo.trim(),
          date,
          branchId,
          description: form.description.trim(),
          amount: Number(form.amount),
          paymentMethod: form.paymentMethod,
          expenseCategory: form.expenseCategory,
          counterpartyName: form.counterpartyName.trim(),
          counterpartyUnit: form.counterpartyUnit.trim() || null,
          counterpartyAddress: form.counterpartyAddress.trim() || null,
          expenseBasisType: form.expenseBasisType,
          expenseBasisRef: form.expenseBasisRef.trim() || null,
          note: form.note.trim() || null,
          action,
        });
      }
      reset();
      onSaved();
    } catch (e: any) {
      onError(e?.message ?? 'Lỗi lưu phiếu chi');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card">
      <div className="card-title">
        {isEditing ? <Pencil size={16} className="text-amber-600" /> : <Save size={16} className="text-emerald-600" />}
        <span>{isEditing ? `Sửa phiếu chi #${editing?.voucherNo}` : 'Tạo phiếu chi'}</span>
        {isEditing && (
          <button type="button" onClick={reset} className="ml-auto text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1">
            <X size={12} /> Huỷ sửa
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Số chứng từ *" >
          <input
            type="text"
            value={form.voucherNo}
            onChange={(e) => set('voucherNo', e.target.value)}
            disabled={isEditing}
            placeholder="VD: PC-2026-06-001"
            className={inputCls}
          />
        </Field>

        <Field label="Cơ sở">
          <input type="text" value={`${branchId} — ${branchName}`} readOnly className={`${inputCls} bg-slate-50 cursor-not-allowed`} />
        </Field>

        <Field label="Nội dung chi *" className="md:col-span-2">
          <input type="text" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="VD: Mua hoá chất xử lý nước" className={inputCls} />
        </Field>

        <Field label="Số tiền (₫) *">
          <input type="number" value={form.amount} min={1} onChange={(e) => set('amount', e.target.value)} className={`${inputCls} tabular-nums`} />
        </Field>

        <Field label="Phương thức chi *">
          <select value={form.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value as ExpensePaymentMethod)} className={inputCls}>
            {PAYMENT_METHODS.map((pm) => <option key={pm} value={pm}>{EXPENSE_PAYMENT_METHOD_LABEL[pm]}</option>)}
          </select>
        </Field>

        <Field label="Nhóm chi *">
          <select value={form.expenseCategory} onChange={(e) => set('expenseCategory', e.target.value as ExpenseCategory)} className={inputCls}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{EXPENSE_CATEGORY_LABEL[c]}</option>)}
          </select>
        </Field>

        <Field label="Đối tượng nhận tiền *">
          <input type="text" value={form.counterpartyName} onChange={(e) => set('counterpartyName', e.target.value)} placeholder="VD: Cty TNHH ABC" className={inputCls} />
        </Field>

        <Field label="Đơn vị (tuỳ chọn)">
          <input type="text" value={form.counterpartyUnit} onChange={(e) => set('counterpartyUnit', e.target.value)} className={inputCls} />
        </Field>

        <Field label="Địa chỉ (tuỳ chọn)" className="md:col-span-2">
          <input type="text" value={form.counterpartyAddress} onChange={(e) => set('counterpartyAddress', e.target.value)} className={inputCls} />
        </Field>

        <Field label="Căn cứ chi *">
          <select value={form.expenseBasisType} onChange={(e) => set('expenseBasisType', e.target.value as ExpenseBasisType)} className={inputCls}>
            {BASIS_TYPES.map((b) => <option key={b} value={b}>{EXPENSE_BASIS_TYPE_LABEL[b]}</option>)}
          </select>
        </Field>

        <Field label="Mã/số căn cứ (khuyến nghị)">
          <input type="text" value={form.expenseBasisRef} onChange={(e) => set('expenseBasisRef', e.target.value)} placeholder="VD: ĐX-2026-001, HĐ-1234" className={inputCls} />
        </Field>

        <Field label="Ghi chú" className="md:col-span-2">
          <textarea value={form.note} onChange={(e) => set('note', e.target.value)} rows={2} className={inputCls} />
        </Field>
      </div>

      <p className="mt-3 text-xs text-slate-500 leading-relaxed">
        Nếu khoản chi cần phê duyệt trước, hãy tạo đề xuất ở Trung tâm Phê duyệt trước.
        Màn này chỉ ghi nhận khoản chi thực tế.
      </p>

      <div className="mt-4 flex flex-wrap gap-2 justify-end">
        <Button variant="secondary" size="md" loading={busy === 'draft'} onClick={() => handleSubmit('draft')} leftIcon={<Save size={14} />}>
          Lưu nháp
        </Button>
        <Button variant="primary" size="md" loading={busy === 'record'} onClick={() => handleSubmit('record')} leftIcon={<CheckCircle size={14} />}>
          Ghi nhận chi
        </Button>
      </div>
    </div>
  );
}

const inputCls = 'w-full h-10 px-3 text-sm rounded-lg ring-1 ring-slate-200 focus:ring-2 focus:ring-emerald-400 focus:outline-none disabled:bg-slate-50 disabled:cursor-not-allowed';

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className ?? ''}>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}
