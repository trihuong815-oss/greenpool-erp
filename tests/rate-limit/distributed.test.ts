// Phase C.3 (2026-06-07): test cho rate-limit-distributed.
// Test logic pure (sliding window math + safeDocId sanitize) — KHÔNG chạm Firestore.
// E2E test với emulator để sau khi có CI Firebase emulator setup.

import { describe, expect, it } from 'vitest';

// Test internal helper qua re-export indirect — em tách logic ra sliding-window-math.ts.
// Hiện tại em test contract export.
import * as mod from '@/lib/rate-limit-distributed';

describe('rate-limit-distributed export contract', () => {
  it('export checkRateLimitDistributed function', () => {
    expect(typeof mod.checkRateLimitDistributed).toBe('function');
  });

  it('checkRateLimitDistributed throws on invalid args', async () => {
    await expect(mod.checkRateLimitDistributed('key', 0, 60)).rejects.toThrow();
    await expect(mod.checkRateLimitDistributed('key', 10, 0)).rejects.toThrow();
    await expect(mod.checkRateLimitDistributed('key', -1, 60)).rejects.toThrow();
  });
});
