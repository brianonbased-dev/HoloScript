# HoloScript Idea Seeds

> Ideas with future value that are deliberately not being pursued now.
> Format: Title · What might be valuable · Why not now.
> Add seeds here rather than letting ideas evaporate when work is deferred or sequenced out.

---

## SpacetimeDB Single-Source Compile Target (`@spacetimedb_module`)

**What might be valuable**: One `.holo`/`.hs` source compiling to a SpacetimeDB Rust WASM module (server reducers + table definitions) + TypeScript client subscription SDK simultaneously with the Colyseus/mmo-server targets. SpacetimeDB is the closest industry analogue to HoloScript's single-source authority-split vision — all game state lives in a distributed relational DB, reducers are transactional triggers, and persistence is zero-configuration. The `@reducer` annotation already proposed in `.hs` maps cleanly to SpacetimeDB's reducer model; the `@replicated` fields map to SpacetimeDB table columns. A true multi-backend emit (Colyseus + SpacetimeDB + sovereign mmo-server from one source) would be a uniquely strong PLDI/OOPSLA paper contribution.

**Why not now**: Requires a Rust code-generation backend that does not exist anywhere in HoloScript. No HoloScript compiler currently emits Rust. The existing `compiler-wasm` target is a Rust front-end *parser*, not a Rust code *generator* from `.holo` source. Building a Rust codegen backend is a 6+ month effort independent of all other MMO round-2 work. Prerequisite: settle the authority annotation model (`@server_side/@replicated/@reducer`) against the Colyseus and `mmo-server` targets first (rounds 2-3), then map that settled model to SpacetimeDB Rust emit in round 5+.

---

## Cross-Host Multi-Shard Player Handoff (`world_shard` at production scale)

**What might be valuable**: The `world_shard` language primitive with `shard_edges` and `handoff_type: seamless` declares cross-shard player migration as a first-class `.holo` concept — including TrustReceipt-sealed handoff envelopes and anti-cheat position sanity checks on the `on_shard_transfer` event block. At production scale this enables EVE-style single-world MMOs partitioned across many Colyseus processes with tamper-evident, auditable player migration. The receipt-sealed handoff is a novel publishable claim (AAMAS '27 multi-agent trust track).

**Why not now**: Cross-host handoff requires runtime infrastructure that does not yet exist: an external session broker, a Redis-backed presence layer for in-flight message replay, and a cross-process WebSocket redirect protocol. The compiler can emit `ShardRegistry JSON` and `on_shard_transfer` TypeScript today, but the handoff will silently drop the player without the broker service. Round 2 scope: same-machine multi-room only (Colyseus relay). Cross-host is round 4+, after the `mmo-server` sovereign target and a deployed multi-room presence layer exist.

---

## Cross-File `ProvenanceBoundsChecker` (compile-time proof obligations across imports)

**What might be valuable**: The `@provably_bounded` composition annotation with a cross-file `ProvenanceBoundsChecker` gives a typed proof that exploit classes (speedhack, dupe, range-exploit, info-leak) are structurally impossible in the emitted server artifact — checking not just the root `.holo` file but all imported `.hs` ability declarations and `.hsplus` brain blocks for missing `@authority_envelope`, `@movement_contract`, and `@receipt_on` annotations. This is the full "Verifiable Anti-Cheat by Construction" paper claim and the D.044 Minab structural-impossibility principle applied to MMO. It makes `@provably_bounded` a hard compile error, not a lint warning.

**Why not now**: Cross-file constraint checking requires a symbol table and cross-file scope resolution that do not exist in HoloScript today. `ImportResolver.ts` exists but produces per-file parse results, not a single merged symbol table. Round 2 delivers `@provably_bounded` as a single-file lint warning (extend `EffectChecker`). The full cross-file checker, with ability-declaration and zone-declaration coverage, requires the symbol table infrastructure that is a round 3-4 compiler investment. The paper claim is scaffolded in round 2; the hard guarantee ships in round 3-4.

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

*Last updated: 2026-06-15 from MMO round-2 research memo (`research/2026-06-15_mmo-next-round-advancement.md`). Seeds added: SpacetimeDB target, cross-host shard handoff, cross-file ProvenanceBoundsChecker, lifecycle-typed brain fields with Postgres emit, UGC/player-authored .holo content, fleet-sim balance CI. 2026-06-16: hs:perceives derived spatial-perception edges (from .holo agent-anchoring work); thinking-budget control for local LLMs (from Jetson qwen3 investigation).*
