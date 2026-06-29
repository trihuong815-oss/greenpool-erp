// PR-NOTIFICATION-RETENTION (2026-06-30) — Regression guard for cleanup cron.
//
// Route handler `/api/cron/cleanup-notifications` uses Firebase Admin SDK +
// audit log + batch write — full integration mock is fragile. Pattern follows
// existing tests/notifications/cron-user-scan-limits.test.ts: static source
// assertions verify safety invariants by reading file content + regex.
//
// Catches regression if anyone:
//   - removes auth check
//   - removes .limit() guard
//   - removes truncated/scanLimit/retentionDays from response
//   - changes RETENTION_DAYS away from 30 without code review
//   - accidentally drops batch limit + introduces unbounded delete

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROUTE_PATH = 'app/api/cron/cleanup-notifications/route.ts';

function readRoute(): string {
  return readFileSync(resolve(process.cwd(), ROUTE_PATH), 'utf-8');
}

const src = readRoute();

describe('cleanup-notifications — retention config', () => {
  it('declares RETENTION_DAYS = 30 (default per audit)', () => {
    expect(src).toMatch(/RETENTION_DAYS\s*=\s*30/);
  });

  it('declares SCAN_LIMIT = 500 (Firestore batch write hard cap)', () => {
    expect(src).toMatch(/SCAN_LIMIT\s*=\s*500/);
  });

  it('computes RETENTION_MS from RETENTION_DAYS × 24h × 60min × 60s × 1000ms', () => {
    expect(src).toMatch(/RETENTION_MS\s*=\s*RETENTION_DAYS\s*\*\s*24\s*\*\s*60\s*\*\s*60_000/);
  });
});

describe('cleanup-notifications — bounded query', () => {
  it('applies .limit(SCAN_LIMIT) on notifications query', () => {
    expect(src).toMatch(/\.limit\(SCAN_LIMIT\)/);
  });

  it('query filters where createdAt < cutoffTs (preserves recent)', () => {
    expect(src).toMatch(/\.where\(['"]createdAt['"],\s*['"]<['"],\s*cutoffTs\)/);
  });

  it('checks truncated = snap.size >= SCAN_LIMIT', () => {
    expect(src).toMatch(/truncated\s*=\s*snap\.size\s*>=\s*SCAN_LIMIT/);
  });

  it('warns to Cloud Run logs when cap hit', () => {
    expect(src).toMatch(/console\.warn\([^)]*SCAN_LIMIT/);
  });
});

describe('cleanup-notifications — response shape', () => {
  it('includes processed', () => {
    expect(src).toMatch(/processed,?/);
  });
  it('includes affected', () => {
    expect(src).toMatch(/affected,?/);
  });
  it('includes retentionDays: RETENTION_DAYS', () => {
    expect(src).toMatch(/retentionDays:\s*RETENTION_DAYS/);
  });
  it('includes scanLimit: SCAN_LIMIT', () => {
    expect(src).toMatch(/scanLimit:\s*SCAN_LIMIT/);
  });
  it('includes truncated boolean', () => {
    expect(src).toMatch(/truncated,?/);
  });
  it('includes cutoff ISO string', () => {
    expect(src).toMatch(/cutoff:\s*cutoffDate\.toISOString\(\)/);
  });
  it('includes durationMs for observability', () => {
    expect(src).toMatch(/durationMs:\s*Date\.now\(\)\s*-\s*t0/);
  });
});

describe('cleanup-notifications — auth protection', () => {
  it('requires CRON_SECRET env (checks process.env.CRON_SECRET)', () => {
    expect(src).toMatch(/process\.env\.CRON_SECRET/);
  });

  it('uses timing-safe Bearer token compare', () => {
    expect(src).toMatch(/timingSafeEqual/);
    expect(src).toMatch(/Bearer/);
  });

  it('returns 401 Unauthorized when auth fails', () => {
    expect(src).toMatch(/['"]Unauthorized['"][\s\S]{0,80}status:\s*401/);
  });

  it('rejects GET with 405 (no accidental trigger via link)', () => {
    expect(src).toMatch(/export async function GET\(\)/);
    expect(src).toMatch(/status:\s*405/);
  });
});

describe('cleanup-notifications — delete safety', () => {
  it('uses Firestore batch write (atomic, max 500 docs)', () => {
    expect(src).toMatch(/db\.batch\(\)/);
    expect(src).toMatch(/batch\.delete\(/);
    expect(src).toMatch(/batch\.commit\(\)/);
  });

  it('no unbounded delete pattern (no .get() without .limit)', () => {
    // Reject if anyone writes `.get()` immediately after .where on NOTIFICATIONS
    // without a .limit() between them.
    const offender = /COLLECTIONS\.NOTIFICATIONS\)[\s\S]{0,300}\.where\([^)]*\)\.get\(\)/;
    const matches = src.match(offender) ?? [];
    for (const m of matches) {
      expect(m).toMatch(/\.limit\(/);
    }
  });
});

describe('cleanup-notifications — audit log', () => {
  it('logs cleanup_old_notifications action to auditLogs', () => {
    expect(src).toMatch(/action:\s*['"]cleanup_old_notifications['"]/);
  });

  it('audit write is fail-soft (try/catch wraps writeAuditLog)', () => {
    expect(src).toMatch(/try\s*{[\s\S]*writeAuditLog[\s\S]*}\s*catch/);
  });

  it('audit source marked as cron', () => {
    expect(src).toMatch(/source:\s*['"]cron['"]/);
  });
});

describe('cleanup-notifications — schedule status', () => {
  it('documents NO schedule registered yet (manual-only)', () => {
    expect(src).toMatch(/KHÔNG schedule|manual call only|manual-only|no schedule/i);
  });
});

// Regression check: ensure no GitHub Actions workflow auto-triggers this endpoint.
describe('cleanup-notifications — no auto-schedule yet', () => {
  it('no .github/workflows file references cleanup-notifications', () => {
    const { readdirSync } = require('node:fs') as typeof import('node:fs');
    let workflowFiles: string[] = [];
    try {
      workflowFiles = readdirSync(resolve(process.cwd(), '.github/workflows'));
    } catch {
      // .github/workflows may not exist — that's fine
      return;
    }
    for (const f of workflowFiles) {
      const content = readFileSync(resolve(process.cwd(), '.github/workflows', f), 'utf-8');
      expect(content).not.toContain('cleanup-notifications');
    }
  });
});
