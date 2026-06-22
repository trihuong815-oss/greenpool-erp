// PR-PROMO1A (2026-06-22) — Query params parser cho /chuong-trinh.

import { describe, it, expect } from 'vitest';
import {
  parsePromoQueryParams,
  mapFilterToStatus,
  isProposalScope,
} from '@/lib/sales-v2/promo-query-params';

function sp(obj: Record<string, string>): URLSearchParams {
  return new URLSearchParams(obj);
}

describe('parsePromoQueryParams — valid filters', () => {
  it.each([
    'proposal', 'draft', 'pending_approval', 'approved',
    'active', 'paused', 'rejected', 'expired', 'all',
  ])('filter=%s parses', (f) => {
    expect(parsePromoQueryParams(sp({ filter: f })).filter).toBe(f);
  });
});

describe('parsePromoQueryParams — step', () => {
  it('step=gd_kd parses', () => {
    expect(parsePromoQueryParams(sp({ step: 'gd_kd' })).step).toBe('gd_kd');
  });

  it('step=gd_vp parses', () => {
    expect(parsePromoQueryParams(sp({ step: 'gd_vp' })).step).toBe('gd_vp');
  });

  it('step=invalid → null', () => {
    expect(parsePromoQueryParams(sp({ step: 'gd_xxx' })).step).toBeNull();
  });
});

describe('parsePromoQueryParams — action', () => {
  it('action=configure parses', () => {
    expect(parsePromoQueryParams(sp({ action: 'configure' })).action).toBe('configure');
  });

  it('action=invalid → null', () => {
    expect(parsePromoQueryParams(sp({ action: 'delete' })).action).toBeNull();
  });
});

describe('parsePromoQueryParams — invalid values fallback null (no crash)', () => {
  it('filter=xxx → null', () => {
    expect(parsePromoQueryParams(sp({ filter: 'xxx' })).filter).toBeNull();
  });

  it('empty params → all null', () => {
    expect(parsePromoQueryParams(sp({}))).toEqual({
      filter: null, step: null, action: null,
    });
  });

  it('weird chars → null', () => {
    const q = parsePromoQueryParams(sp({ filter: '<script>', step: ' ', action: '"; DROP--' }));
    expect(q).toEqual({ filter: null, step: null, action: null });
  });
});

describe('parsePromoQueryParams — combined valid', () => {
  it('filter=pending_approval + step=gd_kd', () => {
    expect(parsePromoQueryParams(sp({ filter: 'pending_approval', step: 'gd_kd' }))).toEqual({
      filter: 'pending_approval', step: 'gd_kd', action: null,
    });
  });

  it('filter=approved + action=configure', () => {
    expect(parsePromoQueryParams(sp({ filter: 'approved', action: 'configure' }))).toEqual({
      filter: 'approved', step: null, action: 'configure',
    });
  });
});

describe('parsePromoQueryParams — accepts plain object source (Next.js searchParams)', () => {
  it('object with strings', () => {
    expect(parsePromoQueryParams({ filter: 'active', step: undefined, action: undefined })).toEqual({
      filter: 'active', step: null, action: null,
    });
  });

  it('object with array (Next.js può) → take first', () => {
    expect(parsePromoQueryParams({ filter: ['draft', 'extra'], step: undefined, action: undefined })).toEqual({
      filter: 'draft', step: null, action: null,
    });
  });

  it('object empty → all null', () => {
    expect(parsePromoQueryParams({})).toEqual({ filter: null, step: null, action: null });
  });
});

describe('mapFilterToStatus', () => {
  it.each([
    ['draft', 'draft'],
    ['pending_approval', 'pending_approval'],
    ['approved', 'approved'],
    ['active', 'active'],
    ['paused', 'paused'],
    ['rejected', 'rejected'],
    ['expired', 'expired'],
  ] as const)('%s → %s', (filter, expected) => {
    expect(mapFilterToStatus(filter as any)).toBe(expected);
  });

  it('proposal → all (sub-filter ở Client theo createdBy)', () => {
    expect(mapFilterToStatus('proposal')).toBe('all');
  });

  it('all → all', () => {
    expect(mapFilterToStatus('all')).toBe('all');
  });

  it('null → all', () => {
    expect(mapFilterToStatus(null)).toBe('all');
  });
});

describe('isProposalScope', () => {
  it('proposal → true', () => {
    expect(isProposalScope('proposal')).toBe(true);
  });

  it.each(['draft', 'pending_approval', 'all', null])('%s → false', (f) => {
    expect(isProposalScope(f as any)).toBe(false);
  });
});
