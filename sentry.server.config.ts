// Phase A.6 (2026-06-07): Sentry server-side (Node runtime) error tracking.
// Áp cho API routes + Server Components.

import * as Sentry from '@sentry/nextjs';

const DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
if (DSN) {
  Sentry.init({
    dsn: DSN,
    enabled: process.env.NODE_ENV === 'production',
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.user) {
        event.user = { id: event.user.id };
      }
      return event;
    },
  });
}
