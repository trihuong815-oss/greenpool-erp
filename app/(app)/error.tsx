'use client';

// PR-APP-ERROR-BOUNDARY (2026-06-24): root error boundary cho route group (app).
//
// Bối cảnh: nhiều user (NV_SALE, NV_KE, ...) báo bị "out ra màn hình login"
// khi vào các route nghiệp vụ. Server-side reproduce với 10 role × 9 route =
// 0 bounces, 0 errors — render 100% OK. → Bug 100% là client runtime crash:
// React component throw uncaught → Next.js không có nearest error boundary
// → bubble lên root → có thể trigger redirect ra ngoài app shell.
//
// Trước đây CHỈ có /tong-ket và /cong-no có error.tsx (defensive 2026-06-19
// và 2026-06-23). Nay phủ TOÀN BỘ route group (app) bằng root boundary —
// route-specific error.tsx vẫn take precedence khi tồn tại.
//
// Sau fix: nếu client crash → user thấy card "Có lỗi khi tải trang" với mã
// digest để gửi admin debug, KHÔNG bị unmount/redirect login giữa chừng.

import { useEffect } from 'react';
import { AppTopBar } from '@/components/AppTopBar';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function AppRootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log chi tiết — Sentry sẽ capture nếu config; console để debug local
    console.error('[AppRootError]', error.message, error.stack, error.digest);
  }, [error]);

  return (
    <>
      <AppTopBar title="Có lỗi xảy ra" icon="task" />
      <div className="flex-1 flex items-center justify-center p-3 md:p-6 bg-slate-50">
        <div className="card max-w-md w-full text-center py-10">
          <AlertTriangle size={40} className="mx-auto text-amber-500 mb-3" />
          <div className="font-bold text-slate-800 text-lg mb-2">
            Có lỗi khi tải trang
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
            Nếu lặp lại, gửi mã lỗi cho admin để khắc phục. Bạn KHÔNG bị đăng xuất —
            có thể quay về trang chủ hoặc thử lại.
          </p>
        </div>
      </div>
    </>
  );
}
