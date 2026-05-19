import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Green Pool ERP',
  description: 'Hệ thống Quản lý Nội bộ — Cụm 5 cơ sở Bơi-Thể thao',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="bg-slate-50 text-slate-800 antialiased">
        {children}
      </body>
    </html>
  );
}
