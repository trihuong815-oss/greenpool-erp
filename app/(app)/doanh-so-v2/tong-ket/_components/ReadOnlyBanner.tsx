// PR-TK4A (2026-06-22) — Banner thông báo "Chế độ giám sát" cho TP_GS.
// Render ở đầu ReadOnlyAuditView. KHÔNG dismissible (đảm bảo nhận thức rõ).

import { Eye } from 'lucide-react';

export default function ReadOnlyBanner() {
  return (
    <div className="rounded-xl p-3 ring-1 bg-slate-50 text-slate-700 ring-slate-200 flex items-start gap-2">
      <Eye size={16} className="shrink-0 mt-0.5 text-slate-500" />
      <div className="flex-1 text-sm leading-snug">
        <span className="font-semibold">Chế độ giám sát</span>
        <span className="ml-2 text-slate-600">
          Bạn xem đủ dữ liệu để kiểm soát/audit, KHÔNG được thao tác hoặc xuất file.
        </span>
      </div>
    </div>
  );
}
