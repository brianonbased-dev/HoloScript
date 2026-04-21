# NodeToy node families vs HoloScript `@shader` parameters (mapping survey)

**Date:** 2026-04-24  
**Scope:** The board asked for a **survey of NodeToy’s 150+ nodes** against HoloScript’s **shader** surface for a **React Flow**-style material editor. This memo gives a **category map**; it does not paste every node name (NodeToy may change the catalog).

## What NodeToy exposes (public)

- NodeToy is a **web shader graph** for **Three.js / R3F** with a large **node library** (on the order of **150+** nodes) grouped into **documented families**, including: *Inputs & Constants, UV, Time, Textures, Math / Vector / Matrix / Trigonometry, Normals, Lights, Noises, Patterns, Shapes, Surface, Image Effects, Vertex*, and *Custom Expression* (raw GLSL-style snippets). See NodeToy’s **Guides** (e.g. *Shaders overview*) and the **three-nodetoy** project for runtime integration.

## Suggested map → HoloScript `@shader` (conceptual)

| NodeToy family | Typical role | HoloScript hook |
|----------------|---------------|-----------------|
| Inputs / UV / Time | Frame-varying screen/object coords | **Uniforms** and **varying** slots on `@shader` |
| Textures + samplers | PBR albedo, normal, ORM, masks | **Texture** trait refs + `Material` channels |
| Math / vector / matrix | Remap, combine, bias/gain | **Node library** in Studio maps to a **small** op set first (avoid 1:1 explosion) |
| Normals / lights / surface | PBR N·L, fresnel, roughness | **StandardMaterial**-like path + optional custom chunk |
| Noises / patterns | Procedural detail | Expose as **ops** *or* pre-baked **noise texture** + params |
| Image effects (post) | Bloom, color grade | **Post-process** stack, not the same as surface `@shader` |
| Custom expression | Raw code | **Escape hatch** to inline GLSL/WGSL (reviewed) |

## Editor strategy (HoloScript Studio)

1. **Phase 1 — parity subset:** 30–50 nodes that cover **90%** of PBR + UV + triplanar + common math (matches most teaching materials).  
2. **Phase 2 — parity-by-demand:** add NodeToy **family** toggles in the palette per project template.  
3. **Interchange:** if users import **NodeToy** JSON, run a **lossy** lift to HoloScript nodes + flag unsupported ops.

## Risk

- **1:1 cloning** of 150+ nodes without **testing** is high maintenance. Prefer a **constrained** core and **import** of external graphs for advanced users.

## References (external)

- NodeToy: https://nodetoy.co/ — product and learning docs.  
- GitHub: `NodeToy/three-nodetoy` — runtime.

## Related

- `packages/studio` shader / material panels as they evolve.
