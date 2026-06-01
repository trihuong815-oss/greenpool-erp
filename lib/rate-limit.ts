// Rate limiter in-memory cho API endpoints (Phase 13.5 — Security).
// Sliding window counter — đếm số request trong cửa sổ N giây gần nhất.
//
// Hạn chế: in-memory → Cloud Run scale ngang thì mỗi instance đếm riêng.
// Trade-off: đủ chuẩn cho MVP, không cần Redis. Khi cần strict → migrate Firestore counter
// hoặc Memorystore Redis.
//
// Cleanup: timestamps cũ tự bị filter khi check → map không grow vô hạn.

interface Window {
  // Mảng timestamps (ms) các request thành công.
  timestamps: number[];
}

const store = new Map<string, Window>();
const CLEANUP_THRESHOLD = 10000;   // sau 10k key → trigger scan dọn key dead
let opsSinceCleanup = 0;

/** Cleanup các key không còn timestamps trong window (chống memory leak khi scale dài hạn). */
function maybeCleanup() {
  opsSinceCleanup++;
  if (opsSinceCleanup < CLEANUP_THRESHOLD) return;
  opsSinceCleanup = 0;
  const now = Date.now();
  for (const [k, w] of store.entries()) {
    // Giả định window cao nhất ~ 1 giờ → filter > 3600s.
    if (w.timestamps.length === 0 || (now - w.timestamps[w.timestamps.length - 1]) > 3_600_000) {
      store.delete(k);
    }
  }
}

/**
 * Check + ghi nhận 1 request. Trả {ok, retryAfter}.
 * @param key Khoá định danh (vd `chat_msg:<uid>`)
 * @param limit Số request tối đa
 * @param windowSec Cửa sổ tính (giây)
 */
export function checkRateLimit(key: string, limit: number, windowSec: number): {
  ok: boolean;
  retryAfter?: number;
  remaining: number;
} {
  maybeCleanup();
  const now = Date.now();
  const windowMs = windowSec * 1000;
  const cutoff = now - windowMs;
  const w = store.get(key) ?? { timestamps: [] };
  // Filter chỉ giữ timestamps trong window
  w.timestamps = w.timestamps.filter((t) => t > cutoff);
  if (w.timestamps.length >= limit) {
    const oldest = w.timestamps[0];
    const retryAfter = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    store.set(key, w);
    return { ok: false, retryAfter, remaining: 0 };
  }
  w.timestamps.push(now);
  store.set(key, w);
  return { ok: true, remaining: limit - w.timestamps.length };
}
