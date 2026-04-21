# Mixamo: programmatic upload / API (2026-04-21)

**Question:** Can HoloScript or another tool drive Mixamo (Adobe) the way the web UI does—upload a character, pick a rig, download FBX—without a human in the browser?

## Short answer

There is **no published, supported public API** from Adobe for Mixamo upload, autorig, or download as a first-class integration. Mixamo is positioned as a **web application**; community threads (Adobe forums) have long reported that **batch or API-style access** is not available in the way third-party products expect.

This note is **not** legal advice, but: automating the website (headless browser, reverse-engineered endpoints, or credential sharing) is likely to conflict with **terms of use**, break without notice, and create ToS and reliability risk. **Do not** ship a product feature on that path without explicit written clearance from Adobe and security review.

## What teams do instead

1. **Human-in-the-loop:** artists upload on mixamo.com, download FBX, then use the **Assimp / glTF** path documented in `research/2026-04-21_assimp-fbx-obj-gltf-pipeline.md` for the engine.
2. **DCC rigging:** Blender, Maya, or commercial auto-rig tools with **scriptable** or **license-cleared** automation.
3. **Commercial / studio pipelines:** in-house or licensed rigging and retargeting (often USD/VRM/FBX in the middle).
4. **If Adobe ecosystem is required for other media:** use **documented** Adobe APIs (e.g. other Creative Cloud or Stock APIs where applicable)—**Mixamo specifically** is not a drop-in substitute.

## Implication for HoloScript

- A **“Send to Mixamo”** button that promises **unattended** rigging is **not** backed by a stable vendor API as of this writing.
- Roadmap options: **(a)** improve import after manual Mixamo export, **(b)** document the manual step in onboarding, **(c)** evaluate partner rigging services with explicit ToS and SLAs.

## References (external)

- Adobe community discussions on “Mixamo” + “API” (no official public upload API for rigging as described).
- [mixamo.com](https://www.mixamo.com) — web-only product surface.

## Related internal docs

- `research/2026-04-21_assimp-fbx-obj-gltf-pipeline.md` — after Mixamo, converting FBX for runtime.
