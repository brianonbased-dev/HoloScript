# OpenUSD, robotics asset structure, and HoloScript as a frontend

**Date:** 2026-04-23  
**Scope:** Relate **NVIDIA / OpenUSD** guidance on **URDF → USD** and modular robotics assets to HoloScript’s role as a **higher-level** language.

## What the ecosystem already standardizes

- **URDF / MJCF / SDF** are common in robotics; simulators (e.g. **Isaac Sim** on **Omniverse**) import URDF and map links, joints, collision, and visuals into **OpenUSD** prim hierarchies. NVIDIA’s learning docs describe this **anatomy of robot asset structure** and **URDF import** path (see *NVIDIA docs: “Anatomy of a Robot Asset Structure”* and *“Importing URDF Assets”* in Isaac Sim getting started).
- **OpenUSD** is a **scene composition and interchange** system (layers, references, variants). It is the right *camp* for DCC, simulation, and high-end pipelines, not a small JSON blob by itself.

## Where HoloScript fits

- HoloScript is best positioned as a **authoring and behavior** layer that **compiles to**:
  - **Web / real-time** targets (glTF, R3F, engine exporters already in-repo), and/or
  - **Interchange** steps that emit or sync **USD** where a studio pipeline requires it.
- A practical bridge is **not** “HoloScript *is* USD,” but “HoloScript **exports** a structured scene + rig + physics hints that a **toolchain** (Python USD APIs, Omniverse Connectors) turns into prims and layers.”

## Recommendation

- Treat **USD** as an **export / interchange** for robotics and high-end 3D when customers pay for that pipeline; keep **glTF** as the default for lightweight web and Studio preview unless USD is requested.
- Reuse the same **entity / joint / collider** semantics you already use for `ModelImporter` / humanoids so the USD exporter does not become a second language.

## References (external)

- NVIDIA: *Using OpenUSD for modular and scalable robotic simulation* (NVIDIA technical blog; Physical AI / Omniverse material).  
- Isaac Sim: URDF import → USD.  
- OpenUSD: https://openusd.org/

## Related

- `research/2026-04-22_urdformer-urdf-holoscript-bridge.md` — image → URDF → your IR.
