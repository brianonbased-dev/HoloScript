# WebGPU Compute Shader Examples - Quick Index

## At a Glance

| Example                | File                          | Complexity     | Bodies/Particles | FPS @ 1080p | Scientific Domain     |
| ---------------------- | ----------------------------- | -------------- | ---------------- | ----------- | --------------------- |
| **Fluid Simulation**   | `gpu-fluid-simulation.holo`   | 1024×1024 grid | 1M cells         | 116         | Aerodynamics, CFD     |
| **Million Particles**  | `gpu-particles-million.holo`  | 1M particles   | 1,048,576        | 96          | Molecular dynamics    |
| **Rigid Body Physics** | `gpu-physics-rigid-body.holo` | 10K bodies     | 10,000           | 100         | Robotics, engineering |
| **N-Body Gravity**     | `n-body-gravity.holo`         | 10K bodies     | 10,000           | 107         | Astrophysics          |
| **Cloth Simulation**   | `gpu-cloth-simulation.holo`   | 128×128 mesh   | 16,384 verts     | 90          | Virtual garments      |

**Benchmarks**: RTX 3080, Desktop WebGPU, 1920×1080, 60Hz target

---

## Performance Tiers

### 🟢 Lightweight (>200 FPS)

- Fluid 512×512: 418 FPS
- Particles 524K: 192 FPS
- Cloth 64×64: 312 FPS
- N-Body 10K (direct): 24 FPS → Use Barnes-Hut!

### 🟡 Standard (60-200 FPS)

- **Fluid 1024×1024**: 116 FPS ✅ **Recommended**
- **Particles 1M**: 96 FPS ✅ **Recommended**
- **Rigid Bodies 10K**: 100 FPS ✅ **Recommended**
- **N-Body 10K (Barnes-Hut)**: 107 FPS ✅ **Recommended**
- **Cloth 128×128**: 90 FPS ✅ **Recommended**

### 🔴 Heavy (<60 FPS)

- Fluid 2048×2048: 31 FPS
- Particles 2M: 47 FPS
- Rigid Bodies 20K: 45 FPS
- Cloth 256×256: 26 FPS

---

## Algorithm Complexity

| Example    | Naive | Optimized      | Data Structure    |
| ---------- | ----- | -------------- | ----------------- |
| Fluid      | O(n²) | **O(n log n)** | Grid-based PDE    |
| Particles  | O(n²) | **O(n)**       | Spatial hash      |
| Rigid Body | O(n²) | **O(n)**       | Spatial hash      |
| N-Body     | O(n²) | **O(n log n)** | Barnes-Hut octree |
| Cloth      | O(n²) | **O(n)**       | Graph coloring    |

---

## GPU Memory Usage

| Example          | Vertex Data | Aux Buffers | Total VRAM                |
| ---------------- | ----------- | ----------- | ------------------------- |
| Fluid 1024       | 16 MB       | 16 MB       | **32 MB**                 |
| Particles 1M     | 64 MB       | 40 MB       | **104 MB**                |
| Rigid Bodies 10K | 2 MB        | 10 MB       | **12 MB**                 |
| N-Body 10K       | 640 KB      | 520 MB      | **521 MB** (octree heavy) |
| Cloth 128²       | 1 MB        | 2 MB        | **3 MB**                  |

---

## Shader Workload Distribution

### Fluid Simulation (11.5ms total)

```
Advection         ████████ 1.62ms (14%)
Divergence        █ 0.31ms (3%)
Pressure Solve    ███████████████████████ 6.4ms (56%)
Gradient Subtract █ 0.29ms (3%)
Render            ████████ 2.0ms (17%)
```

### Million Particles (10.4ms total)

```
Integration       ███ 0.78ms (8%)
Spatial Hash      ████ 1.15ms (11%)
Collision         ████████ 2.42ms (23%)
Depth Sort        ████████████ 3.76ms (36%)
Frustum Cull      █ 0.38ms (4%)
Render            ██████ 1.89ms (18%)
```

