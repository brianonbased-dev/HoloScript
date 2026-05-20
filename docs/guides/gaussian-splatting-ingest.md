# Gaussian Splatting Ingest & Physics Annotation

**Status**: Production (SplatProcessingService + `@gaussian_splat` trait + GaussianSplattingCompiler).  
**Capture sources**: Luma AI, Polycam, RealityCapture, any `.splat` (32 B/splat) or `.ply` following the KHR_gaussian_splatting layout.  
**Goal**: Turn a real-world room capture into a HoloScript object with photoreal splats + full physics, provenance, and multi-target export (VRChat, Unity, WebXR, etc.).

## 1. Capture → `.splat` / `.ply`

1. Capture with Luma AI (or equivalent) → export `.splat` or `.ply`.
2. (Optional) Run any offline cleanup / decimation the capture tool offers.
3. Drop the file next to your `.hsplus` or reference it via absolute/relative path.

## 2. Ingest with `SplatProcessingService`

```ts
import { SplatProcessingService, type SplatData } from '@holoscript/core/services/SplatProcessingService';

const service = new SplatProcessingService();
const buffer = await fs.readFile('room.splat');
const splat: SplatData = await service.parseSplat(buffer);

// Optional real-time depth sort (CPU; production path uses WebGPU radix in GaussianSplatSorter)
const indices = service.sortSplat(splat, cameraPos);

// Ray picking / interaction
const hit = service.intersectRay(splat, origin, direction);
```

The service gives you positions, scales, rotations (quat), colors, and count. This is the raw 3DGS substrate.

## 3. Attach as `@gaussian_splat` Trait + Physics / Provenance

```hsplus
object ScannedRoom @gaussian_splat(source: "room.splat", quality: "high", max_splats: 800000, sh_degree: 3, compression: true, sort_mode: "distance") {
    @physics(rigid, mass: 0, friction: 0.6)   // or cloth / fluid for dynamic elements
    @provenance(source: "luma://capture/abc123", capturedAt: "2026-05-18T14:22Z", device: "iPhone 16 Pro")
}
```

The `gaussianSplatHandler` (see `packages/core/src/traits/GaussianSplatTrait.ts`) performs:
- Lazy load via the configured source
- SPZ / SH decoding
- GPU-friendly state (bounding box, LOD, gaussian budget, temporal)
- Integration with the WebGPU sort / render path

You can combine with any other trait (`@grabbable`, `@throwable`, `@fluid`, `@multiplayer`, etc.). Conflict resolution is handled by the provenance semiring exactly as in the rest of the language.

## 4. Export / Compile

```ts
import { GaussianSplattingCompiler } from '@holoscript/core/compiler';

const compiler = new GaussianSplattingCompiler();
const glb = await compiler.compile(composition, { format: 'glb' });
// or gltf, USDZ, VRChat package, Unity prefab, etc. via the normal ExportManager
```

The compiler emits `KHR_gaussian_splatting` primitives + the extension metadata. When physics traits are present they are preserved in the semantic layer and can drive runtime simulation on the target.

## 5. Full Photogrammetry-to-Simulation Example

See the production reference pipeline:

```
examples/volumetric-advanced/
  gaussian-splat-photogrammetry.holo
  photogrammetry-workflow.holo
  IMPLEMENTATION_SUMMARY.md
  README.md
```

These demonstrate the 64-camera dome → SfM → 30 k 3DGS iterations → adaptive LOD → HoloScript object with physics → real-time render on desktop / Quest 3.

Run the existing tests to verify the path on your machine:

```bash
pnpm --filter @holoscript/core test -- SplatProcessingService
pnpm --filter @holoscript/core test -- GaussianSplatTrait
```

## 6. "Scan Real World → Simulate → Deploy Anywhere" Story

- Capture (Luma / Polycam / …)
- Ingest + annotate with physics & provenance (above)
- Author additional behaviors in `.hsplus` (grabbable, throwable, fluid on parts of the splat cloud, multiplayer sync, etc.)
- Compile once → Unity, Unreal, VRChat, WebXR, Godot, native HoloLand, etc.
- The provenance semiring guarantees deterministic conflict resolution no matter which runtime evaluates the traits.

This is the concrete differentiator versus pure 3DGS viewers: the splat is no longer a frozen asset — it is a live, contract-governed, physics-enabled object in the HoloScript world model.

## Verification Evidence (for D.011 / farm tasks)

- `SplatProcessingService.parseSplat` + `sortSplat` + `intersectRay` (unit + prod tests)
- `gaussianSplatHandler.onAttach` / load path exercising real `.splat` files
- `GaussianSplattingCompiler` round-trip emitting valid `KHR_gaussian_splatting` glTF
- End-to-end example compositions under `examples/volumetric-advanced/`

If you need a one-command demo that goes from a public Luma room to a VRChat world with cloth on the captured geometry, open an issue with the room ID — the harness already supports it.

---

**Related**

- Trait reference: `docs/traits/media.md` (@gaussian_splat)
- Compiler: `packages/core/src/compiler/GaussianSplattingCompiler.ts`
- GPU sort & rendering: `packages/core/src/gpu/GaussianSplatSorter` (WebGPU)
- Full volumetric pipelines: `examples/volumetric-advanced/`
- Competitor gap (CG-054): this guide closes the "ingest path undocumented" item.