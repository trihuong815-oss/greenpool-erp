// V7 Promo (2026-06-18)
// GET    /api/sales-v2/programs/[id]   chi tiết 1 program
// PATCH  /api/sales-v2/programs/[id]   sửa khi status='draft' hoặc 'rejected' (QLCS only)
// DELETE /api/sales-v2/programs/[id]   xoá khi status='draft' (QLCS only; usageCount=0)

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { serializeProgram } from '@/lib/sales-v2/programs';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import type { PromoType } from '@/lib/types/sales-program';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_PROMO_TYPES: ReadonlyArray<PromoType> = ['percent', 'fixed_amount', 'bonus_sessions', 'bonus_days'];

function canRead(role: string, branchOfProgram: string, callerFacility: string | null | undefined): boolean {
  if (['CEO', 'ADMIN', 'CHU_TICH', 'GD_KD', 'GD_VP', 'TP_KE'].includes(role)) return true;
  if (role.startsWith('QLCS_') || role === 'NV_KE') return callerFacility === branchOfProgram;
  return false;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const caller = await getAuthedCaller();
    const db = getFirebaseAdminDb();
    const doc = await db.collection(COLLECTIONS.SALES_PROGRAMS).doc(id).get();
    if (!doc.exists) return NextResponse.json({ error: 'Không tìm thấy chương trình' }, { status: 404 });
    const data = doc.data() ?? {};
    if (!canRead(String(caller.profile.role_code), String(data.branchId), caller.profile.facility_id)) {
      return NextResponse.json({ error: 'Không có quyền xem' }, { status: 403 });
    }
    return NextResponse.json({ ok: true, program: serializeProgram(doc.id, data) });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[sales-v2/programs/[id]] GET error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}

const EDITABLE_FIELDS = new Set(['name', 'description', 'packageIds', 'promoType', 'promoValue']);

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const caller = await getAuthedCaller();
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Body không hợp lệ' }, { status: 400 });

    const db = getFirebaseAdminDb();
    const ref = db.collection(COLLECTIONS.SALES_PROGRAMS).doc(id);
    const doc = await ref.get();
    if (!doc.exists) return NextResponse.json({ error: 'Không tìm thấy chương trình' }, { status: 404 });
    const current = doc.data() ?? {};

    // Chỉ creator (QLCS) sửa được + chỉ khi draft/rejected
    if (current.createdBy !== caller.profile.uid) {
      return NextResponse.json({ error: 'Chỉ người tạo (QLCS) mới sửa được' }, { status: 403 });
    }
    if (!['draft', 'rejected'].includes(current.status)) {
      return NextResponse.json({ error: `Không thể sửa khi status="${current.status}"` }, { status: 400 });
    }

    const updates: Record<string, any> = {};
    for (const [k, v] of Object.entries(body)) {
      if (!EDITABLE_FIELDS.has(k)) continue;
      updates[k] = v;
    }

    if ('name' in updates) {
      const n = String(updates.name ?? '').trim().slice(0, 200);
      if (!n) return NextResponse.json({ error: 'Tên không được rỗng' }, { status: 400 });
      updates.name = n;
    }
    if ('description' in updates) {
      updates.description = String(updates.description ?? '').trim().slice(0, 1000);
    }
    if ('promoType' in updates) {
      if (!VALID_PROMO_TYPES.includes(updates.promoType)) {
        return NextResponse.json({ error: 'Loại khuyến mãi không hợp lệ' }, { status: 400 });
      }
    }
    if ('promoValue' in updates) {
      const n = Number(updates.promoValue);
      if (!Number.isFinite(n) || n <= 0) return NextResponse.json({ error: 'Giá trị phải > 0' }, { status: 400 });
      const finalType = updates.promoType ?? current.promoType;
      if (finalType === 'percent' && n > 100) {
        return NextResponse.json({ error: 'Giảm % không thể > 100' }, { status: 400 });
      }
      updates.promoValue = n;
    }
    if ('packageIds' in updates) {
      const ids = Array.isArray(updates.packageIds) ? updates.packageIds.map(String) : [];
      if (ids.length > 30) return NextResponse.json({ error: 'Tối đa 30 gói' }, { status: 400 });
      const branchId = current.branchId;
      const finalType = updates.promoType ?? current.promoType;
      const names: string[] = [];
      if (ids.length > 0) {
        const refs = ids.map((pid: string) => db.collection(COLLECTIONS.PACKAGES).doc(pid));
        const pkgs = await db.getAll(...refs);
        for (let i = 0; i < pkgs.length; i++) {
          const d = pkgs[i];
          if (!d.exists) return NextResponse.json({ error: `Gói ${ids[i]} không tồn tại` }, { status: 400 });
          const data = d.data() ?? {};
          if (data.branchId !== branchId) {
            return NextResponse.json({ error: `Gói "${data.name}" không thuộc cơ sở` }, { status: 400 });
          }
          if (data.active !== true) {
            return NextResponse.json({ error: `Gói "${data.name}" đang tắt` }, { status: 400 });
          }
          if (finalType === 'bonus_sessions' && data.isCustomQuantity !== true) {
            return NextResponse.json({ error: `"Tặng buổi" chỉ áp gói PT. Gói "${data.name}" không phải PT` }, { status: 400 });
          }
          names.push(String(data.name ?? ''));
        }
      }
      updates.packageIds = ids;
      updates.packageNames = names;
    }

    // Khi resubmit từ rejected → reset status về draft (QLCS phải submit lại)
    if (current.status === 'rejected') {
      updates.status = 'draft';
      updates.rejectedReason = null;
    }

    updates.updatedAt = Timestamp.now();
    await ref.update(updates);

    await writeAuditLog({
      action: 'update_sales_program',
      module: 'sales',
      userId: caller.profile.uid,
      branchId: current.branchId,
      before: Object.fromEntries(Object.keys(updates).map((k) => [k, current[k] ?? null])),
      after: updates,
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      source: 'api',
    });

    const newDoc = await ref.get();
    return NextResponse.json({ ok: true, program: serializeProgram(newDoc.id, newDoc.data() ?? {}) });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[sales-v2/programs/[id]] PATCH error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const caller = await getAuthedCaller();
    const db = getFirebaseAdminDb();
    const ref = db.collection(COLLECTIONS.SALES_PROGRAMS).doc(id);
    const doc = await ref.get();
    if (!doc.exists) return NextResponse.json({ ok: true }); // idempotent
    const data = doc.data() ?? {};
    if (data.createdBy !== caller.profile.uid) {
      return NextResponse.json({ error: 'Chỉ người tạo xoá được' }, { status: 403 });
    }
    if (data.status !== 'draft') {
      return NextResponse.json({ error: 'Chỉ xoá được chương trình "draft"' }, { status: 400 });
    }
    if (Number(data.usageCount ?? 0) > 0) {
      return NextResponse.json({ error: 'Chương trình đã có giao dịch áp dụng — không thể xoá' }, { status: 409 });
    }
    await ref.delete();
    await writeAuditLog({
      action: 'delete_sales_program',
      module: 'sales',
      userId: caller.profile.uid,
      branchId: data.branchId,
      before: { id, name: data.name, month: data.month },
      after: null,
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      source: 'api',
    });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[sales-v2/programs/[id]] DELETE error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
