// PR-SALES-EXCEL-IMPORT-SPLIT (2026-06-24) — Parser tests.

import { describe, it, expect } from 'vitest';
import { parseExcelRows, resolvePaymentAlias } from '@/lib/sales-v2/excel-import-parser';
import type { SalesV2Package } from '@/lib/sales-v2/packages';

const PKG: SalesV2Package = {
  id: 'pkg1',
  code: 'TT12',
  name: 'Thẻ 12 tháng',
  serviceGroup: 'TT12',
  groupId: 'g1',
  isChildPackage: false,
  defaultUnitPrice: 6_000_000,
  isCustomQuantity: false,
} as any;

const PKG_CHILD: SalesV2Package = {
  ...PKG,
  id: 'pkgC',
  code: 'HB10',
  name: 'Học bơi trẻ em 10 buổi',
  serviceGroup: 'HB10',
  isChildPackage: true,
} as any;

const PKGS = [PKG, PKG_CHILD];

// Helper — build 1 TSV row với 15 ô.
function row(opts: Partial<{
  name: string; phone: string; guard: string; source: string; pkg: string; txn: string;
  pay: string; receipt: string; contract: string; pv: string; thu: string; note: string;
  cash: string; transfer: string; card: string;
}>): string {
  return [
    opts.name ?? 'Khách A',
    opts.phone ?? '0901234567',
    opts.guard ?? '',
    opts.source ?? 'Walkin',
    opts.pkg ?? 'Thẻ 12 tháng',
    opts.txn ?? 'Thanh toán full',
    opts.pay ?? 'Tiền mặt',
    opts.receipt ?? '',
    opts.contract ?? 'HD001',
    opts.pv ?? '6000000',
    opts.thu ?? '6000000',
    opts.note ?? '',
    opts.cash ?? '',
    opts.transfer ?? '',
    opts.card ?? '',
  ].join('\t');
}

describe('resolvePaymentAlias', () => {
  it.each([
    ['Tiền mặt', 'tien_mat'],
    ['TM', 'tien_mat'],
    ['cash', 'tien_mat'],
    ['Chuyển khoản', 'chuyen_khoan'],
    ['CK', 'chuyen_khoan'],
    ['transfer', 'chuyen_khoan'],
    ['POS', 'pos'],
    ['Quẹt thẻ', 'pos'],
    ['Thẻ', 'pos'],
    ['card', 'pos'],
    ['Tiền mặt + Chuyển khoản', 'tien_mat_chuyen_khoan'],
    ['TM + CK', 'tien_mat_chuyen_khoan'],
    ['Chuyển khoản + Tiền mặt', 'tien_mat_chuyen_khoan'],
    ['cash_transfer', 'tien_mat_chuyen_khoan'],
    ['Tiền mặt + POS', 'tien_mat_pos'],
    ['Tiền mặt + Quẹt thẻ', 'tien_mat_pos'],
    ['TM + POS', 'tien_mat_pos'],
    ['Chuyển khoản + POS', 'chuyen_khoan_pos'],
    ['CK + POS', 'chuyen_khoan_pos'],
    ['transfer_card', 'chuyen_khoan_pos'],
  ])('alias "%s" → %s', (input, expected) => {
    expect(resolvePaymentAlias(input)).toBe(expected);
  });

  it('unknown alias → undefined', () => {
    expect(resolvePaymentAlias('Bitcoin')).toBeUndefined();
  });
});

describe('parseExcelRows — legacy single-method (cũ, không có 3 cột breakdown)', () => {
  it('Tiền mặt, Thu hôm nay = 1tr → cash=1tr, valid', () => {
    const tsv = row({ pay: 'Tiền mặt', pv: '1000000', thu: '1000000' });
    const [r] = parseExcelRows(tsv, PKGS);
    expect(r.errors).toEqual([]);
    expect(r.resolvedPayMethod).toBe('tien_mat');
    expect(r.resolvedBreakdown).toEqual({ cash: 1_000_000, transfer: 0, card: 0 });
    expect(r.resolvedCollected).toBe(1_000_000);
  });

  it('Chuyển khoản, Thu hôm nay = 2tr → transfer=2tr, valid', () => {
    const tsv = row({ pay: 'Chuyển khoản', pv: '2000000', thu: '2000000' });
    const [r] = parseExcelRows(tsv, PKGS);
    expect(r.errors).toEqual([]);
    expect(r.resolvedBreakdown).toEqual({ cash: 0, transfer: 2_000_000, card: 0 });
  });

  it('POS legacy, Thu hôm nay = 5tr → card=5tr, valid', () => {
    const tsv = row({ pay: 'POS', pv: '5000000', thu: '5000000' });
    const [r] = parseExcelRows(tsv, PKGS);
    expect(r.errors).toEqual([]);
    expect(r.resolvedBreakdown).toEqual({ cash: 0, transfer: 0, card: 5_000_000 });
  });
});

