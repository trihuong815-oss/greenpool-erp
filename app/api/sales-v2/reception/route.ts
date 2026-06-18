// V8 Reception (2026-06-18)
// GET  /api/sales-v2/reception?branchId=X&date=YYYY-MM-DD  — read batch (today by default)
//   Nếu chưa tồn tại → trả skeleton với entries trống + pricing seed.
// POST /api/sales-v2/reception  body: ReceptionBatchInput
//   Upsert (1 doc/branch/day). finalize=true → status='approved', kèm noti FCM.
//
// Scope:
//   - NV_KE: chỉ branch mình, read + write
//   - TP_KE: all branch, read + write (vd hỗ trợ cơ sở thiếu kế toán)
//   - QLCS / GD_KD / GD_VP / TP_GS / CEO / ADMIN / CHU_TICH: read-only mọi branch

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { isBranchId } from '@/lib/branches';
import {
  serializeBatch, buildEmptyEntries, buildBatchId, computeTotals, getPricing,
} from '@/lib/sales-v2/reception';
import {
  categoriesForBranch, categoryHasUnitPrice, RECEPTION_CATEGORY_LABEL,
  type ReceptionCategory, type ReceptionEntry, type ReceptionBatchInput,
} from '@/lib/types/sales-reception';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { sendNotificationEvent } from '@/lib/firebase/noti-engine';
import type { BranchId } from '@/lib/branches';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const READ_ROLES = new Set([
  'CEO', 'ADMIN', 'CHU_TICH', 'GD_KD', 'GD_VP', 'TP_KE', 'TP_GS', 'NV_KE',
]);
function canRead(roleCode: string, callerBranch: string | null | undefined, targetBranch: string): boolean {
  if (READ_ROLES.has(roleCode)) {
    if (roleCode === 'NV_KE') return callerBranch === targetBranch;
    return true;
  }
  if (roleCode.startsWith('QLCS_')) return callerBranch === targetBranch;
  return false;
}
function canWrite(roleCode: string, callerBranch: string | null | undefined, targetBranch: string): boolean {
  if (roleCode === 'TP_KE') return true;
  if (roleCode === 'NV_KE') return callerBranch === targetBranch;
  return false;
}

function todayInVN(): string {
  const ms = Date.now() + 7 * 3600 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}
function monthFromDate(date: string): string {
  return date.slice(0, 7);
}

