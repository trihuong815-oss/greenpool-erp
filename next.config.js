/** @type {import('next').NextConfig} */

// Security headers — Phase 13.5 hardening.
// CSP: chỉ load script/style từ self + Google APIs (Firebase/FCM). Chặn XSS chèn script ngoài.
// HSTS: force HTTPS 1 năm.
// X-Frame-Options: chặn iframe (clickjacking).
// X-Content-Type-Options: nosniff (MIME type confusion).
// Referrer-Policy: strict-origin → không leak path khi click link ngoài.
// Permissions-Policy: chỉ cho microphone (chat voice cần).
//
// CSP cố ý KHÔNG ép `unsafe-inline` cho script (chỉ style cho Tailwind), Next.js
// đã tự sign nonce/hash cho script inline khi build production.
const SECURITY_HEADERS = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains; preload',
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'microphone=(self), camera=(), geolocation=(), payment=(), usb=()',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Script: self + Google/Firebase. unsafe-eval cần cho Firestore Web SDK.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.googleapis.com https://*.gstatic.com https://www.google.com",
      // Style: self + Tailwind inline + Google Fonts.
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      // Connect: Firebase realtime + Storage + Auth + FCM.
      "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.cloudfunctions.net https://firebaseinstallations.googleapis.com https://fcmregistrations.googleapis.com https://identitytoolkit.googleapis.com https://*.firebasestorage.app https://*.firebasestorage.googleapis.com https://firestore.googleapis.com",
      // Image: self + Google + Firebase Storage + data URLs + blob (chat ảnh).
      "img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://*.firebasestorage.app https://firebasestorage.googleapis.com https://images.unsplash.com",
      // Audio/Video: self + blob (voice message playback) + Firebase Storage.
      "media-src 'self' blob: https://*.googleapis.com https://*.firebasestorage.app",
      // Worker: self (FCM service worker).
      "worker-src 'self' blob:",
      // Frame: deny tất cả.
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: SECURITY_HEADERS,
      },
    ];
  },
};
module.exports = nextConfig;
