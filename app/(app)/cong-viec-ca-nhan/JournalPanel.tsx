'use client';

// Tab Nhật ký — Facebook-style post feed.
// - Compose: text content + image upload (multi) + mood.
// - Feed: post card với avatar, content, image gallery, mood.
// - Backward compat: hiển thị didToday/challenges/learned/tomorrow nếu có (structured cũ).

import { useEffect, useRef, useState } from 'react';
import {
  BookOpen, Plus, Send, X, Edit3, Trash2, Loader2, Image as ImageIcon, Sparkles,
} from 'lucide-react';

interface JournalEntry {
  id: string;
  date: string;
  content?: string;          // NEW — main post text
  imageUrls?: string[];       // NEW — uploaded image URLs
  didToday?: string;
  challenges?: string;
  learned?: string;
  tomorrow?: string;
  freeNote?: string;
  mood?: 'great' | 'good' | 'ok' | 'tired' | 'stressed' | null;
}

interface AuthorMeta {
  displayName: string;
  avatarUrl?: string | null;
  positionTitle?: string | null;
}

const MOOD_EMOJI: Record<NonNullable<JournalEntry['mood']>, string> = {
  great: '😄', good: '🙂', ok: '😐', tired: '😴', stressed: '😣',
};
const MOOD_LABEL: Record<NonNullable<JournalEntry['mood']>, string> = {
  great: 'Tuyệt', good: 'Tốt', ok: 'Ổn', tired: 'Mệt', stressed: 'Áp lực',
};

export function JournalPanel({
  onToast, author,
}: {
  onToast: (t: 'success' | 'error', m: string) => void;
  author: AuthorMeta;
}) {
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
      {/* Compose teaser (Facebook-style) */}
      <div className="card !p-3 flex items-center gap-3">
        <Avatar src={author.avatarUrl} name={author.displayName} size={40} />
        <button
          onClick={() => { setEditing(null); setModalOpen(true); }}
          className="flex-1 text-left px-4 py-2.5 rounded-full bg-slate-100 hover:bg-slate-200 transition text-sm text-slate-600"
        >
          {hasToday ? 'Sửa nhật ký hôm nay…' : `${author.displayName.split(' ').slice(-1)[0]} ơi, hôm nay bạn thế nào?`}
        </button>
        <button
          onClick={() => { setEditing(null); setModalOpen(true); }}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <Plus size={13} /> Đăng
        </button>
      </div>

      {loading ? (
        <div className="card text-center py-10 text-slate-400 text-sm">Đang tải…</div>
      ) : entries.length === 0 ? (
        <div className="card text-center py-12">
          <Sparkles className="mx-auto text-amber-400 mb-2" size={32} />
          <div className="font-semibold text-slate-700">Bắt đầu viết nhật ký đầu tiên của bạn</div>
          <div className="text-xs text-slate-500 mt-1">Chia sẻ suy nghĩ, hành trình, và ảnh — chỉ mình bạn thấy.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((e) => (
            <PostCard
              key={e.id}
              entry={e}
              author={author}
              onEdit={() => { setEditing(e); setModalOpen(true); }}
              onDelete={() => handleDelete(e.id)}
            />
          ))}
        </div>
      )}

      {modalOpen && (
        <JournalModal
          entry={editing}
          defaultDate={today}
          author={author}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSaved={() => { setModalOpen(false); setEditing(null); load(); onToast('success', editing ? 'Đã lưu nhật ký' : 'Đã đăng bài'); }}
          onError={(m) => onToast('error', m)}
        />
      )}
    </div>
  );
}

