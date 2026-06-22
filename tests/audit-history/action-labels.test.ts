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
  });

  // PR-7B: actions từ auditLogs generic + legacy salesAuditLogs đã được map
  it('PR-7B — auditLogs generic actions có label', () => {
    expect(actionLabel('create_sales_program')).toBe('Tạo đề xuất khuyến mãi');
    expect(actionLabel('submit_sales_program')).toBe('Gửi đề xuất khuyến mãi');
    expect(actionLabel('approve_sales_program')).toBe('Duyệt chương trình khuyến mãi');
    expect(actionLabel('reject_sales_program')).toBe('Từ chối chương trình khuyến mãi');
    expect(actionLabel('configure_sales_program')).toBe('Cấu hình mã khuyến mãi');
    expect(actionLabel('delete_sales_program')).toBe('Xóa chương trình khuyến mãi');
    expect(actionLabel('update_sales_program')).toBe('Cập nhật chương trình khuyến mãi');
    expect(actionLabel('pause_sales_program')).toBe('Tạm dừng chương trình khuyến mãi');
    expect(actionLabel('resume_sales_program')).toBe('Kích hoạt lại chương trình khuyến mãi');
    expect(actionLabel('bulk_upsert_sales_targets')).toBe('Cập nhật chỉ tiêu doanh số');
  });

  it('PR-7B — legacy salesAuditLogs writeSalesAudit actions', () => {
    expect(actionLabel('approved')).toBe('Duyệt batch (legacy)');
    expect(actionLabel('return')).toBe('Trả batch (legacy)');
    expect(actionLabel('rejected')).toBe('Từ chối batch (legacy)');
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
    expect(actionLabelOrRaw('unknown_xyz_123')).toBe('unknown_xyz_123');
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
    expect(isKnownAction('xyz_random')).toBe(false);
    expect(isKnownAction('foo_bar')).toBe(false);
  });

  it('PR-7B: legacy + program actions ĐÃ có trong mapping → true', () => {
    expect(isKnownAction('approved')).toBe(true);
    expect(isKnownAction('return')).toBe(true);
    expect(isKnownAction('create_sales_program')).toBe(true);
    expect(isKnownAction('configure_sales_program')).toBe(true);
    expect(isKnownAction('bulk_upsert_sales_targets')).toBe(true);
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
