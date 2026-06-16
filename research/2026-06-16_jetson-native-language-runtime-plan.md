---
doc_tier: research
research_phase: base
status: active
last_verified: 2026-06-16
canonical_for: jetson-native-language-runtime-plan
supersedes: ../../.ai-ecosystem/research/2026-06-16_native-holoscript-agent-infinity-loop.md (corrects its assumption that the AgentRunner loop executes brain behaviors — it does not; note two cognition executors DO exist in core but are not driven by that loop — see the verified Correction in the Appendix)
---

# Jetson Native-Language Runtime — Build-Out Plan

**Date:** 2026-06-16 · **Author:** claude (full-surface) · **Trigger:** founder —
> "clean up holoscript and pretrained behavior and plan to build out the language so all the
> jetson needs to consume are the npm and pypi packages then all we need are .hs .hsplus and
> .holo files."

## Target architecture (the founder's vision, stated crisply)

A Jetson (or any edge node) becomes a HoloScript agent by:

```
npm  i -g @holoscript/<runtime>         # the JS runtime + brain executor
pip  install holoscript-edge            # the device-side runtime (Ollama, board, monitor, ROS2)
# + a folder of .hs / .hsplus / .holo files   ← the agent's behavior, identity, scenes, logic
```

Nothing bespoke. No hand-written `agent.py`. No behavior baked into a compiler. To change what
the agent **does**, you edit a `.hsplus`. To change the **runtime**, you `npm update` / `pip
install -U`. The behavior is the source files; the packages are the interpreter.

## Ground truth (verified on disk 2026-06-16, file:line-cited)

Three parallel audits established what is actually true, not what the docs claim.

### A. The distribution layer is *mostly* there (npm)

| Package | version | publishable? | runs a brain? |
|---|---|---|---|
| `@holoscript/core` | 8.0.8 | ✅ public, **bin `holoscript`** | `holoscript run` (BT only, **no LLM**); `holoscript daemon` (LLM, but see below) |
| `@holoscript/cli` | 8.0.9 | ✅ public, bin `holoscript`/`hs` | wraps core |
| `@holoscript/engine` | 6.1.3 | ✅ public | BT runtime (hard-deps `three`+`snn-webgpu` — GPU risk on headless) |
| `@holoscript/llm-provider` | 1.2.1 | ✅ public | LocalLLMAdapter → Ollama |
| `@holoscript/holoscript-agent` | 2.0.1 | ❌ **`private:true`** | **`holoscript-agent run <brain>` — the ONLY real autonomous brain+board runtime, first-class `--provider local-llm`** |

- The **autonomous-brain runtime exists and is built** (`holoscript-agent`, env `HOLOSCRIPT_AGENT_PROVIDER=local-llm` + `…_LOCAL_LLM_BASE_URL`/`…_MODEL`) — but its package is `private:true`, so it is **not npm-installable**. The `2.0.1` on the registry is a stale pre-flag artifact; a fresh `pnpm publish` refuses it. **This is the single highest-leverage gap.**
- `holoscript daemon` (the only npm-installable LLM loop today) is the **code-self-improvement** daemon: it requires a git repo (`findGitRoot`) and iterates a hardcoded focus rotation (`typefix/coverage/lint/target-sweep/…`, [holoscript-runner.ts:1986](packages/core/src/cli/holoscript-runner.ts)) and `--commit`s code. It is **not** a general "run my brain's tasks" loop.

### B. The language layer is *mostly a declarative shell* (the deeper gap)

Audit of parse-site vs runtime-execute-site for every edge/agent construct:

| Construct | parses at | executes at | shell? |
|---|---|---|---|
| `@safe_daemon` | HoloScriptPlusParser.ts:3100 | **desugars → 5 real traits** (rate_limiter/circuit_breaker/timeout_guard/economy/structured_logger), engine-ticked | **NO — wired** |
| cognitive verbs `llm_call`/`recall`/`rag_query`/`plan`/`reflect` | HoloScriptPlusParser.ts:3158 → `brainState.cognitiveActions` | dispatch (`compileCognitiveDispatch` → `BehaviorTreeTrait.tickCognitive`) **works, but only for a hand-authored `@behavior_tree{root:{type:'cognitive'}}` node.** The `state{ llm_call {} }` surface → `cognitiveActions` reaches **nothing**. | **HALF — the two halves are never connected** |
| `@provider_policy {prefer,fallback}` | HoloScriptPlusParser.ts:3079 | only `ColyseusCompiler.ts:825` (codegen) — **no runtime reads it** | **YES** |
| `@escalation {on,action}` | HoloScriptPlusParser.ts:3070 | **nothing** (tests only) | **YES** |
| `@goal {name,desiredState,priority}` | HoloScriptPlusParser.ts:3056 | **nothing** (tests only) | **YES** |
| brain `behavior on_task`/`on_tick`/`on_start` | **does not parse as a brain behavior at all** — `loadBrain` truncates the prompt at the `behavior ` token ([brain.ts:41](packages/holoscript-agent/src/brain.ts)) | **nothing** — the TS `AgentRunner` reads identity only + runs a hardcoded `MESH_TOOLS` loop ([runner.ts:59](packages/holoscript-agent/src/runner.ts)) | **YES** |

