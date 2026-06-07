'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithEmailAndPassword, setPersistence, browserLocalPersistence,
  getMultiFactorResolver, TotpMultiFactorGenerator,
  type MultiFactorResolver,
} from 'firebase/auth';
import { getFirebaseClientAuth } from '@/lib/firebase/client';
import { Button } from '@/components/ui';

// Phase 13.5: hỗ trợ MFA TOTP. Khi user bật 2FA, signInWithEmailAndPassword sẽ throw
// `auth/multi-factor-auth-required` → bắt error, lấy resolver, hiện step 2 nhập mã 6 chữ số.

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // MFA state
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null);
  const [totpCode, setTotpCode] = useState('');

  async function completeSession(idToken: string) {
    const res = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j?.error ?? 'Không tạo được session.');
    }
    router.push('/dashboard');
    router.refresh();
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const auth = getFirebaseClientAuth();
      await setPersistence(auth, browserLocalPersistence);
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await cred.user.getIdToken();
      await completeSession(idToken);
    } catch (e: any) {
      const code: string = e?.code ?? '';
      // ── MFA required → KHÔNG báo lỗi, chuyển sang step 2 ──
      if (code === 'auth/multi-factor-auth-required') {
        try {
          const auth = getFirebaseClientAuth();
          const resolver = getMultiFactorResolver(auth, e);
          setMfaResolver(resolver);
          setError('');
          setLoading(false);
          return;
        } catch (resolverErr: any) {
          setError('Lỗi khi load MFA resolver: ' + (resolverErr?.message ?? 'unknown'));
          setLoading(false);
          return;
        }
      }
      // Các lỗi khác — map message
      let msg = e?.message ?? 'Đăng nhập thất bại.';
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        msg = 'Email hoặc mật khẩu không đúng.';
      } else if (code === 'auth/too-many-requests') {
        msg = 'Quá nhiều lần thử. Vui lòng chờ ít phút rồi thử lại.';
      } else if (code === 'auth/user-disabled') {
        msg = 'Tài khoản đã bị vô hiệu hóa.';
      }
      setError(msg);
      setLoading(false);
    }
  }

  async function handleMfaSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaResolver) return;
    setLoading(true);
    setError('');
    try {
      // Tìm factor TOTP đầu tiên (user thường chỉ enroll 1 TOTP)
      const hint = mfaResolver.hints.find((h) => h.factorId === 'totp') ?? mfaResolver.hints[0];
      if (!hint) throw new Error('Không tìm thấy factor MFA đã enroll.');
      const assertion = TotpMultiFactorGenerator.assertionForSignIn(hint.uid, totpCode.trim());
      const cred = await mfaResolver.resolveSignIn(assertion);
      const idToken = await cred.user.getIdToken();
      await completeSession(idToken);
    } catch (e: any) {
      const code: string = e?.code ?? '';
      let msg = e?.message ?? 'Mã không đúng.';
      if (code === 'auth/invalid-verification-code') msg = 'Mã 6 chữ số không đúng. Kiểm tra lại app Authenticator.';
      if (code === 'auth/missing-verification-code') msg = 'Vui lòng nhập mã 6 chữ số.';
      setError(msg);
      setLoading(false);
    }
  }

  function cancelMfa() {
    setMfaResolver(null);
    setTotpCode('');
    setError('');
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-block bg-white rounded-2xl p-2 mb-4">
            <img src="/logo.png" alt="Green Pool" width={192} height={192} className="mx-auto object-contain" />
          </div>
          <h1 className="text-3xl font-bold text-slate-800">Green Pool System</h1>
          <p className="text-slate-500 mt-2">Hệ thống Quản lý Nội bộ — Cụm 5 cơ sở</p>
        </div>

        {!mfaResolver ? (
          // ─── Step 1: email + password ───
          <form id="login-form" onSubmit={handleLogin} className="space-y-4" method="post" action="/login">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                id="email" name="email" type="email" required
                autoComplete="email"
                inputMode="email"
                autoCapitalize="off"
                spellCheck={false}
                value={email} onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">Mật khẩu</label>
              <input
                id="password" name="password" type="password" required
                autoComplete="current-password"
                value={password} onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
            {error && <div className="text-sm text-rose-700 bg-rose-50 p-3 rounded-lg">{error}</div>}
            {/* Phase UI-1: migrate sang Button component */}
            <Button type="submit" size="lg" fullWidth loading={loading}>
              {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </Button>
          </form>
        ) : (
          // ─── Step 2: nhập mã TOTP 6 chữ số ───
          <form onSubmit={handleMfaSubmit} className="space-y-4">
            <div className="text-center">
              <div className="text-3xl mb-2">🔐</div>
              <h2 className="text-lg font-bold text-slate-800">Xác thực 2 yếu tố</h2>
              <p className="text-sm text-slate-500 mt-1">
                Mở app Google Authenticator và nhập mã 6 chữ số cho{' '}
                <strong className="text-slate-700">{email}</strong>
              </p>
            </div>
            <div>
              <label htmlFor="totp" className="block text-sm font-medium text-slate-700 mb-1">Mã 6 chữ số</label>
              <input
                id="totp" name="totp" required autoFocus
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoComplete="one-time-code"
                value={totpCode}
                onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-2xl text-center tracking-widest font-mono"
              />
            </div>
            {error && <div className="text-sm text-rose-700 bg-rose-50 p-3 rounded-lg">{error}</div>}
            <Button type="submit" size="lg" fullWidth loading={loading} disabled={totpCode.length !== 6}>
              {loading ? 'Đang xác thực...' : 'Xác nhận'}
            </Button>
            <Button type="button" variant="ghost" size="sm" fullWidth onClick={cancelMfa} disabled={loading}>
              ← Quay lại đăng nhập
            </Button>
          </form>
        )}

        <div className="mt-6 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900">
          <strong>Lưu ý:</strong> Tài khoản được tạo bởi quản trị Firebase Console / API. Quên mật khẩu liên hệ admin để reset.
        </div>
      </div>
    </div>
  );
}
