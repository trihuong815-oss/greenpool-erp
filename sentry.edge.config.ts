// Phase A.6 (2026-06-07): Sentry edge runtime (proxy.ts, middleware).

import * as Sentry from '@sentry/nextjs';

const DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
if (DSN) {
  Sentry.init({
    dsn: DSN,
    enabled: process.env.NODE_ENV === 'production',
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
}
