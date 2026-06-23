// PR-CASH1F (2026-06-23) — Helper kiểm tra ngày/cơ sở đã khoá báo cáo thu-chi.
//
// Dùng cho expense mutation endpoints để chặn create/edit/delete chi phí khi
// ngày đó đã có dailyCashflowReports status='locked'.
//
// Direct doc.get() bằng buildCashflowReportId(branchId, date) — KHÔNG cần composite index.

import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { buildCashflowReportId } from './cashflow-report-types';
import type { BranchId } from '@/lib/branches';

export class CashflowLockedError extends Error {
  status: number;
  constructor(message: string, status = 423) {
    super(message);
    this.status = status;
    this.name = 'CashflowLockedError';
  }
}

/** True nếu báo cáo thu-chi ngày + cơ sở đã ở trạng thái locked. */
export async function isDailyCashflowDateLocked(
  db: Firestore,
  branchId: BranchId,
  date: string,
): Promise<boolean> {
  const reportId = buildCashflowReportId(branchId, date);
  const doc = await db.collection(COLLECTIONS.DAILY_CASHFLOW_REPORTS).doc(reportId).get();
  if (!doc.exists) return false;
  const status = (doc.data() as any)?.status;
  return status === 'locked';
}

/** Throw CashflowLockedError nếu ngày đã locked. */
export async function assertDailyCashflowDateNotLocked(
  db: Firestore,
  branchId: BranchId,
  date: string,
  customMessage?: string,
): Promise<void> {
  const locked = await isDailyCashflowDateLocked(db, branchId, date);
  if (locked) {
    throw new CashflowLockedError(
      customMessage ?? 'Ngày này đã khóa báo cáo thu-chi, không thể chỉnh sửa chi phí.',
    );
  }
}
