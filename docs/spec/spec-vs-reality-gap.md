# uAAL/HOLO Spec ↔ Reality Gap (the language-build backlog)

> Reconciles [`uaal-language-spec.md`](./uaal-language-spec.md) against the shipped code,
> verified 2026-06-22 in the HoloScript repo. Each gap carries the F.076 four-question frame
> (falsifiable claim · real seam · failing-if-broken evidence · scope/blast) so it is a
> buildable slice, not a vibe. Ordered by leverage.

## Status legend
✅ shipped & wired · ⚠️ exists but not wired into the canonical path · ❌ absent/aspirational

## Summary table

| # | Spec claim | Reality | Status |
|---|------------|---------|--------|
| G1 | `.holo → bytecode → VM → render` | `HolobCompiler` + `holo-vm` (2,996 LOC), e2e-tested to pixels | ✅ |
| G2 | `@holoscript/uaal` cognitive VM + compiler | `packages/uaal` 1,666 LOC, alive, consumed by agent-protocol/engine/studio | ✅ (runtime) |
| G3 | `.hs/.hsplus → uAA2++ compiler → UAAL bytecode` | **slice 1 bridged**: `UaalBehaviorCompiler` lowers the behavioral subset (actions/handlers + if/else) to UAAL bytecode, e2e-tested on the real VM; loops deferred | ✅⚠️ **partial** |
| G4 | `holo compile … --target uaal` (per `agents/uaal-vm.md`) | **shipped**: `--target uaal` parses `.holo` → `UaalBehaviorCompiler` → writes `.uaal` bytecode; verified end-to-end | ✅ |
| G5 | cognitive ⇄ spatial via `SceneSnapshot` | **shipped**: `sceneSnapshot()` serializes HOLO world → perception; both real VMs proven against the shared contract (producer+act / cognitive decision); in-process adapter deferred (needs a package depping both) | ✅⚠️ **partial** |
| G6 | `.hs` imperative logic is a real compiled language | Rust/WASM grammar parses; `.hs→Kotlin` emitter now covers a substantial subset — numerics, enums, structs (+per-field type inference), strings (+`${}` interpolation), arrays→`listOf` with `List<T>` inference on returns/params/locals (G6 + G7 slice-1/slice-2/G7c/G7d shipped 2026-06-21..23); still a *declared* subset (object-literals→`mapOf` = G7e, struct list-fields = G7f queued); TS parser can't parse `.hs` logic (HSP101) | ⚠️ growing |
| G7 | native-authoring coverage is tracked + rising | **shipped**: `check:native-coverage` ratchet gate — real packages-scoped coverage **22.63%** (162 native vs 554 hand-TS), must rise/hold; replaces the unverified "1.32%" paper figure | ✅ |
| G8 | the spec is the language's source of truth | spec lived only in the Gemini knowledge silo until 2026-06-22 | ✅ (reclaimed by this dir) |
| G9 | fleet agents (Jetson/laptop/Vast) communicate as uAAL peers | mesh opcodes (`CALL_NODE`/`OP_OFFLOAD`/`OP_SYNC`) were inert; **now wired** to a `MeshTransport` (slice 1 in-process router, e2e proven); real HoloMesh adapter pending | ✅⚠️ **partial** |

---

## G3 — Wire `.hs`/`.hsplus` source into the uAAL compiler *(highest leverage)*

The cognitive language exists but is unreachable from the real front-end: `packages/uaal/compiler.ts`
tokenizes its own Intent-DSL (`INTAKE("…")`, `CYCLE("…")`, `IF…THEN…END`). The canonical
`.hs`/`.hsplus` parser output is never lowered to UAAL bytecode.

- **Falsifiable claim:** a `.hs`/`.hsplus` source file compiles, through the canonical parser,
  to a `UAALBytecode` packet that `packages/uaal` `vm.ts` executes — producing the same result
  as the equivalent hand-written Intent-DSL program.
