# Spec: PBD Solver Upgrade — Unified Particle Buffer + MLS-MPM Fluid

**TODO-FEAT-001 + TODO-FEAT-002** | Priority 1-2 | Pillar A Foundation
**Date**: 2026-03-21
**Status**: SPEC DRAFT

## Context

### What Exists (40% Complete)
- **PBDSolver.ts** (2400+ lines): GPU PBD solver with 5 constraint types (distance, volume, bending, collision, attachment), graph coloring, SDF collision, WGSL compute shaders, CPU fallback
- **FluidSim.ts** (244 lines): CPU-only SPH with Poly6/Spiky/Viscosity kernels, ~500 particle practical limit, no rendering
- **spatial-grid.wgsl**: GPU spatial hash grid with 27-neighbor checking, atomicAdd, collision force accumulation
- **particle-physics.wgsl**: GPU particle sim with semi-implicit Euler, ground plane collision, sleep states
- **SpatialHash.ts**: CPU spatial hash for broad-phase collision

### What's Missing (GAPS Research)
- **Unified particle buffer**: All physics types (fluid, cloth, rigid, crowd) as particles in one solver
- **MLS-MPM algorithm**: GPU P2G/G2P exchange for fluid (100K+ particles on iGPU)
- **Density constraints**: Missing from PBD constraint types (needed for fluid coupling)
- **SSFR rendering**: No Screen-Space Fluid Rendering pipeline
- **Destruction/fracture**: No tearing or fracture modes
- **Crowd integration**: FlockingBehavior is O(N²), not using spatial-grid.wgsl

## Design

### Phase 1: Unified Particle Buffer (Week 1)

Extend `PBDSolver.ts` to treat all physics entities as particles in a single buffer.

```typescript
// New enum in PhysicsTypes.ts
export enum ParticleType {
  CLOTH = 0,      // Existing PBD mesh vertices
  FLUID = 1,      // MLS-MPM fluid particles
  RIGID = 2,      // Rigid body sample points
  DEBRIS = 3,     // Destruction fragments
  CROWD = 4,      // Crowd agent proxies
}

// Extended particle layout (GPU buffer)
// positions:   vec4(x, y, z, radius)       — 16 bytes
// velocities:  vec4(vx, vy, vz, mass)      — 16 bytes
// attributes:  vec4(type, phase, density, pressure) — 16 bytes
// Total: 48 bytes/particle
```

**Changes to PBDSolver.ts:**
1. Add `attributes` storage buffer alongside existing `positions`/`velocities`/`predicted`/`masses`
2. Add `ParticleType` field to attributes buffer
3. Constraint shaders check particle type before applying (fluid particles skip distance constraints, cloth particles skip density constraints)
4. Existing constraint shaders unchanged — they already operate on index ranges

**Key principle**: Cloth vertices at indices [0, N_cloth), fluid particles at [N_cloth, N_cloth + N_fluid), etc. Each constraint type specifies its index range.

### Phase 2: MLS-MPM Fluid Module (Week 2-3)

New WGSL compute shaders for MLS-MPM (Moving Least Squares Material Point Method):

```
// Pipeline per frame:
// [1] Particle-to-Grid (P2G): scatter particle mass/momentum to grid
// [2] Grid operations: gravity, boundary conditions
// [3] Grid-to-Particle (G2P): gather grid velocities back to particles
// [4] Advect particles
```

**New files:**
- `src/gpu/shaders/mls-mpm-p2g.wgsl` — Particle-to-Grid transfer with atomicAdd
- `src/gpu/shaders/mls-mpm-grid.wgsl` — Grid update (gravity, boundaries)
- `src/gpu/shaders/mls-mpm-g2p.wgsl` — Grid-to-Particle gather + APIC
- `src/gpu/shaders/ssfr-depth.wgsl` — SSFR depth pass (particle splatting)
- `src/gpu/shaders/ssfr-filter.wgsl` — Bilateral filter for smoothing
- `src/gpu/shaders/ssfr-shade.wgsl` — Final shading with refraction

**New class:**
```typescript
// src/physics/MLSMPMFluid.ts
export class MLSMPMFluid {
  constructor(device: GPUDevice, config: FluidConfig);

  // Lifecycle
  init(particleCount: number, initialPositions?: Float32Array): void;
  step(dt: number): void;
  dispose(): void;

  // Integration with unified buffer
  getParticleBuffer(): GPUBuffer;  // Shares with PBDSolver
  getParticleCount(): number;

  // SSFR rendering
  renderDepth(encoder: GPURenderPassEncoder): void;
  renderShade(encoder: GPURenderPassEncoder): void;
}

export interface FluidConfig {
  type: 'liquid' | 'gas';
  particleCount: number;
  viscosity: number;
  gridResolution: number;        // MLS-MPM grid cells per axis
  resolutionScale: number;       // SSFR half-res by default (0.5)
  restDensity: number;
  bulkModulus: number;           // Compressibility
  boundaryMin: [number, number, number];
  boundaryMax: [number, number, number];
}
```

