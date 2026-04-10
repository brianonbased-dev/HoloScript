# Week 6: Avalanche Simulation - Implementation Plan

**Date**: February 20, 2026
**Status**: 🚧 Planning Phase
**Goal**: Create spectacular avalanche demonstration with 100K+ snow particles

---

## 🎯 Core Objectives

### Must-Have Features

1. ✅ **Terrain System** (heightmap-based)
   - Procedural mountain generation
   - Slope angle calculation
   - Surface normal computation
   - Snow accumulation tracking

2. ✅ **Snow Particle System** (100K particles)
   - GPU-accelerated physics
   - Particle state management (resting, sliding, airborne)
   - Mass and momentum tracking
   - Temperature simulation (optional)

3. ✅ **Avalanche Physics**
   - Slope stability calculation
   - Trigger mechanics (weight threshold, slope angle)
   - Snow entrainment (snowball effect)
   - Momentum transfer
   - Settling behavior

4. ✅ **Visual Effects**
   - Snow dust clouds
   - Particle trails
   - Terrain deformation visualization
   - Camera tracking (follow avalanche)

5. ✅ **Interactive Controls**
   - Trigger avalanche manually
   - Adjust snow accumulation
   - Camera modes (overview, follow, first-person)
   - Playback controls (pause, slow-mo, reset)

---

## 📐 Architecture Design

### Component Hierarchy

```
AvalancheDemoScene (main orchestrator)
    ├── TerrainGenerator (CPU)
    │   ├── Heightmap generation
    │   ├── Slope analysis
    │   └── Surface normals
    │
    ├── SnowAccumulation (CPU)
    │   ├── Deposition simulation
    │   ├── Stability analysis
    │   └── Trigger detection
    │
    ├── AvalanchePhysics (CPU-GPU hybrid)
    │   ├── State transitions (resting → sliding → airborne)
    │   ├── Entrainment calculation
    │   ├── Momentum transfer
    │   └── GPU particle sync
    │
    ├── GPUPhysicsPipeline (GPU) [reuse from Week 5]
    │   ├── Particle motion
    │   ├── Collision detection
    │   └── Spatial grid
    │
    ├── CameraController (CPU) [enhanced from Week 5]
    │   ├── Follow mode (track avalanche center)
    │   ├── Smooth transitions
    │   └── Dynamic FOV
    │
    └── UI Controls (CPU)
        ├── Trigger button
        ├── Accumulation slider
        └── Stats display
```

### Data Flow

```
1. Terrain Generation (startup)
   TerrainGenerator → heightmap data → GPU buffer

2. Snow Accumulation (pre-avalanche)
   SnowAccumulation → particle placement → GPU upload

3. Avalanche Trigger
   User action → Stability analysis → Mark unstable particles

4. Physics Simulation (per frame)
   AvalanchePhysics (CPU):
     - Analyze particle states
     - Calculate entrainment
     - Update particle properties
     ↓
   GPUPhysicsPipeline (GPU):
     - Apply forces (gravity, friction, drag)
     - Terrain collision
     - Particle-particle collision
     ↓
   Read back data:
     - Particle positions
     - Active particle count
     ↓
   CameraController:
     - Track avalanche center of mass
     - Adjust FOV dynamically

5. Rendering
   InstancedRenderer → Draw 100K particles
```

---

## 🏔️ Component Design

### 1. TerrainGenerator.ts (~500 lines)

**Purpose**: Generate procedural mountain terrain with realistic slope profiles

**Key Features**:

- Perlin noise-based heightmap
- Configurable mountain parameters (height, steepness, roughness)
- Slope angle calculation (critical for avalanche trigger)
- Surface normal computation
- Mesh generation for rendering

**Configuration**:

```typescript
interface TerrainConfig {
  width: number; // 200m
  depth: number; // 200m
  resolution: number; // 128×128 heightmap
  maxHeight: number; // 50m peak
  steepness: number; // 0-1 (controls slope angles)
  roughness: number; // 0-1 (noise detail)
  seed?: number; // Random seed
}
```

**Key Algorithms**:

```typescript
// Multi-octave Perlin noise for realistic terrain
height = 0;
amplitude = maxHeight;
frequency = 1.0;
for (octave = 0 to 4) {
  height += perlin(x * frequency, z * frequency, seed) * amplitude;
  amplitude *= 0.5;   // Diminishing contribution
  frequency *= 2.0;   // Increasing detail
}

// Slope angle calculation
dx = height(x+1, z) - height(x-1, z);
dz = height(x, z+1) - height(x, z-1);
slope = atan2(sqrt(dx² + dz²), 2); // radians

// Surface normal
normal = normalize([-dx, 2, -dz]);
```

**Output**:

