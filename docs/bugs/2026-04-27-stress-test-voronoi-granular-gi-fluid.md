# Compiler Bug: trait combo voronoi_fracture + granular_material + global_illumination + fluid_simulation triggers HSP001

**Filed by:** A-009 Example Freshness & Artist Stress-Test routine  
**Date:** 2026-04-27  
**Severity:** medium  
**File:** `examples/stress-tests/crystal-cavern-collapse-2026-04-27.holo`

## Summary

Composing `@voronoi_fracture`, `@granular_material`, `@global_illumination`, and `@fluid_simulation`
in a single `.holo` scene causes the HoloScript parser to emit `HSP001: Unknown directive` warnings
for all four traits — despite each having:
- A full `*Trait.ts` handler implementation in `packages/core/src/traits/`
- At minimum `voronoi_fracture` and `granular_material` having entries in `trait-registry.json`

The parser returns `success: true` (warnings do not fail parse), but IDEs, CI lint gates,
and downstream compilers that treat HSP001 as an error would reject valid scenes.

## Affected Traits

| Trait annotation | Trait*.ts file | In trait-registry.json | Parser result |
|---|---|---|---|
| `@global_illumination` | `GlobalIlluminationTrait.ts` | NO | HSP001 warning |
| `@voronoi_fracture` | `VoronoiFractureTrait.ts` | YES | HSP001 warning |
| `@fluid_simulation` | `FluidSimulationTrait.ts` | NO | HSP001 warning |
| `@granular_material` | `GranularMaterialTrait.ts` | YES | HSP001 warning |
| `@deformable_terrain` | `DeformableTerrainTrait.ts` | NO | **PASSES** (parser knows this one) |

Note: `@deformable_terrain` passes even though it is NOT in `trait-registry.json`. This confirms
the parser's trait whitelist is a **third, independent source** that is inconsistent with both the
registry and the handler files.

## Minimal Repro

```holo
composition "MinimalRepro" {
  object "test_rock" {
    geometry: "cube"
    @voronoi_fracture {
      voronoiSites: 100
      bounds: { min: [-1, -1, -1], max: [1, 1, 1] }
      destructionThreshold: 0.5
      maxHealth: 10.0
      enableCrackPropagation: false
      crackPropagationSpeed: 0.1
      enableLOD: false
      lodDistances: [10, 20, 30]
      enablePooling: false
      maxPooledFragments: 0
    }
  }
}
```

Run: `node -e "const {parse}=require('./packages/core/dist/parser.cjs'); const r=parse(require('fs').readFileSync('repro.holo','utf8')); console.log(r.warnings)"`

Expected: no warnings (trait has a handler and a registry entry)  
Actual: `HSP001: Unknown directive @voronoi_fracture`

## Root Cause Hypothesis

The parser (`packages/core/dist/parser.cjs`) maintains its own internal known-traits whitelist
that is not automatically synced with:
1. `packages/core/src/traits/trait-registry.json`
2. The presence of `*Trait.ts` handler files

When new traits are added via handler files (and optionally to the registry), the parser's
whitelist is **not updated**. The registry and handler files diverge from the parser's view
over time.

`@deformable_terrain` somehow ends up in the parser whitelist (possibly hand-added or from
an older generator run) but `@voronoi_fracture` and `@granular_material` — both of which ARE
in the registry — do not.

## Fix Direction

The parser's known-traits set should be derived from `trait-registry.json` at build time
(or at parser init time via a dynamic import), eliminating the third independent source.
Alternatively, a CI check should validate parser-known ⊇ registry ⊇ handlers, failing
on any gap.

## Full Parser Output

```json
[
  { "code":"HSP001", "message":"HSP001: Unknown directive @global_illumination", "line":55, "severity":"warning" },
  { "code":"HSP001", "message":"HSP001: Unknown directive @voronoi_fracture", "line":97, "severity":"warning" },
  { "code":"HSP001", "message":"HSP001: Unknown directive @fluid_simulation", "line":229, "severity":"warning" },
  { "code":"HSP001", "message":"HSP001: Unknown directive @granular_material", "line":304, "severity":"warning" },
  { "code":"HSP001", "message":"HSP001: Unknown directive @granular_material", "line":335, "severity":"warning" },
  { "code":"HSP001", "message":"HSP001: Unknown directive @granular_material", "line":365, "severity":"warning" }
]
```
