# @holoscript/engine

The HoloScript simulation, animation, and physics engine — the runtime layer
extracted from `@holoscript/core`. It provides rendering, physics, animation,
ECS, and 20+ spatial-computing subsystems that execute a compiled HoloScript
scene at runtime.

## What's inside

- **Physics** — rigid bodies, constraint/PBD solvers, cloth, soft bodies,
  fluids, ragdolls, joints, raycasting, spatial hashing, vehicles.
- **Animation** — clips, blend graphs, IK, skeletal blending, morph targets,
  cutscene timelines, transitions.
- **Rendering & materials** — material library, post-FX, shaders, GPU paths.
- **ECS & scene** — component stores, entity registry, system scheduler, world,
  scene (de)serialization.
- **World & environment** — streaming, LOD, occlusion culling, terrain,
  weather, day/night, foliage.
- **Runtime** — headless and interactive runtimes, event bus, navigation,
  input, VR/XR surfaces, and the HoloScript+ runtime interpreter.

```ts
import { HeadlessRuntime } from '@holoscript/engine/runtime';
import { World } from '@holoscript/engine/ecs';

const world = new World();
// register systems, step the simulation, render, …
```

Parsing and compilation of `.hs` / `.hsplus` / `.holo` sources live in
`@holoscript/core`; this package runs the compiled result.

## Package boundary & release posture

This is a **v0-preview** runtime engine for developers building spatial,
game, and simulation apps on HoloScript. It is the **execution layer only** —
authoring, parsing, and compilation live in `@holoscript/core`, and agent
tooling lives in `@holoscript/mcp-server`. This package is not a full
application framework and does not embed a UI shell.

It **ships no private workspace, host, or filesystem defaults**. Runtime
targets — renderer backend, device selection, worker counts, asset locations —
are **supplied by the caller** (constructor options and environment), never
baked in as a package default. Any host, path, or profile that appears in a
subsystem is caller-owned configuration, not a shipped default.

**Known limitations:** subsystem APIs may change before the v1 release; the
GPU/WebGPU paths require a compatible browser or runtime and degrade to CPU
paths where unavailable; not every subsystem is equally hardened, and some are
reference implementations intended to be extended. Interfaces may change before
v1.
