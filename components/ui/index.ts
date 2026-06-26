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
export { KeyboardShortcuts } from './KeyboardShortcuts';

// ─── UI-4: Pixel-match design system (PR-UI-PIXEL-MATCH B1, 2026-06-26) ───
// Bộ primitive khoá chuẩn UI Green Pool. Mọi page/module mới PHẢI dùng từ đây
// — KHÔNG tạo lại KpiCard/StatusBadge/Drawer ad-hoc. Spec: docs/green-pool-ui-design-system.md.
export { PageHeader } from './PageHeader';
export type { Crumb } from './PageHeader';

export { StatCard, SegmentSummary } from './StatCard';
export type { StatCardTone } from './StatCard';

export { StatusPill } from './StatusPill';

export { TableWrap, Num, formatVnd, formatMillion } from './TableWrap';

export { FilterPanel, Field } from './FilterPanel';

export { Drawer } from './Drawer';
