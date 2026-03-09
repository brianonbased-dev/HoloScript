/**
 * @holoscript/spatial-index - Bounding Box Utilities
 *
 * Efficient bounding box operations for R-Tree spatial indexing.
 *
 * @version 1.0.0
 */

import type { BBox, Point, GeospatialAnchor } from './types';

/**
 * Calculate the area of a bounding box in square degrees
 */
export function bboxArea(bbox: BBox): number {
  return (bbox.maxLat - bbox.minLat) * (bbox.maxLon - bbox.minLon);
}

/**
 * Calculate intersection area of two bounding boxes
 */
export function bboxIntersectionArea(a: BBox, b: BBox): number {
  const minLat = Math.max(a.minLat, b.minLat);
  const minLon = Math.max(a.minLon, b.minLon);
  const maxLat = Math.min(a.maxLat, b.maxLat);
  const maxLon = Math.min(a.maxLon, b.maxLon);

  if (minLat >= maxLat || minLon >= maxLon) return 0;

  return (maxLat - minLat) * (maxLon - minLon);
}

/**
 * Calculate the margin of a bounding box (perimeter)
 */
export function bboxMargin(bbox: BBox): number {
  return bbox.maxLat - bbox.minLat + (bbox.maxLon - bbox.minLon);
}

/**
 * Check if bounding box contains a point
 */
export function bboxContainsPoint(bbox: BBox, point: Point): boolean {
  return (
    point.lat >= bbox.minLat &&
    point.lat <= bbox.maxLat &&
    point.lon >= bbox.minLon &&
    point.lon <= bbox.maxLon
  );
}

/**
 * Check if two bounding boxes intersect
 */
export function bboxIntersects(a: BBox, b: BBox): boolean {
  return !(
    a.maxLat < b.minLat ||
    a.minLat > b.maxLat ||
    a.maxLon < b.minLon ||
    a.minLon > b.maxLon
  );
}

/**
 * Calculate enlargement needed to include a point
 */
export function bboxEnlargement(bbox: BBox, point: Point): number {
  const newBBox = extendBBox(bbox, point);
  return bboxArea(newBBox) - bboxArea(bbox);
}

/**
 * Create bounding box from a geospatial anchor
 */
export function createBBoxFromAnchor(anchor: GeospatialAnchor): BBox {
  return {
    minLat: anchor.lat,
    minLon: anchor.lon,
    maxLat: anchor.lat,
    maxLon: anchor.lon,
  };
}

/**
 * Extend bounding box to include a point
 */
export function extendBBox(bbox: BBox, point: Point): BBox {
  return {
    minLat: Math.min(bbox.minLat, point.lat),
    minLon: Math.min(bbox.minLon, point.lon),
    maxLat: Math.max(bbox.maxLat, point.lat),
    maxLon: Math.max(bbox.maxLon, point.lon),
  };
}

/**
 * Merge two bounding boxes
 */
export function mergeBBox(a: BBox, b: BBox): BBox {
  return {
    minLat: Math.min(a.minLat, b.minLat),
    minLon: Math.min(a.minLon, b.minLon),
    maxLat: Math.max(a.maxLat, b.maxLat),
    maxLon: Math.max(a.maxLon, b.maxLon),
  };
}

/**
 * Create a bounding box that contains all given bboxes
 */
export function createContainingBBox(bboxes: BBox[]): BBox {
  if (bboxes.length === 0) {
    throw new Error('Cannot create containing bbox from empty array');
  }

  let result = bboxes[0];
  for (let i = 1; i < bboxes.length; i++) {
    result = mergeBBox(result, bboxes[i]);
  }
  return result;
}

/**
 * Haversine distance between two points in meters
 */
export function haversineDistance(p1: Point, p2: Point): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLon = ((p2.lon - p1.lon) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((p1.lat * Math.PI) / 180) *
      Math.cos((p2.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Calculate minimum distance from point to bounding box
 */
export function minDistanceToBBox(point: Point, bbox: BBox): number {
  // If point is inside bbox, distance is 0
  if (bboxContainsPoint(bbox, point)) {
    return 0;
  }

  // Find closest point on bbox boundary
  const closestLat = Math.max(bbox.minLat, Math.min(point.lat, bbox.maxLat));
  const closestLon = Math.max(bbox.minLon, Math.min(point.lon, bbox.maxLon));

  return haversineDistance(point, { lat: closestLat, lon: closestLon });
}

/**
 * Create bounding box for radius search around a point
 */
export function createRadiusBBox(center: Point, radiusMeters: number): BBox {
  // Approximate degrees per meter (this is simplified, accurate enough for small radii)
  const latDegreePerMeter = 1 / 111320;
  const lonDegreePerMeter = 1 / (111320 * Math.cos((center.lat * Math.PI) / 180));

  const latDelta = radiusMeters * latDegreePerMeter;
  const lonDelta = radiusMeters * lonDegreePerMeter;

  return {
    minLat: center.lat - latDelta,
    minLon: center.lon - lonDelta,
    maxLat: center.lat + latDelta,
    maxLon: center.lon + lonDelta,
  };
}
