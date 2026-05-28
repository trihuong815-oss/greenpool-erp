'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { getFirebaseClientAuth } from '@/lib/firebase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // 1. Sign-in Firebase client SDK → lấy idToken
      const auth = getFirebaseClientAuth();
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await cred.user.getIdToken();

      // 2. Gửi idToken lên server để tạo session cookie httpOnly
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? 'Không tạo được session.');
      }
      // 3. Logout client-side Firebase (chỉ dùng để mint token, session ở cookie)
      await auth.signOut();

      router.push('/dashboard');
      router.refresh();
    } catch (e: any) {
      // Map Firebase Auth error code → message tiếng Việt
      const code: string = e?.code ?? '';
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

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email" required autoComplete="email"
              value={email} onChange={e => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Mật khẩu</label>
            <input
              type="password" required autoComplete="current-password"
              value={password} onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>
          {error && <div className="text-sm text-rose-700 bg-rose-50 p-3 rounded-lg">{error}</div>}
          <button
            type="submit" disabled={loading}
            className="w-full bg-gradient-to-r from-emerald-700 to-teal-800 text-white font-semibold py-3 rounded-lg hover:shadow-lg transition-all disabled:opacity-50"
          >
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>

        <div className="mt-6 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900">
          <strong>Lưu ý:</strong> Tài khoản được tạo bởi quản trị Firebase Console / API. Quên mật khẩu liên hệ admin để reset.
        </div>
      </div>
    </div>
  );
}
