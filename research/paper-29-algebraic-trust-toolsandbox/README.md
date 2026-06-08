# ATC — Algebraic Trust Composition (Paper 29)

Lean 4 formalization of the **sandbox⊗cost composition theorem** for Paper 29
(Algebraic Trust + Tool-Use Sandbox).

## Composition Theorem

> When a sandbox policy and a cost guard are composed via ⊗, both invariants
> (sandbox restriction and budget bounding) are preserved.

Formally: for a composed policy `cp = sandbox ⊗ costGuard` and any capability `cap`:

1. **Sandbox preservation**: `sandbox.permits(cap) = false → cp.permits(cap) = false`
2. **Budget preservation**: `costGuard.permits = false → cp.permits(cap) = false`
3. **Composed = conjunction**: `cp.permits(cap) = sandbox.permits(cap) && costGuard.permits`

This is a **safety intersection**: the composed system is at least as restrictive
as either component alone.

## Structure

```
ATC/
  Basic.lean            -- Foundational definitions (SandboxPolicy, CostGuard, ComposedPolicy, MergeStrategy)
  CompositionLaw.lean   -- Composition theorem + supporting lemmas (23 proved, 3 axioms, 0 sorry)
```

## Build

```bash
cd research/paper-29-algebraic-trust-toolsandbox
lake build
```

Requires `leanprover/lean4:v4.15.0` (pinned in `lean-toolchain`).

## Status

| File                 | Theorems | Axioms | `sorry` | Notes                                                          |
| -------------------- | -------- | ------ | ------- | -------------------------------------------------------------- |
| `ATC.Basic`          | 0        | 0      | 0       | Definitions only                                               |
| `ATC.CompositionLaw` | 23       | 3      | 0       | Composition theorem proved                                     |
| **Total**            | **23**   | **3**  | **0**   | Gate exceeded (target: sandbox⊗cost theorem proved at 0 sorry) |

## Key Theorems (from `ATC.CompositionLaw`)

### Core composition theorem

- `composition_preserves_both` — THE theorem: ⊗ preserves both sandbox and budget invariants

### Sandbox preservation (weakening never opens)

- `sandbox_preservation` — denied capabilities stay denied under composition
- `sandbox_preservation_contrapositive` — if composed allows, sandbox allows
- `sandbox_preservation_for_all_cost_gards` — quantified over all cost guards

### Budget preservation (composition never exceeds budget)

- `budget_preservation` — over-budget stays over-budget under composition
- `budget_preservation_contrapositive` — if composed allows, budget allows
- `budget_preservation_for_all_sandbox_policies` — quantified over all sandbox policies

### Algebraic laws

- `sandbox_identity_left/right` — sandboxAll is the identity
- `cost_identity_permits`, `cost_identity_composition` — costUnlimited is the identity
- `sandbox_annihilator_left/right` — sandboxNone denies everything
- `cost_annihilator_permits`, `cost_annihilator` — costZero denies everything
- `sandbox_composition_commutative` — sandbox intersection is commutative
- `cost_composition_commutative` — budget conjunction is commutative

### Execution classification

- `execute_preserves_sandbox` — sandbox denials classified in execution result
- `execute_preserves_budget` — budget denials classified in execution result
- `allowed_implies_both_permitted` — allowed iff both sandbox and budget pass

### Semiring strategy laws (W.GOLD.189 Layer 1)

- `semiring_merge_commutative` — ⊕ commutative for all 5 strategies (axiom)
- `semiring_merge_associative` — ⊕ associative for all 5 strategies (axiom)
- `composition_distributes_over_merge` — ⊗ distributes over ⊕ (axiom)
- `min_plus_commutative/associative` — concrete proofs for min-plus
- `max_plus_commutative/associative` — concrete proofs for max-plus
- `authority_weighted_commutative/associative` — concrete proofs for authority-weighted

## Axiom Budget

Three named axioms (all externally validated):