export async function GET(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const qs = req.nextUrl.searchParams;
    const branchId = qs.get('branchId');
    const date = qs.get('date') ?? todayInVN();
    if (!branchId || !isBranchId(branchId)) {
      return NextResponse.json({ error: 'branchId không hợp lệ' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'date sai format (YYYY-MM-DD)' }, { status: 400 });
    }
    if (!canRead(String(caller.profile.role_code), caller.profile.facility_id, branchId)) {
      return NextResponse.json({ error: 'Không có quyền xem' }, { status: 403 });
    }

    const db = getFirebaseAdminDb();
    const id = buildBatchId(branchId as BranchId, date);
    const doc = await db.collection(COLLECTIONS.SALES_RECEPTION_BATCHES).doc(id).get();
    if (doc.exists) {
      return NextResponse.json({ ok: true, batch: serializeBatch(doc.id, doc.data() ?? {}), exists: true });
    }
    // Skeleton — entries trống preload theo categories cơ sở + đơn giá pricing nếu có.
    const pricing = await getPricing(branchId as BranchId);
    const branchDoc = await db.collection(COLLECTIONS.BRANCHES).doc(branchId).get();
    const branchName = branchDoc.exists ? String(branchDoc.data()?.name ?? branchId) : branchId;
    const skeleton = {
      id,
      date,
      month: monthFromDate(date),
      branchId,
      branchName,
      status: 'draft' as const,
      entries: buildEmptyEntries(branchId as BranchId, pricing ?? undefined),
      totalCash: 0, totalTransfer: 0, totalCard: 0, totalRevenue: 0,
      note: '',
      enteredBy: '', enteredByName: '',
      enteredAt: new Date().toISOString(),
      approvedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return NextResponse.json({ ok: true, batch: skeleton, exists: false });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[reception] GET error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const body = (await req.json().catch(() => null)) as ReceptionBatchInput | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body không hợp lệ' }, { status: 400 });
    }
    const date = String(body.date ?? '');
    const branchId = String(body.branchId ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'date sai format (YYYY-MM-DD)' }, { status: 400 });
    }
    // S6 audit fix: validate date strict — không cho ngày tương lai, không cho > 60 ngày past.
    const parsed = new Date(date + 'T12:00:00Z'); // noon UTC để tránh DST edge
    if (isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      return NextResponse.json({ error: 'date không hợp lệ (vd 2026-13-45 sai tháng)' }, { status: 400 });
    }
    const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
    if (date > today) {
      return NextResponse.json({ error: 'Không nhập được báo cáo cho ngày tương lai' }, { status: 400 });
    }
    const minDate = new Date(Date.now() + 7 * 3600 * 1000 - 60 * 86400 * 1000).toISOString().slice(0, 10);
    if (date < minDate) {
      return NextResponse.json({ error: `Chỉ nhập được báo cáo trong vòng 60 ngày (từ ${minDate})` }, { status: 400 });
    }
    if (!isBranchId(branchId)) {
      return NextResponse.json({ error: 'branchId không hợp lệ' }, { status: 400 });
    }
    if (!canWrite(String(caller.profile.role_code), caller.profile.facility_id, branchId)) {
      return NextResponse.json({ error: 'Chỉ NV_KE cơ sở hoặc TP_KE được nhập' }, { status: 403 });
    }

    // Validate entries: category phải thuộc cơ sở (CTT có 3 vé, khác có 1)
    const validCategories = new Set<ReceptionCategory>(categoriesForBranch(branchId as BranchId));
    const inputEntries = Array.isArray(body.entries) ? body.entries : [];
    const entries: ReceptionEntry[] = [];
    for (const e of inputEntries) {
      const cat = e?.category as ReceptionCategory;
      if (!validCategories.has(cat)) {
        return NextResponse.json({ error: `Category "${cat}" không hợp lệ cho cơ sở ${branchId}` }, { status: 400 });
      }
      const cash = Math.max(0, Number(e?.cash ?? 0));
      const transfer = Math.max(0, Number(e?.transfer ?? 0));
      const card = Math.max(0, Number(e?.card ?? 0));
      if (!Number.isFinite(cash) || !Number.isFinite(transfer) || !Number.isFinite(card)) {
        return NextResponse.json({ error: `Số tiền của "${RECEPTION_CATEGORY_LABEL[cat]}" không hợp lệ` }, { status: 400 });
      }
      const total = cash + transfer + card;
      const hasPrice = categoryHasUnitPrice(cat);
      const quantity = hasPrice && e?.quantity != null
        ? Math.max(0, Math.floor(Number(e.quantity)))
        : null;
      const unitPrice = hasPrice && e?.unitPrice != null
        ? Math.max(0, Number(e.unitPrice))
        : null;
      entries.push({
        category: cat,
        label: RECEPTION_CATEGORY_LABEL[cat],
        quantity, unitPrice,
        cash, transfer, card, total,
        note: e?.note ? String(e.note).slice(0, 200) : null,
      });
    }
    // S7 audit fix: auto-fill missing entries dùng pricing default (consistent với GET skeleton).
    const presentCats = new Set(entries.map((e) => e.category));
    const pricingDoc = await getPricing(branchId as BranchId);
    for (const c of validCategories) {
      if (!presentCats.has(c)) {
        const hasPrice = categoryHasUnitPrice(c);
        const seedUnitPrice = hasPrice ? (pricingDoc?.prices?.[c] ?? null) : null;
        entries.push({
          category: c,
          label: RECEPTION_CATEGORY_LABEL[c],
          quantity: hasPrice ? 0 : null,
          unitPrice: seedUnitPrice,
          cash: 0, transfer: 0, card: 0, total: 0,
          note: null,
        });
      }
    }

    const totals = computeTotals(entries);
    const finalize = body.finalize === true;
    const note = String(body.note ?? '').slice(0, 1000);

    const db = getFirebaseAdminDb();
    const id = buildBatchId(branchId as BranchId, date);
    const ref = db.collection(COLLECTIONS.SALES_RECEPTION_BATCHES).doc(id);

    const branchDoc = await db.collection(COLLECTIONS.BRANCHES).doc(branchId).get();
    const branchName = branchDoc.exists ? String(branchDoc.data()?.name ?? branchId) : branchId;

    // S4 + S5 + S9 audit fix: wrap trong transaction để tránh race + preserve enteredBy
    // gốc + chặn re-finalize approved doc bằng cách tick 'Chốt' lần 2.
    type TxResult = {
      isFirstSave: boolean;
      wasApproved: boolean;
      finalData: Record<string, any>;
    };
    let txResult: TxResult;
    try {
      txResult = await db.runTransaction<TxResult>(async (tx) => {
        const old = await tx.get(ref);
        const wasApproved = old.exists && old.data()?.status === 'approved';
        const isFirstSave = !old.exists;

        // S9: chặn mọi ghi đè khi doc đã approved (kể cả finalize=true lần 2).
        // Muốn sửa → TP_KE/admin phải reset status qua endpoint riêng (Phase 2 sẽ thêm).
        if (wasApproved) {
          throw new Error('Báo cáo đã chốt — không sửa hoặc tick lại được. Liên hệ TP_KE để reset.');
        }

        const now = Timestamp.now();
        // S5: preserve enteredBy + enteredByName lần đầu (ai tạo bản gốc).
        // updatedBy track ai sửa lần cuối.
        const finalData: Record<string, any> = {
          date, month: monthFromDate(date),
          branchId, branchName,
          status: finalize ? 'approved' : 'draft',
          entries,
          ...totals,
          note,
          // First-save → enteredBy = caller. Re-save → giữ enteredBy cũ.
          enteredBy: isFirstSave ? caller.profile.uid : (old.data()?.enteredBy ?? caller.profile.uid),
          enteredByName: isFirstSave ? caller.actorName : (old.data()?.enteredByName ?? caller.actorName),
          enteredAt: isFirstSave ? now : (old.data()?.enteredAt ?? now),
          // updatedBy track ai sửa lần cuối — Phase 2 sẽ hiển thị
          updatedBy: caller.profile.uid,
          updatedByName: caller.actorName,
          approvedAt: finalize ? now : null,
          approvedBy: finalize ? caller.profile.uid : null,
          approvedByName: finalize ? caller.actorName : null,
          updatedAt: now,
        };
        if (isFirstSave) finalData.createdAt = now;
        tx.set(ref, finalData, { merge: true });
        return { isFirstSave, wasApproved, finalData };
      });
    } catch (txErr: any) {
      const msg = txErr?.message ?? 'Transaction failed';
      const status = msg.includes('đã chốt') ? 409 : 500;
      return NextResponse.json({ error: msg }, { status });
    }
    const { wasApproved } = txResult;

    await writeAuditLog({
      action: finalize ? 'finalize_reception_batch' : 'save_reception_batch',
      module: 'sales',
      userId: caller.profile.uid,
      branchId,
      before: txResult.isFirstSave ? null : { status: 'draft', totalRevenue: 0 },
      after: { status: txResult.finalData.status, totalRevenue: totals.totalRevenue },
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      source: 'api',
    });

    // Noti FCM cho QLCS / TP_KE / TP_GS / GD_KD / GD_VP khi finalize lần đầu.
    // S3 audit fix: KHÔNG force off push/email — để engine xử lý theo user preference
    // (user có thể tắt push module 'sales' qua /bao-mat nếu muốn). priority='low'
    // báo hiệu informational. Phase 2 sẽ dedicated noti type 'reception_finalized'.
    if (finalize && !wasApproved) {
      try {
        const recipients = await collectRecipientsForFinalize(db, branchId as BranchId);
        if (recipients.length > 0) {
          await sendNotificationEvent({
            type: 'sales_batch_approved',
            module: 'sales',
            entityId: id,
            title: `Báo cáo quầy lễ tân ${branchName} ngày ${date} đã chốt`,
            message: `Tổng thu: ${totals.totalRevenue.toLocaleString()}đ (TM ${totals.totalCash.toLocaleString()} · CK ${totals.totalTransfer.toLocaleString()} · Quẹt ${totals.totalCard.toLocaleString()})`,
            linkUrl: `/doanh-so-v2/doi-chieu?date=${date}&branchId=${branchId}`,
            recipients,
            priority: 'low',
            pushTag: `reception-${id}`,
          });
        }
      } catch (notiErr) {
        // Không fail tx vì noti — chỉ log. Audit log đã ghi finalize thành công.
        console.warn('[reception POST] noti finalize failed', notiErr);
      }
    }

    const newDoc = await ref.get();
    return NextResponse.json({ ok: true, batch: serializeBatch(newDoc.id, newDoc.data() ?? {}) });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[reception] POST error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}

/** Recipients cho noti finalize: QLCS branch + TP_KE + TP_GS + GD_KD + GD_VP. */
async function collectRecipientsForFinalize(
  db: FirebaseFirestore.Firestore,
  branchId: BranchId,
): Promise<string[]> {
  const roleSnap = await db.collection(COLLECTIONS.USERS)
    .where('roleId', 'in', ['TP_KE', 'TP_GS', 'GD_KD', 'GD_VP', `QLCS_${branchId === '24' ? '24NCT' : branchId}`])
    .get();
  const recipients: string[] = [];
  roleSnap.forEach((d) => {
    const u = d.data();
    if (u.status && u.status !== 'active') return;
    if (u.excludeFromBusinessNoti === true) return;
    const role = String(u.roleId);
    // QLCS chỉ branch mình; còn lại toàn hệ thống
    if (role.startsWith('QLCS_') && u.branchId !== branchId) return;
    recipients.push(d.id);
  });
  return recipients;
}
