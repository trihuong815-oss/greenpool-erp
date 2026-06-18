// V7 Promo (2026-06-18)
// POST /api/sales-v2/programs/[id]/configure  body: { promoCode: string }
//   NV_KE / TP_KE set promoCode → status: approved → active.
//   Cho phép đổi mã sau (khi status='active' hoặc 'paused').
//   Promo code: human-readable, unique trong cùng month+branch.

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { serializeProgram } from '@/lib/sales-v2/programs';
import { sendNotificationEvent } from '@/lib/firebase/noti-engine';
import { writeAuditLog } from '@/lib/firebase/audit-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function canConfigure(roleCode: string, callerBranch: string | null | undefined, programBranch: string): boolean {
  if (roleCode === 'TP_KE') return true;
  if (roleCode === 'NV_KE') return callerBranch === programBranch;
  return false;
}

// Mã hợp lệ: 3-20 ký tự, alphanumeric + dấu gạch dưới/gạch nối, uppercase normalize
const CODE_REGEX = /^[A-Z0-9_-]{3,20}$/;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const caller = await getAuthedCaller();
    const body = await req.json().catch(() => null);
    const rawCode = String(body?.promoCode ?? '').trim().toUpperCase();
    if (!CODE_REGEX.test(rawCode)) {
      return NextResponse.json({ error: 'Mã chỉ chứa A-Z, 0-9, _ hoặc - (3-20 ký tự)' }, { status: 400 });
    }

    const db = getFirebaseAdminDb();
    const ref = db.collection(COLLECTIONS.SALES_PROGRAMS).doc(id);
    const doc = await ref.get();
    if (!doc.exists) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    const data = doc.data() ?? {};

    if (!canConfigure(String(caller.profile.role_code), caller.profile.facility_id, String(data.branchId))) {
      return NextResponse.json({ error: 'Chỉ NV_KE cơ sở hoặc TP_KE được cài đặt mã' }, { status: 403 });
    }
    if (!['approved', 'active', 'paused'].includes(data.status)) {
      return NextResponse.json({ error: `Chỉ cài mã khi status approved/active/paused (hiện: ${data.status})` }, { status: 400 });
    }

    // Unique theo month + branch (tránh trùng mã trong cùng cơ sở + tháng)
    const dupSnap = await db.collection(COLLECTIONS.SALES_PROGRAMS)
      .where('month', '==', data.month)
      .where('branchId', '==', data.branchId)
      .where('promoCode', '==', rawCode)
      .get();
    const conflict = dupSnap.docs.find((d) => d.id !== id);
    if (conflict) {
      return NextResponse.json({
        error: `Mã "${rawCode}" đã được dùng cho chương trình "${conflict.data()?.name}" trong cùng tháng + cơ sở`,
      }, { status: 409 });
    }

    const now = Timestamp.now();
    const updates: Record<string, any> = {
      promoCode: rawCode,
      configuredBy: caller.profile.uid,
      configuredByName: caller.actorName,
      configuredAt: now,
      updatedAt: now,
    };
    // Lần đầu set mã (status=approved) → chuyển active. Sau đó giữ active/paused theo cũ.
    if (data.status === 'approved') updates.status = 'active';

    await ref.update(updates);

    await writeAuditLog({
      action: 'configure_sales_program',
      module: 'sales',
      userId: caller.profile.uid,
      branchId: data.branchId,
      before: { promoCode: data.promoCode ?? null, status: data.status },
      after: { promoCode: rawCode, status: updates.status ?? data.status },
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      source: 'api',
    });

    // V7 (2026-06-18) noti creator:
    //  - Lần đầu active: thông báo mã đã set, Sale dùng được.
    //  - Đổi mã sau khi active: thông báo mã cũ → mới (kế toán có thể đổi).
    const isFirstActivation = data.status === 'approved';
    const isCodeChanged = !isFirstActivation && data.promoCode && data.promoCode !== rawCode;
    if (isFirstActivation || isCodeChanged) {
      void sendNotificationEvent({
        type: 'sales_program_active',
        module: 'sales',
        entityId: id,
        title: isFirstActivation
          ? `Chương trình "${data.name}" đã active`
          : `Chương trình "${data.name}" đã đổi mã`,
        message: isFirstActivation
          ? `Mã: ${rawCode}. Sale có thể chọn ở /nhap.`
          : `Mã cũ: ${data.promoCode} → Mã mới: ${rawCode}`,
        linkUrl: `/doanh-so-v2/chuong-trinh?programId=${id}`,
        recipients: [String(data.createdBy)],
        priority: 'low',
        pushTag: `sales-program-${id}`,
        channels: { inApp: true, push: false, email: false },
      });
    }

    const newDoc = await ref.get();
    return NextResponse.json({ ok: true, program: serializeProgram(newDoc.id, newDoc.data() ?? {}) });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[sales-v2/programs/[id]/configure] error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
