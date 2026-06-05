// Firebase Messaging client wrapper — gọi từ /cong-viec-ca-nhan.
//
// Flow:
// 1. Browser support check (Notification API, Service Worker).
// 2. Register /firebase-messaging-sw.js.
// 3. Request permission (lần đầu) → user bấm Allow.
// 4. getToken(messaging, { vapidKey }) → trả FCM token.
// 5. POST /api/personal/fcm-token để lưu vào Firestore.
// 6. onMessage handler (foreground) → show toast hoặc Notification API.

import { getFirebaseClient, isFirebaseClientReady } from './client';
import type { Messaging } from 'firebase/messaging';

let _messaging: Messaging | null = null;
let _swReg: ServiceWorkerRegistration | null = null;
let _currentToken: string | null = null;

export interface ForegroundPayload {
  title: string;
  body: string;
  taskId?: string;
  kind?: string;
}

/** Check browser support */
export function isFcmSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'Notification' in window && 'serviceWorker' in navigator;
}

/** Trạng thái hiện tại của permission (default / granted / denied) */
export function getNotificationPermission(): NotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
  return Notification.permission;
}

async function loadMessaging(): Promise<Messaging | null> {
  if (_messaging) return _messaging;
  if (!isFcmSupported() || !isFirebaseClientReady()) return null;
  try {
    const { getMessaging, isSupported } = await import('firebase/messaging');
    const supported = await isSupported();
    if (!supported) return null;
    const app = getFirebaseClient();
    _messaging = getMessaging(app);
    return _messaging;
  } catch (e) {
    console.warn('[messaging-client] init failed', e);
    return null;
  }
}

// Bump SW_VERSION mỗi khi sửa firebase-messaging-sw.js → iOS Safari PWA buộc tải SW mới
// (Apple cache SW rất aggressive — không bump version sẽ giữ SW cũ tới 24h+).
const SW_VERSION = '2026-06-02-badge-v3';

async function ensureSWRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (_swReg) return _swReg;
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    // Query string với version → browser nhìn URL khác = tải SW mới
    const swUrl = `/firebase-messaging-sw.js?v=${SW_VERSION}`;
    _swReg = await navigator.serviceWorker.register(swUrl, { scope: '/' });
    // Trigger explicit update check — iOS không tự check như Chrome
    try { await _swReg.update(); } catch { /* ignore */ }
    // Wait for active SW — có timeout 10s. iOS Safari đôi khi không trigger statechange =>
    // promise hang vô hạn. Modern browsers auto-activate trong dưới 1s; nếu quá 10s
    // coi như SW init xong (token sẽ register, nếu fail thì caller retry).
    if (_swReg.installing) {
      await new Promise<void>((resolve) => {
        const sw = _swReg!.installing!;
        const timer = setTimeout(() => {
          console.warn('[messaging-client] SW activation timeout 10s, proceed anyway');
          resolve();
        }, 10000);
        sw.addEventListener('statechange', () => {
          if (sw.state === 'activated') { clearTimeout(timer); resolve(); }
        });
      });
    }
    return _swReg;
  } catch (e) {
    console.warn('[messaging-client] SW register failed', e);
    return null;
  }
}

/** Force update SW + re-register token. Gọi từ banner hoặc settings khi user báo noti không tới.
 *  Trả {updated: boolean, newToken?: string}. */
export async function forceRefreshPushSetup(): Promise<{ updated: boolean; newToken?: string; error?: string }> {
  try {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return { updated: false, error: 'Trình duyệt không hỗ trợ' };
    }
    // 1. Unregister tất cả SW cũ
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) await r.unregister();
    // 2. Clear cache + memory
    _swReg = null;
    _messaging = null;
    _currentToken = null;
    try { localStorage.removeItem('fcm_token_registered'); } catch {}
    // 3. Register lại + lấy token mới
    const res = await enablePushNotifications();
    return { updated: true, newToken: res.token, error: res.reason };
  } catch (e: any) {
    return { updated: false, error: e?.message ?? 'unknown' };
  }
}

