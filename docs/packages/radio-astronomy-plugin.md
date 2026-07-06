# @holoscript/radio-astronomy-plugin

`@holoscript/radio-astronomy-plugin` is the radio astrophysics domain plugin
for HoloScript. It packages radio astronomy trait vocabulary, FITS parsing,
spectral cube helpers, viewer components, and an Astropy bridge without moving
science-specific behavior into HoloScript core.

## Install

```bash
npm install @holoscript/radio-astronomy-plugin
```

## Use

```ts
import {
  DOMAIN_MANIFEST,
  PythonAstropyBridge,
  parseFITS,
  SpectralCubeViewer,
} from '@holoscript/radio-astronomy-plugin';
```

## Package Surface

| Surface                | Purpose                                      |
| ---------------------- | -------------------------------------------- |
| `RADIO_ASTRONOMY_TRAITS` | Radio astronomy trait vocabulary           |
| `DOMAIN_MANIFEST`      | Studio and schema-mapper capability metadata |
| `parseFITS` / `buildFITS` | FITS parsing and serialization helpers    |
| `fitsToGrid3D`         | Converts FITS data into spatial grid data    |
| `extractChannel`       | Extracts spectral channels from FITS data    |
| `SpectralCubeViewer`   | Spectral cube visualization component        |
| `FITSViewerPanel`      | FITS viewer panel component                  |
| `PythonAstropyBridge`  | Python Astropy calculation bridge            |

## Packaging Note

This package has a TypeScript build script and points `main` / `types` at
source entrypoints. Treat a future `dist`-first npm entrypoint migration as its
own hardening pass, especially because the package also carries Python bridge
assets.

## Strategy Role

This package is domain plugin inventory, not a default fleet install. Use it
when radio astronomy, FITS data, interferometer, pulsar, synchrotron, or
science-visualization workflows need these traits and bridge helpers directly.

Keep core parser/compiler/runtime generic. Radio astronomy vocabulary, FITS
handling, spectral visualization, and Astropy calls belong here.

## Validation

```bash
corepack pnpm --filter @holoscript/radio-astronomy-plugin run build
corepack pnpm --filter @holoscript/radio-astronomy-plugin run test
corepack pnpm run check:publish-surface
corepack pnpm run check:package-architecture
corepack pnpm run package:opportunity-map
```
