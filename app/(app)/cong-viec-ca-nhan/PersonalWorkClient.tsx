'use client';

// Phase 1 UI: header (avatar + slogan + edit) + 4 KPI mini + task list + create/edit modal.
// Riêng tư — không gian cá nhân, không chia sẻ với module giao việc hệ thống.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Briefcase, Plus, Edit3, Trash2, X, Save, Loader2, AlertCircle, CheckCircle2,
  Camera, Calendar, Bell, Sparkles, ListTodo, AlertTriangle, CheckCircle, Hourglass,
  Sunrise, Sun, Moon, Flame, Target, BookOpen, Repeat, Crown, Star,
} from 'lucide-react';
import { JournalPanel } from './JournalPanel';
import { HabitsPanel } from './HabitsPanel';
import { GoalsPanel } from './GoalsPanel';
import { AIPanel } from './AIPanel';
import { AvatarCropper } from './AvatarCropper';

// ─── Role tagline (cảm hứng) ───
function roleTagline(roleCode: string): { text: string; Icon: typeof Crown } | null {
  if (roleCode === 'CEO' || roleCode === 'ADMIN') return { text: 'Người dẫn đường', Icon: Crown };
  if (roleCode === 'GD_KD' || roleCode === 'GD_VP') return { text: 'Thành viên cốt lõi của Green Pool', Icon: Star };
  if (roleCode.startsWith('TP_') || roleCode === 'TIBAN_TT') return { text: 'Thành viên cốt lõi của Green Pool', Icon: Star };
  if (roleCode === 'PP_HT' || roleCode === 'PP_XLN' || roleCode.startsWith('PP_')) return { text: 'Thành viên cốt lõi của Green Pool', Icon: Star };
  if (roleCode.startsWith('QLCS_')) return { text: 'Thành viên cốt lõi của Green Pool', Icon: Star };
  return null;
}

// ─── Motivational quotes (luân phiên theo ngày) ───
const MOTIVATIONAL_QUOTES: { text: string; author?: string }[] = [
  { text: 'Hôm nay tốt hơn hôm qua — đó là tất cả những gì cần thiết.' },
  { text: 'Người mạnh không phải là người không bao giờ ngã, mà là người luôn đứng dậy.' },
  { text: 'Mỗi việc nhỏ hoàn tất hôm nay là một viên gạch lớn cho ngày mai.' },
  { text: 'Đi chậm cũng được, miễn là đừng đứng yên.', author: 'Khổng Tử' },
  { text: 'Cách tốt nhất để dự đoán tương lai là tạo ra nó.', author: 'Peter Drucker' },
  { text: 'Thành công là tổng của những cố gắng nhỏ lặp lại mỗi ngày.', author: 'R. Collier' },
  { text: 'Kỷ luật là cây cầu nối giữa mục tiêu và thành tựu.', author: 'Jim Rohn' },
  { text: 'Đừng đếm số ngày — hãy làm cho ngày của bạn được đếm.', author: 'Muhammad Ali' },
  { text: 'Không có thang máy đến thành công — bạn phải đi bộ.' },
  { text: 'Người chiến thắng là người không bao giờ bỏ cuộc.' },
  { text: 'Hành động không chắc luôn mang lại hạnh phúc, nhưng không có hành động thì chắc chắn không có hạnh phúc.', author: 'Benjamin Disraeli' },
  { text: 'Mỗi sáng có hai lựa chọn: ngủ tiếp với giấc mơ, hoặc tỉnh dậy theo đuổi nó.' },
];

function quoteOfTheDay(): { text: string; author?: string } {
  const d = new Date();
  const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86_400_000);
  return MOTIVATIONAL_QUOTES[dayOfYear % MOTIVATIONAL_QUOTES.length];
}

function greeting(): { text: string; Icon: typeof Sun; accent: string } {
  const h = new Date().getHours();
  if (h < 5)  return { text: 'Đêm khuya rồi', Icon: Moon, accent: 'from-indigo-500 to-slate-700' };
  if (h < 11) return { text: 'Chào buổi sáng', Icon: Sunrise, accent: 'from-amber-400 to-orange-500' };
  if (h < 13) return { text: 'Chúc bữa trưa ngon miệng', Icon: Sun, accent: 'from-yellow-400 to-amber-500' };
  if (h < 18) return { text: 'Chiều năng lượng', Icon: Sun, accent: 'from-emerald-500 to-teal-600' };
  if (h < 22) return { text: 'Chào buổi tối', Icon: Moon, accent: 'from-violet-500 to-fuchsia-600' };
  return { text: 'Khuya rồi, nghỉ ngơi nhé', Icon: Moon, accent: 'from-slate-600 to-slate-800' };
}

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'todo' | 'doing' | 'done' | 'overdue' | 'cancelled';
export type TaskCategory = 'daily' | 'weekly' | 'project' | 'personal' | 'learning';

