'use client';

// V6.4 P2 (2026-06-13): Bell dropdown 3 tabs theo spec XI:
//   - Tất cả      : 6 source live (useNotiCounts) — grouped by source như cũ
//   - Cần xử lý   : fetch /api/notifications?tab=action (action_required + pending)
//   - Đã đọc      : fetch /api/notifications?tab=read
// Badge số = total (tất cả nguồn chưa xử lý) — như cũ, không đổi.

import { useEffect, useRef, useState, useCallback } from 'react';
import { Bell, Inbox, ClipboardCheck, CheckSquare, ChevronRight, Loader2, Wrench, MessageCircle, AlertCircle, Eye } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useNotiCounts, type NotiSource, type NotiItem } from '@/lib/hooks/use-noti-counts';

interface PersistedNoti {
  id: string;
  module: 'proposal' | 'dispatch';
  entityId: string;
  entityCode: string | null;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  isActionRequired: boolean;
  actionStatus: 'pending' | 'done' | 'dismissed';
  createdAt: string | null;
  linkUrl: string;
}

const SOURCE_META: Record<NotiSource, { label: string; icon: typeof Inbox; color: string }> = {
  chat:        { label: 'Tin nhắn mới',                  icon: MessageCircle,  color: 'text-rose-600 bg-rose-50' },
  approval:    { label: 'Đề xuất / Giao việc chờ duyệt', icon: Inbox,          color: 'text-amber-600 bg-amber-50' },
  assigned:    { label: 'Nhiệm vụ chờ tôi',              icon: ClipboardCheck, color: 'text-cyan-600 bg-cyan-50' },
  kt_proposal: { label: 'Đề xuất kỹ thuật chờ duyệt',    icon: Wrench,         color: 'text-violet-600 bg-violet-50' },
  kt_task:     { label: 'Nhiệm vụ kỹ thuật chờ tôi',     icon: Wrench,         color: 'text-violet-600 bg-violet-50' },
  checklist:   { label: 'Checklist cần kiểm',            icon: CheckSquare,    color: 'text-emerald-600 bg-emerald-50' },
};

const SECTION_ORDER: NotiSource[] = ['chat', 'approval', 'assigned', 'kt_proposal', 'kt_task', 'checklist'];

type TabKey = 'all' | 'action' | 'read';

const TAB_LABEL: Record<TabKey, string> = {
  all: 'Tất cả',
  action: 'Cần xử lý',
  read: 'Đã đọc',
};

