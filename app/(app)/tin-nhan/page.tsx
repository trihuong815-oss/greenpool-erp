// Trang Tin nhắn — Phase 13 (Chat 1-1 + Group).
// Server load profile + visibleBranchIds. Conv list + messages lấy realtime ở client.

import { AppTopBar } from '@/components/AppTopBar';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { TinNhanClient } from './TinNhanClient';

export default async function TinNhanPage() {
  const { profile } = await requireAuthedProfile();

  return (
    <>
      <AppTopBar breadcrumb={[{ label: 'Trung tâm điều hành' }, { label: 'Tin nhắn' }]} title="Tin nhắn" subtitle="Nhắn 1-1 và nhóm · realtime" icon="home" />
      {/* Phase 13.16 (2026-06-06): thêm min-h-0 + flex để h-full của TinNhanClient outer
          tính height đúng trên mobile. Trước đây flex-1 mặc định min-height: auto → child
          h-full expand theo content → header conv + composer cùng scroll theo messages. */}
      <div className="flex-1 min-h-0 overflow-hidden bg-slate-50 flex">
        <TinNhanClient
          currentUserId={profile.id}
          currentUserName={profile.displayName ?? profile.email ?? ''}
          currentUserRole={profile.roleCode}
        />
      </div>
    </>
  );
}
