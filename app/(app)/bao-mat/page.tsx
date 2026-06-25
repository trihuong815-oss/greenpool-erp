import { AppTopBar } from '@/components/AppTopBar';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { SecurityClient } from './SecurityClient';
import { NotiChannelsSettings } from './NotiChannelsSettings';

// Page Bảo mật — Phase 13.5: đổi mật khẩu + 2FA TOTP.
// ADMIN/CEO/GD bắt buộc setup 2FA (banner global ép vào page này).

export default async function BaoMatPage() {
  const { profile } = await requireAuthedProfile();
  const isRequiredMfa = profile.roleCode === 'ADMIN'
    || profile.roleCode === 'CEO'
    || profile.roleCode === 'GD_KD'
    || profile.roleCode === 'GD_VP';
  return (
    <>
      <AppTopBar breadcrumb={[{ label: 'Cài đặt' }, { label: 'Bảo mật' }]} title="Bảo mật" subtitle="Mật khẩu · Xác thực 2 yếu tố (2FA)" icon="home" />
      <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50">
        <SecurityClient
          email={profile.email ?? ''}
          displayName={profile.displayName ?? ''}
          roleCode={profile.roleCode}
          mfaRequired={isRequiredMfa}
        />
        <div className="max-w-3xl mx-auto mt-6">
          <NotiChannelsSettings />
        </div>
      </div>
    </>
  );
}
