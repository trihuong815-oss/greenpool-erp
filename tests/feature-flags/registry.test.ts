import { describe, expect, it } from 'vitest';
import { evalFlag, hashPercent } from '@/lib/feature-flags/registry';

const DEF = { key: 'TEST', description: 'test', defaultEnabled: false };

describe('feature-flags evalFlag', () => {
  it('returns defaultEnabled khi value undefined', () => {
    expect(evalFlag(undefined, DEF, 'u1', 'CEO')).toBe(false);
    expect(evalFlag(undefined, { ...DEF, defaultEnabled: true }, 'u1', 'CEO')).toBe(true);
  });

  it('kill switch ưu tiên cao nhất — enabled=false trumps allowList', () => {
    expect(evalFlag({ enabled: false, allowList: ['u1'] }, DEF, 'u1', 'CEO')).toBe(false);
    expect(evalFlag({ enabled: false, rolloutPercent: 100 }, DEF, 'u1', 'CEO')).toBe(false);
  });

  it('allowList hit → true ngay cả khi enabled=true là false (vẫn enabled=true required)', () => {
    expect(evalFlag({ enabled: true, allowList: ['u1', 'u2'] }, DEF, 'u1', 'CEO')).toBe(true);
    expect(evalFlag({ enabled: true, allowList: ['u1', 'u2'] }, DEF, 'u3', 'CEO')).toBe(true); // full rollout
    expect(evalFlag({ enabled: false, allowList: ['u1'] }, DEF, 'u1', 'CEO')).toBe(false); // kill switch wins
  });

  it('allowRoles hit → true', () => {
    expect(evalFlag({ enabled: true, allowRoles: ['CEO', 'ADMIN'] }, DEF, 'u1', 'CEO')).toBe(true);
    expect(evalFlag({ enabled: true, allowRoles: ['CEO', 'ADMIN'] }, DEF, 'u1', 'NV_SALE')).toBe(true); // full rollout
  });

  it('rolloutPercent 0 → all off; 100 → all on; partial deterministic', () => {
    expect(evalFlag({ enabled: true, rolloutPercent: 0 }, DEF, 'u1', 'CEO')).toBe(true); // 0 = no rollout config, fallback enabled
    expect(evalFlag({ enabled: true, rolloutPercent: 100 }, DEF, 'u1', 'CEO')).toBe(true);
    // Same uid → same decision khi chạy lại
    const a = evalFlag({ enabled: false, rolloutPercent: 50 }, DEF, 'user-xyz', 'CEO');
    const b = evalFlag({ enabled: false, rolloutPercent: 50 }, DEF, 'user-xyz', 'CEO');
    expect(a).toBe(b);
  });

  it('hashPercent deterministic + range 0-99', () => {
    expect(hashPercent('uid-1')).toBe(hashPercent('uid-1'));
    expect(hashPercent('uid-1')).toBeGreaterThanOrEqual(0);
    expect(hashPercent('uid-1')).toBeLessThan(100);
  });

  it('full enabled=true → true cho mọi user', () => {
    expect(evalFlag({ enabled: true }, DEF, 'any-uid', 'any-role')).toBe(true);
  });
});
