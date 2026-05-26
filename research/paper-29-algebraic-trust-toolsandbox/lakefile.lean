import Lake
open Lake DSL

package ATC where
  -- Algebraic Trust + Tool-Use Sandbox (Paper 29)
  -- Composition theorem mechanization.
  -- No external Mathlib dependency — core Lean 4 only.

@[default_target]
lean_lib ATC where