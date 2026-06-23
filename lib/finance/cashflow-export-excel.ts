// PR-CASH1G (2026-06-23) — Build Excel workbook tổng hợp Thu-Chi.
//
// 3 workbook types:
//   - Daily   : 1 ngày × 1 cơ sở → 2 sheet (Tổng hợp + Chi tiết phiếu chi)
//   - Monthly : 1 tháng × cơ sở|hệ thống → 3 sheet (Tổng hợp + Theo ngày + Breakdown)
//   - Yearly  : 1 năm × cơ sở|hệ thống → 3 sheet (Tổng hợp + Theo tháng + Theo cơ sở)

import 'server-only';
import ExcelJS from 'exceljs';
import type { BranchId } from '@/lib/branches';
import { BRANCH_BY_ID } from '@/lib/branches';
import type { DailyCashflowReportDoc, DailyCashflowReportStatus } from './cashflow-report-types';
import { DAILY_CASHFLOW_REPORT_STATUS_LABEL } from './cashflow-report-types';
import type { BranchDailyExpenseDoc, ExpenseStatus } from './expense-types';
import {
  EXPENSE_PAYMENT_METHOD_LABEL,
  EXPENSE_CATEGORY_LABEL,
  EXPENSE_BASIS_TYPE_LABEL,
  EXPENSE_STATUS_LABEL,
} from './expense-types';
import type { MonthlySummary, YearlySummary } from './cashflow-summary-types';

const VND_FORMAT = '#,##0 [$₫-vi-VN]';
const HEADER_FILL: ExcelJS.FillPattern = {
  type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDF7F2' },
};
const TOTAL_FILL: ExcelJS.FillPattern = {
  type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' },
};
const TITLE_FONT: Partial<ExcelJS.Font> = { bold: true, size: 13, color: { argb: 'FF0F172A' } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, size: 11, color: { argb: 'FF065F46' } };

function applyHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
  });
}

function applyTotalRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, size: 11 };
    cell.fill = TOTAL_FILL;
    cell.border = { top: { style: 'medium', color: { argb: 'FFB45309' } }, bottom: { style: 'thin', color: { argb: 'FFB45309' } } };
  });
}

function autoFit(ws: ExcelJS.Worksheet, minWidth = 10, maxWidth = 60) {
  ws.columns.forEach((col) => {
    let maxLen = minWidth;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? '').length + 2;
      if (len > maxLen) maxLen = len;
    });
    col.width = Math.min(maxWidth, maxLen);
  });
}

function addTitleBlock(ws: ExcelJS.Worksheet, params: {
  kind: 'Ngày' | 'Tháng' | 'Năm';
  period: string;                       // YYYY-MM-DD | YYYY-MM | YYYY
  scope: string;                        // "Cơ sở X" | "Toàn hệ thống"
}) {
  ws.mergeCells('A1:F1');
  ws.getCell('A1').value = 'GREEN POOL — HỆ THỐNG QUẢN LÝ';
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF065F46' } };
  ws.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };

  ws.mergeCells('A2:F2');
  ws.getCell('A2').value = `BÁO CÁO THU - CHI ${params.kind.toUpperCase()}`;
  ws.getCell('A2').font = TITLE_FONT;
  ws.getCell('A2').alignment = { vertical: 'middle', horizontal: 'center' };

  ws.mergeCells('A3:C3'); ws.getCell('A3').value = `Kỳ báo cáo: ${params.period}`;
  ws.mergeCells('D3:F3'); ws.getCell('D3').value = `Phạm vi: ${params.scope}`;
  ws.mergeCells('A4:C4'); ws.getCell('A4').value = `Ngày xuất: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`;
  ws.getRow(3).font = { italic: true, size: 10, color: { argb: 'FF64748B' } };
  ws.getRow(4).font = { italic: true, size: 10, color: { argb: 'FF64748B' } };
  ws.getRow(5).height = 6;
}

