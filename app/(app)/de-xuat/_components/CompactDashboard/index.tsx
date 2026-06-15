'use client';

import { useState } from 'react';
import type { ProposalV6 } from '../types';
import CompactKpiBar, { type DexCompactKpiKey } from './CompactKpiBar';
import TypeDonut from './TypeDonut';
import PerformanceWidget from './PerformanceWidget';
import CompactProposalTable from './CompactProposalTable';

// ============================================================
// V6.4 (2026-06-13): Dashboard COMPACT cho TP/QLCS — đề xuất
//   Spec anh chốt:
//   - 5 KPI: Tôi tạo / Chờ duyệt / Cần bổ sung / Đã phê duyệt / Đã chuyển ĐP
//   - 2 widget: Donut loại + Hiệu suất duyệt/từ chối/triển khai
//   - Bảng 5 cột: Đề xuất | Loại | Người duyệt hiện tại | SLA | Trạng thái
//   - 5 tabs
// ============================================================

interface Props {
  proposals: ProposalV6[];
  currentUserUid: string;
  onRowClick: (p: ProposalV6) => void;
  /** V6.5 Audit fix Phase D.2 (2026-06-15): khối của user — hiển thị context "Đang xem khối X". */
  userBlock?: 'KD' | 'VP' | null;
}

export default function CompactDashboard({ proposals, currentUserUid, onRowClick, userBlock }: Props) {
  const [filterKey, setFilterKey] = useState<DexCompactKpiKey | null>(null);

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Tổng quan</span>
          {/* V6.5 Phase D.2: context indicator cho TP/QLCS biết scope view */}
          {userBlock && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
              👤 Khối {userBlock === 'KD' ? 'Kinh doanh' : 'Văn phòng'} — đề xuất tôi tham gia
            </span>
          )}
          <span className="flex-1 h-px bg-gradient-to-r from-slate-200 to-transparent" />
        </div>
        <CompactKpiBar proposals={proposals} currentUserUid={currentUserUid} active={filterKey} onSelect={setFilterKey} />
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Phân tích</span>
          <span className="flex-1 h-px bg-gradient-to-r from-slate-200 to-transparent" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TypeDonut proposals={proposals} currentUserUid={currentUserUid} />
          <PerformanceWidget proposals={proposals} currentUserUid={currentUserUid} />
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Danh sách đề xuất</span>
          <span className="flex-1 h-px bg-gradient-to-r from-slate-200 to-transparent" />
        </div>
        <CompactProposalTable
          proposals={proposals}
          currentUserUid={currentUserUid}
          onRowClick={onRowClick}
          externalFilter={filterKey}
        />
      </section>
    </div>
  );
}
