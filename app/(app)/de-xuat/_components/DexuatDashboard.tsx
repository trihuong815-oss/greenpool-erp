'use client';

// Dashboard /de-xuat V3 — 8 KPI · 3 biểu đồ · bảng điểm nghẽn
// Tiếng Việt CÓ DẤU đầy đủ. Tailwind only. Không phụ thuộc thư viện chart ngoài.

import { useMemo } from 'react';
import {
  FileEdit,
  Send,
  Eye,
  AlertCircle,
  CheckCircle2,
  XCircle,
  ArrowRightCircle,
  Clock,
} from 'lucide-react';

// ───────────────────────────────────────────────────────────────
// Types V3 (mở rộng từ types.ts) — định nghĩa cục bộ ở đây để
// dashboard không phụ thuộc vào việc V3 đã rename xong trong types.ts.
// ───────────────────────────────────────────────────────────────

type ProposalKindV3 =
  | 'van_hanh'
  | 'nhan_su'
  | 'mkt_kd'
  | 'tai_chinh'
  | 'chien_luoc';

type ProposalStatusV3 =
  | 'nhap'
  | 'da_gui'
  | 'dang_xem_xet'
  | 'yeu_cau_bo_sung'
  | 'dong_y_nguyen_tac'
  | 'da_phe_duyet'
  | 'tu_choi'
  | 'chuyen_dieu_phoi'
  | 'dong_ho_so';

type RelatedBlock = 'KD' | 'VP' | 'lien_khoi';

interface ApproverStepV3 {
  uid?: string;
  roleCode?: string;
  name: string;
  decidedAt?: string;
  decision?: 'approved' | 'rejected' | 'requested_revision' | 'conditional';
  notes?: string;
}

export interface ProposalV3 {
  id: string;
  code: string;
  title: string;
  kind: ProposalKindV3;
  status: ProposalStatusV3;
  priority?: 'thap' | 'thuong' | 'cao' | 'khan';
  relatedBlock?: RelatedBlock;
  relatedBranch?: string;
  creatorUid: string;
  creatorName?: string;
  approverChain: string[];
  approverIdx: number;
  approverHistory: ApproverStepV3[];
  estimatedCost?: number;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  proposals: ProposalV3[];
  currentUserUid: string;
  currentUserRole: string;
}

// ───────────────────────────────────────────────────────────────
// SLA theo cấp duyệt (giờ)
// ───────────────────────────────────────────────────────────────
const SLA_HOURS: Record<string, number> = {
  TP: 48,
  GD_KD: 72,
  GD_VP: 72,
  CEO: 96,
  CT: 96,
  YCBS: 48,
  KHAN: 24,
};

function getSlaHoursForStep(step: string | undefined): number {
  if (!step) return 48;
  const s = step.toUpperCase();
  if (s.includes('CEO')) return SLA_HOURS.CEO;
  if (s.includes('GD') || s.includes('GĐ')) return SLA_HOURS.GD_KD;
  if (s.includes('CT') || s.includes('CHU_TICH')) return SLA_HOURS.CT;
  return SLA_HOURS.TP;
}

function hoursDiff(fromIso: string, toMs: number): number {
  const from = new Date(fromIso).getTime();
  if (!Number.isFinite(from)) return 0;
  return (toMs - from) / 3_600_000;
}

function isProposalOverdue(p: ProposalV3, nowMs: number): boolean {
  if (
    p.status === 'da_phe_duyet' ||
    p.status === 'tu_choi' ||
    p.status === 'chuyen_dieu_phoi' ||
    p.status === 'dong_ho_so' ||
    p.status === 'nhap'
  )
    return false;
  const currentStep = p.approverChain[p.approverIdx];
  const slaH = getSlaHoursForStep(currentStep);
  return hoursDiff(p.updatedAt || p.createdAt, nowMs) > slaH;
}

// ───────────────────────────────────────────────────────────────
// Helpers cho approver chain
// approverChain item dạng "user:UID" hoặc "role:CODE"
// ───────────────────────────────────────────────────────────────
function parseApprover(token: string | undefined): { kind: 'user' | 'role' | 'unknown'; value: string } {
  if (!token) return { kind: 'unknown', value: '' };
  if (token.startsWith('user:')) return { kind: 'user', value: token.slice(5) };
  if (token.startsWith('role:')) return { kind: 'role', value: token.slice(5) };
  return { kind: 'unknown', value: token };
}

function isCurrentApprover(p: ProposalV3, uid: string, role: string): boolean {
  if (
    p.status !== 'da_gui' &&
    p.status !== 'dang_xem_xet' &&
    p.status !== 'yeu_cau_bo_sung' &&
    p.status !== 'dong_y_nguyen_tac'
  )
    return false;
  const cur = parseApprover(p.approverChain[p.approverIdx]);
  if (cur.kind === 'user') return cur.value === uid;
  if (cur.kind === 'role') return cur.value === role;
  return false;
}

