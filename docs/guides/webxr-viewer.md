# WebXR Viewer Guide

The `WebXRViewer` component provides an embeddable 3D viewer with full WebXR (VR/AR) session support. It compiles HoloScript source code and renders the resulting scene in a `@react-three/fiber` Canvas with VR/AR session management via `@react-three/xr` v6.

## Installation

The `WebXRViewer` is available from the `@holoscript/studio` package:

```tsx
import { WebXRViewer } from '@holoscript/studio/embed';
// or from the platform entry point:
import { WebXRViewer } from '@holoscript/studio/platform';
```

## Basic Usage

```tsx
import { WebXRViewer } from '@holoscript/studio/embed';

function MyApp() {
  const holoScript = `
    composition "Hello VR" {
      environment {
        skybox: "nebula"
        ambient_light: 0.5
      }

      object "Orb" {
        @grabbable
        @glowing
        geometry: "sphere"
        color: "#00ffff"
        position: [0, 1.5, -2]
      }
    }
  `;

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <WebXRViewer code={holoScript} mode="immersive-vr" showGrid={true} showStars={true} />
    </div>
  );
}
```

## Props

| Prop               | Type                                           | Default          | Description                                                          |
| ------------------ | ---------------------------------------------- | ---------------- | -------------------------------------------------------------------- |
| `code`             | `string`                                       | (required)       | HoloScript source code (`.hsplus` or `.holo`)                        |
| `mode`             | `XRSessionMode`                                | `'immersive-vr'` | Preferred XR mode: `'immersive-vr'`, `'immersive-ar'`, or `'inline'` |
| `className`        | `string`                                       | -                | CSS className for the container                                      |
| `style`            | `CSSProperties`                                | -                | Inline styles for the container                                      |
| `showGrid`         | `boolean`                                      | `true`           | Show ground grid (hidden in AR mode)                                 |
| `showStars`        | `boolean`                                      | `true`           | Show background stars (hidden in AR mode)                            |
| `showObjectCount`  | `boolean`                                      | `true`           | Show object count overlay                                            |
| `backgroundColor`  | `string`                                       | `'#0a0a12'`      | Background color (non-AR modes)                                      |
| `selectedObjectId` | `string \| null`                               | -                | Currently selected object ID                                         |
| `onObjectSelect`   | `(id: string \| null) => void`                 | -                | Object selection callback                                            |
| `onErrors`         | `(errors: Array<{ message: string }>) => void` | -                | Compile error callback                                               |
| `onXRSessionStart` | `(mode: XRSessionMode) => void`                | -                | Called when XR session starts                                        |
| `onXRSessionEnd`   | `() => void`                                   | -                | Called when XR session ends                                          |
| `autoEnterXR`      | `boolean`                                      | `false`          | Auto-enter XR mode on mount (requires prior user gesture)            |
| `referenceSpace`   | `XRReferenceSpaceType`                         | `'local-floor'`  | WebXR reference space type                                           |

## XR Session Modes

- **`immersive-vr`**: Full VR headset experience with hand controllers and ray-pointer interaction.
- **`immersive-ar`**: AR passthrough mode. Grid and stars are automatically hidden. Canvas alpha is enabled for transparent background.
- **`inline`**: Standard 3D rendering without XR session. Useful as a fallback.

## XR Capability Detection

The viewer automatically detects available XR capabilities and shows appropriate enter/exit buttons:

- **VR Ready**: Shows "Enter VR" button if `immersive-vr` sessions are supported.
- **AR Ready**: Shows "Enter AR" button if `immersive-ar` sessions are supported.
- **No XR**: Renders as a standard 3D viewer with OrbitControls.

A capability badge is displayed in the top-left corner showing which modes are available.

## Event Handling

### Tracking XR Sessions

```tsx
<WebXRViewer
  code={code}
  onXRSessionStart={(mode) => {
    console.log(`Entered ${mode} session`);
    // Hide 2D UI elements, adjust layout, etc.
  }}
  onXRSessionEnd={() => {
    console.log('Exited XR session');
    // Restore 2D UI
  }}
/>
```

### Handling Compile Errors

```tsx
<WebXRViewer
  code={code}
  onErrors={(errors) => {
    errors.forEach((err) => console.error(err.message));
  }}
/>
```

### Object Selection in XR

Objects can be selected by clicking/tapping in both standard and XR modes:

```tsx
const [selectedId, setSelectedId] = useState<string | null>(null);

<WebXRViewer
  code={code}
  selectedObjectId={selectedId}
  onObjectSelect={(id) => setSelectedId(id)}
/>;
```

Selected objects display a blue wireframe overlay.

## AR Mode Specifics

When the viewer enters AR mode:

1. Background rendering is disabled (transparent canvas alpha).
2. Grid and stars are automatically hidden.
3. The scene renders on top of the camera passthrough.

```tsx
<WebXRViewer
  code={code}
  mode="immersive-ar"
  showGrid={false} // Redundant but explicit
  showStars={false} // Redundant but explicit
/>
```

## Compilation Pipeline

The viewer uses `useScenePipeline` internally, which:

1. Compiles HoloScript source via the `CompilerBridge` (WASM primary, TypeScript fallback).
2. Converts the compiled output to an R3F scene tree.
3. Renders the tree with material presets, lighting, and geometry mapping.

The compilation status is shown as a "Compiling..." indicator in the top-right corner during active compilation.

## Supported Geometries

The viewer renders the following HoloScript geometry types:

| HoloScript Type   | Three.js Geometry  |
| ----------------- | ------------------ |
| `sphere`, `orb`   | `SphereGeometry`   |
| `cube`, `box`     | `BoxGeometry`      |
| `cylinder`        | `CylinderGeometry` |
| `pyramid`, `cone` | `ConeGeometry`     |
| `plane`           | `PlaneGeometry`    |
| `torus`           | `TorusGeometry`    |
| `ring`            | `RingGeometry`     |
| `capsule`         | `CapsuleGeometry`  |

## Comparison with SceneViewer

| Feature                 | SceneViewer | WebXRViewer |
| ----------------------- | ----------- | ----------- |
| 3D Rendering            | Yes         | Yes         |
| OrbitControls           | Yes         | Yes         |
| VR Sessions             | No          | Yes         |
| AR Sessions             | No          | Yes         |
| Hand Tracking           | No          | Yes         |
| Ray-Pointer Interaction | No          | Yes         |
| XR Reference Space      | No          | Yes         |

`WebXRViewer` is a drop-in replacement for `SceneViewer` when XR support is needed. Both share the same geometry/material mapping and scene content rendering.

## Requirements

- React 18+ (React 19 recommended)
- `@react-three/fiber` ^9.x
- `@react-three/xr` ^6.x
- `@react-three/drei` ^10.x
- `@holoscript/core` (workspace dependency)
- A WebXR-capable browser (Chrome 79+, Edge 79+) for VR/AR features
