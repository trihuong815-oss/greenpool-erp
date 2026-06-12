'use client';

// ============================================================
// DieuPhoiClient — Integration V4 (Phase 3, 2026-06-12)
// ------------------------------------------------------------
// - Wire CreateModal V4 + DetailDrawer V4 + adapter V4
// - Pure client-side state mutation (optimistic) — server endpoint
//   per-collab CHƯA có (V5 backlog: /api/coord-tasks/[id]/...).
//   Tất cả 9 handler dùng:
//     1) workflow-engine.ts để tính next CoordStatus
//     2) coord-notifications.ts để build NotificationTrigger[]
//     3) console.log + alert (V1 contract — backend wire ở V5)
// - handleCreate: dùng tasksApi.create (vẫn map CreatePayload V4 → TaskCreate body cũ /api/tasks)
// - currentUserUid / currentUserRole pass xuống DetailDrawer + KpiBar.
// - Tiếng Việt CÓ DẤU đầy đủ (không mojibake).
// ============================================================

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
import { tasksApi, type TaskCreate, type TaskPriority } from '@/lib/services/tasks/api-client';
import type { CoordTask, Collaborator, CollabStatus, CoordStatus } from './_components/types';
import { adaptTask } from './_lib/adapter';
import { canCreateCoord } from './_lib/permissions';
import {
  nextStatusAfterCollabUpdate,
  computeProgress,
  type CoordTaskV4,
} from './_lib/workflow-engine';
import {
  notifyOnCreate,
  notifyOnCollabSubmit,
  notifyOnCollabAccepted,
  notifyOnCollabRejected,
  notifyOnAllCollabDone,
  notifyOnCoordComplete,
  type NotificationTrigger,
} from './_lib/coord-notifications';

interface DieuPhoiClientProps {
  currentUserUid: string;
  currentUserName: string;
  currentUserRole: string;
}

/**
 * V1 helper: emit notifications -> console (V5 sẽ wire FCM thật).
 */
function emitNotifications(label: string, triggers: NotificationTrigger[]): void {
  if (!triggers.length) return;
  // eslint-disable-next-line no-console
  console.log(`[dieu-phoi][noti] ${label}`, triggers);
}

/**
 * Helper update 1 collaborator trong CoordTask (immutable).
 * Sau khi patch collab → recompute task.status theo workflow-engine.
 */
function patchCollab(
  task: CoordTask,
  collabId: string,
  patch: Partial<Collaborator>,
): CoordTask {
  const nextCollabs = task.collaborators.map((c) =>
    c.id === collabId ? { ...c, ...patch } : c,
  );
  const draft: CoordTask = { ...task, collaborators: nextCollabs };
  const nextStatus = nextStatusAfterCollabUpdate(draft as CoordTaskV4);
  return { ...draft, status: nextStatus, updatedAt: new Date().toISOString() };
}

