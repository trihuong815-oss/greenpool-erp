// PR-TK2 (2026-06-21) — Alert cảnh báo nghiệp vụ:
// - Còn tx chờ duyệt / bị từ chối
// - Còn batch chờ đối chiếu / trả lại
// - Tháng chưa khóa (chỉ hiển thị nếu user là Top/QLCS/Acct + tháng đã qua)
//
// PR-SUMMARY-UI-TRUNCATED-WARNING (2026-06-29): truncated alert TÁCH RA
// DataTruncatedBanner riêng — render TRƯỚC component này với style banner lớn
// hơn vì là DATA INTEGRITY issue (sai số liệu nghiêm trọng hơn workflow alert).
//
// Hiển thị compact — chỉ render alert nào CÓ vấn đề. Nếu không có gì → render null.

import { Clock, RotateCcw, XCircle } from 'lucide-react';
import type { Summary } from './types';

interface Props {
  data: Summary;
}

interface Alert {
  tone: 'rose' | 'amber' | 'orange' | 'slate';
  icon: React.ReactNode;
  text: string;
}

const TONE_CLS: Record<Alert['tone'], string> = {
  rose:   'bg-rose-50 text-rose-700 ring-rose-200',
  amber:  'bg-amber-50 text-amber-700 ring-amber-200',
  orange: 'bg-orange-50 text-orange-700 ring-orange-200',
  slate:  'bg-slate-50 text-slate-700 ring-slate-200',
};

export default function BusinessAlerts({ data }: Props) {
  const alerts: Alert[] = [];

  // PR-SUMMARY-UI-TRUNCATED-WARNING (2026-06-29): truncated alert moved to
  // DataTruncatedBanner (banner riêng, style lớn hơn) — render trước component này.

  // 2. Tx pending review
  const pendingTx = data.txStatusStats?.pending ?? 0;
  if (pendingTx > 0) {
    alerts.push({
      tone: 'amber',
      icon: <Clock size={14} />,
      text: `Còn ${pendingTx} giao dịch chờ duyệt — KHÔNG tính vào doanh số chính thức.`,
    });
  }

  // 3. Tx rejected
  const rejectedTx = data.txStatusStats?.rejected ?? 0;
  if (rejectedTx > 0) {
    alerts.push({
      tone: 'slate',
      icon: <XCircle size={14} />,
      text: `${rejectedTx} giao dịch bị từ chối — kế toán đã loại trừ khỏi báo cáo.`,
    });
  }

  // 4. Batch pending review
  const pendingBatches = data.batchStats?.pendingReview ?? 0;
  if (pendingBatches > 0) {
    alerts.push({
      tone: 'amber',
      icon: <Clock size={14} />,
      text: `Còn ${pendingBatches} batch chờ đối chiếu — kế toán cần xử lý trước khi khóa tháng.`,
    });
  }

  // 5. Batch returned
  const returnedBatches = data.batchStats?.returned ?? 0;
  if (returnedBatches > 0) {
    alerts.push({
      tone: 'orange',
      icon: <RotateCcw size={14} />,
      text: `${returnedBatches} batch bị trả lại Sale — đang chờ sửa & gửi lại.`,
    });
  }

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {alerts.map((a, i) => (
        <div
          key={i}
          className={`flex items-start gap-2 px-3 py-2 rounded-lg ring-1 text-xs ${TONE_CLS[a.tone]}`}
        >
          <span className="shrink-0 mt-0.5">{a.icon}</span>
          <span className="flex-1 leading-snug">{a.text}</span>
        </div>
      ))}
    </div>
  );
}
