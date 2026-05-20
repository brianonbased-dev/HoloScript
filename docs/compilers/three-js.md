# Three.js Compiler

**Target**: `--target threejs` | **Output**: JavaScript / TypeScript | **Platform**: Web Browsers + WebXR

## Overview

Compiles HoloScript to JavaScript using [Three.js](https://threejs.org/) — the most popular 3D library for the web. The Three.js compiler is the default web target and is used by the HoloScript playground.

Choose Three.js when you need:

- The largest ecosystem of 3D web tooling
- Fast iteration with Vite or Webpack
- React Three Fiber integration
- A lightweight, framework-agnostic output
- A preview target before exporting to a native engine

## Usage

```bash
holoscript compile scene.holo --target threejs --output ./src/
```

Or use the dev server for instant hot-reload preview:

```bash
holoscript dev scene.holo
# Opens browser at http://localhost:3000 with live reload
```

## Quick Start

```bash
npm install @holoscript/core
```

```typescript
import { threeJsCompiler } from '@holoscript/core';
import { HoloScriptPlusParser } from '@holoscript/core';

const parser = new HoloScriptPlusParser();
const { ast } = parser.parse(`
  composition "Three Scene" {
    object "Cube" {
      @grabbable
      @glowing
      position: [0, 1, -3]
      color: "#00aaff"
    }
  }
`);

const jsCode = threeJsCompiler(ast);
// Returns JavaScript string — write to file or inject into page
```

## Sample Output

**Input (.holo):**

```holo
composition "Hello Three" {
  environment {
    skybox: "gradient"
    ambient_light: 0.5
  }

  object "GlowOrb" {
    @glowing
    @physics

    position: [0, 1.5, -3]
    color: "#00ffaa"
    glow_intensity: 1.5
  }
}
```

**Output (JavaScript):**

```javascript
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.6, 0);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(5, 10, 5);
scene.add(dirLight);

// GlowOrb
const orbGeometry = new THREE.SphereGeometry(0.15, 32, 32);
const orbMaterial = new THREE.MeshStandardMaterial({
  color: 0x00ffaa,
  emissive: 0x00ffaa,
  emissiveIntensity: 1.5,
  roughness: 0.1,
  metalness: 0.0,
});
const orbMesh = new THREE.Mesh(orbGeometry, orbMaterial);
orbMesh.position.set(0, 1.5, -3);
scene.add(orbMesh);

// Render loop
renderer.setAnimationLoop(() => {
  renderer.render(scene, camera);
});
```

## Trait Mapping

| HoloScript Trait | Three.js Implementation                 |
| ---------------- | --------------------------------------- |
| `@grabbable`     | `XRGrabbable` (three-mesh-ui or custom) |
| `@throwable`     | Velocity tracking on release            |
| `@physics`       | Cannon.js or Rapier WASM                |
| `@collidable`    | Cannon.js/Rapier body                   |
| `@glowing`       | `emissiveIntensity` + `UnrealBloomPass` |
| `@networked`     | Socket.IO or Croquet                    |
| `@spatial_audio` | `PositionalAudio` (Web Audio API)       |
| `@billboard`     | `Sprite` or `Object3D.lookAt(camera)`   |
| `@hand_tracked`  | `XRHand` API                            |

## WebXR Setup

The compiler automatically includes:

```javascript
renderer.xr.enabled = true;
document.body.appendChild(VRButton.createButton(renderer));
```

For hand tracking:

```javascript
const hand1 = renderer.xr.getHand(0); // right
const hand2 = renderer.xr.getHand(1); // left
scene.add(hand1, hand2);
```

## React Three Fiber

Use the `--framework react-three-fiber` flag to emit JSX components:

```bash
holoscript compile scene.holo --target threejs --framework react-three-fiber
```

Output:

```jsx
import { Canvas } from '@react-three/fiber';
import { Physics, RigidBody } from '@react-three/rapier';
import { XR, Controllers } from '@react-three/xr';

export function Scene() {
  return (
    <Canvas>
      <XR>
        <Controllers />
        <Physics>
          <RigidBody>
            <mesh position={[0, 1.5, -3]}>
              <sphereGeometry args={[0.15]} />
              <meshStandardMaterial color="#00aaff" emissive="#00aaff" emissiveIntensity={1.5} />
            </mesh>
          </RigidBody>
        </Physics>
      </XR>
    </Canvas>
  );
}
```

## Features

- WebXR VR + AR mode
- Automatic `VRButton` injection
- Hand tracking support
- Cannon.js / Rapier physics integration
- GLTF model loading with `GLTFLoader`
- Post-processing via `EffectComposer` (bloom, SSAO)
- React Three Fiber output option
- Hot-reload via `holoscript dev`

## HoloScript for Three.js / R3F Developers

If you already love Three.js or React Three Fiber, HoloScript is the **simulation + provenance layer** you have been missing.

**Same .holo source** compiles to:
- Three.js / R3F (your current stack)
- Babylon.js
- WebGPU (low-level)
- Unity, Unreal, Godot, USD, VRChat, etc.

**What you get that pure Three.js/R3F cannot provide today**:
- **SimulationContract** — every object carries receipts, provenance, and causal history across compiles.
- **Multi-target IR** — the same physics + traits scene works in R3F *and* a native Godot/Unreal build without rewriting.
- **Agent-native MCP** — generate or modify the scene from Claude/Cursor/Grok without leaving your editor.
- **CRDT collaboration** — real-time multi-user editing that survives export to any target.

**Quick win for existing R3F projects**:
1. Keep your Three.js / R3F frontend.
2. Move the authoritative scene description to `.holo`.
3. Use `compile_to_threejs` (or the R3F renderer) for the web view.
4. Use the same `.holo` for Godot/Unreal exports when you need native performance.

HoloScript does not replace Three.js/R3F — it gives it a semantic, simulatable, multi-target brain.

---

## See Also

- [Platform Overview](/compilers/)
- [Babylon.js Compiler](/compilers/babylon)
- [WebGPU Compiler](/compilers/webgpu)
- [Quick Start](/guides/quick-start)
- [Export Example](/examples/export)
- [R3F Renderer](/r3f-renderer/) — first-class React Three Fiber integration
