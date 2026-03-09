# HoloScript Physics Integration - Three.js Renderer

Real-time visualization of HoloScript's physics integration demo using Three.js.

## 🎬 Quick Start

### Option 1: Standalone Demo (No Build Required)

Open the HTML file directly in your browser:

```bash
# Windows
start samples/physics-integration-renderer.html

# macOS
open samples/physics-integration-renderer.html

# Linux
xdg-open samples/physics-integration-renderer.html
```

**Features**:

- ✅ No build process required
- ✅ Runs entirely in the browser
- ✅ Real-time physics simulation
- ✅ Interactive camera controls
- ✅ Live statistics panel

### Option 2: With HTTP Server (Recommended for Development)

For better performance and to avoid browser restrictions:

```bash
# Using Python (built-in)
cd samples
python -m http.server 8080

# Using Node.js http-server
npx http-server samples -p 8080

# Using pnpm serve
cd samples
pnpm dlx serve .
```

Then open: `http://localhost:8080/physics-integration-renderer.html`

## 🎮 Controls

### Mouse Controls

- **Left Click + Drag**: Rotate camera (orbit)
- **Right Click + Drag**: Pan camera
- **Scroll Wheel**: Zoom in/out

### Buttons

- **⏸️ Pause / ▶️ Play**: Toggle simulation
- **🔄 Restart**: Reset simulation to initial state
- **📷 Reset Camera**: Return camera to default position
- **🔲 Wireframe**: Toggle wireframe rendering mode

## 📊 Statistics Panel

The stats panel shows real-time simulation data:

- **Simulation Time**: Elapsed simulation time (seconds)
- **Frame**: Current frame number
- **FPS**: Frames per second (rendering performance)
- **Active Fragments**: Wall fragments still intact
- **Destroyed**: Fragments that have been destroyed
- **Particles**: Number of granular particles created
- **Destruction**: Overall destruction progress (%)
- **Kinetic Energy**: Total kinetic energy of particles (Joules)

## 🏗️ Scene Details

### Wrecking Ball Demolition

The demo simulates a wrecking ball destroying a brick wall:

1. **Wall**: 30 fragments (6×5 grid) representing brick wall sections
2. **Wrecking Ball**: 500kg steel ball launched at 8 m/s
3. **Impact**: Radial damage with falloff at ~2s mark
4. **Destruction**: Fragments destroyed and converted to particles
5. **Debris**: Granular particles settle into realistic pile

### Physics Systems

- **Rigid Body Dynamics**: Wrecking ball motion with gravity
- **Voronoi Fracture**: Wall destruction with procedural damage
- **Granular Materials**: Debris particles with DEM physics
- **Collision Detection**: Ball-wall impact and ground collisions
- **Integration**: Automatic fragment → particle conversion

## 🎨 Visual Features

- **PBR Materials**: Physically-based rendering for realistic look
- **Dynamic Shadows**: Real-time shadow casting
- **Particle Effects**: Debris particles with color coding
- **LOD System**: Color changes based on fragment state
- **Wireframe Mode**: Toggle for debugging geometry

## 🔧 Architecture

### Simplified Physics Simulation

The HTML file includes a simplified inline physics engine:

```
SimplifiedPhysicsDemo (Main simulation)
├── Wrecking Ball Physics
│   ├── Ballistic motion (gravity)
│   ├── Impact detection
│   └── Velocity damping
├── Fragment System
│   ├── Damage model (health-based)
│   ├── Impact response (velocity)
│   └── Rotation physics
└── Granular Particles
    ├── Gravity simulation
    ├── Ground collision
    └── Sleep states
```

### Three.js Renderer

```
PhysicsRenderer
├── Scene Setup (camera, lights, ground)
├── Mesh Management
│   ├── Fragment meshes (boxes)
│   ├── Particle meshes (spheres)
│   └── Ball mesh (sphere)
├── Material System (PBR)
└── Camera Controls (OrbitControls)
```

## 🚀 Performance

**Target**: 60 FPS on modern hardware

**Optimization Features**:

- Mesh pooling for particles
- Shadow map optimization (2048×2048)
- Sleeping particle states
- Frustum culling (automatic)

**Performance Metrics** (30 fragments, ~90 particles):

- Desktop GPU: 60 FPS ✅
- Integrated GPU: 45-60 FPS ✅
- Mobile: 30-45 FPS ⚠️

