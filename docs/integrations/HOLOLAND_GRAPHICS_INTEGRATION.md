# Hololand Graphics System Integration Guide

> **Architecture Note:** HoloScript is a complete language with its own runtime (`@holoscript/runtime`). Hololand is a VR social platform APPLICATION built with HoloScript. This guide covers how Hololand uses HoloScript's graphics traits.

## Overview

This guide explains how to use HoloScript's graphics traits (MaterialTrait, LightingTrait, RenderingTrait) in Hololand worlds to achieve realistic 3D visuals.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                  Hololand Creator Platform                 │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │          HoloScript Scene Description (.hsplus)      │  │
│  │                                                      │  │
│  │  composition "Scene" {                               │  │
│  │    template "SceneObj" {                             │  │
│  │      @material { type: pbr, metallic: 0.8 }         │  │
│  │      @lighting { preset: studio }                    │  │
│  │      @rendering { quality: high, platform: desktop } │  │
│  │    }                                                 │  │
│  │  }                                                   │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ↓                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │        HoloScript Parser + Type Checker              │  │
│  │        (Extracts trait specifications)               │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ↓                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │      Graphics Traits System (MaterialTrait,         │  │
│  │       LightingTrait, RenderingTrait)                 │  │
│  │                                                      │  │
│  │  ┌─────────────┬─────────────┬─────────────┐        │  │
│  │  │  Materials  │  Lighting   │ Rendering   │        │  │
│  │  │             │             │             │        │  │
│  │  │ - PBR       │ - Lights    │ - LOD       │        │  │
│  │  │ - Textures  │ - Shadows   │ - Culling   │        │  │
│  │  │ - Shaders   │ - GI        │ - Batching  │        │  │
│  │  └─────────────┴─────────────┴─────────────┘        │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ↓                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │    Hololand GPU Rendering Pipeline                  │  │
│  │                                                      │  │
│  │  ┌─────────────┬──────────────┬────────────────┐    │  │
│  │  │  Shader     │  GPU Memory  │  Performance   │    │  │
│  │  │  Compilation│  Management  │  Optimization  │    │  │
│  │  │             │              │                │    │  │
│  │  │ - PBR       │ - Textures   │ - Draw calls   │    │  │
│  │  │ - Lights    │ - Geometry   │ - Instancing   │    │  │
│  │  │ - Effects   │ - Buffers    │ - Culling      │    │  │
│  │  └─────────────┴──────────────┴────────────────┘    │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ↓                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         WebGL/WebGPU Renderer Output                 │  │
│  │      (Realistic 3D Visuals in Browser)               │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Integration Steps

### Step 1: Update Hololand's Scene Model

Update `packages/api/src/types/Scene.ts` to include graphics trait configurations:

```typescript
export interface GraphicsConfiguration {
  materials?: {
    pbr?: MaterialConfig;
    textures?: TextureConfig[];
    compression?: 'none' | 'dxt' | 'astc' | 'basis';
    instancing?: boolean;
  };
  lighting?: {
    lights?: LightSource[];
    globalIllumination?: GlobalIlluminationConfig;
    shadowQuality?: 'none' | 'low' | 'medium' | 'high' | 'ultra';
  };
  rendering?: {
    quality?: 'low' | 'medium' | 'high' | 'ultra';
    platform?: 'mobile' | 'vr' | 'desktop';
    lod?: boolean;
    culling?: boolean;
    batching?: boolean;
  };
}

export interface Scene {
  id: string;
  name: string;
  creatorId: string;
  orbs: Orb[];
  graphics?: GraphicsConfiguration; // NEW
  metadata?: Record<string, unknown>;
}
```

### Step 2: Create Graphics Pipeline Service

Create `packages/runtime/src/services/GraphicsPipelineService.ts`:

```typescript
import {
  MaterialTrait,
  LightingTrait,
  RenderingTrait,
  type GraphicsConfiguration,
} from '@holoscript/core';

export class GraphicsPipelineService {
  private materials: Map<string, MaterialTrait> = new Map();
  private lighting: LightingTrait;
  private rendering: RenderingTrait;

  constructor(config: GraphicsConfiguration) {
    this.initializeFromConfig(config);
  }

  private initializeFromConfig(config: GraphicsConfiguration) {
    // Initialize materials
    if (config.materials) {
      this.setupMaterials(config.materials);
    }

    // Initialize lighting
    if (config.lighting) {
      this.lighting = new LightingTrait();
      this.setupLighting(config.lighting);
    }

    // Initialize rendering
    if (config.rendering) {
      this.rendering = new RenderingTrait();
      this.setupRendering(config.rendering);
    }
  }

  private setupMaterials(config: any) {
    if (config.pbr) {
      const material = new MaterialTrait({
        type: 'pbr',
        pbr: config.pbr,
      });

      if (config.compression) {
        material.setCompression(config.compression);
      }
      if (config.instancing) {
        material.setInstanced(true);
      }

      this.materials.set('default', material);
    }
  }

  private setupLighting(config: any) {
    if (config.lights) {
      config.lights.forEach((light: any) => {
        this.lighting.addLight(light);
      });
    }

    if (config.globalIllumination) {
      this.lighting.setGlobalIllumination(config.globalIllumination);
    }
  }

  private setupRendering(config: any) {
    if (config.quality) {
      this.rendering.applyQualityPreset(config.quality);
    }

    if (config.platform) {
      switch (config.platform) {
        case 'mobile':
          this.rendering.optimizeForMobile();
          break;
        case 'vr':
          this.rendering.optimizeForVRAR(90);
          break;
        case 'desktop':
          this.rendering.optimizeForDesktop();
          break;
      }
    }

    if (config.lod !== false) {
      this.rendering.setupLODLevels('automatic');
    }

    if (config.culling !== false) {
      this.rendering.setFrustumCulling(true);
    }

    if (config.batching !== false) {
      this.rendering.setInstancing(true);
    }
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

  getPerformanceStats() {
    const lighting = this.lighting?.getPerformanceImpact();
    const memory = this.rendering?.estimateGPUMemory();

    return {
      lighting,
      memory,
      materials: this.materials.size,
    };
  }
}
```

### Step 3: Implement WebGL Shader System

Create `packages/renderer/src/shaders/PBRShader.ts`:

```typescript
export class PBRShader {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    this.program = this.createProgram();
  }

  private createProgram(): WebGLProgram {
    const vertexShader = `
      attribute vec3 aPosition;
      attribute vec3 aNormal;
      attribute vec2 aTexCoord;
      attribute vec3 aTangent;

      uniform mat4 uMatrix;
      uniform mat4 uNormalMatrix;

      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec2 vTexCoord;
      varying mat3 vTBN;

      void main() {
        vPosition = (uMatrix * vec4(aPosition, 1.0)).xyz;
        vNormal = normalize((uNormalMatrix * vec4(aNormal, 0.0)).xyz);
        vTexCoord = aTexCoord;

        // Compute TBN matrix for normal mapping
        vec3 T = normalize((uNormalMatrix * vec4(aTangent, 0.0)).xyz);
        vec3 B = cross(vNormal, T);
        vTBN = mat3(T, B, vNormal);

        gl_Position = uMatrix * vec4(aPosition, 1.0);
      }
    `;

    const fragmentShader = `
      precision highp float;

      uniform sampler2D uBaseColorMap;
      uniform sampler2D uNormalMap;
      uniform sampler2D uRoughnessMap;
      uniform sampler2D uMetallicMap;
      uniform sampler2D uAOMap;

      uniform float uMetallic;
      uniform float uRoughness;
      uniform vec3 uViewPos;

      uniform vec3 uLightPositions[8];
      uniform vec3 uLightColors[8];
      uniform int uLightCount;

      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec2 vTexCoord;
      varying mat3 vTBN;

      const float PI = 3.14159265359;

      // PBR Functions
      vec3 fresnelSchlick(float cosTheta, vec3 F0) {
        return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
      }

      float DistributionGGX(vec3 N, vec3 H, float roughness) {
        float a = roughness * roughness;
        float a2 = a * a;
        float NdotH = max(dot(N, H), 0.0);
        float NdotH2 = NdotH * NdotH;
        float nom = a2;
        float denom = (NdotH2 * (a2 - 1.0) + 1.0);
        denom = PI * denom * denom;
        return nom / denom;
      }

      float GeometrySchlickGGX(float NdotV, float roughness) {
        float r = (roughness + 1.0);
        float k = (r * r) / 8.0;
        float nom = NdotV;
        float denom = NdotV * (1.0 - k) + k;
        return nom / denom;
      }

      float GeometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
        float NdotV = max(dot(N, V), 0.0);
        float NdotL = max(dot(N, L), 0.0);
        float ggx2 = GeometrySchlickGGX(NdotV, roughness);
        float ggx1 = GeometrySchlickGGX(NdotL, roughness);
        return ggx1 * ggx2;
      }

      void main() {
        vec3 baseColor = texture2D(uBaseColorMap, vTexCoord).rgb;
        vec3 normal = normalize(vTBN * (texture2D(uNormalMap, vTexCoord).rgb * 2.0 - 1.0));
        float roughness = texture2D(uRoughnessMap, vTexCoord).r;
        float metallic = texture2D(uMetallicMap, vTexCoord).r;
        float ao = texture2D(uAOMap, vTexCoord).r;

        vec3 N = normalize(normal);
        vec3 V = normalize(uViewPos - vPosition);
        
        vec3 F0 = vec3(0.04);
        F0 = mix(F0, baseColor, metallic);

        vec3 Lo = vec3(0.0);

        // Calculate lighting contribution from each light
        for (int i = 0; i < 8; i++) {
          if (i >= uLightCount) break;

          vec3 L = normalize(uLightPositions[i] - vPosition);
          vec3 H = normalize(V + L);
          
          float NdotL = max(dot(N, L), 0.0);

          // Calculate radiance
          vec3 radiance = uLightColors[i];

          // Cook-Torrance BRDF
          float NDF = DistributionGGX(N, H, roughness);
          float G = GeometrySmith(N, V, L, roughness);
          vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);

          vec3 kS = F;
          vec3 kD = vec3(1.0) - kS;
          kD *= 1.0 - metallic;

          vec3 numerator = NDF * G * F;
          float denominator = 4.0 * max(dot(N, V), 0.0) * NdotL + 0.001;
          vec3 specular = numerator / denominator;

          Lo += (kD * baseColor / PI + specular) * radiance * NdotL;
        }

        vec3 ambient = vec3(0.03) * baseColor * ao;
        vec3 color = ambient + Lo;

        // Tone mapping
        color = color / (color + vec3(1.0));
        
        // Gamma correction
        color = pow(color, vec3(1.0 / 2.2));

        gl_FragColor = vec4(color, 1.0);
      }
    `;

    const program = this.gl.createProgram()!;
    const vShader = this.compileShader(vertexShader, this.gl.VERTEX_SHADER);
    const fShader = this.compileShader(fragmentShader, this.gl.FRAGMENT_SHADER);

    this.gl.attachShader(program, vShader);
    this.gl.attachShader(program, fShader);
    this.gl.linkProgram(program);

    return program;
  }

  private compileShader(source: string, type: number): WebGLShader {
    const shader = this.gl.createShader(type)!;
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    return shader;
  }

  useProgram() {
    this.gl.useProgram(this.program);
  }

  getUniformLocation(name: string): WebGLUniformLocation {
    return this.gl.getUniformLocation(this.program, name)!;
  }
}
```

