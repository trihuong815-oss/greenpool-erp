'use client';

// Phase Checklist-Chart (2026-06-09): heatmap thống kê checklist N ngày gần nhất.
// Pattern GitHub contribution graph — row=user, col=ngày, mỗi cell có 3 sub-cell
// nhỏ (sáng/chiều/tối) màu theo status.
//
// Status:
//   submitted_on_time → xanh emerald
//   submitted_late    → vàng amber
//   missed            → đỏ rose
//   not_yet           → xám slate (hôm nay chưa qua deadline)
//
// Click cell → modal chi tiết (sau).

import { useEffect, useState } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';

type Status = 'submitted_on_time' | 'submitted_late' | 'missed' | 'not_yet';
type Shift = 'morning' | 'afternoon' | 'evening';

interface UserInfo {
  uid: string;
  name: string;
  role: 'QLCS' | 'PP_HT' | 'PP_XLN';
  branchId: string | null;
  branchName: string | null;
}

interface StatsResp {
  days: string[];
  users: UserInfo[];
  matrix: Record<string, Record<string, Record<Shift, Status>>>;
}

const SHIFT_LABEL: Record<Shift, string> = { morning: 'S', afternoon: 'C', evening: 'T' };
const SHIFT_FULL: Record<Shift, string> = { morning: 'Sáng', afternoon: 'Chiều', evening: 'Tối' };

const STATUS_STYLE: Record<Status, { bg: string; ring?: string; label: string }> = {
  submitted_on_time: { bg: 'bg-emerald-500', label: 'Đúng giờ' },
  submitted_late:    { bg: 'bg-amber-500', label: 'Muộn' },
  missed:            { bg: 'bg-rose-500', label: 'Bỏ lỡ' },
  not_yet:           { bg: 'bg-slate-200', label: 'Chưa đến hạn' },
};

const ROLE_LABEL: Record<UserInfo['role'], string> = {
  QLCS: 'QLCS',
  PP_HT: 'PP HT',
  PP_XLN: 'PP XLN',
};

export function ChecklistHeatmap() {
  const [data, setData] = useState<StatsResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/checklist-v2/stats?days=${days}`, { cache: 'no-store' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      const d = (await res.json()) as StatsResp;
      setData(d);
    } catch (e: any) {
      setErr(e?.message ?? 'Load lỗi');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [days]);

  if (loading && !data) {
    return <div className="text-sm text-slate-500 py-6 text-center">Đang tải biểu đồ...</div>;
  }
  if (err) {
    return <div className="text-sm text-rose-600 py-4">⚠ {err}</div>;
  }
  if (!data || data.users.length === 0) {
    return <div className="text-sm text-slate-500 py-6 text-center">Không có user nào trong scope.</div>;
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-2 text-slate-700">
          <BarChart3 size={18} className="text-emerald-600" />
          <h3 className="font-semibold text-sm">Thống kê checklist {days} ngày gần nhất</h3>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="text-xs border border-slate-200 rounded px-2 py-1"
          >
            <option value={7}>7 ngày</option>
            <option value={14}>14 ngày</option>
            <option value={30}>30 ngày</option>
            <option value={60}>60 ngày</option>
            <option value={90}>90 ngày</option>
          </select>
          <button
            onClick={load}
            className="text-slate-500 hover:text-emerald-600 p-1"
            aria-label="Tải lại"
            title="Tải lại"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mb-3 text-xs">
        {(['submitted_on_time', 'submitted_late', 'missed', 'not_yet'] as Status[]).map((s) => (
          <div key={s} className="inline-flex items-center gap-1">
            <span className={`w-3 h-3 rounded-sm ${STATUS_STYLE[s].bg}`} />
            <span className="text-slate-600">{STATUS_STYLE[s].label}</span>
          </div>
        ))}
      </div>

      {/* Heatmap table — scroll ngang trên mobile */}
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white text-left font-semibold text-slate-600 px-2 py-1 min-w-[140px]">Người</th>
              <th className="text-left font-semibold text-slate-600 px-2 py-1 min-w-[60px]">Vai trò</th>
              {data.days.map((d) => (
                <th key={d} className="text-center font-normal text-slate-400 px-0.5 py-1 min-w-[24px]">
                  <div className="text-[9px]">{d.slice(8)}</div>
                  <div className="text-[8px] text-slate-300">{['CN','T2','T3','T4','T5','T6','T7'][new Date(d).getDay()]}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.users.map((u) => (
              <tr key={u.uid} className="hover:bg-slate-50">
                <td className="sticky left-0 bg-white border-t border-slate-100 px-2 py-1.5 font-medium text-slate-700 truncate">
                  {u.name}
                </td>
                <td className="border-t border-slate-100 px-2 py-1.5 text-slate-500 whitespace-nowrap">
                  {ROLE_LABEL[u.role]}{u.branchName ? ` · ${u.branchName}` : ''}
                </td>
                {data.days.map((d) => {
                  const cell = data.matrix[u.uid]?.[d];
                  if (!cell) return <td key={d} className="border-t border-slate-100 px-0.5 py-1" />;
                  return (
                    <td key={d} className="border-t border-slate-100 px-0.5 py-1">
                      <div className="flex flex-col gap-[2px]" title={`${u.name} · ${d}\nSáng: ${STATUS_STYLE[cell.morning].label}\nChiều: ${STATUS_STYLE[cell.afternoon].label}\nTối: ${STATUS_STYLE[cell.evening].label}`}>
                        {(['morning', 'afternoon', 'evening'] as Shift[]).map((s) => (
                          <div
                            key={s}
                            className={`h-1.5 w-full rounded-sm ${STATUS_STYLE[cell[s]].bg}`}
                            aria-label={`${SHIFT_FULL[s]}: ${STATUS_STYLE[cell[s]].label}`}
                          />
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary footer */}
      <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        {(['submitted_on_time', 'submitted_late', 'missed', 'not_yet'] as Status[]).map((s) => {
          let count = 0;
          for (const u of data.users) {
            for (const d of data.days) {
              const c = data.matrix[u.uid]?.[d];
              if (!c) continue;
              if (c.morning === s) count++;
              if (c.afternoon === s) count++;
              if (c.evening === s) count++;
            }
          }
          const total = data.users.length * data.days.length * 3;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div key={s} className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-sm ${STATUS_STYLE[s].bg}`} />
              <div>
                <div className="text-slate-700 font-semibold">{count} ({pct}%)</div>
                <div className="text-slate-400 text-[10px]">{STATUS_STYLE[s].label}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
