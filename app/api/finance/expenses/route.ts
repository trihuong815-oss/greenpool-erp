// PR-CASH1B (2026-06-23) — Expense CRUD endpoints.
// POST   /api/finance/expenses          — create (NV_KE/ADMIN, branch mình)
// GET    /api/finance/expenses?date=&branchId=&month=&status=  — list theo scope role

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { isBranchId, BRANCH_BY_ID } from '@/lib/branches';
import {
  canCreateExpense,
  getExpenseBranchScope,
} from '@/lib/finance/expense-permissions';
// PR-CASH1F (2026-06-23): chặn create expense khi ngày/cơ sở đã khóa báo cáo.
import { assertDailyCashflowDateNotLocked, CashflowLockedError } from '@/lib/finance/cashflow-lock';
import {
  VALID_EXPENSE_PAYMENT_METHODS,
  VALID_EXPENSE_CATEGORIES,
  VALID_EXPENSE_BASIS_TYPES,
  VALID_EXPENSE_STATUSES,
  type BranchDailyExpenseDoc,
  type CreateExpenseInput,
} from '@/lib/finance/expense-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ─── POST create ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const role = String(caller.profile.role_code ?? '');
    const callerBranchId = caller.profile.facility_id ?? null;

    if (!canCreateExpense(role)) {
      return NextResponse.json({ error: 'Chỉ kế toán cơ sở (NV_KE) được tạo phiếu chi' }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as CreateExpenseInput | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body không hợp lệ' }, { status: 400 });
    }

    // Validate required
    const voucherNo = String(body.voucherNo ?? '').trim();
    const date = String(body.date ?? '').trim();
    const branchId = String(body.branchId ?? '').trim();
    const description = String(body.description ?? '').trim();
    const amount = Number(body.amount);
    const paymentMethod = String(body.paymentMethod ?? '');
    const expenseCategory = String(body.expenseCategory ?? '');
    const counterpartyName = String(body.counterpartyName ?? '').trim();
    const expenseBasisType = String(body.expenseBasisType ?? '');
    const action = body.action === 'record' ? 'record' : 'draft';

    if (!voucherNo) return NextResponse.json({ error: 'Thiếu số chứng từ' }, { status: 400 });
    if (!DATE_RE.test(date)) return NextResponse.json({ error: 'Sai format ngày (YYYY-MM-DD)' }, { status: 400 });
    if (!isBranchId(branchId)) return NextResponse.json({ error: 'branchId không hợp lệ' }, { status: 400 });
    if (!description) return NextResponse.json({ error: 'Thiếu diễn giải' }, { status: 400 });
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'Số tiền phải > 0' }, { status: 400 });
    if (!VALID_EXPENSE_PAYMENT_METHODS.has(paymentMethod)) return NextResponse.json({ error: 'paymentMethod không hợp lệ' }, { status: 400 });
    if (!VALID_EXPENSE_CATEGORIES.has(expenseCategory)) return NextResponse.json({ error: 'expenseCategory không hợp lệ' }, { status: 400 });
    if (!VALID_EXPENSE_BASIS_TYPES.has(expenseBasisType)) return NextResponse.json({ error: 'expenseBasisType không hợp lệ' }, { status: 400 });
    if (!counterpartyName) return NextResponse.json({ error: 'Thiếu người/đơn vị giao dịch' }, { status: 400 });

    // Force branch = caller's facility for NV_KE (ADMIN có thể chỉ định)
    if (role === 'NV_KE') {
      if (!callerBranchId || callerBranchId !== branchId) {
        return NextResponse.json({ error: 'NV_KE chỉ tạo phiếu chi cho cơ sở mình' }, { status: 403 });
      }
    }

    const month = date.slice(0, 7);
    const db = getFirebaseAdminDb();

    // PR-CASH1F (2026-06-23): chặn create khi ngày/cơ sở đã khóa báo cáo thu-chi.
    try {
      await assertDailyCashflowDateNotLocked(db, branchId as any, date);
    } catch (e) {
      if (e instanceof CashflowLockedError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }

    // Validate voucherNo uniqueness within (branchId, month) — chốt #11
    const dupSnap = await db.collection(COLLECTIONS.BRANCH_DAILY_EXPENSES)
      .where('branchId', '==', branchId)
      .where('month', '==', month)
      .where('voucherNo', '==', voucherNo)
      .limit(1)
      .get();
    if (!dupSnap.empty) {
      return NextResponse.json({
        error: `Số chứng từ "${voucherNo}" đã tồn tại trong cơ sở ${branchId} tháng ${month}`,
      }, { status: 409 });
    }

    const now = Timestamp.now();
    const status = action === 'record' ? 'recorded' : 'draft';
    const branchName = BRANCH_BY_ID[branchId as keyof typeof BRANCH_BY_ID]?.name ?? branchId;

    const ref = db.collection(COLLECTIONS.BRANCH_DAILY_EXPENSES).doc();
    const doc: BranchDailyExpenseDoc = {
      voucherNo,
      date,
      month,
      branchId: branchId as any,
      branchName,
      description: description.slice(0, 500),
      amount: Math.round(amount),
      paymentMethod: paymentMethod as any,
      expenseCategory: expenseCategory as any,
      counterpartyName: counterpartyName.slice(0, 200),
      counterpartyUnit: body.counterpartyUnit ? String(body.counterpartyUnit).trim().slice(0, 200) : null,
      counterpartyAddress: body.counterpartyAddress ? String(body.counterpartyAddress).trim().slice(0, 300) : null,
      expenseBasisType: expenseBasisType as any,
      expenseBasisRef: body.expenseBasisRef ? String(body.expenseBasisRef).trim().slice(0, 100) : null,
      expenseBasisNote: body.expenseBasisNote ? String(body.expenseBasisNote).trim().slice(0, 500) : null,
      note: body.note ? String(body.note).slice(0, 500) : null,
      status,
      createdBy: caller.profile.uid,
      createdByName: caller.actorName,
      createdByRole: role,
      createdAt: now,
      updatedBy: null,
      updatedAt: now,
      recordedBy: status === 'recorded' ? caller.profile.uid : null,
      recordedAt: status === 'recorded' ? now : null,
      returnedBy: null,
      returnedAt: null,
      returnReason: null,
      voidedBy: null,
      voidedAt: null,
      voidReason: null,
      cashflowReportId: null,
    };
    await ref.set(doc);

    // Audit
    void writeAuditLog({
      action: status === 'recorded' ? 'record_expense' : 'create_expense',
      module: 'finance',
      userId: caller.profile.uid,
      branchId: branchId,
      before: null,
      after: { voucherNo, date, amount, paymentMethod, expenseCategory, status },
      actorName: caller.actorName,
      actorRole: role,
      source: 'api',
    }).catch((e) => console.warn('[finance/expenses] audit fail', e));

    return NextResponse.json({ ok: true, id: ref.id, expense: { ...doc, id: ref.id } });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[finance/expenses] POST error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}

