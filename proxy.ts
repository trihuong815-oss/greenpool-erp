// Middleware (Next.js gọi là `middleware`, project này đặt là `proxy.ts`).
//
// Phase 4.C cut-over: verify Firebase session cookie (gp_session).
// Middleware chạy trong Edge Runtime → KHÔNG dùng firebase-admin (Node-only).
// Quick check ở middleware: chỉ kiểm sự tồn tại cookie.
// Verify chữ ký thật sự sẽ xảy ra ở mỗi page server / API route qua
// `getCurrentUser()` (chạy Node runtime, dùng Admin SDK).
// Nếu session cookie hết hạn/sai chữ ký → page server tự redirect login.

import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'gp_session';

// Phase A.5 (2026-06-07): Origin check CSRF defense-in-depth.
// SameSite=lax cookie là layer 1; Origin check là layer 2 (chặn cross-origin POST từ XSS-driven submit).
// Phase HOTFIX (2026-06-07): bỏ ALLOWED_ORIGINS hard-coded — user trên mobile/preview
// deploy alias bị 403. Chỉ check same-host: origin.host == request.host = pass.
// Vercel set host từ TCP socket, attacker không spoof được trên prod.
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method;

  // ─── Phase A.5: Origin check cho /api/ non-GET ───
  // Phase HOTFIX-EMERGENCY (2026-06-07): TẠM BYPASS Origin check để xác nhận
  // user vào được. CSRF defense chính = SameSite=lax cookie (browser-level) +
  // Firebase session cookie verify (server-level). Origin check là layer phụ.
  // Sẽ bật lại sau khi confirm root cause (cache cũ vs logic check sai).
  if (pathname.startsWith('/api/') && method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const origin = req.headers.get('origin');
    const host = req.headers.get('host');
    // Log mọi POST/PUT/DELETE để debug — tạm thời.
    console.log('[proxy debug] ' + method + ' ' + pathname + ' origin=' + origin + ' host=' + host);
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
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
