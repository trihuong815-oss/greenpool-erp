'use client';

// Dashboard /de-xuat V6 — SIMPLIFIED
// Layout 2 tầng:
//   Tầng 1 — 7 KPI cards: Chờ tôi duyệt · Đang xem xét · YCBS
//            · Đã phê duyệt · Đã tạo điều phối · Từ chối · Quá SLA
//   Tầng 2 — 1 Donut "Cơ cấu đề xuất theo loại" (5 loại V6)
// BỎ so với V5: card "Tôi tạo" · bar "Đơn vị ảnh hưởng"
//             · bar "Thời gian duyệt TB" · bảng "Điểm nghẽn"
// Tiếng Việt CÓ DẤU đầy đủ. Tailwind only. Không phụ thuộc chart lib.

import { useMemo } from 'react';
import {
  AlertCircle,
  Eye,
  Send,
  CheckCircle2,
  ArrowRightCircle,
  XCircle,
  Clock,
} from 'lucide-react';

// ───────────────────────────────────────────────────────────────
// Types V6 — định nghĩa cục bộ để dashboard self-contained.
// 5 loại: van_hanh · cai_tien · dau_tu · chien_luoc · khan_cap
// 7 status V6: nhap · da_gui · dang_xem_xet · yeu_cau_bo_sung
//            · da_phe_duyet · da_tao_dieu_phoi · dong_ho_so (+ tu_choi)
// ───────────────────────────────────────────────────────────────

export type ProposalKindV6 =
  | 'van_hanh'
  | 'cai_tien'
  | 'dau_tu'
  | 'chien_luoc'
  | 'khan_cap';

export type ProposalStatusV6 =
  | 'nhap'
  | 'da_gui'
  | 'dang_xem_xet'
  | 'yeu_cau_bo_sung'
  | 'da_phe_duyet'
  | 'da_tao_dieu_phoi'
  // Backward compat alias V5: chuyen_dieu_phoi === da_tao_dieu_phoi
  | 'chuyen_dieu_phoi'
  | 'dong_ho_so'
  | 'tu_choi';

export interface ApproverStepV6 {
  uid?: string;
  roleCode?: string;
  name: string;
  decidedAt?: string;
  decision?: 'approved' | 'rejected' | 'requested_revision';
  notes?: string;
}

export interface ProposalV6 {
  id: string;
  code: string;
  title: string;
  kind: ProposalKindV6;
  status: ProposalStatusV6;

  creatorUid: string;
  creatorName?: string;

  // Chuỗi duyệt: items dạng "user:UID" hoặc "role:CODE", hoặc ApproverStep
  approverChain: Array<string | ApproverStepV6>;
  approverIdx: number;

  estimatedCost?: number;
  createdAt: string;
  updatedAt: string;

  // ─── Backward-compat fields (V5 legacy, dashboard V6 KHÔNG dùng) ─────────
  // Giữ optional để adapter cũ trong DeXuatClient (truyền priority/scopeTargets
  // /relatedBlocks/approverHistory) vẫn typecheck. V6 dashboard bỏ qua hết.
  priority?: string;
  scopeTargets?: Array<{ id: string; label: string; kind?: string }>;
  relatedBlocks?: Array<'KD' | 'VP'>;
  approverHistory?: ApproverStepV6[];
}

interface Props {
  proposals: ProposalV6[];
  currentUserUid: string;
  currentUserRole: string;
}

// ───────────────────────────────────────────────────────────────
// SLA theo cấp duyệt (giờ)
// ───────────────────────────────────────────────────────────────
const SLA_HOURS: Record<string, number> = {
  TP: 48,
  GD: 72,
  CEO: 96,
  CT: 96,
  YCBS: 48,
};

function getSlaHoursForStep(step: string | undefined): number {
  if (!step) return 48;
  const s = step.toUpperCase();
  if (s.includes('CEO')) return SLA_HOURS.CEO;
  if (s.includes('CT') || s.includes('CHU_TICH')) return SLA_HOURS.CT;
  if (s.includes('GD') || s.includes('GĐ')) return SLA_HOURS.GD;
  return SLA_HOURS.TP;
}

function hoursDiff(fromIso: string, toMs: number): number {
  const from = new Date(fromIso).getTime();
  if (!Number.isFinite(from)) return 0;
  return (toMs - from) / 3_600_000;
}

function isPending(s: ProposalStatusV6): boolean {
  return s === 'da_gui' || s === 'dang_xem_xet' || s === 'yeu_cau_bo_sung';
}

