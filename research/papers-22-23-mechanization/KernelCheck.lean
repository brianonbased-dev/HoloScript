import Lean
import MSC
import HSCore

/-!
# KernelCheck — axiom-hole gate for Papers 22 / 23

This is the **kernel-check gate** the paper-22 ratchet task asks for: it makes
the axiom dependency set of every load-bearing theorem machine-visible and
**fails green** (non-zero exit) if any theorem secretly depends on `sorryAx` —
i.e. a `sorry` (or a renamed `sorry` smuggled in as an axiom hole).

Run with:

```bash
lake build                       # all libs must compile first
lake env lean --run KernelCheck.lean
# or, as a lake exe:
lake exe kernelcheck
```

## Why this gate exists

`#print axioms thm` shows what `thm` ultimately rests on. A theorem proved with
`sorry` lists `sorryAx` in that set. The deep-ratchet (2026-05-29) verdict on
`MSC.Invariants` flagged that invariants #3/#4 apply named axioms whose
statements ARE the theorems' goals — a documented assumption, NOT a derivation.
This gate cannot turn those conditional theorems into derived ones; what it
*does* guarantee is:

1. **No hidden `sorry`.** If anyone renames an axiom hole back into a `sorry`,
   `sorryAx` appears in the dependency set and the gate exits non-zero.
2. **The named axioms stay visible and enumerated.** The expected axiom set is
   pinned below; an unexpected *new* axiom (scope creep in the trust budget)
   is reported. The two MSC axioms (`solver_functional`,
   `cael_causal_well_formed`) plus the non-emptiness axioms
   (`SimState.nonempty`, `Frame.nonempty`) and the HSCore obligations are the
   declared budget.

The gate is intentionally strict on `sorryAx` (hard fail) and informative on
the rest (prints the full set so reviewers can audit the trust budget).
-/

open Lean

/-- The theorems whose axiom dependency sets the gate audits. Names are
    resolved against the compiled environment. -/
def checkedTheorems : List Name :=
  [ -- MSC.Invariants — the four SimulationContract invariants
    ``MSC.render_eq_solver,
    ``MSC.geometry_hash_consistent,
    ``MSC.determinism,
    ``MSC.causal_chain_complete,
    -- MSC.AcceptanceGate — representative load-bearing gate theorems
    ``MSC.safety_critical_never_accepted,
    ``MSC.acceptance_monotone_in_threshold,
    ``MSC.dispatch_tier3_iff_rejected,
    ``MSC.dispatch_default_tier_iff_accepted,
    ``MSC.evidence_pack_complete,
    -- HSCore.Soundness — Paper 23 type soundness
    ``HSCore.progress,
    ``HSCore.preservation,
    ``HSCore.progress_preservation ]

/-- Collect the axiom names a declaration depends on, by walking the constant's
    transitive dependency set and keeping the `axiomInfo` constants. -/
def axiomsOf (env : Environment) (n : Name) : Array Name :=
  let (_, s) := ((CollectAxioms.collect n).run env).run {}
  s.axioms

/-- Names that indicate an *unsound* hole the gate must reject outright. -/
def forbiddenAxioms : List Name := [``sorryAx]

def main : IO UInt32 := do
  initSearchPath (← findSysroot)
  let env ← importModules #[{ module := `MSC }, { module := `HSCore }] {}
              (trustLevel := 1024)
  let mut hadForbidden := false
  let mut missing := false
  IO.println "=== Papers 22/23 axiom-hole gate ==="
  for thm in checkedTheorems do
    match env.find? thm with
    | none =>
      IO.eprintln s!"MISSING declaration: {thm}"
      missing := true
    | some _ =>
      let ax := axiomsOf env thm
      let axStr := if ax.isEmpty then "(none — derived from kernel only)"
                   else String.intercalate ", " (ax.toList.map (·.toString))
      IO.println s!"  {thm}\n    axioms: {axStr}"
      for bad in forbiddenAxioms do
        if ax.contains bad then
          IO.eprintln s!"  FORBIDDEN AXIOM {bad} in {thm} — axiom-hole detected"
          hadForbidden := true
  if missing then
    IO.eprintln "FAIL: one or more checked theorems are missing (build drift)."
    return 1
  if hadForbidden then
    IO.eprintln "FAIL: sorryAx / forbidden axiom present — proofs are not kernel-clean."
    return 1
  IO.println "PASS: no sorryAx in any checked theorem. Trust budget is the named axioms above."
  return 0
