# Three-Surface Semantic Closure

> **Status:** executable product tracer and fail-closed gate shipped 2026-07-23.
> This document describes demonstrated coverage, not a claim that every
> HoloScript construct is implemented on every target.

HoloScript has one language identity with three source surfaces:

| Surface | Primary responsibility | Demonstrated execution lane |
| --- | --- | --- |
| `.holo` | Whole-system composition, world state, events, effects, and orchestration | Composition behavior lowers through `UaalBehaviorCompiler` to the cognitive VM; spatial content retains its separate HOLO/render lane |
| `.hsplus` | TypeScript-like typed semantic programming: modules, reusable behavior, traits, reactive state, effects, pipelines, interfaces, applications, devices, and agents | The current tracer demonstrates one agent-brain vertical: its canonical typed AST projects into the edge runtime with deterministic cognition, reflection, and frame enforcement |
| `.hs` | Deterministic typed policy and systems logic | The Rust/WASM compiler validates function bodies and lowers a declared `i32` subset to UAAL while the same source compiles and executes natively |

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

The `.hs` path uses stable type diagnostics for return, assignment, and call
argument mismatches. UAAL lowering rejects operations whose semantics are not
preserved by the current VM ABI instead of silently widening, eagerly
evaluating, or erasing them.

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
- `.hs` dual execution covers a conservative typed subset. Unsupported
  short-circuit, width, ownership, or ABI semantics fail closed.
- General cross-target equivalence still requires broader differential tests
  and, for proof-level claims, formal semantics and machine-checked
  preservation.

The ratchet is therefore precise: a construct contributes to a portability
claim only when its receipt names the semantic stages and targets it actually
survives.
