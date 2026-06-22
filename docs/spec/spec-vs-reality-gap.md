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
| G5 | cognitive ⇄ spatial via `SceneSnapshot` | both VMs exist; not joined in the canonical compile path | ⚠️ |
| G6 | `.hs` imperative logic is a real compiled language | Rust/WASM grammar parses; `.hs→Kotlin` emitter only landed 2026-06-21; TS parser can't parse `.hs` logic (HSP101) | ⚠️ young |
| G7 | declarative trait/brain authoring is native | native annotation ≈ **1.32%** of traits; ~88% of declared traits have no runtime handler | ⚠️ |
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

## G6 — Mature the `.hs` grammar + emitter on the canonical Rust/WASM parser

The `.hs→Kotlin` emitter (2026-06-21, W.815) is the first proof `.hs` logic compiles to a real
target. Generalize beyond the current subset (loops/structs/mutable-state still open).

- **Falsifiable claim:** the documented `.hs` logic subset compiles via `packages/compiler-wasm`
  to ≥1 target with parity tests green.
- **Real seam:** `packages/compiler-wasm/src` emitter modules + parity suite.
- **Failing-if-broken evidence:** the existing cargo + parity tests (extend, keep green).
- **Scope/blast:** grammar repo only. Out of scope: TS-parser `.hs`-logic support (HSP101 —
  intentionally not the path). Regression: covered by parity tests.

## G7 — Make native-authoring coverage a tracked, rising gate

1.32% of traits are natively annotated; the rest are hand-TS. This is the D.104 metric (TS must
push `.hsplus`). Without a gate it stays a footnote.

- **Falsifiable claim:** a check reports `native_authored / total` per surface and fails CI if it
  drops release-over-release.
- **Real seam:** a `check:native-coverage` script + HoloCI wiring (this is *measurement of the
  language*, D.101-compatible).
- **Failing-if-broken evidence:** the check itself (red when coverage regresses).
- **Scope/blast:** new check script + CI config. Regression: none (reporting).

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
