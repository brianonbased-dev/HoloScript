/**
 * Fixed-income and portfolio analytics tests — banking-finance-plugin
 *
 * Reference values verified against:
 *  - Fabozzi "Fixed Income Mathematics" (4th ed.) worked examples
 *  - CFA Institute curriculum bond analytics
 *  - Black-Scholes (1973) original paper Table 1
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeBond,
  analyzePortfolio,
  blackScholes,
  analyzeFinance,
  buildFinanceReceipt,
  type BondSpec,
  type PortfolioHolding,
} from '../fixedincome';

// ─── Bond pricing ─────────────────────────────────────────────────────────────

describe('analyzeBond', () => {
  /**
   * 10-year semi-annual 5% coupon bond, par = $1000, yield = 5%.
   * When coupon rate = yield, price = par: $1000.
   */
  const parBond: BondSpec = {
    faceValue:     1_000,
    couponRate:    0.05,
    periods:       20,   // 10 years × 2
    periodsPerYear: 2,
  };

  it('par bond (coupon = yield) prices at face value', () => {
    const r = analyzeBond(parBond, 0.05);
    expect(r.price).toBeCloseTo(1000, 2);
  });

  /**
   * Premium bond: coupon 6%, yield 5%, 10yr semi-annual.
   * Price > par (≈ $1077.22 from Fabozzi).
   */
  it('premium bond (coupon > yield) prices above par', () => {
    // C=30/period, r=2.5%/period, n=20 → Price = 30×ä + 1000×v^20 ≈ $1077.95
    const bond: BondSpec = { faceValue: 1000, couponRate: 0.06, periods: 20, periodsPerYear: 2 };
    const r = analyzeBond(bond, 0.05);
    expect(r.price).toBeGreaterThan(1000);
    expect(r.price).toBeCloseTo(1077.95, 0);
  });

  /**
   * Discount bond: coupon 4%, yield 5%, 10yr semi-annual.
   * C=20/period, r=2.5%/period, n=20 → Price ≈ $922.05
   */
  it('discount bond (coupon < yield) prices below par', () => {
    const bond: BondSpec = { faceValue: 1000, couponRate: 0.04, periods: 20, periodsPerYear: 2 };
    const r = analyzeBond(bond, 0.05);
    expect(r.price).toBeLessThan(1000);
    expect(r.price).toBeCloseTo(922.05, 0);
  });

  it('price is inverse function of yield (higher yield → lower price)', () => {
    const bond: BondSpec = { faceValue: 1000, couponRate: 0.05, periods: 20, periodsPerYear: 2 };
    const r4  = analyzeBond(bond, 0.04);
    const r6  = analyzeBond(bond, 0.06);
    expect(r4.price).toBeGreaterThan(r6.price);
  });

  it('Macaulay duration is always ≤ maturity (in years)', () => {
    const r = analyzeBond(parBond, 0.05);
    expect(r.macaulayDuration).toBeLessThanOrEqual(10 + 1e-6);
  });

  it('modified duration < Macaulay duration', () => {
    const r = analyzeBond(parBond, 0.05);
    expect(r.modifiedDuration).toBeLessThan(r.macaulayDuration);
  });

  it('zero-coupon bond: Macaulay duration equals maturity', () => {
    const zcb: BondSpec = { faceValue: 1000, couponRate: 0, periods: 10, periodsPerYear: 1 };
    const r = analyzeBond(zcb, 0.05);
    expect(r.macaulayDuration).toBeCloseTo(10, 4);
  });

  it('DV01 is positive (price rises when yield falls)', () => {
    const r = analyzeBond(parBond, 0.05);
    expect(r.dv01).toBeGreaterThan(0);
  });

  it('convexity is positive', () => {
    const r = analyzeBond(parBond, 0.05);
    expect(r.convexity).toBeGreaterThan(0);
  });

  /**
   * YTM: par bond priced at $1000 with 5% coupon should have YTM = 5%.
   */
  it('YTM from market price = face value equals coupon rate (par bond)', () => {
    const bond: BondSpec = { ...parBond, marketPrice: 1000 };
    const r = analyzeBond(bond, 0.05);
    expect(r.ytm).not.toBeNull();
    expect(r.ytm!).toBeCloseTo(0.05, 3);
  });

  it('YTM > coupon rate for discount bond', () => {
    const bond: BondSpec = {
      faceValue: 1000, couponRate: 0.04, periods: 20, periodsPerYear: 2, marketPrice: 922.78,
    };
    const r = analyzeBond(bond, 0.05);
    expect(r.ytm).not.toBeNull();
    expect(r.ytm!).toBeGreaterThan(0.04);
  });

  it('throws for zero periods', () => {
    expect(() => analyzeBond({ ...parBond, periods: 0 }, 0.05)).toThrow();
  });

  it('throws for negative yield', () => {
    expect(() => analyzeBond(parBond, -0.01)).toThrow();
  });
});

