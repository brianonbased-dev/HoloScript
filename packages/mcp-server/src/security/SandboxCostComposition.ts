/**
 * Sandbox-Cost Composition — Paper 29 theorem in TypeScript.
 *
 * Composes a sandbox policy with a cost guard using the algebraic structure
 * proven in `ATC/CompositionLaw.lean`. The key theorem:
 *
 *   composition_preserves_both:
 *     ∀ (sandbox : SandboxPolicy) (costGuard : CostGuard) (cap : CapabilityClass),
 *       ComposedPolicy.permits sandbox costGuard cap
 *         = sandbox.permits cap ∧ costGuard.permits
 *
 * This module provides the TypeScript implementation that mirrors the Lean 4
 * mechanization, with property-based tests verifying the theorem holds for
 * all five merge strategies.
 *
 * Theorem source: research/paper-29-algebraic-trust-toolsandbox/ATC/CompositionLaw.lean
 * Production mapping: research/paper-29-algebraic-trust-toolsandbox/README.md
 */

/**
 * Minimal Semiring interface for merge strategies.
 * Inlined from @holoscript/core/compiler/traits/Semiring to avoid deep import path.
 */
export interface MergeSemiring<T> {
  add(a: T, b: T): T;
  mul(a: T, b: T): T;
  zero: T;
  one: T;
}

// Pre-defined semiring strategies (Paper 29, ATC/Basic.lean)
export const MinPlusSemiring: MergeSemiring<number> = {
  add: (a, b) => Math.min(a, b),
  mul: (a, b) => a + b,
  zero: Number.POSITIVE_INFINITY,
  one: 0,
};

export const MaxPlusSemiring: MergeSemiring<number> = {
  add: (a, b) => Math.max(a, b),
  mul: (a, b) => a + b,
  zero: Number.NEGATIVE_INFINITY,
  one: 0,
};

export const SumProductSemiring: MergeSemiring<number> = {
  add: (a, b) => a + b,
  mul: (a, b) => a * b,
  zero: 0,
  one: 1,
};

// ── Capability Classes ─────────────────────────────────────────────────────────

export type CapabilityClass =
  | 'network'
  | 'file'
  | 'compute'
  | 'nested';

// ── Sandbox Policy ─────────────────────────────────────────────────────────────

export interface TrustSandboxPolicyConfig {
  /** Which capabilities are permitted */
  permitsNetwork: boolean;
  permitsFile: boolean;
  permitsCompute: boolean;
  permitsNested: boolean;
}

/**
 * A sandbox policy determines which capabilities an execution context may use.
 *
 * Mirrors Lean `SandboxPolicy` from ATC/Basic.lean.
 * Named TrustSandboxPolicy to avoid collision with the existing SandboxPolicy
 * in sandbox-policy.ts (which is the runtime gate, not the theorem structure).
 * The `permits` function maps each CapabilityClass to a boolean permission.
 */
export class TrustSandboxPolicy {
  constructor(private readonly config: TrustSandboxPolicyConfig) {}

  permits(cap: CapabilityClass): boolean {
    switch (cap) {
      case 'network': return this.config.permitsNetwork;
      case 'file': return this.config.permitsFile;
      case 'compute': return this.config.permitsCompute;
      case 'nested': return this.config.permitsNested;
    }
  }

  /** All capabilities denied (most restrictive) */
  static readonly denyAll: TrustSandboxPolicy = new TrustSandboxPolicy({
    permitsNetwork: false,
    permitsFile: false,
    permitsCompute: false,
    permitsNested: false,
  });

  /** All capabilities allowed (least restrictive) */
  static readonly allowAll: TrustSandboxPolicy = new TrustSandboxPolicy({
    permitsNetwork: true,
    permitsFile: true,
    permitsCompute: true,
    permitsNested: true,
  });
}

// ── Cost Guard ─────────────────────────────────────────────────────────────────

export interface CostGuardConfig {
  /** Budget limit in USD; 0 means unlimited */
  budgetLimit: number;
  /** Amount spent so far in USD */
  spent: number;
}

/**
 * A cost guard tracks budget expenditure and determines whether an action
 * is permitted based on remaining budget.
 *
 * Mirrors Lean `CostGuard` from ATC/Basic.lean.
 * `budgetLimit = 0` corresponds to `budgetLimit = none` in Lean (unlimited).
 */
export class CostGuard {
  constructor(private readonly config: CostGuardConfig) {}

  /** Whether the budget has NOT been exceeded */
  get permits(): boolean {
    if (this.config.budgetLimit === 0) return true; // unlimited
    return this.config.spent < this.config.budgetLimit;
  }

  /** Remaining budget in USD; Infinity if unlimited */
  get remaining(): number {
    if (this.config.budgetLimit === 0) return Number.POSITIVE_INFINITY;
    return Math.max(0, this.config.budgetLimit - this.config.spent);
  }
}

// ── Merged Cost (Semiring application) ────────────────────────────────────────

export interface MergedCost {
  sandboxCost: number;
  costGuardCost: number;
}

