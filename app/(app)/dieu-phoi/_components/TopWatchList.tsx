'use client';

import { useMemo } from 'react';
import { ClipboardList, Users, FileText, AlertTriangle } from 'lucide-react';
import type { CoordTask } from './types';

interface Props { tasks: CoordTask[] }

function stuckHours(t: CoordTask): number {
  if (!t.waitingSince) return 0;
  const since = new Date(t.waitingSince).getTime();
  if (!Number.isFinite(since)) return 0;
  return Math.max(0, (Date.now() - since) / 3_600_000);
}
function isOverdue(t: CoordTask): boolean {
  if (!t.dueDate) return false;
  if (t.status === 'hoan_thanh' || t.status === 'dong_ho_so') return false;
  return t.dueDate < new Date().toISOString().slice(0, 10);
}
function scoreOf(t: CoordTask): number {
  const overdueW = isOverdue(t) ? 100 : 0;
  const stuckW = Math.min(stuckHours(t) * 2, 200);
  const crossW = t.scope === 'lien_khoi' ? 30 : 0;
  const apprW = t.status === 'cho_phe_duyet' ? 50 : 0;
  const prioW = t.priority === 'high' ? 20 : t.priority === 'normal' ? 10 : 0;
  return overdueW + stuckW + crossW + apprW + prioW;
}

const ICON_BY_TYPE: Record<string, { icon: typeof ClipboardList; bg: string; color: string }> = {
  dieu_phoi: { icon: ClipboardList, bg: 'bg-emerald-100', color: 'text-emerald-700' },
  ho_tro:    { icon: Users,         bg: 'bg-sky-100',     color: 'text-sky-700'     },
  de_xuat:   { icon: FileText,      bg: 'bg-violet-100',  color: 'text-violet-700'  },
  phe_duyet: { icon: FileText,      bg: 'bg-amber-100',   color: 'text-amber-700'   },
  canh_bao:  { icon: AlertTriangle, bg: 'bg-rose-100',    color: 'text-rose-700'    },
};

export default function TopWatchList({ tasks }: Props) {
  const items = useMemo(() =>
    [...tasks].map((t) => ({ task: t, score: scoreOf(t) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(({ task: t }) => {
        const days = Math.round(stuckHours(t) / 24);
        const meta = ICON_BY_TYPE[t.type] ?? ICON_BY_TYPE.dieu_phoi;
        return { t, days, meta };
      }),
  [tasks]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="bg-amber-50/60 px-4 py-2.5 border-b border-amber-100 flex items-center justify-between">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Top việc cần quan tâm</h3>
        <button type="button" className="text-xs text-emerald-600 hover:text-emerald-700 hover:underline">Xem tất cả</button>
      </div>

      {items.length === 0 ? (
        <div className="py-8 text-center text-sm text-slate-400">Chưa có việc cần ưu tiên</div>
      ) : (
        <div>
          {items.map(({ t, days, meta }) => {
            const Icon = meta.icon;
            return (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 border-b border-slate-100 last:border-0 transition-colors">
                <div className={`rounded-lg p-2.5 ${meta.bg}`}><Icon size={18} className={meta.color} /></div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-slate-800 truncate">{t.title}</div>
                  <div className="text-xs text-slate-600 mt-0.5">Đang chờ: <span className="font-medium">{t.waitingForPerson || '—'}</span></div>
                  <div className="text-xs text-slate-500 truncate">Nội dung: {t.waitingForContent || '—'}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-2xl font-bold tabular-nums text-slate-800 leading-none">{days}</div>
                  <div className="text-[10px] text-slate-500 uppercase">ngày</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
