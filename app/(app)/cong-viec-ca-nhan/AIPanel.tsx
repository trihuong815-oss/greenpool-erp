'use client';

// Tab AI cá nhân — chat với coach AI theo role. KHÔNG team chat, KHÔNG dùng cho giao việc.

import { useEffect, useRef, useState } from 'react';
import { Sparkles, Send, Loader2, History, Briefcase, Heart, BookOpen, Compass, MessageCircle } from 'lucide-react';

type Category = 'work' | 'life' | 'learning' | 'strategy';

interface AILog {
  id: string;
  question: string;
  answer: string;
  category: Category;
  provider: string;
  createdAt: string | null;
}

const CATEGORY_META: Record<Category, { label: string; Icon: typeof Briefcase; color: string; placeholder: string }> = {
  work:     { label: 'Công việc',  Icon: Briefcase, color: 'cyan',    placeholder: 'VD: Cách ưu tiên 10 task gấp trong tuần này?' },
  life:     { label: 'Đời sống',   Icon: Heart, color: 'rose',        placeholder: 'VD: Tôi đang stress vì OT quá nhiều, làm sao cân bằng?' },
  learning: { label: 'Học tập',    Icon: BookOpen, color: 'violet',   placeholder: 'VD: Tôi muốn học quản trị tài chính trong 3 tháng — lộ trình?' },
  strategy: { label: 'Chiến lược', Icon: Compass, color: 'emerald',   placeholder: 'VD: Mô hình tăng trưởng cho cụm 5 cơ sở pool 2026?' },
};

const SUGGESTED_QUESTIONS: Record<Category, string[]> = {
  work: [
    'Tôi có 12 task tuần này, làm sao ưu tiên?',
    'Cách xử lý xung đột giữa 2 phòng ban?',
    'Hôm nay tôi nên tập trung vào 3 việc nào?',
  ],
  life: [
    'Buổi sáng làm gì để có năng lượng cả ngày?',
    'Quản lý stress khi nhiều deadline cùng lúc?',
    'Cân bằng giữa công việc và gia đình?',
  ],
  learning: [
    'Sách quản trị nào nên đọc cho lãnh đạo vận hành?',
    'Tôi muốn cải thiện kỹ năng phân tích — bắt đầu từ đâu?',
    'Lộ trình học OKR trong 30 ngày?',
  ],
  strategy: [
    'Đo lường hiệu suất 5 cơ sở thế nào cho công bằng?',
    'Khi nào nên mở rộng cơ sở thứ 6?',
    'Cách xây dựng KPI cho phòng kỹ thuật?',
  ],
};

interface ProfileForAI {
  displayName: string;
  roleName: string | null;
  roleCode: string;
}

