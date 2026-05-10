import Lake
open Lake DSL

package MSC where
  -- No external Mathlib dependency — core Lean 4 only.
  -- All theorems use `rfl`, explicit axioms, and direct application.

@[default_target]
lean_lib MSC where
