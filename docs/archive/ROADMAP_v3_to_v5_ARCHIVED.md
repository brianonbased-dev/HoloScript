> **ARCHIVED** — This document contains historical numbers that were accurate at time of writing. For current ecosystem metrics, see [NUMBERS.md](../../NUMBERS.md).

<!-- markdownlint-disable MD012 MD024 MD026 MD031 MD032 MD033 MD036 MD040 MD051 MD060 -->

# HoloScript Roadmap 2026-2028

> Historical archive: this roadmap is preserved as a planning snapshot from the v3-v5 era. Counts, milestones, and wording below reflect that period. For current canonical positioning and metrics, use ../../README.md, ../README.md, ../../VISION.md, and ../../CHANGELOG.md.

**The language for spatial computing.**

A declarative language with tooling that compiles to multiple platforms. This roadmap is scoped for **5 AI agents working in parallel**.

> ðŸ“¦ HoloScript includes its own full runtime engine (50+ subsystems). [Hololand](https://github.com/brianonbased-dev/Hololand) is an optional deployment platform that provides hosting, Brittney AI assistant, and additional platform adapters.
> ðŸŽ¯ **Current version at archive time: v5.0.0** â€” see [CHANGELOG.md](../../CHANGELOG.md) for full release history.
> âœ… **Latest release: v5.0.0 Autonomous Ecosystems** â†’ [Jump to latest â†“](#-v500---autonomous-ecosystems-march-2026)

---

## âœ… v5.0.0 - Autonomous Ecosystems (March 2026)

**Status:** âœ… **RELEASED** | **Published:** March 7, 2026

The autonomous ecosystems release brings agent federation, in-scene compute economies, feedback loop optimization, enterprise multi-tenancy, and post-quantum cryptography.

### Core Features (51 commits, 25,000+ lines)

| Feature                                                                                           | Status       |
| ------------------------------------------------------------------------------------------------- | ------------ |
| **AgentPortalTrait** â€” Cross-scene agent communication, WebSocket relay, migration, federation  | âœ… Complete |
| **EconomyPrimitivesTrait** â€” In-scene compute credits, bounties, escrow, subscriptions          | âœ… Complete |
| **FeedbackLoopTrait** â€” Quality metrics, trend detection, auto-optimization signals             | âœ… Complete |
| **Enterprise Multi-Tenancy** â€” 7 traits (Tenant, RBAC, SSO, Quota, AuditLog, Analytics, ABTest) | âœ… Complete |
| **Post-Quantum Cryptography** â€” HybridCryptoProvider, ML-DSA-65, ML-KEM-768, CBAC               | âœ… Complete |
| **Neural Rendering** â€” GaussianBudgetAnalyzer, PIDController, AndroidXR traits                  | âœ… Complete |
| **Spatial Intelligence** â€” SpatialConstraintValidator, SpatiotemporalTraits                     | âœ… Complete |

### New Packages

| Package                      | Version | Purpose                                           |
| ---------------------------- | ------- | ------------------------------------------------- |
| `@holoscript/agent-protocol` | 5.0.0   | uAA2++ 8-phase protocol, BaseAgent, PWG format    |
| `@holoscript/agent-sdk`      | 5.0.0   | Mesh discovery, gossip protocol, Agent Card (A2A) |
| `@holoscript/snn-webgpu`     | 5.0.0   | WebGPU spiking neural networks, LIF simulation    |
| `@holoscript/vm-bridge`      | 5.0.0   | Bridge HoloVM (60fps) with uAAL VM (7-phase)      |

### Export Targets

| Target                | ID  | Purpose                                          |
| --------------------- | --- | ------------------------------------------------ |
| NIR (Neuromorphic IR) | #19 | Intel Loihi 2, neuromorphic hardware compilation |

### Documentation

| Document                                                           | Status       |
| ------------------------------------------------------------------ | ------------ |
| CHANGELOG.md v5.0.0 entry                                          | âœ… Complete |
| Package READMEs (agent-protocol, agent-sdk, snn-webgpu, vm-bridge) | âœ… Complete |
| VISION_V5.md                                                       | âœ… Complete |
| npm published (18 packages)                                        | âœ… Complete |

---

## ðŸš€ v3.5.0 - Hololand Bootstrap: Build in VR with Brittney (Marchâ€“May 2026)

**Status:** ðŸŸ¡ **IN PROGRESS** | **Vision Doc:** [VISION_HOLOLAND_BOOTSTRAP.md](VISION_HOLOLAND_BOOTSTRAP.md)

The endgame: put on a headset, talk to Brittney, build Hololand in VR. HoloScript becomes the application layer for Hololand, and Brittney generates it from inside the world.

### Phase 0: Language Foundations (Weeks 1-2)

| Task                                                      | Status                      |
| --------------------------------------------------------- | --------------------------- |
| `system` keyword in parser (named trait+logic containers) | âœ… Complete (`3bb576b`)    |
| `component` keyword for UI declarations                   | âœ… Complete (`3bb576b`)    |
| Inter-file `import`/`export` module resolution            | âœ… Already supported       |
| `storage` and `device` built-in runtime APIs              | âœ… Types added (`3bb576b`) |

### Phase 1: End-to-End Pipeline (Weeks 3-4)

| Task                                                          | Status                                                                |
| ------------------------------------------------------------- | --------------------------------------------------------------------- |
| R3F compiler handles `system`/`component` node types          | âœ… Complete                                                          |
| `compileComposition()` processes parser's children array      | âœ… Complete                                                          |
| R3F compiler â†’ Hololand runtime bridge                      | âœ… Already exists (`HoloRuntimeProvider` in `@hololand/react-three`) |
| E2E Parse â†’ Compile tests (11 new tests, 119 total)         | âœ… Complete                                                          |
| Browser execution verification (`.hsplus` â†’ rendered scene) | âœ… Bridge exists via `HoloRuntimeProvider`                           |
| WebXR session verification                                    | âœ… Supported via `vrEnabled` prop                                    |
| Hot-reload in active VR session                               | âœ… Supported via `HoloRuntimeProvider` re-parse                      |

### Phase 2: Brittney Training (Weeks 3-6, parallel)

| Task                                                                                                                                       | Status           |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| TrainingMonkey `generate_hololand_training` tool â€” HoloScript templates (9 categories Ã— 4 difficulties, system/component/import syntax) | âœ… Complete     |
| MCP schema updated (holoscript/r3f frameworks, production difficulty)                                                                      | âœ… Complete     |
| Framework-aware template selection in `training-generators.ts`                                                                             | âœ… Complete     |
| 10 new tests (all 9 categories, VR traits, networking traits, Phase 0 keywords)                                                            | âœ… Complete     |
| Brittney v5 fine-tune with Hololand-specific data                                                                                          | ðŸ”² Not started |

### Phase 3: Spatial Brittney (Weeks 5-8)

| Task                                                              | Status       |
| ----------------------------------------------------------------- | ------------ |
| `brittney-workspace.holo` VR dev environment composition          | âœ… Complete |
| Voice â†’ MCP pipeline in VR (`VoiceMCPPipeline.ts` in ai-bridge) | âœ… Complete |
| Brittney spatial avatar with lip-sync (`brittney-avatar.holo`)    | âœ… Complete |

### Phase 4: Migration Execution (Weeks 7-10)

| Task                                                                                    | Status       |
| --------------------------------------------------------------------------------------- | ------------ |
| Hololand Central migrated to `.hsplus` root composition (`app.hsplus` + `bootstrap.ts`) | âœ… Complete |
| 5 zone files (main_plaza, casino, builder_shop, social_lounge, arcade)                  | âœ… Complete |
| 5 system files (Tutorial, EasterEggs, Themes, Multiplayer, Accessibility)               | âœ… Complete |
| 3 template files (Portal, NPC, Collectible)                                             | âœ… Complete |
| 3 UI components (MobileControls, MenuOverlay, Modals)                                   | âœ… Complete |
| 2 NPC files (plaza_npcs, casino_npcs â€” 6 named characters)                            | âœ… Complete |
| 3 page files (Landing, Oasis, Central)                                                  | âœ… Complete |

### Phase 5: Self-Building World (Weeks 9-12)

| Task                                                                                | Status                                                         |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `HoloScriptHotReloader.ts` â€” watches `.hsplus` files, AST diff, patch scene graph | âœ… Complete                                                   |
| `VRGitIntegration.ts` â€” auto-commit, rollback, snapshots from VR                  | âœ… Complete                                                   |
| Brittney writes + hot-reloads `.hsplus` files from VR                               | âœ… Complete (infrastructure)                                  |
| Collaborative CRDT editing                                                          | âœ… Complete (CRDTDocument, CollaborationSession â€” 42 tests) |
| Self-improvement loop (failed generations â†’ TrainingMonkey harvest)               | âœ… Complete (SelfImprovementPipeline â€” 14 tests)            |

### "Commence All II" â€” WorldBuilder & Ecosystem (February 15, 2026)

Second sprint covering CRDT collaboration, self-improvement, component library, and IDE:

| Task                                                                                                                                                                                                             | Status       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **CRDT Collaboration** â€” CRDTDocument, CollaborationSession, CollaborationTransport (42 tests)                                                                                                                 | âœ… Complete |
| **Self-Improvement Pipeline** â€” Failed generation harvesting, TrainingMonkey integration (14 tests)                                                                                                            | âœ… Complete |
| **Component Library** â€” 25 .holo templates across 5 categories (NPCs, Weapons, UI, Environment, Game Systems)                                                                                                  | âœ… Complete |
| **Playground IDE** â€” Monaco editor with syntax highlighting, Three.js preview, file I/O                                                                                                                        | âœ… Complete |
| **Track 3: Enhanced WorldBuilder** â€” HoloScript I/O, Visual Scripting, Brittney Integration, Multi-Object Editing (1118 lines, 50 tests), Performance Tools (1119 lines, 34 tests), Playground IDE integration | âœ… Complete |

### "Commence All III" â€” Railway Production + SDK Expansion (February 16, 2026)

Sprint covering production persistence, new SDKs, and npm publishing:

| Task                                                                                                                                                          | Status           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| **PostgresTraitDatabase** â€” `ITraitDatabase` implementation for Railway Postgres, auto-migrates schema on startup, replaces in-memory storage in production | âœ… Complete     |
| **Railway deployment** â€” healthcheck path fixes (marketplace-api, llm-service), production URL wiring, CORS + trust proxy config                            | âœ… Complete     |
| **E2E export tests** â€” 72 tests covering all 15 compilers (`ExportTargets.e2e.test.ts`)                                                                     | âœ… Complete     |
| **LLM Provider SDK** â€” `@holoscript/llm-provider` v1.0.0 â€” unified OpenAI/Anthropic/Gemini/Mock adapters, 46 tests                                        | âœ… Complete     |
| **Python robotics bindings** â€” `holoscript.robotics` module: `export_urdf()`, `export_sdf()`, `generate_ros2_launch()`, 48 tests                            | âœ… Complete     |
| **Codecov + security CI** â€” codecov.yml (80% threshold), CodeQL + Snyk workflows                                                                            | âœ… Complete     |
| **npm publish expanded** â€” publish.yml updated to include mcp-server, llm-provider, security-sandbox, ai-validator, comparative-benchmarks                  | âœ… Complete     |
| **Brittney v5 fine-tune** â€” training data pipeline ready, awaiting model training run                                                                       | ðŸ”² Not started |

### "Commence All IV" â€” v3.5.0 Release: Marketplace Live + Publisher (February 16, 2026)

Version bump, npm publish pipeline, and marketplace full-stack wiring:

| Task                                                                                                                                                                                                                | Status       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **v3.5.0 version bump** â€” core@3.5.0, cli@3.5.0, mcp-server@3.5.0; llm-provider@1.1.0, security-sandbox@1.1.0, ai-validator@1.1.0, comparative-benchmarks@1.1.0, marketplace-api@1.1.0                            | âœ… Complete |
| **Publisher marketplace wiring** â€” `holoscript publish` now targets `marketplace-api-production-b323.up.railway.app/api/v1/traits`, JSON body with `.holo` source + metadata, replaces npm-registry multipart PUT | âœ… Complete |
| **Marketplace-web pagination** â€” fixed empty `onClick` on pagination buttons, wired to `useFilterStore.setPage()` + `performSearch()`                                                                             | âœ… Complete |
| **V43 Tier 2 traits** â€” `AiUpscalingTrait` (ESRGAN/Real-ESRGAN/SwinIR/LDM), `RoomMeshTrait` (whole-room mesh reconstruction + semantic classification)                                                            | âœ… Complete |
| **Test coverage expansion** â€” 60+ new test files (700+ tests): AI behavior trees, animation, audio, network, social, ECS, combat, dialogue                                                                        | âœ… Complete |
| **Bug fixes** â€” `GenerationCache.evictLRU` same-ms no-eviction, `EditorPersistence` JSON serialization, `LODManager.update()` camera-pos overload                                                                 | âœ… Complete |
| **git tag v3.5.0** â€” triggers npm publish pipeline for all packages                                                                                                                                               | âœ… Complete |

### "Commence All V" â€” Trait Hardening + Security + New Features (February 18, 2026)

Production hardening sprint: trait test coverage, network layer tests, crypto security audit, and two new feature traits.

| Task                                                                                                                                                                                                                             | Status       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **Track 1: Trait Production Hardening** â€” 229 tests across 5 traits (NetworkedTrait, OpenXRHALTrait, HITLTrait, RenderNetworkTrait, ZoraCoinsTrait)                                                                            | âœ… Complete |
| **Track 2: Network Test Coverage** â€” 70 tests (WebSocketTransport, DeltaEncoder, InterestManager, SyncProtocol)                                                                                                                | âœ… Complete |
| **Track 3: Security Hardening** â€” 68 tests for crypto.ts (SHA-256/512, HMAC, AES-GCM, wallet validation, XSS/SQL sanitization, rate limiting). Audit confirmed: no placeholder hash functions, all crypto uses `crypto.subtle` | âœ… Complete |
| **Track 4: PartnerSDKTrait** â€” New trait: secure partner integration with request signing, rate limiting, session TTL, webhook verification (21 tests)                                                                         | âœ… Complete |
| **Track 4: MarketplaceIntegrationTrait** â€” New trait: in-scene trait publishing, semver validation, install/uninstall, reviews/ratings, revenue tracking (25 tests)                                                            | âœ… Complete |
| **Total: 413 tests across 10 production test suites**                                                                                                                                                                            | âœ… Complete |

### "Commence All" â€” Ecosystem Expansion (February 15, 2026)

Massive single-session sprint covering plugins, training data, and infrastructure:

| Task                                                                                                                   | Status       |
| ---------------------------------------------------------------------------------------------------------------------- | ------------ |
| **Robotics plugin** (`@holoscript/robotics-plugin` v1.0.0) â€” USD/URDF/SDF/MJCF compiler, ROS2/Gazebo bridge          | âœ… Complete |
| **Medical plugin** (`@holoscript/medical-plugin` v1.0.0) â€” DICOM viewer, surgical planning, anatomy models, med sim  | âœ… Complete |
| **Training data generation** â€” 5,000 examples (2K scientific + 3K comprehensive), 1,175 unique traits (57% coverage) | âœ… Complete |
| **Plugin ecosystem** â€” 4 domain plugins production-ready (narupa, alphafold, robotics, medical)                      | âœ… Complete |
| Integration tests for all plugins                                                                                      | âœ… Complete |
| Plugin ecosystem documentation in HoloScript repo                                                                      | âœ… Complete |
| GitHub repos created (holoscript-robotics-plugin, holoscript-medical-plugin)                                           | âœ… Complete |
| npm publish: `@holoscript/robotics-plugin`, `@holoscript/medical-plugin`                                               | âœ… Complete |

---

## ðŸ”® v4.0 â€” Protocols & Narrative Layer (Q3 2026)

### x402 Protocol â€” Machine-to-Machine Payments

HTTP-native micropayments built into the HoloScript runtime, so agents can pay per API call with no human intermediary.

| Deliverable                                                                           | Status       |
| ------------------------------------------------------------------------------------- | ------------ |
| `x402` request/response header implementation in `@holoscript/mcp-server`             | ðŸ”² Planned |
| `PaymentGatedTrait` â€” declare per-asset or per-tool payment requirements in `.holo` | ðŸ”² Planned |
| On-chain settlement adapter (EVM-compatible)                                          | ðŸ”² Planned |
| Agent wallet provisioning via `AgentRegistry`                                         | ðŸ”² Planned |
| Testnet sandbox (`x402.testnet`) for local development                                | ðŸ”² Planned |

**Use case**: An AI agent autonomously purchases access to a premium physics simulation trait, a proprietary spatial dataset, or a gated API endpoint â€” settled in milliseconds, logged on-chain.

### StoryWeaver Protocol â€” Declarative Narrative Spatial Computing

First-class narrative primitives: chapters, dialogue, triggers, and branching objectives as spatial scene graph nodes.

| Deliverable                                                                 | Status       |
| --------------------------------------------------------------------------- | ------------ |
| `narrative` keyword in HoloScript+ parser                                   | ðŸ”² Planned |
| `@storyweaver` trait â€” chapter sequencing, branching, objective tracking  | ðŸ”² Planned |
| Brittney narrator integration (chapter â†’ voice line â†’ avatar animation) | ðŸ”² Planned |
| Export targets: VRChat triggers, Unity Timeline, Godot Cutscene             | ðŸ”² Planned |
| `StoryWeaverTrait` test suite (target: 30 tests)                            | ðŸ”² Planned |

**Use case**: A tutorial that reacts to player choices, a branching VR escape room, or an AI-driven NPC quest giver â€” all declared in `.holo`, no spaghetti scripting required.

---

## âœ… v3.4.0 - Full Runtime Engine & Scientific Computing (February 2026)

**Status:** âœ… **COMPLETE** (February 15, 2026)

Massive expansion adding 287 new source modules, 113 test suites, and 275+ new traits across scientific computing and robotics/industrial domains.

### Key Deliverables

| Category              | Modules                                                                    | Status       |
| --------------------- | -------------------------------------------------------------------------- | ------------ |
| AI & Behavior         | 11 modules (BehaviorTree, GoalPlanner, UtilityAI, SteeringBehaviors, etc.) | âœ… Complete |
| Physics & Simulation  | 15 modules (SoftBody, Cloth, Fluid, Rope, Ragdoll, Vehicle)                | âœ… Complete |
| Audio Engine          | 15 modules (Mixer, Spatial, FFT, Synthesis, Occlusion)                     | âœ… Complete |
| Animation             | 13 modules (Graph, IK, Skeletal, Spline, Cinematic)                        | âœ… Complete |
| ECS                   | 5 modules (Archetype ECS, Reactive Queries)                                | âœ… Complete |
| Editor                | 15 modules (Inspector, NodeGraph, History)                                 | âœ… Complete |
| Networking            | 18 modules (Matchmaker, AntiCheat, Prediction)                             | âœ… Complete |
| Rendering             | 15 modules (WebGPU, PostProcess, LOD, Splats)                              | âœ… Complete |
| Terrain & Environment | 15 modules (Terrain, Foliage, Weather, Streaming)                          | âœ… Complete |
| Scientific Computing  | 24 traits (Narupa, AutoDock, PDB/AlphaFold)                                | âœ… Complete |
| Robotics & Industrial | 213 traits (Joints, Actuators, Sensors, Control)                           | âœ… Complete |
| Test Suites           | 113 new test files                                                         | âœ… Complete |

### Trait Expansion

- **Total traits:** 1,800+ (was 1,525)
- **Trait module files:** 68 (was 61)
- **New domains:** Scientific computing, robotics/industrial
- **New implementations:** 13 (GrabbableTrait, VisionTrait, NeuralForgeTrait, NPCAITrait, etc.)

### Companion Repositories

- **holoscript-compiler** (v0.1.0) - Standalone robotics compiler: `.hsplus` â†’ USD/URDF/SDF/MJCF for NVIDIA Isaac Sim
- **holoscript-scientific-plugin** (v1.2.0) - VR drug discovery: Narupa MD, multi-agent orchestration, 6 example compositions

---

## ðŸŽ‰ HoloScript 3.0 Released - All Sprints Complete!

**Status:** âœ… **COMPLETE** (February 5, 2026)

All 10 development sprints have been completed ahead of schedule:

| Sprint | Focus                                                | Status       |
| ------ | ---------------------------------------------------- | ------------ |
| 1-2    | Parser, VS Code, Incremental Compilation             | âœ… Complete |
| 3-4    | WASM, WoT/MQTT, Headless Runtime, URDF/SDF           | âœ… Complete |
| 5-6    | Dead Code Detection, Deprecations, Publishing        | âœ… Complete |
| 7-8    | Visual Scripting, AI Autocomplete, IntelliJ, Academy | âœ… Complete |
| 9-10   | Certified Packages, Partner SDK, 3.0 Release         | âœ… Complete |

**Key Deliverables:**

- HoloScript 3.0 with WASM compilation
- Full package registry with certified packages
- Partner SDK for ecosystem integration
- HoloScript Academy (10 lessons, Level 1)
- VS Code + IntelliJ IDE support

See [RELEASE_NOTES_3.0.md](./docs/archive/RELEASE_NOTES_3.0.md) for full details.

---

## âœ… v3.0.x Stabilization Sprint - Complete

**Status:** âœ… **COMPLETE** (February 2026)

Post-3.0 stabilization focused on quality and technical debt:

| Metric              | Target | Achieved |
| ------------------- | ------ | -------- |
| Lint Errors         | 0      | 0        |
| Test Coverage       | â‰¥20% | 40.24%   |
| Tests Passing       | 100%   | 2650+    |
| Critical Bugs Fixed | All    | All      |

**Deliverables:**

- Resolved all ESLint errors (0 remaining)
- Coverage increased from 38% to 40%+ with new trait tests
- Comprehensive test suites for HITLTrait, RenderNetworkTrait, ZoraCoinsTrait
- Documentation cleanup and sprint planning

See [V3_EXIT_GATE_CHECKLIST.md](./docs/V3_EXIT_GATE_CHECKLIST.md) for exit criteria verification.

---

## ðŸš€ v3.1 Agentic Choreography - Implementation Complete

**Target Version:** 3.1.0
**Timeline:** 12 weeks (Target: March 2026)
**Status:** âœ… All 8 priorities implemented with tests
**Full Plan:** [SPRINT_4_PLAN.md](./docs/planning/SPRINT_4_PLAN.md)

### Priority Stack

| #   | Priority                  | Focus                          | Coverage | Status       |
| --- | ------------------------- | ------------------------------ | -------- | ------------ |
| 1   | AgentRegistry & Discovery | Core agent infrastructure      | 61.87%   | âœ… Complete |
| 2   | ChoreographyEngine        | Task â†’ Agent matching        | 76.26%   | âœ… Complete |
| 3   | Multi-Agent Negotiation   | Conflict resolution            | 71.53%   | âœ… Complete |
| 4   | Spatial Context Awareness | Location-aware choreography    | 85.89%   | âœ… Complete |
| 5   | Consensus Mechanisms      | Distributed agreement          | 85.08%   | âœ… Complete |
| 6   | Agent Communication       | Secure messaging channels      | 78.35%   | âœ… Complete |
| 7   | Hierarchy & Delegation    | Command structure              | 88.50%   | âœ… Complete |
| 8   | Debugging & Observability | Trace viewer, replay debugging | 70.97%   | âœ… Complete |

**Success Metrics:**

- AgentRegistry managing 100+ agents âœ…
- Choreography latency < 50ms âœ…
- Test coverage â‰¥60% overall (current: 41.37%), â‰¥80% new code (avg: ~78%)

### Remaining for v3.1.0 Release

| Task                                             | Priority | Status                            |
| ------------------------------------------------ | -------- | --------------------------------- |
| Improve Spatial module coverage (56.71% â†’ 80%) | High     | âœ… Complete (91.84%)             |
| Add tests for 0% coverage traits                 | Medium   | âœ… Complete (293 tests added)    |
| Create v3.1 tutorials                            | Medium   | âœ… Complete (4 tutorials)        |
| Add v3.1 feature examples                        | Medium   | âœ… Complete (4 examples)         |
| Final integration testing                        | High     | âœ… Complete (4712 tests passing) |

See [IMPLEMENTATION_AUDIT_2026.md](./IMPLEMENTATION_AUDIT_2026.md) for detailed gap analysis.

---

## âœ… [ARCHIVED] Sprint 9: Enterprise Production Readiness (v3.6.0)

| #   | Priority                   | Focus                          | Status       |
| --- | -------------------------- | ------------------------------ | ------------ |
| 1   | OpenTelemetry Integration  | Distributed tracing & metrics  | âœ… Complete |
| 2   | Security Hardening         | WASM sandbox, package signing  | âœ… Complete |
| 3   | Edge Deployment Pipeline   | CDN integration, zero-downtime | âœ… Complete |
| 4   | Rate Limiting & Quotas     | Production API controls        | âœ… Complete |
| 5   | Multi-Tenant Isolation     | SaaS deployment patterns       | âœ… Complete |
| 6   | Audit Logging & Compliance | SOC2/GDPR compliance           | âœ… Complete |

### Key Deliverables

- **OpenTelemetry**: TelemetryProvider, SpanFactory, MetricsCollector (Prometheus + OTLP)
- **Security**: SecurityPolicy, SecurityEnforcer, PackageSigner (ed25519), SandboxExecutor
- **Edge Deploy**: CloudflareDeployer, VercelDeployer, NginxDeployer (zero-downtime)
- **Rate Limiting**: TokenBucketRateLimiter, QuotaManager, 3 tiers (free/pro/enterprise)
- **Multi-Tenant**: TenantManager, TenantContext, NamespaceManager, IsolationEnforcer
- **Audit**: AuditLogger, AuditQueryBuilder, ComplianceReporter (SOC2/GDPR)

### Success Metrics

- OTEL traces: 100% of parse/compile operations âœ…
- Security scan: All compositions scanned âœ…
- Edge deploy: < 60s to all regions âœ…
- Audit durability: 99.999% âœ…
- **Tests**: 214 files, 6,085 tests, 0 failures

---

## âœ… [ARCHIVED] Sprint 11: Ecosystem Growth (v3.6.2)

**Status:** âœ… **COMPLETE** (February 10, 2026)

### Key Deliverables

- **Extension System**: `ExtensionInterface`, `ExtensionRegistry`, Runtime Integration.
- **Performance**: 12M ops/sec Trait instantiation, 2.6M ops/sec Extension calls.
- **Documentation**: "Building Your First Multi-Agent Workflow" tutorial.

---

## AI Agent Structure (5 Agents)

| Agent         | Focus Area                    | Parallelization       |
| ------------- | ----------------------------- | --------------------- |
| **Architect** | Parser, type system, compiler | Core language changes |
| **Tooling**   | CLI, formatter, linter        | Build tools           |
| **IDE**       | LSP, VS Code, debugger        | Editor integration    |
| **QA**        | Test framework, CI/CD         | Quality assurance     |
| **Docs**      | Documentation, examples       | Content generation    |

**AI Acceleration Factor:** Tasks that take humans weeks can be completed in days with AI agents working 24/7 in parallel.

---

## âœ… [ARCHIVED] Sprint 2: Core Stability & Developer Experience (v2.2.0)

**Target Version:** 2.2.0
**Full Plan:** [SPRINT_2_IMPLEMENTATION_PLAN.md](./docs/planning/SPRINT_2_IMPLEMENTATION_PLAN.md)

### Priority Stack (Ordered by Dependencies)

| #   | Priority                         | Agent            | Status       | Blocks   |
| --- | -------------------------------- | ---------------- | ------------ | -------- |
| 1   | Advanced Spread Operator Support | Architect        | âœ… Complete | 2, 5, 10 |
| 2   | Enhanced Error Recovery          | Architect        | âœ… Complete | 7        |
| 3   | Trait Change Detection           | Architect        | âœ… Complete | 5        |
| 4   | Stabilize Visual Test Runner     | QA               | âœ… Complete | 9        |
| 5   | Performance Benchmarking         | Tooling          | âœ… Complete | -        |
| 6   | Formatter Optimizations          | Tooling          | âœ… Complete | -        |
| 7   | VS Code Extension Enhancements   | IDE              | âœ… Complete | -        |
| 8   | Visual Diff Tools                | Tooling + QA     | âœ… Complete | -        |
| 9   | Snapshot Coverage                | QA               | âœ… Complete | -        |
| 10  | Ecosystem Expansion              | Architect + Docs | âœ… Complete | 1-9      |

### Critical Path

````text
Priority 1 (Spread) â†’ Priority 2 (Errors) â†’ Priority 4 (Tests)
     â†“                                            â†“
Priority 5 (Benchmarks) â†â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
     â†“
Priority 10 (Ecosystem) [GATE: Requires 1-9 complete]
`$lang

### Success Metrics

- Parser syntax coverage: 85% â†’ **95%**
- Visual tests: 6/9 â†’ **9/9**
- Build time (10K lines): 500ms â†’ **200ms**
- Community: 0 stars â†’ **50+ stars**

---

## File Extensions & Layer Architecture

HoloScript uses three file extensions, each serving distinct purposes at different layers of the spatial computing stack:

### `.hs` â€” HoloScript (Logic Layer)

**Purpose:** Core logic, protocols, and system-level directives.

| Aspect                 | Description                                               |
| ---------------------- | --------------------------------------------------------- |
| **Layer**              | Foundation / Logic                                        |
| **Primary Use**        | Business logic, state machines, protocols, AI behaviors   |
| **Syntax Focus**       | Imperative logic, type definitions, function declarations |
| **Compilation Target** | JavaScript, WASM, native (via adapters)                   |


**Capabilities:**

- **Protocols & Interfaces** â€” Define contracts between systems
- **State Machines** â€” Complex state management with transitions
- **Type Definitions** â€” Custom types, generics, unions, type guards
- **Logic Blocks** â€” Conditional logic, loops, pattern matching
- **Event Handlers** â€” System events, network messages, timers
- **AI Behaviors** â€” Decision trees, behavior trees, utility AI

**Example:**

```hs
protocol Interactable {
  on_interact(actor: Entity): void
  can_interact(actor: Entity): boolean
}

type GameState = "menu" | "playing" | "paused" | "gameover"

state_machine GameController {
  initial: "menu"

  transitions: {
    menu -> playing: on_start_game
    playing -> paused: on_pause
    paused -> playing: on_resume
    playing -> gameover: on_player_death
    gameover -> menu: on_restart
  }
}

````

**When to use `.hs`:**

- Shared logic between multiple scenes
- Protocol/interface definitions
- Complex state management
- Reusable utility functions
- AI and behavior systems
- Network message handlers

---

### `.hsplus` â€” HoloScript+ (Presentation Layer)

**Purpose:** 3D/VR scene definitions with enhanced declarative syntax.

| Aspect                 | Description                                            |
| ---------------------- | ------------------------------------------------------ |
| **Layer**              | Presentation / Scene                                   |
| **Primary Use**        | Object definitions, spatial layouts, trait composition |
| **Syntax Focus**       | Declarative orbs, traits, templates, visual properties |
| **Compilation Target** | Scene graphs (Three.js, Unity, Unreal, WebXR)          |

**Capabilities:**

- **composition Definitions** â€” 3D objects with properties and behaviors
- **Trait System** â€” 165+ built-in traits (@grabbable, @physics, @audio, etc.)
- **Templates** â€” Reusable object patterns with inheritance
- **Spatial Layout** â€” Position, rotation, scale, parenting
- **Visual Properties** â€” Materials, colors, textures, shaders
- **Interactivity** â€” Click, hover, grab, collision handlers
- **Animation** â€” Keyframes, tweens, state-based animation

**Example:**

````hsplus
@manifest {
  title: "Interactive Gallery"
  version: "1.0.0"
}

template "ArtFrame" {
  @collidable
  @hoverable(highlight: true)
  material: "wood"
  depth: 0.05
}

composition gallery_room {
  @environment(preset: "museum")
  @audio_zone(reverb: 0.6)

  children: [
    composition painting_1 using "ArtFrame" {
      position: [0, 1.6, -3]
      texture: "assets/monet.jpg"
      @info_panel(title: "Water Lilies", artist: "Claude Monet")
    },

    composition bench {
      position: [0, 0.4, 0]
      @sittable
      @physics(mass: 50, kinematic: true)
    }
  ]
}
`$lang

**When to use `.hsplus`:**

- Scene and object definitions
- Visual/spatial layouts
- Interactive experiences
- VR/AR content creation
- Prototype rapid iteration
- Designer-friendly authoring

---

### `.holo` â€” Holo Files (Composition Layer)

**Purpose:** Complete world compositions with templates, objects, state, and behaviors.

| Aspect                 | Description                                                           |
| ---------------------- | --------------------------------------------------------------------- |
| **Layer**              | Composition / World                                                   |
| **Primary Use**        | Full scene definitions, game logic, AI-generated content              |
| **Syntax Focus**       | Declarative compositions, templates, objects, actions, event handlers |
| **Compilation Target** | Scene graphs, runtime executables, multi-platform builds              |


**Capabilities:**

- **Compositions** â€” Named world containers with environment, templates, objects
- **Templates** â€” Reusable object blueprints with traits, state, actions, collision handlers
- **Objects** â€” Instances with positions, properties, and behavior overrides
- **State Management** â€” Reactive state blocks with automatic UI binding
- **Actions** â€” Callable functions that mutate state or trigger effects
- **Event Handlers** â€” `on_collision`, `on_trigger_enter`, `on_key_down/up`
- **Animations** â€” `animate property from X to Y over Nms`
- **UI Panels** â€” Declarative HUD/menu definitions with data binding

**Example:**

```holo
composition "Pinball Table" {
  environment {
    skybox: "cyberpunk"
    ambient_light: 0.4
    gravity: [0, -9.81, 0]
    table_tilt_degrees: 6.5
  }

  // Game state with actions
  object "GameState" {
    state {
      score: 0
      balls: 3
      multiplier: 1
    }

    action add_score(points) {
      state.score += points * state.multiplier
    }

    action lose_ball() {
      state.balls--
      if (state.balls <= 0) {
        trigger "game_over"
      }
    }
  }

  // Reusable template with collision handler
  template "Bumper" {
    @physics
    @collidable
    @glowing

    geometry: "cylinder"
    state { points: 100 }

    on_collision(ball) {
      if (ball.has_template("Ball")) {
        GameState.add_score(state.points)
        flash_color("#ffffff", 100ms)
        pulse_scale(1.3, 50ms)
      }
    }
  }

  // Object instances
  object "Bumper1" using "Bumper" {
    position: [-0.1, 0.04, -0.15]
    glow_color: "#ff00ff"
  }

  object "Bumper2" using "Bumper" {
    position: [0.08, 0.04, -0.1]
    glow_color: "#00ffff"
  }

  // Input bindings
  on_key_down("a") { LeftFlipper.flip() }
  on_key_up("a") { LeftFlipper.release() }

  // UI panels with data binding
  panel "HUD" {
    position: "top-center"
    text "Score" { bind: GameState.state.score; style: "score" }
    text "Balls" { bind: GameState.state.balls; style: "info" }
  }

  panel "GameOver" {
    position: "center"
    visible: false
    on "game_over" { visible = true }
    button "Play Again" { @on_click: () => { GameState.reset_game() } }
  }
}

````

**When to use `.holo`:**

- Complete scene/world definitions
- AI-generated content (natural language â†’ .holo)
- Games and interactive experiences
- Templates and reusable patterns
- UI panels and HUD definitions
- Event-driven applications

---

### Layer Interaction & File Organization

`$lang
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ Application Architecture â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ â”‚
â”‚ â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚ â”‚ .holo â”‚ â† Composition Layer â”‚
â”‚ â”‚ Compositions â”‚ Full scenes, templates, objects, â”‚
â”‚ â”‚ Templates â”‚ actions, event handlers, UI panels â”‚
â”‚ â”‚ Objects â”‚ â”‚
â”‚ â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚
â”‚ â”‚ â”‚
â”‚ â–¼ â”‚
â”‚ â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚ â”‚ .hsplus â”‚ â† Presentation Layer â”‚
â”‚ â”‚ Scenes â”‚ 3D objects, traits, templates, â”‚
â”‚ â”‚ Modules â”‚ TypeScript code, system logic â”‚
â”‚ â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚
â”‚ â”‚ â”‚
â”‚ â–¼ â”‚
â”‚ â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚ â”‚ .hs â”‚ â† Logic Layer â”‚
â”‚ â”‚ Protocols â”‚ Business logic, state machines, â”‚
â”‚ â”‚ State Machines â”‚ AI behaviors, shared utilities â”‚
â”‚ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚
â”‚ â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

```

**Recommended Project Structure:**

`$lang
my-vr-project/
â”œâ”€â”€ holoscript.config.json     # Build configuration
â”œâ”€â”€ src/
â”‚   â”œâ”€â”€ main.holo              # Main composition (AI-generated)
â”‚   â”œâ”€â”€ scenes/
â”‚   â”‚   â”œâ”€â”€ lobby.holo         # Lobby composition
â”‚   â”‚   â”œâ”€â”€ game.holo          # Game composition
â”‚   â”‚   â””â”€â”€ game-systems.hsplus # Complex game modules
â”‚   â”œâ”€â”€ logic/
â”‚   â”‚   â”œâ”€â”€ game-state.hs      # Game state machine
â”‚   â”‚   â”œâ”€â”€ player.hs          # Player logic
â”‚   â”‚   â””â”€â”€ ai/
â”‚   â”‚       â”œâ”€â”€ npc.hs         # NPC behaviors
â”‚   â”‚       â””â”€â”€ pathfinding.hs # Pathfinding utilities
â”‚   â””â”€â”€ shared/
â”‚       â”œâ”€â”€ protocols.hs       # Shared interfaces
â”‚       â””â”€â”€ types.hs           # Custom type definitions
â”œâ”€â”€ assets/
â”‚   â”œâ”€â”€ models/
â”‚   â”œâ”€â”€ textures/
â”‚   â””â”€â”€ audio/
â””â”€â”€ dist/                      # Compiled output

```

**Import & Reference Patterns:**

````hsplus
// In main.hsplus - import logic from .hs files
import { GameController, PlayerState } from "./logic/game-state.hs"
import { Interactable } from "./shared/protocols.hs"

// Reference environment from .holo
@use_environment("./environments/day.holo")

composition player implements Interactable {
  state: PlayerState = PlayerState.idle
  controller: GameController

  on_interact(actor) {
    this.controller.handle_interaction(actor)
  }
}
`$lang

---

## Extended Ecosystem & Future Applications

Beyond traditional VR/AR development, HoloScript's three-layer architecture enables spatial computing across diverse industries and emerging technologies.

### `.hs` â€” Beyond VR: Universal Spatial Logic

| Domain                 | Application                                 | Key Capabilities                                                           |
| ---------------------- | ------------------------------------------- | -------------------------------------------------------------------------- |
| **IoT & Smart Spaces** | Building automation, environmental control  | Device protocols (BACnet, MQTT, Zigbee), spatial triggers, occupancy rules |
| **Robotics**           | Warehouse automation, autonomous navigation | Fleet coordination, collision avoidance, task optimization                 |
| **Digital Twins**      | Manufacturing, infrastructure monitoring    | Real-time sync, predictive simulation, what-if analysis                    |
| **Cross-Reality**      | Retail bridging physical/virtual            | Bidirectional state sync, customer journey orchestration                   |
| **Spatial Protocols**  | Federated spatial web                       | Location queries, spatial subscriptions, cross-domain linking              |


**IoT Orchestration Example:**

```hs
@device("philips-hue") @protocol("zigbee")
trait SmartLighting {
    zone: SpatialZone;

    on presenceDetected(occupant: Entity) {
        this.transitionTo(occupant.getPreference("lighting"), duration: 2s);
    }
}

space FloorPlan {
    on entity.enters(zone) {
        zone.devices.each(d => d.activate(entity.context));
    }

    on emergency.fire {
        parallel {
            zones.all.lighting.setEvacuationMode();
            zones.all.doors.unlock();
            broadcast(AudioAlert.FireEvacuation);
        }
    }
}

````

**Robotics Fleet Coordination:**

````hs
@hardware("boston-dynamics-spot")
trait AutonomousRobot {
    state Moving {
        on obstacleDetected(obs: Obstacle) {
            if obs.isDynamic { this.yield(duration: obs.estimatedClearTime); }
            else { this.replan(avoiding: obs); }
        }
    }
}

fleet WarehouseFleet {
    @realtime(latency: 10ms)
    coordinator {
        let grid = SpatialGrid(warehouse.bounds, cellSize: 2m);
        every 100ms {
            let conflicts = grid.detectPotentialCollisions(horizon: 5s);
            conflicts.each(c => c.robots.priority.lower.yield(until: c.clearTime));
        }
    }
}
`$lang

**Digital Twin Simulation:**

```hs
@twin("factory-floor-1")
@sync(source: "opcua://plc-main.factory.local")
trait DigitalTwin<T: PhysicalAsset> {
    @realtime(jitter: 1ms)
    sync {
        let physicalState = physical.readSensors();
        simulated.setState(physicalState);

        if divergence.exceeds(threshold) {
            emit Alert.TwinDivergence(this, divergence);
        }
    }

    fn whatIf(modification: Modification): ImpactAnalysis {
        let baseline = simulateFuture(24h, Scenario.Current);
        let modified = simulateFuture(24h, Scenario.With(modification));
        return ImpactAnalysis.compare(baseline, modified);
    }
}

````

---

### `.hsplus` â€” Beyond Scenes: Domain-Specific Visualization

| Domain           | Application                            | Key Capabilities                                        |
| ---------------- | -------------------------------------- | ------------------------------------------------------- |
| **Medical**      | Surgical planning, anatomy training    | DICOM/volumetric data, haptic simulation, assessment    |
| **Scientific**   | Molecular dynamics, data visualization | PDB structures, MD trajectories, pharmacophore analysis |
| **Architecture** | BIM visualization, design review       | IFC import, clash detection, sun studies, collaboration |
| **Live Events**  | Concert production, show control       | DMX/lighting rigs, timecode sync, pyro simulation       |
| **Metaverse**    | Cross-platform assets                  | Multi-platform export, LOD management, avatar binding   |
| **Education**    | Interactive training, simulations      | SCORM/xAPI, adaptive learning, procedural assessment    |

**Medical Holographic Interface:**

````hsplus
@display("looking-glass-8k")
scene SurgicalPlanning {
    @medical("dicom://pacs.hospital.local/patient/12345")
    anatomy PatientAnatomy {
        render {
            volume ct_scan { transfer_function: bone_tissue_tf; opacity: 0.3; }
            segmentation.organs.each(organ => {
                mesh organ.surface {
                    material: organ.tissueMaterial;
                    interaction: grabbable, sliceable;
                }
            });
        }
    }

    @planning
    tool SurgicalPath {
        visualization {
            anatomy.criticalStructures.each(structure => {
                let distance = structure.distanceTo(this.trajectory);
                if distance < safetyMargin {
                    highlight structure { color: dangerGradient(distance); pulse: true; }
                }
            });
        }
    }
}
`$lang

**Scientific Molecular Visualization:**

```hsplus
@compute("cuda")
scene MolecularDynamics {
    @pdb("6LU7")  // COVID-19 main protease
    molecule Protein {
        representation: cartoon;
        surface solvent_accessible {
            coloring: electrostatic_potential;
            colormap: red_white_blue;
        }
    }

    @docking_result("autodock_results.dlg")
    interaction DockingPose {
        visualization {
            poses[current_pose].interactions.each(int => {
                match int.type {
                    HBond => dashed_line { color: #00ffff; label: "{int.distance}Ã…"; },
                    PiStacking => double_arc { color: #00ff00; }
                }
            });
        }
    }
}

````

**Live Event Production:**

````hsplus
@venue("madison-square-garden")
@timecode(source: "ltc://show-control.local")
scene ConcertProduction {
    @dmx(universe: [1, 2, 3, 4])
    lighting LightingRig {
        fixtures.each(f => {
            beam_visualization {
                origin: f.position;
                direction: f.pan_tilt.direction;
                color: f.current_color;
                scattering: haze_density * 0.3;
            }
        });
    }

    @timecode_sync
    timeline ShowCues {
        cue "song_1_drop" at 00:01:23:15 {
            parallel {
                lighting.recall("full_blast");
                pyro.fire(group: "downstage_gerbs");
                video.play("drop_visual");
            }
        }
    }
}
`$lang

**Cross-Platform Metaverse Asset:**

```hsplus
@interop(targets: ["vrchat", "roblox", "spatial", "meta-horizons", "decentraland"])
asset VirtualFashionItem {
    mesh {
        lod0: "jacket_high.fbx" { triangles: 50000; distance: 0..5m; }

        @platform("roblox") override { max_triangles: 5000; }
        @platform("decentraland") override { max_triangles: 1500; simplify: true; }
    }

    @humanoid
    rigging {
        @platform("vrchat", "meta-horizons")
        dynamic_bones {
            chain "jacket_bottom" { stiffness: 0.3; gravity: 0.1; }
        }
    }
}

````

---

### `.holo` â€” Beyond Config: World Infrastructure

| Domain                | Application                   | Key Capabilities                                      |
| --------------------- | ----------------------------- | ----------------------------------------------------- |
| **Universal Worlds**  | City-scale environments       | GIS integration, procedural generation, LOD streaming |
| **Reality Anchoring** | AR placement across platforms | Cloud anchors, VPS, marker tracking, multi-platform   |
| **Deployment**        | Cross-platform builds         | visionOS, Quest, HoloLens, Web, Unity targets         |
| **Smart Buildings**   | Facility management           | BACnet/MQTT, digital twin sync, automation rules      |
| **Spatial Web**       | Federated spatial services    | Location APIs, spatial subscriptions, cross-domain    |

**Universal World Description:**

````holo
@world("city-block-downtown-sf")
world CityBlock {
    @geo
    location {
        center: GeoCoordinate(37.7749, -122.4194);
        bounds: GeoBounds.fromCenter(center, radius: 200m);
        crs: "EPSG:4326";
    }

    @gis("osm://buildings")
    buildings {
        lod {
            lod0: footprint_extrusion;
            lod2: facade_detail;
            lod3: full_model;
        }
        facade_rules {
            commercial: "facade_commercial.grammar";
            residential: "facade_residential.grammar";
        }
    }

    @dynamic
    simulation {
        traffic { behavior: "sumo_simulation.cfg"; }
        pedestrians { density: 50..200; behavior: "social_force_model"; }
        weather { source: "openweathermap://api"; }
    }

    @export
    targets {
        cesium { format: "3d-tiles"; }
        omniverse { format: ".usd"; }
    }
}
`$lang

**Reality Anchoring Configuration:**

```holo
@ar_experience("nike-store-ar")
anchoring RetailARExperience {
    @platform_anchors
    strategies {
        @platform("arkit")
        arkit_anchoring {
            primary: world_tracking { scene_reconstruction: true; };
            persistent_anchors { cloud_anchor_service: "arkit_location_anchors"; }
        }

        @platform("arcore")
        arcore_anchoring {
            primary: cloud_anchors { anchor_ids: ["nike_nyc_main"]; };
            fallback: augmented_images { database: "arcore_markers.imgdb"; };
        }

        @platform("meta_quest")
        quest_anchoring {
            scene_understanding { furniture_detection: true; };
            multiplayer { colocation_mode: true; }
        }
    }

    @placement
    content_rules {
        rule "product_on_shelf" {
            trigger: gaze_at(fixtures.shelf);
            content: ProductModel { scale: real_world; interaction: rotatable; };
        }
    }
}

````

**Cross-Platform Deployment:**

````holo
@app("retail-spatial-experience")
deployment SpatialAppDeployment {
    @targets
    platforms {
        visionos {
            sdk: "visionos-2.0";
            capabilities { hand_tracking: true; shared_space: true; }
            distribution { store: "app_store_connect"; }
        }

        quest {
            sdk: "meta-xr-sdk-65.0";
            devices: ["quest_3", "quest_pro"];
            capabilities { passthrough: true; scene_api: true; }
        }

        web {
            framework: "threejs";
            capabilities {
                webxr { modes: ["immersive-ar", "immersive-vr"]; };
                pwa { offline: true; };
            }
        }
    }

    @pipeline
    cicd {
        stages: [validate, build, test, deploy];
        rollout { strategy: "canary"; stages: [1%, 10%, 50%, 100%]; }
    }
}
`$lang

**Smart Building Integration:**

```holo
@smart_building("stanford-engineering-quad")
@protocols(["bacnet", "modbus", "mqtt", "opcua"])
integration SmartCampusIntegration {
    @data_fabric
    integration {
        adapters {
            bacnet { polling_interval: 5s; }
            mqtt { topics: ["campus/+/sensors/#"]; }
        }
        semantic_model { ontology: "brick_schema_1.3"; }
    }

    @spatial_integration
    ar_integration {
        positioning {
            technologies: [WiFi_RTT, BLE_Beacons, UWB_Anchors, LiDAR_SLAM];
            fusion: kalman_filter;
        }

        overlays {
            overlay "hvac_airflow" {
                trigger: user_in(zones.mechanical);
                content { flow_arrows { color: temperature_gradient(temp); } }
            }
        }
    }

    @automation
    rules {
        rule "fire_emergency" {
            trigger: fire_system.alarm_active;
            action {
                parallel { hvac.shutdown(); elevators.recall(); doors.unlock(); }
                ar_broadcast { content: evacuation_overlay(nearest_exits); }
            }
        }
    }
}

````

---

### Industry Application Matrix

| Industry          | `.hs` Logic                                 | `.hsplus` Presentation              | `.holo` Configuration                |
| ----------------- | ------------------------------------------- | ----------------------------------- | ------------------------------------ |
| **Healthcare**    | Clinical workflows, equipment orchestration | Surgical viz, anatomy training      | Hospital integration, compliance     |
| **Manufacturing** | Robot coordination, quality rules           | Digital twin viz, maintenance AR    | Factory mapping, MES integration     |
| **Retail**        | Inventory automation, journey logic         | Product viz, virtual try-on         | Store anchoring, POS integration     |
| **Architecture**  | BIM compliance, energy optimization         | Design review, client presentations | Site anchoring, GIS integration      |
| **Entertainment** | Show control, safety interlocks             | Stage viz, lighting preview         | Venue mapping, broadcast integration |
| **Education**     | Adaptive learning, assessment               | Interactive 3D, lab simulations     | LMS connectivity, accessibility      |
| **Smart Cities**  | Traffic optimization, emergency response    | Urban viz, planning tools           | Multi-building IoT, public services  |

---

### Design Principles

1. **Separation of Concerns** â€” Logic, presentation, and configuration remain cleanly separated for cross-domain reuse
1. **Platform Abstraction** â€” Configuration layer handles platform-specific details; same logic/presentation deploys everywhere
1. **Real-World Integration** â€” First-class support for IoT protocols, positioning systems, building management
1. **Safety & Compliance** â€” Emergency handling, access control, and audit trails are foundational
1. **Collaborative by Default** â€” Multi-user scenarios, real-time sync, and shared spatial anchors are built-in

---

## Current Status (v3.42.0 - February 2026)

### âœ… Complete

- `.hsplus` / `.holo` parsers (historical snapshot: 1,800+ traits at the time)
- Type system (generics, unions, type guards)
- Template system, 16 structural directives
- Formatter, Linter (28 rules), LSP, CLI
- VS Code extension with debugger
- Testing framework (17,740+ tests across 1,062 files)
- **Brittney AI Game Generation Features** (v2.2.0):
  - `npc` - NPC Behavior Trees with types, models, dialogue references
  - `quest` - Quest Definition System with objectives, rewards, branching
  - `ability` - Ability/Spell definitions with class requirements
  - `dialogue` - Dialogue Trees with character, emotion, options
  - `state_machine` - State Machines for boss phases and complex behaviors
  - `achievement` - Achievement System with points and hidden unlocks
  - `talent_tree` - Talent Trees with tiers, nodes, and dependencies

---

## 2026 Roadmap (AI-Accelerated)

### Q1: Foundation âœ… (Complete)

| Feature                                | Agent     | Status   |
| -------------------------------------- | --------- | -------- |
| Semantic scene syntax                  | Architect | âœ… Done |
| Logic block parsing                    | Architect | âœ… Done |
| Template system                        | Architect | âœ… Done |
| Type guards                            | Architect | âœ… Done |
| Debug adapter                          | IDE       | âœ… Done |
| Unified build                          | Tooling   | âœ… Done |
| Brittney AI: NPC behavior trees        | Architect | âœ… Done |
| Brittney AI: Quest definition system   | Architect | âœ… Done |
| Brittney AI: Ability/spell definitions | Architect | âœ… Done |
| Brittney AI: Dialogue trees            | Architect | âœ… Done |
| Brittney AI: State machines            | Architect | âœ… Done |
| Brittney AI: Achievements              | Architect | âœ… Done |
| Brittney AI: Talent trees              | Architect | âœ… Done |
| **Phase 5: Asset Pipeline**            | Architect | âœ… Done |
| **Phase 6: Spatial Features**          | Architect | âœ… Done |

### Q1-Q2: Sprint 1 (Feb-Mar) - 4 weeks âœ… COMPLETE

All agents work in parallel:

| Feature                        | Agent     | Days |
| ------------------------------ | --------- | ---- |
| Config inheritance (`extends`) | Tooling   | 3    |
| Format on save                 | IDE       | 2    |
| Range formatting               | IDE       | 2    |
| Code splitting                 | Tooling   | 4    |
| Visual regression tests        | QA        | 3    |
| Spread operator (`...`)        | Architect | 3    |
| Null coalescing assignment     | Architect | 1    |
| Improved error recovery        | Architect | 4    |

<summary><strong>ðŸ“‹ Sprint 1 Detailed Specifications</strong></summary>

#### Config Inheritance (`extends`) - Tooling Agent

**Location:** `packages/cli/src/config/`

**What to build:**

````json
// holoscript.config.json
{
  "extends": "./base.config.json",
  "extends": "@holoscript/config-recommended",
  "compilerOptions": {
    /* overrides */
  }
}
`$lang

**Implementation:**

1. Add `extends` field to config schema in `packages/cli/src/config/schema.ts`
1. Create `ConfigResolver` class that:
   - Resolves local paths (`./base.config.json`)
   - Resolves package paths (`@holoscript/config-*`)
   - Deep merges configs (child overrides parent)
   - Detects circular dependencies
1. Support array syntax: `"extends": ["./base.json", "./platform.json"]`

**Files to modify:**

- `packages/cli/src/config/schema.ts` - Add extends to schema
- `packages/cli/src/config/loader.ts` - Add resolution logic
- `packages/cli/src/config/merge.ts` - Create deep merge utility

**Acceptance criteria:**

- [x] Local file extends works
- [x] npm package extends works
- [x] Multiple extends (array) works
- [x] Circular dependency detection with helpful error
- [x] 100% test coverage for resolver

---

#### Format on Save - IDE Agent

**Location:** `packages/vscode/src/`

**What to build:**
VS Code extension auto-formats `.hsplus`/`.holo` files on save.

**Implementation:**

1. Register `DocumentFormattingEditProvider` in extension
1. Connect to `@holoscript/formatter` package
1. Add settings:
   ```json
   "holoscript.formatOnSave": true,
   "holoscript.formatOnSaveTimeout": 500
````

1. Handle large files with progress indicator

**Files to modify:**

- `packages/vscode/src/extension.ts` - Register provider
- `packages/vscode/src/formatting.ts` - Create formatting provider
- `packages/vscode/package.json` - Add configuration schema

**Acceptance criteria:**

- [x] Files format on save when enabled
- [x] Respects `.holoscriptrc` formatting options
- [x] Shows progress for large files (>1000 lines)
- [x] Timeout prevents hanging on malformed files
- [x] Setting to disable per-workspace

---

#### Range Formatting - IDE Agent

**Location:** `packages/formatter/src/`, `packages/vscode/src/`

**What to build:**
Format only selected code, not entire file.

**Implementation:**

1. Add `formatRange(source, startLine, endLine, options)` to formatter
1. Detect block boundaries (don't break mid-expression)
1. Register `DocumentRangeFormattingEditProvider` in VS Code

**Algorithm:**

```typescript
function formatRange(source: string, range: Range): string {
  // 1. Expand range to nearest block boundaries
  // 2. Extract block with context
  // 3. Format extracted block
  // 4. Replace only changed lines
}
```

**Files to modify:**

- `packages/formatter/src/index.ts` - Add formatRange export
- `packages/formatter/src/range.ts` - Create range formatter
- `packages/vscode/src/formatting.ts` - Add range provider

**Acceptance criteria:**

- [x] Formats selection without affecting other code
- [x] Expands to complete blocks automatically
- [x] Preserves surrounding whitespace
- [x] Works with nested structures

---

#### Code Splitting - Tooling Agent

**Location:** `packages/cli/src/build/`

**What to build:**
Split large scenes into chunks for lazy loading.

**Implementation:**

1. Analyze scene graph for split points
1. Generate chunk manifest
1. Create loader that fetches chunks on demand

**Output structure:**

`$lang
dist/
main.hsplus.js # Entry point + manifest
chunks/
zone-a.chunk.js # Lazy loaded
zone-b.chunk.js
manifest.json # Chunk dependencies

````

**Split strategies:**

- By `@zones` directive boundaries
- By file imports
- By explicit `@chunk` annotation

**Files to create:**

- `packages/cli/src/build/splitter.ts` - Chunk analyzer
- `packages/cli/src/build/manifest.ts` - Manifest generator
- `packages/core/src/runtime/loader.ts` - Runtime chunk loader

**Acceptance criteria:**

- [x] Automatic splitting by zones
- [x] Manual `@chunk("name")` annotation support
- [x] Manifest tracks dependencies
- [x] Chunks load on demand at runtime
- [x] Preload hints for likely-needed chunks

---

#### Visual Regression Tests - QA Agent

**Location:** `packages/test/src/visual/`

**What to build:**
Screenshot comparison testing for rendered scenes.

**Implementation:**

1. Headless renderer using Puppeteer/Playwright
1. Screenshot capture at specific viewpoints
1. Pixel-diff comparison with threshold
1. HTML report generation

**Test syntax:**

```typescript
describe('Gallery Scene', () => {
  visualTest('default-view', {
    scene: 'gallery.hsplus',
    camera: { position: [0, 1.6, 5], target: [0, 1, 0] },
    threshold: 0.01, // 1% diff allowed
  });
});
`$lang

**Files to create:**

- `packages/test/src/visual/renderer.ts` - Headless renderer
- `packages/test/src/visual/capture.ts` - Screenshot capture
- `packages/test/src/visual/diff.ts` - Image comparison
- `packages/test/src/visual/report.ts` - HTML report generator

**Acceptance criteria:**

- [x] Captures screenshots at defined viewpoints
- [x] Compares against baseline images
- [x] Configurable diff threshold
- [x] Generates visual diff report
- [x] CI integration with artifact upload

---

#### Spread Operator (`...`) - Architect Agent

**Location:** `packages/core/src/parser/`

**What to build:**

```hsplus
template "Base" { color: "red", scale: 1 }

composition item {
  ...Base           // Spread template properties
  scale: 2          // Override
  children: [
    ...existingChildren,
    composition newChild {}
  ]
}

````

**Implementation:**

1. Add `SpreadExpression` AST node type
1. Parse `...identifier` in object and array contexts
1. Type checker validates spread target is object/array
1. Evaluate spread at compile time for templates

**Parser changes:**

````typescript
// In parseObjectBody()
if (this.match('...')) {
  const target = this.parseIdentifier();
  return { type: 'SpreadExpression', target };
}
`$lang

**Files to modify:**

- `packages/core/src/types.ts` - Add SpreadExpression type
- `packages/core/src/parser/HoloScriptPlusParser.ts` - Parse spread
- `packages/core/src/HoloScriptTypeChecker.ts` - Validate spread

**Acceptance criteria:**

- [x] Object spread in composition definitions
- [x] Array spread in children/collections
- [x] Template property spreading
- [x] Type checking for spread targets
- [x] Error on spreading non-spreadable types

---

#### Null Coalescing Assignment - Architect Agent

**Location:** `packages/core/src/parser/`

**What to build:**

```hsplus
composition item {
  // Assign only if null/undefined
  color ??= "default"

  on_load: {
    this.data ??= loadDefaults()
  }
}

````

**Implementation:**

1. Add `??=` token to lexer
1. Parse as assignment with null-check semantics
1. Desugar to: `x = x ?? value`

**Files to modify:**

- `packages/core/src/parser/Lexer.ts` - Add ??= token
- `packages/core/src/parser/HoloScriptPlusParser.ts` - Parse ??=
- `packages/core/src/types.ts` - Add NullCoalescingAssignment

**Acceptance criteria:**

- [x] `??=` parses correctly
- [x] Only assigns when left side is null/undefined
- [x] Works in property definitions
- [x] Works in logic blocks
- [x] Type inference handles both branches

---

#### Improved Error Recovery - Architect Agent

**Location:** `packages/core/src/parser/`

**What to build:**
Parser continues after errors, collecting multiple diagnostics.

**Current behavior:** Parser stops at first error
**Target behavior:** Parser recovers and reports all errors

**Recovery strategies:**

1. **Synchronization points:** `}`, `orb`, `template`, `@directive`
1. **Skip to next statement:** On expression error, skip to `;` or `}`
1. **Insert missing tokens:** Missing `}` â†’ insert and continue

**Implementation:**

```typescript
class ErrorRecoveryParser {
  private errors: Diagnostic[] = [];

  parseOrb(): OrbNode | null {
    try {
      return this.parseOrbInner();
    } catch (e) {
      this.errors.push(e);
      this.synchronize(); // Skip to next safe point
      return null; // Return partial AST
    }
  }
}
`$lang

**Files to modify:**

- `packages/core/src/parser/HoloScriptPlusParser.ts` - Add recovery
- `packages/core/src/parser/ErrorRecovery.ts` - Create recovery strategies

**Acceptance criteria:**

- [x] Multiple errors reported per parse
- [x] Partial AST returned for valid portions
- [x] Recovery doesn't cause cascading false errors
- [x] LSP shows all errors, not just first


### Q2: Sprint 2 (Apr-May) - 4 weeks âœ… COMPLETE

| Feature                   | Agent     | Days |
| ------------------------- | --------- | ---- |
| Incremental parsing       | Architect | 5    |
| Watch mode (`--watch`)    | Tooling   | 2    |
| Web playground (basic)    | IDE       | 5    |
| Interactive language tour | Docs      | 4    |
| Performance benchmarks    | QA        | 3    |


<summary><strong>ðŸ“‹ Sprint 2 Detailed Specifications</strong></summary>

#### Incremental Parsing - Architect Agent

**Location:** `packages/core/src/parser/`

**What to build:**
Only re-parse changed portions of files, not entire document.

**Architecture:**

```

â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ Source File â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Chunk 1: @manifest { ... } [cached] â”‚
â”‚ Chunk 2: composition item { ... } [dirty] â”‚ â† Only re-parse this
â”‚ Chunk 3: template "X" { ... } [cached] â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
`$lang

**Implementation:**

1. **Chunk Detection:** Split source at top-level boundaries
   - `@directive` blocks
   - `orb` definitions
   - `template` definitions
   - `environment` blocks

1. **Hash-based Cache:**

```typescript
interface ParseCache {
  chunks: Map<
    string,
    {
      hash: string; // Content hash
      ast: ASTNode; // Cached AST
      dependencies: string[]; // Referenced identifiers
    }
  >;
}
```

1. **Invalidation Rules:**
   - Content hash changed â†’ re-parse chunk
   - Dependency changed â†’ re-parse dependent chunks
   - Structural change (new chunk) â†’ rebuild chunk map

**Files to create:**

- `packages/core/src/parser/IncrementalParser.ts` - Main incremental logic
- `packages/core/src/parser/ChunkDetector.ts` - Boundary detection
- `packages/core/src/parser/ParseCache.ts` - Caching layer

**Performance targets:**

- Small edit in 1000-line file: <10ms (vs 100ms+ full parse)
- Cache hit rate: >90% for typical editing

**Acceptance criteria:**

- [x] Edits within composition only re-parse that orb
- [x] Adding new composition doesn't invalidate others
- [x] Reference changes propagate correctly
- [x] Memory usage stays bounded (LRU eviction)

---

#### Watch Mode (`--watch`) - Tooling Agent

**Location:** `packages/cli/src/commands/`

**What to build:**

```bash
holoscript build --watch
holoscript build -w

# Output:
# [12:34:56] Watching for changes...
# [12:34:58] Changed: src/scene.hsplus
# [12:34:58] Built in 45ms
# [12:35:02] Changed: src/items.hsplus
# [12:35:02] Built in 12ms (incremental)
`$lang

**Implementation:**

1. Use `chokidar` for cross-platform file watching
1. Debounce rapid changes (100ms default)
1. Integrate with incremental parser
1. Show colored terminal output with timestamps

**Features:**

- Watch `.hsplus`, `.holo`, `holoscript.config.json`
- Ignore `node_modules`, `.git`, `dist`
- Clear terminal on rebuild (optional)
- Error overlay that persists until fixed

**Files to modify:**

- `packages/cli/src/commands/build.ts` - Add --watch flag
- `packages/cli/src/watch/Watcher.ts` - Create file watcher
- `packages/cli/src/watch/Reporter.ts` - Terminal output

**Acceptance criteria:**

- [x] Detects file changes within 100ms
- [x] Debounces rapid saves
- [x] Shows build time for each rebuild
- [x] Graceful shutdown on Ctrl+C
- [x] Works on Windows, macOS, Linux

---

#### Web Playground (Basic) - IDE Agent

**Location:** `packages/playground/` (new package)

**What to build:**
Browser-based HoloScript editor with live preview.

**Architecture:**

```

â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ Web Playground â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Monaco Editor â”‚ 3D Preview (Three.js) â”‚
â”‚ â”‚ â”‚
â”‚ @manifest { â”‚ â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚ title: "X" â”‚ â”‚ â”‚ â”‚
â”‚ } â”‚ â”‚ Live Scene â”‚ â”‚
â”‚ â”‚ â”‚ â”‚ â”‚
â”‚ composition cube { â”‚ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚
â”‚ @grabbable â”‚ â”‚
â”‚ } â”‚ [Console Output] â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ [Run] [Share] [Export] Examples â–¼ â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
`$lang

**Tech stack:**

- Monaco Editor with HoloScript language support
- Three.js for 3D preview
- Web Workers for parsing (non-blocking)
- localStorage for auto-save

**Implementation:**

1. **Editor Setup:**
   - Register HoloScript language in Monaco
   - Syntax highlighting from TextMate grammar
   - Auto-complete from LSP (compiled to WASM)

1. **Preview Renderer:**
   - Parse HoloScript â†’ Scene Graph
   - Scene Graph â†’ Three.js scene
   - Hot reload on code change

1. **Sharing:**
   - Encode scene in URL hash (gzip + base64)
   - Short URLs via API (optional)

**Files to create:**

```
packages/playground/
â”œâ”€â”€ src/
â”‚   â”œâ”€â”€ editor/
â”‚   â”‚   â”œâ”€â”€ monaco-setup.ts
â”‚   â”‚   â”œâ”€â”€ language-config.ts
â”‚   â”‚   â””â”€â”€ theme.ts
â”‚   â”œâ”€â”€ preview/
â”‚   â”‚   â”œâ”€â”€ renderer.ts
â”‚   â”‚   â”œâ”€â”€ scene-builder.ts
â”‚   â”‚   â””â”€â”€ controls.ts
â”‚   â”œâ”€â”€ sharing/
â”‚   â”‚   â””â”€â”€ url-encoder.ts
â”‚   â””â”€â”€ index.ts
â”œâ”€â”€ public/
â”‚   â””â”€â”€ index.html
â””â”€â”€ package.json
`$lang

**Acceptance criteria:**

- [x] Monaco editor with syntax highlighting
- [x] Live 3D preview updates on type
- [x] Basic orbit controls in preview
- [x] Share via URL works
- [x] 5 example scenes in dropdown
- [x] Mobile-responsive layout

---

#### Interactive Language Tour - Docs Agent

**Location:** `docs/tour/` or integrated in playground

**What to build:**
Step-by-step tutorial teaching HoloScript basics.

**Structure:**

```

Lesson 1: Hello Orb
â”œâ”€â”€ Concept: Basic composition syntax
â”œâ”€â”€ Interactive: Type your first orb
â”œâ”€â”€ Challenge: Change the color
â””â”€â”€ Next: Properties

Lesson 2: Properties
â”œâ”€â”€ Concept: Position, scale, color
â”œâ”€â”€ Interactive: Move the orb
â”œâ”€â”€ Challenge: Create a row of orbs
â””â”€â”€ Next: Traits

Lesson 3: Traits
â”œâ”€â”€ Concept: @grabbable, @physics
â”œâ”€â”€ Interactive: Make it grabbable
â”œâ”€â”€ Challenge: Physics simulation
â””â”€â”€ Next: Templates
...
`$lang

**10 Lessons:**

1. Hello composition - Basic syntax
1. Properties - Position, scale, color
1. Traits - @grabbable, @physics
1. Templates - Reusable definitions
1. Logic Blocks - on_click, on_tick
1. Directives - @manifest, @zones
1. Environment - Lighting, skybox
1. Networking - @synced, @networked
1. Accessibility - @accessible, @alt_text
1. Full Scene - Put it all together

**Format per lesson:**

```markdown
# Lesson 3: Traits

Traits add **behavior** to objects. The `@grabbable` trait
lets users pick up objects in VR.

## Try it:

[Interactive Editor - pre-filled code]

## Your turn:

Add `@physics` to make the composition fall with gravity.

[Check Answer] [Hint] [Skip]
```

**Files to create:**

`$lang
docs/tour/
â”œâ”€â”€ lessons/
â”‚ â”œâ”€â”€ 01-hello-orb.md
â”‚ â”œâ”€â”€ 02-properties.md
â”‚ ...
â”‚ â””â”€â”€ 10-full-scene.md
â”œâ”€â”€ components/
â”‚ â”œâ”€â”€ LessonViewer.tsx
â”‚ â”œâ”€â”€ InteractiveEditor.tsx
â”‚ â””â”€â”€ ProgressTracker.tsx
â””â”€â”€ index.tsx

```

**Acceptance criteria:**

- [x] 10 lessons covering core concepts
- [x] Each lesson has interactive editor
- [x] Progress saved to localStorage
- [x] Works on mobile (touch-friendly)
- [x] Completion certificate/badge

---

#### Performance Benchmarks - QA Agent

**Location:** `packages/benchmark/` (new package)

**What to build:**
Automated performance testing suite.

**Benchmarks to create:**

1. **Parser Benchmarks:**
   - Parse 100-line file
   - Parse 1000-line file
   - Parse 10000-line file
   - Incremental parse (single edit)

1. **Type Checker Benchmarks:**
   - Type check simple scene
   - Type check complex scene (100 orbs)
   - Type check with generics

1. **Formatter Benchmarks:**
   - Format small file
   - Format large file
   - Range format

1. **LSP Benchmarks:**
   - Completion latency
   - Hover latency
   - Go-to-definition latency

**Output format:**

`$lang
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ HoloScript Performance Benchmarks               â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Parser                                          â”‚
â”‚   parse-100-lines      2.3ms   â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–‘â–‘  +5%  â”‚
â”‚   parse-1000-lines    18.7ms   â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆ  -2%  â”‚
â”‚   incremental-edit     0.8ms   â–ˆâ–ˆâ–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘  new  â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ LSP                                             â”‚
â”‚   completion          45ms     â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–‘â–‘  -10% â”‚
â”‚   hover               12ms     â–ˆâ–ˆâ–ˆâ–ˆâ–‘â–‘â–‘â–‘â–‘â–‘  same â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

```

**Implementation:**

- Use `tinybench` for micro-benchmarks
- Compare against baseline (stored in repo)
- CI integration with regression alerts
- Historical tracking in JSON

**Files to create:**

`$lang
packages/benchmark/
â”œâ”€â”€ src/
â”‚ â”œâ”€â”€ suites/
â”‚ â”‚ â”œâ”€â”€ parser.bench.ts
â”‚ â”‚ â”œâ”€â”€ typechecker.bench.ts
â”‚ â”‚ â”œâ”€â”€ formatter.bench.ts
â”‚ â”‚ â””â”€â”€ lsp.bench.ts
â”‚ â”œâ”€â”€ fixtures/
â”‚ â”‚ â”œâ”€â”€ small.hsplus
â”‚ â”‚ â”œâ”€â”€ medium.hsplus
â”‚ â”‚ â””â”€â”€ large.hsplus
â”‚ â”œâ”€â”€ reporter.ts
â”‚ â””â”€â”€ index.ts
â”œâ”€â”€ baselines/
â”‚ â””â”€â”€ baseline.json
â””â”€â”€ package.json

````

**Acceptance criteria:**

- [x] All 4 benchmark suites implemented
- [x] Baseline comparison with % change
- [x] CI fails on >20% regression
- [x] HTML report generation
- [x] Historical trend graphs


### Q2-Q3: Sprint 3 (Jun-Jul) - 4 weeks

| Feature                    | Agent     | Days |
| -------------------------- | --------- | ---- |
| Trait bounds/constraints   | Architect | 5    |
| Better type inference      | Architect | 4    |
| Type aliases               | Architect | 2    |
| Neovim plugin              | IDE       | 3    |
| Video tutorials (5 videos) | Docs      | 5    |


<summary><strong>ðŸ“‹ Sprint 3 Detailed Specifications</strong></summary>

#### Trait Bounds/Constraints - Architect Agent

**Location:** `packages/core/src/HoloScriptTypeChecker.ts`

**What to build:**
Constrain which traits can be combined.

**Syntax:**

```hsplus
// Trait requires another trait
@physics requires @collidable

// Trait conflicts with another
@static conflicts @physics

// Trait group (one of)
@interaction_mode oneof [@grabbable, @clickable, @hoverable]

// Custom constraint
@networked requires (@synced or @replicated)
`$lang

**Use cases:**

- `@cloth` requires `@mesh` (can't apply cloth physics to point)
- `@grabbable` conflicts `@static` (can't grab static object)
- `@vr_only` conflicts `@ar_only` (mutually exclusive)

**Implementation:**

1. **Constraint Definition:**

```typescript
interface TraitConstraint {
  type: 'requires' | 'conflicts' | 'oneof';
  source: string; // Trait being constrained
  targets: string[]; // Related traits
  message?: string; // Custom error message
}

````

1. **Validation Phase:**
   - After parsing, before codegen
   - Check all trait combinations on each orb
   - Report all violations (not just first)

1. **Built-in Constraints:**

````typescript
const BUILTIN_CONSTRAINTS: TraitConstraint[] = [
  { type: 'requires', source: 'cloth', targets: ['mesh'] },
  { type: 'requires', source: 'physics', targets: ['collidable'] },
  { type: 'conflicts', source: 'static', targets: ['physics', 'grabbable'] },
  { type: 'conflicts', source: 'vr_only', targets: ['ar_only'] },
];
`$lang

**Files to modify:**

- `packages/core/src/types.ts` - Add TraitConstraint type
- `packages/core/src/traits/constraints.ts` - Define built-in constraints
- `packages/core/src/HoloScriptTypeChecker.ts` - Validate constraints

**Acceptance criteria:**

- [x] `requires` constraints enforced
- [x] `conflicts` constraints enforced
- [x] `oneof` groups enforced
- [x] Custom constraints in config file
- [x] Clear error messages with fix suggestions

---

#### Better Type Inference - Architect Agent

**Location:** `packages/core/src/HoloScriptTypeChecker.ts`

**What to build:**
Infer types without explicit annotations.

**Current (requires annotation):**

```hsplus
composition item {
  count: number = 0
  name: string = "Item"
}

````

**Target (inferred):**

````hsplus
composition item {
  count = 0           // Inferred: number
  name = "Item"       // Inferred: string
  position = [0,0,0]  // Inferred: vec3
  on_click = () => {} // Inferred: () => void
}
`$lang

**Inference rules:**

| Literal | Inferred Type |
| --------- | --------------- |
| `0`, `1.5`, `-3` | `number` |
| `"text"` | `string` |
| `true`, `false` | `boolean` |
| `[x, y, z]` (3 numbers) | `vec3` |
| `[x, y, z, w]` (4 numbers) | `vec4` / `quat` |
| `"#fff"`, `"rgb(...)"` | `color` |
| `() => {}` | Function type |
| `{ a: 1, b: 2 }` | Object type |


**Bidirectional inference:**

```hsplus
// Context provides expected type
composition item {
  @physics(mass: 1.5)  // mass expects number, 1.5 is number âœ“

  children: [
    composition child {}  // children expects Orb[], composition is composition âœ“
  ]
}

````

**Files to modify:**

- `packages/core/src/HoloScriptTypeChecker.ts` - Add inference logic
- `packages/core/src/types.ts` - Add inference context

**Acceptance criteria:**

- [x] Primitive literals inferred correctly
- [x] Array literals inferred (vec3, vec4, arrays)
- [x] Function types inferred
- [x] Bidirectional inference from context
- [x] Hover shows inferred type in LSP

---

#### Type Aliases - Architect Agent

**Location:** `packages/core/src/parser/`, `packages/core/src/types.ts`

**What to build:**

```hsplus
// Define type aliases
type Color = string | [number, number, number]
type Position = [number, number, number]
type Handler = (event: Event) => void

// Use in definitions
composition item {
  color: Color = "#ff0000"
  position: Position = [0, 1, 0]
  on_click: Handler = (e) => { ... }
}

// Generic type aliases
type List<T> = T[]
type Optional<T> = T | null
type Pair<A, B> = [A, B]
`$lang

**Implementation:**

1. **Parser:** Add `type` keyword for alias declarations
1. **Type Registry:** Store aliases in symbol table
1. **Resolution:** Expand aliases during type checking
1. **Generics:** Support type parameters

**Files to modify:**

- `packages/core/src/parser/HoloScriptPlusParser.ts` - Parse type aliases
- `packages/core/src/types.ts` - Add TypeAlias node
- `packages/core/src/HoloScriptTypeChecker.ts` - Resolve aliases

**Acceptance criteria:**

- [x] Simple type aliases work
- [x] Union type aliases work
- [x] Generic type aliases work
- [x] Recursive types detected and error
- [x] LSP shows expanded type on hover

---

#### Neovim Plugin - IDE Agent

**Location:** `packages/neovim/` (new package)

**What to build:**
Neovim plugin with LSP integration.

**Features:**

- Syntax highlighting (Tree-sitter grammar)
- LSP client configuration
- Snippets for common patterns
- Format on save

**Structure:**

```

packages/neovim/
â”œâ”€â”€ lua/
â”‚ â””â”€â”€ holoscript/
â”‚ â”œâ”€â”€ init.lua # Plugin entry
â”‚ â”œâ”€â”€ lsp.lua # LSP config
â”‚ â””â”€â”€ snippets.lua # Snippet definitions
â”œâ”€â”€ queries/
â”‚ â””â”€â”€ holoscript/
â”‚ â”œâ”€â”€ highlights.scm # Syntax highlighting
â”‚ â””â”€â”€ injections.scm # Embedded languages
â”œâ”€â”€ ftdetect/
â”‚ â””â”€â”€ holoscript.lua # File type detection
â””â”€â”€ README.md
`$lang

**LSP Configuration:**

```lua
-- lua/holoscript/lsp.lua
local lspconfig = require('lspconfig')

lspconfig.holoscript.setup({
  cmd = { 'holoscript-lsp', '--stdio' },
  filetypes = { 'hsplus', 'holo' },
  root_dir = lspconfig.util.root_pattern('holoscript.config.json', '.git'),
})

```

**Installation methods:**

- lazy.nvim
- packer.nvim
- vim-plug
- Manual

**Acceptance criteria:**

- [x] Syntax highlighting works
- [x] LSP connects and provides completions
- [x] Go-to-definition works
- [x] Format on save works
- [x] README with installation instructions

---

#### Video Tutorials (5 Videos) - Docs Agent

**What to create:**
5 YouTube-ready tutorial videos.

#### Video 1: Getting Started (10 min)

`$lang
0:00 - Intro: What is HoloScript?
1:00 - Installation (npm install -g @holoscript/cli)
2:00 - VS Code extension setup
3:00 - Create first project (holoscript init)
4:00 - Write first scene
6:00 - Build and preview
8:00 - Deploy to device
9:30 - Recap and next steps

```

#### Video 2: Core Concepts (15 min)

`$lang
0:00 - Orbs: The building blocks
3:00 - Properties: Position, scale, color
6:00 - Traits: Adding behavior
9:00 - Templates: Reusable patterns
12:00 - Logic blocks: Interactivity
14:00 - Recap

```

#### Video 3: Building a VR Room (20 min)

`$lang
0:00 - Project setup
2:00 - Creating the room structure
5:00 - Adding furniture (using templates)
8:00 - Lighting setup
11:00 - Interactive elements (grabbable, physics)
15:00 - Audio zones
18:00 - Final polish
19:30 - Export and test

```

#### Video 4: Multiplayer Basics (15 min)

`$lang
0:00 - Networking concepts
2:00 - @networked trait
4:00 - @synced properties
7:00 - @host_only logic
10:00 - Testing locally
12:00 - Deploying multiplayer
14:00 - Common pitfalls

```

#### Video 5: Advanced Traits (15 min)

`$lang
0:00 - Physics deep dive
3:00 - Audio traits
6:00 - Accessibility traits
9:00 - Custom traits
12:00 - Performance optimization
14:00 - Where to learn more

````

**Deliverables per video:**

- Script (markdown)
- Screen recording
- Voice-over
- Captions file (.srt)
- Thumbnail image
- YouTube description with timestamps

**Acceptance criteria:**

- [x] 5 videos scripted
- [x] Clear audio quality
- [x] Code visible and readable
- [x] Captions included
- [x] Uploaded to YouTube/platform


---

## 2026 H2 Roadmap (AI-Accelerated)

### Q3: Sprint 4 (Aug-Sep) - 4 weeks

| Feature                   | Agent     | Days |
| ------------------------- | --------- | ---- |
| Exhaustive match checking | Architect | 4    |
| Parallel parsing          | Architect | 5    |
| Build caching             | Tooling   | 4    |
| Source maps v2            | Tooling   | 3    |
| Bundle analyzer           | Tooling   | 3    |


<summary><strong>ðŸ“‹ Sprint 4 Detailed Specifications</strong></summary>

#### Exhaustive Match Checking - Architect Agent

**Location:** `packages/core/src/HoloScriptTypeChecker.ts`

**What to build:**
Ensure all cases are handled in conditional/match expressions.

```hsplus
// Type definition
type State = "idle" | "loading" | "success" | "error"

composition status_display {
  state: State = "idle"

  // ERROR: Missing case "error"
  render: match state {
    "idle" => show_placeholder()
    "loading" => show_spinner()
    "success" => show_content()
    // "error" => show_error()  â† Missing!
  }
}
`$lang

**Implementation:**

1. **Union Type Tracking:**
   - Track all possible values of union types
   - Narrow types through control flow analysis

1. **Match Expression Analysis:**
   - Collect all matched patterns
   - Compare against possible values
   - Report missing cases

1. **Exhaustiveness Algorithm:**

```typescript
function checkExhaustive(matchExpr: MatchExpression, unionType: UnionType): Diagnostic[] {
  const coveredCases = new Set(matchExpr.cases.map((c) => c.pattern));
  const allCases = new Set(unionType.members);

  const missing = [...allCases].filter((c) => !coveredCases.has(c));

  if (missing.length > 0) {
    return [
      {
        message: `Non-exhaustive match. Missing: ${missing.join(', ')}`,
        severity: 'error',
        suggestions: missing.map((m) => `Add case: "${m}" => ...`),
      },
    ];
  }
  return [];
}

````

**Files to modify:**

- `packages/core/src/HoloScriptTypeChecker.ts` - Add exhaustiveness check
- `packages/core/src/types.ts` - Add MatchExpression handling

**Acceptance criteria:**

- [x] String literal unions checked
- [x] Number literal unions checked
- [x] Nested matches checked
- [x] `_` wildcard recognized as catch-all
- [x] Quick-fix suggestion for missing cases

---

#### Parallel Parsing - Architect Agent

**Location:** `packages/core/src/parser/`

**What to build:**
Parse multiple files simultaneously using worker threads.

**Architecture:**

`$lang
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ Main Thread â”‚
â”‚ â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚ â”‚ ParallelParser â”‚ â”‚
â”‚ â”‚ - Distributes files to workers â”‚ â”‚
â”‚ â”‚ - Collects and merges results â”‚ â”‚
â”‚ â”‚ - Handles cross-file references â”‚ â”‚
â”‚ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
â”‚ â”‚ â”‚ â”‚
â–¼ â–¼ â–¼ â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ Worker1 â”‚ â”‚ Worker2 â”‚ â”‚ Worker3 â”‚ â”‚ Worker4 â”‚
â”‚ file1 â”‚ â”‚ file2 â”‚ â”‚ file3 â”‚ â”‚ file4 â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

```

**Implementation:**

1. **Worker Pool:**
   - Use `worker_threads` (Node.js) or Web Workers (browser)
   - Pool size = CPU cores (configurable)
   - Reuse workers across builds

1. **Work Distribution:**
   - Sort files by size (largest first for better load balancing)
   - Chunk files into batches per worker
   - Handle dependencies between files

1. **Result Merging:**
   - Collect ASTs from all workers
   - Build unified symbol table
   - Resolve cross-file references

**Files to create:**

- `packages/core/src/parser/ParallelParser.ts` - Main coordinator
- `packages/core/src/parser/ParseWorker.ts` - Worker thread code
- `packages/core/src/parser/WorkerPool.ts` - Worker management

**Performance targets:**

- 100 files: 4x faster than sequential (on 4-core)
- 1000 files: 6x faster (better amortization)

**Acceptance criteria:**

- [x] Parses files in parallel
- [x] Handles file dependencies correctly
- [x] Graceful fallback if workers unavailable
- [x] Memory usage stays bounded
- [x] Error in one file doesn't crash others

---

#### Build Caching - Tooling Agent

**Location:** `packages/cli/src/build/`

**What to build:**
Cache build artifacts to skip unchanged files.

**Cache structure:**

`$lang
.holoscript-cache/
â”œâ”€â”€ manifest.json       # File hashes and metadata
â”œâ”€â”€ ast/
â”‚   â”œâ”€â”€ scene.hsplus.ast.json
â”‚   â””â”€â”€ items.hsplus.ast.json
â”œâ”€â”€ compiled/
â”‚   â”œâ”€â”€ scene.js
â”‚   â””â”€â”€ items.js
â””â”€â”€ types/
    â””â”€â”€ scene.d.ts

```

**Manifest format:**

````json
{
  "version": "1.0",
  "files": {
    "src/scene.hsplus": {
      "hash": "abc123...",
      "dependencies": ["src/items.hsplus"],
      "outputs": ["dist/scene.js"],
      "timestamp": 1706450400000
    }
  }
}
`$lang

**Invalidation rules:**

1. Source file hash changed â†’ rebuild
1. Any dependency changed â†’ rebuild
1. Compiler version changed â†’ rebuild all
1. Config changed â†’ rebuild all

**Implementation:**

- Hash files with xxhash (fast)
- Track transitive dependencies
- Parallel cache writes
- Cache compression (optional)

**Files to create:**

- `packages/cli/src/build/cache/CacheManager.ts`
- `packages/cli/src/build/cache/HashCalculator.ts`
- `packages/cli/src/build/cache/DependencyTracker.ts`

**CLI flags:**

```bash
holoscript build              # Use cache
holoscript build --no-cache   # Skip cache
holoscript build --clean      # Clear cache first

````

**Acceptance criteria:**

- [x] Unchanged files skip rebuild
- [x] Dependency changes trigger rebuild
- [x] Cache survives across sessions
- [x] `--clean` clears cache
- [x] 50%+ faster incremental builds

---

#### Source Maps v2 - Tooling Agent

**Location:** `packages/cli/src/build/`

**What to build:**
Enhanced source maps with better debugging support.

**Current (v1):** Basic line mapping
**Target (v2):** Column-level mapping + names + scopes

**v2 Features:**

1. **Column-level precision:**

`$lang
Generated: let x=foo.bar();
^^^
Source: value = item.property
^^^^

````

1. **Name mappings:**

```json
{
  "names": ["value", "item", "property"],
  "mappings": "AAAA,IAAI,CAAC,GAAG,CAAC,CAAC..."
}
`$lang

1. **Scope information:**

```json
{
  "x_google_ignoreList": [0, 1], // Ignore generated helper files
  "x_scopes": [{ "name": "composition cube", "start": 10, "end": 50 }]
}

````

**Implementation:**

- Use `source-map` package for generation
- Track AST node positions during codegen
- Emit inline source maps for dev, external for prod

**Files to modify:**

- `packages/cli/src/build/codegen.ts` - Track positions
- `packages/cli/src/build/sourcemap.ts` - Generate v2 maps

**Acceptance criteria:**

- [x] Column-level mapping works
- [x] Variable names preserved
- [x] Chrome DevTools shows correct source
- [x] VS Code debugging uses source maps
- [x] Inline and external map options

---

#### Bundle Analyzer - Tooling Agent

**Location:** `packages/cli/src/analyze/`

**What to build:**
Visualize bundle composition and size.

**Output:**

`$lang
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ HoloScript Bundle Analysis â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Total: 245 KB (78 KB gzipped) â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–‘â–‘â–‘â–‘â–‘â–‘ scene.js 180KBâ”‚
â”‚ â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘ items.js 45KBâ”‚
â”‚ â–ˆâ–ˆâ–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘ utils.js 20KBâ”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ By Category: â”‚
â”‚ - Scene graph: 120 KB (49%) â”‚
â”‚ - Traits: 80 KB (33%) â”‚
â”‚ - Runtime: 45 KB (18%) â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

````

**Features:**

1. **Size breakdown** by file
1. **Treemap visualization** (HTML report)
1. **Duplicate detection** (same code in multiple chunks)
1. **Unused export detection**

**CLI:**

```bash
holoscript analyze dist/
holoscript analyze --json > report.json
holoscript analyze --html > report.html
`$lang

**Files to create:**

- `packages/cli/src/analyze/BundleAnalyzer.ts`
- `packages/cli/src/analyze/TreemapGenerator.ts`
- `packages/cli/src/analyze/DuplicateFinder.ts`

**Acceptance criteria:**

- [x] Terminal output with sizes
- [x] JSON export for CI
- [x] Interactive HTML treemap
- [x] Duplicate code detection
- [x] Suggestions for size reduction


### Q4: Sprint 5 (Oct-Nov) - 4 weeks

| Feature                | Agent   | Days |
| ---------------------- | ------- | ---- |
| Dead code detection    | Tooling | 4    |
| Deprecation warnings   | Tooling | 2    |
| Migration assistant    | Tooling | 4    |
| Complexity metrics     | QA      | 3    |
| Package registry (MVP) | Tooling | 6    |


<summary><strong>ðŸ“‹ Sprint 5 Detailed Specifications</strong></summary>

#### Dead Code Detection - Tooling Agent

**Location:** `packages/linter/src/rules/`

**What to build:**
Identify unused orbs, templates, functions, and properties.

**Detection categories:**

1. **Unused orbs:**

```hsplus
composition helper { }      // Never referenced â†’ WARNING
composition main_scene {
  children: [composition used_child {}]
}

````

1. **Unused templates:**

````hsplus
template "OldButton" { }  // Never instantiated â†’ WARNING
template "Button" { }     // Used below
composition btn using "Button" {}
`$lang

1. **Unused properties:**

```hsplus
composition item {
  old_color: "red"  // Never read â†’ WARNING
  color: "blue"     // Used in on_click
  on_click: { log(this.color) }
}

````

1. **Unused functions:**

````hsplus
composition controller {
  function deprecated_helper() {}  // Never called â†’ WARNING
  function active_helper() {}      // Called below
  on_click: { this.active_helper() }
}
`$lang

**Implementation:**

1. Build reference graph from AST
1. Mark entry points (scene roots, exported items)
1. Walk graph from entry points
1. Report unreached nodes

**Files to create:**

- `packages/linter/src/rules/no-dead-code.ts`
- `packages/core/src/analysis/ReferenceGraph.ts`
- `packages/core/src/analysis/ReachabilityAnalyzer.ts`

**CLI:**

```bash
holoscript lint --dead-code
holoscript lint --dead-code --fix  # Remove dead code

````

**Acceptance criteria:**

- [x] Detects unused orbs
- [x] Detects unused templates
- [x] Detects unused properties
- [x] Detects unused functions
- [ ] Auto-fix removes dead code (with confirmation)

---

#### Deprecation Warnings - Tooling Agent

**Location:** `packages/core/src/`, `packages/linter/src/`

**What to build:**
Warn when using deprecated features.

**Deprecation syntax:**

```hsplus
// In trait definitions
@deprecated("Use @interactive instead")
trait clickable { ... }

// In templates
@deprecated("Use ButtonV2 template")
template "Button" { ... }

// In properties
composition item {
  @deprecated("Use 'tint' instead")
  color: string
}
`$lang

**Warning output:**

```

src/scene.hsplus:15:3
warning: '@clickable' is deprecated. Use @interactive instead.
Deprecated in v2.3, will be removed in v3.0.

14 | composition button {

> 15 | @clickable

     |   ^^^^^^^^^^

16 | }

Quick fix: Replace with @interactive
`$lang

**Implementation:**

1. Parse `@deprecated` annotations
1. Track deprecation in symbol table
1. Emit warnings on usage
1. Provide migration suggestions

**Files to modify:**

- `packages/core/src/parser/HoloScriptPlusParser.ts` - Parse @deprecated
- `packages/linter/src/rules/no-deprecated.ts` - Lint rule
- `packages/core/src/traits/index.ts` - Mark deprecated traits

**Acceptance criteria:**

- [x] `@deprecated` annotation parsed
- [x] Warnings emitted on usage
- [x] Version info (deprecated in, removed in)
- [x] Quick-fix suggestions
- [x] Can suppress with `@suppress-deprecation`

---

#### Migration Assistant - Tooling Agent

**Location:** `packages/cli/src/migrate/`

**What to build:**
Automated code migration between HoloScript versions.

**Use cases:**

1. v2.1 â†’ v2.5 (trait renames, syntax changes)
1. v2.x â†’ v3.3 (breaking changes)

**Migration script format:**

```typescript
// migrations/2.1-to-2.5.ts
export const migration: Migration = {
  from: '2.1.0',
  to: '2.5.0',
  transforms: [
    {
      name: 'rename-clickable-to-interactive',
      description: 'Rename @clickable trait to @interactive',
      transform: (ast) => {
        // Find all @clickable traits
        // Replace with @interactive
      },
    },
    {
      name: 'update-physics-syntax',
      description: 'Update @physics parameters',
      transform: (ast) => {
        // @physics(gravity: 9.8) â†’ @physics(gravity: [0, -9.8, 0])
      },
    },
  ],
};
```

**CLI:**

```bash
# Check what would change
holoscript migrate --from 2.1 --to 2.5 --dry-run

# Apply migration
holoscript migrate --from 2.1 --to 2.5

# Interactive mode (confirm each change)
holoscript migrate --from 2.1 --to 2.5 --interactive
`$lang

**Output:**

```

Migration: 2.1.0 â†’ 2.5.0

Found 15 files to migrate.

Changes:
src/scene.hsplus - Line 12: @clickable â†’ @interactive - Line 45: @physics(gravity: 9.8) â†’ @physics(gravity: [0, -9.8, 0])

src/items.hsplus - Line 8: @clickable â†’ @interactive

Apply changes? [y/N/i(interactive)]
`$lang

**Files to create:**

- `packages/cli/src/migrate/MigrationRunner.ts`
- `packages/cli/src/migrate/migrations/` - Migration scripts
- `packages/cli/src/migrate/transforms/` - Reusable transforms

**Acceptance criteria:**

- [x] Dry-run mode shows changes
- [x] Apply mode modifies files
- [x] Interactive mode for confirmation
- [x] Backup created before migration
- [x] Rollback on failure

---

#### Complexity Metrics - QA Agent

**Location:** `packages/cli/src/analyze/`

**What to build:**
Measure code complexity for maintainability.

**Metrics:**

1. **Cyclomatic Complexity:**
   - Count decision points (if, match, loops)
   - Threshold: >10 = warning, >20 = error

1. **Nesting Depth:**
   - Max depth of nested blocks
   - Threshold: >4 = warning

1. **composition Size:**
   - Lines, properties, children count
   - Threshold: >100 lines = warning

1. **Dependency Count:**
   - Number of templates/imports used
   - Threshold: >10 = warning

**Output:**

````
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  Complexity Report                                          â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  File                    CC    Depth  Size   Deps  Grade   â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  src/scene.hsplus        8     3      45     4     A       â”‚
â”‚  src/game_logic.hsplus   15    5      120    8     C âš ï¸    â”‚
â”‚  src/ui.hsplus           6     2      30     3     A       â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  Average:                9.7   3.3    65     5     B       â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

Recommendations:
  - game_logic.hsplus: Consider splitting into smaller orbs
  - game_logic.hsplus:45: Reduce nesting (currently 5 levels)
`$lang

**Files to create:**

- `packages/cli/src/analyze/ComplexityAnalyzer.ts`
- `packages/cli/src/analyze/metrics/CyclomaticComplexity.ts`
- `packages/cli/src/analyze/metrics/NestingDepth.ts`
- `packages/cli/src/analyze/ComplexityReporter.ts`

**CLI:**

```bash
holoscript complexity src/
holoscript complexity --threshold cc=10,depth=4
holoscript complexity --json

````

**Acceptance criteria:**

- [x] Cyclomatic complexity calculated
- [x] Nesting depth calculated
- [x] Configurable thresholds
- [x] Letter grades (A-F)
- [x] Actionable recommendations

---

#### Package Registry (MVP) - Tooling Agent

**Location:** `packages/registry/` (new package)

**What to build:**
Central registry for sharing HoloScript packages.

**Architecture:**

`$lang
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ CLI â”‚â”€â”€â”€â”€â–¶â”‚ Registry â”‚â”€â”€â”€â”€â–¶â”‚ Storage â”‚
â”‚ publish/ â”‚ â”‚ API â”‚ â”‚ (S3/GCS) â”‚
â”‚ install â”‚ â”‚ (REST) â”‚ â”‚ â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
â”‚
â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ Database â”‚
â”‚ (Postgres) â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

````

**Package manifest:**

```json
{
  "name": "@studio/vr-buttons",
  "version": "1.0.0",
  "description": "Reusable VR button components",
  "main": "src/index.hsplus",
  "holoscript": ">=2.5.0",
  "dependencies": {
    "@holoscript/physics": "^1.0.0"
  },
  "keywords": ["vr", "ui", "buttons"],
  "license": "MIT"
}
`$lang

**API Endpoints:**

````

POST /packages # Publish package
GET /packages/:name # Get package info
GET /packages/:name/:ver # Get specific version
DELETE /packages/:name/:ver # Unpublish (within 72h)
GET /search?q=... # Search packages
`$lang

**CLI commands:**

```bash
holoscript registry login
holoscript registry publish
holoscript registry unpublish @studio/vr-buttons@1.0.0
holoscript install @studio/vr-buttons
holoscript search "vr buttons"

```

**MVP scope:**

- Public packages only (private in Sprint 6)
- Basic search (name, description, keywords)
- Semantic versioning
- Dependency resolution

**Files to create:**

`$lang
packages/registry/
â”œâ”€â”€ src/
â”‚ â”œâ”€â”€ api/
â”‚ â”‚ â”œâ”€â”€ routes.ts
â”‚ â”‚ â”œâ”€â”€ publish.ts
â”‚ â”‚ â”œâ”€â”€ search.ts
â”‚ â”‚ â””â”€â”€ install.ts
â”‚ â”œâ”€â”€ storage/
â”‚ â”‚ â””â”€â”€ s3.ts
â”‚ â”œâ”€â”€ db/
â”‚ â”‚ â”œâ”€â”€ schema.sql
â”‚ â”‚ â””â”€â”€ queries.ts
â”‚ â””â”€â”€ index.ts
â””â”€â”€ package.json

````

**Acceptance criteria:**

- [x] Publish packages
- [x] Install packages
- [x] Search by name/keywords
- [x] Version resolution
- [x] Rate limiting


### Q4: Sprint 6 (Dec) - 2 weeks

| Feature                | Agent   | Days |
| ---------------------- | ------- | ---- |
| `holoscript publish`   | Tooling | 3    |
| Private packages       | Tooling | 4    |
| HoloScript 2.5 release | All     | 3    |


<summary><strong>ðŸ“‹ Sprint 6 Detailed Specifications</strong></summary>

#### `holoscript publish` - Tooling Agent

**Location:** `packages/cli/src/commands/`

**What to build:**
Publish packages to registry with validation.

**Workflow:**

```bash
$ holoscript publish

ðŸ“¦ Publishing @studio/vr-buttons@1.0.0...

Pre-publish checks:
  âœ“ package.json valid
  âœ“ holoscript.config.json valid
  âœ“ All files parse without errors
  âœ“ Tests pass (12/12)
  âœ“ No security vulnerabilities
  âœ“ README.md exists

Building package...
  âœ“ Compiled 5 files
  âœ“ Generated type definitions
  âœ“ Created tarball (45 KB)

Publishing to registry.holoscript.net...
  âœ“ Authenticated as @studio
  âœ“ Package uploaded
  âœ“ Version 1.0.0 published

ðŸŽ‰ Successfully published @studio/vr-buttons@1.0.0
   https://registry.holoscript.net/packages/@studio/vr-buttons
`$lang

**Pre-publish validations:**

1. package.json required fields
1. All source files parse
1. Tests pass (if configured)
1. No `console.log` in production code
1. License file exists
1. README exists

**Files to modify:**

- `packages/cli/src/commands/publish.ts` - Main command
- `packages/cli/src/publish/validator.ts` - Validations
- `packages/cli/src/publish/packager.ts` - Create tarball

**Acceptance criteria:**

- [x] Validates package before publish
- [x] Builds and bundles package
- [x] Uploads to registry
- [x] Shows success/failure clearly
- [x] `--dry-run` flag for testing

---

#### Private Packages - Tooling Agent

**Location:** `packages/registry/`

**What to build:**
Organization-scoped private packages.

**Features:**

1. **Organization scopes:**

````

@mycompany/internal-utils â† Private to @mycompany org
@holoscript/core â† Public
`$lang

1. **Access control:**

```bash
# Grant access
holoscript access grant @mycompany/utils read @alice
holoscript access grant @mycompany/utils write @bob

# List access
holoscript access list @mycompany/utils

```

1. **Token authentication:**

````bash
# Generate token for CI
holoscript token create --readonly --scope @mycompany

# Use in CI
HOLOSCRIPT_TOKEN=xxx holoscript install
`$lang

**Database additions:**

```sql
CREATE TABLE organizations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE,
  created_at TIMESTAMP
);

CREATE TABLE org_members (
  org_id INTEGER REFERENCES organizations(id),
  user_id INTEGER REFERENCES users(id),
  role VARCHAR(20),  -- 'owner', 'admin', 'member'
  PRIMARY KEY (org_id, user_id)
);

CREATE TABLE package_access (
  package_id INTEGER REFERENCES packages(id),
  user_id INTEGER REFERENCES users(id),
  permission VARCHAR(20),  -- 'read', 'write', 'admin'
  PRIMARY KEY (package_id, user_id)
);

````

**Files to modify:**

- `packages/registry/src/api/access.ts` - Access control endpoints
- `packages/registry/src/auth/tokens.ts` - Token management
- `packages/cli/src/commands/access.ts` - CLI commands

**Acceptance criteria:**

- [x] Create organizations
- [x] Publish private packages
- [x] Grant/revoke access
- [x] Token-based auth for CI
- [x] Private packages not visible in search

---

#### HoloScript 2.5 Release - All Agents

**What to deliver:**
Major release with all Sprint 1-6 features.

**Release checklist:**

1. **Architect Agent:**
   - [ ] All parser features merged
   - [ ] Type system enhancements complete
   - [ ] API documentation updated

1. **Tooling Agent:**
   - [ ] CLI commands documented
   - [ ] Config schema updated
   - [ ] Migration guide written

1. **IDE Agent:**
   - [ ] VS Code extension updated
   - [ ] Neovim plugin released
   - [ ] Playground deployed

1. **QA Agent:**
   - [ ] All tests passing
   - [ ] Performance benchmarks met
   - [ ] Security audit passed

1. **Docs Agent:**
   - [ ] Release notes written
   - [ ] Upgrade guide published
   - [ ] Video announcement recorded

**Release artifacts:**

`$lang

- @holoscript/core@2.5.0
- @holoscript/cli@2.5.0
- @holoscript/linter@2.5.0
- @holoscript/formatter@2.5.0
- @holoscript/lsp@2.5.0
- @holoscript/vscode@2.5.0
- @holoscript/neovim@1.0.0
- @holoscript/playground@1.0.0

```

**Announcement channels:**

- GitHub release
- npm publish
- Blog post
- Twitter/X thread
- Discord announcement
- YouTube video

**Acceptance criteria:**

- [ ] All packages published to npm
- [ ] GitHub release with changelog
- [ ] Documentation site updated
- [ ] Playground live
- [ ] Announcement posted


---

## 2027 Roadmap (AI-Accelerated)

### Q1: Sprint 7 (Jan-Feb) - 4 weeks

| Feature                     | Agent | Days |
| --------------------------- | ----- | ---- |
| Visual scripting (MVP)      | IDE   | 8    |
| AI autocomplete integration | IDE   | 5    |
| IntelliJ plugin             | IDE   | 5    |


<summary><strong>ðŸ“‹ Sprint 7 Detailed Specifications</strong></summary>

#### Visual Scripting (MVP) - IDE Agent

**Location:** `packages/visual/` (new package)

**What to build:**
Node-based visual programming interface for HoloScript.

**Architecture:**

`$lang
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  Visual Editor                                              â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”                 â”‚
â”‚  â”‚ On Clickâ”‚â”€â”€â”€â–¶â”‚ Play    â”‚â”€â”€â”€â–¶â”‚ Set     â”‚                 â”‚
â”‚  â”‚         â”‚    â”‚ Sound   â”‚    â”‚ Color   â”‚                 â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜                 â”‚
â”‚                      â”‚                                      â”‚
â”‚                      â–¼                                      â”‚
â”‚                 â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”                                 â”‚
â”‚                 â”‚ Animate â”‚                                 â”‚
â”‚                 â”‚ Scale   â”‚                                 â”‚
â”‚                 â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜                                 â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  [Node Library]  [Properties]  [Preview]                    â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

```

**Node types:**

1. **Event Nodes (Green):**
   - On Click, On Hover, On Grab
   - On Tick, On Timer
   - On Collision, On Trigger

1. **Action Nodes (Blue):**
   - Play Sound, Play Animation
   - Set Property, Toggle
   - Spawn, Destroy

1. **Logic Nodes (Yellow):**
   - If/Else, Switch
   - And, Or, Not
   - Compare, Math

1. **Data Nodes (Purple):**
   - Get Property, Constant
   - Random, Interpolate
   - Array, Object

**Graph to code conversion:**

```typescript
// Visual graph
OnClick â†’ PlaySound("click.mp3") â†’ SetColor("#ff0000")

// Generated HoloScript
composition button {
  on_click: {
    audio.play("click.mp3")
    this.color = "#ff0000"
  }
}
`$lang

**Tech stack:**

- React Flow for node editor
- Monaco for code preview
- Custom node types
- Undo/redo support

**Files to create:**

```

packages/visual/
â”œâ”€â”€ src/
â”‚ â”œâ”€â”€ components/
â”‚ â”‚ â”œâ”€â”€ Canvas.tsx
â”‚ â”‚ â”œâ”€â”€ Node.tsx
â”‚ â”‚ â”œâ”€â”€ Connection.tsx
â”‚ â”‚ â””â”€â”€ Sidebar.tsx
â”‚ â”œâ”€â”€ nodes/
â”‚ â”‚ â”œâ”€â”€ EventNodes.tsx
â”‚ â”‚ â”œâ”€â”€ ActionNodes.tsx
â”‚ â”‚ â”œâ”€â”€ LogicNodes.tsx
â”‚ â”‚ â””â”€â”€ DataNodes.tsx
â”‚ â”œâ”€â”€ codegen/
â”‚ â”‚ â””â”€â”€ GraphToCode.ts
â”‚ â”œâ”€â”€ store/
â”‚ â”‚ â””â”€â”€ graphStore.ts
â”‚ â””â”€â”€ index.tsx
â””â”€â”€ package.json
`$lang

**MVP scope:**

- 20 core node types
- Drag-and-drop connections
- Real-time code preview
- Export to .hsplus
- Import from .hsplus (basic)

**Acceptance criteria:**

- [x] Node canvas with pan/zoom
- [x] 20 node types available
- [x] Connect nodes with wires
- [x] Generate valid HoloScript code
- [x] Code preview updates live

---

#### AI Autocomplete Integration - IDE Agent

**Location:** `packages/lsp/src/`, `packages/vscode/src/`

**What to build:**
AI-powered code suggestions beyond basic completion.

**Features:**

1. **Smart completions:**

```hsplus
composition player {
  @physics
  @  // AI suggests: @grabbable (players usually want to grab things)
     //              @collidable (physics needs collision)
}

```

1. **Code generation from comments:**

```hsplus
composition game {
  // Create a countdown timer that shows 3, 2, 1, Go!
  // [Tab to generate]

  // AI generates:
  countdown: number = 3
  on_start: {
    setInterval(() => {
      if (this.countdown > 0) {
        display.show(this.countdown)
        this.countdown--
      } else {
        display.show("Go!")
      }
    }, 1000)
  }
}
`$lang

1. **Error fix suggestions:**

```

Error: Property 'colr' does not exist. Did you mean 'color'?
[Quick fix: AI suggests full correction with context]
`$lang

1. **Trait recommendations:**

```hsplus
composition door {
  // AI: "This looks like a door. Consider adding:"
  //     @animated - for open/close animation
  //     @audio - for sound effects
  //     @interactable - for player interaction
}

```

**Implementation:**

1. **Local model integration:**
   - Use Ollama for local inference
   - Fallback to cloud API (optional)
   - Cache common suggestions

1. **Context gathering:**
   - Current file content
   - Project structure
   - Recent edits
   - Error messages

1. **Prompt engineering:**

`$lang
You are a HoloScript expert. Given this context:

- File: {filename}
- Cursor position: line {line}, column {col}
- Surrounding code: {context}
- Recent errors: {errors}

Suggest the most likely completion.

```

**Files to create:**

- `packages/lsp/src/ai/AICompletionProvider.ts`
- `packages/lsp/src/ai/ContextGatherer.ts`
- `packages/lsp/src/ai/PromptBuilder.ts`
- `packages/vscode/src/ai/AIFeatures.ts`

**Privacy:**

- Local-first (Ollama)
- Opt-in cloud features
- No code sent without consent
- Clear data usage policy

**Acceptance criteria:**

- [x] Smart trait suggestions
- [x] Comment-to-code generation
- [x] Error fix suggestions
- [x] Works offline with local model
- [x] Respects privacy settings

---

#### IntelliJ Plugin - IDE Agent

**Location:** `packages/intellij/` (new package)

**What to build:**
Full HoloScript support for IntelliJ IDEA, WebStorm, etc.

**Features:**

- Syntax highlighting
- LSP integration
- Code formatting
- Error checking
- Go-to-definition
- Find references
- Refactoring support

**Architecture:**

`$lang
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  IntelliJ Plugin                        â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚  â”‚ Lexer/Parserâ”‚  â”‚ LSP Client      â”‚  â”‚
â”‚  â”‚ (TextMate)  â”‚  â”‚ (lsp4intellij)  â”‚  â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚
â”‚         â”‚                  â”‚            â”‚
â”‚         â–¼                  â–¼            â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚  â”‚  Language Features               â”‚   â”‚
â”‚  â”‚  - Highlighting                  â”‚   â”‚
â”‚  â”‚  - Completion                    â”‚   â”‚
â”‚  â”‚  - Navigation                    â”‚   â”‚
â”‚  â”‚  - Formatting                    â”‚   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
          â”‚
          â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  holoscript-lsp (External Process)      â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

```

**Tech stack:**

- Kotlin for plugin
- lsp4intellij for LSP client
- TextMate bundles for syntax
- Gradle for build

**Files to create:**

`$lang
packages/intellij/
â”œâ”€â”€ src/main/
â”‚ â”œâ”€â”€ kotlin/
â”‚ â”‚ â””â”€â”€ com/holoscript/intellij/
â”‚ â”‚ â”œâ”€â”€ HoloScriptPlugin.kt
â”‚ â”‚ â”œâ”€â”€ HoloScriptLanguage.kt
â”‚ â”‚ â”œâ”€â”€ HoloScriptFileType.kt
â”‚ â”‚ â””â”€â”€ lsp/
â”‚ â”‚ â””â”€â”€ HoloScriptLspClient.kt
â”‚ â””â”€â”€ resources/
â”‚ â”œâ”€â”€ META-INF/
â”‚ â”‚ â””â”€â”€ plugin.xml
â”‚ â””â”€â”€ syntaxes/
â”‚ â””â”€â”€ holoscript.tmLanguage.json
â”œâ”€â”€ build.gradle.kts
â””â”€â”€ README.md

```

**Distribution:**

- JetBrains Marketplace
- Manual install from ZIP

**Acceptance criteria:**

- [x] Syntax highlighting works
- [x] LSP features (completion, hover, etc.)
- [x] Format on save
- [x] Works in IDEA, WebStorm, PyCharm
- [x] Published to JetBrains Marketplace


### âœ… Sprint 8 (Mar-Apr) - Complete â€” v3.7.0

| Feature                    | Agent     | Days | Status                                          |
| -------------------------- | --------- | ---- | ----------------------------------------------- |
| WASM compiler              | Architect | 8    | âœ… 34 Rust tests, parse/validate/version API    |
| Team workspaces            | Tooling   | 5    | âœ… DB schema, 97 tests, RBAC, secrets, activity |
| HoloScript Academy content | Docs      | 6    | âœ… All 30 lessons written (L1-L3)               |


<summary><strong>ðŸ“‹ Sprint 8 Detailed Specifications</strong></summary>

#### WASM Compiler - Architect Agent

**Location:** `packages/compiler-wasm/` (new package)

**What to build:**
Compile HoloScript to WebAssembly for high-performance execution.

**Use cases:**

1. **Web playground** - Parse in browser without server
1. **Embedded runtime** - Run HoloScript in any WASM host
1. **Performance** - 10x faster than JS interpreter

**Architecture:**

`$lang
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  HoloScript Source                                          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                           â”‚
                           â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  Parser (compiled to WASM)                                  â”‚
â”‚  - Lexer                                                    â”‚
â”‚  - Parser                                                   â”‚
â”‚  - AST Builder                                              â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                           â”‚
                           â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  Type Checker (compiled to WASM)                            â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                           â”‚
                           â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  Code Generator                                             â”‚
â”‚  - To JavaScript (current)                                  â”‚
â”‚  - To WASM bytecode (future)                                â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

```

**Implementation approach:**

1. **Rust rewrite of core:**

````rust
// src/parser.rs
pub fn parse(source: &str) -> Result<Ast, ParseError> {
    let lexer = Lexer::new(source);
    let parser = Parser::new(lexer);
    parser.parse()
}

// Expose to WASM
#[wasm_bindgen]
pub fn parse_to_json(source: &str) -> String {
    match parse(source) {
        Ok(ast) => serde_json::to_string(&ast).unwrap(),
        Err(e) => format!("{{\"error\": \"{}\"}}", e),
    }
}
`$lang

1. **Build pipeline:**

```bash
# Compile Rust to WASM
wasm-pack build --target web

# Output
pkg/
â”œâ”€â”€ holoscript_wasm.js      # JS bindings
â”œâ”€â”€ holoscript_wasm_bg.wasm # WASM binary
â””â”€â”€ holoscript_wasm.d.ts    # TypeScript types

````

1. **JavaScript API:**

```typescript
import init, { parse_to_json } from '@holoscript/wasm';

await init(); // Load WASM

const ast = JSON.parse(
  parse_to_json(`
  composition cube {
    @grabbable
    color: "red"
  }
`)
);
`$lang

**Files to create:**

```

packages/compiler-wasm/
â”œâ”€â”€ src/
â”‚ â”œâ”€â”€ lib.rs # WASM entry point
â”‚ â”œâ”€â”€ lexer.rs # Lexer implementation
â”‚ â”œâ”€â”€ parser.rs # Parser implementation
â”‚ â”œâ”€â”€ ast.rs # AST types
â”‚ â””â”€â”€ types.rs # Type system
â”œâ”€â”€ Cargo.toml
â”œâ”€â”€ package.json # NPM package wrapper
â””â”€â”€ README.md
`$lang

**Performance targets:**

- Parse 1000 lines: <5ms (vs 50ms in JS)
- WASM binary size: <500KB gzipped
- Memory usage: <10MB for typical projects

**Acceptance criteria:**

- [x] Parser compiles to WASM
- [x] Type checker compiles to WASM
- [x] npm package published
- [x] Works in browser
- [x] 10x performance improvement

---

#### Team Workspaces - Tooling Agent

**Location:** `packages/registry/`, `packages/cli/`

**What to build:**
Collaborative workspaces for teams.

**Features:**

1. **Shared configurations:**

```json
// .holoscript/workspace.json
{
  "workspace": "@myteam/vr-project",
  "members": ["alice", "bob", "charlie"],
  "settings": {
    "formatter": { "tabWidth": 2 },
    "linter": { "rules": { "no-unused": "error" } }
  },
  "packages": {
    "@myteam/shared-components": "workspace:*"
  }
}
```

1. **Role-based access:**

`$lang
Owner - Full control, billing, delete workspace
Admin - Manage members, settings, packages
Developer- Push code, publish packages
Viewer - Read-only access

````

1. **Shared secrets:**

```bash
# Set team secret (encrypted)
holoscript workspace secret set API_KEY=xxx

# Use in CI
holoscript build --env workspace
`$lang

1. **Activity feed:**

````

Recent activity in @myteam/vr-project:

alice published @myteam/buttons@2.0.0 (2 hours ago)
bob updated workspace settings (5 hours ago)
charlie joined the workspace (1 day ago)
`$lang

**API endpoints:**

```
POST   /workspaces                    # Create workspace
GET    /workspaces/:id                # Get workspace
PUT    /workspaces/:id                # Update settings
DELETE /workspaces/:id                # Delete workspace
POST   /workspaces/:id/members        # Add member
DELETE /workspaces/:id/members/:user  # Remove member
GET    /workspaces/:id/activity       # Activity feed
POST   /workspaces/:id/secrets        # Set secret
`$lang

**Files to create:**

- `packages/registry/src/api/workspaces.ts`
- `packages/registry/src/db/workspace-schema.sql`
- `packages/cli/src/commands/workspace.ts`

**Acceptance criteria:**

- [x] Create/delete workspaces
- [x] Invite/remove members
- [x] Role-based permissions
- [x] Shared configuration sync
- [x] Activity feed

---

#### HoloScript Academy Content - Docs Agent

**Location:** `docs/academy/` or separate site

**What to build:**
Comprehensive learning platform for HoloScript.

**Course structure:**

**Level 1: Fundamentals (10 lessons)**

```

1.1 What is HoloScript?
1.2 Installation & Setup
1.3 Your First Scene
1.4 Understanding Orbs
1.5 Properties Deep Dive
1.6 Introduction to Traits
1.7 Basic Interactivity
1.8 Templates & Reuse
1.9 Project Structure
1.10 Building & Deploying
`$lang

**Level 2: Intermediate (10 lessons)**

```
2.1 Advanced Traits
2.2 Physics Simulation
2.3 Audio & Sound
2.4 Animation System
2.5 User Interface in VR
2.6 State Management
2.7 Networking Basics
2.8 Performance Optimization
2.9 Debugging Techniques
2.10 Testing Your Scenes
`$lang

**Level 3: Advanced (10 lessons)**

```

3.1 Custom Trait Development
3.2 Plugin Architecture
3.3 Advanced Networking
3.4 Procedural Generation
3.5 AI & NPC Behavior
3.6 Cross-Platform Considerations
3.7 Accessibility Best Practices
3.8 Security in Multiplayer
3.9 Scaling Large Projects
3.10 Contributing to HoloScript
`$lang

**Each lesson includes:**

- Written content (1000-2000 words)
- Interactive code playground
- Video explanation (5-10 min)
- Quiz (5 questions)
- Hands-on project
- Discussion forum

**Certification:**

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  HoloScript Developer Certificate       â”‚
â”‚                                         â”‚
â”‚  This certifies that                    â”‚
â”‚                                         â”‚
â”‚        [Student Name]                   â”‚
â”‚                                         â”‚
â”‚  has completed Level 2: Intermediate    â”‚
â”‚  HoloScript Development                 â”‚
â”‚                                         â”‚
â”‚  Date: 2027-03-15                       â”‚
â”‚  ID: HSCP-2027-12345                    â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
`$lang

**Platform features:**

- Progress tracking
- Code playground per lesson
- Discussion forums
- Certificates
- Leaderboards
- Study groups

**Files to create:**

```

docs/academy/
â”œâ”€â”€ courses/
â”‚ â”œâ”€â”€ level-1/
â”‚ â”‚ â”œâ”€â”€ 01-what-is-holoscript.md
â”‚ â”‚ â”œâ”€â”€ 02-installation.md
â”‚ â”‚ â””â”€â”€ ...
â”‚ â”œâ”€â”€ level-2/
â”‚ â””â”€â”€ level-3/
â”œâ”€â”€ quizzes/
â”œâ”€â”€ projects/
â””â”€â”€ certificates/
`$lang

**Acceptance criteria:**

- [x] 30 lessons created
- [x] Code playgrounds work
- [x] Quizzes functional
- [x] Progress saved
- [x] Certificates issued

---

### âœ… Sprint 9-10 (May-Aug) - Complete â€” v3.8.0

| Feature                | Agent   | Days | Status                                                                         |
| ---------------------- | ------- | ---- | ------------------------------------------------------------------------------ |
| Certified packages     | Docs    | 5    | âœ… Badge.ts (signed SVG/MD), 120 tests, certification/requirements.md         |
| Partner SDK            | Tooling | 6    | âœ… 4881 lines â€” Runtime, Adapters, Analytics, Branding, Webhooks (67 tests) |
| HoloScript 3.0 release | All     | 5    | âœ… Released (v3.0.0 tag)                                                      |

<summary><strong>ðŸ“‹ Sprint 9-10 Detailed Specifications</strong></summary>

#### Certified Packages - Docs Agent

**What to build:**
Verification program for high-quality packages.

**Certification requirements:**

1. **Code quality:**
   - 100% TypeScript/HoloScript typed
   - No lint errors
   - Complexity score A or B
   - Test coverage >80%

1. **Documentation:**
   - README with examples
   - API documentation
   - Changelog maintained
   - License clear

1. **Security:**
   - No known vulnerabilities
   - Security audit passed
   - No suspicious network calls
   - Safe dependency tree

1. **Maintenance:**
   - Responsive maintainer
   - Regular updates
   - Issue triage <7 days
   - Semantic versioning

**Certification badge:**

````
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  âœ“ HoloScript Certified                 â”‚
â”‚                                         â”‚
â”‚  @studio/vr-buttons                     â”‚
â”‚  Version: 2.0.0                         â”‚
â”‚  Certified: 2027-06-01                  â”‚
â”‚  Expires: 2028-06-01                    â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
`$lang

**Certification process:**

1. Package author applies
1. Automated checks run
1. Manual review (if needed)
1. Badge granted
1. Annual renewal

**Files to create:**

- `packages/registry/src/certification/Checker.ts`
- `packages/registry/src/certification/Badge.ts`
- `docs/certification/requirements.md`

**Acceptance criteria:**

- [ ] Automated quality checks
- [ ] Manual review workflow
- [ ] Badge display in registry
- [ ] Renewal reminders
- [ ] Public certification criteria

---

#### Partner SDK - Tooling Agent

**Location:** `packages/partner-sdk/` (new package)

**What to build:**
SDK for partners to integrate HoloScript into their platforms.

**Use cases:**

1. Game engines embedding HoloScript
1. Design tools with HoloScript export
1. LMS platforms with HoloScript courses
1. Hardware vendors with HoloScript support

**SDK components:**

1. **Embedding API:**

```typescript
import { HoloScriptRuntime } from '@holoscript/partner-sdk';

const runtime = new HoloScriptRuntime({
  sandbox: true,
  permissions: ['audio', 'physics'],
});

runtime.load(`
  composition cube {
    @physics
    color: "red"
  }
`);

runtime.on('sceneReady', (scene) => {
  // Integrate with your engine
  myEngine.addScene(scene);
});

````

1. **Export adapters:**

```typescript
import { exportTo } from '@holoscript/partner-sdk';

const unityProject = exportTo('unity', holoScriptScene);
const unrealProject = exportTo('unreal', holoScriptScene);
const godotProject = exportTo('godot', holoScriptScene);
`$lang

1. **Branding kit:**

```

assets/
â”œâ”€â”€ logos/
â”‚ â”œâ”€â”€ holoscript-logo.svg
â”‚ â”œâ”€â”€ holoscript-logo-dark.svg
â”‚ â””â”€â”€ holoscript-badge.svg
â”œâ”€â”€ colors.json
â””â”€â”€ guidelines.pdf
`$lang

1. **Integration docs:**

```markdown
# Integrating HoloScript

## Quick Start

1. Install SDK
1. Initialize runtime
1. Load scenes
1. Connect to your renderer

## API Reference

...

## Examples

- Unity integration
- Unreal integration
- Custom renderer
```

**Partner tiers:**

`$lang
Community - Free, self-service, basic support
Pro - $99/mo, priority support, analytics
Enterprise - Custom, SLA, dedicated support

```

**Files to create:**

`$lang
packages/partner-sdk/
â”œâ”€â”€ src/
â”‚   â”œâ”€â”€ runtime/
â”‚   â”‚   â”œâ”€â”€ Runtime.ts
â”‚   â”‚   â”œâ”€â”€ Sandbox.ts
â”‚   â”‚   â””â”€â”€ Permissions.ts
â”‚   â”œâ”€â”€ export/
â”‚   â”‚   â”œâ”€â”€ UnityAdapter.ts
â”‚   â”‚   â”œâ”€â”€ UnrealAdapter.ts
â”‚   â”‚   â””â”€â”€ GodotAdapter.ts
â”‚   â”œâ”€â”€ branding/
â”‚   â””â”€â”€ index.ts
â”œâ”€â”€ docs/
â”‚   â”œâ”€â”€ quick-start.md
â”‚   â”œâ”€â”€ api-reference.md
â”‚   â””â”€â”€ examples/
â””â”€â”€ package.json

```

**Acceptance criteria:**

- [ ] Embedding API works
- [ ] Unity export adapter
- [ ] Branding kit complete
- [ ] Documentation thorough
- [ ] Partner portal live

---

#### HoloScript 3.0 Release - All Agents

**What to deliver:**
Major version with visual scripting and WASM.

**Breaking changes (migration guide required):**

1. Deprecated traits removed
1. Config file format v3
1. Runtime API changes
1. Plugin API v2

**Release checklist:**

1. **Pre-release (2 weeks before):**
   - [ ] Feature freeze
   - [ ] RC1 published
   - [ ] Migration guide complete
   - [ ] All docs updated

1. **Release day:**
   - [ ] All packages published
   - [ ] GitHub release created
   - [ ] Blog post published
   - [ ] Social media announced
   - [ ] Discord notified

1. **Post-release (1 week after):**
   - [ ] Monitor issues
   - [ ] Hotfix if needed
   - [ ] Collect feedback
   - [ ] Plan 3.0.1

**Release artifacts:**

`$lang
@holoscript/core@3.0.0
@holoscript/cli@3.0.0
@holoscript/linter@3.0.0
@holoscript/formatter@3.0.0
@holoscript/lsp@3.0.0
@holoscript/vscode@3.0.0
@holoscript/intellij@1.0.0
@holoscript/neovim@2.0.0
@holoscript/visual@1.0.0
@holoscript/wasm@1.0.0
@holoscript/playground@2.0.0
@holoscript/partner-sdk@1.0.0

```

**Marketing:**

- Launch video (5 min)
- Feature showcase GIFs
- Press release
- Partner announcements
- Community showcase

**Acceptance criteria:**

- [ ] All packages published
- [ ] No P0 bugs
- [ ] Migration guide tested
- [ ] Launch video published
- [ ] 1000+ downloads in first week


---

## Trait Rendering Expansion (2026-2027)

**Goal:** Close the gap between the 1,800+ parser-accepted traits and actual rendered behavior. Currently ~55 traits have runtime handlers and ~56 have R3F compiler mappings. This initiative expands visual coverage across three phases.

### Phase 1: Trait-to-PBR Visual Registry (Q2 2026) â€” âœ… COMPLETE

**Target:** ~250 traits with material/visual mappings | **Agent:** Architect
**Location:** `packages/core/src/traits/visual/` (23 preset files, 600+ traits)

Map every material, surface, lighting, and visual-effect trait to PBR parameters. Extends the existing `MATERIAL_PRESETS` pattern in R3FCompiler.

| Category            | Traits                                                  | Example Mappings                  |
| ------------------- | ------------------------------------------------------- | --------------------------------- |
| Material Properties | wooden, marble, granite, bamboo, carbon_fiber, ... (33) | PBR roughness/metalness/color     |
| Surface Textures    | polished, rough, cracked, mossy, rusty, ... (30)        | Normal maps, roughness modifiers  |
| Gems & Minerals     | ruby, emerald, diamond, obsidian, quartz, ... (30)      | IOR, transmission, dispersion     |
| Fabric & Cloth      | silk, leather, denim, velvet, lace, ... (30)            | Sheen, roughness, subsurface      |
| Lighting            | spotlight, candlelight, neon_light, moonlight, ... (28) | Light type, color temp, intensity |
| Visual Effects      | holographic, iridescent, cel_shaded, x_ray, ... (30)    | Custom shaders, post-processing   |
| Age & Condition     | pristine, weathered, ancient, corroded, ... (30)        | Wear overlays, color shifts       |
| Size & Scale        | tiny, colossal, microscopic, towering, ... (18)         | Scale multipliers                 |


**Deliverables:**

- [x] `TraitVisualRegistry` singleton class with PBR config lookup (Feb 2026)
- [x] R3FCompiler integration â€” catch-all block queries registry (Feb 2026)
- [x] 600+ trait â†’ visual mappings across 23 preset categories (Feb 2026)
- [x] Fallback: unknown visual traits get neutral default
- [x] 70-test suite: registry, compositor, cache, procedural resolver, pipeline (Feb 2026)

### Phase 2: Compositional Trait Effects (Q3 2026) â€” âœ… COMPLETE

**Target:** Trait combination rules | **Agent:** Architect + QA
**Location:** `packages/core/src/traits/visual/TraitCompositor.ts`

Define how traits **compose** to modify rendering. Traits act as stackable modifiers rather than 1:1 mappings.

`$lang
@wooden @ancient_era @cursed â†’
  Base: wood PBR (roughness: 0.8, metalness: 0.0)
  + ancient_era modifier: weathering overlay, moss patches, cracks
  + cursed modifier: dark color shift, faint purple particle aura

```

| Modifier Type | Traits                                                          | Effect                                       |
| ------------- | --------------------------------------------------------------- | -------------------------------------------- |
| Era/Period    | prehistoric, medieval, victorian, art_deco, cyberpunk, ... (23) | Color palette, wear level, style hints       |
| Condition     | pristine, damaged, ruined, enchanted, corrupted, ... (30)       | Overlay effects, emission changes            |
| Emotion/Mood  | eerie, serene, chaotic, triumphant, cozy, ... (20)              | Lighting tint, particle aura, ambient sound  |
| Environment   | foggy, underwater, zero_gravity, volcanic, ... (33)             | Scene-level post-processing, physics mods    |
| Magic/Fantasy | enchantable, cursed, blessed, elemental_fire, ... (37)          | Particle systems, glow auras, shader effects |

**Deliverables:**

- [x] `TraitCompositor` class: 9-layer priority merge with suppression, requirements, additive, and multi-trait rules (Feb 2026)
- [x] Composition rules: `@pristine` suppresses corrosion, `@rusted` requires metallic, `@enchanted` adds purple shimmer
- [x] R3FCompiler batch composition call â€” compositor integrated at lines 2603-2608 (Feb 2026)
- [x] BabylonCompiler integration â€” compositor integrated (Feb 2026)
- [x] Visual test suite: 62 snapshot tests across 19 trait combinations (`TraitCombinationSnapshots.test.ts`)

### Phase 3: AI-Assisted Asset Generation (Q4 2026 - Q1 2027) â€” âœ… COMPLETE

**Target:** Semantic traits â†’ generated 3D content | **Agent:** Architect + IDE
**Location:** `packages/core/src/traits/visual/resolvers/`

Use AI/procedural generation to create geometry and textures from semantic trait descriptions. Traits like `@dragon`, `@chair`, `@lighthouse` become actual rendered objects.

| Strategy               | Traits Covered                                    | Technology                                       |
| ---------------------- | ------------------------------------------------- | ------------------------------------------------ |
| Text-to-3D API         | Animals, creatures, furniture, vehicles (~200)    | Meshy, Tripo, Rodin, or self-hosted              |
| Text-to-Texture        | Material/surface traits for custom UV maps (~100) | Stable Diffusion, SDXL                           |
| Procedural Geometry    | Shape traits, construction, nature (~80)          | SDF functions, L-systems, Wave Function Collapse |
| Asset Library Fallback | Common objects with pre-made models (~50)         | GLB/GLTF asset bundles                           |

**Pipeline:**

````text
@dragon @ancient_era @fire_breathing
  1. TraitCompositor resolves visual config
  1. AssetResolver checks local cache â†’ CDN â†’ generation API
  1. Text-to-3D: "ancient dragon" â†’ GLB mesh
  1. TraitCompositor applies @ancient_era weathering shader
  1. Runtime attaches @fire_breathing particle system
  1. Scene renders composed result
`$lang

**Deliverables:**

- [x] `AssetResolverPipeline` with cache-first strategy and plugin architecture (Feb 2026)
- [x] `CacheManager` â€” LRU cache with configurable size limit (Feb 2026)
- [x] `ProceduralResolver` â€” noise-based textures for 10 traits (wood, marble, granite, etc.) (Feb 2026)
- [x] `TextureResolver` â€” AI service adapter with timeout and prompt builder (Feb 2026)
- [x] Text-to-3D adapter interface â€” `Text3DAdapter.ts` (Meshy/Tripo/Rodin/custom, 40 traits)
- [x] Procedural geometry generators â€” `ProceduralGeometryResolver.ts` (tree, rock, terrain, building, arch, crystal; 14 traits)
- [x] Asset manifest format â€” `AssetManifest.ts` (`ManifestResolver` + `AssetManifestBuilder` + `parseManifest`)
- [x] Offline mode: graceful degradation â€” `AssetResolverPipeline` returns `PrimitiveFallback` (box/sphere/cylinder/plane + colour)
- [x] Rate limiting and cost controls â€” `RateLimiter.ts` (token bucket, burst, hard cap, timeout)

### Trait Rendering Coverage Targets

| Milestone                | Traits with Visual Behavior | Coverage |
| ------------------------ | --------------------------- | -------- |
| Pre-expansion (Feb 2026) | ~60                         | 3.9%     |
| **Phase 1-3 (Feb 2026)** | **~660**                    | **43%**  |
| Phase 1 target           | ~310                        | 20%      |
| Phase 2 target           | ~600                        | 39%      |
| Phase 3 target           | ~1,000+                     | 65%+     |
| Long-term (2027+)        | 1,800+                      | 100%     |


---

## 2028 Roadmap (Maintenance & Growth)

- Community-driven feature requests
- Stability and performance improvements
- Ecosystem expansion
- 10,000+ monthly active developers target
- Trait rendering coverage push to 100%

---

## Packages

### Current (v3.x) âœ…

| Package                   | Version | Agent     |
| ------------------------- | ------- | --------- |
| `@holoscript/core`        | 3.0.0   | Architect |
| `@holoscript/cli`         | 3.0.0   | Tooling   |
| `@holoscript/formatter`   | 3.0.0   | Tooling   |
| `@holoscript/linter`      | 3.0.0   | Tooling   |
| `@holoscript/lsp`         | 3.0.0   | IDE       |
| `@holoscript/test`        | 3.0.0   | QA        |
| `@holoscript/vscode`      | 3.0.0   | IDE       |
| `@holoscript/partner-sdk` | 1.0.0   | Tooling   |


### Planned (v3.x)

| Package                | Agent   | Target  |
| ---------------------- | ------- | ------- |
| `@holoscript/visual`   | IDE     | 2027 Q1 |
| `@holoscript/registry` | Tooling | 2026 Q4 |


---

## Milestones (AI-Accelerated Timeline)

### 2026 âœ… COMPLETE

- [x] Feb: Config inheritance + format on save shipped
- [x] Feb: Web playground live
- [x] Feb: Incremental parsing + watch mode
- [x] Feb: Build caching (50% faster builds)
- [x] Feb: Package registry launch + v2.5
- [x] Feb: Visual scripting MVP
- [x] Feb: WASM compiler
- [x] Feb: HoloScript 3.0 release ðŸŽ‰

> **Ahead of Schedule!** All milestones completed in February 2026 thanks to AI-accelerated development.

---

## AI Agent Velocity

- **Work pattern**: 24/7 parallel execution
- **Human weeks â†’ AI days**: ~5:1 compression ratio
- **5 agents in parallel**: 5x throughput multiplier
- **Total acceleration**: ~25x faster than traditional team
- **Buffer**: 30% for review, testing, and iteration

---

## Contributing

```bash
git clone https://github.com/brianonbased-dev/HoloScript.git
cd HoloScript
pnpm install
pnpm build
pnpm test

````

### Current Status: All Sprints Complete âœ…

**HoloScript 3.0 Released** - February 2026

All 10 sprints have been completed:

- Sprint 1-2: Parser, VS Code, incremental compilation
- Sprint 3-4: WASM, WoT/MQTT, headless runtime, URDF/SDF
- Sprint 5-6: Dead code detection, deprecations, publishing
- Sprint 7-8: Visual scripting, AI autocomplete, IntelliJ, Academy
- Sprint 9-10: Certified packages, Partner SDK, 3.0 release

**Next Phase:** Community-driven maintenance and ecosystem growth

---

## AI Agent Assignment

| Agent     | Current Task         | Status       |
| --------- | -------------------- | ------------ |
| Architect | All sprints complete | âœ… Complete |
| Tooling   | All sprints complete | âœ… Complete |
| IDE       | All sprints complete | âœ… Complete |
| QA        | All sprints complete | âœ… Complete |
| Docs      | All sprints complete | âœ… Complete |

---

## Related

- **[Hololand](https://github.com/brianonbased-dev/Hololand)** - Platform runtime
- **[Infinity Assistant](https://infinityassistant.io)** - AI assistant

---

_Last updated: 2026-02-05_
_Roadmap version: 3.0 - All Sprints Complete_
