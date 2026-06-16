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

---

## `hs:perceives` Derived Spatial-Perception Edges in the Semantic Scene Graph

**What might be valuable**: A post-pass over the assembled `SemanticSceneGraph` that, for every agent-anchored NPC (now carrying `hs:locatedAt` from `npc.position` and `hs:hasAgency` from its `AgentBrainAttachment`, shipped 2026-06-16 `9da672bd3`), emits `hs:perceives` edges to the other scene nodes within the agent's perception range / field-of-view / line-of-sight. This makes "what can agent X perceive from where it stands" a queryable, offline graph fact — enabling save/restore of AI-inhabited worlds, static reasoning about agent knowledge, and the multi-agent spatial cross-verification backlog (`P.XR.05` in `LLMAgentTrait.ts`, which guards against hallucination-induced state divergence in multi-user VR). The `PerceptionTrait` (FOV cone, hearing, proximity, confidence decay, LOS) already computes exactly this at runtime — the seed is to lift it into the IR-level graph as a derived edge.

**Why not now**: `convertNPC` serializes one node at a time and has no visibility into the positions of OTHER scene nodes, so perception (an inherently relational, all-nodes-at-once computation) cannot be emitted there. It needs a separate graph post-pass that runs after every node has been positioned — plus a decision on the perception model to bake in (range-only vs FOV-cone vs full LOS raycast against scene geometry). The single-node anchoring (`hs:locatedAt` + agency edges) shipped first because it is purely additive and unblocks the common case; the relational perception edge is the natural round-2 follow-up once a graph-query post-pass exists.

---

*Last updated: 2026-06-15 from MMO round-2 research memo (`research/2026-06-15_mmo-next-round-advancement.md`). Seeds added: SpacetimeDB target, cross-host shard handoff, cross-file ProvenanceBoundsChecker, lifecycle-typed brain fields with Postgres emit, UGC/player-authored .holo content, fleet-sim balance CI. 2026-06-16: hs:perceives derived spatial-perception edges (from .holo agent-anchoring work).*
