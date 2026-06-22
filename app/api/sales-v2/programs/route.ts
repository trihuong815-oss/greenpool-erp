// V7 Promo (2026-06-18)
// GET  /api/sales-v2/programs?month=YYYY-MM&branchId=X&status=...   list
// POST /api/sales-v2/programs                                        create (QLCS only)
//
// Scope read:
//   - QLCS: programs của BRANCH MÌNH
//   - GD_KD/GD_VP/CEO/ADMIN/TP_KE: all
//   - NV_KE: programs của BRANCH MÌNH (để cấu hình mã)
//   - Khác: deny
// Scope write (POST):
//   - QLCS_xxx: tạo cho BRANCH mình (branchId phải match facility_id)

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { isBranchId } from '@/lib/branches';
import { serializeProgram, resolvePackageNames, currentMonthVN } from '@/lib/sales-v2/programs';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import type { PromoType, SalesProgramCreateInput } from '@/lib/types/sales-program';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_PROMO_TYPES: ReadonlyArray<PromoType> = ['percent', 'fixed_amount', 'bonus_sessions', 'bonus_days'];

function isProgramReader(roleCode: string): boolean {
  // PR-PROMO1B (2026-06-23): + TP_GS đọc read-only (giám sát workflow KM).
  // KHÔNG mở quyền write/approve/configure — các helper riêng vẫn deny TP_GS.
  if (['CEO', 'ADMIN', 'CHU_TICH', 'GD_KD', 'GD_VP', 'TP_KE', 'TP_GS'].includes(roleCode)) return true;
  if (roleCode.startsWith('QLCS_')) return true;
  if (roleCode === 'NV_KE') return true;
  return false;
}
function isProgramCreator(roleCode: string): boolean {
  return roleCode.startsWith('QLCS_');
}
function scopeBranchForCaller(profile: any): string | null {
  // QLCS + NV_KE chỉ thấy branch của mình. Top role thấy all (null = no filter).
  const role = String(profile.role_code ?? '');
  if (role.startsWith('QLCS_') || role === 'NV_KE') return profile.facility_id ?? null;
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const role = String(caller.profile.role_code ?? '');
    if (!isProgramReader(role)) {
      return NextResponse.json({ error: 'Không có quyền xem chương trình' }, { status: 403 });
    }
    const qs = req.nextUrl.searchParams;
    const monthParam = qs.get('month');
    const branchParam = qs.get('branchId');
    const statusParam = qs.get('status');

    const db = getFirebaseAdminDb();
    // Single where(month) để tránh composite index; filter branch/status client-side.
    const month = monthParam ?? currentMonthVN();
    const snap = await db.collection(COLLECTIONS.SALES_PROGRAMS)
      .where('month', '==', month)
      .limit(500)
      .get();

    const scopeBranch = scopeBranchForCaller(caller.profile);
    const programs = snap.docs
      .map((d) => serializeProgram(d.id, d.data()))
      .filter((p) => {
        if (scopeBranch && p.branchId !== scopeBranch) return false;
        if (branchParam && p.branchId !== branchParam) return false;
        if (statusParam && p.status !== statusParam) return false;
        return true;
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return NextResponse.json({ ok: true, month, programs });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[sales-v2/programs] GET error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const role = String(caller.profile.role_code ?? '');
    if (!isProgramCreator(role)) {
      return NextResponse.json({ error: 'Chỉ QLCS được tạo chương trình' }, { status: 403 });
    }
    const body = (await req.json().catch(() => null)) as Partial<SalesProgramCreateInput> | null;
    if (!body) return NextResponse.json({ error: 'Body không hợp lệ' }, { status: 400 });

    const name = String(body.name ?? '').trim().slice(0, 200);
    const description = String(body.description ?? '').trim().slice(0, 1000);
    const month = String(body.month ?? '');
    const branchId = body.branchId as string;
    const packageIds = Array.isArray(body.packageIds) ? body.packageIds.map(String) : [];
    const promoType = body.promoType as PromoType;
    const promoValue = Number(body.promoValue ?? 0);

    if (!name) return NextResponse.json({ error: 'Thiếu tên chương trình' }, { status: 400 });
    if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: 'Tháng không hợp lệ (YYYY-MM)' }, { status: 400 });
    if (!isBranchId(branchId)) return NextResponse.json({ error: 'Cơ sở không hợp lệ' }, { status: 400 });
    // QLCS_HM chỉ tạo cho HM, ...
    const callerBranch = caller.profile.facility_id;
    if (callerBranch && branchId !== callerBranch) {
      return NextResponse.json({ error: 'QLCS chỉ tạo được chương trình cho cơ sở của mình' }, { status: 403 });
    }
    if (!VALID_PROMO_TYPES.includes(promoType)) return NextResponse.json({ error: 'Loại khuyến mãi không hợp lệ' }, { status: 400 });

    // Validate value theo type
    if (!Number.isFinite(promoValue) || promoValue <= 0) {
      return NextResponse.json({ error: 'Giá trị khuyến mãi phải > 0' }, { status: 400 });
    }
    if (promoType === 'percent' && promoValue > 100) {
      return NextResponse.json({ error: 'Giảm % không thể > 100' }, { status: 400 });
    }

    // Validate packageIds — chỉ chấp gói thuộc đúng branch + active
    const validatedNames: string[] = [];
    const validatedIds: string[] = [];
    if (packageIds.length > 0) {
      const db = getFirebaseAdminDb();
      // Limit max 30 gói trong 1 program (tránh doc quá lớn)
      if (packageIds.length > 30) {
        return NextResponse.json({ error: 'Tối đa 30 gói trong 1 chương trình' }, { status: 400 });
      }
      const refs = packageIds.map((id) => db.collection(COLLECTIONS.PACKAGES).doc(id));
      const docs = await db.getAll(...refs);
      for (let i = 0; i < docs.length; i++) {
        const d = docs[i];
        if (!d.exists) {
          return NextResponse.json({ error: `Gói ${packageIds[i]} không tồn tại` }, { status: 400 });
        }
        const data = d.data() ?? {};
        if (data.branchId !== branchId) {
          return NextResponse.json({ error: `Gói "${data.name}" không thuộc cơ sở ${branchId}` }, { status: 400 });
        }
        if (data.active !== true) {
          return NextResponse.json({ error: `Gói "${data.name}" đang tắt` }, { status: 400 });
        }
        // bonus_sessions chỉ áp cho gói PT (isCustomQuantity=true)
        if (promoType === 'bonus_sessions' && data.isCustomQuantity !== true) {
          return NextResponse.json({ error: `"Tặng buổi" chỉ áp dụng cho gói PT (theo buổi). Gói "${data.name}" không phải PT` }, { status: 400 });
        }
        validatedIds.push(d.id);
        validatedNames.push(String(data.name ?? ''));
      }
    }

    // Branch name
    const db = getFirebaseAdminDb();
    const branchDoc = await db.collection(COLLECTIONS.BRANCHES).doc(branchId).get();
    const branchName = branchDoc.exists ? String(branchDoc.data()?.name ?? branchId) : branchId;

    const now = Timestamp.now();
    const ref = db.collection(COLLECTIONS.SALES_PROGRAMS).doc();
    const data = {
      name, description, month,
      branchId, branchName,
      packageIds: validatedIds,
      packageNames: validatedNames,
      promoType, promoValue,
      promoCode: null,
      status: 'draft',
      createdBy: caller.profile.uid,
      createdByName: caller.actorName,
      createdByRole: role,
      createdAt: now,
      submittedAt: null,
      approverChain: [],
      approverChainNames: [],
      currentApprover: null,
      approvalSteps: [],
      rejectedReason: null,
      configuredBy: null,
      configuredByName: null,
      configuredAt: null,
      pausedBy: null,
      pausedAt: null,
      pauseReason: null,
      usageCount: 0,
      totalDiscount: 0,
      totalBonusSessions: 0,
      totalBonusDays: 0,
      updatedAt: now,
    };
    await ref.set(data);

    await writeAuditLog({
      action: 'create_sales_program',
      module: 'sales',
      userId: caller.profile.uid,
      branchId,
      before: null,
      after: { id: ref.id, name, month, promoType, promoValue },
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      source: 'api',
    });

    return NextResponse.json({ ok: true, program: serializeProgram(ref.id, data) });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[sales-v2/programs] POST error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