// ─── GET list ───────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const role = String(caller.profile.role_code ?? '');
    const callerBranchId = caller.profile.facility_id ?? null;

    const scope = getExpenseBranchScope(role, callerBranchId);
    if (!scope.allBranches && !scope.branchId) {
      return NextResponse.json({ error: 'Không có quyền xem phiếu chi' }, { status: 403 });
    }

    const qs = req.nextUrl.searchParams;
    const date = qs.get('date');
    const month = qs.get('month');
    const branchIdParam = qs.get('branchId');
    const statusParam = qs.get('status');

    if (date && !DATE_RE.test(date)) {
      return NextResponse.json({ error: 'date sai format' }, { status: 400 });
    }
    if (month && !MONTH_RE.test(month)) {
      return NextResponse.json({ error: 'month sai format' }, { status: 400 });
    }
    if (statusParam && !VALID_EXPENSE_STATUSES.has(statusParam)) {
      return NextResponse.json({ error: 'status không hợp lệ' }, { status: 400 });
    }

    // Resolve effective branch filter
    let effectiveBranch: string | null = null;
    if (scope.allBranches) {
      effectiveBranch = branchIdParam || null;
    } else {
      effectiveBranch = scope.branchId;   // force per role
      if (branchIdParam && branchIdParam !== scope.branchId) {
        return NextResponse.json({ error: 'Chỉ xem được phiếu chi cơ sở mình' }, { status: 403 });
      }
    }

    const db = getFirebaseAdminDb();
    let q: FirebaseFirestore.Query = db.collection(COLLECTIONS.BRANCH_DAILY_EXPENSES);
    if (effectiveBranch) q = q.where('branchId', '==', effectiveBranch);
    if (date) q = q.where('date', '==', date);
    else if (month) q = q.where('month', '==', month);
    if (statusParam) q = q.where('status', '==', statusParam);
    q = q.orderBy('createdAt', 'desc').limit(500);

    const snap = await q.get();
    const expenses = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ ok: true, count: expenses.length, expenses });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[finance/expenses] GET error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
