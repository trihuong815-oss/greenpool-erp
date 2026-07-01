// GET /api/debug/whoami
//
// PR-USER-ACCESS-DIAGNOSTIC (2026-07-01) — Diagnose why user X can/can't access pages.
// Returns full state of session + Firestore user doc + verify errors, for the
// CURRENTLY LOGGED IN user OR (if ADMIN caller) any target uid/email.
//
// Auth:
//   - Base: current session cookie
//   - ADMIN caller can pass ?uid=<uid> or ?email=<email> to inspect ANY user
//
// Response (200):
//   {
//     caller: { uid, email, role, canQueryOthers },
//     target: {
//       lookedUp: 'self' | 'uid' | 'email',
//       firebaseAuth: { exists, uid, email, disabled, emailVerified, providerData, customClaims },
//       firestoreUser: { exists, id, data (with sensitive fields), validation: {ok, issues, hints} },
//       canAccessRoute: { users, tong-ket, dashboard, ... },   // routes we care about
//       diagnosis: [ ...human-readable findings ],
//     }
//   }
//
// Read-only. Zero writes. Never modifies data.

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminAuth, getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getCurrentUser } from '@/lib/firebase/session-auth';
import { isTopAdmin, canAccessRoute } from '@/lib/permissions';
import { validateUserConfig } from '@/lib/auth/canonical-roles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTES_TO_CHECK = ['users', 'tong-ket', 'dashboard', 'doanh-so-v2/tong-ket', 'giao-viec', 'ky-thuat'];

export async function GET(req: NextRequest) {
  try {
    // 1. Load caller
    const caller = await getCurrentUser();
    if (!caller) {
      return NextResponse.json(
        {
          error: 'Chưa đăng nhập',
          hint: 'Cookie gp_session missing hoặc invalid. Đăng nhập lại rồi thử.',
        },
        { status: 401 },
      );
    }

    // 2. Determine target
    const uidParam = req.nextUrl.searchParams.get('uid');
    const emailParam = req.nextUrl.searchParams.get('email');
    const wantsOtherUser = !!(uidParam || emailParam);

    if (wantsOtherUser && !isTopAdmin(caller.role ?? '')) {
      return NextResponse.json(
        { error: 'Chỉ ADMIN/CEO được query user khác' },
        { status: 403 },
      );
    }

    // 3. Resolve target uid
    let targetUid: string;
    let lookedUp: 'self' | 'uid' | 'email' = 'self';
    const auth = getFirebaseAdminAuth();

    if (uidParam) {
      targetUid = uidParam;
      lookedUp = 'uid';
    } else if (emailParam) {
      try {
        const u = await auth.getUserByEmail(emailParam.trim().toLowerCase());
        targetUid = u.uid;
        lookedUp = 'email';
      } catch (err) {
        return NextResponse.json({
          caller: { uid: caller.uid, email: caller.email, role: caller.role },
          target: {
            lookedUp: 'email',
            firebaseAuth: {
              exists: false,
              lookupError: (err as Error)?.message ?? 'unknown',
            },
            firestoreUser: { exists: false },
            diagnosis: [`Email '${emailParam}' KHÔNG tồn tại ở Firebase Auth.`],
          },
        });
      }
    } else {
      targetUid = caller.uid;
    }

    const db = getFirebaseAdminDb();
    const diagnosis: string[] = [];

    // 4. Firebase Auth side
    let firebaseAuthInfo: Record<string, unknown> = {};
    try {
      const authUser = await auth.getUser(targetUid);
      firebaseAuthInfo = {
        exists: true,
        uid: authUser.uid,
        email: authUser.email,
        disabled: authUser.disabled,
        emailVerified: authUser.emailVerified,
        displayName: authUser.displayName,
        customClaims: authUser.customClaims ?? {},
        providerIds: authUser.providerData.map((p) => p.providerId),
        lastSignInTime: authUser.metadata.lastSignInTime,
        creationTime: authUser.metadata.creationTime,
      };
      if (authUser.disabled) {
        diagnosis.push('❌ Firebase Auth user DISABLED — login sẽ fail. Enable qua admin.updateUser({disabled:false}).');
      }
      if (!authUser.customClaims?.role) {
        diagnosis.push('⚠️ Firebase Auth customClaims KHÔNG có role — session cookie sẽ thiếu role trong decoded token. Update qua admin.setCustomUserClaims.');
      }
    } catch (err) {
      firebaseAuthInfo = {
        exists: false,
        error: (err as Error)?.message ?? 'unknown',
      };
      diagnosis.push('❌ Firebase Auth user KHÔNG tồn tại — login KHÔNG thể xảy ra.');
    }

    // 5. Firestore user doc
    let firestoreInfo: Record<string, unknown> = {};
    const userDocSnap = await db.collection(COLLECTIONS.USERS).doc(targetUid).get();
    if (!userDocSnap.exists) {
      firestoreInfo = { exists: false };
      diagnosis.push('❌ Firestore users/{uid} doc KHÔNG tồn tại — getCurrentProfile sẽ trả null → redirect /login (loop).');
    } else {
      const d = userDocSnap.data()!;
      const validation = validateUserConfig({
        roleCode: d.roleId as string | null | undefined,
        branchId: d.branchId as string | null | undefined,
        status: d.status as string | null | undefined,
      });
      firestoreInfo = {
        exists: true,
        id: userDocSnap.id,
        email: d.email,
        displayName: d.displayName,
        roleId: d.roleId,
        branchId: d.branchId,
        departmentId: d.departmentId,
        status: d.status,
        blockId: d.blockId,
        roleLevel: d.roleLevel,
        menuOverrides: d.menuOverrides ?? {},
        createdAt: d.createdAt ?? null,
        updatedAt: d.updatedAt ?? null,
        validation,
      };
      if (d.status === 'inactive') {
        diagnosis.push('❌ users/{uid}.status = "inactive" — getCurrentProfile trả null → redirect /login.');
      }
      if (!d.roleId) {
        diagnosis.push('❌ users/{uid}.roleId RỖNG — canAccessRoute fail cho mọi route → "Không có quyền" hoặc redirect.');
      }
      if (!validation.ok) {
        diagnosis.push(`❌ Config validation fail: ${validation.hints.join(' ')}`);
      }
    }

    // 6. Route access check
    const roleCode = (firestoreInfo.roleId as string | undefined) ?? '';
    const menuOverrides = (firestoreInfo.menuOverrides as Record<string, boolean> | undefined) ?? {};
    const routeAccess: Record<string, boolean> = {};
    for (const route of ROUTES_TO_CHECK) {
      routeAccess[route] = canAccessRoute(roleCode, route, menuOverrides);
    }

    if (!routeAccess['users']) {
      diagnosis.push(`ℹ️ Role '${roleCode || '(empty)'}' KHÔNG có quyền /users → sẽ thấy "Không có quyền truy cập" card (không phải redirect).`);
    }

    return NextResponse.json({
      caller: {
        uid: caller.uid,
        email: caller.email,
        role: caller.role,
        canQueryOthers: isTopAdmin(caller.role ?? ''),
      },
      target: {
        lookedUp,
        targetUid,
        firebaseAuth: firebaseAuthInfo,
        firestoreUser: firestoreInfo,
        canAccessRoute: routeAccess,
        diagnosis,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error)?.message ?? 'Internal error' },
      { status: 500 },
    );
  }
}
