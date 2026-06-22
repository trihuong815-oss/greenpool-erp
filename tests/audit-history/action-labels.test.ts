// PR-7A (2026-06-22) — Test action label mapper (TOLERANT với action ngoài enum).

import { describe, it, expect } from 'vitest';
import {
  actionLabel,
  actionLabelOrRaw,
  isKnownAction,
  moduleLabel,
} from '@/lib/audit-history/action-labels';

describe('actionLabel — strict lookup', () => {
  it('known action → label tiếng Việt', () => {
    expect(actionLabel('create_tx')).toBe('Tạo giao dịch');
    expect(actionLabel('lock_month')).toBe('Khóa tháng');
    expect(actionLabel('export_sales_excel')).toBe('Xuất Excel doanh số');
    expect(actionLabel('submit_batch')).toBe('Gửi batch đối chiếu');
  });

  it('unknown action → null', () => {
    expect(actionLabel('foo_bar')).toBeNull();
    expect(actionLabel('approve')).toBeNull();         // type enum dùng approve_batch
    expect(actionLabel('approved')).toBeNull();        // ghi ở auditLogs generic
    expect(actionLabel('approve_sales_program')).toBeNull(); // legacy naming
  });

  it('null/undefined/empty → null', () => {
    expect(actionLabel(null)).toBeNull();
    expect(actionLabel(undefined)).toBeNull();
    expect(actionLabel('')).toBeNull();
  });
});

describe('actionLabelOrRaw — fallback an toàn (TOLERANT)', () => {
  it('known action → label tiếng Việt', () => {
    expect(actionLabelOrRaw('create_tx')).toBe('Tạo giao dịch');
    expect(actionLabelOrRaw('export_sales_excel')).toBe('Xuất Excel doanh số');
  });

  it('unknown action → fallback raw string (KHÔNG throw)', () => {
    expect(actionLabelOrRaw('foo_bar')).toBe('foo_bar');
    expect(actionLabelOrRaw('approved')).toBe('approved');
    expect(actionLabelOrRaw('approve_sales_program')).toBe('approve_sales_program');
  });

  it('null/undefined/empty → "(không xác định)"', () => {
    expect(actionLabelOrRaw(null)).toBe('(không xác định)');
    expect(actionLabelOrRaw(undefined)).toBe('(không xác định)');
    expect(actionLabelOrRaw('')).toBe('(không xác định)');
  });
});

describe('isKnownAction', () => {
  it('action có trong mapping → true', () => {
    expect(isKnownAction('create_tx')).toBe(true);
    expect(isKnownAction('lock_month')).toBe(true);
    expect(isKnownAction('configure_program')).toBe(true);
  });

  it('action ngoài mapping → false', () => {
    expect(isKnownAction('approved')).toBe(false);
    expect(isKnownAction('create_sales_program')).toBe(false);  // legacy naming
    expect(isKnownAction('xyz_random')).toBe(false);
  });

  it('null/empty → false', () => {
    expect(isKnownAction(null)).toBe(false);
    expect(isKnownAction(undefined)).toBe(false);
    expect(isKnownAction('')).toBe(false);
  });
});

describe('moduleLabel', () => {
  it('3 module enum chuẩn', () => {
    expect(moduleLabel('batch')).toBe('Batch');
    expect(moduleLabel('transaction')).toBe('Giao dịch');
    expect(moduleLabel('program')).toBe('CT khuyến mãi');
  });

  it('null/undefined → "—"', () => {
    expect(moduleLabel(null)).toBe('—');
    expect(moduleLabel(undefined)).toBe('—');
  });

  it('unknown module → echo raw (tolerant)', () => {
    expect(moduleLabel('foo')).toBe('foo');
  });
});
