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
  // Runtime handlers registered by packages/runtime/src/browser/BrowserRuntime.ts, used in examples/
  'gravity', // packages/runtime/src/traits/InteractionTraits.ts GravityTrait
] as const;
