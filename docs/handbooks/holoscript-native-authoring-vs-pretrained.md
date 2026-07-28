# HoloScript-Native Authoring vs Pretrained Reflexes

> For every agent family (Claude, Codex, Grok, Gemini, Copilot). LLMs are pretrained on
> mainstream TypeScript / Python / React / Java idioms. HoloScript is a different paradigm,
> so the pretrained reflex produces code that _compiles and passes a generic lint_ but is
> **structurally wrong here** — invisible to the compiler, unverifiable by the provenance
> layer, or uncompilable to non-TS targets. This handbook names those divergences with
> `file:line` evidence so greenfield code is authored native from the first keystroke.
>
> Method: 7 subagents read the real codebase + an adversarial critic that dropped generic
> good-practice and duplicate findings. Only HoloScript-SPECIFIC divergences survive here —
> i.e. ones a competent engineer would get _wrong_ by following pretrained instinct.
>
> The mechanical conventions (no-`any`, `.tsx` extension, hand-crafted `dist/index.d.ts`,
> `CompilerBase`+RBAC, StdlibPolicy, `git add -A` ban) are already in [`AGENTS.md`](../../AGENTS.md)
> and CLAUDE.md — this file covers the **paradigm-level authoring shape those docs don't**.

## The two principles everything below is an instance of

**1. Author behavior as DATA a tool consumes — not as imperative control flow.**
The pretrained reflex is to _write the behavior_. The native way is to _declare the behavior
as a structure_ the compiler/runtime/router reads. A trait is a handler-object, not a class
with methods; cross-trait comms is an emitted event, not a method call; a state machine is a
transition-graph, not `if/else`; an agent's task routing is `capability_tags` data, not a
`switch`; a compile target is an AST-in + registration-entries, not a standalone transpiler;
a render surface is `.holo` IR, not hand-written JSX.

**2. Correctness is structural, enforced by a gate — not asserted by intent.**
`verified` is _derived_, never declared. A fake-proof clause **throws** at construction. A
hand-written `.tsx` trips `SURFACE-GREW` and blocks the commit. A new compile target with no
sovereign classification **fails the build** via `_AssertNever`. An agent with empty
`capability_tags` silently claims **zero** tasks forever. Code written the pretrained way
typically "works" in the TS build and then fails one of these structural gates — often
silently.

## Quick reference

