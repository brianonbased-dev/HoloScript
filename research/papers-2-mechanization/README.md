# Paper 2 -- SNN/ReLU Bridge Mechanization

Lean 4 formalization of the Paper 2 theorem that LIF rate coding approximates
ReLU through the max-plus semiring in the suprathreshold steady-state regime.

## Scope

The mechanization uses a discrete non-negative abstraction:

- thresholded excess current is `input - threshold` on `Nat`;
- the linearized LIF steady-state rate is `gain * excessCurrent`;
- `relu x` is `maxPlusAdd x 0`;
- the finite-window empirical rate is a monotone capped estimator that becomes
  exact once the observation window covers the steady-state rate.

This matches the paper's stated limitation that the bridge applies in the
suprathreshold steady-state regime. It does not mechanize the full real-valued
LIF differential equation or the law of large numbers.

## Files

- `TropicalBridge.lean` -- definitions and proved bridge theorem
- `KernelCheck.lean` -- axiom-hole gate over the load-bearing theorems
- `lakefile.lean` / `lean-toolchain` -- pinned Lean project
- `check.sh` -- convenience build + gate script

## Verification

```bash
lake build
lake exe kernelcheck
```

Expected result: build passes and the kernel gate reports no `sorryAx`.