```typescript
interface TerrainData {
  heightmap: Float32Array; // resolution × resolution heights
  slopes: Float32Array; // slope angle per cell (radians)
  normals: Float32Array; // 3× normal per cell
  vertices: Float32Array; // Mesh vertices for rendering
  indices: Uint32Array; // Mesh triangulation
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
}
```

---

### 2. SnowAccumulation.ts (~400 lines)

**Purpose**: Simulate snow deposition and stability analysis

**Key Features**:

- Place snow particles on terrain surface
- Track snow depth per terrain cell
- Calculate slope stability (angle of repose)
- Identify trigger zones (unstable areas)
- Update accumulation over time

**Configuration**:

```typescript
interface SnowConfig {
  particleCount: number; // 100,000
  particleMass: number; // 0.1 kg
  angleOfRepose: number; // 35° (critical slope angle)
  cohesion: number; // 0-1 (snow stickiness)
  settlementRate: number; // particles/second
  densityFactor: number; // kg/m³
}
```

**Key Concepts**:

```typescript
// Slope stability (simplified Mohr-Coulomb)
slopeAngle = terrain.getSlope(x, z);
snowDepth = snowLayer.getDepth(x, z);
weight = snowDepth * density * gravity;

// Stability factor
stabilityFactor = cohesion - (tan(slopeAngle) * weight);
isStable = stabilityFactor > 0;

// Critical threshold for avalanche trigger
if (slopeAngle > angleOfRepose && snowDepth > minDepth) {
  → UNSTABLE (ready to slide)
}
```

**State Tracking**:

```typescript
interface SnowParticle {
  id: number;
  position: [number, number, number];
  velocity: [number, number, number];
  mass: number;
  state: 'resting' | 'sliding' | 'airborne';
  terrainCell: [number, number]; // Which heightmap cell
  age: number; // Time since deposition
  temperature: number; // Optional: affects cohesion
}
```

---

### 3. AvalanchePhysics.ts (~600 lines)

**Purpose**: Core avalanche simulation logic and particle state management

**Key Features**:

- Trigger avalanche (mark unstable particles)
- State transitions (resting → sliding → airborne)
- Entrainment simulation (snowball effect)
- Momentum transfer
- Friction and drag forces
- Terrain collision response
- Settling detection

**Configuration**:

```typescript
interface AvalancheConfig {
  gravity: number; // 9.8 m/s²
  frictionCoefficient: number; // 0.1-0.3 (snow on snow)
  dragCoefficient: number; // 0.5-1.0 (air resistance)
  entrainmentRadius: number; // 2.0m (pickup radius)
  entrainmentThreshold: number; // Min velocity to entrain
  restitution: number; // 0.3 (bounce factor)
  settlingVelocity: number; // 0.5 m/s (stop threshold)
}
```

**Key Algorithms**:

```typescript
// Avalanche trigger (convert resting → sliding)
function triggerAvalanche(epicenter: [x, z], radius: number) {
  for (particle of snowParticles) {
    distance = length(particle.position.xz - epicenter);
    if (distance < radius && particle.state === 'resting') {
      slope = terrain.getSlope(particle.terrainCell);
      if (slope > angleOfRepose) {
        particle.state = 'sliding';
        particle.velocity = downslope * initialVelocity;
      }
    }
  }
}

// Entrainment (snowball effect)
function updateEntrainment(dt: number) {
  for (sliding of getSlidingParticles()) {
    nearbyResting = findNearbyResting(sliding.position, entrainmentRadius);

    for (resting of nearbyResting) {
      if (sliding.velocity.length > entrainmentThreshold) {
        // Transfer momentum
        resting.state = 'sliding';
        resting.velocity = sliding.velocity * 0.5;

        // Conservation of momentum
        sliding.velocity *= 0.9;
      }
    }
  }
}

// State-based physics update
function updateParticle(particle: SnowParticle, dt: number) {
  switch (particle.state) {
    case 'resting':
      // No motion, just stability check
      checkStability(particle);
      break;

    case 'sliding':
      // Terrain-following motion
      downslope = -terrain.getNormal(particle.terrainCell);
      friction = -particle.velocity.normalized * frictionCoeff * gravity;

      acceleration = gravity * downslope + friction;
      particle.velocity += acceleration * dt;
      particle.position += particle.velocity * dt;

      // Terrain collision
      terrainHeight = terrain.getHeight(particle.position.xz);
      if (particle.position.y < terrainHeight) {
        particle.position.y = terrainHeight;

        // Check if still on terrain or airborne
        if (particle.velocity.y > 2.0) {
          particle.state = 'airborne';
        }
      }

      // Settling detection
      if (particle.velocity.length < settlingVelocity) {
        particle.state = 'resting';
        particle.velocity = [0, 0, 0];
      }
      break;

    case 'airborne':
      // Free-fall with drag
      drag = -particle.velocity * dragCoeff;
      acceleration = [0, -gravity, 0] + drag;

      particle.velocity += acceleration * dt;
      particle.position += particle.velocity * dt;

      // Terrain collision with bounce
      terrainHeight = terrain.getHeight(particle.position.xz);
      if (particle.position.y <= terrainHeight) {
        particle.position.y = terrainHeight;
        particle.velocity.y *= -restitution;

        // Transition back to sliding
        if (abs(particle.velocity.y) < 1.0) {
          particle.state = 'sliding';
        }
      }
      break;
  }
}
```

