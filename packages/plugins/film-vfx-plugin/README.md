# @holoscript/plugin-film-vfx

Film and VFX domain plugin for HoloScript. It packages film-production traits,
runtime registration helpers, and deterministic virtual-production utilities
without modifying HoloScript core.

## Install

```bash
npm install @holoscript/plugin-film-vfx
```

## Use

```ts
import {
  compile,
  registerFilmVfxTraitHandlers,
  routeNamespacedFilmVFXTraitEnvelopes,
} from '@holoscript/plugin-film-vfx';
```

## Package Surface

| Surface                | Purpose                                            |
| ---------------------- | -------------------------------------------------- |
| `shot_list`            | Shot planning, sequencing, lens, and movement      |
| `color_grade`          | LUTs, lift/gamma/gain, and color intent            |
| `dmx_lighting`         | DMX512, Art-Net, and sACN fixture control          |
| `director_ai`          | Blocking, coverage, motivation, and emotional beat |
| `virtual_production`   | LED wall, frustum, camera tracking, and sync       |
| `text_to_universe`     | Text-to-universe rendering bridge                  |
| Runtime registration   | Registers Film/VFX trait handlers with runtime     |
| Volumetric CRDT bridge | Syncs virtual-production metadata into CRDT state  |

## Strategy Role

This is a long-tail domain plugin. Keep it installable and documented, but do
not promote it into the default fleet package lane unless a concrete Film3,
Studio, laptop, Jetson, or Vast workload needs the Film/VFX traits directly.

## Validation

```bash
corepack pnpm --filter @holoscript/plugin-film-vfx run build
corepack pnpm --filter @holoscript/plugin-film-vfx run test
```
