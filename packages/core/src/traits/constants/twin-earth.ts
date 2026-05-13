/**
 * Twin Earth Game Layer Traits
 *
 * Primitives for location-based AR/VR games that mirror the real world as a
 * playable digital twin ("Twin Earth"). These traits bridge geospatial reality
 * with HoloScript game mechanics, enabling GPS-bound quests, place-based
 * social interaction, privacy-governed location data, and graceful degradation
 * when AR or positioning is unavailable.
 *
 * Categories:
 *   - EarthLayer   — strata of the digital twin (terrain, buildings, roads, etc.)
 *   - GeoAnchor    — game-layer GPS binding (distinct from mobile geo_anchor)
 *   - Place        — named venues, zones, and social locations
 *   - PrivacyRule  — consent, collection scope, retention, and opt-out
 *   - LocationQuest — real-world quest primitives (check-in, radius, route)
 *   - Degradation  — mobile/browser fallback when sensors or XR are unavailable
 */

export const TWIN_EARTH_TRAITS = [
  // --- EarthLayer — strata of the digital twin ---
  'earth_layer',           // marks object as part of the Twin Earth model
  'earth_terrain',         // terrain stratum (elevation, surface type)
  'earth_building',        // building stratum (footprint, height, material)
  'earth_road',            // road / path / transport stratum
  'earth_vegetation',      // vegetation / canopy stratum
  'earth_water',           // water body stratum (river, lake, ocean)
  'earth_poi',             // point-of-interest stratum
  'earth_boundary',        // administrative / geofence boundary

  // --- GeoAnchor — game-layer GPS binding ---
  'game_geo_anchor',       // GPS anchor for game entities (lat/lng/alt)
  'game_geo_heading',      // compass orientation for game entities
  'game_geo_radius',       // gameplay radius around anchor (meters)
  'game_geo_persistent',   // anchor persists across sessions

  // --- Place — named venues and zones ---
  'game_place',            // named place in the game world
  'place_zone',            // sub-zone within a place
  'place_ingress',         // designated entry point
  'place_egress',          // designated exit point
  'place_social',          // social venue classification
  'place_capacity',        // max concurrent users for this place
  'place_schedule',        // time-based availability / events

  // --- PrivacyRule — location-data governance ---
  'privacy_rule',          // privacy governance rule attached to a location
  'privacy_collection_scope', // what data categories are collected
  'privacy_retention_policy', // retention duration / auto-delete
  'privacy_consent_receipt',  // verifiable consent record (receipt ID)
  'privacy_anonymization',    // require anonymization before storage
  'privacy_opt_out',          // opt-out mechanism available
  'privacy_audit_log',        // audit trail for data access

  // --- LocationQuest — real-world quest primitives ---
  'location_quest',        // quest bound to a real-world location
  'location_quest_checkin', // check-in trigger (explicit user action)
  'location_quest_radius',  // enter-radius trigger
  'location_quest_proximity', // proximity condition (distance-based)
  'location_quest_streak',    // streak / repeat visitation condition
  'location_quest_route',     // route-based quest (path following)
  'location_quest_timegate',  // time-window condition

  // --- Degradation — graceful fallback ---
  'mobile_degradation',     // mobile-specific fallback behavior
  'browser_degradation',    // browser-specific fallback behavior
  'degradation_map_view',   // fallback to 2D map representation
  'degradation_static_render', // fallback to pre-rendered static image
  'degradation_text_description', // fallback to text-only description
  'degradation_audio_narration',    // fallback to audio narration
] as const;

export type TwinEarthTraitName = (typeof TWIN_EARTH_TRAITS)[number];
