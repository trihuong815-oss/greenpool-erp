'use client';

// V6.5 (2026-06-14): Banner ép user iOS Safari "Add to Home Screen" để Web Push hoạt động.
//
// Root cause anh gặp noti chập chờn:
//   iOS Safari KHÔNG deliver Web Push notification nếu app chưa được installed
//   (Add to Home Screen). Token FCM vẫn valid, server vẫn accept push, NHƯNG
//   noti banner KHÔNG hiện trên thiết bị (chỉ in-app khi đang focus).
//
// Logic:
//   - Detect: iOS Safari + chưa standalone (display-mode standalone hoặc navigator.standalone)
//   - Hiện banner 1 lần / 7 ngày (dismissible)
//   - Có hướng dẫn 3 bước rõ ràng
//   - Ẩn tự động khi user đã install (sau re-open từ Home Screen)

import { useEffect, useState } from 'react';
import { Smartphone, X, Share, Plus } from 'lucide-react';

const DISMISS_KEY = 'ios_install_banner_dismissed_at';
const DISMISS_DAYS = 7;

function detectIosSafariNotInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua);
  if (!isIos) return false;
  // iOS Safari (không phải Chrome iOS / Edge iOS — đều dùng WebKit nhưng UA khác)
  const isSafari = /Safari/.test(ua) && !/CriOS|EdgiOS|FxiOS/.test(ua);
  if (!isSafari) return false;
  // Check standalone (đã installed)
  const isStandalone = ('standalone' in window.navigator && (window.navigator as any).standalone === true)
    || window.matchMedia('(display-mode: standalone)').matches;
  return !isStandalone;
}

export function IOSInstallPwaBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!detectIosSafariNotInstalled()) return;
    try {
      const dismissedAt = localStorage.getItem(DISMISS_KEY);
      if (dismissedAt) {
        const ms = Date.now() - Number(dismissedAt);
        if (ms < DISMISS_DAYS * 24 * 60 * 60_000) return;
      }
    } catch { /* localStorage có thể bị block */ }
    setShow(true);
  }, []);

  if (!show) return null;

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setShow(false);
  }

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
      <div className="max-w-4xl mx-auto flex items-start gap-3">
        <div className="shrink-0 w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
          <Smartphone size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900">
            Cài Green Pool vào Màn hình chính để nhận thông báo ổn định
          </p>
          <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
            iOS Safari chỉ gửi thông báo đẩy khi app đã được "Thêm vào Màn hình chính".
            Mở app từ Safari sẽ không nhận noti khi tắt màn.
          </p>
          <ol className="text-xs text-amber-900 mt-2 space-y-1 leading-relaxed">
            <li className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-amber-200 text-amber-900 text-[10px] font-bold flex items-center justify-center shrink-0">1</span>
              Bấm nút <Share size={12} className="inline mx-0.5" /> Share (dưới màn)
            </li>
            <li className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-amber-200 text-amber-900 text-[10px] font-bold flex items-center justify-center shrink-0">2</span>
              Chọn <Plus size={12} className="inline mx-0.5" /> "Add to Home Screen" / "Thêm vào Màn hình chính"
            </li>
            <li className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-amber-200 text-amber-900 text-[10px] font-bold flex items-center justify-center shrink-0">3</span>
              Mở app từ icon Home Screen → bật noti lại
            </li>
          </ol>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 w-7 h-7 rounded-md text-amber-700 hover:bg-amber-100 flex items-center justify-center"
          aria-label="Đóng"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
