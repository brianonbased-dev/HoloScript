/**
 * @holoscript/spatial-index - Type Definitions
 *
 * Core types for R-Tree spatial indexing with geospatial anchor support.
 *
 * @version 1.0.0
 */

/**
 * Bounding box in 2D space (latitude, longitude)
 */
export interface BBox {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

/**
 * Point in 2D geospatial space
 */
export interface Point {
  lat: number;
  lon: number;
}

/**
 * Geospatial anchor with metadata
 */
export interface GeospatialAnchor {
  id: string;
  lat: number;
  lon: number;
  alt?: number;
  metadata?: Record<string, unknown>;
}

/**
 * R-Tree node (internal or leaf)
 */
export interface RTreeNode {
  bbox: BBox;
  children?: RTreeNode[];
  items?: GeospatialAnchor[];
  height: number;
  leaf: boolean;
}

/**
 * Query result with distance
 */
export interface QueryResult {
  anchor: GeospatialAnchor;
  distance: number;
}

/**
 * R-Tree configuration options
 */
export interface RTreeOptions {
  /**
   * Maximum number of entries per node (default: 9)
   * Higher values = flatter tree, faster insertion, slower queries
   */
  maxEntries?: number;

  /**
   * Minimum number of entries per node (default: Math.ceil(maxEntries * 0.4))
   */
  minEntries?: number;

  /**
   * Enable bulk loading optimization (default: true)
   */
  bulkLoadingEnabled?: boolean;
}

/**
 * Statistics about the R-Tree structure
 */
export interface RTreeStats {
  totalNodes: number;
  totalAnchors: number;
  height: number;
  avgFillRatio: number;
  totalOverlap: number;
}
