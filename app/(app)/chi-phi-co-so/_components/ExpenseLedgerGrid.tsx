'use client';

// PR-CASH1C-GRID (2026-06-23) — Bảng sổ chi kế toán theo dòng.
//
// Inline-editable, auto-add row sau khi save/record thành công, focus chuyển sang dòng mới.
// Mỗi dòng = 1 phiếu chi. Server draft/returned editable. Server recorded/voided read-only.
// Local row chưa tạo Firestore doc cho đến khi user click Lưu/Ghi nhận.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Save, CheckCircle, Trash2, RefreshCw, AlertCircle, Loader2 } from 'lucide-react';
import type { BranchId } from '@/lib/branches';
import {
  EXPENSE_PAYMENT_METHOD_LABEL,
  EXPENSE_CATEGORY_LABEL,
  EXPENSE_BASIS_TYPE_LABEL,
  EXPENSE_STATUS_LABEL,
  type ExpensePaymentMethod,
  type ExpenseCategory,
  type ExpenseBasisType,
  type ExpenseStatus,
} from '@/lib/finance/expense-types';
import type { ExpenseDoc } from '@/lib/services/finance/api-client';
import {
  createExpense,
  updateExpense,
  recordExpense,
  deleteDraftExpense,
} from '@/lib/services/finance/api-client';

