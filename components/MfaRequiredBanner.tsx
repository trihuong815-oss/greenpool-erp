'use client';

// Banner cảnh báo bắt buộc 2FA cho cấp lãnh đạo (ADMIN/CEO/GD_KD/GD_VP).
// Hiện trên top mọi page nếu user thuộc role bắt buộc & chưa enroll factor nào.
// Click → đi tới /bao-mat để setup.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { getAuth, multiFactor } from 'firebase/auth';
import { getFirebaseClient } from '@/lib/firebase/client';

const REQUIRED_ROLES = new Set(['ADMIN', 'CEO', 'GD_KD', 'GD_VP']);

export function MfaRequiredBanner({ roleCode }: { roleCode: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!REQUIRED_ROLES.has(roleCode)) return;
    const auth = getAuth(getFirebaseClient());
    const stop = auth.onAuthStateChanged((u) => {
      if (!u) { setShow(false); return; }
      try {
        const factors = multiFactor(u).enrolledFactors;
        setShow(factors.length === 0);
      } catch {
        setShow(false);
      }
    });
    return () => stop();
  }, [roleCode]);

  if (!show) return null;
  return (
    <Link href="/bao-mat"
      className="block bg-rose-50 border-b-2 border-rose-300 px-4 py-2 hover:bg-rose-100 transition">
      <div className="max-w-7xl mx-auto flex items-center gap-3 text-rose-900">
        <ShieldAlert size={18} className="shrink-0" />
        <div className="flex-1 text-sm">
          <span className="font-bold">Bắt buộc bật 2FA — </span>
          Vai trò <strong>{roleCode}</strong> yêu cầu xác thực 2 yếu tố. Click để setup ngay.
        </div>
        <span className="text-xs underline font-semibold">Setup →</span>
      </div>
    </Link>
  );
}