function getApproverToken(
  item: string | ApproverStepV6 | undefined
): string | undefined {
  if (!item) return undefined;
  if (typeof item === 'string') return item;
  if (item.uid) return `user:${item.uid}`;
  if (item.roleCode) return `role:${item.roleCode}`;
  return undefined;
}

function isProposalOverdue(p: ProposalV6, nowMs: number): boolean {
  if (!isPending(p.status)) return false;
  const token = getApproverToken(p.approverChain[p.approverIdx]);
  const slaH = getSlaHoursForStep(token);
  return hoursDiff(p.updatedAt || p.createdAt, nowMs) > slaH;
}

// ───────────────────────────────────────────────────────────────
// Helpers cho approver chain
// ───────────────────────────────────────────────────────────────
function parseApprover(token: string | undefined): {
  kind: 'user' | 'role' | 'unknown';
  value: string;
} {
  if (!token) return { kind: 'unknown', value: '' };
  if (token.startsWith('user:')) return { kind: 'user', value: token.slice(5) };
  if (token.startsWith('role:')) return { kind: 'role', value: token.slice(5) };
  return { kind: 'unknown', value: token };
}

function isCurrentApprover(p: ProposalV6, uid: string, role: string): boolean {
  if (!isPending(p.status)) return false;
  const token = getApproverToken(p.approverChain[p.approverIdx]);
  const cur = parseApprover(token);
  if (cur.kind === 'user') return cur.value === uid;
  if (cur.kind === 'role') return cur.value === role;
  return false;
}

// ───────────────────────────────────────────────────────────────
// Màu theo loại đề xuất V6 (donut + legend) — theo SPEC
// Vận hành sky · Cải tiến emerald · Đầu tư amber · Chiến lược violet · Khẩn cấp rose
// ───────────────────────────────────────────────────────────────
const KIND_COLOR: Record<ProposalKindV6, string> = {
  van_hanh: '#0ea5e9', // sky-500
  cai_tien: '#10b981', // emerald-500
  dau_tu: '#f59e0b', // amber-500
  chien_luoc: '#8b5cf6', // violet-500
  khan_cap: '#f43f5e', // rose-500
};

const KIND_LABEL: Record<ProposalKindV6, string> = {
  van_hanh: 'Vận hành',
  cai_tien: 'Cải tiến',
  dau_tu: 'Đầu tư',
  chien_luoc: 'Chiến lược',
  khan_cap: 'Khẩn cấp',
};