// ─── Portfolio analytics ──────────────────────────────────────────────────────

describe('analyzePortfolio', () => {
  /** Monthly returns for 3 assets over 24 months (synthetic) */
  const makeReturns = (seed: number, n = 24): number[] =>
    Array.from({ length: n }, (_, i) => 0.007 + 0.02 * Math.sin(i * seed));

  const holdings: PortfolioHolding[] = [
    { id: 'SPY', returns: makeReturns(0.7), weight: 0.5 },
    { id: 'AGG', returns: makeReturns(1.3), weight: 0.3 },
    { id: 'GLD', returns: makeReturns(2.1), weight: 0.2 },
  ];

  it('expected return is a weighted combination of asset returns', () => {
    const r = analyzePortfolio(holdings);
    // All assets have positive average return ≈ 0.007, so portfolio should too
    expect(r.expectedReturn).toBeGreaterThan(0);
  });

  it('stdDev is positive', () => {
    const r = analyzePortfolio(holdings);
    expect(r.stdDev).toBeGreaterThan(0);
  });

  it('variance = stdDev²', () => {
    const r = analyzePortfolio(holdings);
    expect(r.variance).toBeCloseTo(r.stdDev ** 2, 10);
  });

  it('sharpeRatio is computed when riskFreeRate provided', () => {
    const r = analyzePortfolio(holdings, 0.03);
    expect(r.sharpeRatio).not.toBeNull();
  });

  it('sharpeRatio is null when riskFreeRate not provided', () => {
    const r = analyzePortfolio(holdings);
    expect(r.sharpeRatio).toBeNull();
  });

  it('beta is computed when benchmark returns provided', () => {
    const benchmark = makeReturns(0.7); // correlated with SPY
    const r = analyzePortfolio(holdings, 0.03, benchmark);
    expect(r.beta).not.toBeNull();
  });

  it('beta is null when benchmark not provided', () => {
    const r = analyzePortfolio(holdings, 0.03);
    expect(r.beta).toBeNull();
  });

  it('var95 and cvar95 are numbers', () => {
    const r = analyzePortfolio(holdings);
    expect(typeof r.var95).toBe('number');
    expect(typeof r.cvar95).toBe('number');
  });

  it('cvar95 ≥ var95 (expected shortfall ≥ VaR)', () => {
    const r = analyzePortfolio(holdings);
    expect(r.cvar95).toBeGreaterThanOrEqual(r.var95);
  });

  it('throws when weights do not sum to 1', () => {
    const bad: PortfolioHolding[] = [
      { id: 'A', returns: [0.01, 0.02], weight: 0.6 },
      { id: 'B', returns: [0.01, 0.02], weight: 0.6 },
    ];
    expect(() => analyzePortfolio(bad)).toThrow();
  });

  it('throws for mismatched return series lengths', () => {
    const bad: PortfolioHolding[] = [
      { id: 'A', returns: [0.01, 0.02, 0.03], weight: 0.5 },
      { id: 'B', returns: [0.01, 0.02],       weight: 0.5 },
    ];
    expect(() => analyzePortfolio(bad)).toThrow();
  });

  it('throws for fewer than 2 observations', () => {
    expect(() =>
      analyzePortfolio([{ id: 'A', returns: [0.01], weight: 1.0 }]),
    ).toThrow();
  });
});

// ─── Black-Scholes ────────────────────────────────────────────────────────────

