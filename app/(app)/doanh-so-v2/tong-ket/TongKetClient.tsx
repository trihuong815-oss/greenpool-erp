'use client';

// Tổng kết tháng client.
// Phase 5 (2026-06-17).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, TrendingUp, Wallet, AlertTriangle, Users, Dumbbell, Tag } from 'lucide-react';
import { BRANCHES } from '@/lib/branches';
import type { BranchId } from '@/lib/branches';
import type { ScopeRole } from '@/lib/sales-v2/scope';
import type { SalesV2Source } from '@/lib/types/sales-v2';
import { SOURCE_LABEL } from '@/lib/types/sales-v2';
import { SkeletonKpiGrid, SkeletonCard } from '@/components/ui/Skeleton';

interface Summary {
  ok: true;
  month: string;
  scope: { branchId: string | null; saleId: string | null };
  totals: { sales: number; collected: number; debtGenerated: number; debtRemaining: number; transactions: number };
  bySource: Record<SalesV2Source, { count: number; sales: number; collected: number }>;
  byPackage: Record<string, { name: string; count: number; sales: number; collected: number; isCustomQuantity?: boolean; unitName?: string }>;
  bySale: Record<string, { name: string; count: number; sales: number; collected: number }>;
  byBranch: Record<string, { name: string; count: number; sales: number; collected: number }>;
  // V6 PT (2026-06-17)
  ptTotals?: { transactions: number; sessions: number; sales: number };
  ptByPackage?: Record<string, { name: string; count: number; sessions: number; sales: number; collected: number; unitName: string }>;
  // V7 Promo (2026-06-18)
  promoTotals?: { transactions: number; totalDiscount: number; totalBonusSessions: number; totalBonusDays: number };
  promoByCode?: Record<string, { code: string; name: string; type: string; count: number; discount: number; bonusSessions: number; bonusDays: number }>;
  // V8.X (2026-06-18) — danh sách KH chi tiết theo Sale (replace PT card)
  salesCustomers?: Record<string, SaleCustomers>;
}

