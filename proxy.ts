// Middleware (Next.js 16 đổi convention: file `proxy.ts` được nhận diện như
// middleware — xem node_modules/next/dist/lib/constants.js: PROXY_FILENAME).
//
// Phase 4.C cut-over: verify Firebase session cookie (gp_session).
// Middleware chạy trong Edge Runtime → KHÔNG dùng firebase-admin (Node-only).
// Quick check ở middleware: chỉ kiểm sự tồn tại cookie.
// Verify chữ ký thật sự sẽ xảy ra ở mỗi page server / API route qua
// `getCurrentUser()` (chạy Node runtime, dùng Admin SDK).
// Nếu session cookie hết hạn/sai chữ ký → page server tự redirect login.

import { NextResponse, type NextRequest } from 'next/server';
import { isAllowedOrigin } from '@/lib/auth/request-origin';

const SESSION_COOKIE = 'gp_session';

// Phase A.5 (2026-06-07): Origin check CSRF defense-in-depth.
// SameSite=lax cookie là layer 1; Origin check là layer 2 (chặn cross-origin
// POST từ XSS-driven submit).
//
// 2026-06-29 REWRITE: chuyển sang allowlist Origin trực tiếp (không so Host).
// Lý do: Firebase App Hosting Envoy proxy không expose host header đáng tin
// cho backend → so origin === host bị false negative trên hosted.app. Allowlist
// origin (browser-controlled, không thể spoof từ XSS) là chuẩn CSRF defense.
// Logic chi tiết: lib/auth/request-origin.ts → isAllowedOrigin().

const ORIGIN_BYPASS_PREFIXES = [
  '/api/cron/',        // GitHub Actions / Cloud Scheduler cron — không có Origin
  '/api/fcm-config',   // Service Worker fetch no-cors
];

export async function proxy(req: NextRequest) {
  // Top-level try/catch — Edge Runtime middleware throw = 500 text/plain
  // from framework. Catching defensively ensures we always return a proper
  // response and log to Cloud Run for diagnosis.
  try {
    const { pathname } = req.nextUrl;
    const method = req.method;

    // ─── Origin check cho /api/ non-GET ───
    if (pathname.startsWith('/api/') && method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      const bypass = ORIGIN_BYPASS_PREFIXES.some((p) => pathname.startsWith(p));
      if (!bypass) {
        const check = isAllowedOrigin(req);
        if (!check.allowed) {
          console.warn(
            '[proxy] origin rejected — origin=' + check.origin
            + ' host=' + check.host
            + ' selfOrigin=' + check.selfOrigin,
          );
          return NextResponse.json({ error: 'Origin không hợp lệ' }, { status: 403 });
        }
      }
    }

    // ─── Auth gate ───
    const isLoginPage = pathname.startsWith('/login');
    const isPublicAsset =
      pathname.startsWith('/_next') ||
      pathname.startsWith('/api') ||
      pathname.endsWith('.svg') ||
      pathname.endsWith('.png') ||
      pathname.endsWith('.ico') ||
      // PWA assets — Chrome cần fetch không cookie để cài app
      pathname === '/manifest.json' ||
      pathname === '/firebase-messaging-sw.js';

    const hasSession = !!req.cookies.get(SESSION_COOKIE)?.value;

    if (!hasSession && !isLoginPage && !isPublicAsset) {
      return NextResponse.redirect(new URL('/login', req.url));
    }
    // Phase HOTFIX (2026-06-07): KHÔNG redirect /login → /dashboard khi có cookie.
    // Lý do: cookie có thể bị REVOKED (Phase A.3 logout-revoke-tokens) trong khi
    // browser vẫn giữ cookie. Layout (app)/ verify fail → redirect /login → proxy
    // redirect /dashboard → LOOP "nhiều sự chuyển hướng" (mobile báo lỗi).
    // Trade-off UX: user đã login mà mở /login sẽ thấy form login (Firebase Auth
    // client SDK persistence vẫn detect → có thể tự redirect /dashboard ở client).
    // An toàn hơn redirect loop.

    return NextResponse.next();
  } catch (e: unknown) {
    const msg = (e as Error)?.message ?? String(e);
    const name = (e as Error)?.name ?? 'Error';
    console.error(
      '[proxy] middleware unhandled error — name=' + name + ' msg=' + msg
      + ' path=' + (req.nextUrl?.pathname ?? 'unknown')
      + ' method=' + req.method,
    );
    // Fail-open for non-API routes (let request through, page handler may
    // still gate auth). For API, return 500 JSON so caller sees a parseable
    // error instead of framework text/plain.
    if (req.nextUrl?.pathname?.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Middleware error', name, message: msg },
        { status: 500 },
      );
    }
    return NextResponse.next();
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