- **Real seam:** a lowering pass `HoloComposition AST → UAALBytecode` in `packages/core/src/compiler/`
  (sibling to `HolobCompiler.ts`), exported as a registered compile target.
- **Failing-if-broken evidence:** an e2e test (mirror of `holo-vm`'s 2026-06-05 render test)
  that parses a `.hs` source, lowers it, runs it on the uaal VM, and asserts the output; fails
  if the lowering or the bridge is absent.
- **Scope/blast:** new file under `core/src/compiler/` + a test; consumes existing
  `@holoscript/uaal`. Out of scope: changing the uaal VM ISA. Regression risk: low (additive
  target; does not touch `HolobCompiler` or the `.holo` path).
- **STATUS — slice 1 SHIPPED 2026-06-22.** `core/src/compiler/UaalBehaviorCompiler.ts` +
  `core/src/__tests__/compiler/UaalBehaviorCompiler.test.ts` (6/6 pass on the real
  `@holoscript/uaal` VM; `tsc --noEmit` on core clean; **no new dependency / lockfile change** —
  local opcode constants are drift-guarded against the real ISA in the test).
  - **Premortem correction applied:** lowers only the *behavioral* subset (actions /
    eventHandlers / logic → `HoloStatement` bodies), NOT spatial nodes (that would be the
    category error the premortem flagged — spatial is `HolobCompiler → HoloVM`). The test is
    non-vacuous: distinct inputs yield distinct observable EXECUTE traces, and `JUMP_IF` is
    proven to gate execution (a false condition skips the consequent).
  - **Covered:** MethodCall, EmitStatement, Assignment, VariableDeclaration, AwaitStatement,
    ExpressionStatement, ReturnStatement, IfStatement (real `PUSH`/`JUMP_IF`/`JUMP` control
    flow with back-patched targets).
  - **Deferred (recorded as `stats.unhandled`, not faked):** For/While/ClassicFor (loop
    back-edges), Animate, OnError — slice 2; idea-seed `2026-06-22_uaal-loop-control-flow-lowering`.
  - **Remaining for G3:** loop lowering; then G4 wires this pass to a `--target uaal` CLI.

## G4 — Register a `uaal` CLI compile target

`agents/uaal-vm.md` documents `holo compile my-agent.hsplus --target uaal`; the CLI has no such
target.

- **Falsifiable claim:** `holo compile <file>.hsplus --target uaal --out <dir>` emits a `.uaal`
  bytecode artifact.
- **Real seam:** target registration in `packages/cli` dispatching to the G3 lowering pass.
- **Failing-if-broken evidence:** a CLI smoke test asserting a non-empty `.uaal` artifact and a
  loadable bytecode header.
- **Scope/blast:** depends on G3. Out of scope: bundling the runtime. Regression: low.
- **STATUS — SHIPPED 2026-06-22.** `packages/cli/src/cli.ts` adds `uaal` to `validTargets` + an
  inline handler block: parse `.holo` (`HoloCompositionParser`) → `UaalBehaviorCompiler.compile` →
  write `.uaal` JSON bytecode (with `--output`). Verified end-to-end: `pnpm --filter @holoscript/cli
  build` (exit 0), then `holo compile <fixture>.holo --target uaal` emitted valid bytecode
  (`{version:2, instructions:[{opCode:255 HALT}]}`) and the parse-error path prints + exits 1.
  - **Required publishing the new core export:** `UaalBehaviorCompiler` was added to
    `packages/core/scripts/generate-types.mjs` (the hand-curated `dist/index.d.ts`) and core
    rebuilt, so consumers see it on `@holoscript/core`. (core/dist is gitignored — consumers
    rebuild from src; the committable change is the `generate-types.mjs` declaration.)
  - **Scope note:** behavior lowering requires *composition-level* `actions`/`eventHandlers`/`logic`;
    a behavior-less scene compiles to a single `HALT`. `.hsplus` input (vs `.holo`) needs the
    `.hsplus → HoloComposition` bridge — a known follow-up, not in this slice.

## G5 — Join cognitive ⇄ spatial through `SceneSnapshot`

The spec's hand-off (HOLO VM serializes a `SceneSnapshot`; uaal VM reasons over it; results
actuate back) is described but not exercised in a canonical path.

