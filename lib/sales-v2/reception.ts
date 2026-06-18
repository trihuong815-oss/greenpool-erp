// V8 Reception (2026-06-18) — Service helpers cho doanh thu quầy lễ tân.

import 'server-only';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import type { BranchId } from '@/lib/types/branches';
import type {
  SalesReceptionBatch, SalesReceptionPricing, ReceptionEntry,
  ReceptionBatchStatus, ReceptionCategory,
} from '@/lib/types/sales-reception';
import {
  RECEPTION_CATEGORY_LABEL, categoriesForBranch, categoryHasUnitPrice,
} from '@/lib/types/sales-reception';

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

export function serializeBatch(id: string, raw: Record<string, any>): SalesReceptionBatch {
  const entries: ReceptionEntry[] = Array.isArray(raw.entries)
    ? raw.entries.map((e: any) => ({
        category: e?.category as ReceptionCategory,
        label: String(e?.label ?? RECEPTION_CATEGORY_LABEL[e?.category as ReceptionCategory] ?? ''),
        quantity: e?.quantity != null ? Number(e.quantity) : null,
        unitPrice: e?.unitPrice != null ? Number(e.unitPrice) : null,
        cash: Number(e?.cash ?? 0),
        transfer: Number(e?.transfer ?? 0),
        card: Number(e?.card ?? 0),
        total: Number(e?.total ?? 0),
        note: e?.note ?? null,
      }))
    : [];
  return {
    id,
    date: String(raw.date ?? ''),
    month: String(raw.month ?? ''),
    branchId: raw.branchId as BranchId,
    branchName: String(raw.branchName ?? ''),
    status: (raw.status as ReceptionBatchStatus) ?? 'draft',
    entries,
    totalCash: Number(raw.totalCash ?? 0),
    totalTransfer: Number(raw.totalTransfer ?? 0),
    totalCard: Number(raw.totalCard ?? 0),
    totalRevenue: Number(raw.totalRevenue ?? 0),
    note: String(raw.note ?? ''),
    enteredBy: String(raw.enteredBy ?? ''),
    enteredByName: String(raw.enteredByName ?? ''),
    enteredAt: tsToIso(raw.enteredAt),
    approvedAt: tsToIsoOrNull(raw.approvedAt),
    createdAt: tsToIso(raw.createdAt),
    updatedAt: tsToIso(raw.updatedAt),
  };
}

export function serializePricing(id: string, raw: Record<string, any>): SalesReceptionPricing {
  return {
    id: id as BranchId,
    branchId: (raw.branchId ?? id) as BranchId,
    branchName: String(raw.branchName ?? ''),
    prices: (raw.prices && typeof raw.prices === 'object') ? raw.prices : {},
    updatedBy: String(raw.updatedBy ?? ''),
    updatedByName: String(raw.updatedByName ?? ''),
    updatedAt: tsToIso(raw.updatedAt),
  };
}

/** Default empty batch cho 1 cơ sở + ngày — preload categories cố định.
 *  Khi NV_KE lần đầu mở /quay-le-tan/nhap → server trả batch trống có sẵn skeleton. */
export function buildEmptyEntries(branchId: BranchId, pricing?: SalesReceptionPricing): ReceptionEntry[] {
  const categories = categoriesForBranch(branchId);
  return categories.map((c) => {
    const hasPrice = categoryHasUnitPrice(c);
    const unitPrice = hasPrice ? (pricing?.prices?.[c] ?? null) : null;
    return {
      category: c,
      label: RECEPTION_CATEGORY_LABEL[c],
      quantity: hasPrice ? 0 : null,
      unitPrice,
      cash: 0,
      transfer: 0,
      card: 0,
      total: 0,
      note: null,
    };
  });
}

/** Build batch id = branchId_YYYY-MM-DD. Deterministic — 1 doc/branch/day. */
export function buildBatchId(branchId: BranchId, date: string): string {
  return `${branchId}_${date}`;
}

/** Compute totals từ entries. Server enforce. */
export function computeTotals(entries: ReceptionEntry[]): {
  totalCash: number; totalTransfer: number; totalCard: number; totalRevenue: number;
} {
  let cash = 0, transfer = 0, card = 0;
  for (const e of entries) {
    cash += Math.max(0, Number(e.cash) || 0);
    transfer += Math.max(0, Number(e.transfer) || 0);
    card += Math.max(0, Number(e.card) || 0);
  }
  return { totalCash: cash, totalTransfer: transfer, totalCard: card, totalRevenue: cash + transfer + card };
}

/** Read pricing cho cơ sở (null nếu chưa setup). */
export async function getPricing(branchId: BranchId): Promise<SalesReceptionPricing | null> {
  const db = getFirebaseAdminDb();
  const doc = await db.collection(COLLECTIONS.SALES_RECEPTION_PRICING).doc(branchId).get();
  if (!doc.exists) return null;
  return serializePricing(doc.id, doc.data() ?? {});
}
