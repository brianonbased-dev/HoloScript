import * as React from 'react';
import { cn } from '../utils/cn';

/**
 * UncertaintyIndicator — reusable, unobtrusive uncertainty/confidence overlay.
 *
 * Visualizes a single uncertainty value across HoloScript surfaces:
 *  - Studio panels (per-cell or per-result confidence chips)
 *  - r3f-renderer HUD overlays (confidence next to a 3D label)
 *  - r3f-core component badges (model agreement, calibration)
 *
 * Accepts ONE of three input shapes (mutually exclusive — one must be set):
 *  - `confidence`: 0..1 (high = good)               — e.g. ProphecyFrame.RadianceProbe.confidence
 *  - `uncertainty`: 0..1 (low = good, inverted)     — e.g. UncertaintyCloud per-node values
 *  - `severity`: 0..100 (low = good, scaled)        — e.g. CrossValidationRegistry divergence
 *
 * Variants:
 *  - `ring`  (default) — SVG ring around children, sized to fit
 *  - `badge`           — inline pill with percent + level label
 *  - `dot`             — small absolutely-positioned corner dot (decorates a parent)
 *
 * Accessibility:
 *  - Always renders a visually-hidden text alternative announcing the value + level
 *  - `role="img"` with `aria-label` so screen readers get a single concise utterance
 *  - Color is never the sole signal — text + level label always present
 *  - Falls back to a neutral "unknown" treatment when value is invalid
 */

export type UncertaintyVariant = 'ring' | 'badge' | 'dot';

export interface UncertaintyIndicatorProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Confidence in [0,1]. High = good. Mutually exclusive with `uncertainty` / `severity`. */
  confidence?: number;
  /** Uncertainty in [0,1]. Low = good. Mutually exclusive with `confidence` / `severity`. */
  uncertainty?: number;
  /** Divergence severity in [0,100] (CrossValidationRegistry). Low = good. */
  severity?: number;
  /** Optional human-readable label for screen readers (e.g., "Model agreement"). */
  label?: string;
  /** Visual style. Default: 'ring'. */
  variant?: UncertaintyVariant;
  /** Pixel size for ring/dot. Default: 24 for ring, 8 for dot. */
  size?: number;
  /** Children appear inside the ring (ignored for badge/dot). */
  children?: React.ReactNode;
}

// =============================================================================
// Color & level mapping (mirrors CalibrationUncertaintyIndicator thresholds)
// =============================================================================

interface Resolved {
  /** Confidence in [0,1] after normalization. */
  confidence: number;
  /** True if input was missing or invalid. */
  unknown: boolean;
}

function resolveValue(props: UncertaintyIndicatorProps): Resolved {
  const { confidence, uncertainty, severity } = props;
  const set = [confidence, uncertainty, severity].filter((v) => v !== undefined);
  if (set.length === 0) return { confidence: 0, unknown: true };

  let v: number;
  if (confidence !== undefined) v = confidence;
  else if (uncertainty !== undefined) v = 1 - uncertainty;
  else v = 1 - (severity as number) / 100;

  if (!Number.isFinite(v)) return { confidence: 0, unknown: true };
  // Clamp to [0,1]
  return { confidence: Math.max(0, Math.min(1, v)), unknown: false };
}

function levelLabel(c: number): string {
  if (c >= 0.9) return 'Very High';
  if (c >= 0.75) return 'High';
  if (c >= 0.6) return 'Moderate';
  if (c >= 0.4) return 'Low';
  return 'Very Low';
}

/**
 * Tailwind classes by tier. Five buckets matching CalibrationUncertaintyIndicator
 * so visual language is consistent across surfaces.
 */
