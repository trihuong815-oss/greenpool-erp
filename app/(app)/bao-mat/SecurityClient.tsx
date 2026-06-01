'use client';

// UI Bảo mật — Phase 13.5
// - Liệt kê 2FA factors hiện tại.
// - Enroll TOTP: generate secret → QR code → user nhập 6 chữ số → verify → bind account.
// - Unenroll: chỉ cho phép nếu KHÔNG bắt buộc (non-ADMIN/CEO/GD).
//
// Yêu cầu Firebase Console phải bật:
//   Authentication → Sign-in method → Multi-factor → Enable "TOTP".

import { useEffect, useState } from 'react';
import { Shield, ShieldCheck, ShieldAlert, KeyRound, Loader2, Copy, Check, AlertCircle, X } from 'lucide-react';
import {
  getAuth, multiFactor, TotpMultiFactorGenerator,
  type MultiFactorInfo, type TotpSecret,
} from 'firebase/auth';
import QRCode from 'qrcode';
import { getFirebaseClient } from '@/lib/firebase/client';

interface Props {
  email: string;
  displayName: string;
  roleCode: string;
  mfaRequired: boolean;
}

export function SecurityClient({ email, displayName, roleCode, mfaRequired }: Props) {
  const [factors, setFactors] = useState<MultiFactorInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // Enrollment state
  const [enrolling, setEnrolling] = useState(false);
  const [secret, setSecret] = useState<TotpSecret | null>(null);
  const [qrSvg, setQrSvg] = useState<string>('');
  const [verificationCode, setVerificationCode] = useState('');
  const [factorName, setFactorName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);

  function refreshFactors() {
    const auth = getAuth(getFirebaseClient());
    const u = auth.currentUser;
    if (!u) { setFactors([]); setLoading(false); return; }
    setFactors(multiFactor(u).enrolledFactors);
    setLoading(false);
  }

  useEffect(() => { refreshFactors(); }, []);

  async function startEnroll() {
    setBusy(true); setError(null); setSuccess(null);
    try {
      const auth = getAuth(getFirebaseClient());
      const u = auth.currentUser;
      if (!u) throw new Error('Bạn chưa đăng nhập');
      const session = await multiFactor(u).getSession();
      const sec = await TotpMultiFactorGenerator.generateSecret(session);
      setSecret(sec);
      // Tạo otpauth URL chuẩn
      const otpauth = sec.generateQrCodeUrl(email || displayName || 'GreenPool', 'GreenPool ERP');
      const svg = await QRCode.toString(otpauth, { type: 'svg', margin: 1, width: 220 });
      setQrSvg(svg);
      setEnrolling(true);
    } catch (e: any) {
      setError(parseFirebaseError(e));
    } finally { setBusy(false); }
  }

  async function verifyAndEnroll() {
    if (!secret) return;
    setBusy(true); setError(null);
    try {
      const auth = getAuth(getFirebaseClient());
      const u = auth.currentUser;
      if (!u) throw new Error('Bạn chưa đăng nhập');
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, verificationCode.trim());
      await multiFactor(u).enroll(assertion, factorName.trim() || 'Authenticator App');
      setSuccess('✓ Đã kích hoạt 2FA thành công! Lần sau đăng nhập sẽ cần mã từ app authenticator.');
      setEnrolling(false);
      setSecret(null);
      setQrSvg('');
      setVerificationCode('');
      setFactorName('');
      refreshFactors();
    } catch (e: any) {
      setError(parseFirebaseError(e));
    } finally { setBusy(false); }
  }

  async function unenroll(factor: MultiFactorInfo) {
    if (mfaRequired) {
      setError('Vai trò của bạn bắt buộc phải bật 2FA — không thể xoá factor.');
      return;
    }
    if (!confirm(`Xoá factor "${factor.displayName ?? 'Authenticator'}"? Lần sau đăng nhập sẽ không cần mã 2FA nữa.`)) return;
    setBusy(true); setError(null);
    try {
      const auth = getAuth(getFirebaseClient());
      const u = auth.currentUser;
      if (!u) throw new Error('Bạn chưa đăng nhập');
      await multiFactor(u).unenroll(factor);
      setSuccess('Đã xoá factor.');
      refreshFactors();
    } catch (e: any) {
      setError(parseFirebaseError(e));
    } finally { setBusy(false); }
  }

  async function copySecret() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret.secretKey);
      setSecretCopied(true);
      setTimeout(() => setSecretCopied(false), 2000);
    } catch {}
  }

  const hasMfa = factors.length > 0;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Banner trạng thái */}
      <div className={`rounded-xl ring-1 p-4 ${
        hasMfa ? 'bg-emerald-50 ring-emerald-200 text-emerald-900'
          : mfaRequired ? 'bg-rose-50 ring-rose-300 text-rose-900'
          : 'bg-amber-50 ring-amber-200 text-amber-900'
      }`}>
        <div className="flex items-start gap-3">
          {hasMfa ? <ShieldCheck size={24} className="shrink-0 mt-0.5" />
            : mfaRequired ? <ShieldAlert size={24} className="shrink-0 mt-0.5" />
            : <Shield size={24} className="shrink-0 mt-0.5" />}
          <div className="flex-1">
            <div className="font-bold text-sm">
              {hasMfa ? '2FA đã bật — tài khoản được bảo vệ'
                : mfaRequired ? `Vai trò ${roleCode} BẮT BUỘC bật 2FA`
                : '2FA chưa bật — tài khoản dễ bị xâm nhập nếu lộ mật khẩu'}
            </div>
            <div className="text-xs mt-1 opacity-90">
              {hasMfa
                ? 'Lần đăng nhập tiếp theo sẽ cần mã 6 chữ số từ app Google Authenticator / Authy / 1Password.'
                : 'Tải app "Google Authenticator" hoặc "Authy" → bật 2FA → tài khoản an toàn ngay cả khi lộ password.'}
            </div>
          </div>
        </div>
      </div>

      {/* Danh sách factors */}
      <div className="bg-white rounded-xl ring-1 ring-slate-200 p-4">
        <h3 className="font-bold text-sm text-slate-800 mb-3 inline-flex items-center gap-2">
          <KeyRound size={16} /> Phương thức 2FA đã kích hoạt
        </h3>
        {loading ? (
          <div className="text-sm text-slate-400">Đang tải...</div>
        ) : factors.length === 0 ? (
          <div className="text-sm text-slate-500 italic">Chưa có. Bấm "Thêm Authenticator" để bật.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {factors.map((f) => (
              <li key={f.uid} className="py-2 flex items-center gap-3">
                <ShieldCheck size={18} className="text-emerald-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-slate-800">{f.displayName ?? 'Authenticator'}</div>
                  <div className="text-xs text-slate-500">
                    {f.factorId === 'totp' ? 'TOTP (Google Authenticator)' : f.factorId}
                    {f.enrollmentTime && ` · Kích hoạt: ${new Date(f.enrollmentTime).toLocaleString('vi-VN')}`}
                  </div>
                </div>
                <button onClick={() => unenroll(f)} disabled={mfaRequired || busy}
                  className="text-xs text-rose-600 hover:text-rose-700 px-2 py-1 rounded hover:bg-rose-50 disabled:opacity-30">
                  Xoá
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-rose-50 ring-1 ring-rose-200 p-3 text-sm text-rose-800 inline-flex items-start gap-2">
          <AlertCircle size={16} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg bg-emerald-50 ring-1 ring-emerald-200 p-3 text-sm text-emerald-800 inline-flex items-start gap-2">
          <Check size={16} className="shrink-0 mt-0.5" /> {success}
        </div>
      )}

      {/* Enroll flow */}
      {!enrolling && (
        <button onClick={startEnroll} disabled={busy}
          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg inline-flex items-center gap-2 disabled:opacity-50">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Shield size={16} />}
          Thêm Authenticator
        </button>
      )}

      {enrolling && secret && (
        <div className="bg-white rounded-xl ring-1 ring-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-800">Bật xác thực 2 yếu tố</h3>
            <button onClick={() => { setEnrolling(false); setSecret(null); setQrSvg(''); }}
              className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
          </div>

          <div>
            <div className="text-sm font-semibold text-slate-700 mb-1">Bước 1: Quét mã QR bằng app Authenticator</div>
            <div className="text-xs text-slate-500 mb-2">
              Mở Google Authenticator / Authy / 1Password → "+" → "Quét QR".
              Nếu không quét được, copy mã bí mật ở dưới rồi nhập tay.
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-4 bg-slate-50 rounded-lg p-4">
              <div className="bg-white rounded-lg p-2" dangerouslySetInnerHTML={{ __html: qrSvg }} />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-slate-500 mb-1">Mã bí mật (manual):</div>
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-white ring-1 ring-slate-200 rounded px-2 py-1 font-mono break-all">{secret.secretKey}</code>
                  <button onClick={copySecret} className="p-1.5 rounded hover:bg-slate-200 text-slate-600">
                    {secretCopied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                  </button>
                </div>
                <div className="text-[10px] text-slate-400 mt-2">
                  Account: <strong>{email}</strong> · Issuer: GreenPool ERP
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700 mb-1 block">Bước 2: Tên thiết bị (tuỳ chọn)</label>
            <input value={factorName} onChange={(e) => setFactorName(e.target.value)}
              placeholder="VD: iPhone của tôi, Laptop văn phòng..."
              maxLength={50}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700 mb-1 block">Bước 3: Nhập mã 6 chữ số từ app</label>
            <input value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              inputMode="numeric"
              maxLength={6}
              className="w-full border border-slate-300 rounded-lg px-3 py-3 text-lg font-mono text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>

          <div className="flex gap-2">
            <button onClick={() => { setEnrolling(false); setSecret(null); setQrSvg(''); }}
              className="px-4 py-2 text-sm text-slate-700 ring-1 ring-slate-200 rounded-lg hover:bg-slate-50">
              Huỷ
            </button>
            <button onClick={verifyAndEnroll}
              disabled={busy || verificationCode.length !== 6}
              className="flex-1 px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2">
              {busy && <Loader2 size={14} className="animate-spin" />}
              Xác nhận & Kích hoạt
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function parseFirebaseError(e: any): string {
  const code = e?.code ?? '';
  const msg = e?.message ?? 'Lỗi không xác định';
  if (code === 'auth/requires-recent-login') return 'Phiên đăng nhập đã cũ. Đăng xuất rồi đăng nhập lại để thiết lập 2FA.';
  if (code === 'auth/invalid-verification-code') return 'Mã 6 chữ số không đúng. Kiểm tra lại app Authenticator (mã đổi mỗi 30 giây).';
  if (code === 'auth/totp-challenge-timeout') return 'Hết hạn — sinh lại mã QR bằng cách bấm "Thêm Authenticator" lần nữa.';
  if (code === 'auth/operation-not-allowed') return 'Tính năng 2FA chưa bật trên Firebase Console. Báo admin.';
  return msg;
}
