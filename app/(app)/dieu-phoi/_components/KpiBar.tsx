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
import type { CoordTask } from './types';

interface KpiBarProps {
  tasks: CoordTask[];
  currentUserUid: string;
}

type AccentKey = 'rose' | 'sky' | 'amber' | 'violet' | 'rose-strong';

// Static class maps so Tailwind JIT/purge can detect every utility.
const ACCENT_BAR: Record<AccentKey, string> = {
  rose: 'bg-rose-500',
  sky: 'bg-sky-500',
  amber: 'bg-amber-500',
  violet: 'bg-violet-500',
  'rose-strong': 'bg-rose-600',
};

const ICON_WRAP: Record<AccentKey, string> = {
  rose: 'bg-rose-50',
  sky: 'bg-sky-50',
  amber: 'bg-amber-50',
  violet: 'bg-violet-50',
  'rose-strong': 'bg-rose-50',
};

const ICON_COLOR: Record<AccentKey, string> = {
  rose: 'text-rose-600',
  sky: 'text-sky-600',
  amber: 'text-amber-600',
  violet: 'text-violet-600',
  'rose-strong': 'text-rose-700',
};

const COUNT_COLOR: Record<AccentKey, string> = {
  rose: 'text-rose-600',
  sky: 'text-sky-600',
  amber: 'text-amber-600',
  violet: 'text-violet-600',
  'rose-strong': 'text-rose-700',
};

const LINK_COLOR: Record<AccentKey, string> = {
  rose: 'text-rose-600',
  sky: 'text-sky-600',
  amber: 'text-amber-600',
  violet: 'text-violet-600',
  'rose-strong': 'text-rose-700',
};

interface KpiItem {
  key: string;
  label: string;
  subtext: string;
  icon: LucideIcon;
  accent: AccentKey;
  count: number;
}

function isOverdue(task: CoordTask, todayMs: number): boolean {
  if (task.status === 'hoan_thanh' || task.status === 'dong_ho_so') return false;
  if (!task.dueDate) return false;
  const due = new Date(`${task.dueDate}T23:59:59+07:00`).getTime();
  return Number.isFinite(due) && due < todayMs;
}

export default function KpiBar({ tasks, currentUserUid }: KpiBarProps) {
  const todayMs = Date.now();

  // Determine the current user's display name from any task they own
  // (mock-data driven — falls back to uid for matching waitingForPerson).
  const myTask = tasks.find((t) => t.ownerUid === currentUserUid);
  const myName = myTask?.ownerName ?? '';

  let cantToiXuLy = 0;
  let choPhanHoi = 0;
  let choDuyet = 0;
  let lienKhoi = 0;
  let quaHan = 0;

  for (const t of tasks) {
    const overdue = isOverdue(t, todayMs);
    const ownedByMe = t.ownerUid === currentUserUid;
    const waitingOnMe = myName.length > 0 && t.waitingForPerson === myName;

    if (ownedByMe || waitingOnMe || overdue) cantToiXuLy += 1;
    if (t.status === 'cho_phan_hoi') choPhanHoi += 1;
    if (t.status === 'cho_phe_duyet') choDuyet += 1;
    if (t.scope === 'lien_khoi') lienKhoi += 1;
    if (overdue) quaHan += 1;
  }

  const items: KpiItem[] = [
    {
      key: 'can-toi-xu-ly',
      label: 'Cần tôi xử lý',
      subtext: 'liên quan đến tôi',
      icon: ClipboardList,
      accent: 'rose',
      count: cantToiXuLy,
    },
    {
      key: 'cho-phan-hoi',
      label: 'Chờ phản hồi',
      subtext: 'liên quan đến tôi',
      icon: MessageSquare,
      accent: 'sky',
      count: choPhanHoi,
    },
    {
      key: 'cho-duyet',
      label: 'Chờ duyệt',
      subtext: 'liên quan đến tôi',
      icon: CheckCircle,
      accent: 'amber',
      count: choDuyet,
    },
    {
      key: 'lien-khoi',
      label: 'Liên khối',
      subtext: 'toàn hệ thống',
      icon: Users,
      accent: 'violet',
      count: lienKhoi,
    },
    {
      key: 'qua-han',
      label: 'Quá hạn',
      subtext: 'toàn hệ thống',
      icon: AlertTriangle,
      accent: 'rose-strong',
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
            className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 transition hover:shadow-md"
          >
            <div
              className={`absolute left-0 top-0 bottom-0 w-1 ${ACCENT_BAR[item.accent]}`}
            />
            <div className="flex items-start gap-3">
              <div className={`rounded-lg p-2.5 ${ICON_WRAP[item.accent]}`}>
                <Icon size={20} className={ICON_COLOR[item.accent]} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-700">
                  {item.label}
                </div>
                <div
                  className={`mt-1 text-3xl font-bold tabular-nums ${COUNT_COLOR[item.accent]}`}
                >
                  {item.count}
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  {item.subtext}
                </div>
              </div>
            </div>
            <button
              type="button"
              className={`mt-2 inline-flex items-center gap-0.5 text-xs font-medium hover:underline ${LINK_COLOR[item.accent]}`}
            >
              Xem chi tiết <ChevronRight size={11} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
