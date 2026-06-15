'use client';

// ============================================================
// DetailDrawer V4 — /dieu-phoi
// Drawer phải 720px. 10 block theo SPEC V4 (Header → Owner → Tiến độ →
// Đang chờ → Mục tiêu/Kết quả/KPI → Đơn vị phối hợp → Owner xác nhận
// → Người duyệt kết quả → Lịch sử → Footer Đóng hồ sơ).
// Date display: iso slice + format manual dd/mm/yyyy (KHÔNG Date object
// cho YYYY-MM-DD — chỉ Date cho ISO datetime hiển thị giờ).
// Tiếng Việt CÓ DẤU đầy đủ. Tailwind only. Default export.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import {
  X,
  Bell,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  ShieldCheck,
  Send,
  RotateCcw,
  Paperclip,
  Lock,
} from 'lucide-react';
import {
  CoordTask,
  Collaborator,
  KpiRow,
  COORD_TYPE_LABEL,
  COORD_TYPE_COLOR,
  COORD_SCOPE_LABEL,
  COORD_STATUS_LABEL,
  COORD_STATUS_COLOR,
  COLLAB_STATUS_LABEL,
  COLLAB_STATUS_COLOR,
  BLOCK_LABEL,
  BRANCH_LABEL,
} from './types';

// ----- V4 chip labels (Severity / Level / Source) -----
// Dùng cho header chip — V4 types đã có Severity / CoordLevel / CoordSource.
type V4Severity = 'binh_thuong' | 'khan_cap';
type V4Level = 'thong_thuong' | 'quan_trong' | 'trong_diem';

const V4_LEVEL_LABEL: Record<V4Level, string> = {
  thong_thuong: 'Thông thường',
  quan_trong: 'Quan trọng',
  trong_diem: 'Trọng điểm',
};

const V4_LEVEL_COLOR: Record<V4Level, string> = {
  thong_thuong: 'bg-slate-100 text-slate-700',
  quan_trong: 'bg-sky-100 text-sky-700',
  trong_diem: 'bg-rose-100 text-rose-700',
};

const V4_SEVERITY_LABEL: Record<V4Severity, string> = {
  binh_thuong: 'Bình thường',
  khan_cap: 'Khẩn cấp',
};

const V4_SEVERITY_COLOR: Record<V4Severity, string> = {
  binh_thuong: 'bg-slate-100 text-slate-700',
  khan_cap: 'bg-rose-100 text-rose-700 ring-1 ring-inset ring-rose-300',
};

// V4 statuses (chuỗi) — dùng so sánh chuỗi để không lệ thuộc CoordStatus
// trong types V3.
const ST_KHOI_TAO = 'khoi_tao';
const ST_DANG_PHOI_HOP = 'dang_phoi_hop';
const ST_CHO_OWNER_XAC_NHAN = 'cho_owner_xac_nhan';
const ST_CHO_DUYET_KET_QUA = 'cho_duyet_ket_qua';
const ST_HOAN_THANH = 'hoan_thanh';
const ST_DONG_HO_SO = 'dong_ho_so';

// Collab V4 statuses
const CS_CHUA_TIEP_NHAN = 'chua_tiep_nhan';
const CS_DA_TIEP_NHAN = 'da_tiep_nhan';
const CS_DANG_THUC_HIEN = 'dang_thuc_hien';
const CS_GUI_HOAN_THANH = 'gui_hoan_thanh';
const CS_HOAN_THANH = 'hoan_thanh';
const CS_BI_TRA_LAI = 'bi_tra_lai';

// Label cho status V4 chưa có trong COORD_STATUS_LABEL
const V4_EXTRA_STATUS_LABEL: Record<string, string> = {
  cho_owner_xac_nhan: 'Chờ Owner xác nhận',
  cho_duyet_ket_qua: 'Chờ duyệt kết quả',
};

const V4_EXTRA_STATUS_COLOR: Record<string, string> = {
  cho_owner_xac_nhan: 'bg-amber-100 text-amber-800',
  cho_duyet_ket_qua: 'bg-amber-100 text-amber-800',
};

const V4_EXTRA_COLLAB_LABEL: Record<string, string> = {
  gui_hoan_thanh: 'Gửi hoàn thành',
  bi_tra_lai: 'Bị trả lại',
};

const V4_EXTRA_COLLAB_COLOR: Record<string, string> = {
  gui_hoan_thanh: 'bg-amber-100 text-amber-800',
  bi_tra_lai: 'bg-rose-100 text-rose-800',
};

