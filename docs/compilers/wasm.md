# WebAssembly (WASM) Compiler

Compiles HoloScript to [WebAssembly](https://webassembly.org/) binary modules — portable, near-native speed execution for the browser, server (Node.js/Deno), and edge runtimes.

## Overview

The WASM compiler (`--target wasm`) generates `.wasm` binary modules from HoloScript logic definitions. Physics simulations, collision detection, pathfinding, and procedural generation all run at near-native speed inside the WASM sandbox — with a thin JavaScript bridge for DOM/WebXR integration.

```bash
holoscript compile scene.holo --target wasm --output ./dist/
```

## Output Structure

```
dist/
  holoscript.wasm      # Core logic binary
  holoscript.js        # JS glue / bindings
  holoscript.d.ts      # TypeScript types
  assets/              # Static scene data
```

## What Gets Compiled to WASM

| HoloScript System   | WASM Module               | Why WASM?                   |
| ------------------- | ------------------------- | --------------------------- |
| Physics simulation  | `physics.wasm`            | 60fps rigid body at 100+ objects |
| Pathfinding (A\*)   | `nav.wasm`                | Large navmesh without stutter |
| Procedural geometry | `procgen.wasm`            | Real-time mesh generation   |
| Collision detection | `collision.wasm`          | Sub-ms broad-phase          |
| SNN / neuromorphic  | Via `NIRToWGSL` + compute | GPU path preferred          |

Rendering, networking, and XR input stay in JavaScript and call into WASM for computation.

## Trait Mapping

| HoloScript Trait   | WASM Behaviour                         |
| ------------------ | --------------------------------------- |
| `@physics`         | Full WASM physics step per-frame        |
| `@pathfinding`     | WASM A\* / flow-field                   |
| `@collidable`      | WASM broad+narrow phase                 |
| `@procedural`      | WASM mesh generation, JS receives verts |
| All others         | Remain in JS bridge layer               |

## Example

```holo
composition "PhysicsBench" {
  template "Ball" {
    @physics
    @collidable
    geometry: "sphere"

    physics: { mass: 1.0, restitution: 0.8 }
  }

  spatial_group "Stack" {
    object "Ball_1" using "Ball" { position: [0, 5, 0] }
    object "Ball_2" using "Ball" { position: [0, 7, 0] }
    object "Ball_3" using "Ball" { position: [0, 9, 0] }
  }
}
```

```bash
holoscript compile bench.holo --target wasm
# → holoscript.wasm (physics loop), holoscript.js (renderer + init)
```

## Compiler Options

| Option             | Default | Description                              |
| ------------------ | ------- | ---------------------------------------- |
| `--wasm-simd`      | true    | Enable WASM SIMD (128-bit vector ops)    |
| `--wasm-threads`   | false   | Enable SharedArrayBuffer threading       |
| `--wasm-gc`        | false   | Enable WASM GC proposal (experimental)  |
| `--wasm-split`     | false   | Per-system module splitting              |
| `--wasm-optimize`  | 2       | Binaryen optimization level (0-3)        |

## Browser Support

| Feature       | Chrome | Firefox | Safari | Edge |
| ------------- | ------ | ------- | ------ | ---- |
| Base WASM     | 57+    | 52+     | 11+    | 16+  |
| SIMD          | 91+    | 90+     | 16.4+  | 91+  |
| Threads       | 74+    | 79+     | 15.2+  | 74+  |

## Edge & Server

The WASM output runs identically in:
- Node.js (`--experimental-wasm-*`)
- Deno (`import ... from './holoscript.wasm'`)
- Cloudflare Workers (`wasm_modules`)
- Fastly Compute@Edge

## See Also

- [WebGPU Compiler](/compilers/webgpu) — GPU compute path
- [Neuromorphic Compiler](/compilers/neuromorphic) — SNN on GPU via NIRToWGSL
