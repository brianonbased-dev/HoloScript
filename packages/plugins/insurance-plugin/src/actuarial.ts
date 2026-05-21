/**
 * Actuarial math solver — insurance-plugin
 *
 * Implements standard actuarial calculations without external dependencies:
 *   - Life-table survival functions (qx / lx / dx / Lx / Tx / ex)
 *   - Net single premium (NSP) for whole-life, term-life, endowment contracts
 *   - Level annual premium from equivalence principle
 *   - Net Present Value of a cash-flow stream
 *   - Value at Risk (VaR) and Conditional VaR (CVaR) via sorted loss vector
 *   - Bonus: Gompertz-Makeham mortality model for parameter fitting
 *   - CAEL-backed receipt
 *
 * References:
 *   Bowers et al. "Actuarial Mathematics" (2nd ed., 1997) — SOA study text.
 *   London, D. "Survival Models and Their Estimation" (3rd ed., 1997).
 */

import {
  DOMAIN_SIMULATION_RECEIPT_SCHEMA,
  buildDomainSimulationReceipt,
} from '@holoscript/core';

// ─── Types ────────────────────────────────────────────────────────────────────

/** One row of a standard life table (age x). */
export interface LifeTableRow {
  age:    number; // x  — integer age
  qx:     number; // probability of death between age x and x+1
  lx:     number; // number of survivors at age x (radix l₀ = 100 000)
  dx:     number; // deaths between x and x+1
  Lx:     number; // person-years lived between x and x+1
  Tx:     number; // total person-years lived above age x
  ex:     number; // curtate life expectancy at age x
}

/** Abridged model life table — minimum required: age 0 through at least age 100. */
export interface LifeTable {
  id:    string;
  rows:  LifeTableRow[];
  /** Annual effective interest rate (e.g. 0.05 = 5%) */
  interestRate: number;
}

export type PolicyType = 'whole_life' | 'term_life' | 'endowment' | 'annuity_due';

export interface PolicySpec {
  type:          PolicyType;
  issueAge:      number;  // age at policy issue
  termYears?:    number;  // required for term_life and endowment
  benefitAmount: number;  // face amount (currency units)
  /** Annual effective interest rate override; falls back to table default */
  interestRate?: number;
}

export interface ActuarialResult {
  /** Net Single Premium — expected present value of benefits */
  nsp:           number;
  /** Level annual premium (equivalence principle) */
  annualPremium: number;
  /** Curtate life expectancy at issue age */
  lifeExpectancy: number;
  /** Present value of an annuity-due of 1 per year at issue age */
  annuityDue:    number;
  /** Policy type */
  policyType:    PolicyType;
  issueAge:      number;
  termYears:     number | null;
}

export interface CashFlow {
  /** Period index (0-based; typically year number) */
  period:    number;
  /** Cash inflow (+) or outflow (−) */
  amount:    number;
}

export interface NPVResult {
  npv:          number;
  irr:          number | null; // null if no real IRR found in 0–200% range
  paybackPeriod: number | null; // period where cumulative CF first ≥ 0
}

export interface VaRResult {
  confidenceLevel: number;  // e.g. 0.95
  var95:           number;  // VaR at 95%
  var99:           number;  // VaR at 99%
  cvar95:          number;  // CVaR (expected shortfall) at 95%
  cvar99:          number;  // CVaR at 99%
  expectedLoss:    number;
  maxLoss:         number;
  sampleSize:      number;
}

export interface ActuarialReceipt {
  plugin:        string;
  runId:         string;
  payloadHash:   string;
  hashAlgorithm: string;
  cael:          { event: string; schemaVersion: string; ts: string };
  acceptance:    { accepted: boolean; violations: string[] };
  resultSummary: {
    nsp:            number;
    annualPremium:  number;
    lifeExpectancy: number;
  };
}

// ─── Life table construction ──────────────────────────────────────────────────

const RADIX = 100_000;

/**
 * Build a complete life table from an array of qx values (one per age starting at 0).
 * Follows standard actuarial convention: lx, dx, Lx, Tx, ex.
 */