---

### 4. AvalancheSimulation.ts (~350 lines)

**Purpose**: CPU-GPU integration layer (similar to EarthquakeSimulation)

**Key Features**:

- Upload terrain to GPU
- Sync snow particles to GPU
- Bridge AvalanchePhysics with GPUPhysicsPipeline
- Performance monitoring

**Data Sync**:

```typescript
async syncToGPU(): Promise<void> {
  // Upload terrain heightmap (once at startup)
  if (!this.terrainUploaded) {
    await this.uploadTerrainToGPU(this.terrain);
    this.terrainUploaded = true;
  }

  // Upload active snow particles
  const activeParticles = this.physics.getActiveParticles();
  await this.uploadParticlesToGPU(activeParticles);
}

async update(dt: number): Promise<void> {
  // CPU physics (state management, entrainment)
  this.physics.update(dt);

  // Sync to GPU
  await this.syncToGPU();

  // GPU physics (motion, collision)
  await this.gpuPipeline.step({
    deltaTime: dt,
    gravity: 9.8,
    terrainCollision: true,
  });

  // Read back (for camera tracking and stats)
  const data = await this.gpuPipeline.readData();
  this.physics.updateFromGPU(data);
}
```

---

### 5. AvalancheDemoScene.ts (~450 lines)

**Purpose**: Main demo orchestrator with UI and interaction

**Key Features**:

- Initialize terrain and snow
- Trigger avalanche on user action
- Camera tracking (follow avalanche center)
- Stats display (active particles, velocity, coverage)
- Keyboard shortcuts
- Animation loop

**UI Controls**:

```typescript
- Trigger Avalanche button
- Snow Amount slider (10K - 200K particles)
- Friction slider (affects flow speed)
- Camera modes: Overview, Follow, First-Person, Free
- Playback: Pause, Slow-Mo (0.25×), Reset
- Debug: Show slopes, Show stability, Show velocities
```

**Stats Display**:

```typescript
interface AvalancheStats {
  totalParticles: number;
  restingParticles: number;
  slidingParticles: number;
  airborneParticles: number;
  averageVelocity: number;
  maxVelocity: number;
  coverageArea: number; // m² of terrain covered
  avalancheDuration: number; // seconds since trigger
  fps: number;
}
```

---

## 🎨 Visual Enhancements

### Snow Particle Rendering

- **Resting particles**: White spheres, small size (0.1m)
- **Sliding particles**: Light blue, medium size (0.15m), motion blur
- **Airborne particles**: White/transparent, varied sizes (0.1-0.3m)

### Dust Cloud Effect

```typescript
// Spawn dust particles when snow is moving fast
if (particle.state === 'sliding' && particle.velocity.length > 5.0) {
  spawnDustParticle({
    position: particle.position,
    velocity: particle.velocity * 0.2 + randomOffset,
    size: 0.5,
    opacity: 0.3,
    lifetime: 2.0,
  });
}
```

### Camera Follow Mode

```typescript
// Calculate avalanche center of mass
centerOfMass = average(slidingParticles.map(p => p.position));

// Smooth camera tracking
targetPosition = centerOfMass + offset;
camera.position = lerp(camera.position, targetPosition, 0.1);
camera.lookAt(centerOfMass);

// Dynamic FOV (zoom in when avalanche accelerates)
avgVelocity = average(slidingParticles.map(p => p.velocity.length));
targetFOV = baseFOV + (avgVelocity / maxVelocity) * 15°;
camera.fov = lerp(camera.fov, targetFOV, 0.05);
```

---

## 📊 Performance Targets

### Must Meet

- **100K particles @ 60 FPS** (16.67ms frame budget)
  - CPU physics: < 5ms
  - GPU physics: < 8ms
  - Rendering: < 3ms

- **Memory**: < 200MB for 100K particles

- **Scalability**: Support 10K - 200K particles

### Stretch Goals

- **200K particles @ 30 FPS**
- **Real-time snow accumulation** (settling particles)
- **Multiple simultaneous avalanches**

---

## 🧪 Testing Strategy

### Unit Tests

1. **TerrainGenerator.test.ts** (~300 lines)
   - Heightmap generation
   - Slope calculation accuracy
   - Surface normal computation
   - Edge cases (flat terrain, vertical cliffs)

