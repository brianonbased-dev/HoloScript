# Three-Surface Semantic Closure

> **Status:** executable product tracer and fail-closed gate shipped 2026-07-23.
> This document describes demonstrated coverage, not a claim that every
> HoloScript construct is implemented on every target.

HoloScript has one language identity with three source surfaces:

| Surface   | Primary responsibility                                                                                                                                            | Demonstrated execution lane                                                                                                                                                                        |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.holo`   | Whole-system composition, world state, events, effects, and orchestration                                                                                         | Composition behavior lowers through `UaalBehaviorCompiler` to the cognitive VM; spatial content retains its separate HOLO/render lane                                                              |
| `.hsplus` | TypeScript-like typed semantic programming: modules, reusable behavior, traits, reactive state, effects, pipelines, interfaces, applications, devices, and agents | The current tracer demonstrates one agent-brain vertical: its canonical typed AST projects into the edge runtime with deterministic cognition, reflection, and frame enforcement                   |
| `.hs`     | Deterministic typed policy and systems logic                                                                                                                      | The Rust/WASM compiler validates function bodies and lowers a declared `i32`/`bool` control subset, including typed lazy `&&`/`\|\|`, to UAAL while the same source compiles and executes natively |

The surfaces are complementary capability boundaries, not "basic", "extended",
and "full" editions. A product may use one surface or bind all three.

`.hsplus` is not an agent-brain DSL. Its parser accepts TypeScript-like
expressions and code declarations alongside templates, compositions, reactive
state, state machines, reactions, pipeline stages, timelines, UI/application
nodes, service/device traits, and agent cognition. The three-surface tracer uses
a brain because that is a high-value vertical for testing cognition and
authority; it does not define the boundary of the surface. Support still varies
by construct: several code bodies remain raw source and do not yet have the
typed/lowered/executed closure demonstrated by the tracer.

## Executable reference

[`examples/three-surface-agent`](../../examples/three-surface-agent/) is the
smallest checked-in product that binds the three surfaces:

```text
.holo on_start
  -> .hsplus on_task
  -> .hs decide(plan.signal)
  -> .holo apply_decision
