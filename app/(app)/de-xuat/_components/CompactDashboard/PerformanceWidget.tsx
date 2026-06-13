'use client';

import { useMemo } from 'react';
import type { ProposalV6 } from '../types';

// ============================================================
// V6.4 (2026-06-13): Hiệu suất đề xuất của tôi — 3 metric:
//   - Tỷ lệ được duyệt    (da_phe_duyet OR chuyen_dieu_phoi) / total đã có quyết định
//   - Tỷ lệ bị từ chối    (tu_choi) / total đã có quyết định
//   - Tỷ lệ đã triển khai (chuyen_dieu_phoi) / total đã duyệt
// Chỉ tính đề xuất tôi tạo + đã có quyết định cuối (loại nhap/da_gui/dang_xem_xet/yeu_cau_bo_sung).
// ============================================================

interface Props {
  proposals: ProposalV6[];
  currentUserUid: string;
}

const PENDING = new Set(['nhap', 'da_gui', 'dang_xem_xet', 'yeu_cau_bo_sung']);
const APPROVED = new Set(['da_phe_duyet', 'dong_y_nguyen_tac', 'chuyen_dieu_phoi', 'dong_ho_so']);
const REJECTED = new Set(['tu_choi']);
const IMPLEMENTED = new Set(['chuyen_dieu_phoi', 'dong_ho_so']);

export default function PerformanceWidget({ proposals, currentUserUid }: Props) {
  const stats = useMemo(() => {
    let mine = 0, decided = 0, approved = 0, rejected = 0, implemented = 0;
    for (const p of proposals) {
      if (p.creatorUid !== currentUserUid) continue;
      mine += 1;
      const s = String(p.status);
      if (PENDING.has(s)) continue;
      decided += 1;
      if (APPROVED.has(s)) approved += 1;
      else if (REJECTED.has(s)) rejected += 1;
      if (IMPLEMENTED.has(s)) implemented += 1;
    }
    const safeDecided = decided === 0 ? 1 : decided;
    const safeApproved = approved === 0 ? 1 : approved;
    return {
      mine, decided,
      approvedPct: Math.round((approved / safeDecided) * 100),
      rejectedPct: Math.round((rejected / safeDecided) * 100),
      implementedPct: Math.round((implemented / safeApproved) * 100),
      approved, rejected, implemented,
    };
  }, [proposals, currentUserUid]);

  return (
    <div className="rounded-xl border border-slate-200/70 bg-white p-4 shadow-md ring-1 ring-slate-50 transition hover:-translate-y-0.5 hover:shadow-lg">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        Hiệu suất đề xuất của tôi
      </h3>

      {stats.mine === 0 ? (
        <p className="text-[11px] text-slate-400 italic text-center py-6">Anh chưa tạo đề xuất nào.</p>
      ) : stats.decided === 0 ? (
        <p className="text-[11px] text-slate-400 italic text-center py-6">
          {stats.mine} đề xuất đang chờ quyết định — chưa có hiệu suất.
        </p>
      ) : (
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-semibold text-emerald-700">Được duyệt</span>
              <span className="tabular-nums text-slate-600">
                {stats.approved}/{stats.decided} <span className="text-emerald-600 font-semibold">({stats.approvedPct}%)</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden shadow-inner">
              <div className="h-full rounded-full shadow-sm" style={{ width: `${stats.approvedPct}%`, background: 'linear-gradient(90deg, #34d399, #10b981)' }} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-semibold text-rose-700">Bị từ chối</span>
              <span className="tabular-nums text-slate-600">
                {stats.rejected}/{stats.decided} <span className="text-rose-600 font-semibold">({stats.rejectedPct}%)</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden shadow-inner">
              <div className="h-full rounded-full shadow-sm" style={{ width: `${stats.rejectedPct}%`, background: 'linear-gradient(90deg, #fb7185, #e11d48)' }} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-semibold text-violet-700">Đã triển khai</span>
              <span className="tabular-nums text-slate-600">
                {stats.implemented}/{stats.approved || 0} <span className="text-violet-600 font-semibold">({stats.implementedPct}%)</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden shadow-inner">
              <div className="h-full rounded-full shadow-sm" style={{ width: `${stats.implementedPct}%`, background: 'linear-gradient(90deg, #a78bfa, #8b5cf6)' }} />
            </div>
          </div>

          <div className="pt-2 mt-2 border-t border-slate-100 text-[11px] text-slate-500 text-center">
            Đã ra quyết định: <span className="font-semibold tabular-nums text-slate-700">{stats.decided}</span>
            {' '}/ Tổng tạo: <span className="font-semibold tabular-nums text-slate-700">{stats.mine}</span>
          </div>
        </div>
      )}
    </div>
  );
}
