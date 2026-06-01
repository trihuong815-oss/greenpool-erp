'use client';

// Khu KT dashboard cho TP_KT/PP/ADMIN/CEO/GD/KT viên cơ sở.
// - 4 KPI tổng (clo · axit · lọc · nhiệt)
// - 12-tháng line chart 4 line (SVG, no chart lib)
// - Per-branch cards: ảnh + tổng 4 chỉ số (zero-fill nếu chưa có data)
// Visibility:
//   • TP/PP/ADMIN/CEO/GD: thấy toàn 5 cơ sở
//   • KT viên cơ sở X: chỉ thấy X (filter qua visibleBranchIds prop)

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { FlaskConical, Droplet, Filter, Flame } from 'lucide-react';
import type { KyThuatSummary, KyThuatBranchAgg } from './data.kythuat';

const BRANCH_LABEL: Record<string, string> = {
  HM:  'Hoàng Mai',
  TK:  '20 Thuỵ Khuê',
  CTT: 'CTT Mỹ Đình',
  '24':'24 NCT',
  TT:  'Thanh Trì',
};

// Path khớp 100% file trong public/ — KHÔNG tự đoán đuôi/space, dùng `ls public` để verify.
const BRANCH_PHOTOS: Record<string, string> = {
  HM:  '/hoàng mai.png.jpg',
  TK:  '/thụy khuê.png.jpg',
  CTT: '/CTT.png',
  '24':'/24 NCT.png',
  TT:  '/thanh trì.png',
};
const BRANCH_FALLBACK: Record<string, string> = {
  HM:  'https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?auto=format&fit=crop&w=800&q=80',
  TK:  'https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=800&q=80',
  CTT: 'https://images.unsplash.com/photo-1572331165267-854da2b10ccc?auto=format&fit=crop&w=800&q=80',
  '24':'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=800&q=80',
  TT:  'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?auto=format&fit=crop&w=800&q=80',
};

const MONTH_LABELS = ['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12'];

type MetricKey = 'clo' | 'axit' | 'loc' | 'nhiet';

const METRIC_META: Record<MetricKey, { label: string; unit: string; color: string; Icon: typeof FlaskConical }> = {
  clo:   { label: 'Clo',             unit: 'kg',  color: '#059669', Icon: FlaskConical },  // emerald-600
  axit:  { label: 'Axit (pH)',       unit: 'lít', color: '#d97706', Icon: Droplet },       // amber-600
  loc:   { label: 'Công suất Lọc',   unit: 'kWh', color: '#0891b2', Icon: Filter },        // cyan-600 — đo công suất điện
  nhiet: { label: 'Công suất Nhiệt', unit: 'kWh', color: '#e11d48', Icon: Flame },         // rose-600  — đo công suất điện
};

interface Props {
  summary: KyThuatSummary;
  /** Cơ sở user được xem. ['HM','TK','CTT','24','TT'] = full; ['HM'] = KT viên Hoàng Mai. */
  visibleBranchIds: string[];
  /** Role hiện tại — chỉ để hiển thị badge "scope" */
  myRoleCode: string;
}

function fmt(v: number): string {
  return v.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
}

