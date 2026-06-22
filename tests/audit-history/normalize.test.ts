// PR-7B (2026-06-23) — Test normalize + merge audit entries.

import { describe, it, expect } from 'vitest';
import {
  normalizeSalesAuditLog,
  normalizeGenericAuditLog,
  mergeAuditEntries,
} from '@/lib/audit-history/normalize';
import type { AuditHistoryEntry } from '@/lib/audit-history/types';

// Mock Timestamp class với toMillis() method
class MockTs {
  constructor(private ms: number) {}
  toMillis() { return this.ms; }
}

describe('normalizeSalesAuditLog — M2.1 schema mới (đầy đủ field)', () => {
  it('full doc → entry đầy đủ', () => {
    const data = {
      changedAt: new MockTs(1719000000000),
      changedBy: 'uid1',
      changedByName: 'Nguyen A',
      changedByRole: 'NV_KE',
      action: 'create_tx',
      module: 'transaction',
      branchId: 'HM',
      month: '2026-06',
      batchId: 'b1',
      transactionId: 't1',
      programId: null,
      field: null,
      oldValue: null,
      newValue: { customerName: 'X' },
      reason: null,
      ip: '127.0.0.1',
    };
    const e = normalizeSalesAuditLog('doc1', data);
    expect(e.id).toBe('doc1');
    expect(e.source).toBe('salesAuditLogs');
    expect(e.occurredAtMs).toBe(1719000000000);
    expect(e.changedAtMs).toBe(1719000000000);
    expect(e.actorId).toBe('uid1');
    expect(e.changedBy).toBe('uid1');
    expect(e.actorName).toBe('Nguyen A');
    expect(e.actorRole).toBe('NV_KE');
    expect(e.module).toBe('transaction');
    expect(e.branchId).toBe('HM');
    expect(e.month).toBe('2026-06');
    expect(e.batchId).toBe('b1');
    expect(e.transactionId).toBe('t1');
    expect(e.action).toBe('create_tx');
    expect(e.newValue).toEqual({ customerName: 'X' });
    expect(e.before).toBeNull();
    expect(e.after).toBeNull();
    expect(e.ip).toBe('127.0.0.1');
  });
});

describe('normalizeSalesAuditLog — LEGACY writeSalesAudit (thiếu branchId/month/role)', () => {
  it('legacy batch approve doc → entry với null/empty fallback', () => {
    const data = {
      changedAt: new MockTs(1719000000000),
      changedBy: 'uid2',
      changedByName: 'TP KE',
      // KHÔNG có changedByRole, module, branchId, month, programId, ip
      action: 'approved',
      batchId: 'b1',
      transactionId: null,
      field: null,
      oldValue: { status: 'pending_review' },
      newValue: { status: 'approved' },
      reason: null,
    };
    const e = normalizeSalesAuditLog('legacy1', data);
    expect(e.source).toBe('salesAuditLogs');
    expect(e.actorRole).toBe('');     // fallback
    expect(e.module).toBe('');        // fallback
    expect(e.branchId).toBeNull();    // fallback
    expect(e.month).toBe('');         // fallback
    expect(e.programId).toBeNull();
    expect(e.ip).toBeNull();
    expect(e.action).toBe('approved');
    expect(e.batchId).toBe('b1');
    expect(e.oldValue).toEqual({ status: 'pending_review' });
    expect(e.newValue).toEqual({ status: 'approved' });
  });

  it('action "return" legacy', () => {
    const e = normalizeSalesAuditLog('l2', {
      changedAt: new MockTs(1719000001000),
      changedBy: 'u',
      changedByName: 'N',
      action: 'return',
      batchId: 'b2',
      reason: 'Sai số liệu',
    });
    expect(e.action).toBe('return');
    expect(e.reason).toBe('Sai số liệu');
  });
});

