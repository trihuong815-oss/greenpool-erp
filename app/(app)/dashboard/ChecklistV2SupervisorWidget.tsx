'use client';

// Widget hiển thị notification Checklist v2 cho cấp trên.
// - Chỉ render khi caller là supervisor (ADMIN/CEO/GD_KD/GD_VP/TP_KT).
// - Tự fetch /api/checklist-v2/notifications từ client → không ảnh hưởng SSR dashboard hiện tại.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, CheckCircle2, ChevronRight } from 'lucide-react';
import { SHIFT_LABEL_V2, ROLE_LABEL_V2, type ChecklistRole, type ChecklistShift } from '@/lib/checklist-v2/templates';

interface Notification {
  id: string;
  runId: string;
  role: ChecklistRole;
  shift: ChecklistShift;
  branchId: string | null;
  date: string;
  ownerId: string;
  ownerName: string;
  submittedAt: string;
  seenBy?: string[];
}

interface Props {
  /** Uid của caller — để check đã seen chưa */
  myUid: string;
}

export function ChecklistV2SupervisorWidget({ myUid }: Props) {
  const [items, setItems] = useState<Notification[] | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const res = await fetch('/api/checklist-v2/notifications?days=7', { cache: 'no-store' });
      if (res.status === 403) { setUnauthorized(true); return; }
      if (!res.ok) return;
      const json = await res.json();
      setItems(Array.isArray(json.notifications) ? json.notifications : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function markSeen(id: string) {
    // Optimistic update
    setItems((cur) => cur?.map((n) => n.id === id ? { ...n, seenBy: [...(n.seenBy ?? []), myUid] } : n) ?? null);
    try {
      await fetch(`/api/checklist-v2/notifications?id=${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ seen: true }),
      });
    } catch { /* ignore — sẽ refetch sau */ }
  }

  if (unauthorized) return null;
  if (loading) return null;
  if (!items || items.length === 0) return null;

  const unseen = items.filter((n) => !(n.seenBy ?? []).includes(myUid));
  const recent = items.slice(0, 5);

  return (
    <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
            <Bell size={16} />
          </div>
          <div>
            <div className="font-semibold text-slate-900 text-sm">Checklist v2 mới gửi</div>
            <div className="text-[11px] text-slate-500">
              {unseen.length > 0
                ? <><strong className="text-amber-700">{unseen.length} chưa xem</strong> · {items.length} trong 7 ngày</>
                : <>Đã xem hết {items.length} thông báo (7 ngày)</>}
            </div>
          </div>
        </div>
        <Link
          href="/checklist-v2"
          className="text-xs font-semibold text-amber-700 hover:text-amber-900 flex items-center gap-1"
        >
          Xem tất cả <ChevronRight size={14} />
        </Link>
      </div>

      <ul className="space-y-1.5">
        {recent.map((n) => {
          const seen = (n.seenBy ?? []).includes(myUid);
          return (
            <li
              key={n.id}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ring-1 ${
                seen
                  ? 'bg-white ring-slate-200 text-slate-600'
                  : 'bg-white ring-amber-300 text-slate-800 shadow-sm'
              }`}
            >
              <span className={`shrink-0 inline-block w-2 h-2 rounded-full ${seen ? 'bg-slate-300' : 'bg-amber-500'}`} />
              <span className="font-semibold truncate">{n.ownerName}</span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-600 truncate">
                {ROLE_LABEL_V2[n.role]}
                {n.branchId ? ` (${n.branchId})` : ''}
                {' · '}
                {SHIFT_LABEL_V2[n.shift]}
              </span>
              <span className="ml-auto shrink-0 text-[10px] text-slate-400 tabular-nums">
                {formatRelative(n.submittedAt)}
              </span>
              {!seen && (
                <button
                  onClick={() => markSeen(n.id)}
                  className="shrink-0 ml-1 rounded p-1 text-amber-600 hover:bg-amber-50 hover:text-amber-800"
                  title="Đánh dấu đã xem"
                >
                  <CheckCircle2 size={14} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'vừa xong';
  if (mins < 60) return `${mins} phút`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} giờ`;
  const days = Math.floor(hrs / 24);
  return `${days} ngày`;
}
