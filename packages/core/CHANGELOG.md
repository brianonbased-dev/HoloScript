# @holoscript/core

## 8.9.0

### Minor Changes

- Core and CLI changes merged to main between the 8.7.0 release (2026-08-13) and
  this one. They were not recorded as changesets at the time; the git history of
  `packages/core` and `packages/cli` since 2026-08-13 is the full list.

  **Behavior change (security):** a pipeline no longer reads environment variables
  on its own. Each variable it reads must be allowed by the operator with
  `--allow-env <NAME>` or the `HOLOSCRIPT_PIPELINE_ALLOW_ENV=NAME,NAME` environment
  variable (this includes `HOLOSCRIPT_MCP_URL`). A pipeline that read
  environment variables under 8.7.0 runs under 8.9.0 without them until they are
  allowed. A pipeline file can also no longer send `HOLOSCRIPT_API_KEY` to a
  server it chose, and gets no loopback server of its own.

  Other highlights:

  - Scene blocks: objects written inside a `scene` now reach WebGPU, Godot, Android,
    iOS, visionOS, Android XR, Quest and Studio's viewport, and a scene that reuses
    an object name no longer breaks WebGPU or Godot output.
  - Every export target carries a readiness tier its evidence earns.
  - Three.js output emits rotation in radians (HoloScript rotation is degrees);
    iOS and Android round parts and cylinders are sized like Quest and the web.
  - The `.hsplus` Rust checker loads from built output.
  - `query --dir` searches the directory it absorbed.
  - Traits can describe their own fields, and editor affordances are refused for a
    trait name two traits claim.

### Patch Changes

- @holoscript/agent-protocol@8.9.0

## 8.7.0

### Minor Changes

- 64f7022: Expose structured HoloScript+ record fields through the supported core and parser entry points,
  including a fail-closed source-to-HoloMeaning projection for `@unknown` fields. Canonical parser
  APIs now return `HSPlusParseResult` with a required typed AST while `HSPlusCompileResult` retains
  optional typed AST compatibility for handwritten results. Keep the zero-runtime core-types mirror
  in sync and harden LSP safety extraction against malformed or cyclic AST input.
- d26629c: Add source-run receipt v3 with deterministic `.holo` source re-projection,
  world-provenance verification, closed nested receipt contracts, and a durable
  three-format Model Village experiment fixture while preserving v2
  verification. Expose the canonical `.holo` tokenizer so the admitted world
  profile can fail closed on non-static token classes, properties, traits, and
  lifecycle syntax. Pose/physics output is declaration metadata, not solver
  execution.

### Patch Changes

- 7c22951: Fix clean public-registry imports by lazily materializing `VR_TRAITS` in parser error recovery instead of spreading it at module load time.
- 664f178: Require authored `.holo` `seeks` and selected-barrier `shields` relationships before the bounded
  HSI causal loop can resolve or act, with deterministic fail-closed receipts for unbound queries.
- Updated dependencies [64f7022]
  - @holoscript/core-types@6.2.0
  - @holoscript/agent-protocol@8.7.0

## 8.0.13

### Patch Changes

- Remove upward optional HoloScript package peers from the core manifest so downstream packages can install without solving the whole fleet graph.
- Updated dependencies
  - @holoscript/platform@6.1.3

## 8.0.6

### Patch Changes

- c64fc1a: Re-lockstep the changesets `fixed` group after W.669's emergency out-of-band publish-fix republishes desynced its members (core 6.1.3, cli 6.1.1, agent-protocol/snn-webgpu/uaal 6.1.0, holo-vm 6.1.1). On the next `changeset version` this realigns all six fixed-group packages to a single coordinated version (6.1.4), restoring the invariant the `fixed` config requires. No functional code change — version-hygiene reconciliation only.

  NOTE: holo-vm's npm `latest` is stranded on the abandoned 7.0.0 platform line (6.1.x was never published for it); a coordinated 6.1.4 publish does NOT reclaim its `latest` tag. That, plus the broader Class-B stranded-7.0.0 set (benchmark, formatter, linter, lsp, mcp-server, partner-sdk, r3f-renderer, std, visual, wasm), is tracked separately as a deliberate release/dist-tag operation — see the board task on npm publish drift reconciliation.