export interface PersonalTaskRow {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string | null;
  scheduledTime: string | null;  // HH:MM — giờ thực hiện task
  reminderAt: string | null;
  category: TaskCategory;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ProfileSlim {
  id: string;
  email: string;
  displayName: string;
  roleCode: string;
  roleName: string | null;
  branchName: string | null;
  departmentName: string | null;
  avatarUrl: string | null;
  workSlogan: string | null;
  positionTitle: string | null;
}

interface Props {
  profile: ProfileSlim;
  initialTasks: PersonalTaskRow[];
}

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: 'Thấp', medium: 'Trung bình', high: 'Cao', urgent: 'Khẩn',
};
const PRIORITY_COLOR: Record<TaskPriority, string> = {
  low:    'bg-slate-100 text-slate-700 ring-slate-200',
  medium: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
  high:   'bg-amber-50 text-amber-700 ring-amber-200',
  urgent: 'bg-rose-50 text-rose-700 ring-rose-200',
};
const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'Cần làm', doing: 'Đang làm', done: 'Hoàn tất', overdue: 'Quá hạn', cancelled: 'Đã huỷ',
};
const STATUS_COLOR: Record<TaskStatus, string> = {
  todo:      'bg-slate-100 text-slate-700',
  doing:     'bg-cyan-50 text-cyan-700',
  done:      'bg-emerald-50 text-emerald-700',
  overdue:   'bg-rose-50 text-rose-700',
  cancelled: 'bg-slate-50 text-slate-400 line-through',
};
const CATEGORY_LABEL: Record<TaskCategory, string> = {
  daily: 'Hằng ngày', weekly: 'Hằng tuần', project: 'Dự án', personal: 'Cá nhân', learning: 'Học tập',
};

function isOverdueDate(dueDate: string | null, status: TaskStatus): boolean {
  if (!dueDate || status === 'done' || status === 'cancelled') return false;
  // YYYY-MM-DD vs today
  const today = new Date().toISOString().slice(0, 10);
  return dueDate < today;
}

