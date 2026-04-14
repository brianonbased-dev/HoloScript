# PlayCanvas Compiler

Compiles HoloScript to [PlayCanvas](https://playcanvas.com/) — the cloud-hosted WebGL game engine used for interactive 3D web applications.

## Overview

The PlayCanvas compiler (`--target playcanvas`) generates a PlayCanvas project — entities, scripts, and assets — from a `.holo` or `.hsplus` source file. PlayCanvas scenes run directly in the browser with no plugin required, making it ideal for embedded 3D experiences, product configurators, and browser-based simulations.

```bash
holoscript compile scene.holo --target playcanvas --output ./playcanvas-project/
```

## Output Structure

```
playcanvas-project/
  __settings__.js       # Project settings
  __start__.js          # Entry point
  scripts/
    HoloScript_*.js     # Per-object script components
  assets/
    materials/
    textures/
  scene.json            # PlayCanvas scene JSON
```

## Trait Mapping

| HoloScript Trait | PlayCanvas Component      |
| ---------------- | ------------------------- |
| `@physics`       | `pc.RigidBodyComponent`   |
| `@collidable`    | `pc.CollisionComponent`   |
| `@animated`      | `pc.AnimComponent`        |
| `@networked`     | Custom sync script        |
| `@grabbable`     | Drag script               |
| `@glowing`       | Emissive material + bloom |
| `@billboard`     | `pc.BillboardComponent`   |

## Example

```holo
composition "ProductViewer" {
  environment {
    skybox: "studio"
    ambient_light: 0.6
  }

  object "Product" {
    geometry: "model/shoe.glb"
    @collidable
    @animated

    onHoverEnter { color = "#ff6600" }
    onHoverExit  { color = "#ffffff" }
  }
}
```

Compiles to a PlayCanvas scene with a drag-to-rotate 3D model viewer in under 30 lines of generated script.

## Compiler Options

| Option            | Default | Description                                  |
| ----------------- | ------- | -------------------------------------------- |
| `--pc-version`    | latest  | PlayCanvas engine version                    |
| `--pc-hosted`     | false   | Emit hosted CDN script tags instead of local |
| `--pc-typescript` | false   | Emit TypeScript scripts                      |
| `--pc-physics`    | ammo    | Physics engine: `ammo` or `cannon`           |

## See Also

- [WebGPU Compiler](/compilers/webgpu) — Modern browser rendering
- [Babylon.js Compiler](/compilers/babylon) — Alternative WebGL engine
- [Three.js Compiler](/compilers/three-js) — Smallest bundle, most flexible
