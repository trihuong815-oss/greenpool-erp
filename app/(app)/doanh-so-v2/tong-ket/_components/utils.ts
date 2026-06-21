// PR-TK1 (2026-06-21) — Format helpers tách từ TongKetClient.tsx.
// CHỈ refactor — không đổi logic format.

export function currentMonthVN(): string {
  const ms = Date.now() + 7 * 3600 * 1000;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function fmtMonth(ym: string): string {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
  const [y, m] = ym.split('-');
  return `${m}/${y}`;
}

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function fmtMoney(v: number): string {
  return v.toLocaleString() + 'đ';
}

export function fmtDateShort(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

export const TXN_TYPE_LABEL: Record<string, string> = {
  dat_coc: 'Đặt cọc',
  thanh_toan_full: 'Thanh toán full',
  thanh_toan_not: 'Trả nốt',
};

export const PAY_LABEL: Record<string, string> = {
  tien_mat: 'Tiền mặt',
  chuyen_khoan: 'CK',
  pos: 'Quẹt thẻ',
};
