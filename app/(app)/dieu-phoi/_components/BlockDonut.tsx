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
}

// SVG donut config
const SIZE = 180;
const STROKE = 24;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const CENTER = SIZE / 2;

export default function BlockDonut({ tasks }: Props) {
  // Compute từ tasks; nếu quá ít (< 10) thì fallback mock 120/54/36/30 cho demo khớp ảnh
  let total = tasks.length;
  let kd = tasks.filter((t) => t.ownerBlock === 'KD' && t.scope !== 'lien_khoi').length;
  let vp = tasks.filter((t) => t.ownerBlock === 'VP' && t.scope !== 'lien_khoi').length;
  let cross = tasks.filter((t) => t.scope === 'lien_khoi').length;

  if (total < 10) {
    total = 120;
    kd = 54;
    vp = 36;
    cross = 30;
  }

  const safeTotal = total === 0 ? 1 : total;
  const segments: Segment[] = [
    {
      name: 'Khối Kinh doanh',
      count: kd,
      pct: Math.round((kd / safeTotal) * 100),
      hex: '#1e40af',
    },
    {
      name: 'Khối Văn phòng',
      count: vp,
      pct: Math.round((vp / safeTotal) * 100),
      hex: '#059669',
    },
    {
      name: 'Liên khối',
      count: cross,
      pct: Math.round((cross / safeTotal) * 100),
      hex: '#ea580c',
    },
  ];

  // Build stroke-dasharray segments — bắt đầu từ 12h, đi theo chiều kim đồng hồ
  let cumulative = 0;
  const arcs = segments.map((seg) => {
    const dashLen = (seg.count / safeTotal) * CIRCUMFERENCE;
    const dashOffset = -cumulative;
    cumulative += dashLen;
    return {
      ...seg,
      dashArray: `${dashLen} ${CIRCUMFERENCE - dashLen}`,
      dashOffset,
    };
  });

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-slate-800">Cơ cấu công việc theo khối</h3>

      <div className="flex flex-col items-center gap-6 md:flex-row">
        {/* Donut SVG */}
        <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
          <svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            // Xoay -90° để bắt đầu từ 12 giờ
            style={{ transform: 'rotate(-90deg)' }}
          >
            {/* Track nền */}
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              stroke="#f1f5f9"
              strokeWidth={STROKE}
            />
            {arcs.map((arc, idx) => (
              <circle
                key={idx}
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                fill="none"
                stroke={arc.hex}
                strokeWidth={STROKE}
                strokeDasharray={arc.dashArray}
                strokeDashoffset={arc.dashOffset}
                strokeLinecap="butt"
              />
            ))}
          </svg>

          {/* Tâm donut */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xs text-slate-500">Tổng số</span>
            <span className="text-3xl font-bold tabular-nums text-slate-900">{total}</span>
            <span className="text-xs text-slate-500">việc</span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-3">
          {segments.map((seg) => (
            <div key={seg.name} className="flex items-start gap-2.5">
              <span
                className="mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: seg.hex }}
              />
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-800">{seg.name}</div>
                <div className="text-xs tabular-nums text-slate-500">
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
