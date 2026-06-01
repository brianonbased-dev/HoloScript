'use client';

import React from 'react';
import { tokens, tapTargetStyle } from './tokens';

/**
 * The five human-facing interaction primitives. No command/file primitive exists.
 */
export const interactions = [
  'tap',
  'swipe',
  'click',
  'talk',
  'type-conversational',
] as const;

export type Interaction = (typeof interactions)[number];

export interface TapTargetProps {
  children?: React.ReactNode;
  /** Tap / Click action. */
  onTap?: () => void;
  /** Navigate on tap instead of executing locally. */
  href?: string;
  /** Open href in a new tab. */
  newTab?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  testId?: string;
  style?: React.CSSProperties;
}

/**
 * TapTarget — the atomic interactive primitive for Tap and Click.
 * Every human-facing action surface in the Console (and every Front surface)
 * bottoms out here. Guarantees >=64px tap target, explicit (non-hover) state,
 * and keyboard accessibility.
 */
export function TapTarget({
  children,
  onTap,
  href,
  newTab,
  disabled,
  ariaLabel,
  testId,
  style,
}: TapTargetProps) {
  // tapTargetStyle reads keys off the overrides object; CSSProperties is a
  // compatible string/number-keyed record, so widen via unknown to satisfy it.
  const baseStyle = tapTargetStyle(style as Record<string, unknown> | undefined);

  if (href) {
    return React.createElement(
      'a',
      {
        href,
        target: newTab ? '_blank' : undefined,
        rel: newTab ? 'noopener noreferrer' : undefined,
        onClick: onTap,
        'aria-label': ariaLabel,
        'data-testid': testId,
        style: baseStyle,
      },
      children
    );
  }

  return React.createElement(
    'button',
    {
      type: 'button',
      onClick: onTap,
      disabled,
      'aria-label': ariaLabel,
      'data-testid': testId,
      'data-tap-min': tokens.tap.min,
      style: baseStyle,
    },
    children
  );
}
