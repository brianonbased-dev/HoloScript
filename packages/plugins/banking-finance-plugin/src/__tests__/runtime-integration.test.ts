/**
 * Integration proof: the banking-finance `fixed_income_solver` trait, once
 * registered via the runtime's real `registerTrait` seam, is dispatched BY THE
 * RUNTIME and runs the deterministic bond-pricing solver — NOT called directly
 * as a handler object.
 *
 * Mirrors government-civic-plugin's runtime-integration reference
 * (civic_decision). Drives the real path: executeNode(orb) -> orb-executor ->
 * applyDirectives -> traitHandlers.get('fixed_income_solver').onAttach ->
 * analyzeBond. The negative control proves the registration is load-bearing
 * (without it, the trait is a dead no-op — which is exactly the tier's status
 * quo).
 */
import { describe, it, expect } from 'vitest';
import { HoloScriptRuntime } from '@holoscript/core/runtime';
import { registerBankingFinanceTraitHandlers } from '../runtime';

// ── HAND-DERIVED bond case (pen-and-paper, NOT copied from solver output) ──────
// A 2-period annual bond, face = 1000, coupon = 10% (annual), periodsPerYear = 1,
// discounted at an annual yield of 5%. Chosen because it prices ABOVE par
// (coupon > yield) — a strictly stronger assertion than a par bond, and the
// arithmetic is tractable by hand.
//
//   C (coupon per period) = faceValue × (couponRate / periodsPerYear)
//                         = 1000 × (0.10 / 1) = 100
//   r (yield per period)  = annualYield / periodsPerYear = 0.05 / 1 = 0.05
//
//   price = Σ_{t=1..n} C/(1+r)^t  +  F/(1+r)^n
//         = 100/1.05  +  100/1.05²        (the two coupons)
//           + 1000/1.05²                  (face at maturity)
//         = 100/1.05  +  1100/1.1025
//         = 95.238095…  +  997.732426…
//         = 1092.970522            → assert ≈ 1092.9705
//
//   Macaulay duration = Σ (t/periodsPerYear)·PV(CF_t) / price
//     CF₁ = 100,        PV₁ = 100/1.05      = 95.238095…,  weighted 1×95.238095… = 95.238095…
//     CF₂ = 100+1000,   PV₂ = 1100/1.1025   = 997.732426…, weighted 2×997.732426… = 1995.464853…
//     Σ = 2090.702948… ;  duration = 2090.702948… / 1092.970522… = 1.912863 yr
//                                                          → assert ≈ 1.9129
//
//   Modified duration = macaulay / (1+r) = 1.912863 / 1.05 = 1.821774
//                                                          → assert ≈ 1.8218
const BOND_CONFIG = {
  faceValue: 1000,
  couponRate: 0.1,
  periods: 2,
  periodsPerYear: 1,
  annualYield: 0.05,
} as const;

const EXPECTED_PRICE = 1092.970522;
const EXPECTED_MACAULAY = 1.912863;
const EXPECTED_MODIFIED = 1.821774;

function fixedIncomeOrb(config: Record<string, unknown>): unknown {
  return {
    type: 'orb',
    name: 'bond',
    properties: {},
    methods: [],
    position: [0, 0, 0],
    hologram: { shape: 'orb', color: '#fff', size: 1, glow: false, interactive: false },
    directives: [{ type: 'trait', name: 'fixed_income_solver', config }],
  };
}

/** Flush the runtime's async emit dispatch so `on` listeners have fired. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('banking-finance -> HoloScript runtime integration (fixed_income_solver)', () => {
  it('runtime dispatch runs the bond-pricing solver for a registered @fixed_income_solver orb', async () => {
    const runtime = new HoloScriptRuntime();
    registerBankingFinanceTraitHandlers(runtime);

    const solved: Array<Record<string, unknown>> = [];
    runtime.on('fixed_income_solver_solved', (e: unknown) => {
      solved.push(e as Record<string, unknown>);
    });

    await runtime.executeNode(fixedIncomeOrb({ ...BOND_CONFIG }) as never);
    await flush();

    expect(solved).toHaveLength(1);
    const summary = solved[0];
    // Hand-checked (see derivation above): a premium bond priced at 1092.9705
    // with Macaulay 1.9129 yr and modified duration 1.8218.
    expect(summary.price as number).toBeCloseTo(EXPECTED_PRICE, 4);
    expect(summary.macaulayDuration as number).toBeCloseTo(EXPECTED_MACAULAY, 4);
    expect(summary.modifiedDuration as number).toBeCloseTo(EXPECTED_MODIFIED, 4);
    // No marketPrice supplied, so YTM is null by contract.
    expect(summary.ytm).toBeNull();
  });

  it('NEGATIVE CONTROL: without registration the @fixed_income_solver trait is a dead no-op', async () => {
    const runtime = new HoloScriptRuntime(); // intentionally NOT registered
    const solved: unknown[] = [];
    runtime.on('fixed_income_solver_solved', (e: unknown) => solved.push(e));

    await runtime.executeNode(fixedIncomeOrb({ ...BOND_CONFIG }) as never);
    await flush();

    expect(solved).toHaveLength(0);
  });

  it('persists the solver result into durable runtime state on ATTACH', async () => {
    const runtime = new HoloScriptRuntime();
    registerBankingFinanceTraitHandlers(runtime);

    await runtime.executeNode(fixedIncomeOrb({ ...BOND_CONFIG }) as never);
    await flush();

    const state = runtime.getState() as Record<string, unknown>;
    const persisted = state['fixed_income_solver:bond'] as
      | { price?: number; modifiedDuration?: number }
      | undefined;
    expect(persisted).toBeDefined();
    // Same hand-checked winner value, now read from durable state.
    expect(persisted?.price).toBeCloseTo(EXPECTED_PRICE, 4);
    expect(persisted?.modifiedDuration).toBeCloseTo(EXPECTED_MODIFIED, 4);
  });

  it('emits fixed_income_solver_error (does not throw through the runtime) for invalid config', async () => {
    const runtime = new HoloScriptRuntime();
    registerBankingFinanceTraitHandlers(runtime);

    const errors: Array<Record<string, unknown>> = [];
    runtime.on('fixed_income_solver_error', (e: unknown) => {
      errors.push(e as Record<string, unknown>);
    });

    // Missing the required `faceValue` field — the handler's config validation
    // emits a single fixed_income_solver_error rather than throwing through the
    // runtime. (The same single-error path also covers cases where analyzeBond
    // itself throws, e.g. periods: 0 or a negative annualYield, via try/catch.)
    const { faceValue: _omitted, ...withoutFaceValue } = BOND_CONFIG;
    await runtime.executeNode(fixedIncomeOrb({ ...withoutFaceValue }) as never);
    await flush();

    expect(errors).toHaveLength(1);
    expect(String(errors[0].error)).toContain('faceValue');
  });
});
