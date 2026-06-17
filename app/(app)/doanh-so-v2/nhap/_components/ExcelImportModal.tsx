'use client';

// Excel import — Sale paste TSV/CSV từ Excel/Google Sheets vào textarea.
// Parser tách dòng, validate per cell, hiển thị preview, push valid rows vào localRows.
// Phase 6 (2026-06-17).

import { useMemo, useState } from 'react';
import { X, Upload, AlertCircle, Check, FileSpreadsheet } from 'lucide-react';
import type { SalesV2Source, TransactionType, PaymentMethod } from '@/lib/types/sales-v2';
import { SOURCE_LABEL, TRANSACTION_TYPE_LABEL, PAYMENT_METHOD_LABEL } from '@/lib/types/sales-v2';
import type { SalesV2Package } from '@/lib/sales-v2/packages';
import { type LocalRow, makeEmptyRow } from './SalesGrid';

interface Props {
  packages: SalesV2Package[];
  onClose: () => void;
  onImport: (rows: LocalRow[]) => void;
}

interface ParsedRow {
  rowIdx: number; // dòng trong file gốc (cho debug)
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
  // Resolved enums
  resolvedSource?: SalesV2Source;
  resolvedTxnType?: TransactionType;
  resolvedPayMethod?: PaymentMethod;
  resolvedPackage?: SalesV2Package;
  errors: string[];
}

// Reverse-lookup label → enum (case + diacritics insensitive)
function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}
const SOURCE_MAP = new Map(Object.entries(SOURCE_LABEL).map(([k, v]) => [norm(v), k as SalesV2Source]));
const TXN_MAP = new Map(Object.entries(TRANSACTION_TYPE_LABEL).map(([k, v]) => [norm(v), k as TransactionType]));
const PAY_MAP = new Map(Object.entries(PAYMENT_METHOD_LABEL).map(([k, v]) => [norm(v), k as PaymentMethod]));

const HEADER_KEYWORDS = ['ten kh', 'ten khach', 'sdt', 'phone', 'tên kh', 'tên khách'];

// Expected columns in order: Tên KH | SĐT | Người giám hộ | Nguồn | Gói | Loại GD | HT thu |
//                           Số PT | Số HĐ | Giá trị gói | Thu hôm nay | Ghi chú
const COLUMN_HINT = 'Tên KH | SĐT | Người giám hộ | Nguồn | Gói | Loại GD | HT thu | Số PT | Số HĐ | Giá trị | Thu | Ghi chú';

