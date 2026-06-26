'use client';

// Excel import — Sale paste TSV/CSV từ Excel/Google Sheets vào textarea.
// Parser tách dòng, validate per cell, hiển thị preview, push valid rows vào localRows.
// Phase 6 (2026-06-17).
// PR-SALES-EXCEL-IMPORT-SPLIT (2026-06-24): hỗ trợ 6 HT thu + 3 cột breakdown
// (Tiền mặt / Chuyển khoản / POS). Parser tách ra lib/sales-v2/excel-import-parser.ts.

import { useMemo, useState } from 'react';
import { X, Upload, AlertCircle, Check, FileSpreadsheet } from 'lucide-react';
import { TRANSACTION_TYPE_LABEL, PAYMENT_METHOD_LABEL } from '@/lib/types/sales-v2';
import type { SalesV2Package } from '@/lib/sales-v2/packages';
import { type LocalRow, makeEmptyRow } from './SalesGrid';
import { parseExcelRows, type ParsedExcelRow } from '@/lib/sales-v2/excel-import-parser';
import { getActivePaymentFields, isSplitPayment } from '@/lib/sales-v2/payment-split';

interface Props {
  packages: SalesV2Package[];
  onClose: () => void;
  onImport: (rows: LocalRow[]) => void;
}

// Column hint cho Sale — phản ánh đầy đủ 15 cột (3 cuối optional cho combo).
const COLUMN_HINT = 'Tên KH | SĐT | Người giám hộ | Nguồn | Gói | Loại GD | HT thu | Số PT | Số HĐ | Giá trị | Thu | Ghi chú | Tiền mặt | Chuyển khoản | POS';

