'use client';

// Banner cảnh báo: hiện khi user chưa bật notification trên thiết bị này.
// Pattern audit 2026-05-31: 12/14 user trọng yếu chưa có FCM token → MISS noti khi
// có đề xuất chờ duyệt. Banner xuất hiện trên Dashboard để user thấy NGAY khi login.
//
// Logic:
// - Hiện khi Notification.permission === 'default' (chưa quyết) HOẶC === 'granted' nhưng
//   chưa có token local cache (re-install PWA, đổi device, clear cache).
// - Ẩn khi đã grant + đã có token cache.
// - Ẩn nếu trình duyệt không hỗ trợ (vd Safari iOS < 16.4 không PWA).
// - Có nút "Bật ngay" → gọi enablePushNotifications() trực tiếp.
// - Có nút "Để sau" (X) → ẩn 24h (lưu localStorage), tránh spam.

import { useEffect, useState } from 'react';
import { Bell, X, Loader2, CheckCircle2 } from 'lucide-react';
import { enablePushNotifications, getNotificationPermission, isFcmSupported } from '@/lib/firebase/messaging-client';

const DISMISS_KEY = 'enable_noti_banner_dismissed_at';
const PERMANENT_DISMISS_KEY = 'enable_noti_banner_dismissed_permanent';
const DISMISS_HOURS = 24;

export function EnableNotiBanner() {
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isFcmSupported()) return;
    let cancelled = false;
    (async () => {
      // 1. Vĩnh viễn ẩn nếu user đã chọn "Tôi đã bật ở thiết bị khác"
      try {
        if (localStorage.getItem(PERMANENT_DISMISS_KEY) === '1') return;
      } catch {}
      // 2. Dismiss 24h thường
      try {
        const dismissedAt = localStorage.getItem(DISMISS_KEY);
        if (dismissedAt) {
          const ms = Date.now() - Number(dismissedAt);
          if (ms < DISMISS_HOURS * 3600_000) return;
        }
      } catch {}
      // 3. Permission + token cache LOCAL
      const perm = getNotificationPermission();
      let cachedToken: string | null = null;
      try { cachedToken = localStorage.getItem('fcm_token_registered'); } catch {}
      const localOK = perm === 'granted' && !!cachedToken;
      if (localOK) return;   // device này đã bật rồi

      // 4. Check server: user đã có token ở DEVICE NÀO khác chưa?
      //    Nếu có ≥ 1 token → user nhận noti được ở device khác → KHÔNG cần ép bật ở đây.
      try {
        const res = await fetch('/api/personal/fcm-token', { cache: 'no-store' });
        if (res.ok) {
          const j = await res.json() as { hasAny?: boolean };
          if (j.hasAny) return;       // đã có ≥ 1 device → không hiện banner
        }
      } catch { /* network fail → fall through */ }

      // 5. Mới tới đây: chưa có token ở bất kỳ device nào → hiện banner
      if (cancelled) return;
      if (perm === 'default' || (perm === 'granted' && !cachedToken)) {
        setShow(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleEnable() {
    setStatus('loading');
    setErrorMsg(null);
    const res = await enablePushNotifications();
    if (res.ok) {
      setStatus('success');
      setTimeout(() => setShow(false), 1500);
    } else {
      setStatus('error');
      const reasonMap: Record<string, string> = {
        unsupported: 'Trình duyệt không hỗ trợ thông báo. Dùng Chrome/Edge/Safari (iOS 16.4+) qua PWA.',
        denied: 'Bạn đã chặn thông báo. Vui lòng vào cài đặt trình duyệt → cho phép thông báo cho trang này.',
        'no-vapid': 'Hệ thống chưa cấu hình VAPID key. Báo admin.',
        error: res.errorMsg ?? 'Lỗi không xác định',
      };
      setErrorMsg(reasonMap[res.reason ?? 'error'] ?? res.errorMsg ?? 'Lỗi không xác định');
    }
  }

  function handleDismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setShow(false);
  }

  function handleDismissPermanent() {
    try { localStorage.setItem(PERMANENT_DISMISS_KEY, '1'); } catch {}
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="mb-4 rounded-xl border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
          <Bell size={18} className="text-amber-700" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm text-amber-900 mb-0.5">
            Bật thông báo để không bỏ lỡ đề xuất / nhiệm vụ
          </div>
          <div className="text-xs text-amber-800 leading-relaxed">
            Hiện tại thiết bị này <strong>chưa nhận thông báo</strong>. Khi có đề xuất gửi cho bạn duyệt
            hoặc nhiệm vụ giao mới, bạn sẽ không biết đến tận khi mở app. Bật 1 lần — chạy ngầm cả khi đóng app.
          </div>
          {status === 'success' && (
            <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <CheckCircle2 size={14} /> Đã bật! Bạn sẽ nhận noti từ giờ.
            </div>
          )}
          {status === 'error' && errorMsg && (
            <div className="mt-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1.5">
              {errorMsg}
            </div>
          )}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleEnable}
              disabled={status === 'loading' || status === 'success'}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-600 text-white text-xs font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-50 shadow-sm"
            >
              {status === 'loading' && <Loader2 size={12} className="animate-spin" />}
              {status === 'success' ? '✓ Đã bật' : 'Bật thông báo ngay'}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="px-2 py-1.5 text-xs text-amber-700 hover:bg-amber-100 rounded"
            >
              Để sau (24h)
            </button>
            <button
              type="button"
              onClick={handleDismissPermanent}
              className="px-2 py-1.5 text-xs text-amber-700 hover:bg-amber-100 rounded underline"
              title="Ẩn vĩnh viễn trên thiết bị này. Mở lại trong /bao-mat nếu cần."
            >
              Đã bật ở thiết bị khác
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="text-amber-400 hover:text-amber-700 flex-shrink-0"
          aria-label="Đóng"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
