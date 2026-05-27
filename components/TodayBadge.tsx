'use client';

import { useEffect, useState } from 'react';
import { Calendar } from 'lucide-react';

const DAYS_VN = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

interface TodayBadgeProps {
  /** Compact: 'T7, 24/05/2026' — Full: 'Thứ Bảy, 24/05/2026'. Default compact. */
  variant?: 'compact' | 'full';
  className?: string;
}

const DAYS_FULL_VN = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

export function TodayBadge({ variant = 'compact', className = '' }: TodayBadgeProps) {
  const [str, setStr] = useState('');
  useEffect(() => {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dow = variant === 'full' ? DAYS_FULL_VN[d.getDay()] : DAYS_VN[d.getDay()];
    setStr(`${dow}, ${dd}/${mm}/${d.getFullYear()}`);
  }, [variant]);

  return (
    <div
      title="Ngày hôm nay"
      className={`inline-flex h-8 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800 tabular-nums ${className}`}
    >
      <Calendar size={13} className="text-emerald-600" />
      <span suppressHydrationWarning>{str || ' '}</span>
    </div>
  );
}