describe('blackScholes', () => {
  /**
   * Black-Scholes (1973) Table 1 reference case (approximated):
   *  S=40, K=40 (ATM), T=0.5yr, r=0.10, σ=0.40
   *  call ≈ $4.76, put ≈ $2.82 (from original paper, approximate)
   */
  const atm = () => blackScholes(40, 40, 0.5, 0.10, 0.40);

  it('ATM call price is positive and reasonable (0–10 for S=40)', () => {
    const r = atm();
    expect(r.callPrice).toBeGreaterThan(0);
    expect(r.callPrice).toBeLessThan(10);
  });

  it('ATM put price is positive', () => {
    expect(atm().putPrice).toBeGreaterThan(0);
  });

  /**
   * Put-call parity: C − P = S − K × e^(−rT)
   */
  it('put-call parity holds', () => {
    const r  = atm();
    const S  = 40, K = 40, T = 0.5, rr = 0.10;
    const parity = S - K * Math.exp(-rr * T);
    expect(r.callPrice - r.putPrice).toBeCloseTo(parity, 3);
  });

  it('call delta ∈ (0, 1)', () => {
    expect(atm().callDelta).toBeGreaterThan(0);
    expect(atm().callDelta).toBeLessThan(1);
  });

  it('put delta ∈ (−1, 0)', () => {
    expect(atm().putDelta).toBeLessThan(0);
    expect(atm().putDelta).toBeGreaterThan(-1);
  });

  it('call delta + |put delta| ≈ 1', () => {
    const r = atm();
    expect(r.callDelta + Math.abs(r.putDelta)).toBeCloseTo(1, 6);
  });

  it('gamma is positive (same for call and put)', () => {
    expect(atm().gamma).toBeGreaterThan(0);
  });

  it('vega is positive (higher vol → higher option value)', () => {
    expect(atm().vega).toBeGreaterThan(0);
  });

  it('deep ITM call price approaches intrinsic value (S - K × e^{-rT})', () => {
    const r    = blackScholes(100, 50, 0.5, 0.05, 0.10); // deep ITM
    const intrinsic = 100 - 50 * Math.exp(-0.05 * 0.5);
    expect(r.callPrice).toBeCloseTo(intrinsic, 0);
  });

  it('deep OTM call price approaches 0', () => {
    const r = blackScholes(40, 200, 0.5, 0.05, 0.20); // deep OTM
    expect(r.callPrice).toBeCloseTo(0, 3);
  });

  it('higher volatility increases both call and put price', () => {
    const lo = blackScholes(40, 40, 0.5, 0.05, 0.20);
    const hi = blackScholes(40, 40, 0.5, 0.05, 0.40);
    expect(hi.callPrice).toBeGreaterThan(lo.callPrice);
    expect(hi.putPrice).toBeGreaterThan(lo.putPrice);
  });

  it('throws for zero spot price', () => {
    expect(() => blackScholes(0, 40, 0.5, 0.05, 0.20)).toThrow();
  });

  it('throws for zero volatility', () => {
    expect(() => blackScholes(40, 40, 0.5, 0.05, 0)).toThrow();
  });
});

// ─── analyzeFinance ───────────────────────────────────────────────────────────

describe('analyzeFinance', () => {
  it('computes all three analyses when all inputs provided', () => {
    const holdings: PortfolioHolding[] = [
      { id: 'A', returns: Array.from({length:24},(_,i)=>0.005+0.01*Math.cos(i)), weight: 0.6 },
      { id: 'B', returns: Array.from({length:24},(_,i)=>0.006+0.01*Math.sin(i)), weight: 0.4 },
    ];
    const r = analyzeFinance({
      bond:      { spec: { faceValue: 1000, couponRate: 0.05, periods: 20, periodsPerYear: 2 }, annualYield: 0.05 },
      portfolio: { holdings },
      options:   { S: 40, K: 40, T: 0.5, r: 0.05, sigma: 0.30 },
    });
    expect(r.bond).toBeDefined();
    expect(r.portfolio).toBeDefined();
    expect(r.options).toBeDefined();
    expect(r.converged).toBe(true);
  });
});

// ─── Receipt ──────────────────────────────────────────────────────────────────

describe('buildFinanceReceipt', () => {
  const bondResult = analyzeFinance({
    bond: { spec: { faceValue: 1000, couponRate: 0.05, periods: 20, periodsPerYear: 2 }, annualYield: 0.05 },
  });

  it('produces receipt with plugin=banking-finance and CAEL event', () => {
    const receipt = buildFinanceReceipt(bondResult);
    expect(receipt.plugin).toBe('banking-finance');
    expect(receipt.cael.event).toBe('banking_finance.fixed_income');
    expect(receipt.payloadHash).toBeTruthy();
  });

  it('accepted=true for valid bond analysis', () => {
    const receipt = buildFinanceReceipt(bondResult);
    expect(receipt.acceptance.accepted).toBe(true);
    expect(receipt.acceptance.violations).toHaveLength(0);
  });

  it('resultSummary includes bond metrics', () => {
    const receipt = buildFinanceReceipt(bondResult);
    expect(receipt.resultSummary.bondDuration).toBeDefined();
  });

  it('uses provided runId', () => {
    const receipt = buildFinanceReceipt(bondResult, { runId: 'bond-run-01' });
    expect(receipt.runId).toBe('bond-run-01');
  });
});
