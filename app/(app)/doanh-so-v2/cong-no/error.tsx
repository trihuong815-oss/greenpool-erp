'use client';

// PR-CONG-NO-DEFENSIVE (2026-06-23): Next.js route-level error boundary cho /cong-no.
// Mirror tong-ket/error.tsx pattern (Defensive 2026-06-19).
//
// Lý do: user báo Sale vào /cong-no bị "out ra màn hình login". Server-side render
// đã verify 200 + nội dung đầy đủ — bug có thể do client runtime crash khiến error
// bubble lên root + redirect /login. Error boundary này CATCH error → hiện card lỗi
// thay vì unmount/redirect.
//
// Log chi tiết để debug từ Sentry/console.

import { useEffect } from 'react';
import { AppTopBar } from '@/components/AppTopBar';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function CongNoError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[CongNoError]', error.message, error.stack, error.digest);
  }, [error]);

  return (
    <>
      <AppTopBar title="Công nợ" icon="task" />
      <div className="flex-1 flex items-center justify-center p-3 md:p-6 bg-slate-50">
        <div className="card max-w-md w-full text-center py-10">
          <AlertTriangle size={40} className="mx-auto text-amber-500 mb-3" />
          <div className="font-bold text-slate-800 text-lg mb-2">
            Có lỗi khi tải Công nợ
          </div>
          <div className="text-sm text-slate-600 mb-4 break-words">
            {error.message || 'Lỗi không xác định'}
          </div>
          {error.digest && (
            <div className="text-xs text-slate-400 font-mono mb-4">
              Mã lỗi: {error.digest}
            </div>
          )}
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => reset()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition"
            >
              <RefreshCw size={14} /> Thử lại
            </button>
            <button
              type="button"
              onClick={() => (window.location.href = '/dashboard')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg ring-1 ring-slate-200 text-slate-700 text-sm hover:bg-slate-50 transition"
            >
              Về trang chủ
            </button>
          </div>
          <p className="mt-4 text-xs text-slate-400">
            Nếu lặp lại, gửi mã lỗi cho admin để khắc phục.
          </p>
        </div>
      </div>
    </>
  );
}