function tierClasses(c: number): {
  stroke: string;
  fill: string;
  text: string;
  bg: string;
  border: string;
} {
  if (c >= 0.85) {
    return {
      stroke: 'stroke-emerald-400',
      fill: 'fill-emerald-400',
      text: 'text-emerald-400',
      bg: 'bg-emerald-500/15',
      border: 'border-emerald-500/40',
    };
  }
  if (c >= 0.7) {
    return {
      stroke: 'stroke-lime-400',
      fill: 'fill-lime-400',
      text: 'text-lime-400',
      bg: 'bg-lime-500/15',
      border: 'border-lime-500/40',
    };
  }
  if (c >= 0.55) {
    return {
      stroke: 'stroke-amber-400',
      fill: 'fill-amber-400',
      text: 'text-amber-400',
      bg: 'bg-amber-500/15',
      border: 'border-amber-500/40',
    };
  }
  if (c >= 0.4) {
    return {
      stroke: 'stroke-orange-400',
      fill: 'fill-orange-400',
      text: 'text-orange-400',
      bg: 'bg-orange-500/15',
      border: 'border-orange-500/40',
    };
  }
  return {
    stroke: 'stroke-red-400',
    fill: 'fill-red-400',
    text: 'text-red-400',
    bg: 'bg-red-500/15',
    border: 'border-red-500/40',
  };
}

const UNKNOWN_CLASSES = {
  stroke: 'stroke-slate-500',
  fill: 'fill-slate-500',
  text: 'text-slate-400',
  bg: 'bg-slate-500/10',
  border: 'border-slate-600/40',
};

/**
 * Build the screen-reader announcement. Single utterance, no decoration.
 */
function ariaText(
  c: number,
  unknown: boolean,
  label: string | undefined,
  variant: UncertaintyVariant
): string {
  const prefix = label ? `${label}: ` : variant === 'dot' ? 'Confidence ' : '';
  if (unknown) return `${prefix}confidence unknown`.trim();
  const pct = Math.round(c * 100);
  return `${prefix}${pct}% confidence, ${levelLabel(c)}`.trim();
}

// =============================================================================
// Variants
// =============================================================================

export function UncertaintyIndicator(props: UncertaintyIndicatorProps) {
  const {
    confidence,
    uncertainty,
    severity,
    label,
    variant = 'ring',
    size,
    className,
    children,
    ...rest
  } = props;

  const { confidence: c, unknown } = resolveValue({ confidence, uncertainty, severity });
  const cls = unknown ? UNKNOWN_CLASSES : tierClasses(c);
  const aria = ariaText(c, unknown, label, variant);
  const pct = Math.round(c * 100);

  if (variant === 'badge') {
    return (
      <div
        role="img"
        aria-label={aria}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-mono font-semibold',
          cls.bg,
          cls.border,
          cls.text,
          className
        )}
        {...rest}
      >
        <span aria-hidden="true">{unknown ? '—' : `${pct}%`}</span>
        <span className="text-[9px] uppercase tracking-wider opacity-80" aria-hidden="true">
          {unknown ? 'unknown' : levelLabel(c)}
        </span>
      </div>
    );
  }

  if (variant === 'dot') {
    const dotSize = size ?? 8;
    return (
      <div
        role="img"
        aria-label={aria}
        className={cn('inline-block rounded-full', cls.bg, cls.border, 'border', className)}
        style={{ width: dotSize, height: dotSize }}
        {...rest}
      />
    );
  }

  // ring (default)
  const ringSize = size ?? 24;
  const stroke = 2;
  const radius = (ringSize - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = unknown ? circumference : circumference * (1 - c);
  const center = ringSize / 2;

  return (
    <div
      role="img"
      aria-label={aria}
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: ringSize, height: ringSize }}
      {...rest}
    >
      <svg
        width={ringSize}
        height={ringSize}
        className="absolute inset-0 -rotate-90"
        aria-hidden="true"
        focusable="false"
      >
        {/* Background ring */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-slate-700/40"
        />
        {/* Value ring */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn(cls.stroke, 'transition-[stroke-dashoffset] duration-500 ease-out')}
        />
      </svg>
      {children !== undefined ? (
        <div className="relative z-10 flex items-center justify-center">{children}</div>
      ) : (
        <span
          className={cn('relative z-10 text-[8px] font-mono font-bold leading-none', cls.text)}
          aria-hidden="true"
        >
          {unknown ? '?' : pct}
        </span>
      )}
    </div>
  );
}
