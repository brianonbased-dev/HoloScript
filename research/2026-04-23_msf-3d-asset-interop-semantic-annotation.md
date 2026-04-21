# Metaverse Standards Forum: 3D asset interoperability and a semantic layer for HoloScript

**Date:** 2026-04-23  
**Scope:** Whether HoloScript could be positioned as a **semantic annotation** layer on **glTF/USD** artifacts, in line with **MSF** 3D interoperability work.

## What the MSF group does (public)

- The **Metaverse Standards Forum** hosts a **3D Asset Interoperability** program that coordinates **USD** and **glTF** communities—materials, physics, animation/FBX migration, and emerging topics (e.g. splats) with **public presentations and year-in-review** posts. See the MSF site: *3D Asset Interoperability* domain group and blog updates on **glTF/USD** cooperation.

- The goal is **interoperable pipelines** and **reduced duplicate effort** across runtimes, not a single new monolithic 3D file format for everything.

## How HoloScript “annotation” differs from a format

- **glTF/USD** carry geometry, materials, skinning, scene graph.  
- **HoloScript** (traits, `.holo` composition) carries **game/sim semantics**—networking, interactions, rules, multi-target compilation—*above* the asset.

A credible standards story is:

- HoloScript references **URIs** to glTF/USD assets, plus **portable** metadata (entity ids, behavior traits, network roles) in a **document** that is **simpler to reason about** than ad hoc JSON in each engine.

## “Proposed as a semantic layer” — realistic next steps (non-binding)

1. **Publish** a short **HoloScript ↔ asset** mapping guide (one trait, one glTF node, one USD prim path pattern).  
2. **Participate** in MSF / Khronos / ASWF discussions as a **stakeholder** (community membership rules apply)—contribute *requirements*, not a premature standard claim.  
3. **Avoid** over-marketing: “we are a standard” is a **process** and **adoption** outcome, not a blog post.

## References (external)

- MSF: [3D Asset Interoperability](https://metaverse-standards.org/) — domain group and blog.  
- glTF: Khronos. OpenUSD: Academy Software Foundation / OpenUSD ecosystem.

## Related internal doc

- `research/2026-04-22_scenethesis-scenecraft-holoscript-comparison.md` — generative scene *content* vs declarative *product* semantics.
