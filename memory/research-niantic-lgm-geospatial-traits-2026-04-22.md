# Niantic Large Geospatial Model (LGM) ↔ HoloScript `@geospatial` traits

**Board:** `task_1776394509341_y5n5`  
**Source audit:** `2026-03-09_holoscript-impossible-doors-breakthrough-analysis.md`

## Vendor narrative (public, third-party URLs)

Niantic Spatial describes a **Large Geospatial Model** agenda: learn **structure and semantics** of real places from **georeferenced, real-world** sensing so agents/devices can answer *where / orientation / what* with **grounded** detail—not only “plausible” scenes. They position **LGMs** alongside LLMs and world foundation models for embodied use (navigation, field ops, etc.). See their **world models / LGM** posts, e.g. [Niantic Spatial — world models (2026)](https://www.nianticspatial.com/en/blog/world-models-2026) and [CVPR 2025 — building toward an LGM](https://www.nianticspatial.com/en/blog/cvpr2025).

*Caveat:* Product names, APIs, and licensing change — **re-check** Niantic Spatial’s site before customer-facing claims.

## HoloScript: geo-anchoring today (repo truth)

| Capability | Code / package | Role |
|------------|------------------|------|
| Lat/lon/alt outdoor anchors | `packages/core/src/traits/GeospatialAnchorTrait.ts` | GPS + ARCore/ARKit-style geospatial resolution |
| Rooftop / elevation variants | `packages/core/src/traits/RooftopAnchorTrait.ts` | Altitude modes aligned to urban scenes |
| GIS-style plugin surface | `packages/plugins/geolocation-gis-plugin/` | Map / route / POI / geocode / geofence handlers |
| Honest product gap | `README.md` — *Honest gaps* → Geolocation / GIS | “AR anchoring exists, mapping layer doesn’t” (domain depth) |

**Answer to “Could compositions be geo-anchored to real-world locations?”** — **Yes at the trait level** (anchors + plugin pack). **Full** LGM-style semantic world models are **not** vendored inside HoloScript; integration would be **connector / data pipeline** work (tiles, scans, licensors’ APIs).

## Product positioning (draft)

- HoloScript strength: **typed traits + exporters** so the *same* composition can target **device geospatial APIs** and **server GIS**—keep **provenance** (which lat/lon, which resolver, which license) explicit.
- Niantic-style LGM strength: **dense real-world priors** at scale—pair with HoloScript by **ingesting** meshes/bounds as `@digital_twin` / map layers, not by pretending the LGM ships in-repo.

## Next steps (optional child tasks)

1. Spike: **one** `.holo` that `@geospatial_anchor` + publishes CRS metadata for GIS export.
2. Partner / legal: data **license** for any third-party map or LGM-derived mesh.