function parseRows(text: string, packages: SalesV2Package[]): ParsedRow[] {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  // Auto-detect TSV vs CSV (TSV from Excel paste, CSV from file)
  const firstLine = lines[0];
  const sep = firstLine.includes('\t') ? '\t' : ',';

  // Skip header row nếu dòng đầu chứa keyword
  let startIdx = 0;
  if (HEADER_KEYWORDS.some((k) => norm(firstLine).includes(norm(k)))) startIdx = 1;

  const result: ParsedRow[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const cells = lines[i].split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
    const row: ParsedRow = {
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
      packageValue: Number(cells[9]?.replace(/[.,\s]/g, '') ?? 0) || 0,
      collectedToday: Number(cells[10]?.replace(/[.,\s]/g, '') ?? 0) || 0,
      note: cells[11] ?? '',
      errors: [],
    };

    // Required base
    if (!row.customerName) row.errors.push('Thiếu tên KH');
    if (!row.phone) row.errors.push('Thiếu SĐT');
    else if (!/^0\d{9}$/.test(row.phone)) row.errors.push('SĐT phải 10 số bắt đầu 0');

    // Resolve enums
    row.resolvedSource = SOURCE_MAP.get(norm(row.source));
    if (!row.resolvedSource && row.source) row.errors.push(`Nguồn "${row.source}" không hợp lệ`);
    else if (!row.source) row.errors.push('Thiếu nguồn');

    row.resolvedTxnType = TXN_MAP.get(norm(row.transactionType));
    if (!row.resolvedTxnType && row.transactionType) row.errors.push(`Loại GD "${row.transactionType}" không hợp lệ`);
    else if (!row.transactionType) row.errors.push('Thiếu loại GD');

    row.resolvedPayMethod = PAY_MAP.get(norm(row.paymentMethod));
    if (!row.resolvedPayMethod && row.paymentMethod) row.errors.push(`HT thu "${row.paymentMethod}" không hợp lệ`);
    else if (!row.paymentMethod) row.errors.push('Thiếu HT thu');

    // Resolve package: match by full name or "code name"
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

    // Validate chứng từ theo loại GD
    if (row.resolvedTxnType === 'dat_coc' && !row.receiptNo) {
      row.errors.push('Đặt cọc bắt buộc Số phiếu thu');
    }
    if ((row.resolvedTxnType === 'thanh_toan_full' || row.resolvedTxnType === 'thanh_toan_not') && !row.contractNo) {
      row.errors.push('Thanh toán bắt buộc Số HĐ');
    }

    // Guardian required nếu gói trẻ em
    if (row.resolvedPackage?.isChildPackage && !row.guardianName) {
      row.errors.push('Gói trẻ em bắt buộc Người giám hộ');
    }

    // Tiền
    if (row.resolvedTxnType !== 'thanh_toan_not') {
      if (!row.packageValue || row.packageValue <= 0) row.errors.push('Thiếu giá trị gói');
    }
    if (!row.collectedToday || row.collectedToday < 0) {
      // Cho phép thu = 0 cho dat_coc nếu Sale chưa thu
      if (row.resolvedTxnType === 'thanh_toan_not' && row.collectedToday <= 0) {
        row.errors.push('Thanh toán nốt phải có số tiền thu');
      }
    }
    if (row.resolvedTxnType === 'thanh_toan_full' && row.collectedToday < row.packageValue) {
      row.errors.push('Thanh toán full phải thu đủ giá trị gói');
    }

    result.push(row);
  }
  return result;
}

