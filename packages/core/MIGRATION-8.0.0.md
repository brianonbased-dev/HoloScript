# Migrating to `@holoscript/core` 8.0.0

8.0.0 makes `import '@holoscript/core'` **cold-consumable**: a fresh
`npm install @holoscript/core` (without the optional `@holoscript/engine` /
`@holoscript/mesh` / `@holoscript/framework` peers) now imports and runs cleanly
instead of crashing with `ERR_MODULE_NOT_FOUND: @holoscript/engine`. The parser,
AST, compiler, and trait-authoring surface all work peer-free.

The cost of that fix is one breaking change you may need to act on.

## Breaking change 1 — 70 runtime VALUE exports moved to `@holoscript/core/runtime`

Symbols whose implementation lives in an optional peer no longer ship as eager
re-exports from the main barrel. Their **types are unchanged** — only the
**runtime values** moved.

```diff
- import { HoloScriptRuntime, BehaviorTree, NetworkManager } from '@holoscript/core';
+ import { HoloScriptRuntime, BehaviorTree, NetworkManager } from '@holoscript/core/runtime';
```

- `import type { … } from '@holoscript/core'` — **no change needed** (types still
  come from the barrel).
- `@holoscript/core/runtime` requires the relevant optional peer to be installed
  (`@holoscript/engine` / `@holoscript/mesh` / `@holoscript/framework`). That is
  correct: these symbols cannot function without the peer, and now the dependency
  is explicit instead of crashing the whole barrel.

**Affected values** include `HoloScriptRuntime`, `HoloScriptAgentRuntime`,
`HoloScriptDebugger`/`createDebugger`; the behavior-tree/AI set (`BehaviorTree`,
`Blackboard`, `StateMachine`, `SequenceNode`, `SelectorNode`, `ParallelNode`,
`InverterNode`, `RepeaterNode`, `GuardNode`, `ActionNode`, `ConditionNode`,
`WaitNode`, `BTNode`); the agents/CRDT/swarm set (`CulturalMemory`, `NormEngine`,
`AgentRegistry`, `LWWRegister`, `GCounter`, `ORSet`, `SwarmCoordinator`, …);
`SparsityMonitor`; engine systems (`CameraController`, `InventorySystem`,
`TerrainSystem`, `LightingModel`, `ShaderGraph`, `CombatManager`, `AStarPathfinder`,
`NavMesh`, `ParticleSystem`, `LODManager`, `InputManager`, `CultureRuntime`,
`GaussianSplatExtractor`, `ChoreographyEngine`, `DialogueGraph`, `DialogueRunner`);
and mesh (`CollaborationSession`, `NetworkManager`, `WebRTCTransport`,
`ConsensusManager`, `AgentMessaging`).

The **authoritative, always-current list** is `@holoscript/core`'s `runtime`
entry — see `src/runtime.ts` in the package (or the `./runtime` export in
`package.json`).

### Find every import you need to change

```bash
# Lists files that import a value from the bare '@holoscript/core' barrel.
# Cross-check each named import against the moved-symbols list above; move the
# runtime values to '@holoscript/core/runtime', leave parser/AST/compiler/type
# imports alone.
grep -rn "from '@holoscript/core'" src --include='*.ts' --include='*.tsx'
```

If a build breaks after upgrading with `"X" is not exported by @holoscript/core`,
`X` is one of the moved runtime values — repoint that import to
`@holoscript/core/runtime`.

## Breaking change 2 — engine-backed trait lifecycle methods are now async

Trait handlers that touch an optional peer lazy-load it via `await import()`, so
their `onAttach` / `onUpdate` / `onEvent` may return a `Promise`. If your code
depends on a trait's side effect having landed **synchronously** right after the
lifecycle call, `await` it:

```diff
- handler.onAttach(ctx);
- assert(ctx.state.ready);            // may not be set yet
+ await handler.onAttach(ctx);
+ assert(ctx.state.ready);
```

`VRTraitRegistry` invokes lifecycle methods fire-and-forget per frame, so trait
activation may complete one microtask later than in 7.x. Frame-loop consumers
generally need no change; only synchronous assertions on immediate side effects
do.

## Not affected

- `import { HoloScriptPlusParser, parseHolo } from '@holoscript/core'` and the
  whole parser/AST/compiler surface — unchanged, and now peer-free.
- `import type { … } from '@holoscript/core'` — unchanged.
- The `@holoscript/core/parser`, `@holoscript/core/runtime`, and other subpath
  exports — unchanged shape (runtime just gained the moved symbols).