describe('normalizeGenericAuditLog — auditLogs (module=sales programs lifecycle)', () => {
  it('approve_sales_program doc → entry với before/after', () => {
    const data = {
      createdAt: new Date('2026-06-22T10:00:00Z'),
      userId: 'gdkd_uid',
      actor_name: 'GD KD',
      actor_role: 'GD_KD',
      action: 'approve_sales_program',
      module: 'sales',
      branchId: 'CTT',
      before: { status: 'pending_approval', currentApprover: 'gdkd_uid' },
      after: { status: 'pending_approval', currentApprover: 'gdvp_uid' },
      source: 'api',
    };
    const e = normalizeGenericAuditLog('audit1', data);
    expect(e.id).toBe('audit1');
    expect(e.source).toBe('auditLogs');
    expect(e.occurredAtMs).toBe(Date.UTC(2026, 5, 22, 10));
    expect(e.actorId).toBe('gdkd_uid');
    expect(e.actorName).toBe('GD KD');
    expect(e.actorRole).toBe('GD_KD');
    expect(e.module).toBe('sales');
    expect(e.branchId).toBe('CTT');
    expect(e.month).toBe('');             // auditLogs generic không có month
    expect(e.batchId).toBeNull();
    expect(e.transactionId).toBeNull();
    expect(e.programId).toBeNull();       // explicit field không có; chỉ trong after.id
    expect(e.action).toBe('approve_sales_program');
    expect(e.before).toEqual(data.before);
    expect(e.after).toEqual(data.after);
    expect(e.oldValue).toBeNull();        // không applicable
    expect(e.newValue).toBeNull();
  });

  it('bulk_upsert_sales_targets — branchId null (multi entries)', () => {
    const e = normalizeGenericAuditLog('audit2', {
      createdAt: new Date('2026-06-21T08:00:00Z'),
      userId: 'admin_uid',
      actor_name: 'Admin',
      actor_role: 'ADMIN',
      action: 'bulk_upsert_sales_targets',
      module: 'sales',
      branchId: null,
      before: { count: 5 },
      after: { count: 5, year: 2026, diffs: [] },
    });
    expect(e.action).toBe('bulk_upsert_sales_targets');
    expect(e.branchId).toBeNull();
    expect(e.before).toEqual({ count: 5 });
    expect(e.after).toMatchObject({ count: 5, year: 2026 });
  });

  it('branchId invalid → null (safeBranchId)', () => {
    const e = normalizeGenericAuditLog('audit3', {
      createdAt: new Date(),
      userId: 'u', actor_name: 'X', actor_role: 'X',
      action: 'foo',
      module: 'sales',
      branchId: 'INVALID_BRANCH',
      before: null,
      after: null,
    });
    expect(e.branchId).toBeNull();    // không phải HM/TK/CTT/24/TT
  });
});

describe('toMillis fallback', () => {
  it('handle Date object', () => {
    const e = normalizeGenericAuditLog('x', {
      createdAt: new Date('2026-06-22T10:00:00Z'),
      userId: 'u', actor_name: '', actor_role: '',
      action: 'test', module: 'sales', branchId: null,
    });
    expect(e.occurredAtMs).toBe(Date.UTC(2026, 5, 22, 10));
  });

  it('handle ISO string', () => {
    const e = normalizeSalesAuditLog('x', {
      changedAt: '2026-06-22T10:00:00Z',
      changedBy: 'u', changedByName: '', action: 'test',
    });
    expect(e.occurredAtMs).toBe(Date.UTC(2026, 5, 22, 10));
  });

  it('handle millis number', () => {
    const e = normalizeSalesAuditLog('x', {
      changedAt: 1719000000000,
      changedBy: 'u', changedByName: '', action: 'test',
    });
    expect(e.occurredAtMs).toBe(1719000000000);
  });

  it('handle missing → 0', () => {
    const e = normalizeSalesAuditLog('x', { changedBy: 'u', changedByName: '', action: 'test' });
    expect(e.occurredAtMs).toBe(0);
  });
});

describe('mergeAuditEntries — sort DESC + stable tie-break', () => {
  function mk(id: string, source: 'salesAuditLogs' | 'auditLogs', ms: number): AuditHistoryEntry {
    return {
      id, source, occurredAtMs: ms, changedAtMs: ms,
      actorId: 'u', actorName: '', actorRole: '',
      changedBy: 'u', changedByName: '', changedByRole: '',
      module: '', branchId: null, month: '',
      batchId: null, transactionId: null, programId: null,
      action: 'test', field: null,
      oldValue: null, newValue: null, before: null, after: null,
      reason: null, ip: null,
    };
  }

  it('sort DESC occurredAtMs', () => {
    const out = mergeAuditEntries(
      [mk('a', 'salesAuditLogs', 1000)],
      [mk('b', 'auditLogs', 3000)],
      [mk('c', 'salesAuditLogs', 2000)],
    );
    expect(out.map((e) => e.id)).toEqual(['b', 'c', 'a']);
  });

  it('tie-break by source alphabetical (auditLogs < salesAuditLogs)', () => {
    const out = mergeAuditEntries(
      [mk('a', 'salesAuditLogs', 1000)],
      [mk('b', 'auditLogs', 1000)],
    );
    expect(out.map((e) => e.id)).toEqual(['b', 'a']);   // auditLogs first
  });

  it('tie-break by id when same ms + same source', () => {
    const out = mergeAuditEntries(
      [mk('z', 'salesAuditLogs', 1000), mk('a', 'salesAuditLogs', 1000)],
    );
    expect(out.map((e) => e.id)).toEqual(['a', 'z']);   // id ASC
  });

  it('empty arrays → empty result', () => {
    expect(mergeAuditEntries()).toEqual([]);
    expect(mergeAuditEntries([], [])).toEqual([]);
  });

  it('single source preserved', () => {
    const out = mergeAuditEntries(
      [mk('a', 'salesAuditLogs', 3000), mk('b', 'salesAuditLogs', 1000)],
    );
    expect(out.map((e) => e.id)).toEqual(['a', 'b']);
  });
});
