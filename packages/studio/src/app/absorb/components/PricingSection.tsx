'use client';

import React from 'react';
import { CREDIT_PACKAGES, OPERATION_COSTS, TIER_LIMITS } from '@/lib/absorb/pricing';

export function CreditPackageCard({
  pkg,
  onPurchase,
}: {
  pkg: { id: string; label: string; credits: number; priceCents: number; popular: boolean };
  onPurchase: () => void;
}) {
  return (
    <div
      className={`rounded-xl border p-5 transition-all ${
        pkg.popular
          ? 'border-studio-accent bg-studio-accent/5 shadow-lg shadow-studio-accent/10'
          : 'border-studio-border bg-[#111827] hover:border-studio-accent/40'
      }`}
    >
      {pkg.popular && (
        <div className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-studio-accent">
          Most Popular
        </div>
      )}
      <div className="text-lg font-bold text-studio-text">{pkg.label}</div>
      <div className="mt-1 text-2xl font-bold text-studio-text">
        ${(pkg.priceCents / 100).toFixed(0)}
      </div>
      <div className="mt-1 text-xs text-studio-muted">{pkg.credits.toLocaleString()} credits</div>
      <div className="mt-1 text-[10px] text-studio-muted">
        ${(pkg.priceCents / pkg.credits).toFixed(3)}/credit
      </div>
      <button
        onClick={onPurchase}
        className={`mt-4 w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
          pkg.popular
            ? 'bg-studio-accent text-white hover:bg-studio-accent/80'
            : 'bg-studio-panel text-studio-text hover:bg-studio-accent/20'
        }`}
      >
        Buy Credits
      </button>
    </div>
  );
}

export function OperationCostTable() {
  const ops = Object.entries(OPERATION_COSTS);
  return (
    <div className="overflow-hidden rounded-xl border border-studio-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-studio-border bg-[#0d0d14]">
            <th className="px-4 py-3 text-left font-medium text-studio-muted">Operation</th>
            <th className="px-4 py-3 text-right font-medium text-studio-muted">Credits</th>
            <th className="px-4 py-3 text-right font-medium text-studio-muted">Cost</th>
          </tr>
        </thead>
        <tbody>
          {ops.map(([key, op]) => (
            <tr key={key} className="border-b border-studio-border/50 last:border-0">
              <td className="px-4 py-2.5 text-studio-text">{op.description}</td>
              <td className="px-4 py-2.5 text-right font-mono text-studio-muted">
                {op.baseCostCents}
              </td>
              <td className="px-4 py-2.5 text-right font-mono text-studio-text">
                ${(op.baseCostCents / 100).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TierComparisonTable() {
  const tiers = Object.entries(TIER_LIMITS) as [string, typeof TIER_LIMITS.free][];
  return (
    <div className="overflow-hidden rounded-xl border border-studio-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-studio-border bg-[#0d0d14]">
            <th className="px-4 py-3 text-left font-medium text-studio-muted">Feature</th>
            {tiers.map(([name]) => (
              <th
                key={name}
                className="px-4 py-3 text-center font-medium text-studio-muted capitalize"
              >
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-studio-border/50">
            <td className="px-4 py-2.5 text-studio-text">Free credits</td>
            {tiers.map(([name, t]) => (
              <td key={name} className="px-4 py-2.5 text-center text-studio-muted">
                {t.freeCredits > 0 ? `$${(t.freeCredits / 100).toFixed(2)}` : '\u2014'}
              </td>
            ))}
          </tr>
          <tr className="border-b border-studio-border/50">
            <td className="px-4 py-2.5 text-studio-text">Active projects</td>
            {tiers.map(([name, t]) => (
              <td key={name} className="px-4 py-2.5 text-center text-studio-muted">
                {t.maxProjectsActive}
              </td>
            ))}
          </tr>
          <tr className="border-b border-studio-border/50">
            <td className="px-4 py-2.5 text-studio-text">Absorb depth</td>
            {tiers.map(([name, t]) => (
              <td key={name} className="px-4 py-2.5 text-center text-studio-muted capitalize">
                {t.maxAbsorbDepth}
              </td>
            ))}
          </tr>
          <tr className="border-b border-studio-border/50 last:border-0">
            <td className="px-4 py-2.5 text-studio-text">Recursive pipeline</td>
            {tiers.map(([name, t]) => (
              <td key={name} className="px-4 py-2.5 text-center text-studio-muted">
                {t.pipelineEnabled ? 'Yes' : '\u2014'}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function PricingTab({ onPurchase }: { onPurchase: (pkgId: string) => void }) {
  return (
    <div className="mx-auto max-w-4xl space-y-12">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-studio-text">Pay Only For What You Use</h2>
        <p className="mt-2 text-sm text-studio-muted">
          Buy credits and spend them on AI-powered code analysis and improvement. We use
          Claude, Grok, and GPT -- you get the best model available.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {CREDIT_PACKAGES.map((pkg) => (
          <CreditPackageCard
            key={pkg.id}
            pkg={pkg}
            onPurchase={() => onPurchase(pkg.id)}
          />
        ))}
      </div>

      <div>
        <h3 className="mb-4 text-lg font-semibold text-studio-text text-center">
          Operation Costs
        </h3>
        <OperationCostTable />
        <p className="mt-4 text-center text-xs text-studio-muted">
          LLM token usage is metered on top of base costs with a transparent 15% markup over
          provider pricing.
        </p>
      </div>

      <div>
        <h3 className="mb-4 text-lg font-semibold text-studio-text text-center">
          Tier Comparison
        </h3>
        <TierComparisonTable />
      </div>

      <div className="rounded-xl border border-studio-border bg-[#111827] p-6">
        <h3 className="text-sm font-semibold text-studio-text mb-4">AI Providers</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              name: 'Claude (Anthropic)',
              model: 'claude-sonnet-4-5',
              input: '$3.00',
              output: '$15.00',
            },
            { name: 'Grok (xAI)', model: 'grok-3-mini', input: '$2.00', output: '$10.00' },
            { name: 'GPT (OpenAI)', model: 'gpt-4o-mini', input: '$2.50', output: '$10.00' },
          ].map((p) => (
            <div key={p.name} className="rounded-lg bg-[#0f172a] p-4">
              <div className="text-sm font-medium text-studio-text">{p.name}</div>
              <div className="mt-1 text-[10px] text-studio-muted">{p.model}</div>
              <div className="mt-2 text-[10px] text-studio-muted">
                Input: {p.input}/M tokens
              </div>
              <div className="text-[10px] text-studio-muted">Output: {p.output}/M tokens</div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[10px] text-studio-muted">
          We automatically select the best available provider. Prices shown are base provider
          costs -- our 30% markup is applied transparently.
        </p>
      </div>
    </div>
  );
}
