// PR-SALES-EXCEL-IMPORT-SPLIT (2026-06-24) — Pure parser cho Excel/TSV import
// trên màn Sale nhập doanh số. Tách khỏi ExcelImportModal để testable.
//
// Format cột (theo thứ tự):
//   0  Tên KH
//   1  SĐT
//   2  Người giám hộ
//   3  Nguồn
//   4  Gói
//   5  Loại GD
//   6  HT thu              (6 PaymentMethod, có alias tiếng Việt/EN/viết tắt)
//   7  Số PT
//   8  Số HĐ
//   9  Giá trị gói
//   10 Thu hôm nay
//   11 Ghi chú
//   12 Tiền mặt            (OPT — required nếu HT thu là combo có "tien_mat")
//   13 Chuyển khoản        (OPT — required nếu HT thu là combo có "chuyen_khoan")
//   14 POS                 (OPT — required nếu HT thu là combo có "pos")
//
// Single method (3 legacy: tien_mat/chuyen_khoan/pos):
//   - Nếu cột 12/13/14 trống → derive: amount = "Thu hôm nay" gán vào bucket active.
//   - Nếu có giá trị inactive bucket → invalid (tránh dữ liệu sai).
//
// Combo method (3: tien_mat_chuyen_khoan/tien_mat_pos/chuyen_khoan_pos):
//   - 2 ô active bắt buộc > 0.
//   - 1 ô inactive phải trống/0.
//   - "Thu hôm nay" nếu có phải = tổng 2 ô active; nếu trống → tự tính tổng.
//
// Validation dùng chung helper validatePaymentBreakdown / normalizePaymentBreakdown.

import type { PaymentMethod, PaymentBreakdown, SalesV2Source, TransactionType } from '@/lib/types/sales-v2';
import { SOURCE_LABEL, TRANSACTION_TYPE_LABEL, PAYMENT_METHOD_LABEL } from '@/lib/types/sales-v2';
import type { SalesV2Package } from '@/lib/sales-v2/packages';
import {
  getActivePaymentFields,
  isSplitPayment,
  normalizePaymentBreakdown,
  validatePaymentBreakdown,
} from '@/lib/sales-v2/payment-split';

export interface ParsedExcelRow {
  rowIdx: number;
  customerName: string;
  phone: string;
  guardianName: string;
  source: string;
  packageName: string;
  transactionType: string;
  paymentMethod: string;
  receiptNo: string;
  contractNo: string;
  packageValue: number;
  collectedToday: number;
  note: string;
  // Split inputs (cells 12/13/14) — string raw để giữ trống vs 0
  rawCash: string;
  rawTransfer: string;
  rawCard: string;
  // Resolved enums
  resolvedSource?: SalesV2Source;
  resolvedTxnType?: TransactionType;
  resolvedPayMethod?: PaymentMethod;
  resolvedPackage?: SalesV2Package;
  // Resolved breakdown (sau khi normalize + parser derive cho single method)
  resolvedBreakdown?: PaymentBreakdown;
  // Resolved collected (sau khi tự tính nếu Thu hôm nay trống mà combo có đủ 2 bucket)
  resolvedCollected: number;
  errors: string[];
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

// ─── Payment method aliases (tiếng Việt + EN + viết tắt) ──────────────────
// Build từ PAYMENT_METHOD_LABEL trước rồi extend.
const PAY_ALIAS_MAP = new Map<string, PaymentMethod>();
function addPayAlias(aliases: string[], method: PaymentMethod): void {
  for (const a of aliases) PAY_ALIAS_MAP.set(norm(a), method);
}
// Single
addPayAlias(
  [PAYMENT_METHOD_LABEL.tien_mat, 'Tiền mặt', 'TM', 'tien_mat', 'tien mat', 'cash'],
  'tien_mat',
);
addPayAlias(
  [PAYMENT_METHOD_LABEL.chuyen_khoan, 'Chuyển khoản', 'CK', 'chuyen_khoan', 'chuyen khoan', 'transfer'],
  'chuyen_khoan',
);
addPayAlias(
  [PAYMENT_METHOD_LABEL.pos, 'POS', 'Quẹt thẻ', 'Quet the', 'Thẻ', 'The', 'card'],
  'pos',
);
// Combo — accept '+', '/', ',', '_' separator + nhiều order
function comboAlias(parts: string[][], method: PaymentMethod): void {
  const seps = [' + ', '+', ' và ', ' va ', '/', ',', '_'];
  const all: string[] = [];
  for (const order of parts) {
    for (const s of seps) all.push(order.join(s));
  }
  addPayAlias(all, method);
}
comboAlias(
  [
    ['Tiền mặt', 'Chuyển khoản'], ['Chuyển khoản', 'Tiền mặt'],
    ['TM', 'CK'], ['CK', 'TM'],
    ['tien mat', 'chuyen khoan'], ['chuyen khoan', 'tien mat'],
    ['cash', 'transfer'], ['transfer', 'cash'],
  ],
  'tien_mat_chuyen_khoan',
);
comboAlias(
  [
    ['Tiền mặt', 'POS'], ['POS', 'Tiền mặt'],
    ['Tiền mặt', 'Quẹt thẻ'], ['Quẹt thẻ', 'Tiền mặt'],
    ['Tiền mặt', 'Thẻ'], ['Thẻ', 'Tiền mặt'],
    ['TM', 'POS'], ['POS', 'TM'],
    ['tien mat', 'pos'], ['pos', 'tien mat'],
    ['cash', 'card'], ['card', 'cash'],
    ['cash', 'pos'], ['pos', 'cash'],
  ],
  'tien_mat_pos',
);
comboAlias(
  [
    ['Chuyển khoản', 'POS'], ['POS', 'Chuyển khoản'],
    ['Chuyển khoản', 'Quẹt thẻ'], ['Quẹt thẻ', 'Chuyển khoản'],
    ['Chuyển khoản', 'Thẻ'], ['Thẻ', 'Chuyển khoản'],
    ['CK', 'POS'], ['POS', 'CK'],
    ['chuyen khoan', 'pos'], ['pos', 'chuyen khoan'],
    ['transfer', 'card'], ['card', 'transfer'],
    ['transfer', 'pos'], ['pos', 'transfer'],
  ],
  'chuyen_khoan_pos',
);

const SOURCE_MAP = new Map<string, SalesV2Source>(
  Object.entries(SOURCE_LABEL).map(([k, v]) => [norm(v), k as SalesV2Source]),
);
const TXN_MAP = new Map<string, TransactionType>(
  Object.entries(TRANSACTION_TYPE_LABEL).map(([k, v]) => [norm(v), k as TransactionType]),
);

export function resolvePaymentAlias(input: string): PaymentMethod | undefined {
  return PAY_ALIAS_MAP.get(norm(input));
}

const HEADER_KEYWORDS = ['ten kh', 'ten khach', 'sdt', 'phone', 'tên kh', 'tên khách'];

function parseAmount(raw: string | undefined): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[.,\s]/g, '');
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** Check if a raw cell counts as "blank" (no digits) — distinguish from "0". */
function isBlankAmount(raw: string | undefined): boolean {
  if (raw === undefined) return true;
  const s = raw.trim();
  if (s === '') return true;
  // Cho phép '0' / '0.00' / '-' coi như blank ⇒ tránh false-fail khi user nhập 0 cho inactive bucket
  if (/^[-0.,\s]+$/.test(s)) return true;
  return false;
}

