'use client';

import { useMemo } from 'react';
import { AlertTriangle, CheckCircle, CheckCircle2, MessageSquare } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { CoordTask } from './types';

interface Props { tasks: CoordTask[] }

type NotiColor = 'rose' | 'amber' | 'sky' | 'emerald';
interface NotiItem {
  id: string;
  time: string;
  icon: LucideIcon;
  color: NotiColor;
  title: string;
  sub: string;
  ts: number;
}

const BG: Record<NotiColor, string> = {
  rose: 'bg-rose-100', amber: 'bg-amber-100', sky: 'bg-sky-100', emerald: 'bg-emerald-100',
};
const TXT: Record<NotiColor, string> = {
  rose: 'text-rose-600', amber: 'text-amber-600', sky: 'text-sky-600', emerald: 'text-emerald-600',
};

function isOverdue(t: CoordTask): boolean {
  if (!t.dueDate) return false;
  if (t.status === 'hoan_thanh' || t.status === 'dong_ho_so') return false;
  return t.dueDate < new Date().toISOString().slice(0, 10);
}

export default function ImportantNotiPanel({ tasks }: Props) {
  const items = useMemo<NotiItem[]>(() => {
    const list: NotiItem[] = [];
    for (const t of tasks) {
      const ts = new Date(t.waitingSince || t.createdAt || Date.now()).getTime();
      const time = new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      if (isOverdue(t)) {
        const days = Math.max(1, Math.round((Date.now() - new Date(t.dueDate).getTime()) / 86_400_000));
        list.push({
          id: `${t.id}-od`, time, icon: AlertTriangle, color: 'rose',
          title: `${t.title} đang quá hạn ${days} ngày`,
          sub: `Đang chờ: ${t.waitingForPerson || '—'}`, ts,
        });
      } else if (t.status === 'cho_phe_duyet') {
        list.push({
          id: `${t.id}-ap`, time, icon: CheckCircle, color: 'amber',
          title: `${t.title} - cần phê duyệt`,
          sub: `Đang chờ: ${t.waitingForPerson || '—'}`, ts,
        });
      } else if (t.status === 'cho_phan_hoi') {
        list.push({
          id: `${t.id}-rp`, time, icon: MessageSquare, color: 'sky',
          title: `${t.title} chờ phản hồi`,
          sub: `Đang chờ: ${t.waitingForPerson || '—'}`, ts,
        });
      } else if (t.status === 'hoan_thanh') {
        list.push({
          id: `${t.id}-dn`, time, icon: CheckCircle2, color: 'emerald',
          title: `${t.title} đã hoàn thành`,
          sub: t.ownerName ? `Owner: ${t.ownerName}` : '—', ts,
        });
      }
    }
    return list.sort((a, b) => b.ts - a.ts).slice(0, 4);
  }, [tasks]);

  return (
    <div className="rounded-xl border border-slate-200/70 bg-white shadow-md ring-1 ring-slate-50 overflow-hidden">
      <div className="bg-gradient-to-r from-sky-50 to-sky-50/40 px-4 py-2 border-b border-sky-100/70 flex items-center justify-between">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-sky-700">Thông báo quan trọng</h3>
        <button type="button" className="text-[11px] font-medium text-emerald-600 hover:text-emerald-700 hover:underline">Xem tất cả</button>
      </div>

      {items.length === 0 ? (
        <div className="py-7 text-center text-xs text-slate-400">Chưa có thông báo</div>
      ) : (
        <div>
          {items.map((n) => {
            const Icon = n.icon;
            return (
              <div key={n.id} className="flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-slate-50/70 border-b border-slate-50 last:border-0 text-sm transition-colors">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ring-1 ring-inset ring-white/40 ${BG[n.color]}`}>
                  <Icon size={14} className={TXT[n.color]} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-slate-400 tabular-nums">{n.time}</div>
                  <div className="text-sm font-semibold text-slate-800 truncate">{n.title}</div>
                  <div className="text-xs text-slate-500 truncate">{n.sub}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
