'use client';

// V6.4 (2026-06-13): 5 tab vuốt ngang mobile, sticky dưới KPI.

export type MobileTabKey = 'all' | 'mine' | 'collab' | 'waiting' | 'overdue';

const TAB_LABEL: Record<MobileTabKey, string> = {
  all: 'Tất cả',
  mine: 'Tôi chủ trì',
  collab: 'Tôi phối hợp',
  waiting: 'Chờ phản hồi',
  overdue: 'Quá hạn',
};

interface Props {
  tab: MobileTabKey;
  counts: Record<MobileTabKey, number>;
  onChange: (k: MobileTabKey) => void;
}

export default function TabsMobile({ tab, counts, onChange }: Props) {
  return (
    <div className="sticky top-0 z-10 -mx-4 px-4 bg-slate-50/90 backdrop-blur border-b border-slate-200 overflow-x-auto scrollbar-hide">
      <div className="flex gap-1 py-2">
        {(['all', 'mine', 'collab', 'waiting', 'overdue'] as MobileTabKey[]).map((k) => {
          const isActive = tab === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => onChange(k)}
              className={
                'shrink-0 px-3.5 py-2 rounded-full text-[13px] font-medium whitespace-nowrap transition active:scale-95 ' +
                (isActive
                  ? 'bg-emerald-600 text-white shadow'
                  : 'bg-white text-slate-700 ring-1 ring-slate-200')
              }
            >
              {TAB_LABEL[k]}{' '}
              <span className={
                'ml-1 inline-flex items-center justify-center min-w-[18px] h-[16px] px-1 rounded-full text-[10px] font-bold tabular-nums ' +
                (isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600')
              }>
                {counts[k]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
