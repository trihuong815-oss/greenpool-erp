'use client';

import type { CoordTask } from './types';

interface Props {
  tasks: CoordTask[];
}

interface Segment {
  name: string;
  count: number;
  pct: number;
  hex: string;
  hexLight: string;
  gradId: string;
}

const SIZE = 200;
const STROKE = 32;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const CENTER = SIZE / 2;
const LABEL_RADIUS = RADIUS;

export default function BlockDonut({ tasks }: Props) {
  // V6.5 (2026-06-15) — TỔNG HỢP CHUẨN 100%:
  //   • Task scope='lien_khoi'                                    → Liên khối
  //   • Task scope!='lien_khoi' + ownerBlock='KD'                 → Khối KD
  //   • Task scope!='lien_khoi' + ownerBlock='VP'                 → Khối VP
  //   • Khác (ownerBlock !='KD'/'VP') → "Khác" (defensive, hiếm xảy ra)
  // 3 case chính mutually exclusive + cover all task có ownerBlock chuẩn.
  // Total = tasks.length. kd + vp + cross + unclassified === total đảm bảo invariant.
  const total = tasks.length;
  const kd = tasks.filter((t) => t.ownerBlock === 'KD' && t.scope !== 'lien_khoi').length;
  const vp = tasks.filter((t) => t.ownerBlock === 'VP' && t.scope !== 'lien_khoi').length;
  const cross = tasks.filter((t) => t.scope === 'lien_khoi').length;
  const unclassified = total - kd - vp - cross; // defensive — nên = 0 nếu ownerBlock chuẩn

  // Tính pct CHUẨN 100%: 3 segment đầu round, segment cuối = 100 - sum(others)
  // → KHÔNG bao giờ 99% hoặc 101% do rounding error.
  const safeTotal = total === 0 ? 1 : total;
  const pctKd = total === 0 ? 0 : Math.round((kd / safeTotal) * 100);
  const pctVp = total === 0 ? 0 : Math.round((vp / safeTotal) * 100);
  const pctCross = total === 0 ? 0 : Math.round((cross / safeTotal) * 100);
  // Anchor segment cuối (Liên khối nếu có, không thì VP, không thì KD) lấy phần dư
  // để bảo toàn tổng = 100%.
  let adjKd = pctKd, adjVp = pctVp, adjCross = pctCross;
  if (total > 0) {
    const sum = pctKd + pctVp + pctCross;
    const diff = 100 - sum;
    if (cross > 0) adjCross += diff;
    else if (vp > 0) adjVp += diff;
    else if (kd > 0) adjKd += diff;
  }

  const segments: Segment[] = [
    {
      name: 'Khối Kinh doanh',
      count: kd,
      pct: adjKd,
      hex: '#3b82f6',
      hexLight: '#60a5fa',
      gradId: 'donut-grad-kd',
    },
    {
      name: 'Khối Văn phòng',
      count: vp,
      pct: adjVp,
      hex: '#10b981',
      hexLight: '#34d399',
      gradId: 'donut-grad-vp',
    },
    {
      name: 'Liên khối',
      count: cross,
      pct: adjCross,
      hex: '#f97316',
      hexLight: '#fb923c',
      gradId: 'donut-grad-cross',
    },
  ];
  // Defensive: chỉ thêm "Khác" nếu thực sự có task không phân loại được
  if (unclassified > 0) {
    segments.push({
      name: 'Khác',
      count: unclassified,
      pct: total === 0 ? 0 : Math.round((unclassified / safeTotal) * 100),
      hex: '#94a3b8',
      hexLight: '#cbd5e1',
      gradId: 'donut-grad-other',
    });
  }

  let cumulative = 0;
  const arcs = segments.map((seg) => {
    const dashLen = (seg.count / safeTotal) * CIRCUMFERENCE;
    const dashOffset = -cumulative;
    const midPct = (cumulative + dashLen / 2) / CIRCUMFERENCE;
    const angle = midPct * 2 * Math.PI - Math.PI / 2;
    const labelX = CENTER + LABEL_RADIUS * Math.cos(angle);
    const labelY = CENTER + LABEL_RADIUS * Math.sin(angle);
    cumulative += dashLen;
    return {
      ...seg,
      dashArray: `${dashLen} ${CIRCUMFERENCE - dashLen}`,
      dashOffset,
      labelX,
      labelY,
    };
  });

  return (
    <div className="rounded-xl border border-slate-200/70 bg-white p-4 shadow-md ring-1 ring-slate-50 transition hover:-translate-y-0.5 hover:shadow-lg">
      <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        Cơ cấu công việc theo khối
      </h3>

      <div className="flex flex-col items-center gap-5 md:flex-row">
        <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ transform: 'rotate(-90deg)' }}>
            <defs>
              {segments.map((seg) => (
                <linearGradient key={seg.gradId} id={seg.gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={seg.hexLight} />
                  <stop offset="100%" stopColor={seg.hex} />
                </linearGradient>
              ))}
              <filter id="donut-shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
                <feOffset dx="0" dy="2" result="offsetblur" />
                <feComponentTransfer>
                  <feFuncA type="linear" slope="0.15" />
                </feComponentTransfer>
                <feMerge>
                  <feMergeNode />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke="#f1f5f9" strokeWidth={STROKE} />

            <g filter="url(#donut-shadow)">
              {arcs.map((arc, idx) => (
                <circle
                  key={idx}
                  cx={CENTER}
                  cy={CENTER}
                  r={RADIUS}
                  fill="none"
                  stroke={`url(#${arc.gradId})`}
                  strokeWidth={STROKE}
                  strokeDasharray={arc.dashArray}
                  strokeDashoffset={arc.dashOffset}
                  strokeLinecap="butt"
                />
              ))}
            </g>

            {arcs.map((arc, idx) => arc.pct >= 8 && (
              <text
                key={`label-${idx}`}
                x={arc.labelX}
                y={arc.labelY}
                fill="white"
                fontSize={12}
                fontWeight={700}
                textAnchor="middle"
                dominantBaseline="central"
                style={{ transform: `rotate(90deg)`, transformOrigin: `${arc.labelX}px ${arc.labelY}px` }}
              >
                {arc.pct}%
              </text>
            ))}
          </svg>

          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[10px] uppercase tracking-wider text-slate-400">Tổng số</span>
            <span className="text-2xl font-bold tabular-nums text-slate-900">{total}</span>
            <span className="text-[10px] text-slate-400">việc</span>
          </div>
        </div>

        <div className="flex-1 space-y-2.5">
          {segments.map((seg) => (
            <div key={seg.name} className="flex items-start gap-2">
              <span
                className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full shadow-sm"
                style={{ backgroundColor: seg.hex }}
              />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-700">{seg.name}</div>
                <div className="text-[11px] tabular-nums text-slate-500">
                  {seg.count} việc ({seg.pct}%)
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
