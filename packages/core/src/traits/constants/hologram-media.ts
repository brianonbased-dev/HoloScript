/**
 * Hologram Media Pipeline Traits
 *
 * 2D-to-3D hologram generation traits for images, videos, and GIFs.
 * Covers the full pipeline: depth estimation, displacement, segmentation,
 * animated textures, holographic sprites, quilt output, and Gaussian splatting.
 *
 * @see research/2026-03-21_2d-to-3d-hologram-media-pipeline.md
 */
export const HOLOGRAM_MEDIA_TRAITS = [
  // Core pipeline
  'depth_estimation',
  'displacement',
  'segment',
  'animated_texture',
  'holographic_sprite',

  // Output formats
  'quilt',
  'gaussian_splatting',
  'spatial_video',

  // Media inputs
  'image',
  'depth_sequence',

  // Modifiers
  'temporal_smoothing',
  'billboard',
  'depth_to_normal',
] as const;