export function AIPanel({ profile, onToast }: {
  profile: ProfileForAI;
  onToast: (t: 'success' | 'error', m: string) => void;
}) {
  const [category, setCategory] = useState<Category>('work');
  const [question, setQuestion] = useState('');
  const [thinking, setThinking] = useState(false);
  const [currentAnswer, setCurrentAnswer] = useState<{ question: string; answer: string; provider: string } | null>(null);
  const [history, setHistory] = useState<AILog[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function loadHistory() {
    try {
      const res = await fetch('/api/personal/ai/logs', { cache: 'no-store' });
      const j = await res.json();
      if (res.ok) setHistory(j.rows ?? []);
    } catch { /* silent */ }
  }
  useEffect(() => { loadHistory(); }, []);

  async function ask() {
    const q = question.trim();
    if (!q) return;
    setThinking(true);
    setCurrentAnswer(null);
    try {
      const res = await fetch('/api/personal/ai/ask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, category }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? 'Lỗi AI');
      setCurrentAnswer({ question: q, answer: j.answer, provider: j.provider });
      setQuestion('');
      loadHistory();
    } catch (e: any) {
      onToast('error', e.message);
    } finally { setThinking(false); }
  }

  const m = CATEGORY_META[category];
  const Icon = m.Icon;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="rounded-xl ring-1 ring-violet-200 bg-gradient-to-br from-violet-50 via-white to-pink-50 p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg p-2 bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow shrink-0">
            <Sparkles size={20} />
          </div>
          <div className="flex-1">
            <div className="font-bold text-slate-800 inline-flex items-center gap-2">
              Trợ lý AI cá nhân
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 font-semibold">
                Beta · {profile.roleName ?? profile.roleCode}
              </span>
            </div>
            <div className="text-xs text-slate-600 mt-0.5">
              Cố vấn riêng, không chia sẻ với team. Đặt câu hỏi về công việc, học tập, chiến lược, đời sống.
            </div>
          </div>
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-white ring-1 ring-violet-200 text-violet-700 hover:bg-violet-50"
          >
            <History size={13} /> Lịch sử ({history.length})
          </button>
        </div>
      </div>

      {/* Category picker */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {(Object.keys(CATEGORY_META) as Category[]).map((c) => {
          const cm = CATEGORY_META[c];
          const I = cm.Icon;
          return (
            <button key={c} onClick={() => setCategory(c)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold ring-1 transition ${
                category === c
                  ? `bg-${cm.color}-50 text-${cm.color}-800 ring-${cm.color}-300`
                  : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
              }`}>
              <I size={12} /> {cm.label}
            </button>
          );
        })}
      </div>

      {/* Suggested questions */}
      {!currentAnswer && (
        <div className="card">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Gợi ý câu hỏi</div>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS[category].map((q, i) => (
              <button key={i}
                onClick={() => { setQuestion(q); textareaRef.current?.focus(); }}
                className="text-xs text-left px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 ring-1 ring-slate-200 transition"
              >
                💬 {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Current answer */}
      {currentAnswer && (
        <div className="space-y-2">
          <div className="card bg-slate-50">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Bạn hỏi</div>
            <div className="text-sm text-slate-800 whitespace-pre-wrap">{currentAnswer.question}</div>
          </div>
          <div className="card ring-1 ring-violet-100 bg-gradient-to-br from-white to-violet-50/30">
            <div className="text-[10px] font-bold uppercase tracking-wider text-violet-700 mb-2 inline-flex items-center gap-1">
              <Sparkles size={11} /> AI trả lời {currentAnswer.provider !== 'fallback' && <span className="text-slate-400">· {currentAnswer.provider}</span>}
            </div>
            <div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{currentAnswer.answer}</div>
          </div>
          <button onClick={() => setCurrentAnswer(null)} className="text-xs text-emerald-700 hover:underline">
            ← Đặt câu hỏi khác
          </button>
        </div>
      )}

      {/* Ask box */}
      <div className="card sticky bottom-3 ring-2 ring-violet-200">
        <div className="flex items-end gap-2">
          <Icon size={18} className={`text-${m.color}-600 mb-2 shrink-0`} />
          <textarea
            ref={textareaRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) ask(); }}
            placeholder={m.placeholder}
            rows={2}
            maxLength={5000}
            className="flex-1 px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:border-violet-400"
          />
          <button
            onClick={ask}
            disabled={!question.trim() || thinking}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:shadow-lg text-white disabled:opacity-50"
          >
            {thinking ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {thinking ? 'Đang nghĩ…' : 'Hỏi AI'}
          </button>
        </div>
        <div className="text-[10px] text-slate-400 mt-1">Ctrl/⌘ + Enter để gửi nhanh · AI là gợi ý, hãy dùng tư duy của bạn để ra quyết định cuối.</div>
      </div>

      {/* History */}
      {showHistory && (
        <div className="card">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 inline-flex items-center gap-1">
            <History size={11} /> Lịch sử trao đổi
          </div>
          {history.length === 0 ? (
            <div className="text-sm text-slate-400 text-center py-4">Chưa có cuộc trao đổi nào</div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {history.map((h) => (
                <details key={h.id} className="rounded-lg ring-1 ring-slate-200 bg-white">
                  <summary className="px-3 py-2 cursor-pointer text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <MessageCircle size={12} className="text-slate-400" />
                    <span className="flex-1 truncate">{h.question}</span>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {h.createdAt ? new Date(h.createdAt).toLocaleDateString('vi-VN') : ''}
                    </span>
                  </summary>
                  <div className="px-3 py-2 border-t border-slate-100 bg-slate-50/50 text-sm text-slate-700 whitespace-pre-wrap">
                    {h.answer}
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="text-[11px] text-slate-400 text-center">
        🔒 AI logs của bạn riêng tư. Admin/CEO KHÔNG đọc được nội dung trao đổi.
      </div>
    </div>
  );
}
