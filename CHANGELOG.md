# Changelog

All notable changes to HoloScript are documented here.

---

## [Unreleased]

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

| Subsystem | Suites | Highlights |
|---|---|---|
| **AI** | 10+ | BehaviorTree (all node types), StateMachine, UtilityAI (5 curve types), Blackboard, GoalPlanner (GOAP), InfluenceMap, PerceptionSystem, BehaviorSelector |
| **UI** | 10+ | UIDataBinding, UIEventRouter, UIWidget tree, UILayout (flexbox), UIRenderer, UIButton/Slider/TextInput factories |
| **Physics** | 10+ | SoftBodySolver, ClothSim, FluidSim (SPH), RopeSystem, VehicleSystem, JointSystem, RagdollSystem, ConstraintSolver, SpatialHash, TriggerZone, RaycastSystem, DeformableMesh |
| **ECS** | 5 | World (entity lifecycle, tags, queries, undo/redo), ComponentStore, SystemScheduler, EntityRegistry, ReactiveECS |
| **Animation** | 4 | AnimationGraph (state machine, layers), AnimationEngine (9 easing functions), CurveEditor (7 presets, wrapMode), Timeline |
| **Audio** | 4 | AudioMixer, AudioEnvelope (ADSR), AudioDynamics (compressor/limiter/gate), AudioFilter (EQ 5 types), ErosionSim |
| **Terrain** | 4 | TerrainLOD (quadtree, stitching), TerrainBrush (5 modes, undo), ErosionSim (hydraulic/thermal), WorldStreamer |
| **Gameplay** | 10+ | QuestManager, InventorySystem, LootTable, CraftingSystem, AchievementSystem, JournalTracker, LeaderboardManager, ProgressionTree, RewardSystem |
| **Combat/Dialogue** | 10+ | DamageSystem, StatusEffects, ComboTracker, CombatManager, HitboxSystem, ProjectileSystem, DialogueGraph, DialogueRunner, ChoiceManager, EmotionSystem, BarkManager, Localization |
| **Procgen/Navigation** | 7 | DungeonGenerator (BSP), NoiseGenerator (perlin/value/worley/fBm), WaveFunction (WFC), NavMesh (A*), AStarPathfinder, SteeringBehaviors, BuildingGenerator |
| **Spatial Indexing** | 5 | KDTree (2D/3D, k-nearest, radius), OctreeIndex, BVHBuilder (SAH), SpatialGrid, FrustumCuller |
| **Scripting** | 5 | ScriptVM, EventScriptBridge, ScriptContext, ScriptScheduler, HoloScriptLang |
| **Multiplayer** | 9 | SnapshotInterpolation, LagCompensation, ClientPrediction, EntityAuthority, NetworkInterpolation, ReplicationManager, NetworkedTrait, SyncProtocol, DeltaEncoder |
| **Render** | 4 | WebGPURenderer (mock GPU), PostProcessPipeline (bloom/SSAO/tonemap), PostProcessEffect, PhysicsDebugDrawer |
| **Compiler** | 15+ | TypeAliasRegistry, SecurityPolicy, TraitDependencyGraph, RichErrors, ErrorCollector, ParseCache, IncrementalCompiler, TypoDetector, SDFCompiler, CompletionProvider, BundleAnalyzer, BundleSplitter, TreeShaker, SourceMapGenerator |
| **Assets** | 5 | AssetManifest, AssetRegistry, AssetValidator, ResourceLoader, SmartAssetLoader |
| **Persistence** | 5 | SaveManager, AutoSaveSystem, SaveSerializer, SceneSerializer, CRDT/UndoManager/ReactiveState |
| **Traits (XR/AI/Web3)** | 20+ | All VisionOS traits (SharePlay, VolumetricWindow, SpatialPersona, ObjectTracking, SceneReconstruction, RealityKitMesh), AI traits (DiffusionRealtime, EmbeddingSearch, AiInpainting, AiTextureGen, ControlNet, SpatialNavigation), Web3 (NFTTrait, WalletTrait, TokenGatedTrait, ZoraCoins, MarketplaceIntegration), MultiAgentTrait, LLMAgentTrait, RenderNetworkTrait |
| **Debug/Tools** | 8 | Profiler, MemoryTracker, GarbageCollector, DebugConsole, DebugRenderer, EntityInspector, RuntimeProfiler, DeveloperExperience |
| **Accessibility/i18n** | 2 | AccessibilitySystem (font scaling, contrast, screen reader, focus, remapping), I18nManager |
| **Plugins/Audit** | 5 | ModRegistry, PluginAPI, AuditQueryBuilder, ComplianceReporter (SOC2/GDPR), BuildOptimizer |

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
