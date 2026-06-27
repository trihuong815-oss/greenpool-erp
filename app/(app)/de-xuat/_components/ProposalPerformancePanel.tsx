'use client';

// PR-PROPOSAL-RESTRUCTURE (2026-06-27): TIER 3 tab "Hiệu suất" — extract 3 widget
// strategic từ DexuatDashboard.tsx (660 LOC):
//   1. 4 KPI tài chính (Tổng / Chờ / Đã duyệt / ĐP) — total value tiền
//   2. Bar "Đề xuất theo giá trị" — 4 bucket (<5tr / 5-50 / 50-200 / ≥200)
//   3. 2 Donut — Cơ cấu theo loại + Cơ cấu theo khối
//
// UI cleanup:
//   - Bỏ hover translate-y trên card (decoration, không có giá trị)
//   - Bỏ pastel ring (amber-200/emerald-200/violet-200) trên 4 KPI tài chính
//     → white card đồng nhất + tone semantic chỉ trên value text (đúng rule
//     "không pastel ring KPI" trong design system)

import { useMemo } from 'react';
import {
  type ProposalKindV6,
  type ProposalV6,
  KIND_COLOR,
  KIND_LABEL,
} from './dashboard-types';

interface Props {
  proposals: ProposalV6[];
}

// ─── Format VND ngắn gọn (1.2tr / 50tr / 1.5tỷ) ───────────────────────
function fmtVndShort(n: number): string {
  if (n === 0) return '0';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, '')} tỷ`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')} tr`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return n.toString();
}

