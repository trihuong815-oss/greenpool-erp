'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

// V6.4 (2026-06-13): Bottom Sheet filter mobile (spec anh chốt 4 filter chính).

export interface FilterState {
  status: 'all' | 'khoi_tao' | 'dang_xu_ly' | 'dang_phoi_hop' | 'cho_owner_xac_nhan' | 'cho_phe_duyet' | 'hoan_thanh';
  severity: 'all' | 'binh_thuong' | 'khan_cap';
  scope: 'all' | 'trong_khoi' | 'lien_khoi';
  deadline: 'all' | 'overdue' | 'this-week' | 'this-month';
}

export const DEFAULT_FILTER: FilterState = {
  status: 'all', severity: 'all', scope: 'all', deadline: 'all',
};

interface Props {
  open: boolean;
  value: FilterState;
  onChange: (v: FilterState) => void;
  onClose: () => void;
}

const STATUS_OPTIONS: Array<{ k: FilterState['status']; label: string }> = [
  { k: 'all', label: 'Tất cả' },
  { k: 'khoi_tao', label: 'Khởi tạo' },
  { k: 'dang_xu_ly', label: 'Đang xử lý' },
  { k: 'dang_phoi_hop', label: 'Đang phối hợp' },
  { k: 'cho_owner_xac_nhan', label: 'Chờ Owner xác nhận' },
  { k: 'cho_phe_duyet', label: 'Chờ duyệt' },
  { k: 'hoan_thanh', label: 'Hoàn thành' },
];

const SEVERITY_OPTIONS: Array<{ k: FilterState['severity']; label: string; tone: string }> = [
  { k: 'all', label: 'Tất cả', tone: 'bg-slate-100 text-slate-700' },
  { k: 'binh_thuong', label: 'Bình thường', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  { k: 'khan_cap', label: 'Khẩn cấp', tone: 'bg-rose-100 text-rose-700 ring-rose-200' },
];

const SCOPE_OPTIONS: Array<{ k: FilterState['scope']; label: string; tone: string }> = [
  { k: 'all', label: 'Tất cả', tone: 'bg-slate-100 text-slate-700' },
  { k: 'trong_khoi', label: 'Trong khối', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  { k: 'lien_khoi', label: 'Liên khối', tone: 'bg-violet-50 text-violet-700 ring-violet-200' },
];

const DEADLINE_OPTIONS: Array<{ k: FilterState['deadline']; label: string }> = [
  { k: 'all', label: 'Tất cả' },
  { k: 'overdue', label: 'Quá hạn' },
  { k: 'this-week', label: 'Trong tuần này' },
  { k: 'this-month', label: 'Trong tháng này' },
];

export default function FilterSheet({ open, value, onChange, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  function pickStatus(k: FilterState['status']) { onChange({ ...value, status: k }); }
  function pickSeverity(k: FilterState['severity']) { onChange({ ...value, severity: k }); }
  function pickScope(k: FilterState['scope']) { onChange({ ...value, scope: k }); }
  function pickDeadline(k: FilterState['deadline']) { onChange({ ...value, deadline: k }); }

  function reset() { onChange(DEFAULT_FILTER); }

  return (
    <div className="md:hidden fixed inset-0 z-50">
      {/* Backdrop */}
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-fade-in"
        aria-label="Đóng filter"
      />
      {/* Sheet */}
      <div className="absolute left-0 right-0 bottom-0 bg-white rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col animate-slide-up">
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
          <Section title="Trạng thái">
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((o) => (
                <Chip key={o.k} active={value.status === o.k} onClick={() => pickStatus(o.k)}>{o.label}</Chip>
              ))}
            </div>
          </Section>

          <Section title="Mức độ">
            <div className="flex flex-wrap gap-2">
              {SEVERITY_OPTIONS.map((o) => (
                <Chip key={o.k} active={value.severity === o.k} onClick={() => pickSeverity(o.k)}>{o.label}</Chip>
              ))}
            </div>
          </Section>

          <Section title="Phạm vi">
            <div className="flex flex-wrap gap-2">
              {SCOPE_OPTIONS.map((o) => (
                <Chip key={o.k} active={value.scope === o.k} onClick={() => pickScope(o.k)}>{o.label}</Chip>
              ))}
            </div>
          </Section>

          <Section title="Deadline">
            <div className="flex flex-wrap gap-2">
              {DEADLINE_OPTIONS.map((o) => (
                <Chip key={o.k} active={value.deadline === o.k} onClick={() => pickDeadline(o.k)}>{o.label}</Chip>
              ))}
            </div>
          </Section>
        </div>

        <div className="px-5 py-3 border-t border-slate-200 flex gap-3 bg-white pb-[max(env(safe-area-inset-bottom),12px)]">
          <button
            type="button"
            onClick={reset}
            className="flex-1 h-12 rounded-xl border border-slate-300 text-slate-700 font-semibold active:scale-95"
          >
            Đặt lại
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-12 rounded-xl bg-emerald-600 text-white font-semibold shadow active:scale-95"
          >
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
