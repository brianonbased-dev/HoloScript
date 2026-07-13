# @holoscript/r3f-renderer

> Shared React Three Fiber renderer components for HoloScript.

## Overview

Provides reusable R3F (React Three Fiber) components that render HoloScript compositions in the browser. Used by HoloScript Studio and the `preview` command.

## Key Components

| Component             | Purpose                                                    |
| --------------------- | ---------------------------------------------------------- |
| `HoloSceneIRRenderer` | Renders compiled SceneIR from `.holo` / `compile_to_r3f`   |
| `MeshNode`            | Individual mesh rendering with trait/material mapping      |
| `RuntimeTraitHost`    | Ticks compiled runtime traits inside an R3F render loop    |
| `CompiledTraitMesh`   | Mesh fully driven by compiled HoloScript material/behavior |

### Hologram & quilt (2D → 3D)

| Component       | Purpose                                 |
| --------------- | --------------------------------------- |
| `HologramImage` | Still image as depth-displaced hologram |
| `HologramGif`   | Animated GIF holographic sprite         |
| `HologramVideo` | Video texture on displaced surface      |
| `QuiltViewer`   | Looking Glass–style quilt image viewer  |

All are exported from `@holoscript/r3f-renderer` (see `src/index.ts`). Studio **`/playground`** wires drag-and-drop media to generated HoloScript via `HologramDropZone`.

## Usage

```bash
npm install @holoscript/r3f-renderer
```

```tsx
import { Canvas } from '@react-three/fiber';
import { HoloSceneIRRenderer } from '@holoscript/r3f-renderer';

function Preview({ sceneIR }) {
  return (
    <Canvas>
      <HoloSceneIRRenderer node={sceneIR} />
    </Canvas>
  );
}
```

For product scenes, author `.holo` and generate TSX with
`hs compile scene.holo --target r3f -o scene.tsx` or MCP `compile_to_r3f`.
Do not hand-write perceivable scene `.tsx`; the generated file embeds SceneIR and
delegates to this package.

## Features

- PBR material rendering
- Particle system support
- Post-processing effects (bloom, SSAO, DOF)
- GPU instancing for large scenes
- LOD management

## Advanced Rendering Caps

- **Gaussian Splatting (WebGPU)**: For splat rendering, always use the `useGpuSplatSort` hook from `@holoscript/engine/gpu` to bypass CPU bottlenecking during camera rotations.
- **Volumetric CRDT Caps**: Spatial history for splats and dense point clouds is hard-capped at **12MiB per frame delta** via the `@holoscript/crdt` transport protocol to prevent sync lag. Exceeding this cap will drop sync batches. See [`@holoscript/crdt`](../crdt/) for buffer tuning.

## Related

- [`@holoscript/studio`](../studio/) — Uses this for the visual editor
- [`@holoscript/spatial-engine`](../spatial-engine/) — Native spatial computation
- [CompilerBridge](../core/src/compiler/CompilerBridge.ts) — R3F compilation target

## Package boundary & release posture

**Audience.** `@holoscript/r3f-renderer` targets external and internal consumers building custom React Three Fiber viewers on top of HoloScript compositions — HoloScript Studio is the primary internal consumer, but the components are public API for any operator embedding a 3D preview surface.

**Caller-owned scene data.** Every renderer takes the `composition`, camera, and material data as props supplied by the caller; the package does not assume a specific asset CDN or backend. Where GPU/CRDT transport limits are tunable (see the volumetric CRDT cap above), tuning is configured by the operator via props or environment variables, not hardcoded.

**Package boundary.** This package does not ship founder-local paths, private workspace fixtures, or a bundled dev server — `src/components/holoshell/scenes/*` are example scenes shipped as reference content, not a network dependency.

**Release posture.** Known limitations: the volumetric CRDT cap (12MiB/frame) and GPU splat sort hook assume a WebGPU-capable browser and will silently drop batches over the cap rather than error; validate target hardware before shipping. If a renderer regression appears after upgrading, rollback to the prior minor version.

## License

MIT
