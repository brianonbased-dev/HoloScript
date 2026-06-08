/**
 * Sandbox-Cost Composition Theorem Tests — Paper 29
 *
 * Verifies the three key theorems from ATC/CompositionLaw.lean in TypeScript:
 * 1. sandbox_preservation: composed allows ⟹ sandbox allows
 * 2. budget_preservation: composed allows ⟹ budget permits
 * 3. composition_preserves_both: composed.permits ⟺ sandbox.permits ∧ costGuard.permits
 *
 * Also verifies identity, annihilator, and merge strategy laws.
 * Per F.069: every claim has failing-if-broken evidence.
 */

import { describe, it, expect } from 'vitest';
import {
  TrustSandboxPolicy,
  CostGuard,
  ComposedPolicy,
  mergeAdd,
  mergeMul,
  MinPlusSemiring,
  MaxPlusSemiring,
  SumProductSemiring,
  verifySandboxPreservation,
  verifyBudgetPreservation,
  verifyCompositionPreservesBoth,
  type CapabilityClass,
  type MergedCost,
  type ExecutionResult,
} from '../security/SandboxCostComposition';

const ALL_CAPS: CapabilityClass[] = ['network', 'file', 'compute', 'nested'];

// ─── composition_preserves_both ───────────────────────────────────────────────

describe('SandboxCostComposition — composition_preserves_both (Paper 29)', () => {
  it('composed permits iff both sandbox and budget permit (allow × allow)', () => {
    const sandbox = TrustSandboxPolicy.allowAll;
    const costGuard = new CostGuard({ budgetLimit: 10, spent: 5 });
    const composed = new ComposedPolicy(sandbox, costGuard);

    for (const cap of ALL_CAPS) {
      expect(composed.permits(cap)).toBe(true);
      expect(verifyCompositionPreservesBoth(sandbox, costGuard, cap)).toBe(true);
    }
  });

  it('composed denies when sandbox denies (deny × allow)', () => {
    const sandbox = TrustSandboxPolicy.denyAll;
    const costGuard = new CostGuard({ budgetLimit: 10, spent: 5 });
    const composed = new ComposedPolicy(sandbox, costGuard);

    for (const cap of ALL_CAPS) {
      expect(composed.permits(cap)).toBe(false);
      expect(verifyCompositionPreservesBoth(sandbox, costGuard, cap)).toBe(true);
    }
  });

  it('composed denies when budget exceeded (allow × deny)', () => {
    const sandbox = TrustSandboxPolicy.allowAll;
    const costGuard = new CostGuard({ budgetLimit: 10, spent: 15 });
    const composed = new ComposedPolicy(sandbox, costGuard);

    for (const cap of ALL_CAPS) {
      expect(composed.permits(cap)).toBe(false);
      expect(verifyCompositionPreservesBoth(sandbox, costGuard, cap)).toBe(true);
    }
  });

  it('composed denies when both deny (deny × deny)', () => {
    const sandbox = TrustSandboxPolicy.denyAll;
    const costGuard = new CostGuard({ budgetLimit: 10, spent: 15 });
    const composed = new ComposedPolicy(sandbox, costGuard);

    for (const cap of ALL_CAPS) {
      expect(composed.permits(cap)).toBe(false);
      expect(verifyCompositionPreservesBoth(sandbox, costGuard, cap)).toBe(true);
    }
  });

  it('composed permits for individual capabilities when selectively allowed', () => {
    const sandbox = new TrustSandboxPolicy({
      permitsNetwork: true,
      permitsFile: false,
      permitsCompute: true,
      permitsNested: false,
    });
    const costGuard = new CostGuard({ budgetLimit: 10, spent: 3 });
    const composed = new ComposedPolicy(sandbox, costGuard);

    expect(composed.permits('network')).toBe(true);
    expect(composed.permits('file')).toBe(false);
    expect(composed.permits('compute')).toBe(true);
    expect(composed.permits('nested')).toBe(false);
  });
});

// ─── sandbox_preservation ───────────────────────────────────────────────────────

