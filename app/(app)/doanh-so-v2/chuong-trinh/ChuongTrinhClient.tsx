'use client';

// V7 Promo (2026-06-18) — UI quản lý chương trình khuyến mãi.
//
// Layout:
//   Header: month picker + branch filter (top role) + status filter chip + nút "+ Tạo" (QLCS)
//   List card: 1 program / card với badge status + action buttons theo role
//   Modals: form tạo/sửa · drawer chi tiết · cấu hình mã · reject reason

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, Edit3, Send, CheckCircle2, XCircle,
  KeyRound, Pause, Play, Trash2, AlertCircle, Loader2, X,
} from 'lucide-react';
import { BRANCHES } from '@/lib/branches';
import type { BranchId } from '@/lib/branches';
import {
  PROMO_TYPE_LABEL, PROGRAM_STATUS_LABEL,
  type PromoType, type ProgramStatus, type SalesProgram,
} from '@/lib/types/sales-program';
import { showConfirm } from '@/components/ui/imperative-modal';

interface Props {
  callerUid: string;
  callerRole: string;
  callerBranch: string | null;
  callerName: string;
}

const STATUS_TONE: Record<ProgramStatus, string> = {
  draft: 'bg-slate-100 text-slate-700 ring-slate-200',
  pending_approval: 'bg-amber-50 text-amber-700 ring-amber-200',
  approved: 'bg-sky-50 text-sky-700 ring-sky-200',
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  paused: 'bg-orange-50 text-orange-700 ring-orange-200',
  rejected: 'bg-rose-50 text-rose-700 ring-rose-200',
  expired: 'bg-slate-50 text-slate-400 ring-slate-200',
};

const PROMO_TYPE_TONE: Record<PromoType, string> = {
  percent: 'bg-violet-50 text-violet-700 ring-violet-200',
  fixed_amount: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  bonus_sessions: 'bg-rose-50 text-rose-700 ring-rose-200',
  bonus_days: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
};

