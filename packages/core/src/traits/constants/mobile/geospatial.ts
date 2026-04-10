/**
 * ARCore Geospatial API Traits
 *
 * Traits for centimeter-accurate outdoor geo-anchoring using Google's
 * Visual Positioning System (VPS). Integrates ARCore's Geospatial API
 * for street-level positioning via Street View data.
 *
 * Categories:
 *   - VPS Core (session mode, Earth tracking, geospatial state)
 *   - Anchoring (geo-anchor, terrain anchor, rooftop anchor)
 *   - Streetscape (geometry mesh access, building outlines)
 *   - Heading / Orientation (compass heading alignment)
 *
 * @see https://developers.google.com/ar/develop/geospatial
 */
export const GEOSPATIAL_ARCORE_TRAITS = [
  // --- VPS Core ---
  'geospatial_vps', // enables ARCore GeospatialMode.ENABLED on session
  'geospatial_heading', // heading/orientation alignment from VPS compass data

  // --- Anchoring ---
  'geospatial_anchor', // lat/lng/alt/heading anchor via Earth.createAnchor
  'geospatial_terrain_anchor', // resolveAnchorOnTerrain — snaps to terrain surface
  'geospatial_rooftop_anchor', // resolveAnchorOnRooftop — snaps to building rooftops

  // --- Streetscape ---
  'geospatial_streetscape', // Streetscape Geometry mesh access for buildings/terrain
] as const;

export type GeospatialARCoreTraitName = (typeof GEOSPATIAL_ARCORE_TRAITS)[number];

/**
 * Geospatial trait configuration defaults.
 * Used by the AndroidCompiler to emit sensible defaults for each trait.
 */
export interface GeospatialVPSConfig {
  /** Horizontal accuracy threshold in meters to consider tracking "good" */
  accuracyThreshold: number;
  /** Heading accuracy threshold in degrees */
  headingAccuracyThreshold: number;
  /** Maximum time in ms to wait for VPS localization */
  localizationTimeout: number;
}

export interface GeospatialAnchorConfig {
  /** Latitude in decimal degrees */
  latitude: number;
  /** Longitude in decimal degrees */
  longitude: number;
  /** Altitude in meters above WGS84 ellipsoid */
  altitude: number;
  /** Heading in degrees clockwise from north (0-360) */
  heading: number;
  /** Anchor resolve timeout in ms */
  resolveTimeout: number;
}

export interface GeospatialTerrainAnchorConfig {
  /** Latitude in decimal degrees */
  latitude: number;
  /** Longitude in decimal degrees */
  longitude: number;
  /** Altitude offset above terrain in meters */
  altitudeOffset: number;
  /** Heading in degrees clockwise from north */
  heading: number;
  /** Resolve timeout in ms */
  resolveTimeout: number;
}

export interface GeospatialRooftopAnchorConfig {
  /** Latitude in decimal degrees */
  latitude: number;
  /** Longitude in decimal degrees */
  longitude: number;
  /** Altitude offset above rooftop in meters */
  altitudeOffset: number;
  /** Heading in degrees clockwise from north */
  heading: number;
  /** Resolve timeout in ms */
  resolveTimeout: number;
}

export interface GeospatialStreetscapeConfig {
  /** Whether to enable terrain geometry mesh */
  enableTerrain: boolean;
  /** Whether to enable building geometry mesh */
  enableBuildings: boolean;
}

export const GEOSPATIAL_DEFAULTS: {
  vps: GeospatialVPSConfig;
  anchor: GeospatialAnchorConfig;
  terrainAnchor: GeospatialTerrainAnchorConfig;
  rooftopAnchor: GeospatialRooftopAnchorConfig;
  streetscape: GeospatialStreetscapeConfig;
} = {
  vps: {
    accuracyThreshold: 25,
    headingAccuracyThreshold: 25,
    localizationTimeout: 30_000,
  },
  anchor: {
    latitude: 0,
    longitude: 0,
    altitude: 0,
    heading: 0,
    resolveTimeout: 10_000,
  },
  terrainAnchor: {
    latitude: 0,
    longitude: 0,
    altitudeOffset: 0,
    heading: 0,
    resolveTimeout: 10_000,
  },
  rooftopAnchor: {
    latitude: 0,
    longitude: 0,
    altitudeOffset: 0,
    heading: 0,
    resolveTimeout: 10_000,
  },
  streetscape: {
    enableTerrain: true,
    enableBuildings: true,
  },
};
