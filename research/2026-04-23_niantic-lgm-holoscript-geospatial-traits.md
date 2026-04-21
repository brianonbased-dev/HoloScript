# Niantic Large Geospatial Model (LGM) and HoloScript `@geospatial` traits

**Date:** 2026-04-23  
**Scope:** Map public **LGM** positioning to what HoloScript can represent as **geo-anchored** compositions.

## What Niantic describes publicly

- Niantic and **Niantic Spatial** position a **Large Geospatial Model** as a path toward **spatial intelligence**—machine-scale understanding of real-world places, connected to work on **VPS (Visual Positioning System)** and large collections of place-specific models (see Niantic / Niantic Spatial blog posts on the **Large Geospatial Model** and CVPR-oriented updates such as *MVSAnywhere* and *Morpheus* for 3D structure and world-aligned content).
- Data use is framed around **contributed** scans in supported products; it is not “automatic training from all gameplay” without user action—governance and consent matter for any consumer feature.

*This note summarizes public material; it is not an implementation spec for Niantic APIs.*

## Implication for HoloScript `@geospatial` (conceptual)

1. **Anchoring model:** A composition can store **WGS84** (or a chosen CRS) + **uncertainty** + **source** (VPS id, place id, hand-placed) as **data**, while traits control **how** it renders (arrival radius, scale, lock-to-GNSS, etc.).
2. **LGM is not a file format:** If HoloScript ever *consumes* LGM-style outputs, it will be as **inference** from a service (pose, place embedding, mesh prior)—still mapped into **declarative** scene state your compilers understand.
3. **Privacy:** “Geo-anchored” for users must stay aligned with **opt-in** location sharing; product copy should not imply server-side LGM training from HoloScript scenes unless that is **explicitly** true and consented.

## References (external)

- Niantic Labs announcement context: [Building a Large Geospatial Model](https://nianticlabs.com/news/largegeospatialmodel) (verify current URLs).  
- Niantic Spatial: product blog / CVPR notes on **LGM** roadmap.

## Related internal doc

- `research/2026-04-22_urdformer-urdf-holoscript-bridge.md` — another “world → structure” research line, **robotics**-centric.
