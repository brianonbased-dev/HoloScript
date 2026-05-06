# Lotus Photorealism Pipeline

> Status: internal strategy note. This is a build target, not a shipped
> capability claim.

## Purpose

The current lotus proof surface shows the right symbolic story: a seed grows
into the Lotus program flower. It is not yet the final visual story. The next
step is not "better guessed geometry." The next step is a provenance-grounded
photorealism pipeline where the renderer reads material truth from signed
reference anchors.

The photos Joe uploaded are the key inputs. In CAEL terms, each reference photo
is a graph node with provenance, ownership, extraction outputs, and downstream
trait bindings. An agent querying "lotus" should retrieve those nodes and their
derived material parameters instead of hallucinating a generic flower from a
text token.

## Current Gap

Token-only generation fails in exactly the places a real lotus is alive:

| Token-only lotus | CAEL-grounded lotus |
| --- | --- |
| Starts from the word "lotus" | Starts from wallet-signed reference photos |
| Guesses geometry | Reads a botanical trait contract |
| Flat petal material | Uses extracted SSS and translucency |
| Uniform color | Uses photo-derived base, mid, and edge gradients |
| Repeated identical petals | Uses seeded organic variance |
| Plastic-looking surfaces | Uses biological tissue scattering |
| No water relationship | Binds to water and HoloMap spatial context |
| No audit trail | Carries source photo and extraction provenance |

The repository scan did not find the uploaded lotus reference photos in git.
Until they are ingested, this document treats them as external provenance
anchors that the pipeline must bind later.

## Pipeline

1. Reference ingest
   - Input: Joe's lotus photos.
   - Output: CAEL graph nodes for each image, including content hash, wallet
     signature, capture metadata, and source rights.
   - Missing bridge: image-specific ingest into the CAEL/Absorb graph. Absorb is
     already the codebase knowledge substrate, but photo material ingest should
     be a first-class media path, not a code-search shortcut.

2. Material extraction
   - Input: signed photo nodes.
   - Output: calibrated botanical material parameters: subsurface scattering,
     translucency, roughness, IOR, vein normal intensity, petal color gradient,
     stamen color, and water interaction hints.
   - Existing substrate: `packages/snn-webgpu` supplies WebGPU neural compute,
     but no photo-to-material extractor is currently implemented.

3. Trait encoding
   - Input: extraction result plus provenance references.
   - Output: a queryable organic trait such as `@botanical_lotus`.
   - Contract: agents write the trait name; the trait supplies grounded material
     and geometry parameters.

4. Procedural geometry
   - Input: trait parameters plus deterministic seed.
   - Output: Fibonacci-ring petals with organic variance, gravity sag, stamen
     filaments, and LOD budgets.
   - Rule: geometry may be procedural, but the parameters are not guessed.

5. HoloMap placement
   - Input: room scan, surface anchors, local lighting, and device bindings.
   - Output: the lotus placed in real space with shadows, occlusion, and water
     interaction against the scanned environment.

6. Dumb Glass proof
   - Input: compiled trait, scene graph, material extraction receipt, and room
     reconstruction manifest.
   - Output: pixels whose visible appearance can be traced back to the source
     photo anchors and every compilation/rendering step.

## Existing Substrate Located

The repo already has most of the lower layers needed for this pipeline:

| Layer | Files read in this pass |
| --- | --- |
| Current lotus proof surface | `services/holoscript-net/src/components/LotusProgram.tsx` |
| Advanced PBR config | `packages/core/src/traits/AdvancedPBRTrait.ts` |
| Subsurface scattering | `packages/core/src/traits/SubsurfaceScatteringTrait.ts` |
| Vein-style subsurface detail | `packages/core/src/traits/SubsurfaceVeinsTrait.ts` |
| Organic/translucent material presets | `packages/core/src/traits/visual/presets/material-properties.visual.ts` |
| Shader material graph presets | `packages/studio/src/features/shader-editor/MaterialLibrary.ts` |
| R3F material property mapping | `packages/r3f-renderer/src/utils/materialUtils.tsx` |
| HoloMap reconstruction binding | `packages/core/src/traits/HoloMapReconstructionTrait.ts` |
| HoloMap splat output binding | `packages/core/src/traits/HoloMapSplatOutputTrait.ts` |
| HoloMap scan render asset | `packages/studio/src/lib/holomap-scan-render.ts` |
| Wallet/manifest signing pattern | `packages/mcp-server/src/holomesh/export-package.ts` |
| SNN WebGPU compute substrate | `packages/snn-webgpu/README.md` and package references |

