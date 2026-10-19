// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { CreditPackageCard } from '../PricingSection';

// Creator Advocate audit 2026-10-14, item 4: the per-credit label divided
// cents by credits and printed it as dollars (100x too high: "$1.000/credit").
describe('CreditPackageCard per-credit label', () => {
  afterEach(cleanup);
  const noop = () => {};
  it.each([
    [1000, 1000, '$0.01/credit'],
    [5000, 5500, '$0.0091/credit'],
    [100, 100, '$0.01/credit'],
  ])('priceCents=%i credits=%i -> %s', (priceCents, credits, label) => {
    render(
      <CreditPackageCard
        pkg={{ id: 'p', label: 'Pack', credits, priceCents, popular: false }}
        onPurchase={noop}
      />
    );
    expect(screen.getByText(label)).toBeTruthy();
  });
});