import Lake
open Lake DSL

package MSC where
  -- No external Mathlib dependency — core Lean 4 only.
  -- All theorems use `rfl`, explicit axioms, and direct application.

@[default_target]
lean_lib MSC where

lean_lib HSCore where
  -- Paper 23 (Formal Semantics of HS Core) formalization.
  -- Small-step reduction, type system, progress, preservation, type soundness.
  -- 0 sorry, 5 named axioms (dispatch_resolve, dispatch_resolve_total,
  -- trait_accepts, dispatch_resolve_preserves, substitution_preserves_typing).
