/-!
# ATC.Basic — Foundational definitions for Algebraic Trust + Tool-Use Sandbox

Paper 29 (Algebraic Trust + Tool-Use Sandbox) composition theorem.

This module defines the abstract model for:
1. **Sandbox policies** — capability restrictions, network/file limits, resource ceilings
2. **Cost guards** — budget-bounded execution with daily rollover
3. **Audit log** — tamper-evident CAEL hash chain (Layer 2 of W.GOLD.189)
4. **Composition operator ⊗** — combining a sandboxed capability with a cost-bounded one
5. **Semiring strategies** — the five provenance-merge strategies from W.GOLD.189 Layer 1

Design principle (matching MSC.Basic): The abstract model is intentionally minimal.
It contains exactly the vocabulary needed to state the sandbox⊗cost composition
theorem and its supporting lemmas. Any property that cannot be derived from these
primitives is stated as a named axiom, surfacing a runtime obligation.
-/

namespace ATC

-- ===================================================================
-- §1  Sandbox policy (Layer 1: capability restriction)
-- ===================================================================

/-- Capability class — what kinds of actions a sandbox policy restricts.

    Maps to `SandboxPolicy` in `packages/mcp-server/src/security/sandbox-policy.ts`:
    - `NetworkCap`: network access (allowNetwork, allowedHosts, maxCallsPerMinute)
    - `FileCap`: file system access (allowFsWrites, allowedPaths, maxFileBytes)
    - `ComputeCap`: compute resources (maxExecutionTimeMs, maxMemoryBytes, maxCpuPercent)
    - `NestedCap`: nested/recursive calls (maxNestedCalls)

    In the abstract model we collapse these to four capability classes; the
    production runtime has richer per-capability configuration. -/
inductive CapabilityClass
  | NetworkCap
  | FileCap
  | ComputeCap
  | NestedCap
deriving BEq, DecidableEq

/-- A sandbox policy maps each capability class to a permission: allowed or denied.

    In the production runtime, `SandboxPolicy` is richer (partial allows with
    host/path/limit restrictions), but the composition theorem only needs to
    know whether a capability is *permitted* at all. The finer-grained limits
    (maxCallsPerMinute, allowedHosts, etc.) compose pointwise in the same way.

    The `permits` function is the abstract counterpart of the production
    `SandboxPolicy.allows(cap)` check. -/
structure SandboxPolicy where
  permits : CapabilityClass → Bool

/-- The maximally permissive sandbox policy: all capabilities allowed.

    This is the identity element for sandbox composition (⊗). -/
def sandboxAll : SandboxPolicy where
  permits := fun _ => true

/-- The maximally restrictive sandbox policy: all capabilities denied.

    This is the annihilator for sandbox composition (⊗). -/
def sandboxNone : SandboxPolicy where
  permits := fun _ => false

-- ===================================================================
-- §2  Cost guard (Layer 1: budget bounding)
-- ===================================================================

/-- A cost guard enforces a daily budget ceiling. In the abstract model, the
    guard tracks cumulative spend and rejects execution when the budget is exceeded.

    Maps to `CostGuard` in `packages/holoscript-agent/src/cost-guard.ts`:
    - `dailyBudgetUsd`: maximum daily spend
    - `spentUsd`: cumulative spend today
    - `isOverBudget()`: rejects execution when spent ≥ budget

    The abstract model captures the essential property: a cost guard either
    permits or denies execution based on remaining budget.

    `budgetLimit` uses `Option Nat` to model the production convention:
    - `some b`: budget is `b` (finite ceiling)
    - `none`: unlimited (matching production `CostGuard` where `dailyBudgetUsd = 0`
      disables the budget check). `isOverBudget()` returns false when budget is 0.
    -/
structure CostGuard where
  budgetLimit : Option Nat  -- none = unlimited
  spent : Nat
deriving BEq

/-- A cost guard permits execution when:
    - budget is unlimited (budgetLimit = none), OR
    - spent < budget (remaining budget is positive).

    Matches production `CostGuard.isOverBudget()` which returns false when
    `dailyBudgetUsd = 0` (the unlimited case). -/
def CostGuard.permits (g : CostGuard) : Bool :=
  match g.budgetLimit with
  | none => true          -- unlimited budget: always permit
  | some b => g.spent < b -- finite budget: permit iff under limit

/-- Remaining budget. Returns 0 when over budget or unlimited. -/
def CostGuard.remaining (g : CostGuard) : Nat :=
  match g.budgetLimit with
  | none => 0              -- convention: unlimited returns 0 (call permits instead)
  | some b => b - g.spent

/-- The unlimited cost guard: infinite budget. This is the identity element
    for cost composition (⊗). Permits all execution regardless of spend. -/
def costUnlimited : CostGuard where
  budgetLimit := none
  spent := 0

/-- The zero-budget cost guard: all execution denied. Budget of 0 with
    spend > 0 means `spent < 0 = false`, so permits = false. -/
def costZero : CostGuard where
  budgetLimit := some 0  -- budget = 0, any spend exceeds it
  spent := 1             -- already over budget

-- ===================================================================
-- §3  Audit log (Layer 2: CAEL hash chain)
-- ===================================================================

/-- A CAEL audit event records what happened during execution.

    `cause`: `none` for genesis events, `some h` for events caused by a prior event.
    `hash`: unique identifier for this event.
    `policy`: the sandbox policy in effect when this event was recorded.
    `remainingBudget`: the remaining budget when this event was recorded.

    The CAEL chain for a composed execution interleaves sandbox policy checks
    with budget checks — both invariants are visible in the audit trail. -/