// ─── Post card (Facebook-style) ───
function PostCard({
  entry, author, onEdit, onDelete,
}: {
  entry: JournalEntry;
  author: AuthorMeta;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const dateLabel = formatDateLabel(entry.date);
  const imgs = entry.imageUrls ?? [];
  const hasStructured = !!(entry.didToday || entry.challenges || entry.learned || entry.tomorrow || entry.freeNote);

  return (
    <article className="card !p-0 overflow-hidden shadow-sm ring-1 ring-slate-200">
      {/* Header */}
      <header className="px-4 pt-3 pb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar src={author.avatarUrl} name={author.displayName} size={40} />
          <div className="min-w-0">
            <div className="font-bold text-sm text-slate-800 truncate">{author.displayName}</div>
            <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <span>{dateLabel}</span>
              {entry.mood && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1">
                    {MOOD_EMOJI[entry.mood]} <span className="text-slate-600">{MOOD_LABEL[entry.mood]}</span>
                  </span>
                </>
              )}
              <span>· 🔒</span>
            </div>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={onEdit} className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded" title="Sửa">
            <Edit3 size={14} />
          </button>
          <button onClick={onDelete} className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded" title="Xoá">
            <Trash2 size={14} />
          </button>
        </div>
      </header>

      {/* Content (main text) */}
      {entry.content && (
        <div className="px-4 pb-2 text-[15px] text-slate-800 whitespace-pre-wrap leading-relaxed">
          {entry.content}
        </div>
      )}

      {/* Images gallery */}
      {imgs.length > 0 && <ImageGallery urls={imgs} />}

      {/* Structured sections (backward compat — collapsed if too long) */}
      {hasStructured && (
        <div className="px-4 py-3 mt-1 space-y-2 text-sm border-t border-slate-100 bg-slate-50/50">
          {entry.didToday && <Section title="✅ Hôm nay đã làm" text={entry.didToday} />}
          {entry.challenges && <Section title="⚠️ Thách thức" text={entry.challenges} />}
          {entry.learned && <Section title="💡 Học được" text={entry.learned} />}
          {entry.tomorrow && <Section title="🎯 Ngày mai" text={entry.tomorrow} />}
          {entry.freeNote && <Section title="📝 Ghi chú" text={entry.freeNote} />}
        </div>
      )}
    </article>
  );
}

function ImageGallery({ urls }: { urls: string[] }) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  // Layout: 1 ảnh full · 2 ảnh side-by-side · 3+ grid 2-col với "+N" overlay
  const visible = urls.slice(0, 4);
  const extra = urls.length - visible.length;
  return (
    <>
      <div
        className={`gap-0.5 ${
          visible.length === 1 ? 'grid grid-cols-1' :
          visible.length === 2 ? 'grid grid-cols-2' :
          visible.length === 3 ? 'grid grid-cols-2 grid-rows-2' :
          'grid grid-cols-2 grid-rows-2'
        }`}
        style={{ aspectRatio: visible.length === 1 ? '4/3' : '1/1' }}
      >
        {visible.map((u, i) => {
          const showOverlay = i === 3 && extra > 0;
          const colSpan = visible.length === 3 && i === 0 ? 'row-span-2' : '';
          return (
            <button
              key={i}
              onClick={() => setLightbox(u)}
              className={`relative overflow-hidden bg-slate-200 ${colSpan}`}
            >
              <img src={u} alt="" className="w-full h-full object-cover hover:opacity-90 transition" />
              {showOverlay && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-xl font-bold">
                  +{extra}
                </div>
              )}
            </button>
          );
        })}
      </div>
      {lightbox && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white p-2 rounded-full bg-white/10 hover:bg-white/20" onClick={() => setLightbox(null)}>
            <X size={20} />
          </button>
          <img src={lightbox} alt="" className="max-w-full max-h-full object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </>
  );
}

function Section({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">{title}</div>
      <div className="text-slate-700 whitespace-pre-wrap mt-0.5 text-[13px]">{text}</div>
    </div>
  );
}

