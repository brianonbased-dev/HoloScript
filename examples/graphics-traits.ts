// HoloScript Graphics Traits Examples
// This file demonstrates real-world usage of MaterialTrait, LightingTrait, and RenderingTrait

import {
  MaterialTrait,
  LightingTrait,
  RenderingTrait,
  MATERIAL_PRESETS,
  LIGHTING_PRESETS,
  type PBRMaterial,
  type LightSource,
  type RenderingOptimization,
} from '@holoscript/core';

/**
 * Example 1: Creating a Photorealistic Metal Sphere
 *
 * Demonstrates:
 * - PBR material setup
 * - Texture mapping
 * - Material instancing for performance
 */
export function createMetalSphere() {
  const material = new MaterialTrait({
    type: 'pbr',
    pbr: {
      baseColor: { r: 0.8, g: 0.8, b: 0.8 },
      metallic: 0.9,
      roughness: 0.15,
      ambientOcclusion: 1.0,
    },
  });

  // Add surface details
  material.addTexture({
    path: '/assets/metal/normal.jpg',
    channel: 'normalMap',
    scale: { x: 1, y: 1 },
  });

  material.addTexture({
    path: '/assets/metal/roughness.jpg',
    channel: 'roughnessMap',
    scale: { x: 1, y: 1 },
  });

  // Optimize for GPU
  material.setCompression('basis');
  material.setInstanced(true);
  material.setTextureStreaming(true);

  return material;
}

/**
 * Example 2: Realistic Wood Material
 *
 * Demonstrates:
 * - Using material presets
 * - Custom texture configuration
 * - Anisotropic filtering for detail
 */
export function createWoodMaterial() {
  const material = MATERIAL_PRESETS.wood();

  // Add custom textures
  material.addTexture({
    path: '/assets/wood/diffuse.jpg',
    channel: 'baseColor',
    filter: 'anisotropic',
    anisotropy: 16,
  });

  material.addTexture({
    path: '/assets/wood/normal.jpg',
    channel: 'normalMap',
    scale: { x: 2, y: 1 }, // Stretch wood grain
  });

  material.setCompression('dxt'); // DXT for smaller file size
  material.setTextureStreaming(true, 256); // 256 MB budget

  return material;
}

/**
 * Example 3: Glass/Transparent Material
 *
 * Demonstrates:
 * - Transparency and IOR (Index of Refraction)
 * - Custom shaders for special effects
 * - Transmission properties
 */
export function createGlassMaterial() {
  const material = new MaterialTrait({
    type: 'pbr',
    pbr: {
      baseColor: { r: 1, g: 1, b: 1 },
      metallic: 0,
      roughness: 0.1,
      transmission: 1.0,
      ior: 1.5, // Glass IOR
    },
  });

  // Add custom shader for transparency effects
  const glassShader = `
    void main() {
      vec4 color = texture(baseColorMap, vUV);
      gl_FragColor = vec4(color.rgb, 0.7);  // 70% opaque
    }
  `;

  material.setCustomShader(glassShader);

  return material;
}

/**
 * Example 4: Professional Studio Lighting
 *
 * Demonstrates:
 * - Three-point lighting setup
 * - Shadow configuration
 * - Performance optimization
 */
export function setupStudioLighting() {
  const lighting = new LightingTrait(LIGHTING_PRESETS.studio());

  // Key light (main)
  lighting.createDirectionalLight(
    { x: 0.8, y: 1, z: 0.6 }, // direction (from upper left)
    { r: 1, g: 0.95, b: 0.9 }, // warm white
    1.2, // strong intensity
    true // cast shadows
  );

  // Fill light (balance shadows)
  lighting.createPointLight(
    { x: -0.8, y: 0.5, z: 0.4 }, // opposite side
    { r: 0.7, g: 0.7, b: 0.8 }, // cool blue
    0.6, // medium intensity
    30, // 30 unit range
    false // no shadows
  );

  // Back light (rim light for separation)
  lighting.createSpotLight(
    { x: 0, y: 0.5, z: -1 }, // behind object
    { x: 0, y: 0, z: 1 }, // pointing forward
    { r: 0.8, g: 0.8, b: 1 }, // cool white
    0.4, // medium intensity
    25, // 25 unit range
    Math.PI / 6, // 30 degree spread
    false // no shadows
  );

  // Ambient light (global illumination)
  lighting.setAmbientLight(
    { r: 0.8, g: 0.85, b: 0.9 }, // sky color (light blue)
    { r: 0.3, g: 0.3, b: 0.25 }, // ground color (dark)
    0.8 // moderate intensity
  );

  // Configure global illumination
  lighting.setGlobalIllumination({
    skyColor: { r: 0.8, g: 0.85, b: 0.9 },
    groundColor: { r: 0.3, g: 0.3, b: 0.25 },
    probes: 32,
    indirectDiffuse: 0.7,
    indirectSpecular: 0.8,
  });

  return lighting;
}

