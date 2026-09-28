'use client';

import React from 'react';
import {
  CREDIT_PACKAGES,
  LLM_MARKUP,
  OPERATION_COSTS,
  SUBSCRIPTION_PRICING,
  TIER_LIMITS,
} from '@/lib/absorb/pricing';
import type { StudioProState } from '@/lib/purchase-return';

/**
 * The margin on model tokens, from the constant that meters it (1.15 -> "15%").
 * This tab said "15%" in one paragraph and "30%" in another until 2026-09-28.
 */
const MARKUP_PERCENT = `${Math.round((LLM_MARKUP - 1) * 100)}%`;

const STUDIO_PRO = SUBSCRIPTION_PRICING.studioPro;

/** Whole dollars without cents ("$15"), otherwise two places ("$12.50"). */
function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

/** "10 an hour", or "No limit" for a tier the service never limits. */
function hourly(limit: number | null): string {
  return limit === null ? 'No limit' : `${limit} an hour`;
}

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

/**
 * Free against Studio Pro, and only the differences the service enforces.
 *
 * This used to print every TIER_LIMITS row for Free, Pro and Enterprise:
 * active projects, absorb depth, recursive pipeline. None of the three is
 * enforced anywhere (checked 2026-09-28), so the table told free users about
 * limits they did not have, and would have sold Studio Pro on features every
 * account already gets. There is no Enterprise plan to buy, so that column is
 * gone too.
 */
