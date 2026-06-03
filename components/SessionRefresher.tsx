'use client';

// Session auto-refresh — tự renew cookie 14d mỗi khi mở app + định kỳ 24h.
// Logic:
// 1. Mount: check Firebase Auth client → nếu signed-in → lấy fresh ID token → POST /api/auth/session
// 2. Interval 24h: lặp lại khi tab open
// 3. Visibility change: khi tab quay lại foreground → refresh ngay
//
// Effect: chỉ cần mở app 1 lần / 14 ngày là session sống mãi.
// Bảo mật: ID token tự expire 1h, Firebase client auto-refresh; session cookie httpOnly.

import { useEffect } from 'react';

const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h (renew session cookie)
const TOKEN_REFRESH_INTERVAL_MS = 50 * 60 * 1000; // 50p — force ID token refresh trước khi 1h expire,
                                                  // để realtime listener không bao giờ gặp expired token.
const STORAGE_KEY = 'gp_last_session_refresh';

async function refreshSession(): Promise<boolean> {
  try {
    const { getFirebaseClientAuth, isFirebaseClientReady } = await import('@/lib/firebase/client');
    if (!isFirebaseClientReady()) return false;
    const auth = getFirebaseClientAuth();
    const user = auth.currentUser;
    if (!user) return false; // không signed-in client-side → để middleware redirect /login bình thường
    // Force refresh ID token (Firebase tự refresh sau 1h, nhưng force fresh để chắc)
    const idToken = await user.getIdToken(/* forceRefresh */ false);
    const res = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) return false;
    try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch { /* ignore */ }
    return true;
  } catch {
    return false;
  }
}

export function SessionRefresher() {
  useEffect(() => {
    // Skip nếu vừa refresh < 1h trước (tránh hammering server khi navigate trong app)
    let lastRefresh = 0;
    try { lastRefresh = Number(localStorage.getItem(STORAGE_KEY) ?? '0'); } catch { /* ignore */ }
    const sinceLast = Date.now() - lastRefresh;
    if (sinceLast > 60 * 60_000) {
      // > 1h since last refresh → refresh now
      refreshSession();
    }

    // Định kỳ 24h: renew session cookie
    const id = setInterval(() => { refreshSession(); }, REFRESH_INTERVAL_MS);

    // CHU KỲ 50p: force ID token refresh — phòng ngừa realtime listener (Firestore onSnapshot)
    // nhận expired token sau 1h. Firebase client tự refresh khi có API call, nhưng listener
    // realtime không trigger refresh → cần ép explicit.
    const tokenId = setInterval(async () => {
      try {
        const { getFirebaseClientAuth, isFirebaseClientReady } = await import('@/lib/firebase/client');
        if (!isFirebaseClientReady()) return;
        const auth = getFirebaseClientAuth();
        const user = auth.currentUser;
        if (user) await user.getIdToken(/* forceRefresh */ true);
      } catch { /* silent — listener sẽ tự retry qua subscribeRealtime nếu fail */ }
    }, TOKEN_REFRESH_INTERVAL_MS);

    // Visibility change: khi tab background → foreground, refresh nếu > 1h
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        let last = 0;
        try { last = Number(localStorage.getItem(STORAGE_KEY) ?? '0'); } catch { /* ignore */ }
        if (Date.now() - last > 60 * 60_000) refreshSession();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(id);
      clearInterval(tokenId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return null;
}
