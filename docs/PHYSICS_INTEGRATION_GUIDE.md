# Physics Integration Guide

Complete guide to integrating HoloScript's physics systems for realistic simulations.

## Overview

HoloScript provides four advanced physics systems that can work together:

1. **Voronoi Fracture** - Realistic destruction with procedural fracture patterns
2. **Granular Materials** - Sand, gravel, debris using DEM physics
3. **Fluid Simulation** - SPH-based fluid dynamics
4. **Advanced Cloth** - PBD cloth simulation with tearing

## Cross-System Integrations

### 1. Destruction → Granular

Convert destroyed fragments into granular particles for realistic debris piles.

**Use Cases:**
- Building collapse → debris pile
- Wall destruction → falling rubble
- Explosive demolition → scattered fragments

**Example:**

```typescript
import { VoronoiFractureSystem } from '@holoscript/core/traits/VoronoiFractureTrait';
import { GranularMaterialSystem } from '@holoscript/core/traits/GranularMaterialTrait';
import { PhysicsIntegrationManager } from '@holoscript/core/integrations/PhysicsIntegration';

// Create systems
const fracture = new VoronoiFractureSystem({ voronoiSites: 50 });
const granular = new GranularMaterialSystem();

// Create integration manager
const integration = new PhysicsIntegrationManager({
  enableDestructionToGranular: true,
  particleSizeScale: 1.0,
  particleDensity: 2400, // Concrete
});

// Generate fracture pattern
fracture.generateVoronoiFracture();

// Apply damage
fracture.applyDamage({
  position: { x: 0, y: 2, z: 0 },
  radius: 1.5,
  maxDamage: 150,
  falloff: 2.0,
});

// Simulation loop
function update(dt: number) {
  // 1. Propagate cracks
  fracture.propagateCracks(dt);

  // 2. Convert destroyed fragments to particles
  integration.destructionToGranular.convertDestroyedFragments(
    fracture,
    granular,
    true // recycle fragments
  );

  // 3. Simulate particle physics
  granular.step(dt);
}
```

### 2. Granular → Destruction

Apply stress from particle piles to structures below.

**Use Cases:**
- Weight of debris causing structural collapse
- Sand pile stress on floor/foundation
- Avalanche pressure on barriers

**Example:**

```typescript
const integration = new PhysicsIntegrationManager();

// Add particles above structure
for (let i = 0; i < 100; i++) {
  granular.addParticle({ x: 0, y: 1 + i * 0.1, z: 0 }, 0.05);
}

// Apply pile stress to structure
integration.granularToDestruction.applyPileStress(
  granular,
  fracture,
  1.0 // stress multiplier
);
```

### 3. Fluid ↔ Granular

Simulate fluid interaction with particles (wet sand, erosion).

**Use Cases:**
- Water washing away sand
- Wet sand with increased cohesion
- Mudslides and erosion
- Underwater particles (buoyancy)

**Example:**

```typescript
import { FluidSimulationSystem } from '@holoscript/core/traits/FluidSimulationTrait';

const fluid = new FluidSimulationSystem();
const integration = new PhysicsIntegrationManager();

// Add water particles
for (let i = 0; i < 1000; i++) {
  fluid.addParticle({ x: Math.random(), y: 2, z: Math.random() });
}

// In update loop
function update(dt: number) {
  // Apply buoyancy and drag forces
  integration.fluidGranular.applyFluidForces(fluid, granular, 0.5);

  // Increase cohesion in wet areas (simulates wet sand)
  integration.fluidGranular.applyWetness(fluid, granular, 2.0);

  fluid.step(dt);
  granular.step(dt);
}
```

### 4. Cloth ↔ Fluid

Simulate wet cloth behavior.

**Use Cases:**
- Cloth getting wet and heavy
- Flag in rain
- Underwater fabric movement
- Soaked curtains/sails

**Example:**

```typescript
import { AdvancedClothSystem } from '@holoscript/core/traits/AdvancedClothTrait';

const cloth = new AdvancedClothSystem();
const integration = new PhysicsIntegrationManager();

// Create cloth mesh
cloth.createRectangularMesh(2, 2, 10, 10);

// In update loop
function update(dt: number) {
  // Apply drag from fluid
  integration.clothFluid.applyFluidDrag(cloth, fluid, 1.0);

  // Make cloth heavier when wet
  integration.clothFluid.applyWetWeight(cloth, fluid, 2.0);

  cloth.step(dt);
  fluid.step(dt);
}
```

## PhysicsIntegrationManager API

### Constructor

```typescript
const manager = new PhysicsIntegrationManager({
  enableDestructionToGranular?: boolean;  // Default: true
  minFragmentSize?: number;                // Default: 0.01
  particleSizeScale?: number;              // Default: 1.0
  particleDensity?: number;                // Default: 2400
});
```

### Unified Update

Call all active integrations at once:

```typescript
manager.update({
  fracture,    // Optional: VoronoiFractureSystem
  granular,    // Optional: GranularMaterialSystem
  fluid,       // Optional: FluidSimulationSystem
  cloth,       // Optional: AdvancedClothSystem
});
```

### Individual Integrations

Access individual integration handlers:

```typescript
// Destruction → Granular
manager.destructionToGranular.convertDestroyedFragments(fracture, granular);
manager.destructionToGranular.convertWithVelocity(fracture, granular, center, strength);

// Granular → Destruction
manager.granularToDestruction.applyPileStress(granular, fracture, multiplier);

// Fluid ↔ Granular
manager.fluidGranular.applyFluidForces(fluid, granular, dragCoef);
manager.fluidGranular.applyWetness(fluid, granular, cohesionMultiplier);

// Cloth ↔ Fluid
manager.clothFluid.applyFluidDrag(cloth, fluid, dragCoef);
manager.clothFluid.applyWetWeight(cloth, fluid, weightMultiplier);
```