function statusLabel(status: string): string {
  return (
    (COORD_STATUS_LABEL as Record<string, string>)[status] ??
    V4_EXTRA_STATUS_LABEL[status] ??
    status
  );
}

function statusColor(status: string): string {
  return (
    (COORD_STATUS_COLOR as Record<string, string>)[status] ??
    V4_EXTRA_STATUS_COLOR[status] ??
    'bg-slate-100 text-slate-700'
  );
}

function collabLabel(status: string): string {
  return (
    (COLLAB_STATUS_LABEL as Record<string, string>)[status] ??
    V4_EXTRA_COLLAB_LABEL[status] ??
    status
  );
}

function collabColor(status: string): string {
  return (
    (COLLAB_STATUS_COLOR as Record<string, string>)[status] ??
    V4_EXTRA_COLLAB_COLOR[status] ??
    'bg-slate-100 text-slate-700'
  );
}

// ============================================================
// Helpers: format date
// ============================================================

/**
 * Format YYYY-MM-DD → dd/mm/yyyy bằng slice (KHÔNG Date object).
 * Nếu chuỗi không khớp, trả về nguyên gốc.
 */
// V6.5 (2026-06-15): SỬA múi giờ. Trước đây slice raw string ISO → render giờ UTC
// (chênh 7h với giờ Hà Nội). Giờ dùng helper formatDateHN/formatDateTimeHN từ
// lib/dates.ts — convert ISO sang timeZone='Asia/Ho_Chi_Minh' đúng chuẩn.
import { formatDateHN as _formatDateHN, formatDateTimeHN as _formatDateTimeHN } from '@/lib/dates';

function formatDateIso(iso: string | undefined | null): string {
  // Nếu là 'YYYY-MM-DD' date-only (dueDate) → format trực tiếp không qua tz
  // (date-only không có khái niệm giờ → tz không đổi gì).
  if (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  }
  return _formatDateHN(iso);
}

function formatDateTimeIso(iso: string | undefined | null): string {
  return _formatDateTimeHN(iso);
}

function initials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const last = parts[parts.length - 1] || '';
  const first = parts[0] || '';
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

// ============================================================
// Helpers: computeProgress / computeWaitingFor
// ============================================================

/**
 * Tính tiến độ phối hợp: hoàn thành / tổng.
 * pct = floor(done / total * 100); nếu total=0 → pct=0.
 */
function computeProgress(task: CoordTask): { done: number; total: number; pct: number } {
  const total = task.collaborators.length;
  if (total === 0) return { done: 0, total: 0, pct: 0 };
  const done = task.collaborators.filter((c) => c.status === CS_HOAN_THANH).length;
  return { done, total, pct: Math.floor((done / total) * 100) };
}

/**
 * Tính người-cần-chờ hiện tại:
 *   - Ưu tiên collab có status 'gui_hoan_thanh' (đợi Owner)
 *   - Nếu không có → collab đầu tiên 'dang_thuc_hien' / 'da_tiep_nhan' / 'chua_tiep_nhan'
 *   - Fallback: task.waitingForPerson + waitingForContent + waitingSince
 */
function computeWaitingFor(task: CoordTask): {
  person: string;
  content: string;
  since: string;
  deadline?: string;
} {
  const sent = task.collaborators.find(
    (c) => (c.status as string) === CS_GUI_HOAN_THANH,
  );
  if (sent) {
    return {
      person: task.ownerName,
      content: `Owner xác nhận kết quả từ ${sent.unitName}`,
      since: sent.submittedAt || sent.completedAt || task.waitingSince || '',
      deadline: sent.deadline,
    };
  }
  const active = task.collaborators.find(
    (c) =>
      c.status === CS_DANG_THUC_HIEN ||
      c.status === CS_DA_TIEP_NHAN ||
      c.status === CS_CHUA_TIEP_NHAN,
  );
  if (active) {
    return {
      person: active.responsibleName || active.ownerName || active.unitName,
      content: active.supportContent,
      since: active.acceptedAt || active.startedAt || task.waitingSince || '',
      deadline: active.deadline,
    };
  }
  return {
    person: task.waitingForPerson,
    content: task.waitingForContent,
    since: task.waitingSince,
    deadline: task.dueDate,
  };
}

// ============================================================
// Permission helpers (mock — chuyển sang RBAC server khi sẵn sàng)
// ============================================================

