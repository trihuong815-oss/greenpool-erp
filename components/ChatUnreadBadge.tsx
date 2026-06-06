'use client';

// Phase 13.13: dùng useNotiCounts (chat realtime trong provider) → đồng bộ
// với chuông + app badge OS (1 realtime listener duy nhất, không lặp).

import { useNotiCounts } from '@/lib/hooks/use-noti-counts';

export function ChatUnreadBadge() {
  const { chat } = useNotiCounts();
  if (chat <= 0) return null;
  return (
    <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-rose-600 text-white">
      {chat > 99 ? '99+' : chat}
    </span>
  );
}