| Surface                     | Pretrained reflex                                      | Native way                                                                                                                                                                                                                                                                                    | What catches it                                                                                                                                            |
| --------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Trait (TS)**              | class with fields + `.on()` API, exported as the trait | plain `TraitHandler` object literal; class is hidden impl; per-node state on `node.__<name>State`                                                                                                                                                                                             | lifecycle dispatch never fires; shared-state ECS bug across nodes                                                                                          |
| **Trait comms**             | import & call another trait's method                   | `context.emit(event, payload)` onto the bus                                                                                                                                                                                                                                                   | direct calls break non-TS compile targets + bypass CAEL provenance                                                                                         |
| **Trait lifecycle**         | `if/else` phase logic in `@on_update`                  | `@state_machine { states: {…} }` decorator                                                                                                                                                                                                                                                    | compiler can't extract transition graph → uncompilable to Babylon/Unity/Colyseus                                                                           |
| **Higher-level trait**      | stateful class with `compute()` methods                | pure-function object `generate(ctx)→slice`, composed by min/max (tropical)                                                                                                                                                                                                                    | stateful accumulation breaks the bounding-box integrity math                                                                                               |
| **Render surface**          | hand-write `Foo.tsx` (JSX/`useState`/`fetch`)          | author `.holo`: `state{}` + `@panel`/`@fetch`/`@theme`/`@slot`; `.tsx` is `@generated`                                                                                                                                                                                                        | `check-render-surface-native.mjs` → `SURFACE-GREW` exit 1, commit blocked                                                                                  |
| **Format choice**           | treat `.hs`/`.hsplus`/`.holo` as aliases               | strict capability envelope per format (F.120)                                                                                                                                                                                                                                                 | wrong-format blocks rejected by the parser that owns it                                                                                                    |
| **`.hs`/`.hsplus` grammar** | add a keyword in the TS parser                         | check the per-surface router (`docs/spec/holoscript-grammar-ssot.md`), then edit the parser that owns the surface — `.hs` + the growing `.hsplus` `@trait` subset live in the **Rust+WASM** authority (`compiler-wasm/` + rebuild); full `.hsplus` still parses via TS `HoloScriptPlusParser` | editing a parser that doesn't own the surface silently no-ops; the WASM authority is the growing trust boundary (language-architecture.md §5, directional) |
| **Agent brain prompt**      | system prompt as a string in the runner                | the free-text **preamble** IS the prompt; structured blocks never reach the LLM                                                                                                                                                                                                               | prompt inside a block → model gets no instructions                                                                                                         |
| **Agent task routing**      | `if (task.title.includes…)` in runner                  | `identity.capability_tags` data, scored by set-intersection                                                                                                                                                                                                                                   | empty tags → silent permanent idle, no error                                                                                                               |
| **Agent cognition**         | inline `recall→plan→exec` in runner TS                 | ordered `behavior on_task { recall; rag_query; llm_call; reflect }` verbs as data                                                                                                                                                                                                             | inlining loses per-verb trait backing + reorderability                                                                                                     |
| **Compile target**          | standalone `compileToFoo(src)` that parses             | `CompilerBase` subclass; receives parsed AST; **3 registrations**                                                                                                                                                                                                                             | `_AssertNever` build fail; invisible to `list_export_targets`                                                                                              |
| **Computation result**      | `return result`                                        | `return { result, traceJSONL, verifyUrl }` — receipt is inseparable                                                                                                                                                                                                                           | no receipt → cannot be labeled `proven` (F.123); nothing for `verify_cael_trace`                                                                           |
| **Validation**              | validate during compute / try-catch→null               | validation **IS** the contract constructor, before any step                                                                                                                                                                                                                                   | bad-mesh run indistinguishable from clean in the receipt                                                                                                   |
| **Audit/proof**             | hash each entry once; trust the evaluator              | hash-**chain** (`prevHash`); `guardClauseFalsifiability` **throws** on fake proof                                                                                                                                                                                                             | per-entry hash lets an adversary swap entry N; `=>true` clause refused                                                                                     |
| **Shared world state**      | plain fields + last-write-wins / dirty flag            | Loro CRDT; `LoroMap` (LWW) vs `LoroCounter` (commutative deltas) per field                                                                                                                                                                                                                    | LWW silently loses concurrent rotations                                                                                                                    |
| **Missing capability**      | author a new trait/class                               | `/stub-audit` first — wire the name-correct empty-body stub                                                                                                                                                                                                                                   | duplicate trait leaves the original advertised-but-dead                                                                                                    |

## Detail by surface

### Traits

A trait's public seam is a **plain `TraitHandler<TConfig>` object literal** (`onAttach`/`onUpdate`/
`onEvent`/`onDetach` receiving `(node, config, context, delta)`), not the internal class.
`RigidbodyTrait` the class is implementation; `rigidbodyHandler` the object is the export
(`packages/core/src/traits/RigidbodyTrait.ts:683-717`, `TraitTypes.ts:16-25`). Per-instance
state lives on `node.__<name>State`, created in `onAttach`, deleted in `onDetach`
(`TransformTrait.ts:190-203`) — **never** as class fields or module-level vars, or every node
sharing the handler shares state. Traits never touch each other directly: `GrabbableTrait`
emits `'physics_grab'` (`GrabbableTrait.ts:93`), it never holds a `RigidbodyTrait`. Multi-phase
behavior is the `@state_machine` decorator with first-class `states`/guards/transitions
(`examples/traits/physics-object-lifecycle.hsplus:250-383`); `@on_update` is for per-frame
telemetry only. Higher-level traits (Pillar/SemanticCollaboration) are pure functions
`generate(context)→slice` composed by min/max bounding boxes (`pillar/ParallelPillar.ts:182-201`),
not class hierarchies.

