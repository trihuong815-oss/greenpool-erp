// PR-TK1 (2026-06-21) — V7 Promo summary card (khuyến mãi tháng).
// Tách từ TongKetClient.tsx — 4 KPI compact + bảng top promo theo lợi ích.
//
// ⚠️ DEPRECATED — PR-TK4C (2026-06-22):
// File này đã được THAY bằng PromoEffectivenessCard (nâng cấp từ "summary"
// sang "đánh giá hiệu quả tương đối" với classification + recommendation).
// KHÔNG còn dùng trong 4 view (TopExecutive/Accountant/Qlcs/ReadOnlyAudit).
// Giữ file để rollback nếu cần. Có thể xoá sau 2 tuần verify production stable.

import { useMemo } from 'react';
import { Tag, Wallet, Dumbbell } from 'lucide-react';
import KpiCard from './KpiCard';
import { fmtMoney, fmtMonth } from './utils';
import type { Summary } from './types';

interface Props {
  month: string;
  promoTotals: NonNullable<Summary['promoTotals']>;
  promoByCode: Summary['promoByCode'];
}

export default function PromoSummaryCard({ month, promoTotals, promoByCode }: Props) {
  const promoTopByDiscount = useMemo(() => {
    if (!promoByCode) return [];
    return Object.values(promoByCode)
      .filter((p) => p.discount > 0 || p.bonusSessions > 0 || p.bonusDays > 0)
      .sort((a, b) =>
        (b.discount + b.bonusSessions * 1000 + b.bonusDays * 1000)
        - (a.discount + a.bonusSessions * 1000 + a.bonusDays * 1000),
      )
      .slice(0, 10);
  }, [promoByCode]);

  return (
    <div className="card">
      <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
        <Tag size={16} className="text-violet-600" />
        Khuyến mãi tháng {fmtMonth(month)}
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KpiCard label="Số GD áp KM" value={promoTotals.transactions.toString()} icon={<Tag size={18} />} tone="violet" />
        <KpiCard label="Tổng tiền giảm" value={fmtMoney(promoTotals.totalDiscount)} icon={<Wallet size={18} />} tone="violet" />
        {promoTotals.totalBonusSessions > 0 && (
          <KpiCard label="Tổng buổi tặng" value={promoTotals.totalBonusSessions.toLocaleString()} icon={<Dumbbell size={18} />} tone="rose" />
        )}
        {promoTotals.totalBonusDays > 0 && (
          <KpiCard label="Tổng ngày tặng" value={promoTotals.totalBonusDays.toLocaleString()} icon={<Wallet size={18} />} tone="sky" />
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
  );
}
