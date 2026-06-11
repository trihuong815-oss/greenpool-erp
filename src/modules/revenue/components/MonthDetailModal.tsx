'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  X, Loader2, Search, Download, Package, User, ListChecks,
} from 'lucide-react';

interface DetailLine {
  saleId: string;
  saleName: string;
  packageId: string;
  packageName: string;
  groupId: string;
  groupName: string;
  periodType: 'month' | 'day';
  period: string;
  day: number | null;
  quantity: number;
  unitPrice: number;
  revenue: number;
}

interface BySale { saleId: string; saleName: string; qty: number; revenue: number; }

interface MonthDetailResp {
  branchId: string; year: number; month: number;
  totalQty: number; totalRevenue: number; lineCount: number;
  lines: DetailLine[];
  // byPackage đã loại bỏ khỏi response (UI không dùng sau khi simplify form).
  bySale: BySale[];
  hasDayMode: boolean;
}

interface Props {
  branchId: string;
  branchName: string;
  year: number;
  month: number;
  onClose: () => void;
}

type View = 'lines' | 'bySale';

const BRAND_EMERALD = '#059669';

function fmtMoney(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2).replace('.', ',')} tỷ`;
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)} tr`;
  return n.toLocaleString('vi-VN');
}
function fmtNum(n: number): string {
  return n.toLocaleString('vi-VN');
}

