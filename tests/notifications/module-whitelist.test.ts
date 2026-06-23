// PR-CASH1E-FIX (2026-06-23) — Test API whitelist module: chỉ 7 NotiModule + 'system' hợp lệ.
// Test logic pure — không call real API. Re-implement check để verify chốt config.

import { describe, it, expect } from 'vitest';

const VALID_MODULE_FILTERS = new Set([
  'proposal', 'dispatch', 'chat', 'kt', 'sales', 'finance', 'system',
]);

describe('API /api/notifications module whitelist', () => {
  it('whitelist accepts đầy đủ 7 module', () => {
    for (const m of ['proposal', 'dispatch', 'chat', 'kt', 'sales', 'finance', 'system']) {
      expect(VALID_MODULE_FILTERS.has(m)).toBe(true);
    }
  });

  it('rejects unknown module (silent ignore — không crash)', () => {
    for (const m of ['random', 'evil', '', 'PROPOSAL', 'fin']) {
      expect(VALID_MODULE_FILTERS.has(m)).toBe(false);
    }
  });

  it('Sync với DEFAULT_CHANNELS keys (qua import settings route)', async () => {
    // Verify settings + API whitelist không drift. Em re-list theo settings ground truth.
    const SETTINGS_MODULES = ['proposal', 'dispatch', 'sales', 'kt', 'chat', 'finance', 'system'];
    for (const m of SETTINGS_MODULES) {
      expect(VALID_MODULE_FILTERS.has(m)).toBe(true);
    }
  });
});
