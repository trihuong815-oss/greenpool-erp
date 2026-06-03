'use client';

// UI Checklist v2 — tick "đảm bảo" + ghi chú khi không đảm bảo + nút Gửi.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2, AlertCircle, Loader2, Send, Sun, Sunset, Moon, ClipboardCheck, Clock,
} from 'lucide-react';
import type { ChecklistTemplate, ChecklistRole, ChecklistShift } from '@/lib/checklist-v2/templates';

interface RunItem {
  id: string;
  label: string;
  ok: boolean;
  note: string;
}
interface Run {
  id: string;
  date: string;
  shift: ChecklistShift;
  role: ChecklistRole;
  branchId: string | null;
  ownerId: string;
  templateId: string;
  items: RunItem[];
  status: 'draft' | 'submitted';
  submittedAt: string | null;
}

interface Props {
  role: ChecklistRole;
  templates: ChecklistTemplate[];
  date: string;
  activeShift: ChecklistShift;
  branchId: string | null;
  branchName: string | null;
  displayName: string;
}

const SHIFT_ICON: Record<ChecklistShift, typeof Sun> = {
  morning: Sun,
  afternoon: Sunset,
  evening: Moon,
};

export function ChecklistV2Client({
  role, templates, date, activeShift, branchId, branchName, displayName,
}: Props) {
  const router = useRouter();
  const [shift, setShift] = useState<ChecklistShift>(activeShift);
  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Guard null deref: nếu template thiếu thì fallback safe defaults thay vì crash
  const currentTemplate = templates.find((t) => t.shift === shift) ?? {
    shift,
    deadlineHour: 23,
    deadlineMinute: 59,
    items: [] as any[],
  } as (typeof templates)[number];

  function showToast(t: 'success' | 'error', msg: string) {
    setToast({ type: t, msg });
    setTimeout(() => setToast(null), 4000);
  }

  async function loadRun(s: ChecklistShift) {
    setLoading(true);
    try {
      const res = await fetch(`/api/checklist-v2?date=${date}&shift=${s}`, { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? 'Lỗi tải');
      setRun(j.run);
    } catch (e: any) {
      showToast('error', e.message);
      setRun(null);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { loadRun(shift); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [shift]);

  function changeShift(s: ChecklistShift) {
    setShift(s);
    const params = new URLSearchParams({ shift: s });
    router.replace(`/checklist-v2?${params.toString()}`);
  }

  function setItem(id: string, patch: Partial<RunItem>) {
    if (!run) return;
    setRun({ ...run, items: run.items.map((it) => it.id === id ? { ...it, ...patch } : it) });
  }

  async function save(itemsOverride?: RunItem[]) {
    if (!run) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/checklist-v2?id=${encodeURIComponent(run.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsOverride ?? run.items }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? 'Lỗi lưu');
    } catch (e: any) {
      showToast('error', e.message);
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    if (!run) return;
    // Bắt buộc: mỗi item phải hoặc "đảm bảo" (ok=true) hoặc "có ghi chú" (note != '')
    const incomplete = run.items.filter((it) => !it.ok && !it.note.trim());
    if (incomplete.length > 0) {
      showToast('error', `Còn ${incomplete.length} mục chưa tick "đảm bảo" hoặc chưa ghi chú`);
      return;
    }
    if (!confirm('Gửi checklist này lên cấp trên? Sau khi gửi sẽ không sửa được nữa.')) return;
    setSubmitting(true);
    try {
      // Lưu items trước
      await save(run.items);
      // Submit
      const res = await fetch(`/api/checklist-v2?id=${encodeURIComponent(run.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'submitted' }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? 'Lỗi gửi');
      showToast('success', '✅ Đã gửi checklist — cấp trên sẽ nhận thông báo');
      await loadRun(shift);
    } catch (e: any) {
      showToast('error', e.message);
    } finally {
      setSubmitting(false);
    }
  }

  const completed = run?.items.filter((it) => it.ok || it.note.trim()).length ?? 0;
  const total = run?.items.length ?? 0;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const isSubmitted = run?.status === 'submitted';

  // Reminder: tick mỗi 30s → tự update minutes-to-deadline.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const tid = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tid);
  }, []);
  const minutesToDeadline = useMemo(() => {
    if (!run || isSubmitted) return null;
    const [y, m, d] = date.split('-').map(Number);
    if (!y || !m || !d) return null;
    const dl = new Date(y, m - 1, d, currentTemplate.deadlineHour, currentTemplate.deadlineMinute, 0, 0);
    return Math.floor((dl.getTime() - now) / 60_000);
  }, [run, isSubmitted, date, currentTemplate.deadlineHour, currentTemplate.deadlineMinute, now]);
  const showReminder = minutesToDeadline !== null && minutesToDeadline <= 15 && minutesToDeadline > -60;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Header user info */}
      <div className="card flex items-center gap-3 flex-wrap">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
          <ClipboardCheck size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-slate-800">{displayName}</div>
          <div className="text-xs text-slate-500">
            {role === 'QLCS' && branchName ? `Cơ sở ${branchName}` : ''}
            {role === 'PP_HT' && 'Phụ trách 5 cơ sở · Hệ thống'}
            {role === 'PP_XLN' && 'Phụ trách 5 cơ sở · Xử lý nước'}
            {' · '}{date}
          </div>
        </div>
        <div className="text-xs text-slate-500 inline-flex items-center gap-1">
          <Clock size={12} />
          Deadline {currentTemplate.deadlineHour}:{String(currentTemplate.deadlineMinute).padStart(2, '0')}
        </div>
      </div>

      {/* Shift selector */}
      <div className="flex items-center gap-2 flex-wrap">
        {templates.map((t) => {
          const Icon = SHIFT_ICON[t.shift];
          const isActive = t.shift === shift;
          return (
            <button
              key={t.shift}
              onClick={() => changeShift(t.shift)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg ring-1 transition text-sm font-semibold ${
                isActive
                  ? 'bg-emerald-50 text-emerald-800 ring-emerald-300'
                  : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
              }`}
            >
              <Icon size={14} />
              {t.shiftLabel.replace(/Checklist /, '')}
            </button>
          );
        })}
      </div>

      {/* Deadline reminder — chỉ hiện khi ≤15 phút trước hạn (hoặc đã quá hạn ≤60 phút) */}
      {showReminder && minutesToDeadline !== null && (
        <div className={`rounded-xl px-4 py-3 ring-1 flex items-center gap-3 ${
          minutesToDeadline < 0
            ? 'bg-rose-50 ring-rose-300 text-rose-900'
            : minutesToDeadline <= 5
              ? 'bg-rose-50 ring-rose-300 text-rose-900'
              : 'bg-amber-50 ring-amber-300 text-amber-900'
        }`}>
          <Clock size={18} className="shrink-0" />
          <div className="flex-1 text-sm font-semibold">
            {minutesToDeadline < 0
              ? <>Đã quá hạn {Math.abs(minutesToDeadline)} phút — hãy gửi ngay!</>
              : minutesToDeadline === 0
                ? <>Đến giờ deadline rồi — gửi ngay!</>
                : <>Còn {minutesToDeadline} phút đến deadline {currentTemplate.deadlineHour}:{String(currentTemplate.deadlineMinute).padStart(2, '0')} — nhanh tay nào!</>}
          </div>
          <div className="text-xs">
            {completed}/{total} mục
          </div>
        </div>
      )}

      {/* Progress */}
      {run && !loading && (
        <div className="card">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-sm font-semibold text-slate-700">Tiến độ ca này</div>
            <div className="text-sm font-bold tabular-nums">
              {completed}/{total}
              <span className="ml-2 text-emerald-700">({pct}%)</span>
            </div>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-600' : 'bg-cyan-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {isSubmitted && (
            <div className="mt-2 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
              <CheckCircle2 size={12} /> Đã gửi · {run.submittedAt?.slice(11, 16)}
            </div>
          )}
        </div>
      )}

      {/* Items */}
      {loading ? (
        <div className="card text-center py-12 text-slate-400">
          <Loader2 size={24} className="mx-auto animate-spin mb-2" />
          Đang tải…
        </div>
      ) : !run ? (
        <div className="card text-center py-12 text-rose-600">Không tải được checklist</div>
      ) : (
        <div className="space-y-2">
          {run.items.map((it) => (
            <ItemRow
              key={it.id}
              item={it}
              disabled={isSubmitted}
              onChange={(patch) => setItem(it.id, patch)}
              onBlur={() => save()}
            />
          ))}
        </div>
      )}

      {/* Sticky submit bar */}
      {run && !isSubmitted && (
        <div className="sticky bottom-3 card flex items-center justify-between gap-3 ring-2 ring-emerald-300 shadow-lg">
          <div className="text-xs text-slate-600">
            {pct === 100
              ? '✅ Tất cả mục đã có trạng thái → có thể gửi'
              : `Còn ${total - completed} mục cần xử lý`}
          </div>
          <button
            onClick={submit}
            disabled={submitting || pct < 100}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-lg bg-gradient-to-r from-emerald-600 to-teal-700 text-white shadow-sm hover:shadow-md disabled:opacity-50"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Gửi checklist
          </button>
        </div>
      )}

      {/* Toast */}
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

// ─────────── ItemRow ───────────
function ItemRow({
  item, disabled, onChange, onBlur,
}: {
  item: RunItem;
  disabled: boolean;
  onChange: (patch: Partial<RunItem>) => void;
  onBlur: () => void;
}) {
  const isOK = item.ok;
  const hasNote = item.note.trim().length > 0;
  const isDone = isOK || hasNote;
  return (
    <div className={`card transition ${
      isOK ? 'ring-1 ring-emerald-200 bg-emerald-50/30' :
      hasNote ? 'ring-1 ring-amber-200 bg-amber-50/30' : ''
    }`}>
      <div className="flex items-start gap-3">
        {/* Checkbox đảm bảo */}
        <button
          onClick={() => onChange({ ok: !item.ok, note: !item.ok ? '' : item.note })}
          disabled={disabled}
          className={`mt-0.5 h-6 w-6 rounded border-2 shrink-0 flex items-center justify-center transition ${
            isOK
              ? 'border-emerald-600 bg-emerald-600 text-white'
              : 'border-slate-300 bg-white hover:border-emerald-400'
          } disabled:opacity-50`}
          title={isOK ? 'Bỏ tick' : 'Đánh dấu đảm bảo'}
        >
          {isOK && <CheckCircle2 size={14} />}
        </button>
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium ${isOK ? 'text-emerald-800' : 'text-slate-800'}`}>
            {item.label}
          </div>
          {!isOK && (
            <textarea
              value={item.note}
              onChange={(e) => onChange({ note: e.target.value })}
              onBlur={onBlur}
              disabled={disabled}
              placeholder="Nếu KHÔNG đảm bảo, viết ghi chú lý do… (vd. 'Máy lọc số 2 chưa được kiểm tra')"
              rows={2}
              maxLength={1000}
              className={`mt-2 w-full px-3 py-2 text-sm border rounded resize-none focus:outline-none transition ${
                hasNote
                  ? 'border-amber-300 bg-white focus:border-amber-500'
                  : 'border-slate-200 bg-white focus:border-slate-400'
              } disabled:bg-slate-100`}
            />
          )}
        </div>
        {/* Status badge */}
        <div className="shrink-0">
          {isOK ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
              ✓ ĐẢM BẢO
            </span>
          ) : hasNote ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">
              ⚠ CÓ GHI CHÚ
            </span>
          ) : (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-semibold">
              CHƯA CHECK
            </span>
          )}
          {isDone && <div className="text-[9px] text-slate-400 text-right mt-0.5">{isOK ? '' : ''}</div>}
        </div>
      </div>
    </div>
  );
}
