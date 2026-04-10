# Earthquake Demo - Usage Guide

**Complete guide for integrating and using the earthquake building collapse demonstration**

---

## 🚀 Quick Start

### Installation

```bash
# Install HoloScript core package
npm install @holoscript/core

# Or with pnpm
pnpm add @holoscript/core
```

### Basic Usage

```typescript
import {
  ProceduralBuilding,
  FracturePhysics,
  EarthquakeSimulation,
  CameraController,
  EarthquakeDemoScene,
} from '@holoscript/core/demos/earthquake';

// 1. Create canvas
const canvas = document.getElementById('canvas') as HTMLCanvasElement;

// 2. Initialize WebGPU context (from core GPU module)
import { createWebGPUContext } from '@holoscript/core/gpu';
const context = await createWebGPUContext(canvas);

// 3. Create simulation
import { createEarthquakeSimulation } from '@holoscript/core/demos/earthquake';
const simulation = await createEarthquakeSimulation(context, {
  floors: 5,
  floorHeight: 3.0,
  width: 20,
  depth: 20,
});

// 4. Create demo scene with UI
const container = document.getElementById('demo-container')!;
const demoScene = new EarthquakeDemoScene(context, simulation, canvas);
demoScene.setupUI(container);

// 5. Start demo
demoScene.start();

// 6. Handle keyboard
window.addEventListener('keydown', (e) => demoScene.handleKeyboard(e));
```

---

## 📦 Component Overview

### Core Components

```
┌─────────────────────────────────────────────┐
│          EarthquakeDemoScene                │
│  (Interactive UI + Animation Loop)          │
└──────────────┬──────────────────────────────┘
               │
    ┌──────────┴──────────┐
    │                     │
┌───▼──────────────┐  ┌──▼────────────────┐
│ CameraController │  │ EarthquakeSimulation│
│  (Camera Effects)│  │  (GPU Integration)  │
└──────────────────┘  └──┬──────────────────┘
                         │
              ┌──────────┴──────────┐
              │                     │
      ┌───────▼────────┐    ┌──────▼────────┐
      │ProceduralBuilding│    │FracturePhysics │
      │ (Generation)   │    │  (Simulation)  │
      └────────────────┘    └────────────────┘
```

---

## 🏗️ ProceduralBuilding

### Purpose

Generates multi-story buildings with structural elements.

### Basic Usage

```typescript
import { ProceduralBuilding, type BuildingConfig } from '@holoscript/core/demos/earthquake';

const builder = new ProceduralBuilding();

const config: BuildingConfig = {
  floors: 7, // 5-10 floors
  floorHeight: 3.0, // meters
  width: 20, // meters
  depth: 20, // meters
  columnsPerSide: 4, // 4×4 = 16 columns per floor
  beamsPerFloor: 12, // horizontal beams
};

const building = builder.generateStructure(config);
```

### Output Structure

```typescript
interface BuildingStructure {
  elements: StructuralElement[]; // All structural elements
  weakPoints: WeakPoint[]; // Failure points
  config: BuildingConfig; // Original config
  totalMass: number; // kg
  centerOfMass: [number, number, number];
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
}
```

### Accessing Elements

```typescript
// Get specific element
const element = builder.getElementById(building, elementId);

// Get connected elements
const connected = builder.getConnectedElements(building, elementId);

// Get statistics
const stats = builder.getStatistics(building);
console.log(stats.columns); // Number of columns
console.log(stats.beams); // Number of beams
console.log(stats.floors); // Number of floors
console.log(stats.totalMass); // Total mass (kg)
console.log(stats.averageHealth); // 0-100%
```

### Structural Elements

```typescript
interface StructuralElement {
  id: number;
  type: 'column' | 'beam' | 'floor' | 'foundation';
  position: [number, number, number]; // Center position
  dimensions: [number, number, number]; // [width, height, depth]
  material: 'concrete' | 'steel' | 'composite';
  health: number; // 0-100%
  connections: number[]; // Connected element IDs
  mass: number; // kg
  loadCapacity: number; // N
  stress: number; // 0-100%
  floor: number; // Floor number
}
```

---

## 💥 FracturePhysics

### Purpose

Simulates earthquake forces, structural stress, progressive collapse, and debris.

### Basic Usage

