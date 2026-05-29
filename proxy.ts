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

export async function proxy(req: NextRequest) {
  const isLoginPage = req.nextUrl.pathname.startsWith('/login');
  const isPublicAsset =
    req.nextUrl.pathname.startsWith('/_next') ||
    req.nextUrl.pathname.startsWith('/api') ||
    req.nextUrl.pathname.endsWith('.svg') ||
    req.nextUrl.pathname.endsWith('.png') ||
    req.nextUrl.pathname.endsWith('.ico') ||
    // PWA assets — Chrome cần fetch không cookie để cài app
    req.nextUrl.pathname === '/manifest.json' ||
    req.nextUrl.pathname === '/firebase-messaging-sw.js';

  const hasSession = !!req.cookies.get(SESSION_COOKIE)?.value;

  if (!hasSession && !isLoginPage && !isPublicAsset) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  if (hasSession && isLoginPage) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
