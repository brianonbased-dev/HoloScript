'use client';

import React from 'react';

/**
 * The balance in credits, the unit every other number on the Credits tab uses
 * (packs, operation costs, Studio Pro's monthly credits). It used to show
 * dollars ("$5.00"), so a buyer told "your 500 credits will show above" watched
 * a dollar figure change instead. One credit is one cent; the dollar value
 * stays as the second line.
 */
export function CreditBalanceCard({ balance, tier }: { balance: number; tier: string }) {
  const tierColors: Record<string, string> = {
    free: 'border-gray-500/30 text-gray-400',
    pro: 'border-indigo-500/30 text-indigo-400',
    enterprise: 'border-amber-500/30 text-amber-400',
  };
  const tierLabels: Record<string, string> = { pro: 'Studio Pro' };
  return (
    <div className="rounded-xl border border-studio-border bg-[#111827] p-6">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-3xl font-bold text-studio-text">
            {balance.toLocaleString()} credits
          </div>
          <div className="mt-1 text-xs text-studio-muted">
            Available (${(balance / 100).toFixed(2)} at one cent each)
          </div>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-medium uppercase ${tierColors[tier] || tierColors.free}`}
        >
          {tierLabels[tier] ?? tier}
        </span>
      </div>
    </div>
  );
}
