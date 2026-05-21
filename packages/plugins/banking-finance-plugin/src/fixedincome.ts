/**
 * Fixed-income and portfolio analytics solver — banking-finance-plugin
 *
 * Implements standard financial mathematics without external dependencies:
 *   - Bond pricing (NPV of coupon + face cashflows)
 *   - Yield-to-maturity (bisection on price function)
 *   - Modified/Macaulay duration and convexity
 *   - Portfolio analytics: return, variance, Sharpe ratio, beta, VaR (historical)
 *   - Black-Scholes option pricing (European call/put)
 *   - CAEL-backed receipt
 *
 * References:
 *   Fabozzi, F. "Fixed Income Mathematics" (4th ed., 2006).
 *   Markowitz, H. (1952) "Portfolio Selection." J. Finance 7(1):77-91.
 *   Black & Scholes (1973) "The Pricing of Options..." J. Political Economy.
 */

import {
  DOMAIN_SIMULATION_RECEIPT_SCHEMA,
  buildDomainSimulationReceipt,
} from '@holoscript/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BondSpec {
  /** Face (par) value */
  faceValue:     number;
  /** Annual coupon rate (e.g. 0.05 = 5%) */
  couponRate:    number;
  /** Periods to maturity (coupon payments; typically semi-annual = years × 2) */
  periods:       number;
  /** Periods per year (2 = semi-annual, 1 = annual) */
  periodsPerYear: number;
  /** Market price (for YTM calculation; optional) */
  marketPrice?:  number;
}

export interface BondResult {
  /** Clean price (sum of discounted cash flows) at given yield */
  price:             number;
  /** Yield to maturity (annual, bond-equivalent) */
  ytm:               number | null;
  /** Macaulay duration (years) */
  macaulayDuration:  number;
  /** Modified duration (% price change per 1% yield change) */
  modifiedDuration:  number;
  /** Dollar duration (DV01): price change for 1 bp yield change */
  dv01:              number;
  /** Convexity */
  convexity:         number;
}

export interface PortfolioHolding {
  id:          string;
  /** Historical returns (one per period) */
  returns:     number[];
  /** Portfolio weight (0–1, must sum to 1 across holdings) */
  weight:      number;
}

export interface PortfolioResult {
  expectedReturn:  number;
  variance:        number;
  stdDev:          number;
  sharpeRatio:     number | null; // null if riskFreeRate not provided
  beta:            number | null; // null if benchmark returns not provided
  /** Historical VaR at 95% confidence */
  var95:           number;
  /** Historical CVaR (expected shortfall) at 95% */
  cvar95:          number;
}

export interface BlackScholesResult {
  callPrice: number;
  putPrice:  number;
  /** Greeks */
  callDelta: number;
  putDelta:  number;
  gamma:     number;
  vega:      number;
  callTheta: number;
  putTheta:  number;
  callRho:   number;
  putRho:    number;
}

export interface FinanceAnalysisResult {
  bond?:      BondResult;
  portfolio?: PortfolioResult;
  options?:   BlackScholesResult;
  converged:  boolean;
}

export interface FinanceReceipt {
  plugin:        string;
  runId:         string;
  payloadHash:   string;
  hashAlgorithm: string;
  cael:          { event: string; solverType: string; version: string };
  acceptance:    { accepted: boolean; violations: Array<{ criterion: string; message: string }> };
  resultSummary: {
    bondYTM?:          number;
    bondDuration?:     number;
    portfolioReturn?:  number;
    portfolioSharpe?:  number;
    optionCallPrice?:  number;
  };
}

// ─── Normal distribution helpers ─────────────────────────────────────────────

/** Standard normal CDF via Abramowitz & Stegun (7-term; error < 3e-7) */
function normalCDF(x: number): number {
  if (x < -8) return 0;
  if (x >  8) return 1;
  const k = 1 / (1 + 0.2316419 * Math.abs(x));
  const poly = ((((1.330274429 * k - 1.821255978) * k + 1.781477937) * k
               - 0.356563782) * k + 0.319381530) * k;
  const pdf  = Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  const cdf  = 1 - pdf * poly;
  return x >= 0 ? cdf : 1 - cdf;
}

/** Standard normal PDF */
function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// ─── Bond pricing ─────────────────────────────────────────────────────────────

/**
 * Price a bond given a yield per period.
 * price = Σ(t=1..n) C/(1+r)^t + F/(1+r)^n
 */
function bondPrice(spec: BondSpec, yieldPerPeriod: number): number {
  const { faceValue, couponRate, periods, periodsPerYear } = spec;
  const C = faceValue * (couponRate / periodsPerYear); // coupon per period
  let price = 0;
  for (let t = 1; t <= periods; t++) {
    price += C / Math.pow(1 + yieldPerPeriod, t);
  }
  price += faceValue / Math.pow(1 + yieldPerPeriod, periods);
  return price;
}

/**
 * Compute bond analytics at a given annual yield.
 */
