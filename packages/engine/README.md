# @holoscript/engine

> Spatial engine powering HoloScript's 3D runtime — rendering, physics, particles, post-processing.

## Overview

The engine package provides the spatial computation layer for HoloScript. It bridges parsed HoloScript compositions to live 3D rendering via React Three Fiber,  WebGPU, and native platform renderers.

## Key Components

| Component | Purpose |
|-----------|---------|
| **RuntimeRenderer** | Base renderer with particle systems, PBR materials |
| **SceneRunner** | AST walker that spawns entities and runs compositions |
| **RuntimeBridge** | Connects SceneRunner to platform-specific renderers |
| **HeadlessRuntime** | No-GUI execution for testing, servers, CI |
| **ECS** | Entity-Component-System architecture |

## Features

- **PBR Materials** — `pbr_material`, `glass_material`, `toon_material`, `subsurface_material`
- **Particle Systems** — Sub-emitters, color/size over lifetime, emission shapes
- **Post-Processing** — Bloom, DOF, SSAO, color grading, motion blur, tone mapping
- **Weather Systems** — Rain, snow, fog, time-of-day, wind
- **Physics** — Rigidbodies, colliders, joints, force fields, articulation
- **Navigation** — Navmesh, behavior trees, crowd management

## Usage

```typescript
import { SceneRunner, HeadlessRuntime } from '@holoscript/engine';

// Run a composition headlessly
const runtime = new HeadlessRuntime();
const runner = new SceneRunner(composition);
await runner.run();

// Access spawned entities
console.log(runner.spawnedEntities);
```

## Related

- [`@holoscript/core`](../core/) — Parsers and compilers
- [`@holoscript/runtime`](../runtime/) — Runtime profiles
- [`@holoscript/r3f-renderer`](../r3f-renderer/) — React Three Fiber renderer
- [`@holoscript/spatial-engine`](../spatial-engine/) — Native spatial computation

## License

MIT