// ───────────────────────────────────────────────────────────────
// Component chính
// ───────────────────────────────────────────────────────────────
export default function DexuatDashboard({
  proposals,
  currentUserUid,
  currentUserRole,
}: Props) {
  const nowMs = Date.now();

  const stats = useMemo(() => {
    const kindCount: Record<ProposalKindV6, number> = {
      van_hanh: 0,
      cai_tien: 0,
      dau_tu: 0,
      chien_luoc: 0,
      khan_cap: 0,
    };

    let cardCho = 0;
    let cardDangXX = 0;
    let cardYCBS = 0;
    let cardDuyet = 0;
    let cardDP = 0;
    let cardTuChoi = 0;
    let cardQuaSLA = 0;

    for (const p of proposals) {
      if (kindCount[p.kind] !== undefined) kindCount[p.kind] += 1;

      if (isCurrentApprover(p, currentUserUid, currentUserRole)) cardCho += 1;
      if (p.status === 'dang_xem_xet') cardDangXX += 1;
      if (p.status === 'yeu_cau_bo_sung') cardYCBS += 1;
      if (p.status === 'da_phe_duyet') cardDuyet += 1;
      if (p.status === 'da_tao_dieu_phoi' || p.status === 'chuyen_dieu_phoi')
        cardDP += 1;
      if (p.status === 'tu_choi') cardTuChoi += 1;
      if (isProposalOverdue(p, nowMs)) cardQuaSLA += 1;
    }

    const totalKind =
      kindCount.van_hanh +
      kindCount.cai_tien +
      kindCount.dau_tu +
      kindCount.chien_luoc +
      kindCount.khan_cap;

    return {
      cardCho,
      cardDangXX,
      cardYCBS,
      cardDuyet,
      cardDP,
      cardTuChoi,
      cardQuaSLA,
      kindCount,
      totalKind,
    };
  }, [proposals, currentUserUid, currentUserRole, nowMs]);

  return (
    <div className="space-y-4">
      {/* Tầng 1 — 7 KPI cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <KpiCard
          label="Chờ tôi duyệt"
          value={stats.cardCho}
          icon={<AlertCircle size={18} />}
          tone="amber"
        />
        <KpiCard
          label="Đang xem xét"
          value={stats.cardDangXX}
          icon={<Eye size={18} />}
          tone="sky"
        />
        <KpiCard
          label="Cần bổ sung"
          value={stats.cardYCBS}
          icon={<Send size={18} />}
          tone="orange"
        />
        <KpiCard
          label="Đã phê duyệt"
          value={stats.cardDuyet}
          icon={<CheckCircle2 size={18} />}
          tone="emerald"
        />
        <KpiCard
          label="Đã tạo điều phối"
          value={stats.cardDP}
          icon={<ArrowRightCircle size={18} />}
          tone="violet"
        />
        <KpiCard
          label="Từ chối"
          value={stats.cardTuChoi}
          icon={<XCircle size={18} />}
          tone="rose"
        />
        <KpiCard
          label="Quá hạn"
          value={stats.cardQuaSLA}
          icon={<Clock size={18} />}
          tone="rose-dark"
        />
      </div>

      {/* Tầng 2 — Donut "Cơ cấu đề xuất theo loại" */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-slate-700">
          Cơ cấu đề xuất theo loại
        </h3>
        <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-2">
          <div className="flex justify-center lg:justify-start">
            <DonutChart
              segments={(Object.keys(stats.kindCount) as ProposalKindV6[]).map(
                (k) => ({
                  value: stats.kindCount[k],
                  color: KIND_COLOR[k],
                  label: KIND_LABEL[k],
                })
              )}
              total={stats.totalKind}
            />
          </div>
          <ul className="space-y-2.5 text-sm">
            {(Object.keys(stats.kindCount) as ProposalKindV6[]).map((k) => {
              const c = stats.kindCount[k];
              const pct =
                stats.totalKind > 0
                  ? Math.round((c / stats.totalKind) * 100)
                  : 0;
              return (
                <li key={k} className="flex items-center gap-3">
                  <span
                    className="h-3 w-3 rounded-sm"
                    style={{ backgroundColor: KIND_COLOR[k] }}
                  />
                  <span className="flex-1 truncate text-slate-700">
                    {KIND_LABEL[k]}
                  </span>
                  <span className="tabular-nums font-semibold text-slate-800">
                    {c}
                  </span>
                  <span className="w-12 text-right text-xs tabular-nums text-slate-500">
                    {pct}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// Sub-components
// ───────────────────────────────────────────────────────────────

type Tone = 'amber' | 'sky' | 'orange' | 'emerald' | 'violet' | 'rose' | 'rose-dark';

const TONE_STYLES: Record<Tone, { bg: string; text: string; ring: string }> = {
  amber: { bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-200' },
  sky: { bg: 'bg-sky-50', text: 'text-sky-700', ring: 'ring-sky-200' },
  orange: { bg: 'bg-orange-50', text: 'text-orange-700', ring: 'ring-orange-200' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-200' },
  violet: { bg: 'bg-violet-50', text: 'text-violet-700', ring: 'ring-violet-200' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-700', ring: 'ring-rose-200' },
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
      <div className="mb-2 flex items-center justify-between">
        <span
          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${t.bg} ${t.text} ring-1 ${t.ring}`}
        >
          {icon}
        </span>
      </div>
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${t.text}`}>{value}</p>
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
  const size = 220;
  const radius = 88;
  const stroke = 32;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * radius;

  if (total <= 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={stroke}
        />
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-slate-400 text-sm"
        >
          Chưa có dữ liệu
        </text>
      </svg>
    );
  }

  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="#f1f5f9"
        strokeWidth={stroke}
      />
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
        y={cy - 8}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-slate-800 text-3xl font-bold"
      >
        {total}
      </text>
      <text
        x={cx}
        y={cy + 18}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-slate-500 text-xs"
      >
        đề xuất
      </text>
    </svg>
  );
}

// ───────────────────────────────────────────────────────────────
// Backward-compat alias — adapter cũ (DeXuatClient V3/V5) vẫn import
// `ProposalV3` / `ProposalV5` từ file này. Giữ alias để build không vỡ.
// ───────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type ProposalV3 = ProposalV6;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type ProposalV5 = ProposalV6;
