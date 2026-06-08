'use client';

import { tokens } from './tokens';
import { TapTarget } from './primitives';

/**
 * <ActionChip> — generalizes the NextActions tap-chip (#215) + its N3 one-tap
 * approve behavior (#218). Two variants:
 *  - reversible: a one-tap APPROVE button (green) — records intent, no nav.
 *  - gated (irreversible): a navigate-to-review link (amber) — D.044.
 * The variant drives color + affordance; never a hover state.
 */
export interface ActionChipProps {
  label: string;
  reversible: boolean;
  /** Reversible chips: the one-tap action. */
  onApprove?: () => void;
  /** Gated chips: where review happens. */
  href?: string;
  /** Gated chips: fired when the founder taps through to review. */
  onReview?: () => void;
  /** Reversible chip mid-approval / just-approved. */
  busy?: boolean;
  approved?: boolean;
  testId?: string;
}

export function ActionChip({
  label,
  reversible,
  onApprove,
  href,
  onReview,
  busy,
  approved,
  testId,
}: ActionChipProps) {
  const accent = reversible ? tokens.color.success : tokens.color.warn;
  const badgeColor = reversible ? tokens.color.successText : tokens.color.warnText;
  const surface = approved
    ? tokens.color.successSurface
    : reversible
      ? tokens.color.surface
      : tokens.color.warnSurface;

  const chipStyle = {
    border: `1px solid ${accent}`,
    background: surface,
    fontSize: tokens.font.chip,
  };
  const badgeText = approved
    ? 'approved ✓'
    : busy
      ? 'approving…'
      : reversible
        ? 'tap to do'
        : 'review';
  const badge = (
    <span
      style={{
        fontSize: tokens.font.label,
        fontWeight: tokens.weight.bold,
        color: approved || !busy ? badgeColor : tokens.color.textDim,
      }}
    >
      {badgeText}
    </span>
  );

  if (reversible) {
    return (
      <TapTarget
        onTap={onApprove}
        disabled={busy || approved}
        ariaLabel={`Approve: ${label}`}
        testId={testId}
        style={chipStyle}
      >
        <span>{label}</span>
        {badge}
      </TapTarget>
    );
  }
  return (
    <TapTarget
      href={href ?? '#'}
      newTab
      onTap={onReview}
      ariaLabel={`Review: ${label}`}
      testId={testId}
      style={chipStyle}
    >
      <span>{label}</span>
      {badge}
    </TapTarget>
  );
}
