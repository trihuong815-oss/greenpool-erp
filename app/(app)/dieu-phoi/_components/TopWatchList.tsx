'use client';

import { ClipboardList, Users, FileText, LucideIcon } from 'lucide-react';

type WatchItem = {
  title: string;
  waitingPerson: string;
  content: string;
  days: number;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
};

const ITEMS: WatchItem[] = [
  {
    title: 'Mở lớp hè Linh Đàm',
    waitingPerson: 'TP Marketing',
    content: 'Banner tuyển sinh',
    days: 2,
    icon: ClipboardList,
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-700',
  },
  {
    title: 'Tuyển HLV mới - cần phê duyệt',
    waitingPerson: 'TP Marketing',
    content: 'Xác nhận số lượng HLV',
    days: 3,
    icon: Users,
    iconBg: 'bg-sky-100',
    iconColor: 'text-sky-700',
  },
  {
    title: 'Duyệt ngân sách Marketing Q3',
    waitingPerson: 'GĐ Văn phòng',
    content: 'Phê duyệt chi phí',
    days: 1,
    icon: FileText,
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-700',
  },
];

export default function TopWatchList() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between bg-amber-50/60 px-4 py-2.5 border-b border-amber-100">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
          Top việc cần quan tâm
        </h3>
        <button
          type="button"
          className="text-xs text-emerald-600 hover:text-emerald-700 hover:underline"
        >
          Xem tất cả
        </button>
      </div>

      <div>
        {ITEMS.map((item, idx) => {
          const Icon = item.icon;
          return (
            <div
              key={idx}
              className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 border-b border-slate-100 last:border-0 transition-colors"
            >
              <div className={`rounded-lg ${item.iconBg} p-2.5 shrink-0`}>
                <Icon size={18} className={item.iconColor} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-slate-800 truncate">
                  {item.title}
                </div>
                <div className="text-xs text-slate-600 mt-0.5">
                  Đang chờ:{' '}
                  <span className="font-medium">{item.waitingPerson}</span>
                </div>
                <div className="text-xs text-slate-500 truncate">
                  Nội dung: {item.content}
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="text-2xl font-bold tabular-nums text-slate-800 leading-none">
                  {item.days}
                </div>
                <div className="text-[10px] text-slate-500 uppercase mt-1">
                  ngày
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
