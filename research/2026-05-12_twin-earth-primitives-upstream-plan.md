# Twin Earth Primitives — Upstream Plan
> Canary: task_1778616474061_3yjb
> Date: 2026-05-12
> Status: SHIPPED (traits constants + fixture + test)

## Problem

The Twin Earth game layer (location-based AR/VR digital twin) was implemented as TS-only app glue inside HoloLand prototypes. It was not visible to HoloScript parsers, compilers, or the trait system. This meant:
- No compile-time validation of world definitions
- No cross-platform code generation ( Unity / Unreal / WebXR / native AR )
- No standardised privacy-governance hooks
- No reusable quest primitives across worlds

## Solution

Add a sovereign trait family `TWIN_EARTH_TRAITS` (39 traits, 6 categories) to `@holoscript/core` and wire it into the VR_TRAITS barrel index. Provide a first-playable `.holo` fixture that demonstrates composition with HoloLand runtime semantics.

## Primitive Design

### 1. EarthLayer (8 traits)
Strata of the digital twin. Each trait marks a mesh/object as belonging to a specific real-world layer, enabling runtime LOD, culling, and style override per stratum.

| Trait | Purpose |
|-------|---------|
| `earth_layer` | Root marker — object is part of Twin Earth model |
| `earth_terrain` | Terrain stratum (elevation, surface type) |
| `earth_building` | Building footprint + height |
| `earth_road` | Road / path / transport network |
| `earth_vegetation` | Canopy / ground cover |
| `earth_water` | Water body (river, lake, ocean) |
| `earth_poi` | Point-of-interest stratum |
| `earth_boundary` | Administrative / gameplay geofence |

### 2. GeoAnchor (4 traits)
Game-layer GPS binding, distinct from the mobile `geo_anchor` family (which is for holographic scene pinning). These traits carry gameplay semantics: radius triggers, persistence flags, and compass heading for orientation puzzles.

| Trait | Purpose |
|-------|---------|
| `game_geo_anchor` | GPS anchor for game entities (lat/lng/alt) |
| `game_geo_heading` | Compass orientation for game entities |
| `game_geo_radius` | Gameplay radius around anchor (meters) |
| `game_geo_persistent` | Anchor persists across sessions |

### 3. Place (7 traits)
Named venues, zones, and social locations. Replaces ad-hoc TS interfaces with declarative traits that compilers can target to native map SDKs (Mapbox, Google Maps, Apple Maps) or in-engine zone systems.

| Trait | Purpose |
|-------|---------|
| `game_place` | Named place in the game world |
| `place_zone` | Sub-zone within a place |
| `place_ingress` | Designated entry point |
| `place_egress` | Designated exit point |
| `place_social` | Social venue classification |
| `place_capacity` | Max concurrent users |
| `place_schedule` | Time-based availability |

### 4. PrivacyRule (7 traits)
Privacy governance attached to locations. Composes with the existing `consent_management` trait (compliance-governance) but adds location-specific granularity: collection scope, retention, anonymisation, and verifiable consent receipts.

| Trait | Purpose |
|-------|---------|
| `privacy_rule` | Governance rule attached to a location |
| `privacy_collection_scope` | Data categories collected |
| `privacy_retention_policy` | Retention duration / auto-delete |
| `privacy_consent_receipt` | Verifiable consent record |
| `privacy_anonymization` | Require anonymisation before storage |
| `privacy_opt_out` | Opt-out mechanism available |
| `privacy_audit_log` | Audit trail for data access |

### 5. LocationQuest (7 traits)
Real-world quest primitives. Designed to compile to both ARKit geo-anchor triggers and 2D map radius triggers via the degradation layer.

| Trait | Purpose |
|-------|---------|
| `location_quest` | Quest bound to a real-world location |
| `location_quest_checkin` | Explicit check-in trigger |
| `location_quest_radius` | Enter-radius trigger |
| `location_quest_proximity` | Distance-based condition |
| `location_quest_streak` | Repeat visitation condition |
| `location_quest_route` | Path-following condition |
| `location_quest_timegate` | Time-window condition |