/**
 * Merge two costs using a semiring strategy.
 * This mirrors Lean `mergeAdd` and `mergeMul` from ATC/Basic.lean.
 */
export function mergeAdd(
  a: MergedCost,
  b: MergedCost,
  strategy: MergeSemiring<number>,
): MergedCost {
  return {
    sandboxCost: strategy.add(a.sandboxCost, b.sandboxCost),
    costGuardCost: strategy.add(a.costGuardCost, b.costGuardCost),
  };
}

export function mergeMul(
  a: MergedCost,
  b: MergedCost,
  strategy: MergeSemiring<number>,
): MergedCost {
  return {
    sandboxCost: strategy.mul(a.sandboxCost, b.sandboxCost),
    costGuardCost: strategy.mul(a.costGuardCost, b.costGuardCost),
  };
}

// ── Execution Result ────────────────────────────────────────────────────────────

export type ExecutionResult =
  | { kind: 'allowed'; sandboxPermitted: true; budgetPermitted: true }
  | { kind: 'deniedSandbox'; sandboxPermitted: false; budgetPermitted: boolean }
  | { kind: 'deniedBudget'; sandboxPermitted: boolean; budgetPermitted: false }
  | { kind: 'deniedBoth'; sandboxPermitted: false; budgetPermitted: false };

// ── Composed Policy ────────────────────────────────────────────────────────────

/**
 * A composed policy that requires BOTH sandbox permission AND budget availability.
 *
 * Mirrors Lean `ComposedPolicy` from ATC/Basic.lean:
 *   def ComposedPolicy.permits (sandbox : SandboxPolicy) (costGuard : CostGuard) (cap : CapabilityClass) : Bool :=
 *     sandbox.permits cap && costGuard.permits
 *
 * Theorem (CompositionLaw.lean, line ~150):
 *   theorem composition_preserves_both :
 *     ∀ (sandbox : SandboxPolicy) (costGuard : CostGuard) (cap : CapabilityClass),
 *       ComposedPolicy.permits sandbox costGuard cap =
 *         sandbox.permits cap ∧ costGuard.permits
 */
export class ComposedPolicy {
  constructor(
    public readonly sandbox: TrustSandboxPolicy,
    public readonly costGuard: CostGuard,
  ) {}

  /**
   * Composed permission check: both sandbox AND budget must allow.
   * This is the composition_preserves_both theorem in TypeScript.
   */
  permits(cap: CapabilityClass): boolean {
    return this.sandbox.permits(cap) && this.costGuard.permits;
  }

  /**
   * Execute an action under the composed policy.
   * Returns a structured result indicating which check (if any) denied access.
   */
  execute(cap: CapabilityClass): ExecutionResult {
    const sandboxOk = this.sandbox.permits(cap);
    const budgetOk = this.costGuard.permits;

    if (sandboxOk && budgetOk) {
      return { kind: 'allowed', sandboxPermitted: true, budgetPermitted: true };
    }
    if (!sandboxOk && !budgetOk) {
      return { kind: 'deniedBoth', sandboxPermitted: false, budgetPermitted: false };
    }
    if (!sandboxOk) {
      return { kind: 'deniedSandbox', sandboxPermitted: false, budgetPermitted: budgetOk };
    }
    return { kind: 'deniedBudget', sandboxPermitted: true, budgetPermitted: false };
  }
}

// ── Theorem Verification ────────────────────────────────────────────────────────

/**
 * Verify sandbox_preservation: if the composed policy allows a capability,
 * then the sandbox policy must also allow it.
 *
 * Lean: theorem sandbox_preservation
 */
export function verifySandboxPreservation(
  composed: ComposedPolicy,
  cap: CapabilityClass,
): boolean {
  // composition_preserves_both ⟹ (composed.permits cap → sandbox.permits cap)
  if (composed.permits(cap)) {
    return composed.sandbox.permits(cap);
  }
  return true; // vacuously true when composed denies
}

/**
 * Verify budget_preservation: if the composed policy allows a capability,
 * then the cost guard must also permit (budget not exceeded).
 *
 * Lean: theorem budget_preservation
 */
export function verifyBudgetPreservation(
  composed: ComposedPolicy,
  _cap: CapabilityClass,
): boolean {
  if (composed.permits(_cap)) {
    return composed.costGuard.permits;
  }
  return true; // vacuously true when composed denies
}

/**
 * Verify composition_preserves_both: the composed policy permits
 * if and only if BOTH sandbox and budget permit.
 *
 * Lean: theorem composition_preserves_both
 * This is the main theorem of Paper 29.
 */
export function verifyCompositionPreservesBoth(
  sandbox: TrustSandboxPolicy,
  costGuard: CostGuard,
  cap: CapabilityClass,
): boolean {
  const composed = new ComposedPolicy(sandbox, costGuard);
  const composedResult = composed.permits(cap);
  const decomposedResult = sandbox.permits(cap) && costGuard.permits;
  return composedResult === decomposedResult;
}