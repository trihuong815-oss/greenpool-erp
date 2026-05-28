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

async function ensureSWRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (_swReg) return _swReg;
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    _swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
    // Wait for active SW
    if (_swReg.installing) {
      await new Promise<void>((resolve) => {
        const sw = _swReg!.installing!;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'activated') resolve();
        });
      });
    }
    return _swReg;
  } catch (e) {
    console.warn('[messaging-client] SW register failed', e);
    return null;
  }
}

/** Request permission + get FCM token + register lên backend.
 *  Returns: { ok, token?, reason? } */
export async function enablePushNotifications(): Promise<{
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

    _currentToken = token;

    // POST token to backend
    const res = await fetch('/api/personal/fcm-token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return { ok: false, reason: 'error', errorMsg: j?.error ?? `HTTP ${res.status}` };
    }

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
  const unsub = onMessage(messaging, (payload) => {
    handler({
      title: payload.notification?.title ?? 'Green Pool',
      body: payload.notification?.body ?? '',
      taskId: payload.data?.taskId,
      kind: payload.data?.kind,
    });
  });
  return unsub;
}

/** Unregister token khi user signout (optional) */
export async function disablePushNotifications(): Promise<void> {
  if (!_currentToken) return;
  try {
    await fetch('/api/personal/fcm-token', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: _currentToken }),
    });
  } catch { /* ignore */ }
  _currentToken = null;
}
