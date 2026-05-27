'use client';

// Tab Thói quen — habit tracker với heatmap 7-14 ngày + streak counter.

import { useEffect, useMemo, useState } from 'react';
import { Repeat, Plus, Edit3, Trash2, Loader2, Save, X, Flame, Award, Calendar } from 'lucide-react';

type HabitCategory = 'work' | 'health' | 'mindset' | 'learning' | 'personal';
type HabitFrequency = 'daily' | 'weekdays' | 'weekly';
type HabitColor = 'emerald' | 'cyan' | 'amber' | 'rose' | 'violet' | 'indigo' | 'slate' | 'pink' | 'orange';

interface Habit {
  id: string;
  title: string;
  description?: string;
  category: HabitCategory;
  frequency: HabitFrequency;
  color: HabitColor;
  icon?: string | null;
  startDate: string;
  completions: Record<string, boolean>;
  archived: boolean;
}

const CATEGORY_LABEL: Record<HabitCategory, string> = {
  work: 'Công việc', health: 'Sức khoẻ', mindset: 'Tư duy', learning: 'Học tập', personal: 'Cá nhân',
};
const CATEGORY_EMOJI: Record<HabitCategory, string> = {
  work: '💼', health: '💪', mindset: '🧠', learning: '📚', personal: '✨',
};
const FREQUENCY_LABEL: Record<HabitFrequency, string> = {
  daily: 'Hằng ngày', weekdays: 'Thứ 2-6', weekly: 'Hằng tuần',
};
const COLOR_BG: Record<HabitColor, string> = {
  emerald: 'bg-emerald-500', cyan: 'bg-cyan-500', amber: 'bg-amber-500', rose: 'bg-rose-500',
  violet: 'bg-violet-500', indigo: 'bg-indigo-500', slate: 'bg-slate-500', pink: 'bg-pink-500', orange: 'bg-orange-500',
};
const COLOR_RING: Record<HabitColor, string> = {
  emerald: 'ring-emerald-200', cyan: 'ring-cyan-200', amber: 'ring-amber-200', rose: 'ring-rose-200',
  violet: 'ring-violet-200', indigo: 'ring-indigo-200', slate: 'ring-slate-200', pink: 'ring-pink-200', orange: 'ring-orange-200',
};

function calcStreak(completions: Record<string, boolean>) {
  const dates = Object.keys(completions).filter((d) => completions[d]).sort();
  if (dates.length === 0) return { current: 0, longest: 0, total: 0 };
  let longest = 1, run = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1] + 'T00:00:00Z');
    const cur = new Date(dates[i] + 'T00:00:00Z');
    const diff = Math.round((cur.getTime() - prev.getTime()) / 86_400_000);
    if (diff === 1) { run++; longest = Math.max(longest, run); }
    else run = 1;
  }
  // Current: đếm từ hôm nay ngược lại, cho phép hôm nay chưa làm
  const today = new Date();
  let cur = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (completions[key]) cur++;
    else if (i > 0) break;
  }
  return { current: cur, longest, total: dates.length };
}