- **Falsifiable claim:** a HOLO `SceneSnapshot` feeds the uaal VM as perception, and a uaal
  action mutates HOLO world state, in one runnable loop.
- **Real seam:** an integration harness wiring `holo-vm` `executor` ⇄ `uaal` `vm` via the
  existing `SceneSnapshot` type.
- **Failing-if-broken evidence:** integration test asserting a perceive→reason→act tick changes
  world state.
- **Scope/blast:** test/integration only initially. Regression: none (read paths).
- **STATUS — SHIPPED 2026-06-22 (both halves proven; in-process join deferred).**
  `packages/holo-vm/src/scene-snapshot.ts` adds `SceneSnapshot` + `sceneSnapshot(world)` — a
  wire-safe perception serializer (the greenfield piece; none existed). Proven on BOTH sides
  against the shared SceneSnapshot contract:
  - **Spatial side** (`holo-vm/__tests__/scene-snapshot.test.ts`, 3/3): produces the perception
    (JSON round-trips), captures per-entity components, and applies a cull decision back to the
    world (`despawn` → entityCount 3→2 — the act seam).
  - **Cognitive side** (`uaal/__tests__/scene-perception.test.ts`, 2/2): the REAL `@holoscript/uaal`
    VM reasons over a SceneSnapshot perception and emits `cull`/`noop` by entityCount (non-vacuous).
  - `tsc --noEmit` clean on both packages. No dependency/lockfile change.
  - **Deferred — the in-process join** (one call: snapshot → uaal → act): needs an adapter that
    deps BOTH VMs (holo-vm is merged into engine which doesn't dep uaal; agent-protocol/studio dep
    uaal but not holo-vm). That's a deliberate dependency-graph step (a `pnpm add` + lockfile), not
    rushed at marathon's end. Same architecture as G9b (the cross-package join lives in an adapter).
    Idea-seed `2026-06-22_cognitive-spatial-inprocess-adapter`. This is the D.102 portable-mind tick.

## G6 — Mature the `.hs` grammar + emitter on the canonical Rust/WASM parser

The `.hs→Kotlin` emitter (first landed 2026-06-21, W.815) is the proof `.hs` logic compiles to a
real target. Since then the subset has grown — loops, structs (with per-field type inference),
local mutable-state, string interpolation (`${}`), and typed arrays/lists (`listOf` + `List<T>`
inference on returns, params, and locals) all ship and are cargo-/parity-tested. It is still a
*declared subset* (`lib.rs:1` self-labels "`.hs` subset parser"): object literals → `mapOf` (G7e)
and struct list-fields (G7f) are the next queued slices; broader grammar generalization continues.

- **Falsifiable claim:** the documented `.hs` logic subset compiles via `packages/compiler-wasm`
  to ≥1 target with parity tests green.
- **Real seam:** `packages/compiler-wasm/src` emitter modules + parity suite.
- **Failing-if-broken evidence:** the existing cargo + parity tests (extend, keep green).
- **Scope/blast:** grammar repo only. Out of scope: TS-parser `.hs`-logic support (HSP101 —
  intentionally not the path). Regression: covered by parity tests.

## G7 — Make native-authoring coverage a tracked, rising gate

TS capability must dissolve INTO native authoring (`.hsplus`/`.holo`/`.hs`), not grow as TS. This
is the D.104 metric. Without a gate it stays a footnote — and the only figure that ever circulated
("1.32% native trait annotation", 37/2801) was an **unverified paper claim with no code computing
it** (a fitting irony for this whole thread). The gate replaces it with a real number from the tree.

- **Falsifiable claim:** a check reports `native / (native + hand-TS-traits)` over `packages/` and
  fails CI if either the native count or the ratio drops below a committed baseline.
