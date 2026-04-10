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

## Related

- [`@holoscript/studio`](../studio/) — Uses this for the visual editor
- [`@holoscript/spatial-engine`](../spatial-engine/) — Native spatial computation
- [CompilerBridge](../core/src/compiler/CompilerBridge.ts) — R3F compilation target

## License

MIT
