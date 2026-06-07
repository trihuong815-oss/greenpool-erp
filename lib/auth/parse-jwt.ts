// Phase HIGH-1 fix (2026-06-07): parse JWT payload KHÔNG verify chữ ký.
//
// Mục đích DUY NHẤT: trích uid từ idToken Firebase trước khi tạo session cookie,
// để dùng làm rate-limit key per-account.
//
// QUAN TRỌNG: hàm này KHÔNG dùng cho auth — chỉ rate-limit grouping.
// Decode base64 payload là pure parse, không verify.
// Server vẫn gọi auth.createSessionCookie(idToken) — Firebase Admin verify chữ ký
// thật sự ở đó. Nếu idToken bịa → createSessionCookie throw → user nhận 401.
//
// Attacker spoof uid trong rate-limit key chỉ làm KEY khác, không bypass auth.
// Worst case: attacker spoof uid victim → consume budget của victim → victim
// bị lock account. Mitigation: limit per-uid rộng (20/5min) — không brick account,
// chỉ slow down spray.

import 'server-only';

/**
 * Decode JWT payload base64url → trả uid (nếu có).
 * KHÔNG verify chữ ký. Chỉ dùng cho rate-limit key, không cho auth decision.
 *
 * @returns uid string nếu parse OK, null nếu malformed.
 */
export function parseUidFromIdToken(idToken: string): string | null {
  if (!idToken || typeof idToken !== 'string') return null;
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  try {
    // Base64url → base64 → buffer → JSON
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const json = Buffer.from(padded, 'base64').toString('utf-8');
    const payload = JSON.parse(json);
    // Firebase ID token: uid ở field `user_id` (legacy) hoặc `sub` (standard JWT).
    const uid = typeof payload?.user_id === 'string' ? payload.user_id
      : typeof payload?.sub === 'string' ? payload.sub
      : null;
    return uid;
  } catch {
    return null;
  }
}