export function analyzeBond(spec: BondSpec, annualYield: number): BondResult {
  const { faceValue, couponRate, periods, periodsPerYear } = spec;
  if (periods <= 0)         throw new Error('[finance] periods must be > 0');
  if (faceValue <= 0)       throw new Error('[finance] faceValue must be > 0');
  if (periodsPerYear <= 0)  throw new Error('[finance] periodsPerYear must be > 0');
  if (annualYield < 0)      throw new Error('[finance] annualYield must be ≥ 0');

  const r   = annualYield / periodsPerYear; // yield per period
  const C   = faceValue * (couponRate / periodsPerYear);
  const price = bondPrice(spec, r);

  // Macaulay duration: Σ t × PV(CF_t) / price
  let durationWeightedSum = 0;
  let convexitySum        = 0;
  for (let t = 1; t <= periods; t++) {
    const cf   = t < periods ? C : C + faceValue;
    const pv   = cf / Math.pow(1 + r, t);
    durationWeightedSum += (t / periodsPerYear) * pv;
    convexitySum        += (t * (t + 1)) * pv / Math.pow(1 + r, 2);
  }
  const macaulayDuration  = durationWeightedSum / price;
  const modifiedDuration  = macaulayDuration / (1 + r);
  const dv01              = modifiedDuration * price * 0.0001; // per 1 bp
  const convexity         = convexitySum / (price * Math.pow(periodsPerYear, 2));

  // YTM from market price (if provided)
  let ytm: number | null = null;
  if (spec.marketPrice !== undefined && spec.marketPrice > 0) {
    const mktPrice = spec.marketPrice;
    // Bisect on annual yield: find y s.t. bondPrice(y/periodsPerYear) = mktPrice
    let lo = 0, hi = 2.0;
    if (Math.sign(bondPrice(spec, lo / periodsPerYear) - mktPrice) !==
        Math.sign(bondPrice(spec, hi / periodsPerYear) - mktPrice)) {
      for (let i = 0; i < 100; i++) {
        const mid   = (lo + hi) / 2;
        const delta = bondPrice(spec, mid / periodsPerYear) - mktPrice;
        if (Math.abs(delta) < 0.0001 || (hi - lo) < 1e-10) { ytm = mid; break; }
        Math.sign(delta) === Math.sign(bondPrice(spec, lo / periodsPerYear) - mktPrice)
          ? (lo = mid) : (hi = mid);
        ytm = (lo + hi) / 2;
      }
    }
  }

  return { price, ytm, macaulayDuration, modifiedDuration, dv01, convexity };
}

// ─── Portfolio analytics ──────────────────────────────────────────────────────

/**
 * Compute portfolio-level risk and return metrics.
 *
 * @param holdings        Assets with weights and return history (same-length arrays)
 * @param riskFreeRate    Annual risk-free rate (e.g. 0.04); optional — required for Sharpe
 * @param benchmarkReturns Benchmark return series; optional — required for beta
 */
export function analyzePortfolio(
  holdings:         PortfolioHolding[],
  riskFreeRate?:    number,
  benchmarkReturns?: number[],
): PortfolioResult {
  if (holdings.length === 0) throw new Error('[finance] at least one holding required');
  const n = holdings[0].returns.length;
  if (n < 2) throw new Error('[finance] at least 2 return observations required');
  if (holdings.some((h) => h.returns.length !== n)) throw new Error('[finance] all return series must have same length');

  const totalWeight = holdings.reduce((s, h) => s + h.weight, 0);
  if (Math.abs(totalWeight - 1) > 1e-6) throw new Error(`[finance] weights must sum to 1 (got ${totalWeight.toFixed(6)})`);

  // Portfolio returns (weighted sum each period)
  const portReturns = Array.from({ length: n }, (_, t) =>
    holdings.reduce((s, h) => s + h.weight * h.returns[t], 0),
  );

  const expectedReturn = portReturns.reduce((s, r) => s + r, 0) / n;
  const variance       = portReturns.reduce((s, r) => s + (r - expectedReturn) ** 2, 0) / (n - 1);
  const stdDev         = Math.sqrt(variance);

  // Sharpe ratio (annualised using period count as proxy)
  let sharpeRatio: number | null = null;
  if (riskFreeRate !== undefined) {
    const periodsPerYear  = n; // single-period approximation
    const excessReturn    = expectedReturn - riskFreeRate / periodsPerYear;
    sharpeRatio = stdDev > 0 ? (excessReturn / stdDev) * Math.sqrt(n) : null;
  }

  // Beta (CAPM: β = Cov(Rp, Rm) / Var(Rm))
  let beta: number | null = null;
  if (benchmarkReturns && benchmarkReturns.length === n) {
    const benchMean = benchmarkReturns.reduce((s, r) => s + r, 0) / n;
    const cov       = portReturns.reduce((s, r, i) => s + (r - expectedReturn) * (benchmarkReturns[i] - benchMean), 0) / (n - 1);
    const benchVar  = benchmarkReturns.reduce((s, r) => s + (r - benchMean) ** 2, 0) / (n - 1);
    beta = benchVar > 0 ? cov / benchVar : null;
  }

  // Historical VaR and CVaR at 95%
  const sorted = [...portReturns].sort((a, b) => a - b);
  const idx    = Math.ceil(0.05 * n) - 1;
  const var95  = -sorted[Math.max(0, idx)];   // convert return to loss
  const tail   = sorted.slice(0, idx + 1);
  const cvar95 = -(tail.reduce((s, v) => s + v, 0) / tail.length);

  return { expectedReturn, variance, stdDev, sharpeRatio, beta, var95, cvar95 };
}

