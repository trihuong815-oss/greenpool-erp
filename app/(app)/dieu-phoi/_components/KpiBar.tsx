'use client';

import {
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  ClipboardList,
  MessageSquare,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { CoordTask, Collaborator } from './types';

// ============================================================
// V4 SPEC — 5 KPI cards (KHÔNG accent strip 4px)
// 1. Cần tôi xử lý (rose)       : Σ owner đang chờ + collab bị trả lại + collab chưa gửi + tôi cần duyệt
// 2. Chờ phản hồi (sky)         : collab ∈ [chua_tiep_nhan, gui_hoan_thanh, bi_tra_lai]
// 3. Chờ Owner xác nhận (amber) : task.status='cho_owner_xac_nhan'
// 4. Liên khối (violet)         : task.scope='lien_khoi'
// 5. Quá hạn (rose-strong)      : isOverdue helper
// ============================================================

// PR-DISPATCH-INTERACTIVE-CONTROLS-FIX (2026-06-27): khoá kết nối KPI ↔ table.
export type KpiKey =
  | 'can-toi-xu-ly'
  | 'cho-phan-hoi'
  | 'cho-owner-xac-nhan'
  | 'lien-khoi'
  | 'qua-han';

interface KpiBarProps {
  tasks: CoordTask[];
  currentUserUid: string;
  /** Click "Xem chi tiết" trên 1 card — parent set table tab + scroll. */
  onSeeDetails?: (key: KpiKey) => void;
}

// UI 10/10: nền trung tính, màu chỉ dùng theo NGỮ NGHĨA (cảnh báo/quá hạn), không tô loạn mỗi thẻ một màu.
type AccentKey = 'neutral' | 'warn' | 'danger';

const ICON_WRAP: Record<AccentKey, string> = {
  neutral: 'bg-slate-100',
  warn: 'bg-amber-50',
  danger: 'bg-rose-50',
};

const ICON_COLOR: Record<AccentKey, string> = {
  neutral: 'text-slate-500',
  warn: 'text-amber-600',
  danger: 'text-rose-600',
};

const COUNT_COLOR: Record<AccentKey, string> = {
  neutral: 'text-slate-900',
  warn: 'text-amber-600',
  danger: 'text-rose-600',
};

interface KpiItem {
  key: string;
  label: string;
  subtext: string;
  icon: LucideIcon;
  accent: AccentKey;
  count: number;
}

/** V4: Quá hạn helper — hôm nay > dueDate và task chưa hoàn thành / đóng. */
function isOverdue(task: CoordTask, todayMs: number): boolean {
  if (task.status === 'hoan_thanh' || task.status === 'dong_ho_so') return false;
  if (!task.dueDate) return false;
  const due = new Date(`${task.dueDate}T23:59:59+07:00`).getTime();
  return Number.isFinite(due) && due < todayMs;
}

/** V4: Đọc collab status mở rộng (gui_hoan_thanh / bi_tra_lai) qua cast — types.ts chưa có. */
function collabStatusOf(c: Collaborator): string {
  return (c as unknown as { status?: string }).status ?? c.status;
}

/** V4: task.status mở rộng — cho_owner_xac_nhan / cho_duyet_ket_qua. */
function taskStatusOf(t: CoordTask): string {
  return (t as unknown as { status?: string }).status ?? t.status;
}

export default function KpiBar({ tasks, currentUserUid, onSeeDetails }: KpiBarProps) {
  const todayMs = Date.now();

  // Lấy tên hiển thị của user hiện tại (mock-data driven)
  const myTask = tasks.find((t) => t.ownerUid === currentUserUid);
  const myName = myTask?.ownerName ?? '';

  let cantToiXuLy = 0;
  let choPhanHoi = 0;
  let choOwnerXacNhan = 0;
  let lienKhoi = 0;
  let quaHan = 0;

  for (const t of tasks) {
    const overdue = isOverdue(t, todayMs);
    const ownedByMe = t.ownerUid === currentUserUid;
    const tStatus = taskStatusOf(t);

    // -------- KPI 1: Cần tôi xử lý --------
    // a) Owner = tôi và task đang chờ xử lý (chưa hoàn thành / đóng)
    // V6.5 (2026-06-15) FIX: Bỏ 'cho_phan_hoi' — V3 status đã chết, V4 dùng
    // 'dang_phoi_hop'. Trước đây kiểm tra 'cho_phan_hoi' không có ý nghĩa
    // nhưng vẫn count → false positive cho ownerNeedsAction.
    const ownerNeedsAction =
      ownedByMe &&
      tStatus !== 'hoan_thanh' &&
      tStatus !== 'dong_ho_so' &&
      (tStatus === 'cho_owner_xac_nhan' ||
        tStatus === 'khoi_tao' ||
        tStatus === 'dang_xu_ly' ||
        tStatus === 'dang_phoi_hop');

    // b) Tôi là collab bị trả lại HOẶC chưa gửi (chua_tiep_nhan / da_tiep_nhan / dang_thuc_hien / bi_tra_lai)
    let iAmCollabPending = false;
    let iAmApprover = false;
    for (const c of t.collaborators ?? []) {
      const s = collabStatusOf(c);
      if (c.responsibleUid === currentUserUid &&
          (s === 'chua_tiep_nhan' || s === 'da_tiep_nhan' || s === 'dang_thuc_hien' || s === 'bi_tra_lai')) {
        iAmCollabPending = true;
      }
    }
    // c) Tôi cần duyệt (cho_duyet_ket_qua + người duyệt = tôi)
    const approverUid =
      (t as unknown as { approverUid?: string; reviewerUid?: string }).approverUid ??
      (t as unknown as { reviewerUid?: string }).reviewerUid;
    if (tStatus === 'cho_duyet_ket_qua' && approverUid === currentUserUid) {
      iAmApprover = true;
    }

    if (ownerNeedsAction || iAmCollabPending || iAmApprover) cantToiXuLy += 1;

    // -------- KPI 2: Chờ phản hồi --------
    // collab ∈ [chua_tiep_nhan, gui_hoan_thanh, bi_tra_lai] — đếm theo TASK (task có ≥1 collab khớp)
    const hasPendingCollab = (t.collaborators ?? []).some((c) => {
      const s = collabStatusOf(c);
      return s === 'chua_tiep_nhan' || s === 'gui_hoan_thanh' || s === 'bi_tra_lai';
    });
    if (hasPendingCollab) choPhanHoi += 1;

    // -------- KPI 3: Chờ Owner xác nhận --------
    if (tStatus === 'cho_owner_xac_nhan') choOwnerXacNhan += 1;

    // -------- KPI 4: Liên khối --------
    if (t.scope === 'lien_khoi') lienKhoi += 1;

    // -------- KPI 5: Quá hạn --------
    if (overdue) quaHan += 1;

    // Suppress unused myName warning (giữ var cho future use waitingForPerson)
    void myName;
  }

  const items: KpiItem[] = [
    {
      key: 'can-toi-xu-ly',
      label: 'Cần tôi xử lý',
      subtext: 'liên quan đến tôi',
      icon: ClipboardList,
      accent: 'neutral',
      count: cantToiXuLy,
    },
    {
      key: 'cho-phan-hoi',
      label: 'Chờ phản hồi',
      subtext: 'liên quan đến tôi',
      icon: MessageSquare,
      accent: 'warn',
      count: choPhanHoi,
    },
    {
      key: 'cho-owner-xac-nhan',
      label: 'Chờ Owner xác nhận',
      subtext: 'task chờ chốt cuối',
      icon: CheckCircle,
      accent: 'warn',
      count: choOwnerXacNhan,
    },
    {
      key: 'lien-khoi',
      label: 'Liên khối',
      subtext: 'toàn hệ thống',
      icon: Users,
      accent: 'neutral',
      count: lienKhoi,
    },
    {
      key: 'qua-han',
      label: 'Quá hạn',
      subtext: 'toàn hệ thống',
      icon: AlertTriangle,
      accent: 'danger',
      count: quaHan,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.key}
            className="rounded-xl border border-slate-200/70 bg-white p-3.5 shadow-md ring-1 ring-slate-50 transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            <div className="flex items-start gap-2.5">
              <div className={`rounded-lg p-2 shadow-sm ring-1 ring-inset ring-white/40 ${ICON_WRAP[item.accent]}`}>
                <Icon size={18} className={ICON_COLOR[item.accent]} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {item.label}
                </div>
                <div
                  className={`mt-0.5 text-2xl font-bold tabular-nums ${COUNT_COLOR[item.accent]}`}
                >
                  {item.count}
                </div>
                <div className="mt-0.5 text-[10px] text-slate-400">
                  {item.subtext}
                </div>
              </div>
            </div>
            {/* PR-DISPATCH-INTERACTIVE-CONTROLS-FIX (2026-06-27): bấm "Xem chi tiết"
                → parent setActiveTab tương ứng + scroll Danh sách điều phối.
                Nếu count=0 → disabled (không có gì để xem). */}
            <button
              type="button"
              onClick={onSeeDetails ? () => onSeeDetails(item.key as KpiKey) : undefined}
              disabled={!onSeeDetails || item.count === 0}
              className={
                'mt-1.5 inline-flex items-center gap-0.5 text-[11px] font-medium transition ' +
                (!onSeeDetails || item.count === 0
                  ? 'text-slate-400 cursor-not-allowed'
                  : 'text-emerald-600 hover:underline cursor-pointer')
              }
              title={item.count === 0 ? 'Không có dữ liệu để xem' : `Lọc danh sách: ${item.label}`}
            >
              Xem chi tiết <ChevronRight size={11} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
