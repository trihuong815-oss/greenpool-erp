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
    firebase.messaging();
    // KHÔNG gọi messaging.onBackgroundMessage() + showNotification() —
    // payload server đã có `notification` field, FCM SDK tự render notification.
    // Nếu thêm showNotification() thủ công → noti hiện 2 lần trên cùng device.
    // (Bug user báo 2026-05-30: QLCS gửi đề xuất, GĐ_KD nhận 2 noti cùng nội dung.)
    // notificationclick handler bên dưới chỉ xử lý URL khi user bấm — không tạo noti mới.
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
