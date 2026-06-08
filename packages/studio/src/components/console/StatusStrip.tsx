'use client';

import { tokens } from './tokens';

/**
 * <StatusStrip> — a glanceable horizontal row of status counts (OK/WARN/FAIL
 * and friends). Read-only by default; each cell may carry an onTap to drill in
 * (Tap primitive). Quest-legible: large text, explicit colors, no hover.
 */
export interface StatusCell {
  label: string;
  value: number | string;
  tone?: 'ok' | 'warn' | 'fail' | 'neutral';
  onTap?: () => void;
}

const toneColor = {
  ok: tokens.color.successText,
  warn: tokens.color.warnText,
  fail: tokens.color.danger,
  neutral: tokens.color.textDim,
} as const;

export interface StatusStripProps {
  cells: StatusCell[];
  testId?: string;
}

export function StatusStrip({ cells, testId }: StatusStripProps) {
  return (
    <div
      data-testid={testId}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: tokens.space.sm,
        alignItems: 'stretch',
      }}
    >
      {cells.map((c, i) => {
        const color = toneColor[c.tone ?? 'neutral'];
        const interactive = typeof c.onTap === 'function';
        const inner = (
          <>
            <span style={{ color, fontSize: tokens.font.title, fontWeight: tokens.weight.heavy }}>
              {c.value}
            </span>
            <span style={{ color: tokens.color.textDim, fontSize: tokens.font.label }}>
              {c.label}
            </span>
          </>
        );
        const cellStyle = {
          display: 'flex',
          flexDirection: 'column' as const,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          // Interactive cells meet the tap minimum; static cells are glance-only.
          minHeight: interactive ? tokens.tap.min : 44,
          minWidth: tokens.tap.min,
          padding: `${tokens.space.sm}px ${tokens.space.md}px`,
          borderRadius: tokens.radius.sm,
          background: tokens.color.surface,
          border: `1px solid ${tokens.color.border}`,
        };
        if (interactive) {
          return (
            <button
              key={`${c.label}-${i}`}
              type="button"
              onClick={c.onTap}
              data-tap-min="64"
              aria-label={`${c.label}: ${c.value}`}
              style={{ ...cellStyle, cursor: 'pointer', font: 'inherit' }}
            >
              {inner}
            </button>
          );
        }
        return (
          <div key={`${c.label}-${i}`} style={cellStyle}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