export function buildLifeTable(id: string, qxByAge: number[], interestRate: number): LifeTable {
  if (qxByAge.length < 2) throw new Error('[actuarial] qxByAge must have at least 2 entries');
  if (qxByAge.some((q) => q < 0 || q > 1)) throw new Error('[actuarial] all qx values must be in [0,1]');
  if (interestRate < 0) throw new Error('[actuarial] interestRate must be ≥ 0');

  const rows: LifeTableRow[] = [];
  const lx_arr: number[] = [RADIX];
  const dx_arr: number[] = [];
  const Lx_arr: number[] = [];
  const Tx_arr: number[] = [];
  const ex_arr: number[] = [];

  const n = qxByAge.length;

  // Compute lx and dx
  for (let x = 0; x < n; x++) {
    const l = lx_arr[x];
    const d = l * qxByAge[x];
    dx_arr.push(d);
    lx_arr.push(l - d);
  }

  // Compute Lx (person-years lived; trapezoidal approximation)
  for (let x = 0; x < n; x++) {
    Lx_arr.push((lx_arr[x] + lx_arr[x + 1]) / 2);
  }

  // Compute Tx (cumulative from top)
  Tx_arr[n - 1] = Lx_arr[n - 1];
  for (let x = n - 2; x >= 0; x--) {
    Tx_arr[x] = Tx_arr[x + 1] + Lx_arr[x];
  }

  // Compute ex
  for (let x = 0; x < n; x++) {
    ex_arr.push(lx_arr[x] > 0 ? Tx_arr[x] / lx_arr[x] : 0);
  }

  for (let x = 0; x < n; x++) {
    rows.push({
      age: x,
      qx:  qxByAge[x],
      lx:  lx_arr[x],
      dx:  dx_arr[x],
      Lx:  Lx_arr[x],
      Tx:  Tx_arr[x],
      ex:  ex_arr[x],
    });
  }

  return { id, rows, interestRate };
}

// ─── Actuarial commutation functions ─────────────────────────────────────────

/**
 * Compute commutation columns Dx, Nx, Cx, Mx from a life table.
 * These underlie all standard life insurance and annuity formulas.
 *
 *   Dx = vˣ · lx        (discounted survivors)
 *   Nx = Σ(x to ω) Dx   (accumulated Dx)
 *   Cx = v^(x+1) · dx   (discounted deaths)
 *   Mx = Σ(x to ω) Cx   (accumulated Cx)
 */
function commutationColumns(table: LifeTable, iRate: number): {
  Dx: number[]; Nx: number[]; Cx: number[]; Mx: number[];
} {
  const v   = 1 / (1 + iRate);
  const n   = table.rows.length;
  const Dx  = table.rows.map((r) => Math.pow(v, r.age) * r.lx);
  const Cx  = table.rows.map((r) => Math.pow(v, r.age + 1) * r.dx);

  const Nx: number[] = new Array(n).fill(0);
  const Mx: number[] = new Array(n).fill(0);
  Nx[n - 1] = Dx[n - 1];
  Mx[n - 1] = Cx[n - 1];
  for (let x = n - 2; x >= 0; x--) {
    Nx[x] = Nx[x + 1] + Dx[x];
    Mx[x] = Mx[x + 1] + Cx[x];
  }

  return { Dx, Nx, Cx, Mx };
}

// ─── Premium calculation ──────────────────────────────────────────────────────

/**
 * Compute actuarial values for a policy using the equivalence principle.
 *
 * Policy types:
 *   whole_life   — benefit B paid at end of year of death
 *   term_life    — B paid at end of year of death if within n years
 *   endowment    — B paid at earlier of death or survival to end of n years
 *   annuity_due  — benefit B paid at START of each year while alive (no death benefit)
 */
