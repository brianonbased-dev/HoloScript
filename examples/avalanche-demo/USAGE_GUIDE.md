# Avalanche Simulation - Usage Guide

Quick guide for using the HoloScript avalanche simulation components.

---

## 🚀 Quick Start

```typescript
import {
  TerrainGenerator,
  SnowAccumulation,
  AvalanchePhysics,
  AvalancheSimulation,
  AvalancheDemoScene,
} from '@holoscript/core/demos/avalanche';

// 1. Generate terrain
const terrainGen = new TerrainGenerator({
  width: 200,
  depth: 200,
  resolution: 64,
  maxHeight: 50,
  steepness: 0.7,
  roughness: 0.3,
  seed: Date.now(),
});
const terrain = terrainGen.generateTerrain();

// 2. Add snow particles
const snow = new SnowAccumulation(terrain, {
  particleCount: 1000,
  particleMass: 0.1,
  angleOfRepose: 35,
  cohesion: 0.3,
  density: 300,
  minDepthForTrigger: 0.05,
});

// 3. Create physics engine
const physics = new AvalanchePhysics(terrain, snow.getParticles(), {
  gravity: 9.8,
  frictionCoefficient: 0.2,
  dragCoefficient: 0.5,
  entrainmentRadius: 2.0,
  entrainmentThreshold: 3.0,
  restitution: 0.3,
  settlingVelocity: 0.5,
});

// 4. Create simulation
const simulation = new AvalancheSimulation(terrain, physics, {
  useGPU: false,
  maxParticles: 10000,
  enableProfiling: true,
});

// 5. Trigger avalanche
simulation.triggerAvalanche([0, 0], 30);

// 6. Update loop
function gameLoop() {
  const dt = 0.016; // 60 FPS
  simulation.update(dt);

  // Get statistics
  const stats = simulation.getStatistics();
  console.log(`Active particles: ${stats.slidingCount + stats.airborneCount}`);

  // Get performance metrics
  const metrics = simulation.getPerformanceMetrics();
  console.log(`FPS: ${metrics.fps.toFixed(1)}`);

  requestAnimationFrame(gameLoop);
}
gameLoop();
```

---

## 🎬 Interactive Demo Scene

For a complete interactive demo with UI controls:

```typescript
import { AvalancheDemoScene } from '@holoscript/core/demos/avalanche';

// Get canvas element
const canvas = document.getElementById('myCanvas') as HTMLCanvasElement;

// Create demo scene
const demo = new AvalancheDemoScene({
  canvas,
  terrain: {
    width: 200,
    depth: 200,
    resolution: 64,
    maxHeight: 50,
    steepness: 0.7,
    roughness: 0.3,
    seed: 12345,
  },
  snow: {
    particleCount: 1000,
    particleMass: 0.1,
    angleOfRepose: 35,
    cohesion: 0.3,
    density: 300,
    minDepthForTrigger: 0.05,
  },
  physics: {
    gravity: 9.8,
    frictionCoefficient: 0.2,
    dragCoefficient: 0.5,
    entrainmentRadius: 2.0,
    entrainmentThreshold: 3.0,
    restitution: 0.3,
    settlingVelocity: 0.5,
  },
  simulation: {
    useGPU: false,
    maxParticles: 10000,
    enableProfiling: true,
  },
});

// Start animation
demo.start();

// Keyboard controls are automatically enabled:
// Space - Trigger avalanche
// R - Reset
// S - Toggle slow motion
// P - Toggle pause
// D - Toggle debug display
// 1-5 - Switch camera modes

// Cleanup when done
window.addEventListener('beforeunload', () => {
  demo.stop();
  demo.dispose();
});
```

---

## 📐 Component API

### TerrainGenerator

```typescript
const terrainGen = new TerrainGenerator({
  width: 200, // Terrain width in meters
  depth: 200, // Terrain depth in meters
  resolution: 64, // Grid resolution (64×64 = 4096 points)
  maxHeight: 50, // Maximum terrain height in meters
  steepness: 0.7, // Mountain steepness (0=gentle, 1=steep)
  roughness: 0.3, // Noise roughness (0=smooth, 1=rough)
  seed: 12345, // Random seed for reproducibility
});

const terrain = terrainGen.generateTerrain();

// Query terrain height at any point
const height = terrainGen.getHeightAt(x, z);

// Query slope angle at any point
const slope = terrainGen.getSlopeAt(x, z);

// Query surface normal at any point
const normal = terrainGen.getNormalAt(x, z);

// Get mesh data for rendering
const mesh = terrainGen.generateMesh();
console.log(mesh.vertices); // Float32Array
console.log(mesh.normals); // Float32Array
console.log(mesh.indices); // Uint32Array

// Get terrain statistics
const stats = terrainGen.getStatistics();
console.log(`Min height: ${stats.minHeight}`);
console.log(`Max height: ${stats.maxHeight}`);
console.log(`Avg slope: ${stats.avgSlope} rad`);
```

