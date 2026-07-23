# Three-Surface Agent

This is the smallest checked-in product tracer that uses all three HoloScript
source surfaces as one system:

| File           | Owns                                                                  |
| -------------- | --------------------------------------------------------------------- |
| `main.holo`    | Composition state, spatial object, event entry, and observable effect |
| `agent.hsplus` | Agent identity, cognitive behavior, and frame boundary                |
| `policy.hs`    | Typed deterministic decision logic                                    |

`holoscript.project.json` declares the executable edges, and the closure runtime
executes them as one causal chain:

```text
on_start -> on_task -> decide(value) -> apply_decision
```

The source files are the product. The TypeScript and Rust code used by the gate
are parsers, compilers, runtimes, and verification infrastructure—not a second
implementation of the agent.

## Run the closure gate

From the repository root:

```bash
pnpm check:three-surface-closure
pnpm check:three-surface-closure:test
pnpm check:three-surface-closure -- --receipt .scratch/three-surface-closure.json
```

The typed `.hsplus` plan signal is carried into the `.hs` decision binding, and
the `.hs` result controls whether the `.holo` effect edge runs. A zero plan
signal or policy result leaves the composition in its initial state. The gate
fails when a binding points at a missing construct, a parser rejects one of the
sources, an admitted construct disappears from the independent 24-construct
inventory, the `.hsplus` runtime projection drifts from its typed AST, a frame
stops denying its protected domain, or native and cognitive `.hs` execution
disagree.

The mutation self-test corrupts expected state, a binding target, the admission
inventory, the policy result, and the `.hsplus` plan signal. Every mutation must
be rejected.

## Current bounded capability

- `.holo`: action calls, state assignment, event emission, and the `on_start`
  entry execute through the cognitive VM.
- `.hsplus`: an explicit `#brain` document becomes the canonical typed brain
  AST, projects into the edge runtime, executes deterministic pre-task
  cognition and post-artifact reflection, rejects opaque state actions, and
  carries an enforced frame.
- `.hs`: typed `i32` functions, comparisons, basic arithmetic, calls,
  conditionals, and bounded-by-VM `while` control flow lower to UAAL while the
  same source also compiles to a sovereign native executable.

The spatial beacon is parsed but explicitly target-inapplicable to the cognitive
VM; its five exclusions are allowlisted in the manifest rather than hidden.
Every other unsupported semantic must appear as a stable deferred or rejected
stage in the HoloMeaning receipt. Parsing alone is never accepted as execution
evidence.
