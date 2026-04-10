# HoloScript Graphics Traits - Phase 2

## Overview

The Graphics Traits system provides advanced capabilities for creating photorealistic 3D scenes in HoloScript+. These three core traits enable developers to specify material properties, dynamic lighting, and GPU optimization directives.

**Release:** Phase 2 (v2.0.0+)
**Tests:** 99 comprehensive tests (31 Material + 33 Lighting + 35 Rendering)

---

## MaterialTrait - Physically Based Rendering (PBR)

### Purpose

MaterialTrait enables photorealistic material rendering using PBR (Physically Based Rendering) workflows. Supports metallic, roughness, normal maps, emission, and GPU optimization.

### Key Features

- **PBR Material System**: Metallic, roughness, ambient occlusion, emission
- **Texture Management**: Multi-channel texture mapping with scale/offset/filtering
- **Custom Shaders**: Support for GLSL, HLSL, and ShaderGraph code
- **Presets**: Chrome, plastic, wood, glass, emissive, skin materials
- **GPU Optimization**: Texture streaming, compression (DXT, ASTC, BASIS), instancing hints

### API Overview

```typescript
import { MaterialTrait, createMaterialTrait, MATERIAL_PRESETS } from '@holoscript/core';

// Create material
const material = new MaterialTrait({
  type: 'pbr',
  pbr: {
    baseColor: { r: 0.8, g: 0.2, b: 0.2 },
    metallic: 0.5,
    roughness: 0.4,
    emission: {
      color: { r: 1, g: 0, b: 0 },
      intensity: 1.0,
    },
  },
});

// Add textures
material.addTexture({
  path: '/textures/diffuse.jpg',
  channel: 'baseColor',
  scale: { x: 2, y: 2 },
  filter: 'anisotropic',
  anisotropy: 16,
});

material.addTexture({
  path: '/textures/normal.jpg',
  channel: 'normalMap',
  normalStrength: 1.5,
});

// Configure optimization
material.setTextureStreaming(true);
material.setCompression('basis');
material.setInstanced(true);

// Use preset
const chrome = MATERIAL_PRESETS.chrome();
const skin = MATERIAL_PRESETS.skin();
```

### Material Types

| Type          | Use Case            | Properties              |
| ------------- | ------------------- | ----------------------- |
| `pbr`         | Realistic surfaces  | Metallic, roughness, AO |
| `standard`    | Matte surfaces      | Diffuse + specular      |
| `unlit`       | No lighting         | Base color only         |
| `transparent` | Glass, translucency | Transmission, IOR       |
| `custom`      | Advanced rendering  | Custom shader code      |

### Texture Channels

- `baseColor` - RGB diffuse color (sRGB space)
- `normalMap` - RGB normal mapping (linear space)
- `roughnessMap` - Grayscale roughness values
- `metallicMap` - Grayscale metallic values
- `ambientOcclusionMap` - AO baking
- `emissionMap` - Emissive surfaces
- `heightMap` - Parallax/displacement mapping

### Presets

```typescript
// Chrome/Metal
MATERIAL_PRESETS.chrome();
// { type: 'pbr', pbr: { metallic: 1.0, roughness: 0.1, ... } }

// Plastic
MATERIAL_PRESETS.plastic();
// { type: 'pbr', pbr: { metallic: 0, roughness: 0.8, ... } }

// Wood
MATERIAL_PRESETS.wood();
// { type: 'pbr', pbr: { roughness: 0.4, baseColor: brown, ... } }

// Glass
MATERIAL_PRESETS.glass();
// { type: 'transparent', pbr: { transmission: 0.9, ior: 1.5 } }

// Emissive (Glowing)
MATERIAL_PRESETS.emissive();
// { type: 'pbr', pbr: { emission: { intensity: 2.0 }, ... } }

// Skin
MATERIAL_PRESETS.skin();
// { type: 'pbr', pbr: { roughness: 0.5, ambientOcclusion: 0.8 } }
```

---

## LightingTrait - Dynamic Lighting & Global Illumination

### Purpose

LightingTrait manages dynamic lighting with support for multiple light types, shadows, and global illumination. Enables realistic illumination without pre-baked lightmaps.

### Key Features

- **Light Types**: Directional, point, spot, area lights with individual control
- **Shadow System**: Hard/soft/raytraced shadows with cascading and bias
- **Global Illumination**: Sky-based ambient with screen-space AO
- **Performance Analysis**: Light impact estimation and optimization hints
- **Presets**: Studio, outdoor, interior, night, sunset lighting

