// PR-UI-PIXEL-MATCH B1 (2026-06-26) — Pure helper tests.

import { describe, it, expect } from 'vitest';
import { formatVnd, formatMillion } from '@/components/ui/TableWrap';
import {
  displayName,
  technicalIdTooltip,
  objectLabel,
  looksTechnical,
} from '@/lib/display-name';
import { toneOf } from '@/lib/status';

describe('formatVnd', () => {
  it('null/undefined/NaN → —', () => {
    expect(formatVnd(null)).toBe('—');
    expect(formatVnd(undefined)).toBe('—');
    expect(formatVnd(NaN)).toBe('—');
  });
  it('0 → "0"', () => expect(formatVnd(0)).toBe('0'));
  it('1.000.000 vi-VN', () => expect(formatVnd(1_000_000)).toBe('1.000.000'));
  it('73.000.000', () => expect(formatVnd(73_000_000)).toBe('73.000.000'));
  it('round halfway', () => expect(formatVnd(1_500_000.6)).toBe('1.500.001'));
});

describe('formatMillion', () => {
  it('null → —', () => expect(formatMillion(null)).toBe('—'));
  it('0 → "0"', () => expect(formatMillion(0)).toBe('0'));
  it('< 1tr giữ full + đ', () => expect(formatMillion(450_000)).toBe('450.000đ'));
  it('1tr chẵn → "1 tr"', () => expect(formatMillion(1_000_000)).toBe('1 tr'));
  it('73tr → "73 tr"', () => expect(formatMillion(73_000_000)).toBe('73 tr'));
  it('57.5tr → "57,5 tr" (dấu phẩy thập phân VN)', () => {
    expect(formatMillion(57_500_000)).toBe('57,5 tr');
  });
  it('17.5tr → "17,5 tr"', () => expect(formatMillion(17_500_000)).toBe('17,5 tr'));
  it('1 tỷ → "1 tỷ"', () => expect(formatMillion(1_000_000_000)).toBe('1 tỷ'));
  it('1.56 tỷ → "1,56 tỷ"', () => expect(formatMillion(1_560_000_000)).toBe('1,56 tỷ'));
  it('số âm giữ dấu trừ', () => expect(formatMillion(-5_000_000)).toBe('-5 tr'));
});

describe('looksTechnical', () => {
  it('UUID classic', () => expect(looksTechnical('51cd3c82-cce3-4ce1-89ab-...')).toBe(true));
  it('Push ID dài', () => expect(looksTechnical('l5KxbegamAbCdEfGhIjKl')).toBe(true));
  it('Tên thường → false', () => {
    expect(looksTechnical('Nguyễn Văn Hướng')).toBe(false);
    expect(looksTechnical('Phòng Kỹ thuật')).toBe(false);
  });
  it('null/empty → false', () => {
    expect(looksTechnical(null)).toBe(false);
    expect(looksTechnical('')).toBe(false);
  });
});

describe('displayName', () => {
  it('null → Chưa định danh', () => expect(displayName(null)).toBe('Chưa định danh'));
  it('string thường giữ nguyên', () => expect(displayName('Phạm Thanh Tùng')).toBe('Phạm Thanh Tùng'));
  it('string giống UUID → Chưa định danh', () => {
    expect(displayName('51cd3c82-cce3-4ce1-aaaa')).toBe('Chưa định danh');
  });
  it('object có name dùng name', () => {
    expect(displayName({ name: 'Phòng Kỹ thuật', id: 'abc-123-def' })).toBe('Phòng Kỹ thuật');
  });
  it('object name = UUID → fallback roleLabel + facilityLabel', () => {
    expect(displayName({
      name: 'l5KxbegamAbCdEfGhIjKl',
      roleLabel: 'TP Kỹ thuật',
      facilityLabel: 'CS Hoàng Mai',
    })).toBe('TP Kỹ thuật · CS Hoàng Mai');
  });
  it('object chỉ có roleLabel', () => {
    expect(displayName({ roleLabel: 'QLCS' })).toBe('QLCS');
  });
  it('object rỗng → Chưa định danh', () => expect(displayName({})).toBe('Chưa định danh'));
});

describe('technicalIdTooltip', () => {
  it('có id → "Mã nội bộ: ..."', () => {
    expect(technicalIdTooltip({ id: 'abc-123' })).toBe('Mã nội bộ: abc-123');
  });
  it('không id → undefined', () => {
    expect(technicalIdTooltip({})).toBeUndefined();
  });
});

describe('objectLabel', () => {
  it('transaction + code thường', () => expect(objectLabel('transaction', '#1042')).toBe('Giao dịch #1042'));
  it('expense + code', () => expect(objectLabel('expense', 'PC-2026-001')).toBe('Phiếu chi PC-2026-001'));
  it('code giống hash → bỏ code chỉ trả loại', () => {
    expect(objectLabel('transaction', 'Tx_kuCsXgAbCdEfGhIjKl')).toBe('Giao dịch');
  });
  it('kind lạ → "Bản ghi"', () => expect(objectLabel('xyz', '001')).toBe('Bản ghi 001'));
});

describe('toneOf (status taxonomy)', () => {
  it('hoan_tat → success', () => expect(toneOf('hoan_tat')).toBe('success'));
  it('qua_han → danger', () => expect(toneOf('qua_han')).toBe('danger'));
  it('draft → pending', () => expect(toneOf('draft')).toBe('pending'));
  it('da_khoa → locked', () => expect(toneOf('da_khoa')).toBe('locked'));
  it('dang_xu_ly → info', () => expect(toneOf('dang_xu_ly')).toBe('info'));
  it('unknown → neutral', () => expect(toneOf('xyz_unknown')).toBe('neutral'));
});
