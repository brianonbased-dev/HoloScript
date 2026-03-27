/**
 * Terrain Generation & Ocean Rendering Traits
 */
export const TERRAIN_OCEAN_TRAITS = [
  'terrain_heightmap',
  'terrain_fbm_noise',
  'terrain_hydraulic_erosion',
  'terrain_thermal_erosion',
  'terrain_biome_splatmap',
  'terrain_lod_geomorphing',
  'terrain_triplanar_texture',
  'terrain_grass_scatter',
  'terrain_tree_scatter',
  'terrain_rock_scatter',
  'ocean_fft',
  'ocean_gerstner',
  'ocean_calm_lake',
  'ocean_flowing_river',
  'ocean_foam',
  'ocean_caustics',
  'ocean_underwater_fog',
  'ocean_buoyancy',
  'ocean_shoreline',
  'ocean_wake',
] as const;
