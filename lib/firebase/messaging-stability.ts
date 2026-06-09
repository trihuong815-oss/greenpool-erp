// Phase PWA-Stability (2026-06-09): self-healing notification subscription.
//
// Vấn đề: web push subscription thường mất sau idle dài / browser update / SW kill
// / token Firebase expire. User không biết noti đã chết cho đến khi cần.
//
// Giải pháp 4 lớp:
//   1. Heartbeat — mỗi 6h ping server cập nhật lastSeen
//   2. Visibility — mỗi lần user focus app sau idle → check token
//   3. Stale detection — nếu lastSeen > 24h → tự re-register
//   4. 404 self-heal — heartbeat trả 404 (token bị server xoá) → re-register
//
// Constraint:
// - KHÔNG spam re-register (rate limit: 1 attempt / 5 phút)
// - KHÔNG hỏi permission lại (đã có → silent retry; chưa có → skip)
// - Log mọi action để debug

'use client';

import { enablePushNotifications, getCurrentFcmToken } from './messaging-client';

const LS_LAST_HEARTBEAT = 'gp_noti_last_heartbeat';
const LS_LAST_REREGISTER = 'gp_noti_last_reregister';
const LS_CURRENT_TOKEN = 'gp_noti_current_token';

const HEARTBEAT_INTERVAL_MS = 6 * 60 * 60_000; // 6h
const REREGISTER_COOLDOWN_MS = 5 * 60_000;     // 5 phút
const STALE_THRESHOLD_MS = 24 * 60 * 60_000;   // 24h

type HeartbeatResult =
  | { kind: 'sent' }
  | { kind: 'token-stale'; reason: string }
  | { kind: 'no-token' }
  | { kind: 'skipped'; reason: string }
  | { kind: 'unhealed-error'; error: string };

function log(...args: any[]) {
  console.log('[noti-stability]', ...args);
}

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, val: string): void {
  try { localStorage.setItem(key, val); } catch {}
}

/** Gọi server heartbeat. Returns true nếu token vẫn valid; false nếu cần re-register. */
async function pingHeartbeat(token: string): Promise<{ ok: boolean; needsReregister: boolean; err?: string }> {
  try {
    const res = await fetch('/api/personal/fcm-token/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (res.ok) {
      safeSet(LS_LAST_HEARTBEAT, String(Date.now()));
      return { ok: true, needsReregister: false };
    }
    if (res.status === 404) {
      // Server đã xoá token (vd cleanup do invalid) — cần re-register.
      return { ok: false, needsReregister: true, err: 'token not in server fcmDevices' };
    }
    return { ok: false, needsReregister: false, err: `HTTP ${res.status}` };
  } catch (e: any) {
    return { ok: false, needsReregister: false, err: e?.message ?? 'fetch fail' };
  }
}

/** Re-register token (silent). Skip nếu cooldown chưa hết hoặc permission chưa granted. */
async function silentReregister(): Promise<{ ok: boolean; reason?: string; newToken?: string }> {
  const lastTs = Number(safeGet(LS_LAST_REREGISTER) ?? '0');
  if (Date.now() - lastTs < REREGISTER_COOLDOWN_MS) {
    return { ok: false, reason: 'cooldown' };
  }
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return { ok: false, reason: 'permission not granted' };
  }
  safeSet(LS_LAST_REREGISTER, String(Date.now()));
  log('attempting silent re-register');
  const res = await enablePushNotifications();
  if (res.ok && res.token) {
    safeSet(LS_CURRENT_TOKEN, res.token);
    log('silent re-register OK, token=', res.token.slice(0, 20) + '...');
    return { ok: true, newToken: res.token };
  }
  return { ok: false, reason: res.reason ?? res.errorMsg ?? 'unknown' };
}

/** Quy trình self-healing: lấy token hiện tại → ping heartbeat → re-register nếu cần. */
export async function runHealingCheck(opts?: { force?: boolean }): Promise<HeartbeatResult> {
  // Check stale based on last heartbeat
  const lastHeartbeatTs = Number(safeGet(LS_LAST_HEARTBEAT) ?? '0');
  const sinceLastMs = Date.now() - lastHeartbeatTs;
  if (!opts?.force && lastHeartbeatTs > 0 && sinceLastMs < HEARTBEAT_INTERVAL_MS) {
    return { kind: 'skipped', reason: `heartbeat fresh (${Math.round(sinceLastMs / 60_000)}m ago)` };
  }

  // Get current token from Firebase Messaging SDK
  let token: string | null = null;
  try {
    token = await getCurrentFcmToken();
  } catch (e: any) {
    log('getCurrentFcmToken fail:', e?.message);
  }

  if (!token) {
    log('no current token — skip heartbeat');
    return { kind: 'no-token' };
  }

  safeSet(LS_CURRENT_TOKEN, token);
  log('ping heartbeat for token', token.slice(0, 20) + '...');
  const result = await pingHeartbeat(token);

  if (result.ok) {
    log('heartbeat OK');
    return { kind: 'sent' };
  }

  if (result.needsReregister) {
    log('server says token stale, attempting re-register');
    const reReg = await silentReregister();
    if (reReg.ok) {
      // Heartbeat with new token
      if (reReg.newToken) await pingHeartbeat(reReg.newToken);
    }
    return { kind: 'token-stale', reason: result.err ?? 'token stale' };
  }

  return { kind: 'unhealed-error', error: result.err ?? 'unknown' };
}

/** Check if current token is stale (lastSeen too old per localStorage cache). */
export function isLocallyStale(): boolean {
  const lastTs = Number(safeGet(LS_LAST_HEARTBEAT) ?? '0');
  if (lastTs === 0) return true; // chưa bao giờ heartbeat
  return Date.now() - lastTs > STALE_THRESHOLD_MS;
}
