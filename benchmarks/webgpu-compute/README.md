# WebGPU Compute Shader Benchmark Suite

Comprehensive benchmark suite for HoloScript's WebGPU compute shader compilation and performance validation.

## Overview

This benchmark suite tests HoloScript's ability to compile advanced GPU compute shaders to WebGPU/WGSL, validating:

- **WGSL Shader Compilation** - Correct transpilation from HoloScript to WGSL
- **Compute Shader Execution** - Proper `@compute` stage attributes and workgroup sizing
- **Performance Targets** - Validation against 60 FPS baseline on RTX 3080
- **GPU Memory Management** - Buffer allocations and storage layouts
- **Dispatch Calls** - Compute workgroup dispatch generation

## Tested Examples

### 1. GPU Fluid Simulation (`gpu-fluid-simulation.holo`)

Navier-Stokes incompressible fluid solver with:

- Semi-Lagrangian advection
- Pressure projection (Jacobi iteration)
- Divergence-free velocity field enforcement
- **Target:** 60 FPS @ 1024x1024 grid
- **Estimated:** 115 FPS (8.7ms/frame)

### 2. Million Particle System (`gpu-particles-million.holo`)

High-performance particle simulation with:

- 1,048,576 particles (2^20)
- Spatial hash grid for O(n) collision detection
- GPU radix sort for depth ordering
- Frustum culling with atomic counters
- **Target:** 60 FPS
- **Estimated:** 94 FPS (10.6ms/frame)

### 3. GPU Cloth Simulation (`gpu-cloth-simulation.holo`)

Position-Based Dynamics cloth physics with:

- 128x128 vertex mesh (16,384 vertices)
- Distance and bending constraints
- Self-collision detection
- Wind force simulation
- **Target:** 60 FPS
- **Estimated:** 87 FPS (11.5ms/frame)

### 4. Rigid Body Physics (`gpu-physics-rigid-body.holo`)

6-DOF rigid body dynamics with:

- 10,000 rigid bodies
- Inertia tensor computation
- Sequential impulse solver (Erin Catto's algorithm)
- Spatial hashing for broad-phase collision
- **Target:** 60 FPS
- **Estimated:** 98 FPS (10.2ms/frame)

### 5. N-Body Gravity Simulation (`n-body-gravity.holo`)

Barnes-Hut gravitational simulation with:

- 10,000 celestial bodies
- Octree spatial partitioning (O(n log n))
- Symplectic Leapfrog integrator
- Center of mass approximation
- **Target:** 60 FPS
- **Estimated:** 106 FPS (9.4ms/frame)

## Usage

### Run All Benchmarks

```bash
pnpm run bench
# or
ts-node webgpu-compute-benchmark.ts
```

### Run Individual Examples

```bash
pnpm run bench:fluid      # Fluid simulation
pnpm run bench:particles  # Million particles
pnpm run bench:cloth      # Cloth simulation
pnpm run bench:physics    # Rigid body physics
pnpm run bench:nbody      # N-body gravity
```

## Output

The benchmark suite generates:

### 1. Console Output

Real-time progress with detailed metrics for each example:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧪 Benchmarking: gpu-fluid-simulation.holo
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Status:            SUCCESS
⏱️  Parse Time:        12.34ms
⚙️  Compile Time:      45.67ms
📊 Total Time:        58.01ms
📦 Output Size:       128.5 KB
🔧 WGSL Shaders:      7 total (5 compute)

🎯 Performance Targets (RTX 3080):
   Target:            60 FPS (16.67ms/frame)
   Estimated:         115 FPS (8.70ms/frame)
   Status:            ✓ MEETS TARGET
   Grid Resolution:   1024x1024
```

### 2. JSON Results (`results/webgpu-benchmark-results.json`)

Machine-readable benchmark data for automated CI/CD integration.

### 3. Markdown Report (`results/WEBGPU_BENCHMARK_REPORT.md`)

Comprehensive human-readable report with:

- Executive summary
- Detailed performance analysis per example
- Validation results
- Failure analysis (if any)
- Methodology documentation

## Validation Criteria

Each example is validated against:

### WGSL Syntax

- ✓ Valid `@compute`, `@vertex`, `@fragment` stage attributes
- ✓ `@workgroup_size` declarations
- ✓ `@group` and `@binding` buffer declarations
- ✓ `@builtin` variable usage

### Compute Shaders

- ✓ Presence of compute shader declarations
- ✓ Storage buffer bindings (`storage, read_write`)
- ✓ Uniform buffer bindings
- ✓ Atomic operations where needed

### GPU Buffers

- ✓ `createBuffer()` or `createStorageBuffer()` calls
- ✓ Proper buffer usage flags (`STORAGE`, `VERTEX`, `UNIFORM`)
- ✓ Correct byte alignment (4-byte for f32, 16-byte for vec4)

### Dispatch Calls

- ✓ `dispatchWorkgroups()` calls
- ✓ Correct workgroup sizing (divisible by 64, typically 256 threads)
- ✓ Proper 3D dispatch dimensions

### GPU Timing

- ✓ Timestamp query support
- ✓ `profiler { gpu_timing: true }` configuration
- ✓ Performance target documentation

## Performance Baselines

All benchmarks target **60 FPS (16.67ms/frame)** on:

- **GPU:** NVIDIA RTX 3080 (10GB VRAM)
- **API:** WebGPU (Chrome Canary 120+)
- **OS:** Windows 11 / Linux
- **Driver:** Latest NVIDIA drivers (535+)

## CI/CD Integration

The benchmark suite outputs machine-readable JSON suitable for CI/CD pipelines:

```bash
# Run benchmarks in CI
pnpm run bench

# Check exit code
if [ $? -ne 0 ]; then
  echo "Benchmarks failed"
  exit 1
fi

# Parse results
SUCCESS_RATE=$(jq '.[] | select(.success == true) | length' results/webgpu-benchmark-results.json)
echo "Success rate: $SUCCESS_RATE/5"
```

## Troubleshooting

### Missing Examples

If examples are not found, ensure you're running from the HoloScript root:

```bash
cd /path/to/HoloScript
pnpm run bench:webgpu
```

### Parse Errors

If parsing fails, validate the `.holo` syntax:

```bash
cd examples/webgpu-compute
holoscript parse gpu-fluid-simulation.holo
```

### Compilation Errors

Enable verbose logging:

```bash
DEBUG=holoscript:* pnpm run bench
```

## Next Steps

After benchmarking:

1. **Review Report** - Check `results/WEBGPU_BENCHMARK_REPORT.md` for detailed analysis
2. **Validate Performance** - Ensure all examples meet 60 FPS target
3. **Fix Failures** - Address any compilation or validation errors
4. **Optimize** - If examples fall below target FPS, optimize shader code
5. **Document** - Update example comments with actual benchmark results

## Contributing

When adding new WebGPU compute examples:

1. Add `.holo` file to `examples/webgpu-compute/`
2. Include performance targets in comments:
   ```typescript
   /**
    * Performance Targets (RTX 3080):
    *   - Target: 60 FPS (16.67ms/frame)
    *   - Estimated: XXX FPS (XX.Xms/frame)
    */
   ```
3. Add entry to `PERFORMANCE_TARGETS` in benchmark script
4. Run benchmark suite and update this README

## License

MIT
