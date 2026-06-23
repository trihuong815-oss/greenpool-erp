'use client';

// PR-CASH1C: Card nộp báo cáo thu-chi (NV_KE only).

import { useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { BranchId } from '@/lib/branches';
import { submitDailyCashflowReport, type SubmitReportResponse } from '@/lib/services/finance/api-client';

interface Props {
  date: string;
  branchId: BranchId;
  onSubmitted: (resp: SubmitReportResponse) => void;
  onError: (msg: string) => void;
}

export function SubmitCashflowReportCard({ date, branchId, onSubmitted, onError }: Props) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
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
          <div className="text-sm font-bold text-slate-800">Nộp báo cáo thu-chi ngày</div>
          <p className="text-xs text-slate-600 mt-1">
            Hệ thống sẽ chốt số thu (từ Đối chiếu doanh số) + tổng chi (từ các phiếu đã ghi nhận),
            sinh báo cáo và gửi cho Thủ quỹ / TP Kế toán / Giám sát / Ban Lãnh đạo.
            Mỗi lần nộp lại sẽ tăng phiên bản và lưu bản cũ trong lịch sử.
          </p>
        </div>
        <Button variant="primary" size="md" loading={busy} onClick={handleClick} leftIcon={<Send size={14} />}>
          Nộp báo cáo thu-chi
        </Button>
      </div>
    </div>
  );
}