export function TierComparisonTable() {
  const rows: Array<[feature: string, free: string, pro: string]> = [
    ['Price', 'Free', `${dollars(STUDIO_PRO.priceCentsMonthly)} a month`],
    [
      'Credits included',
      `${TIER_LIMITS.free.freeCredits.toLocaleString()} once, when you sign up`,
      `${STUDIO_PRO.includedCredits.toLocaleString()} every paid month`,
    ],
    [
      'Requests from your own tools (MCP, scripts)',
      hourly(TIER_LIMITS.free.hourlyRequestLimit),
      hourly(TIER_LIMITS.pro.hourlyRequestLimit),
    ],
  ];
  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-studio-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-studio-border bg-[#0d0d14]">
              <th className="px-4 py-3 text-left font-medium text-studio-muted">Feature</th>
              <th className="px-4 py-3 text-center font-medium text-studio-muted">Free</th>
              <th className="px-4 py-3 text-center font-medium text-studio-muted">
                {STUDIO_PRO.label}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([feature, free, pro]) => (
              <tr key={feature} className="border-b border-studio-border/50 last:border-0">
                <td className="px-4 py-2.5 text-studio-text">{feature}</td>
                <td className="px-4 py-2.5 text-center text-studio-muted">{free}</td>
                <td className="px-4 py-2.5 text-center text-studio-muted">{pro}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-center text-xs text-studio-muted">
        Using the Studio website is not limited by the hour on either plan. Unused credits carry
        over.
      </p>
    </div>
  );
}

/** What the Studio Pro card needs from the page that shows it. */
export interface StudioProControls {
  /** From the balance answer; null until it has loaded. */
  state: StudioProState | null;
  /** True while a checkout or the billing page is being opened. */
  busy: boolean;
  onSubscribe: () => void;
  onManage: () => void;
  /**
   * True just after a Studio Pro checkout, until the webhook's Pro shows up:
   * Subscribe is hidden, so a slow webhook cannot invite a second checkout.
   */
  confirming?: boolean;
}

function longDate(date: Date): string {
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

/** Subscribe to Studio Pro, or see and manage the subscription you have. */
export function StudioProCard({
  state,
  busy,
  onSubscribe,
  onManage,
  confirming = false,
}: StudioProControls) {
  const isPro = state?.isPro === true;
  const waiting = confirming && !isPro;
  const end = state?.periodEnd ? longDate(state.periodEnd) : null;
  let status: string | null = null;
  if (isPro && state?.ending) {
    status = `Your Studio Pro ends ${end ? `on ${end}` : 'when this paid month ends'}. Your credits stay.`;
  } else if (isPro) {
    status = end ? `You're on Studio Pro. It renews on ${end}.` : "You're on Studio Pro.";
  } else if (waiting) {
    status = 'Payment received. Confirming your Studio Pro with Stripe; this takes up to a minute.';
  }
  const manageLabel = !isPro
    ? 'Past invoices'
    : state?.ending
      ? 'Manage subscription'
      : 'Manage or cancel';
  return (
    <section
      aria-labelledby="studio-pro-title"
      className="rounded-xl border border-studio-accent/40 bg-studio-accent/5 p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="studio-pro-title" className="text-lg font-bold text-studio-text">
          {STUDIO_PRO.label}
        </h3>
        <div className="text-2xl font-bold text-studio-text">
          {dollars(STUDIO_PRO.priceCentsMonthly)}
          <span className="text-sm font-normal text-studio-muted"> a month</span>
        </div>
      </div>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-studio-muted">
        <li>
          {STUDIO_PRO.includedCredits.toLocaleString()} credits every paid month. Unused credits
          carry over.
        </li>
        <li>
          No hourly limit on requests from your own tools (MCP, scripts). Free accounts get{' '}
          {hourly(TIER_LIMITS.free.hourlyRequestLimit)}.
        </li>
        <li>Cancel any time. Studio Pro lasts to the end of the month you paid for.</li>
      </ul>
      {status && (
        <p role="status" className="mt-4 text-sm font-medium text-studio-text">
          {status}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        {!isPro && !waiting && (
          <button
            type="button"
            onClick={onSubscribe}
            disabled={busy}
            className="rounded-lg bg-studio-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-studio-accent/80 disabled:opacity-60"
          >
            {busy
              ? 'Opening Stripe\u2026'
              : `Subscribe for ${dollars(STUDIO_PRO.priceCentsMonthly)} a month`}
          </button>
        )}
        {state?.canManage && (
          <button
            type="button"
            onClick={onManage}
            disabled={busy}
            className="rounded-lg bg-studio-panel px-4 py-2.5 text-sm font-medium text-studio-text transition-colors hover:bg-studio-accent/20 disabled:opacity-60"
          >
            {manageLabel}
          </button>
        )}
      </div>
    </section>
  );
}

export function PricingTab({ onPurchase }: { onPurchase: (pkgId: string) => void }) {
  return (
    <div className="mx-auto max-w-4xl space-y-12">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-studio-text">Pay Only For What You Use</h2>
        <p className="mt-2 text-sm text-studio-muted">
          Buy credits and spend them on AI-powered code analysis and improvement. We use Claude,
          Grok, and GPT -- you get the best model available.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {CREDIT_PACKAGES.map((pkg) => (
          <CreditPackageCard key={pkg.id} pkg={pkg} onPurchase={() => onPurchase(pkg.id)} />
        ))}
      </div>

      <div>
        <h3 className="mb-4 text-lg font-semibold text-studio-text text-center">Operation Costs</h3>
        <OperationCostTable />
        <p className="mt-4 text-center text-xs text-studio-muted">
          LLM token usage is metered on top of base costs with a transparent {MARKUP_PERCENT} markup
          over provider pricing.
        </p>
      </div>

      <div>
        <h3 className="mb-4 text-lg font-semibold text-studio-text text-center">Tier Comparison</h3>
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
              <div className="mt-2 text-[10px] text-studio-muted">Input: {p.input}/M tokens</div>
              <div className="text-[10px] text-studio-muted">Output: {p.output}/M tokens</div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[10px] text-studio-muted">
          We automatically select the best available provider. Prices shown are base provider costs;
          our {MARKUP_PERCENT} markup is added on top.
        </p>
      </div>
    </div>
  );
}
