// Phase A.5 (2026-06-07): Edge middleware cho security defense-in-depth.
// 1. Origin check cho non-GET request → chặn CSRF từ origin lạ
// 2. Future: CSP nonce injection (Phase B sẽ làm)
// 3. Future: Auth gate centralized (Phase B)

import { NextResponse, type NextRequest } from 'next/server';

// Whitelist origin được phép gọi state-changing request
const ALLOWED_ORIGINS = new Set([
  'https://greenpool-erp.vercel.app',
  'https://greenpool-erp-trihuong815-6255s-projects.vercel.app',
  'https://greenpool-erp-git-main-trihuong815-6255s-projects.vercel.app',
]);

// Endpoint cho phép cross-origin (vd webhook, callback) — KHÔNG yêu cầu Origin match
const ORIGIN_BYPASS = [
  '/api/cron/',           // Vercel cron internal call không có Origin
  '/api/fcm-config',      // Service Worker fetch (no-cors)
];

export function middleware(req: NextRequest) {
  const { method, headers, nextUrl } = req;
  const pathname = nextUrl.pathname;

  // Chỉ check non-GET (state-changing) cho /api/ routes
  if (pathname.startsWith('/api/') && method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    // Bypass cho endpoint không cần Origin check
    const bypass = ORIGIN_BYPASS.some((prefix) => pathname.startsWith(prefix));
    if (!bypass) {
      const origin = headers.get('origin');
      const host = headers.get('host');
      // Dev local: cho phép (Vercel preview branch tự generate URL — accept Origin matches host)
      const isDev = process.env.NODE_ENV !== 'production';
      const isAllowed = isDev
        || (origin && ALLOWED_ORIGINS.has(origin))
        || (origin && host && origin.endsWith(`://${host}`))
        || !origin; // server-side fetch không có Origin (vd SSR API call) — pass
      if (!isAllowed) {
        return NextResponse.json(
          { error: 'Origin không hợp lệ' },
          { status: 403 },
        );
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  // Áp middleware cho mọi route trừ static asset + Next internals
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|firebase-messaging-sw.js|icon-.*\\.png|logo\\.png).*)',
  ],
};
