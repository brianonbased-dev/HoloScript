# Development Chronicle

What the git log doesn't tell you.

HoloScript has 2,116 commits across 87 days (Jan 14 – Apr 11, 2026). 1,005 of those carry a `Co-Authored-By` tag — agents built this. But 58 commits touch 100+ files and 129 touch 50+. The batched commits hide the story of how this codebase was actually built.

This document recovers that story. It's organized by session — clusters of commits made within a few hours by the same agent or human. Where a single commit buried multiple features, we decompose it.

**How to read this:** Each session has a date range, commit range, and a description of what was actually built. Mega-commits (50+ files) are flagged and decomposed. The "Should have been" notes show what granular history would have looked like.

**Eras:**
- [Genesis (Jan 14 – Feb 15)](#genesis-jan-14--feb-15) — Foundation through v3.4. Parser, traits, runtime, reorganizations.
- [The Sprint Era (Feb 15 – Mar 12)](#the-sprint-era-feb-15--mar-12) — v3.4 through v5.0. 36 version bumps in 4 days. Daemon born. Studio panel marathon.
- [The Platform Push (Mar 12 – Mar 28)](#the-platform-push-mar-12--mar-28) — v5.0 through v6.0. Absorb extraction, Moltbook pivot, Publishing Protocol, HoloMesh V1-V5.
- [Team Era (Mar 28 – present)](#team-era-mar-28--present) — Post-team infrastructure. Granularity improves but mega-commits persist.

---

## Genesis (Jan 14 – Feb 15)

170 commits. The language, parser, trait system, and first reorganizations.

### Week of Jan 14-17 — Foundation

**Session 1** (Jan 14 evening): `b841c6f9`
- Initial repo. `@holoscript/uaa2-client` package.
- 12 files, 1,542 lines. Clean origin commit.

**Session 2** (Jan 15 night): `55e43a2c`
- `@holoscript/core` (parser, AST, type checker) and `@holoscript/cli`.
- 37 files, 8,324 lines. 8 example `.hs` files.
- Should have been 3 commits: parser+AST, CLI, examples.

**Session 3** (Jan 16, 6-hour marathon): `c37f9b8e` → `4b69e3d6` (18 commits)
- The "HoloScript+" explosion. Built the first version of everything in one evening.
- **MEGA `c37f9b8e`** (114 files, 12,047 lines): HoloScript+ v1.0. 75 files of auto-generated API docs, 20 in `services/llm-service`, 9 in core. Should have been 4+ commits.
- Voice Input, AI NPCs, Commerce traits shipped as focused single commits.
- Phase 3-5 (trait annotations, graphics pipeline, performance optimizer) built and documented.
- **`bef8e4a0`** (25 files, 12,536 lines): Phase 6 UI — full React wrapper + demo app. Should have been split.
- `4b69e3d6` (17 files, 7,068 lines): "Phase 55" — External Core Sync. ImportLoader, animate/modify commands.
- Doc commits every minute (20:05–20:11) suggest automated generation.

**Session 4** (Jan 17): `66da6e38` → `c57f0018` (7 commits)
- Identity crisis: `uaa2-client` → `infinity-builder-client` → `infinityassistant`.
- **MEGA `139036fa`** (169 files, 34,077 lines): Labeled "rename" but actually added `creator-tools` and `demo-apps` packages. 57 new files in `packages/creator-tools`, 55 in core. Should have been: rename (moves), new packages, core changes.
- Build stabilization after the rename: TS errors, version bumps to 2.0.1/2.0.2.

### Week of Jan 18-22 — Type System + Trait Explosion

**Session 5** (Jan 18): `3805f04b` → `3f3da376` (10 commits)
- `HoloScriptValue` strict type replaces `any/unknown` across 28 files.
- Infrastructure nodes: Server, Database, Fetch, Execute, Debug.
- README simplification. References updated from uaa2 to infinityassistant.io.
- `3f3da376` (19 files): "Update core types and tests" — vague message for 19 files.

**Session 6** (Jan 21): `b2e18eb8` → `59a56762` (8 commits)
- HoloScriptValidator + 36 Brittney training files (JSONL).
- 50+ new traits: humanoid avatars, media, analytics, effects.
- **`2942f0ff`** (34 files, 5,072 lines): VRChat export + VSCode extension in one commit. Completely separate packages. Should have been 2 commits.
- `.hsplus` file testing infrastructure.
- NPC parser: `@npc` and `@dialog` keywords.

**Session 7** (Jan 22 late night): `036dae4f` → `16329ce5` (10 commits)
- Parser maturation: while/forEach, `@import`, LSP protocol.
- Three.js adapter: GLTF, physics, spatial audio.
- Babylon.js + PlayCanvas adapters (12 files, 1,731 lines — two adapters in one commit).
- Multiplayer networking package with `@networked` trait.
- Stale file cleanup (–7,012 lines).

**Session 8** (Jan 22 afternoon): `fc96d853` → `32914e90` (7 commits)
- Training examples. README polish. GitHub URL normalization. Unity/XR export adapter.

**Session 9** (Jan 22 evening): `e318c581` → `56202f3f` (7 commits)
- `@holoscript/runtime` package (10 files, 1,884 lines).
- **MEGA `284b5575`** (170 files, –31,917 net): THE BIG REORGANIZATION. Added formatter, linter, LSP, std, fs. Deleted all rendering adapters (moved to Hololand). 94 files deleted from `creator-tools`, 22 from `vrchat-export`. Five operations in one commit.

### Week of Jan 24-27 — Director Mode + Semantic Expansion

**Session 10** (Jan 24 marathon): `d1569eb4` → `722a0acc` (17 commits)
- Massive trait additions: Shader, Networked, Joint, IK, Rigidbody, Trigger, Skeleton, Lobby, Dialog.
- **`cd5acd9f`** (5 files, 19,242 lines): "provider-agnostic AI adapter system." Nearly 20K lines in 5 files. Either generated or massive paste.
- `.holo` composition parser (6 files, 2,905 lines).
- Live test suites: runtime (16), type checker (13), debugger (16), AI adapter (16), CLI (9).

**Session 11** (Jan 25 early morning): `89662395` → `561d18f2` (3 commits)
- **MEGA `d25b96ba`** (82 files, 22,380 lines): VR foundation — 10 packages scaffolded at once (PCG, accessibility, IK, gestures, portals, physics-joints, multiplayer, LOD, haptics, runtime). Should have been one commit per package.

**Session 12** (Jan 25 evening): `47f7aecf` → `3b516a67` (8 commits)
- **MEGA `47f7aecf`** (71 files, 20,550 lines): GitHub Pages + VitePress docs + build fixes. Should have been: VitePress setup, guide content, build fixes, core changes.
- CLI compile command with multi-target support.

**Session 13** (Jan 25 night → Jan 26): `d7b7dead` → `43d823b5` (14 commits)
- **MEGA `b128c30e`** (92 files, 9,216 lines): "v1.3.0" — walkthrough, quickstart, welcome message. Actually 8 separate package updates crammed into one commit.
- Branch rename: `master` → `main`.

**Session 14** (Jan 26 evening): `ddd3005a`
- **MEGA** (50 files, 33,598 lines): Director Mode — relay service, live sync, voice commands. Entire product feature + quickstart examples + VSCode extension + training data. All one commit.

**Session 15** (Jan 27): `d29adca4` → `3952e4c5` (3 commits)
- **MEGA `d29adca4`** (100 files, 13,758 lines): 81 trait handlers + 4 compiler backends + LSP. All in `packages/core`. Should have been 4+ commits.
- **MEGA `333bfe28`** (191 files, –35,888 net): Migrate platform packages to Hololand. 12 packages moved/deleted.

### Week of Jan 28 – Feb 5 — The Silence, Then Sprint Mode

**Session 16** (Jan 28): `7d7d042d`
- **MEGA** (150 files): "parser enhancements, new test infrastructure, and Hololand integration." Actually a second reorganization masquerading as a feature commit.

**[5-DAY GAP: Jan 29 – Feb 2 — no commits]**

**Session 17** (Feb 3): `add825df` → `5b67fda7` (6 commits)
- **MEGA `7cc0b712`** (302 files, 71,200 lines): "comprehensive update — traits, parsers, tests, examples, and tooling." 193 files in `packages/core`. Weeks of work in one commit. Should have been 15-20 commits.

**Session 18** (Feb 4): `0af1bd97` → `215518cc` (3 commits)
- **`ae8f2eb7`** (10 files, 26,426 lines): "Sprint 1: Type checking for null coalescing." Includes performance report JSON blobs and compiled `vscode-extension/out/extension.js` — build artifacts that should never have been committed.

### Week of Feb 5-9 — The v3.0 Sprint Explosion

**Session 19** (Feb 4 night → Feb 5): `f0b84796` → `6b03bc3f` (18 commits)
- **MEGA `1380c135`** (110 files): "Grok/X integration v2.2.1." Actually: Python bindings + MCP server + Grok AI + core changes. Three packages in one commit.
- URDF, SDF, DTDL export targets for robotics/digital twins.
- Render.com deployment. ARCHITECTURE.md added.

**Session 20** (Feb 5 afternoon): `6c4a0f1e` → `2f1fb568` (12 commits)
- **THE LIE: `6c4a0f1e`** (240 files, 54,414 lines): Message says "Increase HeadlessRuntime test timeout to fix flaky test." Actual diff: 240 files and 54K lines. Contains IntelliJ plugin (26 files), partner SDK (20), visual package (17), academy docs (16), CLI (17). The most misleading commit message in the repo.
- Version bump to 3.0.0.

**Session 21** (Feb 7): `6a4525c1` → `be1aa905` (4 commits)
- **THE MONSTER: `6a4525c1`** (965 files, 104,379 lines): "comprehensive test coverage, uAA2 integration support, and documentation updates." 409 files in core, 79 in `docs/api`, 43 in CLI, 36 in VSCode, 25 in `services/llm-service`. Potentially a week of work. Should have been 25-30 commits.
- `be1aa905` (73 files): "run prettier" — formatting-only, because the mega-commit had inconsistent formatting.

**Session 22** (Feb 9, 12-hour marathon): `4db2b43e` → `283dd1a1` (14 commits)
- Trait explosion: VR_TRAITS expanded from handful to 1,525 traits across 61 category modules.
- **MEGA `233671b5`** (172 files, 71,886 lines): "Sprint 6 v3.3.0 — Spatial Export & Rendering (5,538 tests)." 171 files in core. Should have been 10+ commits.
- 58 composition rules, 10 named material presets, TraitCompositor integration.

**Session 23** (Feb 9 evening, 19 commits):
- **MEGA `4319d5df`** (582 files, 56,803 lines): "Sprint 7-9 features." Three sprints = one commit. 445 files of `holoscript-component`, 42 in core, 25 in VSCode, 24 in `marketplace-web`. Should have been 15 commits.
- **`925badec`** (417 files): "consolidate documentation." Mostly moving files around.
- Landing page polish sprint: 10 small CSS commits. Good granularity on these.

### Week of Feb 10-15 — Deployment + Infrastructure

**Session 24** (Feb 12, deployment day): `0b3c890e` → `5f77f47f` (18 commits)
- Railway deployment for 6 services.
- **`f5c98323`** (414 files): "format codebase with Prettier and update documentation." Formatting commit smuggling doc updates. Taints `git blame` for 414 files.
- Runtime systems: orbital mechanics, voice/emotion AI.
- WebXR Phase 4. Tree-sitter grammar fixes.

**Session 25** (Feb 13, duplicate commits):
- **7 feature commits duplicated with different hashes** — a rebase or cherry-pick created duplicates. Blockchain (Zora), networking (WebSocket/WebRTC), compiler (URDF/USD), AI code generation, mutation testing, docs, traits.

---

## The Sprint Era (Feb 15 – Mar 12)

595 commits. v3.4 through v5.0. The version number raced from 3.4 to 3.42 in four days.

### Week of Feb 15-16 — v3.4 Drop + Cycle Machine

**Session 26** (Feb 15 afternoon): `478fed79`
- **MEGA** (505 files, 79,513 lines): The entire `packages/core` runtime engine. 287 modules, 113 test suites, 50+ subsystems. Clearly accumulated work committed in one batch. Should have been 10-15 commits minimum.

**Session 27** (Feb 15 evening): V43 trait registration sprint
- 7 clean commits. Tier 1 (llm_agent, behavior_tree, neural, perception), Tier 2 (visionOS, AI generative), Tier 3 (knowledge, memory, animation). **This is what good commit discipline looks like.**

**Session 28** (Feb 16): `a1c171de` → `ae1aea06` (35 commits)
- **MEGA `a1c171de`** (151 files, 20,055 lines): "Cycles 336-339" — Avatar Persistence, Benchmarks, AI Validator, Cookbook. 140 files in core. Should have been 4+ commits.
- Then: Rapid-fire "Cycles 340-378" — well-scoped 1-8 file commits. Social Presence, WebXR, PartyManager, VRLocomotion, HandTracker, SpatialAudio, VehicleSystem, RagdollSystem, FluidSim, ClothSim.
- **Pattern emerges:** The focused cycle commits (1-8 files each) are well-disciplined. The "Cycles 336-339" batch commit shows what happens when multiple cycles get combined.

### Feb 17 — Version Bump Frenzy

**Session 29** (Feb 17 afternoon-evening): `cc433a68` → `d00c45f1` (52 commits)
- **Version bumped 9 times in 3.5 hours** (v3.10 through v3.18).
- Each "sprint" is a small feature set: trait constraints, type inference, source maps, dead code detection, visual scripting MVP, WASM compiler, team workspaces.
- **`00675339`** (99 files): "commit 99 untracked source files from sprint agents." Accumulated agent drift committed as a batch dump.
- Granular sprints are individually fine. The problem is untracked file accumulation between them.

### Feb 18 — The 84-Commit Day (Test Marathon)

**Session 30** (Feb 18, all day): 84 commits
- Test coverage marathon. Sprints 19-32 (v3.28 through v3.41), each a small acceptance test commit.
- Parallel Roman-numeral test sprints (XVI through C = 16 through 100): deeper unit test pushes, 3-8 files each.
- **`58ce0dd3`** (71 files): Sprint XLIII-XLIV, but 62 of those files are `packages/video-tutorials` snuck in alongside 3 test files.
- The test commits are individually clean. The problem: video-tutorials was smuggled into a test commit.

### Feb 20 — Production Test Mega-Batches

**Session 31** (Feb 20):
- **`4453bb24`** (97 files, 39,815 lines): Says "146 production tests across 3 new files." Actually 97 files. The extra 88 are accumulated untracked files dumped alongside the tests.
- **`c4f3f7f2`** (71 files, 16,104 lines): "63 production test suites + minor implementation updates." 70 files in core. Should have been 10 commits by subsystem.

### Feb 22 — The 33,667 Test Fix

**Session 32** (Feb 22):
- **`c66c81a8`** (167 files, 46,428 lines): "resolve all test failures — 33,667 tests passing." The reconciliation commit after the sprint explosion. 144 files in core. Should have been 5+ commits.

### Feb 23 — The Studio Sprint Marathon

**Session 33** (Feb 23, 26 alphabetical sprints):
- Studio Sprints A through AE, one every ~15 minutes:
  - **A**: 3-panel editor with scene graph, trait inspector, palette
  - **B**: Brittney real LLM integration
  - **C-F**: Asset Library, VR Edit Mode, Scene Serialization, History/Undo
  - **G-I**: Monaco LSP, Multiplayer, Shader Editor, Node Graph, Physics, CI/CD
  - **J-O**: Templates, Collab, Diff, Versioning, Live Preview, AI Autocomplete
  - **P-V**: Export (glTF/USD), Debugger, Animation Keyframes, Audio Visualizer
  - **W-AD**: Environment Builder, Profiler, NodeInspector, Brittney tool code-writeback
- Each sprint bundles 3-4 features (5-17 files, 300-1,600 lines). Good velocity but each should have been 3 separate commits.

### Feb 26-28 — Agent Identity + Studio Scenarios

**Session 34** (Feb 26-27):
- **`e37a6429`** (200 files, 50,999 lines): Studio IDE + marketplace. 186 files in `packages/studio`. Should have been 10+ commits.
- 8 feature branch merges (all empty merge commits): robotics-urdf, config-updates, infrastructure-testing, multiplayer-networking, trait-enhancements, blockchain-integration, ai-generation.

**Session 35** (Feb 27):
- **`49ad0756`** (228 files, 48,558 lines): "AI lifespan context optimization." Contains multiple entirely new packages (react-agent-sdk, spatial-engine, graphql-api) plus tree-sitter grammar plus video tutorials. Should have been 8+ commits.

**Session 36** (Feb 28, 28 commits):
- **`c95bf9e7`** (102 files): "full-stack production extraction." 122 files in `packages/studio`.
- 26 Studio scenario panels shipped. 8 "outside-the-box" scenarios (forensic, molecular, disaster, farm, courtroom, epidemic, surgical).
- **`48839322`** (134 files, 16,767 lines): Studio scenario enhancements + WASM components + spatial engine. 105 in studio, 8 in core. Should have been 5+ commits.

### Mar 1-2 — Architecture Cleanup

**Session 37** (Mar 1):
- **`9c2d0bf8`** (373 files, –15,649 net): "major repository architecture cleanup and consolidation." 227 files in core. File moves/renames/consolidation across the entire repo. Should have been 5+ commits.
- **`b3b669d9`** (74 files, 152,540 insertions): "perception stack and structured physics." Highest insertion count for a sub-100-file commit. Tree-sitter parser regeneration included.

### Mar 3-6 — v5.0 Autonomous Ecosystems

**Session 38** (Mar 5-6):
- `@holoscript/snn-webgpu` package (25 files, 4,726 lines). NIR compiler. Agent protocol/SDK.
- **`3772f508`** (231 files, 63,773 lines): "Hololand integration." 202 files in core, 25 in VSCode extension. Should have been 10+ commits.

**Session 39** (Mar 6, Studio panel explosion):
- Studio panels shipped in pairs: Physics/AI, Animation/Audio, Shader/Combat, Camera/Inventory, Cinematic/Collaboration, FSM/Input, Timeline/Scene.
- **`abb85976`** (15 files, 101,983 insertions): tree-sitter parser regeneration buried in a studio panel commit. Same for `b8b639e0` (16 files, 107,042 insertions).
- Final studio architecture: 44 tabs.

### Mar 7-8 — v5.0.0 Release

**Session 40** (Mar 7):
- **`ebc7320b`**: RELEASE: HoloScript v5.0.0 (Autonomous Ecosystems). 10 files, clean release commit.
- Example sprints 1-15: autonomous ecosystems, multi-tenancy, neuromorphic, cross-reality, 52 rendering traits, 63 NPC roles.

**Session 41** (Mar 8):
- **THE MONSTER: `7e1cbc2c`** (3,806 files, 181,286 insertions): "Track 1 DX & Stability Refinements." 2,259 files in core, 727 in studio, 37+ more directories. The single largest commit in the entire repo. Almost certainly includes build artifacts, generated files, or a mass restructure. No organic session produces 3,806 meaningful file changes.

### Mar 9-12 — Post-Release Polish

**Session 42** (Mar 9):
- `57ae24f0` (139 files): crdt-spatial, snn-poc, export-api packages + codebase cleanup.
- 14 impossibilities research synthesis.

**Session 43** (Mar 11-12, documentation audit):
- `f9145b5a` (210 files): Mass find-and-replace of stale version numbers across studio and core.
- `f93c280a` (102 files): "resolve @holoscript/core test suite blockers."
- 39 multi-format novel use case files. Golden-output snapshot suite. x402 threat model.

---

## The Platform Push (Mar 12 – Mar 28)

544 commits. v5.0 to v6.0. The daemon, the Moltbook pivot, the publishing protocol, HoloMesh.

### Mar 14 — The 50-Commit Sprint Day

- `37c299b5` (59 files): Studio untracked tests consolidated (+10,007 lines).
- Blame overlay, LSP, Draft-to-Mesh-to-Simulation MVP, parser improvements.
- `f1b9bdbb` (69 files): "improvement sprint — barrel, patches, tests, CreatePage cleanup."

### Mar 15 — Trait System Closure

- **`cabf52f0`** (194 files): 7 gap categories (26 traits), 30 handlers, LSP + compiler. 165 files in core.
- **`d63258e3`** (274 files): "complete system closure — Phase A/B/C." 271 files in core. Three phases of trait implementation that should have been three commits.

### Mar 16 — The `any` Type Purge

- **`674d58af`** (154 files): ~960 `any` types eliminated.
- **`e48fb500`** (72 files): ~1,155 more `any` types eliminated.
- Three-phase daemon architecture born: Native ActionHandler bridge, CLI subcommand, 16 standalone handlers.

### Mar 17 — The Daemon Flood (109 commits)

The peak day. The self-improvement daemon ran autonomously:
- **64 single-file auto-fix commits**: `fix(typefix/lint): auto-fix [ReactiveState, ARCompiler, VRRCompiler, HandTrackingTrait, AssetManager, ...]`
- Daemon evolved: think-then-patch (replaced full-file rewrites), GraphRAG-lite ranking, quality scoring, candidate filtering.
- **Total daemon auto-fix commits across Mar 16-21: 95.**

### Mar 18 — HoloClaw Born

- `c4853d18`: HoloClaw v0.1 — general-purpose Claws, skill hot-reload, Discord bridge.
- Claw Shelf Studio page. Seed skills, `@economy` budget, activity SSE.
- `mcp.holoscript.net` pointed at Railway for the first time.
- 23 more daemon auto-fixes.

### Mar 21 — Triple Feature Day

Three major features shipped:
1. **Hologram media pipeline** (33 files): 2D-to-3D hologram pipeline with tests and Studio integration.
2. **Recursive self-improvement pipeline** (21 files): L0/L1/L2 agents through Studio.
3. **GAPS Physics Phase 1+2** (49 files): PBD density, quality tiers, 10 trait handlers, GPU fluid.
- Plus: federated knowledge mesh, GitHub connector with 30 tests.

### Mar 23 — v6 Takes Shape

- **`49c6b381`** (16 files, +145,310/–121,580): v6 Universal Semantic Platform traits + grammar extensions. Tree-sitter `parser.c` regeneration accounts for most line churn.
- x402 economy wired in. A2A protocol. OAuth 2.1. MLIR-style dialect registry. 239 v6 traits.

### Mar 24 — The Compressed Graduation

- **8 versions shipped in one day** (v5.2 through v5.9 + v6.0.0).
- `b6710701` (69 files): v5.5–v5.9 progression — agents, observability, plugins, economy, developer portal.
- `dfc9c85e` (16 files): v6.0 "Universal Semantic Platform" graduation. 8 packages bumped to 6.0.0.
- These weren't real releases. They were retroactive changelog entries imposing structure on a batched history.

### Mar 25 — The Great Extraction

- **`e045c79f`** (130 files): Absorb + pipeline extracted from core into `@holoscript/absorb-service`.
- **`7dc2f367`** (198 files): Absorb-service launched as standalone microservice for Railway.
- **`a15ca541`** (87 files): Studio-api decoupled into `services/studio-api`.
- `7adb1edc` (12 files): Moltbook social integration with 6 MCP tools.
- Net negative lines — this was a reorganization day.

### Mar 26 — The Monster Commit

- **`f6cc7614`** (1,023 files, +225,615 lines): "fix(mcp,core): update Moltbook agent prompt and resolve Vector3/HSPlusRuntime structural drift."
  - **886 files** (86.6%) are `packages/academy` — an entire Next.js learning platform scaffolded in one commit: 232 components, 173 lib modules, 146 tests, 134 hooks, 70 app routes.
  - **22 files** are the actual fix: core trait files (AdvancedPBR, Character, IK, Joint, Lighting, Rigidbody, Skeleton, Trigger, VectorDB) + HSPlusRuntime structural fix.
  - **18 files** in `services/holoscript-net`: landing page components.
  - **~30 files** are temp/debug artifacts that should have been .gitignored: `.git_history_temp.txt`, `vite_error*.txt`, `commit.ps1`.
  - The commit message describes only the 22-file core fix. The 886-file Academy drop is invisible.
- Moltbook daemon brain: philosopher voice, feed browsing, dedup, follow-back.
- L1/L2/L3 challenge escalation pipeline.

### Mar 27 — Publishing Protocol + HoloMesh V1-V2

Three events in one day:
1. **Publishing Protocol** (`ec3d659b`, 17 files): Layers 1-4 — Provenance, Registry, Collect, Remix Revenue. Zora 1155 deployment script. Per-token revenue routing.
2. **Moltbook → HoloMesh pivot** (`f7aa6e87`, 39 files): Moltbook tests deleted. `holomesh/` directory created in mcp-server. CRDT sync, discovery, daemon actions.
3. **v6 Launch commit** (`1bdc048b`, 84 files): 12 new R3F renderers (Atmosphere, Eye, GI, Hair, Ocean, PostProcessing, ScalarField, ShapePool, SkinSS, SpatialAudio, Terrain, VFXParticle) + 17 new traits + 5 environment compositions.
- CI matrix sharding, concurrency, PR aggregations.
- HoloMesh V3 Spatial Feed: CRDTProtocolHandler, FeedParser, SpatialFeedRenderer.

### Mar 28 — HoloMesh V3-V5

- **`439aee73`** (40 files, +7,628): HoloMesh V3 wallet payments + V4 wallet identity + Studio UI.
- **`0807dcd4`** (5 files): HoloMesh V5 Phase 1 — MySpace for Agents core identity traits.
- **`317be1ae`** (9 files): V5 Phase 2+3 — full MySpace trait set + daemon + Studio UI.
- Gossip sync and discovery service. Agent profile page. MCP orchestrator circuit breaker.
- Oracle MCP tool (`holo_oracle_consult`) born.
- V8 accessibility endpoints: mcp-config, quickstart, leaderboard, crosspost.

---

## Team Era (Mar 28 – present)

731 commits. Team/task system established. Granularity improved but mega-commits persist.

This era is covered by the existing CHANGELOG (v6.0.0, v6.0.2, v6.1.0). Key events:
- **Apr 5**: 100 commits. Plugin explosion — 18 domain plugins in one day.
- **Apr 10**: 86 commits. HoloMesh marketplace, Ed25519 knowledge signing, http-routes modularization.
- **`a2d21791`** (599 files): "global maintenance sweep for eslint and type safety." The team era's largest mega-commit.

**Session 44** (Apr 16): `gemini-holoscript`
- **The Sovereign Pivot (v6.1.0)**: Strategically rejected the integration of external competitors (Tencent HY-World/Spatial-TTT).
- Pruned `HYWorldAdapter` and all related external bridges from `@holoscript/llm-provider`.
- Repurposed the `world` node as a first-class declarative construct for sovereign simulation.
- Updated `WorldGeneratorTrait` to default to the `sovereign-3d` native engine (Brittney v43).
- Hardened AST types in `HoloCompositionTypes.ts` to include `HoloWorld`.

The team system didn't eliminate mega-commits (43 commits still touch 50+ files), but they're now labeled better and mixed with genuinely granular work.

---

## The Worst Offenders

| Rank | Commit | Files | Lines | What it says | What it actually is |
|------|--------|-------|-------|--------------|---------------------|
| 1 | `7e1cbc2c` | 3,806 | +181K | "Track 1 DX & Stability Refinements" | Entire repo rebuild — likely build artifacts committed |
| 2 | `f6cc7614` | 1,023 | +226K | "update Moltbook agent prompt" | 886-file Academy platform + 22-file core fix + 30 temp files |
| 3 | `6a4525c1` | 965 | +104K | "comprehensive test coverage" | A week of work across 9 packages in one commit |
| 4 | `4319d5df` | 582 | +57K | "Sprint 7-9 features" | 3 sprints = 5 new packages in one commit |
| 5 | `478fed79` | 505 | +80K | "v3.4.0 Full Runtime Engine" | 287 modules, 50+ subsystems, all in one commit |
| 6 | `925badec` | 417 | +4K | "consolidate documentation" | Mass file reorganization, 201 files moved |
| 7 | `f5c98323` | 414 | +16K | "format codebase with Prettier" | Formatting + doc updates. Taints 414 files in `git blame` |
| 8 | `9c2d0bf8` | 373 | –16K | "major architecture cleanup" | Full repo restructure. Breaks `git log --follow` |
| 9 | `7cc0b712` | 302 | +71K | "comprehensive update" | 5 unrelated categories: traits, parsers, tests, examples, tooling |
| 10 | `d63258e3` | 274 | net 0 | "complete system closure" | Phase A, B, and C of trait implementation combined |

**Also notable for misleading messages:**
- `6c4a0f1e` (240 files, 54K lines): Says "Increase HeadlessRuntime test timeout to fix flaky test." Actually ships IntelliJ plugin, partner SDK, visual package, academy docs, CLI expansion.

---

## Patterns the History Reveals

**1. Velocity over discipline.** The founder was shipping at extreme speed — 18 commits in 6 hours (Jan 16), 109 commits in one day (Mar 17), 84 in one day (Feb 18). Commit hygiene degrades under this velocity. The focused cycle commits (1-8 files each) show what good practice looks like when the pace allows it.

**2. "Comprehensive" = danger.** Any commit with "comprehensive" in the message is a mega-commit conflating unrelated work.

**3. Rename commits carry contraband.** The "rename" commits (`139036fa`, `284b5575`) include major restructuring hidden behind a rename message.

**4. CI firefighting follows mega-commits.** Build fix sessions are almost entirely caused by under-tested mega-commits.

**5. Untracked file accumulation.** Multiple commits explicitly say "commit N untracked source files from sprint agents." The agents worked, nobody committed incrementally, then everything got swept into one commit.

**6. Tree-sitter parser.c regeneration inflates stats.** Several commits show 100K+ line changes because generated `parser.c` files were committed alongside small feature changes.

**7. The daemon taught itself discipline.** Mar 17's 64 auto-fix commits are individually perfect — one file, one fix, clear message. The daemon committed better than the humans.

**8. The v5.2→v5.9 "versions" are fiction.** 8 versions on Mar 24 were retroactive changelog entries, not real releases with users updating.

---

## What This Chronicle Enables

Before this document, `git log f6cc7614` shows "fix: update Moltbook agent prompt." Now you know it contains 886 files of an Academy platform, 22 files of a Vector3 fix, and 30 temp files that should have been .gitignored.

Before, `git blame` on any file in `packages/studio` traces back to one of 3 mega-commits. Now you can see which session and feature the code was actually part of.

This chronicle is permanent context. The git history can't be rewritten, but it can be explained.

---

*Generated 2026-04-11 by the documenter agent from archaeological analysis of 2,116 commits.*
*A pre-commit hook now warns on commits touching 20+ files. Retroactive tags mark the major milestones.*
