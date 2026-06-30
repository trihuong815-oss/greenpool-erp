import { AppShell } from '@/components/AppShell';
import { SessionRefresher } from '@/components/SessionRefresher';
import { FeatureFlagsProvider } from '@/lib/feature-flags/client';
import { loadAllFlags } from '@/lib/feature-flags/server';
import { ImperativeModalHost } from '@/components/ui/imperative-modal';
// Phase 13.7 (2026-06-05): bỏ IdleAutoLogout theo yêu cầu anh — UX giống FB/Zalo.
// Bảo mật giữ qua: auth + 2FA TOTP + Firestore rules + audit log + rate limit + CSP.
// Session cookie 14d tự renew qua SessionRefresher mỗi 24h.
// Phase 13.13 (2026-06-06): app badge OS được set trong NotiCountsProvider (AppShell) —
// PWAAppBadge component đã trở thành no-op, không cần render ở đây nữa.
import { loadCurrentProfileResult } from '@/lib/firebase/current-profile';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/firebase/session-auth';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // 2026-06-30 HOTFIX: use structured result để phân biệt inactive vs no-session.
  // Inactive account: show clear page, KHÔNG kick /login loop (user không biết
  // tại sao bị kick → cứ login lại → loop vô hạn vì status='inactive' vẫn fail).
  // Firestore-throw: show retry page, KHÔNG clear cookie (transient error).
  // No session: clear cookie + redirect /login như cũ.
  const r = await loadCurrentProfileResult();
  if ('reason' in r) {
    if (r.reason === 'status-inactive') {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
            <div className="text-4xl mb-3">🔒</div>
            <h1 className="text-xl font-bold mb-2 text-slate-800">Tài khoản đã bị tắt</h1>
            <p className="text-sm text-slate-600 mb-4">
              Tài khoản <strong>{r.email ?? 'của bạn'}</strong> đang ở trạng thái <code>inactive</code>.
            </p>
            <p className="text-sm text-slate-600 mb-6">
              Vui lòng liên hệ ADMIN/CEO để được kích hoạt lại.
            </p>
            <a href="/login" className="inline-block px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
              Quay lại đăng nhập với tài khoản khác
            </a>
          </div>
        </div>
      );
    }
    if (r.reason === 'firestore-throw') {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
            <div className="text-4xl mb-3">⚠️</div>
            <h1 className="text-xl font-bold mb-2 text-slate-800">Tạm thời không tải được hồ sơ</h1>
            <p className="text-sm text-slate-600 mb-4">
              Lỗi kết nối Firestore. Vui lòng thử lại sau 30 giây.
            </p>
            {r.errorMessage && (
              <p className="text-xs text-slate-400 mb-4 font-mono break-all">{r.errorMessage}</p>
            )}
            <a href="/dashboard" className="inline-block px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
              Thử lại
            </a>
          </div>
        </div>
      );
    }
    // no-session-cookie / no-user-doc: clear cookie + redirect /login như cũ
    try {
      const c = await cookies();
      c.set(SESSION_COOKIE, '', { maxAge: 0, path: '/' });
    } catch { /* swallow */ }
    redirect('/login');
  }
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
          avatarUrl={profile.avatarUrl ?? null}
          menuOverrides={profile.menuOverrides}
        >
          {children}
        </AppShell>
      </FeatureFlagsProvider>
      <ImperativeModalHost />
    </>
  );
}