> **No *autonomous* runtime executes a brain's authored behaviors end-to-end — though TWO cognition
> executors exist and are reached by other paths.** (Corrected 2026-06-16 after the adversarial
> verification pass below — the original "no executor exists" was an overclaim; the file
> `HoloScriptAgentRuntime.ts` was missed.) The two real executors: **(1)** `HoloScriptAgentRuntime`
> ([HoloScriptAgentRuntime.ts](packages/core/src/HoloScriptAgentRuntime.ts) — `think()`→`emit('agent_think')`
> + JEPA `plan()` + `MemoryConsolidator` + `AgentSeed`/`durable()`/`losable()` continuity) is a genuine
> cognition executor, but is only *instantiated* (preallocation pool, [HoloScriptRuntime.ts:420](packages/core/src/HoloScriptRuntime.ts))
> and *reactively* invoked from the `.hs` orb interpreter ([orb-executor.ts:296](packages/core/src/runtime/orb-executor.ts))
> — `drivenByAutonomousLoop: false`. **(2)** Cognitive trait verbs dispatch for real
> ([BehaviorTreeTrait.ts:441](packages/core/src/traits/BehaviorTreeTrait.ts)) but **only** from a
> hand-authored `@behavior_tree{root:{type:'cognitive'}}` node — the `state{ llm_call {} }` →
> `brainState.cognitiveActions` surface ([HoloScriptPlusParser.ts:3166](packages/core/src/parser/HoloScriptPlusParser.ts))
> is never fed into it. The only autonomous loop, `AgentRunner.runForever()`
> ([runner.ts:392](packages/holoscript-agent/src/runner.ts)), references **neither** (zero
> `HoloScriptAgentRuntime` refs in the whole `holoscript-agent` package) and runs a hardcoded
> `MESH_TOOLS` loop. So the jetson brain's `behavior on_task { … }` is still **decoration today** —
> but the fix is *wiring two existing executors into the loop*, not building one from scratch. The
> W.712 declarative-shell pattern holds specifically for `brainState.cognitiveActions`, `@escalation`,
> `@goal`, and `behavior on_task` (all confirmed: no runtime consumer).

### C. The device layer is codegen, not a package (pypi)

- `EdgeCompiler.ts` **emits bespoke Python per-compile** (agent.py, monitor.py, a full colcon ROS2 package, tensorrt_loader, systemd unit, setup.sh) — behavior baked into the compiler, the exact thing being eliminated.
- The deployed result was **401-dead since deploy**: its board client uses an unsigned bearer, wrong URL shape, **no EIP-191 signing** ([board-routes.ts:944](packages/mcp-server/src/holomesh/routes/board-routes.ts) requires it). Stopped + disabled 2026-06-16.
- Existing Python: `holoscript` (PyPI, scientific bridges — *not* an edge runtime), `holoscript-trait-inference` (ML harness), `holoscript-sdk` (cloud client). **No `holoscript-edge` exists — net-new.**
- The declarative seams the compiler *should* read already exist and are ignored: `LocalInferenceTrait.ts`, `EdgeNodeTrait.ts` (`capabilityTags`/`avoidTags`/`escalateOnFailure`).
- A JS edge deploy path exists and should stay JS: `packages/cli/src/edge.ts` (`packageForEdge`/`deployToDevice`/`otaUpdate`).

## Substrate reality (verified audit reference, 2026-06-16)

A whole-file substance audit + an adversarial re-verification pass established what the native agent can
actually build on (vs the marketing surface). Load-bearing for this plan:

- **The local-LLM cognitive path IS correctly wired** (a feared blocker — REFUTED on verification):
  `llm_call` → `llm_prompt` → `LocalLLMTrait._chat` → HTTP to the Ollama endpoint
  ([CognitiveActions.ts:135](packages/core/src/traits/cognitive/CognitiveActions.ts),
  [LocalLLMTrait.ts:229](packages/core/src/traits/LocalLLMTrait.ts)). `LLMAgentTrait` emits `llm_request`
  *outbound* (for an external host) — a different role, not a mismatch. So once the cognitive verbs reach
  the executor, they reach the local model. **The event wiring is not the gap.**
- **The one real cognitive gap is `cognitiveActions` write-only** — Phase 2.1(a) bridge (`8b08e74ec`) is
  layer 1; layer 2 wires it into the BT the loop ticks.
- **The wired cognitive path is the `BehaviorTree` `type:'cognitive'` node** — route the brain's verbs
  through it; don't invent a path.
- **~376 trait handlers are actually registered** ([VRTraitSystem.ts:1595-2103](packages/core/src/traits/VRTraitSystem.ts)),
  out of ~3,082 vocabulary names (~12% wired). The brain may only compose the ~376 real handlers (dispatch
  goes through VRTraitRegistry). Don't author against the full vocabulary.
- **No autonomous loop in core** (`HeadlessRuntime.tick()` = stub; `HoloScriptRuntime` needs an external
  tick) → the Jetson loop comes from the `AgentRunner` (confirms the corrected Phase 2.1 target above).

Off-Jetson-path defects the audit surfaced (verified real, exact fixes available, NOT on this critical
path → board tasks when the mesh recovers): LWWRegister self-comparison tiebreaker (mesh CRDT),
AIDriverTrait wrong-class-under-`@ts-expect-error`, `events` trait unregistered, async-onAttach
fire-and-forget (multi-call-site refactor), compiler-wasm README overclaim (docs-only). Refuted by
verification (NOT defects): the `llm_request`/`llm_prompt` "mismatch" and the AdvancedLighting "stub".

## The build-out, in dependency order

Each phase is independently shippable and ordered so nothing depends on a later phase.

### Phase 0 — Cleanup (DONE this session)
- Broken `holoscript_agent.service` stopped + disabled on the box (files kept, regenerable). Ollama (`qwen3:4b-instruct`) still serving.
- `jetson-orin-brain.hsplus` model corrected `qwen3:4b` → `qwen3:4b-instruct` (thinking variant breaks tool-calls — W.740/W.741); stale `/no_think`+`think:false` comments corrected.

### Phase 1 — Make the autonomous-brain runtime installable (npm) · effort S, leverage HIGHEST
Flip `@holoscript/holoscript-agent` to `private:false` + `publishConfig.access:public`; verify its dep closure (`@holoscript/llm-provider` + `ethers`, both public); **clean-room `npm i -g` + `holoscript-agent run` + `--provider local-llm` against Ollama** (W.669 — install+RUN is the only real gate). Outcome: `npm i -g @holoscript/holoscript-agent && holoscript-agent run brain.hsplus` works from a bare machine. *This alone gives the Jetson a published, signed, board-capable brain runtime today* — independent of the language work below.

