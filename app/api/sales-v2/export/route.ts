// M2.2 PR-6 (2026-06-20) — GET /api/sales-v2/export
//
// Xuất Excel báo cáo doanh số 1 cơ sở × 1 tháng.
//
// Query: ?branchId=HM&month=YYYY-MM
//
// Permission:
//   - 'top' (ADMIN/CEO/CHU_TICH/GD_KD/GD_VP/TP_KE): export any branchId
//   - 'qlcs' (QLCS_*): branchId bị server override = facility_id của caller
//   - Khác (sale/accountant/null): 403
//
// Filter dữ liệu:
//   - CHỈ tx có reviewStatus='approved'
//   - CHỈ batch có status='approved'
//
// Flag-gated: SALES_V2_EXPORT_EXCEL (default OFF) — server trả 403 nếu OFF.
//
// Hard limit: 10,000 tx/file → trả 503 (yêu cầu kế toán chia kỳ).
// Empty: 0 tx → trả 404.
// Future month: trả 400.
//
// Audit: action='export_sales_excel' qua recordSalesAuditIfEnabled.
//
// Performance pattern: query where('month').limit(10001) + filter client-side
// (cùng pattern monthly-summary, tránh cần composite index mới).

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { isFlagEnabled } from '@/lib/feature-flags/server';
import { getScopeRole, canExportSalesExcel } from '@/lib/sales-v2/scope';
import { isBranchId, BRANCH_BY_ID, type BranchId } from '@/lib/branches';
import { recordSalesAuditIfEnabled } from '@/lib/sales-v2/audit-log';
import {
  buildSalesExportWorkbook,
  buildExportFilename,
  type ExportData,
  type ExportTxRow,
  type SaleBucket,
  type PackageBucket,
} from '@/lib/sales-v2/export-excel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const HARD_TX_LIMIT = 10_000;
const QUERY_LIMIT = HARD_TX_LIMIT + 1; // +1 để detect overflow

function currentMonthVN(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit' });
  const parts = fmt.formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  return `${y}-${m}`;
}

