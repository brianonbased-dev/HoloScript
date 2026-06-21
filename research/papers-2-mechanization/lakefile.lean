import Lake
open Lake DSL

package TropicalBridge where
  -- Paper 2 SNN--ReLU bridge mechanization.
  -- No external Mathlib dependency; this stays inside core Lean 4.

@[default_target]
lean_lib TropicalBridge where

@[default_target]
lean_exe kernelcheck where
  root := `KernelCheck
  supportInterpreter := true
