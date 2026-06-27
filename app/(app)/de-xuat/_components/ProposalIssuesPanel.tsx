'use client';

// PR-PROPOSAL-RESTRUCTURE (2026-06-27): TIER 3 tab "Vấn đề" — extract "Điểm nghẽn
// đề xuất" từ DexuatDashboard.tsx (660 LOC) thành component độc lập.
// Logic giữ NGUYÊN — chỉ move + extract IIFE inline thành function rõ.
//
// 3 section nội bộ (giống TheoDoiPanel /dieu-phoi):
//   1. Người duyệt giữ nhiều — top 3 approver đang giữ ≥1 ĐX pending
//   2. Đề xuất chờ lâu nhất  — top 3 ĐX có hours chờ cao nhất
//   3. Tồn theo khối tạo     — KD vs VP với progress bar

import type { ProposalV6 as DashboardProposalV6 } from './dashboard-types';

interface Props {
  proposals: DashboardProposalV6[];
}

interface ApproverRow {
  key: string;
  name: string;
  holding: number;
  longestHours: number;
}

interface LongestRow {
  id: string;
  code: string;
  title: string;
  hours: number;
  approver: string;
}

function fmtHours(h: number): string {
  return h < 24 ? `${Math.round(h)}h` : `${(h / 24).toFixed(1)} ngày`;
}

function aggregate(proposals: DashboardProposalV6[], nowMs: number) {
  const approverGroups = new Map<string, ApproverRow>();
  const longest: LongestRow[] = [];
  const blockTon = { KD: 0, VP: 0 };

  for (const p of proposals as Array<DashboardProposalV6 & {
    creatorBlock?: 'KD' | 'VP';
  }>) {
    const pending = ['da_gui', 'dang_xem_xet', 'yeu_cau_bo_sung'].includes(p.status);
    if (!pending) continue;

    const baseIso = p.updatedAt || p.createdAt;
    const hrs = baseIso ? (nowMs - new Date(baseIso).getTime()) / 3_600_000 : 0;
    const cur = p.approverChain?.[p.approverIdx];
    const curObj = typeof cur === 'string' ? null : cur;
    const aprName = curObj?.name || curObj?.roleCode || 'Chưa xác định';

    if (curObj) {
      const key = curObj.uid || curObj.roleCode || aprName;
      const existing = approverGroups.get(key);
      if (!existing) {
        approverGroups.set(key, { key, name: aprName, holding: 1, longestHours: hrs });
      } else {
        existing.holding += 1;
        if (hrs > existing.longestHours) existing.longestHours = hrs;
      }
    }

    longest.push({ id: p.id, code: p.code, title: p.title, hours: hrs, approver: aprName });

    if (p.creatorBlock === 'KD') blockTon.KD += 1;
    else if (p.creatorBlock === 'VP') blockTon.VP += 1;
  }

  return {
    topApprovers: Array.from(approverGroups.values())
      .sort((a, b) => b.holding - a.holding || b.longestHours - a.longestHours)
      .slice(0, 3),
    topLongest: longest.sort((a, b) => b.hours - a.hours).slice(0, 3),
    blockTon,
    totalPending: blockTon.KD + blockTon.VP,
  };
}

export default function ProposalIssuesPanel({ proposals }: Props) {
  const { topApprovers, topLongest, blockTon, totalPending } = aggregate(proposals, Date.now());

  if (topApprovers.length === 0 && totalPending === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-8 text-center text-sm text-emerald-600 font-medium">
        ✓ Không có điểm nghẽn
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden divide-y divide-slate-100">
      {topApprovers.length > 0 && (
        <div className="px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
            Người duyệt giữ nhiều
          </div>
          {topApprovers.map((r) => (
            <div key={r.key} className="flex items-center justify-between py-1.5 text-sm">
              <span className="truncate text-slate-800 font-medium">{r.name}</span>
              <span className="shrink-0 ml-2 inline-flex items-center gap-2">
                <span className="tabular-nums text-slate-600 text-xs">{r.holding} ĐX</span>
                <span className="tabular-nums text-rose-600 text-xs font-semibold">{fmtHours(r.longestHours)}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {topLongest.length > 0 && (
        <div className="px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
            Đề xuất chờ lâu nhất
          </div>
          {topLongest.map((r) => (
            <div key={r.id} className="py-1.5">
              <div className="text-sm font-medium text-slate-800 truncate" title={r.title}>{r.title}</div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                <span className="tabular-nums">#{r.code}</span>
                <span>·</span>
                <span className="text-rose-600 font-semibold tabular-nums">Chờ {fmtHours(r.hours)}</span>
                <span>·</span>
                <span className="truncate">tại {r.approver}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPending > 0 && (
        <div className="px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
            Tồn theo khối tạo
          </div>
          <div className="space-y-1.5">
            {[
              { label: 'Khối Kinh doanh', n: blockTon.KD, color: 'bg-emerald-500' },
              { label: 'Khối Văn phòng',  n: blockTon.VP, color: 'bg-violet-500' },
            ].map((b) => {
              const pct = totalPending === 0 ? 0 : Math.round((b.n / totalPending) * 100);
              return (
                <div key={b.label}>
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span className="text-slate-700">{b.label}</span>
                    <span className="tabular-nums text-slate-600">
                      {b.n} <span className="text-slate-400">({pct}%)</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-full ${b.color}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
