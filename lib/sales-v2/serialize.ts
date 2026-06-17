// Sales v2 — serialize Firestore admin docs → plain JSON cho client.
// Phase 1 (2026-06-17).

import 'server-only';
import { Timestamp } from 'firebase-admin/firestore';
import type {
  SalesDailyBatch,
  SalesTransaction,
} from '@/lib/types/sales-v2';

function tsToIso(v: unknown): string {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return new Date(v).toISOString();
  return new Date().toISOString();
}

function tsToIsoOrNull(v: unknown): string | null {
  if (v == null) return null;
  return tsToIso(v);
}

export function serializeBatch(id: string, raw: Record<string, any>): SalesDailyBatch {
  return {
    id,
    date: String(raw.date ?? ''),
    month: String(raw.month ?? ''),
    branchId: raw.branchId,
    branchName: String(raw.branchName ?? ''),
    saleId: String(raw.saleId ?? ''),
    saleName: String(raw.saleName ?? ''),
    status: raw.status ?? 'draft',
    totalTransactions: Number(raw.totalTransactions ?? 0),
    totalSalesAmount: Number(raw.totalSalesAmount ?? 0),
    totalCollectedAmount: Number(raw.totalCollectedAmount ?? 0),
    totalDebtAmount: Number(raw.totalDebtAmount ?? 0),
    submittedAt: tsToIsoOrNull(raw.submittedAt),
    submittedBy: raw.submittedBy ?? null,
    reviewedAt: tsToIsoOrNull(raw.reviewedAt),
    reviewedBy: raw.reviewedBy ?? null,
    returnedAt: tsToIsoOrNull(raw.returnedAt),
    returnReason: raw.returnReason ?? null,
    createdAt: tsToIso(raw.createdAt),
    updatedAt: tsToIso(raw.updatedAt),
  };
}

export function serializeTransaction(id: string, raw: Record<string, any>): SalesTransaction {
  return {
    id,
    batchId: String(raw.batchId ?? ''),
    date: String(raw.date ?? ''),
    month: String(raw.month ?? ''),
    branchId: raw.branchId,
    branchName: String(raw.branchName ?? ''),
    saleId: String(raw.saleId ?? ''),
    saleName: String(raw.saleName ?? ''),
    customerName: String(raw.customerName ?? ''),
    phone: String(raw.phone ?? ''),
    guardianName: raw.guardianName ?? null,
    source: raw.source,
    packageId: String(raw.packageId ?? ''),
    packageCode: String(raw.packageCode ?? ''),
    packageName: String(raw.packageName ?? ''),
    serviceGroup: String(raw.serviceGroup ?? ''),
    isChildPackage: !!raw.isChildPackage,
    transactionType: raw.transactionType,
    paymentMethod: raw.paymentMethod,
    packageValue: Number(raw.packageValue ?? 0),
    collectedToday: Number(raw.collectedToday ?? 0),
    debtAmount: Number(raw.debtAmount ?? 0),
    originalDebt: raw.originalDebt != null ? Number(raw.originalDebt) : undefined,
    receiptNo: raw.receiptNo ?? null,
    contractNo: raw.contractNo ?? null,
    note: raw.note ?? null,
    // V6 2026-06-17: per-tx review (fallback pending nếu doc cũ chưa có field)
    reviewStatus: raw.reviewStatus ?? 'pending',
    rejectReason: raw.rejectReason ?? null,
    reviewedAt: tsToIsoOrNull(raw.reviewedAt),
    reviewedBy: raw.reviewedBy ?? null,
    matchedTransactionId: raw.matchedTransactionId ?? null,
    matchedTargetSummary: raw.matchedTargetSummary ?? null,
    matchStatus: raw.matchStatus ?? 'not_applicable',
    createdAt: tsToIso(raw.createdAt),
    updatedAt: tsToIso(raw.updatedAt),
  };
}

/** Today's date in VN timezone (UTC+7), format YYYY-MM-DD. */
export function todayInVN(): string {
  const now = new Date();
  const vnMs = now.getTime() + 7 * 3600 * 1000;
  const d = new Date(vnMs);
  return d.toISOString().slice(0, 10);
}

/** Month from date YYYY-MM-DD → YYYY-MM. */
export function monthFromDate(date: string): string {
  return date.slice(0, 7);
}