/**
 * Example 5: Dynamic Day/Night Lighting
 *
 * Demonstrates:
 * - Time-based lighting changes
 * - Preset application
 * - Performance monitoring
 */
export class DayNightLighting {
  private lighting: LightingTrait;
  private sunId: string = '';
  private ambientId: string = '';

  constructor() {
    this.lighting = new LightingTrait();
    this.initializeDay();
  }

  private initializeDay() {
    // Bright daylight
    this.sunId = this.lighting.createDirectionalLight(
      { x: 0.5, y: 1, z: 0.5 },
      { r: 1, g: 0.95, b: 0.8 }, // warm sunlight
      1.5, // bright
      true
    );
  }

  updateTime(timeOfDay: number) {
    // timeOfDay: 0-24 (hours)

    if (timeOfDay < 6) {
      // Night: Deep blue, low light
      this.lighting.updateLight(this.sunId, {
        intensity: 0.1,
        color: { r: 0.1, g: 0.15, b: 0.3 },
      });
    } else if (timeOfDay < 8) {
      // Sunrise: Orange
      const progress = (timeOfDay - 6) / 2; // 0-1
      this.lighting.updateLight(this.sunId, {
        intensity: 0.5 + progress * 0.5,
        color: {
          r: 1,
          g: 0.4 + progress * 0.5,
          b: 0.1 + progress * 0.7,
        },
      });
    } else if (timeOfDay < 18) {
      // Day: Neutral white
      this.lighting.updateLight(this.sunId, {
        intensity: 1.5,
        color: { r: 1, g: 0.95, b: 0.85 },
      });
    } else if (timeOfDay < 20) {
      // Sunset: Red/orange
      const progress = (timeOfDay - 18) / 2; // 0-1
      this.lighting.updateLight(this.sunId, {
        intensity: 1.5 - progress * 0.4,
        color: {
          r: 1,
          g: 0.5 - progress * 0.3,
          b: 0.2 - progress * 0.2,
        },
      });
    } else {
      // Night: Deep blue
      this.lighting.updateLight(this.sunId, {
        intensity: 0.1,
        color: { r: 0.1, g: 0.15, b: 0.3 },
      });
    }
  }

  getPerformanceStats() {
    const impact = this.lighting.getPerformanceImpact();
    return {
      lights: impact.totalLights,
      shadowCasters: impact.shadowCastingLights,
      gpuCost: impact.estimatedGPUCost,
    };
  }
}

/**
 * Example 6: Mobile vs Desktop Rendering
 *
 * Demonstrates:
 * - Platform-specific optimization
 * - Quality presets
 * - Performance tuning
 */
export function setupRenderingForPlatform(platform: 'mobile' | 'vr' | 'desktop') {
  const rendering = new RenderingTrait();

  switch (platform) {
    case 'mobile':
      rendering.optimizeForMobile();
      rendering.applyQualityPreset('low');
      rendering.setMaxTextureResolution(512);
      rendering.setTextureStreaming(true, 128); // 128 MB
      rendering.setTextureCompression('astc');
      rendering.setInstancing(true, 500);
      break;

    case 'vr':
      rendering.optimizeForVRAR(90); // 90 FPS for VR
      rendering.applyQualityPreset('high');
      rendering.setMaxTextureResolution(2048);
      rendering.setTextureStreaming(true, 512);
      rendering.setTextureCompression('basis');
      rendering.setInstancing(true, 2000);
      break;

    case 'desktop':
      rendering.optimizeForDesktop();
      rendering.applyQualityPreset('ultra');
      rendering.setMaxTextureResolution(4096);
      rendering.setTextureStreaming(true, 1024);
      rendering.setTextureCompression('none');
      rendering.setInstancing(true, 5000);
      break;
  }

  // Common for all platforms
  rendering.setupLODLevels('automatic');
  rendering.setFrustumCulling(true);
  rendering.setOcclusionCulling(true, 50);

  return rendering;
}