// ─── Compose modal ───
function JournalModal({
  entry, defaultDate, author, onClose, onSaved, onError,
}: {
  entry: JournalEntry | null;
  defaultDate: string;
  author: AuthorMeta;
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const [date] = useState(entry?.date ?? defaultDate);
  const [content, setContent] = useState(entry?.content ?? '');
  const [imageUrls, setImageUrls] = useState<string[]>(entry?.imageUrls ?? []);
  const [mood, setMood] = useState<JournalEntry['mood'] | null>(entry?.mood ?? null);
  const [showStructured, setShowStructured] = useState(
    !!(entry?.didToday || entry?.challenges || entry?.learned || entry?.tomorrow || entry?.freeNote)
  );
  const [didToday, setDidToday] = useState(entry?.didToday ?? '');
  const [challenges, setChallenges] = useState(entry?.challenges ?? '');
  const [learned, setLearned] = useState(entry?.learned ?? '');
  const [tomorrow, setTomorrow] = useState(entry?.tomorrow ?? '');
  const [freeNote, setFreeNote] = useState(entry?.freeNote ?? '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const newUrls: string[] = [];
      for (const f of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', f);
        const res = await fetch('/api/personal/journal/upload', { method: 'POST', body: fd });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error ?? 'Lỗi upload');
        newUrls.push(j.url);
      }
      setImageUrls((cur) => [...cur, ...newUrls].slice(0, 10));
    } catch (e: any) {
      onError(e.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function removeImage(idx: number) {
    setImageUrls((cur) => cur.filter((_, i) => i !== idx));
  }

  async function save() {
    if (!content.trim() && imageUrls.length === 0 && !mood && !showStructured) {
      onError('Hãy viết gì đó hoặc đính ảnh');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { date, content, imageUrls, mood };
      if (showStructured) {
        payload.didToday = didToday;
        payload.challenges = challenges;
        payload.learned = learned;
        payload.tomorrow = tomorrow;
        payload.freeNote = freeNote;
      }
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
          <h3 className="font-bold text-slate-800 inline-flex items-center gap-2">
            <BookOpen size={16} className="text-emerald-700" /> {entry ? 'Sửa bài' : 'Đăng nhật ký mới'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto">
          {/* Author bar */}
          <div className="flex items-center gap-2.5">
            <Avatar src={author.avatarUrl} name={author.displayName} size={36} />
            <div>
              <div className="font-bold text-sm text-slate-800">{author.displayName}</div>
              <div className="text-[11px] text-slate-500">{date} · 🔒 Riêng tư</div>
            </div>
          </div>

          {/* Main textarea */}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
            maxLength={5000}
            placeholder={`${author.displayName.split(' ').slice(-1)[0]} ơi, hôm nay bạn thế nào?`}
            className="w-full px-3 py-2 border-none focus:outline-none text-[15px] resize-none placeholder:text-slate-400"
            autoFocus
          />

          {/* Image previews */}
          {imageUrls.length > 0 && (
            <div className="grid grid-cols-3 gap-1.5">
              {imageUrls.map((u, i) => (
                <div key={i} className="relative aspect-square rounded-lg overflow-hidden ring-1 ring-slate-200 group">
                  <img src={u} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeImage(i)}
                    className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition"
                    aria-label="Bỏ ảnh"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Mood */}
          <div>
            <div className="text-xs font-semibold text-slate-600 mb-1.5">Cảm xúc / năng lượng</div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {(['great', 'good', 'ok', 'tired', 'stressed'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMood(mood === m ? null : m)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold ring-1 transition ${
                    mood === m ? 'bg-emerald-50 text-emerald-800 ring-emerald-300' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {MOOD_EMOJI[m]} {MOOD_LABEL[m]}
                </button>
              ))}
            </div>
          </div>

          {/* Toggle structured sections */}
          <button
            onClick={() => setShowStructured((s) => !s)}
            className="text-xs text-slate-500 hover:text-emerald-700 inline-flex items-center gap-1"
          >
            {showStructured ? '▾' : '▸'} Phản tỉnh chi tiết (đã làm · học được · ngày mai…)
          </button>

          {showStructured && (
            <div className="space-y-2 pt-1 border-t border-slate-100">
              <TextArea label="✅ Hôm nay tôi đã làm" value={didToday} onChange={setDidToday} rows={2} />
              <TextArea label="⚠️ Thách thức" value={challenges} onChange={setChallenges} rows={2} />
              <TextArea label="💡 Tôi học được" value={learned} onChange={setLearned} rows={2} />
              <TextArea label="🎯 Ngày mai sẽ làm" value={tomorrow} onChange={setTomorrow} rows={2} />
              <TextArea label="📝 Ghi chú thêm" value={freeNote} onChange={setFreeNote} rows={2} />
            </div>
          )}
        </div>

        {/* Bottom toolbar */}
        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              onChange={(e) => handleFiles(e.target.files)}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading || imageUrls.length >= 10}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
              title={imageUrls.length >= 10 ? 'Tối đa 10 ảnh' : 'Thêm ảnh'}
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />}
              Ảnh
              {imageUrls.length > 0 && <span className="text-[10px] opacity-70">({imageUrls.length}/10)</span>}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} disabled={saving} className="px-3 py-1.5 text-sm rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50">Huỷ</button>
            <button onClick={save} disabled={saving || uploading} className="inline-flex items-center gap-2 px-4 py-1.5 text-sm font-semibold rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {entry ? 'Cập nhật' : 'Đăng bài'}
            </button>
          </div>
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
        className="w-full px-3 py-2 border border-slate-200 rounded text-sm focus:outline-none focus:border-emerald-400"
      />
    </label>
  );
}

function Avatar({ src, name, size }: { src?: string | null; name: string; size: number }) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        style={{ width: size, height: size }}
        className="rounded-full object-cover ring-2 ring-emerald-100 shrink-0"
      />
    );
  }
  const initials = name.split(' ').slice(-2).map((w) => w[0]).join('').toUpperCase();
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-bold flex items-center justify-center text-sm shrink-0 ring-2 ring-emerald-100"
    >
      {initials}
    </div>
  );
}

function formatDateLabel(date: string): string {
  const d = new Date(date);
  if (!Number.isFinite(d.getTime())) return date;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const diff = (today.getTime() - d.getTime()) / 86_400_000;
  if (diff === 0) return 'Hôm nay';
  if (diff === 1) return 'Hôm qua';
  if (diff < 7) return `${Math.floor(diff)} ngày trước`;
  return date;
}
