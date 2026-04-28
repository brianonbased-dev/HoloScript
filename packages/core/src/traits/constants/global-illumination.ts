/**
 * Global Illumination & Advanced Lighting Traits
 */
export const GLOBAL_ILLUMINATION_TRAITS = [
  'global_illumination', // Parent directive (DDGI/SH probes; GlobalIlluminationTrait.ts handler)
  'ssgi',
  'radiance_cascades',
  'light_probes',
  'irradiance_volume',
  'voxel_cone_trace',
  'lightmap_baked',
  'lightmap_dynamic',
  'reflection_probe',
  'planar_reflection',
  'screen_space_reflection',
  'ambient_occlusion_baked',
  'ambient_occlusion_realtime',
  'emissive_gi',
  'bounce_light',
  'light_propagation_volume',
] as const;
