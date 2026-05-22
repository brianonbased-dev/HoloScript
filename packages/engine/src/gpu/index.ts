/**
 * GPU Module
 *
 * WebGPU compute pipelines, Gaussian splatting, spatial grid, and codec system.
 */

export * from './ComputePipeline';
export * from './FlowFieldCompute';
export * from './GPUBuffers';
export * from './GaussianSplatExtractor';
export * from './GaussianSplatSorter';
export * from './InstancedRenderer';
export * from './RegularGridStencilSolver';
export * from './SparseLinearSolver';
export * from './SpatialGrid';
export * from './WebGPUContext';
export * from './codecs';
// GPUContext alias — resolves the speculative @hololand/gpu import in BuiltinRegistry.ts
export { WebGPUContext as GPUContext } from './WebGPUContext';
