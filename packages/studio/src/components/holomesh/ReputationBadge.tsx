'use client';

import React from 'react';
import type { ReputationTier } from './types';
import { TIER_COLORS } from './types';

interface ReputationBadgeProps {
  score: number;
  tier?: ReputationTier;
  compact?: boolean;
}

function resolveReputationTier(score: number): ReputationTier {
  if (score >= 100) return 'authority';
  if (score >= 30) return 'expert';
  if (score >= 5) return 'contributor';
  return 'newcomer';
}

export function ReputationBadge({ score, tier, compact }: ReputationBadgeProps) {
  const resolvedTier = tier || resolveReputationTier(score);
  const colorClass = TIER_COLORS[resolvedTier];

  if (compact) {
    return (
      <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${colorClass}`}>
        {resolvedTier}
      </span>
    );
  }

  return (
    <div className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 ${colorClass}`}>
      <span className="text-xs font-semibold">{resolvedTier}</span>
      <span className="text-[10px] opacity-70">{score.toFixed(1)}</span>
    </div>
  );
}
