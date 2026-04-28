/**
 * Physics Expansion Traits
 */
export const PHYSICS_EXPANSION_TRAITS = [
  'stretchable',
  'cloth',
  'fluid',
  // Legacy alias retained for parser compatibility in stress-test scenes
  'fluid_simulation',
  'soft_body',
  'rope',
  'chain',
  'wind',
  'buoyancy',
  'destruction',
  // Physics/material traits used by stress-test and older scenes
  'granular_material',
  'voronoi_fracture',
] as const;