function getLastNDays(n: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export function HabitsPanel({ onToast }: { onToast: (t: 'success' | 'error', m: string) => void }) {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Habit | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/personal/habits', { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? 'Lỗi tải');
      setHabits(j.rows ?? []);
    } catch (e: any) {
      onToast('error', e.message);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function handleToggle(habit: Habit, date: string, currentlyCompleted: boolean) {
    // Optimistic update
    const newCompletions = { ...habit.completions };
    if (currentlyCompleted) delete newCompletions[date];
    else newCompletions[date] = true;
    setHabits((arr) => arr.map((h) => h.id === habit.id ? { ...h, completions: newCompletions } : h));

    try {
      const res = await fetch(`/api/personal/habits/${encodeURIComponent(habit.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toggleDate: date, completed: !currentlyCompleted }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? 'Lỗi cập nhật');
      }
    } catch (e: any) {
      onToast('error', e.message);
      load();  // reload to revert
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Xoá thói quen này? (toàn bộ dữ liệu streak sẽ mất)')) return;
    try {
      const res = await fetch(`/api/personal/habits/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? 'Lỗi xoá');
      }
      setHabits((arr) => arr.filter((h) => h.id !== id));
      onToast('success', 'Đã xoá thói quen');
    } catch (e: any) {
      onToast('error', e.message);
    }
  }

  async function handleArchive(habit: Habit) {
    try {
      const res = await fetch(`/api/personal/habits/${encodeURIComponent(habit.id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !habit.archived }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? 'Lỗi');
      }
      setHabits((arr) => arr.map((h) => h.id === habit.id ? { ...h, archived: !habit.archived } : h));
      onToast('success', habit.archived ? 'Đã kích hoạt lại' : 'Đã lưu trữ');
    } catch (e: any) {
      onToast('error', e.message);
    }
  }

  const visibleHabits = useMemo(
    () => habits.filter((h) => showArchived ? true : !h.archived),
    [habits, showArchived],
  );
  const last14 = useMemo(() => getLastNDays(14), []);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-3">
      <div className="card flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="font-bold text-slate-800 inline-flex items-center gap-2">
            <Repeat size={16} className="text-emerald-700" /> Thói quen tốt
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Bấm vào ngày để đánh dấu hoàn thành. Streak tăng khi làm liên tục.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-600 inline-flex items-center gap-1">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Hiện đã lưu trữ
          </label>
          <button
            onClick={() => { setEditing(null); setModalOpen(true); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Plus size={13} /> Thêm thói quen
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card text-center py-10 text-slate-400 text-sm">Đang tải…</div>
      ) : visibleHabits.length === 0 ? (
        <div className="card text-center py-12">
          <Flame className="mx-auto text-amber-400 mb-2" size={32} />
          <div className="font-semibold text-slate-700">Chưa có thói quen nào</div>
          <div className="text-xs text-slate-500 mt-1">Bắt đầu nhỏ: "Đọc 10 phút mỗi sáng", "Đi bộ 30 phút", "Họp 1-1 thứ 2"…</div>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleHabits.map((h) => {
            const streak = calcStreak(h.completions);
            const todayDone = !!h.completions[today];
            return (
              <div key={h.id} className={`card p-0 overflow-hidden ${h.archived ? 'opacity-60' : ''}`}>
                <header className={`px-4 py-2.5 flex items-center justify-between gap-2 flex-wrap ring-1 ${COLOR_RING[h.color]} bg-white`}>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className={`h-3 w-3 rounded-full ${COLOR_BG[h.color]} shrink-0`} aria-hidden />
                    <span className="text-sm" aria-hidden>{CATEGORY_EMOJI[h.category]}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-sm text-slate-800 truncate">{h.title}</div>
                      <div className="text-[11px] text-slate-500">{CATEGORY_LABEL[h.category]} · {FREQUENCY_LABEL[h.frequency]}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-xs text-amber-700 font-bold">
                      <Flame size={14} />
                      {streak.current}
                      <span className="text-slate-400 font-normal">ngày</span>
                    </div>
                    <div className="hidden sm:flex items-center gap-1 text-xs text-emerald-700 font-semibold">
                      <Award size={13} />
                      {streak.longest}
                      <span className="text-slate-400 font-normal">đỉnh</span>
                    </div>
                    <button
                      onClick={() => handleToggle(h, today, todayDone)}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold ring-1 transition ${
                        todayDone
                          ? 'bg-emerald-600 text-white ring-emerald-600 shadow'
                          : 'bg-white text-slate-700 ring-slate-300 hover:bg-emerald-50 hover:ring-emerald-300'
                      }`}
                    >
                      {todayDone ? '✓ Đã xong' : 'Đánh dấu'}
                    </button>
                    <button onClick={() => { setEditing(h); setModalOpen(true); }} className="p-1.5 text-slate-400 hover:text-emerald-700 rounded" title="Sửa">
                      <Edit3 size={13} />
                    </button>
                    <button onClick={() => handleArchive(h)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded text-[10px] font-semibold" title="Lưu trữ">
                      {h.archived ? '↩' : '🗄'}
                    </button>
                    <button onClick={() => handleDelete(h.id)} className="p-1.5 text-slate-400 hover:text-rose-600 rounded" title="Xoá">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </header>
                {/* Heatmap 14 ngày */}
                <div className="px-4 py-2.5 bg-slate-50/50 border-t border-slate-100">
                  <div className="flex items-center gap-1 overflow-x-auto pb-1">
                    {last14.map((d) => {
                      const done = !!h.completions[d];
                      const isToday = d === today;
                      const dayLabel = d.slice(8); // DD
                      return (
                        <button
                          key={d}
                          onClick={() => handleToggle(h, d, done)}
                          title={d + (done ? ' · ✓ đã làm' : '')}
                          className={`shrink-0 h-7 w-7 rounded text-[10px] font-semibold transition ${
                            done
                              ? `${COLOR_BG[h.color]} text-white shadow`
                              : `bg-white text-slate-400 ring-1 ring-slate-200 hover:ring-slate-400`
                          } ${isToday ? 'ring-2 ring-amber-400 ring-offset-1' : ''}`}
                        >
                          {dayLabel}
                        </button>
                      );
                    })}
                    <span className="ml-2 text-[10px] text-slate-400 shrink-0">14 ngày · {streak.total} lần</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <HabitModal
          editing={editing}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSaved={() => { setModalOpen(false); setEditing(null); load(); onToast('success', editing ? 'Đã cập nhật' : 'Đã thêm thói quen'); }}
          onError={(m) => onToast('error', m)}
        />
      )}
    </div>
  );
}