export async function GET(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const roleCode = caller.profile.role_code ?? '';

    // 1. Flag gate
    const flagOn = await isFlagEnabled('SALES_V2_EXPORT_EXCEL', caller.profile.uid, roleCode);
    if (!flagOn) {
      return NextResponse.json({ error: 'Tính năng đang tắt' }, { status: 403 });
    }

    // 2. Validate params
    const qs = req.nextUrl.searchParams;
    const reqBranchId = qs.get('branchId') ?? '';
    const month = qs.get('month') ?? '';

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'Sai định dạng month (cần YYYY-MM)' }, { status: 400 });
    }
    if (month > currentMonthVN()) {
      return NextResponse.json({ error: 'Không thể export tháng tương lai' }, { status: 400 });
    }

    // 3. Permission scope cho EXPORT (PR-6.3 2026-06-21: dùng canExportSalesExcel
    //    để TÁCH RIÊNG quyền tải file Excel khỏi quyền view /tong-ket. TP_GS xem
    //    được /tong-ket nhưng KHÔNG được tải file ra ngoài).
    if (!canExportSalesExcel(roleCode)) {
      return NextResponse.json({ error: 'Không có quyền export báo cáo' }, { status: 403 });
    }
    const scope = getScopeRole(roleCode);  // 'top' | 'qlcs' (đã guarantee bởi canExportSalesExcel)

    let branchId: BranchId;
    if (scope === 'qlcs') {
      const ownBranch = caller.profile.facility_id;
      if (!ownBranch || !isBranchId(ownBranch)) {
        return NextResponse.json({ error: 'Tài khoản QLCS chưa được gán cơ sở' }, { status: 400 });
      }
      // Server enforce: QLCS chỉ export branch của mình, ignore param khác
      branchId = ownBranch;
    } else {
      if (!isBranchId(reqBranchId)) {
        return NextResponse.json({ error: 'branchId không hợp lệ' }, { status: 400 });
      }
      branchId = reqBranchId;
    }

    // 4. Query transactions
    const db = getFirebaseAdminDb();
    const txSnap = await db.collection(COLLECTIONS.SALES_TRANSACTIONS)
      .where('month', '==', month)
      .limit(QUERY_LIMIT)
      .get();

    // Filter client-side: branchId + reviewStatus='approved'
    const approvedTxs = txSnap.docs.filter((d) => {
      const x = d.data();
      return x.branchId === branchId && x.reviewStatus === 'approved';
    });

    if (approvedTxs.length > HARD_TX_LIMIT) {
      return NextResponse.json({
        error: 'Tháng có quá nhiều giao dịch (>10.000) — liên hệ kế toán để chia kỳ',
      }, { status: 503 });
    }
    if (approvedTxs.length === 0) {
      return NextResponse.json({ error: 'Không có giao dịch đã duyệt cho cơ sở/tháng này' }, { status: 404 });
    }

    // 5. Query batches approved trong tháng (cho cột "Số batch")
    const batchSnap = await db.collection(COLLECTIONS.SALES_DAILY_BATCHES)
      .where('month', '==', month)
      .limit(5000)
      .get();
    const approvedBatchCount = batchSnap.docs.filter((d) => {
      const b = d.data();
      return b.branchId === branchId && b.status === 'approved';
    }).length;

    // 6. Pre-fetch submitter info (user displayName + role) cho cột "Người nhập"
    //    Build từ batchId → batch.saleId → users.displayName/roleId.
    //    Lưu ý: tx.saleName đã có sẵn (snapshot), nhưng "Người nhập" có thể khác Sale
    //    khi QLCS nhập hộ. Cần lookup riêng từ batch.saleId (= người submit batch).
    const batchById = new Map<string, FirebaseFirestore.DocumentData>();
    batchSnap.docs.forEach((d) => batchById.set(d.id, d.data()));

    const submitterUids = new Set<string>();
    for (const txDoc of approvedTxs) {
      const x = txDoc.data();
      const bid = String(x.batchId ?? '');
      const batch = batchById.get(bid);
      const uid = String(batch?.saleId ?? x.saleId ?? '');
      if (uid) submitterUids.add(uid);
    }
    const submitterMap = new Map<string, { displayName: string; roleId: string }>();
    if (submitterUids.size > 0) {
      // Firestore 'in' max 30 → batch chunked
      const uids = Array.from(submitterUids);
      const CHUNK = 30;
      for (let i = 0; i < uids.length; i += CHUNK) {
        const chunk = uids.slice(i, i + CHUNK);
        const usersSnap = await db.collection(COLLECTIONS.USERS)
          .where('__name__', 'in', chunk)
          .get();
        usersSnap.forEach((u) => {
          const ud = u.data();
          submitterMap.set(u.id, {
            displayName: String(ud?.displayName ?? ud?.email ?? '(?)'),
            roleId: String(ud?.roleId ?? ''),
          });
        });
      }
    }

    // 7. Aggregate Sheet 2 + Sheet 3 + Sheet 4
    let totalSales = 0;
    let totalCollected = 0;
    const transactions: ExportTxRow[] = [];
    const bySaleMap = new Map<string, SaleBucket>();
    const byPackageMap = new Map<string, PackageBucket>();

    for (const d of approvedTxs) {
      const x = d.data();
      const pv = Number(x.packageValue ?? 0);
      const ct = Number(x.collectedToday ?? 0);
      const debt = Number(x.debtAmount ?? 0);

      totalSales += pv;
      totalCollected += ct;

      // Submitter display
      const bid = String(x.batchId ?? '');
      const batch = batchById.get(bid);
      const submitterUid = String(batch?.saleId ?? x.saleId ?? '');
      const submitter = submitterMap.get(submitterUid);
      const submitterDisplay = (() => {
        if (!submitter) return String(x.saleName ?? '');
        const isQlcs = submitter.roleId.startsWith('QLCS_');
        return isQlcs ? `${submitter.displayName} (QLCS)` : submitter.displayName;
      })();

      transactions.push({
        id: d.id,
        date: String(x.date ?? ''),
        customerName: String(x.customerName ?? ''),
        phone: String(x.phone ?? ''),
        packageName: String(x.packageName ?? ''),
        transactionType: String(x.transactionType ?? ''),
        paymentMethod: String(x.paymentMethod ?? ''),
        packageValue: pv,
        collectedToday: ct,
        debtAmount: debt,
        saleName: String(x.saleName ?? ''),
        submitterDisplay,
        batchId: bid,
        reviewStatus: String(x.reviewStatus ?? 'approved'),
      });

      // bySale
      const sid = String(x.saleId ?? '');
      if (sid) {
        let bucket = bySaleMap.get(sid);
        if (!bucket) {
          bucket = { saleId: sid, saleName: String(x.saleName ?? ''), count: 0, sales: 0, collected: 0 };
          bySaleMap.set(sid, bucket);
        }
        bucket.count += 1;
        bucket.sales += pv;
        bucket.collected += ct;
      }

      // byPackage
      const pid = String(x.packageId ?? '');
      if (pid) {
        let bucket = byPackageMap.get(pid);
        if (!bucket) {
          bucket = { packageId: pid, packageName: String(x.packageName ?? ''), count: 0, sales: 0, collected: 0 };
          byPackageMap.set(pid, bucket);
        }
        bucket.count += 1;
        bucket.sales += pv;
        bucket.collected += ct;
      }
    }

    // Sort: tx theo date ASC, bySale theo sales DESC, byPackage theo sales DESC
    transactions.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const bySale = Array.from(bySaleMap.values()).sort((a, b) => b.sales - a.sales);
    const byPackage = Array.from(byPackageMap.values()).sort((a, b) => b.sales - a.sales);

    // ─── PR-TK3C (2026-06-21) — Wire target vào Excel ──────────────────────────
    // Đọc 1 doc salesTargets/{year}_{branchId} → trích monthTargets[monthIdx]
    // và staffTargets[saleId][monthIdx]. Fail-soft: không có target → exportData
    // KHÔNG có target fields → helper render Excel như cũ (KHÔNG dòng/cột target).
    // KHÔNG đụng tổng doanh số/thực thu/công nợ.
    let branchTarget: number | null = null;
    try {
      const [yearStr, monthStr] = month.split('-');
      const yearNum = Number(yearStr);
      const monthIdx = Number(monthStr) - 1;  // 0-11
      const targetDocId = `${yearNum}_${branchId}`;
      const targetSnap = await db.collection(COLLECTIONS.SALES_TARGETS).doc(targetDocId).get();
      if (targetSnap.exists) {
        const td = targetSnap.data() ?? {};
        // Branch target
        const mt = (td.monthTargets ?? null) as number[] | null;
        if (Array.isArray(mt) && mt.length >= 12) {
          const v = Number(mt[monthIdx] ?? 0);
          if (v > 0) branchTarget = v;
        }
        // Per-Sale target: fill vào bySale[].target
        const staff = (td.staffTargets ?? {}) as Record<string, number[]>;
        for (const s of bySale) {
          const arr = staff[s.saleId];
          if (Array.isArray(arr) && arr.length >= 12) {
            const v = Number(arr[monthIdx] ?? 0);
            if (v > 0) s.target = v;
          }
        }
      }
    } catch (e) {
      // Fail-soft: lỗi đọc target → không có target trong Excel (giữ behavior cũ)
      console.warn('[sales-v2/export] target read fail (swallowed):', (e as Error)?.message);
    }

    // 8. Build Excel
    const exportedAt = new Date();
    const exportData: ExportData = {
      branchId,
      branchName: BRANCH_BY_ID[branchId]?.name ?? branchId,
      month,
      exportedAtIso: exportedAt.toISOString(),
      exportedByName: caller.actorName,
      totalSales,
      totalCollected,
      totalDebt: totalSales - totalCollected,
      transactionCount: transactions.length,
      batchCount: approvedBatchCount,
      transactions,
      bySale,
      byPackage,
      // PR-TK3C: fill branchTarget nếu cơ sở/tháng có target. null/undefined → Sheet 1
      // không hiện 3 dòng chỉ tiêu (helper tự detect).
      branchTarget,
    };

    const buffer = await buildSalesExportWorkbook(exportData);
    const filename = buildExportFilename(branchId, month, exportedAt);

    // 9. Audit log (fail-soft, không block response)
    await recordSalesAuditIfEnabled({
      module: 'batch',
      action: 'export_sales_excel',
      branchId,
      month,
      newValue: {
        rowCount: transactions.length,
        batchCount: approvedBatchCount,
        fileBytes: buffer.length,
      },
      actorUid: caller.profile.uid,
      actorName: caller.actorName,
      actorRole: roleCode,
    }, caller.profile.uid, roleCode);

    // Convert Node Buffer → Uint8Array (Response BodyInit không accept Node Buffer trực tiếp trong TS strict)
    const body = new Uint8Array(buffer);
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(body.byteLength),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[sales-v2/export] error:', {
      message: err?.message,
      stack: err?.stack?.split('\n').slice(0, 5).join('\n'),
    });
    return NextResponse.json({ error: err?.message ?? 'Lỗi server khi tạo file Excel' }, { status: 500 });
  }
}
