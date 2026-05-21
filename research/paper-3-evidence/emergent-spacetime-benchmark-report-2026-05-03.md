# Emergent Spacetime Benchmark Report

**Date:** 2026-05-03  
**Hardware:** AMD Ryzen 9 (CPU baseline)  
**Paper Dependency:** Paper 3 §7.8 "Entanglement Network Performance"

## Executive Summary

This benchmark establishes a **CPU baseline** for the Emergent Spacetime trait. The results demonstrate why GPU acceleration (WebGPU compute shaders) is necessary to meet the Paper 3 performance claims.

## Paper 3 §7.8 Claims

| Metric | Claim | CPU Result | GPU Target |
|--------|-------|------------|------------|
| 500 voxels | <16ms/frame | 16.37ms ✗ | <10ms |
| 1000 voxels | <33ms/frame | 142.10ms ✗ | <20ms |
| Ricci computation | <10μs/voxel | 35.21μs ✗ | <5μs |

## Benchmark Results (CPU Baseline)

### 500 Voxels
- **Average Frame Time:** 16.37ms (61.1 FPS)
- **Median Frame Time:** 16.44ms
- **P95 Frame Time:** 18.53ms
- **Ricci Computation:** 11.34μs/voxel
- **Status:** Marginally misses 60 FPS target

### 1000 Voxels
- **Average Frame Time:** 142.10ms (7.0 FPS)
- **Median Frame Time:** 137.76ms
- **P95 Frame Time:** 190.52ms
- **Ricci Computation:** 59.08μs/voxel
- **Status:** Significantly below real-time requirement

## Analysis

### Why CPU Falls Short

1. **Force Layout Complexity:** O(n²) pairwise interactions for 1000 voxels = 499,500 force calculations per frame
2. **JavaScript Single Thread:** No parallelization of voxel updates
3. **Memory Bandwidth:** CPU cache misses on large voxel maps
4. **Ricci Computation:** Graph Laplacian computed sequentially

### WebGPU Compute Shader Advantage

The WebGPU implementation (`packages/snn-webgpu/src/emergent-spacetime/`) provides:

1. **Massive Parallelism:** 256-thread workgroups process voxels concurrently
2. **GPU Memory:** High-bandwidth VRAM (48GB+ on target GPUs)
3. **Compute Shaders:** 
   - `forceLayout` shader: parallel spring/repulsion forces
   - `computeRicci` shader: parallel curvature computation
4. **Instanced Rendering:** Single draw call for all voxels

## Target GPU Benchmarks

RTX 6000 Ada was not available on Vast.ai at time of testing. Equivalent alternatives:

| GPU | VRAM | $/hr | Expected Performance |
|-----|------|------|---------------------|
| RTX PRO 6000 S | 96GB | $1.01-2.40 | Meets all claims |
| RTX 4090 | 48GB | $0.67 | Meets all claims |
| H100 NVL | 94GB | $1.76 | Exceeds claims |
| H200 | 140GB | $3.36 | Best option |

## Next Steps

1. **Provision GPU instance** on Vast.ai (RTX PRO 6000 S or H100 NVL)
2. **Deploy WebGPU benchmark** harness
3. **Capture GPU results** with same voxel counts
4. **Update Paper 3 §7.8** with measured GPU metrics
5. **Cross-vendor validation** per `memory/paper-3-webgpu-determinism-hardware-queue.md`

## Files

- Benchmark runner: `scripts/run-emergent-spacetime-benchmark-real.mjs`
- TypeScript harness: `packages/studio/src/__benchmarks__/emergent-spacetime-rtx-benchmark.ts`
- WebGPU shaders: `packages/snn-webgpu/src/emergent-spacetime/emergent-spacetime.wgsl.ts`
- Raw results: `research/paper-3-evidence/emergent-spacetime-benchmark-local-amd-ryzen-9-*.json`

## Conclusion

The CPU baseline confirms that the Emergent Spacetime trait requires GPU acceleration to meet real-time performance targets. The WebGPU compute shader implementation is the correct path forward for Paper 3 §7.8 verification.
