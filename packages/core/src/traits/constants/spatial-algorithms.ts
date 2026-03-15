/**
 * Spatial Algorithms Stdlib Traits
 * voronoi already in VR_TRAITS — only new names here
 * @version 1.0.0
 */
export const SPATIAL_ALGORITHMS_TRAITS = [
  'astar',              // A* pathfinding
  'navmesh_solver',     // Navigation mesh solver
  'optimization',       // Constraint optimization solver
] as const;

export type SpatialAlgorithmsTraitName = (typeof SPATIAL_ALGORITHMS_TRAITS)[number];
