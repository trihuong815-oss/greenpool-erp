'use client';

// Tab Mục tiêu — multi-category (công việc, sức khoẻ, học tập, tài chính, gia đình, cá nhân)
// + milestones + progress bar.

import { useEffect, useState } from 'react';
import { Target, Plus, Edit3, Trash2, Loader2, Save, X, Check, Briefcase, Heart, BookOpen, DollarSign, Users, Sparkles } from 'lucide-react';

type GoalCategory = 'work' | 'health' | 'learning' | 'finance' | 'family' | 'personal';
type GoalStatus = 'active' | 'completed' | 'paused' | 'cancelled';
type GoalPriority = 'low' | 'medium' | 'high';

interface Milestone { title: string; done: boolean; completedAt?: string | null }

interface Goal {
  id: string;
  title: string;
  description?: string;
  category: GoalCategory;
  priority: GoalPriority;
  status: GoalStatus;
  targetDate?: string | null;
  progressPct: number;
  milestones: Milestone[];
}

const CATEGORY_META: Record<GoalCategory, { label: string; Icon: typeof Briefcase; color: string }> = {
  work:     { label: 'Công việc', Icon: Briefcase, color: 'cyan' },
  health:   { label: 'Sức khoẻ',  Icon: Heart, color: 'rose' },
  learning: { label: 'Học tập',   Icon: BookOpen, color: 'violet' },
  finance:  { label: 'Tài chính', Icon: DollarSign, color: 'emerald' },
  family:   { label: 'Gia đình',  Icon: Users, color: 'amber' },
  personal: { label: 'Cá nhân',   Icon: Sparkles, color: 'pink' },
};
const STATUS_LABEL: Record<GoalStatus, string> = {
  active: 'Đang theo', completed: 'Hoàn thành', paused: 'Tạm dừng', cancelled: 'Huỷ',
};
const PRIORITY_LABEL: Record<GoalPriority, string> = {
  low: 'Thấp', medium: 'Trung bình', high: 'Cao',
};

function pct(g: Goal): number {
  // Ưu tiên progressPct manual; nếu có milestones, override = done/total
  if (g.milestones.length > 0) {
    const done = g.milestones.filter((m) => m.done).length;
    return Math.round((done / g.milestones.length) * 100);
  }
  return g.progressPct;
}

