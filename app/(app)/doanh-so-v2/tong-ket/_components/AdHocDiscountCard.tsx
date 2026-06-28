'use client';

// PR-PROMO2-B (2026-06-23) — Read-only card "Ưu đãi ngoài chương trình cần kiểm tra".
//
// Section trong /doanh-so-v2/tong-ket. Wire vào 4 views (Top/Accountant/Qlcs/ReadOnlyAudit).
// KHÔNG có status review/approve/reject — chỉ display.
//
// PR-TONGKET-OVERVIEW-V2 (2026-06-27): user feedback hội đồng — "Rủi ro giá" chỉ
// chứa giao dịch SAI LỆCH (HIGH_RISK/REVIEW/LOW). Bỏ NORMAL khỏi UI:
//   - ClassificationBreakdown chỉ 3 row (bỏ NORMAL)
//   - FilterChip "NORMAL" + filter mode 'normal_only' bỏ hẳn
//   - Empty state khi tổng số GD rủi ro (HIGH+REVIEW+LOW) === 0
//   - NORMAL VẪN counted ở backend stats (tradeOffNote), chỉ ẨN khỏi UI người xem.

import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Filter } from 'lucide-react';
import { BRANCH_BY_ID } from '@/lib/branches';
import {
  AD_HOC_CLASSIFICATION_LABELS,
  AD_HOC_CLASSIFICATION_TONE,
  type AdHocClassification,
} from '@/lib/sales-v2/ad-hoc-thresholds';
import type { AdHocSummary, AdHocDiscountItem } from '@/lib/sales-v2/ad-hoc-discount';

interface Props {
  data: AdHocSummary;
}

// PR-TONGKET-OVERVIEW-V2 (2026-06-27): bỏ 'normal_only' + 'all_levels' (vì all
// sẽ bao gồm NORMAL — không phù hợp với mục đích "rủi ro"). Còn 4 mode:
//   review_plus (default) = HIGH+REVIEW+LOW · high_risk · review_only · low_only
type FilterMode = 'review_plus' | 'high_risk' | 'review_only' | 'low_only';

const TONE_CLASSES: Record<'slate' | 'amber' | 'orange' | 'rose', { badge: string; text: string }> = {
  slate:  { badge: 'bg-slate-100 text-slate-700 ring-slate-300', text: 'text-slate-700' },
  amber:  { badge: 'bg-amber-50 text-amber-800 ring-amber-300', text: 'text-amber-800' },
  orange: { badge: 'bg-orange-50 text-orange-800 ring-orange-300', text: 'text-orange-800' },
  rose:   { badge: 'bg-rose-50 text-rose-800 ring-rose-300', text: 'text-rose-800' },
};

