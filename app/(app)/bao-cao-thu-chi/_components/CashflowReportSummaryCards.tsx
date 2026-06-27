'use client';

// PR-CASH1D: KPI top cards — chỉ hiển thị cho role nhìn nhiều cơ sở (THU_QUY/top).
// PR-UI-PIXEL-MATCH B3 (2026-06-26): dùng <StatCard> chuẩn.
// PR-CASHFLOW-NORMALIZE (2026-06-27): 5 grid KpiCard → SegmentSummary nhất quán
// pattern Snapshot toàn app (/dieu-phoi+/de-xuat+/cong-viec-ca-nhan+
// /checklist-v2+/tong-ket). Bỏ Stat wrapper duplicate.

import type { DailyCashflowReportDoc } from '@/lib/finance/cashflow-report-types';
import { SegmentSummary } from '@/components/ui/StatCard';

interface Props {
  reports: Array<DailyCashflowReportDoc & { id: string }>;
}

function fmt(n: number): string { return n.toLocaleString('vi-VN'); }

export function CashflowReportSummaryCards({ reports }: Props) {
  const totals = reports.reduce(
    (acc, r) => {
      acc.count += 1;
      acc.revenue += r.revenueSource?.total ?? 0;
      acc.expense += r.expense?.totalByMethod?.total ?? 0;
      acc.net += r.net?.total ?? 0;
      if (Array.isArray(r.alerts) && r.alerts.length > 0) acc.alerted += 1;
      return acc;
    },
    { count: 0, revenue: 0, expense: 0, net: 0, alerted: 0 },
  );

  return (
    <SegmentSummary
      items={[
        { n: totals.count,                   label: 'Báo cáo',     tone: 'default' },
        { n: `${fmt(totals.revenue)} ₫`,     label: 'Tổng thu',    tone: 'success' },
        { n: `${fmt(totals.expense)} ₫`,     label: 'Tổng chi',    tone: 'danger' },
        { n: `${fmt(totals.net)} ₫`,         label: 'Net',         tone: totals.net < 0 ? 'danger' : 'success' },
        { n: totals.alerted,                 label: 'Có cảnh báo', tone: totals.alerted > 0 ? 'warning' : 'default' },
      ]}
    />
  );
}
