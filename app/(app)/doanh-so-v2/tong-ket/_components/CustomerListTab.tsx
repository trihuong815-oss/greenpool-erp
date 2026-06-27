'use client';

// PR-TONGKET-CUSTOMER-LIST (2026-06-27): Tab "Danh sách khách hàng" trong /tong-ket.
// User feedback: "lưu khách hàng từng ngày sale nhập, vào mục này có thể xem
// danh sách toàn bộ khách hàng của cơ sở."
//
// Phân quyền (server enforce qua salesCustomers scope):
//   - Sale: salesCustomers chỉ có { [ownUid]: ... } → bảng chỉ KH của mình
//   - QLCS: salesCustomers tất cả sales trong cơ sở mình (server force scopeBranchId)
//   - Top: tất cả sales tất cả cơ sở (theo filter branchId nếu có)
//
// 1 hàng = 1 giao dịch (giữ lịch sử "từng ngày sale nhập" như user phát biểu).
// Sort: ngày DESC. Filter: search tên/SĐT + dropdown sale (top+QLCS có nhiều sale).

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Search, Users } from 'lucide-react';
import { BRANCH_BY_ID } from '@/lib/branches';
import type { Summary } from './types';

interface Props {
  salesCustomers: Summary['salesCustomers'];
  showBranchColumn: boolean;
}

interface Row {
  txId: string;
  date: string;
  customerName: string;
  phone: string;
  saleId: string;
  saleName: string;
  branchId: string;
  branchName: string;
  packageName: string;
  packageValue: number;
  collectedToday: number;
  debtAmount: number;
  txType: string;
}

const TX_TYPE_LABEL: Record<string, string> = {
  dat_coc: 'Đặt cọc',
  thanh_toan_du: 'Thanh toán đủ',
  thanh_toan_not: 'Thanh toán nốt',
};

function fmtVnd(n: number): string {
  return new Intl.NumberFormat('vi-VN').format(Math.round(n));
}

