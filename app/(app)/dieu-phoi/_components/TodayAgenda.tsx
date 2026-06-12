'use client';

import { useState } from 'react';

type DotColor = 'emerald' | 'amber' | 'violet' | 'sky';

type AgendaItem = {
  time: string;
  title: string;
  who: string;
  dot: DotColor;
};

const AGENDA: AgendaItem[] = [
  {
    time: '09:00',
    title: 'Họp điều phối mở lớp hè Linh Đàm',
    who: 'TP Đào tạo',
    dot: 'emerald',
  },
  {
    time: '10:30',
    title: 'Phê duyệt đề xuất tuyển dụng HLV',
    who: 'TP Nhân sự',
    dot: 'amber',
  },
  {
    time: '14:00',
    title: 'Họp kỹ thuật vận hành bể',
    who: 'TP Kỹ thuật',
    dot: 'violet',
  },
  {
    time: '15:30',
    title: 'Rà soát ngân sách Marketing Q3',
    who: 'TP Marketing',
    dot: 'sky',
  },
];

const DOT_BG: Record<DotColor, string> = {
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  violet: 'bg-violet-500',
  sky: 'bg-sky-500',
};

type TabKey = 'agenda' | 'docs';

export default function TodayAgenda() {
  const [tab, setTab] = useState<TabKey>('agenda');

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex border-b border-slate-200">
        <button
          type="button"
          onClick={() => setTab('agenda')}
          className={`flex-1 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${
            tab === 'agenda'
              ? 'text-emerald-700 border-b-2 border-emerald-500 bg-emerald-50/40'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Lịch hôm nay
        </button>
        <button
          type="button"
          onClick={() => setTab('docs')}
          className={`flex-1 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${
            tab === 'docs'
              ? 'text-emerald-700 border-b-2 border-emerald-500 bg-emerald-50/40'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Tài liệu mới
        </button>
      </div>

      {tab === 'agenda' ? (
        <ul>
          {AGENDA.map((item, idx) => (
            <li
              key={idx}
              className="flex gap-3 px-4 py-2.5 hover:bg-slate-50 border-b border-slate-100 last:border-0"
            >
              <span
                className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${DOT_BG[item.dot]}`}
                aria-hidden="true"
              />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-slate-500 tabular-nums">{item.time}</div>
                <div className="text-sm font-medium text-slate-800 truncate">{item.title}</div>
                <div className="text-xs text-slate-500 truncate">{item.who}</div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-4 py-8 text-center text-xs text-slate-400">
          Chưa có tài liệu mới
        </div>
      )}

      <button
        type="button"
        className="w-full border-t border-slate-100 py-2.5 text-xs text-emerald-600 font-medium hover:bg-emerald-50"
      >
        Xem lịch đầy đủ →
      </button>
    </div>
  );
}
