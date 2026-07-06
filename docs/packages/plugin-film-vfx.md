# @holoscript/plugin-film-vfx

`@holoscript/plugin-film-vfx` is the Film and VFX domain plugin for HoloScript.
It packages film-production traits, runtime registration helpers, text-to-
universe share helpers, and virtual-production metadata bridges without moving
those vertical concerns into HoloScript core.

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

| Surface              | Purpose                                            |
| -------------------- | -------------------------------------------------- |
| `shot_list`          | Shot planning, sequencing, lens, and movement      |
| `color_grade`        | LUTs, lift/gamma/gain, and color intent            |
| `dmx_lighting`       | DMX512, Art-Net, and sACN fixture control          |
| `director_ai`        | Blocking, coverage, motivation, and emotional beat |
| `virtual_production` | LED wall, frustum, camera tracking, and sync       |
| `text_to_universe`   | Text-to-universe rendering bridge                  |
| Runtime integration  | Registers Film/VFX handlers with HoloScriptRuntime |
| CRDT bridge          | Syncs virtual-production metadata into CRDT state  |

## Strategy Role

This package is domain plugin inventory, not a default fleet install. Use it for
Film3, VFX, virtual production, Studio, or text-to-universe workloads that need
the Film/VFX trait set directly.

Keep the core parser/compiler/runtime generic. Domain-specific shot planning,
lighting, color, director-assist, and virtual-production logic belongs here.

## Validation

```bash
corepack pnpm --filter @holoscript/plugin-film-vfx run build
corepack pnpm --filter @holoscript/plugin-film-vfx run test
corepack pnpm run check:publish-surface
corepack pnpm run check:package-architecture
corepack pnpm run package:opportunity-map
```
