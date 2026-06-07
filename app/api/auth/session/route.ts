// POST   /api/auth/session  → tạo session cookie từ ID token (Firebase Auth client SDK gửi)
// DELETE /api/auth/session  → revoke + clear cookie (logout)
//
// Cookie: httpOnly, secure (prod), sameSite=lax, TTL 14d (khớp Firebase session cookie max).

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getFirebaseAdminAuth } from '@/lib/firebase/admin';
import { SESSION_COOKIE, SESSION_TTL_MS } from '@/lib/firebase/session-auth';
import { checkRateLimitDistributed } from '@/lib/rate-limit-distributed';
import { parseUidFromIdToken } from '@/lib/auth/parse-jwt';
import { writeAuditLog } from '@/lib/firebase/audit-log';

export async function POST(req: NextRequest) {
  try {
    // Phase HIGH-1 fix (2026-06-07): defense-in-depth rate limit.
    //
    // Trust boundary: Vercel edge SET `x-forwarded-for` từ TCP socket, attacker
    // KHÔNG inject được header (Vercel strip header inbound trước khi route).
    // Tuy nhiên defense-in-depth: dùng 2 bucket parallel.
    //
    // 1. login:ip  — 30/60s per IP. Cao hơn 10/60s vì corporate NAT share IP
    //    (5 cơ sở qua 1 public IP → cần room).
    // 2. login:uid — 20/300s per account. Chống credential stuffing 1 victim
    //    qua nhiều IP (botnet residential). Generous limit để legit retry password.
    //
    // Spoof uid trong rate-limit key chỉ làm KEY khác, KHÔNG bypass auth (verify
    // bởi createSessionCookie). Worst case: spoof victim uid → slow down victim
    // 5 phút — không brick account.
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || 'unknown';
    const ipRl = await checkRateLimitDistributed(`login:ip:${ip}`, 30, 60);
    if (!ipRl.ok) {
      return NextResponse.json(
        { error: 'Quá nhiều lần thử. Đợi rồi thử lại.' },
        { status: 429, headers: { 'Retry-After': String(ipRl.retryAfter ?? 60) } }
      );
    }

    const body = await req.json();
    const idToken: string = body?.idToken;
    if (!idToken) return NextResponse.json({ error: 'Thiếu idToken' }, { status: 400 });

    // Per-account bucket — uid parse từ JWT payload (KHÔNG verify, chỉ key).
    const claimedUid = parseUidFromIdToken(idToken);
    if (claimedUid) {
      const uidRl = await checkRateLimitDistributed(`login:uid:${claimedUid}`, 20, 300);
      if (!uidRl.ok) {
        // Audit log để admin biết account bị tấn công credential stuffing.
        await writeAuditLog({
          action: 'login_rate_limit_uid',
          module: 'users',
          userId: claimedUid,
          branchId: null,
          before: null,
          after: { ip, retryAfter: uidRl.retryAfter },
          source: 'api',
        }).catch(() => { /* swallow audit fail */ });
        return NextResponse.json(
          { error: 'Tài khoản đang bị nhiều lần đăng nhập sai. Đợi rồi thử lại.' },
          { status: 429, headers: { 'Retry-After': String(uidRl.retryAfter ?? 300) } }
        );
      }
    }

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