2. **SnowAccumulation.test.ts** (~400 lines)
   - Particle placement on terrain
   - Stability analysis
   - Snow depth tracking
   - Trigger zone identification

3. **AvalanchePhysics.test.ts** (~500 lines)
   - State transitions
   - Entrainment mechanics
   - Friction and drag forces
   - Terrain collision
   - Settling detection

4. **AvalancheSimulation.test.ts** (~200 lines)
   - CPU-GPU sync
   - Data upload/download
   - Integration with GPU pipeline

### Performance Tests

5. **performance.test.ts** (~400 lines)
   - 100K particles @ 60 FPS
   - Memory usage validation
   - Scalability (10K to 200K)
   - No memory leaks

**Total**: ~1,800 lines of tests, 100+ test cases

---

## 📅 Implementation Schedule

### Day 1: Terrain Foundation (4-6 hours)

- [ ] Create TerrainGenerator.ts
- [ ] Implement Perlin noise heightmap
- [ ] Calculate slopes and normals
- [ ] Write TerrainGenerator.test.ts
- [ ] Verify terrain rendering

### Day 2: Snow Accumulation (4-6 hours)

- [ ] Create SnowAccumulation.ts
- [ ] Implement particle placement
- [ ] Stability analysis
- [ ] Write SnowAccumulation.test.ts
- [ ] Visualize snow layer

### Day 3: Avalanche Physics (6-8 hours)

- [ ] Create AvalanchePhysics.ts
- [ ] Implement state machine
- [ ] Entrainment algorithm
- [ ] Terrain collision
- [ ] Write AvalanchePhysics.test.ts

### Day 4: GPU Integration (4-6 hours)

- [ ] Create AvalancheSimulation.ts
- [ ] CPU-GPU sync
- [ ] Integrate with GPUPhysicsPipeline
- [ ] Write AvalancheSimulation.test.ts
- [ ] Optimize data transfer

### Day 5: Demo Scene & Polish (6-8 hours)

- [ ] Create AvalancheDemoScene.ts
- [ ] UI controls
- [ ] Camera tracking
- [ ] Stats display
- [ ] Keyboard shortcuts
- [ ] Visual effects (dust clouds)
- [ ] Write performance.test.ts

### Day 6: Testing & Optimization (4-6 hours)

- [ ] Run all tests, fix failures
- [ ] Performance profiling
- [ ] Memory optimization
- [ ] Edge case testing
- [ ] Documentation

### Day 7: Documentation & Polish (2-4 hours)

- [ ] Create WEEK_6_COMPLETE.md
- [ ] Create USAGE_GUIDE.md
- [ ] Create VISUAL_QUALITY_CHECKLIST.md
- [ ] Record demo video
- [ ] Final QA

**Total Estimate**: 28-44 hours (1 week @ 4-6 hours/day)

---

## 🎯 Success Criteria

### Must Have ✅

- [ ] 100K particles running @ 60 FPS
- [ ] Realistic avalanche trigger and flow
- [ ] Terrain collision working correctly
- [ ] Entrainment effect visible (snowball growth)
- [ ] Camera follow mode tracking avalanche
- [ ] All unit tests passing (100+ tests)
- [ ] Performance tests passing
- [ ] No memory leaks

### Nice to Have 🎨

- [ ] Dust cloud particles
- [ ] Particle trails (motion blur effect)
- [ ] Dynamic LOD (reduce particles in distance)
- [ ] Sound effects (rumble, snow sliding)
- [ ] Temperature simulation affecting cohesion
- [ ] Multiple avalanche trigger points

### Stretch Goals 🚀

- [ ] 200K particles @ 30 FPS
- [ ] Real-time snow accumulation (continuous settling)
- [ ] Terrain deformation (snow carved paths)
- [ ] Particle variety (powder, wet, ice chunks)

---

## 🔄 Lessons from Week 5

### What to Reuse

- ✅ GPUPhysicsPipeline (proven particle physics)
- ✅ SpatialGrid (collision detection)
- ✅ InstancedRenderer (efficient rendering)
- ✅ CameraController (camera effects)
- ✅ Testing patterns (beforeEach, toBeCloseTo, mock objects)

### What to Improve

- Better GPU-CPU sync (reduce readback frequency)
- More efficient particle state management
- Progressive LOD for distant particles
- Batched particle updates (don't update resting particles)

### New Challenges

- Terrain heightmap storage and access on GPU
- State machine for 3 particle states
- Entrainment algorithm efficiency (spatial queries)
- Camera tracking moving target (center of mass calculation)

---

**∞ | WEEK_6 | AVALANCHE | PLANNING_COMPLETE | READY_TO_BUILD | ∞**
