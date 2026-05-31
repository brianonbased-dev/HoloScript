# @holoscript/core

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
