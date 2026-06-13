'use client';

import {
  FileText, Send, Edit, CheckCircle, ArrowRightCircle,
  type LucideIcon,
} from 'lucide-react';
import type { ProposalV6 } from '../types';

// V6.4 (2026-06-13): 5 KPI vuốt ngang mobile cho /de-xuat.

export type MobileKpiKey =
  | 'toi-tao' | 'cho-duyet' | 'can-bo-sung' | 'da-phe-duyet' | 'da-chuyen-dp';

interface Props {
  proposals: ProposalV6[];
  currentUserUid: string;
  active: MobileKpiKey | null;
  onSelect: (k: MobileKpiKey | null) => void;
}

const ACCENT: Record<string, { wrap: string; icon: string; count: string; ring: string }> = {
  sky: { wrap: 'bg-sky-50', icon: 'text-sky-600', count: 'text-sky-600', ring: 'ring-sky-200' },
  amber: { wrap: 'bg-amber-50', icon: 'text-amber-600', count: 'text-amber-600', ring: 'ring-amber-200' },
  rose: { wrap: 'bg-rose-50', icon: 'text-rose-600', count: 'text-rose-600', ring: 'ring-rose-200' },
  emerald: { wrap: 'bg-emerald-50', icon: 'text-emerald-600', count: 'text-emerald-600', ring: 'ring-emerald-200' },
  violet: { wrap: 'bg-violet-50', icon: 'text-violet-600', count: 'text-violet-600', ring: 'ring-violet-200' },
};

export default function SwipeKpiBar({ proposals, currentUserUid, active, onSelect }: Props) {
  let toiTao = 0, choDuyet = 0, canBoSung = 0, daPheDuyet = 0, daChuyenDp = 0;
  for (const p of proposals) {
    if (p.creatorUid === currentUserUid) toiTao += 1;
    const s = String(p.status);
    if (s === 'da_gui' || s === 'dang_xem_xet') choDuyet += 1;
    else if (s === 'yeu_cau_bo_sung') canBoSung += 1;
    else if (s === 'da_phe_duyet' || s === 'dong_y_nguyen_tac') daPheDuyet += 1;
    else if (s === 'chuyen_dieu_phoi') daChuyenDp += 1;
  }

  const items: Array<{ key: MobileKpiKey; label: string; icon: LucideIcon; accent: string; count: number }> = [
    { key: 'toi-tao', label: 'Tôi tạo', icon: FileText, accent: 'sky', count: toiTao },
    { key: 'cho-duyet', label: 'Chờ duyệt', icon: Send, accent: 'amber', count: choDuyet },
    { key: 'can-bo-sung', label: 'Cần bổ sung', icon: Edit, accent: 'rose', count: canBoSung },
    { key: 'da-phe-duyet', label: 'Đã duyệt', icon: CheckCircle, accent: 'emerald', count: daPheDuyet },
    { key: 'da-chuyen-dp', label: 'Đã chuyển ĐP', icon: ArrowRightCircle, accent: 'violet', count: daChuyenDp },
  ];

  return (
    <div className="-mx-4 px-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory">
      <div className="flex gap-3 pb-1">
        {items.map((item) => {
          const Icon = item.icon;
          const a = ACCENT[item.accent];
          const isActive = active === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelect(isActive ? null : item.key)}
              className={
                'snap-start shrink-0 w-[148px] rounded-2xl bg-white shadow-sm p-3.5 transition active:scale-95 ' +
                'ring-1 ' + (isActive ? `${a.ring} ring-2` : 'ring-slate-200')
              }
            >
              <div className={`inline-flex rounded-xl p-2 ${a.wrap} mb-2`}>
                <Icon size={18} className={a.icon} />
              </div>
              <div className={`text-3xl font-bold tabular-nums ${a.count} leading-none`}>{item.count}</div>
              <div className="text-[12px] font-medium text-slate-600 mt-1.5 truncate">{item.label}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
