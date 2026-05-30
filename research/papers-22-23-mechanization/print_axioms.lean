import MSC
import HSCore

/-!
# print_axioms -- quick `#print axioms` readout (informational)

This file just prints the axiom dependency set of the load-bearing theorems at
elaboration time, for eyeballing in an editor. It does NOT gate the build.

The real gate is `KernelCheck.lean` (`lake exe kernelcheck`), which fails
non-zero if any checked theorem depends on `sorryAx`. Prefer that in CI.
-/

-- Papers 22 -- SimulationContract invariants
#print axioms MSC.render_eq_solver
#print axioms MSC.geometry_hash_consistent
#print axioms MSC.determinism            -- conditional on solver_functional
#print axioms MSC.causal_chain_complete  -- conditional on cael_causal_well_formed

-- Paper 23 -- type soundness
#print axioms HSCore.progress_preservation
