// Helper: onSnapshot với auto-reconnect + visibility refresh.
// Giải quyết: token expire 1h, network flap, idle tab → listener chết âm thầm.
//
// Pattern:
//   const cleanup = subscribeRealtime({
//     buildQuery: () => query(collection(db,'x'), where(...)),
//     onData: (snap) => {...},
//     onErrorMessage: (msg) => setError(msg),
//     onLoaded: () => setLoading(false),
//   });
//   return cleanup;

import { onSnapshot, type Query, type QuerySnapshot, type DocumentData } from 'firebase/firestore';

interface SubscribeOptions {
  /** Build query động — gọi lại mỗi lần reconnect để lấy fresh reference */
  buildQuery: () => Query<DocumentData>;
  /** Handler data snapshot */
  onData: (snap: QuerySnapshot<DocumentData>) => void;
  /** Show error UI; null = clear error */
  onErrorMessage?: (msg: string | null) => void;
  /** Gọi 1 lần khi đã load xong (success hoặc fail final) */
  onLoaded?: () => void;
  /** Label cho log (vd 'conv', 'messages') */
  label?: string;
  /** Max retry attempts. Default 6 (~ 2+4+8+16+30+30 = 90s) */
  maxRetry?: number;
}

// Lỗi nên retry (không phải lỗi logic)
const RETRYABLE_CODES = new Set([
  'unavailable',         // Firestore offline / network down
  'cancelled',           // request cancelled
  'deadline-exceeded',   // timeout
  'unauthenticated',     // token expired → Firebase auto-refresh, retry sẽ pass
  'permission-denied',   // có thể do token chưa refresh
  'resource-exhausted',  // rate limit
  'internal',            // Firestore internal
  'aborted',             // transient
]);

export function subscribeRealtime(opts: SubscribeOptions): () => void {
  const { buildQuery, onData, onErrorMessage, onLoaded, label = 'rt', maxRetry = 6 } = opts;
  let unsub: (() => void) | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryCount = 0;
  let disposed = false;

  function clearRetry() {
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  }

  function attach() {
    if (disposed) return;
    clearRetry();
    try {
      const q = buildQuery();
      unsub = onSnapshot(q,
        (snap) => {
          if (disposed) return;
          retryCount = 0;                  // reset on success
          onErrorMessage?.(null);          // clear error banner
          onData(snap);
          onLoaded?.();
        },
        (err: any) => {
          if (disposed) return;
          const code = err?.code ?? 'unknown';
          console.error(`[${label} listener]`, code, err?.message);
          // Lỗi index → user phải chờ build, không retry tự động
          if (code === 'failed-precondition') {
            onErrorMessage?.('Index Firestore đang build, vui lòng chờ vài phút.');
            onLoaded?.();
            return;
          }
          // Retry với exponential backoff
          if (RETRYABLE_CODES.has(code) && retryCount < maxRetry) {
            retryCount++;
            const delayMs = Math.min(2000 * Math.pow(2, retryCount - 1), 30000);
            onErrorMessage?.(`Mất kết nối, tự thử lại sau ${Math.round(delayMs / 1000)}s (${retryCount}/${maxRetry})...`);
            retryTimer = setTimeout(() => {
              if (unsub) { try { unsub(); } catch { /* ignore */ } unsub = null; }
              attach();
            }, delayMs);
          } else {
            // Hết retry hoặc lỗi non-retryable → final error
            onErrorMessage?.(`Mất kết nối: ${err?.message ?? code}. Vui lòng reload trang.`);
            onLoaded?.();
          }
        },
      );
    } catch (e: any) {
      console.error(`[${label} attach]`, e);
      onErrorMessage?.(e?.message ?? 'unknown');
      onLoaded?.();
    }
  }

  // Khi tab về visible + đang ở trạng thái retry → force re-attach ngay (không chờ exponential backoff)
  function onVisibility() {
    if (disposed) return;
    if (document.visibilityState === 'visible' && retryCount > 0) {
      retryCount = 0;
      if (unsub) { try { unsub(); } catch { /* ignore */ } unsub = null; }
      attach();
    }
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
  }

  attach();

  return () => {
    disposed = true;
    clearRetry();
    if (unsub) { try { unsub(); } catch { /* ignore */ } unsub = null; }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibility);
    }
  };
}