describe('parseExcelRows — combo method (3 cột breakdown)', () => {
  it('TM + CK 300k+700k, Thu hôm nay = 1tr → valid', () => {
    const tsv = row({
      pay: 'Tiền mặt + Chuyển khoản',
      pv: '1000000', thu: '1000000',
      cash: '300000', transfer: '700000',
    });
    const [r] = parseExcelRows(tsv, PKGS);
    expect(r.errors).toEqual([]);
    expect(r.resolvedPayMethod).toBe('tien_mat_chuyen_khoan');
    expect(r.resolvedBreakdown).toEqual({ cash: 300_000, transfer: 700_000, card: 0 });
    expect(r.resolvedCollected).toBe(1_000_000);
  });

  it('Combo TM+CK, Thu hôm nay TRỐNG, breakdown đủ → tự tính collected = sum', () => {
    const tsv = row({
      pay: 'TM + CK',
      pv: '1000000', thu: '',
      cash: '300000', transfer: '700000',
    });
    const [r] = parseExcelRows(tsv, PKGS);
    expect(r.errors).toEqual([]);
    expect(r.resolvedCollected).toBe(1_000_000);
    expect(r.resolvedBreakdown).toEqual({ cash: 300_000, transfer: 700_000, card: 0 });
  });

  it('Combo TM+CK thiếu transfer → invalid', () => {
    const tsv = row({
      pay: 'Tiền mặt + Chuyển khoản',
      pv: '1000000', thu: '1000000',
      cash: '1000000', transfer: '',
    });
    const [r] = parseExcelRows(tsv, PKGS);
    expect(r.errors.some((e) => e.includes('Vui lòng nhập đủ số tiền cho 2 hình thức thanh toán'))).toBe(true);
  });

  it('Combo TM+CK thiếu cash → invalid', () => {
    const tsv = row({
      pay: 'Tiền mặt + Chuyển khoản',
      pv: '1000000', thu: '1000000',
      cash: '', transfer: '1000000',
    });
    const [r] = parseExcelRows(tsv, PKGS);
    expect(r.errors.some((e) => e.includes('Vui lòng nhập đủ số tiền cho 2 hình thức thanh toán'))).toBe(true);
  });

  it('Combo CK+POS: inactive cash > 0 → invalid', () => {
    const tsv = row({
      pay: 'CK + POS',
      pv: '1000000', thu: '1000000',
      cash: '100000', transfer: '400000', card: '500000',
    });
    const [r] = parseExcelRows(tsv, PKGS);
    expect(r.errors.some((e) => e.includes('Cột Tiền mặt phải trống'))).toBe(true);
  });

  it('Combo TM+POS: Thu hôm nay = 1tr nhưng cash 300k + card 500k = 800k → mismatch', () => {
    const tsv = row({
      pay: 'Tiền mặt + POS',
      pv: '1000000', thu: '1000000',
      cash: '300000', card: '500000',
    });
    const [r] = parseExcelRows(tsv, PKGS);
    expect(r.errors.some((e) => e.includes('Thu hôm nay không khớp tổng các hình thức thanh toán'))).toBe(true);
  });

  it('Combo CK+POS: aliases "Chuyển khoản + Quẹt thẻ" hoạt động', () => {
    const tsv = row({
      pay: 'Chuyển khoản + Quẹt thẻ',
      pv: '1000000', thu: '1000000',
      transfer: '400000', card: '600000',
    });
    const [r] = parseExcelRows(tsv, PKGS);
    expect(r.errors).toEqual([]);
    expect(r.resolvedPayMethod).toBe('chuyen_khoan_pos');
    expect(r.resolvedBreakdown).toEqual({ cash: 0, transfer: 400_000, card: 600_000 });
  });
});

