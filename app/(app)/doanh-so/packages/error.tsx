'use client';

// Error boundary cho /doanh-so/packages — auto-catch runtime error + hiển thị
// chi tiết stack để debug. Tạm thời để tìm root cause; xoá sau khi fix.
// 2026-06-17 — debug.

import { useEffect } from 'react';
import { AlertCircle, RotateCw } from 'lucide-react';

export default function PackagesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[packages-error]', error);
  }, [error]);

  return (
    <div className="flex-1 p-6 bg-slate-50 overflow-y-auto">
      <div className="max-w-3xl mx-auto card border-rose-200 bg-rose-50/40">
        <div className="flex items-start gap-3 mb-4">
          <AlertCircle size={24} className="text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-rose-800">Trang lỗi — đang debug</h1>
            <p className="mt-1 text-sm text-rose-700">
              Anh chụp screenshot phần dưới này gửi em — em sẽ fix chính xác chỗ lỗi.
            </p>
          </div>
          <button
            onClick={() => reset()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
          >
            <RotateCw size={14} /> Thử lại
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-rose-600 mb-1">Message</div>
            <div className="rounded-lg bg-white ring-1 ring-rose-200 px-3 py-2 text-sm font-mono text-rose-800 break-all">
              {error.message || '(không có message)'}
            </div>
          </div>

          {error.digest && (
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-rose-600 mb-1">Digest (Next.js error ID)</div>
              <div className="rounded-lg bg-white ring-1 ring-rose-200 px-3 py-2 text-xs font-mono text-rose-800 break-all">
                {error.digest}
              </div>
            </div>
          )}

          {error.stack && (
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-rose-600 mb-1">Stack trace</div>
              <pre className="rounded-lg bg-white ring-1 ring-rose-200 px-3 py-2 text-[11px] font-mono text-rose-800 whitespace-pre-wrap break-all max-h-[400px] overflow-auto">
                {error.stack}
              </pre>
            </div>
          )}

          {(error as any).cause && (
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-rose-600 mb-1">Cause</div>
              <pre className="rounded-lg bg-white ring-1 ring-rose-200 px-3 py-2 text-[11px] font-mono text-rose-800 whitespace-pre-wrap">
                {String((error as any).cause)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
