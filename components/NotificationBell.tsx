'use client';

// Bell với badge đỏ + dropdown panel chi tiết noti.
//
// Sources (gom realtime mỗi 60s):
//   1. Tasks pending_approval (chỉ approver) → cần duyệt
//   2. Tasks assigned mới gần đây (chưa start) → nhiệm vụ chờ tôi
//   3. Checklist v2 notifications chưa seen (supervisor) → checklist cần kiểm
//
// Click bell → mở dropdown panel:
//   - Section grouped theo nguồn
//   - Mỗi item: title + sender + time + click navigate
//   - Footer: "Xem tất cả" → /cong-viec-ca-nhan
//
// Click outside / Escape → đóng.

import { useEffect, useRef, useState, useCallback } from 'react';
import { Bell, Inbox, ClipboardCheck, CheckSquare, ChevronRight, Loader2, Wrench } from 'lucide-react';
import { useRouter } from 'next/navigation';

type Source = 'approval' | 'assigned' | 'kt_proposal' | 'kt_task' | 'checklist';

interface NotiItem {
  id: string;
  source: Source;
  title: string;
  subtitle?: string;
  time?: string;     // ISO
  link: string;
}

const SOURCE_META: Record<Source, { label: string; icon: typeof Inbox; color: string }> = {
  approval:    { label: 'Đề xuất / Giao việc chờ duyệt', icon: Inbox,          color: 'text-amber-600 bg-amber-50' },
  assigned:    { label: 'Nhiệm vụ chờ tôi',              icon: ClipboardCheck, color: 'text-cyan-600 bg-cyan-50' },
  kt_proposal: { label: 'Đề xuất kỹ thuật chờ duyệt',    icon: Wrench,         color: 'text-violet-600 bg-violet-50' },
  kt_task:     { label: 'Nhiệm vụ kỹ thuật chờ tôi',     icon: Wrench,         color: 'text-violet-600 bg-violet-50' },
  checklist:   { label: 'Checklist cần kiểm',            icon: CheckSquare,    color: 'text-emerald-600 bg-emerald-50' },
};

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
  const [items, setItems] = useState<NotiItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const next: NotiItem[] = [];
    // 1. Tasks pending_approval
    try {
      const res = await fetch('/api/tasks?mode=pending_approval', { cache: 'no-store' });
      if (res.ok) {
        const j = await res.json();
        const arr = Array.isArray(j.rows) ? j.rows : [];
        for (const t of arr.slice(0, 10)) {
          next.push({
            id: `appr-${t.id}`,
            source: 'approval',
            title: t.title ?? '(không tên)',
            subtitle: `${t.kind === 'proposal' ? '📥 Đề xuất' : '📌 Giao việc'} từ ${t.createdByName ?? '?'}`,
            time: t.createdAt,
            link: `/giao-viec?taskId=${encodeURIComponent(t.id)}`,
          });
        }
      }
    } catch {}
    // 2. Tasks assigned (chưa start)
    try {
      const res = await fetch('/api/tasks?mode=assigned&status=pending', { cache: 'no-store' });
      if (res.ok) {
        const j = await res.json();
        const arr = Array.isArray(j.rows) ? j.rows : [];
        for (const t of arr.slice(0, 10)) {
          next.push({
            id: `asgn-${t.id}`,
            source: 'assigned',
            title: t.title ?? '(không tên)',
            subtitle: `Từ ${t.createdByName ?? '?'}`,
            time: t.createdAt,
            link: `/giao-viec?taskId=${encodeURIComponent(t.id)}`,
          });
        }
      }
    } catch {}
    // 3. TechWork — KT proposals chờ duyệt
    try {
      const res = await fetch('/api/ky-thuat/work?kind=proposal&status=pending_approval', { cache: 'no-store' });
      if (res.ok) {
        const j = await res.json();
        const arr = Array.isArray(j.rows) ? j.rows : [];
        for (const t of arr.slice(0, 10)) {
          next.push({
            id: `ktp-${t.id}`,
            source: 'kt_proposal',
            title: t.title ?? '(không tên)',
            subtitle: `Từ ${t.createdByName ?? '?'} @ ${t.branchId ?? '?'}`,
            time: t.createdAt,
            link: '/ky-thuat/giao-viec?tab=proposals',
          });
        }
      }
    } catch {}
    // 4. TechWork — KT tasks assigned to me (status=open)
    try {
      const res = await fetch('/api/ky-thuat/work?kind=task&status=open', { cache: 'no-store' });
      if (res.ok) {
        const j = await res.json();
        const arr = Array.isArray(j.rows) ? j.rows : [];
        for (const t of arr.slice(0, 10)) {
          next.push({
            id: `ktt-${t.id}`,
            source: 'kt_task',
            title: t.title ?? '(không tên)',
            subtitle: `Từ ${t.createdByName ?? '?'} @ ${t.branchId ?? '?'}`,
            time: t.createdAt,
            link: '/ky-thuat/giao-viec?tab=tasks',
          });
        }
      }
    } catch {}
    // 5. Checklist v2 unseen
    try {
      const res = await fetch('/api/checklist-v2/notifications?onlyUnseen=1', { cache: 'no-store' });
      if (res.ok) {
        const j = await res.json();
        const arr = Array.isArray(j.notifications) ? j.notifications : [];
        for (const n of arr.slice(0, 10)) {
          next.push({
            id: `cl-${n.id}`,
            source: 'checklist',
            title: n.runTitle ?? n.title ?? 'Checklist mới',
            subtitle: `Từ ${n.submittedByName ?? '?'} @ ${n.branchId ?? '?'}`,
            time: n.submittedAt,
            link: '/checklist-v2',
          });
        }
      }
    } catch {}
    // Sort theo time desc (mới nhất trên)
    next.sort((a, b) => (b.time ?? '').localeCompare(a.time ?? ''));
    setItems(next);
    setLoading(false);
  }, []);

  // Initial + auto refresh 60s + when tab visible + when dropdown open
  useEffect(() => {
    fetchItems();
    const id = setInterval(fetchItems, 60_000);
    const onVis = () => { if (document.visibilityState === 'visible') fetchItems(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [fetchItems]);

  // Khi mở dropdown → refresh ngay
  useEffect(() => { if (open) fetchItems(); }, [open, fetchItems]);

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

  const count = items.length;
  // Group items by source
  const grouped = items.reduce((acc, it) => {
    if (!acc[it.source]) acc[it.source] = [];
    acc[it.source].push(it);
    return acc;
  }, {} as Record<Source, NotiItem[]>);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={count > 0 ? `${count} thông báo chưa xem` : 'Thông báo'}
        className="relative rounded-lg p-2 text-emerald-100 hover:text-white hover:bg-white/10 transition"
      >
        <Bell size={18} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center px-1 ring-2 ring-emerald-700 shadow-sm">
            {count > 99 ? '99+' : count}
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
              {count > 0 && <span className="text-xs text-rose-600 font-bold">({count})</span>}
            </div>
            {loading && <Loader2 size={14} className="animate-spin text-slate-400" />}
          </div>

          <div className="flex-1 overflow-y-auto">
            {count === 0 && !loading && (
              <div className="p-8 text-center text-sm text-slate-400">
                <Bell size={32} className="mx-auto mb-2 text-slate-300" />
                Không có thông báo nào.<br />Mọi việc đã xử lý xong.
              </div>
            )}

            {(['approval', 'assigned', 'kt_proposal', 'kt_task', 'checklist'] as Source[]).map((src) => {
              const list = grouped[src] ?? [];
              if (list.length === 0) return null;
              const meta = SOURCE_META[src];
              const Icon = meta.icon;
              return (
                <div key={src}>
                  <div className={`px-4 py-1.5 text-[10px] uppercase tracking-wider font-semibold ${meta.color} inline-flex items-center gap-1 w-full`}>
                    <Icon size={11} /> {meta.label} · {list.length}
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
