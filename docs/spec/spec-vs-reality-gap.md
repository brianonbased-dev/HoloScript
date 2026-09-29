# uAAL/HOLO Spec ↔ Reality Gap (the language-build backlog)

> Reconciles [`uaal-language-spec.md`](./uaal-language-spec.md) against the shipped code,
> verified initially 2026-06-22, refreshed 2026-07-23, and extended 2026-09-28 by a meaning audit
> (G10–G20) in the HoloScript repo, with G21 (the Holo tools in the language) added the same
> day. Each gap carries the F.076 four-question frame
> (falsifiable claim · real seam · failing-if-broken evidence · scope/blast) so it is a
> buildable slice, not a vibe. Ordered by leverage.
> **Stratum scope (2026-07-17):** bare "uAAL" below is historical wording — per
> [`language-architecture.md`](./language-architecture.md) it names only the stratum-③
> cognitive VM; meaning is stratum-② **HoloMeaning**, surface is stratum-① (the three formats).

## Status legend

✅ shipped & wired · ⚠️ exists but not wired into the canonical path · ❌ absent/aspirational

## Summary table

| #   | Spec claim                                                                             | Reality                                                                                                                                                                                                                                                                            | Status                                  |
| --- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| G1  | `.holo → bytecode → VM → render`                                                       | `HolobCompiler` + `holo-vm`, e2e-tested to pixels                                                                                                                                                                                                                                  | ✅                                      |
| G2  | `@holoscript/uaal` cognitive VM + compiler                                             | `packages/uaal` alive, consumed by agent-protocol/engine/studio                                                                                                                                                                                                                    | ✅ (runtime)                            |
| G3  | `.hs/.hsplus → uAA2++ compiler → UAAL bytecode`                                        | `.holo` behavior bridge active; canonical `.hs` Rust/WASM path now lowers a conservative typed function subset directly to UAAL; whole-document `.hsplus` lowering remains                                                                                                         | ✅⚠️ **partial**                        |
| G4  | `holo compile … --target uaal` (per `agents/uaal-vm.md`)                               | **shipped**: `--target uaal` parses `.holo` → `UaalBehaviorCompiler` → writes `.uaal` bytecode; verified end-to-end                                                                                                                                                                | ✅                                      |
| G5  | cognitive ⇄ spatial via `SceneSnapshot`                                                | **shipped**: `sceneSnapshot()` serializes HOLO world → perception; both real VMs proven against the shared contract (producer+act / cognitive decision); in-process adapter deferred (needs a package depping both)                                                                | ✅⚠️ **partial**                        |
| G6  | `.hs` imperative logic is a real compiled language                                     | Rust/WASM grammar plus shared body-type pass; a conservative typed `i32`/`bool` control subset, including lazy `&&`/`\|\|`, compiles to UAAL and to a native executable; broader inference/data/ABI coverage remains                                                               | ✅⚠️ **bounded subset**                 |
| G7  | native-authoring coverage is tracked + rising                                          | **shipped**: `check:native-coverage` ratchet gate; live baseline is computed by the checker, must rise/hold, and replaces the unverified paper figure. **2026-09-28:** 2,232 facade twins are counted; 71.84% without them. Fix in review: PR #429                                 | ⚠️ **counts facades** → fix in review   |
| G8  | the spec is the language's source of truth                                             | spec lived only in the Gemini knowledge silo until 2026-06-22                                                                                                                                                                                                                      | ✅ (reclaimed by this dir)              |
| G9  | fleet agents (Jetson/laptop/Vast) communicate as uAAL peers                            | mesh opcodes (`CALL_NODE`/`OP_OFFLOAD`/`OP_SYNC`) were inert; **now wired** to a `MeshTransport` (slice 1 in-process router, e2e proven); real HoloMesh adapter pending                                                                                                            | ✅⚠️ **partial**                        |
| G10 | `.hs` runs the same on native and UAAL                                                 | UAAL keeps one slot per function, so recursion returns wrong values with `HALTED`: `fib(10)` = -80 (native 55). Fix in review: PR #428                                                                                                                                             | ❌ → fix in review                      |
| G11 | "valid `.hs`" is the definition of meaning (Spec v0.1 (a))                             | typed functions: fix in review, PR #438 (unknown names and functions, arity, hiding and missing returns refused, with positions); the `@unknown` reads, PR #444, close case 008. Untyped functions keep the old reading by design                                                  | ⚠️ fix in review (typed functions only) |
| G12 | general-purpose names                                                                  | `action`, `object`, `move`, `quest`, `dialogue`, `ability` are reserved and cannot be identifiers                                                                                                                                                                                  | ❌                                      |
| G13 | `.holo` keeps what it accepts                                                          | `on_click` bodies, misspelled keywords, garbage functions and `world` names are dropped with `valid: true` and no warning                                                                                                                                                          | ❌                                      |
| G14 | `.hsplus` has its own types and checker                                                | untyped bodies are raw text (JavaScript and garbage accepted); only typed-function bodies are checked; `@trait` is an "Unknown directive"                                                                                                                                          | ❌                                      |
| G15 | agent frames bound tool use                                                            | `allowed_tools: []` permits every tool (TS and Rust)                                                                                                                                                                                                                               | ❌                                      |
| G16 | Spec v0.1 examples are machine-checked                                                 | all 94 fences match their verdicts, but the test checks success only, not what was kept                                                                                                                                                                                            | ⚠️                                      |
| G17 | the teaching docs work                                                                 | 232 of 889 HoloScript examples fail or keep nothing; Holoschool lessons 07–10 mostly fail                                                                                                                                                                                          | ❌                                      |
| G18 | one file ending, one reader                                                            | true for `holoscript validate` only; `parse`, `compile`, `build`, `diff` and `run` read `.hs` with other readers and accept what `validate` refuses                                                                                                                                | ❌                                      |
| G19 | `.hsplus` compiles to targets, never through JavaScript                                | bodies run via `new Function`; webgpu, godot and urdf compile no behavior; webgpu emits a TypeScript host                                                                                                                                                                          | ❌                                      |
| G20 | the three-surface tracer is a language property                                        | the gate script rewrites `.hs` source and branches in TypeScript; imports are inert; an import from a missing file passes                                                                                                                                                          | ⚠️ **harness**                          |
| G21 | a program can use a Holo tool (HoloAbsorb, HoloCI, HoloMesh…) through a checked import | no checked way: host calls are action strings no checker reads; `import { f } from "holo:absorb"` is valid and means nothing (a misspelled name, a wrong argument count and a missing module all pass); MCP pipeline stages compile to a throw, a pass-through or a `console.warn` | ❌ proposal                             |