// ───────────────────────────────────────────────────────────────
// Màu theo loại đề xuất (donut + legend)
// ───────────────────────────────────────────────────────────────
const KIND_COLOR: Record<ProposalKindV3, string> = {
  van_hanh: '#0ea5e9', // sky-500
  nhan_su: '#8b5cf6', // violet-500
  mkt_kd: '#10b981', // emerald-500
  tai_chinh: '#f59e0b', // amber-500
  chien_luoc: '#f43f5e', // rose-500
};

const KIND_LABEL: Record<ProposalKindV3, string> = {
  van_hanh: 'Đề xuất vận hành',
  nhan_su: 'Đề xuất nhân sự',
  mkt_kd: 'Đề xuất Marketing/Kinh doanh',
  tai_chinh: 'Đề xuất tài chính/mua sắm',
  chien_luoc: 'Đề xuất chiến lược',
};

const BLOCK_LABEL: Record<RelatedBlock, string> = {
  KD: 'Kinh doanh',
  VP: 'Văn phòng',
  lien_khoi: 'Liên khối',
};

const BLOCK_COLOR: Record<RelatedBlock, string> = {
  KD: 'bg-emerald-500',
  VP: 'bg-sky-500',
  lien_khoi: 'bg-violet-500',
};

// ───────────────────────────────────────────────────────────────
// Component chính
// ───────────────────────────────────────────────────────────────
export default function DexuatDashboard({ proposals, currentUserUid, currentUserRole }: Props) {
  const nowMs = Date.now();

  const stats = useMemo(() => {
    const kindCount: Record<ProposalKindV3, number> = {
      van_hanh: 0,
      nhan_su: 0,
      mkt_kd: 0,
      tai_chinh: 0,
      chien_luoc: 0,
    };
    const blockCount: Record<RelatedBlock, number> = { KD: 0, VP: 0, lien_khoi: 0 };

    let cardCho = 0;
    let cardToiTao = 0;
    let cardDangXX = 0;
    let cardYCBS = 0;
    let cardDuyet = 0;
    let cardTuChoi = 0;
    let cardDP = 0;
    let cardQuaSLA = 0;

    // Approver decision time (giờ)
    type ApproverAgg = { name: string; totalHours: number; count: number };
    const approverTime = new Map<string, ApproverAgg>();

    // Điểm nghẽn — gom theo người duyệt hiện tại
    type Bottleneck = {
      key: string;
      name: string;
      holding: number;
      longestHours: number;
      kinds: Set<ProposalKindV3>;
    };
    const bottleneck = new Map<string, Bottleneck>();

    for (const p of proposals) {
      if (kindCount[p.kind] !== undefined) kindCount[p.kind] += 1;
      if (p.relatedBlock && blockCount[p.relatedBlock] !== undefined) {
        blockCount[p.relatedBlock] += 1;
      }

      if (isCurrentApprover(p, currentUserUid, currentUserRole)) cardCho += 1;
      if (p.creatorUid === currentUserUid) cardToiTao += 1;
      if (p.status === 'dang_xem_xet') cardDangXX += 1;
      if (p.status === 'yeu_cau_bo_sung') cardYCBS += 1;
      if (p.status === 'da_phe_duyet' || p.status === 'dong_y_nguyen_tac') cardDuyet += 1;
      if (p.status === 'tu_choi') cardTuChoi += 1;
      if (p.status === 'chuyen_dieu_phoi') cardDP += 1;
      if (isProposalOverdue(p, nowMs)) cardQuaSLA += 1;

      // Thời gian duyệt TB từ approverHistory
      let prevAt = p.createdAt;
      for (const h of p.approverHistory || []) {
        if (!h.decidedAt || !h.name) {
          if (h.decidedAt) prevAt = h.decidedAt;
          continue;
        }
        const dur = hoursDiff(prevAt, new Date(h.decidedAt).getTime());
        if (dur >= 0 && Number.isFinite(dur)) {
          const cur = approverTime.get(h.name) || { name: h.name, totalHours: 0, count: 0 };
          cur.totalHours += dur;
          cur.count += 1;
          approverTime.set(h.name, cur);
        }
        prevAt = h.decidedAt;
      }

      // Điểm nghẽn — proposal còn pending
      if (
        p.status === 'da_gui' ||
        p.status === 'dang_xem_xet' ||
        p.status === 'yeu_cau_bo_sung' ||
        p.status === 'dong_y_nguyen_tac'
      ) {
        const tok = p.approverChain[p.approverIdx];
        const parsed = parseApprover(tok);
        const key = tok || 'unknown';
        const name =
          parsed.kind === 'user'
            ? `Người duyệt #${parsed.value.slice(0, 6)}`
            : parsed.kind === 'role'
              ? parsed.value
              : 'Chưa xác định';
        const waitedH = hoursDiff(p.updatedAt || p.createdAt, nowMs);
        const cur =
          bottleneck.get(key) ||
          { key, name, holding: 0, longestHours: 0, kinds: new Set<ProposalKindV3>() };
        cur.holding += 1;
        if (waitedH > cur.longestHours) cur.longestHours = waitedH;
        cur.kinds.add(p.kind);
        bottleneck.set(key, cur);
      }
    }

    const totalKind =
      kindCount.van_hanh +
      kindCount.nhan_su +
      kindCount.mkt_kd +
      kindCount.tai_chinh +
      kindCount.chien_luoc;
    const totalBlock = blockCount.KD + blockCount.VP + blockCount.lien_khoi;

    const approverTop = Array.from(approverTime.values())
      .map((a) => ({ name: a.name, avgH: a.count > 0 ? a.totalHours / a.count : 0, count: a.count }))
      .sort((a, b) => b.avgH - a.avgH)
      .slice(0, 5);

    const bottleneckTop = Array.from(bottleneck.values())
      .sort((a, b) => b.holding - a.holding || b.longestHours - a.longestHours)
      .slice(0, 5);

    return {
      cardCho,
      cardToiTao,
      cardDangXX,
      cardYCBS,
      cardDuyet,
      cardTuChoi,
      cardDP,
      cardQuaSLA,
      kindCount,
      totalKind,
      blockCount,
      totalBlock,
      approverTop,
      bottleneckTop,
    };
  }, [proposals, currentUserUid, currentUserRole, nowMs]);

  return (
    <div className="space-y-4">
      {/* Tầng 1 — 8 KPI cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <KpiCard
          label="Chờ tôi duyệt"
          value={stats.cardCho}
          icon={<AlertCircle className="h-4 w-4" />}
          tone="amber"
        />
        <KpiCard
          label="Tôi tạo"
          value={stats.cardToiTao}
          icon={<FileEdit className="h-4 w-4" />}
          tone="sky"
        />
        <KpiCard
          label="Đang xem xét"
          value={stats.cardDangXX}
          icon={<Eye className="h-4 w-4" />}
          tone="sky"
        />
        <KpiCard
          label="Cần bổ sung"
          value={stats.cardYCBS}
          icon={<Send className="h-4 w-4" />}
          tone="orange"
        />
        <KpiCard
          label="Đã duyệt"
          value={stats.cardDuyet}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="emerald"
        />
        <KpiCard
          label="Bị từ chối"
          value={stats.cardTuChoi}
          icon={<XCircle className="h-4 w-4" />}
          tone="rose"
        />
        <KpiCard
          label="Chuyển điều phối"
          value={stats.cardDP}
          icon={<ArrowRightCircle className="h-4 w-4" />}
          tone="violet"
        />
        <KpiCard
          label="Quá hạn"
          value={stats.cardQuaSLA}
          icon={<Clock className="h-4 w-4" />}
          tone="rose-dark"
        />
      </div>

      {/* Tầng 2 — 3 biểu đồ */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Card 1: Donut theo loại */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Cơ cấu theo loại</h3>
          <div className="flex items-center gap-4">
            <DonutChart
              segments={(Object.keys(stats.kindCount) as ProposalKindV3[]).map((k) => ({
                value: stats.kindCount[k],
                color: KIND_COLOR[k],
                label: KIND_LABEL[k],
              }))}
              total={stats.totalKind}
            />
            <ul className="flex-1 space-y-1.5 text-xs">
              {(Object.keys(stats.kindCount) as ProposalKindV3[]).map((k) => (
                <li key={k} className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: KIND_COLOR[k] }}
                  />
                  <span className="flex-1 truncate text-slate-600">{KIND_LABEL[k]}</span>
                  <span className="font-semibold tabular-nums text-slate-800">
                    {stats.kindCount[k]}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Card 2: Theo khối */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Theo khối</h3>
          <div className="space-y-3">
            {(Object.keys(stats.blockCount) as RelatedBlock[]).map((b) => {
              const n = stats.blockCount[b];
              const pct = stats.totalBlock > 0 ? Math.round((n / stats.totalBlock) * 100) : 0;
              return (
                <div key={b}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700">{BLOCK_LABEL[b]}</span>
                    <span className="tabular-nums text-slate-500">
                      {n} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full ${BLOCK_COLOR[b]} transition-all`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {stats.totalBlock === 0 && (
              <p className="py-6 text-center text-xs text-slate-400">Chưa có dữ liệu khối</p>
            )}
          </div>
        </div>

        {/* Card 3: Thời gian duyệt TB theo người duyệt */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">
            Thời gian duyệt TB theo người duyệt
          </h3>
          {stats.approverTop.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400">Chưa có lịch sử duyệt</p>
          ) : (
            <ul className="space-y-2.5">
              {(() => {
                const maxAvg = Math.max(...stats.approverTop.map((a) => a.avgH), 1);
                return stats.approverTop.map((a) => {
                  const pct = Math.round((a.avgH / maxAvg) * 100);
                  return (
                    <li key={a.name}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="truncate font-medium text-slate-700">{a.name}</span>
                        <span className="tabular-nums text-slate-500">
                          {a.avgH.toFixed(1)}h · {a.count} lượt
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full bg-amber-500 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                });
              })()}
            </ul>
          )}
        </div>
      </div>

      {/* Tầng 3 — Bảng điểm nghẽn */}
      <div className="overflow-hidden rounded-xl border border-rose-200 bg-white">
        <div className="border-b border-rose-200 bg-rose-50/60 px-4 py-2.5">
          <h3 className="text-sm font-semibold text-rose-800">Điểm nghẽn đề xuất</h3>
          <p className="text-[11px] text-rose-700/80">
            Người duyệt đang giữ nhiều đề xuất nhất / chờ lâu nhất
          </p>
        </div>
        {stats.bottleneckTop.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            Không có đề xuất đang chờ duyệt — luồng đang thông suốt
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">Người duyệt</th>
                <th className="px-4 py-2 text-right font-semibold">Số đang giữ</th>
                <th className="px-4 py-2 text-right font-semibold">Chờ lâu nhất</th>
                <th className="px-4 py-2 text-left font-semibold">Loại đang chờ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stats.bottleneckTop.map((b) => (
                <tr key={b.key} className="hover:bg-slate-50/60">
                  <td className="px-4 py-2 font-medium text-slate-800">{b.name}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    <span className="inline-flex min-w-[2rem] justify-center rounded-md bg-rose-50 px-2 py-0.5 font-semibold text-rose-700">
                      {b.holding}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-700">
                    {formatHours(b.longestHours)}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {Array.from(b.kinds).map((k) => (
                        <span
                          key={k}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-700"
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: KIND_COLOR[k] }}
                          />
                          {KIND_LABEL[k]}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// Sub-components
// ───────────────────────────────────────────────────────────────

type Tone = 'amber' | 'sky' | 'orange' | 'emerald' | 'rose' | 'violet' | 'rose-dark';

const TONE_STYLES: Record<Tone, { bg: string; text: string; ring: string }> = {
  amber: { bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-200' },
  sky: { bg: 'bg-sky-50', text: 'text-sky-700', ring: 'ring-sky-200' },
  orange: { bg: 'bg-orange-50', text: 'text-orange-700', ring: 'ring-orange-200' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-200' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-700', ring: 'ring-rose-200' },
  violet: { bg: 'bg-violet-50', text: 'text-violet-700', ring: 'ring-violet-200' },
  'rose-dark': { bg: 'bg-rose-100', text: 'text-rose-800', ring: 'ring-rose-300' },
};

function KpiCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: Tone;
}) {
  const t = TONE_STYLES[tone];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 transition hover:shadow-md">
      <div className="mb-1.5 flex items-center justify-between">
        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${t.bg} ${t.text} ring-1 ${t.ring}`}>
          {icon}
        </span>
      </div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-0.5 text-2xl font-bold tabular-nums ${t.text}`}>{value}</p>
    </div>
  );
}

function DonutChart({
  segments,
  total,
}: {
  segments: { value: number; color: string; label: string }[];
  total: number;
}) {
  const size = 120;
  const radius = 50;
  const stroke = 18;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * radius;

  if (total <= 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-slate-400 text-[10px]"
        >
          Chưa có
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
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={s.color}
            strokeWidth={stroke}
            strokeDasharray={dasharray}
            strokeDashoffset={dashoffset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        );
      })}
      <text
        x={cx}
        y={cy - 4}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-slate-800 text-base font-bold"
      >
        {total}
      </text>
      <text
        x={cx}
        y={cy + 12}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-slate-500 text-[10px]"
      >
        đề xuất
      </text>
    </svg>
  );
}

function formatHours(h: number): string {
  if (!Number.isFinite(h) || h < 0) return '—';
  if (h < 1) return `${Math.round(h * 60)} phút`;
  if (h < 24) return `${h.toFixed(1)} giờ`;
  const days = Math.floor(h / 24);
  const remH = Math.round(h % 24);
  return remH > 0 ? `${days} ngày ${remH}h` : `${days} ngày`;
}