/**
 * Example 7: Complete Scene Setup
 *
 * Demonstrates:
 * - Integration of all three trait systems
 * - Performance monitoring
 * - Real-world usage pattern
 */
export class RealisticScene {
  private materials: Map<string, MaterialTrait> = new Map();
  private lighting: LightingTrait;
  private rendering: RenderingTrait;

  constructor(targetPlatform: 'mobile' | 'vr' | 'desktop') {
    this.setupMaterials();
    this.lighting = this.setupLighting();
    this.rendering = setupRenderingForPlatform(targetPlatform);
  }

  private setupMaterials() {
    // Metal
    this.materials.set('metal', createMetalSphere());

    // Wood
    this.materials.set('wood', createWoodMaterial());

    // Glass
    this.materials.set('glass', createGlassMaterial());

    // Plastic
    this.materials.set('plastic', MATERIAL_PRESETS.plastic());

    // Emissive (for lights/screens)
    const emissive = MATERIAL_PRESETS.emissive();
    emissive.updatePBR({
      emission: { r: 1, g: 0.8, b: 0.2 }, // yellow glow
    });
    this.materials.set('emissive', emissive);
  }

  private setupLighting(): LightingTrait {
    return setupStudioLighting();
  }

  getMaterial(name: string): MaterialTrait | undefined {
    return this.materials.get(name);
  }

  getLighting(): LightingTrait {
    return this.lighting;
  }

  getRendering(): RenderingTrait {
    return this.rendering;
  }

  getPerformanceReport() {
    const lightingImpact = this.lighting.getPerformanceImpact();
    const gpuMemory = this.rendering.estimateGPUMemory();

    return {
      lighting: {
        totalLights: lightingImpact.totalLights,
        shadowCasters: lightingImpact.shadowCastingLights,
        gpuCost: lightingImpact.estimatedGPUCost,
      },
      rendering: {
        estimatedMemory: gpuMemory.estimatedTotal,
        textureMemory: gpuMemory.textureMemory,
        geometryMemory: gpuMemory.geometryMemory,
      },
      materials: {
        count: this.materials.size,
        instancingEnabled: true,
      },
    };
  }
}

/**
 * Example 8: Interactive Material Editor
 *
 * Demonstrates:
 * - Dynamic material adjustment
 * - Real-time updates
 * - Material property inspection
 */
export class MaterialEditor {
  private material: MaterialTrait;

  constructor() {
    this.material = new MaterialTrait({
      type: 'pbr',
      pbr: {
        baseColor: { r: 0.5, g: 0.5, b: 0.5 },
        metallic: 0.5,
        roughness: 0.5,
      },
    });
  }

  updateMetallic(value: number) {
    this.material.updatePBR({ metallic: Math.max(0, Math.min(1, value)) });
  }

  updateRoughness(value: number) {
    this.material.updatePBR({ roughness: Math.max(0, Math.min(1, value)) });
  }

  updateColor(r: number, g: number, b: number) {
    this.material.updatePBR({
      baseColor: {
        r: Math.max(0, Math.min(1, r)),
        g: Math.max(0, Math.min(1, g)),
        b: Math.max(0, Math.min(1, b)),
      },
    });
  }

  addNormalMap(path: string) {
    this.material.addTexture({
      path,
      channel: 'normalMap',
    });
  }

  addRoughnessMap(path: string) {
    this.material.addTexture({
      path,
      channel: 'roughnessMap',
    });
  }

  getCurrentConfig() {
    return this.material.getMaterial();
  }

  applyPreset(presetName: string) {
    const preset = MATERIAL_PRESETS[presetName as keyof typeof MATERIAL_PRESETS]?.();
    if (preset) {
      this.material = preset;
    }
  }
}

// Usage Examples
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  console.log('=== HoloScript Graphics Examples ===');

  // Example 1: Metal sphere
  const metalSphere = createMetalSphere();
  console.log('Metal Sphere Material:', metalSphere.getMaterial());

  // Example 4: Studio lighting
  const studioLights = setupStudioLighting();
  console.log('Studio Lighting Setup:', studioLights.getSceneInfo());

  // Example 6: Platform rendering
  const mobileRendering = setupRenderingForPlatform('mobile');
  console.log('Mobile Rendering:', mobileRendering.getInfo());

  // Example 7: Complete scene
  const scene = new RealisticScene('desktop');
  console.log('Scene Performance:', scene.getPerformanceReport());
}
