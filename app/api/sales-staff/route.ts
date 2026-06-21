// POST /api/sales-staff  body: { branchId, fullName, roleId? }
//   Tạo nhanh 1 sale user (NV_SALE Member hoặc NV_SALE_PT) gắn vào branch chỉ định.
//   Admin only (CEO/GD_KD/GD_VP). Email auto-gen, password mặc định Greenpool@2026.
//   Idempotent: nếu email đã tồn tại → trả lỗi 409.
//   roleId mặc định 'NV_SALE'. 'NV_SALE_PT' chỉ chấp nhận cho cơ sở 24 (Sale PT Gym).
//
// GET /api/sales-staff?branchId=X
//   PR-TK3B (2026-06-21): list active Sale (NV_SALE + NV_SALE_PT) thuộc 1 cơ sở.
//   Dùng cho form nhập staffTargets trong tab "Chỉ tiêu" /tong-ket.
//   Permission:
//     - Top role (ADMIN/CEO/CHU_TICH/GD_KD/GD_VP/TP_KE/TP_GS): xem mọi branch
//     - QLCS: chỉ branch mình
//     - Sale/NV_KE/khác: 403

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb, getFirebaseAdminAuth } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { isAdmin, isTP, isQLCS } from '@/lib/firebase/checklist-scope';
import { isSaleRole } from '@/lib/sales-roles';

const ALLOWED_BRANCH_IDS = new Set(['HM', 'TK', 'CTT', '24', 'TT']);
const DEFAULT_PASSWORD = 'Greenpool@2026';
const EMAIL_DOMAIN = 'greenpool.vn';

function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase();
}

