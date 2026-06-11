'use client';

import { formatPercent, classifyStatus } from '../utils/revenueFormat';

interface Props {
  /** % hoàn thành (có thể > 100) */
  percent: number;
  /** Hiện text % bên phải */
  showLabel?: boolean;
  /** Kích thước */
  size?: 'sm' | 'md' | 'lg';
  /** Override màu (mặc định auto theo classifyStatus) */
  colorClass?: string;
  /** Dùng cho background trên nền tối */
  onDark?: boolean;
  className?: string;
}

const SIZE_CLS: Record<NonNullable<Props['size']>, { bar: string; text: string }> = {
  sm: { bar: 'h-1.5', text: 'text-[10px]' },
  md: { bar: 'h-2.5', text: 'text-xs' },
  lg: { bar: 'h-3',   text: 'text-sm' },
};

const STATUS_BAR_CLS: Record<ReturnType<typeof classifyStatus>, string> = {
  achieved: 'bg-emerald-500',
  warning:  'bg-amber-500',
  risk:     'bg-rose-500',
};

export function RevenueProgressBar({
  percent, showLabel = true, size = 'md', colorClass, onDark, className = '',
}: Props) {
  const status = classifyStatus(percent);
  const widthPct = Math.max(0, Math.min(percent, 100));
  const barCls = colorClass || STATUS_BAR_CLS[status];
  const sizeCls = SIZE_CLS[size];
  const trackCls = onDark ? 'bg-white/20' : 'bg-slate-100';
  const labelCls = onDark ? 'text-white/90' : 'text-slate-700';

  return (
    <div className={`w-full ${className}`}>
      <div className={`relative w-full rounded-full ${trackCls} overflow-hidden ${sizeCls.bar}`}>
        <div
          className={`${barCls} ${sizeCls.bar} rounded-full transition-all duration-500`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      {showLabel && (
        <div className={`mt-1 flex items-center justify-between ${sizeCls.text} ${labelCls}`}>
          <span className="tabular-nums font-semibold">{formatPercent(percent)}</span>
          {percent >= 100 && (
            <span className={onDark ? 'text-emerald-200 font-semibold' : 'text-emerald-700 font-semibold'}>
              ✓ Đạt mục tiêu
            </span>
          )}
        </div>
      )}
    </div>
  );
}
