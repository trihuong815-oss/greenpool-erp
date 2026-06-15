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
import { useRouter, useSearchParams } from 'next/navigation';
import { Calendar, ChevronDown, Loader2, Plus, RefreshCw } from 'lucide-react';
import { isTP, isQLCS } from '@/lib/auth/roles';
import KpiBar from './_components/KpiBar';
import BlockDonut from './_components/BlockDonut';
import DeptBarChart from './_components/DeptBarChart';
import BranchBarChart from './_components/BranchBarChart';
import BottleneckTable from './_components/BottleneckTable';
import TopWatchList from './_components/TopWatchList';
import CompactDashboard from './_components/CompactDashboard';
import MobileDispatchView from './_components/Mobile/MobileDispatchView';
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
  type CoordTaskV4,
} from './_lib/workflow-engine';
import {
  notifyOnCreate,
  // V6.5 (2026-06-15): notifyOnCollabRejected + notifyOnCoordComplete đã chuyển server-side
  // (notifyTaskOwnerConfirmed + notifyCollabSupplementRequested + notifyTaskResultDecided
  // trong task-notifications.ts). Bỏ import client để tránh dead code.
  type NotificationTrigger,
} from './_lib/coord-notifications';

interface DieuPhoiClientProps {
  currentUserUid: string;
  currentUserName: string;
  currentUserRole: string;
  // V6.4 (2026-06-13): cần để compact dashboard biết user thuộc dept/facility nào.
  currentUserDeptId?: string | null;
  currentUserFacilityId?: string | null;
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
  currentUserDeptId = null,
  currentUserFacilityId = null,
  currentUserRole,
}: DieuPhoiClientProps) {
  const canCreate = canCreateCoord(currentUserRole);
  // V6.4 (2026-06-13): detect role để chọn dashboard variant.
  // TP_* / QLCS_* → CompactDashboard (gọn, cá nhân hoá, không có analytics hệ thống).
  // GD/CEO/CHU_TICH/ADMIN → giữ dashboard đầy đủ.
  const isCompactRole = isTP(currentUserRole) || isQLCS(currentUserRole);
  const unitLabel = isQLCS(currentUserRole) ? `QLCS ${currentUserFacilityId ?? ''}`.trim()
    : isTP(currentUserRole) ? (currentUserName || 'phòng tôi')
    : 'đơn vị tôi';
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  /** V6.2: task đang được sửa (null = chế độ tạo mới). */
  const [editingTask, setEditingTask] = useState<CoordTask | null>(null);
  /** V6.5 (2026-06-15): prefill TẠO MỚI từ đề xuất (?createFromProposal=<id>).
   *  KHÔNG bật edit mode — user vẫn dùng full form để nhập owner/deadline/collaborators. */
  const [prefillFromProposal, setPrefillFromProposal] = useState<{
    title: string;
    description: string;
    fromProposalId: string;
    fromProposalCode: string;
    estimatedCost?: number | null;
  } | null>(null);
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

  // V6.4 (2026-06-13): deeplink ?taskId=X — click notification mở drawer cụ thể.
  // Run sau khi tasks load xong; chỉ open 1 lần (deps có tasks.length, không có searchParams ref).
  const searchParams = useSearchParams();
  const deeplinkTaskId = searchParams?.get('taskId') ?? null;
  useEffect(() => {
    if (!deeplinkTaskId || tasks.length === 0) return;
    const found = tasks.find((t) => t.id === deeplinkTaskId);
    if (found) setSelected(found);
  }, [deeplinkTaskId, tasks]);

  // V6.5 (2026-06-15): deeplink ?createFromProposal=<id> — flow "Duyệt & Tạo điều phối".
  // Fetch proposal info → prefill 2 field tối thiểu (title + description=reason) →
  // mở CreateModal. User tự nhập owner/deadline/collaborators.
  const fromProposalId = searchParams?.get('createFromProposal') ?? null;
  useEffect(() => {
    if (!fromProposalId) return;
    let cancelled = false;
    (async () => {
      try {
        const proposal: any = await tasksApi.get(fromProposalId);
        if (cancelled || !proposal) return;
        const yyyy = (proposal.createdAt ?? '').slice(0, 4) || new Date().getFullYear().toString();
        const code = `DX-${yyyy}-${proposal.id.slice(0, 4).toUpperCase()}`;
        const reason = (proposal.meta?.reason as string)
          ?? (proposal.meta?.problemStatement as string)
          ?? proposal.description
          ?? '';
        setPrefillFromProposal({
          title: proposal.title ?? '',
          description: [
            reason,
            `Sinh từ đề xuất ${code}`,
            typeof proposal.estimatedCost === 'number' && proposal.estimatedCost > 0
              ? `Giá trị dự kiến: ${proposal.estimatedCost.toLocaleString('vi-VN')} đ`
              : '',
          ].filter(Boolean).join('\n\n'),
          fromProposalId: proposal.id,
          fromProposalCode: code,
          estimatedCost: typeof proposal.estimatedCost === 'number' ? proposal.estimatedCost : null,
        });
        setShowCreate(true);
      } catch (e: any) {
        console.warn('[dieu-phoi] fetch proposal for prefill fail:', e?.message);
      }
    })();
    return () => { cancelled = true; };
  }, [fromProposalId]);

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
          // V6.5 (2026-06-15): nếu tạo từ đề xuất → ghi meta.fromProposalId/Code để
          // adapter Detail Drawer hiển thị link ngược về đề xuất.
          ...(({
            ownerUid: payload.ownerUid,
            ownerName: payload.ownerName,
            ownerBlock: payload.ownerBlock,
            collaboratorDeadlines,
            meta: payload.fromProposalId
              ? {
                  fromProposalId: payload.fromProposalId,
                  fromProposalCode: payload.fromProposalCode,
                }
              : undefined,
          } as any)),
        };

        const created = await tasksApi.create(body);

        // V6.5 (2026-06-15): reverse link — update đề xuất với linkedCoordId/Code
        // + chuyển status sang 'chuyen_dieu_phoi' (Đã tạo điều phối).
        if (payload.fromProposalId) {
          try {
            await tasksApi.update(payload.fromProposalId, {
              status: 'chuyen_dieu_phoi',
              meta: {
                linkedCoordId: created.id,
                linkedCoordCode: (created as any).code ?? null,
                linkedCoordAt: new Date().toISOString(),
              },
            } as any);
          } catch (revErr: any) {
            console.warn('[dieu-phoi] reverse link proposal fail:', revErr?.message);
          }
        }

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
        // V6.5 (2026-06-15): clear prefill + query param sau khi tạo xong
        setPrefillFromProposal(null);
        if (payload.fromProposalId) {
          router.replace('/dieu-phoi');
        }
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
          // V6.4 (2026-06-12): deadline RIÊNG per collab — gửi ở root để khớp PATCH handler
          collaboratorDeadlines,
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
  // V6.4 (2026-06-12): 4 handler GỌI API thật (server persist trạng thái).
  // Client id format `dept-XX` / `facility-XX` → server key `dept:XX` / `facility:XX`.
  // ============================================================

  const collabIdToKey = (collabId: string): string | null => {
    if (collabId.startsWith('dept-')) return `dept:${collabId.slice(5)}`;
    if (collabId.startsWith('facility-')) return `facility:${collabId.slice(9)}`;
    return null;
  };

  const callCollabTransition = useCallback(
    async (
      taskId: string,
      collabId: string,
      action: 'accept' | 'submit' | 'owner_accept' | 'owner_reject',
      payload?: Record<string, unknown>,
    ): Promise<boolean> => {
      const collabKey = collabIdToKey(collabId);
      if (!collabKey) {
        alert('collabId không hợp lệ.');
        return false;
      }
      try {
        const res = await fetch(`/api/tasks/${taskId}/collaborators/transition`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ collabKey, action, payload }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          alert(`Thao tác thất bại: ${json?.error ?? res.status}`);
          return false;
        }
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'lỗi không xác định';
        alert(`Lỗi kết nối: ${msg}`);
        return false;
      }
    },
    [],
  );

  // ============================================================
  // 2. handleCollabAccept — Collab tiếp nhận: chua_tiep_nhan → da_tiep_nhan
  // ============================================================
  const handleCollabAccept = useCallback(
    async (taskId: string, collabId: string) => {
      const ok = await callCollabTransition(taskId, collabId, 'accept');
      if (ok) reload();
    },
    [callCollabTransition, reload],
  );

  // ============================================================
  // 3. handleCollabSubmit — Collab gửi hoàn thành
  // ============================================================
  const handleCollabSubmit = useCallback(
    async (
      taskId: string,
      collabId: string,
      payload: { result: string; note: string; files: string[] },
    ) => {
      const ok = await callCollabTransition(taskId, collabId, 'submit', {
        result: payload.result,
        note: payload.note,
        files: payload.files,
      });
      if (ok) reload();
    },
    [callCollabTransition, reload],
  );

  // ============================================================
  // 4. handleOwnerAcceptCollab — Owner chấp nhận: gui_hoan_thanh → hoan_thanh
  // Server tự auto-set task.status='cho_owner_xac_nhan' khi tất cả collab done.
  // ============================================================
  const handleOwnerAcceptCollab = useCallback(
    async (taskId: string, collabId: string) => {
      const ok = await callCollabTransition(taskId, collabId, 'owner_accept');
      if (ok) reload();
    },
    [callCollabTransition, reload],
  );

  // ============================================================
  // 5. handleOwnerRejectCollab — Owner trả lại: gui_hoan_thanh → bi_tra_lai
  // ============================================================
  const handleOwnerRejectCollab = useCallback(
    async (taskId: string, collabId: string, reason: string) => {
      const r = reason.trim();
      if (!r) {
        alert('Vui lòng nhập lý do trả lại.');
        return;
      }
      const ok = await callCollabTransition(taskId, collabId, 'owner_reject', { reason: r });
      if (ok) reload();
    },
    [callCollabTransition, reload],
  );

  // ============================================================
  // 6. handleOwnerConfirmAll — Owner xác nhận hoàn thành tổng thể
  //    status: cho_owner_xac_nhan → (cho_duyet_ket_qua | hoan_thanh)
  // ============================================================
  // V6.5 Phase 1 (2026-06-15): wire endpoint thật, bỏ mock alert.
  const handleOwnerConfirmAll = useCallback(
    async (taskId: string) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;
      if ((task.status as string) !== 'cho_owner_xac_nhan') {
        alert('Điều phối chưa sẵn sàng để Owner xác nhận hoàn thành.');
        return;
      }
      try {
        const res = await fetch(`/api/tasks/${taskId}/owner-confirm`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
        reload();
      } catch (e: any) {
        alert(`Xác nhận hoàn thành thất bại: ${e?.message ?? 'lỗi'}`);
      }
    },
    [tasks, reload],
  );

  // ============================================================
  // 7. handleOwnerRequestSupplement — Owner YCBS các collab đã chọn
  //    Mỗi collab → status='bi_tra_lai' + rejectionReason; task → 'dang_phoi_hop'.
  // ============================================================
  // V6.5 Phase 1 (2026-06-15): wire endpoint thật.
  // Map collabIds (id 'dept-MKT' UI) → collabKeys ('dept:MKT' server format).
  const handleOwnerRequestSupplement = useCallback(
    async (taskId: string, collabIds: string[], reason: string) => {
      const r = reason.trim();
      if (!r) { alert('Vui lòng nhập lý do bổ sung.'); return; }
      if (!collabIds || collabIds.length === 0) { alert('Chưa chọn đơn vị phối hợp nào.'); return; }
      // UI dùng id 'dept-MKT'/'facility-HM' → server cần 'dept:MKT'/'facility:HM'
      const collabKeys = collabIds.map((id) =>
        id.startsWith('dept-') ? `dept:${id.slice(5)}`
        : id.startsWith('facility-') ? `facility:${id.slice(9)}`
        : id,
      );
      try {
        const res = await fetch(`/api/tasks/${taskId}/collaborators/request-supplement`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ collabKeys, reason: r }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
        reload();
      } catch (e: any) {
        alert(`Yêu cầu bổ sung thất bại: ${e?.message ?? 'lỗi'}`);
      }
    },
    [reload],
  );

  // ============================================================
  // 8. handleResultApprove / handleResultReject — Người duyệt
  //    cho_duyet_ket_qua → hoan_thanh | dang_xu_ly (trả lại)
  // ============================================================
  // V6.5 Phase 1 (2026-06-15): wire endpoint thật.
  const handleResultApprove = useCallback(
    async (taskId: string) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;
      if ((task.status as string) !== 'cho_duyet_ket_qua') {
        alert('Điều phối không ở trạng thái chờ duyệt kết quả.');
        return;
      }
      try {
        const res = await fetch(`/api/tasks/${taskId}/result-approve`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
        reload();
      } catch (e: any) {
        alert(`Duyệt kết quả thất bại: ${e?.message ?? 'lỗi'}`);
      }
    },
    [tasks, reload],
  );

  const handleResultReject = useCallback(
    async (taskId: string, reason: string) => {
      const r = reason.trim();
      if (!r) { alert('Vui lòng nhập lý do trả lại kết quả.'); return; }
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;
      if ((task.status as string) !== 'cho_duyet_ket_qua') {
        alert('Điều phối không ở trạng thái chờ duyệt kết quả.');
        return;
      }
      try {
        const res = await fetch(`/api/tasks/${taskId}/result-reject`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ reason: r }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
        reload();
      } catch (e: any) {
        alert(`Trả lại kết quả thất bại: ${e?.message ?? 'lỗi'}`);
      }
    },
    [tasks, reload],
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
        {/* Page header — title + actions (mobile ẩn vì có TopBar + nút tạo ở MobileView) */}
        <div className="hidden md:flex flex-wrap items-end justify-between gap-3 pb-1">
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-emerald-700 to-teal-600 bg-clip-text text-transparent">Điều phối công việc</h1>
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

        {/* Filter bar — desktop only (mobile có search + bottom sheet riêng) */}
        <div className="hidden md:flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/70 bg-white px-3 py-2 shadow-sm ring-1 ring-slate-50">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 text-xs text-slate-600">
            <Calendar size={12} className="text-slate-400" />
            <span className="tabular-nums font-medium">{new Date().toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</span>
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
            {/* V6.4 (2026-06-13): MOBILE — spec anh chốt full redesign: card view + bottom sheet +
                swipe KPI + sticky tabs. CHỈ render mobile (md:hidden) — desktop view giữ nguyên. */}
            <div className="md:hidden">
              <MobileDispatchView
                tasks={tasks}
                currentUserUid={currentUserUid}
                currentUserDeptId={currentUserDeptId}
                currentUserFacilityId={currentUserFacilityId}
                canCreate={canCreate}
                onCreate={() => setShowCreate(true)}
                onRowClick={setSelected}
              />
            </div>

            {/* Desktop (md+) — giữ nguyên 2 branch CompactDashboard (TP/QLCS) hoặc full (GD/CEO) */}
            <div className="hidden md:block">
              {isCompactRole ? (
                <CompactDashboard
                  tasks={tasks}
                  currentUserUid={currentUserUid}
                  currentUserDeptId={currentUserDeptId}
                  currentUserFacilityId={currentUserFacilityId}
                  unitLabel={unitLabel}
                  onRowClick={setSelected}
                />
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
          </>
        )}
      </div>

      {showCreate && (
        <CreateModal
          open
          onClose={() => { setShowCreate(false); setEditingTask(null); setPrefillFromProposal(null); }}
          onCreate={handleCreate}
          initialTask={editingTask}
          onUpdate={handleUpdate}
          currentUserUid={currentUserUid}
          currentUserName={currentUserName}
          currentUserRole={currentUserRole}
          prefillFromProposal={prefillFromProposal}
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
