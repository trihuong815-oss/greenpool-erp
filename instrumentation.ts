// Phase A.6 (2026-06-07): Next.js instrumentation hook for Sentry.
// Next.js gọi register() khi server start → load Sentry config theo runtime.
// Khi NEXT_PUBLIC_SENTRY_DSN không set → Sentry no-op (xem các file sentry.*.config.ts).

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Phase A.6: forward Next.js request errors to Sentry — chỉ khi DSN có set.
// Signature theo Next.js 15 onRequestError API.
export const onRequestError = async (
  err: unknown,
  request: any,
  context: any,
) => {
  if (process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN) {
    try {
      const Sentry = await import('@sentry/nextjs');
      Sentry.captureRequestError(err, request, context);
    } catch {
      // Silent — Sentry không khả dụng
    }
  }
};
