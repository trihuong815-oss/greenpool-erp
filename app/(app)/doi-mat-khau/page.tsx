// Trang đổi mật khẩu cá nhân — mọi user đã đăng nhập đều dùng được.

import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { AppTopBar } from '@/components/AppTopBar';
import { DoiMatKhauClient } from './DoiMatKhauClient';

export default async function DoiMatKhauPage() {
  const { profile } = await requireAuthedProfile();
  return (
    <>
      <AppTopBar title="Đổi mật khẩu" subtitle="Cập nhật mật khẩu đăng nhập của bạn" icon="key" />
      <div className="flex-1 overflow-y-auto p-3 md:p-6 bg-slate-50">
        <DoiMatKhauClient email={profile.email} displayName={profile.displayName} />
      </div>
    </>
  );
}
