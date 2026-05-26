'use client';

import type { CSSProperties, ReactNode } from 'react';
import { tapTargetStyle } from './tokens';

/**
 * The interaction primitives (D.066). Humans act in exactly five ways —
 * Tap, Swipe, Click, Talk, Type-conversational — and NO other. There is no
 * command or file primitive by design. `TapTarget` is the shared foundation
 * for Tap (touch/Quest-ray) and Click (desktop): a >=64px, hover-free target
 * rendered as a real <button> (onTap) or <a> (href). Swipe/Talk/Type are
 * expressed by the higher-level components (StatusStrip swipe lists, SayOrType
 * talk+type bar) that build on this base.
 */

export type Interaction = 'tap' | 'swipe' | 'click' | 'talk' | 'type';

export interface TapTargetProps {
  children: ReactNode;
  /** Tap/click handler. Renders a <button>. Mutually exclusive with href. */
  onTap?: () => void;
  /** Navigation target. Renders an <a>. Mutually exclusive with onTap. */
  href?: string;
  disabled?: boolean;
  /** Visual variant — maps to explicit (non-hover) colors. */
  style?: CSSProperties;
  ariaLabel?: string;
  testId?: string;
  newTab?: boolean;
}

/**
 * A single tap/click target. Guarantees the >=64px minimum and never relies on
 * hover. Use `onTap` for actions, `href` for navigation.
 */
export function TapTarget({
  children,
  onTap,
  href,
  disabled,
  style,
  ariaLabel,
  testId,
  newTab,
}: TapTargetProps) {
  const merged = { ...tapTargetStyle(), ...(style || {}) } as CSSProperties;
  if (disabled) merged.opacity = 0.6;

  if (href) {
    return (
      <a
        href={href}
        aria-label={ariaLabel}
        data-testid={testId}
        data-tap-min="64"
        target={newTab ? '_blank' : undefined}
        rel={newTab ? 'noopener noreferrer' : undefined}
        onClick={onTap}
        style={merged}
      >
        {children}
      </a>
    );
  }
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      data-testid={testId}
      data-tap-min="64"
      disabled={disabled}
      onClick={onTap}
      style={merged}
    >
      {children}
    </button>
  );
}
