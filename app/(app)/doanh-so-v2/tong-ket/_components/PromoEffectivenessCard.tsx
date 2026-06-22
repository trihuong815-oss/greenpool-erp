'use client';

// PR-TK4C (2026-06-22) — Replace PromoSummaryCard.
// Nâng cấp từ "summary" sang "đánh giá hiệu quả tương đối".
//
// LIMITATION (đã document trong helper):
// Chưa ROI thật — chưa tính ads/quà tặng/vận hành/biên lợi nhuận/khách mới.
// Đây chỉ là "tương đối trong tháng" để gợi ý duy trì/xem lại.

import { useMemo } from 'react';
import { Tag, TrendingUp, Wallet, Users, CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react';
import KpiCard from './KpiCard';
import { fmtMoney, fmtMonth } from './utils';
import { buildPromoEffectiveness, type PromoClassification } from '@/lib/sales-v2/promo-effectiveness';
import type { Summary } from './types';

interface Props {
  month: string;
  promoTotals: NonNullable<Summary['promoTotals']>;
  promoByCode: Summary['promoByCode'];
  /** Tổng doanh số hệ thống (cho salesShare). */
  totalSystemSales: number;
}

const CLASS_BADGE: Record<PromoClassification, string> = {
  high:               'bg-emerald-50 text-emerald-700 ring-emerald-200',
  normal:             'bg-sky-50 text-sky-700 ring-sky-200',
  review:             'bg-rose-50 text-rose-700 ring-rose-200',
  insufficient_data:  'bg-amber-50 text-amber-700 ring-amber-200',
};

const CLASS_ICON: Record<PromoClassification, React.ReactNode> = {
  high:               <CheckCircle2 size={12} />,
  normal:             null,
  review:             <AlertCircle size={12} />,
  insufficient_data:  <HelpCircle size={12} />,
};

function fmtPct(p: number): string {
  return `${p.toFixed(1)}%`;
}

export default function PromoEffectivenessCard({ month, promoTotals, promoByCode, totalSystemSales }: Props) {
  const rows = useMemo(
    () => buildPromoEffectiveness(promoByCode, totalSystemSales),
    [promoByCode, totalSystemSales],
  );

  // Empty state: no promo data
  if (rows.length === 0) {
    return (
      <div className="card">
        <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2">
          <Tag size={16} className="text-violet-600" />
          Hiệu quả khuyến mãi
        </h3>
        <div className="text-center py-6 text-slate-400 text-sm italic">
          Tháng {fmtMonth(month)} chưa có chương trình khuyến mãi nào được áp dụng.
        </div>
      </div>
    );
  }

  const totalPromoSales = promoTotals.totalPromoSales ?? rows.reduce((s, r) => s + r.promoSales, 0);

  return (
    <div className="card">
      <div className="mb-3">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <Tag size={16} className="text-violet-600" />
          Hiệu quả khuyến mãi · tháng {fmtMonth(month)}
        </h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Đánh giá tương đối theo doanh số, mức giảm và số giao dịch trong tháng.
          <span className="ml-1 text-slate-400 italic">(Chưa tính chi phí quảng cáo/quà tặng/biên lợi nhuận)</span>
        </p>
      </div>

      {/* Quick KPI nhỏ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        <KpiCard label="Số chương trình" value={rows.length.toString()} icon={<Tag size={18} />} tone="violet" />
        <KpiCard label="Tổng GD áp KM" value={promoTotals.transactions.toString()} icon={<Users size={18} />} tone="violet" />
        <KpiCard label="Doanh số qua KM" value={fmtMoney(totalPromoSales)} icon={<TrendingUp size={18} />} tone="emerald" />
        <KpiCard label="Tổng tiền giảm" value={fmtMoney(promoTotals.totalDiscount)} icon={<Wallet size={18} />} tone="rose" />
      </div>

      {/* Bảng hiệu quả per chương trình */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
            <tr>
              <th className="px-2 py-2 text-left w-10">#</th>
              <th className="px-2 py-2 text-left">Mã</th>
              <th className="px-2 py-2 text-left">Tên chương trình</th>
              <th className="px-2 py-2 text-right">Số GD</th>
              <th className="px-2 py-2 text-right">Doanh số sau ƯĐ</th>
              <th className="px-2 py-2 text-right">Tiền giảm</th>
              <th className="px-2 py-2 text-right">Cost ratio</th>
              <th className="px-2 py-2 text-right">Tỷ trọng DS</th>
              <th className="px-2 py-2 text-left">Hiệu quả</th>
              <th className="px-2 py-2 text-left">Khuyến nghị</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, i) => {
              const costRatioCls = r.classification === 'review'
                ? 'text-rose-700 font-semibold'
                : r.classification === 'high'
                  ? 'text-emerald-700'
                  : 'text-slate-700';
              return (
                <tr key={r.code} className="hover:bg-slate-50/60">
                  <td className="px-2 py-1.5 tabular-nums text-slate-400">{i + 1}</td>
                  <td className="px-2 py-1.5">
                    <span className="font-mono font-bold text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded ring-1 ring-violet-200 text-xs">
                      {r.code}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-slate-700 font-medium truncate max-w-[280px]" title={r.name}>{r.name}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.transactionCount}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-emerald-700">
                    {r.promoSales > 0 ? fmtMoney(r.promoSales) : <span className="text-slate-300 text-xs italic">—</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-rose-700">
                    {r.totalDiscount > 0 ? fmtMoney(r.totalDiscount) : <span className="text-slate-300 text-xs">—</span>}
                  </td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${costRatioCls}`}>
                    {r.promoSales > 0 ? fmtPct(r.costRatio) : <span className="text-slate-300 text-xs">—</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">
                    {r.salesShare > 0 ? fmtPct(r.salesShare) : <span className="text-slate-300 text-xs">—</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ${CLASS_BADGE[r.classification]}`}>
                      {CLASS_ICON[r.classification]}
                      {r.classification === 'high' ? 'Cao' : r.classification === 'normal' ? 'Bình thường' : r.classification === 'review' ? 'Thấp' : 'Chưa đủ data'}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-xs text-slate-600 italic">{r.recommendation}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-xs text-slate-500 leading-relaxed">
        <strong>Ngưỡng phân loại:</strong>
        <ul className="mt-1 ml-4 list-disc space-y-0.5">
          <li><strong>Cao</strong> · cost ratio &lt; 15% · doanh số ≥ median · số GD ≥ 5 → Nên duy trì</li>
          <li><strong>Thấp</strong> · cost ratio &gt; 30% · doanh số &lt; median · số GD ≥ 5 → Cần xem lại</li>
          <li><strong>Chưa đủ data</strong> · số GD &lt; 5 → Cần thêm dữ liệu</li>
          <li><strong>Bình thường</strong> · còn lại → Theo dõi tiếp</li>
        </ul>
      </div>
    </div>
  );
}
