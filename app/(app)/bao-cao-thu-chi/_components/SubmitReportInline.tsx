'use client';

// PR-CASH1C-REFINE: Submit báo cáo thu-chi cho NV_KE (chuyển từ /chi-phi-co-so sang).
// Chỉ hiện khi: canSubmit=true (NV_KE/ADMIN) + (chưa có report HOẶC report status='returned').

import { useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { BranchId } from '@/lib/branches';
import { submitDailyCashflowReport, type SubmitReportResponse } from '@/lib/services/finance/api-client';
import type { DailyCashflowReportDoc } from '@/lib/finance/cashflow-report-types';

interface Props {
  date: string;
  branchId: BranchId | null;
  currentReport: (DailyCashflowReportDoc & { id: string }) | undefined;
  onSubmitted: (resp: SubmitReportResponse) => void;
  onError: (msg: string) => void;
}

export function SubmitReportInline({ date, branchId, currentReport, onSubmitted, onError }: Props) {
  const [busy, setBusy] = useState(false);

  if (!branchId) return null;

  // Hide nếu đã có báo cáo và KHÔNG ở trạng thái returned (NV_KE không nộp lại khi đã submitted/sent/checked/locked)
  const shouldShow = !currentReport || currentReport.status === 'returned';
  if (!shouldShow) return null;

  const isResubmit = currentReport?.status === 'returned';

  async function handleClick() {
    if (!branchId) return;
    setBusy(true);
    try {
      const resp = await submitDailyCashflowReport(date, branchId);
      onSubmitted(resp);
    } catch (e: any) {
      onError(e?.message ?? 'Lỗi nộp báo cáo');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card border-2 border-emerald-100">
      <div className="flex items-start gap-3">
        <div className="rounded-lg p-2 bg-emerald-100 text-emerald-700">
          <Send size={18} />
        </div>
        <div className="flex-1">
          <div className="text-sm font-bold text-slate-800">
            {isResubmit ? 'Nộp lại báo cáo thu-chi' : 'Nộp báo cáo thu-chi cho ngày này'}
          </div>
          <p className="text-xs text-slate-600 mt-1">
            Hệ thống sẽ chốt số thu (từ Đối chiếu doanh số) + tổng chi (từ các phiếu đã ghi nhận),
            sinh báo cáo và gửi cho Thủ quỹ / TP Kế toán / Giám sát / Ban Lãnh đạo.
            {isResubmit ? ' Phiên bản mới được tạo và bản cũ lưu trong lịch sử.' : ''}
          </p>
        </div>
        <Button variant="primary" size="md" loading={busy} onClick={handleClick} leftIcon={<Send size={14} />}>
          {isResubmit ? 'Nộp lại' : 'Nộp báo cáo'}
        </Button>
      </div>
    </div>
  );
}
