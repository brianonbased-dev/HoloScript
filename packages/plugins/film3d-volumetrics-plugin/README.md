# @holoscript/plugin-film3d-volumetrics

Film3D volumetrics domain plugin for HoloScript. It packages volumetric media,
Gaussian splat, NeRF, cinematic camera, and semantic G-code slicer traits.

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

| Surface              | Purpose                                      |
| -------------------- | -------------------------------------------- |
| `volumetric`         | Volumetric media trait handler               |
| `gaussian_splat`     | Gaussian splat trait handler                 |
| `nerf`               | NeRF trait handler                           |
| `cinematic_camera`   | Cinematic camera movement and lens metadata  |
| `gcode_slicer`       | Semantic G-code slicing and traversal plans  |
| CRDT volumetrics     | Registers volumetric roots on shared Loro doc |
| `pluginMeta`         | Plugin metadata and trait list               |

## Packaging Note

This package is source-first: `main` and `types` point at `src/index.ts`, and
the npm `files` list publishes source plus trait assets and the plugin manifest.
Do not switch it to `dist` entrypoints without a dedicated hardening pass.

## Strategy Role

This is domain plugin inventory for Film3D and volumetric workflows. Keep it
installable and documented, but do not promote it into the default fleet lane
unless a concrete Studio, Film3, laptop, Jetson, or Vast workload needs these
volumetric traits directly.

## Validation

```bash
corepack pnpm --filter @holoscript/plugin-film3d-volumetrics run test
```