```typescript
import { FracturePhysics, type EarthquakeConfig } from '@holoscript/core/demos/earthquake';

const physics = new FracturePhysics(building);

// Trigger earthquake
const earthquakeConfig: EarthquakeConfig = {
  intensity: 7, // 0-10 (Richter-like)
  duration: 5, // seconds
  frequency: 2.5, // Hz (ground shake)
  epicenter: [0, 0, 0], // [x, y, z]
  verticalComponent: 0.3, // 0-1 (relative to horizontal)
};

physics.triggerEarthquake(earthquakeConfig);

// Update physics (call every frame)
physics.update(deltaTime);

// Get results
const debris = physics.getActiveDebris();
const events = physics.getCollapseEvents();
const failedElements = physics.getFailedElements();
```

### Earthquake Configuration

```typescript
// Low intensity - minor shaking
const lowIntensity: EarthquakeConfig = {
  intensity: 3,
  duration: 3,
  frequency: 1.5,
  epicenter: [0, 0, 0],
  verticalComponent: 0.2,
};

// High intensity - rapid collapse
const highIntensity: EarthquakeConfig = {
  intensity: 9,
  duration: 10,
  frequency: 3.5,
  epicenter: [0, 0, 0],
  verticalComponent: 0.4,
};

// Distant epicenter - attenuated forces
const distantEpicenter: EarthquakeConfig = {
  intensity: 7,
  duration: 5,
  frequency: 2.5,
  epicenter: [100, 0, 100], // Far away
  verticalComponent: 0.3,
};
```

### Debris Particles

```typescript
interface DebrisParticle {
  id: number;
  sourceElementId: number; // Failed element
  position: [number, number, number];
  velocity: [number, number, number];
  angularVelocity: [number, number, number];
  radius: number; // meters
  mass: number; // kg
  material: 'concrete' | 'steel' | 'composite';
  age: number; // seconds
  active: boolean; // Still moving?
}

// Access debris
const allDebris = physics.getAllDebris(); // All particles
const activeDebris = physics.getActiveDebris(); // Still moving
const settledCount = allDebris.length - activeDebris.length;
```

### Collapse Events

```typescript
interface CollapseEvent {
  time: number; // When it happened
  elementId: number; // What failed
  failureMode: 'snap' | 'bend' | 'crush' | 'shear';
  position: [number, number, number]; // Where it failed
  debrisCount: number; // Particles spawned
  cascadeElements: number[]; // Elements failed due to this
}

// Get events
const events = physics.getCollapseEvents();
for (const event of events) {
  console.log(`Element ${event.elementId} failed at ${event.time}s`);
  console.log(`  Mode: ${event.failureMode}`);
  console.log(`  Debris: ${event.debrisCount}`);
  console.log(`  Cascade: ${event.cascadeElements.length} elements`);
}
```

### Statistics

```typescript
const stats = physics.getStatistics();
console.log(stats.failedElements); // Count
console.log(stats.totalElements); // Total
console.log(stats.failureRate); // 0-1
console.log(stats.activeDebris); // Currently moving
console.log(stats.totalDebris); // All spawned
console.log(stats.collapseEvents); // Event count
```

### Reset

```typescript
// Reset simulation
physics.reset();

// Check state
console.log(physics.isEarthquakeActive()); // false
console.log(physics.hasFailures()); // false
```

---

## 🎮 EarthquakeSimulation

### Purpose

Integrates CPU fracture physics with GPU particle system.

### Basic Usage

```typescript
import { createEarthquakeSimulation } from '@holoscript/core/demos/earthquake';

const simulation = await createEarthquakeSimulation(context, {
  floors: 7,
  floorHeight: 3.0,
  width: 20,
  depth: 20,
});

// Update (call every frame)
await simulation.update(deltaTime);

// Render
const camera = cameraController.getCamera();
simulation.render(camera);

// Trigger earthquake
simulation.triggerEarthquake(earthquakeConfig);

// Get state
const state = simulation.getState();
console.log(state.fps); // Current FPS
console.log(state.structuralIntegrity); // 0-100%
console.log(state.activeDebrisCount); // Active particles
console.log(state.totalDebrisCount); // Total particles
console.log(state.collapseEventCount); // Events
console.log(state.earthquakeActive); // boolean
console.log(state.collapseStarted); // boolean
```

### Integration with GPU

```typescript
// The simulation handles:
// 1. Structural elements → GPU particles
// 2. Debris spawning → GPU buffer updates
// 3. Particle lifecycle management
// 4. Performance monitoring

// Access underlying systems
const building = simulation.getBuilding(); // ProceduralBuilding
const physics = simulation.getPhysics(); // FracturePhysics

// Manual control (advanced)
simulation.reset();
simulation.destroy(); // Cleanup
```

