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
    messaging.onBackgroundMessage((payload) => {
      const d = (payload && payload.data) || {};
      const title = d.title || 'Green Pool';
      const opts = {
        body: d.body || '',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: d.tag || 'green-pool',
        requireInteraction: false,
        data: { link: d.link || '/dashboard', ...d },
      };
      // Increment badge số đỏ trên icon PWA (iOS 16.4+ / Android Chrome)
      try {
        if ('setAppBadge' in self.navigator) {
          // SW không có state persist → đọc-tăng-set; nếu lỗi thì set=1
          (self.navigator).setAppBadge && (self.navigator).setAppBadge();
        }
      } catch (_) { /* silent */ }
      // self.registration.showNotification → trigger OS notification banner.
      return self.registration.showNotification(title, opts);
    });
  } catch (e) {
    console.error('[fcm-sw] init error', e);
  }
})();

// Click notification → mở link trong data hoặc focus tab đã mở.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/dashboard';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      // Nếu có tab đang mở app này → focus + navigate
      for (const w of wins) {
        if ('focus' in w && w.url.indexOf(self.location.origin) === 0) {
          w.focus();
          if ('navigate' in w) return w.navigate(link);
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(link);
    })
  );
});