---

## 2026-07-23 semantic-closure ratchet

[`three-surface-semantic-closure.md`](./three-surface-semantic-closure.md) and
[`examples/three-surface-agent`](../../examples/three-surface-agent/) supersede
the older assumption that each extension should be demonstrated in isolation.
The checked-in tracer proves one causal path (as measured on 2026-09-28, the links
between the files are made by the gate script, not by the language; see G20):

```text
.holo on_start
  → .hsplus on_task
  → .hs decide(plan.signal)
  → .holo apply_decision
```

Its independent 24-construct inventory reports 135 passed stage observations,
zero deferred, zero rejected, and nine exact target-inapplicable stages. The
mutation self-test must reject state, binding, inventory, policy-result, and
plan-signal drift. This closes a bounded executable slice of G3 and G6; it does
not close whole-document `.hsplus` lowering, the complete `.hs` grammar,
recursive `.holo` parameter frames, or formal target preservation.

---

## 2026-09-28 meaning audit (G10–G20)

Spec v0.1 (`holoscript-spec-v0.1.md`) records what each reader **accepts**. This audit measures
what accepted programs **mean**: what a reader keeps, and what a program returns when it runs.
Measured on main `a1a0a0ef6` with the committed `pkg-node` WASM (`version()` 3.0.0), a local
release build of `packages/compiler-native` (`holoscriptc`, Cranelift 0.129.2, rustc 1.91.0,
clang linker), the UAAL VM from `packages/uaal/src` with the std EXEC handler, and the canonical
router `validateCanonicalSource`. Each `.hs` probe ran three ways: checker, native executable,
UAAL VM.

**Verified real.** i32 overflow wraps identically on native and UAAL (`2147483647 + 1` gives
`-2147483648`; `65536 * 65536` gives `0`). Implicit numeric conversions and out-of-range
literals are refused by the checker and both backends. UAAL refuses integer `/`, `%`, unary
`-`, `!` and `??` with `HS-UAAL-CAP` codes instead of approximating them. `compiler-native` is
a real Cranelift backend with ownership forms (`&T`, `&mut T`, lifetimes, `scope`, `slot`,
move, drop) that no other surface has; all 25 `distributions/systems/conformance` programs are
valid. 68 of the 137 tracked `.hs` files pass `validate_detailed`, reproducing the Stage 1 notes
exactly. Every routed fence in Spec v0.1 matches its stated verdict.

**Measured gaps.** G10 (UAAL recursion returns wrong values), G11 (the checker that defines `.hs`
misses names, arity and returns), G12 (game words reserved), G13 (`.holo` drops content with
success), G14 (`.hsplus` keeps code as text), G15 (an empty tool allowlist permits every tool),
G16 (the Spec v0.1 fence test counts success, not content), G17 (about 1 in 4 teaching examples
fail), G18 (only `holoscript validate` uses the `.hs` reader), G19 (authored behavior runs as
JavaScript and no promised target compiles it), G20 (the three-surface links are made by the
gate script).