function tsLabel(v: any): string {
  if (!v) return '';
  if (typeof v === 'string') return v.replace('T', ' ').slice(0, 16);
  if (v._seconds) return new Date(v._seconds * 1000).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  if (v.seconds) return new Date(v.seconds * 1000).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  try { return new Date(v).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }); } catch { return ''; }
}

// ─── DAILY workbook ────────────────────────────────────────────────────

export interface DailyWorkbookInput {
  report: (DailyCashflowReportDoc & { id: string }) | null;   // null khi chưa có
  expenses: Array<BranchDailyExpenseDoc & { id: string }>;
  date: string;
  branchId: BranchId;
  branchName: string;
}

export async function buildDailyWorkbook(input: DailyWorkbookInput): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Green Pool ERP';
  wb.created = new Date();

  // Sheet 1: Tổng hợp ngày
  const s1 = wb.addWorksheet('Tổng hợp ngày', { views: [{ state: 'frozen', ySplit: 5 }] });
  addTitleBlock(s1, { kind: 'Ngày', period: input.date, scope: `${input.branchId} — ${input.branchName}` });

  const r = input.report;
  const rev = r?.revenueSource?.totalByMethod ?? { cash: 0, transfer: 0, card: 0, total: 0 };
  const exp = r?.expense?.totalByMethod ?? { cash: 0, transfer: 0, card: 0, other: 0, total: 0 };
  const net = r?.net ?? { cash: 0, transfer: 0, card: 0, other: 0, total: 0 };

  s1.getRow(6).values = ['Mục', 'Tiền mặt', 'Chuyển khoản', 'Quẹt thẻ', 'Khác', 'Tổng'];
  applyHeaderRow(s1.getRow(6));
  s1.addRow(['Tổng thu', rev.cash, rev.transfer, rev.card, 0, rev.total]);
  s1.addRow(['Tổng chi', exp.cash, exp.transfer, exp.card, exp.other, exp.total]);
  applyTotalRow(s1.addRow(['Net', net.cash, net.transfer, net.card, net.other, net.total]));

  s1.addRow([]);
  s1.addRow(['Trạng thái báo cáo', r ? DAILY_CASHFLOW_REPORT_STATUS_LABEL[r.status] : 'Chưa nộp']);
  s1.addRow(['Phiên bản', r?.reportVersion ?? '']);
  s1.addRow(['Người nộp', r?.submittedByName ?? '', tsLabel(r?.submittedAt)]);
  s1.addRow(['Người kiểm tra', r?.checkedByName ?? '', tsLabel(r?.checkedAt)]);
  s1.addRow(['Người khóa', r?.lockedByName ?? '', tsLabel(r?.lockedAt)]);
  s1.addRow(['Lý do trả lại', r?.returnReason ?? '']);

  // Format money columns B:F as VND
  for (let c = 2; c <= 6; c++) {
    s1.getColumn(c).numFmt = VND_FORMAT;
    s1.getColumn(c).alignment = { horizontal: 'right' };
  }
  autoFit(s1);

  // Sheet 2: Chi tiết phiếu chi
  const s2 = wb.addWorksheet('Chi tiết phiếu chi', { views: [{ state: 'frozen', ySplit: 6 }] });
  addTitleBlock(s2, { kind: 'Ngày', period: input.date, scope: `${input.branchId} — ${input.branchName}` });
  const headerRow = [
    'Số CT', 'Ngày', 'Diễn giải', 'Số tiền',
    'Họ và tên', 'Đơn vị', 'Địa chỉ',
    'Kèm theo', 'Căn cứ',
    'PT chi', 'Nhóm chi', 'Trạng thái',
  ];
  s2.getRow(6).values = headerRow;
  applyHeaderRow(s2.getRow(6));

  if (input.expenses.length === 0) {
    s2.mergeCells(`A7:L7`);
    s2.getCell('A7').value = 'Không có phiếu chi nào trong ngày.';
    s2.getCell('A7').alignment = { horizontal: 'center' };
    s2.getCell('A7').font = { italic: true, color: { argb: 'FF94A3B8' } };
  } else {
    for (const e of input.expenses) {
      s2.addRow([
        e.voucherNo, e.date, e.description, e.amount,
        e.counterpartyName, e.counterpartyUnit ?? '', e.counterpartyAddress ?? '',
        e.expenseBasisRef ?? '', EXPENSE_BASIS_TYPE_LABEL[e.expenseBasisType],
        EXPENSE_PAYMENT_METHOD_LABEL[e.paymentMethod],
        EXPENSE_CATEGORY_LABEL[e.expenseCategory],
        EXPENSE_STATUS_LABEL[e.status as ExpenseStatus],
      ]);
    }
    // Total row (chỉ recorded)
    const recordedSum = input.expenses
      .filter((e) => e.status === 'recorded')
      .reduce((s, e) => s + (e.amount ?? 0), 0);
    applyTotalRow(s2.addRow(['', '', 'TỔNG (đã ghi nhận)', recordedSum, '', '', '', '', '', '', '', '']));
  }
  s2.getColumn(4).numFmt = VND_FORMAT;
  s2.getColumn(4).alignment = { horizontal: 'right' };
  autoFit(s2);

  return wb.xlsx.writeBuffer();
}