### Phase 2 — Wire the language parse→execute path (the shells) · effort M–L, the core "build out the language"
Close each declarative shell so a brain's authored behavior actually runs. Smallest→largest:
1. **Connect `state{ cognitiveActions }` → the working dispatch.** The dispatch (`compileCognitiveDispatch`/`BehaviorTreeTrait.tickCognitive`) already works for a hand-authored cognitive node; bridge the parsed `brainState.cognitiveActions` into it so `state { llm_call {…} }` executes. (Highest value: turns the cognitive verbs from decoration into the agent's mind.)
2. **Add an executable brain `behavior` parse path.** `behavior on_task`/`on_tick`/`on_start` must parse into the brain AST and be invoked by the runtime (today `behavior` is a prompt-cutoff token). Define the execution contract: `on_start` once, `on_tick` per cycle, `on_task` on claim.
3. **Wire `@provider_policy` into the runtime LLM router** (local-first → escalate-to-fleet), reading from the brain instead of `model-policy.ts` hardcodes. `@escalation` → a runtime action on task-failure. `@goal` → feed `GoalOrientedTrait` (`goap_set_state`).
4. **Decide the executor**: extend `holoscript-agent` AgentRunner to *interpret* brain behaviors (vs its hardcoded loop), OR converge on the engine BT runtime as the single brain executor. (One executor — not two shells. Recommend folding AgentRunner's signed board client in as runtime actions the brain's behaviors call.)

### Phase 3 — Build `holoscript-edge` (pypi) + slim EdgeCompiler to manifest-only · effort L
Net-new pip package = the **device runtime, shipped once + versioned** (not regenerated):
`holoscript_edge.{runtime, providers.ollama, board(EIP-191-signed), tools(sandboxed), monitor(tegrastats), accel.tensorrt[extra], cli(serve/install)}` + `[ros2]`/`[isaac]`/`[jetson]`/`[tensorrt]` extras. Then refactor `EdgeCompiler` to emit **only `manifest.json` + the `.hs/.hsplus/.holo` source files** — DELETE the per-compile Python/systemd/setup.sh string emission. The brain `.hsplus` (via `LocalInferenceTrait`/`EdgeNodeTrait`) supplies model/tool-grants/routing; the pip runtime executes it. Fixes the unsigned-board-client 401 (signing lives in the package, once).

### Phase 4 — The brain expresses /infinity natively + the node consumes only packages
Author the jetson brain's autonomous loop as real `behavior`/`state` constructs (now executable post-Phase-2) — the uAA2++ cadence (intake→reflect→execute→compress→grow→autonomize). Deploy by: `npm i` + `pip install holoscript-edge` + drop the `.hsplus`. Verify the full claim→author→reflect→done→CAEL loop runs on-device at $0, driven by the brain — not by codegen.

## Layer ownership (the clean split)

| Concern | Owner | Why |
|---|---|---|
| Brain executor / BT runtime / `holoscript run`/`daemon` | **npm** (`@holoscript/core`+`engine`) | the JS runtime |
| Autonomous brain+board agent loop | **npm** (`@holoscript/holoscript-agent`, once public) | signed mesh client + provider routing |
| Ollama bridge, signed board client, monitor, tools, ROS2/TensorRT | **pypi** (`holoscript-edge`) | device-specific runtime, shipped once |
| Model choice, tool grants, board routing/escalation, action vocabulary, the agent loop | **`.hsplus`** | per-brain policy + behavior (the thing you edit) |
| SSH/OTA deploy orchestration | **npm** (`packages/cli/src/edge.ts`) | already JS, keep |
| EdgeCompiler output | shrinks to **`manifest.json` + source files only** | no behavior in codegen |

## What Remains (out of scope for this plan; tracked separately)
- ContractClause / proof-machinery build-out (`2026-06-16_language-extension-roadmap.md`) — orthogonal language work.
- HoloTune fine-tuning phases (D.086 Phase 1+, GPU-gated).
- Cross-host shard/fleet coordination.

## Excludes (deliberately NOT doing)
- Reimplementing EIP-191 signing in unsigned Python ad-hoc (it belongs once in `holoscript-edge.board`).
- Building the monorepo *on* the 8GB Jetson (ship built JS dist + `npm i`; box RAM is for Ollama).
- A second/third agent loop — converge on ONE brain executor (Phase 2.4).
- New `.tsx` render surface (D.095/D.096 freeze).

## Risks
- **Engine GPU deps** (`three`+`snn-webgpu`) may transitively load on a `--target node` brain run on a headless Jetson — verify a pure `holoscript-agent`/`holoscript run` path avoids them (clean-room install, unverified).
- **Clean-room npm install unverified** — `workspace:` → registry rewrite is inferred from matching published versions, not observed (W.669).
- **Box fragility** — heavy ops OOM the 8GB box (W.735); keep runtime light, Ollama owns the RAM.
- **Phase-2 is real language work** — parser + runtime, peer-hot surfaces (HoloScriptPlusParser, engine); land in small verified layers (W.729).

## Appendix — Phase 2.1 implementation spec (grounded this session)

> **Corrected target (2026-06-16, verified by the adversarial `reconcile-agent-runtime` pass).**
> The "missing link" step 2 below leans toward the `StateMachineInterpreter` — superseded. The
> verified recommendation: **System B (`BehaviorTreeTrait.tickCognitive` + the cognitive trait
> verbs) is the cognitive *execution surface*** (`LLMAgentTrait` already takes a `tools` field →
> `LocalLLMAdapter`→qwen3:4b-instruct slots in; `GoalOrientedTrait` emits a *serialisable* resumable
> plan), and **System A (`HoloScriptAgentRuntime`'s `AgentSeed`/`durable()`/`losable()`) is the
> cross-substrate *continuity anchor*** (no System-B equivalent). The two real Phase-2.1 tasks:
> **(a)** bridge `brainState.cognitiveActions` → the BT `cognitive`-node executor (disconnected
> today); **(b)** make `AgentRunner.runForever` tick that BT instead of its hardcoded `MESH_TOOLS`
> loop. Convergence: retire `think()` as the LLM entry point (→ BT `llm_call{prompt,tools}` nodes);
> demote `JEPAPredictor` to the existing offline `trainJepaOffline()` side-channel; wire
> `AgentSeed.resumeStepId` into the BT tick; keep `MemoryConsolidator`'s 30s tick as the
> episode→fact graduation path written back through `durable()`.

Goal: make a brain `state { llm_call {…}; recall {…} }` actually execute. The dispatch already
works; the materialization does not exist. Pinned to code:

- **Parse side (done):** `HoloScriptPlusParser.ts:3158-3167` → `brainState.cognitiveActions:
  [{kind:'cognitive', verb, config}]`. Confirmed: consumed by NO runtime (only the parser + its test).
- **Execute side (done, but unreachable):** `BehaviorTreeTrait.tickCognitive` (`:429-470`) takes a
  `BTNode` of `type:'cognitive'` (shape at `:25-54`: `{type:'cognitive', verb, config, await?, result_key?}`)
  and calls `compileCognitiveDispatch` (`CognitiveActions.ts:170`) → emits the real trait event. Works,
  unit-tested (`BehaviorTreeCognitive.test.ts`) — but only for a **hand-authored** `@behavior_tree`
  cognitive node.
- **The missing link (to build):**
  1. **Bridge (pure, S):** `cognitiveActionsToBTNodes(brainState.cognitiveActions): BTNode[]` — map each
     `{kind:'cognitive',verb,config}` → `{type:'cognitive',verb,config, await?:config.await, result_key?:config.result_key|result|into}`.
     SSOT alongside `compileCognitiveDispatch` in `CognitiveActions.ts` (export `BTNode`'s cognitive subset
     as a type — it's currently `interface BTNode` internal to `BehaviorTreeTrait.ts:25`, so either export
     it or define a structural `CognitiveBTNode`). **Land WITH its caller — not standalone (no dead code).**
  2. **Materialize brain states → an executor (M, the real work, overlaps Phase 2.4):** brains with plain
     `state{}` blocks are materialized into NEITHER a `behavior_tree` trait nor a `StateMachineNode` today.
     The `StateMachineInterpreter` (engine, wired at `HoloScriptRuntime.ts:506-516` with an `onEntry`/`onExit`
     hook executor + guard evaluator) is the natural target: materialize each brain `state` → a
     `StateMachineNode` whose `onEntry` runs the state's `cognitiveActions` (via the bridge → emit the
     dispatch events) and whose `transitions` map to the parsed `@when` guards. **Decision needed (2.4):**
     state-machine-interpreter path vs synthesize a `behavior_tree` config.root sequence per state. The SM
     path reuses more existing wiring (guards + onEntry already delegated to the interpreter).
  3. **Caller for the executor:** whichever runtime owns the brain loop (per 2.4 — recommend folding the
     `holoscript-agent` AgentRunner's signed board client in as runtime actions the materialized states call,
     so ONE executor runs the brain end-to-end instead of the current two hardcoded loops).
- **Why not landed this session:** peer-hot files (parser + engine), codebase graph (MCP) was down so
  blast-radius couldn't be graph-verified, and a correct executor materialization is a multi-layer change
  best done in small verified layers (W.729) — not a rushed end-of-long-turn edit. Spec'd to de-risk it.

## Anchors
- npm runtime: `@holoscript/holoscript-agent` (`package.json` `private:true` — flip), bin `holoscript`→`packages/core/bin/holoscript.cjs`, `holoscript-runner.ts` (`runScript`:963, `daemonScript`:1795, focus rotation:1986)
- language shells: `HoloScriptPlusParser.ts` (cognitive:3158, @provider_policy:3079, @escalation:3070, @goal:3056, @safe_daemon:3100), `traits/cognitive/CognitiveActions.ts` (dispatch:170), `BehaviorTreeTrait.ts:441` (tickCognitive), `holoscript-agent/src/{brain.ts:41,runner.ts:59}`
- pypi split: `EdgeCompiler.ts` (codegen to shrink), `traits/{LocalInferenceTrait,EdgeNodeTrait}.ts` (declarative seams), `packages/cli/src/edge.ts` (JS deploy path to keep), `packages/python-bindings/` (the existing `holoscript` PyPI sibling)
- the 401 board contract: `board-routes.ts:944` (EIP-191 signing required)
