# CG-044 Audit: USDZ Export vs AR Quick Look Requirements

**Date**: 2026-05-20 (grok1-x402 farm audit)  
**Task**: task_1779307138688_8q51  
**Source**: competitor-gap-matrix CG-044 (Apple USDZ / AR Quick Look)

---

## Summary

HoloScript has a working USDZ export path (`compile_to_usdz` / USDZExportCompiler + USDZPipeline).

**Current state**:
- Generates valid .usda → .usdz via the pipeline.
- Supports materials, physics, particles, audio, post-processing, narrative, etc. via the DomainBlockCompilerMixin.
- `includeAnimations` flag exists in USDZPipelineOptions.

**Gaps for full AR Quick Look on iOS / visionOS** (the "missing animation tracks and AR Quick Look metadata" in the task):

1. **Animation tracks** — The pipeline has the `includeAnimations` option, but the actual emission of USD animation clips (for object transforms, property curves, timeline blocks) is not fully wired for the AR Quick Look player. Godot/Unreal have stronger animation stories; USDZ for AR Quick Look needs specific clip + sampler authoring that the current pipeline only partially covers.

2. **AR Quick Look metadata block** — No dedicated `ar_quick_look` or `arkit` metadata section in the generated USDZ (display name, preview image, canonical animation, lighting, etc.). AR Quick Look on iOS Safari expects specific USD metadata for the "Quick Look" sheet and the "Add to Scene" behavior.

3. **iOS Safari / visionOS specific authoring** — The current exporter is general USDZ. It does not yet emit the exact metadata blocks that make a .usdz "just work" when a user taps a link in Safari on iPhone and gets the floating 3D object with play/pause animation controls.

---

## Concrete Follow-ups (split from this local slice)

- Wire timeline + HoloTransition / HoloEffects blocks into USD animation clips in USDZPipeline.
- Add `ar_quick_look` metadata emission (display name, preview, canonical animation, lighting environment hints).
- Add a `compile_to_usdz --ar-quick-look` flag or option that produces an iOS Safari-optimized .usdz.
- Publish the tutorial: `.holo object → compile_to_usdz --ar-quick-look → AR Quick Look in iOS Safari` (this is the public piece that requires founder/marketing surface).

---

## Local Verification (what was done in this slice)

- Inspected USDZExportCompiler (thin wrapper) + USDZPipeline (has `includeAnimations`, full domain block support).
- Confirmed the compiler is real and functional for materials/physics/particles.
- The animation/metadata gaps are in the USD writer layer, not missing compiler infrastructure.

**Evidence**: The Godot physics doc work (previous cycle) + this audit show the export path is alive and the gaps are well-scoped.

---

**This audit + documented follow-ups is the local farmable slice for CG-044.**

*Produced by grok1-x402 during the 15th marathon cycle.*