### 6. Degradation (6 traits)
Graceful fallback when AR/XR or positioning is unavailable. Complements the existing `graceful_degradation` trait (universal-service) with Twin Earth-specific fallback modes.

| Trait | Purpose |
|-------|---------|
| `mobile_degradation` | Mobile-specific fallback |
| `browser_degradation` | Browser-specific fallback |
| `degradation_map_view` | 2D map representation |
| `degradation_static_render` | Pre-rendered static image |
| `degradation_text_description` | Text-only POI card |
| `degradation_audio_narration` | Audio narration fallback |

## Files Added / Modified

| File | Action | Lines |
|------|--------|-------|
| `packages/core/src/traits/constants/twin-earth.ts` | **New** | 39 traits + type export |
| `packages/core/src/traits/constants/__tests__/twin-earth.test.ts` | **New** | 9 test blocks |
| `packages/core/src/traits/constants/index.ts` | **Modified** | Import + spread + re-export |
| `examples/hololand/10-twin-earth-playable.holo` | **New** | First playable fixture |
| `research/2026-05-12_twin-earth-primitives-upstream-plan.md` | **New** | This document |

## HoloLand Connection

The fixture `examples/hololand/10-twin-earth-playable.holo` is a first playable proof that connects the primitives to HoloLand runtime semantics:

- `museum_entrance` composes `@game_place + @place_ingress + @location_quest + @location_quest_checkin`
- `privacy_governance` composes `@privacy_rule + @privacy_collection_scope + @privacy_consent_receipt`
- `degradation_anchor_mobile` composes `@mobile_degradation + @degradation_map_view`
- `degradation_anchor_browser` composes `@browser_degradation + @degradation_static_render + @degradation_text_description`

Runtime integration path (future work):
1. HoloLand `CausalWorldModel` consumes `earth_layer` tags for streaming LOD decisions.
2. `BlockoutCRDTSession` uses `place_zone` + `place_capacity` for collaborative zoning.
3. `PhysicsBoundsRegistry` respects `privacy_rule` boundaries for player-position data.
4. `EncounterTrait` (runtime) binds to `location_quest_radius` triggers.

## Mobile / Browser Degradation Strategy

| Capability | Full | Mobile Fallback | Browser Fallback |
|------------|------|-----------------|------------------|
| AR placement | `@geo_anchor` family | `@degradation_map_view` | `@degradation_static_render` |
| Location quest | `@location_quest_radius` | `@degradation_text_description` | `@degradation_text_description` |
| Privacy consent | `@privacy_consent_receipt` | Same (server-side) | Same (server-side) |
| 3D world | `@earth_layer` strata | `@degradation_map_view` | `@degradation_static_render` |
| Social place | `@place_social` | `@degradation_audio_narration` | `@degradation_text_description` |

## Verification

Run the trait tests:
```bash
pnpm test packages/core/src/traits/constants/__tests__/twin-earth.test.ts
```

Verify no duplicates and all traits present in `VR_TRAITS`:
```bash
node -e "const {VR_TRAITS, TWIN_EARTH_TRAITS} = require('./packages/core/src/traits/constants'); console.log('All twin-earth traits in VR_TRAITS:', TWIN_EARTH_TRAITS.every(t => VR_TRAITS.includes(t)));"
```

## Future Work

- Runtime trait handlers in `packages/runtime/src/traits/` for `game_geo_anchor`, `privacy_rule`, and `location_quest` (bridging to core event protocol).
- Compiler targets: `AndroidXRTraitDispatch` and `IOSARGenerators` should recognise `game_geo_anchor` as a native geo-anchor trigger.
- Integration with `packages/spatial-index/src/GeospatialAnchorStorage.ts` for server-side radius query acceleration.
- Privacy receipt attestation on-chain (EIP-712 typed data) for verifiable consent.
