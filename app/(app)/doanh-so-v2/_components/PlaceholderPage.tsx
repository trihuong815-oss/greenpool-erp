// Phase 0 (2026-06-16): placeholder cho 4 route module Doanh số v2.
// Phase 1+ sẽ thay từng file bằng client component thực.

import { canAccessRoute } from '@/lib/permissions';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { AppTopBar } from '@/components/AppTopBar';

interface Props {
  /** Route key đã đăng ký trong MENU_PERMISSIONS — vd 'doanh-so-v2/nhap'. */
  routeKey: string;
  /** Tiêu đề hiển thị trên TopBar + thân page. */
  title: string;
  /** Mô tả ngắn dưới tiêu đề — explain page làm gì. */
  description: string;
  /** Phase nào sẽ build chức năng — chỉ để info cho dev/anh test. */
  phaseLabel?: string;
}

export default async function PlaceholderPage({ routeKey, title, description, phaseLabel }: Props) {
  const { profile } = await requireAuthedProfile();

  if (!canAccessRoute(profile.roleCode, routeKey, profile.menuOverrides)) {
    return (
      <>
        <AppTopBar title={title} icon="task" />
        <div className="flex-1 flex items-center justify-center p-3 md:p-6 bg-slate-50">
          <div className="card text-center py-12 max-w-md">
            <div className="text-5xl mb-4">🔒</div>
            <div className="font-bold text-slate-800 text-lg mb-2">Không có quyền truy cập</div>
            <div className="text-sm text-slate-500">Liên hệ ADMIN nếu cần quyền.</div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <AppTopBar title={title} icon="task" />
      <div className="flex-1 p-3 md:p-6 bg-slate-50">
        <div className="card max-w-2xl mx-auto">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-slate-800">{title}</h1>
              <p className="mt-1 text-sm text-slate-600">{description}</p>
            </div>
            {phaseLabel && (
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                {phaseLabel}
              </span>
            )}
          </div>
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/50 p-6 text-center">
            <div className="text-3xl mb-2">🚧</div>
            <div className="text-sm font-medium text-slate-700">Đang phát triển</div>
            <div className="text-xs text-slate-500 mt-1">
              Trang này là placeholder Phase 0. Tính năng thực sẽ build trong các phase tiếp theo.
            </div>
          </div>
          <div className="mt-4 text-xs text-slate-400">
            <span className="font-mono">role:</span> {profile.roleCode} ·{' '}
            <span className="font-mono">route:</span> {routeKey}
          </div>
        </div>
      </div>
    </>
  );
}