function currentMonthVN(): string {
  const ms = Date.now() + 7 * 3600 * 1000;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function fmtMonth(ym: string): string {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
  const [y, m] = ym.split('-');
  return `${m}/${y}`;
}
function fmtPromoValue(type: PromoType, value: number, unitName: string = 'buổi'): string {
  if (type === 'percent') return `-${value}%`;
  if (type === 'fixed_amount') return `-${value.toLocaleString()}đ`;
  if (type === 'bonus_sessions') return `+${value} ${unitName}`;
  if (type === 'bonus_days') return `+${value} ngày`;
  return String(value);
}

export default function ChuongTrinhClient({ callerUid, callerRole, callerBranch, callerName }: Props) {
  const [month, setMonth] = useState<string>(currentMonthVN());
  const [branchFilter, setBranchFilter] = useState<BranchId | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<ProgramStatus | 'all'>('all');
  const [programs, setPrograms] = useState<SalesProgram[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // Modal states
  const [formOpen, setFormOpen] = useState<{ mode: 'create' } | { mode: 'edit'; program: SalesProgram } | null>(null);
  const [detailOpen, setDetailOpen] = useState<SalesProgram | null>(null);
  const [configureOpen, setConfigureOpen] = useState<SalesProgram | null>(null);
  const [rejectOpen, setRejectOpen] = useState<SalesProgram | null>(null);

  // Role-based capabilities
  const isQLCS = callerRole.startsWith('QLCS_');
  const isTopReadAll = ['CEO', 'ADMIN', 'CHU_TICH', 'GD_KD', 'GD_VP', 'TP_KE'].includes(callerRole);
  const isAccountant = callerRole === 'NV_KE' || callerRole === 'TP_KE';
  const showBranchFilter = isTopReadAll;

  function showToast(type: 'ok' | 'err', msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }

  // Fetch
  const fetchPrograms = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const qs = new URLSearchParams({ month });
      if (showBranchFilter && branchFilter !== 'all') qs.set('branchId', branchFilter);
      const r = await fetch(`/api/sales-v2/programs?${qs.toString()}`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      const j = await r.json();
      setPrograms(j.programs as SalesProgram[]);
    } catch (e: any) {
      setError(e?.message ?? 'Lỗi tải');
    } finally { setLoading(false); }
  }, [month, branchFilter, showBranchFilter]);

  useEffect(() => { void fetchPrograms(); }, [fetchPrograms, refreshTick]);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return programs;
    return programs.filter((p) => p.status === statusFilter);
  }, [programs, statusFilter]);

  const counts = useMemo(() => {
    const c: Record<ProgramStatus | 'all', number> = {
      all: programs.length, draft: 0, pending_approval: 0, approved: 0, active: 0,
      paused: 0, rejected: 0, expired: 0,
    };
    programs.forEach((p) => { c[p.status] += 1; });
    return c;
  }, [programs]);

  // Actions
  const submitProgram = useCallback(async (id: string) => {
    const ok = await showConfirm({
      title: 'Gửi duyệt chương trình?',
      description: 'GD_KD sẽ duyệt cấp 1, sau đó GD_VP duyệt cấp 2. Sau khi đủ duyệt, kế toán cài đặt mã promo.',
      confirmText: 'Gửi duyệt', cancelText: 'Huỷ',
    });
    if (!ok) return;
    try {
      const r = await fetch(`/api/sales-v2/programs/${id}/submit`, { method: 'POST' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      showToast('ok', 'Đã gửi duyệt');
      setRefreshTick((t) => t + 1);
    } catch (e: any) { showToast('err', e?.message ?? 'Lỗi gửi'); }
  }, []);

  const approveProgram = useCallback(async (id: string) => {
    const ok = await showConfirm({
      title: 'Duyệt chương trình?',
      description: 'Sau khi đủ 2 cấp duyệt, kế toán sẽ cài đặt mã promo.',
      confirmText: 'Duyệt', cancelText: 'Huỷ',
    });
    if (!ok) return;
    try {
      const r = await fetch(`/api/sales-v2/programs/${id}/approve`, { method: 'POST' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      showToast('ok', 'Đã duyệt');
      setRefreshTick((t) => t + 1);
    } catch (e: any) { showToast('err', e?.message ?? 'Lỗi duyệt'); }
  }, []);

  const deleteProgram = useCallback(async (id: string) => {
    const ok = await showConfirm({
      title: 'Xoá chương trình?',
      description: 'Chỉ xoá được khi đang draft và chưa có giao dịch áp dụng.',
      confirmText: 'Xoá', cancelText: 'Huỷ', variant: 'danger',
    });
    if (!ok) return;
    try {
      const r = await fetch(`/api/sales-v2/programs/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      showToast('ok', 'Đã xoá');
      setRefreshTick((t) => t + 1);
    } catch (e: any) { showToast('err', e?.message ?? 'Lỗi xoá'); }
  }, []);

  const togglePause = useCallback(async (p: SalesProgram) => {
    const action = p.status === 'active' ? 'pause' : 'resume';
    const ok = await showConfirm({
      title: action === 'pause' ? 'Tạm dừng chương trình?' : 'Kích hoạt lại?',
      description: action === 'pause'
        ? 'Sale sẽ không thấy chương trình này ở /nhap nữa. Tx đã apply trước đó GIỮ NGUYÊN.'
        : 'Sale có thể chọn lại chương trình ở /nhap.',
      confirmText: action === 'pause' ? 'Tạm dừng' : 'Kích hoạt',
      cancelText: 'Huỷ',
    });
    if (!ok) return;
    try {
      const r = await fetch(`/api/sales-v2/programs/${p.id}/toggle`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      showToast('ok', action === 'pause' ? 'Đã tạm dừng' : 'Đã kích hoạt');
      setRefreshTick((t) => t + 1);
    } catch (e: any) { showToast('err', e?.message ?? 'Lỗi thao tác'); }
  }, []);

  return (
    <div className="flex-1 p-3 md:p-5 bg-slate-50 overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-4">
        {/* Header */}
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold text-slate-800">Chương trình khuyến mãi {fmtMonth(month)}</h1>
              <p className="mt-1 text-sm text-slate-600">
                {callerRole === 'GD_KD' && '👉 Bạn duyệt CẤP 1. Chương trình QLCS gửi sẽ hiện nút Duyệt/Từ chối khi đến lượt.'}
                {callerRole === 'GD_VP' && '👉 Bạn duyệt CẤP 2 (sau GD_KD). Chương trình hiện nút Duyệt/Từ chối khi GD_KD đã duyệt.'}
                {callerRole === 'NV_KE' && 'Cài đặt mã promo cho chương trình đã duyệt + tạm dừng / kích hoạt.'}
                {callerRole === 'TP_KE' && 'Cài đặt mã promo (toàn hệ thống) + tạm dừng / kích hoạt.'}
                {isQLCS && 'Bạn tạo chương trình cho cơ sở mình → gửi duyệt GD_KD → GD_VP → kế toán cài đặt mã → Sale dùng ở /nhap.'}
                {!isQLCS && callerRole !== 'GD_KD' && callerRole !== 'GD_VP' && callerRole !== 'NV_KE' && callerRole !== 'TP_KE' && 'Tổng quan chương trình khuyến mãi.'}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button type="button" onClick={() => setMonth(shiftMonth(month, -1))}
                className="p-2 rounded-lg ring-1 ring-slate-200 hover:bg-slate-50" title="Tháng trước">
                <ChevronLeft size={16} />
              </button>
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
                className="px-3 py-2 rounded-lg bg-white text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <button type="button" onClick={() => setMonth(shiftMonth(month, 1))}
                className="p-2 rounded-lg ring-1 ring-slate-200 hover:bg-slate-50" title="Tháng sau">
                <ChevronRight size={16} />
              </button>
              {showBranchFilter && (
                <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value as BranchId | 'all')}
                  className="px-3 py-2 rounded-lg bg-white text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="all">Tất cả cơ sở</option>
                  {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              )}
              {isQLCS && (
                <button type="button" onClick={() => setFormOpen({ mode: 'create' })}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 shadow-sm">
                  <Plus size={16} /> Tạo chương trình
                </button>
              )}
            </div>
          </div>

          {/* Status filter chips */}
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            {(['all','draft','pending_approval','approved','active','paused','rejected','expired'] as const).map((s) => {
              const label = s === 'all' ? 'Tất cả' : PROGRAM_STATUS_LABEL[s];
              const active = statusFilter === s;
              const count = counts[s];
              return (
                <button key={s} type="button" onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1 rounded-full text-xs font-medium ring-1 transition ${
                    active ? 'bg-emerald-600 text-white ring-emerald-600' : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'
                  }`}>
                  {label}
                  {count > 0 && <span className={`ml-1.5 tabular-nums ${active ? 'opacity-80' : 'text-slate-400'}`}>{count}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="card text-center py-12 text-slate-400 text-sm">
            <Loader2 className="animate-spin inline mr-2" size={16} /> Đang tải...
          </div>
        ) : error ? (
          <div className="card text-center py-12 text-rose-600 text-sm">⚠️ {error}</div>
        ) : filtered.length === 0 ? (
          <div className="card text-center py-16 text-slate-400">
            <div className="text-5xl mb-3">📋</div>
            <div className="text-base font-medium text-slate-600">
              {statusFilter === 'all' ? 'Tháng này chưa có chương trình' : `Không có chương trình "${PROGRAM_STATUS_LABEL[statusFilter as ProgramStatus]}"`}
            </div>
            {isQLCS && statusFilter === 'all' && (
              <button type="button" onClick={() => setFormOpen({ mode: 'create' })}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700">
                <Plus size={16} /> Tạo chương trình đầu tiên
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map((p) => (
              <ProgramCard
                key={p.id}
                program={p}
                callerUid={callerUid}
                callerRole={callerRole}
                callerBranch={callerBranch}
                onClick={() => setDetailOpen(p)}
                onEdit={() => setFormOpen({ mode: 'edit', program: p })}
                onSubmit={() => submitProgram(p.id)}
                onApprove={() => approveProgram(p.id)}
                onReject={() => setRejectOpen(p)}
                onConfigure={() => setConfigureOpen(p)}
                onToggle={() => togglePause(p)}
                onDelete={() => deleteProgram(p.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium z-50 ${
          toast.type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
        }`}>{toast.msg}</div>
      )}

      {/* Modals */}
      {formOpen && (
        <ProgramFormModal
          mode={formOpen.mode}
          program={formOpen.mode === 'edit' ? formOpen.program : null}
          callerBranch={callerBranch}
          month={month}
          onClose={() => setFormOpen(null)}
          onSaved={() => { setFormOpen(null); setRefreshTick((t) => t + 1); showToast('ok', 'Đã lưu'); }}
        />
      )}
      {detailOpen && (
        <ProgramDetailDrawer
          program={detailOpen}
          callerUid={callerUid}
          onClose={() => setDetailOpen(null)}
        />
      )}
      {configureOpen && (
        <ConfigureCodeModal
          program={configureOpen}
          onClose={() => setConfigureOpen(null)}
          onSaved={() => { setConfigureOpen(null); setRefreshTick((t) => t + 1); showToast('ok', 'Đã cài đặt mã'); }}
        />
      )}
      {rejectOpen && (
        <RejectReasonModal
          program={rejectOpen}
          onClose={() => setRejectOpen(null)}
          onRejected={() => { setRejectOpen(null); setRefreshTick((t) => t + 1); showToast('ok', 'Đã từ chối'); }}
        />
      )}
    </div>
  );
}

// ─── Card per program ──────────────────────────────────────────

function ProgramCard({ program: p, callerUid, callerRole, callerBranch, onClick, onEdit, onSubmit, onApprove, onReject, onConfigure, onToggle, onDelete }: {
  program: SalesProgram;
  callerUid: string;
  callerRole: string;
  callerBranch: string | null;
  onClick: () => void;
  onEdit: () => void;
  onSubmit: () => void;
  onApprove: () => void;
  onReject: () => void;
  onConfigure: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const isMyDraft = p.createdBy === callerUid && (p.status === 'draft' || p.status === 'rejected');
  const isMyTurnApprove = p.status === 'pending_approval' && p.currentApprover === callerUid;
  const isAccountant = (callerRole === 'TP_KE') || (callerRole === 'NV_KE' && callerBranch === p.branchId);
  const canConfigure = isAccountant && ['approved', 'active', 'paused'].includes(p.status);
  const canToggle = isAccountant && (p.status === 'active' || p.status === 'paused');
  const canDelete = isMyDraft && p.status === 'draft' && p.usageCount === 0;

  return (
    <div className="rounded-xl bg-white ring-1 ring-slate-200 hover:ring-emerald-300 hover:shadow-md transition overflow-hidden cursor-pointer"
      onClick={onClick}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-slate-800 truncate">{p.name}</div>
            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
              <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded ring-1 ${STATUS_TONE[p.status]}`}>
                {PROGRAM_STATUS_LABEL[p.status]}
              </span>
              <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded ring-1 ${PROMO_TYPE_TONE[p.promoType]}`}>
                {PROMO_TYPE_LABEL[p.promoType]} {fmtPromoValue(p.promoType, p.promoValue)}
              </span>
              {p.promoCode && (
                <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded ring-1 ring-emerald-200">
                  {p.promoCode}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-1.5 text-xs">
        <div className="flex items-center gap-1.5 text-slate-600">
          <span className="text-slate-400">Cơ sở:</span>
          <span className="font-medium text-slate-700">{p.branchName}</span>
          <span className="text-slate-300">·</span>
          <span className="text-slate-400">Gói:</span>
          <span className="font-medium text-slate-700">{p.packageIds.length === 0 ? 'Tất cả' : `${p.packageIds.length} gói`}</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-500">
          <span>Tạo bởi <strong className="text-slate-700">{p.createdByName}</strong></span>
          {p.status === 'pending_approval' && p.currentApprover && (
            <>
              <span className="text-slate-300">·</span>
              <span>Chờ <strong className="text-amber-700">{
                p.approverChainNames[p.approverChain.indexOf(p.currentApprover)] ?? 'người duyệt'
              }</strong> duyệt</span>
            </>
          )}
        </div>
        {p.status === 'rejected' && p.rejectedReason && (
          <div className="rounded bg-rose-50 px-2 py-1 text-rose-700 ring-1 ring-rose-100">
            <strong>Lý do từ chối:</strong> {p.rejectedReason}
          </div>
        )}
        {p.usageCount > 0 && (
          <div className="text-slate-500">
            Đã dùng <strong className="text-slate-700">{p.usageCount}</strong> tx
            {p.totalDiscount > 0 && <> · Giảm <strong className="text-emerald-700 tabular-nums">{p.totalDiscount.toLocaleString()}đ</strong></>}
            {p.totalBonusSessions > 0 && <> · Tặng <strong className="text-rose-700 tabular-nums">{p.totalBonusSessions}</strong> buổi</>}
            {p.totalBonusDays > 0 && <> · Tặng <strong className="text-cyan-700 tabular-nums">{p.totalBonusDays}</strong> ngày</>}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-1.5"
        onClick={(e) => e.stopPropagation()}>
        {isMyDraft && (
          <>
            <button type="button" onClick={onEdit}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-white ring-1 ring-slate-200 text-slate-700 hover:bg-slate-50">
              <Edit3 size={12} /> Sửa
            </button>
            {p.status === 'draft' && (
              <button type="button" onClick={onSubmit}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700">
                <Send size={12} /> Gửi duyệt
              </button>
            )}
            {p.status === 'rejected' && (
              <button type="button" onClick={onSubmit}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-amber-600 text-white hover:bg-amber-700">
                <Send size={12} /> Gửi lại
              </button>
            )}
            {canDelete && (
              <button type="button" onClick={onDelete}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-white ring-1 ring-rose-200 text-rose-700 hover:bg-rose-50">
                <Trash2 size={12} />
              </button>
            )}
          </>
        )}
        {isMyTurnApprove && (
          <>
            <button type="button" onClick={onReject}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-white ring-1 ring-rose-200 text-rose-700 hover:bg-rose-50">
              <XCircle size={12} /> Từ chối
            </button>
            <button type="button" onClick={onApprove}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700">
              <CheckCircle2 size={12} /> Duyệt
            </button>
          </>
        )}
        {canConfigure && (
          <button type="button" onClick={onConfigure}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-violet-600 text-white hover:bg-violet-700">
            <KeyRound size={12} /> {p.promoCode ? 'Đổi mã' : 'Cài đặt mã'}
          </button>
        )}
        {canToggle && (
          <button type="button" onClick={onToggle}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium ${
              p.status === 'active' ? 'bg-white ring-1 ring-orange-200 text-orange-700 hover:bg-orange-50' : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}>
            {p.status === 'active' ? <><Pause size={12} /> Tạm dừng</> : <><Play size={12} /> Kích hoạt</>}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Form Modal: tạo / sửa ───────────────────────────────────────

function ProgramFormModal({ mode, program, callerBranch, month, onClose, onSaved }: {
  mode: 'create' | 'edit';
  program: SalesProgram | null;
  callerBranch: string | null;
  month: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(program?.name ?? '');
  const [description, setDescription] = useState(program?.description ?? '');
  const [formMonth, setFormMonth] = useState(program?.month ?? month);
  const [promoType, setPromoType] = useState<PromoType>(program?.promoType ?? 'percent');
  const [promoValue, setPromoValue] = useState<string>(String(program?.promoValue ?? ''));
  const [packageIds, setPackageIds] = useState<string[]>(program?.packageIds ?? []);
  const [packagesAvail, setPackagesAvail] = useState<Array<{ id: string; name: string; isCustomQuantity: boolean }>>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const branchId = program?.branchId ?? (callerBranch as BranchId | null);

  // Load packages của cơ sở
  useEffect(() => {
    if (!branchId) return;
    void (async () => {
      try {
        const r = await fetch(`/api/packages?branchId=${branchId}&active=true`);
        if (!r.ok) return;
        const j = await r.json();
        const rows = (j.rows ?? []) as Array<{ id: string; name: string; isCustomQuantity?: boolean }>;
        setPackagesAvail(rows.map((p) => ({ id: p.id, name: p.name, isCustomQuantity: p.isCustomQuantity === true })));
      } catch {}
    })();
  }, [branchId]);

  // Lọc gói áp dụng được cho type hiện tại: bonus_sessions chỉ PT
  const ptOnly = promoType === 'bonus_sessions';
  const visiblePackages = useMemo(() => {
    return ptOnly ? packagesAvail.filter((p) => p.isCustomQuantity) : packagesAvail;
  }, [ptOnly, packagesAvail]);

  // Khi đổi type sang bonus_sessions, lọc bỏ packageIds không phải PT
  useEffect(() => {
    if (ptOnly && packageIds.length > 0) {
      const ptIds = new Set(packagesAvail.filter((p) => p.isCustomQuantity).map((p) => p.id));
      setPackageIds((cur) => cur.filter((id) => ptIds.has(id)));
    }
  }, [ptOnly, packagesAvail]);  // eslint-disable-line react-hooks/exhaustive-deps

  function togglePackage(id: string) {
    setPackageIds((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }

  // V7 (2026-06-18): tách số khỏi định dạng dot-separator (1.000.000 → 1000000)
  const parsePromoValue = (s: string): number => Number(s.replace(/[^\d]/g, '')) || 0;

  async function handleSave() {
    if (!branchId) { setError('Không xác định được cơ sở'); return; }
    const trimmedName = name.trim();
    if (!trimmedName) { setError('Tên chương trình không được rỗng'); return; }
    const n = parsePromoValue(promoValue);
    if (!Number.isFinite(n) || n <= 0) { setError('Giá trị phải > 0'); return; }
    if (promoType === 'percent' && n > 100) { setError('Giảm % không thể > 100'); return; }
    setSaving(true); setError(null);
    try {
      const body = {
        name: trimmedName,
        description: description.trim(),
        month: formMonth,
        branchId,
        packageIds,
        promoType,
        promoValue: n,
      };
      const url = mode === 'create'
        ? '/api/sales-v2/programs'
        : `/api/sales-v2/programs/${program!.id}`;
      const method = mode === 'create' ? 'POST' : 'PATCH';
      const r = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? 'Lỗi lưu');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <h3 className="text-base font-bold text-slate-800">
            {mode === 'create' ? 'Tạo chương trình khuyến mãi' : `Sửa: ${program?.name}`}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <Field label="Tên chương trình *">
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={200}
              placeholder="VD: Khuyến mãi hè 2026 — cơ sở HM"
              className="w-full px-3 py-2 rounded-lg ring-1 ring-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </Field>
          <Field label="Mô tả">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={2}
              placeholder="Mô tả ngắn về chương trình (tuỳ chọn)"
              className="w-full px-3 py-2 rounded-lg ring-1 ring-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tháng áp dụng *">
              <input type="month" value={formMonth} onChange={(e) => setFormMonth(e.target.value)} disabled={mode === 'edit'}
                className="w-full px-3 py-2 rounded-lg ring-1 ring-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50" />
            </Field>
            <Field label="Cơ sở">
              <input value={branchId ?? '—'} disabled
                className="w-full px-3 py-2 rounded-lg ring-1 ring-slate-200 text-sm bg-slate-50" />
            </Field>
          </div>
          <Field label="Loại khuyến mãi *">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {(['percent','fixed_amount','bonus_sessions','bonus_days'] as PromoType[]).map((t) => (
                <button key={t} type="button" onClick={() => setPromoType(t)}
                  className={`px-2 py-2 rounded-lg text-xs font-medium ring-1 transition ${
                    promoType === t ? 'bg-emerald-600 text-white ring-emerald-600' : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'
                  }`}>
                  {PROMO_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </Field>
          <Field label={
            promoType === 'percent' ? 'Phần trăm giảm (%) *'
            : promoType === 'fixed_amount' ? 'Số tiền giảm (VND) *'
            : promoType === 'bonus_sessions' ? 'Số buổi tặng *'
            : 'Số ngày tặng *'
          }
          hint={promoType === 'fixed_amount' ? 'Auto-format dấu chấm phân cách hàng nghìn' : undefined}>
            {promoType === 'fixed_amount' ? (
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  // Format hiển thị: '1000000' → '1.000.000'. Strip ký tự non-digit khi user gõ.
                  value={promoValue ? parsePromoValue(promoValue).toLocaleString('vi-VN') : ''}
                  onChange={(e) => setPromoValue(String(parsePromoValue(e.target.value)))}
                  placeholder="VD: 500.000"
                  className="w-full px-3 py-2 pr-12 rounded-lg ring-1 ring-slate-200 text-sm tabular-nums text-right font-semibold text-blue-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium pointer-events-none">VND</span>
              </div>
            ) : (
              <input
                type="number"
                inputMode="numeric"
                value={promoValue}
                onChange={(e) => setPromoValue(e.target.value)}
                min={0}
                max={promoType === 'percent' ? 100 : undefined}
                placeholder={promoType === 'percent' ? 'VD: 10' : promoType === 'bonus_sessions' ? 'VD: 2' : 'VD: 30'}
                className="w-full px-3 py-2 rounded-lg ring-1 ring-slate-200 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            )}
          </Field>
          <Field label={`Áp dụng cho gói${packageIds.length === 0 ? ' (Tất cả gói)' : ` (${packageIds.length} gói đã chọn)`}`}
            hint={ptOnly ? 'Loại "Tặng buổi" chỉ hiện gói PT (theo buổi)' : 'Không chọn = áp dụng MỌI gói của cơ sở'}>
            <div className="max-h-64 overflow-y-auto rounded-lg ring-1 ring-slate-200 p-2 bg-slate-50/50">
              {visiblePackages.length === 0 ? (
                <div className="text-center text-xs text-slate-400 py-4">
                  {ptOnly ? 'Cơ sở chưa có gói PT' : 'Chưa có gói nào'}
                </div>
              ) : (
                <div className="space-y-1">
                  {visiblePackages.map((p) => {
                    const checked = packageIds.includes(p.id);
                    return (
                      <label key={p.id} className="flex items-center gap-2 cursor-pointer px-2 py-1.5 rounded hover:bg-white">
                        <input type="checkbox" checked={checked} onChange={() => togglePackage(p.id)}
                          className="w-4 h-4 accent-emerald-600" />
                        <span className="text-sm text-slate-700 flex-1">{p.name}</span>
                        {p.isCustomQuantity && (
                          <span className="text-[9px] uppercase font-bold text-violet-700 bg-violet-100 px-1 py-0.5 rounded">PT</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </Field>
          {error && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200 flex items-start gap-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" /> <span>{error}</span>
            </div>
          )}
          {/* V7 (2026-06-18): note workflow để QLCS biết ai sẽ duyệt */}
          <div className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-700 ring-1 ring-sky-200">
            ℹ️ Sau khi <strong>Lưu</strong>, bạn cần bấm <strong>Gửi duyệt</strong> trên card. Quy trình duyệt:
            <strong> GD_KD</strong> → <strong>GD_VP</strong> → kế toán cấu hình mã → Sale dùng được ở /nhap.
          </div>
        </div>
        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={saving}
            className="px-4 py-2 rounded-lg ring-1 ring-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            Huỷ
          </button>
          <button onClick={handleSave} disabled={saving || !name.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
            {saving && <Loader2 className="animate-spin" size={14} />} Lưu
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Configure Code Modal (kế toán set promoCode) ──────────────

function ConfigureCodeModal({ program, onClose, onSaved }: {
  program: SalesProgram;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(program.promoCode ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const trimmed = code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,20}$/.test(trimmed)) {
      setError('Mã chỉ A-Z, 0-9, _ hoặc - (3-20 ký tự)'); return;
    }
    setSaving(true); setError(null);
    try {
      const r = await fetch(`/api/sales-v2/programs/${program.id}/configure`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ promoCode: trimmed }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      onSaved();
    } catch (e: any) { setError(e?.message ?? 'Lỗi'); setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <h3 className="text-base font-bold text-slate-800">{program.promoCode ? 'Đổi mã promo' : 'Cài đặt mã promo'}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="text-sm text-slate-600">
            Chương trình: <strong>{program.name}</strong>
            <br/>{program.branchName} · {PROMO_TYPE_LABEL[program.promoType]} {fmtPromoValue(program.promoType, program.promoValue)}
          </div>
          <Field label="Mã promo (3-20 ký tự, A-Z 0-9 _ -)">
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
              autoFocus maxLength={20} placeholder="VD: HE2026, KM_T7"
              className="w-full px-3 py-2 rounded-lg ring-1 ring-slate-200 text-base font-mono font-bold tracking-wider focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </Field>
          {error && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200 flex items-start gap-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" /> <span>{error}</span>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={saving}
            className="px-4 py-2 rounded-lg ring-1 ring-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50">Huỷ</button>
          <button onClick={handleSave} disabled={saving || !code.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
            {saving && <Loader2 className="animate-spin" size={14} />} Lưu mã
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Reject Reason Modal ──────────────────────────────────────

function RejectReasonModal({ program, onClose, onRejected }: {
  program: SalesProgram;
  onClose: () => void;
  onRejected: () => void;
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReject() {
    const t = reason.trim();
    if (!t) { setError('Phải nhập lý do từ chối'); return; }
    setSaving(true); setError(null);
    try {
      const r = await fetch(`/api/sales-v2/programs/${program.id}/reject`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: t }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      onRejected();
    } catch (e: any) { setError(e?.message ?? 'Lỗi'); setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-200">
          <h3 className="text-base font-bold text-slate-800">Từ chối chương trình</h3>
          <div className="mt-1 text-xs text-slate-500">{program.name}</div>
        </div>
        <div className="px-5 py-4 space-y-3">
          <Field label="Lý do *">
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} autoFocus rows={3} maxLength={500}
              placeholder="Nêu rõ lý do từ chối để QLCS điều chỉnh..."
              className="w-full px-3 py-2 rounded-lg ring-1 ring-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500" />
          </Field>
          {error && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200 flex items-start gap-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" /> <span>{error}</span>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={saving}
            className="px-4 py-2 rounded-lg ring-1 ring-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50">Huỷ</button>
          <button onClick={handleReject} disabled={saving || !reason.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-50">
            {saving && <Loader2 className="animate-spin" size={14} />} Từ chối
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Detail Drawer ──────────────────────────────────────────────

function ProgramDetailDrawer({ program: p, callerUid, onClose }: {
  program: SalesProgram;
  callerUid: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-end" onClick={onClose}>
      <div className="bg-white w-full max-w-md h-full overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">Chi tiết chương trình</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <div className="text-lg font-bold text-slate-800">{p.name}</div>
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded ring-1 ${STATUS_TONE[p.status]}`}>
                {PROGRAM_STATUS_LABEL[p.status]}
              </span>
              <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded ring-1 ${PROMO_TYPE_TONE[p.promoType]}`}>
                {PROMO_TYPE_LABEL[p.promoType]} {fmtPromoValue(p.promoType, p.promoValue)}
              </span>
              {p.promoCode && (
                <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded ring-1 ring-emerald-200">
                  {p.promoCode}
                </span>
              )}
            </div>
            {p.description && <div className="mt-2 text-sm text-slate-600 whitespace-pre-line">{p.description}</div>}
          </div>

          <DefList>
            <DefRow label="Cơ sở" value={p.branchName} />
            <DefRow label="Tháng" value={fmtMonth(p.month)} />
            <DefRow label="Áp dụng gói" value={p.packageIds.length === 0 ? 'Tất cả gói' : p.packageNames.join(', ')} />
            <DefRow label="Tạo bởi" value={`${p.createdByName} · ${new Date(p.createdAt).toLocaleString('vi-VN')}`} />
            {p.submittedAt && <DefRow label="Gửi duyệt" value={new Date(p.submittedAt).toLocaleString('vi-VN')} />}
            {p.configuredBy && (
              <DefRow label="Cài đặt mã" value={`${p.configuredByName} · ${p.configuredAt ? new Date(p.configuredAt).toLocaleString('vi-VN') : '—'}`} />
            )}
          </DefList>

          {/* Approval chain history */}
          {(p.approverChain.length > 0 || p.approvalSteps.length > 0) && (
            <div>
              <div className="text-xs uppercase font-semibold text-slate-500 tracking-wider mb-2">Lịch sử duyệt</div>
              <div className="space-y-1.5">
                {p.approverChain.map((uid, idx) => {
                  const step = p.approvalSteps.find((s) => s.approverId === uid);
                  const isCurrent = p.currentApprover === uid;
                  return (
                    <div key={uid} className={`flex items-start gap-2 px-2.5 py-2 rounded text-xs ring-1 ${
                      step?.action === 'approved' ? 'bg-emerald-50/40 ring-emerald-100' :
                      step?.action === 'rejected' ? 'bg-rose-50/40 ring-rose-100' :
                      isCurrent ? 'bg-amber-50/40 ring-amber-200' : 'bg-slate-50/40 ring-slate-100'
                    }`}>
                      <span className="shrink-0 w-5 h-5 rounded-full bg-white ring-1 ring-slate-200 text-[10px] font-bold flex items-center justify-center tabular-nums">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-700">{p.approverChainNames[idx]}</div>
                        {step ? (
                          <div className={step.action === 'approved' ? 'text-emerald-700' : 'text-rose-700'}>
                            {step.action === 'approved' ? '✓ Đã duyệt' : '✗ Từ chối'} · {new Date(step.timestamp).toLocaleString('vi-VN')}
                            {step.reason && <div className="mt-0.5 text-slate-600">"{step.reason}"</div>}
                          </div>
                        ) : isCurrent ? (
                          <div className="text-amber-700">⏳ Đang chờ duyệt</div>
                        ) : (
                          <div className="text-slate-400">Chưa đến lượt</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Stats */}
          {p.usageCount > 0 && (
            <div>
              <div className="text-xs uppercase font-semibold text-slate-500 tracking-wider mb-2">Thống kê sử dụng</div>
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Tx áp dụng" value={p.usageCount.toLocaleString()} tone="slate" />
                {p.totalDiscount > 0 && <Stat label="Tổng giảm" value={`${p.totalDiscount.toLocaleString()}đ`} tone="emerald" />}
                {p.totalBonusSessions > 0 && <Stat label="Buổi tặng" value={p.totalBonusSessions.toLocaleString()} tone="rose" />}
                {p.totalBonusDays > 0 && <Stat label="Ngày tặng" value={p.totalBonusDays.toLocaleString()} tone="cyan" />}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Small UI helpers ──────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[11px] text-slate-400">{hint}</div>}
    </label>
  );
}
function DefList({ children }: { children: React.ReactNode }) {
  return <div className="space-y-1.5 text-sm">{children}</div>;
}
function DefRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-24 shrink-0 text-xs text-slate-500 pt-0.5">{label}</div>
      <div className="flex-1 text-slate-700">{value}</div>
    </div>
  );
}
function Stat({ label, value, tone }: { label: string; value: string; tone: 'slate'|'emerald'|'rose'|'cyan' }) {
  const cls = {
    slate: 'bg-slate-50 text-slate-700 ring-slate-200',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    rose: 'bg-rose-50 text-rose-700 ring-rose-200',
    cyan: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
  }[tone];
  return (
    <div className={`rounded-lg px-3 py-2 ring-1 ${cls}`}>
      <div className="text-[10px] uppercase tracking-wider font-semibold opacity-70">{label}</div>
      <div className="text-base font-bold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