interface SaleCustomerTx {
  id: string;
  date: string;
  customerName: string;
  phone: string;
  packageName: string;
  packageValue: number;
  collectedToday: number;
  debtAmount: number;
  originalDebt: number;
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

interface Props {
  scope: ScopeRole;
}

function currentMonthVN(): string {
  const ms = Date.now() + 7 * 3600 * 1000;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function fmtMonth(ym: string): string {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
  const [y, m] = ym.split('-');
  return `${m}/${y}`;
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default function TongKetClient({ scope }: Props) {
  const [month, setMonth] = useState<string>(currentMonthVN());
  const [branchId, setBranchId] = useState<BranchId | 'all'>('all');
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showBranchFilter = scope === 'top';

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ month });
      if (showBranchFilter && branchId !== 'all') qs.set('branchId', branchId);
      const r = await fetch(`/api/sales-v2/monthly-summary?${qs.toString()}`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      const j = await r.json();
      setData(j as Summary);
    } catch (e: any) {
      setError(e?.message ?? 'Lỗi tải');
    } finally {
      setLoading(false);
    }
  }, [month, branchId, showBranchFilter]);

  useEffect(() => { void fetchSummary(); }, [fetchSummary]);

  // Top 5 packages by sales
  const topPackages = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.byPackage)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 5);
  }, [data]);

  const topSales = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.bySale)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 10);
  }, [data]);

  const topBranches = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.byBranch)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.sales - a.sales);
  }, [data]);

  const sourceMaxSales = useMemo(() => {
    if (!data) return 0;
    return Math.max(...Object.values(data.bySource).map((s) => s.sales), 1);
  }, [data]);

  // V8.X (2026-06-18): bỏ PT card → thay bằng 'Khách hàng theo Sale'.
  // PT data vẫn còn ở /nhap + /cong-no.

  // V7 Promo (2026-06-18)
  const promoTopByDiscount = useMemo(() => {
    if (!data?.promoByCode) return [];
    return Object.values(data.promoByCode)
      .filter((p) => p.discount > 0 || p.bonusSessions > 0 || p.bonusDays > 0)
      .sort((a, b) => (b.discount + b.bonusSessions * 1000 + b.bonusDays * 1000) - (a.discount + a.bonusSessions * 1000 + a.bonusDays * 1000))
      .slice(0, 10);
  }, [data]);
  const hasPromoData = (data?.promoTotals?.transactions ?? 0) > 0;

  return (
    <div className="flex-1 p-3 md:p-5 bg-slate-50 overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-4">
        {/* Header + month picker */}
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold text-slate-800">Tổng kết tháng {fmtMonth(month)}</h1>
              <p className="mt-1 text-sm text-slate-600">
                {scope === 'sale'
                  ? 'Dữ liệu cá nhân của bạn (chỉ tính giao dịch đã được kế toán duyệt).'
                  : scope === 'top'
                    ? 'Toàn hệ thống (chỉ data đã đối chiếu chính thức).'
                    : 'Dữ liệu cơ sở bạn quản lý (đã đối chiếu).'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMonth(shiftMonth(month, -1))}
                className="p-2 rounded-lg ring-1 ring-slate-200 hover:bg-slate-50"
                title="Tháng trước"
              >
                <ChevronLeft size={16} />
              </button>
              <input
                type="month"
                value={month}
                max={currentMonthVN()}
                onChange={(e) => setMonth(e.target.value)}
                className="px-3 py-2 rounded-lg bg-white text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => setMonth(shiftMonth(month, 1))}
                disabled={month >= currentMonthVN()}
                className="p-2 rounded-lg ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Tháng sau"
              >
                <ChevronRight size={16} />
              </button>
              {showBranchFilter && (
                <select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value as BranchId | 'all')}
                  className="px-3 py-2 rounded-lg bg-white text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="all">Tất cả cơ sở</option>
                  {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              )}
            </div>
          </div>
        </div>

        {/* KPI cards */}
        {loading ? (
          <div className="space-y-3">
            <SkeletonKpiGrid count={5} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <SkeletonCard lines={4} />
              <SkeletonCard lines={4} />
            </div>
          </div>
        ) : error ? (
          <div className="card text-center py-12 text-rose-600 text-sm">⚠️ {error}</div>
        ) : !data ? null : data.totals.transactions === 0 ? (
          <div className="card text-center py-16 text-slate-400">
            <div className="text-5xl mb-3">📭</div>
            <div className="text-base font-medium text-slate-600">Tháng {fmtMonth(month)} chưa có giao dịch nào đã đối chiếu</div>
            <div className="text-sm mt-1.5">Dashboard chỉ tính dữ liệu đã được kế toán duyệt chính thức.</div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <KpiCard label="Số giao dịch" value={data.totals.transactions.toString()} icon={<Users size={18} />} tone="slate" />
              <KpiCard label="Doanh số" value={fmtMoney(data.totals.sales)} icon={<TrendingUp size={18} />} tone="emerald" />
              <KpiCard label="Thực thu" value={fmtMoney(data.totals.collected)} icon={<Wallet size={18} />} tone="sky" />
              <KpiCard label="Công nợ phát sinh" value={fmtMoney(data.totals.debtGenerated)} icon={<AlertTriangle size={18} />} tone="amber" />
              <KpiCard label="Công nợ còn lại" value={fmtMoney(data.totals.debtRemaining)} icon={<AlertTriangle size={18} />} tone="rose" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* By source */}
              <div className="card">
                <h3 className="text-sm font-bold text-slate-800 mb-3">Doanh số theo nguồn</h3>
                <div className="space-y-2">
                  {(Object.keys(data.bySource) as SalesV2Source[]).map((src) => {
                    const b = data.bySource[src];
                    const pct = Math.round((b.sales / sourceMaxSales) * 100);
                    return (
                      <div key={src}>
                        <div className="flex items-center justify-between text-xs mb-0.5">
                          <span className="text-slate-700">{SOURCE_LABEL[src]}</span>
                          <span className="text-slate-600 tabular-nums">
                            {b.count} GD · <strong>{fmtMoney(b.sales)}</strong>
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Top packages */}
              <div className="card">
                <h3 className="text-sm font-bold text-slate-800 mb-3">Top 5 gói doanh số cao</h3>
                {topPackages.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-sm">Chưa có dữ liệu</div>
                ) : (
                  <div className="space-y-2">
                    {topPackages.map((p, i) => (
                      <div key={p.id} className="flex items-center gap-2 text-sm">
                        <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center tabular-nums">{i + 1}</span>
                        <span className="flex-1 truncate text-slate-700 flex items-center gap-1.5">
                          <span className="truncate">{p.name}</span>
                          {p.isCustomQuantity && (
                            <span
                              className="shrink-0 text-[9px] uppercase font-bold text-violet-700 bg-violet-100 px-1 py-0.5 rounded ring-1 ring-violet-200"
                              title={`Gói PT — tính theo ${p.unitName || 'buổi'}`}
                            >
                              PT
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-xs text-slate-500 tabular-nums">{p.count} GD</span>
                        <span className="shrink-0 font-semibold text-emerald-700 tabular-nums">{fmtMoney(p.sales)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* V8.X (2026-06-18): thay PT card bằng 'Khách hàng theo Sale'. PT data
               vẫn còn ở /nhap + /cong-no, chỉ bỏ tổng kết PT ở /tong-ket. */}
            {data?.salesCustomers && Object.keys(data.salesCustomers).length > 0 && (
              <CustomersBySaleSection salesCustomers={data.salesCustomers} />
            )}

            {/* V7 Promo (2026-06-18): section khuyến mãi */}
            {hasPromoData && data?.promoTotals && (
              <div className="card">
                <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <Tag size={16} className="text-violet-600" />
                  Khuyến mãi tháng {fmtMonth(month)}
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <KpiCard label="Số GD áp KM" value={data.promoTotals.transactions.toString()} icon={<Tag size={18} />} tone="violet" />
                  <KpiCard label="Tổng tiền giảm" value={fmtMoney(data.promoTotals.totalDiscount)} icon={<Wallet size={18} />} tone="violet" />
                  {data.promoTotals.totalBonusSessions > 0 && (
                    <KpiCard label="Tổng buổi tặng" value={data.promoTotals.totalBonusSessions.toLocaleString()} icon={<Dumbbell size={18} />} tone="rose" />
                  )}
                  {data.promoTotals.totalBonusDays > 0 && (
                    <KpiCard label="Tổng ngày tặng" value={data.promoTotals.totalBonusDays.toLocaleString()} icon={<Wallet size={18} />} tone="sky" />
                  )}
                </div>
                {promoTopByDiscount.length > 0 && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Top chương trình theo lợi ích đã áp</div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                          <tr>
                            <th className="px-2 py-2 text-left w-10">#</th>
                            <th className="px-2 py-2 text-left">Mã</th>
                            <th className="px-2 py-2 text-left">Tên</th>
                            <th className="px-2 py-2 text-right">Số GD</th>
                            <th className="px-2 py-2 text-right">Tiền giảm</th>
                            <th className="px-2 py-2 text-right">Buổi/Ngày tặng</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {promoTopByDiscount.map((p, i) => (
                            <tr key={p.code} className="hover:bg-slate-50/60">
                              <td className="px-2 py-1.5 tabular-nums text-slate-400">{i + 1}</td>
                              <td className="px-2 py-1.5">
                                <span className="font-mono font-bold text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded ring-1 ring-violet-200 text-xs">
                                  {p.code}
                                </span>
                              </td>
                              <td className="px-2 py-1.5 text-slate-700 font-medium truncate max-w-[280px]">{p.name}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums">{p.count}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums text-emerald-700 font-semibold">{p.discount > 0 ? fmtMoney(p.discount) : '—'}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">
                                {p.bonusSessions > 0 && <span className="text-rose-700">{p.bonusSessions} buổi </span>}
                                {p.bonusDays > 0 && <span className="text-cyan-700">{p.bonusDays} ngày</span>}
                                {p.bonusSessions === 0 && p.bonusDays === 0 && '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Top Sale / Top branch — chỉ top role + accountant + qlcs */}
            {(scope === 'top' || scope === 'accountant' || scope === 'qlcs') && Object.keys(data.bySale).length > 0 && (
              <div className="card">
                <h3 className="text-sm font-bold text-slate-800 mb-3">Top Sale theo doanh số</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                      <tr>
                        <th className="px-2 py-2 text-left w-10">#</th>
                        <th className="px-2 py-2 text-left">Tên Sale</th>
                        <th className="px-2 py-2 text-right">Số GD</th>
                        <th className="px-2 py-2 text-right">Doanh số</th>
                        <th className="px-2 py-2 text-right">Thực thu</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {topSales.map((s, i) => (
                        <tr key={s.id} className="hover:bg-slate-50/60">
                          <td className="px-2 py-1.5 tabular-nums text-slate-400">{i + 1}</td>
                          <td className="px-2 py-1.5 text-slate-700 font-medium">{s.name}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{s.count}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-emerald-700">{fmtMoney(s.sales)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-sky-700">{fmtMoney(s.collected)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {scope === 'top' && topBranches.length > 0 && (
              <div className="card">
                <h3 className="text-sm font-bold text-slate-800 mb-3">Doanh số theo cơ sở</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                      <tr>
                        <th className="px-2 py-2 text-left">Cơ sở</th>
                        <th className="px-2 py-2 text-right">Số GD</th>
                        <th className="px-2 py-2 text-right">Doanh số</th>
                        <th className="px-2 py-2 text-right">Thực thu</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {topBranches.map((b) => (
                        <tr key={b.id} className="hover:bg-slate-50/60">
                          <td className="px-2 py-1.5 text-slate-700 font-medium">{b.name}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{b.count}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-emerald-700">{fmtMoney(b.sales)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-sky-700">{fmtMoney(b.collected)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function fmtMoney(v: number): string {
  return v.toLocaleString() + 'đ';
}

function KpiCard({ label, value, icon, tone }: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: 'slate' | 'emerald' | 'sky' | 'amber' | 'rose' | 'violet';
}) {
  const cls = {
    slate:   'bg-white text-slate-700 ring-slate-200',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    sky:     'bg-sky-50 text-sky-700 ring-sky-200',
    amber:   'bg-amber-50 text-amber-700 ring-amber-200',
    rose:    'bg-rose-50 text-rose-700 ring-rose-200',
    violet:  'bg-violet-50 text-violet-700 ring-violet-200',
  }[tone];
  return (
    <div className={`rounded-xl px-3 py-3 ring-1 ${cls}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{label}</span>
        <span className="opacity-50">{icon}</span>
      </div>
      <div className="text-lg font-bold tabular-nums mt-1">{value}</div>
    </div>
  );
}

// ─── V8.X (2026-06-18) — Section "Khách hàng theo Sale" với tabs ─────────────────

const TXN_TYPE_LABEL: Record<string, string> = {
  dat_coc: 'Đặt cọc', thanh_toan_full: 'Thanh toán full', thanh_toan_not: 'Trả nốt',
};
const PAY_LABEL: Record<string, string> = {
  tien_mat: 'Tiền mặt', chuyen_khoan: 'CK', pos: 'Quẹt thẻ',
};

function fmtDateShort(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

function CustomersBySaleSection({ salesCustomers }: { salesCustomers: Record<string, SaleCustomers> }) {
  const salesList = useMemo(() =>
    Object.values(salesCustomers)
      .sort((a, b) => b.totals.sales - a.totals.sales),
    [salesCustomers],
  );

  // V8.X (2026-06-19): filter cơ sở multi-select cho top role.
  // Branch options: derive từ salesList (chỉ hiện cơ sở thực sự có Sale trong tháng).
  const branchOptions = useMemo(() => {
    const map = new Map<string, { branchId: string; branchName: string; saleCount: number }>();
    for (const s of salesList) {
      const bid = s.branchId;
      if (!bid) continue;
      const existing = map.get(bid);
      if (existing) existing.saleCount += 1;
      else map.set(bid, { branchId: bid, branchName: s.branchName || bid, saleCount: 1 });
    }
    return Array.from(map.values()).sort((a, b) => a.branchName.localeCompare(b.branchName, 'vi'));
  }, [salesList]);

  // selectedBranches rỗng = "Tất cả" (default). Chỉ render filter khi >1 cơ sở
  // (Sale tự xem / QLCS 1 cơ sở → ẩn filter cho gọn).
  const [selectedBranches, setSelectedBranches] = useState<Set<string>>(new Set());
  const toggleBranch = useCallback((bid: string) => {
    setSelectedBranches((prev) => {
      const next = new Set(prev);
      if (next.has(bid)) next.delete(bid);
      else next.add(bid);
      return next;
    });
  }, []);
  const clearBranches = useCallback(() => setSelectedBranches(new Set()), []);

  // Filtered list theo selectedBranches (rỗng = không filter)
  const filteredSalesList = useMemo(() => {
    if (selectedBranches.size === 0) return salesList;
    return salesList.filter((s) => selectedBranches.has(s.branchId));
  }, [salesList, selectedBranches]);

  const [activeSaleId, setActiveSaleId] = useState<string>(() => salesList[0]?.saleId ?? '');
  // Reset activeSaleId khi danh sách filter đổi → tránh tab không highlight.
  useEffect(() => {
    if (filteredSalesList.length === 0) return;
    const stillExists = filteredSalesList.some((s) => s.saleId === activeSaleId);
    if (!stillExists) setActiveSaleId(filteredSalesList[0].saleId);
  }, [filteredSalesList, activeSaleId]);

  const active = filteredSalesList.find((s) => s.saleId === activeSaleId) ?? filteredSalesList[0];

  // Filter bar chỉ render khi >1 cơ sở trong scope hiện tại (top role).
  const showBranchFilter = branchOptions.length > 1;
  // Tabs Sale ẩn khi chỉ còn 1 Sale (sau filter HOẶC Sale tự xem).
  const showTabs = filteredSalesList.length > 1;
  // Chip cơ sở trong nút Sale: ẨN khi đang focus 1 cơ sở (selectedBranches.size===1
  // hoặc branchOptions.length===1 — chỉ 1 cơ sở trong scope).
  const hideSaleBranchChip =
    branchOptions.length === 1 || selectedBranches.size === 1;

  // Empty state: filter ra 0 Sale (user uncheck hết)
  if (!active) {
    return (
      <div className="card">
        <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
          <Users size={16} className="text-emerald-600" />
          Khách hàng theo Sale
        </h3>
        {showBranchFilter && (
          <BranchChipFilter
            options={branchOptions}
            selected={selectedBranches}
            onToggle={toggleBranch}
            onClear={clearBranches}
            totalSaleCount={salesList.length}
          />
        )}
        <div className="text-center text-slate-400 text-sm italic py-8">
          Không có Sale nào trong cơ sở đã chọn. Bỏ filter hoặc chọn cơ sở khác.
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
        <Users size={16} className="text-emerald-600" />
        {showTabs
          ? `Khách hàng theo Sale (${filteredSalesList.length} người · ${filteredSalesList.reduce((s, x) => s + x.totals.count, 0)} giao dịch)`
          : `Khách hàng của ${active.saleName || 'tôi'} (${active.totals.count} giao dịch)`
        }
      </h3>

      {/* V8.X: filter chip cơ sở cho top role */}
      {showBranchFilter && (
        <BranchChipFilter
          options={branchOptions}
          selected={selectedBranches}
          onToggle={toggleBranch}
          onClear={clearBranches}
          totalSaleCount={salesList.length}
        />
      )}

      {/* Tabs ngang — ẩn khi chỉ 1 Sale; overflow-x-auto cho top role nhiều Sale */}
      {showTabs && (
        <div className="flex gap-1.5 mb-4 border-b border-slate-200 pb-3 overflow-x-auto" role="tablist">
          {filteredSalesList.map((s) => {
            const isActive = s.saleId === activeSaleId;
            return (
              <button key={s.saleId} type="button" onClick={() => setActiveSaleId(s.saleId)}
                role="tab" aria-selected={isActive}
                className={`shrink-0 inline-flex flex-col items-start gap-0.5 px-3 py-2 rounded-lg text-left transition ring-1 ${
                  isActive
                    ? 'bg-emerald-600 text-white ring-emerald-600'
                    : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'
                }`}>
                <span className="text-xs font-semibold flex items-center gap-1.5">
                  {s.saleName || '(chưa rõ)'}
                  {/* V8.X: chip cơ sở ẨN khi đang focus 1 cơ sở (gọn hơn theo yêu cầu user) */}
                  {!hideSaleBranchChip && (
                    <span className={`text-xs px-1.5 py-0.5 rounded font-normal ${isActive ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>
                      {s.branchName || s.branchId}
                    </span>
                  )}
                </span>
                <span className={`text-xs tabular-nums ${isActive ? 'opacity-90' : 'text-slate-500'}`}>
                  {s.totals.count} GD · {fmtMoney(s.totals.sales)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* KPI summary của Sale active */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
        <KpiMini label="Số GD" value={active.totals.count.toString()} tone="slate" />
        <KpiMini label="Doanh số" value={fmtMoney(active.totals.sales)} tone="emerald" />
        <KpiMini label="Thực thu" value={fmtMoney(active.totals.collected)} tone="sky" />
        <KpiMini label="Nợ phát sinh" value={fmtMoney(active.totals.debtGenerated)} tone="amber" />
        <KpiMini label="Nợ còn lại" value={fmtMoney(active.totals.debtRemaining)} tone="rose" />
      </div>

      {/* Bảng chi tiết tx — U6 audit fix: sticky thead + max-h cho scroll dọc dài */}
      <div className="overflow-auto rounded-lg ring-1 ring-slate-200 max-h-[70vh]">
        <table className="w-full text-sm min-w-[1000px]">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 font-semibold sticky top-0 z-10">
            <tr>
              <th scope="col" className="px-2 py-2 text-left w-16">Ngày</th>
              <th scope="col" className="px-2 py-2 text-left">Khách hàng</th>
              <th scope="col" className="px-2 py-2 text-left">SĐT</th>
              <th scope="col" className="px-2 py-2 text-left">Gói</th>
              <th scope="col" className="px-2 py-2 text-left w-28">Loại GD</th>
              <th scope="col" className="px-2 py-2 text-left w-20">HT thu</th>
              <th scope="col" className="px-2 py-2 text-right w-28">Giá trị</th>
              <th scope="col" className="px-2 py-2 text-right w-28">Thực thu</th>
              <th scope="col" className="px-2 py-2 text-right w-28">Công nợ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {active.transactions.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400 text-sm italic">
                Sale này chưa có giao dịch nào đã đối chiếu trong tháng
              </td></tr>
            ) : (
              active.transactions.map((tx) => {
                const isDatCoc = tx.transactionType === 'dat_coc';
                const isTraNot = tx.transactionType === 'thanh_toan_not';
                const isLinked = tx.matchedTransactionId != null;
                // U7 audit fix: row trả nốt giữ bg violet kể cả khi hover (signal phân loại quan trọng hơn hover)
                return (
                  <tr key={tx.id} className={isTraNot ? 'bg-violet-50/30 hover:bg-violet-100/40' : 'hover:bg-slate-50/60'}>
                    <td className="px-2 py-1.5 text-slate-500 tabular-nums whitespace-nowrap">{fmtDateShort(tx.date)}</td>
                    <td className="px-2 py-1.5 text-slate-800 font-medium">{tx.customerName || '—'}</td>
                    <td className="px-2 py-1.5 text-slate-600 tabular-nums">{tx.phone || '—'}</td>
                    <td className="px-2 py-1.5 text-slate-700 truncate max-w-[200px]" title={tx.packageName}>{tx.packageName}</td>
                    <td className="px-2 py-1.5">
                      <span className={`text-xs uppercase font-semibold px-1.5 py-0.5 rounded ring-1 ${
                        isDatCoc ? 'bg-amber-50 text-amber-700 ring-amber-200'
                        : isTraNot ? 'bg-violet-50 text-violet-700 ring-violet-200'
                        : 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                      }`}>{TXN_TYPE_LABEL[tx.transactionType] ?? tx.transactionType}</span>
                    </td>
                    <td className="px-2 py-1.5 text-xs text-slate-600">{PAY_LABEL[tx.paymentMethod] ?? tx.paymentMethod}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {isTraNot ? <span className="text-slate-300 text-xs" title="Trả nốt — không tạo doanh số mới">—</span> : tx.packageValue.toLocaleString()}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-sky-700 font-medium">{tx.collectedToday.toLocaleString()}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {isDatCoc ? (
                        tx.debtAmount > 0 ? (
                          <span className="text-rose-700 font-semibold" title={`Đã trả nốt ${(tx.originalDebt - tx.debtAmount).toLocaleString()}đ / ${tx.originalDebt.toLocaleString()}đ`}>
                            {tx.debtAmount.toLocaleString()}
                            {tx.originalDebt > tx.debtAmount && (
                              <span className="block text-xs text-slate-400 font-normal">/ {tx.originalDebt.toLocaleString()}</span>
                            )}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-semibold" title="Đã trả đủ nốt">
                            ✓ Đã trả đủ
                          </span>
                        )
                      ) : isTraNot ? (
                        <span className="text-xs text-violet-600 italic" title={isLinked ? `Link với tx ${tx.matchedTransactionId}` : 'Chưa link'}>
                          {isLinked ? '→ link tx cũ' : tx.matchStatus === 'needs_review' ? 'Cần review' : 'Chưa link'}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** V8.X (2026-06-19): chip filter cơ sở multi-select cho top role.
 *  Chip "Tất cả" reset filter. Multi-select để xem 2-3 cơ sở cùng lúc.
 *  Mỗi chip cơ sở hiển thị (count) = số Sale active trong tháng. */
function BranchChipFilter({ options, selected, onToggle, onClear, totalSaleCount }: {
  options: Array<{ branchId: string; branchName: string; saleCount: number }>;
  selected: Set<string>;
  onToggle: (bid: string) => void;
  onClear: () => void;
  totalSaleCount: number;
}) {
  const isAll = selected.size === 0;
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-3">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 mr-1">Cơ sở:</span>
      <button
        type="button"
        onClick={onClear}
        aria-pressed={isAll}
        className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition ring-1 ${
          isAll
            ? 'bg-emerald-600 text-white ring-emerald-600'
            : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
        }`}
      >
        Tất cả
        <span className={`text-xs tabular-nums ${isAll ? 'opacity-90' : 'text-slate-400'}`}>
          ({totalSaleCount})
        </span>
      </button>
      {options.map((opt) => {
        const active = selected.has(opt.branchId);
        return (
          <button
            key={opt.branchId}
            type="button"
            onClick={() => onToggle(opt.branchId)}
            aria-pressed={active}
            className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition ring-1 ${
              active
                ? 'bg-emerald-600 text-white ring-emerald-600'
                : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            {opt.branchName}
            <span className={`text-xs tabular-nums ${active ? 'opacity-90' : 'text-slate-400'}`}>
              ({opt.saleCount})
            </span>
          </button>
        );
      })}
    </div>
  );
}

function KpiMini({ label, value, tone }: { label: string; value: string; tone: 'slate'|'emerald'|'sky'|'amber'|'rose' }) {
  const cls = {
    slate:   'bg-slate-50 text-slate-700 ring-slate-200',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    sky:     'bg-sky-50 text-sky-700 ring-sky-200',
    amber:   'bg-amber-50 text-amber-700 ring-amber-200',
    rose:    'bg-rose-50 text-rose-700 ring-rose-200',
  }[tone];
  return (
    <div className={`rounded-lg px-3 py-2 ring-1 ${cls}`}>
      <div className="text-xs font-semibold uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-sm font-bold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
