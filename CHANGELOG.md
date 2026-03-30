# Changelog

All notable changes to HoloScript are documented here.

---

## [6.0.0] — 2026-03-30 (Universal Semantic Platform)

134 commits. Major version: 8 core packages bumped to 6.0.0, HoloMesh V5-V8 shipped, 19 new MCP tools, publishing protocol, multi-tenant auth.

### Added

**HoloMesh V5-V8** — agent social network ("MySpace for Agents")
- V5: 13 social traits (`@agent_profile`, `@top8_friends`, `@guestbook`, `@agent_wall`, `@agent_room`, `@background_music`, `@spatial_comment`, `@room_portal`, `@trait_showcase`, `@profile_theme`, `@status_mood`, `@agent_badge`, `@visitor_counter`)
- V5: Studio profile page with 6 tabs, social renderers wired to CRDT spatial feed
- V6: `HolomeshMarketplaceTrait` — list/purchase/review/search, 95/5 creator/platform revenue split
- V6: P2P gossip sync via `loro-crdt`, discovery service, `handleInboundGossip` HTTP endpoint
- V6: Gossip health side-channel, confidence decay, structured denial receipts
- V6: 4 R3F renderers (AgentRoom, RoomPortal, Guestbook, BadgeHolographic)
- V7: Enterprise team workspaces — RBAC (owner/admin/member/viewer), 11 team endpoints, absorb integration
- V7: Presence heartbeat (2-min TTL, IDE type, active/idle/away)
- V8: 4 accessibility endpoints (`mcp-config`, `quickstart`, `leaderboard`, `crosspost/moltbook`)
- V8: Self-service onboarding room, file-backed state persistence
- V11: Oracle blueprints — Sybil defense, thermodynamic trust, equimarginal LOD (design docs)
- CRDT gossip backpressure + dead knowledge tree-shaking
- Proof-of-Play gating, V3 wallet payments, V4 wallet identity

**Publishing Protocol** — 4-layer on-chain publishing
- Provenance → Registry → Collect → Remix Revenue layers
- Zora 1155 collection deployment script (Base L2)
- `InvisibleWallet` (env/keystore/AgentKit), `ProtocolRegistry`, revenue splitter (bigint exact)
- 4 MCP tools (`holo_protocol_*`), 7 HTTP endpoints, CLI `--publish`/`--price`/`--mint-nft`

**MCP Tools (19 new → 122 total)**
- `holo_oracle_consult` — agent decision support via knowledge store + decision trees
- `holo_protocol_publish`, `holo_protocol_mint`, `holo_protocol_revenue`, `holo_protocol_registry`
- `moltbook_post`, `moltbook_comment`, `moltbook_browse`, `moltbook_engage`, `moltbook_heartbeat`, `moltbook_create_submolt`
- `holoclaw_run`, `holoclaw_stop`, `holoclaw_status`
- Multi-tenant API key provisioning, dynamic tenant auth bridging
- MCP orchestrator circuit breaker + auto-failover

**Moltbook Integration**
- 6 MCP tools for Moltbook social (post, comment, browse, engage, heartbeat, create_submolt)
- Daemon brain: philosopher voice, feed browsing, semantic dedup, follow-back, timing jitter
- L1/L2/L3 challenge escalation pipeline with fuzzy solver
- Railway deployment config, subpath exports

**Absorb Service** — extracted microservice
- `@holoscript/absorb-service` package, Railway-deployed at `absorb.holoscript.net`
- 20 MCP tools: scan, query, improve, TypeScript analysis, graph, credits
- Embeddings cache for faster GraphRAG bootstrap
- Plaintext fallback to track all language files
- BM25 deprecated, OpenAI `text-embedding-3-small` as default embedding provider
- Credit middleware + admin/founder tier bypass

**R3F Renderer**
- `Telemetry` + `TwinActuator` traits for bidirectional IoT pipelines
- SNN, ZK interaction flows, Temporal Scrubber
- `SpatialFeedRenderer` exported for external embedding

**Auth & Admin**
- OAuth 2.1 PostgreSQL-backed token store
- Token encryption, per-user quotas, admin proxy, scope alignment
- Per-server scoped API keys, dead doc key pruning
- Absorb credit middleware with billing telemetry

**Core Engine & CLI**
- `holoscript serve` — dev server with SSE HMR, file watching, error overlay, dashboard
- JSON AST exports (`--export-ast`), JSON-to-Holo imports, Mermaid dependency graphs
- `holoscript query` — semantic GraphRAG search with provider selection (`bm25|xenova|openai|ollama`)
- `EmbeddingProvider` abstraction: BM25, Xenova, Ollama, OpenAI — all provider-agnostic
- Wind-to-FluidTrait WGSL pipeline (3 shaders), `MLSMPMFluid`, `WeatherBlackboard`
- Plugin API dispatch for `scene.read/write/subscribe`, `editor.*`, `ui.*`, `user.*`
- Dynamic plugin installation (NPM registry, esm.sh, direct URL)
- Scene persistence with short-URL (8-char UUID) + LRU eviction
- 80+ parser token types, 16 domain categories in `parseDomainBlock()`

**Infrastructure**
- Dockerfiles for render-service, absorb-service, BitNet, Studio (hardened)
- Server-side screenshot rendering via Playwright in Docker
- Railway auto-redeploy with path-filtered CI
- `HOLOMESH_DATA_DIR` and `EMBEDDING_PROVIDER` env vars

### Changed

- HoloMesh teams repurposed from IDE coordination to community knowledge exchange
- 8 core packages bumped to 6.0.0 (`core`, `cli`, `absorb-service`, `agent-protocol`, `agent-sdk`, `semantic-2d`, `snn-webgpu`, `uaal`)
- `@holoscript/mcp-server` bumped 3.6.1 → 3.7.0
- `holoscript` Python bindings bumped 5.3.0 → 5.3.1
- `absorb-service` switched to SSEServerTransport for standard MCP IDE compatibility
- Compiler type safety enforced — eliminated `any` in R3F graphics configs
- Extracted mesh helpers, fixed CRDT race condition (+12 tests)

### Fixed

- Oracle handler dispatch ordering — routed before graph tools catch-all, inlined to avoid stale barrel exports
- Studio Dockerfile build chain — added all missing workspace deps (`@holoscript/std`, `ui`, `r3f-renderer`, `agent-protocol`, `plugin-sdk`)
- SSE endpoint absolute/relative URL resolution + auth query param fallback
- Hardcoded Windows paths replaced with env-based resolution
- Cross-package import boundary between `@holoscript/core` and `mcp-server` decoupled
- `loro-crdt` added as explicit dependency for HoloMesh CRDT sync
- Per-token revenue routing — creator owns revenue, not platform
- Hallucination detection double-scoring in AI validator
- Security sandbox contract: returns `success: false` with `error.type: 'syntax'` for non-executable HoloScript
- BitNet Dockerfile rewritten to match current upstream API (`--hf-repo`)
- Absorb-service tsup config (`shims: true`, `externalize mcp-server`)
- Budget analyzer contradictions in economy Layer 2

