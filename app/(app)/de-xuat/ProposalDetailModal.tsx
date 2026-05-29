'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Loader2, Send, Trash2, CheckCircle2, XCircle, AlertTriangle, ArrowRight, FileText, User, Calendar, DollarSign, Hash } from 'lucide-react';
import {
  proposalsApi,
  PROPOSAL_CATEGORY_LABEL, PROPOSAL_STATUS_LABEL,
  type Proposal,
} from '@/lib/services/proposals/api-client';
import { ApproveProposalModal } from './ApproveProposalModal';

interface Department { id: string; name: string; blockId: 'KD' | 'VP' | null; }
interface Branch { id: string; name: string; }
interface User { id: string; name: string; roleId: string; branchId: string | null; departmentId: string | null; }

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700 ring-slate-200',
  submitted: 'bg-amber-50 text-amber-700 ring-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 ring-rose-200',
};

export function ProposalDetailModal(props: {
  proposalId: string;
  currentUserId: string;
  currentUserRole: string;
  departments: Department[];
  branches: Branch[];
  users: User[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const router = useRouter();
  const { proposalId, currentUserId, currentUserRole, departments, branches, users, onClose, onChanged } = props;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Proposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'submit' | 'delete' | 'reject' | null>(null);
  const [showApprove, setShowApprove] = useState(false);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const p = await proposalsApi.get(proposalId);
      setData(p);
    } catch (e: any) {
      setError(e.message ?? 'Không tải được đề xuất');
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [proposalId]);

  const isCreator = data?.creatorId === currentUserId;
  const isAdminSystem = currentUserRole === 'ADMIN';
  const isCEO = currentUserRole === 'CEO' || currentUserRole === 'ADMIN';
  const isApproverRole = data?.approverRole === currentUserRole;
  const canDecide = !!data && data.status === 'submitted' && !isCreator && (isAdminSystem || isCEO || isApproverRole);
  const canSubmit = !!data && data.status === 'draft' && (isCreator || isAdminSystem);
  const canDelete = !!data && data.status === 'draft' && (isCreator || isAdminSystem);

  const deptName = (id: string | null) => id ? departments.find((d) => d.id === id)?.name ?? id : '—';
  const branchName = (id: string | null) => id ? branches.find((b) => b.id === id)?.name ?? id : '—';

  async function handleSubmit() {
    if (!data) return;
    setBusy('submit');
    try { await proposalsApi.submit(data.id); await load(); onChanged(); setSuccessMsg('Đã gửi duyệt.'); }
    catch (e: any) { setError(e.message); } finally { setBusy(null); }
  }
  async function handleDelete() {
    if (!data) return;
    if (!confirm('Xoá đề xuất nháp này?')) return;
    setBusy('delete');
    try { await proposalsApi.remove(data.id); onChanged(); onClose(); }
    catch (e: any) { setError(e.message); setBusy(null); }
  }
  async function handleReject() {
    if (!data) return;
    const r = rejectReason.trim();
    if (!r) { setError('Phải nhập lý do từ chối.'); return; }
    setBusy('reject');
    try { await proposalsApi.reject(data.id, r); await load(); onChanged(); setRejectMode(false); setSuccessMsg('Đã từ chối đề xuất.'); }
    catch (e: any) { setError(e.message); } finally { setBusy(null); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <FileText size={18} className="text-emerald-600" />
              <span className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Đề xuất</span>
              {data && (
                <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-md ring-1 ring-inset ${STATUS_BADGE[data.status]}`}>
                  {PROPOSAL_STATUS_LABEL[data.status]}
                </span>
              )}
            </div>
            <h2 className="font-bold text-slate-800 text-lg truncate">{data?.title ?? 'Đang tải…'}</h2>
            <div className="text-xs text-slate-500 mt-0.5 font-mono">#{proposalId.slice(0, 12)}</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 mt-0.5"><X size={22} /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="space-y-3">
              <div className="h-4 bg-slate-100 rounded animate-pulse w-3/4" />
              <div className="h-4 bg-slate-100 rounded animate-pulse w-1/2" />
              <div className="h-20 bg-slate-100 rounded animate-pulse" />
            </div>
          ) : !data ? (
            <div className="text-center text-rose-600 py-8">{error ?? 'Không tải được đề xuất'}</div>
          ) : (
            <>
              {error && (
                <div className="flex items-start gap-2 mb-4 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" /> <span>{error}</span>
                </div>
              )}
              {successMsg && (
                <div className="flex items-start gap-2 mb-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" /> <span>{successMsg}</span>
                </div>
              )}

              {/* Meta grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                <Stat icon={<User size={14} />} label="Người tạo" value={data.creatorName} sub={data.creatorRole} />
                <Stat icon={<Hash size={14} />} label="Loại" value={PROPOSAL_CATEGORY_LABEL[data.category]} sub={data.block === 'all' ? 'Toàn HT' : `Khối ${data.block}`} />
                <Stat icon={<Calendar size={14} />} label="Tạo lúc" value={new Date(data.createdAt).toLocaleDateString('vi-VN')} sub={new Date(data.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} />
                <Stat icon={<DollarSign size={14} />} label="Chi phí dự kiến" value={data.estimatedCost != null ? `${data.estimatedCost.toLocaleString('vi-VN')}₫` : '—'} sub="" />
              </div>

              <div className="grid grid-cols-2 gap-3 mb-5">
                <Stat icon={<span className="font-bold">CS</span>} label="Cơ sở" value={branchName(data.branchId)} sub="" />
                <Stat icon={<span className="font-bold">PB</span>} label="Phòng ban" value={deptName(data.departmentId)} sub="" />
              </div>

              {/* Description */}
              <section className="mb-5">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Nội dung</div>
                <div className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-lg p-3 border border-slate-200">
                  {data.description || <span className="text-slate-400 italic">Không có mô tả chi tiết.</span>}
                </div>
              </section>

              {/* Approver info */}
              <section className="mb-5">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Người duyệt</div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                  <div className="text-slate-700">
                    <strong>Vai trò:</strong> {data.approverRole}
                  </div>
                  {data.approverName && (
                    <div className="text-slate-700 mt-1">
                      <strong>Người đã duyệt:</strong> {data.approverName}
                      {data.decidedAt && <span className="text-xs text-slate-500 ml-2">· {new Date(data.decidedAt).toLocaleString('vi-VN')}</span>}
                    </div>
                  )}
                  {data.approverNotes && <div className="text-xs italic text-slate-600 mt-1">Ghi chú: "{data.approverNotes}"</div>}
                </div>
              </section>

              {/* Outcome */}
              {data.status === 'approved' && data.generatedTaskId && (
                <section className="mb-5">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Kết quả</div>
                  <a
                    href={`/giao-viec?taskId=${data.generatedTaskId}`}
                    className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm hover:bg-emerald-100 transition-colors"
                  >
                    <CheckCircle2 size={18} className="text-emerald-600" />
                    <div className="flex-1">
                      <div className="font-semibold text-emerald-800">Đã tạo nhiệm vụ thực hiện</div>
                      <div className="text-xs text-emerald-600 font-mono">#{data.generatedTaskId.slice(0, 12)}</div>
                    </div>
                    <ArrowRight size={16} className="text-emerald-600" />
                  </a>
                </section>
              )}
              {data.status === 'rejected' && data.rejectedReason && (
                <section className="mb-5">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Lý do từ chối</div>
                  <div className="text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-3 italic">
                    "{data.rejectedReason}"
                  </div>
                </section>
              )}

              {/* Reject form inline */}
              {rejectMode && (
                <section className="mb-5">
                  <div className="text-xs font-bold text-rose-600 uppercase tracking-wide mb-2">Lý do từ chối</div>
                  <textarea
                    value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} maxLength={1000}
                    className="w-full px-3 py-2 text-sm border border-rose-300 rounded-md focus:outline-none focus:ring-2 focus:ring-rose-500"
                    placeholder="Vui lòng nhập lý do để người đề xuất hiểu rõ…"
                  />
                  <div className="flex gap-2 mt-2 justify-end">
                    <button onClick={() => setRejectMode(false)} className="px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 rounded-md">Hủy</button>
                    <button
                      onClick={handleReject} disabled={busy === 'reject' || !rejectReason.trim()}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-rose-600 text-white text-sm font-semibold rounded-md hover:bg-rose-700 disabled:opacity-50"
                    >
                      {busy === 'reject' ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                      Xác nhận từ chối
                    </button>
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        {/* Footer actions */}
        {data && !rejectMode && (
          <div className="flex items-center justify-between gap-2 px-6 py-3 border-t border-slate-200 bg-slate-50">
            <div className="flex gap-2">
              {canDelete && (
                <button
                  onClick={handleDelete} disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-100 rounded-md disabled:opacity-50"
                >
                  {busy === 'delete' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Xoá nháp
                </button>
              )}
            </div>
            <div className="flex gap-2">
              {canSubmit && (
                <button
                  onClick={handleSubmit} disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 text-white text-sm font-semibold rounded-md hover:bg-emerald-700 disabled:opacity-50 shadow-sm"
                >
                  {busy === 'submit' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Gửi duyệt
                </button>
              )}
              {canDecide && (
                <>
                  <button
                    onClick={() => setRejectMode(true)} disabled={busy !== null}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-100 rounded-md font-semibold disabled:opacity-50"
                  >
                    <XCircle size={14} /> Từ chối
                  </button>
                  <button
                    onClick={() => setShowApprove(true)} disabled={busy !== null}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 text-white text-sm font-semibold rounded-md hover:bg-emerald-700 disabled:opacity-50 shadow-sm"
                  >
                    <CheckCircle2 size={14} /> Duyệt & Giao việc
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {showApprove && data && (
        <ApproveProposalModal
          proposal={data}
          departments={departments}
          branches={branches}
          users={users}
          onClose={() => setShowApprove(false)}
          onApproved={(taskId, warning) => {
            setShowApprove(false);
            setSuccessMsg(`Đã duyệt + tạo nhiệm vụ #${taskId.slice(0, 8)}.${warning ? ' ' + warning : ''}`);
            void load();
            onChanged();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
      <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
        <span className="text-slate-400">{icon}</span> {label}
      </div>
      <div className="text-sm font-semibold text-slate-800 truncate">{value}</div>
      {sub && <div className="text-xs text-slate-500 truncate">{sub}</div>}
    </div>
  );
}
