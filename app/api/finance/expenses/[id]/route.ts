// PR-CASH1B (2026-06-23) — Expense detail + update + delete + actions (record/return/void).
// GET    /api/finance/expenses/[id]                    — detail
// PATCH  /api/finance/expenses/[id]                    — update (NV_KE draft/returned)
// PATCH  /api/finance/expenses/[id]?action=record      — draft|returned → recorded (NV_KE)
// PATCH  /api/finance/expenses/[id]?action=return      — recorded → returned (TP_KE, body.reason)
// PATCH  /api/finance/expenses/[id]?action=void        — recorded → voided (TP_KE, body.reason)
// DELETE /api/finance/expenses/[id]                    — chỉ draft (NV_KE creator)

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import {
  canEditExpense,
  canRecordExpense,
  canReturnExpense,
  canVoidExpense,
  canDeleteExpense,
  canReadExpense,
} from '@/lib/finance/expense-permissions';
import {
  VALID_EXPENSE_PAYMENT_METHODS,
  VALID_EXPENSE_CATEGORIES,
  VALID_EXPENSE_BASIS_TYPES,
  type BranchDailyExpenseDoc,
} from '@/lib/finance/expense-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EDITABLE_FIELDS = new Set([
  'voucherNo', 'description', 'amount', 'paymentMethod', 'expenseCategory',
  'counterpartyName', 'counterpartyUnit', 'counterpartyAddress',
  'expenseBasisType', 'expenseBasisRef', 'expenseBasisNote', 'note',
]);

async function loadExpense(id: string): Promise<{ ref: FirebaseFirestore.DocumentReference; data: BranchDailyExpenseDoc } | null> {
  const db = getFirebaseAdminDb();
  const ref = db.collection(COLLECTIONS.BRANCH_DAILY_EXPENSES).doc(id);
  const doc = await ref.get();
  if (!doc.exists) return null;
  return { ref, data: doc.data() as BranchDailyExpenseDoc };
}

// ─── GET detail ────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await getAuthedCaller();
    const role = String(caller.profile.role_code ?? '');
    const callerBranchId = caller.profile.facility_id ?? null;

    const loaded = await loadExpense(id);
    if (!loaded) return NextResponse.json({ error: 'Không tìm thấy phiếu chi' }, { status: 404 });

    if (!canReadExpense(role, callerBranchId, loaded.data)) {
      return NextResponse.json({ error: 'Không có quyền xem phiếu chi này' }, { status: 403 });
    }

    return NextResponse.json({ ok: true, expense: { id, ...loaded.data } });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}

