/**
 * GPU Compute / Shader Traits
 * compute already in VR_TRAITS — only new names here
 * @version 1.0.0
 */
export const GPU_COMPUTE_TRAITS = [
  'compute_shader', // Custom GPU compute shader
  'render_pipeline', // Custom rendering pipeline
  'post_process', // Post-processing effect chain
  'ray_trace', // Ray-tracing integration
] as const;

export type GpuComputeTraitName = (typeof GPU_COMPUTE_TRAITS)[number];