interface Props {
  date: string;
  branchId: BranchId;
  branchName: string;
  expenses: ExpenseDoc[];
  loading: boolean;
  error: string | null;
  canEdit: boolean;
  onRefresh: () => void;
  onChanged: () => void;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

const PAYMENT_METHODS: ExpensePaymentMethod[] = ['cash', 'transfer', 'card', 'other'];
const CATEGORIES = Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[];
const BASIS_TYPES = Object.keys(EXPENSE_BASIS_TYPE_LABEL) as ExpenseBasisType[];

interface EditableFields {
  voucherNo: string;
  date: string;
  description: string;
  amount: string;     // input string
  counterpartyName: string;
  counterpartyUnit: string;
  counterpartyAddress: string;
  expenseBasisRef: string;
  expenseBasisType: ExpenseBasisType;
  paymentMethod: ExpensePaymentMethod;
  expenseCategory: ExpenseCategory;
  note: string;
}

interface RowState {
  kind: 'server' | 'local';
  id: string;                       // doc.id (server) hoặc local-N
  serverDoc?: ExpenseDoc;
  draft: EditableFields;
  busy: null | 'draft' | 'record' | 'delete' | 'update';
  error: string | null;
}

function emptyDraft(date: string): EditableFields {
  return {
    voucherNo: '', date, description: '', amount: '',
    counterpartyName: '', counterpartyUnit: '', counterpartyAddress: '',
    expenseBasisRef: '',
    expenseBasisType: 'direct_invoice',
    paymentMethod: 'cash',
    expenseCategory: 'khac',
    note: '',
  };
}

function draftFromDoc(d: ExpenseDoc): EditableFields {
  return {
    voucherNo: d.voucherNo ?? '',
    date: d.date ?? '',
    description: d.description ?? '',
    amount: String(d.amount ?? ''),
    counterpartyName: d.counterpartyName ?? '',
    counterpartyUnit: d.counterpartyUnit ?? '',
    counterpartyAddress: d.counterpartyAddress ?? '',
    expenseBasisRef: d.expenseBasisRef ?? '',
    expenseBasisType: d.expenseBasisType,
    paymentMethod: d.paymentMethod,
    expenseCategory: d.expenseCategory,
    note: d.note ?? '',
  };
}

function validateForRecord(d: EditableFields): string | null {
  if (!d.voucherNo.trim()) return 'Thiếu số chứng từ';
  if (!d.description.trim()) return 'Thiếu diễn giải';
  const amt = Number(d.amount);
  if (!Number.isFinite(amt) || amt <= 0) return 'Số tiền > 0';
  if (!d.counterpartyName.trim()) return 'Thiếu người giao dịch';
  return null;
}

function validateForDraft(d: EditableFields): string | null {
  if (!d.voucherNo.trim() && !d.description.trim()) return 'Tối thiểu cần Số CT hoặc Diễn giải';
  return null;
}

function isEditable(row: RowState): boolean {
  if (row.kind === 'local') return true;
  const s = row.serverDoc!.status as ExpenseStatus;
  return s === 'draft' || s === 'returned';
}

function fmt(n: number): string { return n.toLocaleString('vi-VN'); }

const STATUS_PILL: Record<ExpenseStatus, string> = {
  draft:    'bg-slate-100 text-slate-700 ring-slate-200',
  recorded: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  returned: 'bg-rose-50 text-rose-700 ring-rose-200',
  voided:   'bg-slate-100 text-slate-500 ring-slate-200 line-through',
};

let localIdSeq = 0;
function nextLocalId(): string { localIdSeq += 1; return `local-${localIdSeq}`; }

export function ExpenseLedgerGrid({
  date, branchId, branchName, expenses, loading, error,
  canEdit, onRefresh, onChanged, onError, onSuccess,
}: Props) {
  const [rows, setRows] = useState<RowState[]>([]);
  const newRowFocusRef = useRef<HTMLInputElement | null>(null);
  const pendingFocusLocalIdRef = useRef<string | null>(null);

  // Sync server data → state rows. Preserve local rows chưa save (chỉ khi canEdit).
  useEffect(() => {
    setRows((prev) => {
      const serverRows: RowState[] = expenses.map((d) => ({
        kind: 'server' as const,
        id: d.id,
        serverDoc: d,
        draft: draftFromDoc(d),
        busy: null,
        error: null,
      }));
      // PR-CASH1F: khi canEdit=false (view-only hoặc locked) → KHÔNG giữ local rows.
      const keptLocal = canEdit ? prev.filter((r) => r.kind === 'local') : [];
      // Đảm bảo luôn có ít nhất 1 dòng local trống ở cuối (nếu canEdit).
      const trailing: RowState[] = (canEdit && (keptLocal.length === 0 || keptLocal.some((r) => r.busy !== null || r.error !== null)))
        ? [{ kind: 'local', id: nextLocalId(), draft: emptyDraft(date), busy: null, error: null }]
        : [];
      const localsToKeep = keptLocal.length > 0 ? keptLocal : trailing;
      const finalLocals = (canEdit && localsToKeep.every((r) => !!r.draft.voucherNo || !!r.draft.description || !!r.draft.amount))
        ? [...localsToKeep, { kind: 'local' as const, id: nextLocalId(), draft: emptyDraft(date), busy: null, error: null }]
        : localsToKeep;
      return [...serverRows, ...finalLocals];
    });
  }, [expenses, canEdit, date]);

  // After state change, focus new empty row if requested.
  useEffect(() => {
    if (pendingFocusLocalIdRef.current && newRowFocusRef.current) {
      newRowFocusRef.current.focus();
      pendingFocusLocalIdRef.current = null;
    }
  }, [rows]);

  function updateRowDraft(id: string, patch: Partial<EditableFields>) {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, draft: { ...r.draft, ...patch }, error: null } : r));
  }

  function setRowBusy(id: string, busy: RowState['busy']) {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, busy } : r));
  }

  function setRowError(id: string, error: string | null) {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, error, busy: null } : r));
  }

  function addEmptyRowAndFocus() {
    const newId = nextLocalId();
    pendingFocusLocalIdRef.current = newId;
    setRows((prev) => [...prev, { kind: 'local', id: newId, draft: emptyDraft(date), busy: null, error: null }]);
  }

  const ensureTrailingEmptyLocal = useCallback(() => {
    setRows((prev) => {
      const lastLocals = prev.filter((r) => r.kind === 'local');
      const hasEmpty = lastLocals.some((r) =>
        !r.draft.voucherNo && !r.draft.description && !r.draft.amount && !r.error,
      );
      if (hasEmpty) return prev;
      const newId = nextLocalId();
      pendingFocusLocalIdRef.current = newId;
      return [...prev, { kind: 'local', id: newId, draft: emptyDraft(date), busy: null, error: null }];
    });
  }, [date]);

  async function handleSave(row: RowState, action: 'draft' | 'record') {
    const validator = action === 'record' ? validateForRecord : validateForDraft;
    const err = validator(row.draft);
    if (err) { setRowError(row.id, err); return; }
    setRowBusy(row.id, action);

    try {
      if (row.kind === 'local') {
        // CREATE
        await createExpense({
          voucherNo: row.draft.voucherNo.trim(),
          date: row.draft.date,
          branchId,
          description: row.draft.description.trim(),
          amount: Number(row.draft.amount),
          paymentMethod: row.draft.paymentMethod,
          expenseCategory: row.draft.expenseCategory,
          counterpartyName: row.draft.counterpartyName.trim(),
          counterpartyUnit: row.draft.counterpartyUnit.trim() || null,
          counterpartyAddress: row.draft.counterpartyAddress.trim() || null,
          expenseBasisType: row.draft.expenseBasisType,
          expenseBasisRef: row.draft.expenseBasisRef.trim() || null,
          note: row.draft.note.trim() || null,
          action,
        });
        onSuccess(action === 'record' ? 'Đã ghi nhận chi' : 'Đã lưu nháp');
        onChanged();   // reload server list — useEffect sẽ map lại rows
        ensureTrailingEmptyLocal();
      } else {
        // UPDATE existing draft/returned (and optionally record)
        const id = row.id;
        await updateExpense(id, {
          description: row.draft.description.trim(),
          amount: Number(row.draft.amount),
          paymentMethod: row.draft.paymentMethod,
          expenseCategory: row.draft.expenseCategory,
          counterpartyName: row.draft.counterpartyName.trim(),
          counterpartyUnit: row.draft.counterpartyUnit.trim() || null,
          counterpartyAddress: row.draft.counterpartyAddress.trim() || null,
          expenseBasisType: row.draft.expenseBasisType,
          expenseBasisRef: row.draft.expenseBasisRef.trim() || null,
          note: row.draft.note.trim() || null,
        });
        if (action === 'record') {
          await recordExpense(id);
        }
        onSuccess(action === 'record' ? 'Đã ghi nhận chi' : 'Đã cập nhật');
        onChanged();
        if (action === 'record') ensureTrailingEmptyLocal();
      }
    } catch (e: any) {
      const msg = String(e?.message ?? 'Lỗi lưu phiếu chi');
      setRowError(row.id, msg);
      onError(msg);
    } finally {
      setRowBusy(row.id, null);
    }
  }

  async function handleDeleteDraft(row: RowState) {
    if (row.kind === 'local') {
      // Just remove from local state
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      // Ensure still has a trailing empty
      ensureTrailingEmptyLocal();
      return;
    }
    if (row.serverDoc?.status !== 'draft') return;
    if (!confirm(`Xoá phiếu chi nháp "${row.draft.voucherNo}"?`)) return;
    setRowBusy(row.id, 'delete');
    try {
      await deleteDraftExpense(row.id);
      onSuccess('Đã xoá nháp');
      onChanged();
    } catch (e: any) {
      setRowError(row.id, String(e?.message ?? 'Lỗi xoá'));
    } finally {
      setRowBusy(row.id, null);
    }
  }

  // Compute totals from server recorded rows (KHÔNG tính local).
  const totals = useMemo(() => {
    const byMethod = { cash: 0, transfer: 0, card: 0, other: 0, total: 0 };
    const byStatus: Record<ExpenseStatus, number> = { draft: 0, recorded: 0, returned: 0, voided: 0 };
    for (const e of expenses) {
      byStatus[e.status] += 1;
      if (e.status === 'recorded') {
        byMethod[e.paymentMethod] += e.amount;
        byMethod.total += e.amount;
      }
    }
    return { byMethod, byStatus };
  }, [expenses]);

  // ─── Render ─────────────────────────────────────────────────────
  return (
    <div className="card">
      {/* Toolbar */}
      <div className="card-title">
        <span>Bảng chi phí cơ sở — Sổ chi ngày {date} · {branchId} ({branchName})</span>
        <div className="ml-auto flex items-center gap-2">
          {canEdit && (
            <button type="button" onClick={addEmptyRowAndFocus} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded">
              <Plus size={12} /> Thêm dòng
            </button>
          )}
          <button type="button" onClick={onRefresh} disabled={loading} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 disabled:opacity-50 px-2 py-1 rounded">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Làm mới
          </button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2 ring-1 ring-rose-200 mb-3">{error}</div>
      )}

      <div className="overflow-x-auto -mx-5 border-t border-slate-200">
        <table className="w-full text-xs min-w-[1500px]">
          {/* Header 2-tier */}
          <thead className="sticky top-0 bg-slate-50 z-10 text-slate-600 border-b-2 border-slate-200">
            <tr>
              <Th rowSpan={2} className="w-10 text-center">#</Th>
              <Th colSpan={2} className="text-center bg-slate-100">Chứng từ</Th>
              <Th colSpan={2} className="text-center bg-slate-50">Nội dung & Số tiền</Th>
              <Th colSpan={3} className="text-center bg-slate-100">Người giao dịch</Th>
              <Th colSpan={2} className="text-center bg-slate-50">Chứng từ kèm theo</Th>
              <Th colSpan={4} className="text-center bg-slate-100">Quản lý</Th>
              {canEdit && <Th rowSpan={2} className="text-right pr-5 w-44">Thao tác</Th>}
            </tr>
            <tr className="text-xs uppercase tracking-wide">
              <Th className="w-32 bg-slate-100">Số CT</Th>
              <Th className="w-28 bg-slate-100">Ngày</Th>
              <Th className="w-64 bg-slate-50">Diễn giải</Th>
              <Th className="w-28 text-right bg-slate-50">Số tiền</Th>
              <Th className="w-40 bg-slate-100">Họ và tên</Th>
              <Th className="w-32 bg-slate-100">Đơn vị</Th>
              <Th className="w-40 bg-slate-100">Địa chỉ</Th>
              <Th className="w-32 bg-slate-50">Kèm theo</Th>
              <Th className="w-44 bg-slate-50">Loại căn cứ</Th>
              <Th className="w-28 bg-slate-100">PT chi</Th>
              <Th className="w-32 bg-slate-100">Nhóm chi</Th>
              <Th className="w-28 bg-slate-100">Trạng thái</Th>
              <Th className="w-0 bg-slate-100"></Th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row, idx) => {
              const editable = canEdit && isEditable(row);
              const status: ExpenseStatus = row.kind === 'server' ? row.serverDoc!.status : 'draft';
              const isLastLocal = canEdit && row.kind === 'local' && idx === rows.length - 1;
              const setFocusRef = (el: HTMLInputElement | null) => {
                if (isLastLocal && pendingFocusLocalIdRef.current === row.id) {
                  newRowFocusRef.current = el;
                }
              };
              return (
                <tr key={row.id} className={[
                  'border-b border-slate-100 align-top',
                  row.kind === 'local' ? 'bg-emerald-50/30' : '',
                  row.error ? 'bg-rose-50/40' : '',
                  row.busy ? 'opacity-70' : '',
                ].join(' ')}>
                  <Td className="text-center text-slate-500 pl-3 pt-3">{idx + 1}</Td>

                  {/* Số CT */}
                  <Td className="pt-1">
                    <Input
                      value={row.draft.voucherNo}
                      onChange={(v) => updateRowDraft(row.id, { voucherNo: v })}
                      disabled={!editable || row.kind === 'server'}    // không cho sửa voucherNo của server (unique key)
                      placeholder="PC-2026-…"
                      inputRef={setFocusRef}
                    />
                  </Td>

                  {/* Ngày */}
                  <Td className="pt-1">
                    <Input
                      type="date"
                      value={row.draft.date}
                      onChange={(v) => updateRowDraft(row.id, { date: v })}
                      disabled={!editable || row.kind === 'server'}
                    />
                  </Td>

                  {/* Diễn giải */}
                  <Td className="pt-1">
                    <Input
                      value={row.draft.description}
                      onChange={(v) => updateRowDraft(row.id, { description: v })}
                      disabled={!editable}
                      placeholder="Mua hoá chất xử lý nước"
                    />
                  </Td>

                  {/* Số tiền */}
                  <Td className="pt-1 text-right">
                    {editable ? (
                      <Input
                        type="number"
                        value={row.draft.amount}
                        onChange={(v) => updateRowDraft(row.id, { amount: v })}
                        className="text-right tabular-nums"
                        placeholder="0"
                      />
                    ) : (
                      <span className="px-2 py-1 inline-block text-right tabular-nums">{fmt(Number(row.draft.amount))} ₫</span>
                    )}
                  </Td>

                  {/* Họ và tên */}
                  <Td className="pt-1">
                    <Input
                      value={row.draft.counterpartyName}
                      onChange={(v) => updateRowDraft(row.id, { counterpartyName: v })}
                      disabled={!editable}
                      placeholder="Cty TNHH …"
                    />
                  </Td>

                  {/* Đơn vị */}
                  <Td className="pt-1">
                    <Input
                      value={row.draft.counterpartyUnit}
                      onChange={(v) => updateRowDraft(row.id, { counterpartyUnit: v })}
                      disabled={!editable}
                    />
                  </Td>

                  {/* Địa chỉ */}
                  <Td className="pt-1">
                    <Input
                      value={row.draft.counterpartyAddress}
                      onChange={(v) => updateRowDraft(row.id, { counterpartyAddress: v })}
                      disabled={!editable}
                    />
                  </Td>

                  {/* Kèm theo */}
                  <Td className="pt-1">
                    <Input
                      value={row.draft.expenseBasisRef}
                      onChange={(v) => updateRowDraft(row.id, { expenseBasisRef: v })}
                      disabled={!editable}
                      placeholder="HĐ-1234"
                    />
                  </Td>

                  {/* Loại căn cứ */}
                  <Td className="pt-1">
                    <Select
                      value={row.draft.expenseBasisType}
                      onChange={(v) => updateRowDraft(row.id, { expenseBasisType: v as ExpenseBasisType })}
                      disabled={!editable}
                      options={BASIS_TYPES.map((b) => ({ value: b, label: EXPENSE_BASIS_TYPE_LABEL[b] }))}
                    />
                  </Td>

                  {/* PT chi */}
                  <Td className="pt-1">
                    <Select
                      value={row.draft.paymentMethod}
                      onChange={(v) => updateRowDraft(row.id, { paymentMethod: v as ExpensePaymentMethod })}
                      disabled={!editable}
                      options={PAYMENT_METHODS.map((m) => ({ value: m, label: EXPENSE_PAYMENT_METHOD_LABEL[m] }))}
                    />
                  </Td>

                  {/* Nhóm chi */}
                  <Td className="pt-1">
                    <Select
                      value={row.draft.expenseCategory}
                      onChange={(v) => updateRowDraft(row.id, { expenseCategory: v as ExpenseCategory })}
                      disabled={!editable}
                      options={CATEGORIES.map((c) => ({ value: c, label: EXPENSE_CATEGORY_LABEL[c] }))}
                    />
                  </Td>

                  {/* Trạng thái */}
                  <Td className="pt-2">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ring-1 ${STATUS_PILL[status]}`}>
                      {row.kind === 'local' ? 'Mới' : EXPENSE_STATUS_LABEL[status]}
                    </span>
                  </Td>

                  {/* Thao tác */}
                  {canEdit && (
                    <Td className="pt-1 pr-5 text-right">
                      {row.busy && (
                        <span className="inline-flex items-center gap-1 text-slate-500 text-xs">
                          <Loader2 size={12} className="animate-spin" /> Đang xử lý…
                        </span>
                      )}
                      {!row.busy && editable && (
                        <div className="flex flex-wrap justify-end gap-1">
                          <ActionBtn icon={<Save size={12} />} label="Lưu nháp" onClick={() => handleSave(row, 'draft')} />
                          <ActionBtn icon={<CheckCircle size={12} />} label="Ghi nhận" tone="primary" onClick={() => handleSave(row, 'record')} />
                          <ActionBtn icon={<Trash2 size={12} />} label="Xoá" tone="danger" onClick={() => handleDeleteDraft(row)} />
                        </div>
                      )}
                      {!row.busy && !editable && row.kind === 'server' && (
                        <span className="text-slate-400 text-xs">{EXPENSE_STATUS_LABEL[status]}</span>
                      )}
                      {row.error && (
                        <div className="mt-1 text-xs text-rose-600 flex items-start gap-1 justify-end max-w-[220px] ml-auto text-right">
                          <AlertCircle size={12} className="shrink-0 mt-0.5" /><span>{row.error}</span>
                        </div>
                      )}
                    </Td>
                  )}
                </tr>
              );
            })}

            {/* Footer totals row */}
            <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-700 sticky bottom-0">
              <Td className="text-right pr-2" colSpan={2}>TỔNG (chỉ tính đã ghi nhận):</Td>
              <Td className="text-xs">{totals.byStatus.recorded} phiếu</Td>
              <Td className="text-xs">{date}</Td>
              <Td className="text-right tabular-nums text-emerald-700">{fmt(totals.byMethod.total)} ₫</Td>
              <Td colSpan={5} className="text-xs text-slate-500">
                Tiền mặt {fmt(totals.byMethod.cash)} · CK {fmt(totals.byMethod.transfer)} · Thẻ {fmt(totals.byMethod.card)}
                {totals.byMethod.other > 0 && ` · Khác ${fmt(totals.byMethod.other)}`}
              </Td>
              <Td colSpan={canEdit ? 4 : 3} className="text-xs text-slate-500">
                Nháp {totals.byStatus.draft} · Trả lại {totals.byStatus.returned} · Huỷ {totals.byStatus.voided}
              </Td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────

function Th({ children, className = '', colSpan, rowSpan }: { children?: React.ReactNode; className?: string; colSpan?: number; rowSpan?: number }) {
  return <th colSpan={colSpan} rowSpan={rowSpan} className={`text-left font-semibold py-2 px-2 ${className}`}>{children}</th>;
}

function Td({ children, className = '', colSpan }: { children: React.ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={`px-2 py-1 ${className}`}>{children}</td>;
}

function Input({ value, onChange, disabled, placeholder, type = 'text', className = '', inputRef }: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  type?: string;
  className?: string;
  inputRef?: (el: HTMLInputElement | null) => void;
}) {
  return (
    <input
      ref={inputRef}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      className={`w-full h-8 px-2 text-xs rounded ring-1 ring-slate-200 focus:ring-2 focus:ring-emerald-400 focus:outline-none disabled:bg-transparent disabled:ring-0 disabled:cursor-default ${className}`}
    />
  );
}

function Select({ value, onChange, disabled, options }: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full h-8 px-2 text-xs rounded ring-1 ring-slate-200 focus:ring-2 focus:ring-emerald-400 focus:outline-none disabled:bg-transparent disabled:ring-0 disabled:cursor-default"
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function ActionBtn({ icon, label, onClick, tone = 'ghost' }: { icon: React.ReactNode; label: string; onClick: () => void; tone?: 'ghost' | 'primary' | 'danger' }) {
  const cls = tone === 'primary'
    ? 'text-emerald-700 hover:bg-emerald-100 ring-emerald-200'
    : tone === 'danger'
    ? 'text-rose-600 hover:bg-rose-100 ring-rose-200'
    : 'text-slate-600 hover:bg-slate-100 ring-slate-200';
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded ring-1 transition ${cls}`}>
      {icon}{label}
    </button>
  );
}
