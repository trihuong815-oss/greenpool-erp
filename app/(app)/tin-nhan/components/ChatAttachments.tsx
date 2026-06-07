'use client';

// Phase B.5.1 (2026-06-07): tách ChatImage/ChatFile/ChatVoice từ TinNhanClient.tsx (1525 LOC).
// 3 renderer độc lập — không reference state nội bộ TinNhanClient → safe extract.
// KHÔNG đụng chat-notifications.ts (verbatim user constraint).

import { useEffect, useRef, useState } from 'react';
import { ref as storageRef, getDownloadURL } from 'firebase/storage';
import { FileText, Download, Mic, Play, Pause } from 'lucide-react';
import { getFirebaseClientStorage } from '@/lib/firebase/client';
import type { ChatAttachment } from '@/lib/services/chat/api-client';

function fmtSize(n: number): string {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

// ─────────── ChatImage ───────────
export function ChatImage({ attachment }: { attachment: ChatAttachment }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const storage = getFirebaseClientStorage();
        const r = storageRef(storage, attachment.path);
        const u = await getDownloadURL(r);
        if (!cancelled) setUrl(u);
      } catch (e: any) {
        if (!cancelled) setErr(e.message ?? 'Lỗi tải ảnh');
      }
    })();
    return () => { cancelled = true; };
  }, [attachment.path]);

  if (err) return (
    <div className="text-xs text-rose-600 bg-rose-50 ring-1 ring-rose-200 rounded p-2">
      ⚠ {attachment.fileName}: {err}
    </div>
  );
  if (!url) return (
    <div className="bg-slate-100 rounded animate-pulse w-full" style={{ aspectRatio: '4/3', minHeight: 100 }} />
  );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <a href={url} target="_blank" rel="noopener noreferrer" className="block">
      <img src={url} alt={attachment.fileName}
        className="rounded-lg object-cover w-full max-h-72 hover:opacity-90 transition" />
    </a>
  );
}

// ─────────── ChatFile ───────────
export function ChatFile({ attachment, isMine }: { attachment: ChatAttachment; isMine: boolean }) {
  const [url, setUrl] = useState<string | null>(null);

  async function fetchUrl() {
    if (url) return url;
    const storage = getFirebaseClientStorage();
    const r = storageRef(storage, attachment.path);
    const u = await getDownloadURL(r);
    setUrl(u);
    return u;
  }

  async function open() {
    try {
      const u = await fetchUrl();
      window.open(u, '_blank');
    } catch {}
  }

  return (
    <button
      onClick={open}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg ring-1 text-left ${
        isMine
          ? 'bg-emerald-600 text-white ring-emerald-600 hover:bg-emerald-700'
          : 'bg-white text-slate-800 ring-slate-200 hover:bg-slate-50'
      }`}
    >
      <FileText size={18} className={isMine ? 'text-white' : 'text-slate-500'} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{attachment.fileName}</div>
        <div className={`text-[10px] ${isMine ? 'text-emerald-50/80' : 'text-slate-400'}`}>{fmtSize(attachment.size)}</div>
      </div>
      <Download size={14} className={isMine ? 'text-emerald-50' : 'text-slate-400'} />
    </button>
  );
}

// ─────────── ChatVoice ───────────
// Voice player: load downloadURL lazy, play/pause + progress bar + duration.
export function ChatVoice({ attachment, isMine }: { attachment: ChatAttachment; isMine: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const totalSec = attachment.duration ?? 0;

  async function ensureUrl(): Promise<string | null> {
    if (url) return url;
    try {
      const storage = getFirebaseClientStorage();
      const r = storageRef(storage, attachment.path);
      const u = await getDownloadURL(r);
      setUrl(u);
      return u;
    } catch (e: any) { setErr(e?.message ?? 'Lỗi tải'); return null; }
  }

  async function toggle() {
    const u = await ensureUrl();
    if (!u) return;
    let a = audioRef.current;
    if (!a) {
      a = new Audio(u);
      audioRef.current = a;
      a.ontimeupdate = () => {
        if (a!.duration && Number.isFinite(a!.duration)) {
          setProgress(a!.currentTime / a!.duration);
          setCurrentTime(a!.currentTime);
        }
      };
      a.onended = () => { setPlaying(false); setProgress(0); setCurrentTime(0); };
      a.onpause = () => setPlaying(false);
      a.onplay = () => setPlaying(true);
    }
    if (a.paused) { try { await a.play(); } catch (e: any) { setErr(e?.message ?? 'Không play được'); } }
    else a.pause();
  }

  useEffect(() => () => {
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch {}
      audioRef.current = null;
    }
  }, []);

  function fmtTime(s: number): string {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-2xl w-full min-w-0 ${
      isMine ? 'bg-emerald-600 text-white' : 'bg-white text-slate-800 ring-1 ring-slate-200'
    }`}>
      <button onClick={toggle}
        className={`p-1.5 rounded-full shrink-0 ${
          isMine ? 'bg-white/20 hover:bg-white/30' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
        }`}
      >
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <div className="flex-1 min-w-0">
        <div className={`h-1.5 rounded-full overflow-hidden ${isMine ? 'bg-white/30' : 'bg-slate-200'}`}>
          <div className={`h-full ${isMine ? 'bg-white' : 'bg-emerald-600'} transition-all`} style={{ width: `${progress * 100}%` }} />
        </div>
        <div className={`text-[10px] mt-0.5 ${isMine ? 'text-emerald-50/80' : 'text-slate-500'} tabular-nums`}>
          {fmtTime(playing || progress > 0 ? currentTime : totalSec)}
          {totalSec > 0 && ` / ${fmtTime(totalSec)}`}
        </div>
        {err && <div className="text-[10px] text-rose-200 mt-0.5">{err}</div>}
      </div>
      <Mic size={14} className={isMine ? 'text-emerald-50/80' : 'text-slate-400'} />
    </div>
  );
}
