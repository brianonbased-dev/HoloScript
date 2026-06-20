# HoloScript Idea Seeds

> Ideas with future value that are deliberately not being pursued now.
> Format: Title · What might be valuable · Why not now.
> Add seeds here rather than letting ideas evaporate when work is deferred or sequenced out.

---

## Resurrect Apex-Poison Compilers as Fire-and-Forget Export Targets

**What might be valuable**: R3FCompiler, BabylonCompiler, PlayCanvasCompiler, ThreeJSCompiler, ARCompiler, VRRCompiler, Native2DCompiler, PhoneSleeveVRCompiler, and FlatSemanticCompiler were retired from the DialectRegistry and MCP surface (2026-06-17) because they duplicate the native runtime and constitute apex-poison substrate for agents. However, a one-way fire-and-forget export path (an author writes `.holo`, compiles once to `.tsx`/`.ts`/`.html`, and never debugs the output) could serve specific handoff scenarios: embed a HoloScript scene on a legacy web page, export a Babylon.js snapshot for a partner, or ship a WebXR demo without the full HoloScript runtime. If agents are structurally prevented from reading or editing the generated output (enforced by CI), the poison axis disappears.

**Why not now**: The native runtime + trait-parity backlog must close first — once `.holo` scenes run natively in the browser without any compilation to `.tsx`, the only legitimate use case for re-admitting these compilers is the fire-and-forget one-off export. That requires (a) the `@generated DO NOT EDIT` enforcement gate to be airtight for these targets, (b) agents to have no tooling path that returns the generated code into the editing loop, and (c) a clear product need that the native renderer cannot satisfy. None of these preconditions are met yet. Re-admission should be re-evaluated after the BrowserRuntime noop graduation work (see seed "Promote Noop Traits") is complete.

---

## SpacetimeDB Single-Source Compile Target (`@spacetimedb_module`)

**What might be valuable**: One `.holo`/`.hs` source compiling to a SpacetimeDB Rust WASM module (server reducers + table definitions) + TypeScript client subscription SDK simultaneously with the Colyseus/mmo-server targets. SpacetimeDB is the closest industry analogue to HoloScript's single-source authority-split vision — all game state lives in a distributed relational DB, reducers are transactional triggers, and persistence is zero-configuration. The `@reducer` annotation already proposed in `.hs` maps cleanly to SpacetimeDB's reducer model; the `@replicated` fields map to SpacetimeDB table columns. A true multi-backend emit (Colyseus + SpacetimeDB + sovereign mmo-server from one source) would be a uniquely strong PLDI/OOPSLA paper contribution.

**Why not now**: Requires a Rust code-generation backend that does not exist anywhere in HoloScript. No HoloScript compiler currently emits Rust. The existing `compiler-wasm` target is a Rust front-end *parser*, not a Rust code *generator* from `.holo` source. Building a Rust codegen backend is a 6+ month effort independent of all other MMO round-2 work. Prerequisite: settle the authority annotation model (`@server_side/@replicated/@reducer`) against the Colyseus and `mmo-server` targets first (rounds 2-3), then map that settled model to SpacetimeDB Rust emit in round 5+.

---

## Cross-Host Multi-Shard Player Handoff (`world_shard` at production scale)

