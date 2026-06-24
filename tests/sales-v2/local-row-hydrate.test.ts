// HOTFIX 2026-06-24 — Regression: draft cũ trong localStorage thiếu field
// schema mới phải KHÔNG crash khi hydrate / isRowEmpty / validateRow.
//
// Root cause: PR-SALES-PAYMENT-SPLIT-SAFE thêm paymentCash/Transfer/Card vào LocalRow.
// Draft Sale lưu TRƯỚC khi PR ship → 3 field = undefined → `r.X.trim()` crash.
// coerceLocalRow chuẩn hoá tại entry boundary; isRowEmpty/validateRow defensive cuối cùng.

import { describe, it, expect } from 'vitest';
import { coerceLocalRow, isRowEmpty, validateRow, makeEmptyRow, buildPaymentMethodChangePatch } from '@/app/(app)/doanh-so-v2/nhap/_components/SalesGrid';

describe('coerceLocalRow — schema-cũ hydrate an toàn', () => {
  it('input rỗng → LocalRow đầy đủ field', () => {
    const r = coerceLocalRow({});
    expect(r.customerName).toBe('');
    expect(r.phone).toBe('');
    expect(r.paymentCash).toBe('');
    expect(r.paymentTransfer).toBe('');
    expect(r.paymentCard).toBe('');
    expect(r.promoSnapshots).toEqual([]);
    expect(r.source).toBeNull();
    expect(r.packageId).toBeNull();
    expect(r.isChildPackage).toBe(false);
  });

  it('legacy draft cũ (thiếu paymentCash/Transfer/Card) → backfill ""', () => {
    const legacy = {
      tempId: 'local-old-123',
      customerName: 'Khách A',
      phone: '0901234567',
      guardianName: '',
      source: 'ca_nhan',
      packageId: 'pkg1',
      packageCode: 'TT12',
      packageName: 'Thẻ 12 tháng',
      serviceGroup: 'TT12',
      isChildPackage: false,
      packageIsCustomQuantity: false,
      packageManualPriceWithQty: false,
      transactionType: 'thanh_toan_full',
      paymentMethod: 'tien_mat',
      packageValue: '6000000',
      collectedToday: '6000000',
      // ⚠ thiếu paymentCash/Transfer/Card
      quantity: '',
      unitPrice: '',
      promoSnapshots: [],
      receiptNo: '',
      contractNo: 'HD001',
      note: '',
    };
    const r = coerceLocalRow(legacy);
    expect(r.paymentCash).toBe('');
    expect(r.paymentTransfer).toBe('');
    expect(r.paymentCard).toBe('');
    expect(r.customerName).toBe('Khách A');
    expect(r.tempId).toBe('local-old-123');
  });

  it('input null/undefined → row trống đầy đủ field (không throw)', () => {
    expect(() => coerceLocalRow(null)).not.toThrow();
    expect(() => coerceLocalRow(undefined)).not.toThrow();
    const r1 = coerceLocalRow(null);
    expect(r1.paymentCash).toBe('');
  });

  it('field number bị lưu nhầm thành number → coerce sang String', () => {
    const dirty = { customerName: 12345 as any, phone: 901234567 as any, packageValue: 1000000 as any };
    const r = coerceLocalRow(dirty);
    expect(typeof r.customerName).toBe('string');
    expect(typeof r.phone).toBe('string');
    expect(typeof r.packageValue).toBe('string');
    expect(r.packageValue).toBe('1000000');
  });

  it('idempotent: coerce(coerce(x)) === coerce(x) cho mọi field giá trị', () => {
    const dirty = { customerName: 'A', phone: '0901' };
    const r1 = coerceLocalRow(dirty);
    const r2 = coerceLocalRow(r1);
    // tempId regenerate mỗi lần — bỏ qua khi so sánh
    const { tempId: _1, ...rest1 } = r1;
    const { tempId: _2, ...rest2 } = r2;
    expect(rest1).toEqual(rest2);
  });

  it('promoSnapshots không phải array → reset []', () => {
    const r = coerceLocalRow({ promoSnapshots: 'invalid' as any });
    expect(r.promoSnapshots).toEqual([]);
  });
});

describe('isRowEmpty — defensive cuối cùng (Layer 3)', () => {
  it('row legacy thiếu paymentCash/Transfer/Card KHÔNG throw', () => {
    const broken = {
      ...makeEmptyRow(),
      paymentCash: undefined as any,
      paymentTransfer: undefined as any,
      paymentCard: undefined as any,
    };
    expect(() => isRowEmpty(broken)).not.toThrow();
    expect(isRowEmpty(broken)).toBe(true);
  });

  it('row legacy thiếu cả customerName/phone KHÔNG throw', () => {
    const broken = { ...makeEmptyRow(), customerName: undefined as any, phone: undefined as any };
    expect(() => isRowEmpty(broken)).not.toThrow();
    expect(isRowEmpty(broken)).toBe(true);
  });

  it('isRowEmpty(makeEmptyRow()) = true (sanity)', () => {
    expect(isRowEmpty(makeEmptyRow())).toBe(true);
  });

  it('isRowEmpty(row có customerName) = false', () => {
    const r = { ...makeEmptyRow(), customerName: 'A' };
    expect(isRowEmpty(r)).toBe(false);
  });
});