```

The `.hsplus` plan signal is read from the typed brain AST and bound into the
typed `.hs` policy entry. The policy result determines whether the `.holo`
effect executes. Mutation tests prove that changing the plan signal, policy
result, binding target, admitted inventory, or expected world state makes the
gate fail.

**Measured 2026-09-28: the gate script makes these links, not the language.**
The signal is the constant in the brain's `plan` block (the recall and plan
steps it runs are stubs). The gate writes it into the `.hs` source by rewriting
the integer in `return decide(N)` and recompiling, and it skips the `.holo`
effect with its own TypeScript `if` when the decision is not positive. The
project bindings are compared with three fixed triples, not interpreted.
`main.holo` has no conditional, `UaalBehaviorCompiler` does not read its
imports, and its bytecode is byte-identical with or without them: compiled on
its own, the composition always applies the decision. Of the 135 passed stage
marks, 117 are constants in the gate source; an added import from a file that
does not exist passes as lowered, executed and preserved. A correct "deny"
outcome cannot pass, because the gate requires the effect to run. This is
[G20](./spec-vs-reality-gap.md#g20--the-three-surface-closure-is-made-by-the-gate-not-the-language).

Run the strict gate from the repository root:

```bash
pnpm check:three-surface-closure
pnpm check:three-surface-closure:test
```

The full HoloCI profile runs the mutation self-test and requires complete
coverage for every applicable stage.

## Receipt contract

The HoloMeaning semantic-closure receipt uses six stages:

1. `parsed`
2. `typed`
3. `lowered`
4. `enforced`
5. `executed`
6. `target_preserved`

Each admitted construct records one of:

- `passed`
- `deferred`
- `rejected`
- `not_applicable`

`deferred` and `rejected` always fail the strict product gate. A
`not_applicable` stage is accepted only when the independent project manifest
names the exact construct, stage, and reason. Parser output and manifest
inventory are compared independently so the implementation cannot define its
own expected coverage after the fact.

`complete: true` means no admitted construct is deferred or rejected and every
inapplicable stage is explicitly allowlisted. `allStagesPassed: true` is
stricter: it also requires zero target-inapplicable stages.

The initial checked-in tracer admits 24 constructs. It has 135 passed stage
observations, zero deferred stages, zero rejected stages, and nine exact
target-inapplicable stages.

## Canonical diagnostics

Validation routes by source authority:

- `.holo` -> `HoloCompositionParser`
- `.hsplus` -> preprocessing plus `HoloScriptPlusParser`, with source locations
  remapped to the original document
- `.hs` -> the Rust/WASM parser and shared semantic body-type pass

The CLI, language server, and MCP validation handler use this router. This
prevents a file from being accepted by a convenient parser that is not
authoritative for its extension.

The `.hs` path uses stable type diagnostics for return, assignment, call
argument, and known non-boolean logical-operand mismatches. UAAL lowering
rejects many operations whose semantics are not preserved by the current VM ABI
(integer `/` and `%`, unary `-` and `!`, unproven truthiness) instead of
silently widening or eagerly evaluating them.

**Measured exception, 2026-09-28: recursion and block scope.** `compile_to_uaal`
accepts recursive `.hs` functions, but it keeps one slot per function parameter
or local (`__hs::<function>::<name>`), not one per call. A read after a
recursive call sees the callee's value, and the run still reports `HALTED`:
`fib(10)` returns `-80` on UAAL and `55` natively. An inner `let` in an `if`
block overwrites the outer binding of the same name, and a typed function with
no `return` yields `null`. These programs are outside the demonstrated subset
until [G10](./spec-vs-reality-gap.md#g10--hs-on-uaal-has-no-per-call-frames-recursion-returns-wrong-values)
closes.

### Typed lazy logic

The declared UAAL subset now preserves boolean `&&` and `||` with real
`JUMP_IF`/`JUMP` control-flow graphs. Known non-boolean operands fail semantic
checking with `HS-TYPE-LOGICAL-001`. The target proof floor admits boolean
literals, explicitly typed boolean bindings and call returns, comparisons, and
recursively proven logical expressions. An operand that remains untyped or
otherwise unproven fails lowering with `HS-UAAL-CAP-002`; it does not inherit
the cognitive VM's generic truthiness.

The end-to-end differential test places an infinite-loop function on both
right-hand branches. Native execution and UAAL execution both return `5`; the
UAAL artifact contains both right-hand `CALL` sites, while its execution log
records only the bootstrap `CALL`. This mechanically demonstrates skipped
right-hand work for that program. It is not evidence of fewer model tokens,
repair turns, runtime cost, or greater task success.

## Honesty boundary

This gate is auditable implementation evidence, not a mechanized proof of
semantic preservation.

- The reference spatial beacon is parsed but is not executed by the cognitive
  VM; its five spatial stages are explicitly target-inapplicable.
- Two `.hsplus` cognition constructs have no separate enforcement stage; those
  two exclusions are explicit.
- Two deterministic `.hs` functions have no authority-enforcement stage; those
  two exclusions are explicit.
- `.holo` action parameters currently use a versioned state-reference ABI.
  Recursive parameterized actions do not yet have independent call frames and
  are outside the demonstrated subset.
- Direct whole-document `.hsplus` lowering to UAAL remains incomplete.
- `.hs` dual execution covers a conservative typed subset. Boolean inference
  beyond the explicit UAAL proof floor, unary `!`, unsupported widths,
  ownership, and broader ABI semantics still fail closed.
- `.hs` functions on UAAL have no per-call frames. Recursion and same-name
  block bindings do not fail closed: they compile and return wrong values
  (G10 in `spec-vs-reality-gap.md`). The native backend returns the right
  values for recursion and refuses the block redeclaration.
- The cross-surface links (event, decision, effect) are performed by
  `scripts/holo-ci/check-three-surface-closure.ts`, not by `.holo` imports or
  any language construct, and most stage marks are asserted by that script
  rather than observed from a compiler (G20).
- General cross-target equivalence still requires broader differential tests
  and, for proof-level claims, formal semantics and machine-checked
  preservation.

The ratchet is therefore precise: a construct contributes to a portability
claim only when its receipt names the semantic stages and targets it actually
survives.