export function KTDashboardSection({ summary, visibleBranchIds, myRoleCode }: Props) {
  const isAll = visibleBranchIds.length === 5;
  // Filter các branch hiển thị
  const visibleBranches = useMemo(
    () => summary.byBranch.filter((b) => visibleBranchIds.includes(b.branchId)),
    [summary.byBranch, visibleBranchIds],
  );
  // Tính tổng = system nếu full, ngược lại reaggregate từ visible branches
  const totals = useMemo(() => {
    if (isAll) return summary.system;
    const out = {
      cloByMonth: Array(12).fill(0),
      axitByMonth: Array(12).fill(0),
      locCapByMonth: Array(12).fill(0),
      nhietCapByMonth: Array(12).fill(0),
      cloTotal: 0,
      axitTotal: 0,
      locCapTotal: 0,
      nhietCapTotal: 0,
    };
    for (const b of visibleBranches) {
      for (let i = 0; i < 12; i++) {
        out.cloByMonth[i]      += b.cloByMonth[i];
        out.axitByMonth[i]     += b.axitByMonth[i];
        out.locCapByMonth[i]   += b.locCapByMonth[i];
        out.nhietCapByMonth[i] += b.nhietCapByMonth[i];
      }
      out.cloTotal      += b.cloTotal;
      out.axitTotal     += b.axitTotal;
      out.locCapTotal   += b.locCapTotal;
      out.nhietCapTotal += b.nhietCapTotal;
    }
    return out;
  }, [visibleBranches, summary.system, isAll]);

  // Toggle chart series
  const [active, setActive] = useState<Record<MetricKey, boolean>>({
    clo: true, axit: true, loc: true, nhiet: true,
  });

  const series: Record<MetricKey, number[]> = {
    clo: totals.cloByMonth,
    axit: totals.axitByMonth,
    loc: totals.locCapByMonth,
    nhiet: totals.nhietCapByMonth,
  };
  const seriesTotals: Record<MetricKey, number> = {
    clo: totals.cloTotal,
    axit: totals.axitTotal,
    loc: totals.locCapTotal,
    nhiet: totals.nhietCapTotal,
  };

  return (
    <div className="space-y-4">
      {/* Tổng 4 chỉ số */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(['clo', 'axit', 'loc', 'nhiet'] as MetricKey[]).map((k) => {
          const m = METRIC_META[k];
          const Icon = m.Icon;
          return (
            <Link
              key={k}
              href={k === 'clo' || k === 'axit' ? `/ky-thuat/hoa-chat?year=${summary.year}` : `/ky-thuat/may?year=${summary.year}`}
              className="rounded-xl ring-1 ring-slate-200 bg-white p-3 hover:shadow-md transition flex items-start gap-3"
            >
              <div className="rounded-lg p-2 shrink-0" style={{ backgroundColor: m.color + '20', color: m.color }}>
                <Icon size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{m.label}</div>
                <div className="text-xl font-bold tabular-nums mt-0.5 text-slate-800">{fmt(seriesTotals[k])}</div>
                <div className="text-[10px] text-slate-500">{m.unit}{!isAll ? ` · ${visibleBranches.length} cơ sở` : ' · cả hệ thống'}</div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Line chart 12 tháng */}
      <div className="card">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div>
            <div className="text-sm font-bold text-slate-800">Diễn biến 12 tháng — {summary.year}</div>
            <div className="text-[11px] text-slate-500">Bấm chip để bật/tắt series</div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {(['clo', 'axit', 'loc', 'nhiet'] as MetricKey[]).map((k) => {
              const m = METRIC_META[k];
              const on = active[k];
              return (
                <button
                  key={k}
                  onClick={() => setActive((a) => ({ ...a, [k]: !a[k] }))}
                  className={`px-2 py-1 rounded text-[11px] font-semibold ring-1 transition inline-flex items-center gap-1 ${
                    on ? 'bg-white' : 'bg-slate-100 text-slate-400 ring-slate-200 line-through'
                  }`}
                  style={on ? { color: m.color, borderColor: m.color, boxShadow: `inset 0 0 0 1px ${m.color}` } : undefined}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: on ? m.color : '#cbd5e1' }} />
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
        <LineChart series={series} active={active} />
      </div>

      {/* Per-branch breakdown */}
      <div className="space-y-2">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Tổng theo cơ sở</div>
        {visibleBranches.length === 0 ? (
          <div className="card text-center text-sm text-slate-400 py-8">
            Bạn chưa được gán cơ sở để xem.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {visibleBranches.map((b) => (
              <BranchKpiCard key={b.branchId} agg={b} />
            ))}
          </div>
        )}
      </div>

      {!isAll && (
        <div className="text-[11px] text-slate-500">
          Bạn đang xem <strong>{visibleBranches.length}</strong> cơ sở thuộc vai trò <code>{myRoleCode}</code>.
        </div>
      )}
    </div>
  );
}

// ────────── Branch card ──────────
function BranchKpiCard({ agg }: { agg: KyThuatBranchAgg }) {
  const img = BRANCH_PHOTOS[agg.branchId];
  const fallback = BRANCH_FALLBACK[agg.branchId];
  const label = BRANCH_LABEL[agg.branchId] ?? agg.branchId;

  return (
    <div className="rounded-xl ring-1 ring-slate-200 bg-white overflow-hidden">
      <div className="relative aspect-[16/9] bg-slate-100">
        <img
          src={encodeURI(img ?? fallback)}
          alt={label}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
          onError={(e) => {
            if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/70 via-slate-900/10 to-transparent" />
        <div className="absolute bottom-2 left-3 right-3 flex items-end justify-between">
          <div>
            <div className="text-xs text-white/70 font-semibold uppercase tracking-wider">{agg.branchId}</div>
            <div className="text-white font-bold text-sm">{label}</div>
          </div>
        </div>
      </div>
      <div className="p-3 grid grid-cols-2 gap-2 text-sm">
        <KpiMini label="Clo" value={agg.cloTotal} unit="kg" color="#059669" />
        <KpiMini label="Axit" value={agg.axitTotal} unit="lít" color="#d97706" />
        <KpiMini label="CS Lọc" value={agg.locCapTotal} unit="kWh" color="#0891b2" />
        <KpiMini label="CS Nhiệt" value={agg.nhietCapTotal} unit="kWh" color="#e11d48" />
      </div>
    </div>
  );
}

function KpiMini({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  return (
    <div className="rounded-md px-2 py-1.5 ring-1 ring-slate-100 bg-slate-50/50">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="tabular-nums font-bold" style={{ color }}>
        {value > 0 ? fmt(value) : '—'}
        <span className="ml-1 text-[10px] font-normal text-slate-400">{unit}</span>
      </div>
    </div>
  );
}

// ────────── SVG line chart ──────────
function LineChart({ series, active }: {
  series: Record<MetricKey, number[]>;
  active: Record<MetricKey, boolean>;
}) {
  const W = 560; const H = 220;
  const padL = 40, padR = 12, padT = 12, padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  // Max value across active series (0 → 1 để khỏi chia 0)
  const allActiveValues = (Object.keys(series) as MetricKey[])
    .filter((k) => active[k])
    .flatMap((k) => series[k]);
  const maxV = Math.max(1, ...allActiveValues);
  // Round-up cho axis label đẹp hơn
  const niceMax = niceCeil(maxV);

  // X scale: 12 tháng → 12 điểm (centered)
  function xOf(i: number): number {
    return padL + (innerW * i) / 11;
  }
  function yOf(v: number): number {
    return padT + innerH * (1 - v / niceMax);
  }

  // Y-axis ticks: 5 levels
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((p) => p * niceMax);

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-full" style={{ minWidth: 480 }}>
        {/* Grid + Y axis */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} y1={yOf(t)} x2={W - padR} y2={yOf(t)} stroke="#e2e8f0" strokeWidth={1} strokeDasharray={i === 0 ? '' : '2 3'} />
            <text x={padL - 6} y={yOf(t)} textAnchor="end" dominantBaseline="middle" className="fill-slate-400" fontSize={9}>
              {shortNum(t)}
            </text>
          </g>
        ))}
        {/* X-axis labels */}
        {MONTH_LABELS.map((lbl, i) => (
          <text key={lbl} x={xOf(i)} y={H - padB + 14} textAnchor="middle" className="fill-slate-400" fontSize={9}>
            {lbl}
          </text>
        ))}
        {/* Lines */}
        {(Object.keys(series) as MetricKey[]).map((k) => {
          if (!active[k]) return null;
          const data = series[k];
          const path = data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i)} ${yOf(v)}`).join(' ');
          const color = METRIC_META[k].color;
          return (
            <g key={k}>
              <path d={path} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
              {data.map((v, i) => (
                <circle key={i} cx={xOf(i)} cy={yOf(v)} r={2.5} fill={color}>
                  <title>{`${METRIC_META[k].label} T${i + 1}: ${fmt(v)} ${METRIC_META[k].unit}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const frac = v / Math.pow(10, exp);
  let nice: number;
  if (frac <= 1) nice = 1;
  else if (frac <= 2) nice = 2;
  else if (frac <= 5) nice = 5;
  else nice = 10;
  return nice * Math.pow(10, exp);
}

function shortNum(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (v >= 1_000) return (v / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
  return v.toLocaleString('vi-VN', { maximumFractionDigits: 0 });
}
