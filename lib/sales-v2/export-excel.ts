// M2.2 PR-6 (2026-06-20) — Helper build Excel buffer cho báo cáo doanh số tháng × cơ sở.
//
// Design extensible cho future PR-7 (module Chỉ tiêu doanh số):
//   - ExportData.targets là optional field — nếu truyền vào → helper sẽ tự thêm
//     cột "Chỉ tiêu" / "% hoàn thành" / "Còn thiếu" vào Sheet 1 + Sheet 3.
//   - PR-7 chỉ cần fill `targets` từ collection chỉ tiêu, KHÔNG cần refactor helper.
//   - Hiện tại PR-6 KHÔNG truyền targets → 3 cột đó ẩn.
//
// Fail-safe:
//   - Mọi field nullable đều fallback giá trị mặc định (0/'').
//   - Không throw nếu thiếu data — caller validate trước.

import 'server-only';
import ExcelJS from 'exceljs';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ExportTxRow {
  id: string;
  date: string;              // 'YYYY-MM-DD'
  customerName: string;
  phone: string;
  packageName: string;
  transactionType: string;   // 'dat_coc' | 'thanh_toan_full' | 'thanh_toan_not'
  paymentMethod: string;     // 'tien_mat' | 'chuyen_khoan' | 'pos'
  packageValue: number;
  collectedToday: number;
  debtAmount: number;
  saleName: string;
  /** Người nhập batch — có thể khác Sale phụ trách (vd QLCS nhập hộ). Format: "Tên (Role)" hoặc chỉ "Tên". */
  submitterDisplay: string;
  batchId: string;
  reviewStatus: string;      // luôn 'approved' trong PR-6 (filter sẵn)
}

export interface SaleBucket {
  saleId: string;
  saleName: string;
  count: number;
  sales: number;
  collected: number;
  /** Future PR-7: chỉ tiêu của Sale này. PR-6 không truyền → cột chỉ tiêu ẩn. */
  target?: number | null;
}

export interface PackageBucket {
  packageId: string;
  packageName: string;
  count: number;
  sales: number;
  collected: number;
}

export interface ExportData {
  // Header context
  branchId: string;
  branchName: string;
  month: string;             // 'YYYY-MM'
  exportedAtIso: string;     // ISO timestamp (server time)
  exportedByName: string;

  // Sheet 1 totals
  totalSales: number;
  totalCollected: number;
  totalDebt: number;         // = totalSales - totalCollected
  transactionCount: number;
  batchCount: number;

  // Sheet 2 raw
  transactions: ExportTxRow[];

  // Sheet 3 + 4 aggregates
  bySale: SaleBucket[];
  byPackage: PackageBucket[];

  // ─── Future PR-7 — Chỉ tiêu doanh số (OPTIONAL) ───
  /** Chỉ tiêu cơ sở cho tháng này. Khi present → Sheet 1 thêm 3 cột. */
  branchTarget?: number | null;
}

// ─── Format helpers ────────────────────────────────────────────────────────

const VND_FORMAT = '#,##0';
const PCT_FORMAT = '0.0"%"';
const DATE_FORMAT = 'dd/mm/yyyy';

function formatVnDate(iso: string): string {
  // 'YYYY-MM-DD' → 'DD/MM/YYYY'
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function formatVnDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
  } catch {
    return iso;
  }
}

const TX_TYPE_LABEL: Record<string, string> = {
  dat_coc: 'Đặt cọc',
  thanh_toan_full: 'Thanh toán full',
  thanh_toan_not: 'Thanh toán nốt',
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  tien_mat: 'Tiền mặt',
  chuyen_khoan: 'Chuyển khoản',
  pos: 'POS',
};

const REVIEW_STATUS_LABEL: Record<string, string> = {
  approved: 'Đã duyệt',
  pending: 'Chờ duyệt',
  rejected: 'Từ chối',
};

// ─── Sheet builders ────────────────────────────────────────────────────────

