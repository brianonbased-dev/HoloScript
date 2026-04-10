# HoloScript Graphics Traits - Quick Start Guide

## Import

```typescript
import {
  MaterialTrait,
  createMaterialTrait,
  MATERIAL_PRESETS,
  LightingTrait,
  createLightingTrait,
  LIGHTING_PRESETS,
  RenderingTrait,
  createRenderingTrait,
} from '@holoscript/core';
```

---

## MaterialTrait - Quick Start

### Create a Simple Material

```typescript
const material = new MaterialTrait({
  type: 'pbr',
  pbr: {
    baseColor: { r: 0.8, g: 0.2, b: 0.2 },
    metallic: 0.5,
    roughness: 0.5,
  },
});
```

### Use a Preset

```typescript
const steel = MATERIAL_PRESETS.chrome();
const wood = MATERIAL_PRESETS.wood();
const glass = MATERIAL_PRESETS.glass();
```

### Add Textures

```typescript
material.addTexture({
  path: '/textures/diffuse.jpg',
  channel: 'baseColor',
});

material.addTexture({
  path: '/textures/normal.jpg',
  channel: 'normalMap',
});
```

### Optimize for GPU

```typescript
material.setTextureStreaming(true);
material.setCompression('basis');
material.setInstanced(true);
```

---

## LightingTrait - Quick Start

### Create Lighting

```typescript
const lighting = new LightingTrait();

// Add sun
lighting.createDirectionalLight(
  { x: 1, y: 1, z: 1 }, // direction
  { r: 1, g: 0.95, b: 0.8 }, // color
  1.0, // intensity
  true // shadows
);

// Add fill light
lighting.createPointLight(
  { x: -5, y: 3, z: 0 }, // position
  { r: 1, g: 1, b: 1 }, // color
  0.5, // intensity
  20, // range
  false // shadows
);
```

### Use a Preset

```typescript
const outdoor = LIGHTING_PRESETS.outdoor();
const lit = new LightingTrait(outdoor);
```

### Configure Global Illumination

```typescript
lighting.setAmbientLight(
  { r: 0.7, g: 0.8, b: 1.0 }, // sky color
  { r: 0.3, g: 0.3, b: 0.2 }, // ground color
  1.0 // intensity
);
```

### Get Performance Info

```typescript
const impact = lighting.getPerformanceImpact();
console.log(`Lights: ${impact.totalLights}, GPU Cost: ${impact.estimatedGPUCost}`);
```

---

## RenderingTrait - Quick Start

### Create and Configure

```typescript
const rendering = new RenderingTrait();

// Set quality tier
rendering.applyQualityPreset('high');

// Setup LODs
rendering.setupLODLevels('automatic');

// Enable optimizations
rendering.setFrustumCulling(true);
rendering.setOcclusionCulling(true, 50);
rendering.setInstancing(true, 2000);
```

### Texture Optimization

```typescript
rendering.setTextureStreaming(true, 512); // 512 MB budget
rendering.setTextureCompression('basis');
rendering.setMaxTextureResolution(2048);
```

### Platform Optimization

```typescript
// For VR/AR
rendering.optimizeForVRAR(90);

// For mobile
rendering.optimizeForMobile();

// For desktop
rendering.optimizeForDesktop();
```

### Get GPU Memory Estimate

```typescript
const memory = rendering.estimateGPUMemory();
console.log(`GPU Memory: ${memory.estimatedTotal} MB`);
```

---

## Complete Scene Example

```typescript
import {
  MaterialTrait,
  MATERIAL_PRESETS,
  LightingTrait,
  LIGHTING_PRESETS,
  RenderingTrait,
} from '@holoscript/core';

class RealisticScene {
  constructor() {
    // ===== MATERIALS =====
    this.setupMaterials();

    // ===== LIGHTING =====
    this.setupLighting();

    // ===== RENDERING =====
    this.setupRendering();
  }

  setupMaterials() {
    // Metal material
    this.metalMaterial = MATERIAL_PRESETS.chrome();
    this.metalMaterial.setInstanced(true);

    // Wood material
    this.woodMaterial = MATERIAL_PRESETS.wood();
    this.woodMaterial.addTexture({
      path: '/textures/wood-diffuse.jpg',
      channel: 'baseColor',
    });

    // Glass material
    this.glassMaterial = MATERIAL_PRESETS.glass();
    this.glassMaterial.setTextureStreaming(true);
  }

  setupLighting() {
    // Create lighting with outdoor preset
    this.lighting = new LightingTrait(LIGHTING_PRESETS.outdoor());

    // Sun
    this.lighting.createDirectionalLight(
      { x: 0.5, y: 1, z: 0.5 },
      { r: 1, g: 0.95, b: 0.8 },
      1.2,
      true // shadows
    );

    // Key light
    this.lighting.createPointLight({ x: -5, y: 3, z: 0 }, { r: 1, g: 1, b: 1 }, 0.7, 25, false);

    // Fill light
    this.lighting.createPointLight({ x: 5, y: 2, z: -5 }, { r: 0.8, g: 0.8, b: 1 }, 0.4, 15, false);
  }

  setupRendering() {
    this.rendering = new RenderingTrait();

    // High quality
    this.rendering.applyQualityPreset('high');

    // Optimize for desktop
    this.rendering.optimizeForDesktop();

    // Setup LOD
    this.rendering.setupLODLevels('automatic');
  }

  getSceneInfo() {
    return {
      materials: 'metal, wood, glass',
      lighting: this.lighting.getSceneInfo(),
      rendering: this.rendering.getInfo(),
      gpuMemory: this.rendering.estimateGPUMemory(),
    };
  }
}

// Usage
const scene = new RealisticScene();
console.log(scene.getSceneInfo());
```

