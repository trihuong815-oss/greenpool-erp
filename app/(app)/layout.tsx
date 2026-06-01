import { AppShell } from '@/components/AppShell';
import { SessionRefresher } from '@/components/SessionRefresher';
import { IdleAutoLogout } from '@/components/IdleAutoLogout';
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

  return (
    <>
      <SessionRefresher />
      <IdleAutoLogout />
      <AppShell
        userName={profile.displayName}
        userRole={profile.roleName ?? profile.roleCode}
        roleCode={profile.roleCode}
        menuOverrides={profile.menuOverrides}
      >
        {children}
      </AppShell>
    </>
  );
}