function buildSummarySheet(wb: ExcelJS.Workbook, data: ExportData): void {
  const ws = wb.addWorksheet('Tổng kết');
  ws.columns = [
    { header: 'Chỉ số', key: 'label', width: 28 },
    { header: 'Giá trị', key: 'value', width: 32 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } };

  const rows: Array<{ label: string; value: string | number; isMoney?: boolean; isPct?: boolean }> = [
    { label: 'Cơ sở', value: `${data.branchName} (${data.branchId})` },
    { label: 'Tháng', value: data.month },
    { label: 'Tổng doanh số', value: data.totalSales, isMoney: true },
    { label: 'Tổng thực thu', value: data.totalCollected, isMoney: true },
    { label: 'Tổng công nợ', value: data.totalDebt, isMoney: true },
    { label: 'Số giao dịch', value: data.transactionCount },
    { label: 'Số batch', value: data.batchCount },
  ];

  // Future PR-7: nếu có branchTarget → thêm 3 cột chỉ tiêu
  if (data.branchTarget != null && data.branchTarget > 0) {
    const pct = (data.totalSales / data.branchTarget) * 100;
    const remaining = Math.max(0, data.branchTarget - data.totalSales);
    rows.push(
      { label: 'Chỉ tiêu', value: data.branchTarget, isMoney: true },
      { label: '% hoàn thành', value: pct, isPct: true },
      { label: 'Còn thiếu', value: remaining, isMoney: true },
    );
  }

  rows.push(
    { label: 'Ngày export', value: formatVnDateTime(data.exportedAtIso) },
    { label: 'Người export', value: data.exportedByName },
  );

  for (const r of rows) {
    const row = ws.addRow({ label: r.label, value: r.value });
    if (r.isMoney) row.getCell('value').numFmt = VND_FORMAT;
    if (r.isPct) row.getCell('value').numFmt = PCT_FORMAT;
  }
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
}

/** PR-6.2 (2026-06-20): Build map txId → "GD-YYYYMMDD-NNNN" và batchId → "LO-BRANCH-YYYYMMDD-NN".
 *  Deterministic: caller phải pass transactions đã sort theo (date ASC, id ASC) để STT ổn định
 *  giữa các lần export cùng input. Batch sort theo batchId alphabetical.
 *  Mã ngắn CHỈ phục vụ hiển thị Excel — KHÔNG lưu Firestore, KHÔNG ảnh hưởng nghiệp vụ.
 */
function buildShortCodeMaps(
  transactions: ExportTxRow[],
  branchId: string,
): { shortTxById: Map<string, string>; shortBatchById: Map<string, string> } {
  // 1. Mã GD per date
  const txIdsByDate = new Map<string, string[]>();
  for (const tx of transactions) {
    if (!txIdsByDate.has(tx.date)) txIdsByDate.set(tx.date, []);
    txIdsByDate.get(tx.date)!.push(tx.id);
  }
  const shortTxById = new Map<string, string>();
  for (const [date, ids] of txIdsByDate) {
    const yyyymmdd = date.replace(/-/g, '');
    ids.forEach((id, i) => {
      shortTxById.set(id, `GD-${yyyymmdd}-${String(i + 1).padStart(4, '0')}`);
    });
  }

  // 2. Mã lô per (branch, date) — branch fixed = ExportData.branchId
  const batchDateById = new Map<string, string>();
  for (const tx of transactions) {
    if (tx.batchId && !batchDateById.has(tx.batchId)) batchDateById.set(tx.batchId, tx.date);
  }
  const batchesByDate = new Map<string, string[]>();
  for (const [bid, date] of batchDateById) {
    if (!batchesByDate.has(date)) batchesByDate.set(date, []);
    batchesByDate.get(date)!.push(bid);
  }
  const shortBatchById = new Map<string, string>();
  for (const [date, bids] of batchesByDate) {
    bids.sort();  // deterministic STT
    const yyyymmdd = date.replace(/-/g, '');
    bids.forEach((bid, i) => {
      shortBatchById.set(bid, `LO-${branchId}-${yyyymmdd}-${String(i + 1).padStart(2, '0')}`);
    });
  }

  return { shortTxById, shortBatchById };
}