function HabitModal({
  editing, onClose, onSaved, onError,
}: {
  editing: Habit | null;
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const [title, setTitle] = useState(editing?.title ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [category, setCategory] = useState<HabitCategory>(editing?.category ?? 'personal');
  const [frequency, setFrequency] = useState<HabitFrequency>(editing?.frequency ?? 'daily');
  const [color, setColor] = useState<HabitColor>(editing?.color ?? 'emerald');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim()) { onError('Tên thói quen bắt buộc'); return; }
    setSaving(true);
    try {
      const payload = { title: title.trim(), description: description.trim(), category, frequency, color };
      const res = editing
        ? await fetch(`/api/personal/habits/${encodeURIComponent(editing.id)}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
        : await fetch('/api/personal/habits', {
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-slate-800">🔁 {editing ? 'Sửa thói quen' : 'Thêm thói quen'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <label className="block">
            <span className="block text-xs font-semibold text-slate-700 mb-1">Tên thói quen *</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} autoFocus
              placeholder="VD: Đọc 30 phút mỗi sáng"
              className="w-full px-3 py-2 border border-slate-300 rounded text-sm" />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-slate-700 mb-1">Mô tả ngắn</span>
            <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500}
              placeholder="Lý do, mục tiêu"
              className="w-full px-3 py-2 border border-slate-300 rounded text-sm" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-slate-700 mb-1">Phân loại</span>
              <select value={category} onChange={(e) => setCategory(e.target.value as HabitCategory)}
                className="w-full px-3 py-2 border border-slate-300 rounded text-sm">
                {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{CATEGORY_EMOJI[k as HabitCategory]} {v}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-slate-700 mb-1">Tần suất</span>
              <select value={frequency} onChange={(e) => setFrequency(e.target.value as HabitFrequency)}
                className="w-full px-3 py-2 border border-slate-300 rounded text-sm">
                {Object.entries(FREQUENCY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          </div>
          <div>
            <span className="block text-xs font-semibold text-slate-700 mb-1">Màu nhãn</span>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(COLOR_BG) as HabitColor[]).map((c) => (
                <button key={c} onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full ${COLOR_BG[c]} ${color === c ? 'ring-2 ring-offset-2 ring-slate-800' : ''}`}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
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
