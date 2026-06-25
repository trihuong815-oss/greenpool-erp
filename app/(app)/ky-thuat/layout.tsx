// Layout chung cho module /ky-thuat — subnav 4 tab. Permission check ở layout
// để mọi sub-route (hoa-chat, may, nhan-su, giao-viec) cùng được bảo vệ.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { canAccessRoute } from '@/lib/permissions';
import { AppTopBar } from '@/components/AppTopBar';
import { KyThuatSubnav } from './KyThuatSubnav';

export default async function KyThuatLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireAuthedProfile();
  if (!canAccessRoute(profile.roleCode, 'ky-thuat', profile.menuOverrides)) {
    redirect('/dashboard');
  }
  return (
    <>
      <AppTopBar
        breadcrumb={[{ label: 'Khối kinh doanh' }, { label: 'Kỹ thuật vận hành' }]}
        title="Kỹ thuật vận hành"
        subtitle="Hoá chất · Máy · Nhân sự · Giao việc"
        icon="settings"
      />
      <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
        <KyThuatSubnav />
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </>
  );
}
