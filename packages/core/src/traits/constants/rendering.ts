/**
 * Rendering & Graphics Traits
 *
 * Advanced rendering features for photorealistic XR applications:
 * - Advanced PBR materials (clearcoat, anisotropy, sheen, SSS, iridescence, transmission)
 * - Screen-space effects (SSAO, SSR, SSGI, TAA, motion blur, DOF)
 *
 * Covers 25+ rendering trait constants for next-gen graphics.
 */
export const RENDERING_TRAITS = [
  // Advanced PBR Material Features
  'advanced_pbr',
  'clearcoat',
  'anisotropy',
  'sheen',
  'subsurface_scattering',
  'subsurface_veins',
  'sss_burley',
  'sss_christensen',
  'sss_random_walk',
  'iridescence',
  'transmission',
  'dispersion',

  // Screen-Space Lighting
  'screen_space_effects',
  'ssao', // Screen-Space Ambient Occlusion
  'ssr', // Screen-Space Reflections
  'ssgi', // Screen-Space Global Illumination
  'ssdo', // Screen-Space Directional Occlusion

  // Anti-Aliasing
  'taa', // Temporal Anti-Aliasing

  // Camera Effects
  'motion_blur',
  'depth_of_field',
  'dof_bokeh',
  'chromatic_aberration',

  // Lens Effects
  'lens_flare',
  'film_grain',
  'vignette',

  // Post-Processing
  'post_processing_stack',
] as const;

export type RenderingTraitName = (typeof RENDERING_TRAITS)[number];