## Proposed Trait Contract

This is a schema sketch, not parser-backed syntax yet:

```holo
trait @botanical_lotus {
  reference_anchor: [
    "cael://lotus-purple-2026.jpg",
    "cael://lotus-pink-2026.jpg"
  ]
  reference_signature: "wallet:joe"

  subsurface_scattering: 0.72
  subsurface_radius: [0.9, 0.3, 0.8]
  petal_translucency_base: 0.65
  petal_translucency_edge: 0.35
  vein_normal_intensity: 0.03
  roughness: 0.62
  ior: 1.36

  organic_variance_seed: "fibonacci_noise"
  petal_rings: [
    { name: "outer", count: 12, gravity_sag: 0.34 },
    { name: "mid", count: 8, gravity_sag: 0.16 },
    { name: "inner", count: 5, gravity_sag: 0.03 }
  ]

  color_base: "#7c3aed"
  color_mid: "#c084fc"
  color_edge: "#f5f3ff"
  stamen_color: "#fbbf24"

  requires: [
    "@advanced_pbr",
    "@subsurface_scattering",
    "@subsurface_veins",
    "@water_surface"
  ]
}
```

The important part is not the exact field names. The important part is that the
trait carries both values and provenance. A renderer can ask where the SSS
number came from. An agent can decide whether to trust the source before using
it. Dumb Glass can trace the resulting pixels back to the signed source photos.

## Renderer Implications

The current `LotusProgram.tsx` uses procedural sphere geometry and
`MeshStandardMaterial`. That is a good proof surface for the seed-to-flower
story, but photorealism needs a stricter rendering path:

- Petals should use thin petal geometry, not scaled spheres.
- Petal shaders should use `MeshPhysicalMaterial` or a custom shader with SSS
  uniforms derived from `@botanical_lotus`.
- Color should be radial/lengthwise gradient, not one color per ring.
- Stamen filaments should be instanced geometry with LOD fallbacks.
- Water should be a coupled surface with reflection, contact shadows, and
  petal/leaf interaction.
- Quest 3 should receive mobile-safe approximations while preserving the same
  provenance contract.

## Benchmark Claim

The living-room demo should become one benchmark shared by several papers:

1. Joe scans the room with HoloMap.
2. Joe ingests lotus reference photos as signed CAEL anchors.
3. The material extractor writes a `@botanical_lotus` trait instance.
4. Brittney places the lotus on a scanned surface.
5. The Quest 3 renderer displays SSS, translucency, stamen filaments, water
   interaction, room lighting, and shadows locally.
6. Dumb Glass records the pixel provenance chain from photo anchors through
   trait extraction, scene composition, and final render.

The result is not "an agent made a pretty flower." The result is:

**A local small model rendered a photorealistic organic asset in a real scanned
space by querying a provenance-grounded graph instead of relying on cloud-scale
weights or flat context.**

## Do Not Claim Yet

These claims are not ready until the missing bridge lands:

- Do not claim the reference photos are already in the repo. This scan did not
  find them.
- Do not claim `snn-webgpu` currently extracts material parameters from photos.
  It is the neural/WebGPU compute substrate, not the finished extractor.
- Do not claim the current lotus render has real SSS. It currently uses
  `MeshStandardMaterial`.
- Do not claim Dumb Glass pixel provenance for organic assets until the
  reference-photo receipt, extraction receipt, trait instance, and render
  artifact are all linked.

## Build Sequence

1. Add media ingest for signed reference photos.
2. Define the material extraction output schema.
3. Implement a first offline extractor for color gradients and roughness.
4. Add SSS/translucency estimation as a separate, testable extractor stage.
5. Land `@botanical_lotus` as an organic trait library entry.
6. Add an R3F adapter that maps the trait to shader uniforms and petal geometry.
7. Bind the lotus to HoloMap surface anchors.
8. Capture a Dumb Glass render receipt for the living-room benchmark.