### SnowAccumulation

```typescript
const snow = new SnowAccumulation(terrain, {
  particleCount: 1000, // Number of snow particles
  particleMass: 0.1, // Mass per particle (kg)
  angleOfRepose: 35, // Critical slope angle (degrees)
  cohesion: 0.3, // Snow cohesion factor (0-1)
  density: 300, // Snow density (kg/m³)
  minDepthForTrigger: 0.05, // Min depth for avalanche trigger (m)
});

// Get all particles
const particles = snow.getParticles();

// Find trigger zones
const zones = snow.findTriggerZones();
console.log(`Found ${zones.length} trigger zones`);

// Query snow depth at terrain cell
const depth = snow.getDepthAt(cellX, cellZ);

// Query accumulated mass at terrain cell
const mass = snow.getMassAt(cellX, cellZ);

// Get accumulation statistics
const stats = snow.getStatistics();
console.log(`Total mass: ${stats.totalMass} kg`);
console.log(`Coverage: ${stats.coverage}%`);
```

### AvalanchePhysics

```typescript
const physics = new AvalanchePhysics(terrain, particles, {
  gravity: 9.8, // Gravity (m/s²)
  frictionCoefficient: 0.2, // Friction coefficient
  dragCoefficient: 0.5, // Air drag coefficient
  entrainmentRadius: 2.0, // Entrainment radius (m)
  entrainmentThreshold: 3.0, // Min velocity for entrainment (m/s)
  restitution: 0.3, // Bounce coefficient (0-1)
  settlingVelocity: 0.5, // Velocity threshold for settling (m/s)
});

// Trigger avalanche at epicenter
physics.triggerAvalanche([x, z], radius);

// Update simulation (call every frame)
const dt = 0.016; // 16ms = 60 FPS
physics.update(dt);

// Get particles by state
const resting = physics.getParticlesByState('resting');
const sliding = physics.getParticlesByState('sliding');
const airborne = physics.getParticlesByState('airborne');

// Get simulation statistics
const stats = physics.getStatistics();
console.log(`Resting: ${stats.restingCount}`);
console.log(`Sliding: ${stats.slidingCount}`);
console.log(`Airborne: ${stats.airborneCount}`);
console.log(`Avg velocity: ${stats.avgVelocity} m/s`);
console.log(`Max velocity: ${stats.maxVelocity} m/s`);
console.log(`Collapse events: ${stats.collapseEvents}`);
console.log(`Entrainment events: ${stats.entrainmentCount}`);

// Get simulation events
const events = physics.getEvents();
events.forEach((event) => {
  console.log(`${event.type}: particle ${event.particleId}`);
});

// Reset simulation
physics.reset();
```

### AvalancheSimulation

```typescript
const simulation = new AvalancheSimulation(terrain, physics, {
  useGPU: false, // Enable GPU acceleration (future)
  maxParticles: 10000, // Maximum particle count
  enableProfiling: true, // Enable performance profiling
});

// Trigger avalanche
simulation.triggerAvalanche([x, z], radius);

// Update simulation (async for GPU support)
await simulation.update(dt);

// Get physics statistics
const stats = simulation.getStatistics();

// Get performance metrics
const metrics = simulation.getPerformanceMetrics();
console.log(`FPS: ${metrics.fps.toFixed(1)}`);
console.log(`CPU physics: ${metrics.cpuPhysicsTime.toFixed(2)} ms`);
console.log(`GPU upload: ${metrics.gpuUploadTime.toFixed(2)} ms`);
console.log(`GPU compute: ${metrics.gpuComputeTime.toFixed(2)} ms`);
console.log(`Total frame: ${metrics.totalFrameTime.toFixed(2)} ms`);
console.log(`Active particles: ${metrics.activeParticles}`);
console.log(`Memory: ${metrics.memoryUsage.toFixed(2)} MB`);

// Get profiling report
console.log(simulation.getProfilingInfo());

// Enable/disable GPU
simulation.setGPUEnabled(true);

// Reset simulation
simulation.reset();
```

### AvalancheDemoScene

```typescript
const demo = new AvalancheDemoScene(config);

// Start animation loop
demo.start();

// Stop animation loop
demo.stop();

// Programmatic controls
demo.handleTriggerAvalanche();
demo.handleReset();
demo.toggleSlowMotion();
demo.togglePause();
demo.toggleDebug();
demo.setCameraMode('follow'); // 'overview', 'follow', 'topdown', 'cinematic', 'free'

// Get current state
const uiState = demo.getUIState();
const cameraMode = demo.getCameraMode();
const statusMessage = demo.getStatusMessage();

// Get simulation data
const stats = demo.getStatistics();
const metrics = demo.getPerformanceMetrics();

// Cleanup
demo.dispose();
```

---

## 🎨 Rendering Integration

The avalanche components provide data structures for rendering but don't include a renderer. Here's how to integrate with your rendering system:

### Rendering Terrain

