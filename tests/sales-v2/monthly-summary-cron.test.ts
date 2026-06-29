// PR-SUMMARY-05-CRON-SAFE-ENDPOINT-NO-SCHEDULE (2026-06-29) — Tests cho
// pure helpers của cron endpoint.
//
// CHỈ test pure logic (validateCronSecret, resolveCronMonth,
// resolveCronBranchIds, runMonthlySummaryCronRebuild với rebuildOne mock).
//
// Route handler test trực tiếp khó (cần mock NextRequest + Firestore admin
// + audit log). Helpers tách kỹ rồi nên route handler chỉ là wrapper mỏng.

import { describe, it, expect, vi } from 'vitest';
import {
  validateCronSecret,
  resolveCronMonth,
  resolveCronBranchIds,
  runMonthlySummaryCronRebuild,
} from '@/lib/sales-v2/monthly-summary-cron';
import type { RebuildBranchResult } from '@/lib/sales-v2/monthly-summary-rebuild';

// ─── validateCronSecret ──────────────────────────────────────────────

describe('validateCronSecret', () => {
  it('Env chưa cấu hình (undefined) → 503 missing-env', () => {
    const r = validateCronSecret('whatever', undefined);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('missing-env');
    expect(r.status).toBe(503);
    expect(r.message).toContain('chưa cấu hình');
  });

  it('Env rỗng string → 503 missing-env (cron disabled)', () => {
    const r = validateCronSecret('whatever', '');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('missing-env');
    expect(r.status).toBe(503);
  });

  it('Header null → 401 missing-header', () => {
    const r = validateCronSecret(null, 'secret123');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('missing-header');
    expect(r.status).toBe(401);
  });

  it('Header empty string → 401 missing-header', () => {
    const r = validateCronSecret('', 'secret123');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('missing-header');
    expect(r.status).toBe(401);
  });

  it('Header sai length → 403 wrong-secret', () => {
    const r = validateCronSecret('short', 'much-longer-secret');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('wrong-secret');
    expect(r.status).toBe(403);
  });

  it('Header cùng length nhưng nội dung khác → 403 wrong-secret', () => {
    const r = validateCronSecret('aaaaaaaa', 'bbbbbbbb');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('wrong-secret');
    expect(r.status).toBe(403);
  });

  it('Header khớp env → ok=true', () => {
    const r = validateCronSecret('super-secret-123', 'super-secret-123');
    expect(r.ok).toBe(true);
    expect(r.reason).toBe(null);
    expect(r.status).toBe(200);
  });

  it('Secret khớp ngay cả khi có ký tự đặc biệt unicode-safe', () => {
    const s = 'abc!@#$%^&*()_+-=';
    const r = validateCronSecret(s, s);
    expect(r.ok).toBe(true);
  });
});

// ─── resolveCronMonth ────────────────────────────────────────────────

describe('resolveCronMonth', () => {
  // Fixed time = 2026-06-15 10:00 UTC = 17:00 VN
  const NOW = Date.UTC(2026, 5, 15, 10, 0);

  it('Không truyền month → default = current (VN tz)', () => {
    const r = resolveCronMonth({ nowMs: NOW });
    expect(r.ok).toBe(true);
    expect(r.month).toBe('2026-06');
  });

  it('Truyền empty string → default = current', () => {
    const r = resolveCronMonth({ requestedMonth: '', nowMs: NOW });
    expect(r.ok).toBe(true);
    expect(r.month).toBe('2026-06');
  });

  it('Truyền current → ok', () => {
    const r = resolveCronMonth({ requestedMonth: '2026-06', nowMs: NOW });
    expect(r.ok).toBe(true);
    expect(r.month).toBe('2026-06');
  });

  it('Truyền previous → ok', () => {
    const r = resolveCronMonth({ requestedMonth: '2026-05', nowMs: NOW });
    expect(r.ok).toBe(true);
    expect(r.month).toBe('2026-05');
  });

  it('Truyền month cũ hơn previous → 400', () => {
    const r = resolveCronMonth({ requestedMonth: '2026-01', nowMs: NOW });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
    expect(r.error).toContain('current');
    expect(r.error).toContain('previous');
  });

  it('Truyền future month → 400', () => {
    const r = resolveCronMonth({ requestedMonth: '2026-07', nowMs: NOW });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
  });

  it('Truyền format sai → 400', () => {
    const r = resolveCronMonth({ requestedMonth: '2026/06', nowMs: NOW });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
    expect(r.error).toContain('YYYY-MM');
  });

  it('Truyền string nhưng nội dung rỗng→ default current (không error)', () => {
    const r = resolveCronMonth({ requestedMonth: '', nowMs: NOW });
    expect(r.ok).toBe(true);
    expect(r.month).toBe('2026-06');
  });

  it('Truyền non-string (number cast as any) → 400', () => {
    const r = resolveCronMonth({ requestedMonth: 202606 as unknown as string, nowMs: NOW });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
  });

  it('Edge case — tháng 1 chấp nhận previous = tháng 12 năm trước', () => {
    const jan = Date.UTC(2026, 0, 15, 0, 0);
    const r = resolveCronMonth({ requestedMonth: '2025-12', nowMs: jan });
    expect(r.ok).toBe(true);
    expect(r.month).toBe('2025-12');
  });
});

