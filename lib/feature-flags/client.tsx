'use client';

// Phase C.2 (2026-06-07): client-side feature flag context.
//
// Pattern:
// - Server load tất cả flags (loadAllFlags) trong layout RSC.
// - Pass resolved Record<string, boolean> qua FeatureFlagsProvider.
// - useFeatureFlag('CMD_K_PALETTE') trả boolean (default true nếu provider miss).
// - KHÔNG pass function/server-only types — pure JSON serializable.

import { createContext, useContext, type ReactNode } from 'react';
import { FEATURE_FLAGS } from './registry';

const Ctx = createContext<Record<string, boolean> | null>(null);

export function FeatureFlagsProvider({
  flags,
  children,
}: {
  flags: Record<string, boolean>;
  children: ReactNode;
}) {
  return <Ctx.Provider value={flags}>{children}</Ctx.Provider>;
}

/**
 * Trả về true nếu flag enabled cho user hiện tại.
 * Default: defaultEnabled của registry nếu provider miss (vd tree chưa wrap).
 */
export function useFeatureFlag(key: string): boolean {
  const ctx = useContext(Ctx);
  if (ctx && key in ctx) return ctx[key];
  // Fallback từ static registry — đảm bảo render không break khi provider miss.
  const def = FEATURE_FLAGS[key];
  return def ? def.defaultEnabled : false;
}