- Updated dependencies [c64fc1a]
- Updated dependencies [6dc9732]
  - @holoscript/agent-protocol@8.0.6
  - @holoscript/engine@6.1.3
  - @holoscript/platform@6.1.2

## 8.0.1

### Patch Changes

- Fix the README § Usage on-ramp so a fresh `npm install @holoscript/core` user's documented first use runs end to end. `HoloCompositionParser` is invoked with `.parse()` (the class has no `.parseHolo()` method — that is a standalone export), the `const result` collision is deduped to `const composition`, and the compile example uses `composition.ast`. The `cold-repro-onramp` falsifier now probes the full on-ramp (HoloScriptPlusParser + HoloCompositionParser + UnityCompiler, ESM and CJS) and runs pre-publish. (task_1780207572551_ax8w)

## 8.0.0

### Major Changes — BREAKING

- **Cold-consumable barrel.** `import '@holoscript/core'` no longer eager-loads the optional `@holoscript/engine` / `@holoscript/mesh` / `@holoscript/framework` peers, so a fresh `npm install @holoscript/core` (without those peers) now imports cleanly instead of crashing with `ERR_MODULE_NOT_FOUND: @holoscript/engine`. This fixes the public on-ramp that was broken on 6.1.3 and 7.0.0.

  To achieve this, **70 engine/mesh/framework-backed VALUE exports moved off the main barrel to the `@holoscript/core/runtime` subpath.** Their TYPES remain exported from `@holoscript/core` (so `import type { … }` is unaffected). Affected runtime values include: `HoloScriptRuntime`, `HoloScriptAgentRuntime`, `HoloScriptDebugger`, `createDebugger`; the behavior-tree/AI set (`BehaviorTree`, `Blackboard`, `StateMachine`, `SequenceNode`, `SelectorNode`, `ParallelNode`, `InverterNode`, `RepeaterNode`, `GuardNode`, `ActionNode`, `ConditionNode`, `WaitNode`, `BTNode`); the agents/CRDT/swarm set (`CulturalMemory`, `NormEngine`, `AgentRegistry`, `LWWRegister`, `GCounter`, `ORSet`, `SwarmCoordinator`, …); `SparsityMonitor`; engine systems (`CameraController`, `InventorySystem`, `TerrainSystem`, `LightingModel`, `ShaderGraph`, `CombatManager`, `AStarPathfinder`, `NavMesh`, `ParticleSystem`, `LODManager`, `InputManager`, `CultureRuntime`, `GaussianSplatExtractor`, `ChoreographyEngine`, `DialogueGraph`, `DialogueRunner`); and mesh (`CollaborationSession`, `NetworkManager`, `WebRTCTransport`, `ConsensusManager`, `AgentMessaging`). See `src/runtime.ts` for the authoritative list.

  **Migration:** change `import { HoloScriptRuntime } from '@holoscript/core'` → `import { HoloScriptRuntime } from '@holoscript/core/runtime'` (and likewise for any moved value above). `import type` imports need no change. The `@holoscript/core/runtime` subpath requires the relevant optional peer to be installed.

- **Engine-backed trait lifecycle methods are now async.** Trait handlers that touch optional peers lazy-load them via `await import()`, so their `onAttach`/`onUpdate`/`onEvent` may return a `Promise`. Callers that depend on a trait's side effect landing synchronously must now `await` the lifecycle call. The `VRTraitRegistry` invokes lifecycle methods fire-and-forget (per-frame), so activation may complete one microtask later than before.

## 6.1.0

### Changed

- Align release metadata with the HoloScript 6.x line. See the root CHANGELOG for the outward-facing release narrative.

## 6.0.3

### Patch Changes

- Updated dependencies [c330bbf]
  - @holoscript/engine@6.0.3
  - @holoscript/framework@6.0.3
  - @holoscript/agent-protocol@6.0.3