describe('SandboxCostComposition — sandbox_preservation', () => {
  it('if composed allows, sandbox must allow', () => {
    const sandbox = new TrustSandboxPolicy({
      permitsNetwork: true,
      permitsFile: true,
      permitsCompute: false,
      permitsNested: false,
    });
    const costGuard = new CostGuard({ budgetLimit: 100, spent: 0 });

    for (const cap of ALL_CAPS) {
      expect(verifySandboxPreservation(new ComposedPolicy(sandbox, costGuard), cap)).toBe(true);
    }
  });

  it('sandbox violation is caught even with unlimited budget', () => {
    const sandbox = TrustSandboxPolicy.denyAll;
    const costGuard = new CostGuard({ budgetLimit: 0, spent: 0 });

    for (const cap of ALL_CAPS) {
      const composed = new ComposedPolicy(sandbox, costGuard);
      expect(composed.permits(cap)).toBe(false);
      expect(verifySandboxPreservation(composed, cap)).toBe(true);
    }
  });
});

// ─── budget_preservation ────────────────────────────────────────────────────────

describe('SandboxCostComposition — budget_preservation', () => {
  it('if composed allows, budget must permit', () => {
    const sandbox = TrustSandboxPolicy.allowAll;
    const costGuard = new CostGuard({ budgetLimit: 50, spent: 49 });
    const composed = new ComposedPolicy(sandbox, costGuard);

    for (const cap of ALL_CAPS) {
      expect(verifyBudgetPreservation(composed, cap)).toBe(true);
    }
  });

  it('budget violation is caught even with full sandbox access', () => {
    const sandbox = TrustSandboxPolicy.allowAll;
    const costGuard = new CostGuard({ budgetLimit: 5, spent: 10 });
    const composed = new ComposedPolicy(sandbox, costGuard);

    expect(composed.permits('network')).toBe(false);
    expect(verifyBudgetPreservation(composed, 'network')).toBe(true);
  });
});

// ─── Execution Result Classification ──────────────────────────────────────────

describe('SandboxCostComposition — execute classification', () => {
  it('allowed when both sandbox and budget permit', () => {
    const composed = new ComposedPolicy(
      TrustSandboxPolicy.allowAll,
      new CostGuard({ budgetLimit: 10, spent: 5 })
    );
    const result = composed.execute('network');
    expect(result.kind).toBe('allowed');
    expect(result.sandboxPermitted).toBe(true);
    expect(result.budgetPermitted).toBe(true);
  });

  it('deniedSandbox when sandbox denies but budget allows', () => {
    const composed = new ComposedPolicy(
      TrustSandboxPolicy.denyAll,
      new CostGuard({ budgetLimit: 10, spent: 5 })
    );
    const result = composed.execute('network');
    expect(result.kind).toBe('deniedSandbox');
    expect(result.sandboxPermitted).toBe(false);
    expect(result.budgetPermitted).toBe(true);
  });

  it('deniedBudget when sandbox allows but budget exceeded', () => {
    const composed = new ComposedPolicy(
      TrustSandboxPolicy.allowAll,
      new CostGuard({ budgetLimit: 10, spent: 15 })
    );
    const result = composed.execute('network');
    expect(result.kind).toBe('deniedBudget');
    expect(result.sandboxPermitted).toBe(true);
    expect(result.budgetPermitted).toBe(false);
  });

  it('deniedBoth when both sandbox and budget deny', () => {
    const composed = new ComposedPolicy(
      TrustSandboxPolicy.denyAll,
      new CostGuard({ budgetLimit: 10, spent: 15 })
    );
    const result = composed.execute('network');
    expect(result.kind).toBe('deniedBoth');
    expect(result.sandboxPermitted).toBe(false);
    expect(result.budgetPermitted).toBe(false);
  });
});

// ─── Identity and Annihilator Laws ─────────────────────────────────────────────