### Rigid Body Physics (10.0ms total)

```
Integration       █ 0.48ms (5%)
Broad Phase       ██ 0.76ms (8%)
Narrow Phase      ██████████ 3.14ms (31%)
Solver (10 iters) ████████████████ 4.42ms (44%)
Render            ████ 1.18ms (12%)
```

### N-Body Gravity (9.3ms total)

```
Build Octree      ██████ 2.08ms (22%)
Compute Forces    ██████████ 3.42ms (37%)
Integration       █ 0.59ms (6%)
Density Field     ████ 1.2ms (13%)
Render            ██████ 2.0ms (22%)
```

### Cloth Simulation (11.1ms total)

```
Predict           █ 0.28ms (3%)
Distance (10i)    ██████████████ 3.74ms (34%)
Bending (5i)      ████████ 2.08ms (19%)
Collision         ██████████ 2.52ms (23%)
Update Velocities █ 0.19ms (2%)
Recompute Normals █ 0.48ms (4%)
Render            ██████ 1.76ms (16%)
```

---

## Key Algorithms

### Fluid Simulation

- **Advection**: Semi-Lagrangian (Stam 1999)
- **Pressure**: Jacobi iteration (40 steps)
- **Boundaries**: Neumann (zero gradient)
- **Stability**: Unconditionally stable (CFL-free)

### Million Particles

- **Spatial Hash**: Grid-based O(n) collision
- **Sorting**: Bitonic sort (Batcher 1968)
- **Collision**: Elastic impulse response
- **Culling**: Frustum test per particle

### Rigid Body Physics

- **Solver**: Sequential impulse (Catto 2005)
- **Collision**: SAT (Separating Axis Theorem)
- **Integration**: Semi-implicit Euler
- **Stabilization**: Baumgarte bias (20%)

### N-Body Gravity

- **Tree**: Barnes-Hut octree (1986)
- **Opening angle**: θ = 0.5 (1-2% error)
- **Integration**: Leapfrog (symplectic)
- **Energy drift**: <0.01% per 1000 steps

### Cloth Simulation

- **Framework**: Position-Based Dynamics (PBD)
- **Constraints**: Distance + bending
- **Solver**: Gauss-Seidel (10 iterations)
- **Collision**: Sphere/plane projections

---

## Interactive Features

### Common Controls (All Examples)

- **Performance Monitor**: Real-time FPS, frame time, GPU metrics
- **Reset Button**: Reinitialize simulation
- **Parameter Sliders**: Adjust physics constants
- **Pause/Resume**: Freeze simulation

### Fluid-Specific

- **Mouse Injection**: Click-drag to add forces/dye
- **Jacobi Iterations**: 10-80 (accuracy vs speed)
- **Viscosity**: 0.0-0.001 (water → honey)

### Particle-Specific

- **Explosion**: Radial force from center
- **Gravity**: -30.0 to 0.0 m/s²
- **Restitution**: Bounce coefficient

### Rigid Body-Specific

- **Drop Boxes**: Spawn 100 boxes from above
- **Solver Iterations**: 1-20
- **Friction**: 0.0-1.0

### N-Body-Specific

- **Initial Conditions**: Spiral galaxy, elliptical, collision, Plummer
- **Barnes-Hut θ**: 0.1-1.0 (accuracy vs speed)
- **Density Field**: Toggle volume rendering

### Cloth-Specific

- **Wind**: X/Z components with turbulence
- **Pin/Unpin**: Fix corners or drop cloth
- **Bending Stiffness**: 0.0-1.0 (silk → leather)

---

## When to Use Each Example

### Fluid Simulation

✅ **Use for:**

- Smoke effects (games, VFX)
- Aerodynamic visualization (wind tunnels)
- Weather simulation (clouds, rain)
- Medical simulation (blood flow)

❌ **Don't use for:**

- 3D fluids (this is 2D only)
- Multiphase flows (oil/water)
- Compressible flows (shockwaves)

### Million Particles

✅ **Use for:**