### Security

- **CWE-94**: Input sanitization enforced across 16 compiler backends
- **Solidity injection**: Alphanumeric contract names mandated in `NFTMarketplaceCompiler`
- **Credential cleanup**: Purged hardcoded `dev-key-12345` from 6 runtime files
- **FlowLevel.test.ts**: Security checks integrated into CI pipeline
- **Flow-level audit**: 17 tests revealed 9/16 backends silently drop traits — tracked for follow-up

### Codebase Intelligence — EmbeddingProvider abstraction + `query` CLI command

**`holoscript absorb` / `holoscript query`** now form a complete, provider-agnostic codebase intelligence pipeline.

#### New: EmbeddingProvider abstraction (`packages/core`)

- **`EmbeddingProvider` interface + `createEmbeddingProvider()` factory** — decouples `EmbeddingIndex` from any particular embedding backend
- **`BM25EmbeddingProvider`** — zero-dependency default using FNV-1a feature hashing + log-TF weighting (1024-dim, cosine-compatible)
- **`XenovaEmbeddingProvider`** — local WASM semantic embeddings via `@huggingface/transformers` (`Xenova/all-MiniLM-L6-v2`, 384-dim); installed as an `optionalDependency`
- **`OllamaEmbeddingProvider`** — backward-compatible extraction of the original `EmbeddingIndex` Ollama logic
- **`OpenAIEmbeddingProvider`** — batched `text-embedding-3-small` via lazy `import('openai')`; requires `openai` package and `OPENAI_API_KEY`
- All four providers exported from `@holoscript/core` via `codebase/providers/index.ts`

#### New: LLM provider abstraction in `GraphRAGEngine`

- Added `LLMProvider` minimal interface — structurally compatible with `ILLMProvider` from `@holoscript/llm-provider`
- `GraphRAGEngine` constructor now accepts `llmProvider?: LLMProvider`; falls back to direct Ollama HTTP for backward compatibility
- `queryWithLLM()` uses the injected provider when set

#### New: `holoscript query` CLI command (`packages/cli`)

- `holoscript query <question>` — semantic GraphRAG search with provider selection
- Flags: `--provider bm25|xenova|openai|ollama`, `--top-k <n>`, `--with-llm`, `--llm openai|anthropic|gemini`, `--model <name>`, `--llm-key <key>`, `--json`

#### Documentation

- New guide: [`docs/guides/codebase-intelligence.md`](./docs/guides/codebase-intelligence.md)
- VitePress sidebar updated with "Codebase Intelligence" section
- `docs/api/CLI.md` — `absorb` and `query` added to Additional Commands
- README — `holoscript query` command, provider system, and optional deps documented
- CLI `--help` — new "Codebase Intelligence Options" block in Options; new "Codebase Intelligence" examples block

---

## [5.9.0] — 2026-03-24 (Developer Portal)

### New Modules

