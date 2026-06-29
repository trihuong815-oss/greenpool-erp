// Tests cho lib/auth/request-origin.ts — CSRF allowlist + host fallback.
// Phủ scenarios HTTP/2 (App Hosting Envoy), Vercel, custom domain, malicious.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getRequestOrigin,
  getRequestHost,
  getRequestSelfOrigin,
  isAllowedOrigin,
} from '@/lib/auth/request-origin';

// ─── Fixture builder ────────────────────────────────────────────────

interface MockReqOpts {
  headers?: Record<string, string>;
  nextUrlHost?: string;
  nextUrlProtocol?: string;
}

function makeReq(opts: MockReqOpts = {}): any {
  const headers = new Map<string, string>();
  for (const [k, v] of Object.entries(opts.headers ?? {})) {
    headers.set(k.toLowerCase(), v);
  }
  return {
    headers: {
      get: (k: string) => headers.get(k.toLowerCase()) ?? null,
    },
    nextUrl: opts.nextUrlHost !== undefined
      ? {
          host: opts.nextUrlHost,
          protocol: opts.nextUrlProtocol ?? 'https:',
        }
      : undefined,
  };
}

// ─── ENV switch helper (vi.stubEnv works around NODE_ENV being read-only) ──

function setProd() {
  vi.stubEnv('NODE_ENV', 'production');
}

function setDev() {
  vi.stubEnv('NODE_ENV', 'development');
}

