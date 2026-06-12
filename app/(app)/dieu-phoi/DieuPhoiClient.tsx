'use client';

import { useCallback, useEffect, useState } from 'react';
import { Calendar, ChevronDown, Loader2, Plus, RefreshCw } from 'lucide-react';
import KpiBar from './_components/KpiBar';
import BlockDonut from './_components/BlockDonut';
import DeptBarChart from './_components/DeptBarChart';
import BranchBarChart from './_components/BranchBarChart';
import BottleneckTable from './_components/BottleneckTable';
import TopWatchList from './_components/TopWatchList';
import ImportantNotiPanel from './_components/ImportantNotiPanel';
import CoordinationTable from './_components/CoordinationTable';
import CreateModal, { type CreatePayload } from './_components/CreateModal';
import DetailDrawer from './_components/DetailDrawer';
import { tasksApi } from '@/lib/services/tasks/api-client';
import type { CoordTask } from './_components/types';
import { adaptTask } from './_lib/adapter';

interface DieuPhoiClientProps {
  currentUserUid: string;
  currentUserName: string;
  currentUserRole: string;
}

export default function DieuPhoiClient({ currentUserUid }: DieuPhoiClientProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<CoordTask | null>(null);
  const [tasks, setTasks] = useState<CoordTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    tasksApi.list({ mode: 'all' })
      .then((rows) => { if (!cancelled) setTasks(rows.map(adaptTask)); })
      .catch((e) => { if (!cancelled) setError(e?.message ?? 'Lỗi tải dữ liệu điều phối'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const handleCreate = useCallback(async (payload: CreatePayload) => {
    try {
      // V1: map CreatePayload → TaskCreate body cũ /api/tasks
      const body: any = {
        kind: payload.type === 'de_xuat' || payload.type === 'phe_duyet' ? 'proposal' : 'assignment',
        title: payload.title,
        description: [
          payload.description,
          payload.objective ? `\n— Mục tiêu: ${payload.objective}` : '',
          payload.finalDeliverable ? `\n— Kết quả bàn giao: ${payload.finalDeliverable}` : '',
        ].filter(Boolean).join(''),
        priority: payload.priority,
        dueDate: payload.deadline || null,
        assigneeBlock: payload.ownerBlock || 'KD',
        assigneeDeptId: payload.ownerUnit && !['HM','NCT24','LD','TT','TK','CG'].includes(payload.ownerUnit) ? payload.ownerUnit : null,
        assigneeFacilityId: ['HM','NCT24','LD','TT','TK','CG'].includes(payload.ownerUnit) ? payload.ownerUnit : null,
        assigneeUserIds: [],
        goal: payload.objective || null,
        expectedDeliverable: payload.finalDeliverable || null,
        collaboratorDeptIds: payload.collaborators.filter((c) => !['HM','NCT24','LD','TT','TK','CG'].includes(c.unit)).map((c) => c.unit).filter(Boolean),
        collaboratorFacilityIds: payload.collaborators.filter((c) => ['HM','NCT24','LD','TT','TK','CG'].includes(c.unit)).map((c) => c.unit),
        collaboratorRoles: Object.fromEntries(
          payload.collaborators
            .filter((c) => c.unit && c.supportContent)
            .map((c) => {
              const prefix = ['HM','NCT24','LD','TT','TK','CG'].includes(c.unit) ? 'facility' : 'dept';
              return [`${prefix}:${c.unit}`, c.supportContent];
            }),
        ),
      };
      await tasksApi.create(body);
      setShowCreate(false);
      reload();
    } catch (e: any) {
      alert(`Tạo điều phối thất bại: ${e?.message ?? 'lỗi không xác định'}`);
    }
  }, [reload]);

  return (
    <div className="max-w-screen-2xl mx-auto">
      <div className="space-y-4">
        {/* Filter strip */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm">
              <Calendar size={14} className="text-slate-400" />
              <span className="tabular-nums">{new Date().toLocaleDateString('vi-VN')}</span>
            </div>
            <button type="button" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm hover:bg-slate-50">
              Tất cả khối <ChevronDown size={14} className="text-slate-400" />
            </button>
            <button type="button" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm hover:bg-slate-50">
              Tất cả cơ sở <ChevronDown size={14} className="text-slate-400" />
            </button>
            <button type="button" onClick={reload} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-sm hover:bg-slate-50" title="Tải lại">
              <RefreshCw size={14} className={loading ? 'animate-spin text-slate-400' : 'text-slate-500'} />
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

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
            ⚠ {error}
          </div>
        )}

        {loading && tasks.length === 0 ? (
          <div className="py-16 flex items-center justify-center text-slate-400">
            <Loader2 className="animate-spin mr-2" size={18} /> Đang tải dữ liệu điều phối…
          </div>
        ) : (
          <>
            <KpiBar tasks={tasks} currentUserUid={currentUserUid} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <BlockDonut tasks={tasks} />
              <DeptBarChart tasks={tasks} />
              <BranchBarChart tasks={tasks} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <BottleneckTable tasks={tasks} />
              <TopWatchList tasks={tasks} />
              <ImportantNotiPanel tasks={tasks} />
            </div>

            <CoordinationTable
              tasks={tasks}
              onRowClick={setSelected}
              currentUserUid={currentUserUid}
            />
          </>
        )}
      </div>

      {showCreate && <CreateModal open onClose={() => setShowCreate(false)} onCreate={handleCreate} />}
      <DetailDrawer task={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
