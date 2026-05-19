'use client';

import type { Facility, Task } from '@/lib/types';

interface Props {
  roleCode: string;
  facilities: Facility[];
  tasks: Task[];
  visibleFacilities: string[];
  isAdmin: boolean;
}

export function DashboardContent({ roleCode, facilities, tasks, visibleFacilities, isAdmin }: Props) {
  // KPIs
  const totalTasks = tasks.length;
  const highPriority = tasks.filter(t => t.priority === 'high').length;
  const inProgress = tasks.filter(t => t.status === 'in_progress').length;

  return (
    <div>
      <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <div className="font-semibold text-slate-800">
          {isAdmin ? 'Toàn cụm 5 cơ sở' : visibleFacilities.length > 0 ? `Cơ sở của bạn` : 'Phạm vi cá nhân'}
        </div>
        <div className="text-sm text-slate-600 mt-1">
          Vai trò: <strong>{roleCode}</strong> · {visibleFacilities.length} cơ sở trong phạm vi
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-4">
        <div className="kpi-card border-l-4 border-blue-700">
          <div className="kpi-label">Việc đang xử lý</div>
          <div className="kpi-value">{totalTasks}</div>
          <div className="kpi-sub">Tổng số task chưa xong</div>
        </div>
        <div className="kpi-card border-l-4 border-rose-700">
          <div className="kpi-label">Việc khẩn</div>
          <div className="kpi-value">{highPriority}</div>
          <div className="kpi-sub">Ưu tiên cao</div>
        </div>
        <div className="kpi-card border-l-4 border-amber-600">
          <div className="kpi-label">Đang triển khai</div>
          <div className="kpi-value">{inProgress}</div>
          <div className="kpi-sub">In progress</div>
        </div>
        <div className="kpi-card border-l-4 border-emerald-700">
          <div className="kpi-label">Cơ sở</div>
          <div className="kpi-value">{visibleFacilities.length}</div>
          <div className="kpi-sub">{isAdmin ? 'Toàn cụm' : 'Phạm vi của bạn'}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="card">
          <div className="card-title">Việc cần xử lý gần nhất</div>
          {tasks.length === 0 ? (
            <div className="text-sm text-slate-500 italic py-6 text-center">Chưa có việc nào</div>
          ) : (
            <div className="space-y-2">
              {tasks.slice(0, 5).map(t => (
                <div key={t.id} className="p-2 hover:bg-slate-50 rounded text-sm">
                  <div className="font-medium text-slate-800">{t.title}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {t.deadline && `Hạn: ${t.deadline}`} · {t.priority === 'high' ? '🔴 Khẩn' : t.priority === 'medium' ? '🟡 TB' : '🟢 Thấp'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">Cơ sở trong phạm vi</div>
          <div className="space-y-2">
            {facilities.filter(f => visibleFacilities.includes(f.id)).map(f => (
              <div key={f.id} className="p-3 rounded-lg border border-slate-200 hover:shadow-sm transition">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold" style={{ background: f.color }}>
                    {f.id}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-slate-800">{f.name}</div>
                    <div className="text-xs text-slate-500">{f.address}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