### API Overview

```typescript
import { LightingTrait, createLightingTrait, LIGHTING_PRESETS } from '@holoscript/core';

// Create with GI config
const lighting = new LightingTrait({
  enabled: true,
  intensity: 1.0,
  skyColor: { r: 0.7, g: 0.85, b: 1.0 },
  skyIntensity: 1.0,
  groundColor: { r: 0.4, g: 0.4, b: 0.35 },
  groundIntensity: 0.6,
  probes: true,
  screenSpaceAO: true,
  aoIntensity: 1.0,
});

// Add sun light
const sunId = lighting.createDirectionalLight(
  { x: 0.5, y: 1, z: 0.5 }, // direction
  { r: 1, g: 0.95, b: 0.8 }, // color (warm)
  1.2, // intensity
  true // castShadows
);

// Add point lights
const fillId = lighting.createPointLight(
  { x: -5, y: 3, z: 0 }, // position
  { r: 1, g: 1, b: 1 }, // color (neutral)
  0.6, // intensity
  20, // range
  false // castShadows
);

// Add spot light (for accent)
const spotId = lighting.createSpotLight(
  { x: 0, y: 5, z: -10 }, // position
  { x: 0, y: -1, z: 0 }, // direction
  { r: 1, g: 1, b: 1 }, // color
  0.8, // intensity
  30, // range
  45, // spotAngle (degrees)
  false // castShadows
);

// Add area light (soft fill)
const areaId = lighting.createAreaLight(
  { x: 0, y: 5, z: 0 }, // position
  { r: 1, g: 1, b: 1 }, // color
  0.5, // intensity
  4, // width
  4 // height
);

// Update light properties
lighting.updateLight(sunId, { intensity: 1.5 });

// Get light counts
const counts = lighting.getLightCount();
// { directional: 1, point: 1, spot: 1, area: 1, probe: 0 }

// Estimate GPU impact
const impact = lighting.getPerformanceImpact();
// { totalLights: 4, shadowCasters: 1, estimatedGPUCost: 'low' }

// Scene info
const info = lighting.getSceneInfo();
// "Lighting: 1 dir, 1 point, 1 spot | Shadows: 1 | GPU: low"
```

### Light Types

| Type        | Position | Direction | Shadows  | Use Case                  |
| ----------- | -------- | --------- | -------- | ------------------------- |
| directional | No       | Yes       | Yes      | Sun, moon, distant light  |
| point       | Yes      | No        | Optional | Lamps, fire, explosions   |
| spot        | Yes      | Yes       | Optional | Flashlights, stage lights |
| area        | Yes      | No        | No       | Soft fill, window light   |
| probe       | No       | No        | No       | Light probe for GI        |

### Shadow Configuration

```typescript
// Soft shadows with 4 cascades (directional)
{ type: 'soft', resolution: 2048, cascades: 4, softness: 1.0, bias: 0.005 }

// Soft shadows (point light)
{ type: 'soft', resolution: 512, softness: 0.5, bias: 0.001 }

// Hard shadows
{ type: 'hard', resolution: 1024, bias: 0.002 }

// Raytraced (high quality, GPU intensive)
{ type: 'raytraced', softness: 2.0, maxDistance: 100 }
```

### Lighting Presets

```typescript
// Studio - Neutral, balanced
LIGHTING_PRESETS.studio();

// Outdoor - Bright natural light
LIGHTING_PRESETS.outdoor();

// Interior - Dim ambient
LIGHTING_PRESETS.interior();

// Night - Very dark with minimal ambient
LIGHTING_PRESETS.night();

// Sunset - Golden hour warm tones
LIGHTING_PRESETS.sunset();
```

### Global Illumination Configuration

```typescript
const lighting = new LightingTrait({
  enabled: true,
  intensity: 1.0,
  skyColor: { r: 0.7, g: 0.85, b: 1.0 }, // Sky ambient
  skyIntensity: 1.0,
  groundColor: { r: 0.4, g: 0.4, b: 0.35 }, // Ground ambient
  groundIntensity: 0.6,
  probes: true, // Use light probes
  indirectDiffuse: 1.0, // Indirect diffuse multiplier
  indirectSpecular: 0.5, // Indirect specular multiplier
  aoIntensity: 1.0, // AO strength
  screenSpaceAO: true, // Enable screen-space AO
});
```

