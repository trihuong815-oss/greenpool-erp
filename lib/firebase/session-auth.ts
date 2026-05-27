// Server-side Firebase session cookie helpers.
// Replace Supabase session cho mọi page/middleware/API route từ Phase 4.D.

import 'server-only';
import { cookies } from 'next/headers';
import { getFirebaseAdminAuth } from './admin';
import type { DecodedIdToken } from 'firebase-admin/auth';

export const SESSION_COOKIE = 'gp_session';
export const SESSION_TTL_DAYS = 14;
export const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

export interface CurrentUser {
  uid: string;
  email: string | undefined;
  role: string | null;       // custom claim
  branchId: string | null;   // custom claim
  departmentId: string | null;
}

// Đọc session cookie từ headers, verify, trả về user nếu hợp lệ.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const c = await cookies();
  const cookie = c.get(SESSION_COOKIE)?.value;
  if (!cookie) return null;
  try {
    const decoded: DecodedIdToken = await getFirebaseAdminAuth().verifySessionCookie(cookie, true);
    return {
      uid: decoded.uid,
      email: decoded.email,
      role: (decoded.role as string | undefined) ?? null,
      branchId: (decoded.branchId as string | undefined) ?? null,
      departmentId: (decoded.departmentId as string | undefined) ?? null,
    };
  } catch {
    return null;
  }
}