export default function ExcelImportModal({ packages, onClose, onImport }: Props) {
  const [text, setText] = useState('');
  const parsed = useMemo<ParsedExcelRow[]>(() => parseExcelRows(text, packages), [text, packages]);

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
      lr.packageIsCustomQuantity = r.resolvedPackage!.isCustomQuantity === true;
      lr.packageManualPriceWithQty = r.resolvedPackage!.manualPriceWithQuantity === true;
      lr.transactionType = r.resolvedTxnType!;
      lr.paymentMethod = r.resolvedPayMethod!;
      lr.packageValue = r.resolvedTxnType === 'thanh_toan_not' || r.resolvedPackage!.isCustomQuantity
        ? ''
        : String(r.packageValue);
      // PR-SALES-EXCEL-IMPORT-SPLIT: dùng resolvedCollected (đã tự tính cho combo nếu Thu hôm nay trống).
      lr.collectedToday = String(r.resolvedCollected);
      // PR-SALES-EXCEL-IMPORT-SPLIT: gán breakdown đã resolve. NhapClient.POST đọc paymentCash/Transfer/Card.
      const bd = r.resolvedBreakdown ?? { cash: 0, transfer: 0, card: 0 };
      lr.paymentCash = bd.cash > 0 ? String(bd.cash) : '';
      lr.paymentTransfer = bd.transfer > 0 ? String(bd.transfer) : '';
      lr.paymentCard = bd.card > 0 ? String(bd.card) : '';
      lr.receiptNo = r.receiptNo;
      lr.contractNo = r.contractNo;
      lr.note = r.note;
      lr.promoSnapshots = [];
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
            <div className="font-mono text-xs leading-relaxed">{COLUMN_HINT}</div>
            <div className="mt-1.5 text-emerald-700 space-y-0.5">
              <div>💡 Cột "Số PT" required cho Đặt cọc. Cột "Số HĐ" required cho Thanh toán full/nốt.</div>
              <div>💡 HT thu 1 hình thức (Tiền mặt / Chuyển khoản / POS): chỉ cần cột "Thu hôm nay", 3 cột cuối có thể để trống.</div>
              <div>💡 HT thu 2 hình thức (vd "Tiền mặt + Chuyển khoản"): bắt buộc nhập đủ 2 cột tiền tương ứng, cột còn lại để trống.</div>
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
            placeholder={'Bé Minh\t0901234567\tNguyễn Văn A\tNguồn cá nhân\tHọc bơi cơ bản trẻ em\tĐặt cọc\tTiền mặt\tPT001\t\t5000000\t2000000\t\nAnh Nam\t0907777777\t\tWalkin\tThẻ năm\tThanh toán full\tTiền mặt + Chuyển khoản\t\tHD001\t6000000\t6000000\t\t2000000\t4000000\t'}
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
                <table className="w-full min-w-[1300px] text-xs">
                  <thead className="bg-slate-50 sticky top-0 text-xs uppercase text-slate-500 font-semibold">
                    <tr>
                      <th className="px-2 py-2 text-left w-8">#</th>
                      <th className="px-2 py-2 text-left">Tên KH</th>
                      <th className="px-2 py-2 text-left">SĐT</th>
                      <th className="px-2 py-2 text-left">Gói</th>
                      <th className="px-2 py-2 text-left">Loại GD</th>
                      <th className="px-2 py-2 text-left">HT thu</th>
                      <th className="px-2 py-2 text-right">Tiền mặt</th>
                      <th className="px-2 py-2 text-right">Chuyển khoản</th>
                      <th className="px-2 py-2 text-right">POS</th>
                      <th className="px-2 py-2 text-right">Giá trị</th>
                      <th className="px-2 py-2 text-right">Thu</th>
                      <th className="px-2 py-2 text-left">Lỗi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsed.map((r, i) => {
                      const ok = r.errors.length === 0;
                      const m = r.resolvedPayMethod;
                      const active = m ? new Set(getActivePaymentFields(m)) : new Set<string>();
                      const split = m ? isSplitPayment(m) : false;
                      const bd = r.resolvedBreakdown ?? { cash: 0, transfer: 0, card: 0 };
                      const renderAmount = (key: 'cash' | 'transfer' | 'card', value: number) => {
                        if (!m) return <span className="text-slate-300">—</span>;
                        if (!active.has(key)) return <span className="text-slate-300">—</span>;
                        const cls = split ? 'text-violet-700 font-semibold' : 'text-slate-700';
                        return <span className={`tabular-nums ${cls}`}>{value.toLocaleString()}</span>;
                      };
                      return (
                        <tr key={i} className={ok ? 'bg-emerald-50/30' : 'bg-rose-50/30'}>
                          <td className="px-2 py-1.5 text-slate-400 tabular-nums">{r.rowIdx}</td>
                          <td className="px-2 py-1.5 text-slate-700 font-medium">{r.customerName || <span className="text-slate-300">∅</span>}</td>
                          <td className="px-2 py-1.5 tabular-nums">{r.phone}</td>
                          <td className="px-2 py-1.5 text-slate-600 truncate max-w-[140px]">{r.resolvedPackage?.name ?? r.packageName}</td>
                          <td className="px-2 py-1.5 text-slate-600">{r.resolvedTxnType ? TRANSACTION_TYPE_LABEL[r.resolvedTxnType] : r.transactionType}</td>
                          <td className="px-2 py-1.5 text-slate-600">
                            {m ? PAYMENT_METHOD_LABEL[m] : <span className="text-rose-500">{r.paymentMethod || '∅'}</span>}
                          </td>
                          <td className="px-2 py-1.5 text-right">{renderAmount('cash', bd.cash)}</td>
                          <td className="px-2 py-1.5 text-right">{renderAmount('transfer', bd.transfer)}</td>
                          <td className="px-2 py-1.5 text-right">{renderAmount('card', bd.card)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{r.packageValue.toLocaleString()}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{r.resolvedCollected.toLocaleString()}</td>
                          <td className="px-2 py-1.5">
                            {ok ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                                <Check size={11} /> OK
                              </span>
                            ) : (
                              <span className="text-rose-700 text-xs">Dòng {r.rowIdx}: {r.errors.join('; ')}</span>
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
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Check size={14} /> Thêm {stats.valid} dòng vào bảng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
