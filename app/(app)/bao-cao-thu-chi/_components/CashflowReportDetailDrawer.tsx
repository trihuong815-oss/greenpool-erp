'use client';

// PR-CASH1D: Detail drawer hiển thị 1 báo cáo thu-chi + 2 action TP_KE (Kiểm tra / Trả lại).

import { useEffect, useState } from 'react';
import { X, CheckCircle, RotateCcw, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { DailyCashflowReportDoc, DailyCashflowReportStatus } from '@/lib/finance/cashflow-report-types';
import { DAILY_CASHFLOW_REPORT_STATUS_LABEL, CASHFLOW_ALERT_LABEL } from '@/lib/finance/cashflow-report-types';
import { getCashflowReport, checkCashflowReport, returnCashflowReport } from '@/lib/services/finance/api-client';

interface Props {
  reportId: string;
  canCheckReturn: boolean;   // TP_KE only (server cũng enforce)
  onClose: () => void;
  onChanged: () => void;     // sau khi check/return → refresh list ngoài
  onError: (msg: string) => void;
}

const STATUS_PILL: Record<DailyCashflowReportStatus, string> = {
  draft:     'bg-slate-100 text-slate-700 ring-slate-200',
  submitted: 'bg-amber-50 text-amber-700 ring-amber-200',
  sent:      'bg-sky-50 text-sky-700 ring-sky-200',
  checked:   'bg-emerald-50 text-emerald-700 ring-emerald-200',
  returned:  'bg-rose-50 text-rose-700 ring-rose-200',
  locked:    'bg-violet-50 text-violet-700 ring-violet-200',
};

const CHECKABLE_STATUSES: ReadonlyArray<DailyCashflowReportStatus> = ['submitted', 'sent'];
const RETURNABLE_STATUSES: ReadonlyArray<DailyCashflowReportStatus> = ['submitted', 'sent', 'checked'];

function fmt(n: number): string { return n.toLocaleString('vi-VN'); }
function tsLabel(v: any): string {
  if (!v) return '';
  if (typeof v === 'string') return v.replace('T', ' ').slice(0, 16);
  if (v._seconds) return new Date(v._seconds * 1000).toLocaleString('vi-VN');
  if (v.seconds) return new Date(v.seconds * 1000).toLocaleString('vi-VN');
  try { return new Date(v).toLocaleString('vi-VN'); } catch { return ''; }
}

type ActionModal = null | 'check' | 'return';

export function CashflowReportDetailDrawer({ reportId, canCheckReturn, onClose, onChanged, onError }: Props) {
  const [data, setData] = useState<(DailyCashflowReportDoc & { id: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionModal, setActionModal] = useState<ActionModal>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getCashflowReport(reportId)
      .then((r) => { if (!cancelled) setData(r.report); })
      .catch((e) => { if (!cancelled) onError(e?.message ?? 'Lỗi tải báo cáo'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reportId, onError]);

  async function reload() {
    setLoading(true);
    try {
      const r = await getCashflowReport(reportId);
      setData(r.report);
    } catch (e: any) { onError(e?.message ?? 'Lỗi tải báo cáo'); }
    finally { setLoading(false); }
  }

  async function doCheck() {
    setActionBusy(true);
    try {
      await checkCashflowReport(reportId, note.trim() || undefined);
      setActionModal(null); setNote('');
      onChanged(); await reload();
    } catch (e: any) { onError(e?.message ?? 'Lỗi đánh dấu kiểm tra'); }
    finally { setActionBusy(false); }
  }

  async function doReturn() {
    if (!reason.trim()) { onError('Bắt buộc nhập lý do trả lại'); return; }
    setActionBusy(true);
    try {
      await returnCashflowReport(reportId, reason.trim());
      setActionModal(null); setReason('');
      onChanged(); await reload();
    } catch (e: any) { onError(e?.message ?? 'Lỗi trả lại báo cáo'); }
    finally { setActionBusy(false); }
  }

  const r = data;
  const showCheck = canCheckReturn && r && CHECKABLE_STATUSES.includes(r.status);
  const showReturn = canCheckReturn && r && RETURNABLE_STATUSES.includes(r.status);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-slate-900/40">
      <div className="w-full max-w-2xl bg-slate-50 overflow-y-auto shadow-xl">
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-5 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-slate-800 truncate">Báo cáo thu-chi {r?.date ?? ''} — {r?.branchId ?? ''}</div>
            <div className="text-xs text-slate-500 truncate">{r?.branchName ?? ''}</div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-800 p-1.5 rounded hover:bg-slate-100" aria-label="Đóng"><X size={18} /></button>
        </div>

        {loading && !r ? (
          <div className="p-10 text-center text-slate-500"><Loader2 className="inline-block animate-spin mr-2" size={16} /> Đang tải…</div>
        ) : !r ? (
          <div className="p-10 text-center text-slate-500">Không tải được báo cáo.</div>
        ) : (
          <div className="p-5 space-y-4">
            {/* Action bar */}
            {canCheckReturn && (
              <div className="card flex flex-wrap items-center justify-between gap-3 border-2 border-emerald-100">
                <div className="text-sm text-slate-700">
                  Bạn có quyền <strong>kiểm tra</strong> hoặc <strong>trả lại</strong> báo cáo này.
                </div>
                <div className="flex gap-2">
                  {showCheck && (
                    <Button variant="primary" size="sm" leftIcon={<CheckCircle size={14} />} onClick={() => setActionModal('check')}>
                      Đánh dấu đã kiểm tra
                    </Button>
                  )}
                  {showReturn && (
                    <Button variant="danger" size="sm" leftIcon={<RotateCcw size={14} />} onClick={() => setActionModal('return')}>
                      Trả lại để bổ sung
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Thông tin chung */}
            <div className="card">
              <div className="card-title"><span>Thông tin chung</span></div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <Info label="Mã báo cáo" value={<span className="font-mono text-xs break-all">{r.id}</span>} />
                <Info label="Phiên bản" value={`v${r.reportVersion}`} />
                <Info label="Trạng thái" value={<span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ring-1 ${STATUS_PILL[r.status]}`}>{DAILY_CASHFLOW_REPORT_STATUS_LABEL[r.status]}</span>} />
                <Info label="Người nộp" value={<>
                  <div className="font-medium">{r.submittedByName ?? '—'}</div>
                  <div className="text-xs text-slate-500">{tsLabel(r.submittedAt)}</div>
                </>} />
                <Info label="Đã gửi" value={r.sentAt ? tsLabel(r.sentAt) : '—'} />
                <Info label="Đã kiểm tra" value={r.checkedByName ? <>
                  <div className="font-medium">{r.checkedByName}</div>
                  <div className="text-xs text-slate-500">{tsLabel(r.checkedAt)}</div>
                </> : '—'} />
                {r.status === 'returned' && (
                  <Info className="md:col-span-3" label="Trả lại" value={<>
                    <div className="text-sm text-rose-700">{r.returnedByName ?? '—'} {r.returnedAt ? `lúc ${tsLabel(r.returnedAt)}` : ''}</div>
                    {r.returnReason && <div className="text-xs text-rose-700 mt-1">Lý do: {r.returnReason}</div>}
                  </>} />
                )}
                {r.checkNote && (
                  <Info className="md:col-span-3" label="Ghi chú kiểm tra" value={<span className="text-xs">{r.checkNote}</span>} />
                )}
              </div>
            </div>

            {/* Thu - Chi - Net */}
            <div className="card">
              <div className="card-title"><span>Tổng hợp Thu - Chi - Net</span></div>
              <div className="overflow-x-auto -mx-5">
                <table className="w-full text-sm">
                  <thead className="text-xs text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="text-left py-2 px-2 pl-5 font-medium">Phương thức</th>
                      <th className="text-right py-2 px-2 font-medium">Thu</th>
                      <th className="text-right py-2 px-2 font-medium">Chi</th>
                      <th className="text-right py-2 px-2 pr-5 font-medium">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    <CashRow label="Tiền mặt"     rev={r.revenueSource?.totalByMethod?.cash ?? 0}     exp={r.expense?.totalByMethod?.cash ?? 0}     net={r.net?.cash ?? 0} />
                    <CashRow label="Chuyển khoản" rev={r.revenueSource?.totalByMethod?.transfer ?? 0} exp={r.expense?.totalByMethod?.transfer ?? 0} net={r.net?.transfer ?? 0} />
                    <CashRow label="Quẹt thẻ"     rev={r.revenueSource?.totalByMethod?.card ?? 0}     exp={r.expense?.totalByMethod?.card ?? 0}     net={r.net?.card ?? 0} />
                    <CashRow label="Khác"         rev={0}                                              exp={r.expense?.totalByMethod?.other ?? 0}    net={r.net?.other ?? 0} dim={(r.expense?.totalByMethod?.other ?? 0) === 0} />
                    <tr className="border-t-2 border-slate-200 bg-slate-50/60 font-bold">
                      <td className="py-2 px-2 pl-5">Tổng</td>
                      <td className="py-2 px-2 text-right tabular-nums text-emerald-700">{fmt(r.revenueSource?.total ?? 0)} ₫</td>
                      <td className="py-2 px-2 text-right tabular-nums text-rose-700">{fmt(r.expense?.totalByMethod?.total ?? 0)} ₫</td>
                      <td className={`py-2 px-2 pr-5 text-right tabular-nums ${(r.net?.total ?? 0) < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{fmt(r.net?.total ?? 0)} ₫</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="text-xs text-slate-500 mt-2">
                Tổng {r.expense?.count ?? 0} phiếu chi đã ghi nhận. {r.expense?.returnedCount ? `${r.expense.returnedCount} phiếu bị trả lại. ` : ''}{r.expense?.voidedCount ? `${r.expense.voidedCount} phiếu đã huỷ.` : ''}
              </div>
            </div>

            {/* Alerts */}
            {Array.isArray(r.alerts) && r.alerts.length > 0 && (
              <div className="card">
                <div className="card-title"><AlertTriangle size={16} className="text-amber-600" /><span>Cảnh báo ({r.alerts.length})</span></div>
                <ul className="space-y-2">
                  {r.alerts.map((a, i) => (
                    <li key={i} className="text-xs px-3 py-2 rounded-lg ring-1 bg-amber-50 ring-amber-200 text-amber-800">
                      <span className="font-medium">{CASHFLOW_ALERT_LABEL[a.code] ?? a.code}</span>
                      {a.message && <span className="text-amber-700"> — {a.message}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Revisions */}
            {Array.isArray(r.revisions) && r.revisions.length > 0 && (
              <div className="card">
                <div className="card-title"><span>Lịch sử phiên bản ({r.revisions.length})</span></div>
                <ul className="text-xs space-y-2">
                  {r.revisions.map((rv, i) => (
                    <li key={i} className="border-b border-slate-100 pb-2 last:border-b-0">
                      <div className="font-medium text-slate-700">v{rv.reportVersion} — {rv.submittedByName ?? '—'}</div>
                      <div className="text-slate-500">{tsLabel(rv.submittedAt)}{rv.reason ? ` • ${rv.reason}` : ''}</div>
                      <div className="text-slate-500 mt-0.5 tabular-nums">
                        Thu: <span className="text-emerald-700">{fmt(rv.revenueSource?.total ?? 0)} ₫</span> ·
                        Chi: <span className="text-rose-700"> {fmt(rv.expense?.totalByMethod?.total ?? 0)} ₫</span> ·
                        Net: <span className={(rv.net?.total ?? 0) < 0 ? 'text-rose-700' : 'text-emerald-700'}> {fmt(rv.net?.total ?? 0)} ₫</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Distribution */}
            {r.sentTo && (
              <div className="card">
                <div className="card-title"><span>Đã gửi cho</span></div>
                <div className="text-xs text-slate-600 space-y-1">
                  <div>Thủ quỹ: <strong className="tabular-nums">{r.sentTo.treasurerUserIds?.length ?? 0}</strong></div>
                  <div>TP Kế toán: <strong className="tabular-nums">{r.sentTo.accountingManagerUserIds?.length ?? 0}</strong></div>
                  <div>Giám sát: <strong className="tabular-nums">{r.sentTo.supervisionUserIds?.length ?? 0}</strong></div>
                  <div>Ban Lãnh đạo: <strong className="tabular-nums">{r.sentTo.leadershipUserIds?.length ?? 0}</strong></div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action Modals */}
      {actionModal === 'check' && (
        <ActionModal title="Đánh dấu đã kiểm tra" tone="primary" busy={actionBusy} onClose={() => setActionModal(null)} onConfirm={doCheck} confirmLabel="Xác nhận đã kiểm tra">
          <p className="text-sm text-slate-600 mb-3">
            Bạn xác nhận đã kiểm tra báo cáo thu-chi này. Hành động không phải là duyệt chi —
            các phiếu chi đã ghi nhận vẫn giữ nguyên ở trạng thái cũ.
          </p>
          <label className="block text-xs font-medium text-slate-600 mb-1">Ghi chú (tuỳ chọn)</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Ghi chú nội bộ, tối đa 500 ký tự" maxLength={500} className="w-full text-sm px-3 py-2 rounded-lg ring-1 ring-slate-200 focus:ring-2 focus:ring-emerald-400 focus:outline-none" />
        </ActionModal>
      )}

      {actionModal === 'return' && (
        <ActionModal title="Trả lại để bổ sung" tone="danger" busy={actionBusy} onClose={() => setActionModal(null)} onConfirm={doReturn} confirmLabel="Trả lại báo cáo" confirmDisabled={!reason.trim()}>
          <p className="text-sm text-slate-600 mb-3">
            Báo cáo sẽ chuyển sang trạng thái <strong>Bị trả lại</strong>. Kế toán cơ sở cần bổ sung và nộp lại.
          </p>
          <label className="block text-xs font-medium text-slate-600 mb-1">Lý do trả lại <span className="text-rose-600">*</span></label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="VD: thiếu phiếu chi vật tư đã thanh toán; số liệu doanh thu chưa khớp..." maxLength={500} className="w-full text-sm px-3 py-2 rounded-lg ring-1 ring-rose-200 focus:ring-2 focus:ring-rose-400 focus:outline-none" />
        </ActionModal>
      )}
    </div>
  );
}

function Info({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={className ?? ''}>
      <div className="text-xs text-slate-500 mb-0.5">{label}</div>
      <div className="text-sm text-slate-800">{value}</div>
    </div>
  );
}

function CashRow({ label, rev, exp, net, dim }: { label: string; rev: number; exp: number; net: number; dim?: boolean }) {
  return (
    <tr className={`border-b border-slate-100 ${dim ? 'text-slate-400' : ''}`}>
      <td className="py-2 px-2 pl-5">{label}</td>
      <td className="py-2 px-2 text-right tabular-nums">{fmt(rev)} ₫</td>
      <td className="py-2 px-2 text-right tabular-nums">{fmt(exp)} ₫</td>
      <td className={`py-2 px-2 pr-5 text-right tabular-nums font-medium ${net < 0 ? 'text-rose-600' : net > 0 ? 'text-emerald-700' : ''}`}>{fmt(net)} ₫</td>
    </tr>
  );
}

interface ActionModalProps {
  title: string;
  tone: 'primary' | 'danger';
  busy: boolean;
  confirmLabel: string;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children: React.ReactNode;
}
function ActionModal({ title, tone, busy, confirmLabel, confirmDisabled, onConfirm, onClose, children }: ActionModalProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className={`rounded-lg p-2 ${tone === 'primary' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
            {tone === 'primary' ? <CheckCircle size={18} /> : <RotateCcw size={18} />}
          </div>
          <div className="text-sm font-bold text-slate-800">{title}</div>
        </div>
        {children}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>Huỷ</Button>
          <Button variant={tone} size="sm" loading={busy} disabled={!!confirmDisabled} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