function fmtTime(iso?: string | null): string {
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
  const rawCount: Record<NotiSource, number> = {
    chat, approval: tasksApproval, assigned: tasksAssigned,
    kt_proposal: techProposal, kt_task: techTask, checklist,
  };
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>('all');
  const [persistedAction, setPersistedAction] = useState<PersistedNoti[]>([]);
  const [persistedRead, setPersistedRead] = useState<PersistedNoti[]>([]);
  const [loadingPersist, setLoadingPersist] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Khi mở → refresh business (chat realtime).
  useEffect(() => { if (open) refresh(); }, [open, refresh]);

  // Fetch persisted notification khi switch sang tab action/read.
  const fetchPersisted = useCallback(async (which: 'action' | 'read') => {
    setLoadingPersist(true);
    try {
      const res = await fetch(`/api/notifications?tab=${which}&limit=30`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const rows: PersistedNoti[] = Array.isArray(json?.rows) ? json.rows : [];
      if (which === 'action') setPersistedAction(rows);
      else setPersistedRead(rows);
    } catch (e: any) {
      console.warn('[NotificationBell] fetch persisted fail:', e?.message);
    } finally {
      setLoadingPersist(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    if (tab === 'action') fetchPersisted('action');
    else if (tab === 'read') fetchPersisted('read');
  }, [open, tab, fetchPersisted]);

  // Click outside + Esc
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

  async function goTo(link: string, notiId?: string) {
    setOpen(false);
    // V6.4 P2: mark read khi click noti persisted (best-effort).
    if (notiId) {
      try {
        await fetch(`/api/notifications/${encodeURIComponent(notiId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isRead: true }),
        });
      } catch { /* silent */ }
    }
    router.push(link);
  }

  async function handleMarkAllRead() {
    try {
      await fetch('/api/notifications/mark-all-read', { method: 'POST' });
      // Refresh action tab nếu đang ở đó
      if (tab === 'action') fetchPersisted('action');
      else if (tab === 'read') fetchPersisted('read');
    } catch { /* silent */ }
  }

  // Group items by source cho tab "Tất cả"
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
        className="relative rounded-lg p-2 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 transition"
      >
        <Bell size={18} />
        {total > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center px-1 ring-2 ring-white shadow-sm">
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
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
            <div className="font-semibold text-slate-800 inline-flex items-center gap-2">
              <Bell size={14} /> Thông báo
              {total > 0 && <span className="text-xs text-rose-600 font-bold">({total})</span>}
            </div>
            <button
              onClick={handleMarkAllRead}
              className="text-[11px] text-emerald-600 hover:underline font-medium"
              title="Đánh dấu tất cả đã đọc"
            >
              Đánh dấu đã đọc
            </button>
          </div>

          {/* Tabs */}
          <div className="border-b border-slate-100 flex">
            {(['all', 'action', 'read'] as TabKey[]).map((k) => {
              const isActive = tab === k;
              return (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={
                    'flex-1 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition ' +
                    (isActive
                      ? 'border-emerald-500 text-emerald-700 bg-emerald-50/40'
                      : 'border-transparent text-slate-600 hover:text-slate-800 hover:bg-slate-50')
                  }
                >
                  {TAB_LABEL[k]}
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading && tab === 'all' && (
              <div className="p-3 text-center text-xs text-slate-400 inline-flex items-center justify-center gap-1 w-full">
                <Loader2 size={12} className="animate-spin" /> Đang tải…
              </div>
            )}
            {loadingPersist && tab !== 'all' && (
              <div className="p-3 text-center text-xs text-slate-400 inline-flex items-center justify-center gap-1 w-full">
                <Loader2 size={12} className="animate-spin" /> Đang tải…
              </div>
            )}

            {/* Tab Tất cả — grouped by source */}
            {tab === 'all' && (
              <>
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
                            <button onClick={() => goTo(it.link)} className="w-full text-left px-4 py-2.5 hover:bg-slate-50 group">
                              <div className="flex items-start gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-slate-800 truncate">{it.title}</div>
                                  <div className="text-xs text-slate-500 truncate">{it.subtitle}</div>
                                  {it.time && <div className="text-[10px] text-slate-400 mt-0.5">{fmtTime(it.time)}</div>}
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
              </>
            )}

            {/* Tab Cần xử lý — persisted Action Required */}
            {tab === 'action' && !loadingPersist && (
              persistedAction.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-400">
                  <CheckSquare size={32} className="mx-auto mb-2 text-slate-300" />
                  Không có việc cần xử lý.
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {persistedAction.map((n) => (
                    <li key={n.id}>
                      <button onClick={() => goTo(n.linkUrl, n.id)} className="w-full text-left px-4 py-2.5 hover:bg-slate-50 group">
                        <div className="flex items-start gap-2">
                          <div className="rounded-md p-1.5 bg-rose-50 shrink-0">
                            <AlertCircle size={14} className="text-rose-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-800 truncate">{n.title}</div>
                            <div className="text-xs text-slate-500 truncate">{n.message}</div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-[9px] uppercase font-bold tracking-wider text-rose-600 bg-rose-50 px-1 rounded">Cần xử lý</span>
                              {n.createdAt && <span className="text-[10px] text-slate-400">{fmtTime(n.createdAt)}</span>}
                            </div>
                          </div>
                          <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-600 mt-1 shrink-0" />
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )
            )}

            {/* Tab Đã đọc — persisted history */}
            {tab === 'read' && !loadingPersist && (
              persistedRead.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-400">
                  <Eye size={32} className="mx-auto mb-2 text-slate-300" />
                  Chưa có thông báo đã đọc.
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {persistedRead.map((n) => (
                    <li key={n.id}>
                      <button onClick={() => goTo(n.linkUrl, n.id)} className="w-full text-left px-4 py-2.5 hover:bg-slate-50 group opacity-70">
                        <div className="flex items-start gap-2">
                          <div className="rounded-md p-1.5 bg-slate-100 shrink-0">
                            <Eye size={14} className="text-slate-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-800 truncate">{n.title}</div>
                            <div className="text-xs text-slate-500 truncate">{n.message}</div>
                            {n.createdAt && <div className="text-[10px] text-slate-400 mt-0.5">{fmtTime(n.createdAt)}</div>}
                          </div>
                          <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-600 mt-1 shrink-0" />
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )
            )}
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