---

## 📹 CameraController

### Purpose

Manages camera positioning, shake effects, and smooth transitions.

### Basic Usage

```typescript
import { CameraController, type CameraMode } from '@holoscript/core/demos/earthquake';

const cameraController = new CameraController(canvas);

// Set initial camera
cameraController.transitionToPreset('overview', 0);

// Update (call every frame)
cameraController.update(deltaTime);

// Get camera parameters
const camera = cameraController.getCamera();
// Use camera for rendering
```

### Camera Presets

```typescript
type CameraMode = 'overview' | 'street' | 'topdown' | 'cinematic' | 'free';

// Transition to preset
cameraController.transitionToPreset('overview', 1.5); // 1.5s transition
cameraController.transitionToPreset('street', 0); // Instant

// Get current mode
const mode = cameraController.getCurrentMode(); // 'overview'

// Get preset details
const preset = cameraController.getPreset('cinematic');
console.log(preset.position); // [40, 15, 40]
console.log(preset.target); // [0, 20, 0]
console.log(preset.fov); // radians
```

### Camera Shake

```typescript
import { type CameraShakeConfig } from '@holoscript/core/demos/earthquake';

const shakeConfig: CameraShakeConfig = {
  intensity: 5, // 0-10
  frequency: 2.5, // Hz
  duration: 5, // seconds
  falloff: 'exponential', // 'linear' | 'exponential' | 'none'
  horizontalAmount: 1.0, // 0-1
  verticalAmount: 0.5, // 0-1
};

cameraController.applyEarthquakeShake(shakeConfig);

// Stop shake manually
cameraController.stopShake();
```

### Manual Camera Control

```typescript
// Move camera
cameraController.moveCamera([5, 0, 0]); // +5m on X axis

// Orbit around target
cameraController.orbitCamera(Math.PI / 4, 0); // 45° horizontal rotation

// Zoom (FOV)
cameraController.zoom(-0.1, true); // Zoom in (adjust FOV)

// Zoom (distance)
cameraController.zoom(-5, false); // Move 5m closer

// Pan (move both position and target)
cameraController.panCamera(5, 0); // Pan right 5m

// Set camera directly (no transition)
cameraController.setCamera(
  [30, 20, 30], // position
  [0, 15, 0], // target
  Math.PI / 4 // fov
);
```

---

## 🎨 EarthquakeDemoScene

### Purpose

Complete interactive demo with UI controls and animation loop.

### Full Setup

```typescript
import { EarthquakeDemoScene } from '@holoscript/core/demos/earthquake';

// Create demo scene
const demoScene = new EarthquakeDemoScene(context, simulation, canvas);

// Setup UI in container
const container = document.getElementById('demo-container')!;
demoScene.setupUI(container);

// Start demo
demoScene.start();

// Handle keyboard input
window.addEventListener('keydown', (e) => {
  demoScene.handleKeyboard(e);
});

// Stop demo (cleanup)
demoScene.stop();

// Destroy demo (full cleanup)
demoScene.destroy();
```

### Keyboard Controls

```typescript
// Built-in keyboard shortcuts:
// Space  - Trigger earthquake
// R      - Reset simulation
// S      - Toggle slow motion
// 1      - Overview camera
// 2      - Street level camera
// 3      - Top-down camera
// 4      - Cinematic camera
```

### Custom UI

```typescript
// Instead of using setupUI, create custom controls:

// Trigger earthquake programmatically
simulation.triggerEarthquake({
  intensity: 8,
  duration: 5,
  frequency: 2.5,
  epicenter: [0, 0, 0],
  verticalComponent: 0.3,
});

// Apply camera shake
cameraController.applyEarthquakeShake({
  intensity: 4,
  frequency: 2.5,
  duration: 5,
  falloff: 'exponential',
  horizontalAmount: 1.0,
  verticalAmount: 0.5,
});

// Reset
simulation.reset();
cameraController.stopShake();
```

---

## 🎯 Common Scenarios

### Scenario 1: Simple Earthquake Demo

