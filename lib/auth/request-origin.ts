// Request origin/host helpers + CSRF allowlist.
//
// Background:
//   Firebase App Hosting routes traffic through Envoy proxy. Envoy:
//   - Terminates client connection (HTTP/1.1 or HTTP/2) and re-emits internally
//     as HTTP/2 to the Next.js backend, dropping the legacy `host:` header in
//     favor of `:authority:` pseudo-header.
//   - May rewrite hostname during routing.
//
//   Result: `req.headers.get('host')` is unreliable on App Hosting. Even
//   `req.nextUrl.host` can be empty or backend-internal in some Edge Runtime
//   environments.
//
//   Conclusion: do NOT compare Origin to Host as the primary CSRF check.
//   Instead, allowlist known production Origins (browser-controlled, cannot
//   be spoofed from XSS — fetch() cannot set Origin header per CORS spec).
//
// CSRF semantics:
//   Browser always sets `Origin` for cross-origin POST. Same-origin POST may
//   omit it (older Safari) — handled by `!origin` pass-through.
//   Origin = scheme + host + port. NOT spoofable by JS in the page.

import type { NextRequest } from 'next/server';

// ─── Production allowlist ───────────────────────────────────────────

/**
 * Exact prod origins we trust 100%. Add new deploys here, not via Host check.
 * Lowercase. No trailing slash.
 */
const PROD_ORIGINS_EXACT: ReadonlySet<string> = new Set([
  'https://greenpool-erp.vercel.app',
  'https://greenpool-erp--green-pool-system.asia-southeast1.hosted.app',
  'https://erp.greenpool.vn',
]);

/**
 * Suffix-match origins — allows preview deploys / aliases / future subdomains
 * within trusted hosting platforms WITHOUT each being hard-coded.
 *
 * Pattern: origin host must end with one of these. Example: any
 *   `*-greenpool-erp.vercel.app` preview, any `*--green-pool-system.*.hosted.app`
 *   App Hosting build, etc.
 *
 * Trade-off: trusts ANYONE running on .vercel.app or .hosted.app to be us.
 * Mitigation: SameSite=lax cookie still protects (cross-site fetch won't
 * carry cookie). This is defense-in-depth, not the only layer.
 */
const PROD_ORIGIN_SUFFIXES: readonly string[] = [
  '.vercel.app',
  '.hosted.app',
];

// ─── Helpers ────────────────────────────────────────────────────────

/** Returns the request's Origin header lowercased, or null. */
export function getRequestOrigin(req: NextRequest): string | null {
  const o = req.headers.get('origin');
  return o ? o.toLowerCase() : null;
}

/**
 * Returns the request's effective host, trying multiple sources:
 *   1. nextUrl.host (Next.js parsed canonical)
 *   2. host header (HTTP/1.1)
 *   3. x-forwarded-host (proxy/CDN forward)
 *   4. :authority pseudo-header (HTTP/2 — some Edge Runtimes expose it)
 *
 * Returns null if all sources empty (rare; means we lost the routing context).
 */
export function getRequestHost(req: NextRequest): string | null {
  const sources: Array<string | null | undefined> = [
    req.nextUrl?.host,
    req.headers.get('host'),
    req.headers.get('x-forwarded-host'),
    req.headers.get(':authority'),
  ];
  for (const s of sources) {
    if (s && s.length > 0) return s.toLowerCase();
  }
  return null;
}

/**
 * Returns the canonical request origin (scheme + host) reconstructed from
 * nextUrl. Used for same-origin comparison fallback.
 *
 * Returns null if we cannot reconstruct.
 */
export function getRequestSelfOrigin(req: NextRequest): string | null {
  const host = getRequestHost(req);
  if (!host) return null;
  // Force https in prod (App Hosting/Vercel always TLS). Dev allows http.
  const proto =
    req.headers.get('x-forwarded-proto')
    || req.nextUrl?.protocol?.replace(':', '')
    || (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  return `${proto}://${host}`.toLowerCase();
}

// ─── Allowlist check ────────────────────────────────────────────────

/**
 * Decide whether a non-GET /api/* request should pass the CSRF origin gate.
 *
 * Rules (any true → allowed):
 *   1. Dev environment (NODE_ENV !== production) — local testing
 *   2. No Origin header — server-side fetch, RSC internal call, some Safari POSTs
 *   3. Origin in static PROD_ORIGINS_EXACT
 *   4. Origin host ends with one of PROD_ORIGIN_SUFFIXES (.vercel.app / .hosted.app)
 *   5. Origin === reconstructed self origin (custom domain we may not hardcode)
 *
 * Returns object with `allowed` + `reason` for debug logging.
 */
export interface OriginCheckResult {
  allowed: boolean;
  reason:
    | 'dev'
    | 'no-origin'
    | 'allowlist-exact'
    | 'allowlist-suffix'
    | 'same-origin'
    | 'rejected';
  origin: string | null;
  host: string | null;
  selfOrigin: string | null;
}

export function isAllowedOrigin(req: NextRequest): OriginCheckResult {
  const origin = getRequestOrigin(req);
  const host = getRequestHost(req);
  const selfOrigin = getRequestSelfOrigin(req);

  if (process.env.NODE_ENV !== 'production') {
    return { allowed: true, reason: 'dev', origin, host, selfOrigin };
  }

  if (!origin) {
    return { allowed: true, reason: 'no-origin', origin, host, selfOrigin };
  }

  if (PROD_ORIGINS_EXACT.has(origin)) {
    return { allowed: true, reason: 'allowlist-exact', origin, host, selfOrigin };
  }

  let originHost: string | null = null;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    // malformed origin → reject
    return { allowed: false, reason: 'rejected', origin, host, selfOrigin };
  }

  for (const suffix of PROD_ORIGIN_SUFFIXES) {
    if (originHost.endsWith(suffix)) {
      return { allowed: true, reason: 'allowlist-suffix', origin, host, selfOrigin };
    }
  }

  if (selfOrigin && origin === selfOrigin) {
    return { allowed: true, reason: 'same-origin', origin, host, selfOrigin };
  }

  return { allowed: false, reason: 'rejected', origin, host, selfOrigin };
}

// ─── Test-only exports ──────────────────────────────────────────────

export const __testing = {
  PROD_ORIGINS_EXACT,
  PROD_ORIGIN_SUFFIXES,
};
