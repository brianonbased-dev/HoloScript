'use client';

import { tokens } from './tokens';
import { TapTarget } from './primitives';

/**
 * <ActionTile> — generalizes the Founder Console Inbox "Open" tile (#214).
 * A labelled card with a single primary tap action. Quest + mobile legible:
 * large target, explicit colors, no hover.
 */
export interface ActionTileProps {
  label: string;
  sublabel?: string;
  /** Primary action label (default "Open"). */
  actionLabel?: string;
  href?: string;
  onTap?: () => void;
  testId?: string;
}

export function ActionTile({
  label,
  sublabel,
  actionLabel = 'Open',
  href,
  onTap,
  testId,
}: ActionTileProps) {
  return (
    <div
      data-testid={testId}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: tokens.space.md,
        padding: tokens.space.md,
        borderRadius: tokens.radius.md,
        background: tokens.color.surface,
        border: `1px solid ${tokens.color.border}`,
        minHeight: tokens.tap.min,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            color: tokens.color.text,
            fontSize: tokens.font.tile,
            fontWeight: tokens.weight.bold,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </div>
        {sublabel ? (
          <div style={{ color: tokens.color.textDim, fontSize: tokens.font.label }}>{sublabel}</div>
        ) : null}
      </div>
      <TapTarget
        href={href}
        onTap={onTap}
        newTab={Boolean(href)}
        ariaLabel={`${actionLabel}: ${label}`}
        testId={testId ? `${testId}-action` : undefined}
        style={{
          background: tokens.color.accent,
          border: `1px solid ${tokens.color.accent}`,
          color: '#fff',
          minWidth: 96,
          justifyContent: 'center',
        }}
      >
        {actionLabel}
      </TapTarget>
    </div>
  );
}
