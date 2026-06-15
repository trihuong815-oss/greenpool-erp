'use client';

import { Clock, UserCheck } from 'lucide-react';
import {
  PROPOSAL_KIND_LABEL, PROPOSAL_KIND_COLOR,
  PROPOSAL_STATUS_LABEL, PROPOSAL_STATUS_COLOR,
  NATURE_META,
  type ProposalV6, type ProposalKind,
} from '../types';

// V6.4 (2026-06-13): Card view 1 proposal cho mobile.

function slaHoursOf(roleCode: string | undefined): number {
  if (!roleCode) return 48;
  if (roleCode === 'GD_KD' || roleCode === 'GD_VP') return 24;
  if (roleCode === 'CEO') return 48;
  if (roleCode === 'CHU_TICH') return 72;
  return 48;
}

function diffHours(fromIso: string | undefined): number {
  if (!fromIso) return 0;
  const t = new Date(fromIso).getTime();
  if (!Number.isFinite(t)) return 0;
  return (Date.now() - t) / 3_600_000;
}

function formatSla(p: ProposalV6): { text: string; color: string } {
  const s = String(p.status);
  if (s === 'da_phe_duyet' || s === 'dong_y_nguyen_tac' || s === 'chuyen_dieu_phoi' || s === 'tu_choi' || s === 'dong_ho_so') {
    return { text: 'Đã xong', color: 'text-slate-400' };
  }
  const currentStep = p.approverChain?.[p.approverIdx];
  if (!currentStep) return { text: '—', color: 'text-slate-400' };
  const slaH = slaHoursOf(currentStep.roleCode);
  const remain = slaH - diffHours(p.updatedAt || p.createdAt);
  if (remain >= 0) {
    if (remain < 24) return { text: `Còn ${Math.round(remain)}h`, color: 'text-orange-600 font-semibold' };
    return { text: `Còn ${Math.round(remain / 24)} ngày`, color: 'text-slate-700' };
  }
  return { text: `Quá ${Math.round(-remain)}h`, color: 'text-rose-600 font-semibold' };
}

function currentApproverDisplay(p: ProposalV6): string {
  const step = p.approverChain?.[p.approverIdx];
  if (!step) return '—';
  return step.name || step.roleCode || '—';
}

interface Props {
  proposal: ProposalV6;
  onTap: (p: ProposalV6) => void;
}

export default function ProposalCard({ proposal, onTap }: Props) {
  const sla = formatSla(proposal);
  const kind = proposal.kind as ProposalKind;

  return (
    <button
      type="button"
      onClick={() => onTap(proposal)}
      className="w-full text-left bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 active:scale-[0.99] active:bg-slate-50 transition p-4 space-y-3"
    >
      {/* Header */}
      <div className="space-y-1">
        <div className="text-[15px] font-semibold text-slate-800 leading-snug line-clamp-2">
          {proposal.title}
        </div>
        <div className="text-[11px] text-slate-400 tabular-nums">#{proposal.code}</div>
      </div>

      {/* Tags: Loại + Khối */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={
          'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ' +
          (PROPOSAL_KIND_COLOR[kind] ?? 'bg-slate-100 text-slate-700 ring-slate-200')
        }>
          {PROPOSAL_KIND_LABEL[kind] ?? kind}
        </span>
        {/* V6.5 (2026-06-14): tag nature dùng NATURE_META hằng số chung 4 mặt.
            Fallback graceful cho data cũ: unitsScope='lien_khoi' → governance. */}
        {(() => {
          const natureRaw = proposal.nature;
          const scopeOld = (proposal as any).unitsScope as 'trong_khoi' | 'lien_khoi' | undefined;
          const nature = natureRaw
            ?? (scopeOld === 'lien_khoi' ? 'governance' : scopeOld === 'trong_khoi' ? 'support' : null);
          if (!nature) return null;
          const m = NATURE_META[nature];
          return (
            <span className={'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ' + m.color}>
              {m.emoji} {m.shortLabel}
            </span>
          );
        })()}
      </div>

      {/* V6.5 (2026-06-14): Hiện đầy đủ đơn vị nhận + lãnh đạo phê duyệt + người duyệt hiện tại */}
      <div className="space-y-1 text-sm">
        {proposal.recipientUnitName && (
          <div className="flex items-center gap-2">
            <span className="text-slate-500 text-xs">📨 Đơn vị nhận:</span>
            <span className="text-slate-800 font-medium truncate">{proposal.recipientUnitName}</span>
          </div>
        )}
        {proposal.nature === 'governance' && typeof proposal.recipientLeaderName === 'string' && proposal.recipientLeaderName.trim() && (
          <div className="flex items-center gap-2">
            <span className="text-slate-500 text-xs">⚙️ Lãnh đạo duyệt:</span>
            <span className="text-slate-800 font-medium truncate">{proposal.recipientLeaderName}</span>
          </div>
        )}
        {/* V6.5 (2026-06-14): hasFinancial + estimatedCost (nhất quán form/table/drawer) */}
        {proposal.nature === 'governance' && (proposal as any).hasFinancial && (
          <div className="flex items-center gap-2">
            <span className="text-slate-500 text-xs">💰 Tài chính:</span>
            <span className="text-amber-700 font-semibold tabular-nums">
              {(proposal as any).estimatedCost > 0
                ? '₫' + Number((proposal as any).estimatedCost).toLocaleString('vi-VN')
                : 'Chưa xác định giá trị'}
            </span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <UserCheck size={14} className="text-slate-400 shrink-0" />
          <span className="text-slate-500 text-xs">Người duyệt hiện tại:</span>
          <span className="text-slate-800 font-medium truncate">{currentApproverDisplay(proposal)}</span>
        </div>
      </div>

      {/* Footer — SLA + Status */}
      <div className="flex items-center justify-between pt-1 border-t border-slate-100">
        <div className={`flex items-center gap-1 text-[13px] tabular-nums ${sla.color}`}>
          <Clock size={13} />
          {sla.text}
        </div>
        <span className={
          'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ' +
          (PROPOSAL_STATUS_COLOR[proposal.status] ?? 'bg-slate-100 text-slate-700 ring-slate-200')
        }>
          {PROPOSAL_STATUS_LABEL[proposal.status] ?? proposal.status}
        </span>
      </div>
    </button>
  );
}
