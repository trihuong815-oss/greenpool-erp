'use client';

import {
  AlertTriangle, CheckCircle, ClipboardList, Hourglass, Users,
  type LucideIcon,
} from 'lucide-react';
import type { CoordTask } from '../types';

// V6.4 (2026-06-13): 5 KPI vuốt ngang mobile (snap-x). Click → lọc list bên dưới.
// Reuse logic count từ CompactKpiBar.

export type MobileKpiKey =
  | 'can-toi-xu-ly'
  | 'dang-chu-tri'
  | 'dang-phoi-hop'
  | 'cho-phan-hoi'
  | 'qua-han';

const TERMINAL = new Set(['hoan_thanh', 'dong_ho_so']);

function isPastIso(d: string | undefined | null): boolean {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const dt = new Date(`${d}T23:59:59+07:00`).getTime();
  return Number.isFinite(dt) && dt < Date.now();
}

interface Props {
  tasks: CoordTask[];
  currentUserUid: string;
  currentUserDeptId: string | null;
  currentUserFacilityId: string | null;
  active: MobileKpiKey | null;
  onSelect: (key: MobileKpiKey | null) => void;
}

const ACCENT: Record<string, { wrap: string; icon: string; count: string; ring: string }> = {
  rose: { wrap: 'bg-rose-50', icon: 'text-rose-600', count: 'text-rose-600', ring: 'ring-rose-200' },
  emerald: { wrap: 'bg-emerald-50', icon: 'text-emerald-600', count: 'text-emerald-600', ring: 'ring-emerald-200' },
  sky: { wrap: 'bg-sky-50', icon: 'text-sky-600', count: 'text-sky-600', ring: 'ring-sky-200' },
  amber: { wrap: 'bg-amber-50', icon: 'text-amber-600', count: 'text-amber-600', ring: 'ring-amber-200' },
  rose2: { wrap: 'bg-rose-100', icon: 'text-rose-700', count: 'text-rose-700', ring: 'ring-rose-300' },
};

export default function SwipeKpiBar({
  tasks, currentUserUid, currentUserDeptId, currentUserFacilityId, active, onSelect,
}: Props) {
  let canToiXuLy = 0, dangChuTri = 0, dangPhoiHop = 0, choPhanHoi = 0, quaHan = 0;

  for (const t of tasks) {
    const isOwner = t.ownerUid === currentUserUid;
    const status = String(t.status);
    const terminal = TERMINAL.has(status);

    if (isOwner && (status === 'khoi_tao' || status === 'cho_owner_xac_nhan' || status === 'cho_phe_duyet')) {
      canToiXuLy += 1;
    }
    if (isOwner && (status === 'dang_xu_ly' || status === 'dang_phoi_hop')) {
      dangChuTri += 1;
    }
    let isMyCollab = false;
    for (const c of t.collaborators ?? []) {
      const cid = c.id.startsWith('dept-') ? c.id.slice(5)
        : c.id.startsWith('facility-') ? c.id.slice(9) : '';
      if (currentUserDeptId && cid === currentUserDeptId) { isMyCollab = true; break; }
      if (currentUserFacilityId && cid === currentUserFacilityId) { isMyCollab = true; break; }
    }
    if (isMyCollab && !terminal) dangPhoiHop += 1;
    const waitPerson = t.waitingForPerson ?? '';
    const waitUnit = t.waitingForUnit ?? '';
    if (
      (waitPerson && waitPerson === currentUserUid) ||
      (currentUserDeptId && waitUnit === currentUserDeptId) ||
      (currentUserFacilityId && waitUnit === currentUserFacilityId)
    ) choPhanHoi += 1;
    if (!terminal && (isOwner || isMyCollab) && isPastIso(t.dueDate)) quaHan += 1;
  }

  const items: Array<{ key: MobileKpiKey; label: string; icon: LucideIcon; accent: string; count: number }> = [
    { key: 'can-toi-xu-ly', label: 'Cần xử lý', icon: ClipboardList, accent: 'rose', count: canToiXuLy },
    { key: 'dang-chu-tri', label: 'Đang chủ trì', icon: Users, accent: 'emerald', count: dangChuTri },
    { key: 'dang-phoi-hop', label: 'Đang phối hợp', icon: Hourglass, accent: 'sky', count: dangPhoiHop },
    { key: 'cho-phan-hoi', label: 'Chờ phản hồi', icon: CheckCircle, accent: 'amber', count: choPhanHoi },
    { key: 'qua-han', label: 'Quá hạn', icon: AlertTriangle, accent: 'rose2', count: quaHan },
  ];

  return (
    <div className="-mx-4 px-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory">
      <div className="flex gap-3 pb-1">
        {items.map((item) => {
          const Icon = item.icon;
          const a = ACCENT[item.accent];
          const isActive = active === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelect(isActive ? null : item.key)}
              className={
                'snap-start shrink-0 w-[148px] rounded-2xl bg-white shadow-sm p-3.5 transition active:scale-95 ' +
                'ring-1 ' + (isActive ? `${a.ring} ring-2` : 'ring-slate-200')
              }
            >
              <div className={`inline-flex rounded-xl p-2 ${a.wrap} mb-2`}>
                <Icon size={18} className={a.icon} />
              </div>
              <div className={`text-3xl font-bold tabular-nums ${a.count} leading-none`}>
                {item.count}
              </div>
              <div className="text-[12px] font-medium text-slate-600 mt-1.5 truncate">{item.label}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
