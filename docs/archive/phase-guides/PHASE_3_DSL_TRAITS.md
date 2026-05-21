# Phase 3: HoloScript+ DSL Trait Annotations

Declarative trait configuration system enabling graphics properties to be specified directly in HoloScript+ code.

## Overview

Phase 3 introduces trait annotation syntax to HoloScript+, allowing developers to attach graphics configurations to virtual objects declaratively:

```holoscript
composition myObject {
  position: [0, 0, 0]
  @material { type: pbr, metallic: 0.8, roughness: 0.2 }
  @lighting { type: directional, intensity: 1.5 }
  @rendering { quality: high, lod: true }
}
```

## Architecture

### HoloScriptPlusParser

Located at `packages/core/src/HoloScriptPlusParser.ts` (1,000+ LOC), this extended parser adds:

**Trait Annotation Types:**

- `MaterialTraitAnnotation` - PBR material configuration
- `LightingTraitAnnotation` - Light sources and illumination
- `RenderingTraitAnnotation` - Quality and performance settings

**Core Methods:**

```typescript
// Extract all trait annotations from code
extractTraitAnnotations(code: string, orbLine?: number): AnyTraitAnnotation[]

// Parse object literal configuration
parseObjectLiteral(str: string): Record<string, unknown>

// Parse individual values (handles strings, numbers, booleans, objects, arrays)
parseValue(str: string): unknown

// Build complete graphics configuration from traits
buildGraphicsConfig(traits: AnyTraitAnnotation[]): GraphicsConfiguration

// Validate trait configuration
validateTraitAnnotation(trait: AnyTraitAnnotation): { valid: boolean; errors: string[] }

// Create actual trait instances from config
createGraphicsTraits(config: GraphicsConfiguration): void
```

## Trait Annotations

### @material - PBR Material Configuration

```holoscript
@material {
  type: pbr,
  metallic: 0.8,
  roughness: 0.2,
  color: { r: 1.0, g: 0.8, b: 0.0 },
  baseTexture: "metal.png",
  normalMap: "metal_normal.png",
  compression: astc
}
```

**Supported Properties:**

- `type: 'pbr' | 'standard' | 'unlit'` - Material model
- `metallic: 0-1` - Surface metallic property
- `roughness: 0-1` - Surface roughness (inverse of glossiness)
- `color: { r, g, b }` - Base color (RGB 0-1)
- `baseTexture: string` - Diffuse/albedo texture path
- `normalMap: string` - Normal map for surface detail
- `metallicMap: string` - Metallic property map
- `roughnessMap: string` - Roughness property map
- `compression: 'astc' | 'basis' | 'none'` - Texture compression

**Presets Available:**

- `gold` - Gold material with high metallic value
- `copper` - Copper with reddish tone
- `steel` - Steel with high roughness
- `plastic` - Plastic with lower metallic value
- `wood` - Wood material with specific roughness
- `concrete` - Rough concrete surface
- `glass` - Transparent glass material

**Validation Rules:**

- `metallic` and `roughness` must be 0-1
- `color` RGB values must be 0-1
- `type` must be valid material model
- `compression` must be supported format

### @lighting - Light Source and Illumination

```holoscript
@lighting {
  type: directional,
  intensity: 1.5,
  color: { r: 1.0, g: 1.0, b: 1.0 },
  shadows: true,
  shadowType: hard,
  castShadows: true,
  lightProbes: true
}
```

**Supported Properties:**

- `type: 'directional' | 'point' | 'spot'` - Light type
- `intensity: number` - Light brightness (0+)
- `color: { r, g, b }` - Light color (RGB 0-1)
- `shadows: boolean` - Enable shadow mapping
- `shadowType: 'hard' | 'soft'` - Shadow edge quality
- `shadowResolution: 'low' | 'medium' | 'high'` - Shadow texture resolution
- `castShadows: boolean` - This light casts shadows
- `lightProbes: boolean` - Use light probes for baking
- `range: number` - Light falloff distance (point/spot)
- `angle: number` - Spot light cone angle

**Presets Available:**

- `studio` - Professional 3-point studio lighting
- `outdoor` - Natural outdoor sunlight
- `night` - Dark ambient with moonlight
- `theatrical` - High-contrast stage lighting
- `dawn` - Golden hour sunrise lighting

