# Scenethesis vs SceneCraft (name collision) vs HoloScript trait composition

**Date:** 2026-04-22  
**Scope:** Compare **Scenethesis**-style and **SceneCraft**-style “agentic” 3D scene generation to HoloScript’s **trait-based** scene description.

## Scenethesis (language + vision, agentic 3D scenes)

- **Scenethesis** (arXiv:2505.02836, “A Language and Vision Agentic Framework for 3D Scene Generation”) uses an **LLM for coarse layout**, **vision-guided refinement**, **optimization** for plausibility, and a **judge** for repairs—**training-free** in the paper’s framing for flexible scene diversity.
- **Relevance to HoloScript:** both address **turning language into a structured world**, but Scenethesis is **end-to-end generative** with learned/vision components; HoloScript emphasizes **authoring-time** constraints, **compiler targets**, and **repeatable** `.holo` / trait semantics.

*Venue in internal backlog items may have drifted; always cite the arXiv or official proceedings entry when tracking literature.*

## SceneCraft (two different papers, same name)

1. **SceneCraft (Blender code agent):** arXiv:2403.01248 / ICML 2024—LLM produces **Blender Python**; scene graph as blueprint, optional vision refinement.
2. **SceneCraft (layout-guided NeRF-style scenes):** arXiv:2410.09049 / NeurIPS 2024—**layout** + diffusion / NeRF pipeline for **indoor** detail.

**Relevance to HoloScript:** “Agent writes imperative code in a DCC” (1) and “Generative 3D from layout + images” (2) are both **far from** HoloScript’s **declarative** model; they are potential **ingestion** or **inspiration** sources, not drop-in equivalent architectures.

## HoloScript’s axis

- **Constraints first:** traits and composition rules (validation, conflict rules) are the product’s spine.
- **Determinism & export:** multiple compiler backends benefit from **structured** scene graphs, not from opaque giant latent scenes unless you add an explicit import step.

## Takeaway

- Use Scenethesis / SceneCraft as **references for UX** (“what users will ask the AI to do”) and **R&D** (generative prefills), not as a reason to replace trait semantics.
- If you integrate generative fill: emit **HoloScript surfaces** (traits, entities) and run the **same** validators the author would hit.

## References

- Scenethesis: https://arxiv.org/abs/2505.02836  
- SceneCraft (Blender agent): https://arxiv.org/abs/2403.01248  
- SceneCraft (layout-guided): https://arxiv.org/abs/2410.09049  
