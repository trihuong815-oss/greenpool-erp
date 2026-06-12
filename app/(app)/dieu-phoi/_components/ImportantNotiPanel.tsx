'use client';

import { AlertTriangle, CheckCircle, CheckCircle2, MessageSquare } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type ColorKey = 'rose' | 'amber' | 'sky' | 'emerald';

type NotiItem = {
  time: string;
  icon: LucideIcon;
  color: ColorKey;
  title: string;
  sub: string;
};

const ITEMS: NotiItem[] = [
  {
    time: '09:15',
    icon: AlertTriangle,
    color: 'rose',
    title: 'Mở lớp hè Linh Đàm đang quá hạn 1 ngày',
    sub: 'Đang chờ: TP Marketing',
  },
  {
    time: '10:00',
    icon: CheckCircle,
    color: 'amber',
    title: 'Tuyển HLV mới - cần phê duyệt',
    sub: 'Đang chờ: GĐ Văn phòng',
  },
  {
    time: '10:00',
    icon: MessageSquare,
    color: 'sky',
    title: 'TP Đào tạo đã phản hồi',
    sub: 'Tuyển đơn gì',
  },
  {
    time: '10:00',
    icon: CheckCircle2,
    color: 'emerald',
    title: 'QLCS Hoàng Mai đã hoàn thành',
    sub: 'Chuẩn bị cơ sở vật chất',
  },
];

const ICON_BG: Record<ColorKey, string> = {
  rose: 'bg-rose-100',
  amber: 'bg-amber-100',
  sky: 'bg-sky-100',
  emerald: 'bg-emerald-100',
};

const ICON_TEXT: Record<ColorKey, string> = {
  rose: 'text-rose-600',
  amber: 'text-amber-600',
  sky: 'text-sky-600',
  emerald: 'text-emerald-600',
};

export default function ImportantNotiPanel() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between bg-sky-50/60 px-4 py-2.5 border-b border-sky-100">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-sky-700">
          Thông báo quan trọng
        </h3>
        <button
          type="button"
          className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
        >
          Xem tất cả
        </button>
      </div>

      <ul>
        {ITEMS.map((item, idx) => {
          const Icon = item.icon;
          return (
            <li
              key={idx}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 border-b border-slate-100 last:border-0 text-sm"
            >
              <div
                className={`w-9 h-9 rounded-full ${ICON_BG[item.color]} flex items-center justify-center shrink-0`}
              >
                <Icon size={15} className={ICON_TEXT[item.color]} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-slate-400 tabular-nums">{item.time}</div>
                <div className="text-sm font-medium text-slate-800 truncate">{item.title}</div>
                <div className="text-xs text-slate-500 truncate">{item.sub}</div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