### Render surfaces

Every perceivable surface is a `.holo` composition; the `.tsx` carries
`// @generated by HoloScript <Compiler> — DO NOT EDIT` and is never hand-edited. State is a
`state StateName {}` block; reactivity is `bind: StateName.field` in `behavior { on "…" {} }`;
data-fetching is `@fetch(endpoint:…)`; a hand-component escape hatch is `@slot(component:…)` —
all extracted by `Native2DCompiler`/`FlatSemanticCompiler` into the generated hooks
(`Native2DCompiler.ts:82-197`, `examples/v6/admin-analytics.holo`). The header is a
machine-checked token, not a doc comment: `scripts/holo-ci/check-render-surface-native.mjs`
scans the first 6 lines and any non-allowlisted, non-generated `.tsx` under the render roots
is `SURFACE-GREW` → exit 1, in **both** pre-commit and full HoloCI.

### The three formats + the parser router (F.120)

`.hs` = flat data, no `state`/`template`/`system`. `.hsplus` = adds `state`/`template`/`action`/
`behavior`/traits. `.holo` = adds `metadata`/`system`/`environment`/`platforms:`. These are
capability envelopes, not aliases. Parser authority is routed **per surface** by
`docs/spec/holoscript-grammar-ssot.md` (corrected 2026-07-17 per `language-architecture.md` §5):
the **Rust+WASM authority** (`packages/compiler-wasm/src/` — `token.rs` keyword table,
`parser.rs` grammar, `ast.rs` nodes; rebuild `pkg-node/`) owns `.hs` **and a growing `.hsplus`
`@trait` subset** — its coverage grows toward the whole surface and must never regress; `.holo`
and full `.hsplus` are still parsed by the TS parsers (`HoloCompositionParser` /
`HoloScriptPlusParser`) as strangled predecessors. Adding a keyword to a surface the WASM
authority owns by editing the TS parser **silently no-ops** — check the router first, then edit
the parser that owns the surface (`compiler-wasm/src/parser.rs:1-13` enumerates its scope).

### Agent brains

The **free-text preamble** (everything before the first `#version`/`identity{`/block keyword) IS
the LLM system prompt — `brain.ts:extractSystemPromptPreamble` sends only that slice; the
structured blocks are parsed for routing/config and **never reach the model**. A prompt placed
inside `directives{}` reaches nothing. Task routing is `identity.capability_tags` scored by
set-intersection (`holomesh-client.ts:273-293`); **empty tags = silent permanent idle**, no
error. Cognition is an **ordered** `behavior on_task { recall; rag_query; llm_call; reflect }`
sequence parsed as `OnTaskAction[]` data and dispatched by authored position
(`brain.ts:extractOnTaskActions`, `cognitive-verbs.ts:augmentWithOnTaskCognition`); each verb has
a distinct trait backing. `reflect` is special — a **post-artifact** self-eval gate (after the
artifact-grounding gate), not a pre-call plan; `escalate_on_fail:true` returns
`reflect-escalate` instead of marking done.

### Compile targets

Not a standalone function. A `CompilerBase` subclass that receives a **parsed `HoloComposition`
AST** (parsing happens upstream in `compiler-tools.ts`), threads `agentToken` for RBAC, and
**three registrations**: (1) the target literal in the `ExportTarget` union (`CircuitBreaker.ts`);
(2) a `DialectDescriptor` in `registerBuiltinDialects.ts`; (3) classification in exactly one of
`SOVEREIGN_TARGETS`/`BRIDGE_TARGETS`/`NATIVE_COMPILE_MODES` (`sovereign-targets.ts`) — the
`_AssertNever` gate **fails `pnpm build`** if (3) is omitted (D.006). The MCP tool case is then a
one-liner `handleCompileToTarget({…args, target:'X'})` with zero per-target logic; transport is
dual (REST `/api/compile` + JSON-RPC `/mcp`, client auto-fallback). Domain vocab stays in
`DomainBlockCompilerMixin`/plugins, never inlined in the compiler.