// ─── Black-Scholes ────────────────────────────────────────────────────────────

/**
 * Black-Scholes European option pricing with full Greeks.
 *
 * @param S  Spot price
 * @param K  Strike price
 * @param T  Time to expiry (years)
 * @param r  Risk-free rate (annual, continuously compounded)
 * @param σ  Volatility (annual)
 */
export function blackScholes(S: number, K: number, T: number, r: number, sigma: number): BlackScholesResult {
  if (S <= 0)     throw new Error('[finance] spot price must be > 0');
  if (K <= 0)     throw new Error('[finance] strike must be > 0');
  if (T <= 0)     throw new Error('[finance] time to expiry must be > 0');
  if (sigma <= 0) throw new Error('[finance] volatility must be > 0');

  const sqrtT = Math.sqrt(T);
  const d1    = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2    = d1 - sigma * sqrtT;

  const Nd1   = normalCDF(d1);
  const Nd2   = normalCDF(d2);
  const Nnd1  = normalCDF(-d1);
  const Nnd2  = normalCDF(-d2);
  const nd1   = normalPDF(d1);
  const disc  = Math.exp(-r * T);

  const callPrice = S * Nd1  - K * disc * Nd2;
  const putPrice  = K * disc * Nnd2 - S * Nnd1;

  const callDelta = Nd1;
  const putDelta  = Nd1 - 1;
  const gamma     = nd1 / (S * sigma * sqrtT);
  const vega      = S * nd1 * sqrtT / 100;               // per 1% vol move
  const callTheta = (-(S * nd1 * sigma) / (2 * sqrtT) - r * K * disc * Nd2) / 365;
  const putTheta  = (-(S * nd1 * sigma) / (2 * sqrtT) + r * K * disc * Nnd2) / 365;
  const callRho   = K * T * disc * Nd2  / 100;
  const putRho    = -K * T * disc * Nnd2 / 100;

  return { callPrice, putPrice, callDelta, putDelta, gamma, vega, callTheta, putTheta, callRho, putRho };
}

// ─── Combined analysis ────────────────────────────────────────────────────────

export function analyzeFinance(params: {
  bond?:      { spec: BondSpec; annualYield: number };
  portfolio?: { holdings: PortfolioHolding[]; riskFreeRate?: number; benchmarkReturns?: number[] };
  options?:   { S: number; K: number; T: number; r: number; sigma: number };
}): FinanceAnalysisResult {
  const result: FinanceAnalysisResult = { converged: true };
  if (params.bond)      result.bond      = analyzeBond(params.bond.spec, params.bond.annualYield);
  if (params.portfolio) result.portfolio = analyzePortfolio(
    params.portfolio.holdings, params.portfolio.riskFreeRate, params.portfolio.benchmarkReturns,
  );
  if (params.options) {
    const { S, K, T, r, sigma } = params.options;
    result.options = blackScholes(S, K, T, r, sigma);
  }
  return result;
}

// ─── Receipt ─────────────────────────────────────────────────────────────────

export function buildFinanceReceipt(
  result:  FinanceAnalysisResult,
  options?: { runId?: string },
): FinanceReceipt {
  const violations: Array<{ criterion: string; message: string }> = [];
  if (result.bond?.price !== undefined && result.bond.price <= 0)
    violations.push({ criterion: 'bond_price', message: 'computed bond price ≤ 0' });

  const summary: Record<string, number | null | undefined> = {};
  if (result.bond) {
    summary.bondYTM      = result.bond.ytm;
    summary.bondDuration = result.bond.modifiedDuration;
  }
  if (result.portfolio) {
    summary.portfolioReturn = result.portfolio.expectedReturn;
    summary.portfolioSharpe = result.portfolio.sharpeRatio;
  }
  if (result.options) {
    summary.optionCallPrice = result.options.callPrice;
  }

  const raw = buildDomainSimulationReceipt({
    plugin:        'banking-finance',
    pluginVersion: '1.0.0',
    runId:         options?.runId ?? `fin-${Date.now().toString(36)}`,
    solverConfig: {
      solverType: 'fixed-income-portfolio',
      scale:      'instrument',
      hasBond:      result.bond      !== undefined,
      hasPortfolio: result.portfolio !== undefined,
      hasOptions:   result.options   !== undefined,
    },
    resultSummary: Object.fromEntries(
      Object.entries(summary).filter(([, v]) => v !== undefined && v !== null),
    ) as Record<string, number>,
    cael: {
      version:    'cael.v1',
      event:      'banking_finance.fixed_income',
      solverType: 'banking-finance.fixed-income-portfolio',
    },
    acceptance: { accepted: violations.length === 0, violations },
  });

  return raw as unknown as FinanceReceipt;
}
