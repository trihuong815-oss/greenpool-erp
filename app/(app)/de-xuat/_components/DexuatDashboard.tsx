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
      {/* Tầng 1 — 7 KPI cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <KpiCard
          label="Chờ tôi duyệt"
          value={stats.cardCho}
          icon={<AlertCircle size={18} />}
          tone="amber"
          tooltip="Đề xuất đang chờ TÔI duyệt — tôi là currentApprover trong chuỗi duyệt."
        />
        <KpiCard
          label="Đang xem xét"
          value={stats.cardDangXX}
          icon={<Eye size={18} />}
          tone="sky"
          tooltip="Đề xuất đã gửi và đang trong quá trình duyệt chuỗi (chưa đến lượt tôi)."
        />
        <KpiCard
          label="Cần bổ sung"
          value={stats.cardYCBS}
          icon={<Send size={18} />}
          tone="orange"
          tooltip="Đề xuất bị approver yêu cầu bổ sung — người tạo cần sửa và gửi lại."
        />
        <KpiCard
          label="Đã phê duyệt"
          value={stats.cardDuyet}
          icon={<CheckCircle2 size={18} />}
          tone="emerald"
          tooltip="Đề xuất đã duyệt cuối chuỗi nhưng chưa tạo task điều phối."
        />
        <KpiCard
          label="Đã tạo điều phối"
          value={stats.cardDP}
          icon={<ArrowRightCircle size={18} />}
          tone="violet"
          tooltip="Đề xuất duyệt xong và đã tạo task Điều phối liên kết — workflow hoàn tất."
        />
        <KpiCard
          label="Từ chối"
          value={stats.cardTuChoi}
          icon={<XCircle size={18} />}
          tone="rose"
          tooltip="Đề xuất bị từ chối — creator có thể sửa và gửi lại (resubmit)."
        />
        <KpiCard
          label="Quá hạn"
          value={stats.cardQuaSLA}
          icon={<Clock size={18} />}
          tone="rose-dark"
          tooltip="Đề xuất đang chờ duyệt và đã vượt SLA (12h urgent / 24h normal / 48h low)."
        />
      </div>

      {/* V6.5 (2026-06-13) anh chốt — Tầng 1B: 4 KPI tổng GIÁ TRỊ */}
      {stats.valTotal > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Tổng giá trị</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-slate-800">{fmtVndShort(stats.valTotal)}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">đề xuất có giá trị</div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
            <div className="text-[11px] uppercase tracking-wider text-amber-700 font-semibold">Chờ duyệt</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-amber-700">{fmtVndShort(stats.valCho)}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">đang chờ quyết định</div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
            <div className="text-[11px] uppercase tracking-wider text-emerald-700 font-semibold">Đã duyệt</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-700">{fmtVndShort(stats.valDuyet)}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">sẵn sàng triển khai</div>
          </div>
          <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4">
            <div className="text-[11px] uppercase tracking-wider text-violet-700 font-semibold">Đã chuyển ĐP</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-violet-700">{fmtVndShort(stats.valDP)}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">đang triển khai</div>
          </div>
        </div>
      )}

      {/* V6.5 (2026-06-15): GỘP "Đề xuất theo giá trị" + "Cơ cấu đề xuất theo loại"
          vào 1 hàng — mỗi widget chiếm 1/2 chiều rộng (lg:grid-cols-2). Mobile xếp dọc. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Bar chart 4 nhóm tài chính */}
        {(stats.tierBuckets.t1 + stats.tierBuckets.t2 + stats.tierBuckets.t3 + stats.tierBuckets.t4) > 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="mb-4 text-sm font-semibold text-slate-700">Đề xuất theo giá trị</h3>
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
          </div>
        ) : (
          // Placeholder nếu chưa có dữ liệu tài chính → giữ grid 2 cột visual không bị lệch
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-5 flex items-center justify-center text-sm text-slate-400 italic">
            Chưa có đề xuất có giá trị tài chính
          </div>
        )}

        {/* Cơ cấu đề xuất theo loại */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
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
      </div>

      {/* Tầng 3 — Donut "Cơ cấu đề xuất theo khối" + Bảng "Điểm nghẽn đề xuất" */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* A — Donut theo khối */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-700">
            Cơ cấu đề xuất theo khối
          </h3>
          {(() => {
            // V6.5 (2026-06-14): bỏ tính qua relatedUnits (deprecated). Dùng `crossBlock`
            // flag (đã set bởi backend dựa vào recipient + creator block).
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
              <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-2">
                <div className="flex justify-center md:justify-start">
                  <DonutChart segments={segs} total={total} />
                </div>
                <ul className="space-y-2.5 text-sm">
                  {segs.map((s) => {
                    const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
                    return (
                      <li key={s.label} className="flex items-center gap-3">
                        <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: s.color }} />
                        <span className="flex-1 truncate text-slate-700">{s.label}</span>
                        <span className="tabular-nums font-semibold text-slate-800">{s.value}</span>
                        <span className="w-12 text-right text-xs tabular-nums text-slate-500">{pct}%</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })()}
        </div>

        {/* B — Điểm nghẽn đề xuất — V6.5 (2026-06-13) mở rộng 3 mục */}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="bg-rose-50/60 px-4 py-2.5 border-b border-rose-100">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-rose-700">
              Điểm nghẽn đề xuất
            </h3>
          </div>
          {(() => {
            // === Mục 1: Top người duyệt giữ nhiều nhất ===
            interface AggRow { key: string; name: string; holding: number; longestHours: number }
            const approverGroups = new Map<string, AggRow>();
            // === Mục 2: Top đề xuất chờ lâu nhất ===
            const longest: Array<{ id: string; code: string; title: string; hours: number; approver: string }> = [];
            // === Mục 3: Tồn theo khối tạo ===
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
                {/* Mục 1 */}
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
                {/* Mục 2 */}
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
                {/* Mục 3 */}
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
  tooltip,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: Tone;
  /** V6.5 Audit fix Phase B.2 (2026-06-15) — Issue 6.4: tooltip giải nghĩa KPI cho user. */
  tooltip?: string;
}) {
  const t = TONE_STYLES[tone];
  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-3 transition hover:shadow-md cursor-help"
      title={tooltip ?? label}
    >
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
