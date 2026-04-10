# Phase 4: Hololand Graphics Pipeline

GPU-aware graphics rendering system with material management, PBR shader generation, and platform-specific optimization.

## Overview

Phase 4 implements `HololandGraphicsPipelineService`, a comprehensive graphics rendering pipeline that:

- Manages GPU memory allocation across platforms
- Generates physically-based rendering (PBR) shaders in WebGL
- Handles material and texture asset lifecycle
- Provides platform-specific quality configurations
- Tracks real-time performance metrics

## Architecture

### HololandGraphicsPipelineService

Located at `packages/core/src/services/HololandGraphicsPipelineService.ts` (900+ LOC), this service manages:

**Asset Caches:**

- `materialCache: Map<string, MaterialAsset>` - Loaded materials
- `textureCache: Map<string, TextureAsset>` - Loaded textures
- `shaderCache: Map<string, ShaderProgram>` - Compiled shaders

**Platform Configurations:**

- **Mobile** (256MB GPU memory)
  - Quality: Low to Medium
  - Max lights: 2
  - Max textures: 128x128
  - Compression: ASTC

- **VR** (512MB GPU memory)
  - Quality: Medium to High
  - Max lights: 4
  - Target FPS: 90
  - Compression: Basis

- **Desktop** (2048MB GPU memory)
  - Quality: High to Ultra
  - Max lights: 8-16
  - Max textures: 4096x4096
  - Compression: Optional

## Core Components

### Material Assets

```typescript
interface MaterialAsset {
  id: string;
  name: string;
  type: 'pbr' | 'standard' | 'unlit';

  // PBR Properties
  baseColor: Color;
  metallic: number;
  roughness: number;

  // Textures
  baseTexture?: TextureAsset;
  normalMap?: TextureAsset;
  metallicMap?: TextureAsset;
  roughnessMap?: TextureAsset;

  // Rendering
  shader: ShaderProgram;
  gpuMemory: number;
  lastUsed: number;
}
```

### Texture Assets

```typescript
interface TextureAsset {
  id: string;
  path: string;
  width: number;
  height: number;
  format: 'jpeg' | 'png' | 'webp' | 'basis' | 'astc';
  compression: boolean;
  mipMaps: boolean;
  gpuMemory: number;
}
```

### Shader Programs

```typescript
interface ShaderProgram {
  id: string;
  vertexSource: string; // WebGL vertex shader
  fragmentSource: string; // WebGL fragment shader
  compiled: boolean;
  uniforms: Record<string, ShaderUniform>;
}
```

## Key Methods

### Initialization

```typescript
// Initialize graphics pipeline for platform
initialize(config: GraphicsConfiguration): Promise<void>

// Setup materials from configuration
initializeMaterials(): Promise<void>

// Setup lighting system
initializeLighting(): Promise<void>

// Setup rendering system
initializeRendering(): Promise<void>
```

### Material Management

```typescript
// Create material from configuration
createMaterialAsset(config: MaterialConfig): MaterialAsset

// Load and cache material
loadMaterial(name: string, config: MaterialConfig): Promise<void>

// Get material from cache
getMaterial(name: string): MaterialAsset | undefined

// Update material properties
updateMaterial(name: string, properties: Partial<MaterialAsset>): void
```

### Shader Generation

```typescript
// Generate PBR shader for material
generatePBRShader(config: MaterialConfig): ShaderProgram

// Generate shader with specific features
generateShader(
  vertexShaderCode: string,
  fragmentShaderCode: string
): ShaderProgram

// Compile shader program
compileShader(shader: ShaderProgram): boolean
```

### Texture Management

```typescript
// Load and cache texture
loadTexture(path: string, options?: TextureOptions): Promise<TextureAsset>

// Load textures from configuration
loadTexturesFromConfig(config: MaterialConfig): Promise<void>

// Get texture from cache
getTexture(path: string): TextureAsset | undefined

// Unload unused textures
pruneTextureCache(): void
```

### Lighting

```typescript
// Setup shadow mapping
setupShadowMapping(config: ShadowConfig): void

// Setup global illumination
setupGlobalIllumination(config: GIConfig): void

// Set light probe data
setLightProbes(probes: LightProbeData[]): void
```

### Performance

