# @holoscript/r3f-renderer

> Shared React Three Fiber renderer components for HoloScript.

## Overview

Provides reusable R3F (React Three Fiber) components that render HoloScript compositions in the browser. Used by HoloScript Studio and the `preview` command.

## Key Components

| Component         | Purpose                                                  |
| ----------------- | -------------------------------------------------------- |
| `SceneRenderer`   | Renders full compositions as R3F scenes                  |
| `ObjectRenderer`  | Individual object rendering with trait mapping           |
| `TraitVisualizer` | Visual representation of traits (bounding boxes, gizmos) |
| `MaterialMapper`  | Maps HoloScript materials to Three.js materials          |

### Hologram & quilt (2D → 3D)

| Component       | Purpose |
| --------------- | ------- |
| `HologramImage` | Still image as depth-displaced hologram |
| `HologramGif`   | Animated GIF holographic sprite |
| `HologramVideo` | Video texture on displaced surface |
| `QuiltViewer`   | Looking Glass–style quilt image viewer |

All are exported from `@holoscript/r3f-renderer` (see `src/index.ts`). Studio **`/playground`** wires drag-and-drop media to generated HoloScript via `HologramDropZone`.

## Usage

```tsx
import { SceneRenderer } from '@holoscript/r3f-renderer';

function Preview({ composition }) {
  return (
    <Canvas>
      <SceneRenderer composition={composition} />
    </Canvas>
  );
}
```

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

## License

MIT