export default function ProposalPerformancePanel({ proposals }: Props) {
  const stats = useMemo(() => {
    const kindCount: Record<ProposalKindV6, number> = { van_hanh: 0, du_an: 0, cai_tien: 0 };
    let valTotal = 0, valCho = 0, valDuyet = 0, valDP = 0;
    const tierBuckets = { t1: 0, t2: 0, t3: 0, t4: 0 };
    let kd = 0, vp = 0, cross = 0;

    for (const p of proposals as Array<ProposalV6 & { creatorBlock?: 'KD' | 'VP'; crossBlock?: boolean }>) {
      if (kindCount[p.kind] !== undefined) kindCount[p.kind] += 1;

      if (p.crossBlock === true) cross += 1;
      else if (p.creatorBlock === 'VP') vp += 1;
      else kd += 1;

      const cost = typeof p.estimatedCost === 'number' ? p.estimatedCost : 0;
      if (cost > 0) {
        valTotal += cost;
        if (p.status === 'da_gui' || p.status === 'dang_xem_xet') valCho += cost;
        if (p.status === 'da_phe_duyet') valDuyet += cost;
        if (p.status === 'da_tao_dieu_phoi' || p.status === 'chuyen_dieu_phoi') valDP += cost;
        if (cost < 5_000_000) tierBuckets.t1 += 1;
        else if (cost < 50_000_000) tierBuckets.t2 += 1;
        else if (cost < 200_000_000) tierBuckets.t3 += 1;
        else tierBuckets.t4 += 1;
      }
    }

    const totalKind = kindCount.van_hanh + kindCount.du_an + kindCount.cai_tien;
    const totalBlock = kd + vp + cross;
    const totalTier = tierBuckets.t1 + tierBuckets.t2 + tierBuckets.t3 + tierBuckets.t4;
    return { kindCount, totalKind, valTotal, valCho, valDuyet, valDP, tierBuckets, totalTier, kd, vp, cross, totalBlock };
  }, [proposals]);

  return (
    <div className="space-y-4">
      {/* ─── 4 KPI tài chính (chỉ hiện khi có ĐX có giá trị) ─── */}
      {stats.valTotal > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: 'Tổng giá trị',  val: stats.valTotal,  sub: 'đề xuất có giá trị',   valueClass: 'text-slate-800' },
            { label: 'Chờ duyệt',     val: stats.valCho,    sub: 'đang chờ quyết định',  valueClass: 'text-amber-600' },
            { label: 'Đã duyệt',      val: stats.valDuyet,  sub: 'sẵn sàng triển khai',  valueClass: 'text-emerald-600' },
            { label: 'Đã chuyển ĐP',  val: stats.valDP,     sub: 'đang triển khai',      valueClass: 'text-violet-600' },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">{c.label}</div>
              <div className={`mt-1 text-[22px] font-semibold leading-tight tabular-nums ${c.valueClass}`}>
                {fmtVndShort(c.val)}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">{c.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Row 1: Bar "Đề xuất theo giá trị" full-width ─── */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-slate-700">Đề xuất theo giá trị</h3>
        {stats.totalTier > 0 ? (
          <div className="space-y-3">
            {[
              { label: 'Dưới 5 triệu',    n: stats.tierBuckets.t1, range: '< 5 tr',    bar: '#10b981' },
              { label: '5 – 50 triệu',    n: stats.tierBuckets.t2, range: '5–50 tr',   bar: '#0ea5e9' },
              { label: '50 – 200 triệu',  n: stats.tierBuckets.t3, range: '50–200 tr', bar: '#f59e0b' },
              { label: 'Từ 200 triệu',    n: stats.tierBuckets.t4, range: '≥ 200 tr',  bar: '#e11d48' },
            ].map((b) => {
              const pct = stats.totalTier === 0 ? 0 : Math.round((b.n / stats.totalTier) * 100);
              return (
                <div key={b.label}>
                  <div className="flex items-center justify-between mb-1 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md font-semibold bg-slate-100 text-slate-700">{b.range}</span>
                      <span className="text-slate-600">{b.label}</span>
                    </div>
                    <span className="tabular-nums text-slate-700 font-medium">
                      {b.n} đề xuất <span className="text-slate-400">({pct}%)</span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: b.bar }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center justify-center py-8 text-sm text-slate-400">Chưa có đề xuất có giá trị tài chính</div>
        )}
      </div>

      {/* ─── Row 2: 2 Donut (theo loại + theo khối) ─── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Donut A — theo loại */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-slate-700">Cơ cấu đề xuất theo loại</h3>
          <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-2">
            <div className="flex justify-center sm:justify-start">
              <DonutChart
                segments={(Object.keys(stats.kindCount) as ProposalKindV6[]).map((k) => ({
                  value: stats.kindCount[k], color: KIND_COLOR[k], label: KIND_LABEL[k],
                }))}
                total={stats.totalKind}
              />
            </div>
            <ul className="space-y-2 text-sm">
              {(Object.keys(stats.kindCount) as ProposalKindV6[]).map((k) => {
                const c = stats.kindCount[k];
                const pct = stats.totalKind > 0 ? Math.round((c / stats.totalKind) * 100) : 0;
                return (
                  <li key={k} className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: KIND_COLOR[k] }} />
                    <span className="flex-1 truncate text-slate-700 text-xs">{KIND_LABEL[k]}</span>
                    <span className="tabular-nums font-semibold text-slate-800 text-sm">{c}</span>
                    <span className="w-10 text-right text-[11px] tabular-nums text-slate-500">{pct}%</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* Donut B — theo khối */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-slate-700">Cơ cấu đề xuất theo khối</h3>
          <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-2">
            <div className="flex justify-center sm:justify-start">
              <DonutChart
                segments={[
                  { value: stats.kd,    color: '#10b981', label: 'Khối Kinh doanh' },
                  { value: stats.vp,    color: '#8b5cf6', label: 'Khối Văn phòng' },
                  { value: stats.cross, color: '#f59e0b', label: 'Liên khối' },
                ]}
                total={stats.totalBlock}
              />
            </div>
            <ul className="space-y-2 text-sm">
              {[
                { value: stats.kd,    color: '#10b981', label: 'Khối Kinh doanh' },
                { value: stats.vp,    color: '#8b5cf6', label: 'Khối Văn phòng' },
                { value: stats.cross, color: '#f59e0b', label: 'Liên khối' },
              ].map((s) => {
                const pct = stats.totalBlock > 0 ? Math.round((s.value / stats.totalBlock) * 100) : 0;
                return (
                  <li key={s.label} className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="flex-1 truncate text-slate-700 text-xs">{s.label}</span>
                    <span className="tabular-nums font-semibold text-slate-800 text-sm">{s.value}</span>
                    <span className="w-10 text-right text-[11px] tabular-nums text-slate-500">{pct}%</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Donut chart helper (copy từ DexuatDashboard, không đổi) ──────────
function DonutChart({
  segments, total,
}: {
  segments: { value: number; color: string; label: string }[];
  total: number;
}) {
  const size = 220, radius = 88, stroke = 32;
  const cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * radius;

  if (total <= 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" className="fill-slate-400 text-sm">
          Chưa có dữ liệu
        </text>
      </svg>
    );
  }

  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
      {segments.map((s, i) => {
        if (s.value <= 0) return null;
        const len = (s.value / total) * circ;
        const dasharray = `${len} ${circ - len}`;
        const dashoffset = -offset;
        offset += len;
        return (
          <circle key={i} cx={cx} cy={cy} r={radius} fill="none" stroke={s.color}
            strokeWidth={stroke} strokeDasharray={dasharray} strokeDashoffset={dashoffset}
            transform={`rotate(-90 ${cx} ${cy})`} />
        );
      })}
      <text x={cx} y={cy - 8} textAnchor="middle" dominantBaseline="central"
        className="fill-slate-800 text-[28px] font-semibold">{total}</text>
      <text x={cx} y={cy + 18} textAnchor="middle" dominantBaseline="central"
        className="fill-slate-500 text-xs">đề xuất</text>
    </svg>
  );
}
