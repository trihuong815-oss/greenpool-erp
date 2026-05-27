'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, KeyRound, Loader2, CheckCircle2, AlertCircle, LogOut } from 'lucide-react';

interface Props {
  email: string;
  displayName: string;
}

export function DoiMatKhauClient({ email, displayName }: Props) {
  const router = useRouter();
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ok = newPwd.length >= 6 && newPwd === confirmPwd;

  async function handleSave() {
    if (!ok) {
      setError(newPwd.length < 6 ? 'Mật khẩu phải ≥ 6 ký tự' : 'Hai lần nhập không khớp');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: newPwd }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? 'Lỗi cập nhật');
      setDone(true);
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  }

  async function logoutAndRelogin() {
    await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
    router.push('/login');
    router.refresh();
  }

  if (done) {
    return (
      <div className="max-w-md mx-auto card">
        <div className="text-center py-6">
          <CheckCircle2 size={48} className="text-emerald-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-800 mb-2">Đổi mật khẩu thành công</h2>
          <p className="text-sm text-slate-600 mb-5">
            Mật khẩu mới đã có hiệu lực. Để bảo mật, bạn nên đăng xuất + đăng nhập lại bằng mật khẩu mới.
          </p>
          <div className="flex gap-2 justify-center">
            <button onClick={() => { setDone(false); setNewPwd(''); setConfirmPwd(''); }}
              className="px-4 py-2 text-sm rounded border border-slate-200 hover:bg-slate-50">
              Đổi tiếp
            </button>
            <button onClick={logoutAndRelogin}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded bg-emerald-600 hover:bg-emerald-700 text-white">
              <LogOut size={14} /> Đăng xuất + Đăng nhập lại
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto card">
      <div className="flex items-center gap-3 pb-3 mb-3 border-b border-slate-100">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
          <KeyRound size={18} />
        </div>
        <div>
          <div className="font-semibold text-slate-800">{displayName}</div>
          <div className="text-xs text-slate-500">{email}</div>
        </div>
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="block text-xs font-semibold text-slate-600 mb-1">Mật khẩu mới *</span>
          <div className="relative">
            <input type={show ? 'text' : 'password'} value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              placeholder="≥ 6 ký tự"
              className="w-full px-3 py-2 pr-10 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400" />
            <button type="button" onClick={() => setShow((v) => !v)}
              className="absolute right-2 top-2 text-slate-400 hover:text-slate-700">
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>

        <label className="block">
          <span className="block text-xs font-semibold text-slate-600 mb-1">Xác nhận mật khẩu mới *</span>
          <input type={show ? 'text' : 'password'} value={confirmPwd}
            onChange={(e) => setConfirmPwd(e.target.value)}
            placeholder="Nhập lại mật khẩu"
            className={`w-full px-3 py-2 border rounded text-sm focus:outline-none ${
              confirmPwd && confirmPwd !== newPwd
                ? 'border-rose-300 focus:border-rose-500'
                : 'border-slate-200 focus:border-slate-400'
            }`} />
          {confirmPwd && confirmPwd !== newPwd && (
            <div className="text-xs text-rose-600 mt-1">Hai lần nhập không khớp.</div>
          )}
        </label>

        {error && (
          <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-2 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <div>{error}</div>
          </div>
        )}

        <button onClick={handleSave} disabled={!ok || saving}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded bg-gradient-to-r from-emerald-600 to-teal-700 text-white shadow-sm hover:shadow-md disabled:opacity-50">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
          {saving ? 'Đang lưu…' : 'Đổi mật khẩu'}
        </button>
      </div>
    </div>
  );
}
