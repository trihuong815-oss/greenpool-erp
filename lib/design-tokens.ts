// Phase UI-1 (2026-06-07): Design system tokens cho Green Pool ERP.
// Single source of truth cho colors, spacing, typography, shadows, radii.
// Mọi component reference token, KHÔNG hardcode className lung tung.
//
// Why: hiện tại 50K+ LOC dùng Tailwind class inline → đổi brand color phải edit 200+ file.
// Token + component variants → đổi 1 chỗ, mọi nơi tự update.

// ─────────────────────────────────────────────────────────────────
// Colors — semantic naming (không phải hex)
// ─────────────────────────────────────────────────────────────────
export const colors = {
  // Brand
  brand: {
    primary: 'emerald-600',      // CTA, link, active state
    primaryHover: 'emerald-700',
    primaryLight: 'emerald-50',  // tag, badge bg light
    secondary: 'cyan-600',       // accent
  },
  // Neutrals
  neutral: {
    text: 'slate-900',           // primary text
    textMuted: 'slate-600',      // secondary text
    textSubtle: 'slate-400',     // hint/caption
    border: 'slate-200',
    borderStrong: 'slate-300',
    bg: 'white',
    bgMuted: 'slate-50',
    bgHover: 'slate-100',
  },
  // Semantic
  semantic: {
    success: 'emerald-600',
    successBg: 'emerald-50',
    warning: 'amber-600',
    warningBg: 'amber-50',
    error: 'rose-600',
    errorBg: 'rose-50',
    info: 'blue-600',
    infoBg: 'blue-50',
  },
} as const;

// ─────────────────────────────────────────────────────────────────
// Typography scale — responsive
// ─────────────────────────────────────────────────────────────────
export const typography = {
  // Body text
  body: 'text-sm sm:text-base',         // 14px mobile, 16px desktop
  bodySm: 'text-xs sm:text-sm',
  bodyLg: 'text-base sm:text-lg',
  // Headings — page section header
  h1: 'text-2xl sm:text-3xl font-bold',
  h2: 'text-xl sm:text-2xl font-semibold',
  h3: 'text-lg sm:text-xl font-semibold',
  h4: 'text-base sm:text-lg font-semibold',
  // Numbers — KPI display
  numLg: 'text-lg sm:text-2xl md:text-3xl font-bold tabular-nums',
  numMd: 'text-base sm:text-lg font-bold tabular-nums',
  numSm: 'text-sm font-semibold tabular-nums',
  // Caption/label
  caption: 'text-xs text-slate-500',
  label: 'text-xs font-semibold uppercase tracking-wider text-slate-600',
} as const;

// ─────────────────────────────────────────────────────────────────
// Spacing — page padding, gap
// ─────────────────────────────────────────────────────────────────
export const spacing = {
  pageX: 'px-3 sm:px-4 md:px-6',       // page horizontal padding
  pageY: 'py-3 sm:py-4 md:py-6',
  card: 'p-3 sm:p-4 md:p-5',           // card padding
  cardCompact: 'p-2 sm:p-3',
  section: 'space-y-4 sm:space-y-6',   // vertical section gap
  inline: 'gap-2 sm:gap-3',            // horizontal inline gap
  inlineTight: 'gap-1 sm:gap-2',
} as const;

// ─────────────────────────────────────────────────────────────────
// Shadow elevation — purposeful per layer
// ─────────────────────────────────────────────────────────────────
export const shadow = {
  none: '',
  sm: 'shadow-sm',                     // card resting
  md: 'shadow-md',                     // card hover, dropdown
  lg: 'shadow-lg',                     // modal, popover
  xl: 'shadow-xl',                     // dialog, sheet
  inset: 'shadow-inner',
} as const;

// ─────────────────────────────────────────────────────────────────
// Border radius
// ─────────────────────────────────────────────────────────────────
export const radius = {
  sm: 'rounded',                       // chips, badges
  md: 'rounded-lg',                    // input, button
  lg: 'rounded-xl',                    // card
  xl: 'rounded-2xl',                   // modal, hero
  full: 'rounded-full',                // pill, avatar
} as const;

// ─────────────────────────────────────────────────────────────────
// Touch targets — Apple HIG ≥44px, Material ≥48px
// ─────────────────────────────────────────────────────────────────
export const touch = {
  // Min size cho interactive element mobile
  minSize: 'min-h-[44px] min-w-[44px]',  // Apple guideline
  // Sizing chuẩn cho button
  btnSm: 'h-9 px-3',                     // 36px - chỉ desktop
  btnMd: 'h-10 sm:h-9 px-4',             // 40px mobile, 36px desktop
  btnLg: 'h-11 px-5',                    // 44px - mobile-friendly
  // Icon button
  iconBtnSm: 'p-2 sm:p-1.5',
  iconBtnMd: 'p-2.5 sm:p-2',
  iconBtnLg: 'p-3',
} as const;

// ─────────────────────────────────────────────────────────────────
// Animation / transition
// ─────────────────────────────────────────────────────────────────
export const motion = {
  base: 'transition',
  fast: 'transition duration-150',
  smooth: 'transition duration-200 ease-out',
  bounce: 'transition duration-300 ease-out hover:scale-[1.02]',
} as const;

// ─────────────────────────────────────────────────────────────────
// Z-index scale — purposeful layers
// ─────────────────────────────────────────────────────────────────
export const zIndex = {
  base: 'z-0',
  dropdown: 'z-10',
  sticky: 'z-20',
  modalBackdrop: 'z-40',
  modal: 'z-50',
  toast: 'z-[60]',
  tooltip: 'z-[70]',
} as const;

// ─────────────────────────────────────────────────────────────────
// Focus ring — accessibility (keyboard navigation)
// ─────────────────────────────────────────────────────────────────
export const focus = {
  ring: 'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2',
  ringInset: 'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500',
} as const;
