import MSC.Basic
import MSC.Invariants
import MSC.AcceptanceGate

/-!
# MSC — Mechanized SimulationContract (Paper 22)

Lean 4 formalization of the HoloScript SimulationContract invariants and the
NN-primary acceptance gate.

Modules:
- `MSC.Basic` — Foundational definitions (SimState, execute, cael, tiers)
- `MSC.Invariants` — The four SimulationContract invariants
- `MSC.AcceptanceGate` — Acceptance-gate theorem suite (12 theorems, 0 axioms)

## Trust budget (honest scoping)

Invariants #1 and #2 (`render_eq_solver`, `geometry_hash_consistent`) are
proved by `rfl` from the modeling choices in `MSC.Basic`.

Invariants #3 and #4 (`determinism`, `causal_chain_complete`) are **conditional
theorems**, not derivations: each is a one-line application of a named axiom
(`solver_functional`, `cael_causal_well_formed`) whose statement is the
theorem's goal verbatim. They formalize *runtime obligations* the production
engine must discharge — they do NOT prove those obligations from primitives,
because `execute` and `cael` are `opaque` in the abstract model. This is the
honest reading of the Paper-4 `Axioms` section, and the `#print axioms` gate in
`KernelCheck.lean` makes the dependency on those axioms machine-visible so the
distinction cannot be lost.
-/
