'use client';

// Tab Nhật ký — daily reflection, template "Đã làm / Thách thức / Học được / Mai làm gì" + mood.

import { useEffect, useState } from 'react';
import { BookOpen, Plus, Save, X, Edit3, Trash2, Loader2, Calendar, Sparkles } from 'lucide-react';

interface JournalEntry {
  id: string;
  date: string;
  didToday?: string;
  challenges?: string;
  learned?: string;
  tomorrow?: string;
  freeNote?: string;
  mood?: 'great' | 'good' | 'ok' | 'tired' | 'stressed' | null;
}

const MOOD_EMOJI: Record<NonNullable<JournalEntry['mood']>, string> = {
  great: '😄', good: '🙂', ok: '😐', tired: '😴', stressed: '😣',
};
const MOOD_LABEL: Record<NonNullable<JournalEntry['mood']>, string> = {
  great: 'Tuyệt', good: 'Tốt', ok: 'Ổn', tired: 'Mệt', stressed: 'Áp lực',
};

export function JournalPanel({ onToast }: { onToast: (t: 'success' | 'error', m: string) => void }) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<JournalEntry | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/personal/journal', { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? 'Lỗi tải');
      setEntries(j.rows ?? []);
    } catch (e: any) {
      onToast('error', e.message);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function handleDelete(id: string) {
    if (!confirm('Xoá nhật ký này?')) return;
    try {
      const res = await fetch(`/api/personal/journal/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? 'Lỗi xoá');
      }
      setEntries((arr) => arr.filter((e) => e.id !== id));
      onToast('success', 'Đã xoá entry');
    } catch (e: any) {
      onToast('error', e.message);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const hasToday = entries.some((e) => e.date === today);

  return (
    <div className="space-y-3">
      <div className="card flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="font-bold text-slate-800 inline-flex items-center gap-2">
            <BookOpen size={16} className="text-emerald-700" /> Nhật ký công việc
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Viết 1 entry mỗi ngày — phản tỉnh để trưởng thành nhanh hơn.
          </div>
        </div>
        <button
          onClick={() => { setEditing(null); setModalOpen(true); }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <Plus size={13} /> {hasToday ? 'Sửa nhật ký hôm nay' : 'Viết hôm nay'}
        </button>
      </div>

      {loading ? (
        <div className="card text-center py-10 text-slate-400 text-sm">Đang tải…</div>
      ) : entries.length === 0 ? (
        <div className="card text-center py-12">
          <Sparkles className="mx-auto text-amber-400 mb-2" size={32} />
          <div className="font-semibold text-slate-700">Bắt đầu viết nhật ký đầu tiên của bạn</div>
          <div className="text-xs text-slate-500 mt-1">Chỉ 5 phút mỗi tối — tích luỹ insight cả năm.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((e) => (
            <article key={e.id} className="card p-0 overflow-hidden">
              <header className="px-4 py-2.5 bg-gradient-to-r from-emerald-50 to-cyan-50 border-b border-emerald-100 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-emerald-700" />
                  <span className="font-bold text-sm text-slate-800">{e.date}</span>
                  {e.mood && (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-white ring-1 ring-emerald-200 text-emerald-800">
                      {MOOD_EMOJI[e.mood]} {MOOD_LABEL[e.mood]}
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditing(e); setModalOpen(true); }} className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded" title="Sửa">
                    <Edit3 size={14} />
                  </button>
                  <button onClick={() => handleDelete(e.id)} className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded" title="Xoá">
                    <Trash2 size={14} />
                  </button>
                </div>
              </header>
              <div className="p-4 space-y-2 text-sm">
                {e.didToday && <Section title="✅ Hôm nay đã làm" text={e.didToday} />}
                {e.challenges && <Section title="⚠️ Thách thức / khó khăn" text={e.challenges} />}
                {e.learned && <Section title="💡 Học được" text={e.learned} />}
                {e.tomorrow && <Section title="🎯 Ngày mai sẽ làm" text={e.tomorrow} />}
                {e.freeNote && <Section title="📝 Ghi chú thêm" text={e.freeNote} />}
              </div>
            </article>
          ))}
        </div>
      )}

      {modalOpen && (
        <JournalModal
          entry={editing}
          defaultDate={today}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSaved={() => { setModalOpen(false); setEditing(null); load(); onToast('success', editing ? 'Đã lưu nhật ký' : 'Đã thêm entry'); }}
          onError={(m) => onToast('error', m)}
        />
      )}
    </div>
  );
}

function Section({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">{title}</div>
      <div className="text-slate-700 whitespace-pre-wrap mt-0.5">{text}</div>
    </div>
  );
}

function JournalModal({
  entry, defaultDate, onClose, onSaved, onError,
}: {
  entry: JournalEntry | null;
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const [date] = useState(entry?.date ?? defaultDate);
  const [didToday, setDidToday] = useState(entry?.didToday ?? '');
  const [challenges, setChallenges] = useState(entry?.challenges ?? '');
  const [learned, setLearned] = useState(entry?.learned ?? '');
  const [tomorrow, setTomorrow] = useState(entry?.tomorrow ?? '');
  const [freeNote, setFreeNote] = useState(entry?.freeNote ?? '');
  const [mood, setMood] = useState<JournalEntry['mood'] | null>(entry?.mood ?? null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const payload = { date, didToday, challenges, learned, tomorrow, freeNote, mood };
      const res = entry
        ? await fetch(`/api/personal/journal/${encodeURIComponent(entry.id)}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
        : await fetch('/api/personal/journal', {
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-slate-800">📔 Nhật ký {date}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto">
          <div>
            <span className="block text-xs font-semibold text-slate-600 mb-1">Tâm trạng / Năng lượng hôm nay</span>
            <div className="flex items-center gap-2 flex-wrap">
              {(['great', 'good', 'ok', 'tired', 'stressed'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMood(mood === m ? null : m)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold ring-1 transition ${
                    mood === m ? 'bg-emerald-50 text-emerald-800 ring-emerald-300' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {MOOD_EMOJI[m]} {MOOD_LABEL[m]}
                </button>
              ))}
            </div>
          </div>

          <TextArea label="✅ Hôm nay tôi đã làm" value={didToday} onChange={setDidToday} rows={3} placeholder="Liệt kê 3-5 việc đã hoàn thành…" />
          <TextArea label="⚠️ Thách thức / khó khăn" value={challenges} onChange={setChallenges} rows={2} placeholder="Vấn đề gì đang vướng?" />
          <TextArea label="💡 Tôi học được" value={learned} onChange={setLearned} rows={2} placeholder="Bài học, insight, cách tốt hơn cho lần sau" />
          <TextArea label="🎯 Ngày mai sẽ làm" value={tomorrow} onChange={setTomorrow} rows={2} placeholder="Ưu tiên top 3 cho ngày mai" />
          <TextArea label="📝 Ghi chú tự do (tuỳ chọn)" value={freeNote} onChange={setFreeNote} rows={2} placeholder="Suy nghĩ, ý tưởng, lưu ý khác…" />
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50">Huỷ</button>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {entry ? 'Cập nhật' : 'Lưu nhật ký'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TextArea({ label, value, onChange, rows, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; rows: number; placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-700 mb-1">{label}</span>
      <textarea
        value={value} onChange={(e) => onChange(e.target.value)}
        rows={rows} maxLength={5000} placeholder={placeholder}
        className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:border-emerald-400"
      />
    </label>
  );
}