## Complete Demo Scene

See [`samples/physics-integration-demo.holo`](../samples/physics-integration-demo.holo) for a complete wrecking ball demolition demo.

**Demo features:**
- Wrecking ball destroys brick wall (Voronoi fracture)
- Destroyed fragments convert to granular particles
- Particles settle into realistic debris pile
- Dust particle effects on impact
- Dynamic camera following the action
- LOD management for performance

**Run the demo:**

```bash
# TypeScript version
tsx samples/physics-integration-demo.ts

# Or parse and export the .holo file
holoscript compile samples/physics-integration-demo.holo --target unity
```

## Performance Considerations

### Fragment Count

- **Low detail**: 10-20 fragments (mobile/web)
- **Medium detail**: 30-50 fragments (desktop)
- **High detail**: 100+ fragments (high-end/offline)

### Particle Count

- **DEM particles**: 100-1000 (real-time), 1000-10000 (with GPU)
- **Fluid particles**: 500-5000 (real-time), 10000+ (with GPU)

### Optimization Tips

1. **Use LOD** for distant fragments:
   ```typescript
   fracture.updateLOD();  // Call every frame
   ```

2. **Enable pooling** to reuse fragments:
   ```typescript
   { enablePooling: true, maxPooledFragments: 100 }
   ```

3. **Sleep inactive particles**:
   ```typescript
   // Automatically handled by granular system
   { sleepVelocityThreshold: 0.1 }
   ```

4. **Spatial hashing** for fast collision detection:
   ```typescript
   { spatialHashCellSize: 0.1 }  // Tune based on particle size
   ```

5. **Limit conversion rate**:
   ```typescript
   // Convert only X fragments per frame
   const stats = manager.destructionToGranular.convertDestroyedFragments(
     fracture,
     granular,
     true
   );

   if (stats.fragmentsConverted > 10) {
     // Pause conversion for this frame
   }
   ```

## Export to Game Engines

### Unity

```bash
holoscript compile demo.holo --target unity
```

Exports:
- `WallFragment.cs` - Fragment behavior
- `DebrisParticle.cs` - Granular particle
- `DemoScene.unity` - Complete scene setup

### Unreal

```bash
holoscript compile demo.holo --target unreal
```

Exports:
- `WallFragment.h/cpp` - Fragment actor
- `DebrisParticle.h/cpp` - Niagara particle
- `DemoLevel.umap` - Level blueprint

### Godot

```bash
holoscript compile demo.holo --target godot
```

Exports:
- `wall_fragment.gd` - Fragment script
- `debris_particle.gd` - Particle script
- `demo_scene.tscn` - Scene file

## Troubleshooting

### Particles fall through ground

**Solution:** Ensure rigid body plane is added before particles:

```typescript
granular.addRigidBodyPlane({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
```

### Fragments not converting

**Problem:** Fragment size too small or pooling disabled.

**Solution:** Check `minFragmentSize` and `enablePooling`:

```typescript
manager.destructionToGranular.updateConfig({
  minFragmentSize: 0.001,  // Lower threshold
  enableDestructionToGranular: true,
});
```

### Performance issues

**Problem:** Too many particles or fragments.

**Solutions:**
1. Reduce fragment count
2. Enable LOD and pooling
3. Increase `minFragmentSize` to skip small fragments
4. Use GPU acceleration (future feature)

## Advanced Topics

### Custom Material Properties

```typescript
// Concrete
const concrete = {
  youngsModulus: 30e9,
  density: 2400,
  cohesion: 50,
};

// Sand
const sand = {
  youngsModulus: 1e6,
  density: 1600,
  cohesion: 0,  // Dry sand
};

// Wet mud
const mud = {
  youngsModulus: 0.5e6,
  density: 1800,
  cohesion: 200,  // High cohesion
};
```

### Explosive Conversion

For explosive destruction with initial velocity:

```typescript
manager.destructionToGranular.convertWithVelocity(
  fracture,
  granular,
  explosionCenter,
  explosionStrength
);
```

### Statistics Tracking

```typescript
const stats = manager.destructionToGranular.getStats();

console.log(`Fragments converted: ${stats.fragmentsConverted}`);
console.log(`Particles created: ${stats.particlesCreated}`);
console.log(`Total volume: ${stats.totalVolume} m³`);
console.log(`Avg particle size: ${stats.averageParticleSize * 100} cm`);

// Reset stats
manager.destructionToGranular.resetStats();
```

## Next Steps

- **GPU Acceleration**: Implement WGSL compute shaders for 100k+ particles
- **Advanced Voronoi**: Use Fortune's algorithm for true 3D Voronoi cells
- **Fluid-Destruction**: Water damage causing structural failure
- **Cloth-Destruction**: Torn cloth fragments as granular particles
- **Multiplayer Sync**: Network replication of physics state

## Resources

- [Voronoi Fracture Documentation](../packages/core/src/traits/VoronoiFractureTrait.ts)
- [Granular Materials Documentation](../packages/core/src/traits/GranularMaterialTrait.ts)
- [Fluid Simulation Documentation](../packages/core/src/traits/FluidSimulationTrait.ts)
- [Advanced Cloth Documentation](../packages/core/src/traits/AdvancedClothTrait.ts)
- [Sprint CLXXXII Report](../SPRINT_CLXXXII_COMPLETE.md)