```typescript
// Get GPU memory estimation
getGPUMemoryEstimate(): GPUMemoryEstimate

// Get current performance metrics
getPerformanceMetrics(): PerformanceMetrics

// Apply quality preset
applyQualityPreset(quality: 'low' | 'medium' | 'high' | 'ultra'): void

// Optimize for specific platform
optimizePlatform(platform: 'mobile' | 'vr' | 'desktop'): void
```

## Usage Examples

### Basic Setup

```typescript
import { HololandGraphicsPipelineService } from '@holoscript/core';

// Create service for desktop platform
const graphicsService = new HololandGraphicsPipelineService('desktop');

// Initialize with configuration
const config = {
  material: {
    type: 'pbr',
    metallic: 0.8,
    roughness: 0.2,
    color: { r: 1.0, g: 0.8, b: 0.0 },
  },
  lighting: {
    type: 'directional',
    intensity: 1.5,
  },
};

await graphicsService.initialize(config);
```

### Material Creation

```typescript
// Create gold material
const goldMaterial = graphicsService.createMaterialAsset({
  type: 'pbr',
  metallic: 0.95,
  roughness: 0.1,
  color: { r: 1.0, g: 0.84, b: 0.0 },
  baseTexture: 'gold-diffuse.png',
  normalMap: 'gold-normal.png',
});

// Apply material to object
object.material = goldMaterial;
```

### Platform-Specific Optimization

```typescript
// Optimize for mobile device
if (isMobileDevice()) {
  graphicsService.optimizePlatform('mobile');

  // Results in:
  // - 256MB GPU memory budget
  // - Low quality presets
  // - ASTC texture compression
  // - Max 2 active lights
}

// Optimize for VR headset
if (isVRSupported()) {
  graphicsService.optimizePlatform('vr');

  // Results in:
  // - 512MB GPU memory budget
  // - 90 FPS target
  // - Basis texture compression
  // - Max 4 active lights
}
```

### Shader Customization

```typescript
// Generate custom PBR shader
const pbrShader = graphicsService.generatePBRShader({
  type: 'pbr',
  metallic: 0.5,
  roughness: 0.5,
});

// Result: WebGL-compatible vertex and fragment shaders with:
// - PBR material properties
// - Normal mapping support
// - Shadow map calculations
// - Specular highlights
```

### GPU Memory Management

```typescript
// Get memory breakdown
const memoryEstimate = graphicsService.getGPUMemoryEstimate();

console.log(`Texture Memory: ${memoryEstimate.textureMemory} MB`);
console.log(`Geometry Memory: ${memoryEstimate.geometryMemory} MB`);
console.log(`Buffer Memory: ${memoryEstimate.bufferMemory} MB`);
console.log(`Total Estimated: ${memoryEstimate.estimatedTotal} MB`);
console.log(`Platform Budget: ${memoryEstimate.budget} MB`);
console.log(`Utilization: ${(memoryEstimate.utilization * 100).toFixed(1)}%`);

// Prune if over budget
if (memoryEstimate.utilization > 0.85) {
  graphicsService.pruneTextureCache();
}
```

### Performance Metrics

```typescript
// Get current performance metrics
const metrics = graphicsService.getPerformanceMetrics();

console.log(`FPS: ${metrics.fps}`);
console.log(`GPU Time: ${metrics.gpuTimeMs} ms`);
console.log(`Draw Calls: ${metrics.drawCalls}`);
console.log(`Vertices Rendered: ${metrics.verticesRendered}`);
console.log(`Active Lights: ${metrics.activeLights}`);
```

## PBR Shader Generation

The service generates physically-based rendering shaders in WebGL 2.0+ format:

### Vertex Shader Structure

```glsl
precision highp float;

// Input attributes
layout(location = 0) in vec3 position;
layout(location = 1) in vec3 normal;
layout(location = 2) in vec2 texCoord;
layout(location = 3) in vec4 tangent;

// Uniforms
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;

// Output to fragment shader
out vec3 vNormal;
out vec2 vTexCoord;
out vec3 vWorldPos;

void main() {
  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
  vTexCoord = texCoord;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPos, 1.0);
}
```

### Fragment Shader Structure