describe('parseExcelRows — single method với 3 cột breakdown nhập rõ', () => {
  it('Single TM + cột Tiền mặt khớp Thu hôm nay → valid', () => {
    const tsv = row({
      pay: 'Tiền mặt', pv: '1000000', thu: '1000000',
      cash: '1000000',
    });
    const [r] = parseExcelRows(tsv, PKGS);
    expect(r.errors).toEqual([]);
    expect(r.resolvedBreakdown).toEqual({ cash: 1_000_000, transfer: 0, card: 0 });
  });

  it('Single TM, cột Tiền mặt = 800k ≠ Thu hôm nay 1tr → invalid mismatch', () => {
    const tsv = row({
      pay: 'Tiền mặt', pv: '1000000', thu: '1000000',
      cash: '800000',
    });
    const [r] = parseExcelRows(tsv, PKGS);
    expect(r.errors.some((e) => e.includes('Thu hôm nay không khớp tổng các hình thức thanh toán'))).toBe(true);
  });

  it('Single TM, có giá trị Chuyển khoản 500k > 0 (inactive) → invalid', () => {
    const tsv = row({
      pay: 'Tiền mặt', pv: '1000000', thu: '1000000',
      cash: '1000000', transfer: '500000',
    });
    const [r] = parseExcelRows(tsv, PKGS);
    expect(r.errors.some((e) => e.includes('Cột Chuyển khoản phải trống'))).toBe(true);
  });

  it('Single TM, Thu hôm nay TRỐNG nhưng cột Tiền mặt = 1tr → derive collected', () => {
    const tsv = row({
      pay: 'Tiền mặt', pv: '1000000', thu: '',
      cash: '1000000',
    });
    const [r] = parseExcelRows(tsv, PKGS);
    expect(r.errors).toEqual([]);
    expect(r.resolvedCollected).toBe(1_000_000);
    expect(r.resolvedBreakdown).toEqual({ cash: 1_000_000, transfer: 0, card: 0 });
  });
});

describe('parseExcelRows — header detection + CSV', () => {
  it('Header row "Tên KH ..." được skip', () => {
    const tsv = [
      'Tên KH\tSĐT\t\tNguồn\tGói\tLoại GD\tHT thu\tSố PT\tSố HĐ\tGiá trị\tThu\tGhi chú\tTiền mặt\tChuyển khoản\tPOS',
      row({ pay: 'Tiền mặt', pv: '1000000', thu: '1000000' }),
    ].join('\n');
    const rows = parseExcelRows(tsv, PKGS);
    expect(rows.length).toBe(1);
    expect(rows[0].errors).toEqual([]);
  });

  it('CSV (comma) format đọc đúng', () => {
    const csv = 'Khách A,0901234567,,Walkin,Thẻ 12 tháng,Thanh toán full,Tiền mặt,,HD001,1000000,1000000,,,,';
    const [r] = parseExcelRows(csv, PKGS);
    expect(r.errors).toEqual([]);
    expect(r.resolvedBreakdown).toEqual({ cash: 1_000_000, transfer: 0, card: 0 });
  });
});

describe('parseExcelRows — base validation vẫn chạy', () => {
  it('Thiếu SĐT → invalid', () => {
    const tsv = row({ phone: '' });
    const [r] = parseExcelRows(tsv, PKGS);
    expect(r.errors.some((e) => e.includes('Thiếu SĐT'))).toBe(true);
  });

  it('HT thu invalid label → invalid', () => {
    const tsv = row({ pay: 'Bitcoin' });
    const [r] = parseExcelRows(tsv, PKGS);
    expect(r.errors.some((e) => e.includes('HT thu "Bitcoin" không hợp lệ'))).toBe(true);
  });

  it('Gói trẻ em không có giám hộ → invalid', () => {
    const tsv = row({ pkg: 'Học bơi trẻ em 10 buổi', pv: '3000000', thu: '3000000' });
    const [r] = parseExcelRows(tsv, PKGS);
    expect(r.errors.some((e) => e.includes('Người giám hộ'))).toBe(true);
  });
});
