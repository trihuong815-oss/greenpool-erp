// Trang Tin nhắn — Phase 13 (Chat 1-1 + Group).
// Server load profile + visibleBranchIds. Conv list + messages lấy realtime ở client.

import { AppTopBar } from '@/components/AppTopBar';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { TinNhanClient } from './TinNhanClient';

export default async function TinNhanPage() {
  const { profile } = await requireAuthedProfile();

  return (
    <>
      <AppTopBar title="Tin nhắn" subtitle="Nhắn 1-1 và nhóm · realtime" icon="home" />
      <div className="flex-1 overflow-hidden bg-slate-50">
        <TinNhanClient
          currentUserId={profile.id}
          currentUserName={profile.displayName ?? profile.email ?? ''}
        />
      </div>
    </>
  );
}