```typescript
const mesh = terrainGen.generateMesh();

// Create vertex buffer
const vertexBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);

// Create normal buffer
const normalBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);

// Create index buffer
const indexBuffer = gl.createBuffer();
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

// Draw terrain
gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_INT, 0);
```

### Rendering Snow Particles

```typescript
const particles = simulation.getParticles();

// Instanced rendering (WebGL2)
const positionData = new Float32Array(particles.length * 3);
const colorData = new Float32Array(particles.length * 4);

particles.forEach((p, i) => {
  // Position
  positionData[i * 3 + 0] = p.position[0];
  positionData[i * 3 + 1] = p.position[1];
  positionData[i * 3 + 2] = p.position[2];

  // Color by state
  if (p.state === 'resting') {
    colorData[i * 4 + 0] = 1.0; // White
    colorData[i * 4 + 1] = 1.0;
    colorData[i * 4 + 2] = 1.0;
  } else if (p.state === 'sliding') {
    colorData[i * 4 + 0] = 1.0; // Yellow
    colorData[i * 4 + 1] = 1.0;
    colorData[i * 4 + 2] = 0.0;
  } else {
    colorData[i * 4 + 0] = 1.0; // Red
    colorData[i * 4 + 1] = 0.0;
    colorData[i * 4 + 2] = 0.0;
  }
  colorData[i * 4 + 3] = 1.0;
});

// Upload to GPU and draw instances
gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, particles.length);
```

---

## ⚙️ Configuration Tips

### Performance Tuning

```typescript
// Low-end hardware (mobile)
const lowEndConfig = {
  terrain: { resolution: 32 }, // Lower resolution
  snow: { particleCount: 500 }, // Fewer particles
  simulation: { useGPU: false }, // CPU only
};

// Mid-range hardware (laptop)
const midRangeConfig = {
  terrain: { resolution: 64 },
  snow: { particleCount: 5000 },
  simulation: { useGPU: false },
};

// High-end hardware (desktop)
const highEndConfig = {
  terrain: { resolution: 128 },
  snow: { particleCount: 100000 },
  simulation: { useGPU: true }, // GPU acceleration
};
```

### Terrain Styles

```typescript
// Gentle hills
const gentleHills = {
  steepness: 0.3,
  roughness: 0.2,
  maxHeight: 20,
};

// Steep mountains
const steepMountains = {
  steepness: 0.9,
  roughness: 0.5,
  maxHeight: 100,
};

// Rugged cliffs
const ruggedCliffs = {
  steepness: 0.7,
  roughness: 0.8,
  maxHeight: 80,
};
```

### Snow Types

```typescript
// Powder snow (low cohesion)
const powderSnow = {
  cohesion: 0.1,
  angleOfRepose: 30,
  density: 200,
};

// Wet snow (high cohesion)
const wetSnow = {
  cohesion: 0.5,
  angleOfRepose: 40,
  density: 400,
};

// Icy snow (medium cohesion)
const icySnow = {
  cohesion: 0.3,
  angleOfRepose: 35,
  density: 500,
};
```

---

## 🔧 Troubleshooting

### Low FPS

- Reduce `particleCount`
- Lower terrain `resolution`
- Disable `enableProfiling`
- Consider GPU acceleration (when available)

### Particles Not Moving

- Check `gravity` > 0
- Verify `frictionCoefficient` < 1
- Ensure trigger zone has unstable slopes
- Check `minDepthForTrigger` is not too high

### Particles Falling Through Terrain

- Increase physics update frequency (lower `dt`)
- Check terrain height queries are correct
- Verify particle initial positions are on surface

### Memory Issues

- Reduce `maxParticles`
- Lower terrain `resolution`
- Monitor `memoryUsage` metric

---

## 📚 Examples

See the test files for more examples:

- `TerrainGenerator.test.ts` - Terrain generation examples
- `SnowAccumulation.test.ts` - Snow placement and stability
- `AvalanchePhysics.test.ts` - Physics and collision
- `AvalancheSimulation.test.ts` - Performance monitoring
- `AvalancheDemoScene.test.ts` - Interactive demo patterns

---

## 🎓 Learning Resources

- [Perlin Noise Explained](https://en.wikipedia.org/wiki/Perlin_noise)
- [Avalanche Physics](https://en.wikipedia.org/wiki/Avalanche)
- [Mohr-Coulomb Theory](https://en.wikipedia.org/wiki/Mohr%E2%80%93Coulomb_theory)
- [Semi-Implicit Euler Integration](https://en.wikipedia.org/wiki/Semi-implicit_Euler_method)
- [WebGPU Compute Shaders](https://gpuweb.github.io/gpuweb/)

---

## 🤝 Contributing

Found a bug or have a feature request? Check the test files first to see if it's already covered. If not, please open an issue with:

1. Clear description of the problem
2. Minimal reproduction code
3. Expected vs. actual behavior
4. System information (OS, GPU, browser)

---

Happy simulating! 🏔️❄️💨
