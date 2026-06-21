// PR-TK2 (2026-06-21) — Badge trạng thái khóa tháng.
// - Single shape (QLCS/Acct/Top filter 1 branch): "🔒 Đã khóa" / "🔓 Chưa khóa"
// - Summary shape (Top xem all): "🔒 X/Y cơ sở đã khóa"

import { Lock, Unlock } from 'lucide-react';
import { isMonthLockSingle, isMonthLockSummary, type MonthLockSingle, type MonthLockSummary } from './types';

interface Props {
  monthLock: MonthLockSingle | MonthLockSummary | null | undefined;
}

export default function MonthLockBadge({ monthLock }: Props) {
  if (!monthLock) return null;

  if (isMonthLockSingle(monthLock)) {
    if (monthLock.locked) {
      const by = monthLock.lockedByName ? ` bởi ${monthLock.lockedByName}` : '';
      return (
        <span
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 ring-1 ring-rose-200"
          title={`Khóa${by}${monthLock.lockedAt ? ` — ${new Date(monthLock.lockedAt).toLocaleString('vi-VN')}` : ''}`}
        >
          <Lock size={12} />
          Đã khóa tháng
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 ring-1 ring-slate-200">
        <Unlock size={12} />
        Chưa khóa tháng
      </span>
    );
  }

  if (isMonthLockSummary(monthLock)) {
    const allLocked = monthLock.lockedCount === monthLock.totalBranches;
    const noneLocked = monthLock.lockedCount === 0;
    const cls = allLocked
      ? 'bg-rose-50 text-rose-700 ring-rose-200'
      : noneLocked
        ? 'bg-slate-100 text-slate-600 ring-slate-200'
        : 'bg-amber-50 text-amber-700 ring-amber-200';
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ${cls}`}>
        {allLocked ? <Lock size={12} /> : <Unlock size={12} />}
        {monthLock.lockedCount}/{monthLock.totalBranches} cơ sở đã khóa
      </span>
    );
  }

  return null;
}
