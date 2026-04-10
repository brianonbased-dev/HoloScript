/**
 * Geo-Anchor Traits
 *
 * Traits for GPS-anchored holographic scenes: pinning .holo compositions
 * to real-world coordinates so they persist across sessions and can be
 * discovered by other users at the same location.
 *
 * Categories:
 *   - Anchor (GPS coordinate binding, altitude, compass heading)
 *   - Persistence (cloud anchors, world map save/load, session continuity)
 *   - Radius & discovery (geofence radius, proximity trigger, visibility)
 *   - Platform hints (ARCore Geospatial API, ARKit ARGeoAnchor)
 */
export const GEO_ANCHOR_TRAITS = [
  // --- Anchor ---
  'geo_anchor', // marks object/scene as GPS-anchored (lat/lng required)
  'geo_altitude', // explicit altitude override (meters above sea level)
  'geo_compass_heading', // orient hologram relative to true north (degrees)
  'geo_terrain_snap', // snap anchor altitude to terrain mesh

  // --- Persistence ---
  'geo_persist', // save anchor across sessions (ARWorldMap / Cloud Anchor)
  'geo_cloud_anchor', // use cloud anchor service (ARCore Cloud Anchors / ARKit)
  'geo_session_continuity', // restore anchored objects when user returns

  // --- Radius & Discovery ---
  'geo_radius', // visibility geofence radius in meters
  'geo_proximity_trigger', // fire event when user enters anchor radius
  'geo_discoverable', // advertise anchor to nearby users via mesh

  // --- Platform Hints ---
  'geo_arcore_geospatial', // opt-in to ARCore Geospatial API (VPS)
  'geo_arkit_geo_anchor', // opt-in to ARKit ARGeoAnchor (iOS 14+)
] as const;

export type GeoAnchorTraitName = (typeof GEO_ANCHOR_TRAITS)[number];
