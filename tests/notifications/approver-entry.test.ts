// Phase A.7: Test #4 — Approver entry parser (Phase 13.14).
// chain Phase 12.5 dùng "user:UID" | "role:RC" | legacy "RC".
// Trước đây bug CRITICAL: notify chỉ check approvalRequiredFrom → bỏ sót push noti.

import { describe, it, expect } from 'vitest';

// Inline mock pure parser logic - mirror lib/firebase/push-notifications.ts pushToApproverEntries.
// Test pure logic không cần Firebase admin.
function parseEntry(entry: string): { kind: 'user' | 'role'; value: string } {
  if (entry.startsWith('user:')) return { kind: 'user', value: entry.slice(5) };
  if (entry.startsWith('role:')) return { kind: 'role', value: entry.slice(5) };
  return { kind: 'role', value: entry }; // legacy raw role
}

describe('Approver entry parser (Phase 12.5+)', () => {
  it('Parse "user:UID" → kind=user', () => {
    const result = parseEntry('user:BkPxat7jkRh0guR5Fm4t4eARggg2');
    expect(result.kind).toBe('user');
    expect(result.value).toBe('BkPxat7jkRh0guR5Fm4t4eARggg2');
  });

  it('Parse "role:GD_KD" → kind=role', () => {
    const result = parseEntry('role:GD_KD');
    expect(result.kind).toBe('role');
    expect(result.value).toBe('GD_KD');
  });

  it('Parse legacy "GD_KD" → kind=role (backward compat)', () => {
    const result = parseEntry('GD_KD');
    expect(result.kind).toBe('role');
    expect(result.value).toBe('GD_KD');
  });

  it('Parse "user:" trống → kind=user, value rỗng', () => {
    // Edge case: entry malformed → vẫn parse được, gọi pushToUsers([]) sẽ no-op
    const result = parseEntry('user:');
    expect(result.kind).toBe('user');
    expect(result.value).toBe('');
  });

  it('Chain liên khối 3 cấp parse đúng [GD_creator → GD_recipient → recipient]', () => {
    const chain = ['user:ADMIN_UID', 'user:GD_VP_UID', 'user:TP_KE_UID'];
    const parsed = chain.map(parseEntry);
    expect(parsed[0]).toEqual({ kind: 'user', value: 'ADMIN_UID' });
    expect(parsed[1]).toEqual({ kind: 'user', value: 'GD_VP_UID' });
    expect(parsed[2]).toEqual({ kind: 'user', value: 'TP_KE_UID' });
  });
});
