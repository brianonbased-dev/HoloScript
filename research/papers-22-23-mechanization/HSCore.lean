import HSCore.Basic
import HSCore.Soundness

/-!
# HSCore — Paper 23 Formal Semantics of HS Core

This library defines the abstract syntax, small-step operational semantics,
type system, and type soundness proofs for the HS core subset.

Modules:
- `HSCore.Basic` — Foundational definitions (types, expressions, values,
  small-step reduction, typing relation, axioms)
- `HSCore.Soundness` — Progress, preservation, and type soundness theorems

Status: 0 sorry, 5 named axioms (all surfacing runtime obligations):
dispatch_resolve, dispatch_resolve_total, dispatch_resolve_preserves,
trait_accepts, substitution_preserves_typing. Verified via
`#print axioms progress_preservation` (no sorryAx in the dependency set).
-/