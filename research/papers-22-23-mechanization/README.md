# MSC — Mechanized SimulationContract (Paper 22 / 23)

Lean 4 formalization of the HoloScript SimulationContract invariants and the
NN-primary acceptance gate.

## Structure

```
MSC/
  Basic.lean          -- Foundational definitions (SimState, execute, cael, tiers)
  Invariants.lean     -- Four SimulationContract invariants (4/4 proved)
  AcceptanceGate.lean -- Acceptance-gate theorem suite (12 theorems, 0 axioms)
```

## Build

```bash
lake build
```

Requires `leanprover/lean4:v4.15.0` (pinned in `lean-toolchain`).

## Status

| File | Theorems | Axioms | `sorry` | Notes |
|------|----------|--------|---------|-------|
| `MSC.Basic` | 0 | 0 | 0 | Definitions only |
| `MSC.Invariants` | 4 | 2 | 0 | `solver_functional`, `cael_causal_well_formed` |
| `MSC.AcceptanceGate` | 12 | 0 | 0 | All derivable from definitions |
| **Total** | **16** | **2** | **0** | Gate exceeded (target: ≥3 invariants) |

## Invariants (from `MSC.Invariants`)

1. **Render=Solver** — `renderFrame` equals `deriveFrame` (proved by `rfl`)
2. **Geometry hash consistency** — solver and renderer hashes agree (proved by `rfl`)
3. **Determinism** — `execute` is functional (proved from `solver_functional` axiom)
4. **Causal chain completeness** — every CAEL event has a traceable cause (proved from `cael_causal_well_formed` axiom)

## Acceptance-gate theorems (from `MSC.AcceptanceGate`)

1. `acceptance_gate_deterministic` — gate is a pure function
2. `dispatch_policy_deterministic` — routing is reproducible
3. `safety_critical_never_accepted` — safety-critical traits always rejected
4. `safety_critical_always_tier3` — safety-critical always routed to CPU
5. `acceptance_monotone_in_threshold` — raising α never rejects more
6. `rejection_monotone_in_threshold` — lowering α never accepts more
7. `dispatch_tier3_iff_rejected` — Tier 3 routing iff gate rejects
8. `dispatch_default_tier_iff_accepted` — accepted results use warm tier
9. `evidence_pack_complete` — contract contains all required fields
10. `acceptance_implies_within_threshold` — accepted means dev ≤ α
11. `rejection_implies_exceeds_threshold` — rejected means dev > α
12. `accepted_deviation_characterization` — accepted set = [0, α]

## Axiom budget

Two named axioms (both surfaced in Paper 4's `Axioms` section):

- `solver_functional` — runtime must use deterministic floating-point
- `cael_causal_well_formed` — runtime must verify cause pointers before emission

Both constrain opaque infrastructure; the abstract model cannot witness them
internally. The acceptance-gate theorems add **zero** axioms.

## Paper 22 context

Paper 22 (Mechanized SimulationContract, target CAV/FM) requires:
- Lean encoding of the simulation runtime model
- ≥3 invariant proofs with no `sorry`
- Formal statements linked to named runtime obligations

This project exceeds the gate: 16 theorems, 2 documented axioms, 0 `sorry`.

## Paper 23 context

Paper 23 (Formal Semantics, target POPL/TyDe) will extend `MSC.Basic` with:
- Type system for `.holo` trait contracts
- Operational semantics for trait dispatch
- Soundness of the trait inference algorithm

The acceptance-gate framework in `MSC.AcceptanceGate` provides the policy
layer that Paper 23's type system will justify.
