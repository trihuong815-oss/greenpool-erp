'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  PROPOSAL_KIND_LABEL, PROPOSAL_KIND_COLOR,
  PROPOSAL_STATUS_LABEL, PROPOSAL_STATUS_COLOR,
  type ProposalV6, type ProposalKind,
} from '../types';
import type { DexCompactKpiKey } from './CompactKpiBar';

// ============================================================
// V6.4 (2026-06-13): Bảng đề xuất COMPACT — 5 cột + 5 tabs
//   Cột: Đề xuất | Loại | Người duyệt hiện tại | SLA | Trạng thái
//   Tabs: Tất cả | Tôi tạo | Chờ duyệt | Cần bổ sung | Đã phê duyệt
// ============================================================

type TabKey = 'all' | 'mine' | 'cho-duyet' | 'can-bo-sung' | 'da-duyet';

const TAB_LABEL: Record<TabKey, string> = {
  all: 'Tất cả',
  mine: 'Tôi tạo',
  'cho-duyet': 'Chờ duyệt',
  'can-bo-sung': 'Cần bổ sung',
  'da-duyet': 'Đã phê duyệt',
};

// SLA giờ theo role (đồng bộ với /dieu-phoi)
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
  // Đề xuất ở trạng thái chờ duyệt hoặc đang xem xét → tính SLA từ updatedAt/createdAt
  const s = String(p.status);
  if (s === 'da_phe_duyet' || s === 'dong_y_nguyen_tac' || s === 'chuyen_dieu_phoi' || s === 'tu_choi' || s === 'dong_ho_so') {
    return { text: '—', color: 'text-slate-400' };
  }
  const currentStep = p.approverChain?.[p.approverIdx];
  if (!currentStep) return { text: '—', color: 'text-slate-400' };
  const hoursElapsed = diffHours(p.updatedAt || p.createdAt);
  const slaH = slaHoursOf(currentStep.roleCode);
  const remain = slaH - hoursElapsed;
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
  proposals: ProposalV6[];
  currentUserUid: string;
  onRowClick: (p: ProposalV6) => void;
  externalFilter: DexCompactKpiKey | null;
}

