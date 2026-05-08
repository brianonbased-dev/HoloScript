# HoloLand Render Pipeline Descriptors

> **Status**: P3 — covers the 26 TS files in `packages/r3f-renderer` as `.holo` configuration surface.

These `.holo` files describe the React Three Fiber render pipeline stages in HoloScript's native format. Each pipeline defines:

- **Stages** — ordered render passes (bloom, tone mapping, SSAO, FXAA, etc.)
- **Presets** — quality tiers (Low, Medium, High, Ultra) that override base parameters
- **Biomes / Environments** — domain-specific configurations (ocean, terrain, atmosphere)

## Pipeline Files

| File | Domain | Stages | Presets |
|------|--------|--------|---------|
| `post-processing.holo` | Screen-space effects | bloom, tone_mapping, SSAO, FXAA | Low, Medium, High |
| `atmosphere.holo` | Sky, fog, scattering | sky, fog, scattering | ClearDay, Sunset, Foggy |
| `ocean.holo` | Water surface | Gerstner waves, foam, caustics, reflection | Calm, Stormy |
| `terrain.holo` | Biome terrain | mesh, noise, biomes, material, LOD | LowPoly, Ultra |
| `global-illumination.holo` | GI and light probes | irradiance, reflection, AO | Low, Medium, High |
| `vfx-particles.holo` | Particle systems | emitter, particle, forces, rendering | Fire, Smoke, Sparks, Magic |
| `spatial-audio.holo` | 3D audio | HRTF, reverb, occlusion, VAD | Room, Hall, Outdoor |
| `hologram.holo` | 2D-to-3D display | source, display, rendering, depth | Quilt, MV-HEVC, PointCloud |

## Usage

```bash
# Compile a pipeline to TypeScript
holoscript compile examples/hololand/render-pipelines/ocean.holo --target typescript

# Apply a preset at runtime
holoscript apply examples/hololand/render-pipelines/terrain.holo --preset TerrainLowPoly
```

## R3F Mapping

Each `.holo` pipeline maps to a set of `@holoscript/r3f-renderer` components:

- `PostProcessing` → `<PostProcessingRenderer>`
- `Atmosphere` → `<AtmosphereRenderer>`
- `Ocean` → `<OceanRenderer>`
- `Terrain` → `<TerrainRenderer>`
- `GlobalIllumination` → `<GIRenderer>`
- `VFXParticles` → `<VFXParticleRenderer>`
- `SpatialAudio` → `<SpatialAudioRenderer>`
- `Hologram` → `<QuiltViewer>`, `<GaussianSplatViewer>`

## See Also

- `packages/r3f-renderer/src/` — TypeScript component implementations
- `research/audit-reports/hololand-ts-only-classification-2026-05-07.md` — audit context