// ─── MONTHLY workbook ──────────────────────────────────────────────────

export async function buildMonthlyWorkbook(s: MonthlySummary): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Green Pool ERP';
  wb.created = new Date();

  const scopeLabel = s.scope === 'system'
    ? 'Toàn hệ thống'
    : `${s.branchId} — ${BRANCH_BY_ID[s.branchId as BranchId]?.name ?? s.branchId}`;

  // Sheet 1: Tổng hợp tháng
  const s1 = wb.addWorksheet('Tổng hợp tháng', { views: [{ state: 'frozen', ySplit: 5 }] });
  addTitleBlock(s1, { kind: 'Tháng', period: s.month, scope: scopeLabel });

  s1.getRow(6).values = ['Mục', 'Tiền mặt', 'Chuyển khoản', 'Quẹt thẻ', 'Khác', 'Tổng'];
  applyHeaderRow(s1.getRow(6));
  s1.addRow(['Tổng thu', s.totals.revenue.cash, s.totals.revenue.transfer, s.totals.revenue.card, 0, s.totals.revenue.total]);
  s1.addRow(['Tổng chi', s.totals.expense.cash, s.totals.expense.transfer, s.totals.expense.card, s.totals.expense.other, s.totals.expense.total]);
  applyTotalRow(s1.addRow(['Net', s.totals.net.cash, s.totals.net.transfer, s.totals.net.card, s.totals.net.other, s.totals.net.total]));

  s1.addRow([]);
  s1.addRow(['Số ngày trong tháng', s.daysInMonth]);
  s1.addRow(['Số ngày đã đếm', s.daysCounted]);
  s1.addRow(['Đã nộp/đã gửi', s.statusCounts.submitted]);
  s1.addRow(['Đã kiểm tra', s.statusCounts.checked]);
  s1.addRow(['Đã khóa', s.statusCounts.locked]);
  s1.addRow(['Bị trả lại', s.statusCounts.returned]);
  s1.addRow(['Chưa nộp (ước tính)', s.statusCounts.missing]);
  s1.addRow(['Có cảnh báo', s.alertDays]);

  for (let c = 2; c <= 6; c++) {
    s1.getColumn(c).numFmt = VND_FORMAT;
    s1.getColumn(c).alignment = { horizontal: 'right' };
  }
  autoFit(s1);

  // Sheet 2: Theo ngày
  const s2 = wb.addWorksheet('Theo ngày', { views: [{ state: 'frozen', ySplit: 6 }] });
  addTitleBlock(s2, { kind: 'Tháng', period: s.month, scope: scopeLabel });
  s2.getRow(6).values = ['Ngày', 'Cơ sở', 'Tổng thu', 'Tổng chi', 'Net', 'Trạng thái', 'Cảnh báo', 'Mã báo cáo'];
  applyHeaderRow(s2.getRow(6));

  if (s.days.length === 0) {
    s2.mergeCells('A7:H7');
    s2.getCell('A7').value = 'Không có dữ liệu báo cáo trong tháng này.';
    s2.getCell('A7').alignment = { horizontal: 'center' };
    s2.getCell('A7').font = { italic: true, color: { argb: 'FF94A3B8' } };
  } else {
    const sorted = [...s.days].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.branchId.localeCompare(b.branchId);
    });
    for (const d of sorted) {
      s2.addRow([
        d.date,
        `${d.branchId} — ${d.branchName}`,
        d.revenueTotal, d.expenseTotal, d.netTotal,
        DAILY_CASHFLOW_REPORT_STATUS_LABEL[d.status as DailyCashflowReportStatus],
        d.alertCount,
        d.reportId,
      ]);
    }
    applyTotalRow(s2.addRow([
      '', 'TỔNG', s.totals.revenue.total, s.totals.expense.total, s.totals.net.total, '', '', '',
    ]));
  }
  for (const c of [3, 4, 5]) {
    s2.getColumn(c).numFmt = VND_FORMAT;
    s2.getColumn(c).alignment = { horizontal: 'right' };
  }
  autoFit(s2);

  // Sheet 3: Breakdown phương thức
  const s3 = wb.addWorksheet('Breakdown phương thức', { views: [{ state: 'frozen', ySplit: 5 }] });
  addTitleBlock(s3, { kind: 'Tháng', period: s.month, scope: scopeLabel });
  s3.getRow(6).values = ['Phương thức', 'Tổng thu', 'Tổng chi', 'Net'];
  applyHeaderRow(s3.getRow(6));
  s3.addRow(['Tiền mặt', s.totals.revenue.cash, s.totals.expense.cash, s.totals.net.cash]);
  s3.addRow(['Chuyển khoản', s.totals.revenue.transfer, s.totals.expense.transfer, s.totals.net.transfer]);
  s3.addRow(['Quẹt thẻ', s.totals.revenue.card, s.totals.expense.card, s.totals.net.card]);
  s3.addRow(['Khác', 0, s.totals.expense.other, s.totals.net.other]);
  applyTotalRow(s3.addRow(['TỔNG', s.totals.revenue.total, s.totals.expense.total, s.totals.net.total]));
  for (let c = 2; c <= 4; c++) {
    s3.getColumn(c).numFmt = VND_FORMAT;
    s3.getColumn(c).alignment = { horizontal: 'right' };
  }
  autoFit(s3);

  return wb.xlsx.writeBuffer();
}