export function PersonalWorkClient({ profile, initialTasks }: Props) {
  const router = useRouter();
  const [tasks, setTasks] = useState<PersonalTaskRow[]>(initialTasks);
  const [profileState, setProfileState] = useState<ProfileSlim>(profile);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<PersonalTaskRow | null>(null);

  const [filterStatus, setFilterStatus] = useState<'all' | TaskStatus>('all');

  function showToast(t: 'success' | 'error', msg: string) {
    setToast({ type: t, msg });
    setTimeout(() => setToast(null), 3500);
  }

  // ─── FCM Push Notifications setup (Phase 2 — background push qua Service Worker) ───
  // 1. Check support + permission status
  // 2. Nếu permission default → hiển thị banner xin permission
  // 3. Nếu user click "Bật thông báo" → register FCM + lưu token lên backend
  // 4. Subscribe foreground messages để show toast khi tab đang mở
  const [pushStatus, setPushStatus] = useState<'idle' | 'requesting' | 'enabled' | 'denied' | 'unsupported' | 'no-vapid'>('idle');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let mounted = true;
    (async () => {
      const { isFcmSupported, getNotificationPermission, enablePushNotifications, subscribeForegroundMessages } =
        await import('@/lib/firebase/messaging-client');
      if (!isFcmSupported()) { if (mounted) setPushStatus('unsupported'); return; }
      const perm = getNotificationPermission();
      if (perm === 'denied') { if (mounted) setPushStatus('denied'); return; }
      if (perm === 'granted') {
        // Auto-register token (refresh case)
        const r = await enablePushNotifications();
        if (mounted) setPushStatus(r.ok ? 'enabled' : (r.reason === 'no-vapid' ? 'no-vapid' : 'denied'));
        // Subscribe foreground messages → show toast
        if (r.ok) {
          subscribeForegroundMessages((p) => {
            showToast('success', `🔔 ${p.title}${p.body ? ' — ' + p.body : ''}`);
          });
          // Trigger reminder check ngay khi mở app — bypass GitHub cron delay
          fetch('/api/personal/check-my-reminders', { method: 'POST' }).catch(() => {});
          // FALLBACK: cron không đáng tin → mỗi khi mở app, tự check morning (7-12h) + evening (20-24h) summary
          // Server dedup: chỉ gửi 1 lần / user / ngày / kind (cron hoặc client — bên nào tới trước).
          const hourVN = new Date(Date.now() + 7 * 60 * 60_000).getUTCHours();
          if (hourVN >= 7 && hourVN < 12) {
            fetch('/api/personal/check-my-summary?kind=morning', { method: 'POST' }).catch(() => {});
          }
          if (hourVN >= 20 && hourVN < 24) {
            fetch('/api/personal/check-my-summary?kind=evening', { method: 'POST' }).catch(() => {});
          }
        }
      }
      // Nếu perm === 'default' → đợi user bấm nút (xem renderPushBanner)
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleEnablePush() {
    setPushStatus('requesting');
    const { enablePushNotifications, subscribeForegroundMessages } = await import('@/lib/firebase/messaging-client');
    const r = await enablePushNotifications();
    if (r.ok) {
      setPushStatus('enabled');
      showToast('success', '🔔 Đã bật thông báo trên thiết bị này');
      subscribeForegroundMessages((p) => {
        showToast('success', `🔔 ${p.title}${p.body ? ' — ' + p.body : ''}`);
      });
    } else {
      const reasonMap: Record<string, 'denied' | 'unsupported' | 'no-vapid'> = {
        denied: 'denied', unsupported: 'unsupported', 'no-vapid': 'no-vapid',
      };
      const next = reasonMap[r.reason ?? ''] ?? 'denied';
      setPushStatus(next);
      if (r.errorMsg) showToast('error', r.errorMsg);
    }
  }

  // ─── Client-side reminder polling (60s — fallback khi FCM chưa setup hoặc denied) ───
  // Show toast + browser notification khi đến giờ reminderAt; mark notified ở localStorage để tránh spam.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const NOTIF_KEY = 'cvcn_notified_reminders';
    function getNotified(): Set<string> {
      try { return new Set(JSON.parse(localStorage.getItem(NOTIF_KEY) ?? '[]')); }
      catch { return new Set<string>(); }
    }
    function saveNotified(s: Set<string>) {
      try { localStorage.setItem(NOTIF_KEY, JSON.stringify([...s].slice(-200))); } catch {}
    }
    function check() {
      const now = Date.now();
      const notified = getNotified();
      let changed = false;
      for (const t of tasks) {
        if (!t.reminderAt) continue;
        if (t.status === 'done' || t.status === 'cancelled') continue;
        const at = new Date(t.reminderAt).getTime();
        if (!Number.isFinite(at)) continue;
        // Trigger window: từ reminderAt → reminderAt + 30 phút (tránh fire lại entry cũ)
        if (at <= now && now - at < 30 * 60_000) {
          const key = `${t.id}__${t.reminderAt}`;
          if (notified.has(key)) continue;
          notified.add(key);
          changed = true;
          const body = t.scheduledTime
            ? `Lúc ${t.scheduledTime} hôm nay`
            : 'Sắp đến giờ thực hiện';
          showToast('success', `🔔 ${t.title} — ${body}`);
          if ('Notification' in window && Notification.permission === 'granted') {
            try { new Notification(`🔔 ${t.title}`, { body, tag: t.id }); } catch {}
          }
        }
      }
      if (changed) saveNotified(notified);
    }
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [tasks]);

  // ─── Evening banner (>= 20:00 local) ───
  // Hiển thị danh sách task ngày mai + lời chúc nghỉ ngơi.
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const showEveningBanner = now.getHours() >= 20;
  const tomorrowTasks = useMemo(() => {
    const t = new Date(now);
    t.setDate(t.getDate() + 1);
    const tomorrowStr = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    return tasks
      .filter((x) => x.dueDate === tomorrowStr && x.status !== 'done' && x.status !== 'cancelled')
      .sort((a, b) => (a.scheduledTime ?? '99:99').localeCompare(b.scheduledTime ?? '99:99'));
  }, [tasks, now]);
  const [eveningDismissed, setEveningDismissed] = useState(false);
  // Reset dismiss khi sang ngày mới
  const todayKey = `${now.getFullYear()}${now.getMonth()}${now.getDate()}`;
  useEffect(() => { setEveningDismissed(false); }, [todayKey]);

  // KPI auto compute (re-derive overdue based on dueDate)
  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    let todoCnt = 0, doingCnt = 0, doneCnt = 0, overdueCnt = 0, todayCnt = 0;
    for (const t of tasks) {
      if (t.dueDate === today && t.status !== 'done' && t.status !== 'cancelled') todayCnt++;
      if (isOverdueDate(t.dueDate, t.status)) overdueCnt++;
      else if (t.status === 'todo') todoCnt++;
      else if (t.status === 'doing') doingCnt++;
      else if (t.status === 'done') doneCnt++;
    }
    return { todayCnt, todoCnt, doingCnt, doneCnt, overdueCnt };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    if (filterStatus === 'all') return tasks;
    return tasks.filter((t) => {
      if (filterStatus === 'overdue') return isOverdueDate(t.dueDate, t.status);
      return t.status === filterStatus;
    });
  }, [tasks, filterStatus]);

  async function reloadTasks() {
    try {
      const res = await fetch('/api/personal/tasks', { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? 'Lỗi tải');
      setTasks(j.rows ?? []);
    } catch (e: any) {
      showToast('error', e.message);
    }
  }

  async function handleDeleteTask(id: string) {
    if (!confirm('Xoá công việc này khỏi không gian cá nhân?')) return;
    try {
      const res = await fetch(`/api/personal/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? 'Lỗi xoá');
      }
      setTasks((arr) => arr.filter((t) => t.id !== id));
      showToast('success', 'Đã xoá công việc');
    } catch (e: any) {
      showToast('error', e.message);
    }
  }

  async function handleToggleStatus(t: PersonalTaskRow, newStatus: TaskStatus) {
    try {
      const res = await fetch(`/api/personal/tasks/${encodeURIComponent(t.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? 'Lỗi cập nhật');
      }
      setTasks((arr) => arr.map((x) => x.id === t.id ? { ...x, status: newStatus } : x));
      if (newStatus === 'done') showToast('success', '🎉 Hoàn tất công việc!');
    } catch (e: any) {
      showToast('error', e.message);
    }
  }

  const initials = profileState.displayName.split(' ').slice(-2).map((w) => w[0]).join('').toUpperCase();
  const g = greeting();
  const GreetIcon = g.Icon;
  const quote = useMemo(() => quoteOfTheDay(), []);
  const tagline = useMemo(() => roleTagline(profileState.roleCode), [profileState.roleCode]);
  const [tab, setTab] = useState<'overview' | 'journal' | 'habits' | 'goals' | 'ai'>('overview');
  // Weekly progress: done / (done + todo + doing + overdue) trong 7 ngày qua
  const weeklyProgress = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent = tasks.filter((t) => {
      const ts = Date.parse(t.createdAt);
      return Number.isFinite(ts) && ts >= cutoff;
    });
    const total = recent.length;
    const done = recent.filter((t) => t.status === 'done').length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, pct };
  }, [tasks]);

  // Sparkle pulse cho icon greeting
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((x) => x + 1), 60_000);
    return () => clearInterval(i);
  }, []);
  void tick;

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* ─── PUSH PERMISSION BANNER ─── */}
      {pushStatus === 'idle' && (
        <div className="rounded-xl ring-1 ring-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-cyan-50 p-4 flex items-center gap-3 flex-wrap">
          <Bell className="text-emerald-700 shrink-0" size={20} />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm text-slate-800">Bật thông báo lên điện thoại</div>
            <div className="text-xs text-slate-600 mt-0.5">
              Nhận nhắc nhở công việc + tin nhắn buổi tối ngay cả khi app đóng. Khuyến nghị cho điện thoại.
            </div>
          </div>
          <button
            onClick={handleEnablePush}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
          >
            Bật thông báo
          </button>
        </div>
      )}
      {pushStatus === 'requesting' && (
        <div className="rounded-xl ring-1 ring-slate-200 bg-white p-3 text-sm text-slate-600 inline-flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Đang đăng ký…
        </div>
      )}
      {pushStatus === 'denied' && (
        <div className="rounded-xl ring-1 ring-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-center gap-2">
          <AlertCircle size={14} className="shrink-0" />
          <span>
            Anh đã từ chối thông báo. Để bật lại: vào cài đặt trình duyệt → Site settings → Notifications → Allow cho site này.
          </span>
        </div>
      )}
      {pushStatus === 'unsupported' && (
        <div className="rounded-xl ring-1 ring-slate-200 bg-slate-50 p-3 text-xs text-slate-600 flex items-center gap-2">
          <AlertCircle size={14} className="shrink-0" />
          Trình duyệt không hỗ trợ thông báo background. iPhone: cần "Add to Home Screen" để bật.
        </div>
      )}
      {pushStatus === 'no-vapid' && (
        <div className="rounded-xl ring-1 ring-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          ⚠️ Server chưa cấu hình VAPID key (admin xem hướng dẫn FCM_SETUP.md)
        </div>
      )}

      {/* ─── EVENING BANNER (≥20:00) — danh sách task ngày mai + lời chúc ─── */}
      {showEveningBanner && !eveningDismissed && (
        <div className="relative rounded-2xl overflow-hidden shadow-lg ring-1 ring-indigo-300
          bg-gradient-to-br from-indigo-600 via-purple-700 to-slate-900 text-white">
          <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-white/10 blur-2xl" aria-hidden />
          <div className="absolute left-1/2 -bottom-10 h-32 w-32 rounded-full bg-amber-400/20 blur-2xl" aria-hidden />
          <button
            onClick={() => setEveningDismissed(true)}
            className="absolute top-2 right-2 p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition"
            aria-label="Đóng"
          >
            <X size={14} />
          </button>
          <div className="relative p-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">🌙</span>
              <div className="font-bold text-base">Chào buổi tối, {profileState.displayName.split(' ').slice(-1)[0]}!</div>
            </div>
            <p className="text-sm text-indigo-100 mb-3 leading-relaxed">
              Bạn hãy nghỉ ngơi thật khoẻ để chuẩn bị cho 1 ngày mai tuyệt vời.
            </p>
            {tomorrowTasks.length === 0 ? (
              <div className="rounded-lg bg-white/10 ring-1 ring-white/20 px-3 py-2 text-sm">
                ✨ Ngày mai chưa có công việc nào — một ngày tự do hoặc dành cho việc lớn?
              </div>
            ) : (
              <div className="rounded-lg bg-white/10 backdrop-blur ring-1 ring-white/20 p-3">
                <div className="text-xs font-bold uppercase tracking-wider text-indigo-200 mb-2 inline-flex items-center gap-1.5">
                  🎯 {tomorrowTasks.length} việc cho ngày mai
                </div>
                <ul className="space-y-1.5">
                  {tomorrowTasks.slice(0, 6).map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-sm">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-300 shrink-0" />
                      {t.scheduledTime && (
                        <span className="font-mono text-amber-200 text-xs">{t.scheduledTime}</span>
                      )}
                      <span className="truncate">{t.title}</span>
                    </li>
                  ))}
                  {tomorrowTasks.length > 6 && (
                    <li className="text-xs text-indigo-200 italic">+ {tomorrowTasks.length - 6} công việc khác…</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── HERO: greeting + name + role + progress ring + slogan + quote ─── */}
      {/* UI 10/10: banner trắng trung tính thay gradient đậm — đồng bộ phần còn lại của app. */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="relative p-5 md:p-6">
          <div className="flex items-start gap-4 flex-wrap">
            {/* Avatar */}
            <div className="relative shrink-0">
              {profileState.avatarUrl ? (
                <img
                  src={profileState.avatarUrl}
                  alt={profileState.displayName}
                  className="h-24 w-24 md:h-28 md:w-28 rounded-2xl object-cover ring-1 ring-slate-200 shadow-sm"
                />
              ) : (
                <div className="h-24 w-24 md:h-28 md:w-28 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center text-3xl font-bold ring-1 ring-emerald-100">
                  {initials}
                </div>
              )}
            </div>

            {/* Identity */}
            <div className="flex-1 min-w-0">
              <div className="text-xl md:text-2xl font-bold text-slate-900">{profileState.displayName}</div>
              <div className="text-sm font-semibold text-slate-600 mt-0.5 flex items-center gap-2 flex-wrap">
                <span>{profileState.positionTitle || profileState.roleName || profileState.roleCode}</span>
                {tagline && (
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200 font-bold uppercase tracking-wider">
                    <tagline.Icon size={11} /> {tagline.text}
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {[profileState.departmentName, profileState.branchName].filter(Boolean).join(' · ') || profileState.email}
              </div>
              {profileState.workSlogan && (
                <div className="mt-3 text-sm italic flex items-start gap-2 bg-slate-50 rounded-lg px-3 py-2 ring-1 ring-slate-200 text-slate-600">
                  <Sparkles size={15} className="text-amber-500 mt-0.5 shrink-0" />
                  <span>"{profileState.workSlogan}"</span>
                </div>
              )}
            </div>

            {/* Weekly progress ring */}
            <div className="shrink-0 hidden sm:block">
              <ProgressRing pct={weeklyProgress.pct} done={weeklyProgress.done} total={weeklyProgress.total} />
            </div>
          </div>

          {/* Quote of the day */}
          <div className="mt-5 pt-4 border-t border-slate-100 flex items-start gap-2">
            <Flame size={16} className="text-amber-500 mt-0.5 shrink-0" />
            <div className="text-sm text-slate-500 italic">
              "{quote.text}"
              {quote.author && <span className="not-italic text-slate-400"> — {quote.author}</span>}
            </div>
          </div>

          {/* Edit button */}
          <button
            onClick={() => setProfileModalOpen(true)}
            className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-md bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 transition"
          >
            <Edit3 size={11} /> Sửa hồ sơ
          </button>
        </div>
      </div>

      {/* ─── TAB NAV ─── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <TabBtn active={tab === 'overview'} onClick={() => setTab('overview')} Icon={Briefcase} label="Tổng quan" />
        <TabBtn active={tab === 'journal'}  onClick={() => setTab('journal')}  Icon={BookOpen}  label="Nhật ký" />
        <TabBtn active={tab === 'habits'}   onClick={() => setTab('habits')}   Icon={Repeat}    label="Thói quen" />
        <TabBtn active={tab === 'goals'}    onClick={() => setTab('goals')}    Icon={Target}    label="Mục tiêu" />
        <TabBtn active={tab === 'ai'}       onClick={() => setTab('ai')}       Icon={Sparkles}  label="AI cá nhân" highlight />
      </div>

      {/* ─── PANELS ─── */}
      {tab === 'journal' && <JournalPanel onToast={showToast} author={{ displayName: profileState.displayName, avatarUrl: profileState.avatarUrl, positionTitle: profileState.positionTitle }} />}
      {tab === 'habits' && <HabitsPanel onToast={showToast} />}
      {tab === 'goals' && <GoalsPanel onToast={showToast} />}
      {tab === 'ai' && (
        <AIPanel
          profile={{
            displayName: profileState.displayName,
            roleName: profileState.roleName,
            roleCode: profileState.roleCode,
          }}
          onToast={showToast}
        />
      )}

      {tab === 'overview' && (<>
      {/* ─── KPI MINI ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        <KpiCard label="Hôm nay" value={stats.todayCnt} icon={Calendar} color="cyan" />
        <KpiCard label="Cần làm" value={stats.todoCnt} icon={ListTodo} color="slate" />
        <KpiCard label="Đang làm" value={stats.doingCnt} icon={Hourglass} color="amber" />
        <KpiCard label="Hoàn tất" value={stats.doneCnt} icon={CheckCircle} color="emerald" />
        <KpiCard label="Quá hạn" value={stats.overdueCnt} icon={AlertTriangle} color="rose" />
      </div>

      {/* ─── TASK LIST ─── */}
      <div className="card p-0">
        <header className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <Briefcase size={16} className="text-emerald-700" />
            <h2 className="font-bold text-slate-800">Việc của tôi</h2>
            <div className="flex items-center gap-1 flex-wrap">
              {(['all', 'todo', 'doing', 'overdue', 'done'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`text-xs px-2 py-1 rounded ring-1 transition ${
                    filterStatus === s
                      ? 'bg-emerald-50 text-emerald-700 ring-emerald-300'
                      : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {s === 'all' ? 'Tất cả' : STATUS_LABEL[s as TaskStatus] ?? s}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => { setEditingTask(null); setTaskModalOpen(true); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Plus size={13} /> Thêm việc
          </button>
        </header>
        {filteredTasks.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">
            Chưa có công việc nào. Bấm <strong>+ Thêm việc</strong> để bắt đầu.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filteredTasks.map((t) => {
              const overdue = isOverdueDate(t.dueDate, t.status);
              const effectiveStatus: TaskStatus = overdue ? 'overdue' : t.status;
              return (
                // Phase 13.16.6: mobile gọn — title line-clamp-1, badges row riêng, touch ≥44px
                <li key={t.id} className="px-3 sm:px-4 py-2.5 sm:py-3 hover:bg-slate-50/60 transition">
                  <div className="flex items-start gap-2 min-w-0">
                    <button
                      onClick={() => handleToggleStatus(t, t.status === 'done' ? 'todo' : 'done')}
                      className={`mt-1.5 sm:mt-0.5 h-6 w-6 sm:h-5 sm:w-5 rounded border-2 shrink-0 flex items-center justify-center transition ${
                        t.status === 'done'
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-slate-300 hover:border-emerald-400'
                      }`}
                      title={t.status === 'done' ? 'Đánh dấu chưa xong' : 'Đánh dấu đã xong'}
                    >
                      {t.status === 'done' && <CheckCircle size={14} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className={`font-semibold text-sm line-clamp-2 ${t.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                        {t.title}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap mt-1">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ring-1 ${PRIORITY_COLOR[t.priority]}`}>
                          {PRIORITY_LABEL[t.priority]}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLOR[effectiveStatus]}`}>
                          {STATUS_LABEL[effectiveStatus]}
                        </span>
                        <span className="text-[10px] text-slate-400 truncate">· {CATEGORY_LABEL[t.category]}</span>
                      </div>
                      {t.description && (
                        <div className="text-xs text-slate-600 mt-0.5 line-clamp-2">{t.description}</div>
                      )}
                      <div className="flex items-center gap-2 sm:gap-3 mt-1 text-[11px] text-slate-500 flex-wrap">
                        {t.dueDate && (
                          <span className={`inline-flex items-center gap-1 ${overdue ? 'text-rose-600 font-semibold' : ''}`}>
                            <Calendar size={11} className="shrink-0" /> {t.dueDate}
                            {t.scheduledTime && <span className="font-mono text-emerald-700 ml-0.5">· {t.scheduledTime}</span>}
                          </span>
                        )}
                        {t.reminderAt && (
                          <span className="inline-flex items-center gap-1 text-amber-700">
                            <Bell size={11} className="shrink-0" /> {new Date(t.reminderAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-start gap-0.5 shrink-0">
                      <button
                        onClick={() => { setEditingTask(t); setTaskModalOpen(true); }}
                        className="p-2.5 sm:p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded active:bg-emerald-100"
                        aria-label="Sửa"
                      >
                        <Edit3 size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteTask(t.id)}
                        className="p-2.5 sm:p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded active:bg-rose-100"
                        aria-label="Xoá"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      </>)}

      {/* ─── Privacy notice (luôn hiện) ─── */}
      <div className="text-[11px] text-slate-400 text-center">
        🔒 Không gian riêng tư — chỉ bạn xem được. Admin/CEO KHÔNG truy cập nội dung công việc / nhật ký / mục tiêu / AI logs của bạn.
      </div>

      {/* ─── MODALS ─── */}
      {profileModalOpen && (
        <ProfileModal
          initial={profileState}
          onClose={() => setProfileModalOpen(false)}
          onSaved={(next) => {
            setProfileState((p) => ({ ...p, ...next }));
            setProfileModalOpen(false);
            showToast('success', 'Đã lưu hồ sơ');
            router.refresh();
          }}
          onError={(m) => showToast('error', m)}
        />
      )}
      {taskModalOpen && (
        <TaskModal
          editing={editingTask}
          onClose={() => { setTaskModalOpen(false); setEditingTask(null); }}
          onSaved={() => { setTaskModalOpen(false); setEditingTask(null); reloadTasks(); showToast('success', editingTask ? 'Đã cập nhật công việc' : 'Đã thêm công việc'); }}
          onError={(m) => showToast('error', m)}
        />
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg ring-1 inline-flex items-center gap-2 text-sm ${
          toast.type === 'success' ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-rose-50 text-rose-800 ring-rose-200'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ─────────── ProgressRing (SVG, no chart lib) ───────────
function ProgressRing({ pct, done, total }: { pct: number; done: number; total: number }) {
  const R = 38;
  const stroke = 7;
  const C = 2 * Math.PI * R;
  const dash = (pct / 100) * C;
  return (
    <div className="relative w-[100px] h-[100px] flex items-center justify-center">
      <svg width={100} height={100} viewBox="0 0 100 100" className="-rotate-90">
        <circle cx={50} cy={50} r={R} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
        <circle
          cx={50} cy={50} r={R} fill="none" stroke="#059669" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={`${dash} ${C - dash}`}
          style={{ transition: 'stroke-dasharray 600ms ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-700">
        <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          <Target size={10} /> Tuần
        </div>
        <div className="text-xl font-bold tabular-nums leading-tight text-slate-900">{pct}%</div>
        <div className="text-[10px] text-slate-400">{done}/{total}</div>
      </div>
    </div>
  );
}

// ─────────── TabBtn ───────────
function TabBtn({ active, onClick, Icon, label, highlight }: {
  active: boolean;
  onClick: () => void;
  Icon: typeof Calendar;
  label: string;
  highlight?: boolean;
}) {
  const baseCls = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-semibold ring-1 transition';
  const activeCls = highlight
    ? 'bg-gradient-to-r from-violet-50 to-fuchsia-50 text-violet-800 ring-violet-300'
    : 'bg-emerald-50 text-emerald-800 ring-emerald-300';
  const idleCls = 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50';
  return (
    <button onClick={onClick} className={`${baseCls} ${active ? activeCls : idleCls}`}>
      <Icon size={14} />
      {label}
      {highlight && !active && <span className="text-[9px] px-1 py-0.5 rounded bg-violet-100 text-violet-700 font-bold">Beta</span>}
    </button>
  );
}

// ─────────── KpiCard ───────────
// PR-UI-PIXEL-MATCH B3 (2026-06-26): wrapper gọi <StatCard> chuẩn.
// Giữ props signature cũ (color cyan/slate/amber/emerald/rose) để callsite
// không phải sửa; map sang StatCard tone (default/success/danger/warning/info).
import { StatCard, type StatCardTone } from '@/components/ui/StatCard';

function KpiCard({ label, value, icon: Icon, color }: {
  label: string;
  value: number;
  icon: typeof Calendar;
  color: 'cyan' | 'slate' | 'amber' | 'emerald' | 'rose';
}) {
  const toneMap: Record<typeof color, StatCardTone> = {
    cyan:    'default',
    slate:   'default',
    amber:   'warning',
    emerald: 'success',
    rose:    'danger',
  };
  return <StatCard label={label} value={value} icon={<Icon size={14} />} tone={toneMap[color]} />;
}

// ─────────── ProfileModal ───────────
function ProfileModal({
  initial, onClose, onSaved, onError,
}: {
  initial: ProfileSlim;
  onClose: () => void;
  onSaved: (next: Partial<ProfileSlim>) => void;
  onError: (m: string) => void;
}) {
  const [slogan, setSlogan] = useState(initial.workSlogan ?? '');
  const [positionTitle, setPositionTitle] = useState(initial.positionTitle ?? '');
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl ?? '');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cropperFile, setCropperFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Khi user chọn file → mở cropper trước, không upload luôn
  function handleFileSelected(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      onError('Ảnh quá lớn (>10MB)');
      return;
    }
    setCropperFile(file);
  }

  // Sau khi user crop xong → upload blob lên server
  async function handleCropConfirm(blob: Blob) {
    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.append('file', blob, 'avatar.jpg');
      const res = await fetch('/api/personal/avatar', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? 'Lỗi upload');
      setAvatarUrl(j.url);
      setCropperFile(null);
    } catch (e: any) {
      onError(e.message);
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/personal/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workSlogan: slogan.trim() || null,
          positionTitle: positionTitle.trim() || null,
          avatarUrl: avatarUrl || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? 'Lỗi lưu');
      onSaved({
        workSlogan: slogan.trim() || null,
        positionTitle: positionTitle.trim() || null,
        avatarUrl: avatarUrl || null,
      });
    } catch (e: any) {
      onError(e.message);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-slate-800">Sửa hồ sơ cá nhân</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Avatar */}
          <div className="flex items-center gap-3">
            <div className="relative">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-20 w-20 rounded-full object-cover ring-2 ring-emerald-200" />
              ) : (
                <div className="h-20 w-20 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-xs">No avatar</div>
              )}
              {uploadingAvatar && (
                <div className="absolute inset-0 bg-white/70 rounded-full flex items-center justify-center">
                  <Loader2 size={20} className="animate-spin text-emerald-600" />
                </div>
              )}
            </div>
            <div className="flex-1">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploadingAvatar}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-white ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50"
              >
                <Camera size={13} /> {avatarUrl ? 'Đổi ảnh' : 'Upload ảnh'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelected(f);
                  e.target.value = '';
                }}
              />
              <div className="text-[11px] text-slate-500 mt-1">JPG/PNG/WEBP, ≤ 10MB · sẽ cắt vuông</div>
            </div>
          </div>

          <label className="block">
            <span className="block text-xs font-semibold text-slate-600 mb-1">Chức danh hiển thị</span>
            <input
              value={positionTitle}
              onChange={(e) => setPositionTitle(e.target.value)}
              maxLength={100}
              placeholder="VD: Trưởng phòng Kỹ thuật"
              className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
            />
          </label>

          <label className="block">
            <span className="block text-xs font-semibold text-slate-600 mb-1">Slogan động lực</span>
            <textarea
              value={slogan}
              onChange={(e) => setSlogan(e.target.value)}
              maxLength={300}
              rows={2}
              placeholder="VD: Hôm nay tốt hơn hôm qua"
              className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
            />
            <div className="text-[10px] text-slate-400 mt-1 text-right">{slogan.length}/300</div>
          </label>
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50">Huỷ</button>
          <button onClick={save} disabled={saving || uploadingAvatar} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Lưu hồ sơ
          </button>
        </div>
      </div>

      {/* Cropper overlay khi user chọn file */}
      {cropperFile && (
        <AvatarCropper
          file={cropperFile}
          onCancel={() => setCropperFile(null)}
          onConfirm={handleCropConfirm}
        />
      )}
    </div>
  );
}

// ─────────── TaskModal ───────────
function TaskModal({
  editing, onClose, onSaved, onError,
}: {
  editing: PersonalTaskRow | null;
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const [title, setTitle] = useState(editing?.title ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [priority, setPriority] = useState<TaskPriority>(editing?.priority ?? 'medium');
  const [status, setStatus] = useState<TaskStatus>(editing?.status ?? 'todo');
  const [category, setCategory] = useState<TaskCategory>(editing?.category ?? 'personal');
  const [dueDate, setDueDate] = useState(editing?.dueDate ?? '');
  const [scheduledTime, setScheduledTime] = useState(editing?.scheduledTime ?? '');
  const [reminderAt, setReminderAt] = useState(editing?.reminderAt ?? '');
  /** Khi user thay đổi reminderAt thủ công → khoá auto-update */
  const [reminderManual, setReminderManual] = useState(!!editing?.reminderAt && !editing?.scheduledTime);
  const [saving, setSaving] = useState(false);

  // Auto-tính reminderAt = scheduledAt - 1h khi dueDate + scheduledTime đổi (trừ khi user override)
  useEffect(() => {
    if (reminderManual) return;
    if (dueDate && scheduledTime) {
      const d = new Date(`${dueDate}T${scheduledTime}:00`);
      if (Number.isFinite(d.getTime())) {
        const r = new Date(d.getTime() - 60 * 60_000);
        // Convert sang datetime-local format YYYY-MM-DDTHH:MM (no seconds, no TZ suffix)
        const pad = (n: number) => String(n).padStart(2, '0');
        const localStr = `${r.getFullYear()}-${pad(r.getMonth() + 1)}-${pad(r.getDate())}T${pad(r.getHours())}:${pad(r.getMinutes())}`;
        setReminderAt(localStr);
      }
    }
  }, [dueDate, scheduledTime, reminderManual]);

  async function save() {
    if (!title.trim()) { onError('Tiêu đề bắt buộc'); return; }
    setSaving(true);
    try {
      // Convert reminderAt (datetime-local string) → ISO string nếu có giá trị
      let reminderISO: string | null = null;
      if (reminderAt) {
        const d = new Date(reminderAt);
        if (Number.isFinite(d.getTime())) reminderISO = d.toISOString();
      }
      const payload = {
        title: title.trim(),
        description: description.trim(),
        priority, status, category,
        dueDate: dueDate || null,
        scheduledTime: scheduledTime || null,
        reminderAt: reminderISO,
      };
      const res = editing
        ? await fetch(`/api/personal/tasks/${encodeURIComponent(editing.id)}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
        : await fetch('/api/personal/tasks', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? 'Lỗi lưu');
      onSaved();
    } catch (e: any) {
      onError(e.message);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-slate-800">{editing ? 'Sửa công việc' : 'Thêm công việc'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto">
          <label className="block">
            <span className="block text-xs font-semibold text-slate-600 mb-1">Tiêu đề *</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="VD: Họp tuần với GĐ Khối"
              className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
              autoFocus
            />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-slate-600 mb-1">Mô tả</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={5000} rows={3}
              placeholder="Chi tiết, mục tiêu, ghi chú…"
              className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-slate-600 mb-1">Ưu tiên</span>
              <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full px-3 py-2 border border-slate-300 rounded text-sm">
                {(['low', 'medium', 'high', 'urgent'] as TaskPriority[]).map((p) => (
                  <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-slate-600 mb-1">Trạng thái</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full px-3 py-2 border border-slate-300 rounded text-sm">
                {(['todo', 'doing', 'done', 'cancelled'] as TaskStatus[]).map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-slate-600 mb-1">Phân loại</span>
              <select value={category} onChange={(e) => setCategory(e.target.value as TaskCategory)}
                className="w-full px-3 py-2 border border-slate-300 rounded text-sm">
                {(['daily', 'weekly', 'project', 'personal', 'learning'] as TaskCategory[]).map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-slate-600 mb-1">Ngày thực hiện</span>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded text-sm" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-slate-600 mb-1">Giờ thực hiện</span>
              <input type="time" value={scheduledTime} onChange={(e) => { setScheduledTime(e.target.value); setReminderManual(false); }}
                className="w-full px-3 py-2 border border-slate-300 rounded text-sm" />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-slate-600 mb-1">
                Nhắc nhở
                {!reminderManual && scheduledTime && <span className="text-emerald-600 font-normal ml-1">· tự động -1h</span>}
              </span>
              <input
                type="datetime-local"
                value={reminderAt}
                onChange={(e) => { setReminderAt(e.target.value); setReminderManual(true); }}
                className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
              />
            </label>
          </div>
          {scheduledTime && dueDate && (
            <div className="text-[11px] text-slate-500 -mt-1">
              📅 Task lúc <strong className="text-emerald-700">{scheduledTime} {dueDate}</strong>
              {reminderAt && <> · 🔔 Nhắc <strong className="text-amber-700">{new Date(reminderAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</strong></>}
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50">Huỷ</button>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {editing ? 'Cập nhật' : 'Thêm'}
          </button>
        </div>
      </div>
    </div>
  );
}