// ─── resolveCronBranchIds ────────────────────────────────────────────

describe('resolveCronBranchIds', () => {
  it('Không truyền → all 5 branches', () => {
    const r = resolveCronBranchIds();
    expect(r.ok).toBe(true);
    expect(r.branchIds).toEqual(['HM', 'TK', 'CTT', '24', 'TT']);
  });

  it('Empty array → all 5 branches', () => {
    const r = resolveCronBranchIds([]);
    expect(r.ok).toBe(true);
    expect(r.branchIds).toEqual(['HM', 'TK', 'CTT', '24', 'TT']);
  });

  it('Truyền subset hợp lệ → giữ thứ tự caller', () => {
    const r = resolveCronBranchIds(['HM', '24']);
    expect(r.ok).toBe(true);
    expect(r.branchIds).toEqual(['HM', '24']);
  });

  it('Truyền 1 branch sai → 400, không trả branchIds', () => {
    const r = resolveCronBranchIds(['HM', 'XXX']);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
    expect(r.error).toContain('XXX');
    expect(r.branchIds).toBeUndefined();
  });

  it('Lowercase invalid → 400 (case sensitive)', () => {
    const r = resolveCronBranchIds(['hm']);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
  });
});

// ─── runMonthlySummaryCronRebuild ────────────────────────────────────

function makeBranchResult(overrides: Partial<RebuildBranchResult> = {}): RebuildBranchResult {
  return {
    month: '2026-06',
    branchId: 'HM',
    branchSummaryId: '2026-06_HM',
    saleSummaryIds: ['2026-06_sale-a'],
    sourceTransactionCount: 10,
    approvedTransactionCount: 10,
    truncated: false,
    durationMs: 100,
    ...overrides,
  };
}