### Provenance / contract-first (the deepest divergence)

A computation is obligated to emit a tamper-evident, re-runnable receipt _as part of its return
value_. `solve_*` returns `{ result, traceJSONL, caelTraceId, verifyUrl }` — number and receipt
are one value (`simulation-tools.ts:697-765`). **Validation IS construction**: the
`ContractedSimulation` constructor hashes geometry, validates units, checks Jacobian sign,
evaluates precondition clauses, and throws on error-severity violations _before the solver runs_
(`SimulationContract.ts:1996-2143`). `guardClauseFalsifiability()` inspects an evaluator's source
and **throws** on `=>true`/`=>false` (`/trivially constant/`) or any clause that reads no
simulation state (`/reads nothing from ClauseContext/`) — fake proof is refused at construction,
verified against `SimulationContract.test.ts:1742-1784`. Audit is a hash-**chain**: each CAEL entry's hash
covers the prior entry's `prevHash` in canonical form (`CAELRecorder.ts:166-188`); per-entry
hashing lets an adversary swap entry N undetected. `SimulationProvenance.verified` is **derived**
(false on any error-severity violation), never set by hand — this is what makes the `proven`
label (F.123) structurally unforgeable. The same layered-hash-chain pattern is in the agent
runtime (`cael-builder.ts`) and Brittney chat (`studio/src/lib/brittney/cael.ts`).

### Shared world state

Concurrently-edited spatial state is a **Loro CRDT** document, not plain fields with last-write-
wins. The authoring decision is per-field container choice: position/scale/base-rotation are
`LoroMap` (LWW), but rotation **deltas** are `LoroCounter` (commutative) so concurrent rotations
from different peers merge additively instead of clobbering (`crdt-spatial/src/SpatialCRDTBridge.ts:178-204`).
Sync is `exportSnapshot()`/`importUpdate()`; unregister keeps a tombstone (CRDT semantics).

### Before authoring a new trait

Run `/stub-audit`. Many trait _names_ already exist with a correct seam but a placeholder body
(Pattern B stub: `onUpdate` under ~30 effective LOC, already referenced by compilers as if live).
The native move is to **wire+build the existing name**, not author a parallel duplicate that
leaves the original advertised-but-dead. (`NeuralAnimationTrait` was the canonical example and
has since been wire+built into a real motion-matching handler — the process working. Run
`/stub-audit` to find current instances rather than trusting a hardcoded file:line, which goes
stale.) A related failure mode is the **echo-stub** (an `onEvent` that emits a _fabricated
success_ for an unwired external backend — a lie worse than a no-op); the honest fix is
`emitUnwired(...)` (`packages/core/src/traits/unwired.ts`), which abstains with a `*:error`
instead of asserting a result it did not produce.

## What was deliberately NOT included

The critic dropped these as **generic good practice** (a pretrained engineer gets them _right_),
not HoloScript-specific: annotated `eslint-disable` for `any` + `catch(err: unknown)` (standard
strict-TS); per-language output escaping to prevent CWE-94 injection (universal codegen practice —
the only native nuance is that `escapeStringValue` is a _mandated_ `CompilerBase` method, not
optional); and the `.js`-import-extension "rule" (factually both styles are scattered through
production source — it's generic ESM/Vitest friction, not a project convention). The
`generate-types.mjs` hand-crafted-`.d.ts` point is real but already in AGENTS.md/CLAUDE.md — one
canonical statement, not four.