function fmtDate(d: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

// PR-TONGKET-PHASE2 (2026-06-27): pagination + export CSV.
// PAGE_SIZE 50 rows/page giữ render nhẹ (kể cả 5000 tx vẫn 100 page → OK).
const PAGE_SIZE = 50;

/** Escape CSV field per RFC 4180 — wrap quotes if contains comma/quote/newline. */
function csvEscape(v: string | number): string {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export default function CustomerListTab({ salesCustomers, showBranchColumn }: Props) {
  const [keyword, setKeyword] = useState('');
  const [saleFilter, setSaleFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  // Flatten salesCustomers → rows
  const allRows = useMemo<Row[]>(() => {
    if (!salesCustomers) return [];
    const out: Row[] = [];
    for (const sale of Object.values(salesCustomers)) {
      for (const tx of sale.transactions) {
        out.push({
          txId: tx.id,
          date: tx.date,
          customerName: tx.customerName || '(không tên)',
          phone: tx.phone || '',
          saleId: sale.saleId,
          saleName: sale.saleName,
          branchId: sale.branchId,
          branchName: sale.branchName,
          packageName: tx.packageName || '—',
          packageValue: tx.packageValue,
          collectedToday: tx.collectedToday,
          debtAmount: tx.debtAmount,
          txType: tx.transactionType,
        });
      }
    }
    // Sort ngày DESC
    out.sort((a, b) => b.date.localeCompare(a.date));
    return out;
  }, [salesCustomers]);

  // Sale options cho dropdown (chỉ hiện khi nhiều sale)
  const saleOptions = useMemo(() => {
    if (!salesCustomers) return [];
    return Object.values(salesCustomers).map((s) => ({ id: s.saleId, name: s.saleName || '(không tên)' }));
  }, [salesCustomers]);
  const showSaleFilter = saleOptions.length > 1;

  // Filtered
  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return allRows.filter((r) => {
      if (saleFilter !== 'all' && r.saleId !== saleFilter) return false;
      if (kw && !r.customerName.toLowerCase().includes(kw) && !r.phone.includes(kw)) return false;
      return true;
    });
  }, [allRows, keyword, saleFilter]);

  const totalCustomers = useMemo(() => {
    // Distinct theo phone (fallback name+saleId nếu thiếu phone)
    const set = new Set<string>();
    for (const r of rows) {
      const key = r.phone ? `p:${r.phone}` : `n:${r.customerName}:${r.saleId}`;
      set.add(key);
    }
    return set.size;
  }, [rows]);

  // PR-TONGKET-PHASE2: pagination.
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  // Reset về page 1 khi filter đổi.
  useEffect(() => { setPage(1); }, [keyword, saleFilter]);
  // Clamp page nếu rows thu hẹp (filter loại bớt → totalPages giảm).
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const startIdx = (page - 1) * PAGE_SIZE;
  const pagedRows = rows.slice(startIdx, startIdx + PAGE_SIZE);

  // PR-TONGKET-PHASE2: export CSV (client-side, không tốn API). Export FILTERED
  // rows (theo keyword + saleFilter hiện tại) — user mong chờ download đúng cái
  // đang xem. UTF-8 BOM để Excel mở tiếng Việt không vỡ.
  function handleExport() {
    if (rows.length === 0) return;
    const headers = ['Ngày', 'Khách hàng', 'SĐT'];
    if (showBranchColumn) headers.push('Cơ sở');
    headers.push('Sale', 'Gói', 'Doanh số', 'Thực thu', 'Công nợ', 'Loại GD');
    const lines: string[] = [headers.map(csvEscape).join(',')];
    for (const r of rows) {
      const cells: Array<string | number> = [r.date, r.customerName, r.phone];
      if (showBranchColumn) cells.push(r.branchName || r.branchId);
      cells.push(r.saleName, r.packageName, r.packageValue, r.collectedToday, r.debtAmount, TX_TYPE_LABEL[r.txType] ?? r.txType);
      lines.push(cells.map(csvEscape).join(','));
    }
    const csv = '﻿' + lines.join('\n'); // BOM cho Excel UTF-8
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `khach-hang_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (allRows.length === 0) {
    return (
      <div className="card text-center py-12">
        <Users size={32} className="mx-auto text-slate-300 mb-3" />
        <div className="text-sm font-medium text-slate-600">Chưa có khách hàng trong tháng này.</div>
        <div className="text-xs text-slate-400 mt-1">Khách hàng sẽ hiển thị sau khi Sale nhập giao dịch và kế toán duyệt.</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Header + filter */}
      <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-slate-800">Danh sách khách hàng</h3>
        <span className="text-[11px] text-slate-500 tabular-nums">
          {totalCustomers} khách · {rows.length} giao dịch
          {rows.length !== allRows.length && <> · lọc từ {allRows.length}</>}
        </span>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-2 text-slate-400" />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Tìm tên / SĐT…"
              className="pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-md bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-[180px]"
            />
          </div>
          {showSaleFilter && (
            <select
              value={saleFilter}
              onChange={(e) => setSaleFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              title="Lọc theo Sale"
            >
              <option value="all">Tất cả Sale</option>
              {saleOptions.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          {/* PR-TONGKET-PHASE2: Export CSV — download đúng filtered rows. */}
          <button
            type="button"
            onClick={handleExport}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
            title="Xuất CSV danh sách khách (theo bộ lọc hiện tại)"
          >
            <Download size={12} /> Xuất CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Ngày</th>
              <th className="px-3 py-2 text-left font-semibold">Khách hàng</th>
              <th className="px-3 py-2 text-left font-semibold">SĐT</th>
              {showBranchColumn && <th className="px-3 py-2 text-left font-semibold">Cơ sở</th>}
              <th className="px-3 py-2 text-left font-semibold">Sale</th>
              <th className="px-3 py-2 text-left font-semibold">Gói</th>
              <th className="px-3 py-2 text-right font-semibold">Doanh số</th>
              <th className="px-3 py-2 text-right font-semibold">Thực thu</th>
              <th className="px-3 py-2 text-right font-semibold">Công nợ</th>
              <th className="px-3 py-2 text-left font-semibold">Loại</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={showBranchColumn ? 10 : 9} className="px-3 py-8 text-center text-sm text-slate-400">
                  Không có khách hàng phù hợp bộ lọc.
                </td>
              </tr>
            ) : (
              pagedRows.map((r) => {
                const branch = BRANCH_BY_ID[r.branchId as keyof typeof BRANCH_BY_ID];
                return (
                  <tr key={r.txId} className="border-b border-slate-100 hover:bg-emerald-50/30 transition-colors">
                    <td className="px-3 py-2 text-xs tabular-nums text-slate-600">{fmtDate(r.date)}</td>
                    <td className="px-3 py-2 text-slate-800 font-medium">{r.customerName}</td>
                    <td className="px-3 py-2 text-xs tabular-nums text-slate-600">{r.phone || '—'}</td>
                    {showBranchColumn && (
                      <td className="px-3 py-2 text-xs">
                        <span className="inline-flex items-center gap-1.5">
                          {branch && <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: branch.color }} />}
                          <span className="text-slate-700">{branch?.shortName ?? r.branchId}</span>
                        </span>
                      </td>
                    )}
                    <td className="px-3 py-2 text-xs text-slate-700">{r.saleName}</td>
                    <td className="px-3 py-2 text-xs text-slate-700">{r.packageName}</td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-800">{fmtVnd(r.packageValue)}</td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums text-emerald-700">{fmtVnd(r.collectedToday)}</td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums">
                      {r.debtAmount > 0 ? <span className="text-rose-700 font-medium">{fmtVnd(r.debtAmount)}</span> : <span className="text-slate-400">0</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">{TX_TYPE_LABEL[r.txType] ?? r.txType}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* PR-TONGKET-PHASE2: Pagination footer (chỉ hiện khi totalPages > 1). */}
      {totalPages > 1 && (
        <div className="px-4 py-2.5 border-t border-slate-200 flex items-center justify-between gap-3 text-xs">
          <span className="text-slate-500 tabular-nums">
            Hàng {startIdx + 1}–{Math.min(startIdx + PAGE_SIZE, rows.length)} / {rows.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="inline-flex items-center gap-0.5 px-2 py-1 rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
              aria-label="Trang trước"
            >
              <ChevronLeft size={14} /> Trước
            </button>
            <span className="px-3 py-1 tabular-nums text-slate-700 font-medium">{page} / {totalPages}</span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="inline-flex items-center gap-0.5 px-2 py-1 rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
              aria-label="Trang sau"
            >
              Sau <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
