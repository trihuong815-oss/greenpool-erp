// V8 Reception (2026-06-18)
// GET /api/sales-v2/reception/pricing?branchId=X    — read đơn giá quầy lễ tân cơ sở
// PUT /api/sales-v2/reception/pricing                — admin set đơn giá (ADMIN/CEO/TP_KE)
//
// Pricing per-branch: vé lẻ 4 cơ sở khác có 1 mục; CTT có 3 mục (trong/ngoài/lặn).
// Categories không cần unitPrice (đồ bơi/đồ ăn/khác/bảo lưu) KHÔNG lưu key trong prices.

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { isBranchId } from '@/lib/branches';
import { serializePricing } from '@/lib/sales-v2/reception';
import { categoryHasUnitPrice, type ReceptionCategory } from '@/lib/types/sales-reception';
import { writeAuditLog } from '@/lib/firebase/audit-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function canRead(roleCode: string, callerBranch: string | null | undefined, targetBranch: string): boolean {
  if (['CEO', 'ADMIN', 'CHU_TICH', 'GD_KD', 'GD_VP', 'TP_KE'].includes(roleCode)) return true;
  if (roleCode === 'NV_KE' || roleCode.startsWith('QLCS_')) return callerBranch === targetBranch;
  return false;
}
function canWrite(roleCode: string): boolean {
  // Admin / CEO / TP_KE được set đơn giá toàn hệ thống.
  return ['CEO', 'ADMIN', 'TP_KE'].includes(roleCode);
}

export async function GET(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const branchId = req.nextUrl.searchParams.get('branchId');
    if (!branchId || !isBranchId(branchId)) {
      return NextResponse.json({ error: 'branchId không hợp lệ' }, { status: 400 });
    }
    if (!canRead(String(caller.profile.role_code), caller.profile.facility_id, branchId)) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const db = getFirebaseAdminDb();
    const doc = await db.collection(COLLECTIONS.SALES_RECEPTION_PRICING).doc(branchId).get();
    if (!doc.exists) {
      // Chưa setup → trả default rỗng (UI hiện hint "admin setup").
      return NextResponse.json({
        ok: true,
        pricing: { id: branchId, branchId, branchName: '', prices: {}, updatedBy: '', updatedByName: '', updatedAt: new Date().toISOString() },
        exists: false,
      });
    }
    return NextResponse.json({ ok: true, pricing: serializePricing(doc.id, doc.data() ?? {}), exists: true });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[reception/pricing] GET error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    if (!canWrite(String(caller.profile.role_code))) {
      return NextResponse.json({ error: 'Chỉ ADMIN / CEO / TP_KE được cập nhật đơn giá quầy lễ tân' }, { status: 403 });
    }
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body không hợp lệ' }, { status: 400 });
    }
    const branchId = String(body.branchId ?? '');
    if (!isBranchId(branchId)) {
      return NextResponse.json({ error: 'branchId không hợp lệ' }, { status: 400 });
    }
    const inputPrices = (body.prices && typeof body.prices === 'object') ? body.prices : {};
    // Validate: chỉ chấp keys có categoryHasUnitPrice, value finite >= 0
    const prices: Partial<Record<ReceptionCategory, number>> = {};
    for (const [k, v] of Object.entries(inputPrices)) {
      const cat = k as ReceptionCategory;
      if (!categoryHasUnitPrice(cat)) continue;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) continue;
      prices[cat] = n;
    }

    const db = getFirebaseAdminDb();
    const branchDoc = await db.collection(COLLECTIONS.BRANCHES).doc(branchId).get();
    const branchName = branchDoc.exists ? String(branchDoc.data()?.name ?? branchId) : branchId;

    const now = Timestamp.now();
    const ref = db.collection(COLLECTIONS.SALES_RECEPTION_PRICING).doc(branchId);
    const old = await ref.get();
    const before = old.exists ? (old.data()?.prices ?? null) : null;
    await ref.set({
      branchId, branchName, prices,
      updatedBy: caller.profile.uid,
      updatedByName: caller.actorName,
      updatedAt: now,
    }, { merge: true });

    await writeAuditLog({
      action: 'update_reception_pricing',
      module: 'sales',
      userId: caller.profile.uid,
      branchId,
      before,
      after: prices,
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      source: 'api',
    });

    const newDoc = await ref.get();
    return NextResponse.json({ ok: true, pricing: serializePricing(newDoc.id, newDoc.data() ?? {}) });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[reception/pricing] PUT error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
