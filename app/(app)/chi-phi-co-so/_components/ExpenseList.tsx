'use client';

// PR-CASH1C: Danh sách phiếu chi trong ngày — table desktop, card mobile.

import { useState } from 'react';
import { Receipt, Pencil, CheckCircle, Trash2, RefreshCw } from 'lucide-react';
import {
  EXPENSE_PAYMENT_METHOD_LABEL,
  EXPENSE_CATEGORY_LABEL,
  EXPENSE_BASIS_TYPE_LABEL,
  EXPENSE_STATUS_LABEL,
  type ExpenseStatus,
} from '@/lib/finance/expense-types';
import type { ExpenseDoc } from '@/lib/services/finance/api-client';
import { recordExpense, deleteDraftExpense } from '@/lib/services/finance/api-client';

interface Props {
  expenses: ExpenseDoc[];
  loading: boolean;
  error: string | null;
  canMutate: boolean;
  onRefresh: () => void;
  onEdit: (e: ExpenseDoc) => void;
  onChanged: () => void;
  onError: (msg: string) => void;
}

const STATUS_PILL: Record<ExpenseStatus, string> = {
  draft:    'bg-slate-100 text-slate-700 ring-slate-200',
  recorded: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  returned: 'bg-rose-50 text-rose-700 ring-rose-200',
  voided:   'bg-slate-100 text-slate-500 ring-slate-200 line-through',
};

function fmt(n: number): string { return n.toLocaleString('vi-VN'); }

function tsLabel(v: any): string {
  if (!v) return '';
  if (typeof v === 'string') return v.slice(0, 16).replace('T', ' ');
  if (v._seconds) return new Date(v._seconds * 1000).toLocaleString('vi-VN');
  if (v.seconds) return new Date(v.seconds * 1000).toLocaleString('vi-VN');
  try { return new Date(v).toLocaleString('vi-VN'); } catch { return String(v); }
}

export function ExpenseList({ expenses, loading, error, canMutate, onRefresh, onEdit, onChanged, onError }: Props) {
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function handleRecord(e: ExpenseDoc) {
    setPendingId(e.id);
    try { await recordExpense(e.id); onChanged(); }
    catch (err: any) { onError(err?.message ?? 'Lỗi ghi nhận'); }
    finally { setPendingId(null); }
  }

  async function handleDelete(e: ExpenseDoc) {
    if (!confirm(`Xoá phiếu chi nháp "${e.voucherNo}"?`)) return;
    setPendingId(e.id);
    try { await deleteDraftExpense(e.id); onChanged(); }
    catch (err: any) { onError(err?.message ?? 'Lỗi xoá'); }
    finally { setPendingId(null); }
  }

  return (
    <div className="card">
      <div className="card-title">
        <Receipt size={16} className="text-emerald-600" />
        <span>Danh sách phiếu chi trong ngày ({expenses.length})</span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Làm mới
        </button>
      </div>

      {error && <div className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2 ring-1 ring-rose-200 mb-3">{error}</div>}

      {!loading && expenses.length === 0 ? (
        <div className="text-center text-sm text-slate-500 py-8">Chưa có phiếu chi nào trong ngày này.</div>
      ) : (
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 border-b border-slate-200">
              <tr>
                <Th>Số chứng từ</Th>
                <Th>Nội dung</Th>
                <Th className="text-right">Số tiền</Th>
                <Th>PT</Th>
                <Th>Nhóm</Th>
                <Th>Căn cứ</Th>
                <Th>Trạng thái</Th>
                <Th>Tạo</Th>
                {canMutate && <Th className="text-right pr-5">Thao tác</Th>}
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <Td className="font-semibold text-slate-800 pl-5">{e.voucherNo}</Td>
                  <Td className="max-w-[20rem] truncate" title={e.description}>{e.description}</Td>
                  <Td className="text-right tabular-nums">{fmt(e.amount)} ₫</Td>
                  <Td>{EXPENSE_PAYMENT_METHOD_LABEL[e.paymentMethod]}</Td>
                  <Td className="text-xs">{EXPENSE_CATEGORY_LABEL[e.expenseCategory]}</Td>
                  <Td className="text-xs">
                    <div>{EXPENSE_BASIS_TYPE_LABEL[e.expenseBasisType]}</div>
                    {e.expenseBasisRef && <div className="text-slate-500">{e.expenseBasisRef}</div>}
                  </Td>
                  <Td>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ring-1 ${STATUS_PILL[e.status]}`}>
                      {EXPENSE_STATUS_LABEL[e.status]}
                    </span>
                  </Td>
                  <Td className="text-xs text-slate-500">
                    <div className="truncate max-w-[10rem]" title={e.createdByName}>{e.createdByName}</div>
                    <div>{tsLabel(e.createdAt)}</div>
                  </Td>
                  {canMutate && (
                    <Td className="pr-5">
                      {e.status === 'draft' && (
                        <div className="flex items-center justify-end gap-1.5">
                          <ActionBtn icon={<Pencil size={12} />} label="Sửa" onClick={() => onEdit(e)} disabled={pendingId === e.id} />
                          <ActionBtn icon={<CheckCircle size={12} />} label="Ghi nhận" tone="primary" onClick={() => handleRecord(e)} disabled={pendingId === e.id} />
                          <ActionBtn icon={<Trash2 size={12} />} label="Xoá" tone="danger" onClick={() => handleDelete(e)} disabled={pendingId === e.id} />
                        </div>
                      )}
                      {e.status === 'returned' && (
                        <div className="flex items-center justify-end gap-1.5">
                          <ActionBtn icon={<Pencil size={12} />} label="Sửa" onClick={() => onEdit(e)} disabled={pendingId === e.id} />
                          <ActionBtn icon={<CheckCircle size={12} />} label="Ghi nhận" tone="primary" onClick={() => handleRecord(e)} disabled={pendingId === e.id} />
                        </div>
                      )}
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`text-left font-medium py-2 px-2 ${className}`}>{children}</th>;
}
function Td({ children, className = '' }: { children: React.ReactNode; className?: string; title?: string }) {
  return <td className={`py-2 px-2 ${className}`}>{children}</td>;
}
function ActionBtn({ icon, label, onClick, disabled, tone = 'ghost' }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; tone?: 'ghost' | 'primary' | 'danger' }) {
  const cls = tone === 'primary'
    ? 'text-emerald-700 hover:bg-emerald-50'
    : tone === 'danger'
    ? 'text-rose-600 hover:bg-rose-50'
    : 'text-slate-600 hover:bg-slate-100';
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded transition disabled:opacity-50 ${cls}`}>
      {icon}{label}
    </button>
  );
}
