'use client';

import {
  AlertTriangle, CheckCircle, ClipboardList, Hourglass, Users,
  type LucideIcon,
} from 'lucide-react';
import type { CoordTask } from '../types';

// ============================================================
// V6.4 (2026-06-13): COMPACT KPI BAR cho TP/QLCS
// 5 KPI cá nhân hoá theo spec anh chốt:
//   1. Cần tôi xử lý       (owner=tôi & status ∈ [khoi_tao, cho_owner_xac_nhan, cho_phe_duyet])
//   2. Đang chủ trì        (owner=tôi & status ∈ [dang_xu_ly, dang_phoi_hop])
//   3. Đang phối hợp       (đơn vị tôi ∈ collab & task chưa terminal)
//   4. Chờ phản hồi        (waitingForPerson=tôi HOẶC waitingForUnit=đơn vị tôi)
//   5. Quá hạn             (dueDate < today HOẶC collab deadline < today với phần collab tôi)
// Tất cả KPI click được → filter bảng bên dưới.
// ============================================================

export type CompactKpiKey =
  | 'can-toi-xu-ly'
  | 'dang-chu-tri'
  | 'dang-phoi-hop'
  | 'cho-phan-hoi'
  | 'qua-han';

interface CompactKpiBarProps {
  tasks: CoordTask[];
  currentUserUid: string;
  currentUserDeptId: string | null;
  currentUserFacilityId: string | null;
  active: CompactKpiKey | null;
  onSelect: (key: CompactKpiKey | null) => void;
}

type AccentKey = 'rose' | 'emerald' | 'sky' | 'amber' | 'rose-strong';

const ICON_WRAP: Record<AccentKey, string> = {
  rose: 'bg-rose-50', emerald: 'bg-emerald-50', sky: 'bg-sky-50', amber: 'bg-amber-50', 'rose-strong': 'bg-rose-100',
};
const ICON_COLOR: Record<AccentKey, string> = {
  rose: 'text-rose-600', emerald: 'text-emerald-600', sky: 'text-sky-600', amber: 'text-amber-600', 'rose-strong': 'text-rose-700',
};
const COUNT_COLOR: Record<AccentKey, string> = {
  rose: 'text-rose-600', emerald: 'text-emerald-600', sky: 'text-sky-600', amber: 'text-amber-600', 'rose-strong': 'text-rose-700',
};

const TERMINAL_STATUS = new Set(['hoan_thanh', 'dong_ho_so']);

function isPastDateIso(d: string | undefined | null): boolean {
  if (!d) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const dt = new Date(`${d}T23:59:59+07:00`).getTime();
  return Number.isFinite(dt) && dt < Date.now();
}

export default function CompactKpiBar({
  tasks, currentUserUid, currentUserDeptId, currentUserFacilityId, active, onSelect,
}: CompactKpiBarProps) {
  let canToiXuLy = 0;
  let dangChuTri = 0;
  let dangPhoiHop = 0;
  let choPhanHoi = 0;
  let quaHan = 0;

  for (const t of tasks) {
    const isOwner = t.ownerUid === currentUserUid;
    const status = String(t.status);
    const terminal = TERMINAL_STATUS.has(status);

    // 1. Cần tôi xử lý
    if (isOwner && (status === 'khoi_tao' || status === 'cho_owner_xac_nhan' || status === 'cho_phe_duyet')) {
      canToiXuLy += 1;
    }
    // 2. Đang chủ trì
    if (isOwner && (status === 'dang_xu_ly' || status === 'dang_phoi_hop')) {
      dangChuTri += 1;
    }
    // 3. Đang phối hợp — đơn vị tôi tham gia collab + task chưa terminal
    let isMyCollab = false;
    for (const c of t.collaborators ?? []) {
      const cid = c.id.startsWith('dept-') ? c.id.slice(5)
                : c.id.startsWith('facility-') ? c.id.slice(9)
                : '';
      if (currentUserDeptId && cid === currentUserDeptId) { isMyCollab = true; break; }
      if (currentUserFacilityId && cid === currentUserFacilityId) { isMyCollab = true; break; }
    }
    if (isMyCollab && !terminal) dangPhoiHop += 1;

    // 4. Chờ phản hồi (theo cá nhân/đơn vị tôi)
    const waitPerson = t.waitingForPerson ?? '';
    const waitUnit = t.waitingForUnit ?? '';
    if (
      (waitPerson && waitPerson === currentUserUid) ||
      (currentUserDeptId && waitUnit === currentUserDeptId) ||
      (currentUserFacilityId && waitUnit === currentUserFacilityId)
    ) {
      choPhanHoi += 1;
    }

    // 5. Quá hạn — task của tôi (owner hoặc collab) đã quá hạn
    if (!terminal && (isOwner || isMyCollab)) {
      if (isPastDateIso(t.dueDate)) {
        quaHan += 1;
      } else {
        // Quá hạn riêng phần collab tôi
        for (const c of t.collaborators ?? []) {
          const cid = c.id.startsWith('dept-') ? c.id.slice(5)
                    : c.id.startsWith('facility-') ? c.id.slice(9) : '';
          const isMine = (currentUserDeptId && cid === currentUserDeptId) || (currentUserFacilityId && cid === currentUserFacilityId);
          if (isMine && c.status !== 'hoan_thanh' && isPastDateIso(c.deadline)) {
            quaHan += 1;
            break;
          }
        }
      }
    }
  }

  const items: Array<{
    key: CompactKpiKey; label: string; sub: string;
    icon: LucideIcon; accent: AccentKey; count: number;
  }> = [
    { key: 'can-toi-xu-ly', label: 'Cần tôi xử lý', sub: 'Owner — chờ thao tác', icon: ClipboardList, accent: 'rose', count: canToiXuLy },
    { key: 'dang-chu-tri', label: 'Đang chủ trì', sub: 'Owner — đang chạy', icon: Users, accent: 'emerald', count: dangChuTri },
    { key: 'dang-phoi-hop', label: 'Đang phối hợp', sub: 'Đơn vị tôi tham gia', icon: Hourglass, accent: 'sky', count: dangPhoiHop },
    { key: 'cho-phan-hoi', label: 'Chờ phản hồi', sub: 'Đang chờ tôi/đơn vị', icon: CheckCircle, accent: 'amber', count: choPhanHoi },
    { key: 'qua-han', label: 'Quá hạn', sub: 'Cần xử lý gấp', icon: AlertTriangle, accent: 'rose-strong', count: quaHan },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = active === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect(isActive ? null : item.key)}
            className={
              'text-left rounded-xl border bg-white p-3.5 shadow-md ring-1 transition hover:-translate-y-0.5 hover:shadow-lg ' +
              (isActive
                ? 'border-emerald-400 ring-emerald-200'
                : 'border-slate-200/70 ring-slate-50')
            }
            title={`Lọc bảng theo: ${item.label}`}
          >
            <div className="flex items-start gap-2.5">
              <div className={`rounded-lg p-2 shadow-sm ring-1 ring-inset ring-white/40 ${ICON_WRAP[item.accent]}`}>
                <Icon size={18} className={ICON_COLOR[item.accent]} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{item.label}</div>
                <div className={`mt-0.5 text-2xl font-bold tabular-nums ${COUNT_COLOR[item.accent]}`}>{item.count}</div>
                <div className="mt-0.5 text-[10px] text-slate-400">{item.sub}</div>
              </div>
            </div>
            {isActive && (
              <div className="mt-1.5 text-[10px] font-medium text-emerald-600">● Đang lọc — click để bỏ</div>
            )}
          </button>
        );
      })}
    </div>
  );
}