function fmtVnd(n: number): string {
  return new Intl.NumberFormat('vi-VN').format(Math.round(n));
}
function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}
function fmtDate(d: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

export default function AdHocDiscountCard({ data }: Props) {
  const [filter, setFilter] = useState<FilterMode>('review_plus');
  const [expanded, setExpanded] = useState(true);

  // Filter items theo mode
  const filteredItems = useMemo(() => {
    const allow = matchesFilter(filter);
    return data.items.filter((it) => allow.has(it.classification));
  }, [data.items, filter]);

  // PR-TONGKET-OVERVIEW-V2: "rủi ro" = chỉ HIGH+REVIEW+LOW (bỏ NORMAL).
  // Empty state khi không có bất kỳ GD rủi ro nào (kể cả khi NORMAL > 0).
  const riskCount =
    data.byClassification.HIGH_RISK.count +
    data.byClassification.REVIEW.count +
    data.byClassification.LOW.count;
  const hasUnknown = data.totals.unknownBaselineCount > 0;

  if (riskCount === 0 && !hasUnknown) {
    return (
      <section className="card">
        <Header />
        <div className="text-center py-10 text-slate-400">
          <div className="text-4xl mb-2">✅</div>
          <div className="text-sm font-medium text-slate-600">
            Không có giao dịch sai lệch giá trong tháng này.
          </div>
          {data.byClassification.NORMAL.count > 0 && (
            <div className="text-xs text-slate-400 mt-1">
              ({data.byClassification.NORMAL.count} GD giảm nhẹ trong ngưỡng cho phép.)
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="card">
      <Header />

      {/* Trade-off note */}
      <div className="text-xs text-slate-500 italic mb-3 flex items-start gap-1.5">
        <AlertTriangle size={12} className="shrink-0 mt-0.5" />
        <span>{data.tradeOffNote}</span>
      </div>

      {/* KPI Strip */}
      <KpiStrip data={data} />

      {/* Breakdown classification */}
      <ClassificationBreakdown data={data} />

      {/* PR-ADHOC-REMOVE-TOPS (2026-06-28): user feedback — bỏ Top cơ sở +
          Top sale khỏi card Rủi ro giá. Lý do user phát biểu trực tiếp.
          Server vẫn compute data.topBranches/topSales (giữ API), chỉ ẨN UI.
          Top theo doanh số overall đã có ở tab Tổng quan (BranchSummary +
          SaleRanking) — đủ cho mục đích quan sát Top. */}

      {/* List header — collapse toggle + filter */}
      <div className="flex items-center justify-between flex-wrap gap-2 mt-4 pt-3 border-t border-slate-100">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 hover:text-slate-900"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          Danh sách chi tiết
          <span className="text-xs text-slate-500 font-normal">
            ({filteredItems.length}/{data.items.length}{data.truncated ? ` · cap 200/${data.totalItemsBeforeCap}` : ''})
          </span>
        </button>

        {expanded && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Filter size={12} className="text-slate-400" />
            <FilterChip current={filter} value="review_plus" label="Tất cả rủi ro" onClick={setFilter} />
            <FilterChip current={filter} value="high_risk"   label="HIGH_RISK" onClick={setFilter} />
            <FilterChip current={filter} value="review_only" label="REVIEW" onClick={setFilter} />
            <FilterChip current={filter} value="low_only"    label="LOW" onClick={setFilter} />
          </div>
        )}
      </div>

      {/* Truncated banner */}
      {data.truncated && expanded && (
        <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
          ⚠ Danh sách chi tiết hiển thị tối đa 200 giao dịch nổi bật (sort theo mức rủi ro). Tổng hợp vẫn tính theo toàn bộ {data.totalItemsBeforeCap} giao dịch trong tháng.
        </div>
      )}

      {/* UNKNOWN_BASELINE warning */}
      {hasUnknown && expanded && (
        <div className="mt-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded p-2">
          ℹ Có {data.totals.unknownBaselineCount} giao dịch thiếu giá chuẩn nên chưa thể kiểm tra (gói chưa cấu hình defaultPrice / defaultUnitPrice). Liên hệ admin để bổ sung.
        </div>
      )}

      {/* List */}
      {expanded && filteredItems.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="hidden md:block mt-3 overflow-x-auto max-h-[60vh] rounded border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                <tr className="text-left text-xs font-semibold text-slate-600">
                  <th className="px-2 py-2">Ngày</th>
                  <th className="px-2 py-2">Cơ sở</th>
                  <th className="px-2 py-2">Sale</th>
                  <th className="px-2 py-2">Khách / SĐT</th>
                  <th className="px-2 py-2">Gói</th>
                  <th className="px-2 py-2 text-right">Giá chuẩn</th>
                  <th className="px-2 py-2 text-right">Giá bán</th>
                  <th className="px-2 py-2 text-right">Chênh lệch</th>
                  <th className="px-2 py-2 text-right">Tỷ lệ</th>
                  <th className="px-2 py-2">Mức</th>
                  <th className="px-2 py-2">Loại GD</th>
                  <th className="px-2 py-2">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((it) => <Row key={it.txId} it={it} />)}
              </tbody>
            </table>
          </div>

          {/* Mobile card stack */}
          <div className="md:hidden mt-3 space-y-2">
            {filteredItems.map((it) => <MobileCard key={it.txId} it={it} />)}
          </div>
        </>
      )}

      {/* Empty after filter */}
      {expanded && filteredItems.length === 0 && data.items.length > 0 && (
        <div className="mt-3 text-center py-6 text-sm text-slate-400">
          Không có giao dịch nào ở mức đã chọn. Đổi filter để xem thêm.
        </div>
      )}
    </section>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────

function Header() {
  return (
    <>
      <h2 className="text-base font-bold text-slate-800 mb-1 flex items-center gap-2">
        <AlertTriangle size={16} className="text-amber-600" />
        Ưu đãi ngoài chương trình cần kiểm tra
      </h2>
      <p className="text-xs text-slate-500 mb-3">
        Báo cáo read-only. Giao dịch bán thấp hơn giá chuẩn nhưng không gắn chương trình khuyến mãi chính thức.
      </p>
    </>
  );
}

function KpiStrip({ data }: { data: AdHocSummary }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
      <KpiBox
        label="Tổng số GD"
        value={String(data.totals.transactionsCount)}
        sub="bán thấp hơn giá chuẩn"
        tone="slate"
      />
      <KpiBox
        label="Tổng chênh lệch"
        value={fmtVnd(data.totals.totalAdHocAmount)}
        sub="VND so giá chuẩn"
        tone={data.byClassification.HIGH_RISK.count > 0 ? 'rose' : 'amber'}
      />
      <KpiBox
        label="HIGH_RISK (>20%)"
        value={String(data.byClassification.HIGH_RISK.count)}
        sub={`${fmtVnd(data.byClassification.HIGH_RISK.amount)} đ`}
        tone="rose"
      />
      <KpiBox
        label="REVIEW (10-20%)"
        value={String(data.byClassification.REVIEW.count)}
        sub={`${fmtVnd(data.byClassification.REVIEW.amount)} đ`}
        tone="orange"
      />
    </div>
  );
}

function KpiBox({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: 'slate' | 'amber' | 'orange' | 'rose' }) {
  const t = TONE_CLASSES[tone];
  return (
    <div className={`rounded-lg ring-1 ${t.badge.replace('ring-', 'ring-')} px-3 py-2`}>
      <div className="text-xs text-slate-600">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${t.text}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{sub}</div>
    </div>
  );
}

function ClassificationBreakdown({ data }: { data: AdHocSummary }) {
  // PR-TONGKET-OVERVIEW-V2 (2026-06-27): chỉ hiện 3 mức rủi ro (bỏ NORMAL).
  // Total cho % bar = sum amount của 3 mức rủi ro (không tính NORMAL).
  const items: Array<{ key: AdHocClassification; count: number; amount: number }> = [
    { key: 'HIGH_RISK', count: data.byClassification.HIGH_RISK.count, amount: data.byClassification.HIGH_RISK.amount },
    { key: 'REVIEW',    count: data.byClassification.REVIEW.count,    amount: data.byClassification.REVIEW.amount },
    { key: 'LOW',       count: data.byClassification.LOW.count,       amount: data.byClassification.LOW.amount },
  ];
  const total = items.reduce((s, it) => s + it.amount, 0);

  return (
    <div className="mb-3">
      <div className="text-xs font-semibold text-slate-600 mb-1.5">Phân loại theo mức giảm</div>
      <div className="space-y-1">
        {items.map((it) => {
          const tone = AD_HOC_CLASSIFICATION_TONE[it.key];
          const t = TONE_CLASSES[tone];
          const pct = total > 0 ? (it.amount / total) * 100 : 0;
          return (
            <div key={it.key} className="flex items-center gap-2 text-xs">
              <div className={`w-24 px-2 py-0.5 rounded ring-1 ${t.badge} text-center font-medium`}>
                {AD_HOC_CLASSIFICATION_LABELS[it.key]}
              </div>
              <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                {pct > 0 && (
                  <div
                    className={`h-full ${tone === 'slate' ? 'bg-slate-400' : tone === 'amber' ? 'bg-amber-400' : tone === 'orange' ? 'bg-orange-500' : 'bg-rose-500'}`}
                    style={{ width: `${Math.max(2, pct)}%` }}
                  />
                )}
              </div>
              <div className="w-16 text-right tabular-nums text-slate-600">{it.count} GD</div>
              <div className="w-28 text-right tabular-nums font-medium text-slate-700">{fmtVnd(it.amount)} đ</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// PR-ADHOC-REMOVE-TOPS (2026-06-28): TopBranches + TopSales functions deleted
// (deadcode sau khi remove khỏi JSX render). Top doanh số overall đã có ở tab
// Tổng quan. Server response data.topBranches/topSales giữ nguyên cho compat.

function FilterChip({
  current, value, label, onClick,
}: { current: FilterMode; value: FilterMode; label: string; onClick: (v: FilterMode) => void }) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={`px-2 py-0.5 rounded-full text-xs font-medium ring-1 transition ${
        active ? 'bg-emerald-600 text-white ring-emerald-600' : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  );
}

function Row({ it }: { it: AdHocDiscountItem }) {
  const tone = AD_HOC_CLASSIFICATION_TONE[it.classification];
  const t = TONE_CLASSES[tone];
  const branch = BRANCH_BY_ID[it.branchId];
  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50">
      <td className="px-2 py-1.5 tabular-nums text-slate-700 whitespace-nowrap">{fmtDate(it.date)}</td>
      <td className="px-2 py-1.5">
        <span
          className="inline-block px-1.5 py-0.5 rounded text-xs font-medium text-white"
          style={{ backgroundColor: branch?.color ?? '#64748b' }}
        >
          {branch?.id ?? it.branchId}
        </span>
      </td>
      <td className="px-2 py-1.5 text-slate-700 truncate max-w-[120px]" title={it.saleName}>{it.saleName}</td>
      <td className="px-2 py-1.5 text-slate-700">
        <div className="truncate max-w-[150px]" title={it.customerName}>{it.customerName || '—'}</div>
        <div className="text-xs text-slate-500 tabular-nums">{it.phone || '—'}</div>
      </td>
      <td className="px-2 py-1.5 text-slate-700 truncate max-w-[180px]" title={it.packageName}>{it.packageName}</td>
      <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{fmtVnd(it.baseline)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums text-slate-800 font-medium">{fmtVnd(it.actual)}</td>
      <td className={`px-2 py-1.5 text-right tabular-nums font-medium ${t.text}`}>-{fmtVnd(it.adHocAmount)}</td>
      <td className={`px-2 py-1.5 text-right tabular-nums font-bold ${t.text}`}>{fmtPct(it.adHocPercent)}</td>
      <td className="px-2 py-1.5">
        <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ring-1 ${t.badge}`}>
          {AD_HOC_CLASSIFICATION_LABELS[it.classification]}
        </span>
      </td>
      <td className="px-2 py-1.5 text-xs text-slate-500 font-mono">{it.transactionType || '—'}</td>
      <td className="px-2 py-1.5 text-xs text-slate-500">
        {it.batchStatus ? <span>batch: {it.batchStatus}</span> : null}
        {it.reviewStatus ? <div>tx: {it.reviewStatus}</div> : null}
      </td>
    </tr>
  );
}

function MobileCard({ it }: { it: AdHocDiscountItem }) {
  const tone = AD_HOC_CLASSIFICATION_TONE[it.classification];
  const t = TONE_CLASSES[tone];
  const branch = BRANCH_BY_ID[it.branchId];
  return (
    <div className={`rounded-lg ring-1 p-3 ${t.badge.replace('text-', 'border-transparent ')}`} style={{ backgroundColor: '#fff' }}>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className="inline-block px-1.5 py-0.5 rounded text-xs font-medium text-white"
            style={{ backgroundColor: branch?.color ?? '#64748b' }}
          >
            {branch?.id ?? it.branchId}
          </span>
          <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ring-1 ${t.badge}`}>
            {AD_HOC_CLASSIFICATION_LABELS[it.classification]}
          </span>
        </div>
        <div className="text-xs text-slate-500 tabular-nums">{fmtDate(it.date)}</div>
      </div>
      <div className="text-sm font-medium text-slate-800">{it.customerName || '(không tên)'}</div>
      <div className="text-xs text-slate-500 mb-1">{it.phone || '—'} · Sale: {it.saleName}</div>
      <div className="text-xs text-slate-700 mb-1.5">{it.packageName}</div>
      <div className="grid grid-cols-3 gap-1 text-xs">
        <div>
          <div className="text-slate-500">Chuẩn</div>
          <div className="tabular-nums text-slate-700">{fmtVnd(it.baseline)}</div>
        </div>
        <div>
          <div className="text-slate-500">Bán</div>
          <div className="tabular-nums font-medium text-slate-800">{fmtVnd(it.actual)}</div>
        </div>
        <div>
          <div className="text-slate-500">Giảm</div>
          <div className={`tabular-nums font-bold ${t.text}`}>{fmtPct(it.adHocPercent)}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Filter helper ────────────────────────────────────────────────────

function matchesFilter(mode: FilterMode): Set<AdHocClassification> {
  // PR-TONGKET-OVERVIEW-V2 (2026-06-27): bỏ NORMAL khỏi mọi mode rủi ro giá.
  switch (mode) {
    case 'high_risk':    return new Set(['HIGH_RISK']);
    case 'review_only':  return new Set(['REVIEW']);
    case 'low_only':     return new Set(['LOW']);
    case 'review_plus':
    default:             return new Set(['HIGH_RISK', 'REVIEW', 'LOW']);
  }
}
