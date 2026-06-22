// V7 Promo (2026-06-18) — Module quản lý Chương trình khuyến mãi.
// QLCS tạo → GD_KD/GD_VP duyệt theo thứ tự → Kế toán cài đặt mã → Sale dùng.
// PR-PROMO1A (2026-06-22): nhận searchParams + parse query auto-focus tab theo workflow.

import { canAccessRoute } from '@/lib/permissions';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { AppTopBar } from '@/components/AppTopBar';
import { parsePromoQueryParams } from '@/lib/sales-v2/promo-query-params';
import ChuongTrinhClient from './ChuongTrinhClient';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ChuongTrinhPage({ searchParams }: PageProps) {
  const { profile } = await requireAuthedProfile();

  if (!canAccessRoute(profile.roleCode, 'doanh-so-v2/chuong-trinh', profile.menuOverrides)) {
    return (
      <>
        <AppTopBar title="Chương trình khuyến mãi" icon="task" />
        <div className="flex-1 flex items-center justify-center p-3 md:p-6 bg-slate-50">
          <div className="card text-center py-12 max-w-md">
            <div className="text-5xl mb-4">🔒</div>
            <div className="font-bold text-slate-800 text-lg mb-2">Không có quyền truy cập</div>
          </div>
        </div>
      </>
    );
  }

  // PR-PROMO1A: parse query auto-focus tab. Safe — không throw.
  const sp = (await searchParams) ?? {};
  const initialQuery = parsePromoQueryParams(sp);

  return (
    <>
      <AppTopBar title="Chương trình khuyến mãi" icon="task" />
      <ChuongTrinhClient
        callerUid={profile.id}
        callerRole={profile.roleCode}
        callerBranch={profile.branchId ?? null}
        callerName={profile.displayName ?? profile.email ?? ''}
        initialQuery={initialQuery}
      />
    </>
  );
}