// ─── PATCH update / action ─────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await getAuthedCaller();
    const role = String(caller.profile.role_code ?? '');
    const callerBranchId = caller.profile.facility_id ?? null;

    const action = req.nextUrl.searchParams.get('action');
    const body = (await req.json().catch(() => ({}))) as Record<string, any>;

    const loaded = await loadExpense(id);
    if (!loaded) return NextResponse.json({ error: 'Không tìm thấy phiếu chi' }, { status: 404 });
    const { ref, data: tx } = loaded;

    const now = Timestamp.now();

    // ─── ACTION: record (draft|returned → recorded) ──────────────────
    if (action === 'record') {
      if (!canRecordExpense(role, caller.profile.uid, callerBranchId, tx)) {
        return NextResponse.json({ error: 'Không có quyền record phiếu chi này' }, { status: 403 });
      }
      const updates = {
        status: 'recorded' as const,
        recordedBy: caller.profile.uid,
        recordedAt: now,
        updatedBy: caller.profile.uid,
        updatedAt: now,
      };
      await ref.update(updates);
      void writeAuditLog({
        action: 'record_expense', module: 'finance', userId: caller.profile.uid,
        branchId: tx.branchId, before: { status: tx.status }, after: { status: 'recorded' },
        actorName: caller.actorName, actorRole: role, source: 'api',
      }).catch(() => {});
      return NextResponse.json({ ok: true, status: 'recorded' });
    }

    // ─── ACTION: return (recorded → returned) ────────────────────────
    if (action === 'return') {
      if (!canReturnExpense(role, tx)) {
        return NextResponse.json({ error: 'Không có quyền trả lại phiếu chi' }, { status: 403 });
      }
      const reason = String(body.reason ?? '').trim();
      if (!reason) return NextResponse.json({ error: 'Bắt buộc nhập lý do trả lại' }, { status: 400 });
      const updates = {
        status: 'returned' as const,
        returnedBy: caller.profile.uid,
        returnedAt: now,
        returnReason: reason.slice(0, 500),
        updatedBy: caller.profile.uid,
        updatedAt: now,
      };
      await ref.update(updates);
      void writeAuditLog({
        action: 'return_expense', module: 'finance', userId: caller.profile.uid,
        branchId: tx.branchId, before: { status: tx.status },
        after: { status: 'returned', reason: updates.returnReason },
        actorName: caller.actorName, actorRole: role, source: 'api',
      }).catch(() => {});
      return NextResponse.json({ ok: true, status: 'returned' });
    }

    // ─── ACTION: void (recorded → voided) ────────────────────────────
    if (action === 'void') {
      if (!canVoidExpense(role, tx)) {
        return NextResponse.json({ error: 'Không có quyền hủy phiếu chi' }, { status: 403 });
      }
      const reason = String(body.reason ?? '').trim();
      if (!reason) return NextResponse.json({ error: 'Bắt buộc nhập lý do hủy' }, { status: 400 });
      const updates = {
        status: 'voided' as const,
        voidedBy: caller.profile.uid,
        voidedAt: now,
        voidReason: reason.slice(0, 500),
        updatedBy: caller.profile.uid,
        updatedAt: now,
      };
      await ref.update(updates);
      void writeAuditLog({
        action: 'void_expense', module: 'finance', userId: caller.profile.uid,
        branchId: tx.branchId, before: { status: tx.status },
        after: { status: 'voided', reason: updates.voidReason },
        actorName: caller.actorName, actorRole: role, source: 'api',
      }).catch(() => {});
      return NextResponse.json({ ok: true, status: 'voided' });
    }

    // ─── DEFAULT: field update (NV_KE draft/returned) ────────────────
    if (!canEditExpense(role, caller.profile.uid, callerBranchId, tx)) {
      return NextResponse.json({ error: 'Không có quyền sửa phiếu chi (chỉ creator + draft/returned)' }, { status: 403 });
    }

    const updates: Record<string, any> = {};
    for (const [k, v] of Object.entries(body)) {
      if (!EDITABLE_FIELDS.has(k)) continue;
      updates[k] = v;
    }

    // Sanitize/validate
    if ('voucherNo' in updates) updates.voucherNo = String(updates.voucherNo ?? '').trim();
    if ('description' in updates) updates.description = String(updates.description ?? '').trim().slice(0, 500);
    if ('amount' in updates) {
      const n = Number(updates.amount);
      if (!Number.isFinite(n) || n <= 0) return NextResponse.json({ error: 'Số tiền phải > 0' }, { status: 400 });
      updates.amount = Math.round(n);
    }
    if ('paymentMethod' in updates && !VALID_EXPENSE_PAYMENT_METHODS.has(updates.paymentMethod)) {
      return NextResponse.json({ error: 'paymentMethod không hợp lệ' }, { status: 400 });
    }
    if ('expenseCategory' in updates && !VALID_EXPENSE_CATEGORIES.has(updates.expenseCategory)) {
      return NextResponse.json({ error: 'expenseCategory không hợp lệ' }, { status: 400 });
    }
    if ('expenseBasisType' in updates && !VALID_EXPENSE_BASIS_TYPES.has(updates.expenseBasisType)) {
      return NextResponse.json({ error: 'expenseBasisType không hợp lệ' }, { status: 400 });
    }
    if ('counterpartyName' in updates) updates.counterpartyName = String(updates.counterpartyName ?? '').trim().slice(0, 200);
    if ('counterpartyUnit' in updates) updates.counterpartyUnit = updates.counterpartyUnit ? String(updates.counterpartyUnit).trim().slice(0, 200) : null;
    if ('counterpartyAddress' in updates) updates.counterpartyAddress = updates.counterpartyAddress ? String(updates.counterpartyAddress).trim().slice(0, 300) : null;
    if ('expenseBasisRef' in updates) updates.expenseBasisRef = updates.expenseBasisRef ? String(updates.expenseBasisRef).trim().slice(0, 100) : null;
    if ('expenseBasisNote' in updates) updates.expenseBasisNote = updates.expenseBasisNote ? String(updates.expenseBasisNote).trim().slice(0, 500) : null;
    if ('note' in updates) updates.note = updates.note ? String(updates.note).slice(0, 500) : null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Không có field nào để update' }, { status: 400 });
    }

    updates.updatedBy = caller.profile.uid;
    updates.updatedAt = now;

    await ref.update(updates);

    void writeAuditLog({
      action: 'update_expense', module: 'finance', userId: caller.profile.uid,
      branchId: tx.branchId,
      before: Object.fromEntries(Object.keys(updates).filter((k) => k !== 'updatedAt' && k !== 'updatedBy').map((k) => [k, (tx as any)[k] ?? null])),
      after: Object.fromEntries(Object.entries(updates).filter(([k]) => k !== 'updatedAt' && k !== 'updatedBy')),
      actorName: caller.actorName, actorRole: role, source: 'api',
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[finance/expenses/[id]] PATCH error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}

// ─── DELETE (draft only) ───────────────────────────────────────────────

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await getAuthedCaller();
    const role = String(caller.profile.role_code ?? '');
    const callerBranchId = caller.profile.facility_id ?? null;

    const loaded = await loadExpense(id);
    if (!loaded) return NextResponse.json({ ok: true });   // idempotent

    if (!canDeleteExpense(role, caller.profile.uid, callerBranchId, loaded.data)) {
      return NextResponse.json({ error: 'Chỉ xóa được draft của chính mình; phiếu recorded phải void' }, { status: 403 });
    }

    await loaded.ref.delete();

    void writeAuditLog({
      action: 'delete_expense_draft', module: 'finance', userId: caller.profile.uid,
      branchId: loaded.data.branchId,
      before: { voucherNo: loaded.data.voucherNo, amount: loaded.data.amount, status: 'draft' },
      after: null,
      actorName: caller.actorName, actorRole: role, source: 'api',
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[finance/expenses/[id]] DELETE error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
