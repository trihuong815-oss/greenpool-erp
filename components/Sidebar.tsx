'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { MENU_PERMISSIONS } from '@/lib/permissions';
import { supabase } from '@/lib/supabase/client';
import {
  Home, BarChart3, CheckSquare, FileText, ListTodo,
  Users, DollarSign, FileBarChart, GraduationCap, Megaphone, Settings, LogOut
} from 'lucide-react';

const ALL_ITEMS = [
  { route: 'dashboard',         label: 'Dashboard',          icon: Home },
  { route: 'doanh-so',          label: 'Doanh số',           icon: BarChart3 },
  { route: 'checklist',         label: 'Checklist vận hành', icon: CheckSquare },
  { route: 'quy-trinh',         label: 'Quy trình vận hành phòng ban', icon: FileText },
  { route: 'giao-viec',         label: 'Đề xuất · Nhiệm vụ · Giao việc', icon: ListTodo },
  { route: 'sodo',              label: 'Sơ đồ tổ chức',      icon: Users },
  { route: 'luong',             label: 'Lương 3P & KPI',     icon: DollarSign },
  { route: 'bao-cao',           label: 'Báo cáo tự động',    icon: FileBarChart },
  { route: 'daotao',            label: 'Đào tạo (API)',      icon: GraduationCap },
  { route: 'mkt',               label: 'Marketing (API)',    icon: Megaphone },
  { route: 'settings-packages', label: 'Quản lý gói dịch vụ', icon: Settings, divider: true },
];

interface SidebarProps {
  userName: string;
  userRole: string;
  roleCode: string;
}

export function Sidebar({ userName, userRole, roleCode }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const allowed = MENU_PERMISSIONS[roleCode] || ['dashboard'];
  const visibleItems = ALL_ITEMS.filter(item => allowed.includes(item.route));

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  const initials = userName.split(' ').slice(-2).map(w => w[0]).join('');

  return (
    <aside className="w-64 bg-slate-900 text-white flex flex-col h-screen sticky top-0">
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="Green Pool" className="w-10 h-10 bg-white rounded-lg p-0.5" />
          <div>
            <div className="font-bold text-sm">Green Pool</div>
            <div className="text-xs text-slate-400">ERP v1.0</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {visibleItems.map((item, idx) => {
          const Icon = item.icon;
          const isActive = pathname === `/${item.route}` || pathname.startsWith(`/${item.route}/`);
          return (
            <div key={item.route}>
              {item.divider && idx > 0 && <div className="my-3 border-t border-slate-700" />}
              <Link
                href={`/${item.route}`}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                  isActive
                    ? 'bg-gradient-to-r from-blue-700 to-blue-900 text-white'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </Link>
            </div>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-700">
        <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-800">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-sm font-bold">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{userName}</div>
            <div className="text-xs text-slate-400 truncate">{userRole}</div>
          </div>
          <button onClick={handleLogout} title="Đăng xuất" className="text-slate-400 hover:text-white">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