export default function CompactProposalTable({ proposals, currentUserUid, onRowClick, externalFilter }: Props) {
  const [tab, setTab] = useState<TabKey>('all');

  // KPI click ngoài → tự switch tab phù hợp
  useEffect(() => {
    if (externalFilter === 'toi-tao') setTab('mine');
    else if (externalFilter === 'cho-duyet') setTab('cho-duyet');
    else if (externalFilter === 'can-bo-sung') setTab('can-bo-sung');
    else if (externalFilter === 'da-phe-duyet' || externalFilter === 'da-chuyen-dp') setTab('da-duyet');
    else if (externalFilter === null) setTab('all');
  }, [externalFilter]);

  const counts: Record<TabKey, number> = useMemo(() => {
    let all = 0, mine = 0, choDuyet = 0, canBoSung = 0, daDuyet = 0;
    for (const p of proposals) {
      all += 1;
      if (p.creatorUid === currentUserUid) mine += 1;
      const s = String(p.status);
      if (s === 'da_gui' || s === 'dang_xem_xet') choDuyet += 1;
      if (s === 'yeu_cau_bo_sung') canBoSung += 1;
      if (s === 'da_phe_duyet' || s === 'dong_y_nguyen_tac' || s === 'chuyen_dieu_phoi') daDuyet += 1;
    }
    return { all, mine, 'cho-duyet': choDuyet, 'can-bo-sung': canBoSung, 'da-duyet': daDuyet };
  }, [proposals, currentUserUid]);

  const filtered = useMemo(() => {
    return proposals.filter((p) => {
      const s = String(p.status);
      if (tab === 'mine' && p.creatorUid !== currentUserUid) return false;
      if (tab === 'cho-duyet' && !(s === 'da_gui' || s === 'dang_xem_xet')) return false;
      if (tab === 'can-bo-sung' && s !== 'yeu_cau_bo_sung') return false;
      if (tab === 'da-duyet' && !(s === 'da_phe_duyet' || s === 'dong_y_nguyen_tac' || s === 'chuyen_dieu_phoi')) return false;
      return true;
    });
  }, [proposals, tab, currentUserUid]);

  return (
    <div className="rounded-xl border border-slate-200/70 bg-white shadow-md ring-1 ring-slate-50 overflow-hidden">
      {/* Tabs */}
      <div className="border-b border-slate-200 overflow-x-auto bg-gradient-to-b from-slate-50/60 to-white">
        <div className="flex items-center gap-1 px-2">
          {(['all', 'mine', 'cho-duyet', 'can-bo-sung', 'da-duyet'] as TabKey[]).map((key) => {
            const isActive = tab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={
                  'px-3.5 py-2.5 text-xs whitespace-nowrap border-b-2 -mb-px transition-colors ' +
                  (isActive
                    ? 'border-emerald-500 text-emerald-700 font-bold'
                    : 'border-transparent text-slate-600 hover:text-slate-800 font-medium')
                }
              >
                {TAB_LABEL[key]}{' '}
                <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[16px] px-1 rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold tabular-nums">
                  {counts[key]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bảng 5 cột */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
              <th className="px-3 py-2.5 text-left font-medium">Đề xuất</th>
              <th className="px-3 py-2.5 text-left font-medium w-28">Loại</th>
              <th className="px-3 py-2.5 text-left font-medium w-40">Người duyệt hiện tại</th>
              <th className="px-3 py-2.5 text-left font-medium w-28">SLA</th>
              <th className="px-3 py-2.5 text-left font-medium w-36">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const sla = formatSla(p);
              const kind = p.kind as ProposalKind;
              return (
                <tr
                  key={p.id}
                  onClick={() => onRowClick(p)}
                  className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                >
                  {/* Đề xuất */}
                  <td className="px-3 py-3 align-top">
                    <div className="font-medium text-slate-800">{p.title}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">#{p.code}</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {/* V6.5: tag nature thay unitsScope */}
                      {p.nature && (
                        <span className={
                          'inline-flex items-center rounded px-1.5 py-0 text-[10px] font-medium ring-1 ring-inset ' +
                          (p.nature === 'governance'
                            ? 'bg-amber-50 text-amber-700 ring-amber-200'
                            : 'bg-sky-50 text-sky-700 ring-sky-200')
                        }>
                          {p.nature === 'governance' ? 'Quản trị' : 'Hỗ trợ'}
                        </span>
                      )}
                    </div>
                  </td>
                  {/* Loại */}
                  <td className="px-3 py-3 align-top">
                    <span className={
                      'inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ' +
                      (PROPOSAL_KIND_COLOR[kind] ?? 'bg-slate-100 text-slate-700 ring-slate-200')
                    }>
                      {PROPOSAL_KIND_LABEL[kind] ?? kind}
                    </span>
                  </td>
                  {/* V6.5 (2026-06-14): hiện đầy đủ đơn vị nhận + lãnh đạo + người duyệt hiện tại */}
                  <td className="px-3 py-3 align-top text-xs space-y-0.5">
                    {p.recipientUnitName && (
                      <div className="truncate">
                        <span className="text-slate-400">Đơn vị nhận:</span>{' '}
                        <span className="text-slate-700">{p.recipientUnitName}</span>
                      </div>
                    )}
                    {p.nature === 'governance' && typeof p.recipientLeaderName === 'string' && p.recipientLeaderName.trim() && (
                      <div className="truncate">
                        <span className="text-slate-400">Lãnh đạo:</span>{' '}
                        <span className="text-slate-700 font-medium">{p.recipientLeaderName}</span>
                      </div>
                    )}
                    {/* V6.5 (2026-06-14): hasFinancial + estimatedCost (nhất quán toàn UI) */}
                    {p.nature === 'governance' && (p as any).hasFinancial && (
                      <div className="truncate">
                        <span className="text-slate-400">Tài chính:</span>{' '}
                        <span className="text-amber-700 font-medium tabular-nums">
                          {(p as any).estimatedCost > 0
                            ? '₫' + Number((p as any).estimatedCost).toLocaleString('vi-VN')
                            : 'Chưa rõ'}
                        </span>
                      </div>
                    )}
                    <div className="truncate text-slate-700">
                      <span className="text-slate-400">Đang duyệt:</span> {currentApproverDisplay(p)}
                    </div>
                  </td>
                  {/* SLA */}
                  <td className={`px-3 py-3 align-top text-xs tabular-nums ${sla.color}`}>
                    {sla.text}
                  </td>
                  {/* Trạng thái */}
                  <td className="px-3 py-3 align-top">
                    <span className={
                      'inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ' +
                      (PROPOSAL_STATUS_COLOR[p.status] ?? 'bg-slate-100 text-slate-700 ring-slate-200')
                    }>
                      {PROPOSAL_STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-400">
                  Không có đề xuất phù hợp với bộ lọc.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
