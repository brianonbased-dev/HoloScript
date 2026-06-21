import Lean
import TropicalBridge

/-!
# KernelCheck -- axiom-hole gate for Paper 2

Runs Lean's axiom collector over the load-bearing Paper 2 bridge theorems and
fails if any theorem depends on `sorryAx`.
-/

open Lean

def checkedTheorems : List Name :=
  [ ``TropicalBridge.relu_is_max_plus_semiring,
    ``TropicalBridge.relu_eq_self,
    ``TropicalBridge.lif_steady_rate_is_tropical_relu,
    ``TropicalBridge.lif_steady_rate_is_max_plus,
    ``TropicalBridge.empirical_rate_under_approximates,
    ``TropicalBridge.empirical_rate_exact_when_window_large,
    ``TropicalBridge.finite_window_rate_converges,
    ``TropicalBridge.rate_error_zero_when_window_large,
    ``TropicalBridge.snn_relu_bridge ]

def axiomsOf (env : Environment) (n : Name) : Array Name :=
  let (_, s) := ((CollectAxioms.collect n).run env).run {}
  s.axioms

def forbiddenAxioms : List Name := [``sorryAx]

def main : IO UInt32 := do
  initSearchPath (<- findSysroot)
  let env <- importModules #[{ module := `TropicalBridge }] {}
              (trustLevel := 1024)
  let mut hadForbidden := false
  let mut missing := false
  IO.println "=== Paper 2 SNN/ReLU bridge axiom-hole gate ==="
  for thm in checkedTheorems do
    match env.find? thm with
    | none =>
      IO.eprintln s!"MISSING declaration: {thm}"
      missing := true
    | some _ =>
      let ax := axiomsOf env thm
      let axStr := if ax.isEmpty then "(none)"
                   else String.intercalate ", " (ax.toList.map (·.toString))
      IO.println s!"  {thm}\n    axioms: {axStr}"
      for bad in forbiddenAxioms do
        if ax.contains bad then
          IO.eprintln s!"  FORBIDDEN AXIOM {bad} in {thm}"
          hadForbidden := true
  if missing then
    IO.eprintln "FAIL: one or more checked theorems are missing."
    return 1
  if hadForbidden then
    IO.eprintln "FAIL: sorryAx / forbidden axiom present."
    return 1
  IO.println "PASS: no sorryAx in any checked theorem."
  return 0
