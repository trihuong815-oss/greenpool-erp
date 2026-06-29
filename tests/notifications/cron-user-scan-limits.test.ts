// PR-CRON-LIMIT-USERS (2026-06-30) — Regression guard.
//
// Cả 2 cron handler scan `users` collection bị flag P0 trong DATA-SCALE-AUDIT-01
// vì chạy `.where('status','==','active').get()` KHÔNG có `.limit()`.
//
// Test này KHÔNG mock Firebase Admin SDK (sẽ phải mock cả messaging/auditLog
// → fragile). Thay vào đó: static source assertion — đọc file route và verify:
//   1. có khai báo `USER_SCAN_HARD_LIMIT = 500`
//   2. có gọi `.limit(USER_SCAN_HARD_LIMIT)` trên users query
//   3. response chứa field `truncated` để monitoring catch khi chạm cap
//
// Nếu ai future refactor xoá limit, test fail. Cheap, catches regression.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readRoute(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf-8');
}

const CLEANUP_FCM = 'app/api/cron/cleanup-stale-fcm/route.ts';
const MORNING_SUMMARY = 'app/api/cron/send-morning-summary/route.ts';

describe('cleanup-stale-fcm — user scan limit', () => {
  const src = readRoute(CLEANUP_FCM);

  it('declares USER_SCAN_HARD_LIMIT = 500', () => {
    expect(src).toMatch(/USER_SCAN_HARD_LIMIT\s*=\s*500/);
  });

  it('applies .limit(USER_SCAN_HARD_LIMIT) on users query', () => {
    expect(src).toMatch(/\.limit\(USER_SCAN_HARD_LIMIT\)/);
  });

  it('checks truncated flag (snap.size >= USER_SCAN_HARD_LIMIT)', () => {
    expect(src).toMatch(/snap\.size\s*>=\s*USER_SCAN_HARD_LIMIT/);
  });

  it('response payload includes truncated field for monitoring', () => {
    expect(src).toMatch(/truncated/);
    expect(src).toMatch(/scanLimit:\s*USER_SCAN_HARD_LIMIT/);
  });

  it('warns to stderr/Cloud Run logs when cap hit', () => {
    expect(src).toMatch(/console\.warn\([^)]*USER_SCAN_HARD_LIMIT/);
  });

  it('TODO comment exists about cursor pagination when cap hit', () => {
    expect(src.toLowerCase()).toMatch(/todo[\s\S]{0,200}cursor/);
  });
});

describe('send-morning-summary — user scan limit', () => {
  const src = readRoute(MORNING_SUMMARY);

  it('declares USER_SCAN_HARD_LIMIT = 500', () => {
    expect(src).toMatch(/USER_SCAN_HARD_LIMIT\s*=\s*500/);
  });

  it('applies .limit(USER_SCAN_HARD_LIMIT) on users query', () => {
    expect(src).toMatch(/\.limit\(USER_SCAN_HARD_LIMIT\)/);
  });

  it('checks usersTruncated flag', () => {
    expect(src).toMatch(/usersSnap\.size\s*>=\s*USER_SCAN_HARD_LIMIT/);
  });

  it('response payload includes truncated + scanLimit fields', () => {
    expect(src).toMatch(/truncated:\s*usersTruncated/);
    expect(src).toMatch(/scanLimit:\s*USER_SCAN_HARD_LIMIT/);
  });

  it('warns when cap hit', () => {
    expect(src).toMatch(/console\.warn\([^)]*USER_SCAN_HARD_LIMIT/);
  });

  it('TODO comment about cursor pagination', () => {
    expect(src.toLowerCase()).toMatch(/todo[\s\S]{0,200}cursor/);
  });
});

describe('regression sanity: no other user-scanning cron silently full-scans', () => {
  // Quick guard against future cron handlers reverting the pattern.
  // Both files must NOT contain an UNLIMITED users query like:
  //   .collection(COLLECTIONS.USERS).where('status','==','active').get()
  // without a .limit() between them.
  it.each([CLEANUP_FCM, MORNING_SUMMARY])('%s does not contain unlimited users query', (path) => {
    const src = readRoute(path);
    // Strip the limit call to test the surface area. If a NEW pattern slips in
    // without limit, this regex would match it.
    const offenderPattern = /COLLECTIONS\.USERS\)[\s\S]{0,400}\.where\([^)]*['"]status['"][\s\S]{0,200}\)\.get\(\)/;
    const matches = src.match(offenderPattern) ?? [];
    for (const m of matches) {
      expect(m).toMatch(/\.limit\(/);
    }
  });
});