### Step 4: Integrate into Scene Renderer

Update `packages/runtime/src/SceneRenderer.ts`:

```typescript
import { GraphicsPipelineService } from './services/GraphicsPipelineService';
import { PBRShader } from '../renderer/shaders/PBRShader';

export class SceneRenderer {
  private gl: WebGLRenderingContext;
  private graphicsPipeline: GraphicsPipelineService;
  private pbrShader: PBRShader;

  constructor(canvas: HTMLCanvasElement, scene: Scene) {
    this.gl = canvas.getContext('webgl')!;

    // Initialize graphics pipeline
    if (scene.graphics) {
      this.graphicsPipeline = new GraphicsPipelineService(scene.graphics);
    }

    // Initialize PBR shader
    this.pbrShader = new PBRShader(this.gl);
  }

  render() {
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

    // Get graphics configuration
    const materials = this.graphicsPipeline.getMaterial('default');
    const lighting = this.graphicsPipeline.getLighting();
    const rendering = this.graphicsPipeline.getRendering();

    // Use PBR shader
    this.pbrShader.useProgram();

    // Apply material properties
    if (materials) {
      const materialConfig = materials.getMaterial();
      // Set uniforms from material config
    }

    // Apply lighting
    const lights = lighting.getLights();
    // Set light uniforms

    // Apply rendering optimizations
    const lods = rendering.getLODLevels();
    // Apply LOD selection based on distance
  }
}
```

---

## HoloScript Language Integration

### Trait Annotation Syntax

HoloScript supports trait annotations directly in the language:

```hsplus
composition "MaterialDemo" {
  // Basic material specification
  template "Sphere" {
    @material {
      type: pbr
      baseColor: { r: 0.8, g: 0.2, b: 0.2 }
      metallic: 0.5
      roughness: 0.4
    }

    @lighting {
      preset: studio
      shadows: true
    }

    @rendering {
      quality: high
      lod: true
      culling: true
    }
    geometry: "sphere"
  }

  object "Sphere" using "Sphere" {
    position: [0, 0, 0]
  }
}
```