---

## Common Patterns

### Mobile Optimization

```typescript
// Material: Reduce textures
material.setTextureCompression('astc');
material.setMaxTextureResolution(512);

// Lighting: Reduce shadow casters
lighting.createDirectionalLight(..., false);  // no shadows

// Rendering: Low tier
rendering.optimizeForMobile();
rendering.applyQualityPreset('low');
```

### VR Optimization

```typescript
// Material: Standard quality
material.setCompression('dxt');

// Lighting: Key light + ambient
lighting.createDirectionalLight(..., true);  // sun with shadow
lighting.setScreenSpaceAO(true, 0.8);

// Rendering: VR optimized
rendering.optimizeForVRAR(90);  // 90 FPS
rendering.setFixedTimestep(1/90);
```

### High-End Desktop

```typescript
// Material: Maximum quality
material.setCompression('none');
material.setMaxTextureResolution(4096);

// Lighting: Multiple lights with shadows
lighting.createDirectionalLight(..., true);
lighting.createSpotLight(..., true);
lighting.createSpotLight(..., true);

// Rendering: Ultra quality
rendering.optimizeForDesktop();
rendering.applyQualityPreset('ultra');
rendering.setupLODLevels('manual');
```

---

## Performance Tips

### MaterialTrait

1. Use presets for common materials (saves setup time)
2. Compress textures (BASIS for 8x reduction)
3. Enable instancing for repeated materials
4. Use texture streaming for large scenes

### LightingTrait

1. Limit shadow-casting lights (max 4-8 realistic)
2. Use presets for lighting setups
3. Enable screen-space AO instead of baked
4. Monitor impact with `getPerformanceImpact()`

### RenderingTrait

1. Use quality presets as starting point
2. Platform-specific optimization (mobile/desktop/VR)
3. Enable LODs for complex scenes (40-50% GPU gain)
4. Use GPU instancing (100x improvement possible)

---

## API Quick Reference

### MaterialTrait Methods

- `getMaterial()` - Get full configuration
- `updatePBR(props)` - Update PBR properties
- `addTexture(config)` - Add texture map
- `getTextures()` - Get all textures
- `setTextureStreaming(enabled)` - Enable texture streaming
- `setCompression(type)` - Set texture compression
- `setInstanced(enabled)` - Enable instancing
- `getCustomShader()` - Get shader code
- `setCustomShader(shader)` - Set custom shader

### LightingTrait Methods

- `addLight(source)` - Add custom light
- `getLight(id)` - Get light by ID
- `getLights()` - Get all lights
- `getLightsByType(type)` - Filter by type
- `updateLight(id, updates)` - Update light
- `removeLight(id)` - Remove light
- `createDirectionalLight(...)` - Create sun
- `createPointLight(...)` - Create point light
- `createSpotLight(...)` - Create spot light
- `createAreaLight(...)` - Create area light
- `getShadowCastingLights()` - Get shadows
- `getLightCount()` - Count by type
- `getPerformanceImpact()` - Get GPU cost
- `getSceneInfo()` - Get info string

### RenderingTrait Methods

- `applyQualityPreset(quality)` - Apply preset
- `setupLODLevels(strategy)` - Setup LODs
- `getLODLevels()` - Get LOD config
- `setFrustumCulling(enabled)` - Enable frustum culling
- `setOcclusionCulling(enabled, distance)` - Enable occlusion
- `setInstancing(enabled, count)` - Enable instancing
- `setTextureStreaming(enabled, budget)` - Enable streaming
- `setTextureCompression(type)` - Set compression
- `setMaxTextureResolution(size)` - Set max resolution
- `optimizeForVRAR(fps)` - VR/AR optimization
- `optimizeForMobile()` - Mobile optimization
- `optimizeForDesktop()` - Desktop optimization
- `estimateGPUMemory()` - Get memory estimate
- `getInfo()` - Get info string

---

## Troubleshooting

### Material Not Rendering

- Check if shadows are enabled (shadows require specific setup)
- Verify texture paths are correct
- Check if material is compatible with renderer

### Lights Too Dark/Bright

- Adjust `intensity` value (0-1 typically, can exceed for strong lights)
- Check `skyColor` and `groundColor` for ambient
- Verify light `range` is sufficient

### Performance Issues

- Reduce quality preset (high → medium → low)
- Disable occlusion culling for debugging
- Reduce max texture resolution
- Decrease max instancing count

---

_For full documentation, see GRAPHICS_TRAITS.md_