```glsl
precision highp float;

// Input from vertex shader
in vec3 vNormal;
in vec2 vTexCoord;
in vec3 vWorldPos;

// Material properties
uniform vec3 baseColor;
uniform float metallic;
uniform float roughness;
uniform sampler2D baseTexture;
uniform sampler2D normalMap;

// Lighting
uniform vec3 lightPos;
uniform vec3 lightColor;
uniform float lightIntensity;

// Output
out vec4 FragColor;

// PBR functions...
vec3 fresnelSchlick(float cosTheta, vec3 F0) { /* ... */ }
float DistributionGGX(vec3 N, vec3 H, float a) { /* ... */ }
float GeometrySchlickGGX(float NdotV, float a) { /* ... */ }

void main() {
  // Sample textures
  vec3 albedo = texture(baseTexture, vTexCoord).rgb * baseColor;
  vec3 normal = normalize(texture(normalMap, vTexCoord).rgb * 2.0 - 1.0);

  // PBR calculations...
  // Fresnel, Distribution, Geometry, etc.

  // Final color calculation
  FragColor = vec4(finalColor, 1.0);
}
```

## Quality Presets

### Low Quality

- Texture resolution: 512x512 max
- Lighting: 1-2 lights
- Shadows: Disabled
- LOD: Enabled (aggressive)
- GPU memory: ~64MB

### Medium Quality

- Texture resolution: 1024x1024 max
- Lighting: 2-4 lights
- Shadows: Soft (512x512)
- LOD: Enabled
- GPU memory: ~256MB

### High Quality

- Texture resolution: 2048x2048 max
- Lighting: 4-8 lights
- Shadows: Soft (1024x1024) with PCF
- LOD: Enabled (conservative)
- GPU memory: ~512MB

### Ultra Quality

- Texture resolution: 4096x4096 max
- Lighting: 8-16 lights
- Shadows: Soft (2048x2048) with advanced filtering
- LOD: Disabled
- GPU memory: 1-2GB

## Integration with Phase 3 and 5

**From Phase 3 (DSL Traits):**

- Receives `GraphicsConfiguration` from trait annotations
- Uses material/lighting/rendering trait properties

**To Phase 5 (Performance Optimizer):**

- Provides actual GPU memory usage and performance metrics
- Receives adaptive quality recommendations
- Applies optimizer-suggested settings

Example flow:

```typescript
// Phase 3: Extract traits from HoloScript+
const parser = new HoloScriptPlusParser();
const traits = parser.extractTraitAnnotations(code);
const config = parser.buildGraphicsConfig(traits);

// Phase 4: Initialize graphics pipeline
const graphicsService = new HololandGraphicsPipelineService('desktop');
await graphicsService.initialize(config);

// Phase 5: Monitor and optimize
const optimizer = new PlatformPerformanceOptimizer(deviceInfo);
const metrics = graphicsService.getPerformanceMetrics();
optimizer.updateFrameMetrics(metrics.fps, metrics.gpuMemory);

// Apply recommendations
const recommendations = optimizer.getRecommendations();
if (recommendations.includes('reduce quality')) {
  graphicsService.applyQualityPreset('medium');
}
```

## Performance Considerations

**Memory Budget:**

- Each texture needs width × height × bytes-per-pixel
- ASTC compression: ~0.67 bytes per pixel (mobile)
- Basis compression: ~1 byte per pixel (VR)
- No compression: ~4 bytes per pixel (desktop RGB)

**Rendering Performance:**

- Draw call optimization through batching
- LOD selection based on distance
- Frustum culling for occluded objects
- Shadow map cascades for large scenes

**GPU Utilization:**

- Monitor total GPU memory vs platform budget
- Prune unused textures automatically
- Scale down resolutions if over budget
- Recommend platform switch if needed

## Testing

Phase 4 includes 20+ test cases covering:

**Service Initialization:**

- Platform-specific setup (mobile/VR/desktop)
- GPU memory management
- Asset cache initialization

**Material Management:**

- Asset creation and caching
- Property updates
- Memory estimation

**Shader Generation:**

- PBR shader creation
- Vertex/fragment shader structure
- Uniform setup

**Performance:**

- Memory estimation accuracy
- Metrics collection
- Quality presets

Run tests with:

```bash
pnpm test -- GraphicsServices.test.ts
```

## Future Enhancements

- Real WebGL context integration
- Texture streaming system
- Advanced shadow techniques (VSM, PCSS)
- Real-time GI with probes
- Material library system
- Shader caching and optimization
- Compute shader support

## See Also

- [Phase 3: DSL Trait Annotations](./PHASE_3_DSL_TRAITS.md)
- [Phase 5: Platform Performance Optimization](./PHASE_5_PERFORMANCE.md)
- [Graphics Traits Overview](./GRAPHICS_TRAITS.md)
