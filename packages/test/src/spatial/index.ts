/**
 * @holoscript/test — spatial module
 *
 * Exports AABB math, entity types, and custom vitest matchers for spatial assertions.
 */

export { BoundingBox, type Vec3 } from './BoundingBox';
export { SpatialEntity, type SpatialEntityOptions } from './SpatialEntity';
export { setupSpatialMatchers } from './SpatialMatchers';
