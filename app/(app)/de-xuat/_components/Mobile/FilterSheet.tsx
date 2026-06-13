'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

// V6.4 (2026-06-13): Bottom Sheet filter cho /de-xuat.

export interface FilterState {
  kind: 'all' | 'van_hanh' | 'du_an' | 'cai_tien';
  scope: 'all' | 'trong_khoi' | 'lien_khoi';
}

export const DEFAULT_FILTER: FilterState = { kind: 'all', scope: 'all' };

interface Props {
  open: boolean;
  value: FilterState;
  onChange: (v: FilterState) => void;
  onClose: () => void;
}

const KIND_OPTIONS: Array<{ k: FilterState['kind']; label: string; tone: string }> = [
  { k: 'all', label: 'Tất cả', tone: 'bg-slate-100 text-slate-700' },
  { k: 'van_hanh', label: 'Vận hành', tone: 'bg-sky-50 text-sky-700 ring-sky-200' },
  { k: 'du_an', label: 'Dự án', tone: 'bg-violet-50 text-violet-700 ring-violet-200' },
  { k: 'cai_tien', label: 'Cải tiến', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
];

const SCOPE_OPTIONS: Array<{ k: FilterState['scope']; label: string }> = [
  { k: 'all', label: 'Tất cả' },
  { k: 'trong_khoi', label: 'Trong khối' },
  { k: 'lien_khoi', label: 'Liên khối' },
];

export default function FilterSheet({ open, value, onChange, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="md:hidden fixed inset-0 z-50">
      <button type="button" onClick={onClose} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" aria-label="Đóng filter" />
      <div className="absolute left-0 right-0 bottom-0 bg-white rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col">
        <div className="px-5 pt-3 pb-2 flex items-center justify-center">
          <span className="block w-10 h-1.5 bg-slate-300 rounded-full" />
        </div>
        <div className="px-5 pb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">Bộ lọc</h3>
          <button type="button" onClick={onClose} className="p-2 -mr-2 rounded-full hover:bg-slate-100 active:scale-95">
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 pb-4 space-y-5">
          <Section title="Loại đề xuất">
            <div className="flex flex-wrap gap-2">
              {KIND_OPTIONS.map((o) => (
                <Chip key={o.k} active={value.kind === o.k} onClick={() => onChange({ ...value, kind: o.k })}>{o.label}</Chip>
              ))}
            </div>
          </Section>

          <Section title="Phạm vi">
            <div className="flex flex-wrap gap-2">
              {SCOPE_OPTIONS.map((o) => (
                <Chip key={o.k} active={value.scope === o.k} onClick={() => onChange({ ...value, scope: o.k })}>{o.label}</Chip>
              ))}
            </div>
          </Section>
        </div>

        <div className="px-5 py-3 border-t border-slate-200 flex gap-3 bg-white pb-[max(env(safe-area-inset-bottom),12px)]">
          <button type="button" onClick={() => onChange(DEFAULT_FILTER)} className="flex-1 h-12 rounded-xl border border-slate-300 text-slate-700 font-semibold active:scale-95">
            Đặt lại
          </button>
          <button type="button" onClick={onClose} className="flex-1 h-12 rounded-xl bg-emerald-600 text-white font-semibold shadow active:scale-95">
            Áp dụng
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[12px] font-bold uppercase tracking-wider text-slate-500 mb-2">{title}</div>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'px-3.5 py-2 rounded-full text-sm font-medium ring-1 ring-inset transition active:scale-95 ' +
        (active ? 'bg-emerald-600 text-white ring-emerald-700 shadow' : 'bg-white text-slate-700 ring-slate-200')
      }
    >
      {children}
    </button>
  );
}
