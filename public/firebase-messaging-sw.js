// Firebase Messaging Service Worker — chạy ngầm để nhận FCM push khi app đóng.
// Phải nằm ở root domain (path /firebase-messaging-sw.js) để FCM tự đăng ký.
//
// Config Firebase được fetch từ /api/fcm-config (server-side render env) để
// tránh hardcode credentials vào file public.
//
// PATTERN (sửa 2026-06-01 — root cause user báo iOS PWA không nhận noti):
// Server gửi DATA-ONLY payload (không có 'notification' field).
// SW phải gọi showNotification thủ công qua onBackgroundMessage. Cách này:
//   - iOS Safari PWA render đúng (trước đây Apple drop notification khi có `notification` field
//     mà SW không handle thủ công).
//   - Chrome desktop / Android render đúng vì SW handler.
//   - KHÔNG duplicate vì SDK không tự render khi payload data-only.
// Trước đây bug "2 noti" được fix bằng cách BỎ onBackgroundMessage → vô tình làm iOS hỏng.
// Cách đúng: vẫn có handler nhưng đảm bảo payload data-only ở server.

/* global importScripts firebase clients */

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Phase 13.10 (2026-06-05): persistent badge counter qua Cache API.
// SW không có in-memory state giữa events → phải đọc/ghi storage mỗi lần.
const BADGE_CACHE = 'gp-app-badge-v1';
const BADGE_KEY = '/__badge_count';
async function getBadgeCount() {
  try {
    const cache = await caches.open(BADGE_CACHE);
    const res = await cache.match(BADGE_KEY);
    if (!res) return 0;
    const n = parseInt(await res.text(), 10);
    return isNaN(n) ? 0 : n;
  } catch { return 0; }
}
async function setBadgeCount(n) {
  try {
    const cache = await caches.open(BADGE_CACHE);
    await cache.put(BADGE_KEY, new Response(String(Math.max(0, n))));
  } catch { /* silent */ }
}
async function applyBadgeFromCount(n) {
  try {
    if (n > 0 && 'setAppBadge' in self.navigator) {
      await self.navigator.setAppBadge(n);
    } else if ('clearAppBadge' in self.navigator) {
      await self.navigator.clearAppBadge();
    }
  } catch { /* silent */ }
}

(async () => {
  try {
    const res = await fetch('/api/fcm-config');
    if (!res.ok) {
      console.warn('[fcm-sw] cannot fetch config:', res.status);
      return;
    }
    const cfg = await res.json();
    if (!cfg?.apiKey || !cfg?.projectId) return;

    firebase.initializeApp(cfg);
    const messaging = firebase.messaging();

    // Background message handler — render thủ công vì server gửi data-only payload.
    messaging.onBackgroundMessage(async (payload) => {
      const d = (payload && payload.data) || {};
      const title = d.title || 'Green Pool';
      // Phase 13.10: mỗi noti có tag UNIQUE để OS hiển thị từng cái riêng (KHÔNG replace).
      // Trước đó tag='green-pool' cố định → noti mới đè noti cũ → user chỉ thấy 1.
      const uniqueTag = d.tag && d.tag !== 'green-pool' ? d.tag : `noti-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
      const opts = {
        body: d.body || '',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: uniqueTag,
        requireInteraction: false,
        data: { link: d.link || '/dashboard', ...d },
      };
      // Phase 13.10: increment badge counter (persist qua Cache API)
      const current = await getBadgeCount();
      const next = current + 1;
      await setBadgeCount(next);
      await applyBadgeFromCount(next);
      return self.registration.showNotification(title, opts);
    });
  } catch (e) {
    console.error('[fcm-sw] init error', e);
  }
})();

// Click notification → mở link + reset badge counter
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/dashboard';
  event.waitUntil((async () => {
    // Phase 13.10: user đã thấy noti → reset badge counter local
    await setBadgeCount(0);
    await applyBadgeFromCount(0);
    // Phase 13.15 — BUG #B5 fix: gửi message tới TẤT CẢ clients để re-apply badge từ
    // realtime data (provider value.total). Tránh dock=0 nhưng sidebar/chuông vẫn >0.
    // Client listen 'badge-reset-request' → re-postMessage 'set-badge' lại với total chính xác.
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of allClients) {
      try { c.postMessage({ type: 'badge-reset-request', source: 'notificationclick' }); } catch (_) {}
    }
    // Mở/focus tab
    const wins = allClients;
    for (const w of wins) {
      if ('focus' in w && w.url.indexOf(self.location.origin) === 0) {
        w.focus();
        if ('navigate' in w) return w.navigate(link);
        return;
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(link);
  })());
});

// Phase 13.10: nhận message từ client (PWAAppBadge) để sync badge count
// Client gửi { type: 'set-badge', count: N } khi app mở + đọc realtime data.
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'set-badge' && typeof data.count === 'number') {
    event.waitUntil((async () => {
      await setBadgeCount(data.count);
      await applyBadgeFromCount(data.count);
    })());
  } else if (data.type === 'clear-badge') {
    event.waitUntil((async () => {
      await setBadgeCount(0);
      await applyBadgeFromCount(0);
    })());
  }
});