```typescript
// Minimal setup for quick demo
import { createEarthquakeSimulation, EarthquakeDemoScene } from '@holoscript/core/demos/earthquake';
import { createWebGPUContext } from '@holoscript/core/gpu';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const context = await createWebGPUContext(canvas);
const simulation = await createEarthquakeSimulation(context, { floors: 5 });
const demo = new EarthquakeDemoScene(context, simulation, canvas);

demo.setupUI(document.body);
demo.start();
window.addEventListener('keydown', (e) => demo.handleKeyboard(e));
```

### Scenario 2: Custom Building Configuration

```typescript
// Generate custom building
const simulation = await createEarthquakeSimulation(context, {
  floors: 10, // Tall building
  floorHeight: 3.5, // Taller floors
  width: 30, // Wider
  depth: 30, // Deeper
  columnsPerSide: 6, // More columns (6×6 = 36)
  beamsPerFloor: 20, // More beams
});
```

### Scenario 3: Programmatic Control

```typescript
// No UI, full programmatic control
const simulation = await createEarthquakeSimulation(context, { floors: 7 });
const camera = cameraController.getCamera();

// Animation loop
function animate() {
  const dt = 1 / 60; // 60 FPS

  // Update physics
  simulation.update(dt);

  // Update camera
  cameraController.update(dt);

  // Render
  simulation.render(cameraController.getCamera());

  requestAnimationFrame(animate);
}

// Trigger earthquake programmatically
setTimeout(() => {
  simulation.triggerEarthquake({
    intensity: 7,
    duration: 5,
    frequency: 2.5,
    epicenter: [0, 0, 0],
    verticalComponent: 0.3,
  });
}, 2000); // After 2 seconds

animate();
```

### Scenario 4: Educational Dashboard

```typescript
// Create educational display with stats
const state = simulation.getState();
const physics = simulation.getPhysics();
const stats = physics.getStatistics();

// Update dashboard
function updateDashboard() {
  document.getElementById('fps').textContent = state.fps.toString();
  document.getElementById('integrity').textContent = `${state.structuralIntegrity.toFixed(1)}%`;
  document.getElementById('debris').textContent =
    `${state.activeDebrisCount} / ${state.totalDebrisCount}`;
  document.getElementById('failed').textContent =
    `${stats.failedElements} / ${stats.totalElements}`;
  document.getElementById('events').textContent = stats.collapseEvents.toString();

  // Show collapse events
  const events = physics.getCollapseEvents();
  const eventList = events
    .map(
      (e) =>
        `${e.time.toFixed(1)}s: Element ${e.elementId} (${e.failureMode}) → ${e.debrisCount} debris`
    )
    .join('\n');
  document.getElementById('event-log').textContent = eventList;
}

setInterval(updateDashboard, 100); // Update 10 times per second
```

### Scenario 5: Multiple Earthquakes

```typescript
// Simulate aftershocks
function triggerAfterShocks() {
  // Main earthquake
  simulation.triggerEarthquake({
    intensity: 8,
    duration: 5,
    frequency: 2.5,
    epicenter: [0, 0, 0],
    verticalComponent: 0.3,
  });

  // Aftershock 1 (8 seconds later)
  setTimeout(() => {
    simulation.triggerEarthquake({
      intensity: 5,
      duration: 3,
      frequency: 3.0,
      epicenter: [10, 0, 5],
      verticalComponent: 0.2,
    });
  }, 8000);

  // Aftershock 2 (15 seconds later)
  setTimeout(() => {
    simulation.triggerEarthquake({
      intensity: 4,
      duration: 2,
      frequency: 2.0,
      epicenter: [-5, 0, 10],
      verticalComponent: 0.15,
    });
  }, 15000);
}
```

---

## 🔧 Advanced Usage

### Custom Failure Thresholds

```typescript
const building = builder.generateStructure(config);

// Lower failure thresholds for specific elements
for (const weakPoint of building.weakPoints) {
  const element = building.elements.find((el) => el.id === weakPoint.elementId);

  if (element?.floor === 1) {
    // First floor more vulnerable
    weakPoint.failureThreshold *= 0.8;
  }

  if (element?.type === 'beam') {
    // Beams more vulnerable
    weakPoint.failureThreshold *= 0.7;
  }
}

const physics = new FracturePhysics(building);
```

### Custom Camera Path