export function GoalsPanel({ onToast }: { onToast: (t: 'success' | 'error', m: string) => void }) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [filterCat, setFilterCat] = useState<'all' | GoalCategory>('all');

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/personal/goals', { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? 'Lỗi tải');
      setGoals(j.rows ?? []);
    } catch (e: any) {
      onToast('error', e.message);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function handleDelete(id: string) {
    if (!confirm('Xoá mục tiêu này?')) return;
    try {
      const res = await fetch(`/api/personal/goals/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? 'Lỗi xoá');
      }
      setGoals((arr) => arr.filter((g) => g.id !== id));
      onToast('success', 'Đã xoá');
    } catch (e: any) { onToast('error', e.message); }
  }

  async function handleToggleMilestone(g: Goal, idx: number) {
    const newMs = [...g.milestones];
    newMs[idx] = { ...newMs[idx], done: !newMs[idx].done, completedAt: !newMs[idx].done ? new Date().toISOString() : null };
    setGoals((arr) => arr.map((x) => x.id === g.id ? { ...x, milestones: newMs } : x));
    try {
      const res = await fetch(`/api/personal/goals/${encodeURIComponent(g.id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ milestones: newMs }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? 'Lỗi');
      }
    } catch (e: any) {
      onToast('error', e.message);
      load();
    }
  }

  const visibleGoals = filterCat === 'all' ? goals : goals.filter((g) => g.category === filterCat);

  return (
    <div className="space-y-3">
      <div className="card flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="font-bold text-slate-800 inline-flex items-center gap-2">
            <Target size={16} className="text-emerald-700" /> Mục tiêu của tôi
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Đặt mục tiêu rõ — chia thành milestone — theo dõi tiến độ.
          </div>
        </div>
        <button
          onClick={() => { setEditing(null); setModalOpen(true); }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <Plus size={13} /> Thêm mục tiêu
        </button>
      </div>

      {/* Filter category */}
      <div className="flex items-center gap-1.5 flex-wrap text-xs">
        <button onClick={() => setFilterCat('all')}
          className={`px-2.5 py-1 rounded-md ring-1 ${filterCat === 'all' ? 'bg-emerald-50 text-emerald-800 ring-emerald-300' : 'bg-white text-slate-600 ring-slate-200'}`}>
          Tất cả
        </button>
        {(Object.keys(CATEGORY_META) as GoalCategory[]).map((c) => {
          const m = CATEGORY_META[c];
          const Icon = m.Icon;
          return (
            <button key={c} onClick={() => setFilterCat(c)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md ring-1 ${filterCat === c ? 'bg-emerald-50 text-emerald-800 ring-emerald-300' : 'bg-white text-slate-600 ring-slate-200'}`}>
              <Icon size={12} /> {m.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="card text-center py-10 text-slate-400 text-sm">Đang tải…</div>
      ) : visibleGoals.length === 0 ? (
        <div className="card text-center py-12">
          <Target className="mx-auto text-emerald-400 mb-2" size={32} />
          <div className="font-semibold text-slate-700">Chưa có mục tiêu nào</div>
          <div className="text-xs text-slate-500 mt-1">SMART goal: Cụ thể · Đo lường được · Khả thi · Phù hợp · Thời hạn.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleGoals.map((g) => {
            const m = CATEGORY_META[g.category];
            const Icon = m.Icon;
            const p = pct(g);
            const overdue = g.targetDate && g.targetDate < new Date().toISOString().slice(0, 10) && g.status === 'active';
            return (
              <article key={g.id} className="card p-0 overflow-hidden">
                <header className={`px-4 py-2.5 bg-${m.color}-50/60 border-b border-${m.color}-100 flex items-center justify-between gap-2 flex-wrap`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon size={14} className={`text-${m.color}-700 shrink-0`} />
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full bg-white ring-1 ring-${m.color}-200 text-${m.color}-800 font-semibold uppercase tracking-wider`}>
                      {m.label}
                    </span>
                    <span className="font-bold text-sm text-slate-800 truncate">{g.title}</span>
                    {g.status !== 'active' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">{STATUS_LABEL[g.status]}</span>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => { setEditing(g); setModalOpen(true); }} className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded" title="Sửa">
                      <Edit3 size={13} />
                    </button>
                    <button onClick={() => handleDelete(g.id)} className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded" title="Xoá">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </header>
                <div className="p-4 space-y-2">
                  {g.description && <div className="text-sm text-slate-700 whitespace-pre-wrap">{g.description}</div>}
                  <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500">
                    {g.targetDate && (
                      <span className={overdue ? 'text-rose-600 font-semibold' : ''}>
                        🎯 Hạn: {g.targetDate}{overdue ? ' (quá hạn)' : ''}
                      </span>
                    )}
                    <span>· Ưu tiên: {PRIORITY_LABEL[g.priority]}</span>
                  </div>
                  {/* Progress bar */}
                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-slate-700">Tiến độ</span>
                      <span className="text-sm font-bold text-slate-800 tabular-nums">{p}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all bg-${m.color}-500`}
                        style={{ width: `${p}%` }}
                      />
                    </div>
                  </div>
                  {/* Milestones */}
                  {g.milestones.length > 0 && (
                    <div className="mt-3 space-y-1">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Cột mốc</div>
                      {g.milestones.map((ms, idx) => (
                        <label key={idx} className="flex items-start gap-2 text-sm cursor-pointer hover:bg-slate-50/50 rounded px-1 py-0.5">
                          <input
                            type="checkbox"
                            checked={ms.done}
                            onChange={() => handleToggleMilestone(g, idx)}
                            className="mt-1 h-3.5 w-3.5"
                          />
                          <span className={ms.done ? 'line-through text-slate-400' : 'text-slate-700'}>{ms.title}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <GoalModal
          editing={editing}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSaved={() => { setModalOpen(false); setEditing(null); load(); onToast('success', editing ? 'Đã cập nhật' : 'Đã thêm'); }}
          onError={(m) => onToast('error', m)}
        />
      )}
    </div>
  );
}

function GoalModal({ editing, onClose, onSaved, onError }: {
  editing: Goal | null;
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const [title, setTitle] = useState(editing?.title ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [category, setCategory] = useState<GoalCategory>(editing?.category ?? 'work');
  const [priority, setPriority] = useState<GoalPriority>(editing?.priority ?? 'medium');
  const [status, setStatus] = useState<GoalStatus>(editing?.status ?? 'active');
  const [targetDate, setTargetDate] = useState(editing?.targetDate ?? '');
  const [progressPct, setProgressPct] = useState(editing?.progressPct ?? 0);
  const [milestones, setMilestones] = useState<Milestone[]>(editing?.milestones ?? []);
  const [newMs, setNewMs] = useState('');
  const [saving, setSaving] = useState(false);

  function addMilestone() {
    const t = newMs.trim();
    if (!t) return;
    setMilestones((arr) => [...arr, { title: t, done: false, completedAt: null }]);
    setNewMs('');
  }
  function removeMilestone(idx: number) {
    setMilestones((arr) => arr.filter((_, i) => i !== idx));
  }

  async function save() {
    if (!title.trim()) { onError('Tên mục tiêu bắt buộc'); return; }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(), description: description.trim(),
        category, priority, status,
        targetDate: targetDate || null,
        progressPct, milestones,
      };
      const res = editing
        ? await fetch(`/api/personal/goals/${encodeURIComponent(editing.id)}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
        : await fetch('/api/personal/goals', {
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
          <h3 className="font-bold text-slate-800">🎯 {editing ? 'Sửa mục tiêu' : 'Thêm mục tiêu'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto">
          <label className="block">
            <span className="block text-xs font-semibold text-slate-700 mb-1">Tên mục tiêu *</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus
              placeholder="VD: Hoàn thành sách quản trị 2026"
              className="w-full px-3 py-2 border border-slate-300 rounded text-sm" />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-slate-700 mb-1">Mô tả</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={3}
              placeholder="Tại sao quan trọng? Mục đích?"
              className="w-full px-3 py-2 border border-slate-300 rounded text-sm" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-slate-700 mb-1">Lĩnh vực</span>
              <select value={category} onChange={(e) => setCategory(e.target.value as GoalCategory)}
                className="w-full px-3 py-2 border border-slate-300 rounded text-sm">
                {(Object.keys(CATEGORY_META) as GoalCategory[]).map((c) => <option key={c} value={c}>{CATEGORY_META[c].label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-slate-700 mb-1">Ưu tiên</span>
              <select value={priority} onChange={(e) => setPriority(e.target.value as GoalPriority)}
                className="w-full px-3 py-2 border border-slate-300 rounded text-sm">
                <option value="low">Thấp</option><option value="medium">Trung bình</option><option value="high">Cao</option>
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-slate-700 mb-1">Trạng thái</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as GoalStatus)}
                className="w-full px-3 py-2 border border-slate-300 rounded text-sm">
                <option value="active">Đang theo</option>
                <option value="paused">Tạm dừng</option>
                <option value="completed">Hoàn thành</option>
                <option value="cancelled">Huỷ</option>
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-slate-700 mb-1">Hạn (target)</span>
              <input type="date" value={targetDate ?? ''} onChange={(e) => setTargetDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded text-sm" />
            </label>
          </div>
          {milestones.length === 0 && (
            <label className="block">
              <span className="block text-xs font-semibold text-slate-700 mb-1">Tiến độ thủ công (%)</span>
              <input type="range" min={0} max={100} step={5} value={progressPct} onChange={(e) => setProgressPct(Number(e.target.value))} className="w-full" />
              <div className="text-sm text-slate-700 text-center tabular-nums">{progressPct}%</div>
            </label>
          )}
          <div>
            <span className="block text-xs font-semibold text-slate-700 mb-1">Cột mốc (milestones)</span>
            <div className="text-[11px] text-slate-500 mb-2">Có milestone → tiến độ tự tính = done/total</div>
            {milestones.map((ms, idx) => (
              <div key={idx} className="flex items-center gap-2 mb-1">
                <span className={`flex-1 text-sm px-2 py-1 rounded bg-slate-50 ${ms.done ? 'line-through text-slate-400' : 'text-slate-700'}`}>{ms.title}</span>
                <button onClick={() => removeMilestone(idx)} className="text-rose-500 hover:text-rose-700 text-xs">Xoá</button>
              </div>
            ))}
            <div className="flex gap-1.5 mt-1.5">
              <input value={newMs} onChange={(e) => setNewMs(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addMilestone())}
                placeholder="Thêm cột mốc + Enter"
                className="flex-1 px-2 py-1.5 border border-slate-300 rounded text-sm" />
              <button onClick={addMilestone} className="px-3 py-1.5 text-xs font-semibold rounded bg-slate-200 hover:bg-slate-300">+ Thêm</button>
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
