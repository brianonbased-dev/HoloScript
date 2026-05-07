# Studio Material Preset Button Audit - 2026-05-07

Task: `task_1778107862930_d54k` (`TODO - : Audit HoloScript's 78 material presets to determine which can be exposed as visual "one-click" preset buttons in Studio`)

## Verdict

The "78 material presets" count is stale in current `main`.

Measured current catalogs:

| Catalog | Path | Count | Studio implication |
| --- | --- | ---: | --- |
| Renderer/compiler material keys | `packages/core/src/compiler/R3FCompiler.ts` | 219 | Largest runtime name map; too broad for first-pass Studio buttons without categories and capability gating. |
| Audit catalog | `packages/engine/src/materials/MaterialPresetAudit.ts` | 75 | Best candidate source for the requested "78 preset" audit because it includes categories, required features, and R3F compatibility. |
| Unified PBR schema presets | `packages/engine/src/materials/UnifiedPBRSchema.ts` | 35 | Advanced PBR schema sample set; its comment still says it matches 78 presets, but the array does not. |
| MaterialEditor quick-picks | `packages/core/src/tools/MaterialEditor.ts` | 12 | Existing small editor palette; `materialPresetQuickPick.ts` currently exposes only these as quick-pick names. |
| Studio `/api/materials` presets | `services/studio-api/src/app/api/materials/route.ts` | 10 | Current Studio panel feed; useful, but not canonical and only covers simple snippet fields. |

Recommendation: treat `MaterialPresetAudit.ts` as the source for this audit, not the broader 219-key `R3FCompiler.MATERIAL_PRESETS` map and not the 10-item Studio API.

## Current Studio Constraint

`packages/studio/src/components/materials/MaterialPanel.tsx` only builds and applies:

```text
albedo, roughness, metallic, emissive, emissiveIntensity, opacity
```

That means a preset can be a true current one-click Studio button only when its required features fit the current simple material shape:

```text
color, metalness, roughness, emissive, emissiveIntensity, transparent, opacity
```

Everything requiring `transmission`, `ior`, `normalMap`, `map`, `clearcoat`, `sheen`, `subsurface`, `iridescence`, `customShader`, or procedural texture fields needs either a richer Studio preset schema or a preview/fallback badge.

## Direct One-Click Buttons Now

These 16 audit presets fit the current Studio material panel without extending the API schema:

| Group | Presets |
| --- | --- |
| Basic | `default`, `matte`, `glossy`, `plastic`, `rubber` |
| Metal | `copper`, `bronze`, `iron`, `aluminum`, `titanium` |
| Emissive | `neon`, `hologram` |
| Natural | `sandstone`, `clay` |
| Architectural | `polishedConcrete`, `plaster` |

These are the safest first row of visual chips: they can be rendered as color swatches and inserted with today's `@material` snippet structure.

## Expose With Fallback Or Preview

The auditor reports 36 presets with partial renderer support. These can be visible in Studio, but should not be presented as plain "fully faithful" one-click chips until the UI can show that some properties are approximated.

| Category | Partial presets |
| --- | --- |
| Metal | `rustedMetal` |
| Glass | `glass`, `frostedGlass`, `stainedGlass` |
| Emissive | `neon`, `lava`, `hologram`, `screen` |
| Natural | `wood`, `darkWood`, `lightWood`, `stone`, `granite`, `dirt`, `sand`, `grass` |
| Fabric | `leather`, `denim` |
| Architectural | `concrete`, `brick`, `tile`, `asphalt` |
| Sci-fi | `forcefield`, `plasma`, `circuit`, `wireframe` |
| Stylized | `toon`, `toonOutline`, `watercolor`, `pencilSketch`, `pixelArt` |
| Food | `honey` |
| Procedural | `noise`, `checkerboard`, `gradient`, `voronoi` |

UI rule: show these as a second "Preview" or "Advanced" group. Clicking can apply the best available simple values, but the tooltip or inspector should mark missing fields until Studio's material model grows.

## Hold From Plain Buttons

These 25 presets are either degraded or unsupported in the renderer audit and should not ship as plain one-click buttons without explicit preview or capability gating:

