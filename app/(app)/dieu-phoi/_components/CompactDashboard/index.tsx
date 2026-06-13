'use client';

import { useState } from 'react';
import type { CoordTask } from '../types';
import CompactKpiBar, { type CompactKpiKey } from './CompactKpiBar';
import UnitPerformanceBar from './UnitPerformanceBar';
import StatusDonut from './StatusDonut';
import CompactCoordTable from './CompactCoordTable';

// ============================================================
// V6.4 (2026-06-13): Dashboard COMPACT cho TP/QLCS
//   Spec anh chốt:
//   - Ẩn toàn bộ phân tích hệ thống (BlockDonut/DeptBarChart/BranchBarChart + 3 panel Theo dõi)
//   - 5 KPI cá nhân hoá (click-to-filter)
//   - 2 widget phân tích: Hiệu suất đơn vị + Donut status
//   - Bảng 6 cột + 5 tabs
// ============================================================

interface Props {
  tasks: CoordTask[];
  currentUserUid: string;
  currentUserDeptId: string | null;
  currentUserFacilityId: string | null;
  unitLabel: string; // 'TP Đào tạo' / 'QLCS Hoàng Mai' để hiện ở widget Hiệu suất
  onRowClick: (t: CoordTask) => void;
}

export default function CompactDashboard({
  tasks, currentUserUid, currentUserDeptId, currentUserFacilityId, unitLabel, onRowClick,
}: Props) {
  const [filterKey, setFilterKey] = useState<CompactKpiKey | null>(null);

  return (
    <div className="space-y-5">
      {/* Section: Tổng quan KPI */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Tổng quan</span>
          <span className="flex-1 h-px bg-gradient-to-r from-slate-200 to-transparent" />
        </div>
        <CompactKpiBar
          tasks={tasks}
          currentUserUid={currentUserUid}
          currentUserDeptId={currentUserDeptId}
          currentUserFacilityId={currentUserFacilityId}
          active={filterKey}
          onSelect={setFilterKey}
        />
      </section>

      {/* Section: Phân tích cá nhân */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Phân tích</span>
          <span className="flex-1 h-px bg-gradient-to-r from-slate-200 to-transparent" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <UnitPerformanceBar
            tasks={tasks}
            currentUserUid={currentUserUid}
            currentUserDeptId={currentUserDeptId}
            currentUserFacilityId={currentUserFacilityId}
            unitLabel={unitLabel}
          />
          <StatusDonut
            tasks={tasks}
            currentUserUid={currentUserUid}
            currentUserDeptId={currentUserDeptId}
            currentUserFacilityId={currentUserFacilityId}
          />
        </div>
      </section>

      {/* Section: Danh sách điều phối */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Danh sách điều phối</span>
          <span className="flex-1 h-px bg-gradient-to-r from-slate-200 to-transparent" />
        </div>
        <CompactCoordTable
          tasks={tasks}
          currentUserUid={currentUserUid}
          currentUserDeptId={currentUserDeptId}
          currentUserFacilityId={currentUserFacilityId}
          onRowClick={onRowClick}
          externalFilter={filterKey}
        />
      </section>
    </div>
  );
}