export function parseExcelRows(text: string, packages: SalesV2Package[]): ParsedExcelRow[] {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const firstLine = lines[0];
  const sep = firstLine.includes('\t') ? '\t' : ',';
  let startIdx = 0;
  if (HEADER_KEYWORDS.some((k) => norm(firstLine).includes(norm(k)))) startIdx = 1;

  const result: ParsedExcelRow[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const cells = lines[i].split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
    const rawCash = cells[12] ?? '';
    const rawTransfer = cells[13] ?? '';
    const rawCard = cells[14] ?? '';
    const row: ParsedExcelRow = {
      rowIdx: i + 1,
      customerName: cells[0] ?? '',
      phone: cells[1]?.replace(/\s/g, '') ?? '',
      guardianName: cells[2] ?? '',
      source: cells[3] ?? '',
      packageName: cells[4] ?? '',
      transactionType: cells[5] ?? '',
      paymentMethod: cells[6] ?? '',
      receiptNo: cells[7] ?? '',
      contractNo: cells[8] ?? '',
      packageValue: parseAmount(cells[9]),
      collectedToday: parseAmount(cells[10]),
      note: cells[11] ?? '',
      rawCash,
      rawTransfer,
      rawCard,
      resolvedCollected: 0,
      errors: [],
    };

    // Required base
    if (!row.customerName) row.errors.push('Thiếu tên KH');
    if (!row.phone) row.errors.push('Thiếu SĐT');
    else if (!/^0\d{9}$/.test(row.phone)) row.errors.push('SĐT phải 10 số bắt đầu 0');

    row.resolvedSource = SOURCE_MAP.get(norm(row.source));
    if (!row.resolvedSource && row.source) row.errors.push(`Nguồn "${row.source}" không hợp lệ`);
    else if (!row.source) row.errors.push('Thiếu nguồn');

    row.resolvedTxnType = TXN_MAP.get(norm(row.transactionType));
    if (!row.resolvedTxnType && row.transactionType) row.errors.push(`Loại GD "${row.transactionType}" không hợp lệ`);
    else if (!row.transactionType) row.errors.push('Thiếu loại GD');

    row.resolvedPayMethod = resolvePaymentAlias(row.paymentMethod);
    if (!row.resolvedPayMethod && row.paymentMethod) row.errors.push(`HT thu "${row.paymentMethod}" không hợp lệ`);
    else if (!row.paymentMethod) row.errors.push('Thiếu HT thu');

    if (row.packageName) {
      const target = norm(row.packageName);
      row.resolvedPackage = packages.find((p) =>
        norm(p.name) === target ||
        norm(`${p.code} ${p.name}`) === target ||
        norm(p.code + p.name) === target,
      );
      if (!row.resolvedPackage) row.errors.push(`Gói "${row.packageName}" không tìm thấy`);
    } else {
      row.errors.push('Thiếu gói');
    }

    if (row.resolvedTxnType === 'dat_coc' && !row.receiptNo) {
      row.errors.push('Đặt cọc bắt buộc Số phiếu thu');
    }
    if ((row.resolvedTxnType === 'thanh_toan_full' || row.resolvedTxnType === 'thanh_toan_not') && !row.contractNo) {
      row.errors.push('Thanh toán bắt buộc Số HĐ');
    }
    if (row.resolvedPackage?.isChildPackage && !row.guardianName) {
      row.errors.push('Gói trẻ em bắt buộc Người giám hộ');
    }
    if (row.resolvedTxnType !== 'thanh_toan_not') {
      if (!row.packageValue || row.packageValue <= 0) row.errors.push('Thiếu giá trị gói');
    }
    if (row.resolvedTxnType === 'thanh_toan_not' && row.collectedToday <= 0
        && isBlankAmount(rawCash) && isBlankAmount(rawTransfer) && isBlankAmount(rawCard)) {
      row.errors.push('Thanh toán nốt phải có số tiền thu');
    }

    // PR-SALES-EXCEL-IMPORT-SPLIT: payment breakdown resolution.
    if (row.resolvedPayMethod) {
      const method = row.resolvedPayMethod;
      const split = isSplitPayment(method);
      const active = new Set(getActivePaymentFields(method));
      const parsedCash = parseAmount(rawCash);
      const parsedTransfer = parseAmount(rawTransfer);
      const parsedCard = parseAmount(rawCard);

      // Inactive bucket có giá trị > 0 → invalid (tránh sai dữ liệu).
      if (!active.has('cash') && parsedCash > 0) {
        row.errors.push(`Cột Tiền mặt phải trống khi HT thu = ${PAYMENT_METHOD_LABEL[method]}`);
      }
      if (!active.has('transfer') && parsedTransfer > 0) {
        row.errors.push(`Cột Chuyển khoản phải trống khi HT thu = ${PAYMENT_METHOD_LABEL[method]}`);
      }
      if (!active.has('card') && parsedCard > 0) {
        row.errors.push(`Cột POS phải trống khi HT thu = ${PAYMENT_METHOD_LABEL[method]}`);
      }

      let collected = row.collectedToday;
      let breakdownInput: Partial<PaymentBreakdown> | undefined;

      if (!split) {
        // Single method — derive breakdown từ collectedToday (hoặc cột active nếu user nhập).
        const k = active.values().next().value as 'cash' | 'transfer' | 'card';
        let activeRaw = '';
        if (k === 'cash') activeRaw = rawCash;
        else if (k === 'transfer') activeRaw = rawTransfer;
        else activeRaw = rawCard;
        if (!isBlankAmount(activeRaw)) {
          const parsedActive = parseAmount(activeRaw);
          // Nếu user nhập cả 2 (Thu hôm nay + cột active) → phải khớp
          if (collected > 0 && parsedActive !== collected) {
            row.errors.push('Thu hôm nay không khớp tổng các hình thức thanh toán.');
          } else if (collected === 0) {
            collected = parsedActive;
          }
        }
        // Single: breakdownInput undefined → normalize tự gán collected vào bucket active.
        breakdownInput = undefined;
      } else {
        // Combo method — bắt buộc 2 ô active có giá trị, tự tính collected nếu trống.
        const sumSplit = parsedCash + parsedTransfer + parsedCard;
        if (collected === 0 && sumSplit > 0) {
          collected = sumSplit;
        } else if (collected > 0 && sumSplit > 0 && sumSplit !== collected) {
          row.errors.push('Thu hôm nay không khớp tổng các hình thức thanh toán.');
        }
        breakdownInput = { cash: parsedCash, transfer: parsedTransfer, card: parsedCard };
      }

      row.resolvedCollected = collected;
      const bd = normalizePaymentBreakdown(method, collected, breakdownInput);
      row.resolvedBreakdown = bd;

      // Validate qua helper (chỉ chạy nếu chưa có error breakdown — tránh duplicate message).
      const hadBreakdownErr = row.errors.some((e) =>
        e.includes('Vui lòng nhập đủ số tiền cho 2 hình thức thanh toán')
        || e.includes('Cột Tiền mặt phải trống')
        || e.includes('Cột Chuyển khoản phải trống')
        || e.includes('Cột POS phải trống')
        || e.includes('Thu hôm nay không khớp'),
      );
      if (!hadBreakdownErr) {
        const v = validatePaymentBreakdown(method, collected, bd);
        if (!v.ok) row.errors.push(v.error);
      }

      if (row.resolvedTxnType === 'thanh_toan_full' && row.packageValue > 0 && collected < row.packageValue) {
        row.errors.push('Thanh toán full phải thu đủ giá trị gói');
      }
    } else {
      // Không có method → giữ collected từ cell 10 cho upstream.
      row.resolvedCollected = row.collectedToday;
    }

    result.push(row);
  }
  return result;
}