**For the route decision** (2026-09-27 route study, pending with the founder): the measurements
support one grammar (route C's reader half), because the Rust crate is the only reader that
parses code bodies at all, and the TypeScript `.hsplus` reader would have to be rebuilt to become
one. That half was already ratified on 2026-07-17 (`language-architecture.md` §5). Route C's
other half — "the Rust checker is the only judge of meaning" — conflicts with the ratified §3:
meaning is one IR, HoloMeaning (seeded by HSI-IR, `packages/meaning`), that every surface lowers
into and every engine runs from. The one demand app whose rules truly reach a native target, The
Mending Box, does exactly that (`.holo` rules → HSI-IR → Kotlin). The checker's job is to reject
source that cannot lower faithfully: G11 first, then G10 and G12, before `.hsplus` content moves
onto the Rust grammar. The route study's corpus counts need re-measuring on hand-written files; see the
facade census below.

**Facade census.** 2,232 `.hsplus` files are facade twins: a
`// Native .hsplus surface for <file>.ts` header and one `@trait` block with `capability_tags`,
an `@receipt` block and a median of two handlers (2,249 files carry the header). On 2026-06-25
between 05:51 and 17:36, 117 commits added 2,266 `.hsplus` files, 2,217 of them facades; 116 of
those commits are titled "D.104 … wave" and each also rewrote `native-coverage-baseline.json`,
which went from 162 native files (22.6%, 2026-06-22) to 3,719 (86.2%). No generator was
committed. Their handlers call 2,666 distinct functions, and 2,655 of
them are defined nowhere (no HoloScript definition, no builtin table). Nothing loads them except
`packages/std/src/math.hsplus` and `collections.hsplus`. They are counted by
`check:native-coverage` (G7), used as corpus by the HoloCI `hsplus-shadow-parity-gate` (2,226 of
its 2,298 baseline rows; the 71 non-facade rows pass the Rust reader 36 times), indexed by
Absorb, and present in ai-ecosystem evaluation data (177 of the 385 rows of
`holoscript-format-heldout-pool-v1.jsonl`). Two files already call the form "aspirational
native-surface documentation, not live grammar"
(`packages/mcp-server/src/policy/policy-pack.holo.hsplus`,
`packages/agent-protocol/src/agentcore_adapter_contract.hsplus`). The route study's own per-file
results, split by this census:

| Route-study figure                  | All           | Facades       | Not facades |
| ----------------------------------- | ------------- | ------------- | ----------- |
| Rust reader accepts (UTF-8 .hsplus) | 2,264 / 2,470 | 2,223 / 2,232 | 41 / 238    |
| TypeScript reader accepts           | 2,246         | 2,103         | 143         |
| Both accept                         | 2,116         | 2,103         | 13          |
| "Different meaning" among both      | 1,684         | 1,682         | 2           |
| Accepted by the TypeScript only     | 130           | 0             | 130         |

Of the 202 hand-written `.hsplus` files, the Rust reader accepts 9 and the TypeScript reader 130. For `.holo`, 971 of the 1,001 files the Rust reader accepts are 20-line trait schema cards;
of the 586 compositions and other `.holo` files, the Rust reader accepts 30 and the composition
reader 511. The case for one grammar therefore rests on design (one grammar, one checker, bodies
parsed), not on corpus acceptance: on hand-written code the Rust grammar reads far less than the
TypeScript readers today, and that difference is the size of the port.

---

## G3 — Wire `.hs`/`.hsplus` source into the uAAL compiler _(highest leverage)_

The cognitive language is reachable from `.holo` behavior/action blocks, and
the canonical Rust/WASM `.hs` parser now lowers a conservative typed function
subset directly to UAAL. Whole-document `.hsplus` lowering remains incomplete.
`packages/uaal/compiler.ts` also retains its historical Intent-DSL
(`INTAKE("…")`, `CYCLE("…")`, `IF…THEN…END`) for compatibility.

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
- **STATUS — `.holo` slice shipped 2026-06-22; CALL/RET slice shipped
  2026-07-03; direct typed `.hs` subset shipped 2026-07-23.**
  `core/src/compiler/UaalBehaviorCompiler.ts` +
  `core/src/__tests__/compiler/UaalBehaviorCompiler.test.ts` pass on the real
  `@holoscript/uaal` VM; `tsc --noEmit` on core is clean; **no new dependency / lockfile change** —
  local opcode constants are drift-guarded against the real ISA in the test.
  - **Premortem correction applied:** lowers only the _behavioral_ subset (actions /
    eventHandlers / logic → `HoloStatement` bodies), NOT spatial nodes (that would be the
    category error the premortem flagged — spatial is `HolobCompiler → HoloVM`). The test is
    non-vacuous: distinct inputs yield distinct observable EXECUTE traces, and `JUMP_IF` is
    proven to gate execution (a false condition skips the consequent).
  - **Covered:** MethodCall, EmitStatement, Assignment, VariableDeclaration, AwaitStatement,
    ExpressionStatement, ReturnStatement, IfStatement, For/While/ClassicFor, and named action
    calls lowered to real UAAL `CALL`/`RET` with patched entry-point PCs.
  - **Deferred (recorded as `stats.unhandled`, not faked):** Animate and OnError.
  - **Direct `.hs` subset:** `packages/compiler-wasm/src/uaal_emit.rs` consumes
    the canonical AST, shares the semantic body-type pass used by validation,
    lowers typed `i32` arithmetic, comparison, calls, conditionals, `while`,
    and typed boolean `&&`/`||` through lazy branch graphs. Known non-boolean
    operands fail with `HS-TYPE-LOGICAL-001`; target-unproven truthiness fails
    with `HS-UAAL-CAP-002`.
  - **Remaining for G3:** whole-document `.hsplus` lowering and broader `.hs`
    type/control/data coverage.

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
  - **Scope note:** behavior lowering requires _composition-level_ `actions`/`eventHandlers`/`logic`;
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

The `.hs→Kotlin` emitter (first landed 2026-06-21, W.815) proved `.hs`
could reach a real target. The 2026-07-23 slices add a shared semantic body-type
pass and direct UAAL lowering for a conservative typed subset. That subset now
includes boolean `&&`/`||` lowered as real lazy branches, not eager VM
truthiness. A poison-RHS differential test returns `5` on both the native and
UAAL paths while the UAAL execution log proves neither statically present RHS
call executes. The parser and emitters remain declared subsets; broader
inference, grammar, data, ownership, and ABI generalization continues.

- **Falsifiable claim:** the documented `.hs` logic subset compiles via `packages/compiler-wasm`
  to ≥1 target with parity tests green.
- **Real seam:** `packages/compiler-wasm/src` emitter modules + parity suite.
- **Failing-if-broken evidence:** the existing cargo + parity tests (extend, keep green).
- **Scope/blast:** grammar repo only. Out of scope: TS-parser `.hs`-logic support (HSP101 —
  intentionally not the path). Regression: covered by parity tests.
- **Typed-logic boundary:** known non-booleans are semantic errors; UAAL also
  requires explicit boolean proof for bindings and call returns. Unary `!` and
  unannotated truthiness remain outside this target subset.

## G7 — Make native-authoring coverage a tracked, rising gate

TS capability must dissolve INTO native authoring (`.hsplus`/`.holo`/`.hs`), not grow as TS. This
is the D.104 metric. Without a gate it stays a footnote — and the only figure that ever circulated
was an **unverified paper claim with no code computing it** (a fitting irony for this whole thread).
The gate replaces it with a real number from the tree.

- **Falsifiable claim:** a check reports `native / (native + hand-TS-traits)` over `packages/` and
  fails CI if either the native count or the ratio drops below a committed baseline.
- **Real seam:** a `check:native-coverage` script + `package.json` `check:*` entry (HoloCI runs
  these); D.101-compatible (it is _measurement of the language_).
- **Failing-if-broken evidence:** the check itself (red on regression) + a pure-node test
  asserting the metric is real, the baseline is honest, and a simulated drop exits 1.
- **Scope/blast:** new check script + baseline + test + package.json entries. Regression: none.
- **STATUS — SHIPPED 2026-06-22.** `scripts/holo-ci/check-native-coverage.mjs` +
  `native-coverage-baseline.json` + `scripts/__tests__/check-native-coverage.test.mjs` pass.
  The baseline is live data from the tree; use `check:native-coverage` or the baseline file for
  current values instead of copying numbers into prose. `package.json` exposes
  `check:native-coverage`, `:update`, and `check:native-coverage-test`. The gate fails if native
  count or ratio drops — coverage can only rise or hold. **Pre-commit Gate wiring** (a
  `.githooks/pre-commit` block like Gate 5e) is an optional follow-up; the `check:*` entry is the
  CI hook.
- **CORRECTION 2026-09-28 — the ratio counts facades.** 2,232 facade `.hsplus` twins (facade
  census in the 2026-09-28 audit above) raised it from 22.6% to 86.2% on 2026-06-25; nothing
  runs them and their handlers call functions that do not exist. As enforced: 86.31%. Without
  the facades: 71.84%. Also without 192 `.holo` trait cards nothing consumes: 68.75%. The ratchet
  (`check-native-coverage.mjs` 222–231) would fail if the facades were deleted, so today it
  rewards keeping them; its comment at line 82 ("six bulk commits") undercounts the 116
  baseline-rewriting commits of 2026-06-25.
  Status: ⚠️ — it counts files that exist, not behavior that runs. **Fix in review: PR #429**
  counts a header file only when its package names it (std's two), resolves headers that omit
  `src/`, records a definition in the baseline, and reseeds: 1,503 native files, 71.64% (the
  by-extension 86.31% is still printed). The `.holo` trait cards still count.

## G9 — Fleet agents communicate as uAAL peers _(Jetson / laptop / Vast)_

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
- **Failing-if-broken evidence:** `packages/uaal/src/__tests__/mesh-transport.test.ts` —
  jetson↔laptop↔Vast round-trip, tiered aggregation, offload, broadcast, bidirectional, fail-loud.
- **Scope/blast:** `packages/uaal/src/mesh-transport.ts` + index export + test. `tsc` clean;
  full uaal suite passes. Additive (handlers only active when registered); uaal stays dependency-free.
- **STATUS — slice 1 SHIPPED 2026-06-22.** In-process `InMemoryMeshRouter` proves the semantics.
  **Remaining:** a HoloMesh-backed `MeshTransport` (`request`→`ask_peer`/`send_message`,
  `offload`→one-way message, `sync`→gossip) so the transport spans real machines — lives in an
  edge/agent package, NOT uaal (keep uaal dependency-free). That is the next slice.

## G10 — `.hs` on UAAL has no per-call frames: recursion returns wrong values

- **Falsifiable claim:** every `.hs` program that `compile_to_uaal` accepts returns the same
  value on the UAAL VM as the native `holoscriptc` executable, or `compile_to_uaal` refuses it
  with an `HS-UAAL-CAP` code.
- **Real seam:** `packages/compiler-wasm/src/uaal_emit.rs:2806` names every parameter and local
  slot `__hs::{function}::{name}` — one slot per function, not per call. A recursive `CALL`
  overwrites the caller's slot, so any read after the call sees the callee's value.
- **Failing-if-broken evidence (measured 2026-09-28, native vs UAAL, both `HALTED`/exit 0):**
  `fib(10)` 55 vs **-80**; `fib(3)` 2 vs **-3**; `sum_to(n - 1) + n` at 4 gives 10 vs **0**,
  while `n + sum_to(n - 1)` gives 10 on both (a read before the call survives). Bytecode for
  `fib(3)`: `STORE __hs::fib::n`, `CALL`, then `LOAD __hs::fib::n` after the call returns.
  Block shadowing (`let x: i32 = 1`, then `let x: i32 = 2` inside `if (true)`, return `x`):
  UAAL **2**, native refuses (`hs-machine-v5 … redeclares binding`), checker valid. A typed
  `f(): i32` with no `return`: UAAL returns **`null`**, native refuses. The two recursion tests
  could not see this: `lowers_recursive_parameterized_if_to_jumps_and_calls`
  (`uaal_emit.rs:3006`) asserts bytecode shape only and pins the shared slot name, and the
  `countdown` e2e test in `packages/compiler-wasm/src/__tests__/wasm-api.test.ts` runs on the VM,
  but its program never reads the parameter after the recursive call.
- **Scope/blast:** `uaal_emit.rs` plus a differential test that executes on the real VM with the
  std EXEC handler (the pattern in `packages/std/scripts/abi-conformance.mjs`). Honest interim:
  refuse call-graph cycles with an `HS-UAAL-CAP` code until frames exist. Rebuilding
  `pkg-node` changes the pinned WASM digest (re-pin as in #386).
- **STATUS — FIX IN REVIEW (PR #428, 2026-09-28).** Re-entrant call sites save and restore the
  caller's slots (no VM change); block scope and every-path returns follow the native rules;
  recursion without a value or with buffer/borrow/aggregate state fails closed with
  `HS-UAAL-CAP-007`. A new e2e test runs fib, call-first `sum_to`, a local read after the call and
  mutual recursion on UAAL and natively; fed the old emitter it fails with "expected -80 to be
  55". All 137 tracked `.hs` files compile to identical bytecode or are refused as before.
  `three-surface-semantic-closure.md` said UAAL lowering refuses what it cannot preserve; for
  recursion it did not. That sentence is corrected in the same change as this entry.

## G11 — "Valid `.hs`" does not mean "runs": meaning is judged in three places

- **Falsifiable claim:** a `.hs` source that `validate_detailed` reports valid either runs with the
  same result on every backend or is refused by every backend for the same named reason. Name
  resolution, arity, return paths and scoping are checked once, in the checker.
- **Real seam:** `packages/compiler-wasm/src/semantic_types.rs` (the checker Spec v0.1 decision (a)
  makes the definition of `.hs`) versus duplicate checks in `packages/compiler-native`
  (`calls unknown function`, `has no return statement`, `expects 2 arguments`) and in
  `uaal_emit.rs` (`unresolved function call`, `arity mismatch`, `unresolved slot`).
- **Failing-if-broken evidence (checker / native / UAAL):** `return y` with no `y`: valid /
  refused / refused. `return g(1)` with no `g`: valid / refused / refused. `add(1)` for a
  two-argument `add`: valid / refused / refused. `f(): i32` with no `return`: valid / refused /
  `null`. `function f(x: Banana): Kiwi { return x.peel() }` and
  `function f(x: number): string { return x.toFixed(2) }`: valid. `break` inside `while`: valid
  (read as a bare identifier), refused by both. `a ?? 3` on a plain `i32`: valid / refused /
  refused. Untyped `let a = 7`: valid / `requires an explicit type` / refused. Mismatches between
  two known types are caught (`add(true, false)`, `return "hello"` from `i32`). The backends
  also accept different subsets: native refuses `var` locals and loops
  (`hs-machine-v5 local i must be immutable`), UAAL runs them (sum 0..9 = 45); UAAL refuses
  integer `/`, `%`, unary `-` and `!`, native runs them. Every checker error reports line 0,
  column 0.
- **Scope/blast:** move name, arity, return-path and scope checks into the shared checker; the
  backends keep only capability refusals. Route C in the 2026-09-27 route study would make this
  checker "the only judge of meaning", so this is the first step of that route, not a side task.
- **STATUS — FIX IN REVIEW for typed functions only (PR #438, 2026-09-28);** proposal
  [`proposals/HS_Checker_Names_Calls_Returns_v1.md`](../../proposals/HS_Checker_Names_Calls_Returns_v1.md),
  whose "As built" section is the record. Inside a function that states a type, the checker now
  refuses unknown names and functions, calls to values, wrong argument counts (functions and
  struct constructors), hidden names and missing returns, each with its position; the eight
  covered `g11-*` corpus cases flipped. Measured on the build: 0 of 68 valid `.hs` files and 0
  of 2,474 `.hsplus` files changed verdict; `check-hs-conformance` now holds that floor (68 files,
  256 typed functions). `g11-coalesce-plain-008` closes with the `@unknown` reads (PR #444,
  stacked on #438; proposal [`Unknown_Field_Reads_v1.md`](../../proposals/Unknown_Field_Reads_v1.md)):
  inside a typed function `??` needs `load(record.field)` on its left, and the floor becomes 69
  files and 258 typed functions because the steward example turns valid. Still open: untyped
  functions (by design), `g11-unknown-types-006`, operations a backend lacks (UAAL refuses
  integer `/`, `%`, unary `-` and `!`), and older checker builds (the browser build `pkg/` is from
  2026-08-04).

## G12 — Domain words are reserved keywords in the systems grammar

- **Falsifiable claim:** an identifier may be any word that is not a core control or declaration
  keyword. Domain words (scene, game) are contextual at most.
- **Real seam:** `packages/compiler-wasm/src/token.rs` 160–229 reserves `orb entity object
composition world template group timeline environment logic npc quest ability dialogue
state_machine achievement talent_tree move action on_teleport` beside `if while function let
var`. NORTH_STAR rule 4: never hardcode domain vocabulary into core.
- **Failing-if-broken evidence:** `let quest: i32 = 7`, `let move: i32 = 7`, `let object: i32 = 7`,
  a parameter named `action`, a function named `dialogue`, and a struct field named `ability` all
  fail with `Expected identifier` in the checker, the native compiler and `compile_to_uaal`.
- **Scope/blast:** contextual keywords (a keyword only in top-level declaration position) keep every
  accepted file parsing and free the words as names. It changes accepted syntax, so it goes
  through the Spec v0.1 proposal process.
- **STATUS — OPEN.**

## G13 — `.holo` keeps less than it accepts, beyond Spec v0.1 Known gap 1

- **Falsifiable claim:** when the composition reader returns success, every construct in the source
  is either kept in the AST or reported as a warning or error.
- **Real seam:** `HoloCompositionParser.ts` object-level `on_*` handling, the root unknown-word
  path, and the domain-block classifier.
- **Failing-if-broken evidence (all `valid: true`, no warning):** an object's
  `on_click { state.clicks += 1 }` becomes a property `on_click` with no value; `objetc Cube {}`
  becomes `DomainBlock { domain: "custom", keyword: "objetc" }`;
  `function f() { this is not code at all ))) ((( }` becomes a trait named `@`;
  `world Room { object Cube { … } }` becomes
  `DomainBlock { domain: "architecture", keyword: "Room", name: "unnamed" }` — the name and the
  word `world` are gone. The runtime side is board task task_1785868122515_x7u4.
- **Scope/blast:** warn first, then error, through the Spec v0.1 proposal process.
- **STATUS — OPEN.**

## G14 — `.hsplus` reads code as text

- **Falsifiable claim (founder vision, via the 2026-09-28 language notes):** `.hsplus` has its own
  types, checker and spec, and compiles straight to targets, never through JavaScript.
- **Real seam:** `HoloScriptPlusParser.ts` raw blocks (`function`, `module`, `enum`, `action`) and
  handler bodies.
- **Failing-if-broken evidence:** an untyped `function f() { … }` whose body is plain JavaScript
  (`const`, an arrow function, a template literal, `console.log`, `JSON.stringify`, `===`) is
  valid, body kept as text; so is `function f() { this is not code at all ))) ((( }`.
  `@trait Config { … }` draws `HSP001: Unknown directive @trait` and becomes a node whose kind is
  the trait name; `@on_parse(source, format)` stores its parameters as `true` flags. Typed
  functions are checked by the Rust checker (#377, also inside `logic`), yet the AST still keeps
  their bodies as text. Not type-checked at all: trait field defaults (`retries: i32 = "three"`),
  struct construction, module-call arity, state assignments, an untyped callee's return.
- **Scope/blast:** this is the reader half of the route decision; see the 2026-09-28 audit above.
- **STATUS — OPEN.**

## G15 — An empty tool allowlist permits every tool

- **Falsifiable claim:** an agent frame's `allowed_tools` bounds what the agent may call, and an
  author can write "no tools".
- **Real seam:** `packages/core/src/traits/FrameDeclarationTrait.ts:191` ("empty = all allowed")
  and `packages/compiler-wasm/src/ast.rs:843` ("Empty vec = all tools permitted").
- **Failing-if-broken evidence:** a `#brain` whose `@frame_declaration` says `allowed_tools: []`
  validates with no warning, and both implementations then allow every tool. The 2026-09-27 route
  study (appendix A5) and the Stage 1 measurements recorded the same default first; this entry
  puts it in the backlog.
- **Scope/blast:** distinguish an omitted field from an explicit empty list; warn first. Existing
  brains may rely on today's meaning, so it needs a written proposal.
- **STATUS — OPEN; proposal accepted under the Spec v0.1 gate rule (2026-09-28):**
  [`proposals/Agent_Frame_Tool_Allowlist_v1.md`](../../proposals/Agent_Frame_Tool_Allowlist_v1.md)
  — `["*"]` for every tool, `[]` for none, omitted unchanged. Measured: one file writes `[]`
  (`compositions/frame-declaration-example.hsplus`, deliberately meaning "every tool"; it migrates
  to `["*"]`), four list tools, every other brain omits the field; none in ai-ecosystem declare it.

## G16 — The Spec v0.1 fence test counts success, not what was kept

- **Falsifiable claim:** every accepted fence in `holoscript-spec-v0.1.md` keeps the construct the
  spec text says it keeps, and every `reject` fence fails with the message the spec prints.
- **Real seam:** `packages/core/src/parser/__tests__/holoscript-spec-v0.1.test.ts` 92–112
  (`accepts()` returns only `success`/`valid`) and 121–131 (reject fences are checked for failure
  only, except three dedicated tests).
- **Failing-if-broken evidence:** G13 shows `success: true` with content discarded, so an accepted
  fence can pass while its construct is dropped.
- **Scope/blast:** assert a kept-node signature per accepted fence and the printed message per
  reject fence. The file belongs to the Spec v0.1 lane.
- **STATUS — OPEN.** Control measurement: all 94 routed fences in the spec match their stated
  verdict today (0 mismatches), so the gap is the test's strength, not the spec's accuracy.

## G17 — The teaching docs teach syntax the readers refuse

- **Falsifiable claim:** every HoloScript example a learner reads in `docs/` parses under the reader
  the router assigns to its fence tag, and keeps its content.
- **Real seam:** fenced blocks in `docs/holoschool`, `docs/guides`, `docs/language`, `docs/traits`,
  `docs/examples`, `docs/cookbook`, routed through `validateCanonicalSource`.
- **Failing-if-broken evidence (measured 2026-09-28 on main a1a0a0ef6, 1,492 fences, 889 tagged
  `holo`/`hsplus`/`hs`/`holoscript`):** 216 rejected and 16 accepted-but-empty (about 1 in 4).
  By tag: `holo` 102/148 valid, `hsplus` 181/226, `hs` 133/242. Holoschool level 1, the newcomer
  path: 81 of 113 valid — lessons 00–04 all valid, 07 9/17, 08 5/17 (`object X using Template`
  is refused), 09 2/9, 10 0/2. `docs/examples/hello-world.md:7` uses `execute`, which the `.hs`
  reader refuses. `docs/language/reference-hsplus-pipeline.md` (25) and
  `docs/guides/pipeline-grammar.md` (12) fail every example: they teach `pipeline` as `.hs`, and
  the `.hs` reader has no `pipeline`. Of 273 fences tagged `holoscript`, 42 are accepted by all
  three readers; when exactly two accept, the `.hs` reader is the one refusing in 168 of 169.
- **Scope/blast:** the docs-as-tests gate from the 2026-09-27 lock-in plan (step 2), plus retagging
  or rewriting the failing lessons. Spec v0.1 already names this as remaining work.
- **STATUS — OPEN.**

## G18 — The CLI honors the `.hs` reader only in `validate`

- **Falsifiable claim:** Spec v0.1 decision (a) — "one file ending, one reader" — holds for every
  CLI verb, so `holoscript parse`, `compile`, `build` and `diff` accept exactly the `.hs` files
  that `holoscript validate` accepts.
- **Real seam:** `packages/cli/src/cli.ts`. `validate` routes through `validateCanonicalSource`
  (882–903). `parse` shares that case but sends `.hs` to `PipelineParser` when a line starts
  with `pipeline`, otherwise to the TypeScript `HoloScriptCodeParser` (960–1001). `compile`
  (2162–2165), `build` (3508–3509) and `diff` (1299, 1323) use `HoloScriptCodeParser`. `compile`
  reads `.hsplus` with a plain `HoloScriptPlusParser` (no `#brain` preprocessing, 2139–2160) and,
  on its `.holo` branch, keeps only the names of actions and handlers (2134–2137). `holoscript run`
  reads `.hs`, `.hsplus` and `.holo` alike with the `.hsplus` reader
  (`packages/core/src/cli/holoscript-runner.ts` 984, 1126, 1159), and `watch` uses
  `HoloScriptCodeParser` (cli.ts 5805–5830).
- **Failing-if-broken evidence (same source, `validate` vs the `parse` branch replicated from
  cli.ts):** `object "Cube" { … }` REJECT vs VALID; `pipeline "CustomerJourney" { … }` REJECT vs
  VALID (`PipelineParser`); `function add(left: i32, right: i64): i64 { return left }` REJECT
  (`HS-TYPE-RETURN-001`) vs VALID; `execute displayGreeting` (the hello-world line) REJECT vs VALID.
  This is where the lesson examples in G17 that `validate` refuses still "work".
- **Scope/blast:** route every `.hs` read in the CLI through the canonical reader; retire or fence
  `HoloScriptCodeParser` for `.hs`. Files the old reader accepted will stop parsing on those verbs,
  so it needs the Spec v0.1 proposal process and a migration list.
- **STATUS — OPEN.**

## G19 — Authored behavior runs as JavaScript, and no promised target compiles it

- **Falsifiable claim (founder vision):** `.hsplus` compiles straight to the v0.1 targets (webgpu,
  godot, urdf) and never through JavaScript.
- **Real seam and evidence (read on main a1a0a0ef6):**
  - `.hsplus` handler and function bodies stay raw text (G14) and are run with `new Function` on
    the general paths: `packages/engine/src/runtime/profiles/HeadlessRuntime.ts` 468–481
    (`holoscript run`, `test`, `headless`), `HoloScriptPlusRuntime.ts` 891–902 and 2224,
    `packages/core/src/state/ReactiveState.ts:597` and `packages/core/src/ReactiveState.ts:133`
    (CLI `watch`, REPL, Studio ScriptingPanel, MCP domain plugins), `TestTrait.ts` 313/342/372.
    Studio's holo-surface renderer evaluates property strings containing `$` as JavaScript
    (`HoloSurfaceRenderer.tsx:218`, `useHoloComposition.ts` 118 and 409). `PipelineNodeCompiler.ts`
    323–330 emits a module that runs `.hs` pipeline `where` text through `new Function`.
    `Native2DCompiler.ts` 2043–2062 evaluates `.holo` `@live_proof` claims at compile time.
  - JavaScript-free evaluators exist but are narrow: `DeterministicHsplusActionRuntime.ts` 522–604
    (used only by `headless --plan --behavior`) and `compiler-wasm/src/eval.rs` (called from
    HoloCI scripts only).
  - `WebGPUCompiler`, `GodotCompiler` and `URDFCompiler` read no logic, handlers, functions or
    bodies. WebGPU emits a TypeScript host program (transpiled at cli.ts 3262–3271, or
    type-stripped by regex in `mcp-server/src/renderer.ts` 705–723) around fixed WGSL templates,
    and references `WGSL_CUSTOM_<NAME>` for `@compute` objects (1488) without defining it. Godot
    turns zone handlers into `print("<zone>: enter")` and timeline `animate` into
    `func(): pass` (714–724, 742), and a timeline `call` targets a method it never defines
    (752–755). URDF has no behavior slot. No `.hsplus → HoloComposition` converter exists
    (`ExportManager.ts` 508–512), so `.hsplus` never reaches these three at all; the CLI refuses
    non-`.holo` input for them while MCP `compiler-tools.ts` (385, 418) still advertises `.hs`
    and `.hsplus`.
  - The UAAL VM (`packages/uaal/src/vm.ts`) is TypeScript with JavaScript numbers; `.hs` i32 and
    f32 arithmetic is imitated by std host handlers (`packages/std/src/uaal-abi.ts` 443–502). Its
    one shipped product use, `executeHsPlanKernel`, returns the authored literal.
- **Scope/blast:** parse `.hsplus` bodies into statement trees and refuse JavaScript-only syntax;
  replace the `new Function` sites with tree interpretation; add a statement-tree emitter for
  Godot; for webgpu, write the achievable bar into Spec v0.1 (a fixed compiler-owned JavaScript
  loader is unavoidable in a browser; authored behavior compiles to WGSL or WASM). Studio's `$`
  expressions and today's JavaScript-bodied `.hsplus` files depend on the current behavior, so it
  needs a census and an admission flag first.
- **STATUS — OPEN.** The founder vision is the target; today's floor is: `.hs` has a Rust parser
  and checker with real native (Cranelift) and Kotlin lowerings and a narrow UAAL path;
  `.hsplus` bodies run as JavaScript; the v0.1 targets compile scene structure only.

## G20 — The three-surface closure is made by the gate, not the language

- **Falsifiable claim (`three-surface-semantic-closure.md`, `language-identity.md`):** a
  `.holo → .hsplus → .hs → .holo` causal path executes, and the policy result determines whether
  the `.holo` effect executes, as a property of the HoloScript programs.
- **Real seam:** `scripts/holo-ci/check-three-surface-closure.ts`: `bindDecisionSignal` (428–437)
  rewrites the integer in the `.hs` source's `return decide(N)` and recompiles; the effect is
  skipped by the gate's own `if (decision <= 0) return false` (545); the manifest bindings are
  matched against three fixed (kind, from, to) triples (594–611), not interpreted. The brain's
  recall and plan steps are stubs and the signal is the constant in its `plan` block.
  `UaalBehaviorCompiler` never reads `.holo` imports.
- **Failing-if-broken evidence (unmodified gate run on mutated copies, 2026-09-28):** deleting both
  imports from `main.holo` leaves its UAAL bytecode byte-identical (the gate fails only on a
  string check); compiled on its own, `main.holo` always applies the decision. Adding
  `import { ghost } from "./does-not-exist.hs"` (listed in the manifest) **passes**: 25 constructs,
  141 passed marks, and `main.holo#import:ghost` marked passed at all six stages including
  `executed` and `target_preserved`. `decide` returning 0 or a zero plan signal fails the gate,
  because the gate requires the effect to run, so a correct "deny" can never pass. The 24
  constructs and 135 passed marks reproduce, and 117 of those marks are constants in the gate
  source (913–1081); 18 come from a compiler result.
- **Scope/blast:** resolve `.holo` imports in the UAAL path so `on_start` can call `decide` itself
  and branch in bytecode (`UaalBehaviorCompiler` already lowers `if`). Prior art:
  `ColyseusCompiler.compileSource` (`packages/core/src/compiler/ColyseusCompiler.ts` 404–451, since
  2026-06-16) already resolves a `.holo` file's `.hs` and `.hsplus` imports. Derive stage marks
  from compiler output, fail on an unresolvable import, and accept a deny outcome.
- **STATUS — OPEN.** The `.hs` dual compilation and execution inside the tracer are real; the links
  between the files are harness code.

## G21 — The Holo tools are not part of the language

- **Falsifiable claim (founder direction 2026-09-28; `language-identity.md` 59–60):** the Holo
  features (HoloAbsorb, HoloCI, HoloMesh, …) are part of the language: a HoloScript program can
  name one, the checker refuses a wrong use before anything runs, and a run performs it only with
  the operator's permission, recording each use.
- **Real seam:** hosts are reached through strings no checker reads (behavior-tree actions such as
  `process_exec`, `packages/core/src/stdlib/StdlibActions.ts` 293–296; daemon actions); the CLI
  turns MCP pipeline stages into a throw, a pass-through or a `console.warn`
  (`PipelineNodeCompiler.ts` 46–52, 71–72, 112–113, 141–142). `import { f } from "holo:absorb"`
  parses in all three readers; the `.hs` checker treats the imported name as a bare value.
- **Failing-if-broken evidence (measured 2026-09-28 on the G11 checker):** a misspelled import, a
  wrong argument count and `holo:no-such-service` are all `valid: true`, and every engine then
  refuses the program. The UAAL VM pushes `null` for an `EXEC` with no handler, so a missing host
  ends the run as a success (task so3q). 70 `.hsplus` files in `packages/absorb-service/src` call
  undeclared host functions.
- **Scope/blast:** proposal
  [`Host_Capability_Imports_v1.md`](../../proposals/Host_Capability_Imports_v1.md): `holo:<name>`
  names a capability module declared in `.hs` and embedded in the checker; named imports only;
  codes `HS-HOST-001`–`005`; a call lowers to a UAAL `EXEC` bound per service; permission by
  import list, a run switch and the agent's frame (after G15). First proof: HoloAbsorb's manifest
  audit, with no network. Measured breakage: none (no tracked file imports from `holo:`).
- **STATUS — PHASE 1 BUILT, in review (2026-09-29; board task chz8).** The checker reads
  `holo:` imports against the embedded `holo:absorb` declarations (`HS-HOST-001`–`004`, and
  `HS-SCOPE-001` for a local stand-in); `.hsplus` documents send their holo imports and each
  document's are checked once. Engines refuse a Holo call by name; phase 2 binds it on UAAL.

---

## What is explicitly NOT a gap

- `.holo` spatial pipeline (G1) — built and tested; do not "rebuild."
- The aspirational ISA (`OP_BECOME_SENTIENT`, `OP_COLLAPSE_WAVEFUNCTION`, multiversal/timeline
  ops) — quarantined in the spec; not a build target.
- The uaal/holo-vm _runtimes_ themselves — they exist; the work is the **front-end bridge**
  (G3/G4/G5), not the VMs.

## Sequencing

**G3 → G4 → G5** is the spine: wire the real grammar into the cognitive VM, expose it on the
CLI, then join cognitive ⇄ spatial. **G6** runs in parallel in the grammar repo. **G7** is the
cheap gate that stops regression. Each is a single buildable slice with a falsifiable e2e test —
the discipline the paper program never applied to the formats themselves.
