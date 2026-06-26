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
// PR-UI-PIXEL-MATCH B4 (2026-06-26): bỏ 7 icon import — KpiCard riêng đã thay
// bằng <SegmentSummary> (1 dải gộp 7 trạng thái) không cần icon per card.
import { SegmentSummary } from '@/components/ui/StatCard';

// ───────────────────────────────────────────────────────────────
// Types V6 — định nghĩa cục bộ để dashboard self-contained.
// 5 loại: van_hanh · cai_tien · dau_tu · chien_luoc · khan_cap
// 7 status V6: nhap · da_gui · dang_xem_xet · yeu_cau_bo_sung
//            · da_phe_duyet · da_tao_dieu_phoi · dong_ho_so (+ tu_choi)
// ───────────────────────────────────────────────────────────────

export type ProposalKindV6 =
  // V6.4 (2026-06-13) anh chốt 3 loại form mới — đã verify 0 doc legacy trên Firestore.
  | 'van_hanh'
  | 'du_an'
  | 'cai_tien';

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
  van_hanh: '#0ea5e9',  // sky-500
  du_an: '#8b5cf6',     // violet-500
  cai_tien: '#10b981',  // emerald-500
};

const KIND_LABEL: Record<ProposalKindV6, string> = {
  van_hanh: 'Vận hành',
  du_an: 'Dự án',
  cai_tien: 'Cải tiến',
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
      van_hanh: 0, du_an: 0, cai_tien: 0,
    };

    let cardCho = 0;
    let cardDangXX = 0;
    let cardYCBS = 0;
    let cardDuyet = 0;
    let cardDP = 0;
    let cardTuChoi = 0;
    let cardQuaSLA = 0;

    // V6.5 (2026-06-13) anh chốt — tổng giá trị + biểu đồ 4 nhóm tài chính
    let valTotal = 0;
    let valCho = 0;       // chờ duyệt = (đã gửi + đang xem xét)
    let valDuyet = 0;     // đã duyệt
    let valDP = 0;        // đã chuyển điều phối
    const tierBuckets = { t1: 0, t2: 0, t3: 0, t4: 0 }; // <5tr / 5-50tr / 50-200tr / ≥200tr (đếm số đề xuất)

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

      // V6.5: tổng giá trị + buckets — chỉ đếm proposal có estimatedCost > 0
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

    const totalKind =
      kindCount.van_hanh +
      kindCount.du_an +
      kindCount.cai_tien;

    return {
      cardCho, cardDangXX, cardYCBS, cardDuyet, cardDP, cardTuChoi, cardQuaSLA,
      kindCount, totalKind,
      valTotal, valCho, valDuyet, valDP, tierBuckets,
    };
  }, [proposals, currentUserUid, currentUserRole, nowMs]);

  // Format VND ngắn gọn cho card (1.2tr / 50tr / 1.5tỷ)
  function fmtVndShort(n: number): string {
    if (n === 0) return '0';
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, '')} tỷ`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')} tr`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
    return n.toString();
  }

  return (
    <div className="space-y-4">
      {/* PR-UI-PIXEL-MATCH B4 (2026-06-26): "Tình trạng đề xuất — gộp 7 trạng thái
          thành 1 dải" — thay 7 KpiCard riêng bằng <SegmentSummary> chuẩn mockup
          (green-pool-prototype-sau-toi-uu.html .segsum). 4 KPI cao cấp (Tổng/Chờ
          duyệt/Đã duyệt/Tạo ĐP) giữ bên dưới. */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3">
          <span className="h-4 w-1 rounded bg-emerald-600" />
          <h2 className="text-sm font-semibold text-slate-900">Tình trạng đề xuất</h2>
          <span className="text-[12px] text-slate-500">— gộp 7 trạng thái thành 1 dải</span>
        </div>
        <SegmentSummary
          items={[
            { n: stats.cardCho,     label: 'Chờ tôi duyệt',     tone: 'warning' },
            { n: stats.cardDangXX,  label: 'Đang xem xét',      tone: 'default' },
            { n: stats.cardYCBS,    label: 'Cần bổ sung',       tone: 'warning' },
            { n: stats.cardDuyet,   label: 'Đã phê duyệt',      tone: 'success' },
            { n: stats.cardDP,      label: 'Đã tạo điều phối',  tone: 'default' },
            { n: stats.cardTuChoi,  label: 'Từ chối',           tone: 'danger' },
            { n: stats.cardQuaSLA,  label: 'Quá hạn',           tone: 'danger' },
          ]}
        />
      </div>

      {/* V6.5 (2026-06-13) anh chốt — Tầng 1B: 4 KPI tổng GIÁ TRỊ */}
      {stats.valTotal > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {/* PR-UI-TYPOGRAPHY-DENSITY-BALANCE (2026-06-26): 4 KPI value text-2xl font-bold
              → text-[22px] font-semibold leading-tight + label text-[10px] → text-[11px].
              Khớp StatCard chuẩn. text-[10px] cũ vi phạm rule font ≥12 (CLAUDE.md). */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Tổng giá trị</div>
            <div className="mt-1 text-[22px] font-semibold leading-tight tabular-nums text-slate-800">{fmtVndShort(stats.valTotal)}</div>
            <div className="text-[11px] text-slate-400 mt-1">đề xuất có giá trị</div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
            <div className="text-[11px] uppercase tracking-wider text-amber-700 font-semibold">Chờ duyệt</div>
            <div className="mt-1 text-[22px] font-semibold leading-tight tabular-nums text-amber-700">{fmtVndShort(stats.valCho)}</div>
            <div className="text-[11px] text-slate-400 mt-1">đang chờ quyết định</div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
            <div className="text-[11px] uppercase tracking-wider text-emerald-700 font-semibold">Đã duyệt</div>
            <div className="mt-1 text-[22px] font-semibold leading-tight tabular-nums text-emerald-700">{fmtVndShort(stats.valDuyet)}</div>
            <div className="text-[11px] text-slate-400 mt-1">sẵn sàng triển khai</div>
          </div>
          <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4">
            <div className="text-[11px] uppercase tracking-wider text-violet-700 font-semibold">Đã chuyển ĐP</div>
            <div className="mt-1 text-[22px] font-semibold leading-tight tabular-nums text-violet-700">{fmtVndShort(stats.valDP)}</div>
            <div className="text-[11px] text-slate-400 mt-1">đang triển khai</div>
          </div>
        </div>
      )}

      {/* V6.5 (2026-06-16): Row 1 — [Bar "theo giá trị" | Điểm nghẽn] cùng hàng.
          md:grid-cols-2 chia đôi; mobile <768px xếp dọc. Mỗi card hover độc lập. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* TRÁI — Bar "Đề xuất theo giá trị" */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
          <h3 className="mb-4 text-sm font-semibold text-slate-700">Đề xuất theo giá trị</h3>
          {(stats.tierBuckets.t1 + stats.tierBuckets.t2 + stats.tierBuckets.t3 + stats.tierBuckets.t4) > 0 ? (
            <div className="space-y-3">
              {[
                { label: 'Dưới 5 triệu', n: stats.tierBuckets.t1, color: 'emerald', range: '< 5 tr' },
                { label: '5 – 50 triệu', n: stats.tierBuckets.t2, color: 'sky', range: '5–50 tr' },
                { label: '50 – 200 triệu', n: stats.tierBuckets.t3, color: 'amber', range: '50–200 tr' },
                { label: 'Từ 200 triệu', n: stats.tierBuckets.t4, color: 'rose', range: '≥ 200 tr' },
              ].map((b) => {
                const tot = stats.tierBuckets.t1 + stats.tierBuckets.t2 + stats.tierBuckets.t3 + stats.tierBuckets.t4;
                const pct = tot === 0 ? 0 : Math.round((b.n / tot) * 100);
                const colorMap: Record<string, { bar: string; text: string; bg: string }> = {
                  emerald: { bar: 'linear-gradient(90deg, #34d399, #10b981)', text: 'text-emerald-700', bg: 'bg-emerald-50' },
                  sky:     { bar: 'linear-gradient(90deg, #60a5fa, #3b82f6)', text: 'text-sky-700', bg: 'bg-sky-50' },
                  amber:   { bar: 'linear-gradient(90deg, #fbbf24, #f59e0b)', text: 'text-amber-700', bg: 'bg-amber-50' },
                  rose:    { bar: 'linear-gradient(90deg, #fb7185, #e11d48)', text: 'text-rose-700', bg: 'bg-rose-50' },
                };
                const c = colorMap[b.color];
                return (
                  <div key={b.label}>
                    <div className="flex items-center justify-between mb-1 text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md font-semibold ${c.bg} ${c.text}`}>
                          {b.range}
                        </span>
                        <span className="text-slate-600">{b.label}</span>
                      </div>
                      <span className="tabular-nums text-slate-700 font-medium">
                        {b.n} đề xuất <span className="text-slate-400">({pct}%)</span>
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden shadow-inner">
                      <div className="h-full rounded-full shadow-sm transition-all" style={{ width: `${pct}%`, background: c.bar }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center py-8 text-sm text-slate-400 italic">
              Chưa có đề xuất có giá trị tài chính
            </div>
          )}
        </div>

        {/* PHẢI — Điểm nghẽn đề xuất */}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
          <div className="bg-rose-50/60 px-4 py-2.5 border-b border-rose-100">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-rose-700">
              Điểm nghẽn đề xuất
            </h3>
          </div>
          {(() => {
            interface AggRow { key: string; name: string; holding: number; longestHours: number }
            const approverGroups = new Map<string, AggRow>();
            const longest: Array<{ id: string; code: string; title: string; hours: number; approver: string }> = [];
            const blockTon = { KD: 0, VP: 0 };

            for (const p of proposals as any[]) {
              const pending = ['da_gui', 'dang_xem_xet', 'yeu_cau_bo_sung'].includes(p.status);
              if (!pending) continue;
              const hrs = p.updatedAt ? (nowMs - new Date(p.updatedAt).getTime()) / 3_600_000 : 0;
              const cur = p.approverChain?.[p.approverIdx];
              const aprName = cur?.name || cur?.roleCode || 'Chưa xác định';
              if (cur) {
                const key = cur.uid || cur.roleCode || aprName;
                const ex = approverGroups.get(key);
                if (!ex) approverGroups.set(key, { key, name: aprName, holding: 1, longestHours: hrs });
                else { ex.holding++; if (hrs > ex.longestHours) ex.longestHours = hrs; }
              }
              longest.push({ id: p.id, code: p.code, title: p.title, hours: hrs, approver: aprName });
              if (p.creatorBlock === 'KD') blockTon.KD++;
              else if (p.creatorBlock === 'VP') blockTon.VP++;
            }
            const topApprovers = Array.from(approverGroups.values())
              .sort((a, b) => b.holding - a.holding || b.longestHours - a.longestHours)
              .slice(0, 3);
            const topLongest = longest.sort((a, b) => b.hours - a.hours).slice(0, 3);
            const totalPending = blockTon.KD + blockTon.VP;

            if (topApprovers.length === 0 && totalPending === 0) {
              return <div className="py-8 text-center text-sm text-emerald-600 font-medium">✓ Không có điểm nghẽn</div>;
            }

            const fmtHrs = (h: number) => h < 24 ? `${Math.round(h)}h` : `${(h / 24).toFixed(1)} ngày`;

            return (
              <div className="divide-y divide-slate-100">
                {topApprovers.length > 0 && (
                  <div className="px-4 py-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                      Người duyệt giữ nhiều
                    </div>
                    {topApprovers.map((r) => (
                      <div key={r.key} className="flex items-center justify-between py-1.5 text-sm">
                        <span className="truncate text-slate-800 font-medium">{r.name}</span>
                        <span className="shrink-0 ml-2 inline-flex items-center gap-2">
                          <span className="tabular-nums text-slate-600 text-xs">{r.holding} ĐX</span>
                          <span className="tabular-nums text-rose-600 text-xs font-semibold">{fmtHrs(r.longestHours)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {topLongest.length > 0 && (
                  <div className="px-4 py-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                      Đề xuất chờ lâu nhất
                    </div>
                    {topLongest.map((r) => (
                      <div key={r.id} className="py-1.5">
                        <div className="text-sm font-medium text-slate-800 truncate" title={r.title}>{r.title}</div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                          <span className="tabular-nums">#{r.code}</span>
                          <span>·</span>
                          <span className="text-rose-600 font-semibold tabular-nums">Chờ {fmtHrs(r.hours)}</span>
                          <span>·</span>
                          <span className="truncate">tại {r.approver}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {totalPending > 0 && (
                  <div className="px-4 py-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                      Tồn theo khối tạo
                    </div>
                    <div className="space-y-1.5">
                      {[{ label: 'Khối Kinh doanh', n: blockTon.KD, color: 'bg-emerald-500' },
                        { label: 'Khối Văn phòng', n: blockTon.VP, color: 'bg-violet-500' }].map((b) => {
                        const pct = totalPending === 0 ? 0 : Math.round((b.n / totalPending) * 100);
                        return (
                          <div key={b.label}>
                            <div className="flex items-center justify-between text-xs mb-0.5">
                              <span className="text-slate-700">{b.label}</span>
                              <span className="tabular-nums text-slate-600">{b.n} <span className="text-slate-400">({pct}%)</span></span>
                            </div>
                            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                              <div className={`h-full ${b.color}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* V6.5 (2026-06-15): Row 2 — 2 DONUT CÙNG HÀNG (theo loại | theo khối).
          Mỗi card có hover effect. Mobile <768px → xếp dọc. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Donut A — theo loại */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
          <h3 className="mb-4 text-sm font-semibold text-slate-700">
            Cơ cấu đề xuất theo loại
          </h3>
          <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-2">
            <div className="flex justify-center sm:justify-start">
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
            <ul className="space-y-2 text-sm">
              {(Object.keys(stats.kindCount) as ProposalKindV6[]).map((k) => {
                const c = stats.kindCount[k];
                const pct =
                  stats.totalKind > 0
                    ? Math.round((c / stats.totalKind) * 100)
                    : 0;
                return (
                  <li key={k} className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-sm shrink-0"
                      style={{ backgroundColor: KIND_COLOR[k] }}
                    />
                    <span className="flex-1 truncate text-slate-700 text-xs">
                      {KIND_LABEL[k]}
                    </span>
                    <span className="tabular-nums font-semibold text-slate-800 text-sm">
                      {c}
                    </span>
                    <span className="w-10 text-right text-[11px] tabular-nums text-slate-500">
                      {pct}%
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* Donut B — theo khối (move từ Tầng 3 lên cạnh donut A) */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
          <h3 className="mb-4 text-sm font-semibold text-slate-700">
            Cơ cấu đề xuất theo khối
          </h3>
          {(() => {
            let kd = 0, vp = 0, cross = 0;
            for (const p of proposals as any[]) {
              if (p.crossBlock === true) cross++;
              else if (p.creatorBlock === 'VP') vp++;
              else kd++;
            }
            const total = kd + vp + cross;
            const segs = [
              { value: kd, color: '#10b981', label: 'Khối Kinh doanh' },
              { value: vp, color: '#8b5cf6', label: 'Khối Văn phòng' },
              { value: cross, color: '#f59e0b', label: 'Liên khối' },
            ];
            return (
              <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-2">
                <div className="flex justify-center sm:justify-start">
                  <DonutChart segments={segs} total={total} />
                </div>
                <ul className="space-y-2 text-sm">
                  {segs.map((s) => {
                    const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
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
            );
          })()}
        </div>
      </div>

    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// Sub-components
// ───────────────────────────────────────────────────────────────

// PR-UI-PIXEL-MATCH B4 (2026-06-26): KpiCard + Tone + TONE_STYLES đã được thay
// hoàn toàn bằng <SegmentSummary> từ @/components/ui/StatCard — dead code đã gỡ.

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