// PR-TK3B (2026-06-21) — GET ?branchId=X — list active Sale per branch
export async function GET(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const branchId = req.nextUrl.searchParams.get('branchId') ?? '';
    if (!ALLOWED_BRANCH_IDS.has(branchId)) {
      return NextResponse.json({ error: 'branchId không hợp lệ' }, { status: 400 });
    }

    // Permission: top role (admin+TP) cross-branch; QLCS own branch only
    const p = caller.profile;
    const isTopReader = isAdmin(p) || isTP(p);
    const isQlcsOwn = isQLCS(p) && p.facility_id === branchId;
    if (!isTopReader && !isQlcsOwn) {
      return NextResponse.json({ error: 'Không có quyền xem danh sách Sale' }, { status: 403 });
    }

    const db = getFirebaseAdminDb();
    const snap = await db.collection(COLLECTIONS.USERS)
      .where('branchId', '==', branchId)
      .where('status', '==', 'active')
      .get();

    const sales = snap.docs
      .map((d) => {
        const data = d.data();
        return {
          uid: d.id,
          displayName: String(data.displayName ?? ''),
          email: String(data.email ?? ''),
          roleId: String(data.roleId ?? ''),
          branchId: String(data.branchId ?? ''),
        };
      })
      .filter((u) => isSaleRole(u.roleId))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'vi'));

    return NextResponse.json({ ok: true, branchId, sales });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[sales-staff GET]', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    if (!isAdmin(caller.profile)) {
      return NextResponse.json({ error: 'Chỉ admin (CEO/GĐ Khối) được quản lý sale' }, { status: 403 });
    }

    const body = await req.json();
    const branchId: string = String(body?.branchId ?? '').trim();
    const fullName: string = String(body?.fullName ?? '').trim();
    const roleIdRaw = body?.roleId;
    // Cơ sở 24 có 2 loại Sale → bắt buộc client phải truyền roleId rõ ràng (không default silent
    // để tránh tạo nhầm Member khi user định tạo PT). Cơ sở khác chỉ NV_SALE → cho phép default.
    if (branchId === '24' && (typeof roleIdRaw !== 'string' || !roleIdRaw.trim())) {
      return NextResponse.json({
        error: 'Cơ sở 24 NCT có cả Sale Member và Sale PT — vui lòng chỉ định roleId (NV_SALE hoặc NV_SALE_PT).',
      }, { status: 400 });
    }
    const roleId: string = String(roleIdRaw ?? 'NV_SALE').trim();

    if (!ALLOWED_BRANCH_IDS.has(branchId)) {
      return NextResponse.json({ error: 'branchId không hợp lệ' }, { status: 400 });
    }
    if (!isSaleRole(roleId)) {
      return NextResponse.json({ error: 'roleId phải là NV_SALE hoặc NV_SALE_PT' }, { status: 400 });
    }
    // Sale PT (Gym) chỉ áp dụng cho cơ sở 24 (chỉ 24 có dịch vụ dạy PT)
    if (roleId === 'NV_SALE_PT' && branchId !== '24') {
      return NextResponse.json({ error: 'Sale PT Gym chỉ áp dụng cho cơ sở 24 NCT' }, { status: 400 });
    }
    if (!fullName || fullName.length < 2 || fullName.length > 100) {
      return NextResponse.json({ error: 'Họ tên 2-100 ký tự' }, { status: 400 });
    }

    const slug = slugify(fullName);
    if (!slug) {
      return NextResponse.json({ error: 'Họ tên không hợp lệ (không tạo được email)' }, { status: 400 });
    }
    // Email suffix: branchId (vd 'nguyena.24@greenpool.vn') cho Member; thêm '.pt' cho PT để tránh trùng
    // (vd 'nguyena.24.pt@greenpool.vn')
    const emailSuffix = roleId === 'NV_SALE_PT' ? `${branchId.toLowerCase()}.pt` : branchId.toLowerCase();
    const email = `${slug}.${emailSuffix}@${EMAIL_DOMAIN}`;

    const auth = getFirebaseAdminAuth();
    // Check duplicate email
    try {
      const existing = await auth.getUserByEmail(email);
      // Email tồn tại — refuse to overwrite từ endpoint này
      return NextResponse.json({
        error: `Email ${email} đã tồn tại (uid=${existing.uid}). Đổi tên để tránh trùng, hoặc reactivate qua /users.`,
      }, { status: 409 });
    } catch { /* not found → OK to create */ }

    const created = await auth.createUser({
      email,
      password: DEFAULT_PASSWORD,
      displayName: fullName,
      emailVerified: true,
    });
    await auth.setCustomUserClaims(created.uid, {
      role: roleId,
      branchId,
      departmentId: null,
    });

    const db = getFirebaseAdminDb();
    const now = new Date();
    const branchName = {
      HM:  'Green Pool Hoàng Mai',
      TK:  'Green Pool 20 Thuỵ Khuê',
      CTT: 'Green Pool Cung Thể Thao MĐ',
      '24': 'Green Pool 24 NCT',
      TT:  'Green Pool Thanh Trì',
    }[branchId] ?? branchId;

    await db.collection(COLLECTIONS.USERS).doc(created.uid).set({
      email,
      displayName: fullName,
      roleId,
      branchId,
      branchName,
      departmentId: null,
      departmentName: null,
      phone: null,
      status: 'active',
      isProbation: false,
      blockId: 'KD',
      roleLevel: 5,
      createdAt: now,
      createdBy: caller.profile.uid,
      updatedAt: now,
      updatedBy: caller.profile.uid,
    });

    await writeAuditLog({
      action: 'create_sales_staff',
      module: 'sales',
      userId: caller.profile.uid,
      branchId,
      before: null,
      after: { uid: created.uid, email, fullName, roleId },
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      source: 'api',
    });

    return NextResponse.json({
      uid: created.uid,
      email,
      fullName,
      branchId,
      defaultPassword: DEFAULT_PASSWORD,
    });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[sales-staff POST]', e?.code, e?.message);
    return NextResponse.json({ error: 'Lỗi server: ' + (e?.message ?? 'unknown'), code: e?.code }, { status: 500 });
  }
}
