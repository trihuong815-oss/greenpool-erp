// Phase A.6 (2026-06-07): Sentry client-side error tracking.
// Setup minimal — chỉ track unhandled errors. Performance tracing OFF (tránh overhead).
// Khi anh đăng ký Sentry và set NEXT_PUBLIC_SENTRY_DSN env trên Vercel, Sentry sẽ activate.
// Khi DSN không set → graceful no-op (không init, không gửi event).

import * as Sentry from '@sentry/nextjs';

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (DSN) {
  Sentry.init({
    dsn: DSN,
    // Chỉ track production. Dev/preview KHÔNG gửi (giảm noise).
    enabled: process.env.NODE_ENV === 'production',
    // Sample 100% errors (priority), 0% transaction (tránh chi phí Sentry).
    tracesSampleRate: 0,
    // PII filtering: KHÔNG gửi email, name. Chỉ uid hash.
    sendDefaultPii: false,
    beforeSend(event) {
      // Strip user info trừ uid hash
      if (event.user) {
        event.user = { id: event.user.id }; // chỉ giữ uid, drop email/username
      }
      return event;
    },
    // Loại bỏ stack frame nội bộ Next.js (giảm noise)
    ignoreErrors: [
      'ResizeObserver loop',
      'Non-Error promise rejection',
      'Hydration failed',
    ],
  });
}
