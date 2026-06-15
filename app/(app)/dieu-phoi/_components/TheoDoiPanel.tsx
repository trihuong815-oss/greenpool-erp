'use client';

// V6.5 Phase 5 (2026-06-15): Panel "Vấn đề cần xử lý ngay" — GỘP 3 widget cũ
// (BottleneckTable + TopWatchList + ImportantNotiPanel) vào 1 panel với 3 tab
// để giảm noise dashboard, tăng focus.
//
// Lý do gộp (audit anh chốt):
//   - 3 widget cũ hiển thị task chờ từ 3 góc khác nhau → confusion
//   - Chiếm 3 cột × 1 row → cồng kềnh, mobile phải scroll dài
//   - User không biết nên xem cái nào trước
// Giải pháp: 1 card 1 cột full-width, 3 tab tương ứng 3 góc nhìn.

import { useState } from 'react';
import { AlertTriangle, Eye, Bell } from 'lucide-react';
import type { CoordTask } from './types';
import BottleneckTable from './BottleneckTable';
import TopWatchList from './TopWatchList';
import ImportantNotiPanel from './ImportantNotiPanel';

interface Props {
  tasks: CoordTask[];
}

type Tab = 'bottleneck' | 'watch' | 'noti';

const TABS: { key: Tab; label: string; icon: typeof AlertTriangle; color: string }[] = [
  { key: 'bottleneck', label: 'Điểm nghẽn',        icon: AlertTriangle, color: 'rose'    },
  { key: 'watch',      label: 'Theo dõi cá nhân',  icon: Eye,           color: 'sky'     },
  { key: 'noti',       label: 'Thông báo quan trọng', icon: Bell,       color: 'amber'   },
];

export default function TheoDoiPanel({ tasks }: Props) {
  const [active, setActive] = useState<Tab>('bottleneck');

  return (
    <div className="rounded-xl border border-slate-200/70 bg-white shadow-md ring-1 ring-slate-50 overflow-hidden">
      {/* Header + tabs */}
      <div className="border-b border-slate-200 bg-gradient-to-b from-slate-50/60 to-white">
        <div className="flex items-center gap-1 px-2">
          {TABS.map((t) => {
            const isActive = active === t.key;
            const Icon = t.icon;
            const colorClasses = isActive
              ? t.color === 'rose'  ? 'border-rose-500 text-rose-700'
              : t.color === 'sky'   ? 'border-sky-500 text-sky-700'
              :                       'border-amber-500 text-amber-700'
              : 'border-transparent text-slate-600 hover:text-slate-800';
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setActive(t.key)}
                className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${colorClasses} ${isActive ? 'font-bold' : ''}`}
              >
                <Icon size={13} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body — render widget cũ KHÔNG đổi nội bộ, ẩn header card riêng để tránh duplicate */}
      <div className="p-2">
        {active === 'bottleneck' && (
          <div className="[&>div]:rounded-none [&>div]:border-0 [&>div]:shadow-none [&>div]:hover:translate-y-0 [&>div]:hover:shadow-none [&>div]:ring-0">
            <BottleneckTable tasks={tasks} />
          </div>
        )}
        {active === 'watch' && (
          <div className="[&>div]:rounded-none [&>div]:border-0 [&>div]:shadow-none [&>div]:hover:translate-y-0 [&>div]:hover:shadow-none [&>div]:ring-0">
            <TopWatchList tasks={tasks} />
          </div>
        )}
        {active === 'noti' && (
          <div className="[&>div]:rounded-none [&>div]:border-0 [&>div]:shadow-none [&>div]:hover:translate-y-0 [&>div]:hover:shadow-none [&>div]:ring-0">
            <ImportantNotiPanel tasks={tasks} />
          </div>
        )}
      </div>
    </div>
  );
}
