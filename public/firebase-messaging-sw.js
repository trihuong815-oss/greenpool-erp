// Firebase Messaging Service Worker — chạy ngầm để nhận FCM push khi app đóng.
// Phải nằm ở root domain (path /firebase-messaging-sw.js) để FCM tự đăng ký.
//
// Config Firebase được fetch từ /api/fcm-config (server-side render env) để
// tránh hardcode credentials vào file public.

/* global importScripts firebase clients */

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

// Fetch config rồi init. SW không có process.env nên phải fetch.
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

    // Khi nhận background message → show notification.
    messaging.onBackgroundMessage((payload) => {
      const title = payload?.notification?.title ?? 'Green Pool';
      const body = payload?.notification?.body ?? '';
      const icon = payload?.notification?.icon ?? '/logo.png';
      const tag = payload?.data?.taskId ?? payload?.data?.kind ?? 'green-pool';
      const link = payload?.fcmOptions?.link ?? payload?.webpush?.fcmOptions?.link ?? '/cong-viec-ca-nhan';

      self.registration.showNotification(title, {
        body,
        icon,
        badge: icon,
        tag,
        data: { link },
      });
    });
  } catch (e) {
    console.error('[fcm-sw] init error', e);
  }
})();

// Click notification → mở /cong-viec-ca-nhan hoặc focus tab đã mở.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link || '/cong-viec-ca-nhan';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      // Nếu có tab đang mở → focus
      for (const w of wins) {
        if (w.url.includes(link) && 'focus' in w) return w.focus();
      }
      // Mở tab mới
      if (self.clients.openWindow) return self.clients.openWindow(link);
    })
  );
});