**Validation Rules:**

- `intensity` must be positive
- `shadowType` only valid if `shadows: true`
- `angle` only valid for spot lights
- `range` only valid for point/spot lights
- Color values must be 0-1

### @rendering - Quality and Performance Settings

```holoscript
@rendering {
  quality: high,
  platform: desktop,
  lod: true,
  culling: true,
  compression: none,
  maxLights: 8,
  targetFPS: 60
}
```

**Supported Properties:**

- `quality: 'low' | 'medium' | 'high' | 'ultra'` - Rendering quality
- `platform: 'mobile' | 'vr' | 'desktop'` - Target platform
- `lod: boolean` - Level-of-detail enabled
- `culling: boolean` - Frustum/occlusion culling
- `compression: 'astc' | 'basis' | 'none'` - Texture compression format
- `maxLights: number` - Maximum active light count
- `targetFPS: number` - Target frame rate (30-144)
- `batching: boolean` - Draw call batching
- `instancing: boolean` - GPU instancing for repeated geometry

**Quality Presets:**

- `low` - Mobile/low-end optimization (256MB budget, max 2 lights)
- `medium` - Standard desktop optimization (512MB budget, max 4 lights)
- `high` - High-end desktop optimization (1GB budget, max 8 lights)
- `ultra` - High-end desktop with all features (2GB budget, max 16 lights)

**Platform Presets:**

- `mobile` - Mobile device optimization (256MB GPU memory)
- `vr` - VR headset optimization (512MB GPU memory, 90 FPS target)
- `desktop` - Desktop computer optimization (2GB GPU memory)

**Validation Rules:**

- `quality` must be valid preset
- `platform` must be supported platform
- `maxLights` must be positive integer
- `targetFPS` must be 30-144
- `compression` must be supported format

## Usage Examples

### Basic Material Configuration

```holoscript
composition goldenStatue {
  position: [0, 2, 0]
  scale: 2
  @material {
    type: pbr,
    metallic: 0.95,
    roughness: 0.1,
    color: { r: 1.0, g: 0.84, b: 0.0 }
  }
}
```

### Complete Graphics Setup

```holoscript
composition sciFiCube {
  position: [0, 0, 0]

  @material {
    type: pbr,
    metallic: 0.8,
    roughness: 0.15,
    baseTexture: "sci-fi-metal.png"
  }

  @lighting {
    type: point,
    intensity: 2.0,
    color: { r: 0.0, g: 0.5, b: 1.0 },
    range: 10
  }

  @rendering {
    quality: high,
    platform: desktop,
    lod: true,
    compression: none
  }
}
```

### Mobile-Optimized Scene

```holoscript
composition mobileObject {
  position: [0, 0, 0]

  @material {
    type: standard,
    color: { r: 1.0, g: 1.0, b: 1.0 },
    compression: astc
  }

  @lighting {
    type: directional,
    intensity: 1.0,
    shadows: false
  }

  @rendering {
    platform: mobile,
    quality: low,
    compression: astc,
    maxLights: 2,
    targetFPS: 60
  }
}
```

### VR-Optimized Scene

```holoscript
composition vrObject {
  position: [0, 1.5, -1]

  @material {
    type: pbr,
    metallic: 0.5,
    roughness: 0.5,
    compression: basis
  }

  @rendering {
    platform: vr,
    quality: medium,
    compression: basis,
    targetFPS: 90
  }
}
```

## API Reference

### HoloScriptPlusParser

```typescript
class HoloScriptPlusParser {
  // Extract annotations from code
  extractTraitAnnotations(code: string, orbLine?: number): AnyTraitAnnotation[];

  // Parse object literal syntax
  parseObjectLiteral(str: string): Record<string, unknown>;

  // Parse individual values
  parseValue(str: string): unknown;

  // Build complete graphics configuration
  buildGraphicsConfig(traits: AnyTraitAnnotation[]): GraphicsConfiguration;

  // Validate trait annotation
  validateTraitAnnotation(trait: AnyTraitAnnotation): { valid: boolean; errors: string[] };

  // Validate specific trait type
  validateMaterialTrait(trait: MaterialTraitAnnotation): { valid: boolean; errors: string[] };
  validateLightingTrait(trait: LightingTraitAnnotation): { valid: boolean; errors: string[] };
  validateRenderingTrait(trait: RenderingTraitAnnotation): { valid: boolean; errors: string[] };

  // Create trait instances
  createGraphicsTraits(config: GraphicsConfiguration): void;
  createMaterialTrait(config: MaterialTraitAnnotation['config']): MaterialTrait;
  createLightingTrait(config: LightingTraitAnnotation['config']): LightingTrait;
  createRenderingTrait(config: RenderingTraitAnnotation['config']): RenderingTrait;
}
```