function buildTransactionsSheet(wb: ExcelJS.Workbook, data: ExportData): void {
  const ws = wb.addWorksheet('Chi tiết giao dịch');

  // PR-6.2: tạo mã ngắn dễ đọc + giữ mã hệ thống ở cuối (hidden) cho truy vết
  const { shortTxById, shortBatchById } = buildShortCodeMaps(data.transactions, data.branchId);

  ws.columns = [
    { header: 'Ngày', key: 'date', width: 12 },
    { header: 'Mã GD', key: 'shortTxCode', width: 22 },
    { header: 'Mã lô', key: 'shortBatchCode', width: 22 },
    { header: 'Khách hàng', key: 'customerName', width: 24 },
    { header: 'SĐT', key: 'phone', width: 14 },
    { header: 'Gói', key: 'packageName', width: 30 },
    { header: 'Loại giao dịch', key: 'transactionType', width: 16 },
    { header: 'Hình thức thu', key: 'paymentMethod', width: 14 },
    { header: 'Giá trị gói', key: 'packageValue', width: 16 },
    { header: 'Thu hôm nay', key: 'collectedToday', width: 16 },
    { header: 'Công nợ', key: 'debtAmount', width: 16 },
    { header: 'Sale phụ trách', key: 'saleName', width: 22 },
    { header: 'Người nhập', key: 'submitterDisplay', width: 24 },
    { header: 'Trạng thái', key: 'reviewStatus', width: 14 },
    // Mã hệ thống đặt CUỐI sheet — hidden=true. Dùng cho truy vết/audit/support khi cần
    // (vd: support unhide qua Excel → copy ID gốc paste vào Firestore Console).
    { header: 'Mã giao dịch hệ thống', key: 'id', width: 30, hidden: true },
    { header: 'Mã lô hệ thống', key: 'batchId', width: 30, hidden: true },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } };

  for (const tx of data.transactions) {
    ws.addRow({
      date: formatVnDate(tx.date),
      shortTxCode: shortTxById.get(tx.id) ?? tx.id,
      shortBatchCode: tx.batchId ? (shortBatchById.get(tx.batchId) ?? tx.batchId) : '',
      customerName: tx.customerName,
      phone: tx.phone,
      packageName: tx.packageName,
      transactionType: TX_TYPE_LABEL[tx.transactionType] ?? tx.transactionType,
      paymentMethod: PAYMENT_METHOD_LABEL[tx.paymentMethod] ?? tx.paymentMethod,
      packageValue: tx.packageValue,
      collectedToday: tx.collectedToday,
      debtAmount: tx.debtAmount,
      saleName: tx.saleName,
      submitterDisplay: tx.submitterDisplay,
      reviewStatus: REVIEW_STATUS_LABEL[tx.reviewStatus] ?? tx.reviewStatus,
      id: tx.id,
      batchId: tx.batchId,
    });
  }

  // Number format cho 3 cột tiền
  ['packageValue', 'collectedToday', 'debtAmount'].forEach((key) => {
    const col = ws.getColumn(key);
    if (col) col.numFmt = VND_FORMAT;
  });
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
}