export default function DieuPhoiClient({
  currentUserUid,
  currentUserName,
  currentUserRole,
}: DieuPhoiClientProps) {
  const canCreate = canCreateCoord(currentUserRole);
  const [showCreate, setShowCreate] = useState(false);
  /** V6.2: task đang được sửa (null = chế độ tạo mới). */
  const [editingTask, setEditingTask] = useState<CoordTask | null>(null);
  const [selected, setSelected] = useState<CoordTask | null>(null);
  const [tasks, setTasks] = useState<CoordTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    tasksApi
      .list({ mode: 'all' })
      .then((rows) => {
        if (!cancelled) setTasks(rows.map(adaptTask));
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? 'Lỗi tải dữ liệu điều phối');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Helper: cập nhật 1 task vào state + cập nhật selected drawer.
  const applyTaskUpdate = useCallback((next: CoordTask) => {
    setTasks((prev) => prev.map((t) => (t.id === next.id ? next : t)));
    setSelected((sel) => (sel && sel.id === next.id ? next : sel));
  }, []);

  // ============================================================
  // 1. handleCreate — POST /api/tasks (giữ adapter map V4→V3 body)
  // ============================================================
  const handleCreate = useCallback(
    async (payload: CreatePayload) => {
      try {
        const FACILITY_IDS = ['HM', 'NCT24', 'TK', 'TT', 'CTT'];
        const ownerIsFacility =
          payload.ownerBlock === 'KD' && FACILITY_IDS.includes(payload.ownerUnitId);
        const collaboratorDeptIds: string[] = [];
        const collaboratorFacilityIds: string[] = [];
        const collaboratorRoles: Record<string, string> = {};
        // V6.2 fix: lưu deadline RIÊNG cho mỗi collab (anh chốt — user nhập 13/6 cho
        // Kỹ thuật, deadline tổng 20/6 → adapter cần đọc riêng).
        const collaboratorDeadlines: Record<string, string> = {};
        for (const c of payload.collaborators) {
          if (!c.unitId) continue;
          const [prefix, rawId] = c.unitId.split(':');
          if (!prefix || !rawId) continue;
          if (prefix === 'DEPT') {
            collaboratorDeptIds.push(rawId);
            collaboratorRoles[`dept:${rawId}`] = c.supportContent;
            if (c.deadline) collaboratorDeadlines[`dept:${rawId}`] = c.deadline;
          } else if (prefix === 'BRANCH') {
            collaboratorFacilityIds.push(rawId);
            collaboratorRoles[`facility:${rawId}`] = c.supportContent;
            if (c.deadline) collaboratorDeadlines[`facility:${rawId}`] = c.deadline;
          }
        }

        const description = [
          payload.description,
          payload.objective ? `\n— Mục tiêu: ${payload.objective}` : '',
          payload.finalDeliverable ? `\n— Kết quả bàn giao: ${payload.finalDeliverable}` : '',
        ]
          .filter(Boolean)
          .join('');

        const priority: TaskPriority =
          payload.severity === 'khan_cap'
            ? 'high'
            : payload.level === 'trong_diem'
              ? 'high'
              : 'normal';

        const body: TaskCreate = {
          kind: 'assignment',
          title: payload.title,
          description,
          priority,
          dueDate: payload.dueDate || null,
          assigneeBlock: payload.ownerBlock || 'KD',
          assigneeDeptId: ownerIsFacility ? null : payload.ownerUnitId || null,
          assigneeFacilityId: ownerIsFacility ? payload.ownerUnitId : null,
          assigneeUserIds: payload.ownerUid ? [payload.ownerUid] : [],
          goal: payload.objective || null,
          expectedDeliverable: payload.finalDeliverable || null,
          collaboratorDeptIds,
          collaboratorFacilityIds,
          collaboratorRoles,
          // V6.2 fix: lưu thêm Owner + deadline riêng cho mỗi collab.
          ...(({
            ownerUid: payload.ownerUid,
            ownerName: payload.ownerName,
            ownerBlock: payload.ownerBlock,
            collaboratorDeadlines,
          } as any)),
        };

        const created = await tasksApi.create(body);

        // Emit noti "coord_created" — V1 chỉ console.log, V5 wire FCM.
        const fakeCoord: CoordTask = {
          id: created.id,
          code: `DP-${new Date().getFullYear()}-${created.id.slice(0, 4).toUpperCase()}`,
          title: payload.title,
          type: 'van_hanh',
          scope: payload.scope,
          status: 'khoi_tao',
          priority: 'normal',
          ownerUid: payload.ownerUid,
          ownerName: payload.ownerName,
          ownerBlock: payload.ownerBlock,
          collaborators: payload.collaborators.map((c, idx) => ({
            id: `c-${idx}`,
            unitName: c.unitName,
            supportContent: c.supportContent,
            deliverable: '',
            deadline: c.deadline,
            status: 'chua_tiep_nhan' as CollabStatus,
            responsibleUid: '',
            responsibleName: c.unitName,
          })),
          collaboratorUnits: payload.collaborators.map((c) => c.unitName),
          waitingForPerson: payload.ownerName,
          waitingForContent: 'Owner tiếp nhận',
          waitingSince: new Date().toISOString(),
          dueDate: payload.dueDate,
          createdAt: new Date().toISOString(),
          createdByUid: currentUserUid,
          createdByName: currentUserName,
          resultApproverUid: payload.approverUid,
          resultApproverName: payload.approverName,
        };
        emitNotifications('create', notifyOnCreate(fakeCoord, payload.approverUid));

        setShowCreate(false);
        reload();
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'lỗi không xác định';
        alert(`Tạo điều phối thất bại: ${msg}`);
      }
    },
    [reload, currentUserUid, currentUserName],
  );

  // ============================================================
  // 1b. handleEdit / handleUpdate (V6.2) — sửa điều phối sau khi tạo
  // ============================================================
  const handleEdit = useCallback(
    (taskId: string) => {
      const t = tasks.find((x) => x.id === taskId);
      if (!t) return;
      setSelected(null); // đóng drawer
      setEditingTask(t);
      setShowCreate(true); // mở modal mode=edit
    },
    [tasks],
  );

  const handleUpdate = useCallback(
    async (taskId: string, payload: CreatePayload) => {
      try {
        const FACILITY_IDS = ['HM', 'NCT24', 'TK', 'TT', 'CTT'];
        const ownerIsFacility =
          payload.ownerBlock === 'KD' && FACILITY_IDS.includes(payload.ownerUnitId);
        const collaboratorDeptIds: string[] = [];
        const collaboratorFacilityIds: string[] = [];
        const collaboratorRoles: Record<string, string> = {};
        const collaboratorDeadlines: Record<string, string> = {};
        for (const c of payload.collaborators) {
          if (!c.unitId) continue;
          const [prefix, rawId] = c.unitId.split(':');
          if (!prefix || !rawId) continue;
          if (prefix === 'DEPT' || prefix === 'dept') {
            collaboratorDeptIds.push(rawId);
            collaboratorRoles[`dept:${rawId}`] = c.supportContent;
            if (c.deadline) collaboratorDeadlines[`dept:${rawId}`] = c.deadline;
          } else if (prefix === 'BRANCH' || prefix === 'facility') {
            collaboratorFacilityIds.push(rawId);
            collaboratorRoles[`facility:${rawId}`] = c.supportContent;
            if (c.deadline) collaboratorDeadlines[`facility:${rawId}`] = c.deadline;
          }
        }
        const description = [
          payload.description,
          payload.objective ? `\n— Mục tiêu: ${payload.objective}` : '',
          payload.finalDeliverable ? `\n— Kết quả bàn giao: ${payload.finalDeliverable}` : '',
        ].filter(Boolean).join('');
        const priority: TaskPriority =
          payload.severity === 'khan_cap' ? 'high'
          : payload.level === 'trong_diem' ? 'high' : 'normal';

        await tasksApi.update(taskId, {
          title: payload.title,
          description,
          priority,
          dueDate: payload.dueDate || null,
          severity: payload.severity,
          coordType: payload.type,
          ownerUid: payload.ownerUid,
          ownerName: payload.ownerName,
          ownerBlock: payload.ownerBlock || 'KD',
          ownerDeptId: ownerIsFacility ? undefined : payload.ownerUnitId,
          assigneeUserIds: payload.ownerUid ? [payload.ownerUid] : [],
          collaboratorDeptIds,
          collaboratorFacilityIds,
          collaboratorRoles,
          goal: payload.objective || '',
          expectedDeliverable: payload.finalDeliverable || '',
          // V6.2 fix: lưu deadline riêng cho từng collab (qua meta backward compat)
          meta: { collaboratorDeadlines },
        } as any);
        setShowCreate(false);
        setEditingTask(null);
        reload();
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'lỗi không xác định';
        alert(`Lưu thay đổi thất bại: ${msg}`);
      }
    },
    [reload],
  );

  // ============================================================
  // 2. handleCollabAccept — Collab tiếp nhận
  //    status: chua_tiep_nhan → da_tiep_nhan
  // ============================================================
  const handleCollabAccept = useCallback(
    (taskId: string, collabId: string) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;
      const collab = task.collaborators.find((c) => c.id === collabId);
      if (!collab) return;
      if (collab.status !== 'chua_tiep_nhan') {
        alert('Trạng thái không hợp lệ để tiếp nhận.');
        return;
      }
      const nowIso = new Date().toISOString();
      const next = patchCollab(task, collabId, {
        status: 'da_tiep_nhan',
        acceptedAt: nowIso,
      });
      applyTaskUpdate(next);
      // eslint-disable-next-line no-console
      console.log('[dieu-phoi] collab accept', { taskId, collabId });
      alert(`V1 (local): Đã tiếp nhận phần phối hợp "${collab.unitName}".\nV5 sẽ POST /api/coord-tasks/${taskId}/collaborators/${collabId}/accept.`);
    },
    [tasks, applyTaskUpdate],
  );

  // ============================================================
  // 3. handleCollabSubmit — Collab gửi hoàn thành
  //    status: da_tiep_nhan|dang_thuc_hien|bi_tra_lai → gui_hoan_thanh
  // ============================================================
  const handleCollabSubmit = useCallback(
    (
      taskId: string,
      collabId: string,
      payload: { result: string; note: string; files: string[] },
    ) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;
      const collab = task.collaborators.find((c) => c.id === collabId);
      if (!collab) return;
      const allowed: CollabStatus[] = ['da_tiep_nhan', 'dang_thuc_hien', 'bi_tra_lai'];
      if (!allowed.includes(collab.status)) {
        alert('Trạng thái không hợp lệ để gửi hoàn thành.');
        return;
      }
      const nowIso = new Date().toISOString();
      const nextCollab: Partial<Collaborator> = {
        status: 'gui_hoan_thanh',
        submittedAt: nowIso,
        submittedResult: payload.result,
        submittedNote: payload.note,
        submittedFiles: payload.files,
      };
      const next = patchCollab(task, collabId, nextCollab);
      applyTaskUpdate(next);

      const updatedCollab = next.collaborators.find((c) => c.id === collabId)!;
      emitNotifications('collab_submit', notifyOnCollabSubmit(next, updatedCollab));
      // eslint-disable-next-line no-console
      console.log('[dieu-phoi] collab submit', { taskId, collabId, payload });
      alert(`V1 (local): Đã gửi hoàn thành.\nV5 sẽ POST /api/coord-tasks/${taskId}/collaborators/${collabId}/submit.`);
    },
    [tasks, applyTaskUpdate],
  );

  // ============================================================
  // 4. handleOwnerAcceptCollab — Owner chấp nhận phần collab
  //    status: gui_hoan_thanh → hoan_thanh
  //    Nếu tất cả collab='hoan_thanh' → coord status auto chuyển 'cho_owner_xac_nhan'
  // ============================================================
  const handleOwnerAcceptCollab = useCallback(
    (taskId: string, collabId: string) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;
      const collab = task.collaborators.find((c) => c.id === collabId);
      if (!collab) return;
      if (collab.status !== 'gui_hoan_thanh') {
        alert('Phần phối hợp không ở trạng thái chờ Owner duyệt.');
        return;
      }
      const nowIso = new Date().toISOString();
      const next = patchCollab(task, collabId, {
        status: 'hoan_thanh',
        completedAt: nowIso,
        acceptedAt: collab.acceptedAt ?? nowIso,
      });
      applyTaskUpdate(next);

      const updatedCollab = next.collaborators.find((c) => c.id === collabId)!;
      emitNotifications('collab_accepted', notifyOnCollabAccepted(next, updatedCollab));

      // Nếu vừa đủ tất cả collab xong → noti "all_collab_done" cho Owner.
      if (computeProgress(next.collaborators) >= 100) {
        emitNotifications('all_collab_done', notifyOnAllCollabDone(next));
      }

      // eslint-disable-next-line no-console
      console.log('[dieu-phoi] owner accept collab', { taskId, collabId });
      alert(`V1 (local): Đã chấp nhận phần phối hợp.\nV5 sẽ POST /api/coord-tasks/${taskId}/collaborators/${collabId}/accept.`);
    },
    [tasks, applyTaskUpdate],
  );

  // ============================================================
  // 5. handleOwnerRejectCollab — Owner trả lại phần collab
  //    status: gui_hoan_thanh → bi_tra_lai (kèm reason)
  // ============================================================
  const handleOwnerRejectCollab = useCallback(
    (taskId: string, collabId: string, reason: string) => {
      const r = reason.trim();
      if (!r) {
        alert('Vui lòng nhập lý do trả lại.');
        return;
      }
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;
      const collab = task.collaborators.find((c) => c.id === collabId);
      if (!collab) return;
      if (collab.status !== 'gui_hoan_thanh') {
        alert('Phần phối hợp không ở trạng thái chờ Owner duyệt.');
        return;
      }
      const nowIso = new Date().toISOString();
      const next = patchCollab(task, collabId, {
        status: 'bi_tra_lai',
        rejectedAt: nowIso,
        rejectionReason: r,
      });
      applyTaskUpdate(next);

      const updatedCollab = next.collaborators.find((c) => c.id === collabId)!;
      emitNotifications('collab_rejected', notifyOnCollabRejected(next, updatedCollab, r));
      // eslint-disable-next-line no-console
      console.log('[dieu-phoi] owner reject collab', { taskId, collabId, reason: r });
      alert(`V1 (local): Đã trả lại phần phối hợp.\nV5 sẽ POST /api/coord-tasks/${taskId}/collaborators/${collabId}/reject.`);
    },
    [tasks, applyTaskUpdate],
  );

  // ============================================================
  // 6. handleOwnerConfirmAll — Owner xác nhận hoàn thành tổng thể
  //    status: cho_owner_xac_nhan → (cho_duyet_ket_qua | hoan_thanh)
  // ============================================================
  const handleOwnerConfirmAll = useCallback(
    (taskId: string) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;
      if ((task.status as string) !== 'cho_owner_xac_nhan') {
        alert('Điều phối chưa sẵn sàng để Owner xác nhận hoàn thành.');
        return;
      }
      const nowIso = new Date().toISOString();
      const hasApprover = !!task.resultApproverUid;
      const nextStatus: CoordStatus = hasApprover
        ? ('cho_duyet_ket_qua' as CoordStatus)
        : ('hoan_thanh' as CoordStatus);
      const next: CoordTask = { ...task, status: nextStatus, updatedAt: nowIso };
      applyTaskUpdate(next);

      if (!hasApprover) {
        // Đã hoàn thành luôn → noti complete.
        emitNotifications('coord_completed', notifyOnCoordComplete(next, next.createdByUid));
      } else {
        // eslint-disable-next-line no-console
        console.log('[dieu-phoi] owner confirm — waiting approver', { taskId });
      }
      alert(`V1 (local): Đã xác nhận hoàn thành tổng thể.\nV5 sẽ POST /api/coord-tasks/${taskId}/owner-confirm.`);
    },
    [tasks, applyTaskUpdate],
  );

  // ============================================================
  // 7. handleOwnerRequestSupplement — Owner YCBS các collab đã chọn
  //    Mỗi collab → status='bi_tra_lai' + rejectionReason; task → 'dang_phoi_hop'.
  // ============================================================
  const handleOwnerRequestSupplement = useCallback(
    (taskId: string, collabIds: string[], reason: string) => {
      const r = reason.trim();
      if (!r) {
        alert('Vui lòng nhập lý do bổ sung.');
        return;
      }
      if (!collabIds || collabIds.length === 0) {
        alert('Chưa chọn đơn vị phối hợp nào.');
        return;
      }
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;
      const nowIso = new Date().toISOString();
      const ids = new Set(collabIds);
      const nextCollabs = task.collaborators.map((c) =>
        ids.has(c.id)
          ? {
              ...c,
              status: 'bi_tra_lai' as CollabStatus,
              rejectedAt: nowIso,
              rejectionReason: r,
            }
          : c,
      );
      const next: CoordTask = {
        ...task,
        collaborators: nextCollabs,
        status: 'dang_phoi_hop' as CoordStatus,
        updatedAt: nowIso,
      };
      applyTaskUpdate(next);

      // Emit reject noti cho từng collab được YCBS.
      for (const c of nextCollabs) {
        if (ids.has(c.id)) {
          emitNotifications(
            'collab_rejected_ycbs',
            notifyOnCollabRejected(next, c, r),
          );
        }
      }
      // eslint-disable-next-line no-console
      console.log('[dieu-phoi] owner ycbs', { taskId, collabIds, reason: r });
      alert(`V1 (local): Đã yêu cầu bổ sung ${collabIds.length} đơn vị.\nV5 sẽ POST /api/coord-tasks/${taskId}/owner-request-supplement.`);
    },
    [tasks, applyTaskUpdate],
  );

  // ============================================================
  // 8. handleResultApprove / handleResultReject — Người duyệt
  //    cho_duyet_ket_qua → hoan_thanh | dang_xu_ly (trả lại)
  // ============================================================
  const handleResultApprove = useCallback(
    (taskId: string) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;
      if ((task.status as string) !== 'cho_duyet_ket_qua') {
        alert('Điều phối không ở trạng thái chờ duyệt kết quả.');
        return;
      }
      const next: CoordTask = {
        ...task,
        status: 'hoan_thanh' as CoordStatus,
        updatedAt: new Date().toISOString(),
      };
      applyTaskUpdate(next);
      emitNotifications('coord_completed', notifyOnCoordComplete(next, next.createdByUid));
      // eslint-disable-next-line no-console
      console.log('[dieu-phoi] result approve', { taskId });
      alert(`V1 (local): Đã duyệt kết quả.\nV5 sẽ POST /api/coord-tasks/${taskId}/result-approve.`);
    },
    [tasks, applyTaskUpdate],
  );

  const handleResultReject = useCallback(
    (taskId: string, reason: string) => {
      const r = reason.trim();
      if (!r) {
        alert('Vui lòng nhập lý do trả lại kết quả.');
        return;
      }
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;
      if ((task.status as string) !== 'cho_duyet_ket_qua') {
        alert('Điều phối không ở trạng thái chờ duyệt kết quả.');
        return;
      }
      const next: CoordTask = {
        ...task,
        status: 'dang_xu_ly' as CoordStatus,
        updatedAt: new Date().toISOString(),
      };
      applyTaskUpdate(next);
      // eslint-disable-next-line no-console
      console.log('[dieu-phoi] result reject', { taskId, reason: r });
      alert(`V1 (local): Đã trả lại kết quả về Owner.\nV5 sẽ POST /api/coord-tasks/${taskId}/result-reject.`);
    },
    [tasks, applyTaskUpdate],
  );

  // ============================================================
  // 9. handleCloseDossier — Đóng hồ sơ
  //    hoan_thanh → dong_ho_so (archive)
  // ============================================================
  const handleCloseDossier = useCallback(
    (taskId: string) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;
      if ((task.status as string) !== 'hoan_thanh') {
        alert('Chỉ đóng hồ sơ khi điều phối ở trạng thái Hoàn thành.');
        return;
      }
      const next: CoordTask = {
        ...task,
        status: 'dong_ho_so' as CoordStatus,
        updatedAt: new Date().toISOString(),
      };
      applyTaskUpdate(next);
      // eslint-disable-next-line no-console
      console.log('[dieu-phoi] close dossier', { taskId });
      alert(`V1 (local): Đã đóng hồ sơ.\nV5 sẽ POST /api/coord-tasks/${taskId}/close-dossier.`);
    },
    [tasks, applyTaskUpdate],
  );

  return (
    <div className="max-w-screen-2xl mx-auto">
      <div className="space-y-5">
        {/* Page header — title + actions */}
        <div className="flex flex-wrap items-end justify-between gap-3 pb-1">
          <div>
            <h1 className="text-lg font-bold text-slate-800 tracking-tight">Điều phối công việc</h1>
            <p className="text-xs text-slate-500 mt-0.5">Theo dõi & điều phối nhiệm vụ liên phòng ban, liên cơ sở.</p>
          </div>
          <button
            type="button"
            onClick={() => canCreate && setShowCreate(true)}
            disabled={!canCreate}
            title={canCreate ? 'Tạo điều phối mới' : 'Bạn không có quyền tạo điều phối'}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold rounded-lg shadow-md ring-1 ring-inset transition ${
              canCreate
                ? 'bg-gradient-to-b from-emerald-500 to-emerald-600 text-white ring-emerald-400/30 hover:from-emerald-600 hover:to-emerald-700 hover:shadow-lg'
                : 'bg-slate-200 text-slate-500 ring-slate-300/40 cursor-not-allowed'
            }`}
          >
            <Plus size={15} /> Tạo điều phối mới
            <ChevronDown size={13} className="opacity-80" />
          </button>
        </div>

        {/* Filter bar — compact toolbar */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/70 bg-white px-3 py-2 shadow-sm ring-1 ring-slate-50">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 text-xs text-slate-600">
            <Calendar size={12} className="text-slate-400" />
            <span className="tabular-nums font-medium">{new Date().toLocaleDateString('vi-VN')}</span>
          </div>
          <span className="h-4 w-px bg-slate-200" />
          <button
            type="button"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 bg-white text-xs text-slate-700 hover:bg-slate-50 transition"
          >
            Tất cả khối <ChevronDown size={12} className="text-slate-400" />
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 bg-white text-xs text-slate-700 hover:bg-slate-50 transition"
          >
            Tất cả cơ sở <ChevronDown size={12} className="text-slate-400" />
          </button>
          <div className="ml-auto">
            <button
              type="button"
              onClick={reload}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 bg-white text-xs text-slate-600 hover:bg-slate-50 transition"
              title="Tải lại"
            >
              <RefreshCw
                size={12}
                className={loading ? 'animate-spin text-slate-400' : 'text-slate-500'}
              />
              <span className="hidden sm:inline">Tải lại</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700 shadow-sm">
            ⚠ {error}
          </div>
        )}

        {loading && tasks.length === 0 ? (
          <div className="py-16 flex items-center justify-center text-slate-400">
            <Loader2 className="animate-spin mr-2" size={18} /> Đang tải dữ liệu điều phối…
          </div>
        ) : (
          <>
            {/* Section: Tổng quan KPI */}
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Tổng quan</span>
                <span className="flex-1 h-px bg-gradient-to-r from-slate-200 to-transparent" />
              </div>
              <KpiBar tasks={tasks} currentUserUid={currentUserUid} />
            </section>

            {/* Section: Phân tích */}
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Phân tích</span>
                <span className="flex-1 h-px bg-gradient-to-r from-slate-200 to-transparent" />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <BlockDonut tasks={tasks} />
                <DeptBarChart tasks={tasks} />
                <BranchBarChart tasks={tasks} />
              </div>
            </section>

            {/* Section: Theo dõi */}
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Theo dõi</span>
                <span className="flex-1 h-px bg-gradient-to-r from-slate-200 to-transparent" />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <BottleneckTable tasks={tasks} />
                <TopWatchList tasks={tasks} />
                <ImportantNotiPanel tasks={tasks} />
              </div>
            </section>

            {/* Section: Danh sách điều phối */}
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Danh sách điều phối</span>
                <span className="flex-1 h-px bg-gradient-to-r from-slate-200 to-transparent" />
              </div>
              <CoordinationTable
                tasks={tasks}
                onRowClick={setSelected}
                currentUserUid={currentUserUid}
              />
            </section>
          </>
        )}
      </div>

      {showCreate && (
        <CreateModal
          open
          onClose={() => { setShowCreate(false); setEditingTask(null); }}
          onCreate={handleCreate}
          initialTask={editingTask}
          onUpdate={handleUpdate}
          currentUserUid={currentUserUid}
          currentUserName={currentUserName}
          currentUserRole={currentUserRole}
        />
      )}
      <DetailDrawer
        task={selected}
        currentUserUid={currentUserUid}
        currentUserRole={currentUserRole}
        onClose={() => setSelected(null)}
        onCollabAccept={handleCollabAccept}
        onCollabSubmit={handleCollabSubmit}
        onOwnerAcceptCollab={handleOwnerAcceptCollab}
        onOwnerRejectCollab={handleOwnerRejectCollab}
        onOwnerConfirmAll={handleOwnerConfirmAll}
        onOwnerRequestSupplement={handleOwnerRequestSupplement}
        onResultApprove={handleResultApprove}
        onResultReject={handleResultReject}
        onCloseDossier={handleCloseDossier}
        onEdit={handleEdit}
      />
    </div>
  );
}