// V6.5 (2026-06-15) anh chốt: SỬA quyền "Owner xác nhận hoàn thành".
// Trước đây whitelist gồm tất cả TP/QLCS/GĐ/CEO/ADMIN → mọi role này đều
// thấy nút "Xác nhận hoàn thành" dù KHÔNG phải Owner thật → ai cũng tác động
// thay Owner = sai phân quyền. Hiện chỉ:
//   • Owner thật (task.ownerUid === uid) — người được giao task
//   • ADMIN / CEO — escalation cấp cao khi Owner vắng/nghỉ
//   • CHU_TICH — đỉnh hệ thống
// KHÔNG còn cho TP/QLCS/GĐ khối khác xác nhận thay.
const OWNER_OVERRIDE_ROLES = new Set(['ADMIN', 'CEO', 'CHU_TICH']);
// Giữ alias để các check khác (canCloseDossier line 359) không vỡ.
const OWNER_UPDATE_ROLES = OWNER_OVERRIDE_ROLES;

function isOwnerLike(uid: string, role: string, task: CoordTask): boolean {
  if (task.ownerUid === uid) return true;
  return OWNER_OVERRIDE_ROLES.has(role);
}

// ============================================================
// Props
// ============================================================

interface Props {
  task: CoordTask | null;
  currentUserUid: string;
  currentUserRole: string;
  onClose: () => void;
  onNudge?: (id: string) => void;
  onCollabAccept?: (taskId: string, collabId: string) => void;
  onCollabSubmit?: (
    taskId: string,
    collabId: string,
    payload: { result: string; note: string; files: string[] },
  ) => void;
  onOwnerAcceptCollab?: (taskId: string, collabId: string) => void;
  onOwnerRejectCollab?: (taskId: string, collabId: string, reason: string) => void;
  onOwnerConfirmAll?: (taskId: string) => void;
  onOwnerRequestSupplement?: (
    taskId: string,
    collabIds: string[],
    reason: string,
  ) => void;
  onResultApprove?: (taskId: string) => void;
  onResultReject?: (taskId: string, reason: string) => void;
  onCloseDossier?: (taskId: string) => void;
  /** V6.2: mở modal sửa với pre-fill từ task. Hiển thị khi người tạo / admin / CEO. */
  onEdit?: (taskId: string) => void;
}

// ============================================================
// Component
// ============================================================