describe('runMonthlySummaryCronRebuild — sequential success', () => {
  it('5 branches success → ok=true, totalSourceTransactionCount = sum', async () => {
    let now = 1000;
    const rebuildOne = vi.fn(async (input) => {
      now += 50;
      return makeBranchResult({
        branchId: input.branchId,
        sourceTransactionCount: input.branchId === '24' ? 10 : 2,
      });
    });

    const result = await runMonthlySummaryCronRebuild({
      month: '2026-06',
      branchIds: ['HM', 'TK', 'CTT', '24', 'TT'],
      requestedBy: 'cron:test',
      rebuildOne,
      nowMs: () => now,
    });

    expect(result.ok).toBe(true);
    expect(result.month).toBe('2026-06');
    expect(rebuildOne).toHaveBeenCalledTimes(5);
    expect(result.branchResults.length).toBe(5);
    // HM=2 TK=2 CTT=2 24=10 TT=2 → 18
    expect(result.totalSourceTransactionCount).toBe(18);
    expect(result.failedBranch).toBeUndefined();
    expect(result.hasTruncatedBranch).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  it('Sequential — gọi đúng thứ tự branchIds, computedBy=cron', async () => {
    const calls: string[] = [];
    const rebuildOne = vi.fn(async (input) => {
      calls.push(input.branchId);
      expect(input.computedBy).toBe('cron');
      expect(input.requestedBy).toBe('cron:test');
      expect(input.month).toBe('2026-06');
      return makeBranchResult({ branchId: input.branchId });
    });

    await runMonthlySummaryCronRebuild({
      month: '2026-06',
      branchIds: ['HM', 'TK', 'CTT', '24', 'TT'],
      requestedBy: 'cron:test',
      rebuildOne,
      nowMs: () => 1000,
    });

    expect(calls).toEqual(['HM', 'TK', 'CTT', '24', 'TT']);
  });

  it('Không Promise.all — branch thứ N start AFTER branch N-1 finish', async () => {
    const events: Array<{ id: string; phase: 'start' | 'end' }> = [];
    const rebuildOne = vi.fn(async (input) => {
      events.push({ id: input.branchId, phase: 'start' });
      await new Promise((r) => setTimeout(r, 5));
      events.push({ id: input.branchId, phase: 'end' });
      return makeBranchResult({ branchId: input.branchId });
    });

    await runMonthlySummaryCronRebuild({
      month: '2026-06',
      branchIds: ['HM', 'TK', 'CTT'],
      requestedBy: 'cron:test',
      rebuildOne,
      nowMs: () => 1000,
    });

    // Phải là start-end-start-end-start-end (sequential), không phải start-start-start-end-end-end
    expect(events.map((e) => `${e.id}:${e.phase}`)).toEqual([
      'HM:start', 'HM:end',
      'TK:start', 'TK:end',
      'CTT:start', 'CTT:end',
    ]);
  });
});

describe('runMonthlySummaryCronRebuild — fail-fast', () => {
  it('Branch thứ 3 fail → dừng ngay, không gọi branch 4-5', async () => {
    const calls: string[] = [];
    const rebuildOne = vi.fn(async (input) => {
      calls.push(input.branchId);
      if (input.branchId === 'CTT') {
        throw new Error('Firestore unavailable');
      }
      return makeBranchResult({ branchId: input.branchId });
    });

    const result = await runMonthlySummaryCronRebuild({
      month: '2026-06',
      branchIds: ['HM', 'TK', 'CTT', '24', 'TT'],
      requestedBy: 'cron:test',
      rebuildOne,
      nowMs: () => 1000,
    });

    expect(calls).toEqual(['HM', 'TK', 'CTT']);
    expect(rebuildOne).toHaveBeenCalledTimes(3);
    expect(result.ok).toBe(false);
    expect(result.branchResults.length).toBe(2); // HM + TK đã pass
    expect(result.failedBranch).toBeDefined();
    expect(result.failedBranch!.branchId).toBe('CTT');
    expect(result.failedBranch!.error).toContain('Firestore unavailable');
  });

  it('Branch đầu tiên fail → branchResults = [], failedBranch set', async () => {
    const rebuildOne = vi.fn(async () => {
      throw new Error('Auth error');
    });

    const result = await runMonthlySummaryCronRebuild({
      month: '2026-06',
      branchIds: ['HM', 'TK'],
      requestedBy: 'cron:test',
      rebuildOne,
      nowMs: () => 1000,
    });

    expect(result.ok).toBe(false);
    expect(result.branchResults).toEqual([]);
    expect(result.failedBranch!.branchId).toBe('HM');
    expect(rebuildOne).toHaveBeenCalledTimes(1);
  });
});

describe('runMonthlySummaryCronRebuild — truncated warning', () => {
  it('1 branch truncated → ok=true nhưng hasTruncatedBranch=true + warning', async () => {
    const rebuildOne = vi.fn(async (input) => {
      return makeBranchResult({
        branchId: input.branchId,
        truncated: input.branchId === '24',
        sourceTransactionCount: input.branchId === '24' ? 20_000 : 5,
      });
    });

    const result = await runMonthlySummaryCronRebuild({
      month: '2026-06',
      branchIds: ['HM', '24', 'TT'],
      requestedBy: 'cron:test',
      rebuildOne,
      nowMs: () => 1000,
    });

    expect(result.ok).toBe(true);                // KHÔNG fail
    expect(result.hasTruncatedBranch).toBe(true);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain('24');
    expect(result.warnings[0]).toContain('truncated');
    expect(result.branchResults.length).toBe(3); // chạy đủ 3 branches
  });

  it('Nhiều branch truncated → mỗi branch 1 warning', async () => {
    const rebuildOne = vi.fn(async (input) =>
      makeBranchResult({ branchId: input.branchId, truncated: true, sourceTransactionCount: 20_000 }),
    );

    const result = await runMonthlySummaryCronRebuild({
      month: '2026-06',
      branchIds: ['HM', 'TK'],
      requestedBy: 'cron:test',
      rebuildOne,
      nowMs: () => 1000,
    });

    expect(result.ok).toBe(true);
    expect(result.hasTruncatedBranch).toBe(true);
    expect(result.warnings.length).toBe(2);
  });
});

describe('runMonthlySummaryCronRebuild — timing + delay', () => {
  it('durationMs = finishedAt - startedAt', async () => {
    let now = 1000;
    const rebuildOne = vi.fn(async (input) => {
      now += 100;
      return makeBranchResult({ branchId: input.branchId });
    });

    const result = await runMonthlySummaryCronRebuild({
      month: '2026-06',
      branchIds: ['HM', 'TK'],
      requestedBy: 'cron:test',
      rebuildOne,
      nowMs: () => now,
    });

    expect(result.startedAt).toBe(1000);
    expect(result.finishedAt).toBe(1200);
    expect(result.durationMs).toBe(200);
  });

  it('Delay giữa branches → gọi sleep N-1 lần (không sleep sau branch cuối)', async () => {
    const sleep = vi.fn(async () => {});
    const rebuildOne = vi.fn(async (input) =>
      makeBranchResult({ branchId: input.branchId }),
    );

    await runMonthlySummaryCronRebuild({
      month: '2026-06',
      branchIds: ['HM', 'TK', 'CTT'],
      requestedBy: 'cron:test',
      rebuildOne,
      delayMsBetweenBranches: 500,
      sleep,
      nowMs: () => 1000,
    });

    expect(sleep).toHaveBeenCalledTimes(2); // 3 branches → 2 delays
    expect(sleep).toHaveBeenCalledWith(500);
  });

  it('Delay = 0 → không sleep', async () => {
    const sleep = vi.fn(async () => {});
    const rebuildOne = vi.fn(async (input) => makeBranchResult({ branchId: input.branchId }));

    await runMonthlySummaryCronRebuild({
      month: '2026-06',
      branchIds: ['HM', 'TK', 'CTT'],
      requestedBy: 'cron:test',
      rebuildOne,
      delayMsBetweenBranches: 0,
      sleep,
      nowMs: () => 1000,
    });

    expect(sleep).not.toHaveBeenCalled();
  });

  it('Delay không gọi sau branch fail (fail-fast = exit không qua delay block)', async () => {
    const sleep = vi.fn(async () => {});
    const rebuildOne = vi.fn(async (input) => {
      if (input.branchId === 'TK') throw new Error('fail');
      return makeBranchResult({ branchId: input.branchId });
    });

    await runMonthlySummaryCronRebuild({
      month: '2026-06',
      branchIds: ['HM', 'TK', 'CTT'],
      requestedBy: 'cron:test',
      rebuildOne,
      delayMsBetweenBranches: 500,
      sleep,
      nowMs: () => 1000,
    });

    // HM success → sleep(500) trước TK
    // TK fail → return ngay, KHÔNG sleep
    expect(sleep).toHaveBeenCalledTimes(1);
  });
});

// ─── Smoke: KHÔNG dùng debtAmount ────────────────────────────────────

describe('PR-05 sanity: KHÔNG dùng debtAmount field', () => {
  it('Result type KHÔNG có debtAmount property', async () => {
    const rebuildOne = vi.fn(async (input) => makeBranchResult({ branchId: input.branchId }));
    const result = await runMonthlySummaryCronRebuild({
      month: '2026-06',
      branchIds: ['HM'],
      requestedBy: 'cron:test',
      rebuildOne,
      nowMs: () => 1000,
    });
    expect(result).not.toHaveProperty('debtAmount');
    expect(result.branchResults[0]).not.toHaveProperty('debtAmount');
  });
});