export function computeActuarialValues(spec: PolicySpec, table: LifeTable): ActuarialResult {
  const n       = table.rows.length;
  const iRate   = spec.interestRate ?? table.interestRate;
  const x       = spec.issueAge;
  const B       = spec.benefitAmount;

  if (x < 0 || x >= n) throw new Error(`[actuarial] issueAge ${x} out of table range [0, ${n - 1}]`);
  if (iRate < 0)        throw new Error('[actuarial] interestRate must be ≥ 0');

  const { Dx, Nx, Mx } = commutationColumns(table, iRate);

  const row      = table.rows[x];
  const lifeExp  = row.ex;

  // ── Whole life ──────────────────────────────────────────────────────────────
  if (spec.type === 'whole_life') {
    const Ax       = Mx[x] / Dx[x];           // net single premium per unit benefit
    const annuity  = Nx[x] / Dx[x];           // ä_x (annuity-due of 1)
    const nsp      = B * Ax;
    const Px       = Ax / annuity;            // level premium per unit benefit per year
    return {
      nsp,
      annualPremium: B * Px,
      lifeExpectancy: lifeExp,
      annuityDue:    annuity,
      policyType:    'whole_life',
      issueAge:      x,
      termYears:     null,
    };
  }

  // ── Term life ───────────────────────────────────────────────────────────────
  if (spec.type === 'term_life') {
    const term = spec.termYears ?? 20;
    const xn   = Math.min(x + term, n - 1);
    const A1xn = (Mx[x] - Mx[xn]) / Dx[x];  // A^1_{x:n} term insurance per unit
    const axn  = (Nx[x] - Nx[xn]) / Dx[x];  // ä_{x:n} term annuity-due per unit
    const nsp  = B * A1xn;
    return {
      nsp,
      annualPremium: axn > 0 ? nsp / axn : 0,
      lifeExpectancy: lifeExp,
      annuityDue:    axn,
      policyType:    'term_life',
      issueAge:      x,
      termYears:     term,
    };
  }

  // ── Endowment ───────────────────────────────────────────────────────────────
  if (spec.type === 'endowment') {
    const term = spec.termYears ?? 20;
    const xn   = Math.min(x + term, n - 1);
    // Endowment = term life + pure endowment (survival to n)
    const A1xn = (Mx[x] - Mx[xn]) / Dx[x];  // insurance component
    const Exn  = Dx[xn] / Dx[x];             // pure endowment (n Ex)
    const Axn  = A1xn + Exn;                 // endowment NSP per unit
    const axn  = (Nx[x] - Nx[xn]) / Dx[x];
    const nsp  = B * Axn;
    return {
      nsp,
      annualPremium: axn > 0 ? nsp / axn : 0,
      lifeExpectancy: lifeExp,
      annuityDue:    axn,
      policyType:    'endowment',
      issueAge:      x,
      termYears:     term,
    };
  }

  // ── Life annuity-due ────────────────────────────────────────────────────────
  if (spec.type === 'annuity_due') {
    const term     = spec.termYears;
    let annuityDue: number;
    let termYears: number | null;

    if (term != null) {
      // Temporary life annuity-due ä_{x:n}
      const xn   = Math.min(x + term, n - 1);
      annuityDue = (Nx[x] - Nx[xn]) / Dx[x];
      termYears  = term;
    } else {
      // Whole life annuity-due ä_x
      annuityDue = Nx[x] / Dx[x];
      termYears  = null;
    }

    const nsp = B * annuityDue;
    return {
      nsp,
      annualPremium: 0, // annuities don't have a separately stated premium
      lifeExpectancy: lifeExp,
      annuityDue,
      policyType:    'annuity_due',
      issueAge:      x,
      termYears,
    };
  }

  throw new Error(`[actuarial] unknown policy type: ${(spec as PolicySpec).type}`);
}

// ─── NPV / IRR ────────────────────────────────────────────────────────────────

/**
 * Compute Net Present Value at a given discount rate.
 * Also estimates IRR (via bisection, 0–200%) and payback period.
 */
export function computeNPV(cashFlows: CashFlow[], discountRate: number): NPVResult {
  if (cashFlows.length === 0) throw new Error('[actuarial] cashFlows must not be empty');
  if (discountRate < 0)       throw new Error('[actuarial] discountRate must be ≥ 0');

  const sorted = [...cashFlows].sort((a, b) => a.period - b.period);

  const npv = sorted.reduce((s, cf) => s + cf.amount / (1 + discountRate) ** cf.period, 0);

  // Payback period: earliest period where cumulative undiscounted CF ≥ 0
  let cum = 0;
  let paybackPeriod: number | null = null;
  for (const cf of sorted) {
    cum += cf.amount;
    if (cum >= 0 && paybackPeriod === null) { paybackPeriod = cf.period; }
  }

  // IRR via bisection (finds rate where NPV = 0)
  let irr: number | null = null;
  const npvAt = (r: number) => sorted.reduce((s, cf) => s + cf.amount / (1 + r) ** cf.period, 0);
  const lo = 0, hi = 2.0; // 0% to 200%
  if (Math.sign(npvAt(lo)) !== Math.sign(npvAt(hi))) {
    let a = lo, b = hi;
    for (let i = 0; i < 100; i++) {
      const mid = (a + b) / 2;
      if (Math.abs(b - a) < 1e-10) { irr = mid; break; }
      Math.sign(npvAt(mid)) === Math.sign(npvAt(a)) ? (a = mid) : (b = mid);
      irr = (a + b) / 2;
    }
  }

  return { npv, irr, paybackPeriod };
}

