/**
 * Instancing & GPU Geometry Traits
 *
 * Shape pools, instanced rendering, SDF ray marching,
 * compute rasterization, and batched mesh rendering.
 *
 * @see W.227: TSL instancedArray immediate path to 1M shapes
 * @see W.229: 33 Quilez SDFs map to geometry: field
 * @see HS-GEO-1 through HS-GEO-5
 */
export const INSTANCING_GEOMETRY_TRAITS = [
  // Shape Pool System (HS-GEO-1)
  'shape_pool',
  'shape_pool_box',
  'shape_pool_sphere',
  'shape_pool_cylinder',
  'shape_pool_cone',
  'shape_pool_torus',
  'shape_pool_capsule',

  // Instanced Rendering
  'instanced',
  'instanced_array',
  'instanced_color',
  'instanced_transform',

  // SDF Ray Marching (HS-GEO-3)
  'sdf_primitive',
  'sdf_union',
  'sdf_intersect',
  'sdf_difference',
  'sdf_smooth_union',
  'sdf_smooth_intersect',
  'sdf_smooth_difference',
  'sdf_repeat',
  'sdf_twist',
  'sdf_bend',

  // Compute Rasterization
  'compute_rasterize',
  'compute_rasterize_points',
  'compute_rasterize_splats',

  // Batched Mesh (Mixed Types at Scale)
  'batched_mesh',
  'batched_draw_indirect',
  'multi_draw_indirect',

  // Strategy Selection (HS-GEO-5)
  'render_strategy',
  'render_strategy_auto',
  'render_strategy_instanced',
  'render_strategy_sdf',
  'render_strategy_compute',
  'render_strategy_batched',

  // Morton Code Spatial Sorting (HS-GEO-4)
  'morton_sort',
  'morton_octree',
] as const;

export type InstancingGeometryTraitName = (typeof INSTANCING_GEOMETRY_TRAITS)[number];