```typescript
// Cinematic camera movement
function cinematicFlyby() {
  const keyframes = [
    { position: [50, 2, 0], target: [0, 10, 0], duration: 3 },
    { position: [30, 20, 30], target: [0, 15, 0], duration: 2 },
    { position: [0, 80, 0.1], target: [0, 0, 0], duration: 2 },
    { position: [40, 15, 40], target: [0, 20, 0], duration: 3 },
  ];

  let currentFrame = 0;

  function nextKeyframe() {
    if (currentFrame >= keyframes.length) return;

    const kf = keyframes[currentFrame];
    cameraController.transitionTo(kf.position, kf.target, Math.PI / 4, kf.duration);

    setTimeout(nextKeyframe, kf.duration * 1000);
    currentFrame++;
  }

  nextKeyframe();
}
```

### Custom Debris Processing

```typescript
// Process debris for visualization
function processDebris() {
  const debris = physics.getAllDebris();

  // Group by material
  const concrete = debris.filter((d) => d.material === 'concrete');
  const steel = debris.filter((d) => d.material === 'steel');

  // Find highest particle
  const highest = debris.reduce((max, d) => (d.position[1] > max.position[1] ? d : max), debris[0]);

  // Calculate debris cloud bounds
  const bounds = {
    minX: Math.min(...debris.map((d) => d.position[0])),
    maxX: Math.max(...debris.map((d) => d.position[0])),
    minY: Math.min(...debris.map((d) => d.position[1])),
    maxY: Math.max(...debris.map((d) => d.position[1])),
    minZ: Math.min(...debris.map((d) => d.position[2])),
    maxZ: Math.max(...debris.map((d) => d.position[2])),
  };

  console.log(`Debris cloud: ${bounds.maxX - bounds.minX}m wide`);
  console.log(`Highest particle: ${highest.position[1].toFixed(1)}m`);
}
```

---

## 📊 Performance Optimization

### Recommended Settings

```typescript
// For 60 FPS on most hardware
const config = {
  floors: 5 - 7, // Moderate building size
  columnsPerSide: 4, // 16 columns per floor
  beamsPerFloor: 12, // Moderate beam count
};

const earthquake = {
  intensity: 6 - 8, // Good balance
  duration: 5, // Not too long
};

// Debris is auto-capped at 500 per element
```

### Performance Monitoring

```typescript
// Track performance
const state = simulation.getState();

console.log(`FPS: ${state.fps}`);
console.log(`Active debris: ${state.activeDebrisCount}`);
console.log(`Total debris: ${state.totalDebrisCount}`);

// Inactive debris don't impact performance
const inactiveCount = state.totalDebrisCount - state.activeDebrisCount;
console.log(`Settled debris: ${inactiveCount} (no CPU cost)`);
```

---

## 🐛 Troubleshooting

### WebGPU Not Available

```typescript
try {
  const context = await createWebGPUContext(canvas);
} catch (error) {
  console.error('WebGPU not supported:', error);
  // Fallback to CPU-only mode or show error message
}
```

### Low Frame Rate

```typescript
// Reduce building complexity
const config = {
  floors: 3, // Smaller building
  columnsPerSide: 3, // Fewer columns
  beamsPerFloor: 8, // Fewer beams
};

// Or use lower earthquake intensity
const earthquake = {
  intensity: 5, // Less dramatic = less debris
};
```

### Memory Issues

```typescript
// Clean up after demo
demo.stop();
demo.destroy();

// Or reset simulation periodically
setInterval(() => {
  simulation.reset();
}, 60000); // Reset every minute
```

---

## 📚 API Reference

Full TypeScript definitions available in source files:

- [ProceduralBuilding.ts](c:\Users\josep\Documents\GitHub\HoloScript\packages\core\src\demos\earthquake\ProceduralBuilding.ts)
- [FracturePhysics.ts](c:\Users\josep\Documents\GitHub\HoloScript\packages\core\src\demos\earthquake\FracturePhysics.ts)
- [EarthquakeSimulation.ts](c:\Users\josep\Documents\GitHub\HoloScript\packages\core\src\demos\earthquake\EarthquakeSimulation.ts)
- [CameraEffects.ts](c:\Users\josep\Documents\GitHub\HoloScript\packages\core\src\demos\earthquake\CameraEffects.ts)
- [EarthquakeDemoScene.ts](c:\Users\josep\Documents\GitHub\HoloScript\packages\core\src\demos\earthquake\EarthquakeDemoScene.ts)

---

## 🎉 Next Steps

Ready to build more spectacular demos:

- Week 6: Avalanche Simulation (100K snow particles)
- Week 7: Water Erosion (heightmap terrain)
- Week 8: Explosive Demolition (120K debris)

Happy coding! 🏗️💥
