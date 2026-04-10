'use client';

import React from 'react';

export function CreditBalanceCard({ balance, tier }: { balance: number; tier: string }) {
  const tierColors: Record<string, string> = {
    free: 'border-gray-500/30 text-gray-400',
    pro: 'border-indigo-500/30 text-indigo-400',
    enterprise: 'border-amber-500/30 text-amber-400',
  };
  return (
    <div className="rounded-xl border border-studio-border bg-[#111827] p-6">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-3xl font-bold text-studio-text">${(balance / 100).toFixed(2)}</div>
          <div className="mt-1 text-xs text-studio-muted">Available credits</div>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-medium uppercase ${tierColors[tier] || tierColors.free}`}
        >
          {tier}
        </span>
      </div>
    </div>
  );
}
