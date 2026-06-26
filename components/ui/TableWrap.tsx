// components/ui/TableWrap.tsx
// PR-UI-PIXEL-MATCH B1 (2026-06-26): port từ code-10diem.
// Đóng điểm trừ audit: "11 bảng thiếu overflow-x-auto".
// Bọc MỌI <table> bằng <TableWrap> để không bao giờ vỡ mobile.
// Pixel-spec: text-[13px], border-separate spacing-0.

import type { ReactNode } from 'react';

export function TableWrap({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`w-full overflow-x-auto ${className}`}>
      <table className="w-full border-separate border-spacing-0 text-[13px]">{children}</table>
    </div>
  );
}

/** Ô tiền/số: luôn canh phải, font đều, tabular-nums.
 *  485 chỗ trong app đã dùng tabular-nums — chuẩn hoá lại qua component này. */
export function Num({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono tabular-nums ${className}`}>{children}</span>;
}

/** Format tiền VND nhất quán: 73.000.000 (không có "đ", caller tự thêm nếu cần). */
const VND = new Intl.NumberFormat('vi-VN');
export function formatVnd(n?: number | null): string {
  if (n == null || Number.isNaN(n)) return '—';
  return VND.format(Math.round(n));
}

/** Format tiền VND rút gọn cho KPI dashboard cao cấp.
 *  Ví dụ: 73_000_000 → "73 tr"; 57_500_000 → "57,5 tr"; 1_560_000_000 → "1,56 tỷ".
 *  Quy ước:
 *  - Dấu phẩy thập phân (Việt Nam): "57,5" không phải "57.5".
 *  - Có khoảng trắng giữa số và đơn vị: "73 tr" không phải "73tr".
 *  - Luôn round/truncate 1 chữ số thập phân.
 *  - Số 0 → "0".
 *  - Số nhỏ <1tr → format full với "đ" (không rút gọn). */
export function formatMillion(n?: number | null): string {
  if (n == null || Number.isNaN(n)) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs === 0) return '0';
  if (abs < 1_000_000) return `${sign}${VND.format(Math.round(abs))}đ`;
  if (abs < 1_000_000_000) {
    const tr = abs / 1_000_000;
    const rounded = Math.round(tr * 10) / 10;
    const str = Number.isInteger(rounded) ? String(rounded) : rounded.toString().replace('.', ',');
    return `${sign}${str} tr`;
  }
  const ty = abs / 1_000_000_000;
  const rounded = Math.round(ty * 100) / 100;
  const str = Number.isInteger(rounded) ? String(rounded) : rounded.toString().replace('.', ',');
  return `${sign}${str} tỷ`;
}
