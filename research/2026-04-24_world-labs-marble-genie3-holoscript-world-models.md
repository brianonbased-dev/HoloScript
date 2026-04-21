# World Labs **Marble** and DeepMind **Genie 3** as downstream consumers of HoloScript scenes (research)

**Date:** 2026-04-24  
**Scope:** Board question: could HoloScript-authored scenes be **training or conditioning data** for **world models** (Marble, Genie 3)?

## Public positioning (not licensing advice)

- **Marble (World Labs)** is described as a **multimodal world model** product for generating and exporting **3D spaces** (e.g. splats, meshes) from text, images, video, 360° inputs, and coarse layouts. See the **World Labs** site, **Marble** announcement material, and **docs** for import/export and usage tiers.
- **Genie 3 (Google DeepMind)** is a **generative, interactive 3D world** model; DeepMind’s blog describes **real-time** interaction, consistency over time, and a research / prototype access path. See DeepMind’s **Genie 3** model page and announcement post.

*Capabilities and access change quickly—verify current terms, API availability, and data policies before any integration or data sharing.*

## Can HoloScript “feed” these systems?

- **In principle, yes, as *structured priors*:** deterministic `.holo` / scene descriptions are **useful metadata** (layout, object roles, materials references) *if* a partner pipeline accepts that format or you export to **glTF/USD** + sidecar JSON.
- **In practice, training pipelines want pixels + state:** world-model teams typically need **rendered** views, **actions**, and **synchronized labels**. HoloScript is strongest as:
  1. **A generator of diverse, valid scenes** (compiler-checked).
  2. **A bridge** to multiple renderers for **synthetic data** (once you add batch rendering and ground-truth export).

## What not to claim

- That HoloScript is “the training format for Marble/Genie” without a **formal** partnership and **dataset** agreement.
- That **on-device** world models will ingest raw `.holo` without a **conversion and validation** step.

## Product-facing takeaway

- Roadmap: **(1)** document a **HoloScript → glTF/USD** export for ML teams, **(2)** define a **minimal** `dataset_manifest` (seed, version, camera paths), **(3)** keep **PII/location** out of public datasets by default.

## References (external)

- World Labs / Marble: https://www.worldlabs.ai/ and in-product documentation.  
- DeepMind: Genie 3 model / blog (verify current URL under `deepmind.google`).

## Related

- `research/2026-04-22_scenethesis-scenecraft-holoscript-comparison.md` — generative scene *pipelines* vs HoloScript’s declarative model.
