# WebGPU Compute Shader Benchmark Report

**Generated:** 2026-03-08T16:31:40.782Z

**HoloScript Version:** v3.43.0

**Baseline GPU:** NVIDIA RTX 3080

**Total Examples:** 5

**Success Rate:** 0.0%


---

## Executive Summary

This benchmark suite validates HoloScript's WebGPU compute shader compilation capabilities by testing 5 advanced GPU computing examples:

1. **Fluid Simulation** - Navier-Stokes solver with pressure projection
2. **Million Particles** - 1M+ particle system with spatial hashing
3. **Cloth Simulation** - Position-Based Dynamics with collision detection
4. **Rigid Body Physics** - 6-DOF dynamics with impulse solver
5. **N-Body Gravity** - Barnes-Hut gravitational simulation

- **Total Compilations:** 5
- **Successful:** 0 (0.0%)
- **Failed:** 5 (100.0%)


---

## Detailed Results

| Example | Status | Parse (ms) | Compile (ms) | Size | WGSL Shaders | Target FPS | Est. FPS | Meets Target |
|---------|--------|------------|--------------|------|--------------|------------|----------|--------------|
| gpu-fluid-simulation.holo | ❌ | - | - | - | - | 60 | 115 | - |
| gpu-particles-million.holo | ❌ | - | - | - | - | 60 | 94 | - |
| gpu-cloth-simulation.holo | ❌ | - | - | - | - | 60 | 87 | - |
| gpu-physics-rigid-body.holo | ❌ | - | - | - | - | 60 | 98 | - |
| n-body-gravity.holo | ❌ | - | - | - | - | 60 | 106 | - |



---

## Performance Analysis (RTX 3080 Baseline)


---

## Validation Summary

| Validation Check | Pass Rate |
|------------------|-----------|
| WGSL Syntax Valid | 0/0 (NaN%) |
| Compute Shaders Found | 0/0 (NaN%) |
| GPU Buffers Allocated | 0/0 (NaN%) |
| Dispatch Calls Present | 0/0 (NaN%) |
| GPU Timing Enabled | 0/0 (NaN%) |



---

## Failure Analysis

**Total Failures:** 5

| Example | Error |
|---------|-------|
| gpu-fluid-simulation.holo | Expected identifier, got STRING (in composition > domain-material) |
| gpu-particles-million.holo | Expected identifier, got STRING (in composition > domain-material) |
| gpu-cloth-simulation.holo | Expected identifier, got STRING (in composition > domain-material) |
| gpu-physics-rigid-body.holo | Expected identifier, got STRING (in composition > domain-material) |
| n-body-gravity.holo | Expected identifier, got STRING (in composition > domain-material) |



---

## Methodology

### Benchmark Process

1. **Parse** - Parse HoloScript composition using HoloCompositionParser
2. **Compile** - Compile to WebGPU using WebGPUCompiler with compute shaders enabled
3. **Validate** - Check for WGSL syntax, compute shaders, buffers, dispatch calls, and GPU timing
4. **Analyze** - Extract performance targets from example comments and validate against 60 FPS baseline

### Performance Baselines

All performance targets are documented within each `.holo` file and validated against RTX 3080 benchmarks:

- **Target:** 60 FPS (16.67ms/frame)
- **GPU:** NVIDIA RTX 3080
- **API:** WebGPU (Chrome Canary / Edge Dev)
- **Workgroup Size:** 256 threads (16x16 for 2D, 256 for 1D)
- **Timing:** GPU timestamps where available

### WGSL Validation

WGSL shader validation includes:
- Presence of compute shader stage attributes (`@compute`)
- Workgroup size attributes (`@workgroup_size`)
- Buffer binding declarations (`@group`, `@binding`)
- Built-in variable usage (`@builtin`)
- Dispatch call generation
