/**
 * SpatialContextSummary - WGS84 Geospatial Anchors
 *
 * Stores agent spatial context with WGS84 coordinates for cross-reality anchoring.
 * Only universal anchor system that works across all platforms (2026).
 *
 * Target: <2KB compressed
 * @version 1.0.0
 */

/**
 * WGS84 coordinate (World Geodetic System 1984)
 */
export interface WGS84Coordinate {
  /** Latitude in decimal degrees (-90 to 90) */
  latitude: number;

  /** Longitude in decimal degrees (-180 to 180) */
  longitude: number;

  /** Altitude in meters above WGS84 ellipsoid */
  altitude: number;

  /** Optional: Horizontal accuracy in meters */
  horizontalAccuracy?: number;

  /** Optional: Vertical accuracy in meters */
  verticalAccuracy?: number;
}

/**
 * Spatial anchor with geospatial coordinates
 */
export interface SpatialAnchor {
  /** Unique anchor ID (UUID v4) */
  id: string;

  /** WGS84 geospatial coordinate */
  coordinate: WGS84Coordinate;

  /** Anchor label/description (max 100 chars) */
  label: string;

  /** Anchor creation timestamp */
  createdAt: number;

  /** Last verification timestamp */
  lastVerified: number;

  /** Optional: Agent DID that created this anchor */
  creatorDid?: string;

  /** Optional: Anchor type category */
  type?: 'waypoint' | 'poi' | 'workspace' | 'meeting' | 'reference';

  /** Optional: Confidence score (0-1) */
  confidence?: number;
}

/**
 * Agent pose in 3D space (relative to spatial anchor)
 */
export interface AgentPose {
  /** Position offset from anchor (meters, [x, y, z]) */
  position: [number, number, number];

  /** Orientation quaternion [x, y, z, w] */
  orientation: [number, number, number, number];

  /** Timestamp of pose update */
  timestamp: number;

  /** Optional: Linear velocity (m/s, [x, y, z]) */
  velocity?: [number, number, number];

  /** Optional: Angular velocity (rad/s, [x, y, z]) */
  angularVelocity?: [number, number, number];
}

/**
 * Environmental context
 */
export interface EnvironmentalContext {
  /** Environment type */
  type: 'indoor' | 'outdoor' | 'mixed' | 'virtual' | 'unknown';

  /** Lighting level (lux) if available */
  lightingLevel?: number;

  /** Ambient noise level (dB) if available */
  noiseLevel?: number;

  /** Temperature (Celsius) if available */
  temperature?: number;

  /** Weather condition if outdoor */
  weather?: 'clear' | 'cloudy' | 'rainy' | 'snowy' | 'foggy';
}

/**
 * SpatialContextSummary CRDT (LWW-Register for current state)
 *
 * Uses LWW-Register semantics for current spatial state:
 * - Current position/pose resolved by timestamp
 * - Anchor list uses G-Set (append-only)
 * - Last write wins for environmental context
 */
export interface SpatialContextSummary {
  /** CRDT type identifier */
  crdtType: 'lww+gset';

  /** Unique CRDT instance ID */
  crdtId: string;

  /** Agent DID */
  agentDid: string;

  /** Primary spatial anchor (current location) */
  primaryAnchor?: SpatialAnchor;

  /** Current agent pose (relative to primary anchor) */
  currentPose?: AgentPose;

  /** Recent/nearby spatial anchors (G-Set) */
  recentAnchors: SpatialAnchor[];

  /** Current environmental context */
  environment?: EnvironmentalContext;

  /** LWW metadata for pose updates */
  poseMetadata?: {
    timestamp: number;
    actorDid: string;
    operationId: string;
  };

  /** LWW metadata for primary anchor */
  anchorMetadata?: {
    timestamp: number;
    actorDid: string;
    operationId: string;
  };

  /** Last update timestamp */
  lastUpdated: number;
}

/**
 * SpatialContextSummary metadata
 */
export interface SpatialContextMetadata {
  /** Has valid geospatial anchor */
  hasGeospatialAnchor: boolean;

  /** Number of recent anchors */
  anchorCount: number;

  /** Current environment type */
  environmentType?: EnvironmentalContext['type'];

  /** Last pose update age (milliseconds) */
  poseAge?: number;

  /** Spatial tracking confidence (0-1) */
  trackingConfidence?: number;
}
