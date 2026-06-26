// components/ui/StatusPill.tsx
// PR-UI-PIXEL-MATCH B1 (2026-06-26): port từ code-10diem.
// Pixel-spec: rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset
//             + chấm tròn 1.5x1.5 phía trước (dot=true)
// Tone semantic qua taxonomy chung `@/lib/status` — không hardcode màu.

import { TONE_CLASS, type StatusTone } from '@/lib/status';

type Props = {
  tone: StatusTone;
  children: React.ReactNode;
  /** Chấm tròn dot trước label. Default true. Set false cho pill chỉ text. */
  dot?: boolean;
  className?: string;
};

export function StatusPill({ tone, children, dot = true, className = '' }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE_CLASS[tone]} ${className}`}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
