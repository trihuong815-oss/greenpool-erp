// V8 Phase 2 (2026-06-18)
// GET /api/sales-v2/daily-summary?branchId=X&date=YYYY-MM-DD
//   Aggregate báo cáo tổng hợp doanh thu ngày 1 cơ sở:
//   - Phần 1 (Sale): batch approved trong ngày → tx approved → group theo
//     mapPackageToReport (I. Thẻ tháng / II. Tích lượt / III. Học bơi / IV. Khác).
//     Loại trừ thanh_toan_not (không tạo doanh số mới).
//   - Phần 2 (Reception): salesReceptionBatches/{branch}_{date} entries.
//   - Grand total cộng dồn 3 cột tiền (cash + transfer + card).
//
// Scope read: Admin/CEO/CHU_TICH/GD/TP_KE/TP_GS all; QLCS/NV_KE branch mình.
// Sale (NV_SALE) KHÔNG có quyền.

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { isBranchId } from '@/lib/branches';
import { mapPackageToReport, type ReportGroup } from '@/lib/sales-v2/auto-map-package';
import { serializeBatch as serializeReceptionBatch, buildBatchId, buildEmptyEntries, getPricing } from '@/lib/sales-v2/reception';
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

interface SaleItem {
  label: string;
  count: number;
  cash: number;
  transfer: number;
  card: number;
  total: number;
}
interface SaleGroup {
  id: ReportGroup;
  label: string;
  count: number;
  cash: number;
  transfer: number;
  card: number;
  total: number;
  items: SaleItem[];
}

const GROUP_ORDER: ReportGroup[] = ['the_thang', 'tich_luot', 'hoc_boi', 'other'];