describe('SandboxCostComposition — identity and annihilator laws', () => {
  it('sandbox identity: allowAll composed with unlimited budget = allowAll', () => {
    const sandbox = TrustSandboxPolicy.allowAll;
    const budget = new CostGuard({ budgetLimit: 0, spent: 0 });
    const composed = new ComposedPolicy(sandbox, budget);

    for (const cap of ALL_CAPS) {
      expect(composed.permits(cap)).toBe(true);
    }
  });

  it('sandbox annihilator: denyAll composed with any budget = denyAll', () => {
    const sandbox = TrustSandboxPolicy.denyAll;
    const budget = new CostGuard({ budgetLimit: 0, spent: 0 });
    const composed = new ComposedPolicy(sandbox, budget);

    for (const cap of ALL_CAPS) {
      expect(composed.permits(cap)).toBe(false);
    }
  });

  it('budget annihilator: exceeded budget composed with any sandbox = denied', () => {
    const sandbox = TrustSandboxPolicy.allowAll;
    const budget = new CostGuard({ budgetLimit: 1, spent: 100 });
    const composed = new ComposedPolicy(sandbox, budget);

    for (const cap of ALL_CAPS) {
      expect(composed.permits(cap)).toBe(false);
    }
  });

  it('budget identity: unlimited budget preserves sandbox permissions', () => {
    const sandbox = new TrustSandboxPolicy({
      permitsNetwork: true,
      permitsFile: false,
      permitsCompute: true,
      permitsNested: false,
    });
    const budget = new CostGuard({ budgetLimit: 0, spent: 0 });
    const composed = new ComposedPolicy(sandbox, budget);

    expect(composed.permits('network')).toBe(true);
    expect(composed.permits('file')).toBe(false);
    expect(composed.permits('compute')).toBe(true);
    expect(composed.permits('nested')).toBe(false);
  });
});

// ─── Merge Strategy Laws (Semiring) ───────────────────────────────────────────

describe('SandboxCostComposition — merge strategy laws', () => {
  const a: MergedCost = { sandboxCost: 3, costGuardCost: 5 };
  const b: MergedCost = { sandboxCost: 7, costGuardCost: 2 };
  const zero: MergedCost = { sandboxCost: 0, costGuardCost: 0 };
  const one: MergedCost = { sandboxCost: 1, costGuardCost: 1 };

  it('min-plus: add is min, mul is plus (tropical semiring)', () => {
    const added = mergeAdd(a, b, MinPlusSemiring);
    expect(added.sandboxCost).toBe(Math.min(3, 7));
    expect(added.costGuardCost).toBe(Math.min(5, 2));

    const multiplied = mergeMul(a, b, MinPlusSemiring);
    expect(multiplied.sandboxCost).toBe(3 + 7);
    expect(multiplied.costGuardCost).toBe(5 + 2);
  });

  it('max-plus: add is max, mul is plus', () => {
    const added = mergeAdd(a, b, MaxPlusSemiring);
    expect(added.sandboxCost).toBe(Math.max(3, 7));
    expect(added.costGuardCost).toBe(Math.max(5, 2));

    const multiplied = mergeMul(a, b, MaxPlusSemiring);
    expect(multiplied.sandboxCost).toBe(3 + 7);
    expect(multiplied.costGuardCost).toBe(5 + 2);
  });

  it('sum-product: add is sum, mul is product', () => {
    const added = mergeAdd(a, b, SumProductSemiring);
    expect(added.sandboxCost).toBe(3 + 7);
    expect(added.costGuardCost).toBe(5 + 2);

    const multiplied = mergeMul(a, b, SumProductSemiring);
    expect(multiplied.sandboxCost).toBe(3 * 7);
    expect(multiplied.costGuardCost).toBe(5 * 2);
  });

  it('sum-product zero element preserves via add', () => {
    const result = mergeAdd(a, zero, SumProductSemiring);
    expect(result.sandboxCost).toBe(3 + 0);
    expect(result.costGuardCost).toBe(5 + 0);
  });

  it('sum-product one element preserves via mul', () => {
    const result = mergeMul(a, one, SumProductSemiring);
    expect(result.sandboxCost).toBe(3 * 1);
    expect(result.costGuardCost).toBe(5 * 1);
  });
});
