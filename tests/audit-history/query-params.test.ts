// PR-7A (2026-06-22) — Test query param parser.

import { describe, it, expect } from 'vitest';
import {
  parseAuditHistoryQuery,
  AUDIT_HISTORY_DEFAULTS,
} from '@/lib/audit-history/query-params';

function sp(params: Record<string, string>): URLSearchParams {
  return new URLSearchParams(params);
}

describe('parseAuditHistoryQuery — defaults', () => {
  it('empty params → all null, pageSize default 50', () => {
    const q = parseAuditHistoryQuery(sp({}));
    expect(q.month).toBeNull();
    expect(q.branchId).toBeNull();
    expect(q.cursor).toBeNull();
    expect(q.pageSize).toBe(50);
  });
});

describe('parseAuditHistoryQuery — month', () => {
  it('valid YYYY-MM → ok', () => {
    expect(parseAuditHistoryQuery(sp({ month: '2026-06' })).month).toBe('2026-06');
    expect(parseAuditHistoryQuery(sp({ month: '2025-01' })).month).toBe('2025-01');
    expect(parseAuditHistoryQuery(sp({ month: '2030-12' })).month).toBe('2030-12');
  });

  it('"all" → null (xem all months)', () => {
    expect(parseAuditHistoryQuery(sp({ month: 'all' })).month).toBeNull();
  });

  it('empty string → null', () => {
    expect(parseAuditHistoryQuery(sp({ month: '' })).month).toBeNull();
  });

  it('invalid format → throw', () => {
    expect(() => parseAuditHistoryQuery(sp({ month: '2026' }))).toThrow(/month/);
    expect(() => parseAuditHistoryQuery(sp({ month: '2026-13' }))).toThrow(/month/);
    expect(() => parseAuditHistoryQuery(sp({ month: '2026-00' }))).toThrow(/month/);
    expect(() => parseAuditHistoryQuery(sp({ month: 'foo' }))).toThrow(/month/);
    expect(() => parseAuditHistoryQuery(sp({ month: '06-2026' }))).toThrow(/month/);
  });
});

describe('parseAuditHistoryQuery — branchId', () => {
  it('5 cơ sở valid → ok', () => {
    for (const b of ['HM', 'TK', 'CTT', '24', 'TT']) {
      expect(parseAuditHistoryQuery(sp({ branchId: b })).branchId).toBe(b);
    }
  });

  it('"all" → null', () => {
    expect(parseAuditHistoryQuery(sp({ branchId: 'all' })).branchId).toBeNull();
  });

  it('empty → null', () => {
    expect(parseAuditHistoryQuery(sp({ branchId: '' })).branchId).toBeNull();
  });

  it('invalid branch → throw', () => {
    expect(() => parseAuditHistoryQuery(sp({ branchId: 'XX' }))).toThrow(/branchId/);
    expect(() => parseAuditHistoryQuery(sp({ branchId: 'hm' }))).toThrow(/branchId/);   // case-sensitive
    expect(() => parseAuditHistoryQuery(sp({ branchId: '24NCT' }))).toThrow(/branchId/);
  });
});

describe('parseAuditHistoryQuery — cursor', () => {
  it('chuỗi số → ok', () => {
    expect(parseAuditHistoryQuery(sp({ cursor: '1719000000000' })).cursor).toBe('1719000000000');
  });

  it('empty → null', () => {
    expect(parseAuditHistoryQuery(sp({ cursor: '' })).cursor).toBeNull();
  });

  it('non-numeric → throw', () => {
    expect(() => parseAuditHistoryQuery(sp({ cursor: 'abc' }))).toThrow(/cursor/);
    expect(() => parseAuditHistoryQuery(sp({ cursor: '1.5' }))).toThrow(/cursor/);
    expect(() => parseAuditHistoryQuery(sp({ cursor: '-100' }))).toThrow(/cursor/);
  });
});

describe('parseAuditHistoryQuery — pageSize', () => {
  it('default 50', () => {
    expect(parseAuditHistoryQuery(sp({})).pageSize).toBe(50);
  });

  it('valid 1..100 → ok', () => {
    expect(parseAuditHistoryQuery(sp({ pageSize: '1' })).pageSize).toBe(1);
    expect(parseAuditHistoryQuery(sp({ pageSize: '25' })).pageSize).toBe(25);
    expect(parseAuditHistoryQuery(sp({ pageSize: '100' })).pageSize).toBe(100);
  });

  it('> max → clamp về 100', () => {
    expect(parseAuditHistoryQuery(sp({ pageSize: '500' })).pageSize).toBe(100);
    expect(parseAuditHistoryQuery(sp({ pageSize: '99999' })).pageSize).toBe(100);
  });

  it('< 1 hoặc invalid → throw', () => {
    expect(() => parseAuditHistoryQuery(sp({ pageSize: '0' }))).toThrow(/pageSize/);
    expect(() => parseAuditHistoryQuery(sp({ pageSize: '-5' }))).toThrow(/pageSize/);
    expect(() => parseAuditHistoryQuery(sp({ pageSize: '1.5' }))).toThrow(/pageSize/);
    expect(() => parseAuditHistoryQuery(sp({ pageSize: 'abc' }))).toThrow(/pageSize/);
  });
});

describe('parseAuditHistoryQuery — combined', () => {
  it('full params → tất cả parse đúng', () => {
    const q = parseAuditHistoryQuery(sp({
      month: '2026-06',
      branchId: 'HM',
      cursor: '1719000000000',
      pageSize: '25',
    }));
    expect(q).toEqual({
      month: '2026-06',
      branchId: 'HM',
      cursor: '1719000000000',
      pageSize: 25,
    });
  });
});

describe('AUDIT_HISTORY_DEFAULTS', () => {
  it('defaults expose const', () => {
    expect(AUDIT_HISTORY_DEFAULTS.DEFAULT_PAGE_SIZE).toBe(50);
    expect(AUDIT_HISTORY_DEFAULTS.MAX_PAGE_SIZE).toBe(100);
  });
});
