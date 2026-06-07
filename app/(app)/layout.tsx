import { AppShell } from '@/components/AppShell';
import { SessionRefresher } from '@/components/SessionRefresher';
import { FeatureFlagsProvider } from '@/lib/feature-flags/client';
import { loadAllFlags } from '@/lib/feature-flags/server';
// Phase 13.7 (2026-06-05): bỏ IdleAutoLogout theo yêu cầu anh — UX giống FB/Zalo.
// Bảo mật giữ qua: auth + 2FA TOTP + Firestore rules + audit log + rate limit + CSP.
// Session cookie 14d tự renew qua SessionRefresher mỗi 24h.
// Phase 13.13 (2026-06-06): app badge OS được set trong NotiCountsProvider (AppShell) —
// PWAAppBadge component đã trở thành no-op, không cần render ở đây nữa.
import { getCurrentProfile } from '@/lib/firebase/current-profile';
import { redirect } from 'next/navigation';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const r = await getCurrentProfile();
  if (!r) redirect('/login');
  const { user, profile } = r;

  if (!profile.roleCode) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <h1 className="text-xl font-bold mb-2">Tài khoản chưa được cấu hình</h1>
          <p className="text-sm text-slate-600">
            Tài khoản <strong>{user.email}</strong> chưa có hồ sơ. Admin cần tạo record trong
            collection <code>users</code> với <code>roleId</code> phù hợp.
          </p>
        </div>
      </div>
    );
  }

  // Phase C.2 (2026-06-07): load tất cả feature flags 1 lần ở RSC layout,
  // pass plain Record<string, boolean> qua FeatureFlagsProvider client component.
  // Cache 60s/(key, uid) ở server → giảm 99% Firestore read.
  const flags = await loadAllFlags(user.uid, profile.roleCode);

  return (
    <>
      <SessionRefresher />
      <FeatureFlagsProvider flags={flags}>
        <AppShell
          userName={profile.displayName}
          userRole={profile.roleName ?? profile.roleCode}
          roleCode={profile.roleCode}
          menuOverrides={profile.menuOverrides}
        >
          {children}
        </AppShell>
      </FeatureFlagsProvider>
    </>
  );
}
