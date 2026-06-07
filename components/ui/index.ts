// Phase UI-1 + UI-2 (2026-06-07): UI components barrel.
// Import: import { Button, Input, Card, Skeleton, EmptyState, useToast } from '@/components/ui';

// ─── UI-1: Foundation primitives ───
export { Button } from './Button';
export type { ButtonVariant, ButtonSize } from './Button';

export { Input } from './Input';

export { Card, CardHeader, CardTitle, CardBody } from './Card';

export { Badge } from './Badge';
export type { BadgeTone, BadgeSize } from './Badge';

// ─── UI-2: Mobile polish ───
export { BottomNavBar } from './BottomNavBar';

export { Skeleton, SkeletonCard, SkeletonList, SkeletonTable, SkeletonKpiGrid } from './Skeleton';

export { EmptyState } from './EmptyState';

export { ToastProvider, useToast } from './Toast';
export type { ToastTone } from './Toast';

// ─── UI-3: Desktop pro ───
export { CommandPaletteProvider, useCommandPalette } from './CommandPalette';