describe('validateRow — split method source of truth = sumSplitCells (FIX 2026-06-24)', () => {
  it('Stale r.collectedToday từ method single cũ KHÔNG gây false mismatch', () => {
    // Scenario: Sale chọn "Tiền mặt" 1.000.000 → đổi sang "Tiền mặt + Chuyển khoản"
    // (sau khi đổi, collectedToday cũ vẫn còn 1tr) → Sale gõ TM 300k + CK 400k = 700k.
    // Trước FIX: validateRow dùng r.collectedToday=1tr → mismatch với sum 700k → lỗi.
    // Sau FIX: validateRow dùng sumSplitCells=700k → check 2 active >0 OK + sum=ct → pass.
    const row = {
      ...makeEmptyRow(),
      customerName: 'A', phone: '0901234567',
      source: 'walkin' as any,
      packageId: 'p1', packageCode: 'TT12', packageName: 'Thẻ 12', serviceGroup: 'TT12',
      transactionType: 'thanh_toan_full' as any,
      paymentMethod: 'tien_mat_chuyen_khoan' as any,
      packageValue: '700000',  // gói 700k
      collectedToday: '1000000', // STALE từ method cũ
      paymentCash: '300000',
      paymentTransfer: '400000',
      paymentCard: '',
      contractNo: 'HD1',
    };
    const v = validateRow(row);
    // Sau FIX: ct = sum split = 700k = packageValue → PASS.
    expect(v.ok).toBe(true);
  });

  it('Combo TM+CK với 2 active > 0 + sum đúng → PASS', () => {
    const row = {
      ...makeEmptyRow(),
      customerName: 'A', phone: '0901234567',
      source: 'walkin' as any,
      packageId: 'p1', packageCode: 'TT', packageName: 'Pkg', serviceGroup: 'TT',
      transactionType: 'thanh_toan_full' as any,
      paymentMethod: 'tien_mat_chuyen_khoan' as any,
      packageValue: '1000000',
      collectedToday: '', // empty, source of truth = sum split
      paymentCash: '300000',
      paymentTransfer: '700000',
      paymentCard: '',
      contractNo: 'HD1',
    };
    const v = validateRow(row);
    expect(v.ok).toBe(true);
  });

  it('Combo thiếu 1 ô active → invalid', () => {
    const row = {
      ...makeEmptyRow(),
      customerName: 'A', phone: '0901234567',
      source: 'walkin' as any,
      packageId: 'p1', packageCode: 'TT', packageName: 'Pkg', serviceGroup: 'TT',
      transactionType: 'thanh_toan_full' as any,
      paymentMethod: 'tien_mat_chuyen_khoan' as any,
      packageValue: '1000000',
      collectedToday: '',
      paymentCash: '1000000',  // chỉ 1 ô có, ô CK trống
      paymentTransfer: '',
      paymentCard: '',
      contractNo: 'HD1',
    };
    const v = validateRow(row);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toContain('Vui lòng nhập đủ');
  });
});

describe('buildPaymentMethodChangePatch — clear stale state khi đổi method', () => {
  it('single → combo: clear collectedToday + 3 cell', () => {
    const p = buildPaymentMethodChangePatch('tien_mat', 'tien_mat_chuyen_khoan');
    expect(p.paymentMethod).toBe('tien_mat_chuyen_khoan');
    expect(p.collectedToday).toBe('');
    expect(p.paymentCash).toBe('');
    expect(p.paymentTransfer).toBe('');
    expect(p.paymentCard).toBe('');
  });
  it('combo → single: clear 3 cell, GIỮ collectedToday', () => {
    const p = buildPaymentMethodChangePatch('tien_mat_chuyen_khoan', 'tien_mat');
    expect(p.paymentMethod).toBe('tien_mat');
    expect(p.collectedToday).toBeUndefined(); // không đụng
    expect(p.paymentCash).toBe('');
    expect(p.paymentTransfer).toBe('');
    expect(p.paymentCard).toBe('');
  });
  it('combo → combo khác: clear 3 cell (active bucket khác nhau)', () => {
    const p = buildPaymentMethodChangePatch('tien_mat_chuyen_khoan', 'chuyen_khoan_pos');
    expect(p.paymentMethod).toBe('chuyen_khoan_pos');
    expect(p.paymentCash).toBe('');
    expect(p.paymentTransfer).toBe('');
    expect(p.paymentCard).toBe('');
  });
  it('same method → chỉ patch paymentMethod (no-op)', () => {
    const p = buildPaymentMethodChangePatch('tien_mat', 'tien_mat');
    expect(p.paymentMethod).toBe('tien_mat');
    expect(p.paymentCash).toBeUndefined();
    expect(p.collectedToday).toBeUndefined();
  });
  it('null → combo: clear 3 cell + collectedToday', () => {
    const p = buildPaymentMethodChangePatch(null, 'tien_mat_pos');
    expect(p.paymentMethod).toBe('tien_mat_pos');
    expect(p.collectedToday).toBe('');
    expect(p.paymentCash).toBe('');
    expect(p.paymentCard).toBe('');
  });
});

describe('validateRow — defensive với row schema cũ', () => {
  it('row thiếu customerName/phone/guardianName/etc KHÔNG throw, trả error', () => {
    const broken = {
      ...makeEmptyRow(),
      customerName: undefined as any,
      phone: undefined as any,
    };
    expect(() => validateRow(broken)).not.toThrow();
    const v = validateRow(broken);
    expect(v.ok).toBe(false);
  });
  it('row có guardianName + receiptNo + contractNo = undefined KHÔNG throw', () => {
    const broken = {
      ...makeEmptyRow(),
      customerName: 'A', phone: '0901234567',
      source: 'walkin' as any, packageId: 'p1',
      transactionType: 'dat_coc' as any, paymentMethod: 'tien_mat' as any,
      packageValue: '1000000', collectedToday: '1000000',
      guardianName: undefined as any,
      receiptNo: undefined as any,
      contractNo: undefined as any,
      isChildPackage: true,
    };
    expect(() => validateRow(broken)).not.toThrow();
    // Phải trả error vì gói trẻ em + thiếu guardian
    const v = validateRow(broken);
    expect(v.ok).toBe(false);
  });
});