| Compatibility | Presets |
| --- | --- |
| Degraded | `chrome`, `gold`, `silver`, `brushedSteel`, `marble`, `snow`, `fabric`, `silk`, `velvet`, `carPaint`, `matteCarPaint`, `pearlescent`, `lacquer`, `ceramic`, `skin`, `skinDark`, `wax`, `leaf`, `eye`, `chocolate`, `cheese` |
| Unsupported in audit | `crystal`, `diamond`, `ice`, `water` |

Most of these are still valuable visually, but they depend on the exact features Studio currently flattens away: environment reflections, subsurface, transmission, iridescence, clearcoat, sheen, texture maps, or custom shader paths.

## Compatibility Snapshot

`runMaterialPresetAudit()` on current `main` reports:

| Metric | Value |
| --- | ---: |
| Total audit presets | 75 |
| Fully supported | 14 |
| Partial support | 36 |
| Degraded | 21 |
| Unsupported | 4 |
| Overall score | 72/100 |

By audit category:

| Category | Total | Full | Partial | Degraded | Unsupported |
| --- | ---: | ---: | ---: | ---: | ---: |
| basic | 5 | 5 | 0 | 0 | 0 |
| metal | 10 | 5 | 1 | 4 | 0 |
| glass | 6 | 0 | 3 | 0 | 3 |
| emissive | 4 | 0 | 4 | 0 | 0 |
| natural | 13 | 2 | 8 | 2 | 1 |
| fabric | 5 | 0 | 2 | 3 | 0 |
| coating | 5 | 0 | 0 | 5 | 0 |
| organic | 5 | 0 | 0 | 5 | 0 |
| architectural | 6 | 2 | 4 | 0 | 0 |
| scifi | 4 | 0 | 4 | 0 | 0 |
| stylized | 5 | 0 | 5 | 0 | 0 |
| food | 3 | 0 | 1 | 2 | 0 |
| procedural | 4 | 0 | 4 | 0 | 0 |

Top missing features blocking faithful Studio buttons:

| Feature | Affected presets | Notes |
| --- | ---: | --- |
| `normalMap` | 17 | Needed for convincing wood, stone, terrain, leather, and water. |
| `customShader` | 11 | Needed for stylized, sci-fi, and procedural looks. |
| `transmission` | 9 | Needed for glass, crystal, water, wax, and honey. |
| `subsurface` | 9 | Needed for skin, wax, leaf, snow, ice, chocolate, and cheese. |
| `map` | 9 | Needed for texture-driven natural and architectural presets. |
| `emissive` | 8 | Studio supports this field, but the audit still marks renderer support partial. |
| `ior` | 7 | Needed for glass/water/gem presets. |
| `clearcoat` | 6 | Needed for coatings, ceramics, car paint, and eye material. |

## Studio Rollout Plan

1. Seed the Studio button grid from the 16 direct one-click presets above.
2. Replace the hard-coded 10-item Studio API catalog with a derived adapter from `MaterialPresetAudit.ts` or a shared core preset manifest.
3. Add schema fields in this order: `transmission`/`ior`, `normalMap`/`map`, `clearcoat`, `sheen`, then `customShader`/`proceduralTexture`.
4. Keep advanced and unsupported presets visible only behind preview-capable groups until the renderer matrix says they are at least partial with a clear fallback.
5. Fix stale docs/comments that still assert 78 presets when current audited count is 75.

## Evidence Commands

```text
pnpm exec tsx -e "import { runMaterialPresetAudit } from './packages/engine/src/materials/MaterialPresetAudit.ts'; const r=runMaterialPresetAudit(); console.log(JSON.stringify({total:r.totalPresets, full:r.fullySupportedCount, partial:r.partialCount, degraded:r.degradedCount, unsupported:r.unsupportedCount, score:r.overallScore}, null, 2));"
# total: 75, full: 14, partial: 36, degraded: 21, unsupported: 4, score: 72
```

```text
Source counts were cross-checked by parsing:
- packages/core/src/compiler/R3FCompiler.ts
- packages/engine/src/materials/MaterialPresetAudit.ts
- packages/engine/src/materials/UnifiedPBRSchema.ts
- packages/core/src/tools/MaterialEditor.ts
- packages/core/src/tools/materialPresetQuickPick.ts
- services/studio-api/src/app/api/materials/route.ts
- packages/studio/src/components/materials/MaterialPanel.tsx
```
