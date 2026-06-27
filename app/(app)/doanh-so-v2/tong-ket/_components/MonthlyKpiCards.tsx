// PR-TK1 (2026-06-21) — 5 KPI cards tháng. Tách từ TongKetClient.tsx.
// PR-TK2 (2026-06-21) — Thêm KPI "Số khách" + "Chờ đối chiếu". Layout responsive.
// PR-UI-PIXEL-MATCH B5 (2026-06-26): KPI dashboard top-level dùng formatMillion
// ("73 tr", "57,5 tr", "1,56 tỷ") thay full "73.000.000đ" — match mockup.
// PR-TONGKET-NORMALIZE (2026-06-27): 5-7 KpiCard riêng → 1 dải SegmentSummary
// static nhất quán với pattern Snapshot toàn app (/dieu-phoi+/de-xuat+
// /cong-viec-ca-nhan+/checklist-v2 SupervisorView). KPI ở /tong-ket KHÔNG có
// filter target nội bộ → cell static (không click) — chỉ thông tin.
// Bỏ KpiCard primitive (deadcode khi 13 file legacy cũng xoá).

import type { Summary } from './types';
import { SegmentSummary } from '@/components/ui/StatCard';
import { formatMillion } from '@/components/ui/TableWrap';

interface Props {
  totals: Summary['totals'];
  /** Số khách distinct trong scope. Undefined → KHÔNG render. */
  customerCount?: number;
  /** Tổng (tx pending + batch pending) = "Chờ đối chiếu". Undefined hoặc 0 → KHÔNG render. */
  pendingReviewCount?: number;
}

export default function MonthlyKpiCards({ totals, customerCount, pendingReviewCount }: Props) {
  const hasCustomer = typeof customerCount === 'number';
  const hasPending = typeof pendingReviewCount === 'number' && pendingReviewCount > 0;

  return (
    <SegmentSummary
      items={[
        { n: totals.transactions, label: 'Số giao dịch', tone: 'default' },
        ...(hasCustomer ? [{ n: customerCount, label: 'Số khách', tone: 'default' as const }] : []),
        { n: formatMillion(totals.sales),         label: 'Doanh số',          tone: 'success' as const },
        { n: formatMillion(totals.collected),     label: 'Thực thu',          tone: 'info' as const },
        { n: formatMillion(totals.debtGenerated), label: 'Công nợ phát sinh', tone: 'warning' as const },
        { n: formatMillion(totals.debtRemaining), label: 'Công nợ còn lại',   tone: 'danger' as const },
        ...(hasPending ? [{ n: pendingReviewCount, label: 'Chờ đối chiếu', tone: 'warning' as const }] : []),
      ]}
    />
  );
}