/** Request permission + get FCM token + register lên backend.
 *  Phase 13.9.1 (2026-06-05): nhận optional label để user đặt tên thiết bị.
 *  Returns: { ok, token?, reason? } */
export async function enablePushNotifications(label?: string): Promise<{
  ok: boolean;
  token?: string;
  reason?: 'unsupported' | 'denied' | 'no-vapid' | 'error';
  errorMsg?: string;
}> {
  if (!isFcmSupported()) return { ok: false, reason: 'unsupported' };

  // VAPID key
  const vapid = process.env.NEXT_PUBLIC_FCM_VAPID_KEY;
  if (!vapid) return { ok: false, reason: 'no-vapid' };

  // Permission
  let perm = Notification.permission;
  if (perm === 'default') {
    perm = await Notification.requestPermission();
  }
  if (perm !== 'granted') return { ok: false, reason: 'denied' };

  // SW
  const swReg = await ensureSWRegistration();
  if (!swReg) return { ok: false, reason: 'error', errorMsg: 'Service Worker init failed' };

  // Messaging
  const messaging = await loadMessaging();
  if (!messaging) return { ok: false, reason: 'error', errorMsg: 'Messaging init failed' };

  // getToken
  try {
    const { getToken } = await import('firebase/messaging');
    const token = await getToken(messaging, { vapidKey: vapid, serviceWorkerRegistration: swReg });
    if (!token) return { ok: false, reason: 'error', errorMsg: 'No token returned' };

    // Tránh re-register nếu token không đổi (multi-tab scenario)
    // Cache cả ở localStorage để các tab khác cũng skip
    const cachedKey = `fcm_token_registered`;
    let cached: string | null = null;
    try { cached = localStorage.getItem(cachedKey); } catch {}
    if (cached === token && _currentToken === token) {
      return { ok: true, token };
    }

    _currentToken = token;

    // POST token to backend (arrayUnion ở server đảm bảo dedup)
    // Phase 13.8 + 13.9.1 (2026-06-05): gửi userAgent + label tùy chỉnh (nếu user đặt).
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const body: Record<string, unknown> = { token, userAgent };
    if (label && label.trim()) body.label = label.trim().slice(0, 80);
    const res = await fetch('/api/personal/fcm-token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return { ok: false, reason: 'error', errorMsg: j?.error ?? `HTTP ${res.status}` };
    }
    try { localStorage.setItem(cachedKey, token); } catch {}

    return { ok: true, token };
  } catch (e: any) {
    return { ok: false, reason: 'error', errorMsg: e?.message ?? 'unknown' };
  }
}

/** Subscribe foreground messages (khi tab đang mở).
 *  Returns unsubscribe function. */
export async function subscribeForegroundMessages(
  handler: (p: ForegroundPayload) => void,
): Promise<() => void> {
  const messaging = await loadMessaging();
  if (!messaging) return () => {};
  const { onMessage } = await import('firebase/messaging');
  // Server gửi DATA-ONLY (sửa 2026-06-01) — đọc từ payload.data, KHÔNG payload.notification.
  // payload.notification sẽ luôn undefined với pattern data-only.
  const unsub = onMessage(messaging, (payload) => {
    try {
      const d = payload.data ?? {};
      handler({
        title: d.title ?? payload.notification?.title ?? 'Green Pool',
        body: d.body ?? payload.notification?.body ?? '',
        taskId: d.taskId,
        kind: d.kind,
      });
    } catch (e) {
      // Handler throw không được phá hỏng subscription — log + skip 1 message
      console.warn('[messaging-client] foreground handler threw:', e);
    }
  });
  return unsub;
}

/** Unregister token khi user signout (gọi từ Sidebar handleLogout) */
export async function disablePushNotifications(): Promise<void> {
  // Lấy token từ memory hoặc localStorage (memory có thể empty nếu page reload)
  let token = _currentToken;
  if (!token) {
    try { token = localStorage.getItem('fcm_token_registered'); } catch {}
  }
  if (!token) return;
  try {
    await fetch('/api/personal/fcm-token', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    });
  } catch { /* ignore */ }
  _currentToken = null;
  try { localStorage.removeItem('fcm_token_registered'); } catch {}
}
