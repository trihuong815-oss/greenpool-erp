'use client';

// Phase PWA-Stability (2026-06-09): banner cảnh báo persistent khi noti unhealthy.
// Tự gọi API /noti-health khi mount + mỗi 10 phút. Hiện banner đỏ nếu critical,
// vàng nếu warning. User bấm "Bật lại" → force refresh + re-register.

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, RefreshCw, X } from 'lucide-react';
import { forceRefreshPushSetup } from '@/lib/firebase/messaging-client';
import { runHealingCheck } from '@/lib/firebase/messaging-stability';

type Status = 'healthy' | 'warning' | 'critical' | 'none';

interface HealthResp {
  status: Status;
  message: string;
  action: 'none' | 'enable' | 'refresh';
  devices?: number;
  freshestAgeMs?: number;
}

const CHECK_INTERVAL_MS = 10 * 60_000; // 10 phút
const LS_DISMISSED = 'gp_noti_health_dismissed_until';

export function NotiHealthBanner() {
  const [data, setData] = useState<HealthResp | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/personal/noti-health', { cache: 'no-store' });
      if (!res.ok) return;
      const d = (await res.json()) as HealthResp;
      setData(d);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    // Đọc dismissed cache (dismiss 1h)
    try {
      const until = Number(localStorage.getItem(LS_DISMISSED) ?? '0');
      if (until > Date.now()) setDismissed(true);
    } catch {}

    fetchHealth();
    const id = setInterval(fetchHealth, CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchHealth]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      // 1. Try silent healing first
      const heal = await runHealingCheck({ force: true });
      // 2. Nếu vẫn không sent → force refresh full (re-register SW + token)
      if (heal.kind !== 'sent') {
        await forceRefreshPushSetup();
      }
      // 3. Re-check health
      await fetchHealth();
    } catch (e: any) {
      console.warn('[NotiHealthBanner] refresh fail:', e?.message);
    } finally {
      setRefreshing(false);
    }
  }

  function handleDismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(LS_DISMISSED, String(Date.now() + 60 * 60_000)); // 1h
    } catch {}
  }

  // Healthy hoặc dismissed hoặc chưa load → ẩn
  if (!data || dismissed) return null;
  if (data.status === 'healthy') return null;
  // status='none' (chưa bật) — không hiện banner cảnh báo, để EnableNotiBanner cũ xử lý.
  if (data.status === 'none') return null;

  const isCritical = data.status === 'critical';
  const Icon = isCritical ? AlertCircle : AlertTriangle;
  const styles = isCritical
    ? 'bg-rose-50 border-rose-300 text-rose-800'
    : 'bg-amber-50 border-amber-300 text-amber-800';

  return (
    <div className={`border-b-2 ${styles} px-3 py-2 flex items-start gap-2 text-sm`}>
      <Icon size={18} className="shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="font-semibold">
          {isCritical ? 'Thông báo có thể không tới' : 'Cảnh báo độ ổn định thông báo'}
        </div>
        <div className="text-xs mt-0.5 opacity-90">{data.message}</div>
      </div>
      {data.action === 'refresh' && (
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold ${
            isCritical
              ? 'bg-rose-700 hover:bg-rose-800 text-white'
              : 'bg-amber-600 hover:bg-amber-700 text-white'
          } disabled:opacity-60`}
        >
          <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Đang bật...' : 'Bật lại noti'}
        </button>
      )}
      <button
        onClick={handleDismiss}
        className="shrink-0 text-slate-500 hover:text-slate-800 p-1"
        aria-label="Tạm ẩn"
        title="Tạm ẩn 1 giờ"
      >
        <X size={14} />
      </button>
    </div>
  );
}