### Parser Extension

Update `packages/core/src/parser/HoloScriptPlusParser.ts`:

```typescript
export class HoloScriptPlusParser {
  parseTraitAnnotation(token: string): TraitAnnotation {
    if (token.startsWith('@material')) {
      return this.parseMaterialTrait(token);
    }
    if (token.startsWith('@lighting')) {
      return this.parseLightingTrait(token);
    }
    if (token.startsWith('@rendering')) {
      return this.parseRenderingTrait(token);
    }
    throw new Error(`Unknown trait annotation: ${token}`);
  }

  private parseMaterialTrait(token: string): MaterialTraitAnnotation {
    const config = this.parseObjectLiteral(token);
    return {
      type: 'material',
      config,
    };
  }

  private parseLightingTrait(token: string): LightingTraitAnnotation {
    const config = this.parseObjectLiteral(token);
    return {
      type: 'lighting',
      config,
    };
  }

  private parseRenderingTrait(token: string): RenderingTraitAnnotation {
    const config = this.parseObjectLiteral(token);
    return {
      type: 'rendering',
      config,
    };
  }
}
```

---

## Performance Optimization Guidelines

### Mobile Optimization

```typescript
// Use low quality preset
rendering.optimizeForMobile();
rendering.applyQualityPreset('low');

// Reduce texture resolution
rendering.setMaxTextureResolution(512);

// Compress textures aggressively
material.setCompression('astc');

// Limit shadow casters
lighting.getLights().filter((l) => l.shadow).length <= 2;
```

### Desktop Optimization

```typescript
// Use high quality preset
rendering.optimizeForDesktop();
rendering.applyQualityPreset('high');

// Full resolution textures
rendering.setMaxTextureResolution(4096);

// No compression needed
material.setCompression('none');

// Allow multiple shadow casters
lighting.getLights().filter((l) => l.shadow).length <= 8;
```

### VR Optimization

```typescript
// VR-specific settings
rendering.optimizeForVRAR(90); // 90 FPS
rendering.applyQualityPreset('high');

// Balanced texture resolution
rendering.setMaxTextureResolution(2048);

// Compress for bandwidth
material.setCompression('basis');

// Minimal shadow casters (performance critical)
lighting.getLights().filter((l) => l.shadow).length <= 4;
```

---

## Testing & Validation

### Performance Benchmarks

Create `packages/runtime/tests/graphics-performance.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { GraphicsPipelineService } from '../src/services/GraphicsPipelineService';

describe('Graphics Performance', () => {
  it('should render complex scene within 16ms (60 FPS)', () => {
    const config = {
      materials: { pbr: { metallic: 0.8 } },
      lighting: { lights: 5, shadows: true },
      rendering: { quality: 'high', lod: true },
    };

    const start = performance.now();
    const pipeline = new GraphicsPipelineService(config);
    const stats = pipeline.getPerformanceStats();
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(16);
    expect(stats.lighting.estimatedGPUCost).toBeLessThan(500);
  });

  it('should optimize GPU memory for mobile', () => {
    const config = {
      rendering: { quality: 'low', platform: 'mobile' },
    };

    const pipeline = new GraphicsPipelineService(config);
    const memory = pipeline.getRendering().estimateGPUMemory();

    expect(memory.estimatedTotal).toBeLessThan(256); // 256 MB max
  });
});
```

---

## Next Steps

1. **Implement GraphicsPipelineService** in Hololand's runtime
2. **Create PBR Shader System** with WebGL/WebGPU support
3. **Extend HoloScript Parser** for trait annotations
4. **Build Material Asset Pipeline** for texture compression
5. **Add Performance Monitoring** dashboard
6. **Create Creator Documentation** with examples
7. **Benchmark on Target Platforms** (mobile, VR, desktop)

---

## Resources

- [GRAPHICS_TRAITS.md](../GRAPHICS_TRAITS.md) - Complete API reference
- [GRAPHICS_QUICK_START.md](../GRAPHICS_QUICK_START.md) - Quick start guide
- [examples/graphics-traits.ts](../examples/graphics-traits.ts) - Real-world examples
- [GRAPHICS_IMPLEMENTATION_SUMMARY.md](../GRAPHICS_IMPLEMENTATION_SUMMARY.md) - Implementation details