## 🔌 Integration with HoloScript

### Connecting to Real Physics Engine

To use the actual HoloScript physics systems instead of the simplified version:

1. **Build the physics demo**:

   ```bash
   pnpm install
   pnpm build
   tsx samples/physics-integration-demo.ts
   ```

2. **Export frame data**:

   ```typescript
   const demo = new PhysicsIntegrationDemo({
     duration: 10.0,
     exportFrames: true, // Enable frame export
     exportInterval: 1, // Export every frame
   });
   demo.run();
   ```

3. **Load frames in renderer**:

   ```javascript
   // Fetch frame data
   const frames = await fetch('/frames/simulation.json').then((r) => r.json());

   // Playback in renderer
   renderer.loadFrames(frames);
   ```

### Export Formats Supported

- **JSON**: Frame-by-frame data (positions, velocities, states)
- **glTF**: 3D geometry with animations
- **USD**: Universal Scene Description for pro tools
- **Unity**: C# scripts + prefabs
- **Unreal**: C++ actors + blueprints

## 📝 Next Steps

### Enhancements Coming Soon

1. **GPU Acceleration**: WGSL compute shaders for 100k+ particles
2. **Advanced Renderer**:
   - Post-processing effects (bloom, DOF)
   - Particle instancing for better performance
   - Dust particle system
3. **More Demos**:
   - Earthquake building collapse
   - Avalanche simulation
   - Water erosion
4. **VR/AR Support**: WebXR integration

### Developer Guide

To extend this renderer:

```javascript
// Add custom materials
const customMaterial = new THREE.MeshStandardMaterial({
  color: 0xff00ff,
  roughness: 0.5,
  metalness: 0.8,
  emissive: 0x330033,
  emissiveIntensity: 0.5,
});

// Add post-processing
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(resolution, strength, radius, threshold));

// Add particle instancing
const geometry = new THREE.SphereGeometry(1, 8, 8);
const material = new THREE.MeshStandardMaterial({ color: 0xaa5533 });
const instancedMesh = new THREE.InstancedMesh(geometry, material, 10000);
scene.add(instancedMesh);
```

## 🐛 Troubleshooting

### Issue: Low FPS / Laggy

**Solutions**:

1. Reduce particle count (modify `particleCount` in `convertDestroyedFragments`)
2. Disable shadows: `renderer.shadowMap.enabled = false`
3. Lower shadow map resolution: `directionalLight.shadow.mapSize.width = 1024`
4. Reduce fragment count: `wallFragments: 20`

### Issue: Particles Fall Through Ground

**Solutions**:

1. Check particle radius vs ground Y position
2. Increase restitution coefficient (bounciness)
3. Adjust collision detection threshold

### Issue: Ball Doesn't Hit Wall

**Solutions**:

1. Increase `ballVelocity` (default: 8 m/s)
2. Adjust `wallCenter` position
3. Check impact distance threshold

## 📚 Resources

- [HoloScript Physics Integration Guide](../docs/PHYSICS_INTEGRATION_GUIDE.md)
- [Sprint CLXXXII Report](../SPRINT_CLXXXII_COMPLETE.md)
- [Three.js Documentation](https://threejs.org/docs/)
- [WebGL Fundamentals](https://webglfundamentals.org/)

## 🎉 Demo Features Summary

| Feature               | Status | Description                    |
| --------------------- | ------ | ------------------------------ |
| Wrecking Ball Physics | ✅     | Realistic ballistic motion     |
| Wall Destruction      | ✅     | Damage model with health       |
| Particle Conversion   | ✅     | Fragments → granular particles |
| Real-time Rendering   | ✅     | 60 FPS on desktop              |
| Interactive Camera    | ✅     | Orbit, pan, zoom controls      |
| Statistics Panel      | ✅     | Live physics metrics           |
| Wireframe Mode        | ✅     | Debug geometry                 |
| Shadow Casting        | ✅     | Dynamic shadows                |
| PBR Materials         | ✅     | Physically-based rendering     |
| Pause/Restart         | ✅     | Simulation control             |

---

**Built with** ❤️ **using HoloScript Physics Integration System**

🎮 [View Live Demo](https://holoscript-physics-demo.vercel.app) | 📖 [Documentation](../docs) | 🐛 [Report Issues](https://github.com/yourusername/HoloScript/issues)