### Type Definitions

```typescript
interface MaterialTraitAnnotation {
  type: 'material';
  config: {
    type: 'pbr' | 'standard' | 'unlit';
    metallic?: number;
    roughness?: number;
    color?: { r: number; g: number; b: number };
    baseTexture?: string;
    normalMap?: string;
    metallicMap?: string;
    roughnessMap?: string;
    compression?: 'astc' | 'basis' | 'none';
  };
}

interface LightingTraitAnnotation {
  type: 'lighting';
  config: {
    type: 'directional' | 'point' | 'spot';
    intensity: number;
    color?: { r: number; g: number; b: number };
    shadows?: boolean;
    shadowType?: 'hard' | 'soft';
    shadowResolution?: 'low' | 'medium' | 'high';
    castShadows?: boolean;
    lightProbes?: boolean;
    range?: number;
    angle?: number;
  };
}

interface RenderingTraitAnnotation {
  type: 'rendering';
  config: {
    quality: 'low' | 'medium' | 'high' | 'ultra';
    platform: 'mobile' | 'vr' | 'desktop';
    lod?: boolean;
    culling?: boolean;
    compression?: 'astc' | 'basis' | 'none';
    maxLights?: number;
    targetFPS?: number;
    batching?: boolean;
    instancing?: boolean;
  };
}

interface GraphicsConfiguration {
  material?: MaterialTraitAnnotation['config'];
  lighting?: LightingTraitAnnotation['config'];
  rendering?: RenderingTraitAnnotation['config'];
}
```

## Testing

Phase 3 includes comprehensive test coverage with 40 test cases:

**Material Trait Tests (6):**

- Parsing material annotations from code
- PBR property validation
- Compression format handling
- Validation error reporting

**Lighting Trait Tests (6):**

- Parsing lighting annotations
- Light type validation
- Shadow configuration
- Preset application

**Rendering Trait Tests (8):**

- Quality preset handling
- Platform-specific optimization
- Compression selection
- Performance configuration

**Combined Tests (3):**

- Multiple traits on single object
- Graphics configuration building
- Edge case handling

Run tests with:

```bash
pnpm test -- HoloScriptPlusParser.test.ts
```

## Integration with Phase 4-5

Phase 3 output feeds into:

1. **Phase 4 (Graphics Pipeline)** - Trait configurations are passed to `HololandGraphicsPipelineService`
2. **Phase 5 (Performance Optimizer)** - Rendering settings guide adaptive quality decisions

Example integration:

```typescript
const parser = new HoloScriptPlusParser();
const traits = parser.extractTraitAnnotations(holoScriptCode);
const config = parser.buildGraphicsConfig(traits);

// Phase 4: Apply to graphics pipeline
const graphicsService = new HololandGraphicsPipelineService('desktop');
graphicsService.initialize(config);

// Phase 5: Optimize for device
const optimizer = new PlatformPerformanceOptimizer(deviceInfo);
const optimized = optimizer.optimizeForDevice(config);
```

## Limitations and Future Work

**Current Limitations:**

- Object literal parsing doesn't support deeply nested structures
- Texture loading is simulated (no actual WebGL implementation)
- No real-time annotation modification

**Future Enhancements:**

- Support for computed properties and references
- Constraint-based material selection
- Performance budgeting system
- Runtime trait modification
- Trait inheritance and composition

## See Also

- [Phase 4: Hololand Graphics Pipeline](./PHASE_4_GRAPHICS_PIPELINE.md)
- [Phase 5: Platform Performance Optimization](./PHASE_5_PERFORMANCE.md)
- [Graphics Traits Overview](./GRAPHICS_TRAITS.md)