- **DevServer** — `holoscript serve` with SSE-based HMR, file watching (.holo/.hs/.hsplus), error overlay, dashboard, /**hmr + /**api/stats + /\_\_api/compositions endpoints
- **TraceWaterfallRenderer** — distributed trace span visualization, DFS hierarchy, bar positioning, critical path detection, agent color assignment, minDuration filter
- **WorkspaceManager** — `holoscript workspace init`, glob-based member resolution, Kahn's algorithm topological sort with parallel group detection
- **APIDocsGenerator** — 25+ prefix-based category rules, markdown + JSON output, auth detection

### MCP Tools (5 new → 103 total)

- `get_api_reference`, `serve_preview`, `get_workspace_info`, `inspect_trace_waterfall`, `get_dev_dashboard_state`

### Tests

- 59 new tests (15 DevServer + 13 TraceWaterfall + 11 Workspace + 9 APIDocs + 11 showcase E2E)

---

## [5.8.0] — 2026-03-24 (Live Economy)

### New Modules

- **PaymentWebhookService** — HMAC-SHA256 verification, idempotent processing, retry queue with exponential backoff
- **UsageMeter** — per-tool-call cost tracking, free-tier monthly allowance, aggregation by agent/tool/period
- **AgentBudgetEnforcer** — per-agent budget caps, enforcement modes (warn/soft/hard), circuit breaker with auto-reset
- **CreatorRevenueAggregator** — revenue by creator/plugin/period, configurable platform fee (15% default), payout tracking
- **SubscriptionManager** — lifecycle (create→trial→active→past_due→suspended→cancelled), MRR calculation

### MCP Tools (3 new → 98 total)

- `check_agent_budget`, `get_usage_summary`, `get_creator_earnings`

### Tests

- 83 new tests (69 core economy + 14 showcase E2E)

---

## [5.7.0] — 2026-03-24 (Open Ecosystem)

### New Modules

- **PluginSandboxRunner** — vm.createContext() isolation, PermissionSet (11 perms), CapabilityBudget (CPU/memory/tools), rate limiting
- **PluginSignatureVerifier** — TrustStore with key rotation/revocation/expiration, Ed25519 verification
- **DependencyResolver** — topological sort, parallel group detection, cycle + version conflict detection
- **PluginLifecycleManager** — install→verify→sandbox→enable→disable→uninstall lifecycle, telemetry emission
- **`holoscript create-plugin` CLI** — scaffolds plugin boilerplate with package.json, tsconfig, test, README

### MCP Tools (3 new → 95 total)

- `install_plugin`, `list_plugins`, `manage_plugin`

### Tests

- 91 new tests (76 core plugins + 15 showcase E2E)

---

## [5.6.0] — 2026-03-24 (Observable Platform)

### New Modules

- **OTLPExporter** — OTLP/HTTP JSON exporter, batch flush, gzip, retry with backoff+jitter, configurable auth
- **TraceContextPropagator** — W3C Trace Context inject/extract, traceparent/tracestate, createChildContext
- **PrometheusMetricsRegistry** — counters/gauges/histograms, toPrometheusText(), linkTelemetry() auto-recording
- **StructuredLogger** — JSON log entries with trace correlation (traceId/spanId), console/json-array/noop/custom sinks
- **Health endpoints** — /health with subsystem checks, /metrics with Prometheus exposition text

### MCP Tools (4 new → 92 total)

- `query_traces`, `export_traces_otlp`, `get_agent_health`, `get_metrics_prometheus`

### Tests

- 91 new tests (78 core debug + 13 showcase E2E)

---

## [5.5.0] — 2026-03-24 (Agents as Universal Orchestrators)

### New Modules

- **FederatedRegistryAdapter** — cross-composition agent discovery via /.well-known/agent-card.json, A2A card → AgentManifest conversion
- **TaskDelegationService** — local + remote (A2A JSON-RPC) delegation, auto-delegate via CapabilityMatcher, retry with exponential backoff
- **SkillWorkflowEngine** — DAG-based skill composition, topological sort → parallel groups, cycle detection, fallback/skip error strategies
- **OrchestratorAgent** — first concrete BaseAgent from uAA2++ protocol, 7 phases mapped to orchestration

### MCP Tools (5 new → 88 total)

- `discover_agents`, `delegate_task`, `get_task_status`, `compose_workflow`, `execute_workflow`

### Tests

- 95 new tests (82 core agents + 13 showcase E2E)

---

## [5.4.0] — 2026-03-24 (Domains Unified)

### New Features

- **Unified HoloDomainType** — 31 types (23 spatial + 8 v6), DialectDomain extends HoloDomainType
- **DialectRegistry Boot** — registerBuiltinDialects() with 24 compilers
- **Cross-Domain Trait Constraints** — 73 BUILTIN_CONSTRAINTS including v6 resilience (circuit_breaker, retry, timeout, bulkhead)
- **LSP Cross-Domain Completions** — 72 V6_TRAIT_COMPLETIONS across 8 domains

### MCP Tools (2 new → 83 total)

- `validate_composition`, `absorb_typescript`

### Tests

- 74 new tests

---

## [5.3.0] — 2026-03-24 (Tooling as Semantic Bridge)

### New Features

- **Changesets config** with fixed (platform-v5) + linked (tooling-v3) groups
- **Syncpack config** with workspace protocol + sameRange policies
- **MCP quality gate** script (validate-mcp-tools.mjs) + CI workflow
- **A2A parity validator** (validate-a2a-parity.mjs) + release compliance CI workflow

### MCP Tools (3 new → 81 total)

- `suggest_universal_traits`, `generate_service_contract`, `explain_service_contract`

### Tests

- 100 new tests

---

## [5.2.0] — 2026-03-24 (Parser Universalized)

### New Features

- **239 universal service traits** across 8 categories
- **DialectRegistry** — MLIR-style dialect plugin system (322 lines)
- **NodeServiceCompiler** — Express/Fastify code emission (646 lines)
- **50 tree-sitter corpus fixtures** for v6 blocks (service, contract, data, pipeline)
- **25 type checker trait constraints** for v6 domains
- **traits/v6/ namespace** — 8 files, 35 trait types across 8 categories

### Tests

- 65 new tests

---

### Studio Quality & DX Refinements (Track 1)

- **Spatial Version Control (Git for 3D)**: Built isomorphic git integration enabling visual spatial blame tooltips and ghost-mesh translucent diff overlays within the 3D viewport.
- **Conformance & Verification Pipelines**: Repurposed the Engine Play pipeline into a formal AST validation runner enforcing physics boundaries and accessibility guidelines.
- **FDA-Compliant Auditing API**: Connected `StudioErrorBoundary.tsx` to a new Node-runtime `/api/audit` route writing AST-parsed render crashes directly to a CFR Part 11 compliant `crash_ledger.txt`.
- **AssetDropProcessor**: Fixed PBR shadows and `envMapIntensity` rendering artifacts by pre-warming imported GLB materials during the parser phase.
- **Gizmo Synchronization**: Eliminated the 1-frame Gizmo sync latency in `SceneRenderer.tsx` by utilizing direct `onMouseUp` event handling rather than reactive hook bindings.
- **Global Error Boundary**: Standardized runtime crashes by mapping `componentDidCatch` stack frames to AST component paths for direct debugging.

### Core Engine Hardening (Track 2)

- **AST Node Object Pool**: Eliminated garbage collection overhead in `R3FCompiler.ts` and `GLTFPipeline.ts` by pooling heavily-instantiated AST component nodes.
- **GLB Buffer Streaming**: Resolved Out-Of-Memory (OOM) crashes on massive procedural scenarios by replacing inefficient Array primitives with native `Uint8Array` allocations. Successfully validated the compilation of 50,000 spatial meshes under a 512MB heap limit, creating a 219MB GLB export seamlessly.
- **AI Coverage Push**: Wrote 50+ new Vitest scenarios verifying edge cases within the AI `DialogueRunner` under deeply nested loads, and Spatial Navigation `AStarPathfinder` execution boundaries during disjoint mesh navigation.

## [5.0.0] — 2026-03-04 (Autonomous Ecosystems)

### Major Features

**Autonomous Ecosystems Framework (v5.0)**

- **AgentPortalTrait** — Cross-scene agent communication via WebSocket relay with scene discovery, heartbeat pruning, agent migration (serialize + transfer), federated queries, hop-count TTL, and outbox queueing for offline scenarios
- **EconomyPrimitivesTrait** — In-scene compute credits, agent bounties with escrow, transfers, subscriptions with auto-charge, spend limits, and transaction history
- **FeedbackLoopTrait** — Quality metrics with linear regression trend detection, auto-optimization signals on drift (e.g., reduce GS quality when FPS drops), user feedback aggregation, and report generation
- 26 comprehensive tests covering messaging lifecycle, escrow flows, trend detection, optimization signals, migration, and federation queries

**Enterprise Multi-Tenancy System**

- **TenantTrait** — Multi-organization isolation with namespace enforcement, tenant-scoped resource limits, and hierarchical configuration
- **RBACTrait** — Role-based access control with permission inheritance, dynamic role assignment, and capability tokens
- **SSOTrait** — Single sign-on integration supporting SAML 2.0, OAuth 2.0, and OpenID Connect
- **QuotaTrait** — Configurable resource quotas per tenant (storage, compute, API calls) with real-time tracking
- **AuditLogTrait** — Comprehensive audit logging for compliance (GDPR, SOC 2, HIPAA) with tamper-proof signatures
- **AnalyticsTrait** — Tenant-level analytics with custom dashboards, usage metrics, and anomaly detection
- **ABTestTrait** — Multi-variate testing framework with statistical significance calculation and automatic winner selection
- 2,100+ tests across 7 enterprise trait modules

**Post-Quantum Cryptography**

- **HybridCryptoProvider** — Dual-mode encryption supporting both classical (Ed25519, ECDSA) and post-quantum (ML-DSA-65, ML-KEM-768) algorithms
- **Capability-Based Access Control (CBAC)** — Fine-grained permission system with capability tokens, fleet ANS overrides, and ML-DSA-65 Phase 2 signatures
- **AgentTokenIssuer** — Secure token generation and validation for agent authentication across distributed scenes
- 1,900+ lines of crypto infrastructure with 1,100+ test assertions

---

## [4.2.0] — 2026-03-01 (Perception & Simulation Layer)

### tree-sitter-holoscript 2.0.0 (updated)

- **12 simulation grammar constructs**: material_block (PBR/unlit/shader + texture_map + shader_connection), collider_block, rigidbody_block, force_field_block, articulation_block (with joint_block), particle_block (with particle_module), post_processing_block (with post_effect), audio_source_block, weather_block (with weather_layer), procedural_block (with noise_function + biome_rule), lod_block (with lod_level), navigation_block (with behavior_node), input_block (with input_binding), render_hints, annotation

### @holoscript/core 4.2.0

- **29 simulation token types** + **55 simulation keywords** synced
- **10 new domain categories** in HoloDomainType: material, physics, vfx, postfx, audio, weather, procedural, rendering, navigation, input
- All simulation blocks route through unified `parseDomainBlock()`

### Examples

- `examples/showcase/realistic-forest.holo` — 400+ line realistic simulation showcase

---

## [4.0.0] — 2026-03-01 (Multi-Domain Expansion)

### tree-sitter-holoscript 2.0.0

- **20+ HSPlus constructs**: `module`, `struct`, `enum`, `interface`, `import/export`, `function`, `variable_declaration`, `for_of`, `try/catch`, `throw`, `switch/case`, `await`, `new`, `optional_chain`, `generic_type`, `trait_with_body`, `decorator_event_handler`
- **8 domain-specific blocks**: IoT, Robotics, DataViz, Education, Healthcare, Music, Architecture, Web3 (72 keywords total)
- **Extensible `custom_block`**: Any identifier as a block keyword via `prec(-1)` catch-all
- **Spatial primitives**: `spawn_group`, `waypoints`, `constraint`, `terrain`
- **Dialog system**: `dialog` blocks with `option` nodes

### @holoscript/core 4.0.0

- **Parser sync**: `HoloCompositionParser` now handles all new constructs
- **62 new token types**: HSPlus + domain blocks + spatial primitives
- **100+ keywords**: Full domain block keyword vocabulary
- **AST types**: `HoloDomainBlock` (unified: IoT/Robotics/DataViz/Education/Healthcare/Music/Architecture/Web3/custom), `HoloSpawnGroup`, `HoloWaypoints`, `HoloConstraintBlock`, `HoloTerrainBlock`
- **Parse methods**: `parseDomainBlock()`, `parseSpawnGroup()`, `parseWaypointsBlock()`, `parseConstraintBlock()`, `parseTerrainBlock()`

### Examples

- `examples/showcase/spatial-rpg.holo` — 456-line gaming/spatial showcase
- `examples/showcase/multi-domain.holo` — 300+ line multi-domain showcase

### TrainingMonkey

- 72 new domain block keywords in `holoscript-constants.ts`
- `.hsplus` file support in extractor

- **TRADEMARK_BRANDING_GUIDE.md** — Usage guidelines, capitalization rules, legal notices, rebranding history (PageMaster → StoryWeaver Protocol), brand hierarchy. Applied to HoloScript repo (7 files, 61 refs) and Hololand repo (18 files, 100+ refs, 7 files renamed).

### Trait Visual System

- **TraitVisualRegistry** — Singleton registry mapping 600+ trait names to PBR material configs across 23 preset categories.
- **TraitCompositor** — 9-layer priority merge engine (base_material → surface → condition → physical → scale → lighting → visual_effect → environmental → mood).
- **AssetResolverPipeline** — Plugin-based resolution chain: cache → procedural → AI → PBR fallback. Includes `CacheManager` (LRU), `ProceduralResolver` (noise textures), and `TextureResolver` (AI text-to-texture).
- **R3FCompiler** — Catch-all block now queries TraitVisualRegistry. 70-test suite added.

### Deployment Infrastructure

- **Cargo Workspace** — Unified Rust package management with version inheritance.
- **Multi-Platform Release Workflow** — GitHub Actions for win32, darwin-x64, darwin-arm64, linux.
- **Homebrew Formula** — `brew tap brianonbased-dev/holoscript && brew install holoscript` (universal binary).
- **Chocolatey Package** — `choco install holoscript` (`chocolatey/holoscript.nuspec`).
- **Version Synchronization** — `scripts/sync-versions.js` syncs across 6 package managers atomically (`pnpm version:patch/minor/major`).
- **Typeshare Integration** — Rust→TypeScript type generation via `#[typeshare]`. See `pnpm types:generate`.
- **82% CI Build Time Reduction** — 15 min → 2.7 min via Rust caching, pre-built wasm-pack, parallel Vitest.
- **DEPLOYMENT.md** — 534-line guide covering 15 channels (Homebrew, Chocolatey, npm, Cargo, Unity, etc.).

### Unity SDK

- **Assembly Definitions** — Namespace isolation for Runtime, Editor, and their respective test assemblies.
- **24 Unit Tests** — Runtime (trait application, component mapping) + Editor (asset importer, material parsing, XR Interaction Toolkit).
- **Unity Package Manager** — Git URL install: `https://github.com/brianonbased-dev/HoloScript.git?path=/packages/unity-sdk`. Requires Unity 2022.3 LTS+ and XR Interaction Toolkit 2.3+.

### New Platform Compilers

- **VRChatCompiler** — VRC_Pickup, VRC_Trigger, VRC_ObjectSync, spatial audio. `--target vrchat`
- **UnrealCompiler** — AActor C++/Blueprint, Enhanced Input, Niagara. `--target unreal`
- **IOSCompiler** — SwiftUI + ARKit, ARSCNView, plane detection. `--target ios`
- **AndroidCompiler** — Kotlin + ARCore, Filament/Jetpack Compose. `--target android`
- **Additional targets:** `godot`, `visionos`, `openxr`, `androidxr`, `webgpu`
- **Neovim Plugin** — Tree-sitter syntax + LSP for `.hs/.hsplus/.holo` files.
- **VR Traits Modularization** — 1,525 traits split from monolithic `constants.ts` into 61 category modules.

---

## [3.5.0-alpha.74] - 2026-02-20

### Sprint CLXXXVIII — Assets Mega Batch (8 modules) 🧪

**194 new production tests across 8 modules in the assets subsystem.**

#### Assets

- **`AssetAliases`** (29 tests) — `DEFAULT_ASSET_ALIASES` shape (nature/props/characters/structures), `resolveAssetAlias` (known alias, lowercase normalization, fallback to original), custom alias priority over defaults, fallthrough, custom-only, empty custom map.
- **`ResourceBundle`** (30 tests) — `createBundle`/`removeBundle`, `addEntry` (size guard, false on unknown bundle, cumulative limit), `loadBundle` (marks entries loaded, stream callbacks per chunk, no-op for unknown bundle), `preloadAll` (filtered by `preload` flag, priority order, stream IDs correct), `getBundleSize`/`getLoadedCount`/`isFullyLoaded`/`getLoadProgress`.
- **`ResourceCache`** (34 tests) — `put`/`get` (round-trip, overwrite, bytes tracking), `has`/`remove`, TTL expiry (before/after, `ttlMs=0` never expires, `purgeExpired` count), refcounting (`addRef`/`release`/floor@0), LRU eviction (evicts oldest unreferenced, skips pinned), `getUsageRatio`, `clear`.
- **`TextureAtlas`** (33 tests) — `pack` (AtlasEntry rect/UV range/u0<u1/padding/shelf placement/null when full or oversized/rotated=false/trimmed=false), `getEntry`/`getAllEntries`, power-of-two mode (`getAtlasWidth`/`Height` round up), `getOccupancy`, `getAtlas` snapshot, `clear` + re-pack.
- **`TextureProcessor`** (29 tests) — `process` (pow2 resize, `maxSize` clamp, `mipmapLevels>1` / `=1`, compressionRatio for all 7 formats, `sizeBytes>0`, format passthrough, compressed < base), `packAtlas` (entry fields, utilization 0–1, row wrap, overflow drops).
- **`AssetBundler`** (37 tests) — `registerAsset`/`getAsset`/`unregisterAsset`, `buildBundle` (totalSize, compress 60%, transitive deps resolved first, dedup, ignores unknown, `version++`, `bundle_*` hash), `splitBundle` (`_part*` suffix, all assets covered), `generateManifest` (priority sort, `totalAssets` dedup), `computeDiff` (added/removed/unchanged), `getDependencyChain` (empty/self/transitive order/dedup).
- **`AssetHotReload`** (32 tests) — `watch`/`unwatch`/`isWatched`, `subscribe`/`unsubscribe` (ID format, count), `reportChange`+`flush` (changeType/hashes/disabled skips/unknown skips modified/created fires for unwatched/deleted removes watchedAssets/debounce dedup per assetId), pattern matching (`*`/exact/`*.ext`/`prefix/**`), history API (`getChangeHistory` copy-safe, `getRecentChanges`, `clearHistory`).
- **`ImportPipeline`** (30 tests) — `addModelJob`/`addTextureJob` (ID prefix, unique, type, status, filename), `runAll` (model/texture completed, unsupported format fails, mixed stats, idempotent re-run), job results (gltf meshes, obj PBR warnings, error message+filename for failures, fbx result defined), `getStats`/`clear`/`getJobCount`.

---

## [3.5.0-alpha.73] - 2026-02-20

### Sprint CLXXXVII — Mega Batch (8 modules) 🧪

**287 new production tests across 8 previously untested modules.**

#### Editor

- **`Inspector`** (24 tests) — `componentTypes` (empty/single/multi/selection-change), `getComponentData` (no-sel/present/missing/live-ref), `setProperty` (no-op/sets/missing-comp/multi-call).
- **`CopilotPanel`** (27 tests) — `generateUI` entity structure (background/title/input/3 action buttons), message entities with user+bot icon prefixes, `setInputText` (placeholder/custom/cleared after send), `sendMessage` (user+assistant appended, response returned, history trim), `requestSuggestion`, `getMessages` (copy-safety), `clearMessages`.
- **`NodeGraphPanel`** (34 tests) — `generateUI` (background 2×1.5, node-body+title+port entities, connection_line with from/to data), 12 node-type colors + fallback `#555555`, selection color `#e94560`, `selectNode`/`getSelectedNode`, idempotency of multiple `generateUI` calls.

#### Security

- **`PackageSigner`** (23 tests) — `generateKeyPair` (structure, uniqueness, base64), `signPackage`+`verifySignature` (correct-key pass, content-tamper/wrong-key/sig-tamper/garbage/empty/large fail), `createPackageManifest` (sorted files, 64-char SHA-256 hash, ISO timestamp, hash sensitivity), `canonicalizeManifest` (valid JSON, all fields, deterministic, full sign→verify round-trip).
- **`CryptoUtils`** (65 tests) — `sha256`/`sha512` (length, determinism, known hash, ArrayBuffer), `hmacSha256`/`verifyHmacSha256` (round-trip, tamper detection), `generateEncryptionKey`/`exportKey`/`importKey`/`encrypt`/`decrypt` (AES-GCM round-trip, unique IVs), `randomBytes`/`randomHex`/`randomUUID`, `validateWalletAddress` (ETH/Solana), `validateApiKey`, `sanitizeInput` (XSS scripts/styles/events + SQL DROP/DELETE/comments), `validateUrl` (https/wss allowed, http/ftp denied), `checkRateLimit`/`resetRateLimit`/`resetRateLimits`.

#### Tenancy

- **`IsolationEnforcer`** (30 tests) — `TenantIsolationError` (name/properties/message/detail), `validateResourceAccess` (pass, throw + error fields, edge cases), `isolateExecution` (correct prefix/return value/async/call-count), `validateNamespace` (valid/cross-tenant/no-prefix/message-content), `getIsolatedNamespace` (format, validates-self, fails-other-tenant).
- **`NamespaceManager`** (40 tests) — `createNamespace` (fields/date/guards/duplicate-throw/cross-tenant-same-name), `getNamespace`/`hasNamespace`, `listNamespaces` (empty/count/`dataKeyCount`/tenant-isolation), `deleteNamespace` (cleanup/re-creation), `setNamespaceData`/`getNamespaceData` (store/retrieve/missing-key/complex-objects/overwrite/data-isolation/missing-namespace-throws).
- **`TenantManager`** (44 tests) — `createTenant` (free/pro/enterprise quota+settings defaults, overrides, name-trim, ID gen, fixed ID, empty-name throws, duplicate-ID throws, metadata), `getTenant`/`hasTenant`, `updateTenant` (name/plan/partial-quotas/partial-settings/metadata-merge/no-op/unknown-throws), `deleteTenant`, `listTenants` (unfiltered/plan-filter).

---

## [3.5.0-alpha.72] - 2026-02-20

### Sprint CLXXXVI — Editor & Plugin Gap Tests 🧪

**137 new production tests across 5 previously untested modules.**

#### Editor

- **`PropertyGrid`** (26 tests) — `registerDescriptors`/`getDescriptors`, `setValues`/`getValues` (snapshot isolation), `setValue` (history tracking, 100-entry cap), `batchSetValue` (partial target matches), `undo` (restore + return), `validate` (string/number/min-max/boolean/enum/readonly/color), `configureGroup`/`toggleGroup`/`getGroup`, `getGroupedDescriptors` (ungrouped → "General"), `clear`.
- **`HierarchyPanel`** (35 tests) — `addNode` (child registration, no-duplicate), `removeNode` (reparent children to grandparent, deselect), `reparent` (self-guard, descendant-guard, index insert, redo-clear), `isDescendant` (direct/grandchild/unrelated), toggle visibility/locked/expanded, selection (exclusive/additive/deselect/clearSelection), `filter` (query/type/visibleOnly/unlockedOnly), `getRoots`/`getChildren`, `getFlatTree` (DFS + collapse), `undo`/`getUndoCount`.

#### Plugins

- **`PluginManifest`** (24 tests) — `validatePluginManifest` (null/non-object, all 5 required fields, kebab-case regex, semver regex, pre-release semver, multi-error accumulation, `hololandFeatures` VRR type validation/missing fields/invalid type, AI provider validation, payment processor validation); `createPluginManifest` (default main, custom main, `PluginAuthor` object, round-trip validation with `validatePluginManifest`).
- **`HololandExtensionRegistry`** (21 tests) — Singleton pattern (`getInstance`/`getHololandRegistry`/`reset`); all 5 provider types: register/getAll/getById/unregister+dispose/re-registration/no-op-unregister; `getTotalProviderCount`, `getRegistrySummary`, `disposeAll`.
- **`HololandExtensionPoint base classes`** (31 tests) — `BaseWeatherProvider`: subscribe (multi-subscriber, unsubscribe, cross-location isolation, dispose-clears); `BaseAIProvider`: usage stats (accumulation, copy-safety, `dispose` reset), `generateDialogue` (delegates to `generateNarrative`, line split, empty-line filter); `BasePaymentProcessor`: `getPaymentHistory` (startDate/endDate/maxResults filters), `getTotalProcessed` (BigInt sum), `dispose`.

---

## [3.5.0-alpha.71] - 2026-02-20

### Sprint CLXXXV — Editor & Recovery Gap Tests 🧪

**109 new production tests across 5 previously untested modules.**

#### Editor

- **`SelectionManager`** (19 tests) — Initial empty state, `select()` exclusive/additive modes, no-duplicate additive add, deselect, toggle, clear (with/without entries), `isSelected()`, `primary` returns last-inserted entity, stale-primary after deselect/clear.
- **`ToolManager`** (26 tests) — Register/unregister (with shortcut cleanup, deactivate-if-active-on-unregister), `activateTool()` (return value, `onActivate`/`onDeactivate` hooks, `isActive` flag, tool history capping), `revertToPreviousTool()`, `getToolsByCategory()`, `handleKeyEvent()` (case-insensitive, modifier matching, custom handler), pointer event forwarding (down/move/up), no-throw when no active tool.

#### Recovery

- **`FallbackCacheStrategy`** (20 tests) — `id`/`maxAttempts`/`backoffMs` identity, `set()`/`get()`, `hasValidCache()` (fresh/stale with `staleWhileRevalidate`), `matches()` (error-type gating, cache-key resolution from `context.cacheKey` or `agentId:errorType`), `execute()` (success/no-cache/stale-revalidate/expired-strict), `clear()`/`prune()`/`size()`, `getCacheKey()`.
- **`PatternLearner`** (16 tests) — `recordFailure()` with `windowSize` trim, `detectPatterns()` (frequency threshold, multi-type grouping, descending frequency sort, strategy mapping), `recordStrategyOutcome()`, `getSuggestedStrategy()`, `analyze()` (healthScore 100 with no failures, severity penalty, trend: stable below 10 entries, suggested actions for high-frequency), `reset()`.
- **`SelfHealingService`** (23 tests) — Strategy register/unregister, `reportFailure()` (id generation/preservation, `getFailure()`/`getActiveFailures()`), `attemptRecovery()` (no-match→escalate, strategy exec, clean-on-success, `maxAttempts` exceeded→escalate), `getFailurePatterns()` (global + agentId filter), `getSuggestedStrategy()`, `escalate()` (callback invocation, Infinity-attempts to block further retry), `clearHistory()`/`reset()`.

#### Notable Fix

> `ToolManager.unregisterTool()` deactivates the tool (`isActive=false`) but leaves `activeToolId` set. `getActiveTool()` is the reliable observable — it returns `null` (tool deleted from map). Tests assert `getActiveTool()` not `getActiveToolId()` for this case.

---

## [3.5.0-alpha.70] - 2026-02-20

### Sprint CLXXXIV — Coverage Gap Blitz 🧪

**154 new production tests across 8 previously untested subsystem modules.**

#### Network / Recovery

- **`WebSocketReconnectionHandler`** (20 tests) — Exponential backoff with configurable jitter (±10%), `shouldRetry()` gating, `scheduleReconnect()` success/fail/maxAttempts paths, `cancel()`, `reset()`, `getStats()`, `destroy()`.
- **`TransportFallbackManager`** (11 tests) — Three-transport priority stack (WebRTC → WebSocket → Local), `getStats()` available-transport enumeration, callback registration (message/connect/disconnect/error), `send()` before connect, `disconnect()` cleanup, `createTransportFallback()` factory, all-transports-fail path.
- **`StateSynchronizerImpl`** (30 tests) — Full CRUD with versioning, ownership lifecycle (`claim`/`release`/`isOwner`/`getOwner`/`getOwnedStates`), snapshots (`takeSnapshot`/`restoreSnapshot`/`getHistory`), remote update conflict resolution (CRDT / last-write-wins / authoritative modes), `pause()`/`resume()`, per-key and global `onStateChanged` callbacks.
- **`CircuitBreakerStrategy`** (21 tests) — Closed → Open transition at `failureThreshold`, Open blocking with `nextAction: 'skip'`, Open → Half-Open after `resetTimeoutMs`, `recordSuccess()`/`recordFailure()` direct access, `resetCircuit()`, `getAllCircuits()`, per-agent isolation.
- **`NetworkRetryStrategy`** (18 tests) — `matches()` for `network-timeout` / `api-rate-limit`, `getBackoffForAttempt()` with exponential growth and `maxBackoffMs` cap, `execute()` without callback (signal-only) and with callback (success/false/throw), config surface (`maxAttempts`, `backoffMs`).

#### Editor

- **`GizmoSystem`** (17 tests) — Reactive effect batching (effects flush via `Promise.resolve()` microtask — tests use `await tick()`), GizmoRoot + 3 axis-handle entity creation, `NoSelect`/`GizmoAxisX`/Y/Z tag assertions, position sync in `update()`, `dragHandle()` on all three axes, `gizmoScale`/`axisLength` properties, gizmo teardown on `selection.clear()`.
- **`EditorPersistence`** (14 tests) — `save()`/`load()`/`listScenes()` via `MockLocalStorage`, `holoscript_scene_` prefix filtering, corrupt JSON graceful error (returns `false`), `localStorage`-undefined fallback, save+load round-trip.

#### Plugins

- **`PluginLoader`** (23 tests) — `parseSemver()` / `satisfiesSemver()` with all constraint operators (`^`/`~`/`>=`/exact), `register()` + duplicate-registration guard, topological dependency sort, circular-dependency detection, missing-dependency error, version-constraint violation, full async lifecycle (`initializeAll` → `startAll` → `stopAll` → `destroyAll`), `onInit`/`onStart`/`onStop`/`onDestroy` hooks, init-error → `ERROR` state, `update()` for `STARTED`-only plugins, `getStats()`.

#### Notable Fix

> `GizmoSystem` reactive `effect()` uses `Promise.resolve().then(flush)` for batched microtask scheduling. All related tests must `await tick()` after `SelectionManager.select()` / `clear()` to observe gizmo entity creation/destruction.

---

## [3.5.0-alpha] - 2026-02-18 → 2026-02-20

### ∞ Sprints I–CLXX — Comprehensive Production Test Coverage 🧪

**17,740+ tests passing across 1,062+ files.** This alpha series represents a continuous test coverage push across the entire `@holoscript/core` package, spanning ~150 internal sprint patches (`3.5.0-alpha.1` through `3.5.0-alpha.68`).

#### Coverage by Subsystem

| Subsystem               | Suites | Highlights                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AI**                  | 10+    | BehaviorTree (all node types), StateMachine, UtilityAI (5 curve types), Blackboard, GoalPlanner (GOAP), InfluenceMap, PerceptionSystem, BehaviorSelector                                                                                                                                                                                                                |
| **UI**                  | 10+    | UIDataBinding, UIEventRouter, UIWidget tree, UILayout (flexbox), UIRenderer, UIButton/Slider/TextInput factories                                                                                                                                                                                                                                                        |
| **Physics**             | 10+    | SoftBodySolver, ClothSim, FluidSim (SPH), RopeSystem, VehicleSystem, JointSystem, RagdollSystem, ConstraintSolver, SpatialHash, TriggerZone, RaycastSystem, DeformableMesh                                                                                                                                                                                              |
| **ECS**                 | 5      | World (entity lifecycle, tags, queries, undo/redo), ComponentStore, SystemScheduler, EntityRegistry, ReactiveECS                                                                                                                                                                                                                                                        |
| **Animation**           | 4      | AnimationGraph (state machine, layers), AnimationEngine (9 easing functions), CurveEditor (7 presets, wrapMode), Timeline                                                                                                                                                                                                                                               |
| **Audio**               | 4      | AudioMixer, AudioEnvelope (ADSR), AudioDynamics (compressor/limiter/gate), AudioFilter (EQ 5 types), ErosionSim                                                                                                                                                                                                                                                         |
| **Terrain**             | 4      | TerrainLOD (quadtree, stitching), TerrainBrush (5 modes, undo), ErosionSim (hydraulic/thermal), WorldStreamer                                                                                                                                                                                                                                                           |
| **Gameplay**            | 10+    | QuestManager, InventorySystem, LootTable, CraftingSystem, AchievementSystem, JournalTracker, LeaderboardManager, ProgressionTree, RewardSystem                                                                                                                                                                                                                          |
| **Combat/Dialogue**     | 10+    | DamageSystem, StatusEffects, ComboTracker, CombatManager, HitboxSystem, ProjectileSystem, DialogueGraph, DialogueRunner, ChoiceManager, EmotionSystem, BarkManager, Localization                                                                                                                                                                                        |
| **Procgen/Navigation**  | 7      | DungeonGenerator (BSP), NoiseGenerator (perlin/value/worley/fBm), WaveFunction (WFC), NavMesh (A\*), AStarPathfinder, SteeringBehaviors, BuildingGenerator                                                                                                                                                                                                              |
| **Spatial Indexing**    | 5      | KDTree (2D/3D, k-nearest, radius), OctreeIndex, BVHBuilder (SAH), SpatialGrid, FrustumCuller                                                                                                                                                                                                                                                                            |
| **Scripting**           | 5      | ScriptVM, EventScriptBridge, ScriptContext, ScriptScheduler, HoloScriptLang                                                                                                                                                                                                                                                                                             |
| **Multiplayer**         | 9      | SnapshotInterpolation, LagCompensation, ClientPrediction, EntityAuthority, NetworkInterpolation, ReplicationManager, NetworkedTrait, SyncProtocol, DeltaEncoder                                                                                                                                                                                                         |
| **Render**              | 4      | WebGPURenderer (mock GPU), PostProcessPipeline (bloom/SSAO/tonemap), PostProcessEffect, PhysicsDebugDrawer                                                                                                                                                                                                                                                              |
| **Compiler**            | 15+    | TypeAliasRegistry, SecurityPolicy, TraitDependencyGraph, RichErrors, ErrorCollector, ParseCache, IncrementalCompiler, TypoDetector, SDFCompiler, CompletionProvider, BundleAnalyzer, BundleSplitter, TreeShaker, SourceMapGenerator                                                                                                                                     |
| **Assets**              | 5      | AssetManifest, AssetRegistry, AssetValidator, ResourceLoader, SmartAssetLoader                                                                                                                                                                                                                                                                                          |
| **Persistence**         | 5      | SaveManager, AutoSaveSystem, SaveSerializer, SceneSerializer, CRDT/UndoManager/ReactiveState                                                                                                                                                                                                                                                                            |
| **Traits (XR/AI/Web3)** | 20+    | All VisionOS traits (SharePlay, VolumetricWindow, SpatialPersona, ObjectTracking, SceneReconstruction, RealityKitMesh), AI traits (DiffusionRealtime, EmbeddingSearch, AiInpainting, AiTextureGen, ControlNet, SpatialNavigation), Web3 (NFTTrait, WalletTrait, TokenGatedTrait, ZoraCoins, MarketplaceIntegration), MultiAgentTrait, LLMAgentTrait, RenderNetworkTrait |
| **Debug/Tools**         | 8      | Profiler, MemoryTracker, GarbageCollector, DebugConsole, DebugRenderer, EntityInspector, RuntimeProfiler, DeveloperExperience                                                                                                                                                                                                                                           |
| **Accessibility/i18n**  | 2      | AccessibilitySystem (font scaling, contrast, screen reader, focus, remapping), I18nManager                                                                                                                                                                                                                                                                              |
| **Plugins/Audit**       | 5      | ModRegistry, PluginAPI, AuditQueryBuilder, ComplianceReporter (SOC2/GDPR), BuildOptimizer                                                                                                                                                                                                                                                                               |

#### Notable Fixes Discovered During Testing

- `BehaviorTree.abort()` resets `aborted=false` at the start of each `tick()` — abort is one-shot; post-abort status must be checked via `getStatus()` not re-tick.
- `DamageSystem` total-damage tests must set `critChance: 0` to suppress RNG crits.
- `DialogueGraph` end-node requires two `advance()` calls (end-node visits before returning null).
- `TileRenderer` — `setTile` requires `TileData` objects; `updateAnimations(dt)` accumulates ms not seconds.
- `thermalErode` default `tan(45°)=1.0` exceeds typical slope values; tests require explicit `thermalAngle: 5–10`.

#### Phase 0: Language Foundations (alpha.1)

- `system` and `component` as first-class parser constructs (state blocks, actions, lifecycle hooks, embedded UI).
- 20 new test cases for system/component parsing, imports, and composition.

---

## [3.5.0-alpha.2] - 2026-02-17

### V43: AI Generation & visionOS Traits

- **6 new trait handlers:** `AiInpaintingTrait`, `AiTextureGenTrait`, `ControlNetTrait`, `DiffusionRealtimeTrait`, `SharePlayTrait`, `SpatialPersonaTrait`.
- **VRTraitName union** — 23 new V43 traits in `v43-ai-xr.ts` constants file.
- **VisionOSTraitMap** — `V43_VISIONOS_TRAIT_MAP` and `V43_AI_GEN_TRAIT_MAP` merged into main map.
- **TrainingMonkey** — 3 new generator files (~65K merged V37+V39+V43 training set via `scripts/merge-v43-dataset.py`).

---

## [3.4.0] - 2026-02-15

### 🚀 Scientific Computing, Robotics & Full Runtime Engine

287 new source modules, 113 test suites, 1,800+ traits.

#### Scientific Computing (24 traits)

Narupa MD server integration, AutoDock molecular docking, RCSB/AlphaFold DB queries, molecular visualization (protein/ligand/bonds/surfaces), trajectory analysis, interactive VR forces on atoms.

#### Robotics & Industrial (213 traits)

Joints (42), Actuators/Motors (28), Sensors (36), End Effectors (22), Mobility (20), Control/Planning (25), Safety/Standards (22), Power/Communication (18). Export: URDF, USD, SDF, MJCF.

#### New Subsystems

- **AI & Behavior** — BehaviorTree, StateMachine, GoalPlanner (GOAP), UtilityAI, SteeringBehaviors, PerceptionSystem, InfluenceMap, Blackboard, BehaviorSelector, AICopilot.
- **Physics** — SoftBodySolver, ClothSim, FluidSim, RopeSystem, RagdollSystem, JointSystem, VehicleSystem, DeformableMesh, ConstraintSolver, SpatialHash, TriggerZone, RaycastSystem, VRPhysicsBridge.
- **Audio** — AudioEngine, AudioMixer, SpatialAudio, AudioAnalyzer, AudioFilter, AudioGraph, AudioOcclusion, SynthEngine, MusicGenerator, SoundPool.
- **Animation** — AnimationGraph, IK, SkeletalAnimation, AnimationClip, Spline, Cinematic.
- **ECS** — Archetype-based ECS, ReactiveECS, SystemIntegrator.
- **Networking** — NetworkManager, Matchmaker/Lobby/RoomManager, AntiCheat, SyncTrait, NetworkPredictor.
- **Rendering** — WebGPU renderer, PostProcess (bloom/SSAO/DOF), SplatRenderer (WGSL), LOD, Decals.
- **Terrain** — Heightmap terrain + LOD, Foliage, Weather, World Streaming.
- **Gameplay** — Quest, Inventory, Combat, Dialogue, Achievements (9 modules).
- **ResiliencePatterns** — Circuit breaker, retry, bulkhead, timeout, fallback.
- **CRDT State Manager** — Conflict-free replicated data types.
- **HoloScript Studio** — Next.js scene builder, Template Gallery (5 starters), AI generation.
- **Companion repos** — `holoscript-compiler` (NVIDIA Isaac Sim target), `@holoscript/narupa-plugin` (VR drug discovery).

### Changed

- Trait count: 1,525 → 1,800+. WebGPU renderer, HITL manager, CRDT state, and movement prediction all enhanced.

---

## [3.0.0] - 2026-02-05

### 🎉 Major Release — WASM, Certified Packages, Partner SDK

- **WASM Compilation** — Compile to WAT with JS/TS bindings, SIMD/threads optional. `--target wasm`.
- **Certified Packages** — `CertificationChecker` (A–F letter grades, 4 categories), `BadgeGenerator` (SVG/MD/HTML), 1-year validity.
- **Partner SDK** — `@holoscript/partner-sdk` with `RegistryClient`, `WebhookHandler`, `PartnerAnalytics`, Express/Koa middleware.
- **Team Workspaces** — RBAC (Owner/Admin/Developer/Viewer), shared secrets, audit trail.
- **HoloScript Academy** — 10 lessons (Level 1), hands-on exercises.
- **Visual Scripting** — 26 node types, real-time preview, HoloScript export.
- **LSP** — Context-aware completion, trait/property inference.
- **IntelliJ Plugin** — Syntax highlighting, completion, error checking.
- **VS Code** — Semantic tokens, 72 snippets, inline diagnostics, quick fixes.
- **Analysis** — Dead code detection, deprecation warnings, migration assistant, complexity metrics.
- **Package Registry MVP** — Scoped packages, semver, dependency resolution.

### Changed

- Minimum: Node.js 18+, TypeScript 5.0+. `parse()` returns `HSPlusAST`. `@networked` config restructured.
- Performance: 50% faster parsing (incremental), 3× faster rebuilds (cache), parallel multi-file compilation.

### Deprecated

- `@legacy_physics` → use `@physics`. `compile({ format: 'cjs' })`. `HoloScriptParser` → `HoloScriptPlusParser`.

### Fixed

- Spread in nested objects, trait dependency cycles, source maps, LSP crash on malformed input, MQTT reconnection, workspace permission inheritance.

---

## [2.5.0] - 2026-02-05

### 🚀 Package Publishing & Access Control

- **`holoscript publish`** — Tarball packaging, `--dry-run`, `--tag`, `--access`, `--force`, `--otp`.
- **Auth** — `holoscript login/logout/whoami`.
- **Access Control** — `grant/revoke/list` per package.
- **Organization Management** — `org create/add-member/remove-member/list-members`.
- **Token Management** — `token create/revoke/list` with `--readonly/--scope/--expires`.

---

## [2.2.1] - 2026-02-05

### 🤖 Grok/X Integration

- **MCP Server** (`@holoscript/mcp-server@1.0.1`) — 16 tools for AI agents (parse, validate, generate, render, share).
- **Python Bindings** — `pip install holoscript` for Grok's execution environment.
- **Render Service** — Preview generation and X sharing endpoints.
- **Social Traits** — `@shareable`, `@collaborative`, `@tweetable`.

---

## [2.2.0] - 2026-01-31

### 🎮 Brittney AI Game Generation

- **7 language constructs** — `npc`, `quest`, `ability`, `dialogue`, `state_machine`, `achievement`, `talent_tree`.
- **Full AST types** for all constructs (`HoloNPC`, `HoloQuest`, `HoloAbility`, etc.).
- **Brittney Training Data** — `brittney-features-examples.hsplus` (8 examples), `brittney-features-training.jsonl` (20 pairs).

---

## [2.1.1] - 2026-01-28

### 🔧 Parser Enhancements

- **16 Structural Directives** — `@manifest`, `@semantic`, `@world_metadata`, `@zones`, `@spawn_points`, `@skybox`, `@ambient_light`, `@directional_light`, `@fog`, `@post_processing`, `@audio_zones`, `@navigation`, `@physics_world`, `@network_config`, `@performance`, `@accessibility`.
- **8 Simple Traits** — `@animated`, `@billboard`, `@rotating`, `@collidable`, `@clickable`, `@glowing`, `@interactive`, `@lod`.
- **Logic Block Parsing** — Function defs, `on_tick`, `on_scene_load`, event handlers.
- **Template System** — Named blocks with `using` instantiation and property overrides.
- **Environment Block** — Lighting, skybox, fog within scene scope.

---

## [2.1.0] - 2026-01-22

### 🏗️ Repository Reorganization

- HoloScript is now the **language repo** (parser, runtime, dev tools).
- Hololand is now the **platform repo** (adapters, Brittney AI, apps).
- Consolidated: `@holoscript/formatter`, `linter`, `lsp`, `std`, `fs` from Hololand.
- Moved: babylon/three/playcanvas/unity/vrchat adapters and creator-tools → Hololand.

---

## [2.0.0] - 2026-01-17

- 108+ tests (VoiceInputTrait, AIDriverTrait, TypeChecker, Runtime).
- **VoiceInputTrait** — Web Speech API, fuzzy matching, events.
- **AIDriverTrait** — Behavior trees, GOAP planning, 4 decision modes (reactive/goal-driven/learning/hybrid).
- Enhanced type inference, runtime object pooling, DeveloperExperience REPL, full CI/CD pipeline.

---

## [1.0.0-alpha.2] - 2026-01-16

- AIDriverTrait, enhanced type system, performance telemetry, commerce integration.

## [1.0.0-alpha.1] - 2026-01-16

- Initial HoloScript+ release: VoiceInputTrait, type checker, REPL, CLI, runtime, trait system.
