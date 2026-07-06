# @holoscript/plugin-film3d-volumetrics

`@holoscript/plugin-film3d-volumetrics` is the Film3D volumetrics domain plugin.
It packages volumetric media, Gaussian splat, NeRF, cinematic camera, semantic
G-code slicer, and CRDT volumetric-root helpers behind one plugin package.

## Install

```bash
npm install @holoscript/plugin-film3d-volumetrics
```

## Use

```ts
import {
  createVolumetricHandler,
  pluginMeta,
  registerVolumetricsWithProvider,
} from '@holoscript/plugin-film3d-volumetrics';
```

## Package Surface

| Surface            | Purpose                                      |
| ------------------ | -------------------------------------------- |
| `volumetric`       | Volumetric media trait handler               |
| `gaussian_splat`   | Gaussian splat trait handler                 |
| `nerf`             | NeRF trait handler                           |
| `cinematic_camera` | Cinematic camera movement and lens metadata  |
| `gcode_slicer`     | Semantic G-code slicing and traversal plans  |
| CRDT volumetrics   | Registers volumetric roots on shared Loro doc |
| `pluginMeta`       | Plugin metadata and trait list               |

## Packaging Note

This package is currently source-first: `main` and `types` point at
`src/index.ts`, and the npm `files` list publishes source plus trait assets and
the plugin manifest. Treat a future `dist` entrypoint migration as its own
hardening pass.

## Strategy Role

This package is domain plugin inventory, not a default fleet install. Use it
when Film3D, volumetric capture, Gaussian splat, NeRF, cinematic camera, or
semantic G-code workflows need these traits directly.

## Validation

```bash
corepack pnpm --filter @holoscript/plugin-film3d-volumetrics run test
corepack pnpm run check:publish-surface
corepack pnpm run check:package-architecture
corepack pnpm run package:opportunity-map
```