export default function DetailDrawer({
  task,
  currentUserUid,
  currentUserRole,
  onClose,
  onNudge,
  onCollabAccept,
  onCollabSubmit,
  onOwnerAcceptCollab,
  onOwnerRejectCollab,
  onOwnerConfirmAll,
  onOwnerRequestSupplement,
  onResultApprove,
  onResultReject,
  onCloseDossier,
  onEdit,
}: Props) {
  // State cục bộ cho form Gửi hoàn thành (mở per-collab)
  const [submitOpenFor, setSubmitOpenFor] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState('');
  const [submitNote, setSubmitNote] = useState('');

  // State cho form Owner trả lại (per-collab)
  const [rejectOpenFor, setRejectOpenFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // State cho YCBS (Yêu cầu bổ sung) — chọn collab + lý do
  const [ycbsOpen, setYcbsOpen] = useState(false);
  const [ycbsCollabIds, setYcbsCollabIds] = useState<Set<string>>(new Set());
  const [ycbsReason, setYcbsReason] = useState('');

  // State cho form trả lại kết quả (cấp duyệt)
  const [resultRejectOpen, setResultRejectOpen] = useState(false);
  const [resultRejectReason, setResultRejectReason] = useState('');

  // Quyền cấp cao
  const isOwner = useMemo(
    () => (task ? task.ownerUid === currentUserUid : false),
    [task, currentUserUid],
  );
  const isApprover = useMemo(() => {
    if (!task) return false;
    return !!task.resultApproverUid && task.resultApproverUid === currentUserUid;
  }, [task, currentUserUid]);
  const canOwnerActOnCollab = useMemo(
    () => (task ? isOwnerLike(currentUserUid, currentUserRole, task) : false),
    [task, currentUserUid, currentUserRole],
  );
  const canOwnerConfirmOverall = canOwnerActOnCollab;
  const canResultApprove = isApprover;
  const canCloseDossier = isOwner || OWNER_UPDATE_ROLES.has(currentUserRole);
  // V6.2: quyền SỬA điều phối
  //  - Creator hoặc Owner: cho phép khi status='khoi_tao' (chưa ai tiếp nhận)
  //    hoặc 'dang_xu_ly' (Owner đã nhận nhưng collab chưa làm)
  //  - ADMIN/CEO: cho phép mọi lúc TRỪ 'dong_ho_so'
  const isAdminOrCEO = currentUserRole === 'ADMIN' || currentUserRole === 'CEO';
  const isCreator = !!task && task.createdByUid === currentUserUid;
  const canEdit =
    !!task && task.status !== 'dong_ho_so' && (
      isAdminOrCEO ||
      ((isCreator || isOwner) && ['khoi_tao', 'dang_xu_ly'].includes(task.status))
    );

  if (!task) return null;

  const progress = computeProgress(task);
  const waiting = computeWaitingFor(task);

  // Severity / Level / Source chip dùng V4 (fallback nếu chưa có)
  const level: V4Level = (task.level as V4Level | undefined) ?? 'thong_thuong';
  const severity: V4Severity =
    (task.severity as V4Severity | undefined) ?? 'binh_thuong';

  // V6.5 Phase 5.3 (2026-06-15): Fetch timeline THẬT từ /api/tasks/[id]/comments
  // (subcollection comments lưu mọi event transition đã có sẵn — em chỉ thêm field
  // `event` ở 5 routes để timeline drawer biết icon nào dùng).
  // Fallback: nếu fetch fail hoặc empty → giữ 2 row mock (create + waiting current).
  type TimelineIcon = 'create' | 'waiting' | 'submit' | 'reject' | 'complete' | 'approve';
  type TimelineEntry = { time: string; who: string; action: string; iconKey: TimelineIcon; note?: string };

  const [timelineFromDb, setTimelineFromDb] = useState<TimelineEntry[]>([]);
  useEffect(() => {
    if (!task) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/tasks/${task.id}/comments`, { cache: 'no-store' });
        if (!res.ok) return;
        const j = await res.json();
        const rows = Array.isArray(j?.rows) ? j.rows : [];
        const EVENT_TO_ICON: Record<string, TimelineIcon> = {
          create: 'create',
          collab_accept: 'create',
          collab_submit: 'submit',
          collab_owner_accept: 'complete',
          collab_owner_reject: 'reject',
          owner_confirm: 'complete',
          owner_request_supplement: 'reject',
          result_approve: 'approve',
          result_reject: 'reject',
        };
        const entries: TimelineEntry[] = rows.map((r: any) => {
          const ev = typeof r.event === 'string' ? r.event : '';
          const icon: TimelineIcon = EVENT_TO_ICON[ev] ?? (r.kind === 'created' ? 'create' : 'waiting');
          return {
            time: formatDateTimeIso(r.createdAt),
            who: r.authorName || '—',
            action: r.body || r.text || '—',
            iconKey: icon,
            note: r.note || undefined,
          };
        });
        if (!cancelled) setTimelineFromDb(entries);
      } catch { /* silent — fallback mock */ }
    })();
    return () => { cancelled = true; };
  }, [task?.id]);

  // Nếu có data DB → dùng, không thì fallback 2 row mock (giữ UX cũ).
  const history: TimelineEntry[] = timelineFromDb.length > 0 ? [
    ...timelineFromDb,
    // Append current waiting nếu task chưa terminal
    ...(task.status !== 'hoan_thanh' && task.status !== 'dong_ho_so' && waiting.person ? [{
      time: formatDateTimeIso(task.waitingSince),
      who: waiting.person,
      action: `Đang chờ: ${waiting.content || '—'}`,
      iconKey: 'waiting' as TimelineIcon,
    }] : []),
  ] : [
    {
      time: formatDateTimeIso(task.createdAt),
      who: task.createdByName,
      action: 'Khởi tạo điều phối',
      iconKey: 'create' as TimelineIcon,
    },
    {
      time: formatDateTimeIso(task.waitingSince),
      who: waiting.person || '—',
      action: `Đang chờ: ${waiting.content || '—'}`,
      iconKey: 'waiting' as TimelineIcon,
    },
  ];

  // ----- Handlers -----

  function handleCollabSubmit(collabId: string) {
    const result = submitResult.trim();
    if (!result) return;
    onCollabSubmit?.(task!.id, collabId, {
      result,
      note: submitNote.trim(),
      files: [],
    });
    setSubmitOpenFor(null);
    setSubmitResult('');
    setSubmitNote('');
  }

  function handleOwnerReject(collabId: string) {
    const reason = rejectReason.trim();
    if (!reason) return;
    onOwnerRejectCollab?.(task!.id, collabId, reason);
    setRejectOpenFor(null);
    setRejectReason('');
  }

  function handleYcbsSubmit() {
    const reason = ycbsReason.trim();
    if (!reason || ycbsCollabIds.size === 0) return;
    onOwnerRequestSupplement?.(task!.id, Array.from(ycbsCollabIds), reason);
    setYcbsOpen(false);
    setYcbsCollabIds(new Set());
    setYcbsReason('');
  }

  function toggleYcbsCollab(id: string) {
    const next = new Set(ycbsCollabIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setYcbsCollabIds(next);
  }

  function handleResultReject() {
    const reason = resultRejectReason.trim();
    if (!reason) return;
    onResultReject?.(task!.id, reason);
    setResultRejectOpen(false);
    setResultRejectReason('');
  }

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Đóng"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-slate-900/40"
      />

      {/* Drawer 720px */}
      <div className="fixed right-0 top-0 z-50 flex h-screen w-full flex-col bg-white shadow-2xl sm:w-[720px]">
        {/* 1) HEADER */}
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 pt-4 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-medium text-slate-400">#{task.code}</div>
              <h2 className="mt-0.5 text-lg font-bold leading-snug text-slate-800">
                {task.title}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Đóng"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${COORD_TYPE_COLOR[task.type]}`}
            >
              {COORD_TYPE_LABEL[task.type]}
            </span>
            <span
              className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${V4_LEVEL_COLOR[level]}`}
            >
              Mức độ: {V4_LEVEL_LABEL[level]}
            </span>
            <span
              className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${V4_SEVERITY_COLOR[severity]}`}
            >
              {V4_SEVERITY_LABEL[severity]}
            </span>
            <span
              className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${statusColor(task.status)}`}
            >
              {statusLabel(task.status)}
            </span>
            <span className="inline-flex items-center rounded-md bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700 ring-1 ring-inset ring-slate-200">
              {COORD_SCOPE_LABEL[task.scope]}
            </span>
          </div>
        </div>

        {/* V6.5 Phase 5 (2026-06-15): Sticky tab nav — 4 anchor để user nhảy nhanh
            đến section thay vì scroll dài. Bỏ phương án accordion vì refactor 600 lines
            JSX rủi ro cao. Đạt cùng mục tiêu UX: navigate nhanh + giảm friction. */}
        <nav className="sticky top-0 z-10 flex items-center gap-1 border-b border-slate-200 bg-white/95 backdrop-blur px-3 py-2 shadow-sm overflow-x-auto">
          {[
            { id: 's-overview', label: 'Tổng quan' },
            { id: 's-collab',   label: 'Phối hợp' },
            { id: 's-result',   label: 'Kết quả' },
            { id: 's-history',  label: 'Lịch sử' },
          ].map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-md whitespace-nowrap"
            >
              {s.label}
            </button>
          ))}
        </nav>

        {/* BODY scroll */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div id="s-overview" />
          {/* 2) BLOCK OWNER */}
          <section className="mb-4">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Owner
            </h3>
            <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                {initials(task.ownerName)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-800">
                  {task.ownerName}
                </div>
                <div className="text-[11px] text-slate-500">
                  {BLOCK_LABEL[task.ownerBlock]}
                  {task.ownerDeptId ? ` · ${task.ownerDeptId}` : ''}
                  {task.branch ? ` · ${BRANCH_LABEL[task.branch]}` : ''}
                </div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                <ShieldCheck className="h-3 w-3" /> Chịu KPI cuối cùng
              </span>
            </div>
          </section>

          <div id="s-collab" />
          {/* 3) BLOCK TIẾN ĐỘ PHỐI HỢP */}
          <section className="mb-4">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Tiến độ phối hợp
            </h3>
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700 tabular-nums">
                  {progress.done}/{progress.total} đơn vị đã hoàn thành
                </span>
                <span className="font-semibold text-emerald-700 tabular-nums">
                  {progress.pct}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-emerald-600 transition-all"
                  style={{ width: `${progress.pct}%` }}
                />
              </div>
            </div>
          </section>

          {/* 4) BLOCK ĐANG CHỜ */}
          {(waiting.person || waiting.content) && (
            <section className="mb-4 rounded-r-lg border-l-4 border-amber-500 bg-amber-50 p-3">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                <Clock className="h-3 w-3" /> Đang chờ
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-800">
                Đang chờ {waiting.person || '—'} — {waiting.content || '—'}
                {waiting.since && ` — ${formatDateTimeIso(waiting.since)}`}
              </div>
              {onNudge && (
                <button
                  type="button"
                  onClick={() => onNudge(task.id)}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                >
                  <Bell className="h-3.5 w-3.5" /> Nhắc
                </button>
              )}
            </section>
          )}

          <div id="s-result" />
          {/* 5) BLOCK MỤC TIÊU / KẾT QUẢ BÀN GIAO / KPI */}
          <section className="mb-4 space-y-2">
            {task.objective && (
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Mục tiêu
                </div>
                <div className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                  {task.objective}
                </div>
              </div>
            )}
            {task.finalDeliverable && (
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Kết quả bàn giao
                </div>
                <div className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                  {task.finalDeliverable}
                </div>
              </div>
            )}
            {task.kpis && task.kpis.length > 0 && (
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  KPI
                </div>
                <ul className="space-y-1">
                  {task.kpis.map((k: KpiRow, i: number) => (
                    <li
                      key={`${k.name}-${i}`}
                      className="flex items-center justify-between rounded-md bg-slate-50 px-2 py-1 text-xs"
                    >
                      <span className="text-slate-700">{k.name}</span>
                      <span className="font-semibold tabular-nums text-slate-800">
                        {k.target}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* 6) BLOCK ĐƠN VỊ PHỐI HỢP */}
          <section className="mb-4">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Đơn vị phối hợp ({task.collaborators.length})
            </h3>
            {task.collaborators.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                Chưa có đơn vị phối hợp.
              </div>
            ) : (
              task.collaborators.map((c: Collaborator) => {
                const status: string = c.status as string;
                const isMyAssignment =
                  !!c.responsibleUid && c.responsibleUid === currentUserUid;

                const canAcceptThis =
                  isMyAssignment && status === CS_CHUA_TIEP_NHAN && !!onCollabAccept;
                const canSubmitThis =
                  isMyAssignment &&
                  (status === CS_DA_TIEP_NHAN ||
                    status === CS_DANG_THUC_HIEN ||
                    status === CS_BI_TRA_LAI) &&
                  !!onCollabSubmit;
                const canOwnerActThis =
                  canOwnerActOnCollab && status === CS_GUI_HOAN_THANH;

                return (
                  <div
                    key={c.id}
                    className="mb-2 rounded-lg border border-slate-200 p-3"
                  >
                    {/* Header card */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-800">{c.unitName}</span>
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${collabColor(status)}`}
                      >
                        {collabLabel(status)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      Người phụ trách:{' '}
                      <span className="font-medium text-slate-700">
                        {c.responsibleName || c.ownerName || '—'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600">
                      Cần hỗ trợ:{' '}
                      <span className="text-slate-700">{c.supportContent}</span>
                    </div>
                    <div className="text-xs text-slate-500 tabular-nums">
                      Deadline: {formatDateIso(c.deadline)}
                    </div>

                    {/* Hiển thị kết quả đã gửi nếu status='gui_hoan_thanh' */}
                    {status === CS_GUI_HOAN_THANH && (
                      <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                          Kết quả đã gửi
                        </div>
                        <div className="mt-0.5 whitespace-pre-wrap text-xs text-slate-700">
                          {c.submittedResult || '—'}
                        </div>
                        {c.submittedNote && (
                          <div className="mt-1 text-xs text-slate-600">
                            <span className="font-medium">Ghi chú: </span>
                            {c.submittedNote}
                          </div>
                        )}
                        {c.submittedFiles && c.submittedFiles.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {c.submittedFiles.map((f: string, i: number) => (
                              <span
                                key={`${c.id}-file-${i}`}
                                className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-[11px] text-slate-700 ring-1 ring-inset ring-slate-200"
                              >
                                <Paperclip className="h-3 w-3" /> {f}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Banner trả lại */}
                    {status === CS_BI_TRA_LAI && c.rejectionReason && (
                      <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 p-2 text-xs">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-rose-700">
                          Bị trả lại
                        </div>
                        <div className="mt-0.5 text-rose-800">{c.rejectionReason}</div>
                      </div>
                    )}

                    {/* Hoàn thành */}
                    {status === CS_HOAN_THANH && (
                      <div className="mt-2 flex items-center gap-1.5 border-t border-slate-100 pt-2 text-[11px] font-medium text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Đã hoàn thành
                        {c.completedAt ? ` · ${formatDateIso(c.completedAt)}` : ''}
                      </div>
                    )}

                    {/* Hành động: Tiếp nhận (collab) */}
                    {canAcceptThis && (
                      <div className="mt-2 border-t border-slate-100 pt-2">
                        <button
                          type="button"
                          onClick={() => onCollabAccept?.(task.id, c.id)}
                          className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Tiếp nhận
                        </button>
                      </div>
                    )}

                    {/* Hành động: Gửi hoàn thành (collab) */}
                    {canSubmitThis && (
                      <div className="mt-2 border-t border-slate-100 pt-2">
                        {submitOpenFor === c.id ? (
                          <div className="space-y-2">
                            <label className="block text-[11px] font-semibold text-slate-600">
                              Kết quả <span className="text-rose-500">*</span>
                            </label>
                            <textarea
                              value={submitResult}
                              onChange={(e) => setSubmitResult(e.target.value)}
                              placeholder="Mô tả kết quả đã hoàn thành…"
                              rows={3}
                              className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                            <label className="block text-[11px] font-semibold text-slate-600">
                              Ghi chú
                            </label>
                            <textarea
                              value={submitNote}
                              onChange={(e) => setSubmitNote(e.target.value)}
                              placeholder="Ghi chú thêm (tuỳ chọn)…"
                              rows={2}
                              className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                            <button
                              type="button"
                              disabled
                              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-500"
                            >
                              <Paperclip className="h-3 w-3" /> Đính kèm file (sắp có)
                            </button>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setSubmitOpenFor(null);
                                  setSubmitResult('');
                                  setSubmitNote('');
                                }}
                                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                Hủy
                              </button>
                              <button
                                type="button"
                                disabled={!submitResult.trim()}
                                onClick={() => handleCollabSubmit(c.id)}
                                className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <Send className="h-3.5 w-3.5" /> Gửi hoàn thành
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setSubmitOpenFor(c.id);
                              setSubmitResult('');
                              setSubmitNote('');
                            }}
                            className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                          >
                            <Send className="h-3.5 w-3.5" /> Gửi hoàn thành
                          </button>
                        )}
                      </div>
                    )}

                    {/* Hành động: Owner Chấp nhận / Trả lại */}
                    {canOwnerActThis && (
                      <div className="mt-2 border-t border-slate-100 pt-2">
                        {rejectOpenFor === c.id ? (
                          <div className="space-y-2">
                            <label className="block text-[11px] font-semibold text-slate-600">
                              Lý do trả lại <span className="text-rose-500">*</span>
                            </label>
                            <textarea
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              placeholder="Mô tả lý do trả lại…"
                              rows={2}
                              className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setRejectOpenFor(null);
                                  setRejectReason('');
                                }}
                                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                Hủy
                              </button>
                              <button
                                type="button"
                                disabled={!rejectReason.trim()}
                                onClick={() => handleOwnerReject(c.id)}
                                className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <RotateCcw className="h-3.5 w-3.5" /> Gửi trả lại
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => onOwnerAcceptCollab?.(task.id, c.id)}
                              className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" /> Chấp nhận
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRejectOpenFor(c.id);
                                setRejectReason('');
                              }}
                              className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
                            >
                              <RotateCcw className="h-3.5 w-3.5" /> Trả lại
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </section>

          {/* 7) BLOCK OWNER XÁC NHẬN HOÀN THÀNH — chỉ hiện khi status='cho_owner_xac_nhan' */}
          {task.status === ST_CHO_OWNER_XAC_NHAN && canOwnerConfirmOverall && (
            <section className="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" /> Owner xác nhận hoàn thành
              </div>
              <div className="mt-1 text-sm text-slate-700">
                Tất cả đơn vị phối hợp đã hoàn thành. Owner xác nhận tổng để chốt
                hoặc yêu cầu bổ sung trước khi đóng hồ sơ.
              </div>

              {ycbsOpen ? (
                <div className="mt-3 space-y-2 rounded-md border border-amber-300 bg-white p-2">
                  <div className="text-[11px] font-semibold text-slate-700">
                    Chọn đơn vị cần bổ sung <span className="text-rose-500">*</span>
                  </div>
                  <div className="space-y-1">
                    {task.collaborators.map((c) => (
                      <label
                        key={c.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-amber-50"
                      >
                        <input
                          type="checkbox"
                          checked={ycbsCollabIds.has(c.id)}
                          onChange={() => toggleYcbsCollab(c.id)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                        />
                        <span className="text-slate-700">{c.unitName}</span>
                      </label>
                    ))}
                  </div>
                  <label className="block text-[11px] font-semibold text-slate-600">
                    Lý do bổ sung <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    value={ycbsReason}
                    onChange={(e) => setYcbsReason(e.target.value)}
                    placeholder="Mô tả phần cần bổ sung…"
                    rows={2}
                    className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setYcbsOpen(false);
                        setYcbsCollabIds(new Set());
                        setYcbsReason('');
                      }}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      disabled={!ycbsReason.trim() || ycbsCollabIds.size === 0}
                      onClick={handleYcbsSubmit}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Gửi yêu cầu bổ sung
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => onOwnerConfirmAll?.(task.id)}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Xác nhận hoàn thành
                  </button>
                  <button
                    type="button"
                    onClick={() => setYcbsOpen(true)}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Yêu cầu bổ sung
                  </button>
                </div>
              )}
            </section>
          )}

          {/* 8) BLOCK NGƯỜI DUYỆT KẾT QUẢ — chỉ hiện khi status='cho_duyet_ket_qua' */}
          {task.status === ST_CHO_DUYET_KET_QUA && canResultApprove && (
            <section className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-700">
                <ShieldCheck className="h-3.5 w-3.5" /> Người duyệt kết quả
              </div>
              <div className="mt-1 text-sm text-slate-700">
                {task.resultApproverName
                  ? `${task.resultApproverName} cần duyệt kết quả cuối cùng.`
                  : 'Cần duyệt kết quả cuối cùng.'}
              </div>

              {resultRejectOpen ? (
                <div className="mt-3 space-y-2 rounded-md border border-rose-300 bg-white p-2">
                  <label className="block text-[11px] font-semibold text-slate-600">
                    Lý do trả lại <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    value={resultRejectReason}
                    onChange={(e) => setResultRejectReason(e.target.value)}
                    placeholder="Mô tả lý do trả lại kết quả…"
                    rows={2}
                    className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setResultRejectOpen(false);
                        setResultRejectReason('');
                      }}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      disabled={!resultRejectReason.trim()}
                      onClick={handleResultReject}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <XCircle className="h-3.5 w-3.5" /> Gửi trả lại
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => onResultApprove?.(task.id)}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Duyệt
                  </button>
                  <button
                    type="button"
                    onClick={() => setResultRejectOpen(true)}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
                  >
                    <XCircle className="h-3.5 w-3.5" /> Trả lại
                  </button>
                </div>
              )}
            </section>
          )}

          <div id="s-history" />
          {/* 9) BLOCK LỊCH SỬ XỬ LÝ */}
          <section className="mb-2">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Lịch sử xử lý
            </h3>
            <ol className="relative ml-2 border-l border-slate-200 pl-4">
              {history.map((h, i) => {
                // V6.5 (2026-06-15): icon đặc trưng cho mỗi event type — đồng bộ pattern
                // standardize timeline (audit yêu cầu).
                const ICONS = {
                  create:   { Icon: CheckCircle2, bg: 'bg-emerald-500' },
                  waiting:  { Icon: Clock,         bg: 'bg-amber-500'   },
                  submit:   { Icon: Send,          bg: 'bg-sky-500'     },
                  reject:   { Icon: XCircle,       bg: 'bg-rose-500'    },
                  complete: { Icon: CheckCircle2,  bg: 'bg-emerald-600' },
                  approve:  { Icon: ShieldCheck,   bg: 'bg-violet-500'  },
                } as const;
                const { Icon, bg } = ICONS[h.iconKey];
                return (
                  <li key={i} className="relative mb-3 last:mb-0">
                    <span className={`absolute -left-[26px] top-0 flex h-5 w-5 items-center justify-center rounded-full text-white ring-2 ring-white ${bg}`}>
                      <Icon className="h-3 w-3" />
                    </span>
                    <div className="text-[10px] tabular-nums text-slate-400">{h.time}</div>
                    <div className="text-sm font-medium text-slate-800">{h.who}</div>
                    <div className="text-xs text-slate-600">{h.action}</div>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>

        {/* 10) FOOTER */}
        <div className="sticky bottom-0 z-10 border-t border-slate-200 bg-white p-4">
          {task.fromProposalId && (
            <a
              href={`/de-xuat?id=${encodeURIComponent(task.fromProposalId)}`}
              className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Quay về đề xuất gốc
            </a>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Đóng
            </button>
            {canEdit && onEdit && (
              <button
                type="button"
                onClick={() => onEdit(task.id)}
                className="flex-1 rounded-lg border border-sky-300 bg-white px-4 py-2 text-sm font-medium text-sky-700 hover:bg-sky-50"
              >
                ✎ Sửa
              </button>
            )}
            {task.status === ST_HOAN_THANH && canCloseDossier && onCloseDossier && (
              <button
                type="button"
                onClick={() => onCloseDossier(task.id)}
                className="flex-1 rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
              >
                <Lock className="mr-1 inline h-4 w-4" /> Đóng hồ sơ
              </button>
            )}
            {task.status === ST_DONG_HO_SO && (
              <span className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-center text-sm font-medium text-slate-500">
                Đã đóng hồ sơ
              </span>
            )}
            {task.status === ST_KHOI_TAO && (
              <span className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-center text-sm font-medium text-slate-500">
                Khởi tạo
              </span>
            )}
            {task.status === ST_DANG_PHOI_HOP && (
              <span className="flex-1 rounded-lg border border-violet-300 bg-violet-50 px-4 py-2 text-center text-sm font-medium text-violet-700">
                Đang phối hợp
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
