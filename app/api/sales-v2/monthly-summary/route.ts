// GET /api/sales-v2/monthly-summary?month=YYYY-MM[&branchId=X&saleId=Y]
//   Aggregate transactions theo tháng + scope role.
//   - Sale: force saleId = uid (chỉ data của mình)
//   - NV_KE/QLCS: force branchId = facility_id (cơ sở mình)
//   - TP_KE/top: optional filter
//   - CHỈ count reviewStatus='approved' (data chính thức).
//
// Trả về:
//   {
//     month, scope: { branchId, saleId },
//     totals: { sales, collected, debtGenerated, debtRemaining, transactions },
//     bySource: { ca_nhan: {count, sales, collected}, ... },
//     byPackage: { [packageId]: {name, count, sales, collected} },
//     bySale: { [saleId]: {name, sales, collected, transactions} },   // chỉ top role
//     byBranch: { [branchId]: {name, sales, collected, transactions} } // chỉ top role
//   }
//
// Phase 5 J1 (2026-06-17).

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { getScopeRole } from '@/lib/sales-v2/scope';
import { isBranchId, BRANCHES, type BranchId } from '@/lib/branches';
import { fetchFreshPackageMap, applyFreshPackageName, collectPackageIds } from '@/lib/sales-v2/resolve-package-names';
import { getMonthLockState } from '@/lib/sales-v2/month-lock';
import { buildTargetSummary, parseMonth, type TargetScope } from '@/lib/sales-v2/target-progress';
import type { SalesV2Source } from '@/lib/types/sales-v2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Bucket {
  count: number;
  sales: number;
  collected: number;
}
interface NamedBucket extends Bucket {
  name: string;
}
interface PackageBucket extends NamedBucket {
  isCustomQuantity?: boolean;
  unitName?: string;
}

const SOURCES: SalesV2Source[] = ['ca_nhan', 'walkin', 'mkt', 'renew', 'ref'];

function emptyBySource(): Record<SalesV2Source, Bucket> {
  return {
    ca_nhan: { count: 0, sales: 0, collected: 0 },
    walkin: { count: 0, sales: 0, collected: 0 },
    mkt: { count: 0, sales: 0, collected: 0 },
    renew: { count: 0, sales: 0, collected: 0 },
    ref: { count: 0, sales: 0, collected: 0 },
  };
}

