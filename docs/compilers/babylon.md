# Babylon.js Compiler

**Target**: `--target babylon` | **Output**: TypeScript + Babylon.js | **Platform**: Web Browsers + WebXR

## Overview

Compiles HoloScript to TypeScript using the [Babylon.js](https://www.babylonjs.com/) rendering engine — a full-featured, production-ready WebXR framework from Microsoft.

Choose Babylon.js when you need:

- Enterprise-grade WebXR with Microsoft backing
- Built-in PBR materials and the Babylon Inspector debugger
- Complex physics via Havok or Ammo.js
- `.babylon` / glTF scene file support
- Mixed Reality experiences for HoloLens

## Usage

```bash
holoscript compile scene.holo --target babylon --output ./src/
```

## Quick Start

```bash
npm install @holoscript/core
```

```typescript
import { babylonCompiler } from '@holoscript/core';
import { HoloScriptPlusParser } from '@holoscript/core';

const parser = new HoloScriptPlusParser();
const { ast } = parser.parse(`
  composition "Babylon Scene" {
    object "Orb" {
      @grabbable
      @glowing
      position: [0, 1.5, -3]
      color: "#8844ff"
    }
  }
`);

const output = babylonCompiler(ast);
// Returns TypeScript string
```

## Sample Output

**Input (.holo):**

```holo
composition "Demo" {
  object "Ball" {
    @grabbable
    @physics
    @glowing

    position: [0, 1.5, -3]
    color: "#ff4444"
    glow_intensity: 1.0

    on_grab {
      this.glow_intensity = 3.0
    }
  }
}
```

**Output (TypeScript):**

```typescript
import {
  Engine,
  Scene,
  Vector3,
  Color3,
  MeshBuilder,
  StandardMaterial,
  GlowLayer,
  PhysicsAggregate,
  PhysicsShapeType,
  WebXRDefaultExperience,
} from '@babylonjs/core';

export async function createScene(engine: Engine): Promise<Scene> {
  const scene = new Scene(engine);

  // Camera and lighting
  const camera = new BABYLON.ArcRotateCamera(
    'cam',
    -Math.PI / 2,
    Math.PI / 4,
    10,
    Vector3.Zero(),
    scene
  );
  const light = new BABYLON.HemisphericLight('light', new Vector3(0, 1, 0), scene);

  // Glow layer
  const gl = new GlowLayer('glow', scene);
  gl.intensity = 0.5;

  // Ball
  const ballMesh = MeshBuilder.CreateSphere('Ball', { diameter: 0.3 }, scene);
  ballMesh.position = new Vector3(0, 1.5, -3);

  const ballMat = new StandardMaterial('BallMat', scene);
  ballMat.emissiveColor = Color3.FromHexString('#ff4444');
  ballMesh.material = ballMat;

  // Physics
  const ballPhysics = new PhysicsAggregate(ballMesh, PhysicsShapeType.SPHERE, { mass: 1 }, scene);

  // WebXR
  const xr = await WebXRDefaultExperience.CreateAsync(scene, {
    floorMeshes: [],
    optionalFeatures: true,
  });

  // Grab interaction
  const featureManager = xr.baseExperience.featuresManager;
  const motionControllers = featureManager.enableFeature(
    BABYLON.WebXRFeatureName.HAND_TRACKING,
    'latest'
  );

  return scene;
}
```

## Trait Mapping

| HoloScript Trait | Babylon.js Implementation                                   |
| ---------------- | ----------------------------------------------------------- |
| `@grabbable`     | `WebXRMotionControllerTeleportation` + `SixDofDragBehavior` |
| `@throwable`     | Velocity-based release via `PhysicsAggregate`               |
| `@physics`       | `PhysicsAggregate` (Havok or Ammo.js)                       |
| `@collidable`    | `PhysicsImpostor` mesh collider                             |
| `@glowing`       | `GlowLayer` with emissive material                          |
| `@networked`     | Babylon.js Multiplayer (via Colyseus or custom)             |
| `@spatial_audio` | `Sound` with spatial properties                             |
| `@billboard`     | `BillboardMode.BILLBOARDMODE_ALL`                           |

## Features

- WebGPU rendering support (Babylon.js 6+)
- Built-in Babylon Inspector for live scene debugging
- Havok physics (via WebAssembly)
- glTF/GLB model loading
- Post-processing pipeline (bloom, SSAO, tone mapping)
- Node material editor compatible
- HoloLens / mixed reality support

## See Also

- [Platform Overview](/compilers/)
- [Three.js Compiler](/compilers/three-js)
- [WebGPU Compiler](/compilers/webgpu)
- [Export Example](/examples/export)