**What might be valuable**: The `world_shard` language primitive with `shard_edges` and `handoff_type: seamless` declares cross-shard player migration as a first-class `.holo` concept — including TrustReceipt-sealed handoff envelopes and anti-cheat position sanity checks on the `on_shard_transfer` event block. At production scale this enables EVE-style single-world MMOs partitioned across many Colyseus processes with tamper-evident, auditable player migration. The receipt-sealed handoff is a novel publishable claim (AAMAS '27 multi-agent trust track).

**Why not now**: Cross-host handoff requires runtime infrastructure that does not yet exist: an external session broker, a Redis-backed presence layer for in-flight message replay, and a cross-process WebSocket redirect protocol. The compiler can emit `ShardRegistry JSON` and `on_shard_transfer` TypeScript today, but the handoff will silently drop the player without the broker service. Round 2 scope: same-machine multi-room only (Colyseus relay). Cross-host is round 4+, after the `mmo-server` sovereign target and a deployed multi-room presence layer exist.

---

## Codebase GraphRAG Pre-Search in `rag_query` (`queryCodebase` cognitive verb)

**What might be valuable**: Before the agent's main tool loop, the `rag_query` cognitive verb could pre-search the HoloScript codebase graph (HoloEmbed index via `POST /api/holomesh/codebase/search`) and inject relevant symbol definitions, call sites, and file locations into the system prompt. For desktop/cloud coding agents working on HoloScript source, this gives the agent a symbol-level map of the code before it starts calling `read_file`. The dep (`queryCodebase`) is already wired in `HolomeshClient` and was previously the second stage of `rag_query`.

**Why not now**: On the Jetson edge agent (the active target), the HoloEmbed graph is never loaded — `queryCodebase` returns `[]` on every call, making it dead weight per tick. The new grep + Absorb two-stage design (W.754) is tighter for the edge case. Revive `queryCodebase` as a third stage (after grep and Absorb) when a desktop/cloud agent variant with a warm HoloEmbed graph becomes the primary target. The method and dep slot are preserved; just unwire from the `rag_query` chain in `cognitive-verbs.ts`.

---

## Cross-File `ProvenanceBoundsChecker` (compile-time proof obligations across imports)

**What might be valuable**: The `@provably_bounded` composition annotation with a cross-file `ProvenanceBoundsChecker` gives a typed proof that exploit classes (speedhack, dupe, range-exploit, info-leak) are structurally impossible in the emitted server artifact — checking not just the root `.holo` file but all imported `.hs` ability declarations and `.hsplus` brain blocks for missing `@authority_envelope`, `@movement_contract`, and `@receipt_on` annotations. This is the full "Verifiable Anti-Cheat by Construction" paper claim and the D.044 Minab structural-impossibility principle applied to MMO. It makes `@provably_bounded` a hard compile error, not a lint warning.

**Why not now**: Cross-file constraint checking requires a symbol table and cross-file scope resolution that do not exist in HoloScript today. `ImportResolver.ts` exists but produces per-file parse results, not a single merged symbol table. Round 2 delivers `@provably_bounded` as a single-file lint warning (extend `EffectChecker`). The full cross-file checker, with ability-declaration and zone-declaration coverage, requires the symbol table infrastructure that is a round 3-4 compiler investment. The paper claim is scaffolded in round 2; the hard guarantee ships in round 3-4.

---

## Promote Noop Traits to Full BrowserRuntime Handlers (trait parity graduation)

**What might be valuable**: 78 traits are currently classified as no-op in `TRAIT_NOOP_MANIFEST.json` because they have no `TraitSystem.register()` handler in BrowserRuntime. Many of these (e.g. `chain`, `crowd_sim`, `soft_body_pro`, `gaussian_splat`, `ambisonics`, `hrtf`, `bloom`, `orbit`, `follow`, `data_binding`, `sensor`) represent real runtime behaviors that could run in the browser given handler implementations. Graduating them one-by-one converts the manifest from a classification list into a shrink-toward-zero ratchet — the same pattern used for the render-surface allowlist. Each graduation is also evidence that R3FCompiler output is provably load-bearing on that trait, informing which compiler branches can safely retire vs. which must be preserved in a native compiler.

**Why not now**: BrowserRuntime is the Three.js runtime, not the canonical forward-looking runtime (that is the native `.holo` path via HoloScript's own engine). Adding handlers here grows the legacy surface rather than burning it down. The interlock is the parity gate itself: once it is green (all 101 traits classified), the R3FCompiler retirement sequencing can begin — and the correct action for each noop trait is to decide whether it needs a native handler or whether its semantics are subsumed by the new compiler target. The graduation work should happen in the context of that retirement plan (research/2026-06-15_trait-parity-and-tsx-deprecation.md), not as isolated BrowserRuntime additions.

---

## Trait-Backed Cognitive Verb Dispatch in AgentRunner (Phase 2.2 — `recall`/`rag_query`/`plan`)

**What might be valuable**: Fleet agents that author `recall { query: "…" }`, `rag_query { query: "…" }`, and `plan { goal: "…" }` in their `behavior on_task {}` block would have those verbs dispatched to real trait-backed stores — `AgentMemoryTrait` (per-agent episodic memory), `RAGKnowledgeTrait` (the HoloMesh knowledge graph), and `GoalOrientedTrait` (GOAP A*-planner) — before the main `llm_call` loop fires. The effect: agents load prior task context, HoloScript syntax rules, and a structured plan into the LLM's context window, replacing the current hardcoded single-prompt approach. This closes the last "declarative shell" gap (W.712) for the three memory/planning verbs, making `behavior on_task` fully executable end-to-end. The event wiring already exists: `CognitiveActions.ts` has the verb→event map; `BehaviorTreeTrait.tickCognitive` can dispatch each verb; `LocalLLMTrait._chat` is the execution endpoint. The missing piece is an `AgentRunner`-compatible execution context that carries an event bus + the relevant trait instances without pulling in the full engine runtime.

**Why not now**: The two existing cognitive executors (`HoloScriptAgentRuntime` and `BehaviorTreeTrait.tickCognitive`) are engine-coupled — they require a full `VRTraitSystem` event bus, a `HoloScriptRuntime` tick, and registered trait instances. The `holoscript-agent` runner is intentionally lightweight (no engine dep), so adding engine traits creates a dependency inversion. The clean fix (Phase 2.4, per `research/2026-06-16_jetson-native-language-runtime-plan.md`) is to converge on ONE brain executor: fold the runner's signed board client + cost-guard into callable runtime actions the brain's BT can invoke, then let the engine BT drive the loop. Until that convergence, `recall`/`rag_query`/`plan` are parsed, logged, and deferred. `llm_call.prompt` and `reflect` ARE wired in Phase 2.1 (this session).

---

## `@durable/@ephemeral/@session` Brain Fields with Postgres SQL Emission

**What might be valuable**: Field-level lifecycle annotations on `.hsplus` brain blocks that the compiler maps to: `@durable` → Postgres/Supabase column (survives shard restart), `@ephemeral` → in-memory only (discarded on view-distance exit), `@session` → merged back to durable via episode-delta on map-exit. The compiler statically verifies that `@ephemeral` fields are never referenced in `@durable` migration blocks — a class of NPC runtime NPE bugs made impossible at compile time. This is the first language-level expression of D.043's disposable-neural-map design. Combined with `MigrationManager` chain wiring, this gives zero-boilerplate schema evolution for NPC state. A publishable type-system result: "Lifecycle-Typed NPC State for MMO-Scale Neural Characters."

**Why not now**: No database connection infrastructure exists in any ColyseusCompiler emitted artifact today — no ORM, no connection pool, no migration runner. The `MigrationManager.ts` exists in TypeScript but is never called from any compiler output. Round 2 ships the `@durable/@ephemeral/@session` annotations parsed and tracked in the AST, and the compiler emits a stub `IPersistenceBackend` interface with TODO comments. The Postgres SQL emit and ORM wiring are round 4, after the `mmo-server` sovereign target is stable and a deployment topology (Railway per-shard Postgres) is established.

---

## UGC / Player-Authored `.holo` World Content + `UGCCompiler`

**What might be valuable**: HoloScript is a spatial computing language — player-authored world content is its most natural differentiator over Unity/Unreal. A `@ugc_zone` block and a `UGCCompiler` that enforces D.044 Minab safety envelopes on player-authored `.hs` ability declarations would make "community-built MMO zones" a structural language property rather than a moderation problem. The Marketplace MCP tools (`conformance_admit_artifact`, `conformance_check_artifact`) already exist as the admission gateway. The `@provably_bounded` checker applied to UGC content would make it impossible for a player to author an exploit via a submitted `.hs` file — the compiler rejects it before admission.

**Why not now**: Requires `@provably_bounded` cross-file checker (deferred above), a sandbox permission model for server-side UGC execution, a content moderation pipeline for LLM-generated NPC dialogue, and a clear policy for what server-side UGC can and cannot do. None of these exist yet. This is a post-round-3 feature that builds on the settled authority type system and the stable `@provably_bounded` lint infrastructure.

---

## MMO Load Testing and Balance CI via Fleet Sim (`BotSwarmCompiler`)

**What might be valuable**: A `@balance_test` block in `.hs` and a `BotSwarmCompiler` target that dispatches bot-player swarms via `sim_run_paid` / fleet infra for automated: load testing (spawn N bot players, verify server tick stays under budget), game-balance CI (run 10,000 simulated combat encounters, assert damage distribution within design envelope), economy regression testing (simulate 30 days of player activity, verify gold supply within inflation bounds), and fuzz testing of ability interactions (random cast sequences, assert no invalid state reachable). The fleet sim infrastructure already exists (`sim_run_paid`, `render_world_on_fleet`). This would give every dimension a testability primitive and supply the benchmark data required by I.007 Lotus Genesis and D.010 paper program.

**Why not now**: Requires the MMO server loop to not be a stub — a `BotSwarmCompiler` that sends moves to a Colyseus Room whose `onTick()` is a comment produces no useful benchmark. Round 2 closes the stub gap. Round 3 wires the first balance test block once real ability/combat lowering exists. Bot swarm fleet dispatch via `sim_run_paid` requires a Colyseus-compatible fleet endpoint that does not yet exist (current `sim_run_paid` targets physics solvers, not game-server sessions).

---

## `@spacetimedb_module` + Rust Reducer Codegen (Long-Horizon)

*(Duplicate entry for cross-reference — see first entry above. This seed is the lowest-priority / longest-horizon item in the MMO roadmap.)*

---

## AgentSeed Runtime Binding for Server NPC Brains (P1.5 full)

**What might be valuable**: The MMO brain runtime (shipped 628e1b71f) emits structural `onBrainHydrate(npc)`/`onBrainMerge(npc)` lifecycle hooks on NPC spawn/despawn, but they are no-op stubs. Binding them to the real `AgentSeed` + `HoloScriptAgentRuntime.hydrate()` API (`packages/core/src/HoloScriptAgentRuntime.ts`) would give MMO NPCs **persistent, substrate-anchored memory**: an NPC hydrates its durable identity/episode memory from a seed on spawn (entering view distance) and merges new episodes back on despawn (leaving view distance) — the D.043 disposable-neural-map lifecycle running per-NPC at MMO scale. Combined with the LOD-gated LLM brain (P1.4), a Jetson-backed NPC could remember prior player interactions across sessions. Distinct from the "lifecycle-typed brain fields with Postgres emit" seed (that is the field-level `@durable/@ephemeral` type system; this is the runtime hydrate/merge binding).

**Why not now**: `HoloScriptAgentRuntime`/`AgentSeed` is the heavyweight agent-identity substrate — wiring it into a lightweight generated Colyseus game-server is a real integration (serialization format for seed↔NpcState, where seeds persist, episode-merge conflict policy across concurrent shards, perf budget of hydrate on every view-distance crossing). The structural hooks exist now so the lifecycle is wired; the runtime binding is a round-3+ integration after the persistence topology (P2.8 / `@durable` Postgres emit) is settled.

---

## `@server_only` ServerAuthorityBundleSplitter (P2.0 — cross-file authority split)

> **STATUS: SHIPPED 2026-06-16 (commit `100b1838b`).** The cross-file symbol table
> (`packages/core/src/compiler/authority/AuthoritySymbolGraph.ts`), the
> `ServerAuthorityBundleSplitter` (`splitServerAuthority` → server bundle + client
> SDK + static proof), the Colyseus authority manifest, and the cross-file
> `ProvenanceBoundsChecker` upgrade (P2.12) all landed together. 34 tests green.
> Kept here as the design record. **Next steps on top of it**: register
> `mmo-server` / `mmo-client-sdk` as first-class SOVEREIGN compile targets (the
> splitter is currently a library function, not an `ExportTarget`); surface the
> proof via an MCP tool / a compile-time error in `CompilerSafetyPass` L9; emit a
> typed client message/subscription SDK (not just the stripped schema).

**What might be valuable**: The MMO round-2 compiler emits a single authoritative Colyseus server. The endgame of the single-source-netcode thesis (memo §4, PLDI '27 paper claim) is to compile ONE `.holo`/`.hs` source into TWO bundles — an authoritative `mmo-server` and a predicting `mmo-client-sdk` — with a **static proof that `@server_only` symbols are unreachable from client-bundle code**. That makes "the client cannot even see the loot-roll RNG / the boss-phase thresholds / the server validation logic" a compile-time guarantee, not a convention — the strongest form of the verifiable-anti-cheat-by-construction claim. The authority annotations (`@server_side`/`@client_side`/`@replicated`) already parse; this is the pass that consumes them to partition the symbol graph and bundle-split.

**Why not now**: A sound server/client split requires a **cross-file symbol table + reachability analysis** that HoloScript's compiler does not have yet — `ImportResolver` produces per-file parse results, not a merged symbol graph with def/use edges. Round-2 shipped the structural pieces (authority annotations parsed, single-server emit, `ProvenanceBoundsChecker` single-file lint). The cross-file `@server_only`-unreachable-from-client proof is the same round-3-4 symbol-table investment the cross-file `ProvenanceBoundsChecker` needs (see that seed) — build the symbol table once, and both the bundle splitter and the cross-file provability checker land on top of it.

---

## Cloud BotSwarm — distributed load/balance against a Colyseus endpoint (P2.11)

> **STATUS: $0 LOCAL PATH SHIPPED + PROVEN LIVE 2026-06-16 (commit `6bb596c52`).** The
> earlier "needs a hosted endpoint / crosses the vast.ai spend gate" framing was wrong
> — the laptop + Jetson are $0 persistent compute. Investigating revealed the real
> blocker: the emitted Colyseus server was never network-runnable (its `onMessage`
> override clobbered colyseus's registration API; `createColyseusServer` never
> listened). Both fixed. `runNetworkBots` (real colyseus.js WebSocket driver) +
> `scripts/mmo/bot-swarm-local.mts` (local runner) shipped. **Proven live on the
> laptop (colyseus 0.15.57): 16/16 bots held; 254/800 speedhacks + 784/800 spam-casts
> rejected over a real socket.** Remaining is OPTIONAL cloud/multi-node scale-out (only
> THAT touches spend) — moderate scale already runs free on the Jetson over LAN.

**What might be valuable**: The in-process `BotSwarmCompiler` (shipped `d30fa24cb`) drives a bot swarm against the generated Room by calling its methods directly in one Node process. The cloud increment runs the swarm at real scale: deploy the ColyseusCompiler-emitted server to a reachable Colyseus endpoint, point N distributed WebSocket bot drivers at it, and merge the per-shard `BalanceReport`s into one fleet report. That turns the harness into true game-balance CI at MMO scale (spawn 500+ bots across nodes, assert server tick stays within the `@balance_test` envelope, replay damage/economy distributions) and produces the benchmark data the paper program needs (D.010 / I.007).

**What's already built** (so the next agent starts from the right place): prerequisite (D), the report aggregator, shipped 2026-06-16 — `mergeBalanceReports(reports)` is now exported by the emitted harness (`packages/core/src/compiler/BotSwarmCompiler.ts`): counts sum, ticks max, `avgTickMs` tick-weighted. The GPU fleet substrate also exists: orchestrator `POST /gpu/workload` queue, the `buildWorldRenderWorkload()` dispatch pattern (`packages/mcp-server/src/world-render-tools.ts`) to copy for a `buildBotSwarmWorkload()`, and the `checkSpendAuthz` spend-gate framework.

**DONE — the $0 local path (2026-06-16, `6bb596c52`)**:
1. ~~Persistent endpoint~~ → `startColyseusServer(port)` runs the emitted authoritative server on the laptop or Jetson (a real `gameServer.listen`). The fire-and-done GPU job model was never needed for the local path; a long-lived Node process IS the endpoint.
2. ~~WebSocket bot driver~~ → `runNetworkBots(opts)` connects over real `colyseus.js`, drives legal+adversarial load, and counts server-pushed `reconcile`/`cast_rejected` anti-cheat signals into a `BalanceReport`. `mergeBalanceReports` merges shards.
3. Local runner `scripts/mmo/bot-swarm-local.mts` ties it together (compile → listen → swarm → report). Proven live (16 bots, real socket, 254+784 rejections).

**What remains (OPTIONAL, only this touches spend)**:
- **Multi-node / cloud scale-out** — to exceed one box (500+ bots): run the server on one node and `runNetworkBots` from several (laptop + Jetson over LAN is still **$0**; only renting cloud GPUs via `buildBotSwarmWorkload()` + `checkSpendAuthz` crosses the spend gate). A `buildBotSwarmWorkload()` dispatcher (~100 LOC, model on `buildWorldRenderWorkload`) would queue distributed drivers onto `POST /gpu/workload` and collect+merge their reports.
- **HoloCI gate** — wire the local runner into HoloCI as a balance-regression check (assert `assertBalance(report)` stays empty across releases).

**Why the remainder waits**: only true cloud scale (rented GPU) is founder-spend (Tier-1); the local + LAN path is done and free. Reopen scale-out when 500+-bot numbers are actually needed for a paper benchmark (D.010 / I.007), or wire the HoloCI gate whenever balance-regression coverage is wanted.

---

## `hs:perceives` Derived Spatial-Perception Edges in the Semantic Scene Graph

**What might be valuable**: A post-pass over the assembled `SemanticSceneGraph` that, for every agent-anchored NPC (now carrying `hs:locatedAt` from `npc.position` and `hs:hasAgency` from its `AgentBrainAttachment`, shipped 2026-06-16 `9da672bd3`), emits `hs:perceives` edges to the other scene nodes within the agent's perception range / field-of-view / line-of-sight. This makes "what can agent X perceive from where it stands" a queryable, offline graph fact — enabling save/restore of AI-inhabited worlds, static reasoning about agent knowledge, and the multi-agent spatial cross-verification backlog (`P.XR.05` in `LLMAgentTrait.ts`, which guards against hallucination-induced state divergence in multi-user VR). The `PerceptionTrait` (FOV cone, hearing, proximity, confidence decay, LOS) already computes exactly this at runtime — the seed is to lift it into the IR-level graph as a derived edge.

**Why not now**: `convertNPC` serializes one node at a time and has no visibility into the positions of OTHER scene nodes, so perception (an inherently relational, all-nodes-at-once computation) cannot be emitted there. It needs a separate graph post-pass that runs after every node has been positioned — plus a decision on the perception model to bake in (range-only vs FOV-cone vs full LOS raycast against scene geometry). The single-node anchoring (`hs:locatedAt` + agency edges) shipped first because it is purely additive and unblocks the common case; the relational perception edge is the natural round-2 follow-up once a graph-query post-pass exists.

---

## Thinking-Budget Control for Local LLM Inference (`HOLO_LLM_LOCAL_THINK` / `think:false`)

**What might be valuable**: Ollama's `think: false` API parameter is intended to suppress extended reasoning in thinking-class models (qwen3, Gemma 4, etc.) — trading answer quality for latency and token cost. On constrained hardware (Jetson Orin Nano, 8 GB shared RAM), a full thinking pass can generate 1,000–5,000 tokens of reasoning before the actual reply, adding 60–300 seconds to a single LLM call. A working `think: false` path — or a per-request `num_ctx`-bounded thinking budget — would halve Tier-0 inference latency without model replacement and is the clean solution to the Jetson timeout risk described in W.735.

**Why not now**: Confirmed 2026-06-16 that Ollama 0.30.8's `think: false` disables the decode-time grammar mask that drives structured JSON tool calls (same root cause as Ollama #15260 / vLLM #39130). Setting `think: false` causes qwen3:4b to emit prose instead of `tool_calls` JSON — the agent loop cannot complete. The proper fix (Ollama upstream: separate the thinking-suppression path from the grammar mask so both can be set independently) is not yet in any released version. Workaround: `/no_think` in the system prompt reduces thinking tokens moderately without breaking tool calls. Revisit when Ollama ships a version where `think: false` + tool-schema do not conflict.

---

---

## Per-Soul Fine-Tuned Downloadable GGUF (Daimōn HoloTune Target)

**What might be valuable**: The D.053 endpoint — a per-soul fine-tuned model the owner can download and run locally. Each daimōn would ship as a GGUF artifact keyed to one soul's accumulated ContextDelta corpus: the companion as a sovereign, transferable artifact rather than a tenant of fleet servers. Built via HoloTune on the per-soul trace corpus (owner-scoped ContextDeltas accrued through the emergence lifecycle). Base candidates are `granite4:1b` (smallest runnable tool-caller, CPU-viable) and `qwen3:4b-instruct` (proven Hermes parser, Jetson-comfortable). The per-soul GGUF realizes "capability without dependency" (U.002) at the model level — the guide follows the owner even if every server goes dark.

**Why not now**: Three hard prerequisites are all unmet. (1) The emergence substrate needs to accrue a meaningful per-soul ContextDelta corpus — no corpus, no training signal. (2) HoloTune (D.086) must reach the per-soul fine-tune phase (currently producing team-level traces, not owner-scoped ones). (3) Per-soul GPU spend is gated on P.004 token-volume threshold — a financial and governance gate the founder must clear. Current posture: `daimon-brain.hsplus` runs on `qwen3:4b-instruct` as an honest placeholder; `holotune_status` flips to `"live"` when all three gates pass.

---

## Edge `recall` Write-Loop + Phase 2.3 Brain Directives (`@provider_policy` / `@escalation` / `@goal`)

**What might be valuable**: Two follow-ons to the Phase 2.2 edge cognitive-verb wiring (shipped
`@holoscript/holoscript-agent@2.0.4`, HoloScript `d27ea730e` — `recall`/`rag_query`/`plan` now execute
provider+mesh-only on the AgentRunner). (1) **Close the `recall` loop**: on `markDone`, `POST
/api/holomesh/knowledge/private` a short fact about the completed task, so the NEXT tick's `recall`
retrieves it. Today `recall` returns 0 because nothing ever WRITES the agent's private workspace —
closing this makes `recall` meaningful and gives the edge agent lightweight cross-tick continuity (the
edge-native version of the System-A `AgentSeed`/`durable()` continuity anchor from the Jetson plan).
(2) **Phase 2.3 brain directives**: wire `@provider_policy {prefer,fallback}` into the runtime LLM
router (local-first → escalate-to-fleet, read from the brain instead of `model-policy.ts` hardcodes),
`@escalation {on,action}` into a runtime action on task-failure, and `@goal {name,desiredState,priority}`
into the goal feed — all currently PARSE but execute nowhere (W.744 declarative-shell; plan §Phase 2.3).

**Why not now**: Phase 2.2 (the verbs EXECUTING) was the higher-leverage layer and is a complete,
shipped, proven unit — a good checkpoint. The write-loop is a small, clean next increment but is its own
build+test+publish cycle; Phase 2.3 (`@provider_policy`/`@escalation`/`@goal`) is larger and partly
overlaps the core/engine router, so it needs a decision on edge-native vs core routing (the same
dep-closure constraint that shaped Phase 2.2). Sequence: write-loop first (smallest, completes `recall`),
then 2.3. Plan: `research/2026-06-16_jetson-native-language-runtime-plan.md`.

---

*Last updated: 2026-06-15 from MMO round-2 research memo (`research/2026-06-15_mmo-next-round-advancement.md`). Seeds added: SpacetimeDB target, cross-host shard handoff, cross-file ProvenanceBoundsChecker, lifecycle-typed brain fields with Postgres emit, UGC/player-authored .holo content, fleet-sim balance CI. 2026-06-16: hs:perceives derived spatial-perception edges (from .holo agent-anchoring work); thinking-budget control for local LLMs (from Jetson qwen3 investigation); per-soul fine-tuned downloadable GGUF for daimōn (from daimon-brain.hsplus authoring); edge recall write-loop + Phase 2.3 brain directives (from Phase 2.2 cognitive-verb wiring).*

---

## Deploy-Safe Apex-Poison Retirement (studio still depends on R3FCompiler)

**What might be valuable**: Completing the parked "apex-poison retirement" — removing the unused web/VR
bridge compilers (Babylon, ThreeJS, PlayCanvas, VRR, AR, MultiLayer) from the `@holoscript/core` public
barrel, MCP tool surface, ANS namespace, dialect registry, and tool-scopes. The refactor is ~95% done in
the working tree: source files retained (de-promote, not delete), MATERIAL_PRESETS/ENVIRONMENT_PRESETS
extracted into `scene-presets.ts`, R3FNode/SceneIRNode into `scene-ir-types.ts`, the `check-trait-parity`
retirement interlock green (101 traits), 231 compiler tests green, core+mcp-server builds green. Shrinks
the promoted compiler surface to the sovereign/maintained set.

**Why not now**: It is DEPLOY-UNSAFE as the peer left it (W.789). `R3FCompiler` was included in the
retirement, but **studio (a deployed Next.js service) imports `R3FCompiler` from the `@holoscript/core`
barrel in 3 files** — `app/shared/[id]/ImmersiveViewer.client.tsx`, `hooks/useCompiler.ts`,
`hooks/useScenePipeline.ts` — as its active scene renderer. Dropping `R3FCompiler` from the barrel makes
the studio build fail (verified: `R3FCompiler` is `undefined` in the rebuilt dist barrel), which bricks
the studio deploy from the shared monorepo build. Two deploy-safe paths, pick one: (a) **retire all-but-R3F**
— keep `R3FCompiler` exported from the barrel since studio uses it, retire only the genuinely-dead five
(they have no real cross-package consumers; the video-tutorials hits are string literals in code examples);
or (b) **migrate studio off R3F** onto the sovereign WebGPU renderer first, then retire R3F too. (a) is the
small, immediate win; (b) is the strategic end state. The build-breaking MATERIAL_PRESETS duplicate is
already fixed (1-line, owned by MaterialTrait) in the parked WIP.
