'use client';

// Phase 13.13 (2026-06-06): logic app badge OS đã chuyển vào NotiCountsProvider
// (lib/hooks/use-noti-counts.tsx). Giữ file này render null để các import cũ
// không vỡ — sẽ xoá ở phase dọn dẹp sau.
export function PWAAppBadge() {
  return null;
}