export function MonthDetailModal({ branchId, branchName, year, month, onClose }: Props) {
  const [data, setData] = useState<MonthDetailResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('lines');
  const [filterSale, setFilterSale] = useState<string>(''); // saleId or ''
  const [keyword, setKeyword] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/sales/month-detail?branchId=${encodeURIComponent(branchId)}&year=${year}&month=${month}`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j?.error ?? `HTTP ${r.status}`);
        }
        return r.json() as Promise<MonthDetailResp>;
      })
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [branchId, year, month]);

  // Distinct sales cho filter
  const distinctSales = useMemo<BySale[]>(() => data?.bySale ?? [], [data]);

  const filteredLines = useMemo(() => {
    if (!data) return [];
    const kw = keyword.toLowerCase().trim();
    return data.lines.filter((l) => {
      if (filterSale && l.saleId !== filterSale) return false;
      if (kw && !l.saleName.toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [data, filterSale, keyword]);

  const subTotal = useMemo(() => filteredLines.reduce((s, l) => s + l.revenue, 0), [filteredLines]);

  function exportCSV() {
    if (!data) return;
    const header = ['Sale', 'Kỳ', 'Doanh số'];
    const rows = filteredLines.map((l) => [
      l.saleName,
      l.day ? `${String(l.day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}` : `${String(month).padStart(2, '0')}/${year}`,
      l.revenue,
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => {
      const s = String(c);
      return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\n');
    const blob = new Blob(['' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `doanh-so_${branchId}_${year}-${String(month).padStart(2, '0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-medium uppercase tracking-wider text-emerald-50/80">{branchName}</div>
              <h2 className="text-base font-bold mt-0.5">Chi tiết Tháng {month}/{year}</h2>
            </div>
            <button onClick={onClose} className="text-white/80 hover:text-white"><X size={20} /></button>
          </div>
          {data && (
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg bg-white/15 px-3 py-2 backdrop-blur-sm">
                <div className="text-emerald-50/80 uppercase text-[9px] tracking-wider">Tổng doanh số</div>
                <div className="text-lg font-bold tabular-nums">{fmtMoney(data.totalRevenue)}</div>
              </div>
              <div className="rounded-lg bg-white/15 px-3 py-2 backdrop-blur-sm">
                <div className="text-emerald-50/80 uppercase text-[9px] tracking-wider">Số sale có doanh số</div>
                <div className="text-lg font-bold tabular-nums">{fmtNum(data.bySale.length)}</div>
              </div>
              <div className="rounded-lg bg-white/15 px-3 py-2 backdrop-blur-sm">
                <div className="text-emerald-50/80 uppercase text-[9px] tracking-wider">Số dòng nhập</div>
                <div className="text-lg font-bold tabular-nums">{data.lineCount}{data.hasDayMode && <span className="ml-1 text-[10px] font-normal">(theo ngày)</span>}</div>
              </div>
            </div>
          )}
        </div>

        {/* Toolbar */}
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/50 flex items-center gap-2 flex-wrap">
          {/* View toggle */}
          <div className="flex gap-1 bg-slate-100 p-0.5 rounded-lg text-xs">
            {([
              { k: 'lines', icon: ListChecks, label: 'Theo dòng (audit)' },
              { k: 'bySale', icon: User, label: 'Theo Sale' },
            ] as const).map((t) => (
              <button
                key={t.k}
                onClick={() => setView(t.k)}
                className={`px-2.5 py-1 rounded font-medium inline-flex items-center gap-1 transition ${
                  view === t.k ? 'bg-white shadow text-emerald-700' : 'text-slate-600 hover:bg-white/50'
                }`}
              >
                <t.icon size={11} />{t.label}
              </button>
            ))}
          </div>

          {/* Filter sale + group + keyword (chỉ ở view 'lines') */}
          {view === 'lines' && (
            <>
              {distinctSales.length > 1 && (
                <select value={filterSale} onChange={(e) => setFilterSale(e.target.value)} className="text-xs px-2 py-1 border border-slate-300 rounded">
                  <option value="">Tất cả sale</option>
                  {distinctSales.map((s) => (
                    <option key={s.saleId} value={s.saleId}>{s.saleName}</option>
                  ))}
                </select>
              )}
              <div className="inline-flex items-center gap-1 px-2 py-1 border border-slate-300 rounded">
                <Search size={11} className="text-slate-400" />
                <input
                  value={keyword} onChange={(e) => setKeyword(e.target.value)}
                  placeholder="Tìm theo tên sale…"
                  className="text-xs outline-none w-36 bg-transparent"
                />
              </div>
            </>
          )}

          <div className="flex-1" />
          {data && data.lineCount > 0 && (
            <button onClick={exportCSV} className="text-xs px-2.5 py-1 inline-flex items-center gap-1 text-emerald-700 hover:bg-emerald-50 rounded font-semibold">
              <Download size={12} /> Xuất CSV
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="text-center py-16 text-slate-500">
              <Loader2 size={20} className="inline animate-spin mr-2" /> Đang tải...
            </div>
          ) : error ? (
            <div className="m-5 p-3 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">{error}</div>
          ) : !data || data.lineCount === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Package size={28} className="mx-auto mb-2 text-slate-300" />
              <p className="text-sm">Tháng {month}/{year} chưa có dữ liệu nhập cho cơ sở {branchId}.</p>
              <a href={`/doanh-so/nhap?year=${year}&month=${month}&branchId=${branchId}`}
                 className="mt-2 inline-block text-xs text-emerald-700 hover:underline font-semibold">
                Mở trang nhập doanh số →
              </a>
            </div>
          ) : view === 'lines' ? (
            <LinesTable lines={filteredLines} subTotal={subTotal} month={month} year={year} />
          ) : (
            <BySaleTable rows={data.bySale} total={data.totalRevenue} />
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-end gap-2 bg-slate-50/40">
          <a
            href={`/doanh-so/nhap?year=${year}&month=${month}&branchId=${branchId}`}
            className="text-xs text-emerald-700 hover:underline font-semibold"
          >
            Mở trang nhập doanh số →
          </a>
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Đóng</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
function LinesTable({ lines, subTotal, month, year }: {
  lines: DetailLine[]; subTotal: number; month: number; year: number;
}) {
  if (lines.length === 0) {
    return <div className="py-12 text-center text-sm text-slate-400">Không có dòng nào khớp filter.</div>;
  }
  return (
    <table className="w-full text-xs tabular-nums">
      <thead className="sticky top-0 bg-emerald-50 text-emerald-900 z-10">
        <tr>
          <th className="px-3 py-2 text-left font-semibold w-10">#</th>
          <th className="px-3 py-2 text-left font-semibold">Sale</th>
          <th className="px-3 py-2 text-center font-semibold w-28">Kỳ</th>
          <th className="px-3 py-2 text-right font-semibold w-40">Doanh số</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l, i) => (
          <tr key={`${l.saleId}__${l.period}__${i}`} className={`border-t border-slate-100 ${i % 2 === 1 ? 'bg-slate-50/40' : ''} hover:bg-emerald-50/40`}>
            <td className="px-3 py-1.5 text-slate-400">{i + 1}</td>
            <td className="px-3 py-1.5 font-medium text-slate-800">{l.saleName === 'Tổng cơ sở' ? <em className="text-slate-500">{l.saleName}</em> : l.saleName}</td>
            <td className="px-3 py-1.5 text-center text-slate-500">
              {l.day
                ? `${String(l.day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
                : <span className="text-slate-400">Tháng {month}/{year}</span>}
            </td>
            <td className="px-3 py-1.5 text-right font-bold" style={{ color: BRAND_EMERALD }}>{fmtMoney(l.revenue)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot className="sticky bottom-0 bg-gradient-to-r from-emerald-100 to-teal-50 font-bold text-emerald-900">
        <tr className="border-t-2 border-emerald-300">
          <td colSpan={3} className="px-3 py-2 text-right">Tổng ({lines.length} dòng)</td>
          <td className="px-3 py-2 text-right text-base">{fmtMoney(subTotal)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

function BySaleTable({ rows, total }: { rows: BySale[]; total: number }) {
  // Sort desc theo doanh số. __aggregate xếp cuối với label đặc biệt.
  const sorted = [...rows].sort((a, b) => {
    if (a.saleId === '__aggregate') return 1;
    if (b.saleId === '__aggregate') return -1;
    return b.revenue - a.revenue;
  });
  return (
    <table className="w-full text-xs tabular-nums">
      <thead className="sticky top-0 bg-emerald-50 text-emerald-900 z-10">
        <tr>
          <th className="px-3 py-2 text-left font-semibold w-10">#</th>
          <th className="px-3 py-2 text-left font-semibold"><User size={11} className="inline mr-1" /> Sale</th>
          <th className="px-3 py-2 text-right font-semibold w-40">Doanh số</th>
          <th className="px-3 py-2 text-right font-semibold w-24">% tổng</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r, i) => {
          const pct = total > 0 ? Math.round((r.revenue / total) * 100) : 0;
          const isAggregate = r.saleId === '__aggregate';
          return (
            <tr key={r.saleId} className={`border-t border-slate-100 ${i % 2 === 1 ? 'bg-slate-50/40' : ''} hover:bg-emerald-50/40`}>
              <td className="px-3 py-1.5 text-slate-400">{i + 1}</td>
              <td className="px-3 py-1.5 font-medium text-slate-800">
                {isAggregate ? <em className="text-slate-500">{r.saleName}</em> : r.saleName}
              </td>
              <td className="px-3 py-1.5 text-right font-bold" style={{ color: BRAND_EMERALD }}>{fmtMoney(r.revenue)}</td>
              <td className="px-3 py-1.5 text-right text-slate-500">{pct}%</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot className="sticky bottom-0 bg-gradient-to-r from-emerald-100 to-teal-50 font-bold text-emerald-900">
        <tr className="border-t-2 border-emerald-300">
          <td colSpan={2} className="px-3 py-2 text-right">Tổng ({sorted.length} sale)</td>
          <td className="px-3 py-2 text-right text-base">{fmtMoney(total)}</td>
          <td className="px-3 py-2 text-right">100%</td>
        </tr>
      </tfoot>
    </table>
  );
}
