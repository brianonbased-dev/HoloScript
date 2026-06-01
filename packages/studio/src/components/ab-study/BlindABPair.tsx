'use client';

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { TapTarget } from '../console/primitives';
import { tokens } from '../console/tokens';
import type { ABTrial } from '../../lib/ab-study/engine';

export interface BlindABPairProps {
  trial: ABTrial;
  /** Called when the rater confirms their choice + strength. */
  onSubmit: (choice: 'left' | 'right', strength: number) => void;
  testId?: string;
}

export function BlindABPair({ trial, onSubmit, testId }: BlindABPairProps) {
  const [chosen, setChosen] = useState<'left' | 'right' | null>(null);
  const [strength, setStrength] = useState<number>(3);

  const handleSubmit = () => {
    if (chosen === null) return;
    onSubmit(chosen, strength);
  };

  const paneBase: CSSProperties = {
    flex: 1,
    border: `2px solid ${tokens.color.border}`,
    borderRadius: tokens.radius.md,
    padding: tokens.space.lg,
    minHeight: 240,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.space.md,
  };

  const paneActive: CSSProperties = {
    ...paneBase,
    borderColor: tokens.color.success,
    background: tokens.color.successSurface,
  };

  const renderPane = (side: 'left' | 'right') => {
    const isActive = chosen === side;
    const comp = side === 'left' ? trial.left : trial.right;
    return (
      <button
        data-testid={testId ? `${testId}-${side}` : undefined}
        aria-label={`Option ${side === 'left' ? 'A' : 'B'}`}
        onClick={() => setChosen(side)}
        style={isActive ? paneActive : paneBase}
      >
        <span style={{ fontSize: tokens.font.label, fontWeight: tokens.weight.bold, color: tokens.color.textDim }}>
          {side === 'left' ? 'A' : 'B'}
        </span>
        <pre
          style={{
            flex: 1,
            fontSize: tokens.font.body,
            background: tokens.color.surfaceAlt,
            padding: tokens.space.md,
            borderRadius: tokens.radius.sm,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {comp.holoSource}
        </pre>
      </button>
    );
  };

  return (
    <div
      data-testid={testId}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: tokens.space.xl,
        maxWidth: 960,
        margin: '0 auto',
        padding: tokens.space.lg,
      }}
    >
      <p
        style={{
          fontSize: tokens.font.body,
          fontWeight: tokens.weight.bold,
          textAlign: 'center',
        }}
      >
        {trial.prompt}
      </p>

      <div style={{ display: 'flex', gap: tokens.space.lg, alignItems: 'stretch' }}>
        {renderPane('left')}
        {renderPane('right')}
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: tokens.space.md,
        }}
      >
        <p style={{ fontSize: tokens.font.label, color: tokens.color.textDim }}>
          How strongly do you prefer your choice? (1 = slight, 5 = strong)
        </p>
        <div style={{ display: 'flex', gap: tokens.space.sm }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <TapTarget
              key={n}
              onTap={() => setStrength(n)}
              testId={testId ? `${testId}-likert-${n}` : undefined}
              style={{
                width: 48,
                height: 48,
                borderRadius: tokens.radius.md,
                border: `2px solid ${strength === n ? tokens.color.success : tokens.color.border}`,
                background: strength === n ? tokens.color.successSurface : tokens.color.surface,
                fontWeight: tokens.weight.bold,
              }}
            >
              {n}
            </TapTarget>
          ))}
        </div>

        <TapTarget
          onTap={handleSubmit}
          disabled={chosen === null}
          testId={testId ? `${testId}-submit` : undefined}
          style={{
            marginTop: tokens.space.md,
            padding: `${tokens.space.md} ${tokens.space.xl}`,
            fontSize: tokens.font.body,
            fontWeight: tokens.weight.bold,
            opacity: chosen === null ? 0.5 : 1,
          }}
        >
          Submit choice
        </TapTarget>
      </div>
    </div>
  );
}
