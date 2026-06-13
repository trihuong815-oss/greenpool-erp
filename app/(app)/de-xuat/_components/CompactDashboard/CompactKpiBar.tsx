'use client';

import {
  FileText, Send, Edit, CheckCircle, ArrowRightCircle,
  type LucideIcon,
} from 'lucide-react';
import type { ProposalV6 } from '../types';

// ============================================================
// V6.4 (2026-06-13): COMPACT KPI BAR cho TP/QLCS — đề xuất
//   1. Tôi tạo                (creatorUid=tôi)
//   2. Chờ duyệt              (status ∈ [da_gui, dang_xem_xet])
//   3. Cần bổ sung            (status = yeu_cau_bo_sung)
//   4. Đã phê duyệt           (status = da_phe_duyet)
//   5. Đã chuyển điều phối    (status = chuyen_dieu_phoi)
// ============================================================

export type DexCompactKpiKey =
  | 'toi-tao'
  | 'cho-duyet'
  | 'can-bo-sung'
  | 'da-phe-duyet'
  | 'da-chuyen-dp';

interface Props {
  proposals: ProposalV6[];
  currentUserUid: string;
  active: DexCompactKpiKey | null;
  onSelect: (key: DexCompactKpiKey | null) => void;
}

type AccentKey = 'sky' | 'amber' | 'rose' | 'emerald' | 'violet';

const ICON_WRAP: Record<AccentKey, string> = {
  sky: 'bg-sky-50', amber: 'bg-amber-50', rose: 'bg-rose-50', emerald: 'bg-emerald-50', violet: 'bg-violet-50',
};
const ICON_COLOR: Record<AccentKey, string> = {
  sky: 'text-sky-600', amber: 'text-amber-600', rose: 'text-rose-600', emerald: 'text-emerald-600', violet: 'text-violet-600',
};
const COUNT_COLOR: Record<AccentKey, string> = {
  sky: 'text-sky-600', amber: 'text-amber-600', rose: 'text-rose-600', emerald: 'text-emerald-600', violet: 'text-violet-600',
};

export default function CompactKpiBar({ proposals, currentUserUid, active, onSelect }: Props) {
  let toiTao = 0, choDuyet = 0, canBoSung = 0, daPheDuyet = 0, daChuyenDp = 0;

  for (const p of proposals) {
    if (p.creatorUid === currentUserUid) toiTao += 1;
    const s = String(p.status);
    if (s === 'da_gui' || s === 'dang_xem_xet') choDuyet += 1;
    else if (s === 'yeu_cau_bo_sung') canBoSung += 1;
    else if (s === 'da_phe_duyet' || s === 'dong_y_nguyen_tac') daPheDuyet += 1;
    else if (s === 'chuyen_dieu_phoi') daChuyenDp += 1;
  }

  const items: Array<{ key: DexCompactKpiKey; label: string; sub: string; icon: LucideIcon; accent: AccentKey; count: number }> = [
    { key: 'toi-tao', label: 'Tôi tạo', sub: 'Tổng đề xuất', icon: FileText, accent: 'sky', count: toiTao },
    { key: 'cho-duyet', label: 'Chờ duyệt', sub: 'Đã gửi · Đang xem', icon: Send, accent: 'amber', count: choDuyet },
    { key: 'can-bo-sung', label: 'Cần bổ sung', sub: 'Approver yêu cầu', icon: Edit, accent: 'rose', count: canBoSung },
    { key: 'da-phe-duyet', label: 'Đã phê duyệt', sub: 'Sẵn sàng triển khai', icon: CheckCircle, accent: 'emerald', count: daPheDuyet },
    { key: 'da-chuyen-dp', label: 'Đã chuyển điều phối', sub: 'Đang triển khai', icon: ArrowRightCircle, accent: 'violet', count: daChuyenDp },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = active === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect(isActive ? null : item.key)}
            className={
              'text-left rounded-xl border bg-white p-3.5 shadow-md ring-1 transition hover:-translate-y-0.5 hover:shadow-lg ' +
              (isActive ? 'border-emerald-400 ring-emerald-200' : 'border-slate-200/70 ring-slate-50')
            }
            title={`Lọc bảng theo: ${item.label}`}
          >
            <div className="flex items-start gap-2.5">
              <div className={`rounded-lg p-2 shadow-sm ring-1 ring-inset ring-white/40 ${ICON_WRAP[item.accent]}`}>
                <Icon size={18} className={ICON_COLOR[item.accent]} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{item.label}</div>
                <div className={`mt-0.5 text-2xl font-bold tabular-nums ${COUNT_COLOR[item.accent]}`}>{item.count}</div>
                <div className="mt-0.5 text-[10px] text-slate-400">{item.sub}</div>
              </div>
            </div>
            {isActive && <div className="mt-1.5 text-[10px] font-medium text-emerald-600">● Đang lọc — click để bỏ</div>}
          </button>
        );
      })}
    </div>
  );
}
