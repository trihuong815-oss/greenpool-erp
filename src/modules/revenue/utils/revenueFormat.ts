// ============================================================
// Revenue — Format helpers (currency, percent, period, ...)
// ============================================================

/** Format đầy đủ "1.234.567 ₫" */
export function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  return `${value < 0 ? '-' : ''}${abs.toLocaleString('vi-VN')} ₫`;
}

/** Format gọn theo đơn vị triệu/tỷ, ví dụ: 1.234.567.890 → "1,23 tỷ" */
export function formatCurrencyShort(value: number, opts?: { suffix?: boolean }): string {
  if (!Number.isFinite(value)) return '—';
  const suffix = opts?.suffix !== false;
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000_000) {
    return `${sign}${(abs / 1_000_000_000).toFixed(2).replace('.', ',')}${suffix ? ' tỷ' : ''}`;
  }
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toFixed(1).replace('.', ',')}${suffix ? ' tr' : ''}`;
  }
  if (abs >= 1_000) {
    return `${sign}${(abs / 1_000).toFixed(0)}${suffix ? 'k' : ''}`;
  }
  return `${sign}${abs}`;
}

/** Format % với 1 chữ số thập phân */
export function formatPercent(value: number, opts?: { decimals?: number }): string {
  if (!Number.isFinite(value)) return '—';
  const d = opts?.decimals ?? 1;
  return `${value.toFixed(d).replace('.', ',')}%`;
}

/** Tính % hoàn thành actual/target, clamp tối thiểu 0 */
export function progressPercent(actual: number, target: number): number {
  if (!target || target <= 0) return 0;
  return (actual / target) * 100;
}

/** Hiển thị "Tháng MM/YYYY" */
export function formatPeriod(year: number, month: number): string {
  const m = String(month).padStart(2, '0');
  return `Tháng ${m}/${year}`;
}

/** Trả về danh sách năm để filter (5 năm gần đây) */
export function yearOptions(centerYear?: number): number[] {
  const c = centerYear || new Date().getFullYear();
  const out: number[] = [];
  for (let y = c - 2; y <= c + 1; y++) out.push(y);
  return out;
}

/** Trả về danh sách tháng 1..12 với label tiếng Việt */
export function monthOptions(): { value: number; label: string }[] {
  return Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `Tháng ${i + 1}` }));
}

/** Phân loại trạng thái doanh thu theo % */
export type RevenueStatusKey = 'achieved' | 'warning' | 'risk';

export function classifyStatus(pct: number): RevenueStatusKey {
  if (pct >= 100) return 'achieved';
  if (pct >= 70) return 'warning';
  return 'risk';
}

export const STATUS_LABEL: Record<RevenueStatusKey, { label: string; cls: string; dot: string }> = {
  achieved: { label: 'Đạt',         cls: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500' },
  warning:  { label: 'Cần chú ý',   cls: 'bg-amber-100 text-amber-800',     dot: 'bg-amber-500' },
  risk:     { label: 'Nguy cơ cao', cls: 'bg-rose-100 text-rose-800',       dot: 'bg-rose-500' },
};
