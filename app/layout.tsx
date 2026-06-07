import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Green Pool System',
  description: 'Hệ thống Quản lý Nội bộ — Cụm 5 cơ sở Bơi-Thể thao',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Green Pool',
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#10b981',
  // Phase 13.16.8 (2026-06-07): interactiveWidget=resizes-content → khi keyboard mobile
  // pop up, browser shrink viewport thay vì scroll content → chat header/composer giữ vị trí.
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="bg-slate-50 text-slate-800 antialiased overflow-hidden overscroll-none">
        {children}
      </body>
    </html>
  );
}
