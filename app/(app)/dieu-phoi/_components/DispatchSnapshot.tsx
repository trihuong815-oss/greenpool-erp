'use client';

// PR-DISPATCH-RESTRUCTURE (2026-06-27): thay KpiBar 5-card (có label 2-dòng đè,
// 5 nút "Xem chi tiết" trùng, "Liên khối" chỉ là dimension chứ không action) bằng
// 1 dải SegmentSummary 4 cell — pattern đã quen ở /de-xuat. Click cell = filter
// table sang sub-tab tương ứng + scroll. Quan sát nhanh, gọn, không trang trí.
//
// 4 cell action-required (BỎ "Liên khối" vì không phải action item, đã có sub-tab
// Liên khối trong bảng nếu cần drill-down):
//   1. Cần xử lý         — owner ngồi yên / collab pending / approver pending
//   2. Chờ phản hồi      — collab pending (chua_tiep_nhan/gui_hoan_thanh/bi_tra_lai)
//   3. Chờ owner xác nhận — task.status='cho_owner_xac_nhan'
//   4. Quá hạn           — dueDate < now và task chưa xong

import { SegmentSummary } from '@/components/ui/StatCard';
import type { CoordTask, Collaborator } from './types';

export type SnapshotKey = 'can-toi-xu-ly' | 'cho-phan-hoi' | 'cho-owner-xac-nhan' | 'qua-han';

interface Props {
  tasks: CoordTask[];
  currentUserUid: string;
  /** Click 1 cell → parent set table sub-tab + scroll. */
  onSelectCell?: (key: SnapshotKey) => void;
  /** Cell đang active để highlight (đồng bộ với table sub-tab hiện tại). */
  activeKey?: SnapshotKey | null;
}

function isOverdue(task: CoordTask, todayMs: number): boolean {
  if (task.status === 'hoan_thanh' || task.status === 'dong_ho_so') return false;
  if (!task.dueDate) return false;
  const due = new Date(`${task.dueDate}T23:59:59+07:00`).getTime();
  return Number.isFinite(due) && due < todayMs;
}

function collabStatusOf(c: Collaborator): string {
  return (c as unknown as { status?: string }).status ?? c.status;
}

function taskStatusOf(t: CoordTask): string {
  return (t as unknown as { status?: string }).status ?? t.status;
}

export default function DispatchSnapshot({ tasks, currentUserUid, onSelectCell, activeKey }: Props) {
  const todayMs = Date.now();

  let canToiXuLy = 0;
  let choPhanHoi = 0;
  let choOwnerXacNhan = 0;
  let quaHan = 0;

  for (const t of tasks) {
    const overdue = isOverdue(t, todayMs);
    const ownedByMe = t.ownerUid === currentUserUid;
    const tStatus = taskStatusOf(t);

    // KPI 1 — Cần tôi xử lý
    const ownerNeedsAction =
      ownedByMe &&
      tStatus !== 'hoan_thanh' &&
      tStatus !== 'dong_ho_so' &&
      (tStatus === 'cho_owner_xac_nhan' ||
        tStatus === 'khoi_tao' ||
        tStatus === 'dang_xu_ly' ||
        tStatus === 'dang_phoi_hop');

    let iAmCollabPending = false;
    let iAmApprover = false;
    for (const c of t.collaborators ?? []) {
      const s = collabStatusOf(c);
      if (
        c.responsibleUid === currentUserUid &&
        (s === 'chua_tiep_nhan' || s === 'da_tiep_nhan' || s === 'dang_thuc_hien' || s === 'bi_tra_lai')
      ) {
        iAmCollabPending = true;
      }
    }
    const approverUid =
      (t as unknown as { approverUid?: string; reviewerUid?: string }).approverUid ??
      (t as unknown as { reviewerUid?: string }).reviewerUid;
    if (tStatus === 'cho_duyet_ket_qua' && approverUid === currentUserUid) {
      iAmApprover = true;
    }
    if (ownerNeedsAction || iAmCollabPending || iAmApprover) canToiXuLy += 1;

    // KPI 2 — Chờ phản hồi (collab pending)
    const hasPendingCollab = (t.collaborators ?? []).some((c) => {
      const s = collabStatusOf(c);
      return s === 'chua_tiep_nhan' || s === 'gui_hoan_thanh' || s === 'bi_tra_lai';
    });
    if (hasPendingCollab) choPhanHoi += 1;

    // KPI 3 — Chờ Owner xác nhận
    if (tStatus === 'cho_owner_xac_nhan') choOwnerXacNhan += 1;

    // KPI 4 — Quá hạn
    if (overdue) quaHan += 1;
  }

  const cells: Array<{ key: SnapshotKey; label: string; n: number; tone?: 'default' | 'warning' | 'danger' }> = [
    { key: 'can-toi-xu-ly',      label: 'Cần xử lý',          n: canToiXuLy,      tone: 'default' },
    { key: 'cho-phan-hoi',       label: 'Chờ phản hồi',       n: choPhanHoi,      tone: 'warning' },
    { key: 'cho-owner-xac-nhan', label: 'Chờ Owner xác nhận', n: choOwnerXacNhan, tone: 'warning' },
    { key: 'qua-han',            label: 'Quá hạn',            n: quaHan,          tone: 'danger' },
  ];

  return (
    <SegmentSummary
      items={cells.map((c) => ({
        n: c.n,
        label: c.label,
        tone: c.tone,
        onClick: onSelectCell && c.n > 0 ? () => onSelectCell(c.key) : undefined,
        active: activeKey === c.key,
        title: c.n === 0 ? 'Không có việc' : `Lọc danh sách: ${c.label}`,
      }))}
    />
  );
}
