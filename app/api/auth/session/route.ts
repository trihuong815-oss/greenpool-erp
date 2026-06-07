// POST   /api/auth/session  → tạo session cookie từ ID token (Firebase Auth client SDK gửi)
// DELETE /api/auth/session  → revoke + clear cookie (logout)
//
// Cookie: httpOnly, secure (prod), sameSite=lax, TTL 14d (khớp Firebase session cookie max).

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getFirebaseAdminAuth } from '@/lib/firebase/admin';
import { SESSION_COOKIE, SESSION_TTL_MS } from '@/lib/firebase/session-auth';
import { checkRateLimitDistributed } from '@/lib/rate-limit-distributed';

export async function POST(req: NextRequest) {
  try {
    // Phase C.3 (2026-06-07): rate limit cross-instance để chặn brute force.
    // 10 attempt / 60s per IP. Distributed → attacker không bypass bằng cách
    // tới nhiều Vercel edge instance.
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || 'unknown';
    const rl = await checkRateLimitDistributed(`login:${ip}`, 10, 60);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Quá nhiều lần thử. Đợi rồi thử lại.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } }
      );
    }

    const body = await req.json();
    const idToken: string = body?.idToken;
    if (!idToken) return NextResponse.json({ error: 'Thiếu idToken' }, { status: 400 });

    const auth = getFirebaseAdminAuth();
    const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn: SESSION_TTL_MS });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, sessionCookie, {
      maxAge: SESSION_TTL_MS / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
    return res;
  } catch (e: any) {
    console.error('[auth/session POST]', e);
    return NextResponse.json({ error: e?.message ?? 'Internal error' }, { status: 401 });
  }
}

export async function DELETE() {
  // Phase A.3 (2026-06-07) CRITICAL fix: revoke Firebase refresh tokens trước khi clear cookie.
  // Trước đây chỉ clear cookie → nếu attacker stole cookie, vẫn dùng được 14 ngày
  // (verifySessionCookie với checkRevoked=true vẫn return valid vì refresh token chưa revoke).
  // Giờ revoke tokens → mọi session cũ invalidate ngay → "logout all devices" semantics đúng.
  try {
    const cookieStore = await cookies();
    const sessionCookieValue = cookieStore.get(SESSION_COOKIE)?.value;
    if (sessionCookieValue) {
      const auth = getFirebaseAdminAuth();
      // Decode session cookie để lấy uid → revoke tokens
      const decoded = await auth.verifySessionCookie(sessionCookieValue, false).catch(() => null);
      if (decoded?.uid) {
        await auth.revokeRefreshTokens(decoded.uid).catch((e) => {
          console.warn('[auth/session DELETE] revokeRefreshTokens fail:', e?.message);
        });
      }
    }
  } catch (e: any) {
    console.warn('[auth/session DELETE] decode/revoke skip:', e?.message);
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { maxAge: 0, path: '/' });
  return res;
}
