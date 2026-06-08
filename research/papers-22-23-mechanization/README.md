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
lake build                       # compile MSC + HSCore libs + the gate
lake exe kernelcheck             # run the axiom-hole gate (exit 1 on sorryAx)
```

Requires `leanprover/lean4:v4.15.0` (pinned in `lean-toolchain`). The
convenience script `./check.sh` runs both steps and fails non-zero on any
build error or axiom-hole.

## Status (honest scoping, 2026-05-30)

The earlier status table claimed all four invariants "proved (0 sorry)". The
2026-05-29 deep-ratchet correctly flagged invariants #3/#4 as **conditional on
named axioms whose statements are the theorems' goals** — a documented
assumption, not a derivation. Just as important: these files had **never
kernel-compiled** (stray `-/}` doc-comment terminators, `import`-after-docstring
ordering, a missing `MSC.lean` library root, non-`Inhabited` opaque codomains, a
parameter/index mismatch in `Run`, and a literally-`False` "completeness"
theorem). All fixed; `lake build` and `lake exe kernelcheck` now pass.

| File                 | Theorems | Axioms (own)                                       | `sorry` | Status                                                                                                                   |
| -------------------- | -------- | -------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------ |
| `MSC.Basic`          | 0        | 2 (`SimState.nonempty`, `Frame.nonempty`)          | 0       | Definitions + non-emptiness witnesses for opaque types                                                                   |
| `MSC.Invariants`     | 4        | 2 (`solver_functional`, `cael_causal_well_formed`) | 0       | #1/#2 DERIVED (`rfl`); #3/#4 CONDITIONAL on the axioms                                                                   |
| `MSC.AcceptanceGate` | 12       | 0                                                  | 0       | All derivable from definitions (incl. corrected `evidence_pack_complete` + guarded `dispatch_default_tier_iff_accepted`) |
| `KernelCheck`        | —        | —                                                  | —       | `#print axioms` gate; fails on `sorryAx`                                                                                 |

**What is genuinely proved vs assumed:**

1. **Render=Solver** — DERIVED by `rfl` (`renderFrame` _is_ `deriveFrame`)
2. **Geometry hash consistency** — DERIVED by `rfl` (both hashes _are_ `geometryHash`)
3. **Determinism** — CONDITIONAL: a one-line application of the `solver_functional`
   axiom, whose statement equals the theorem goal. A _runtime obligation_, not a
   derivation from primitives (`execute` is opaque).
4. **Causal chain completeness** — CONDITIONAL: same pattern on
   `cael_causal_well_formed`. A runtime obligation (`cael` is opaque).

The `#print axioms` gate (`KernelCheck.lean`) makes axioms #3/#4 machine-visible
in the dependency sets of `MSC.determinism` / `MSC.causal_chain_complete`, and
hard-fails if any checked theorem ever depends on `sorryAx`. It does NOT
upgrade a conditional theorem to a derived one — it prevents the conditionality
from being silently lost (the renamed-`sorry` failure mode).

## Acceptance-gate theorems (from `MSC.AcceptanceGate`)

1. `acceptance_gate_deterministic` — gate is a pure function
2. `dispatch_policy_deterministic` — routing is reproducible
3. `safety_critical_never_accepted` — safety-critical traits always rejected
4. `safety_critical_always_tier3` — safety-critical always routed to CPU
5. `acceptance_monotone_in_threshold` — raising α never rejects more
6. `rejection_monotone_in_threshold` — lowering α never accepts more
7. `dispatch_tier3_iff_rejected` — Tier 3 routing iff gate rejects
8. `dispatch_default_tier_iff_accepted` — accepted non-safety-critical results use warm tier (guarded by `tc ≠ SafetyCritical`)
9. `evidence_pack_complete` — every contract equals its five-field reconstruction (all fields present)
10. `acceptance_implies_within_threshold` — accepted means dev ≤ α
11. `rejection_implies_exceeds_threshold` — rejected means dev > α
12. `accepted_deviation_characterization` — accepted set = [0, α]

## Axiom budget

Two **runtime-obligation** axioms (both surfaced in Paper 4's `Axioms` section)
— these ARE invariants #3/#4, so the corresponding theorems are conditional on
them, not derivations:

- `solver_functional` — runtime must use deterministic floating-point
- `cael_causal_well_formed` — runtime must verify cause pointers before emission

Two **modeling** axioms (non-emptiness witnesses for the opaque abstract types,
required because `opaque` terms into `SimState`/`Frame` need an inhabitant):

- `SimState.nonempty` — the abstract state type is inhabited
- `Frame.nonempty` — the abstract frame type is inhabited

Plus Lean's standard `propext` / `Classical.choice` used by `simp` and the
`Classical.inhabited_of_nonempty` bridge. The full per-theorem axiom set is
printed (and gated against `sorryAx`) by `lake exe kernelcheck`. The
acceptance-gate theorems add **zero** runtime-obligation axioms.

## Paper 22 context

Paper 22 (Mechanized SimulationContract, target CAV/FM) requires:

- Lean encoding of the simulation runtime model
- ≥3 invariant proofs with no `sorry`
- Formal statements linked to named runtime obligations

Status against the gate: **2 of 4 invariants DERIVED** (`rfl`), **2 of 4
CONDITIONAL** on explicitly-named runtime-obligation axioms, **0 `sorry`**, all
kernel-checked by `lake exe kernelcheck`. Honestly scoped: the conditional
invariants are obligations the production engine must discharge, not theorems
proved from primitives. The 12 acceptance-gate theorems are fully derived.

## Paper 23 context

Paper 23 (Formal Semantics, target POPL/TyDe) will extend `MSC.Basic` with:

- Type system for `.holo` trait contracts
- Operational semantics for trait dispatch
- Soundness of the trait inference algorithm

The acceptance-gate framework in `MSC.AcceptanceGate` provides the policy
layer that Paper 23's type system will justify.