// ─── Value at Risk ────────────────────────────────────────────────────────────

/**
 * Compute historical VaR and CVaR from a vector of loss observations.
 * Positive values = losses; negative values = gains.
 */
export function computeVaR(losses: number[]): VaRResult {
  if (losses.length < 2) throw new Error('[actuarial] VaR requires at least 2 loss observations');

  const sorted = [...losses].sort((a, b) => a - b);
  const n      = sorted.length;

  const idx95 = Math.ceil(0.95 * n) - 1;
  const idx99 = Math.ceil(0.99 * n) - 1;

  const var95 = sorted[idx95];
  const var99 = sorted[idx99];

  // CVaR: mean of losses beyond VaR threshold
  const tail95 = sorted.slice(idx95);
  const tail99 = sorted.slice(idx99);
  const cvar95 = tail95.reduce((s, v) => s + v, 0) / tail95.length;
  const cvar99 = tail99.reduce((s, v) => s + v, 0) / tail99.length;

  const expectedLoss = sorted.reduce((s, v) => s + v, 0) / n;
  const maxLoss      = sorted[n - 1];

  return {
    confidenceLevel: 0.95,
    var95,
    var99,
    cvar95,
    cvar99,
    expectedLoss,
    maxLoss,
    sampleSize: n,
  };
}

// ─── Gompertz-Makeham mortality model ─────────────────────────────────────────

/**
 * Gompertz-Makeham force of mortality: μ(x) = A + B·cˣ
 *
 * Parameters:
 *   A — background hazard (accident component)
 *   B — initial mortality rate at age 0 (aging component)
 *   c — rate of increase (c > 1 for increasing mortality)
 *
 * Returns qx values for ages 0 .. maxAge.
 */
export function gompertzMakehamQx(params: { A: number; B: number; c: number }, maxAge: number): number[] {
  const { A, B, c } = params;
  if (B <= 0 || c <= 1) throw new Error('[actuarial] Gompertz params require B>0 and c>1');
  const lnC = Math.log(c);
  return Array.from({ length: maxAge + 1 }, (_, x) => {
    // qx ≈ 1 − exp(−∫ₓˣ⁺¹ μ(t) dt) = 1 − exp(−A − B(cˣ)(c−1)/ln(c))
    const integral = A + B * Math.pow(c, x) * (c - 1) / lnC;
    return Math.min(1, 1 - Math.exp(-integral));
  });
}

// ─── Receipt ─────────────────────────────────────────────────────────────────

export function buildActuarialReceipt(
  result:  ActuarialResult,
  options?: { runId?: string },
): ActuarialReceipt {
  const violations: Array<{ criterion: string; message: string }> = [];
  if (result.nsp < 0)
    violations.push({ criterion: 'nsp', message: `negative NSP: ${result.nsp.toFixed(4)}` });
  if (result.annualPremium < 0)
    violations.push({ criterion: 'premium', message: `negative annual premium: ${result.annualPremium.toFixed(4)}` });

  const raw = buildDomainSimulationReceipt({
    plugin:        'insurance',
    pluginVersion: '1.0.0',
    runId:         options?.runId ?? `act-${Date.now().toString(36)}`,
    modelId:       `${result.policyType}-age${result.issueAge}`,
    solverConfig: {
      solverType:  'commutation-columns',
      scale:       'individual-policy',
      policyType:  result.policyType,
      issueAge:    result.issueAge,
    },
    resultSummary: {
      nsp:            +result.nsp.toFixed(4),
      annualPremium:  +result.annualPremium.toFixed(4),
      lifeExpectancy: +result.lifeExpectancy.toFixed(2),
    },
    cael: {
      version:    'cael.v1',
      event:      'insurance.actuarial',
      solverType: 'insurance.commutation-columns',
    },
    acceptance: { accepted: violations.length === 0, violations },
  });

  return raw as unknown as ActuarialReceipt;
}