---

## RenderingTrait - GPU Optimization & Performance Tuning

### Purpose

RenderingTrait provides GPU optimization directives including LOD (level of detail) management, culling strategies, batching hints, and quality presets for different hardware tiers.

### Key Features

- **LOD System**: Automatic polygon reduction with texture downscaling
- **Culling**: Frustum, occlusion, and hierarchical Z-buffer culling
- **Batching**: Static/dynamic batching with GPU instancing
- **Texture Optimization**: Streaming, compression, mipmaps, virtual texturing
- **Quality Presets**: Low (mobile), medium, high, ultra quality tiers
- **Platform Optimization**: VR/AR optimized timesteps, mobile optimization

### API Overview

```typescript
import { RenderingTrait, createRenderingTrait } from '@holoscript/core';

// Create with custom config
const rendering = new RenderingTrait({
  lodStrategy: 'automatic',
  targetGPUTier: 'high',
  adaptiveQuality: true,
  targetFrameRate: 60,
});

// Setup automatic LODs (3 levels)
rendering.setupLODLevels('automatic');

// Configure culling
rendering.setFrustumCulling(true);
rendering.setOcclusionCulling(true, 50); // 50 unit distance

// Enable GPU instancing
rendering.setInstancing(true, 2000); // max 2000 instances

// Configure texture optimization
rendering.setTextureStreaming(true, 512); // 512 MB budget
rendering.setTextureCompression('basis'); // Use BASIS compression
rendering.setMaxTextureResolution(2048);

// Set GPU tier
rendering.setTargetGPUTier('high');

// Enable adaptive quality
rendering.setAdaptiveQuality(true, 60); // Target 60 FPS

// Apply quality preset
rendering.applyQualityPreset('high');

// Get LOD configuration
const lods = rendering.getLODLevels();
// Level 0: 50% screen size, 100% polygons, 1.0x textures
// Level 1: 25% screen size, 60% polygons, 0.5x textures
// Level 2: 10% screen size, 30% polygons, 0.25x textures

// Estimate GPU memory
const memory = rendering.estimateGPUMemory();
// { textureMemory: 16, vertexBuffers: 5, estimatedTotal: 21 }

// Get rendering info
const info = rendering.getInfo();
// "Rendering: tier=high | LOD=automatic | culling=back | instancing=yes | memory=21MB"
```

### Quality Presets

```typescript
// Low (Mobile)
rendering.applyQualityPreset('low');
// GPU tier: low, Max texture: 512px, LOD: automatic, Frame rate: 30 FPS

// Medium
rendering.applyQualityPreset('medium');
// GPU tier: medium, Max texture: 1024px, LOD: automatic, Frame rate: 60 FPS

// High
rendering.applyQualityPreset('high');
// GPU tier: high, Max texture: 2048px, LOD: automatic, Frame rate: 60 FPS

// Ultra
rendering.applyQualityPreset('ultra');
// GPU tier: ultra, Max texture: 4096px, LOD: manual, Frame rate: 120 FPS
```

### Platform Optimization

```typescript
// Optimize for VR/AR (90 FPS, fast culling, high instancing)
rendering.optimizeForVRAR(90);

// Optimize for mobile (low resources, texture compression, reduced draw calls)
rendering.optimizeForMobile();

// Optimize for desktop (high resources, no compression, complex scenes)
rendering.optimizeForDesktop();
```

### LOD Configuration

```typescript
const levels = rendering.getLODLevels();
// [
//   {
//     level: 0,
//     screenRelativeSize: 0.5,        // Visible when >50% of screen
//     polygonReduction: 1.0,          // 100% of original mesh
//     textureScale: 1.0,              // Full resolution textures
//     disabledFeatures: [],           // All features enabled
//   },
//   {
//     level: 1,
//     screenRelativeSize: 0.25,       // Visible when 25-50% of screen
//     polygonReduction: 0.6,          // 60% of original mesh
//     textureScale: 0.5,              // Half resolution textures
//     disabledFeatures: ['specular'],
//   },
//   {
//     level: 2,
//     screenRelativeSize: 0.1,        // Visible when <25% of screen
//     polygonReduction: 0.3,          // 30% of original mesh
//     textureScale: 0.25,             // 1/4 resolution textures
//     disabledFeatures: ['specular', 'normals'],
//   },
// ]
```