export async function GET(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const qs = req.nextUrl.searchParams;
    const branchId = qs.get('branchId');
    const date = qs.get('date');
    if (!branchId || !isBranchId(branchId)) {
      return NextResponse.json({ error: 'branchId không hợp lệ' }, { status: 400 });
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'date sai format (YYYY-MM-DD)' }, { status: 400 });
    }
    if (!canRead(String(caller.profile.role_code), caller.profile.facility_id, branchId)) {
      return NextResponse.json({ error: 'Không có quyền xem tổng hợp doanh thu cơ sở này' }, { status: 403 });
    }

    const db = getFirebaseAdminDb();

    // 1. Reception batch
    const receptionId = buildBatchId(branchId as BranchId, date);
    const receptionDoc = await db.collection(COLLECTIONS.SALES_RECEPTION_BATCHES).doc(receptionId).get();
    let reception;
    if (receptionDoc.exists) {
      const b = serializeReceptionBatch(receptionDoc.id, receptionDoc.data() ?? {});
      reception = {
        exists: true,
        status: b.status,
        entries: b.entries,
        totals: { cash: b.totalCash, transfer: b.totalTransfer, card: b.totalCard, total: b.totalRevenue },
        enteredByName: b.enteredByName,
        approvedAt: b.approvedAt,
      };
    } else {
      // Skeleton entries để UI hiển thị "chưa nhập" rõ ràng (kế toán mặc định không có)
      const pricing = await getPricing(branchId as BranchId);
      reception = {
        exists: false,
        status: 'draft' as const,
        entries: buildEmptyEntries(branchId as BranchId, pricing ?? undefined),
        totals: { cash: 0, transfer: 0, card: 0, total: 0 },
        enteredByName: '',
        approvedAt: null,
      };
    }

    // 2. Sale batches approved trong ngày + branch
    // Single where(date) để tránh composite index; filter client.
    const batchSnap = await db.collection(COLLECTIONS.SALES_DAILY_BATCHES)
      .where('date', '==', date)
      .get();
    const approvedBatchIds: string[] = [];
    batchSnap.forEach((d) => {
      const data = d.data();
      if (data.branchId !== branchId) return;
      if (data.status !== 'approved') return;
      approvedBatchIds.push(d.id);
    });

    // 3. Sale transactions của các batch approved
    // Firestore `in` query max 30 elements/batch query → chunk.
    const allTxs: Array<Record<string, any>> = [];
    for (let i = 0; i < approvedBatchIds.length; i += 30) {
      const chunk = approvedBatchIds.slice(i, i + 30);
      if (chunk.length === 0) continue;
      const txSnap = await db.collection(COLLECTIONS.SALES_TRANSACTIONS)
        .where('batchId', 'in', chunk)
        .get();
      txSnap.forEach((d) => allTxs.push(d.data()));
    }

    // 4. Aggregate Sale tx theo group + sub-label
    // Initialize 4 groups (the_thang/tich_luot/hoc_boi/other) — UI always show structure.
    const groupsMap: Record<ReportGroup, Map<string, SaleItem>> = {
      the_thang: new Map(), tich_luot: new Map(), hoc_boi: new Map(), other: new Map(),
    };
    const groupTotals: Record<ReportGroup, { cash: number; transfer: number; card: number; total: number; count: number }> = {
      the_thang: { cash: 0, transfer: 0, card: 0, total: 0, count: 0 },
      tich_luot: { cash: 0, transfer: 0, card: 0, total: 0, count: 0 },
      hoc_boi:   { cash: 0, transfer: 0, card: 0, total: 0, count: 0 },
      other:     { cash: 0, transfer: 0, card: 0, total: 0, count: 0 },
    };
    const groupLabels: Record<ReportGroup, string> = {
      the_thang: 'I. Thẻ tháng',
      tich_luot: 'II. Tích lượt',
      hoc_boi: 'III. Học bơi',
      other: 'IV. Khác',
    };

    for (const x of allTxs) {
      if (x.reviewStatus !== 'approved') continue;
      if (x.transactionType === 'thanh_toan_not') continue; // không tạo doanh số mới
      const packageName = String(x.packageName ?? '');
      const serviceGroup = String(x.serviceGroup ?? x.packageCode ?? '');
      const mapping = mapPackageToReport(packageName, serviceGroup);
      const collected = Number(x.collectedToday ?? 0);
      if (collected <= 0) continue; // không có tiền vào ngày này
      const method = String(x.paymentMethod ?? '');
      const cash = method === 'tien_mat' ? collected : 0;
      const transfer = method === 'chuyen_khoan' ? collected : 0;
      const card = method === 'pos' ? collected : 0;
      // Group bucket
      const grp = groupTotals[mapping.group];
      grp.cash += cash; grp.transfer += transfer; grp.card += card; grp.total += collected; grp.count += 1;
      // Item bucket
      const items = groupsMap[mapping.group];
      const existing = items.get(mapping.subLabel);
      if (existing) {
        existing.cash += cash; existing.transfer += transfer; existing.card += card;
        existing.total += collected; existing.count += 1;
      } else {
        items.set(mapping.subLabel, { label: mapping.subLabel, count: 1, cash, transfer, card, total: collected });
      }
    }

    const saleGroups: SaleGroup[] = GROUP_ORDER.map((g) => ({
      id: g,
      label: groupLabels[g],
      count: groupTotals[g].count,
      cash: groupTotals[g].cash,
      transfer: groupTotals[g].transfer,
      card: groupTotals[g].card,
      total: groupTotals[g].total,
      items: Array.from(groupsMap[g].values()).sort((a, b) => b.total - a.total),
    }));

    const salesTotals = {
      cash: GROUP_ORDER.reduce((s, g) => s + groupTotals[g].cash, 0),
      transfer: GROUP_ORDER.reduce((s, g) => s + groupTotals[g].transfer, 0),
      card: GROUP_ORDER.reduce((s, g) => s + groupTotals[g].card, 0),
      total: GROUP_ORDER.reduce((s, g) => s + groupTotals[g].total, 0),
    };

    const sales = {
      exists: approvedBatchIds.length > 0,
      batchCount: approvedBatchIds.length,
      groups: saleGroups,
      totals: salesTotals,
    };

    // 5. Grand totals
    const grandTotals = {
      cash: reception.totals.cash + sales.totals.cash,
      transfer: reception.totals.transfer + sales.totals.transfer,
      card: reception.totals.card + sales.totals.card,
      total: reception.totals.total + sales.totals.total,
    };

    // Branch name (denormalize for UI)
    const branchDoc = await db.collection(COLLECTIONS.BRANCHES).doc(branchId).get();
    const branchName = branchDoc.exists ? String(branchDoc.data()?.name ?? branchId) : branchId;

    return NextResponse.json({
      ok: true,
      date, branchId, branchName,
      reception, sales, grandTotals,
    });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[daily-summary] error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
