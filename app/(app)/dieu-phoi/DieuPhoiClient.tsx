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
import { canCreateCoord } from './_lib/permissions';

interface DieuPhoiClientProps {
  currentUserUid: string;
  currentUserName: string;
  currentUserRole: string;
}

export default function DieuPhoiClient({ currentUserUid, currentUserRole }: DieuPhoiClientProps) {
  const canCreate = canCreateCoord(currentUserRole);
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

  // V1: chỉ log + alert (chưa có API per-collab status).
  // V2 sẽ wire vào endpoint riêng — vd PATCH /api/tasks/:id/collaborator/:collabId.
  const handleAcceptCollab = useCallback((taskId: string, collabId: string) => {
    console.log('[dieu-phoi] accept collab', { taskId, collabId });
    alert('V1: Đã ghi nhận TIẾP NHẬN (chưa có API). V2 sẽ persist lên server.');
  }, []);
  const handleRejectCollab = useCallback((taskId: string, collabId: string, reason: string) => {
    console.log('[dieu-phoi] reject collab', { taskId, collabId, reason });
    alert(`V1: Đã ghi nhận TỪ CHỐI — lý do: "${reason}". V2 sẽ persist.`);
  }, []);
  const handleCompleteCollab = useCallback((taskId: string, collabId: string) => {
    console.log('[dieu-phoi] complete collab', { taskId, collabId });
    alert('V1: Đã ghi nhận HOÀN THÀNH (chưa có API). V2 sẽ persist.');
  }, []);

  const handleCreate = useCallback(async (payload: CreatePayload) => {
    try {
      // V1 (transition): map CreateCoordPayload (V2 shape) → TaskCreate body cũ /api/tasks.
      // collaborators[i].unitId có dạng 'DEPT:KE' | 'BRANCH:HM' → tách prefix.
      const FACILITY_IDS = ['HM', 'NCT24', 'LD', 'TT', 'TK', 'CG'];
      const ownerIsFacility = payload.ownerBlock === 'KD' && FACILITY_IDS.includes(payload.ownerDeptId);
      const collaboratorDeptIds: string[] = [];
      const collaboratorFacilityIds: string[] = [];
      const collaboratorRoles: Record<string, string> = {};
      for (const c of payload.collaborators) {
        if (!c.unitId) continue;
        const [prefix, rawId] = c.unitId.split(':');
        if (!prefix || !rawId) continue;
        if (prefix === 'DEPT') {
          collaboratorDeptIds.push(rawId);
          collaboratorRoles[`dept:${rawId}`] = c.supportContent;
        } else if (prefix === 'BRANCH') {
          collaboratorFacilityIds.push(rawId);
          collaboratorRoles[`facility:${rawId}`] = c.supportContent;
        }
      }
      const body: any = {
        kind: payload.type === 'de_xuat' || payload.type === 'phe_duyet' ? 'proposal' : 'assignment',
        title: payload.title,
        description: [
          payload.description,
          payload.objective ? `\n— Mục tiêu: ${payload.objective}` : '',
          payload.finalDeliverable ? `\n— Kết quả bàn giao: ${payload.finalDeliverable}` : '',
        ].filter(Boolean).join(''),
        priority: payload.priority,
        dueDate: payload.dueDate || null,
        assigneeBlock: payload.ownerBlock || 'KD',
        assigneeDeptId: ownerIsFacility ? null : payload.ownerDeptId || null,
        assigneeFacilityId: ownerIsFacility ? payload.ownerDeptId : null,
        assigneeUserIds: payload.ownerUid ? [payload.ownerUid] : [],
        ownerUid: payload.ownerUid,
        ownerName: payload.ownerName,
        goal: payload.objective || null,
        expectedDeliverable: payload.finalDeliverable || null,
        collaboratorDeptIds,
        collaboratorFacilityIds,
        collaboratorRoles,
        approverUid: payload.approverUid ?? null,
        approverName: payload.approverName ?? null,
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
            onClick={() => canCreate && setShowCreate(true)}
            disabled={!canCreate}
            title={canCreate ? 'Tạo điều phối mới' : 'Bạn không có quyền tạo điều phối'}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg shadow-sm ${
              canCreate
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-slate-200 text-slate-500 cursor-not-allowed'
            }`}
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
      <DetailDrawer
        task={selected}
        currentUserUid={currentUserUid}
        currentUserRole={currentUserRole}
        onClose={() => setSelected(null)}
        onAcceptCollab={handleAcceptCollab}
        onRejectCollab={handleRejectCollab}
        onCompleteCollab={handleCompleteCollab}
      />
    </div>
  );
}