- **Real seam:** a `check:native-coverage` script + `package.json` `check:*` entry (HoloCI runs
  these); D.101-compatible (it is *measurement of the language*).
- **Failing-if-broken evidence:** the check itself (red on regression) + a pure-node test
  asserting the metric is real, the baseline is honest, and a simulated drop exits 1.
- **Scope/blast:** new check script + baseline + test + package.json entries. Regression: none.
- **STATUS — SHIPPED 2026-06-22.** `scripts/holo-ci/check-native-coverage.mjs` +
  `native-coverage-baseline.json` + `scripts/__tests__/check-native-coverage.test.mjs` (9/9 pass).
  Real packages-scoped baseline: **native 162** (.hsplus 24 / .holo 137 / .hs 1) vs **hand-TS
  traits 554** = **22.63%**. (Note `.hs` = 1 in packages — the `.hs` logic format is barely used
  yet, consistent with G6.) `package.json`: `check:native-coverage`, `:update`,
  `check:native-coverage-test`. The gate fails if native count or ratio drops — coverage can only
  rise or hold. **Pre-commit Gate wiring** (a `.githooks/pre-commit` block like Gate 5e) is an
  optional follow-up; the `check:*` entry is the CI hook.

## G9 — Fleet agents communicate as uAAL peers *(Jetson / laptop / Vast)*

The uAAL ISA ships peer opcodes — `CALL_NODE` (0x21), `OP_OFFLOAD` (0x23), `OP_SYNC` (0x24) —
but they were inert extension points. A uAAL program on one node could not actually reach
another. This is the "fleet agents all communicating with each other" gap (MEMORY direction
`fleet-is-uaal-mesh-of-peers`, D.102 portable agent mind).

- **Falsifiable claim:** a uAAL program with `CALL_NODE` on one VM routes through a transport to
  a peer node's handler and the reply lands on the caller's stack; `OP_OFFLOAD`/`OP_SYNC`
  deliver to peer inboxes.
- **Real seam:** `registerMeshHandlers(vm, transport)` registers handlers on the VM's
  handler-dispatch (`vm.ts` checks handlers before the built-in switch); `MeshTransport` is the
  pluggable transport.
- **Failing-if-broken evidence:** `packages/uaal/src/__tests__/mesh-transport.test.ts` (6/6) —
  jetson↔laptop↔Vast round-trip, 3-tier aggregation, offload, broadcast, bidirectional, fail-loud.
- **Scope/blast:** `packages/uaal/src/mesh-transport.ts` + index export + test. `tsc` clean;
  full uaal suite 47/47. Additive (handlers only active when registered); uaal stays dependency-free.
- **STATUS — slice 1 SHIPPED 2026-06-22.** In-process `InMemoryMeshRouter` proves the semantics.
  **Remaining:** a HoloMesh-backed `MeshTransport` (`request`→`ask_peer`/`send_message`,
  `offload`→one-way message, `sync`→gossip) so the transport spans real machines — lives in an
  edge/agent package, NOT uaal (keep uaal dependency-free). That is the next slice.

---

## What is explicitly NOT a gap

- `.holo` spatial pipeline (G1) — built and tested; do not "rebuild."
- The aspirational ISA (`OP_BECOME_SENTIENT`, `OP_COLLAPSE_WAVEFUNCTION`, multiversal/timeline
  ops) — quarantined in the spec; not a build target.
- The uaal/holo-vm *runtimes* themselves — they exist; the work is the **front-end bridge**
  (G3/G4/G5), not the VMs.

## Sequencing

**G3 → G4 → G5** is the spine: wire the real grammar into the cognitive VM, expose it on the
CLI, then join cognitive ⇄ spatial. **G6** runs in parallel in the grammar repo. **G7** is the
cheap gate that stops regression. Each is a single buildable slice with a falsifiable e2e test —
the discipline the paper program never applied to the formats themselves.
