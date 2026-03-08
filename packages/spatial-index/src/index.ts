/**
 * @holoscript/spatial-index
 *
 * High-performance R-Tree spatial indexing for geospatial anchors
 * with IndexedDB persistence and O(log n) query performance.
 *
 * Features:
 * - Efficient insert/delete/query operations
 * - Bounding box queries for radius searches
 * - OMT bulk loading optimization
 * - K-nearest neighbor search
 * - IndexedDB persistence
 *
 * @version 1.0.0
 */

export * from './types';
export * from './bbox';
export * from './RTree';
export * from './GeospatialAnchorStorage';
