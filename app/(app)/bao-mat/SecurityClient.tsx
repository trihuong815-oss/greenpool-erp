'use client';

// UI Bảo mật — Phase 13.5
// - Liệt kê 2FA factors hiện tại.
// - Enroll TOTP: generate secret → QR code → user nhập 6 chữ số → verify → bind account.
// - Unenroll: chỉ cho phép nếu KHÔNG bắt buộc (non-ADMIN/CEO/GD).
//
// Yêu cầu Firebase Console phải bật:
//   Authentication → Sign-in method → Multi-factor → Enable "TOTP".

import { useEffect, useState } from 'react';
import { Shield, ShieldCheck, ShieldAlert, KeyRound, Loader2, Copy, Check, AlertCircle, X, Bell, BellOff, RefreshCw } from 'lucide-react';
import { enablePushNotifications, forceRefreshPushSetup, getNotificationPermission, isFcmSupported, disablePushNotifications } from '@/lib/firebase/messaging-client';
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
  // Push refresh state
  const [pushRefreshing, setPushRefreshing] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  // Phase 13.7 (2026-06-05): Push noti enable/disable state cho thiết bị này
  const [pushSupported, setPushSupported] = useState<boolean>(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>('default');
  const [pushDeviceOn, setPushDeviceOn] = useState<boolean>(false);
  const [pushBusy, setPushBusy] = useState<'enable' | 'disable' | null>(null);
  // Phase 13.8 + 13.9.1/2 (2026-06-05): list devices đã bật + đặt tên + on/off
  interface FcmDevice { token: string; tokenMask: string; userAgent: string; label: string; createdAt: number; lastSeen: number; enabled: boolean; }
  const [devices, setDevices] = useState<FcmDevice[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [busyToken, setBusyToken] = useState<string | null>(null); // chung cho toggle/edit/delete
  // Inline edit label
  const [editingToken, setEditingToken] = useState<string | null>(null);
  const [editingLabelDraft, setEditingLabelDraft] = useState('');
  // Custom label khi bật mới
  const [enableLabel, setEnableLabel] = useState('');
  const [showLabelInput, setShowLabelInput] = useState(false);

  async function loadDevices() {
    setDevicesLoading(true);
    try {
      const res = await fetch('/api/personal/fcm-token', { cache: 'no-store' });
      if (res.ok) {
        const j = await res.json();
        setDevices(Array.isArray(j.devices) ? j.devices : []);
      }
    } catch { /* silent */ } finally { setDevicesLoading(false); }
  }
  useEffect(() => { loadDevices(); }, []);

  async function handleRemoveDevice(token: string, label: string) {
    if (!confirm(`Xoá thiết bị "${label}"? Thiết bị này sẽ không nhận thông báo nữa và phải bật lại từ đầu.`)) return;
    setBusyToken(token);
    try {
      const res = await fetch('/api/personal/fcm-token', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (res.ok) {
        await loadDevices();
        try {
          const cached = localStorage.getItem('fcm_token_registered');
          if (cached === token) {
            localStorage.removeItem('fcm_token_registered');
            setPushDeviceOn(false);
          }
        } catch { /* ignore */ }
      }
    } catch (e: any) {
      alert('Lỗi xoá thiết bị: ' + (e?.message ?? 'unknown'));
    } finally { setBusyToken(null); }
  }

  async function handleToggleDevice(token: string, currentEnabled: boolean) {
    setBusyToken(token);
    try {
      const res = await fetch('/api/personal/fcm-token', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, enabled: !currentEnabled }),
      });
      if (res.ok) {
        setDevices((arr) => arr.map((d) => d.token === token ? { ...d, enabled: !currentEnabled } : d));
      } else {
        const j = await res.json().catch(() => ({}));
        alert('Lỗi: ' + (j?.error ?? 'unknown'));
      }
    } catch (e: any) {
      alert('Lỗi: ' + (e?.message ?? 'unknown'));
    } finally { setBusyToken(null); }
  }

  function startEditLabel(d: FcmDevice) {
    setEditingToken(d.token);
    setEditingLabelDraft(d.label);
  }
  function cancelEditLabel() {
    setEditingToken(null);
    setEditingLabelDraft('');
  }
  async function saveEditLabel(token: string) {
    const newLabel = editingLabelDraft.trim();
    if (!newLabel) { alert('Tên thiết bị không được để trống'); return; }
    setBusyToken(token);
    try {
      const res = await fetch('/api/personal/fcm-token', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, label: newLabel }),
      });
      if (res.ok) {
        setDevices((arr) => arr.map((d) => d.token === token ? { ...d, label: newLabel } : d));
        cancelEditLabel();
      } else {
        const j = await res.json().catch(() => ({}));
        alert('Lỗi: ' + (j?.error ?? 'unknown'));
      }
    } catch (e: any) {
      alert('Lỗi: ' + (e?.message ?? 'unknown'));
    } finally { setBusyToken(null); }
  }

  // Detect trạng thái thông báo trên thiết bị này
  useEffect(() => {
    setPushSupported(isFcmSupported());
    if (!isFcmSupported()) return;
    setPushPermission(getNotificationPermission());
    try {
      const cachedToken = localStorage.getItem('fcm_token_registered');
      setPushDeviceOn(getNotificationPermission() === 'granted' && !!cachedToken);
    } catch { /* localStorage chặn */ }
  }, []);

  async function handleEnablePush() {
    setPushBusy('enable');
    setPushMsg(null);
    try {
      const res = await enablePushNotifications(enableLabel.trim() || undefined);
      if (res.ok) {
        setPushDeviceOn(true);
        setPushPermission('granted');
        setEnableLabel('');
        setShowLabelInput(false);
        setPushMsg('✓ Đã bật thông báo trên thiết bị này. Bật 1 lần dùng mãi đến khi tắt.');
        // Refresh list devices ngay để hiển thị
        await loadDevices();
      } else if (res.reason === 'denied') {
        setPushMsg('⚠ Bạn đã chặn thông báo. Vào cài đặt trình duyệt → cho phép thông báo cho trang này.');
      } else if (res.reason === 'unsupported') {
        setPushMsg('⚠ Trình duyệt/thiết bị không hỗ trợ. Dùng Chrome/Safari iOS 16.4+ qua PWA.');
      } else {
        setPushMsg('⚠ Lỗi: ' + (res.errorMsg ?? 'unknown'));
      }
    } catch (e: any) {
      setPushMsg('⚠ Lỗi: ' + (e?.message ?? 'unknown'));
    } finally { setPushBusy(null); }
  }

  async function handleDisablePush() {
    if (!confirm('Tắt thông báo trên thiết bị này? Bạn sẽ không nhận tin nhắn / đề xuất / nhiệm vụ mới qua noti nữa.')) return;
    setPushBusy('disable');
    setPushMsg(null);
    try {
      await disablePushNotifications();
      setPushDeviceOn(false);
      setPushMsg('✓ Đã tắt thông báo trên thiết bị này. Bật lại bất kỳ lúc nào.');
    } catch (e: any) {
      setPushMsg('⚠ Lỗi: ' + (e?.message ?? 'unknown'));
    } finally { setPushBusy(null); }
  }

  async function handleRefreshPush() {
    setPushRefreshing(true); setPushMsg(null);
    try {
      const res = await forceRefreshPushSetup();
      if (res.updated && res.newToken) {
        setPushMsg('✓ Đã làm mới push noti. Lần tới có sự kiện sẽ tới điện thoại.');
      } else if (res.error === 'denied') {
        setPushMsg('⚠ Bạn đã chặn notification. Vào cài đặt trình duyệt → cho phép thông báo cho trang này.');
      } else {
        setPushMsg('⚠ Lỗi: ' + (res.error ?? 'unknown'));
      }
    } catch (e: any) {
      setPushMsg('⚠ Lỗi: ' + (e?.message ?? 'unknown'));
    } finally { setPushRefreshing(false); }
  }

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

      {/* Push notification — Phase 13.7 (2026-06-05): bật/tắt cho thiết bị này */}
      <div className="bg-white rounded-xl ring-1 ring-slate-200 p-4">
        <h3 className="font-bold text-sm text-slate-800 mb-3 inline-flex items-center gap-2">
          <Bell size={16} /> Thông báo trên thiết bị này (Push)
        </h3>
        {!pushSupported ? (
          <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-2">
            ⚠ Trình duyệt/thiết bị KHÔNG hỗ trợ thông báo. Dùng Chrome/Edge desktop hoặc Safari iOS 16.4+ (đã cài PWA — Add to Home Screen).
          </div>
        ) : (
          <>
            {/* Status hiện tại */}
            <div className={`mb-3 px-3 py-2.5 rounded-lg text-xs ring-1 ${
              pushDeviceOn
                ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
                : pushPermission === 'denied'
                  ? 'bg-rose-50 text-rose-800 ring-rose-200'
                  : 'bg-amber-50 text-amber-800 ring-amber-200'
            }`}>
              <div className="font-semibold mb-0.5">
                {pushDeviceOn ? '✓ Đã bật' : pushPermission === 'denied' ? '✗ Bị chặn' : '○ Chưa bật'}
              </div>
              <div>
                {pushDeviceOn
                  ? 'Thiết bị này đang nhận thông báo (tin nhắn, đề xuất, nhiệm vụ). Bật 1 lần — chạy mãi đến khi bạn tắt đi.'
                  : pushPermission === 'denied'
                    ? 'Bạn đã chặn thông báo cho trang này. Vào cài đặt trình duyệt → cho phép thông báo cho trang web này → quay lại đây bật.'
                    : 'Bật để nhận thông báo tin nhắn, đề xuất, nhiệm vụ ngay cả khi đóng app.'}
              </div>
            </div>

            {/* Nút bật/tắt */}
            {!pushDeviceOn && showLabelInput ? (
              // Inline form: đặt tên thiết bị (tùy chọn) → bấm xác nhận bật
              <div className="space-y-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                <label className="block">
                  <span className="block text-[11px] font-semibold text-emerald-800 mb-1">
                    Đặt tên cho thiết bị này (tùy chọn)
                  </span>
                  <input
                    type="text"
                    value={enableLabel}
                    onChange={(e) => setEnableLabel(e.target.value)}
                    maxLength={80}
                    placeholder="vd: MacBook ở văn phòng, iPhone cá nhân..."
                    className="w-full px-2.5 py-1.5 text-sm border border-emerald-300 rounded focus:ring-2 focus:ring-emerald-400 outline-none"
                    autoFocus
                  />
                </label>
                <p className="text-[10px] text-emerald-700">
                  Bỏ trống → hệ thống tự đặt theo trình duyệt (vd "MacBook · Chrome"). Có thể đổi tên sau.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleEnablePush}
                    disabled={pushBusy === 'enable' || pushPermission === 'denied'}
                    className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50"
                  >
                    {pushBusy === 'enable' ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
                    Xác nhận bật
                  </button>
                  <button
                    onClick={() => { setShowLabelInput(false); setEnableLabel(''); }}
                    disabled={pushBusy === 'enable'}
                    className="px-3.5 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-50"
                  >
                    Hủy
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {!pushDeviceOn ? (
                  <button
                    onClick={() => setShowLabelInput(true)}
                    disabled={pushPermission === 'denied'}
                    className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50"
                  >
                    <Bell size={14} />
                    Bật thông báo trên thiết bị này
                  </button>
                ) : (
                  <button
                    onClick={handleDisablePush}
                    disabled={pushBusy === 'disable'}
                    className="inline-flex items-center gap-2 px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50"
                  >
                    {pushBusy === 'disable' ? <Loader2 size={14} className="animate-spin" /> : <BellOff size={14} />}
                    Tắt thông báo trên thiết bị này
                  </button>
                )}
                <button
                  onClick={handleRefreshPush}
                  disabled={pushRefreshing}
                  className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg disabled:opacity-50"
                  title="Nếu đã bật rồi mà thông báo không tới, bấm để làm mới Service Worker + đăng ký lại token FCM"
                >
                  {pushRefreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  Làm mới
                </button>
              </div>
            )}
            {pushMsg && (
              <div className={`mt-3 text-xs px-2 py-1.5 rounded ${
                pushMsg.startsWith('✓') ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
                  : 'bg-rose-50 text-rose-800 ring-1 ring-rose-200'
              }`}>{pushMsg}</div>
            )}
            <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">
              Tắt/bật áp dụng <strong>chỉ cho thiết bị này</strong>. Nếu dùng nhiều thiết bị (vd điện thoại + máy tính),
              bật riêng từng máy.
            </p>

            {/* List thiết bị đã bật — Phase 13.8 (2026-06-05) */}
            <div className="mt-4 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Thiết bị đang nhận thông báo ({devices.length})
                </h4>
                <button
                  type="button"
                  onClick={loadDevices}
                  disabled={devicesLoading}
                  className="text-[11px] text-slate-500 hover:text-emerald-700 disabled:opacity-50"
                  title="Tải lại"
                >
                  {devicesLoading ? '...' : '⟳'}
                </button>
              </div>
              {devicesLoading ? (
                <div className="text-xs text-slate-400 py-3 text-center">
                  <Loader2 size={14} className="inline animate-spin mr-1" /> Đang tải...
                </div>
              ) : devices.length === 0 ? (
                <div className="text-xs text-slate-400 py-3 text-center">
                  Chưa có thiết bị nào nhận thông báo. Bấm "Bật thông báo" ở trên.
                </div>
              ) : (
                <ul className="space-y-2">
                  {devices.map((d) => {
                    const isCurrent = (() => {
                      try { return localStorage.getItem('fcm_token_registered') === d.token; }
                      catch { return false; }
                    })();
                    const lastSeenDate = d.lastSeen ? new Date(d.lastSeen) : null;
                    const createdDate = d.createdAt ? new Date(d.createdAt) : null;
                    const isEditing = editingToken === d.token;
                    const isBusy = busyToken === d.token;
                    return (
                      <li key={d.token} className={`rounded-lg ring-1 transition ${
                        d.enabled
                          ? (isCurrent ? 'bg-emerald-50/40 ring-emerald-200' : 'bg-white ring-slate-200')
                          : 'bg-slate-100 ring-slate-200 opacity-70'
                      }`}>
                        <div className="flex items-center gap-3 px-3 py-3">
                          {/* Icon */}
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                            d.enabled
                              ? (isCurrent ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600')
                              : 'bg-slate-200 text-slate-400'
                          }`}>
                            <Bell size={16} />
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            {isEditing ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={editingLabelDraft}
                                  onChange={(e) => setEditingLabelDraft(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveEditLabel(d.token);
                                    if (e.key === 'Escape') cancelEditLabel();
                                  }}
                                  autoFocus
                                  maxLength={80}
                                  placeholder="vd: MacBook ở văn phòng"
                                  className="flex-1 px-2 py-1 text-sm border border-emerald-300 rounded focus:ring-1 focus:ring-emerald-400 outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => saveEditLabel(d.token)}
                                  disabled={isBusy}
                                  className="px-2 py-1 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white rounded font-semibold disabled:opacity-50"
                                >
                                  {isBusy ? <Loader2 size={12} className="animate-spin" /> : 'Lưu'}
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEditLabel}
                                  className="px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-100 rounded"
                                >
                                  Hủy
                                </button>
                              </div>
                            ) : (
                              <>
                                <div className="text-sm font-semibold text-slate-800 flex items-center gap-1.5 flex-wrap">
                                  <span className={d.enabled ? '' : 'line-through text-slate-400'}>{d.label}</span>
                                  {isCurrent && <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded font-bold">THIẾT BỊ NÀY</span>}
                                  {!d.enabled && <span className="text-[10px] px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded font-bold">TẠM TẮT</span>}
                                  <button
                                    type="button"
                                    onClick={() => startEditLabel(d)}
                                    className="text-slate-400 hover:text-emerald-600"
                                    title="Đổi tên thiết bị"
                                  >
                                    <KeyRound size={11} className="rotate-45 inline" style={{ marginLeft: 2 }} />
                                  </button>
                                </div>
                                <div className="text-[11px] text-slate-500 mt-0.5">
                                  {createdDate ? `Đăng ký ${createdDate.toLocaleDateString('vi-VN')}` : ''}
                                  {lastSeenDate ? ` · Hoạt động ${lastSeenDate.toLocaleDateString('vi-VN')} ${lastSeenDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : ''}
                                </div>
                              </>
                            )}
                          </div>

                          {/* Toggle ON/OFF */}
                          {!isEditing && (
                            <button
                              type="button"
                              onClick={() => handleToggleDevice(d.token, d.enabled)}
                              disabled={isBusy}
                              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                                d.enabled ? 'bg-emerald-600' : 'bg-slate-300'
                              }`}
                              title={d.enabled ? 'Bấm để tạm tắt thông báo' : 'Bấm để bật lại thông báo'}
                              aria-label={d.enabled ? 'Tắt thông báo' : 'Bật thông báo'}
                            >
                              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                                d.enabled ? 'translate-x-5' : 'translate-x-0.5'
                              }`} />
                            </button>
                          )}

                          {/* Delete button */}
                          {!isEditing && (
                            <button
                              type="button"
                              onClick={() => handleRemoveDevice(d.token, d.label)}
                              disabled={isBusy}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded disabled:opacity-50"
                              title="Xoá thiết bị (cần bật lại từ đầu nếu muốn nhận noti)"
                            >
                              {isBusy ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
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