function buildBySaleSheet(wb: ExcelJS.Workbook, data: ExportData): void {
  const ws = wb.addWorksheet('Doanh số theo Sale');

  // Future PR-7: nếu bất kỳ Sale có target → thêm 3 cột chỉ tiêu
  const hasTargets = data.bySale.some((s) => s.target != null && s.target > 0);

  const columns: ExcelJS.Column[] = [
    { header: 'Sale', key: 'saleName', width: 24 } as ExcelJS.Column,
    { header: 'Số giao dịch', key: 'count', width: 14 } as ExcelJS.Column,
    { header: 'Tổng doanh số', key: 'sales', width: 18 } as ExcelJS.Column,
    { header: 'Tổng thực thu', key: 'collected', width: 18 } as ExcelJS.Column,
    { header: 'Tổng công nợ', key: 'debt', width: 18 } as ExcelJS.Column,
    { header: 'Tỷ trọng doanh số', key: 'pct', width: 18 } as ExcelJS.Column,
  ];
  if (hasTargets) {
    columns.push(
      { header: 'Chỉ tiêu', key: 'target', width: 16 } as ExcelJS.Column,
      { header: '% hoàn thành', key: 'targetPct', width: 14 } as ExcelJS.Column,
      { header: 'Còn thiếu', key: 'targetRemaining', width: 16 } as ExcelJS.Column,
    );
  }
  ws.columns = columns;
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } };

  const totalSales = data.totalSales || 0;
  for (const s of data.bySale) {
    const debt = s.sales - s.collected;
    const pct = totalSales > 0 ? (s.sales / totalSales) * 100 : 0;
    const row: Record<string, any> = {
      saleName: s.saleName,
      count: s.count,
      sales: s.sales,
      collected: s.collected,
      debt,
      pct,
    };
    if (hasTargets) {
      const target = s.target ?? 0;
      row.target = target;
      row.targetPct = target > 0 ? (s.sales / target) * 100 : 0;
      row.targetRemaining = Math.max(0, target - s.sales);
    }
    ws.addRow(row);
  }

  ['sales', 'collected', 'debt'].forEach((k) => { const c = ws.getColumn(k); if (c) c.numFmt = VND_FORMAT; });
  ws.getColumn('pct').numFmt = PCT_FORMAT;
  if (hasTargets) {
    ['target', 'targetRemaining'].forEach((k) => { const c = ws.getColumn(k); if (c) c.numFmt = VND_FORMAT; });
    ws.getColumn('targetPct').numFmt = PCT_FORMAT;
  }
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
}

function buildByPackageSheet(wb: ExcelJS.Workbook, data: ExportData): void {
  const ws = wb.addWorksheet('Doanh số theo gói');
  ws.columns = [
    { header: 'Tên gói', key: 'packageName', width: 36 },
    { header: 'Số lượng bán', key: 'count', width: 16 },
    { header: 'Tổng doanh số', key: 'sales', width: 18 },
    { header: 'Tổng thực thu', key: 'collected', width: 18 },
    { header: 'Tổng công nợ', key: 'debt', width: 18 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } };

  for (const p of data.byPackage) {
    ws.addRow({
      packageName: p.packageName,
      count: p.count,
      sales: p.sales,
      collected: p.collected,
      debt: p.sales - p.collected,
    });
  }
  ['sales', 'collected', 'debt'].forEach((k) => { const c = ws.getColumn(k); if (c) c.numFmt = VND_FORMAT; });
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
}

// ─── Main entry ────────────────────────────────────────────────────────────

/** Build Excel buffer (xlsx binary) từ ExportData.
 *  Returns Buffer — caller wrap vào Response với Content-Type xlsx + Content-Disposition.
 *  Throws nếu ExcelJS lỗi (rất hiếm) — caller catch + trả 500. */
export async function buildSalesExportWorkbook(data: ExportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Green Pool ERP';
  wb.created = new Date(data.exportedAtIso);
  wb.title = `Doanh số ${data.branchId} ${data.month}`;

  buildSummarySheet(wb, data);
  buildTransactionsSheet(wb, data);
  buildBySaleSheet(wb, data);
  buildByPackageSheet(wb, data);

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}

/** Filename convention: DoanhSo_{branchId}_{month}_{YYYYMMDD_HHMM}.xlsx
 *  Caller dùng cho Content-Disposition header. */
export function buildExportFilename(branchId: string, month: string, exportedAt: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  // Format theo VN timezone
  const vnNow = new Date(exportedAt.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const ts = `${vnNow.getFullYear()}${pad(vnNow.getMonth() + 1)}${pad(vnNow.getDate())}_${pad(vnNow.getHours())}${pad(vnNow.getMinutes())}`;
  return `DoanhSo_${branchId}_${month}_${ts}.xlsx`;
}
