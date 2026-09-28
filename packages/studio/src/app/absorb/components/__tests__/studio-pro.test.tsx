// @vitest-environment jsdom
/**
 * What a customer sees on Settings > Credits: the balance, the Studio Pro card,
 * and the Free-vs-Pro comparison. Each figure is read from the price table the
 * server charges from, never typed into the component.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, expect, it, vi } from 'vitest';
import { LLM_MARKUP, SUBSCRIPTION_PRICING, TIER_LIMITS } from '@/lib/absorb/pricing';
import type { StudioProState } from '@/lib/purchase-return';
import { CreditBalanceCard } from '../CreditBalanceCard';
import { PricingTab, StudioProCard, TierComparisonTable } from '../PricingSection';

const PRO = SUBSCRIPTION_PRICING.studioPro;
const SUBSCRIBE = `Subscribe for $${PRO.priceCentsMonthly / 100} a month`;
const noop = () => {};
const longDate = (d: Date) =>
  d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

function card(
  state: StudioProState | null,
  handlers: Partial<Record<'onSubscribe' | 'onManage', () => void>> = {},
  busy = false
) {
  return render(
    <StudioProCard
      state={state}
      busy={busy}
      onSubscribe={handlers.onSubscribe ?? noop}
      onManage={handlers.onManage ?? noop}
    />
  );
}

describe('the Studio Pro card', () => {
  it('offers a free account the plan at its real price, with nothing to manage', () => {
    const onSubscribe = vi.fn();
    card({ isPro: false, periodEnd: null, ending: false, canManage: false }, { onSubscribe });

    fireEvent.click(screen.getByRole('button', { name: SUBSCRIBE }));
    expect(onSubscribe).toHaveBeenCalledOnce();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(
      screen.getByText(new RegExp(`^${PRO.includedCredits} credits every paid month`))
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        new RegExp(`Free accounts get ${TIER_LIMITS.free.hourlyRequestLimit} an hour`)
      )
    ).toBeInTheDocument();
  });

  it('still offers the plan before the balance has loaded', () => {
    card(null);
    expect(screen.getByRole('button', { name: SUBSCRIBE })).toBeEnabled();
  });

  it('tells a subscriber when Pro renews, and offers manage or cancel instead of subscribe', () => {
    const onManage = vi.fn();
    const periodEnd = new Date('2026-10-28T12:00:00Z');
    card({ isPro: true, periodEnd, ending: false, canManage: true }, { onManage });

    expect(screen.getByRole('status')).toHaveTextContent(`It renews on ${longDate(periodEnd)}.`);
    expect(screen.queryByRole('button', { name: SUBSCRIBE })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Manage or cancel' }));
    expect(onManage).toHaveBeenCalledOnce();
  });

  it('tells a subscriber who cancelled the day Pro ends, and that the credits stay', () => {
    const periodEnd = new Date('2026-10-28T12:00:00Z');
    card({ isPro: true, periodEnd, ending: true, canManage: true });

    expect(screen.getByRole('status')).toHaveTextContent(
      `Your Studio Pro ends on ${longDate(periodEnd)}. Your credits stay.`
    );
    expect(screen.getByRole('button', { name: 'Manage subscription' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: SUBSCRIBE })).toBeNull();
  });

  it('lets a former subscriber subscribe again and still reach past invoices', () => {
    card({ isPro: false, periodEnd: null, ending: false, canManage: true });
    expect(screen.getByRole('button', { name: SUBSCRIBE })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Past invoices' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('cannot be pressed twice while a Stripe page is opening', () => {
    card({ isPro: false, periodEnd: null, ending: false, canManage: true }, {}, true);
    expect(screen.getByRole('button', { name: 'Opening Stripe…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Past invoices' })).toBeDisabled();
  });
});

describe('the tier comparison', () => {
  const row = (feature: string) => screen.getByText(feature).closest('tr');

  it('compares Free with Studio Pro, and nothing else', () => {
    render(<TierComparisonTable />);
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Feature',
      'Free',
      PRO.label,
    ]);
    expect(screen.queryByText(/enterprise/i)).toBeNull();
  });

  it('shows the price, the credits and the hourly limit the service applies', () => {
    render(<TierComparisonTable />);
    expect(row('Price')).toHaveTextContent(`$${PRO.priceCentsMonthly / 100} a month`);
    expect(row('Credits included')).toHaveTextContent(
      `${TIER_LIMITS.free.freeCredits} once, when you sign up`
    );
    expect(row('Credits included')).toHaveTextContent(`${PRO.includedCredits} every paid month`);
    expect(row('Requests from your own tools (MCP, scripts)')).toHaveTextContent(
      `${TIER_LIMITS.free.hourlyRequestLimit} an hourNo limit`
    );
    expect(screen.getByText(/not limited by the hour on either plan/)).toBeInTheDocument();
  });

  it('leaves out the limits nothing enforces', () => {
    // maxProjectsActive, maxAbsorbDepth and pipelineEnabled have no consumer in
    // the service; printing them told free accounts about limits they do not have.
    render(<TierComparisonTable />);
    expect(screen.queryByText(/active projects|absorb depth|recursive pipeline/i)).toBeNull();
  });
});

describe('the markup on model tokens', () => {
  it('is the metering constant, in both places the tab states it', () => {
    // This tab said "15%" in one paragraph and "30%" in another while
    // LLM_MARKUP was 1.15.
    const percent = Math.round((LLM_MARKUP - 1) * 100);
    const { container } = render(<PricingTab onPurchase={noop} />);
    const stated = [...(container.textContent ?? '').matchAll(/(\d+)% markup/gu)].map((m) =>
      Number(m[1])
    );
    expect(stated).toEqual([percent, percent]);
  });
});

describe('the credit balance', () => {
  it('counts credits, the unit the packs and Studio Pro are sold in', () => {
    render(<CreditBalanceCard balance={600} tier="pro" />);
    expect(screen.getByText('600 credits')).toBeInTheDocument();
    expect(screen.getByText(/\$6\.00 at one cent each/)).toBeInTheDocument();
    expect(screen.getByText('Studio Pro')).toBeInTheDocument();
  });

  it('names a free account plainly', () => {
    render(<CreditBalanceCard balance={100} tier="free" />);
    expect(screen.getByText('100 credits')).toBeInTheDocument();
    expect(screen.getByText('free')).toBeInTheDocument();
  });
});
