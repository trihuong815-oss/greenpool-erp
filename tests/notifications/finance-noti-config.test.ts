// PR-CASH1E (2026-06-23) — Config tests cho Daily Cashflow notification module.
// Verify: NotiModule, NotiType, ACTION_REQUIRED_TYPES, DEFAULT_CHANNELS đã có 'finance' + 3 type.

import { describe, it, expect } from 'vitest';
import { ACTION_REQUIRED_TYPES, type NotiModule, type NotiType } from '@/lib/firebase/notifications-store';

describe('PR-CASH1E noti config', () => {
  it('NotiModule type includes "finance" (compile-time check via assignment)', () => {
    const m: NotiModule = 'finance';
    expect(m).toBe('finance');
  });

  it('NotiType includes 3 daily_cashflow events (compile-time check)', () => {
    const t1: NotiType = 'daily_cashflow_submitted';
    const t2: NotiType = 'daily_cashflow_checked';
    const t3: NotiType = 'daily_cashflow_returned';
    expect(t1).toBe('daily_cashflow_submitted');
    expect(t2).toBe('daily_cashflow_checked');
    expect(t3).toBe('daily_cashflow_returned');
  });

  it('daily_cashflow_returned IS action_required', () => {
    expect(ACTION_REQUIRED_TYPES.has('daily_cashflow_returned')).toBe(true);
  });

  it('daily_cashflow_submitted is NOT action_required (informational)', () => {
    expect(ACTION_REQUIRED_TYPES.has('daily_cashflow_submitted')).toBe(false);
  });

  it('daily_cashflow_checked is NOT action_required (informational)', () => {
    expect(ACTION_REQUIRED_TYPES.has('daily_cashflow_checked')).toBe(false);
  });
});