// ─── YEARLY workbook ───────────────────────────────────────────────────

export async function buildYearlyWorkbook(s: YearlySummary): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Green Pool ERP';
  wb.created = new Date();

  const scopeLabel = s.scope === 'system'
    ? 'Toàn hệ thống'
    : `${s.branchId} — ${BRANCH_BY_ID[s.branchId as BranchId]?.name ?? s.branchId}`;

  // Sheet 1: Tổng hợp năm
  const s1 = wb.addWorksheet('Tổng hợp năm', { views: [{ state: 'frozen', ySplit: 5 }] });
  addTitleBlock(s1, { kind: 'Năm', period: String(s.year), scope: scopeLabel });
  s1.getRow(6).values = ['Mục', 'Tiền mặt', 'Chuyển khoản', 'Quẹt thẻ', 'Khác', 'Tổng'];
  applyHeaderRow(s1.getRow(6));
  s1.addRow(['Tổng thu', s.totals.revenue.cash, s.totals.revenue.transfer, s.totals.revenue.card, 0, s.totals.revenue.total]);
  s1.addRow(['Tổng chi', s.totals.expense.cash, s.totals.expense.transfer, s.totals.expense.card, s.totals.expense.other, s.totals.expense.total]);
  applyTotalRow(s1.addRow(['Net', s.totals.net.cash, s.totals.net.transfer, s.totals.net.card, s.totals.net.other, s.totals.net.total]));
  s1.addRow([]);
  s1.addRow(['Đã nộp/đã gửi', s.statusCounts.submitted]);
  s1.addRow(['Đã kiểm tra', s.statusCounts.checked]);
  s1.addRow(['Đã khóa', s.statusCounts.locked]);
  s1.addRow(['Bị trả lại', s.statusCounts.returned]);
  s1.addRow(['Chưa nộp (ước tính)', s.statusCounts.missing]);
  s1.addRow(['Có cảnh báo', s.alertDays]);
  for (let c = 2; c <= 6; c++) {
    s1.getColumn(c).numFmt = VND_FORMAT;
    s1.getColumn(c).alignment = { horizontal: 'right' };
  }
  autoFit(s1);

  // Sheet 2: Theo tháng
  const s2 = wb.addWorksheet('Theo tháng', { views: [{ state: 'frozen', ySplit: 6 }] });
  addTitleBlock(s2, { kind: 'Năm', period: String(s.year), scope: scopeLabel });
  s2.getRow(6).values = [
    'Tháng', 'Tổng thu', 'Tổng chi', 'Net',
    'Đã nộp', 'Đã kiểm tra', 'Đã khóa', 'Trả lại', 'Thiếu', 'Cảnh báo',
  ];
  applyHeaderRow(s2.getRow(6));
  for (const m of s.monthlyRows) {
    s2.addRow([
      m.month, m.totalRevenue, m.totalExpense, m.net,
      m.submittedDays, m.checkedDays, m.lockedDays, m.returnedDays, m.missingDays, m.alertDays,
    ]);
  }
  applyTotalRow(s2.addRow([
    'TỔNG', s.totals.revenue.total, s.totals.expense.total, s.totals.net.total,
    s.statusCounts.submitted, s.statusCounts.checked, s.statusCounts.locked,
    s.statusCounts.returned, s.statusCounts.missing, s.alertDays,
  ]));
  for (let c = 2; c <= 4; c++) {
    s2.getColumn(c).numFmt = VND_FORMAT;
    s2.getColumn(c).alignment = { horizontal: 'right' };
  }
  autoFit(s2);

  // Sheet 3: Theo cơ sở (chỉ scope=system)
  if (s.scope === 'system' && s.branchRows && s.branchRows.length > 0) {
    const s3 = wb.addWorksheet('Theo cơ sở', { views: [{ state: 'frozen', ySplit: 6 }] });
    addTitleBlock(s3, { kind: 'Năm', period: String(s.year), scope: scopeLabel });
    s3.getRow(6).values = ['Cơ sở', 'Tên cơ sở', 'Tổng thu', 'Tổng chi', 'Net', 'Đã nộp', 'Đã khóa', 'Trả lại'];
    applyHeaderRow(s3.getRow(6));
    for (const b of s.branchRows) {
      s3.addRow([
        b.branchId, b.branchName, b.totalRevenue, b.totalExpense, b.net,
        b.submittedDays, b.lockedDays, b.returnedDays,
      ]);
    }
    applyTotalRow(s3.addRow(['', 'TỔNG', s.totals.revenue.total, s.totals.expense.total, s.totals.net.total, '', '', '']));
    for (let c = 3; c <= 5; c++) {
      s3.getColumn(c).numFmt = VND_FORMAT;
      s3.getColumn(c).alignment = { horizontal: 'right' };
    }
    autoFit(s3);
  }

  return wb.xlsx.writeBuffer();
}

// ─── Filename builder ──────────────────────────────────────────────────

export function buildExportFilename(params: {
  mode: 'daily' | 'monthly' | 'yearly';
  date?: string;
  month?: string;
  year?: number;
  branchId?: BranchId | null;
}): string {
  const branchPart = params.branchId ? params.branchId : 'HE-THONG';
  if (params.mode === 'daily') return `ThuChi_Ngay_${params.date}_${branchPart}.xlsx`;
  if (params.mode === 'monthly') return `ThuChi_Thang_${params.month}_${branchPart}.xlsx`;
  return `ThuChi_Nam_${params.year}_${branchPart}.xlsx`;
}