### Phase 3: SSFR Rendering Pipeline (Week 3)

Screen-Space Fluid Rendering for the @fluid trait:

1. **Depth pass**: Render particles as point sprites → depth buffer
2. **Thickness pass**: Additive blending of particle thickness
3. **Bilateral filter**: Smooth depth (configurable iterations)
4. **Normal computation**: From filtered depth via screen-space derivatives
5. **Final shade**: Fresnel + refraction + absorption (Beer-Lambert)

Resolution control: `resolution_scale` parameter (default 0.5 = half-res).

### Phase 4: @fluid Trait (Week 3)

```holoscript
object Ocean {
  @fluid {
    type: "liquid"
    particle_count: 100000
    viscosity: 0.01
    resolution_scale: 0.5
  }
  position: [0, 0, 0]
  scale: [50, 10, 50]
}
```

**Trait handler** in `src/traits/FluidTrait.ts`:
```typescript
export const fluidHandler: TraitHandler<FluidConfig> = {
  name: 'fluid',
  defaultConfig: {
    type: 'liquid',
    particle_count: 10000,
    viscosity: 0.01,
    resolution_scale: 0.5,
  },
  onAttach(node, config, context) {
    // Init MLSMPMFluid with WebGPU device from context
    // Register particle buffer with unified PBD solver
  },
  onUpdate(node, config, context, dt) {
    // Step MLS-MPM simulation
    // Render via SSFR pipeline
  },
  onDetach(node) {
    // Dispose GPU resources
  },
};
```

## Test Targets

| Test | Target | Method |
|------|--------|--------|
| MLS-MPM 100K particles | 60 FPS on iGPU | Vitest + WebGPU mock for unit, manual for perf |
| MLS-MPM 300K particles | 30 FPS on discrete GPU | Manual benchmark |
| Unified buffer coupling | Cloth + fluid interact | Integration test: cloth drapes into fluid |
| SSFR rendering | Visual correctness | Screenshot comparison |
| @fluid trait HoloScript | Parses and compiles | Parser + compiler integration test |

## Dependencies

- None (this IS the foundation)
- Consumed by: TODO-FEAT-004 (@weather), TODO-FEAT-007 (quality tiers), TODO-FEAT-011 (soft body+destruction), TODO-FEAT-012 (@crowd_sim)

## Files Changed

| File | Action |
|------|--------|
| `src/physics/PhysicsTypes.ts` | Add `ParticleType` enum, `FluidConfig` interface |
| `src/physics/PBDSolver.ts` | Add attributes buffer, particle type filtering in constraint shaders |
| `src/physics/MLSMPMFluid.ts` | **NEW** — MLS-MPM fluid simulation class |
| `src/gpu/shaders/mls-mpm-p2g.wgsl` | **NEW** — P2G compute shader |
| `src/gpu/shaders/mls-mpm-grid.wgsl` | **NEW** — Grid update shader |
| `src/gpu/shaders/mls-mpm-g2p.wgsl` | **NEW** — G2P compute shader |
| `src/gpu/shaders/ssfr-depth.wgsl` | **NEW** — SSFR depth pass |
| `src/gpu/shaders/ssfr-filter.wgsl` | **NEW** — Bilateral filter |
| `src/gpu/shaders/ssfr-shade.wgsl` | **NEW** — Final shading |
| `src/traits/FluidTrait.ts` | **NEW** — @fluid trait handler |
| `src/traits/constants/physics-expansion.ts` | Add 'fluid' to trait list |

## Risks

1. **WebGPU atomicAdd precision**: MLS-MPM P2G requires atomic float add. WebGPU only has `atomicAdd` for integers. **Mitigation**: Use fixed-point (multiply by 1024, atomicAdd integers, divide back). Well-documented pattern.
2. **Buffer size limits**: 300K particles × 48 bytes = 14.4 MB. Well within WebGPU limits.
3. **SSFR quality at half-res**: May produce artifacts at boundaries. **Mitigation**: `resolution_scale` is configurable, default to 0.5 but user can set 1.0.

## References

- [matsuoka-601/WebGPU-Ocean](https://github.com/matsuoka-601/WebGPU-Ocean) — MLS-MPM reference
- [InteractiveComputerGraphics/PositionBasedDynamics](https://github.com/InteractiveComputerGraphics/PositionBasedDynamics) — PBD reference
- GAPS Research: `docs/planning/GAPS_3-21-2026-research/2026-03-21_holoscript-gaps-feature-roadmap.md`
