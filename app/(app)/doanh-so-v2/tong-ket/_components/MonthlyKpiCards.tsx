// PR-TK1 (2026-06-21) — 5 KPI cards tháng. Tách từ TongKetClient.tsx.
// PR-TK2 (2026-06-21) — Thêm KPI "Số khách" + "Chờ đối chiếu". Layout responsive.
// PR-UI-PIXEL-MATCH B5 (2026-06-26): KPI dashboard top-level dùng formatMillion.
// PR-TONGKET-NORMALIZE (2026-06-27): 5-7 KpiCard riêng → 1 dải SegmentSummary.
// PR-TONGKET-PHASE2 (2026-06-27): MoM growth % — hiển thị delta vs tháng trước
// cho KPI tài chính (Doanh số / Thực thu / Công nợ phát sinh / Công nợ còn).
// Số GD + Số khách + Chờ đối chiếu KHÔNG hiện delta (đếm tuyệt đối, ít so sánh ý nghĩa).
//
// Layout: SegmentSummary cell value giờ kèm "▴+12% / ▾-5%" nhỏ dưới value
// nếu prevMonth có data và delta != 0. Empty (prev=null hoặc value=0) → ẩn.

import type { Summary } from './types';
import { SegmentSummary } from '@/components/ui/StatCard';
import { formatMillion } from '@/components/ui/TableWrap';

interface Props {
  totals: Summary['totals'];
  customerCount?: number;
  pendingReviewCount?: number;
  prevMonth?: Summary['prevMonth'];
}

/** Format % delta gọn: +12%, -5%, ±0% (no decimal nếu integer, 1 chữ số nếu có).
 *  null nếu base=0 (chia 0 — undefined comparison). */
function pctDelta(current: number, prev: number): { text: string; up: boolean } | null {
  if (prev === 0) return null; // Không thể so % nếu tháng trước = 0 (lần đầu / chưa có data)
  const delta = ((current - prev) / prev) * 100;
  const abs = Math.abs(delta);
  const text = abs < 0.1 ? '±0%'
    : abs >= 100 ? `${delta > 0 ? '+' : '-'}${Math.round(abs)}%`
    : `${delta > 0 ? '+' : '-'}${abs.toFixed(1).replace('.', ',')}%`;
  return { text, up: delta >= 0 };
}

function fmtDelta(current: number, prev: number): React.ReactNode {
  const d = pctDelta(current, prev);
  if (!d) return null;
  const cls = d.text === '±0%'
    ? 'text-slate-400'
    : d.up ? 'text-emerald-600' : 'text-rose-600';
  return (
    <div className={`text-[10px] font-medium tabular-nums ${cls} mt-0.5`}>
      {d.up && d.text !== '±0%' ? '▴' : d.text === '±0%' ? '' : '▾'} {d.text}
    </div>
  );
}

/** Compose cell value với MoM delta dưới value (nếu có). */
function withMoM(value: React.ReactNode, current: number, prev?: number): React.ReactNode {
  if (prev === undefined) return value;
  const delta = fmtDelta(current, prev);
  if (!delta) return value;
  return (
    <div className="flex flex-col items-center">
      <div>{value}</div>
      {delta}
    </div>
  );
}

export default function MonthlyKpiCards({ totals, customerCount, pendingReviewCount, prevMonth }: Props) {
  const hasCustomer = typeof customerCount === 'number';
  const hasPending = typeof pendingReviewCount === 'number' && pendingReviewCount > 0;
  const prev = prevMonth?.totals;

  return (
    <SegmentSummary
      items={[
        { n: totals.transactions, label: 'Số giao dịch', tone: 'default' },
        ...(hasCustomer ? [{ n: customerCount, label: 'Số khách', tone: 'default' as const }] : []),
        { n: withMoM(formatMillion(totals.sales),         totals.sales,         prev?.sales),         label: 'Doanh số',          tone: 'success' as const },
        { n: withMoM(formatMillion(totals.collected),     totals.collected,     prev?.collected),     label: 'Thực thu',          tone: 'info' as const },
        { n: withMoM(formatMillion(totals.debtGenerated), totals.debtGenerated, prev?.debtGenerated), label: 'Công nợ phát sinh', tone: 'warning' as const },
        { n: withMoM(formatMillion(totals.debtRemaining), totals.debtRemaining, prev?.debtRemaining), label: 'Công nợ còn lại',   tone: 'danger' as const },
        ...(hasPending ? [{ n: pendingReviewCount, label: 'Chờ đối chiếu', tone: 'warning' as const }] : []),
      ]}
    />
  );
}