beforeEach(() => {
  setProd(); // default to prod for strict allowlist tests
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ─── getRequestOrigin ───────────────────────────────────────────────

describe('getRequestOrigin', () => {
  it('returns lowercase origin', () => {
    const req = makeReq({ headers: { origin: 'HTTPS://Example.COM' } });
    expect(getRequestOrigin(req)).toBe('https://example.com');
  });

  it('returns null when missing', () => {
    expect(getRequestOrigin(makeReq())).toBe(null);
  });
});

// ─── getRequestHost ─────────────────────────────────────────────────

describe('getRequestHost', () => {
  it('prefers nextUrl.host', () => {
    const req = makeReq({
      nextUrlHost: 'a.example.com',
      headers: { host: 'b.example.com', 'x-forwarded-host': 'c.example.com' },
    });
    expect(getRequestHost(req)).toBe('a.example.com');
  });

  it('falls back to host header when nextUrl empty', () => {
    const req = makeReq({ headers: { host: 'b.example.com' } });
    expect(getRequestHost(req)).toBe('b.example.com');
  });

  it('falls back to x-forwarded-host', () => {
    const req = makeReq({ headers: { 'x-forwarded-host': 'd.example.com' } });
    expect(getRequestHost(req)).toBe('d.example.com');
  });

  it('falls back to :authority (HTTP/2)', () => {
    const req = makeReq({ headers: { ':authority': 'e.example.com' } });
    expect(getRequestHost(req)).toBe('e.example.com');
  });

  it('returns null when ALL sources empty (degenerate Envoy case)', () => {
    expect(getRequestHost(makeReq())).toBe(null);
  });

  it('lowercases result', () => {
    const req = makeReq({ nextUrlHost: 'EXAMPLE.COM' });
    expect(getRequestHost(req)).toBe('example.com');
  });
});

// ─── getRequestSelfOrigin ───────────────────────────────────────────

describe('getRequestSelfOrigin', () => {
  it('reconstructs https://host from prod env', () => {
    const req = makeReq({ nextUrlHost: 'erp.greenpool.vn', nextUrlProtocol: 'https:' });
    expect(getRequestSelfOrigin(req)).toBe('https://erp.greenpool.vn');
  });

  it('respects x-forwarded-proto', () => {
    const req = makeReq({
      nextUrlHost: 'erp.greenpool.vn',
      headers: { 'x-forwarded-proto': 'https' },
    });
    expect(getRequestSelfOrigin(req)).toBe('https://erp.greenpool.vn');
  });

  it('returns null when host unresolvable', () => {
    expect(getRequestSelfOrigin(makeReq())).toBe(null);
  });
});

// ─── isAllowedOrigin: ENV gate ─────────────────────────────────────

describe('isAllowedOrigin — dev env', () => {
  it('dev env always allows (returns reason=dev)', () => {
    setDev();
    const req = makeReq({ headers: { origin: 'https://evil.com' } });
    const r = isAllowedOrigin(req);
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('dev');
  });
});

// ─── isAllowedOrigin: no origin ─────────────────────────────────────

describe('isAllowedOrigin — no origin', () => {
  it('missing origin passes (server-side / RSC fetch)', () => {
    const req = makeReq({ nextUrlHost: 'erp.greenpool.vn' });
    const r = isAllowedOrigin(req);
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('no-origin');
  });
});

// ─── isAllowedOrigin: allowlist-exact ───────────────────────────────

describe('isAllowedOrigin — exact allowlist', () => {
  it.each([
    'https://greenpool-erp.vercel.app',
    'https://greenpool-erp--green-pool-system.asia-southeast1.hosted.app',
    'https://erp.greenpool.vn',
  ])('%s → allowed (exact)', (origin) => {
    const req = makeReq({ headers: { origin } });
    const r = isAllowedOrigin(req);
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('allowlist-exact');
  });

  it('exact match is case-insensitive (origin header may have mixed case)', () => {
    const req = makeReq({
      headers: { origin: 'HTTPS://greenpool-erp.vercel.app' },
    });
    const r = isAllowedOrigin(req);
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('allowlist-exact');
  });
});

// ─── isAllowedOrigin: allowlist-suffix ──────────────────────────────

describe('isAllowedOrigin — suffix allowlist (.vercel.app / .hosted.app)', () => {
  it('Vercel preview deploy → allowed (suffix)', () => {
    const req = makeReq({
      headers: { origin: 'https://greenpool-erp-git-feature-x.vercel.app' },
    });
    const r = isAllowedOrigin(req);
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('allowlist-suffix');
  });

  it('App Hosting alias → allowed (suffix)', () => {
    const req = makeReq({
      headers: { origin: 'https://some-new-build.asia-southeast1.hosted.app' },
    });
    const r = isAllowedOrigin(req);
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('allowlist-suffix');
  });
});

// ─── isAllowedOrigin: same-origin via nextUrl ───────────────────────

describe('isAllowedOrigin — same-origin via reconstructed self', () => {
  it('Custom domain not in allowlist but matches self origin → allowed', () => {
    const req = makeReq({
      nextUrlHost: 'staging.greenpool.vn',
      nextUrlProtocol: 'https:',
      headers: { origin: 'https://staging.greenpool.vn' },
    });
    const r = isAllowedOrigin(req);
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('same-origin');
  });
});

// ─── isAllowedOrigin: REJECT ────────────────────────────────────────

describe('isAllowedOrigin — rejected', () => {
  it('Malicious cross-origin POST → rejected', () => {
    const req = makeReq({
      nextUrlHost: 'erp.greenpool.vn',
      headers: { origin: 'https://evil.attacker.com' },
    });
    const r = isAllowedOrigin(req);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('rejected');
  });

  it('Subdomain phishing: not in allowlist, not self, not suffix → rejected', () => {
    const req = makeReq({
      nextUrlHost: 'erp.greenpool.vn',
      headers: { origin: 'https://erp.greenpool.vn.evil.com' },
    });
    const r = isAllowedOrigin(req);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('rejected');
  });

  it('Malformed origin → rejected', () => {
    const req = makeReq({
      nextUrlHost: 'erp.greenpool.vn',
      headers: { origin: 'not a url' },
    });
    const r = isAllowedOrigin(req);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('rejected');
  });
});

// ─── KEY SCENARIO: HTTP/2 App Hosting (the original bug) ───────────

describe('isAllowedOrigin — HTTP/2 App Hosting bug reproduction', () => {
  it('HTTP/2 request with NO host header, only :authority → allowed via exact allowlist', () => {
    // Simulates exact production scenario: Envoy strips host header,
    // backend sees only :authority. Origin is the public hosted.app URL.
    const req = makeReq({
      // No host, no x-forwarded-host. Only :authority + nextUrl.
      headers: {
        ':authority': 'greenpool-erp--green-pool-system.asia-southeast1.hosted.app',
        origin: 'https://greenpool-erp--green-pool-system.asia-southeast1.hosted.app',
      },
      nextUrlHost: 'greenpool-erp--green-pool-system.asia-southeast1.hosted.app',
    });
    const r = isAllowedOrigin(req);
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('allowlist-exact');
  });

  it('HTTP/2 with absolutely empty host (degenerate) — still allowed for known origin', () => {
    // Worst case: nextUrl.host is also empty. Origin allowlist still saves us.
    const req = makeReq({
      headers: {
        origin: 'https://greenpool-erp--green-pool-system.asia-southeast1.hosted.app',
      },
      // no nextUrlHost
    });
    const r = isAllowedOrigin(req);
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('allowlist-exact');
  });

  it('Reject malicious origin even when host empty (allowlist-only path)', () => {
    const req = makeReq({
      headers: { origin: 'https://evil.com' },
      // no host info at all
    });
    const r = isAllowedOrigin(req);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('rejected');
  });
});
