// Phase B.2 (2026-06-07): Test cho consolidated types — re-export đúng.
// Đảm bảo lib/types/ barrel hoạt động.

import { describe, it, expect } from 'vitest';
import { BRANCH_IDS, BRANCH_BY_ID, isBranchId, branchName } from '@/lib/types';
import type { BranchId, BranchMeta, UserDoc, Task, TaskStatus } from '@/lib/types';

describe('Consolidated types barrel', () => {
  it('Re-export BRANCH_IDS từ lib/types', () => {
    expect(BRANCH_IDS).toEqual(['HM', 'TK', 'CTT', '24', 'TT']);
  });

  it('BranchId type discriminated union', () => {
    const id: BranchId = 'HM';
    expect(isBranchId(id)).toBe(true);
  });

  it('BranchMeta interface có shape đúng', () => {
    const meta: BranchMeta = BRANCH_BY_ID.HM;
    expect(meta.id).toBe('HM');
    expect(meta.name).toContain('Hoàng Mai');
    expect(meta.shortName).toBe('HM');
    expect(meta.color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('branchName lookup helper', () => {
    expect(branchName('TK')).toContain('Thuỵ Khuê');
  });

  it('TaskStatus union types đúng', () => {
    const status: TaskStatus = 'pending_approval';
    const allowed: TaskStatus[] = [
      'pending_approval', 'pending', 'in_progress',
      'requested_revision', 'done', 'rejected', 'cancelled',
    ];
    expect(allowed).toContain(status);
  });

  it('Task interface shape (compile-time check)', () => {
    // Mock task để verify shape — không cần runtime, chỉ TS check.
    const t: Task = {
      id: 'test',
      kind: 'proposal',
      title: 'Test',
      description: '',
      createdBy: 'uid',
      createdByName: 'Anh',
      createdByRole: 'TP_KT',
      createdByBlock: 'KD',
      createdAt: '2026-06-07T00:00:00Z',
      assigneeBlock: 'KD',
      assigneeDeptId: null,
      assigneeFacilityId: null,
      assigneeUserIds: [],
      crossBlock: false,
      status: 'pending_approval',
      approvalRequiredFrom: null,
      approvedBy: null,
      approvedAt: null,
      rejectionReason: null,
      priority: 'normal',
      dueDate: null,
      progressPct: 0,
      updatedAt: '2026-06-07T00:00:00Z',
      updatedBy: 'uid',
    };
    expect(t.kind).toBe('proposal');
    expect(t.status).toBe('pending_approval');
  });

  it('UserDoc interface shape', () => {
    const u: UserDoc = {
      id: 'uid',
      email: 'test@example.com',
      displayName: 'Test User',
      roleId: 'NV_SALE',
      status: 'active',
    };
    expect(u.roleId).toBe('NV_SALE');
    expect(u.status).toBe('active');
  });
});
