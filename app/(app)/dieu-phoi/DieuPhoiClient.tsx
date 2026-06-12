'use client';

import { useState } from 'react';
import { Calendar, ChevronDown, Plus } from 'lucide-react';
import KpiBar from './_components/KpiBar';
import BlockDonut from './_components/BlockDonut';
import DeptBarChart from './_components/DeptBarChart';
import BranchBarChart from './_components/BranchBarChart';
import BottleneckTable from './_components/BottleneckTable';
import TopWatchList from './_components/TopWatchList';
import ImportantNotiPanel from './_components/ImportantNotiPanel';
import TodayAgenda from './_components/TodayAgenda';
import CoordinationTable from './_components/CoordinationTable';
import CreateModal from './_components/CreateModal';
import DetailDrawer from './_components/DetailDrawer';
import { MOCK_TASKS } from './_components/mockData';
import type { CoordTask } from './_components/types';

interface DieuPhoiClientProps {
  currentUserUid: string;
  currentUserName: string;
  currentUserRole: string;
}

export default function DieuPhoiClient({ currentUserUid }: DieuPhoiClientProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<CoordTask | null>(null);
  const tasks = MOCK_TASKS;

  return (
    <div className="max-w-screen-2xl mx-auto">
      <div className="flex flex-col xl:flex-row gap-4">
        {/* Cột main bên trái sidebar */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Filter strip — date range, khối, cơ sở, nút tạo mới */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm">
                <Calendar size={14} className="text-slate-400" />
                <span className="tabular-nums">12/06/2026 - 12/06/2026</span>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm hover:bg-slate-50"
              >
                Tất cả khối
                <ChevronDown size={14} className="text-slate-400" />
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm hover:bg-slate-50"
              >
                Tất cả cơ sở
                <ChevronDown size={14} className="text-slate-400" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 shadow-sm"
            >
              <Plus size={15} /> Tạo điều phối mới
              <ChevronDown size={14} className="opacity-80" />
            </button>
          </div>

          {/* Tầng 1 — 5 KPI cards */}
          <KpiBar tasks={tasks} currentUserUid={currentUserUid} />

          {/* Tầng 2 — Donut + 2 bar chart */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <BlockDonut tasks={tasks} />
            <DeptBarChart />
            <BranchBarChart />
          </div>

          {/* Tầng 3 — Điểm nghẽn + Top việc cần quan tâm + Thông báo quan trọng */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <BottleneckTable />
            <TopWatchList />
            <ImportantNotiPanel />
          </div>

          {/* Tầng 4 — Bảng điều phối full width */}
          <CoordinationTable
            tasks={tasks}
            onRowClick={setSelected}
            currentUserUid={currentUserUid}
          />
        </div>

        {/* Aside phải — Lịch hôm nay (sticky trên desktop) */}
        <aside className="w-full xl:w-[300px] xl:flex-shrink-0 xl:sticky xl:top-4 xl:self-start">
          <TodayAgenda />
        </aside>
      </div>

      {showCreate && <CreateModal open onClose={() => setShowCreate(false)} />}
      <DetailDrawer task={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