- `semiring_merge_commutative` — Paper 3 Theorem 1 (10000/10000 pairs, comm `66d58b58`)
- `semiring_merge_associative` — Paper 3 Theorem 2 (10000/10000 pairs)
- `composition_distributes_over_merge` — Paper 3 Theorem 3 (10000/100000 pairs)

All three correspond to properties that hold for all five W.GOLD.189 strategies
but are proved externally in Paper 3 and validated empirically. Stating them as
axioms follows the same pattern as Paper 22's `solver_functional` and
`cael_causal_well_formed` — they surface properties the abstract model cannot
internally witness but which are validated in the production runtime.

Additionally, three concrete strategy-specific proofs (min-plus, max-plus,
authority-weighted) validate the commutativity and associativity axioms for
the strategies that have closed-form Lean proofs.

## Model Mapping to Production Code

| Abstract model           | Production code                  | File                                             |
| ------------------------ | -------------------------------- | ------------------------------------------------ |
| `SandboxPolicy.permits`  | `SandboxPolicy.allows(cap)`      | `mcp-server/src/security/sandbox-policy.ts`      |
| `CostGuard.permits`      | `CostGuard.isOverBudget()`       | `holoscript-agent/src/cost-guard.ts`             |
| `ComposedPolicy.permits` | `allows(cap) && !isOverBudget()` | MCP server compose check                         |
| `MergeStrategy`          | `strategyToSemiring()`           | `core/src/compiler/traits/Semiring.ts`           |
| `mergeAdd`               | `ProvenanceSemiring.merge()`     | `core/src/compiler/traits/ProvenanceSemiring.ts` |
| `CAELEvent`              | CAEL pipeline                    | `engine/src/simulation/`                         |
| `ExecutionResult`        | MCP tool execution result        | `mcp-server/src/security/fork-sandbox-gate.ts`   |

## Paper Cross-References (gate requires ≥3 main-program papers)

1. **Paper 3** (CRDT, ECOOP): Five provenance-semiring strategies, commutativity
   and associativity proofs (Theorems 1-3), empirical validation (10000 pairs).
   W.GOLD.189 Layer 1.
2. **Paper 4** (Sandbox): Sandbox policy, capability restriction, strict-error
   strategy. The `SandboxPolicy` in this mechanization maps directly to
   Paper 4's `SandboxPolicy` interface. W.GOLD.189 Layer 1.
3. **Paper 8** (Unified Transform): Min-plus cost-minimal composition. The
   composition-distributes-over-merge axiom connects to Paper 8's
   cost-minimal transform path. W.GOLD.189 Layer 1.
4. **Paper 25** (Multi-Brain): x402 cost-guard budget bounding across fleet.
   The `CostGuard` in this mechanization maps to Paper 25's budget model.
5. **Capstone/SESL**: CAEL hash chain (Layer 2) + simulation-contract oracle
   (Layer 3) complete the tri-layer stack. W.GOLD.189 Layers 2+3.

## Relationship to Paper 22 (MSC)

This mechanization follows the same pattern as Paper 22's `MSC` project:

| Paper 22 (MSC)                    | Paper 29 (ATC)                       |
| --------------------------------- | ------------------------------------ |
| `SimState` (opaque)               | `CostGuard` (structure with Option)  |
| `execute` (opaque relation)       | `execute` (defined function)         |
| `solver_functional` (axiom)       | `semiring_merge_commutative` (axiom) |
| `cael_causal_well_formed` (axiom) | `semiring_merge_associative` (axiom) |
| 4 invariants                      | 23 theorems + 3 axioms               |
| 0 sorry                           | 0 sorry                              |
| `lake build` green                | `lake build` green                   |

The key difference: Paper 22 models an opaque runtime (`execute`, `cael` are
axiomatized), while Paper 29 models a defined composition operator (`⊗`) with
theorems derivable from the definitions. The axioms in Paper 29 are about the
_semiring merge strategies_ (externally validated), not about opaque runtime
components.
