// POST   /api/auth/session  → tạo session cookie từ ID token (Firebase Auth client SDK gửi)
// DELETE /api/auth/session  → revoke + clear cookie (logout)
//
// Cookie: httpOnly, secure (prod), sameSite=lax, TTL 14d (khớp Firebase session cookie max).
//
// 2026-06-29 hardening:
//   - Phase-tagged structured logging cho easy debug khi prod fail
//   - Differentiated HTTP status (400 body / 401 token / 500 admin/server)
//   - Always returns JSON (never plain text 500 escaping framework default)
//   - NEVER logs idToken, sessionCookie, hoặc private key bytes — chỉ length/code/phase

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getFirebaseAdminAuth } from '@/lib/firebase/admin';
import { SESSION_COOKIE, SESSION_TTL_MS } from '@/lib/firebase/session-auth';
import { checkRateLimitDistributed } from '@/lib/rate-limit-distributed';
import { parseUidFromIdToken } from '@/lib/auth/parse-jwt';
import { writeAuditLog } from '@/lib/firebase/audit-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Phase =
  | 'start'
  | 'rate-limit-ip'
  | 'parse-body'
  | 'parse-uid'
  | 'rate-limit-uid'
  | 'admin-init'
  | 'create-session-cookie'
  | 'set-cookie'
  | 'audit'
  | 'done';

interface ErrInfo {
  message?: string;
  code?: string;
  name?: string;
}

function extractErr(e: unknown): ErrInfo {
  if (!e || typeof e !== 'object') return { message: String(e) };
  const x = e as Record<string, unknown>;
  return {
    message: typeof x.message === 'string' ? x.message : undefined,
    code: typeof x.code === 'string' ? x.code : undefined,
    name: typeof x.name === 'string' ? x.name : undefined,
  };
}

export async function POST(req: NextRequest) {
  let phase: Phase = 'start';
  const t0 = Date.now();
  let claimedUid: string | null = null;
  let ip = 'unknown';
  try {
    // ─── Phase: rate-limit-ip ────────────────────────────────────────
    phase = 'rate-limit-ip';
    ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || 'unknown';
    const ipRl = await checkRateLimitDistributed(`login:ip:${ip}`, 30, 60);
    if (!ipRl.ok) {
      return NextResponse.json(
        { error: 'Quá nhiều lần thử. Đợi rồi thử lại.' },
        { status: 429, headers: { 'Retry-After': String(ipRl.retryAfter ?? 60) } },
      );
    }

    // ─── Phase: parse-body ───────────────────────────────────────────
    phase = 'parse-body';
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Body không hợp lệ' }, { status: 400 });
    }
    const idToken: unknown = body?.idToken;
    if (typeof idToken !== 'string' || idToken.length === 0) {
      return NextResponse.json({ error: 'Thiếu idToken' }, { status: 400 });
    }

    // ─── Phase: rate-limit-uid ───────────────────────────────────────
    phase = 'parse-uid';
    claimedUid = parseUidFromIdToken(idToken);
    if (claimedUid) {
      phase = 'rate-limit-uid';
      const uidRl = await checkRateLimitDistributed(`login:uid:${claimedUid}`, 20, 300);
      if (!uidRl.ok) {
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
          { status: 429, headers: { 'Retry-After': String(uidRl.retryAfter ?? 300) } },
        );
      }
    }

    // ─── Phase: admin-init ───────────────────────────────────────────
    phase = 'admin-init';
    const auth = getFirebaseAdminAuth();

    // ─── Phase: create-session-cookie ────────────────────────────────
    phase = 'create-session-cookie';
    const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn: SESSION_TTL_MS });

    // ─── Phase: set-cookie ───────────────────────────────────────────
    phase = 'set-cookie';
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, sessionCookie, {
      maxAge: SESSION_TTL_MS / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });

    phase = 'done';
    console.info(
      '[auth/session POST] ok'
      + ' uid=' + (claimedUid ?? 'unknown')
      + ' ip=' + ip
      + ' durMs=' + (Date.now() - t0),
    );
    return res;
  } catch (e: unknown) {
    const err = extractErr(e);
    console.error(
      '[auth/session POST] FAIL'
      + ' phase=' + phase
      + ' uid=' + (claimedUid ?? 'unknown')
      + ' ip=' + ip
      + ' durMs=' + (Date.now() - t0)
      + ' errName=' + (err.name ?? 'unknown')
      + ' errCode=' + (err.code ?? 'unknown')
      + ' errMsg=' + (err.message ?? 'no-message'),
    );

    // Differentiate response by phase
    if (phase === 'admin-init') {
      return NextResponse.json(
        { error: 'Server config error', phase, code: err.code ?? null },
        { status: 500 },
      );
    }
    if (phase === 'create-session-cookie') {
      return NextResponse.json(
        { error: 'Token không hợp lệ hoặc đã hết hạn', phase, code: err.code ?? null },
        { status: 401 },
      );
    }
    if (phase === 'rate-limit-ip' || phase === 'rate-limit-uid') {
      // Rate limiter is fail-open; getting here = unhandled exception
      return NextResponse.json(
        { error: 'Rate limiter error', phase },
        { status: 500 },
      );
    }
    // Default catch-all
    return NextResponse.json(
      { error: 'Lỗi không xác định', phase, code: err.code ?? null },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  // Phase A.3 (2026-06-07): revoke Firebase refresh tokens trước khi clear cookie.
  // Trước đây chỉ clear cookie → nếu attacker stole cookie, vẫn dùng được 14 ngày.
  try {
    const cookieStore = await cookies();
    const sessionCookieValue = cookieStore.get(SESSION_COOKIE)?.value;
    if (sessionCookieValue) {
      const auth = getFirebaseAdminAuth();
      const decoded = await auth.verifySessionCookie(sessionCookieValue, false).catch(() => null);
      if (decoded?.uid) {
        await auth.revokeRefreshTokens(decoded.uid).catch((e) => {
          console.warn('[auth/session DELETE] revokeRefreshTokens fail:', (e as Error)?.message);
        });
      }
    }
  } catch (e: unknown) {
    console.warn('[auth/session DELETE] decode/revoke skip:', extractErr(e).message);
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { maxAge: 0, path: '/' });
  return res;
}
