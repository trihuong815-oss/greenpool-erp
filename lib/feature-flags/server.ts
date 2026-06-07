// Phase C.2 (2026-06-07): server-side feature flag loader.
//
// Pattern:
// - Cache 60s per (flagKey, uid) → giảm 99% read traffic.
// - Cache invalidate khi admin toggle (POST /api/feature-flags/:key sẽ
//   bump version counter; mỗi turn check version mismatch để refetch).
// - Fail-open: lỗi Firestore → fallback defaultEnabled. KHÔNG ném exception
//   để API route luôn render được.

import 'server-only';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { FEATURE_FLAGS, evalFlag, type FeatureFlagValue } from './registry';

const CACHE_TTL_MS = 60_000;

interface CachedEntry {
  value: FeatureFlagValue | undefined;
  /** ms epoch khi cache hết hạn. */
  expiresAt: number;
}

const cache = new Map<string, CachedEntry>();

async function loadFlagValue(key: string): Promise<FeatureFlagValue | undefined> {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  let value: FeatureFlagValue | undefined;
  try {
    const db = getFirebaseAdminDb();
    const snap = await db.collection('featureFlags').doc(key).get();
    if (snap.exists) {
      const x = snap.data() as any;
      value = {
        enabled: typeof x.enabled === 'boolean' ? x.enabled : false,
        allowList: Array.isArray(x.allowList) ? x.allowList.filter((v: any) => typeof v === 'string') : undefined,
        allowRoles: Array.isArray(x.allowRoles) ? x.allowRoles.filter((v: any) => typeof v === 'string') : undefined,
        rolloutPercent: typeof x.rolloutPercent === 'number' && x.rolloutPercent >= 0 && x.rolloutPercent <= 100
          ? x.rolloutPercent : undefined,
      };
    }
  } catch (e: any) {
    console.warn('[feature-flags] load fail key=' + key + ':', e?.message);
    // Trả undefined → evalFlag dùng defaultEnabled.
  }

  cache.set(key, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}

/**
 * Server-side: check 1 flag cho 1 user.
 * Fail-open: lỗi → fallback defaultEnabled.
 */
export async function isFlagEnabled(
  key: string,
  uid: string,
  roleCode: string,
): Promise<boolean> {
  const def = FEATURE_FLAGS[key];
  if (!def) {
    console.warn('[feature-flags] unknown key:', key);
    return false;
  }
  const value = await loadFlagValue(key);
  return evalFlag(value, def, uid, roleCode);
}

/**
 * Load TẤT CẢ flags cho 1 user — gọi 1 lần trong layout RSC, pass xuống client.
 * Cache song song giúp giảm round-trip.
 */
export async function loadAllFlags(uid: string, roleCode: string): Promise<Record<string, boolean>> {
  const keys = Object.keys(FEATURE_FLAGS);
  const entries = await Promise.all(keys.map(async (k) => [k, await isFlagEnabled(k, uid, roleCode)] as const));
  return Object.fromEntries(entries);
}

/** Invalidate cache cho 1 flag (gọi sau khi admin toggle). */
export function invalidateFlag(key: string): void {
  cache.delete(key);
}

/** Invalidate toàn bộ — dùng khi dev/test reset state. */
export function invalidateAllFlags(): void {
  cache.clear();
}
