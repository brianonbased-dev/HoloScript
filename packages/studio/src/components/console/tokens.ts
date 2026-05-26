/**
 * Console design tokens — the single source of truth every Front surface
 * inherits (D.066, interaction-first design system).
 *
 * Doctrine: humans tap / swipe / click / talk / conversational-type. There is
 * NO command or file primitive. Every interactive target is at least
 * `tap.min` px so it is reachable on a Quest controller ray and a phone thumb,
 * and nothing depends on hover (Quest + touch have no hover). One source — no
 * per-screen restyle.
 */

export const tokens = {
  color: {
    bg: '#0b1020',
    surface: '#111827',
    surfaceAlt: '#0c1f14',
    accent: '#1f6feb',
    success: '#16a34a',
    successText: '#4ade80',
    successSurface: '#0f2a1a',
    warn: '#b45309',
    warnText: '#f59e0b',
    warnSurface: '#1c1207',
    danger: '#ef4444',
    text: '#e5e7eb',
    textDim: '#94a3b8',
    border: '#1f2937',
  },
  space: { xs: 6, sm: 10, md: 14, lg: 16, xl: 24 },
  radius: { sm: 8, md: 10, lg: 14, pill: 999 },
  /** Minimum interactive target, in px. Quest-ray + phone-thumb legible (D.066). */
  tap: { min: 64 },
  font: {
    label: 11,
    body: 13,
    chip: 15,
    tile: 16,
    title: 18,
  },
  weight: { regular: 500, bold: 800, heavy: 900 },
} as const;

/**
 * Base style for any tap/click target. Guarantees the >=64px minimum and an
 * explicit (non-hover) appearance. Spread this first, then override colors.
 * Keeping it a function (not a frozen object) lets callers extend without
 * mutating the shared token source.
 */
export function tapTargetStyle(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    minHeight: tokens.tap.min,
    display: 'flex',
    alignItems: 'center',
    gap: tokens.space.sm,
    padding: `${tokens.space.md}px ${tokens.space.lg}px`,
    borderRadius: tokens.radius.sm,
    background: tokens.color.surface,
    color: tokens.color.text,
    border: `1px solid ${tokens.color.border}`,
    fontSize: tokens.font.chip,
    fontWeight: tokens.weight.bold,
    textDecoration: 'none',
    cursor: 'pointer',
    // Interaction-first: state is conveyed by explicit color/opacity, never by
    // a CSS hover rule a Quest controller or touch screen cannot trigger.
    font: 'inherit',
    textAlign: 'left',
    ...overrides,
  };
}