export default function ExcelImportModal({ packages, onClose, onImport }: Props) {
  const [text, setText] = useState('');
  const parsed = useMemo(() => parseRows(text, packages), [text, packages]);

  const stats = useMemo(() => {
    let valid = 0, invalid = 0;
    for (const r of parsed) {
      if (r.errors.length === 0) valid++;
      else invalid++;
    }
    return { valid, invalid, total: parsed.length };
  }, [parsed]);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => setText(String(e.target?.result ?? ''));
    reader.readAsText(file, 'utf-8');
  };

  const handleImport = () => {
    const validRows: LocalRow[] = [];
    for (const r of parsed) {
      if (r.errors.length > 0) continue;
      const lr = makeEmptyRow();
      lr.customerName = r.customerName;
      lr.phone = r.phone;
      lr.guardianName = r.guardianName;
      lr.source = r.resolvedSource!;
      lr.packageId = r.resolvedPackage!.id;
      lr.packageCode = r.resolvedPackage!.code;
      lr.packageName = r.resolvedPackage!.name;
      lr.serviceGroup = r.resolvedPackage!.serviceGroup;
      lr.isChildPackage = r.resolvedPackage!.isChildPackage;
      lr.transactionType = r.resolvedTxnType!;
      lr.paymentMethod = r.resolvedPayMethod!;
      lr.packageValue = r.resolvedTxnType === 'thanh_toan_not' ? '' : String(r.packageValue);
      lr.collectedToday = String(r.collectedToday);
      lr.receiptNo = r.receiptNo;
      lr.contractNo = r.contractNo;
      lr.note = r.note;
      validRows.push(lr);
    }
    onImport(validRows);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-5xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <FileSpreadsheet size={18} className="text-emerald-600" />
              Nhập từ Excel / Google Sheets
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Copy nhiều dòng từ Excel (Ctrl+C) → paste vào ô bên dưới. Hệ thống tự nhận TSV (Excel) hoặc CSV (file).
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-5 space-y-3">
          {/* Column hint */}
          <div className="rounded-lg bg-emerald-50 ring-1 ring-emerald-200 px-3 py-2 text-xs text-emerald-800">
            <div className="font-semibold mb-1">Thứ tự cột (theo header Excel):</div>
            <div className="font-mono text-[11px] leading-relaxed">{COLUMN_HINT}</div>
            <div className="mt-1.5 text-emerald-700">
              💡 Cột "Số PT" required cho Đặt cọc. Cột "Số HĐ" required cho Thanh toán full/nốt.
            </div>
          </div>

          {/* File upload + textarea */}
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 cursor-pointer">
              <Upload size={14} /> Tải file CSV
              <input type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }} />
            </label>
            <span className="text-xs text-slate-400">Hoặc paste TSV trực tiếp vào ô dưới</span>
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder={'Bé Minh\t0901234567\tNguyễn Văn A\tNguồn cá nhân\tHọc bơi cơ bản trẻ em\tĐặt cọc\tTiền mặt\tPT001\t\t5000000\t2000000\t\nAnh Nam\t0907777777\t\tWalkin\t...'}
            className="w-full px-3 py-2 rounded-lg ring-1 ring-slate-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
          />

          {/* Stats */}
          {parsed.length > 0 && (
            <div className="flex items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                <Check size={12} /> {stats.valid} dòng hợp lệ
              </span>
              {stats.invalid > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 ring-1 ring-rose-200">
                  <AlertCircle size={12} /> {stats.invalid} dòng lỗi
                </span>
              )}
            </div>
          )}

          {/* Preview */}
          {parsed.length > 0 && (
            <div className="rounded-lg ring-1 ring-slate-200 overflow-hidden">
              <div className="overflow-x-auto max-h-[40vh]">
                <table className="w-full min-w-[1100px] text-xs">
                  <thead className="bg-slate-50 sticky top-0 text-[10px] uppercase text-slate-500 font-semibold">
                    <tr>
                      <th className="px-2 py-2 text-left w-8">#</th>
                      <th className="px-2 py-2 text-left">Tên KH</th>
                      <th className="px-2 py-2 text-left">SĐT</th>
                      <th className="px-2 py-2 text-left">Gói</th>
                      <th className="px-2 py-2 text-left">Loại GD</th>
                      <th className="px-2 py-2 text-right">Giá trị</th>
                      <th className="px-2 py-2 text-right">Thu</th>
                      <th className="px-2 py-2 text-left">Lỗi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsed.map((r, i) => {
                      const ok = r.errors.length === 0;
                      return (
                        <tr key={i} className={ok ? 'bg-emerald-50/30' : 'bg-rose-50/30'}>
                          <td className="px-2 py-1.5 text-slate-400 tabular-nums">{r.rowIdx}</td>
                          <td className="px-2 py-1.5 text-slate-700 font-medium">{r.customerName || <span className="text-slate-300">∅</span>}</td>
                          <td className="px-2 py-1.5 tabular-nums">{r.phone}</td>
                          <td className="px-2 py-1.5 text-slate-600 truncate max-w-[140px]">{r.resolvedPackage?.name ?? r.packageName}</td>
                          <td className="px-2 py-1.5 text-slate-600">{r.resolvedTxnType ? TRANSACTION_TYPE_LABEL[r.resolvedTxnType] : r.transactionType}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{r.packageValue.toLocaleString()}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{r.collectedToday.toLocaleString()}</td>
                          <td className="px-2 py-1.5">
                            {ok ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                                <Check size={11} /> OK
                              </span>
                            ) : (
                              <span className="text-rose-700 text-[11px]">{r.errors.join('; ')}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between gap-2">
          <div className="text-xs text-slate-500">
            {parsed.length === 0 && 'Chưa có dữ liệu — paste hoặc upload file'}
            {parsed.length > 0 && stats.invalid > 0 && `Sẽ bỏ qua ${stats.invalid} dòng lỗi`}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-lg bg-white text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            >
              Huỷ
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={stats.valid === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-b from-emerald-500 to-emerald-600 text-sm font-semibold text-white shadow-sm hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check size={14} /> Thêm {stats.valid} dòng vào bảng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
