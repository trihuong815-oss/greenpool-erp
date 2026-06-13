'use client';

import { useMemo } from 'react';
import type { ProposalV6, ProposalKind } from '../types';

// ============================================================
// V6.4 (2026-06-13): Donut 5 segment loại đề xuất CỦA TÔI
//   van_hanh / cai_tien / dau_tu / chien_luoc / khan_cap
// ============================================================

const SIZE = 180;
const STROKE = 28;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const CENTER = SIZE / 2;

interface Props {
  proposals: ProposalV6[];
  currentUserUid: string;
}

interface Seg {
  key: ProposalKind; name: string; count: number; hex: string; hexLight: string; gradId: string;
}

// V6.4 (2026-06-13) anh chốt 3 loại — Vận hành / Dự án / Cải tiến.
const TYPE_META: Record<ProposalKind, { name: string; hex: string; hexLight: string; gradId: string }> = {
  van_hanh: { name: 'Vận hành', hex: '#3b82f6', hexLight: '#60a5fa', gradId: 'td-vh' },
  du_an: { name: 'Dự án', hex: '#8b5cf6', hexLight: '#a78bfa', gradId: 'td-da' },
  cai_tien: { name: 'Cải tiến', hex: '#10b981', hexLight: '#34d399', gradId: 'td-ct' },
};

export default function TypeDonut({ proposals, currentUserUid }: Props) {
  const buckets = useMemo(() => {
    const out: Record<ProposalKind, number> = {
      van_hanh: 0, du_an: 0, cai_tien: 0,
    };
    for (const p of proposals) {
      if (p.creatorUid !== currentUserUid) continue;
      const k = p.kind as ProposalKind;
      if (k in out) out[k] += 1;
    }
    return out;
  }, [proposals, currentUserUid]);

  const segments: Seg[] = (Object.keys(TYPE_META) as ProposalKind[]).map((k) => ({
    key: k, ...TYPE_META[k], count: buckets[k],
  }));

  const total = segments.reduce((s, x) => s + x.count, 0);
  const safeTotal = total === 0 ? 1 : total;

  let cumulative = 0;
  const arcs = segments.map((seg) => {
    const dashLen = (seg.count / safeTotal) * CIRCUMFERENCE;
    const dashOffset = -cumulative;
    cumulative += dashLen;
    return { ...seg, dashArray: `${dashLen} ${CIRCUMFERENCE - dashLen}`, dashOffset };
  });

  return (
    <div className="rounded-xl border border-slate-200/70 bg-white p-4 shadow-md ring-1 ring-slate-50 transition hover:-translate-y-0.5 hover:shadow-lg">
      <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        Đề xuất theo loại
      </h3>

      <div className="flex flex-col items-center gap-4 md:flex-row">
        <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ transform: 'rotate(-90deg)' }}>
            <defs>
              {segments.map((seg) => (
                <linearGradient key={seg.gradId} id={seg.gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={seg.hexLight} />
                  <stop offset="100%" stopColor={seg.hex} />
                </linearGradient>
              ))}
              <filter id="td-shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur in="SourceAlpha" stdDeviation="2.5" />
                <feOffset dx="0" dy="2" result="offsetblur" />
                <feComponentTransfer><feFuncA type="linear" slope="0.15" /></feComponentTransfer>
                <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke="#f1f5f9" strokeWidth={STROKE} />
            <g filter="url(#td-shadow)">
              {arcs.map((arc) => (
                <circle
                  key={arc.key}
                  cx={CENTER} cy={CENTER} r={RADIUS}
                  fill="none" stroke={`url(#${arc.gradId})`} strokeWidth={STROKE}
                  strokeDasharray={arc.dashArray} strokeDashoffset={arc.dashOffset}
                  strokeLinecap="butt"
                />
              ))}
            </g>
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[10px] uppercase tracking-wider text-slate-400">Tôi tạo</span>
            <span className="text-2xl font-bold tabular-nums text-slate-900">{total}</span>
            <span className="text-[10px] text-slate-400">đề xuất</span>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-1 gap-1.5">
          {segments.map((seg) => {
            const pct = total === 0 ? 0 : Math.round((seg.count / total) * 100);
            return (
              <div key={seg.key} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="inline-block h-2 w-2 shrink-0 rounded-full shadow-sm" style={{ backgroundColor: seg.hex }} />
                  <span className="text-xs font-medium text-slate-700 truncate">{seg.name}</span>
                </div>
                <span className="text-[11px] tabular-nums text-slate-500">
                  {seg.count} <span className="text-slate-400">({pct}%)</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