### Texture Compression Options

| Format | Use Case                  | Quality   | Compression |
| ------ | ------------------------- | --------- | ----------- |
| none   | Desktop (highest quality) | Excellent | 0x          |
| dxt    | Desktop & mobile          | Good      | 6x          |
| astc   | Mobile (best)             | Good      | 6-8x        |
| basis  | Cross-platform            | Fair      | 8x+         |

### Culling Strategies

| Mode           | Description                     | Performance   | Use                  |
| -------------- | ------------------------------- | ------------- | -------------------- |
| frustum        | View frustum culling            | 10-20% faster | Always enabled       |
| occlusion      | Objects hidden by other objects | 20-30% faster | Outdoor/dense scenes |
| hierarchical-z | GPU-based Z culling             | 15-25% faster | VR/AR                |
| none           | No culling                      | Baseline      | Reference only       |

---

## Integration Example: Complete Scene

```typescript
import {
  MaterialTrait,
  LightingTrait,
  RenderingTrait,
  MATERIAL_PRESETS,
  LIGHTING_PRESETS,
} from '@holoscript/core';

// Create a realistic outdoor scene
class OutdoorScene {
  materials: MaterialTrait;
  lighting: LightingTrait;
  rendering: RenderingTrait;

  constructor() {
    // Materials
    this.materials = new MaterialTrait(MATERIAL_PRESETS.chrome());
    this.materials.addTexture({
      path: '/textures/metal-diffuse.jpg',
      channel: 'baseColor',
    });
    this.materials.addTexture({
      path: '/textures/metal-normal.jpg',
      channel: 'normalMap',
    });

    // Lighting
    this.lighting = new LightingTrait(LIGHTING_PRESETS.outdoor());
    this.lighting.createDirectionalLight(
      { x: 0.5, y: 1, z: 0.5 },
      { r: 1, g: 0.95, b: 0.8 },
      1.2,
      true
    );
    this.lighting.createPointLight(
      { x: -10, y: 2, z: 0 },
      { r: 0.5, g: 0.5, b: 1 },
      0.5,
      20,
      false
    );

    // Rendering
    this.rendering = new RenderingTrait();
    this.rendering.applyQualityPreset('high');
    this.rendering.optimizeForDesktop();
  }

  getSceneInfo(): string {
    return `
      Materials: ${this.materials.getMaterial().name}
      Lighting: ${this.lighting.getSceneInfo()}
      Rendering: ${this.rendering.getInfo()}
    `;
  }
}
```

---

## Performance Considerations

### MaterialTrait

- **Texture Memory**: 2048px = 16MB RGBA, compress with BASIS for 2-3x reduction
- **Shader Complexity**: Custom shaders add 5-10% GPU overhead per layer
- **Instancing**: Reduces draw calls by 10-100x for identical materials

### LightingTrait

- **Per-Light Cost**: ~1ms GPU for shadow-casting light (1024px map)
- **Maximum Realistic Lights**: 8-16 with shadows, 32-64 without
- **Screen-Space AO**: ~2-3% GPU overhead but improves visual quality

### RenderingTrait

- **LOD Reduction**: 3-level LOD typically saves 40-50% GPU at distance
- **Occlusion Culling**: 20-30% reduction in draw calls for dense scenes
- **GPU Instancing**: 10-100x more geometry with same batch cost

---

## Compatibility

- **HoloScript+ Version**: 2.0.0+
- **Rendering Engines**: Supports specifications for Three.js, Babylon.js, Unreal Engine, Unity
- **Target Platforms**: Desktop, Mobile (iOS/Android), VR (Meta Quest, HTC Vive), AR (Magic Leap)

---

## Testing

All traits include comprehensive test suites:

- **MaterialTrait**: 31 tests covering PBR, textures, shaders, optimization
- **LightingTrait**: 33 tests covering light management, GI, performance analysis
- **RenderingTrait**: 35 tests covering LOD, culling, presets, memory estimation

**Total:** 99 tests, 217 total test suite

---

## Next Steps

1. **composition Property Extensions**: Update OrbNode type with visual properties
2. **HoloScript+ Integration**: Add @material, @lighting, @rendering traits to DSL
3. **Hololand Graphics Pipeline**: Implement GPU-accelerated rendering backend
4. **PBR Material System**: Create Hololand's material shader system

---

_Created: Phase 2 Release (v2.0.0)_
_Last Updated: 2024_
