// PR-TONGKET-OVERVIEW-V2 (2026-06-27): Chỉ tiêu + thực đạt PER CƠ SỞ ở tab Tổng quan.
// User feedback hội đồng:
//   "ở ngoài màn hình tổng quan nên có chỉ tiêu của từng cơ sở và thực đạt
//    của từng cơ sở nữa."
//
// Phân quyền:
//   - Sale: render null (cá nhân — đã có TargetProgressCard riêng)
//   - QLCS: 1 hàng = cơ sở mình (server force scopeBranchId = facility_id)
//   - Top: 5 hàng = 5 cơ sở
// Server-side đã enforce — UI chỉ render từ data API trả về (không leak).
//
// Tone color theo % đạt:
//   ≥100% → emerald (đạt mục tiêu)
//   70-99% → amber (gần đạt, cần đẩy)
//   <70%  → rose (chậm, cần can thiệp)

import { BRANCHES, type BranchId } from '@/lib/branches';
import type { Summary } from './types';

interface Props {
  byBranch: Summary['byBranch'];
  branchTargets?: Record<string, number>;
}

function fmtVnd(n: number): string {
  return new Intl.NumberFormat('vi-VN').format(Math.round(n));
}

function toneByPct(pct: number): { bar: string; text: string; chip: string } {
  if (pct >= 100) return { bar: 'bg-emerald-500', text: 'text-emerald-700', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200' };
  if (pct >= 70)  return { bar: 'bg-amber-500',   text: 'text-amber-700',   chip: 'bg-amber-50 text-amber-700 ring-amber-200' };
  return                  { bar: 'bg-rose-500',    text: 'text-rose-700',    chip: 'bg-rose-50 text-rose-700 ring-rose-200' };
}

export default function BranchProgressList({ byBranch, branchTargets }: Props) {
  // Liệt kê branches có target HOẶC có actual (>0). Sale role không có byBranch → empty render null.
  const branchIds = Array.from(new Set<string>([
    ...Object.keys(branchTargets ?? {}),
    ...Object.keys(byBranch ?? {}),
  ])).filter((id) => {
    const target = branchTargets?.[id] ?? 0;
    const actual = byBranch?.[id]?.sales ?? 0;
    return target > 0 || actual > 0;
  });

  if (branchIds.length === 0) return null;

  // Sort theo thứ tự BRANCHES canonical (HM/TK/CTT/24/TT) nếu thuộc canonical, lạ thì cuối.
  const order = new Map<string, number>(BRANCHES.map((b, i) => [b.id, i]));
  branchIds.sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Chỉ tiêu vs thực đạt theo cơ sở</h3>
        <span className="text-[11px] text-slate-500">{branchIds.length} cơ sở</span>
      </div>
      <div className="divide-y divide-slate-100">
        {branchIds.map((id) => {
          const branchMeta = BRANCHES.find((x) => x.id === id);
          const branchName = branchMeta?.shortName ?? id;
          const branchFull = branchMeta?.name ?? id;
          const target = branchTargets?.[id] ?? 0;
          const actual = byBranch?.[id]?.sales ?? 0;
          const pct = target > 0 ? Math.round((actual / target) * 100) : 0;
          const tone = toneByPct(pct);
          const barWidth = target > 0 ? Math.min(100, pct) : 0;

          return (
            <div key={id} className="px-4 py-3">
              <div className="flex items-center justify-between mb-1.5 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  {branchMeta && (
                    <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: branchMeta.color }} />
                  )}
                  <span className="font-medium text-slate-800 truncate" title={branchFull}>{branchName}</span>
                  <span className="text-[11px] text-slate-500 truncate hidden md:inline">{branchFull}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-2">
                  {target > 0 ? (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ring-1 ${tone.chip} tabular-nums`}>
                      {pct}%
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400 italic">chưa đặt chỉ tiêu</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 text-[12px] text-slate-600 mb-1.5 flex-wrap">
                <span className="tabular-nums">
                  Thực đạt: <strong className={tone.text}>{fmtVnd(actual)} đ</strong>
                </span>
                <span className="text-slate-400">/</span>
                <span className="tabular-nums text-slate-500">
                  Chỉ tiêu: {target > 0 ? `${fmtVnd(target)} đ` : '—'}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                {barWidth > 0 && (
                  <div className={`h-full ${tone.bar} transition-all`} style={{ width: `${barWidth}%` }} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
