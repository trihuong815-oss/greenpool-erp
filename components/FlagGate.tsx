'use client';

// Phase C.2 (2026-06-07): conditional render dựa trên feature flag.
// <FlagGate flag="CMD_K_PALETTE"><Component /></FlagGate>
// Nếu flag off → render fallback (mặc định null).

import { type ReactNode } from 'react';
import { useFeatureFlag } from '@/lib/feature-flags/client';

interface Props {
  flag: string;
  children: ReactNode;
  fallback?: ReactNode;
}

export function FlagGate({ flag, children, fallback = null }: Props) {
  const enabled = useFeatureFlag(flag);
  return <>{enabled ? children : fallback}</>;
}
