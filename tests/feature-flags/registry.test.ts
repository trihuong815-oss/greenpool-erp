import { describe, expect, it } from 'vitest';
import { evalFlag, hashPercent } from '@/lib/feature-flags/registry';

const DEF = { key: 'TEST', description: 'test', defaultEnabled: false };

describe('feature-flags evalFlag', () => {
  it('returns defaultEnabled khi value undefined', () => {
    expect(evalFlag(undefined, DEF, 'u1', 'CEO')).toBe(false);
    expect(evalFlag(undefined, { ...DEF, defaultEnabled: true }, 'u1', 'CEO')).toBe(true);
  });

  // M2.2 PR-6.1 (2026-06-20): semantics mới — allowList/allowRoles ƯU TIÊN HƠN
  // kill switch để pattern canary {enabled:false, allowList:[uid]} hoạt động.
  it('canary pattern: allowList ƯU TIÊN HƠN kill switch enabled=false', () => {
    // uid trong allowList → TRUE dù enabled=false
    expect(evalFlag({ enabled: false, allowList: ['u1'] }, DEF, 'u1', 'CEO')).toBe(true);
    // uid KHÔNG trong allowList → FALSE (kill switch)
    expect(evalFlag({ enabled: false, allowList: ['u1'] }, DEF, 'u2', 'CEO')).toBe(false);
  });

  it('canary pattern: allowRoles ƯU TIÊN HƠN kill switch enabled=false', () => {
    // role trong allowRoles → TRUE dù enabled=false
    expect(evalFlag({ enabled: false, allowRoles: ['CEO'] }, DEF, 'u1', 'CEO')).toBe(true);
    // role KHÔNG trong allowRoles → FALSE (kill switch)
    expect(evalFlag({ enabled: false, allowRoles: ['CEO'] }, DEF, 'u1', 'NV_SALE')).toBe(false);
  });

  it('kill switch full khi không có canary override', () => {
    expect(evalFlag({ enabled: false }, DEF, 'u1', 'CEO')).toBe(false);
    expect(evalFlag({ enabled: false, allowList: [] }, DEF, 'u1', 'CEO')).toBe(false);
    expect(evalFlag({ enabled: false, rolloutPercent: 100 }, DEF, 'u1', 'CEO')).toBe(false);
  });

  it('allowList hit → true khi enabled=true (full rollout vẫn enable)', () => {
    expect(evalFlag({ enabled: true, allowList: ['u1', 'u2'] }, DEF, 'u1', 'CEO')).toBe(true);
    expect(evalFlag({ enabled: true, allowList: ['u1', 'u2'] }, DEF, 'u3', 'CEO')).toBe(true); // fall through enabled
  });

  it('allowRoles hit → true khi enabled=true', () => {
    expect(evalFlag({ enabled: true, allowRoles: ['CEO', 'ADMIN'] }, DEF, 'u1', 'CEO')).toBe(true);
    expect(evalFlag({ enabled: true, allowRoles: ['CEO', 'ADMIN'] }, DEF, 'u1', 'NV_SALE')).toBe(true); // fall through enabled
  });

  it('rolloutPercent: deterministic per uid; chỉ áp dụng khi không match allow + enabled=true', () => {
    expect(evalFlag({ enabled: true, rolloutPercent: 100 }, DEF, 'u1', 'CEO')).toBe(true);
    // rolloutPercent=0 (out of valid range >0 <100) → fall through enabled=true → true
    expect(evalFlag({ enabled: true, rolloutPercent: 0 }, DEF, 'u1', 'CEO')).toBe(true);
    // Same uid → same decision khi chạy lại
    const a = evalFlag({ enabled: true, rolloutPercent: 50 }, DEF, 'user-xyz', 'CEO');
    const b = evalFlag({ enabled: true, rolloutPercent: 50 }, DEF, 'user-xyz', 'CEO');
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

  // Regression cho canary thực tế PR-6 SALES_V2_EXPORT_EXCEL
  it('regression PR-6: canary TP_KE thấy nút, others ẩn', () => {
    const TPKE_UID = 'I5KxbegamBWU1hdZ9RIKW3uoREs2';
    const flag = { enabled: false, allowList: [TPKE_UID] };
    // TP_KE Nguyễn Thị Hương
    expect(evalFlag(flag, DEF, TPKE_UID, 'TP_KE')).toBe(true);
    // Admin khác
    expect(evalFlag(flag, DEF, 'other-admin-uid', 'ADMIN')).toBe(false);
    // QLCS khác
    expect(evalFlag(flag, DEF, 'qlcs-hm-uid', 'QLCS_HM')).toBe(false);
    // Sale
    expect(evalFlag(flag, DEF, 'sale-uid', 'NV_SALE')).toBe(false);
  });
});