export async function GET(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const role = getScopeRole(caller.profile.role_code);
    if (!role) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });

    const qs = req.nextUrl.searchParams;
    const month = String(qs.get('month') ?? '');
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'Sai định dạng month (cần YYYY-MM)' }, { status: 400 });
    }

    const reqBranchId = qs.get('branchId');
    const reqSaleId = qs.get('saleId');

    // Determine scope
    let scopeBranchId: string | null = null;
    let scopeSaleId: string | null = null;
    if (role === 'sale') {
      scopeSaleId = caller.profile.uid;
    } else if (role === 'accountant' || role === 'qlcs') {
      if (!caller.profile.facility_id) {
        return NextResponse.json({ error: 'Tài khoản chưa được gán cơ sở' }, { status: 400 });
      }
      scopeBranchId = caller.profile.facility_id;
      if (reqSaleId) scopeSaleId = reqSaleId;
    } else if (role === 'top') {
      if (reqBranchId && isBranchId(reqBranchId)) scopeBranchId = reqBranchId;
      if (reqSaleId) scopeSaleId = reqSaleId;
    }

    const db = getFirebaseAdminDb();
    // BUG-2 audit fix: bỏ where(branchId) tránh cần composite index. Filter client.
    const LIMIT = 5000;
    const snap = await db.collection(COLLECTIONS.SALES_TRANSACTIONS)
      .where('month', '==', month)
      .limit(LIMIT)
      .get();
    // V8.X audit fix: warn nếu chạm limit → số liệu KHÔNG đầy đủ.
    const truncated = snap.size >= LIMIT;

    // Aggregate
    const totals = { sales: 0, collected: 0, debtGenerated: 0, debtRemaining: 0, transactions: 0 };
    const bySource = emptyBySource();
    const byPackage: Record<string, PackageBucket> = {};
    const bySale: Record<string, NamedBucket> = {};
    const byBranch: Record<string, NamedBucket> = {};
    // PR-TK2 (2026-06-21): txStatusStats — đếm theo reviewStatus TRƯỚC khi filter approved.
    // Phục vụ alert "còn N tx chờ duyệt/từ chối". KPI doanh số vẫn chỉ dùng approved.
    const txStatusStats = { total: 0, approved: 0, pending: 0, rejected: 0 };
    // PR-TK2: customerCount — distinct phone trong scope.
    // Fallback nếu thiếu phone: dùng customerName + saleId làm key (tránh underestimate).
    const customerKeys = new Set<string>();
    // V6 PT (2026-06-17): gói tính theo buổi. Aggregate riêng để báo cáo dịch vụ buổi.
    // Chỉ tính tx có packageIsCustomQuantity=true, KHÔNG bao gồm thanh_toan_not.
    const ptTotals = { transactions: 0, sessions: 0, sales: 0 };
    const ptByPackage: Record<string, NamedBucket & { sessions: number; unitName: string }> = {};
    // V7 Promo (2026-06-18): aggregate riêng theo promo. Snapshot ở tx → lịch sử bất biến.
    const promoTotals = {
      transactions: 0,           // tx có ÍT NHẤT 1 promo
      totalDiscount: 0,
      totalBonusSessions: 0,
      totalBonusDays: 0,
    };
    const promoByCode: Record<string, {
      code: string; name: string; type: string;
      count: number; discount: number; bonusSessions: number; bonusDays: number;
    }> = {};
    // V8.X (2026-06-18): danh sách khách hàng chi tiết theo Sale (cho tab /tong-ket).
    // Mỗi Sale có list tx + totals. Scope đã apply ở filter trên (saleId/branchId).
    interface SaleCustomerTx {
      id: string;
      date: string;
      customerName: string;
      phone: string;
      // V8.X (2026-06-19): thêm packageId để fresh-resolve được packageName theo /packages.
      packageId: string;
      packageName: string;
      packageValue: number;       // server-stored FINAL (sau promo)
      collectedToday: number;
      debtAmount: number;         // hiện tại (sau auto-match)
      originalDebt: number;       // snapshot lúc tạo (dat_coc)
      transactionType: string;
      paymentMethod: string;
      matchedTransactionId: string | null;
      matchStatus: string;
      note: string | null;
    }
    interface SaleCustomers {
      saleId: string;
      saleName: string;
      branchId: string;
      branchName: string;
      transactions: SaleCustomerTx[];
      totals: { count: number; sales: number; collected: number; debtGenerated: number; debtRemaining: number };
    }
    const salesCustomers: Record<string, SaleCustomers> = {};

    for (const d of snap.docs) {
      const x = d.data() as Record<string, any>;
      // BUG-2: filter branchId client-side
      if (scopeBranchId && x.branchId !== scopeBranchId) continue;
      if (scopeSaleId && x.saleId !== scopeSaleId) continue;

      // PR-TK2: count theo reviewStatus TRƯỚC khi filter approved.
      const status = String(x.reviewStatus ?? '');
      txStatusStats.total += 1;
      if (status === 'approved') txStatusStats.approved += 1;
      else if (status === 'rejected') txStatusStats.rejected += 1;
      else txStatusStats.pending += 1;  // pending hoặc bất kỳ status khác

      // CHỈ approved mới vào aggregation tiếp theo (giữ semantics cũ)
      if (x.reviewStatus !== 'approved') continue;

      // PR-TK2: customerCount — distinct theo phone (chuẩn hóa trim+lowercase),
      // fallback customerName+saleId nếu thiếu phone (tránh underestimate).
      const phoneRaw = String(x.phone ?? '').trim();
      if (phoneRaw) customerKeys.add(`p:${phoneRaw}`);
      else customerKeys.add(`n:${String(x.customerName ?? '').trim()}:${String(x.saleId ?? '')}`);

      const pv = Number(x.packageValue ?? 0);
      const ct = Number(x.collectedToday ?? 0);
      const debt = Number(x.debtAmount ?? 0);
      const originalDebt = Number(x.originalDebt ?? debt); // fallback debt nếu doc cũ
      const src = (x.source ?? 'ca_nhan') as SalesV2Source;
      const txType = String(x.transactionType ?? '');
      const isThanhToanNot = txType === 'thanh_toan_not';

      // V8.X: populate salesCustomers — danh sách KH chi tiết theo Sale
      const sid = String(x.saleId ?? '');
      if (sid) {
        if (!salesCustomers[sid]) {
          salesCustomers[sid] = {
            saleId: sid,
            saleName: String(x.saleName ?? ''),
            branchId: String(x.branchId ?? ''),
            branchName: String(x.branchName ?? ''),
            transactions: [],
            totals: { count: 0, sales: 0, collected: 0, debtGenerated: 0, debtRemaining: 0 },
          };
        }
        const s = salesCustomers[sid];
        s.transactions.push({
          id: d.id,
          date: String(x.date ?? ''),
          customerName: String(x.customerName ?? ''),
          phone: String(x.phone ?? ''),
          packageId: String(x.packageId ?? ''),
          packageName: String(x.packageName ?? ''),
          packageValue: pv,
          collectedToday: ct,
          debtAmount: debt,
          originalDebt,
          transactionType: txType,
          paymentMethod: String(x.paymentMethod ?? ''),
          matchedTransactionId: x.matchedTransactionId ?? null,
          matchStatus: String(x.matchStatus ?? 'not_applicable'),
          note: x.note ?? null,
        });
        s.totals.count += 1;
        s.totals.sales += pv;
        s.totals.collected += ct;
        if (txType === 'dat_coc') {
          s.totals.debtGenerated += originalDebt;
          s.totals.debtRemaining += debt;
        }
      }

      totals.sales += pv; // pv = 0 cho thanh_toan_not (server enforce)
      totals.collected += ct;
      totals.transactions += 1;
      // BUG-1 audit fix: debtGenerated = snapshot ORIGINAL debt (tx dat_coc tạo nợ)
      // debtRemaining = debt HIỆN TẠI (sau khi auto-match link đã giảm)
      if (txType === 'dat_coc') {
        totals.debtGenerated += originalDebt;
        totals.debtRemaining += debt;
      }

      // BUG-4 audit fix: thanh_toan_not = trả nốt, KHÔNG tính vào bySource/byPackage
      // (không phải doanh số mới — đã ghi nhận ở tx dat_coc cũ).
      if (!isThanhToanNot) {
        if (SOURCES.includes(src)) {
          bySource[src].count += 1;
          bySource[src].sales += pv;
          bySource[src].collected += ct;
        }
        const pid = String(x.packageId ?? '');
        if (pid) {
          if (!byPackage[pid]) byPackage[pid] = {
            name: String(x.packageName ?? ''),
            count: 0, sales: 0, collected: 0,
            isCustomQuantity: x.packageIsCustomQuantity === true,
            unitName: String(x.packageUnitName ?? ''),
          };
          byPackage[pid].count += 1;
          byPackage[pid].sales += pv;
          byPackage[pid].collected += ct;
        }
        // V6 PT: gói buổi → aggregate riêng. Snapshot ở tx doc (packageIsCustomQuantity)
        // → đảm bảo invariant kể cả khi admin tắt toggle gói sau khi tx đã tạo.
        if (x.packageIsCustomQuantity === true) {
          const sessions = Number(x.quantity ?? 0);
          ptTotals.transactions += 1;
          ptTotals.sessions += sessions;
          ptTotals.sales += pv;
          if (pid) {
            if (!ptByPackage[pid]) ptByPackage[pid] = {
              name: String(x.packageName ?? ''),
              count: 0, sessions: 0, sales: 0, collected: 0,
              unitName: String(x.packageUnitName ?? '') || 'buổi',
            };
            ptByPackage[pid].count += 1;
            ptByPackage[pid].sessions += sessions;
            ptByPackage[pid].sales += pv;
            ptByPackage[pid].collected += ct;
          }
        }
      }

      // V7 Promo aggregate — chỉ tính tx KHÔNG phải thanh_toan_not (không tạo doanh số mới)
      if (!isThanhToanNot) {
        const snaps: Array<{ id: string; code: string; name: string; type: string }> = Array.isArray(x.promoSnapshots) ? x.promoSnapshots : [];
        const txDiscount = Number(x.discountAmount ?? 0);
        const txBonusSessions = Number(x.bonusQuantity ?? 0);
        const txBonusDays = Number(x.bonusDays ?? 0);
        if (snaps.length > 0) {
          promoTotals.transactions += 1;
          promoTotals.totalDiscount += txDiscount;
          promoTotals.totalBonusSessions += txBonusSessions;
          promoTotals.totalBonusDays += txBonusDays;
          for (const s of snaps) {
            const code = String(s?.code ?? '').trim() || '(no-code)';
            if (!promoByCode[code]) promoByCode[code] = {
              code, name: String(s?.name ?? ''), type: String(s?.type ?? ''),
              count: 0, discount: 0, bonusSessions: 0, bonusDays: 0,
            };
            promoByCode[code].count += 1;
            // Attribute toàn bộ discount/bonus của tx cho TỪNG promo trong snapshots — vì
            // tx max 1 discount + 1 bonus, mỗi promo chỉ thuộc 1 group → attribute đúng group.
            if (s?.type === 'percent' || s?.type === 'fixed_amount') promoByCode[code].discount += txDiscount;
            else if (s?.type === 'bonus_sessions') promoByCode[code].bonusSessions += txBonusSessions;
            else if (s?.type === 'bonus_days') promoByCode[code].bonusDays += txBonusDays;
          }
        }
      }

      // By sale + branch: count tất cả tx (kể cả nốt — vì nốt cũng là thực thu)
      if (role === 'top' || role === 'accountant' || role === 'qlcs') {
        const sid = String(x.saleId ?? '');
        if (sid) {
          if (!bySale[sid]) bySale[sid] = { name: String(x.saleName ?? ''), count: 0, sales: 0, collected: 0 };
          bySale[sid].count += 1;
          bySale[sid].sales += pv;
          bySale[sid].collected += ct;
        }
        const bid = String(x.branchId ?? '');
        if (bid) {
          if (!byBranch[bid]) byBranch[bid] = { name: String(x.branchName ?? bid), count: 0, sales: 0, collected: 0 };
          byBranch[bid].count += 1;
          byBranch[bid].sales += pv;
          byBranch[bid].collected += ct;
        }
      }
    }

    // V8.X: sort tx mỗi Sale theo date DESC (mới nhất trước), tx cùng ngày giữ thứ tự
    for (const s of Object.values(salesCustomers)) {
      s.transactions.sort((a, b) => b.date.localeCompare(a.date));
    }

    // V8.X (2026-06-19): fresh-resolve tên gói cho mọi field hiển thị.
    // Gom packageId từ byPackage keys + ptByPackage keys + salesCustomers tx → 1 batch read.
    const allPkgIds = new Set<string>();
    Object.keys(byPackage).forEach((k) => k && allPkgIds.add(k));
    Object.keys(ptByPackage).forEach((k) => k && allPkgIds.add(k));
    for (const s of Object.values(salesCustomers)) {
      collectPackageIds(s.transactions).forEach((id) => allPkgIds.add(id));
    }
    if (allPkgIds.size > 0) {
      const pkgMap = await fetchFreshPackageMap(Array.from(allPkgIds));
      // byPackage: replace .name khi tìm thấy fresh
      for (const [pid, bucket] of Object.entries(byPackage)) {
        const fresh = pkgMap.get(pid);
        if (fresh?.name) bucket.name = fresh.name;
      }
      for (const [pid, bucket] of Object.entries(ptByPackage)) {
        const fresh = pkgMap.get(pid);
        if (fresh?.name) bucket.name = fresh.name;
      }
      // salesCustomers tx: replace packageName per tx
      for (const s of Object.values(salesCustomers)) {
        for (const tx of s.transactions) applyFreshPackageName(tx, pkgMap);
      }
    }

    // ─── PR-TK2 (2026-06-21) — batchStats + monthLock ───────────────────────────
    // batchStats: query salesDailyBatches WHERE month=X (pattern same monthly-summary),
    // filter scope client-side, count theo status. Limit 2000 đủ cho 1 tháng × 5 cơ sở.
    const batchStats = { total: 0, pendingReview: 0, approved: 0, returned: 0 };
    if (role !== 'sale') {
      // Sale không cần batch stats — defer null. Top/Acct/QLCS cần.
      try {
        const batchSnap = await db.collection(COLLECTIONS.SALES_DAILY_BATCHES)
          .where('month', '==', month)
          .limit(2000)
          .get();
        for (const bd of batchSnap.docs) {
          const b = bd.data();
          if (scopeBranchId && b.branchId !== scopeBranchId) continue;
          // Skip draft+0tx (orphan placeholder — đồng nhất với /batches route filter)
          if (b.status === 'draft' && Number(b.totalTransactions ?? 0) === 0) continue;
          batchStats.total += 1;
          if (b.status === 'pending_review') batchStats.pendingReview += 1;
          else if (b.status === 'approved') batchStats.approved += 1;
          else if (b.status === 'returned') batchStats.returned += 1;
        }
      } catch (e) {
        console.warn('[monthly-summary] batchStats fail (swallowed):', (e as Error)?.message);
      }
    }

    // monthLock: docId deterministic `${branchId}_${month}` → đọc trực tiếp.
    // - QLCS/Accountant: lock của branch caller (scopeBranchId)
    // - Top + filter 1 branch: lock của branch đó
    // - Top + xem all: trả summary { lockedCount, totalBranches, lockedBranchIds }
    // - Sale: null (không quan tâm)
    type MonthLockSingle = { branchId: string; locked: boolean; lockedByName: string | null; lockedAt: string | null };
    type MonthLockSummary = { totalBranches: number; lockedCount: number; lockedBranchIds: string[] };
    let monthLock: MonthLockSingle | MonthLockSummary | null = null;
    if (role !== 'sale') {
      try {
        if (scopeBranchId) {
          // 1 cơ sở cụ thể
          const st = await getMonthLockState(scopeBranchId as BranchId, month);
          monthLock = {
            branchId: scopeBranchId,
            locked: st.locked,
            lockedByName: st.lockedByName,
            lockedAt: st.lockedAt ? st.lockedAt.toDate().toISOString() : null,
          };
        } else if (role === 'top') {
          // Top xem all branches → summary
          const allBranches: BranchId[] = BRANCHES.map((b) => b.id as BranchId);
          const results = await Promise.all(
            allBranches.map(async (bid) => ({ bid, st: await getMonthLockState(bid, month) })),
          );
          const lockedBranchIds = results.filter((r) => r.st.locked).map((r) => r.bid);
          monthLock = {
            totalBranches: allBranches.length,
            lockedCount: lockedBranchIds.length,
            lockedBranchIds,
          };
        }
      } catch (e) {
        console.warn('[monthly-summary] monthLock fail (swallowed):', (e as Error)?.message);
      }
    }

    // ─── PR-TK3A (2026-06-21) — Chỉ tiêu doanh số tháng (read-only) ────────────
    // Đọc salesTargets/{year}_{branchId} → trích monthTargets[monthIdx] + staffTargets.
    // Scope:
    //   - sale: target cá nhân từ staffTargets[uid][monthIdx] của branch chính của Sale.
    //   - qlcs/accountant: target cơ sở mình (scopeBranchId).
    //   - top + filter 1 branch: target cơ sở filter.
    //   - top + all: tổng monthTargets của all branches có target.
    // KHÔNG đọc leadTargets (defer). KHÔNG ghi (read-only PR-TK3A).
    const { year, monthIndex } = parseMonth(month);
    let targetScope: TargetScope = 'none';
    let targetRevenue: number | null = null;
    const saleTargetsThisMonth: Record<string, number> = {};

    try {
      if (role === 'sale') {
        // Sale: chỉ xem target cá nhân. Đọc target doc của branch Sale → staffTargets[uid][monthIdx]
        const saleBranch = caller.profile.facility_id;
        if (saleBranch && isBranchId(saleBranch)) {
          const docSnap = await db.collection(COLLECTIONS.SALES_TARGETS)
            .doc(`${year}_${saleBranch}`).get();
          if (docSnap.exists) {
            const d = docSnap.data() ?? {};
            const staff = (d.staffTargets ?? {}) as Record<string, number[]>;
            const own = staff[caller.profile.uid];
            if (Array.isArray(own) && own.length >= 12) {
              const v = Number(own[monthIndex] ?? 0);
              if (v > 0) {
                targetScope = 'sale';
                targetRevenue = v;
                saleTargetsThisMonth[caller.profile.uid] = v;
              }
            }
          }
        }
      } else if (scopeBranchId) {
        // QLCS / Acct / Top filter 1 branch
        const docSnap = await db.collection(COLLECTIONS.SALES_TARGETS)
          .doc(`${year}_${scopeBranchId}`).get();
        if (docSnap.exists) {
          const d = docSnap.data() ?? {};
          const mt = (d.monthTargets ?? null) as number[] | null;
          if (Array.isArray(mt) && mt.length >= 12) {
            const v = Number(mt[monthIndex] ?? 0);
            targetScope = 'branch';
            targetRevenue = v > 0 ? v : null;
          }
          // staffTargets của branch này — fill tất cả Sale
          const staff = (d.staffTargets ?? {}) as Record<string, number[]>;
          for (const [sid, arr] of Object.entries(staff)) {
            if (Array.isArray(arr) && arr.length >= 12) {
              const v = Number(arr[monthIndex] ?? 0);
              if (v > 0) saleTargetsThisMonth[sid] = v;
            }
          }
        } else {
          targetScope = 'branch';
        }
      } else if (role === 'top') {
        // Top xem all: sum monthTargets của tất cả branches có target + collect tất cả staffTargets
        const allBranches: BranchId[] = BRANCHES.map((b) => b.id as BranchId);
        const docs = await Promise.all(
          allBranches.map((bid) =>
            db.collection(COLLECTIONS.SALES_TARGETS).doc(`${year}_${bid}`).get(),
          ),
        );
        let sumTarget = 0;
        let anyTarget = false;
        for (const ds of docs) {
          if (!ds.exists) continue;
          const d = ds.data() ?? {};
          const mt = (d.monthTargets ?? null) as number[] | null;
          if (Array.isArray(mt) && mt.length >= 12) {
            const v = Number(mt[monthIndex] ?? 0);
            if (v > 0) { sumTarget += v; anyTarget = true; }
          }
          const staff = (d.staffTargets ?? {}) as Record<string, number[]>;
          for (const [sid, arr] of Object.entries(staff)) {
            if (Array.isArray(arr) && arr.length >= 12) {
              const v = Number(arr[monthIndex] ?? 0);
              if (v > 0) saleTargetsThisMonth[sid] = v;
            }
          }
        }
        targetScope = 'system';
        targetRevenue = anyTarget ? sumTarget : null;
      }
    } catch (e) {
      console.warn('[monthly-summary] target read fail (swallowed):', (e as Error)?.message);
    }

    const targetSummary = buildTargetSummary(targetScope, targetRevenue, totals.sales, month);

    return NextResponse.json({
      ok: true,
      month,
      scope: { branchId: scopeBranchId, saleId: scopeSaleId },
      totals,
      bySource,
      byPackage,
      bySale: role === 'sale' ? {} : bySale, // Sale không cần thấy người khác
      byBranch: role === 'top' ? byBranch : {},
      // V6 PT (2026-06-17): block riêng cho gói dịch vụ buổi
      ptTotals,
      ptByPackage,
      // V7 Promo (2026-06-18): block riêng cho chương trình khuyến mãi
      promoTotals,
      promoByCode,
      // V8.X (2026-06-18): danh sách KH chi tiết theo Sale — replace PT card ở /tong-ket
      salesCustomers,
      // V8.X audit fix: cảnh báo khi snap chạm limit (5000 tx) → số liệu thiếu
      truncated,
      limit: LIMIT,
      // ─── PR-TK2 (2026-06-21) — Data completeness ───
      customerCount: customerKeys.size,
      txStatusStats,
      batchStats,    // sale → tất cả = 0 (không trả null để tránh check null khắp UI)
      monthLock,     // sale → null; QLCS/branch-specific → single; top all → summary
      // ─── PR-TK3A (2026-06-21) — Chỉ tiêu (read-only) ───
      targetSummary,
      saleTargetsThisMonth,
    });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // Defensive 2026-06-19: log đầy đủ context để diagnose bug Sale role bị 'out khỏi app'
    console.error('[sales-v2/monthly-summary] GET error:', {
      message: err?.message,
      stack: err?.stack?.split('\n').slice(0, 5).join('\n'),
      url: req.nextUrl?.toString(),
    });
    return NextResponse.json({
      error: err?.message ?? 'Lỗi server',
      // Trả thêm chi tiết để frontend hiển thị + admin debug
      hint: 'Liên hệ admin nếu lỗi tiếp diễn',
    }, { status: 500 });
  }
}
