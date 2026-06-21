// PR-TK3A (2026-06-21) — Card hiển thị tiến độ chỉ tiêu tháng.
// Read-only — KHÔNG có nút sửa (defer PR-TK3B).
//
// Render:
//   - Header: "Chỉ tiêu tháng" + scope label + status badge
//   - 3 KPI inline: target / thực đạt / % hoàn thành
//   - Progress bar so sánh actual vs target + marker tiến độ thời gian
//   - Footer: còn thiếu + tiến độ thời gian text
//   - Empty: "Chưa đặt chỉ tiêu — Liên hệ admin để thiết lập"

import { Target, TrendingUp, AlertCircle, CheckCircle2 } from 'lucide-react';
import { fmtMoney } from './utils';
import type { TargetSummary, TargetStatus, TargetScope } from './types';

interface Props {
  targetSummary: TargetSummary | undefined;
}

const STATUS_LABEL: Record<TargetStatus, string> = {
  achieved: 'Đã đạt',
  on_track: 'Đúng tiến độ',
  watch: 'Cần theo sát',
  behind: 'Chậm tiến độ',
  not_set: 'Chưa đặt chỉ tiêu',
};

const STATUS_TONE: Record<TargetStatus, { card: string; badge: string; bar: string }> = {
  achieved: {
    card: 'bg-emerald-50 ring-emerald-200',
    badge: 'bg-emerald-100 text-emerald-700 ring-emerald-300',
    bar:   'bg-gradient-to-r from-emerald-400 to-emerald-600',
  },
  on_track: {
    card: 'bg-sky-50 ring-sky-200',
    badge: 'bg-sky-100 text-sky-700 ring-sky-300',
    bar:   'bg-gradient-to-r from-sky-400 to-sky-600',
  },
  watch: {
    card: 'bg-amber-50 ring-amber-200',
    badge: 'bg-amber-100 text-amber-700 ring-amber-300',
    bar:   'bg-gradient-to-r from-amber-400 to-amber-600',
  },
  behind: {
    card: 'bg-rose-50 ring-rose-200',
    badge: 'bg-rose-100 text-rose-700 ring-rose-300',
    bar:   'bg-gradient-to-r from-rose-400 to-rose-600',
  },
  not_set: {
    card: 'bg-white ring-slate-200',
    badge: 'bg-slate-100 text-slate-600 ring-slate-300',
    bar:   'bg-slate-300',
  },
};

const SCOPE_LABEL: Record<TargetScope, string> = {
  sale: 'Cá nhân',
  branch: 'Cơ sở',
  system: 'Toàn hệ thống',
  none: '—',
};

function fmtPct(p: number | null): string {
  if (p == null) return '—';
  return `${p.toFixed(1)}%`;
}

export default function TargetProgressCard({ targetSummary }: Props) {
  if (!targetSummary) return null;

  const t = targetSummary;
  const tone = STATUS_TONE[t.status];
  const isNotSet = t.status === 'not_set';

  // Bar width — clamp 0-100 cho progress visual
  const barPct = t.percentComplete != null ? Math.min(100, Math.max(0, t.percentComplete)) : 0;
  // Time marker position (0-100)
  const timePct = Math.min(100, Math.max(0, t.daysElapsedPercent));

  return (
    <div className={`rounded-xl p-4 ring-1 ${tone.card}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Target size={18} className="text-slate-600" />
          <h3 className="text-sm font-bold text-slate-800">
            Chỉ tiêu tháng <span className="text-slate-500 font-normal">· {SCOPE_LABEL[t.scope]}</span>
          </h3>
        </div>
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ${tone.badge}`}>
          {t.status === 'achieved' && <CheckCircle2 size={12} />}
          {(t.status === 'watch' || t.status === 'behind') && <AlertCircle size={12} />}
          {STATUS_LABEL[t.status]}
        </span>
      </div>

      {isNotSet ? (
        <div className="text-center py-4">
          <div className="text-sm text-slate-500 italic">
            {t.scope === 'sale'
              ? 'QLCS chưa đặt chỉ tiêu cá nhân cho bạn tháng này.'
              : t.scope === 'branch'
                ? 'Chưa đặt chỉ tiêu cơ sở cho tháng này. Liên hệ GĐ Kinh doanh để thiết lập.'
                : t.scope === 'system'
                  ? 'Chưa cơ sở nào có chỉ tiêu tháng này. Liên hệ GĐ Kinh doanh để thiết lập.'
                  : 'Chưa đặt chỉ tiêu.'}
          </div>
          {/* Vẫn show actual để user biết doanh số thực đạt */}
          <div className="mt-3 text-xs text-slate-600">
            Doanh số thực đạt: <strong className="text-emerald-700 tabular-nums">{fmtMoney(t.actualRevenue)}</strong>
          </div>
        </div>
      ) : (
        <>
          {/* 3 KPI inline */}
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div>
              <div className="text-[10px] uppercase font-semibold tracking-wider text-slate-500">Chỉ tiêu</div>
              <div className="text-base font-bold text-slate-800 tabular-nums mt-0.5">{fmtMoney(t.targetRevenue ?? 0)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase font-semibold tracking-wider text-slate-500">Thực đạt</div>
              <div className="text-base font-bold text-emerald-700 tabular-nums mt-0.5 flex items-center gap-1">
                <TrendingUp size={14} />
                {fmtMoney(t.actualRevenue)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase font-semibold tracking-wider text-slate-500">% hoàn thành</div>
              <div className="text-base font-bold text-slate-800 tabular-nums mt-0.5">{fmtPct(t.percentComplete)}</div>
            </div>
          </div>

          {/* Progress bar + time marker */}
          <div className="relative h-3 rounded-full bg-slate-200 overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all ${tone.bar}`}
              style={{ width: `${barPct}%` }}
              aria-label={`Hoàn thành ${fmtPct(t.percentComplete)}`}
            />
            {/* Time marker: vạch dọc chỉ tiến độ ngày trong tháng */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-slate-700"
              style={{ left: `${timePct}%` }}
              title={`Tiến độ thời gian: ${timePct.toFixed(0)}% tháng đã qua`}
            />
          </div>

          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2">
            <span>
              Còn thiếu: <strong className="text-rose-700 tabular-nums">{fmtMoney(t.remaining ?? 0)}</strong>
            </span>
            <span>
              Tiến độ thời gian: <strong className="tabular-nums">{timePct.toFixed(0)}%</strong> tháng
              {t.progressGap != null && (
                <span className={`ml-2 tabular-nums ${t.progressGap >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  ({t.progressGap >= 0 ? '+' : ''}{t.progressGap.toFixed(1)} điểm)
                </span>
              )}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
