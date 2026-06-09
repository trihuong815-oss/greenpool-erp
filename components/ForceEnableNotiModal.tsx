'use client';

// Phase PWA-Stability (2026-06-09): modal BẮT BUỘC bật thông báo.
//
// Khác EnableNotiBanner cũ (banner mềm có thể bỏ qua silent):
// - Modal full-screen overlay → user PHẢI tương tác
// - 2 nút rõ: "Bật ngay" hoặc "Tạm hoãn 24h" (không có 'never')
// - Nếu hoãn → record localStorage + audit log để admin biết
// - Hôm sau lại hiện
//
// Mục tiêu: 100% user lãnh đạo phải bật noti để chain duyệt + checklist
// chạy reliable.

import { useEffect, useState } from 'react';
import { Bell, BellOff, AlertTriangle } from 'lucide-react';
import { enablePushNotifications, isFcmSupported, getNotificationPermission } from '@/lib/firebase/messaging-client';

const LS_DEFER_UNTIL = 'gp_noti_force_defer_until';
const DEFER_MS = 24 * 60 * 60_000; // hoãn tối đa 24h
const SHOW_AFTER_LOGIN_MS = 2000;  // 2s sau load app

interface Props {
  /** Role code của user — để LOG xem role nào hay hoãn. */
  roleCode?: string;
}

export function ForceEnableNotiModal({ roleCode }: Props) {
  const [visible, setVisible] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState(false);

  useEffect(() => {
    // Delay 2s sau load để không block initial render
    const t = setTimeout(() => {
      if (!isFcmSupported()) {
        // iOS Safari thường — bỏ qua silent
        setUnsupported(true);
        return;
      }
      const perm = getNotificationPermission();
      if (perm === 'granted') {
        // Đã bật — không cần modal
        return;
      }
      // Check defer cache (user hoãn trong 24h)
      try {
        const until = Number(localStorage.getItem(LS_DEFER_UNTIL) ?? '0');
        if (until > Date.now()) return;
      } catch {}
      setVisible(true);
    }, SHOW_AFTER_LOGIN_MS);
    return () => clearTimeout(t);
  }, []);

  async function handleEnable() {
    setEnabling(true);
    setError(null);
    try {
      const res = await enablePushNotifications();
      if (res.ok) {
        setVisible(false);
        // Audit qua API để admin biết user vừa bật
        fetch('/api/personal/noti-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'enabled', roleCode }),
        }).catch(() => {});
        // Clear defer cache
        try { localStorage.removeItem(LS_DEFER_UNTIL); } catch {}
        return;
      }
      if (res.reason === 'denied') {
        setError('Trình duyệt đã chặn thông báo. Vào Cài đặt → Notifications → Cho phép site này, rồi mở lại app.');
      } else if (res.reason === 'unsupported') {
        setUnsupported(true);
      } else {
        setError(res.errorMsg ?? 'Không bật được. Thử lại hoặc vào /bao-mat.');
      }
    } catch (e: any) {
      setError(e?.message ?? 'Lỗi không xác định.');
    } finally {
      setEnabling(false);
    }
  }

  function handleDefer() {
    try {
      localStorage.setItem(LS_DEFER_UNTIL, String(Date.now() + DEFER_MS));
    } catch {}
    // Audit log để admin biết user hoãn
    fetch('/api/personal/noti-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'deferred', roleCode }),
    }).catch(() => {});
    setVisible(false);
  }

  if (unsupported) return null;
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[90] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
            <Bell size={22} className="text-emerald-700" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Bật thông báo</h2>
            <p className="text-xs text-slate-500">Để không bỏ sót việc cần xử lý</p>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-amber-700 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900">
              <strong>Quan trọng:</strong> Nếu không bật, anh/chị sẽ không nhận được:
              <ul className="mt-1 ml-3 list-disc space-y-0.5">
                <li>Đề xuất / giao việc chờ duyệt</li>
                <li>Tin nhắn từ đồng nghiệp</li>
                <li>Checklist chưa hoàn thành</li>
                <li>Báo cáo gửi tới</li>
              </ul>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 mb-4 text-xs text-rose-800">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <button
            onClick={handleEnable}
            disabled={enabling}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold py-3 rounded-lg inline-flex items-center justify-center gap-2 transition"
          >
            <Bell size={16} />
            {enabling ? 'Đang bật...' : 'Bật thông báo ngay'}
          </button>
          <button
            onClick={handleDefer}
            disabled={enabling}
            className="w-full text-slate-600 hover:text-slate-900 text-sm py-2 inline-flex items-center justify-center gap-2"
          >
            <BellOff size={14} />
            Tạm hoãn 24 giờ
          </button>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 text-[10px] text-slate-400 leading-relaxed">
          Sau khi cho phép, anh/chị có thể tắt từng thiết bị hoặc xem danh sách thiết bị đã bật tại trang <strong>Bảo mật → Thông báo</strong>.
        </div>
      </div>
    </div>
  );
}
