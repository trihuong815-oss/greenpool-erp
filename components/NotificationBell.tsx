'use client';

// Phase 13.13 (2026-06-06): refactor dùng useNotiCounts (source-of-truth chung).
//   - Chuông = 6 nguồn: chat + approval + assigned + kt_proposal + kt_task + checklist
//   - Count chuông = total (tổng tất cả) = app badge OS = sum sidebar badges
//   - Realtime data + 60s poll do NotiCountsProvider quản lý → KHÔNG fetch riêng
//
// Click bell → mở dropdown panel chia 6 section, mỗi section list item navigate.

import { useEffect, useRef, useState } from 'react';
import { Bell, Inbox, ClipboardCheck, CheckSquare, ChevronRight, Loader2, Wrench, MessageCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useNotiCounts, type NotiSource, type NotiItem } from '@/lib/hooks/use-noti-counts';

const SOURCE_META: Record<NotiSource, { label: string; icon: typeof Inbox; color: string }> = {
  chat:        { label: 'Tin nhắn mới',                  icon: MessageCircle,  color: 'text-rose-600 bg-rose-50' },
  approval:    { label: 'Đề xuất / Giao việc chờ duyệt', icon: Inbox,          color: 'text-amber-600 bg-amber-50' },
  assigned:    { label: 'Nhiệm vụ chờ tôi',              icon: ClipboardCheck, color: 'text-cyan-600 bg-cyan-50' },
  kt_proposal: { label: 'Đề xuất kỹ thuật chờ duyệt',    icon: Wrench,         color: 'text-violet-600 bg-violet-50' },
  kt_task:     { label: 'Nhiệm vụ kỹ thuật chờ tôi',     icon: Wrench,         color: 'text-violet-600 bg-violet-50' },
  checklist:   { label: 'Checklist cần kiểm',            icon: CheckSquare,    color: 'text-emerald-600 bg-emerald-50' },
};

// Thứ tự render section trong dropdown — chat trên đầu (UX Zalo/Messenger).
const SECTION_ORDER: NotiSource[] = ['chat', 'approval', 'assigned', 'kt_proposal', 'kt_task', 'checklist'];

function fmtTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diffMin = (Date.now() - d.getTime()) / 60000;
  if (diffMin < 1) return 'vừa xong';
  if (diffMin < 60) return `${Math.floor(diffMin)} phút trước`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)} giờ trước`;
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

export function NotificationBell() {
  const {
    items, total, loading, refresh,
    chat, tasksApproval, tasksAssigned, techProposal, techTask, checklist,
  } = useNotiCounts();
  // Raw count per source (KHÔNG phải items.length — vì items bị slice 10/source)
  const rawCount: Record<NotiSource, number> = {
    chat,
    approval: tasksApproval,
    assigned: tasksAssigned,
    kt_proposal: techProposal,
    kt_task: techTask,
    checklist,
  };
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Khi mở dropdown → refresh business endpoints (chat đã realtime)
  useEffect(() => { if (open) refresh(); }, [open, refresh]);

  // Click outside + Esc → close
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function goTo(link: string) {
    setOpen(false);
    router.push(link);
  }

  // Group items by source
  const grouped = items.reduce((acc, it) => {
    if (!acc[it.source]) acc[it.source] = [];
    acc[it.source].push(it);
    return acc;
  }, {} as Record<NotiSource, NotiItem[]>);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={total > 0 ? `${total} thông báo chưa xử lý` : 'Thông báo'}
        className="relative rounded-lg p-2 text-emerald-100 hover:text-white hover:bg-white/10 transition"
      >
        <Bell size={18} />
        {total > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center px-1 ring-2 ring-emerald-700 shadow-sm">
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {open && (
        <div className="
          fixed left-2 right-2 top-14 max-h-[calc(100vh-72px)]
          sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 sm:max-h-[70vh]
          bg-white rounded-xl shadow-2xl ring-1 ring-slate-200 z-50 flex flex-col overflow-hidden
        ">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
            <div className="font-semibold text-slate-800 inline-flex items-center gap-2">
              <Bell size={14} /> Thông báo
              {total > 0 && <span className="text-xs text-rose-600 font-bold">({total})</span>}
            </div>
            {loading && <Loader2 size={14} className="animate-spin text-slate-400" />}
          </div>

          <div className="flex-1 overflow-y-auto">
            {total === 0 && !loading && (
              <div className="p-8 text-center text-sm text-slate-400">
                <Bell size={32} className="mx-auto mb-2 text-slate-300" />
                Không có thông báo nào.<br />Mọi việc đã xử lý xong.
              </div>
            )}

            {SECTION_ORDER.map((src) => {
              const list = grouped[src] ?? [];
              if (list.length === 0) return null;
              const meta = SOURCE_META[src];
              const Icon = meta.icon;
              return (
                <div key={src}>
                  <div className={`px-4 py-1.5 text-[10px] uppercase tracking-wider font-semibold ${meta.color} inline-flex items-center gap-1 w-full`}>
                    <Icon size={11} /> {meta.label} · {rawCount[src]}
                    {rawCount[src] > list.length && (
                      <span className="ml-1 opacity-60">(hiển thị {list.length})</span>
                    )}
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {list.map((it) => (
                      <li key={it.id}>
                        <button
                          onClick={() => goTo(it.link)}
                          className="w-full text-left px-4 py-2.5 hover:bg-slate-50 group"
                        >
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-slate-800 truncate">{it.title}</div>
                              <div className="text-xs text-slate-500 truncate">{it.subtitle}</div>
                              {it.time && (
                                <div className="text-[10px] text-slate-400 mt-0.5">{fmtTime(it.time)}</div>
                              )}
                            </div>
                            <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-600 mt-1 shrink-0" />
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => goTo('/cong-viec-ca-nhan')}
            className="px-4 py-2.5 border-t border-slate-100 text-xs text-emerald-700 hover:bg-emerald-50 font-semibold inline-flex items-center justify-center gap-1"
          >
            Xem tất cả công việc <ChevronRight size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
