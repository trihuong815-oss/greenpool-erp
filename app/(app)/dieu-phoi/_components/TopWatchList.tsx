'use client';

import { useMemo } from 'react';
import { ClipboardList, Users, FileText, AlertTriangle } from 'lucide-react';
import type { CoordTask } from './types';

// ============================================================
// V4 SPEC — Sort theo công thức weight:
//   overdue        × 100
//   khan_cap       × 80
//   stuck > 48h    × 60
//   lien_khoi      × 30
//   trong_diem     × 40
//   cho_owner_xac_nhan × 50
// Top 5. KHÔNG dùng helpers cũ (stuckHours×2/priority weight cũ).
// ============================================================

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

/** V4: Severity — đọc field optional, fallback priority high → khẩn cấp. */
function isKhanCap(t: CoordTask): boolean {
  const raw = (t as unknown as { severity?: string }).severity;
  if (raw === 'khan_cap') return true;
  if (raw === 'binh_thuong') return false;
  return t.priority === 'high';
}

/** V4: Level — đọc field optional. 'trong_diem' = mức cao nhất. */
function isTrongDiem(t: CoordTask): boolean {
  const raw = (t as unknown as { level?: string; coordLevel?: string }).level
    ?? (t as unknown as { coordLevel?: string }).coordLevel;
  return raw === 'trong_diem';
}

/** V4: task status mở rộng (cho_owner_xac_nhan). */
function isChoOwnerXacNhan(t: CoordTask): boolean {
  const s = (t as unknown as { status?: string }).status ?? t.status;
  return s === 'cho_owner_xac_nhan';
}

/** V4 scoring công thức. */
function scoreOf(t: CoordTask): number {
  const overdueW   = isOverdue(t)           ? 100 : 0;
  const khanCapW   = isKhanCap(t)           ? 80  : 0;
  const stuckW     = stuckHours(t) > 48     ? 60  : 0;
  const lienKhoiW  = t.scope === 'lien_khoi' ? 30 : 0;
  const trongDiemW = isTrongDiem(t)         ? 40  : 0;
  const ownerCfmW  = isChoOwnerXacNhan(t)   ? 50  : 0;
  return overdueW + khanCapW + stuckW + lienKhoiW + trongDiemW + ownerCfmW;
}

const ICON_BY_TYPE: Record<string, { icon: typeof ClipboardList; bg: string; color: string }> = {
  // V4 types
  van_hanh:  { icon: ClipboardList, bg: 'bg-sky-100',      color: 'text-sky-700'      },
  marketing: { icon: ClipboardList, bg: 'bg-emerald-100',  color: 'text-emerald-700'  },
  dao_tao:   { icon: FileText,      bg: 'bg-violet-100',   color: 'text-violet-700'   },
  nhan_su:   { icon: Users,         bg: 'bg-amber-100',    color: 'text-amber-700'    },
  ky_thuat:  { icon: ClipboardList, bg: 'bg-orange-100',   color: 'text-orange-700'   },
  tai_chinh: { icon: FileText,      bg: 'bg-rose-100',     color: 'text-rose-700'     },
  du_an:     { icon: ClipboardList, bg: 'bg-indigo-100',   color: 'text-indigo-700'   },
  // Backward compat V3
  dieu_phoi: { icon: ClipboardList, bg: 'bg-emerald-100',  color: 'text-emerald-700'  },
  ho_tro:    { icon: Users,         bg: 'bg-sky-100',      color: 'text-sky-700'      },
  de_xuat:   { icon: FileText,      bg: 'bg-violet-100',   color: 'text-violet-700'   },
  phe_duyet: { icon: FileText,      bg: 'bg-amber-100',    color: 'text-amber-700'    },
  canh_bao:  { icon: AlertTriangle, bg: 'bg-rose-100',     color: 'text-rose-700'     },
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
    <div className="rounded-xl border border-slate-200/70 bg-white shadow-md ring-1 ring-slate-50 overflow-hidden">
      <div className="bg-gradient-to-r from-amber-50 to-amber-50/40 px-4 py-2 border-b border-amber-100/70 flex items-center justify-between">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Top việc cần quan tâm</h3>
        <button type="button" className="text-[11px] font-medium text-emerald-600 hover:text-emerald-700 hover:underline">Xem tất cả</button>
      </div>

      {items.length === 0 ? (
        <div className="py-7 text-center text-xs text-slate-400">Chưa có việc cần ưu tiên</div>
      ) : (
        <div>
          {items.map(({ t, days, meta }) => {
            const Icon = meta.icon;
            const khan = isKhanCap(t);
            const trongDiem = isTrongDiem(t);
            return (
              <div key={t.id} className="flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-slate-50/70 border-b border-slate-50 last:border-0 transition-colors">
                <div className={`rounded-lg p-2 shadow-sm ring-1 ring-inset ring-white/40 ${meta.bg}`}><Icon size={16} className={meta.color} /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-sm text-slate-800 truncate">{t.title}</span>
                    {khan && (
                      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-rose-100 text-rose-700 ring-1 ring-inset ring-rose-200">
                        Khẩn cấp
                      </span>
                    )}
                    {trongDiem && (
                      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 ring-1 ring-inset ring-amber-200">
                        Trọng điểm
                      </span>
                    )}
                  </div>
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
