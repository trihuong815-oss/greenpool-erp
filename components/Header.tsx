'use client';

import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import type { Notification } from '@/lib/types';

interface HeaderProps {
  title: string;
  subtitle?: string;
  userId: string;
}

export function Header({ title, subtitle, userId }: HeaderProps) {
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const unread = notifs.filter(n => !n.is_read).length;
  const today = new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => { if (data) setNotifs(data as Notification[]); });
  }, [userId]);

  async function markAllRead() {
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId);
    setNotifs(notifs.map(n => ({ ...n, is_read: true })));
  }

  return (
    <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
      <div>
        <h2 className="text-xl font-bold text-slate-800">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <div className="text-xs text-slate-500">Hôm nay</div>
          <div className="text-sm font-medium text-slate-700">{today}</div>
        </div>

        <div className="relative">
          <button
            onClick={() => setOpen(!open)}
            className="relative p-2 rounded-lg hover:bg-slate-100"
          >
            <Bell className="w-5 h-5 text-slate-600" />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </button>

          {open && (
            <div className="absolute right-0 top-full mt-2 w-96 bg-white border border-slate-200 shadow-xl rounded-xl z-50 max-h-[500px] flex flex-col">
              <div className="p-3 border-b flex items-center justify-between">
                <div className="font-bold text-slate-800">Thông báo</div>
                <button onClick={markAllRead} className="text-xs text-blue-700 hover:underline">
                  Đánh dấu đã đọc
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {notifs.length === 0 ? (
                  <div className="p-6 text-center text-slate-500 text-sm">Chưa có thông báo</div>
                ) : notifs.map(n => (
                  <div
                    key={n.id}
                    className={`p-3 border-b border-slate-100 hover:bg-slate-50 cursor-pointer ${
                      !n.is_read ? 'bg-blue-50/40' : ''
                    }`}
                  >
                    <div className="text-sm font-medium text-slate-800">{n.title}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      {new Date(n.created_at).toLocaleString('vi-VN')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