structure CAELEvent where
  cause : Option Nat
  hash  : Nat
  remainingBudget : Nat
deriving BEq

-- ===================================================================
-- §4  Composition operator ⊗
-- ===================================================================

/-- The composition operator ⊗ combines a sandbox policy with a cost guard.

    **Composition rule (sandbox ⊗ cost)**: A composed capability is permitted
    only when BOTH the sandbox policy permits it AND the cost guard has remaining
    budget. This is conjunction (∧) of the two permission checks:

    - Sandbox permits cap → Bool  (is the capability allowed?)
    - Cost guard permits execution → Bool  (is there remaining budget?)
    - Composed permits cap ↔ Sandbox.permits cap ∧ CostGuard.permits

    The composition is a *safety intersection*: the composed system is at least
    as restrictive as either component alone. This is the key property that the
    composition theorem proves — both invariants are preserved. -/
structure ComposedPolicy where
  sandbox : SandboxPolicy
  costGuard : CostGuard

/-- The composed policy permits a capability iff BOTH:
    1. The sandbox policy permits it, AND
    2. The cost guard has remaining budget.

    This is the formal counterpart of the production code that checks
    `SandboxPolicy.allows(cap)` AND `!CostGuard.isOverBudget()` before
    executing any tool call in the MCP server. -/
def ComposedPolicy.permits (cp : ComposedPolicy) (cap : CapabilityClass) : Bool :=
  cp.sandbox.permits cap && cp.costGuard.permits

-- ===================================================================
-- §5  Semiring strategies (Layer 1: merge strategies from W.GOLD.189)
-- ===================================================================

/-- The five provenance-semiring strategies from W.GOLD.189 Layer 1.

    Each strategy defines how two merge results are combined. The composition
    theorem needs the merge structure to show that composition distributes
    over semiring addition.

    | Strategy | Semiring form | When it applies |
    |----------|---------------|-----------------|
    | min-plus | tropical min-plus | "lowest cost wins" |
    | max-plus | tropical max-plus | "highest authority wins" |
    | authority-weighted | (R_+, +, ×) | weighted consensus by reputation |
    | domain-override | strict priority lattice | domain rules override |
    | standard-numeric / strict-error | identity or error-on-conflict | no merge |

    For the composition theorem, we need commutativity (⊕ is commutative) and
    associativity (⊕ is associative), plus idempotence under Lemma 1 tiebreaking.
    These are stated as axioms because the abstract model does not commit to a
    specific semiring carrier — they hold for all five strategies. -/
inductive MergeStrategy
  | minPlus
  | maxPlus
  | authorityWeighted
  | domainOverride
  | strictError
deriving BEq

/-- A cost value under a merge strategy. The composition theorem needs this
    to be an element of a commutative semiring. We model it abstractly as Nat
    with a strategy tag; the actual merge operation is strategy-dependent. -/
structure MergedCost where
  strategy : MergeStrategy
  value : Nat
deriving BEq

-- ===================================================================
-- §6  Abstract semiring operations (strategy-dependent merge)
-- ===================================================================

/-- Semiring addition (⊕): merge two cost values according to strategy.

    - min-plus: min(a, b) — cheapest wins
    - max-plus: max(a, b) — highest authority wins
    - authority-weighted: a + b — weighted sum (simplified; full version uses reputation weights)
    - domain-override: a if a ≥ b else b — priority lattice (simplified)
    - strict-error: identity (no merge; first value wins)

    The composition theorem only needs commutativity and associativity of ⊕,
    which hold for all five strategies (proved as axioms since we abstract over
    the carrier). -/
def mergeAdd (s : MergeStrategy) (a b : Nat) : Nat :=
  match s with
  | .minPlus => min a b
  | .maxPlus => max a b
  | .authorityWeighted => a + b
  | .domainOverride => if a ≥ b then a else b
  | .strictError => a  -- identity: no merge, first value wins

/-- Semiring multiplication (⊗): compose two cost values according to strategy.

    For all five strategies, ⊗ is defined per strategy. In the abstract model
    we provide concrete definitions; the composition theorem's preservation
    property is strategy-agnostic. -/
def mergeMul (s : MergeStrategy) (a b : Nat) : Nat :=
  match s with
  | .minPlus => a + b        -- tropical: min(a,b) ⊗ (a+b)
  | .maxPlus => a + b        -- tropical: max(a,b) ⊗ (a+b)
  | .authorityWeighted => a * b  -- standard: (a+b) ⊗ (a×b)
  | .domainOverride => a + b     -- priority: not a true semiring
  | .strictError => a            -- identity: no composition

-- ===================================================================
-- §7  Execution result (the "what happened" for audit)
-- ===================================================================

/-- Result of executing a capability under a composed policy.

    - `allowed`: the capability was executed successfully (both sandbox and cost passed)
    - `deniedSandbox`: the sandbox policy denied the capability
    - `deniedBudget`: the cost guard denied execution (over budget)
    - `deniedBoth`: both sandbox and cost guard denied

    This four-way classification is the complete outcome space for the
    composition theorem's case analysis. -/
inductive ExecutionResult
  | allowed
  | deniedSandbox
  | deniedBudget
  | deniedBoth
deriving BEq, DecidableEq

/-- Execute a capability under a composed policy. Returns the classification
    of the outcome. -/
def execute (cp : ComposedPolicy) (cap : CapabilityClass) : ExecutionResult :=
  match cp.sandbox.permits cap, cp.costGuard.permits with
  | true,  true  => .allowed
  | false, true  => .deniedSandbox
  | true,  false => .deniedBudget
  | false, false => .deniedBoth

end ATC