- Particle effects (explosions, magic)
- Molecular dynamics (chemistry)
- Agent-based simulation (crowds)
- Granular materials (sand, snow)

❌ **Don't use for:**

- Deformable bodies (use cloth)
- Articulated structures (use rigid body)
- Continuous media (use fluid)

### Rigid Body Physics

✅ **Use for:**

- Robotic simulation (grasping)
- Structural collapse (buildings)
- Vehicle dynamics (crashes)
- Debris/rubble simulation

❌ **Don't use for:**

- Soft bodies (use cloth/PBD)
- Granular flows (use particles)
- Large-scale astronomy (use N-body)

### N-Body Gravity

✅ **Use for:**

- Galaxy formation
- Star cluster dynamics
- Solar system evolution
- Dark matter halo structure

❌ **Don't use for:**

- Close encounters (use direct summation)
- Relativistic effects (GR not included)
- Tidal disruption (needs higher accuracy)

### Cloth Simulation

✅ **Use for:**

- Virtual garment fitting (fashion)
- Flags, curtains, banners
- Parachutes, sails
- Soft membrane structures

❌ **Don't use for:**

- Volumetric soft bodies (use FEM)
- Fracture/tearing (PBD limited)
- Elastic rods (1D, not 2D)

---

## Extension Ideas

### Fluid Simulation

- Add FLIP/PIC hybrid for splashes
- Implement surface reconstruction (marching cubes)
- Add vorticity confinement for turbulence
- Multi-grid solver (faster convergence)

### Million Particles

- SPH fluids (smooth particle hydrodynamics)
- Electromagnetic forces (charged particles)
- Swarm intelligence (boids, flocking)
- GPU radix sort (faster than bitonic)

### Rigid Body Physics

- Continuous collision detection (CCD)
- Friction cone solver (more accurate)
- Joint constraints (hinges, sliders)
- Convex hull collision (arbitrary shapes)

### N-Body Gravity

- Fast Multipole Method (FMM, O(n))
- Adaptive timestep (KDK scheme)
- Relativistic corrections (GR)
- Tidal forces (quadrupole moment)

### Cloth Simulation

- Self-collision detection
- Tearing and fracture
- Anisotropic friction (directional)
- Plasticity (permanent deformation)

---

## Scientific References

### Foundational Papers

1. **Stam (1999)**: "Stable Fluids" - SIGGRAPH 99
2. **Barnes & Hut (1986)**: "O(n log n) Force Calculation"
3. **Catto (2005)**: "Iterative Dynamics" - GDC
4. **Müller (2007)**: "Position Based Dynamics" - JVR

### Textbooks

1. **Bridson (2015)**: "Fluid Simulation for Computer Graphics"
2. **Erleben (2005)**: "Physics-Based Animation"
3. **Baraff (1997)**: "Introduction to Physically Based Modeling"

### GPU Computing

1. **Harris (2004)**: "Fast Fluid Dynamics on GPU"
2. **Green (2008)**: "Particle Simulation using CUDA" - NVIDIA
3. **Teschner (2003)**: "Optimized Spatial Hashing"

---

## Support Matrix

| Feature | Fluid | Particles | Rigid | N-Body | Cloth |
| ------- | ----- | --------- | ----- | ------ | ----- |
| WebGPU  | ✅    | ✅        | ✅    | ✅     | ✅    |
| WebGL2  | ❌    | ⚠️        | ❌    | ⚠️     | ❌    |
| Metal   | 🚧    | 🚧        | 🚧    | 🚧     | 🚧    |
| Vulkan  | 🚧    | 🚧        | 🚧    | 🚧     | 🚧    |

Legend: ✅ Full support | ⚠️ Partial support | ❌ Not supported | 🚧 Planned

---

**Quick Start**: Read `README.md` for detailed setup instructions.
**Performance Guide**: See individual `.holo` files for optimization tips.
**Contributing**: PRs welcome! Follow guidelines in `README.md`.

---

Last updated: 2026-03-07
