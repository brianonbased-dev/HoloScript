# Runtime & ECS Architecture

> How HoloScript scenes get instantiated, updated, and rendered.

## Overview

The runtime system takes parsed AST and executes it as a live scene with entities, components, and systems. It supports both visual rendering (R3F, WebGPU) and headless execution (testing, servers, CI).

## Architecture

```text
┌──────────────────────────────────┐
│  AST (from Parser)               │
└──────────────┬───────────────────┘
               ▼
┌──────────────────────────────────┐
│  SceneRunner                     │
│  ├── run() — walk AST            │
│  ├── spawnedEntities — tracking  │
│  └── entity spawning per node    │
│  File: src/runtime/SceneRunner   │
└──────────────┬───────────────────┘
               ▼
┌──────────────────────────────────┐
│  RuntimeBridge                   │
│  ├── sceneRunner reference       │
│  └── connects to renderers       │
│  File: src/runtime/RuntimeBridge │
└──────────┬───────────────────────┘
           │
     ┌─────┴──────┐
     ▼            ▼
┌─────────┐  ┌──────────────┐
│ Renderer│  │HeadlessRuntime│
│ (R3F,   │  │ No GUI       │
│  WebGPU)│  │ CI/Testing   │
└─────────┘  └──────────────┘
```

## Key Classes

| Class                 | File                                         | Purpose                                               |
| --------------------- | -------------------------------------------- | ----------------------------------------------------- |
| `SceneRunner`         | `src/runtime/SceneRunner.ts:41`              | Core scene executor — walks AST tree, spawns entities |
| `HeadlessRuntime`     | `src/runtime/profiles/HeadlessRuntime.ts:95` | GUI-less execution for tests and servers              |
| `RuntimeBridge`       | `src/runtime/RuntimeBridge.ts:47`            | Bridges scene runner to platform renderers            |
| `RuntimeRenderer`     | `src/runtime/RuntimeRenderer.ts:237`         | Base renderer — particle systems, materials           |
| `HeadlessRuntimeImpl` | `src/runtime/HeadlessRuntime.ts:91`          | Headless runtime implementation                       |

## Entity-Component-System (ECS)

Located in `src/ecs/`:

- **Entities**: General-purpose objects identified by unique IDs
- **Components**: Data containers attached to entities (position, velocity, health)
- **Systems**: Logic that processes entities with matching component sets

```typescript
// SceneRunner spawns entities from AST nodes
const runner = new SceneRunner(composition);
await runner.run();

// Access all spawned entities
for (const entity of runner.spawnedEntities) {
  console.log(entity.id, entity.components);
}
```

## Runtime Profiles

| Profile      | Class             | Use Case                         |
| ------------ | ----------------- | -------------------------------- |
| **Full**     | `RuntimeRenderer` | Visual rendering with R3F/WebGPU |
| **Headless** | `HeadlessRuntime` | No-GUI — testing, CI, servers    |
| **Minimal**  | —                 | Lightweight for mobile/embedded  |

## Scene Lifecycle

1. **Parse** — Source code → AST via parser
2. **Compile** (optional) — AST → platform code
3. **Instantiate** — `SceneRunner.run()` walks AST, spawns entities
4. **Update** — Event loop processes systems each frame
5. **Render** — Renderer draws current state (or HeadlessRuntime skips)
6. **Dispose** — Cleanup entities and release resources

## Related

- [SceneRunner tests](../../packages/core/src/__tests__/runtime/)
- [HeadlessRuntime state](../../packages/core/src/runtime/profiles/HeadlessRuntime.ts)
