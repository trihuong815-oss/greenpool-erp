'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FlaskConical, Wrench, Users, ListTodo } from 'lucide-react';

const TABS = [
  { route: '/ky-thuat/hoa-chat',  label: 'Hoá chất',     icon: FlaskConical },
  { route: '/ky-thuat/may',       label: 'Vận hành máy', icon: Wrench },
  { route: '/ky-thuat/nhan-su',   label: 'Nhân sự',      icon: Users },
  { route: '/ky-thuat/giao-viec', label: 'Giao việc · Báo cáo · Đề xuất', icon: ListTodo },
];

export function KyThuatSubnav() {
  const pathname = usePathname();
  return (
    <nav className="bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-5 flex gap-1 overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = pathname === t.route || pathname?.startsWith(t.route + '/');
          return (
            <Link
              key={t.route}
              href={t.route}
              className={`relative inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold transition whitespace-nowrap ${
                active
                  ? 'text-cyan-700'
                  : 'text-slate-500 hover:text-cyan-700 hover:bg-cyan-50/50'
              }`}
            >
              <Icon size={15} />
              <span>{t.label}</span>
              {active && <span className="absolute inset-x-1 bottom-0 h-0.5 bg-cyan-600 rounded-t-sm" aria-hidden />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
