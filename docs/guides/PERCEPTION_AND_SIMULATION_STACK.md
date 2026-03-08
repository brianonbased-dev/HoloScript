# Perception & Simulation Stack: Production Guide

**Version**: 4.2
**Audience**: Professional 3D artists and game developers (Unity/Unreal background)
**Last Updated**: 2026-03-07

> Comprehensive production-quality guide for HoloScript's scene-level rendering, physics, particles, post-processing, and audio blocks. Covers when to use scene-level blocks vs trait-level alternatives, full syntax reference, integration patterns, and platform-specific performance optimization for Quest/desktop/mobile.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture: Scene-Level Blocks vs Trait-Level](#architecture-scene-level-blocks-vs-trait-level)
3. [PBR Material Blocks](#pbr-material-blocks)
4. [Subsurface Scattering Materials](#subsurface-scattering-materials)
5. [Particles](#particles)
6. [Post-Processing](#post-processing)
7. [Audio Sources](#audio-sources)
8. [Reverb Zones](#reverb-zones)
9. [Wind Zones](#wind-zones)
10. [Gravity Zones](#gravity-zones)
11. [Articulations](#articulations)
12. [Integration Patterns](#integration-patterns)
13. [Cross-Platform Compilation](#cross-platform-compilation)
14. [Performance Optimization](#performance-optimization)
15. [AAA-Quality Scene Examples](#aaa-quality-scene-examples)

---

## Overview

HoloScript's Perception & Simulation Stack provides **scene-level domain blocks** for rendering, physics, audio, particles, and post-processing. These are first-class language constructs parsed by the tree-sitter grammar and compiled to every supported target platform.

**Key architectural points:**

- All perception blocks are parsed as `HoloDomainBlock` AST nodes with domain types: `material`, `physics`, `vfx`, `postfx`, `audio`
- Each block has: `keyword`, `name`, `traits` (decorators), `properties`, optional `children` (sub-blocks), optional `eventHandlers`
- Blocks can appear **top-level** (reusable across compositions) or **inside compositions** (scene-local)
- Trait handlers in `packages/core/src/traits/` provide runtime behavior (attach, detach, update, event loops)
- `ResourceBudgetAnalyzer` enforces per-platform resource limits at compile time

**Source files:**
- Compiler: `packages/core/src/compiler/DomainBlockCompilerMixin.ts`
- Grammar: `packages/tree-sitter-holoscript/grammar.js` (domain block rules)
- Trait handlers: `packages/core/src/traits/*Trait.ts`

---

## Architecture: Scene-Level Blocks vs Trait-Level

HoloScript offers **two approaches** to defining perception/simulation:

### Scene-Level Blocks (This Guide)
**When to use:**
- ✅ Reusable assets across multiple scenes (materials, audio presets, post-processing pipelines)
- ✅ Complex configurations with nested sub-blocks (particle modules, articulation joints, post-FX effects)
- ✅ Named assets that need to be referenced by name from objects
- ✅ Artist-friendly declarative syntax (no code)
- ✅ Multi-platform compilation (Unity, Unreal, Godot, R3F, WebGPU, USD)

**Examples:**
```holoscript
// Top-level material (reusable)
pbr_material "BrushedSteel" @pbr {
  baseColor: #888888
  roughness: 0.3
  metallic: 1.0
}

// Top-level particle system (reusable)
particles "CampfireSmoke" @looping {
  rate: 500
  max_particles: 2000
  // ... 15+ particle modules
}
```

### Trait-Level (Alternative)
**When to use:**
- ✅ Runtime-controlled effects (GPU compute particles with millions of instances)
- ✅ Procedural generation (runtime material synthesis, dynamic audio DSP)
- ✅ Per-frame optimization (custom update loops, spatial hashing)
- ✅ Advanced features not exposed in declarative blocks (authenticated CRDTs, VR eye tracking)

**Examples:**
```typescript
// Runtime GPU particle trait (millions of particles)
import { GPUParticleTrait } from '@holoscript/core/traits/GPUParticleTrait';

const config = {
  count: 1000000,
  emission_rate: 50000,
  forces: [
    { type: 'gravity', strength: [0, -9.81, 0] },
    { type: 'vortex', center: [0, 5, 0], strength: 10 }
  ]
};
```

**Decision matrix:**

| Feature | Scene-Level Block | Trait-Level |
|---------|-------------------|-------------|
| Artist-friendly | ✅ Declarative syntax | ❌ Requires coding |
| Multi-platform export | ✅ Unity, Unreal, Godot, R3F, USD | ⚠️ Manual platform handling |
| Complex nested config | ✅ Sub-blocks + properties | ⚠️ Nested objects |
| Runtime control | ⚠️ Fixed at compile time | ✅ Full runtime API |
| Performance | ⚠️ Standard budgets | ✅ GPU compute, custom optimizations |
| Reusability | ✅ Named, top-level | ⚠️ Code sharing |

**Recommendation:** Start with scene-level blocks for 80% of use cases. Use trait-level for the 20% requiring runtime control or GPU acceleration.

---

## PBR Material Blocks

### Overview

Physically-based rendering materials with metalness-roughness workflow. Compatible with Unity Standard, Unreal PBR, Godot StandardMaterial3D, and glTF 2.0.

**Domain type**: `material`
**Compiler function**: `compileMaterialBlock()`
**Compiled type**: `CompiledMaterial`

### When to Use vs Trait-Level

**Use scene-level `pbr_material` blocks when:**
- Material configuration is **static** (doesn't change at runtime)
- Need to **reference by name** from multiple objects
- Targeting **multiple platforms** (Unity, Unreal, R3F, USD)
- Artists need to **author without code**

**Use trait-level (`MaterialTrait`) when:**
- Need **runtime material synthesis** (procedural textures, shader hot-swapping)
- Implementing **custom shaders** with compute passes
- Require **per-frame property updates** (animated roughness, emissive pulsing)

### Full Syntax Reference

**Keywords:** `pbr_material`, `material`

**Properties:**

| Property | Type | Default | Range | Description |
|----------|------|---------|-------|-------------|
| `baseColor` | `string` (hex) | `#ffffff` | - | Surface albedo color (sRGB) |
| `roughness` | `number` | `0.5` | `0.0` - `1.0` | Surface roughness (0 = mirror, 1 = diffuse) |
| `metallic` | `number` | `0.0` | `0.0` - `1.0` | Metalness (0 = dielectric, 1 = metal) |
| `opacity` | `number` | `1.0` | `0.0` - `1.0` | Surface opacity (< 1.0 enables transparency) |
| `IOR` | `number` | `1.5` | `1.0` - `2.5` | Index of refraction (water = 1.33, glass = 1.5) |
| `emissive_color` | `string` (hex) | `#000000` | - | Self-illumination color |
| `emissive_intensity` | `number` | `1.0` | `0.0` - `∞` | Emission brightness multiplier |
| `albedo_map` | `string` or block | - | - | Diffuse/albedo texture path |
| `normal_map` | `string` or block | - | - | Normal map texture path |
| `roughness_map` | `string` | - | - | Roughness texture path (R channel) |
| `metallic_map` | `string` | - | - | Metalness texture path (R channel) |
| `ao_map` | `string` or block | - | - | Ambient occlusion texture path |
| `emission_map` | `string` | - | - | Emission texture path |
| `height_map` | `string` or block | - | - | Parallax/height map texture path |

**Texture map sub-block properties** (when using structured form):

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `source` | `string` | - | Texture file path (relative to composition) |
| `tiling` | `[number, number]` | `[1, 1]` | UV tiling multiplier (X, Y) |
| `offset` | `[number, number]` | `[0, 0]` | UV offset (X, Y) |
| `filtering` | `string` | `"bilinear"` | `"bilinear"`, `"trilinear"`, `"anisotropic"` |
| `strength` | `number` | `1.0` | Effect intensity (normal maps, 0.0 - 2.0) |
| `format` | `string` | `"directx"` | Normal map format: `"opengl"` or `"directx"` |
| `intensity` | `number` | `1.0` | Effect intensity (AO maps, 0.0 - 2.0) |
| `scale` | `number` | `0.05` | Displacement scale (height maps, scene units) |
| `channel` | `string` | `"r"` | Source channel: `"r"`, `"g"`, `"b"`, `"a"` |

### Integration Patterns

#### Pattern 1: Inline String Paths
**When to use:** Simple materials with basic texture maps.

```holoscript
pbr_material "HardwoodFloor" {
  albedo_map: "textures/hardwood_albedo.png"
  normal_map: "textures/hardwood_normal.png"
  roughness_map: "textures/hardwood_roughness.png"
  ao_map: "textures/hardwood_ao.png"
  roughness: 0.55
  metallic: 0.0
}
```

**Compiles to Unity:**
```csharp
Material hardwoodFloorMat = new Material(Shader.Find("Standard"));
hardwoodFloorMat.SetTexture("_MainTex", LoadTexture("textures/hardwood_albedo.png"));
hardwoodFloorMat.SetTexture("_BumpMap", LoadTexture("textures/hardwood_normal.png"));
hardwoodFloorMat.SetFloat("_Glossiness", 0.45f);  // roughness inverted
hardwoodFloorMat.SetFloat("_Metallic", 0.0f);
```

**Compiles to Unreal C++:**
```cpp
UMaterialInstanceDynamic* HardwoodFloorMat = UMaterialInstanceDynamic::Create(BaseMaterial, this);
HardwoodFloorMat->SetTextureParameterValue("AlbedoMap", LoadTexture("textures/hardwood_albedo.png"));
HardwoodFloorMat->SetTextureParameterValue("NormalMap", LoadTexture("textures/hardwood_normal.png"));
HardwoodFloorMat->SetScalarParameterValue("Roughness", 0.55f);
HardwoodFloorMat->SetScalarParameterValue("Metallic", 0.0f);
```

#### Pattern 2: Structured Texture Blocks
**When to use:** Advanced texture control (tiling, filtering, format, strength).

```holoscript
pbr_material "WeatheredBrick" @pbr {
  albedo_map {
    source: "textures/brick_albedo.png"
    tiling: [4, 4]
    offset: [0.1, 0]
    filtering: "anisotropic"
  }
  normal_map {
    source: "textures/brick_normal.png"
    strength: 1.2
    format: "opengl"
  }
  ao_map {
    source: "textures/brick_ao.png"
    intensity: 0.8
  }
  height_map {
    source: "textures/brick_height.png"
    scale: 0.05
    channel: "r"
  }
  roughness: 0.85
  metallic: 0.0
}
```

#### Pattern 3: Emissive Materials (Neon, Holograms)
**When to use:** Self-illuminating surfaces (UI panels, neon signs, glowing lava).

```holoscript
pbr_material "NeonSign" {
  baseColor: #111111
  roughness: 0.1
  metallic: 0.8
  emissive_color: #00ffff
  emissive_intensity: 5.0
  emission_map: "textures/neon_glow.png"
}
```

**Unity compilation notes:**
- `emissive_intensity` > 1.0 enables HDR emission (Bloom-compatible)
- `emission_map` multiplies `emissive_color`
- Requires URP/HDRP for HDR bloom

#### Pattern 4: Transparent Materials
**When to use:** Glass, water, holographic overlays.

```holoscript
pbr_material "HologramOverlay" @transparent {
  baseColor: #00ffaa
  opacity: 0.6
  roughness: 0.1
  metallic: 0.0
  emission_map: "textures/hologram_scan.png"
  emissive_intensity: 2.0
}
```

**Trait requirement:** `@transparent` trait enables alpha blending. Without it, `opacity` is ignored.

### Performance Optimization

#### Quest 3 (Mobile VR)
- **Texture budget**: 512×512 for tiling textures, 1024×1024 for hero assets
- **Avoid**: Anisotropic filtering (use `"trilinear"` instead)
- **Normal map format**: Use `"directx"` (default) — 10% faster than OpenGL on Quest
- **Channel packing**: Combine roughness + metallic into single texture (R = roughness, G = metallic)

```holoscript
pbr_material "OptimizedQuestMaterial" {
  albedo_map: "textures/quest_albedo_512.png"   // 512×512
  normal_map: "textures/quest_normal_512.png"   // 512×512
  roughness_map: "textures/quest_rough_metal_512.png"  // R=roughness, G=metallic
  filtering: "trilinear"  // NOT anisotropic
}
```

#### Desktop VR (SteamVR, PCVR)
- **Texture budget**: 2048×2048 for tiling, 4096×4096 for hero assets
- **Anisotropic filtering**: Use `16x` for floor/terrain materials
- **Height maps**: Enable parallax occlusion mapping for depth

```holoscript
pbr_material "PCVRTerrain" {
  albedo_map {
    source: "textures/terrain_albedo_2k.png"
    tiling: [16, 16]
    filtering: "anisotropic"  // 16x anisotropic
  }
  normal_map {
    source: "textures/terrain_normal_2k.png"
    strength: 1.5
  }
  height_map {
    source: "textures/terrain_height_2k.png"
    scale: 0.1  // Parallax occlusion
  }
}
```

#### WebGPU / Mobile AR
- **Texture budget**: 1024×1024 max
- **Avoid**: Height maps (parallax too expensive on mobile)
- **Compression**: Use ASTC (Android) or PVRTC (iOS) — handled by compiler

### AAA-Quality Examples

#### Example 1: Photorealistic Wood Floor
```holoscript
pbr_material "OakHardwood" @pbr {
  albedo_map {
    source: "textures/oak_albedo_2k.png"
    tiling: [8, 8]
    filtering: "anisotropic"
  }
  normal_map {
    source: "textures/oak_normal_2k.png"
    strength: 1.0
    format: "directx"
  }
  roughness_map: "textures/oak_roughness_2k.png"
  ao_map {
    source: "textures/oak_ao_2k.png"
    intensity: 0.8
  }
  height_map {
    source: "textures/oak_height_2k.png"
    scale: 0.02
    channel: "r"
  }
  roughness: 0.6
  metallic: 0.0
}
```

**Realistic parameters:**
- `roughness: 0.6` — Wood has visible grain, not mirror-smooth
- `metallic: 0.0` — Wood is non-metallic (dielectric)
- `normal strength: 1.0` — Subtle grain without over-exaggeration
- `height scale: 0.02` — Minimal parallax (wood is relatively flat)

#### Example 2: Brushed Aluminum (Hero Asset)
```holoscript
pbr_material "BrushedAluminum" @pbr {
  baseColor: #cccccc
  roughness: 0.3
  metallic: 1.0
  normal_map {
    source: "textures/brushed_aluminum_normal_4k.png"
    strength: 0.8
    format: "directx"
  }
  ao_map {
    source: "textures/aluminum_ao_4k.png"
    intensity: 1.0
  }
}
```

**Realistic parameters:**
- `roughness: 0.3` — Brushed finish has directional micro-scratches
- `metallic: 1.0` — Aluminum is fully metallic
- `normal strength: 0.8` — Visible brush strokes without overpowering reflections

#### Example 3: Worn Leather (Character Asset)
```holoscript
pbr_material "WornLeather" @pbr {
  baseColor: #5a3a2a
  roughness: 0.7
  metallic: 0.0
  albedo_map {
    source: "textures/leather_albedo_2k.png"
    tiling: [1, 1]  // No tiling — unique UV layout
    filtering: "trilinear"
  }
  normal_map {
    source: "textures/leather_normal_2k.png"
    strength: 1.2
  }
  roughness_map: "textures/leather_roughness_2k.png"
  ao_map {
    source: "textures/leather_ao_2k.png"
    intensity: 1.5
  }
}
```

**Realistic parameters:**
- `roughness: 0.7` (average) — Roughness map provides per-pixel variation
- `ao intensity: 1.5` — Leather has deep pores and crevices (strong AO)
- `normal strength: 1.2` — Visible creases and texture

---

## Subsurface Scattering Materials

### Overview

Materials with subsurface scattering (SSS) for skin, wax, marble, jade, and translucent surfaces. Light penetrates the surface and scatters internally before exiting.

**Domain type**: `material`
**Keyword**: `subsurface_material`
**Trait decorator**: `@sss`

### When to Use vs Trait-Level

**Use scene-level `subsurface_material` blocks when:**
- Material is **organic** (skin, wax, fruit, leaves)
- Targeting **Unity HDRP, Unreal**, or **R3F** (SSS support)
- Need **artist-controlled** scatter radius and thickness

**Use trait-level when:**
- Implementing **custom SSS algorithms** (screen-space SSS, diffusion profiles)
- Need **runtime scatter radius** adjustment (e.g., skin flushing)

### Full Syntax Reference

**Additional properties** (beyond PBR):

| Property | Type | Default | Range | Description |
|----------|------|---------|-------|-------------|
| `subsurface_color` | `string` (hex) | `#ffffff` | - | Color of light transmitted through material |
| `subsurface_radius` | `[number, number, number]` | `[1.0, 0.2, 0.1]` | `0.0` - `∞` | RGB scatter radius in scene units |
| `subsurface_map` | `string` | - | - | Subsurface intensity map (R channel) |
| `thickness_map` | `string` | - | - | Surface thickness map (R channel, thin = white) |

### Integration Patterns

#### Pattern 1: Realistic Human Skin
**When to use:** Character faces, hands, arms.

```holoscript
subsurface_material "HumanSkin" @sss {
  baseColor: #ddb8a0      // Fair skin tone
  roughness: 0.4          // Slightly matte (skin oils)
  metallic: 0.0           // Skin is non-metallic

  // SSS configuration
  subsurface_color: #cc4422   // Blood-like red hue
  subsurface_radius: [1.0, 0.2, 0.1]  // RGB scatter distances

  // Texture maps
  albedo_map: "textures/skin_albedo.png"
  normal_map {
    source: "textures/skin_normal.png"
    strength: 0.8   // Subtle skin pores
  }
  roughness_map: "textures/skin_roughness.png"
  subsurface_map: "textures/skin_subsurface.png"  // Nose, ears scatter more
  thickness_map: "textures/skin_thickness.png"     // Ears, eyelids thinner
}
```

**Realistic parameters:**
- `subsurface_radius: [1.0, 0.2, 0.1]` — Red light scatters 5x more than blue (Christensen et al. 2015)
- `subsurface_color: #cc4422` — Blood-like red tint (hemoglobin absorption)
- `roughness: 0.4` — Skin has micro-oils reducing roughness
- `normal strength: 0.8` — Subtle pores without exaggeration

**Unity compilation:**
```csharp
Material skinMat = new Material(Shader.Find("HDRP/Lit"));
skinMat.SetFloat("_MaterialID", 0);  // SSS material
skinMat.SetFloat("_SubsurfaceMask", 1.0f);
skinMat.SetVector("_SubsurfaceColor", new Vector4(0.8f, 0.27f, 0.13f, 1.0f));
skinMat.SetVector("_DiffusionProfileAsset", skinProfile);
```

#### Pattern 2: Wax Candle
**When to use:** Candles, soap, translucent plastics.

```holoscript
subsurface_material "BeeswaxCandle" @sss {
  baseColor: #fff4e0
  roughness: 0.3
  metallic: 0.0

  subsurface_color: #ffeecc
  subsurface_radius: [0.8, 0.6, 0.4]  // Even RGB scatter (no blood)

  normal_map {
    source: "textures/wax_normal.png"
    strength: 0.5  // Subtle drip marks
  }
}
```

**Realistic parameters:**
- `subsurface_radius: [0.8, 0.6, 0.4]` — Even RGB scatter (wax has no chromophores)
- `roughness: 0.3` — Wax has smooth finish but not mirror-like

#### Pattern 3: Jade Stone
**When to use:** Gemstones, translucent minerals.

```holoscript
subsurface_material "Jade" @sss {
  baseColor: #44aa55
  roughness: 0.1   // Polished stone
  metallic: 0.0

  subsurface_color: #88dd88
  subsurface_radius: [0.5, 0.5, 0.5]  // Even scatter

  normal_map {
    source: "textures/jade_normal.png"
    strength: 0.3  // Polished, minimal bumps
  }
}
```

### Performance Optimization

#### Quest 3 (Mobile VR)
- ⚠️ **SSS is expensive** — Limit to **1-2 hero characters** maximum
- Use **screen-space SSS** (cheaper than full volumetric)
- Reduce `subsurface_radius` by 50% for mobile

```holoscript
// Mobile-optimized skin
subsurface_material "MobileSkin" @sss {
  subsurface_radius: [0.5, 0.1, 0.05]  // 50% of desktop radius
  // ... rest same as desktop
}
```

#### Desktop VR / PCVR
- Use **diffusion profiles** (Unity HDRP, Unreal) for accurate multi-layer SSS
- Enable **transmission** for thin surfaces (ears, fingers)

#### WebGPU
- ⚠️ **No native SSS support** — Falls back to standard PBR
- Alternative: Fake SSS with `emissive_map` + `opacity < 1.0`

### AAA-Quality Examples

#### Example 1: Photorealistic Skin (AAA Character)
```holoscript
subsurface_material "AAASkin_Fair" @sss {
  // Base PBR
  baseColor: #e5c8b0
  roughness: 0.35
  metallic: 0.0

  // SSS configuration (Christensen et al. 2015 parameters)
  subsurface_color: #c74422
  subsurface_radius: [1.2, 0.25, 0.12]  // Red scatter = 10x blue

  // 4K texture set
  albedo_map {
    source: "textures/skin_fair_albedo_4k.png"
    filtering: "trilinear"
  }
  normal_map {
    source: "textures/skin_fair_normal_4k.png"
    strength: 0.7
  }
  roughness_map: "textures/skin_fair_roughness_4k.png"
  subsurface_map: "textures/skin_fair_scatter_4k.png"
  thickness_map: "textures/skin_fair_thickness_4k.png"

  // Specular tweaks
  IOR: 1.4  // Skin IOR (oil layer)
}
```

**References:**
- Christensen et al. (2015): "An Approximate Reflectance Profile for Efficient Subsurface Scattering"
- Scatter radii based on real skin measurements

#### Example 2: Translucent Leaves
```holoscript
subsurface_material "Leaves" @sss {
  baseColor: #55aa33
  roughness: 0.6
  metallic: 0.0

  subsurface_color: #88dd55
  subsurface_radius: [0.3, 0.4, 0.2]  // Green scatters most

  albedo_map: "textures/leaf_albedo.png"
  normal_map {
    source: "textures/leaf_normal.png"
    strength: 1.0
  }
  subsurface_map: "textures/leaf_veins.png"  // Veins scatter less
  thickness_map: "textures/leaf_thickness.png"  // Thin = white

  // Enable two-sided rendering
  double_sided: true
}
```

---

## Particles

### Overview

GPU-accelerated particle systems with modular configuration. Supports emission, velocity, forces, color/size curves, noise, collision, trails, and sub-emitters.

**Domain type**: `vfx`
**Keywords**: `particles`, `emitter`, `vfx`, `particle_system`
**Compiler function**: `compileParticleBlock()`
**GPU Handler**: `packages/core/src/traits/GPUParticleTrait.ts`

### When to Use vs Trait-Level

**Use scene-level `particles` blocks when:**
- Particle count < **10,000** (standard CPU/GPU hybrid)
- Need **artist-friendly modules** (emission, color curves, noise)
- Targeting **multiple platforms** (Unity, Unreal, Godot, R3F)
- Configuration is **static** (fixed at compile time)

**Use trait-level (`GPUParticleTrait`) when:**
- Particle count > **100,000** (full GPU compute)
- Need **custom forces** (vortex, attractor, turbulence with octaves)
- Require **spatial hashing** for collision optimization
- Runtime control of emission/forces

**Decision matrix:**

| Feature | Scene-Level Block | Trait-Level (GPU) |
|---------|-------------------|-------------------|
| Max particles (Quest) | 5,000 | 100,000 |
| Max particles (Desktop) | 50,000 | 1,000,000+ |
| Artist-friendly | ✅ 15 modules | ❌ Code config |
| Collision | ⚠️ World only | ✅ Spatial hash |
| Forces | ⚠️ Basic | ✅ Vortex, attractor, turbulence |
| Sub-emitters | ✅ Yes | ❌ Manual |

### Full Syntax Reference

**Top-level properties:**

| Property | Type | Default | Range | Description |
|----------|------|---------|-------|-------------|
| `rate` | `number` | - | `0` - `∞` | Emission rate (particles/second) |
| `max_particles` | `number` | `1000` | `1` - platform budget | Maximum active particle count |
| `start_lifetime` | `number` or `[min, max]` | `2.0` | `0.1` - `∞` | Particle lifetime in seconds |
| `start_speed` | `number` or `[min, max]` | `1.0` | `0` - `∞` | Initial velocity magnitude (units/sec) |
| `start_size` | `number` or `[min, max]` | `0.1` | `0.001` - `∞` | Initial particle size (scene units) |
| `start_color` | `string` (hex) | `#ffffff` | - | Initial particle color (sRGB) |
| `gravity_modifier` | `number` | `0.0` | `-∞` - `∞` | Gravity scale (-1 = rise, 0 = float, 1 = fall) |
| `simulation_space` | `string` | `"local"` | `"local"`, `"world"` | Coordinate space (local = attached to emitter) |

**Trait decorators:**
- `@looping` — Continuous emission (never stops)
- `@burst` — One-shot burst (emits once, then stops)
- `@oneshot` — Alias for `@burst`
- `@gpu` — Use GPU compute (requires `GPUParticleTrait`)

### Particle Module Sub-Blocks

#### `emission` — Emission Control
| Property | Type | Description |
|----------|------|-------------|
| `rate_over_time` | `number` | Steady emission rate (particles/sec) |
| `burst_count` | `number` | Particles per burst |
| `burst_interval` | `number` | Seconds between bursts |

#### `velocity` — Initial Velocity
| Property | Type | Description |
|----------|------|-------------|
| `direction` | `[x, y, z]` | Normalized emission direction |
| `speed` | `number` | Velocity magnitude (units/sec) |
| `spread` | `number` | Cone angle in degrees (0 = laser, 180 = hemisphere) |
| `randomize` | `boolean` | Add per-particle velocity randomization |

#### `force` — Continuous Forces
| Property | Type | Description |
|----------|------|-------------|
| `gravity` | `[x, y, z]` | Gravity force vector (units/sec²) |
| `wind` | `[x, y, z]` | Wind force vector |
| `turbulence` | `number` | Turbulence intensity (0 - 1) |
| `drag` | `number` | Velocity damping (0 - 1) |

#### `color_over_life` — Color Gradient
| Property | Type | Description |
|----------|------|-------------|
| `gradient` | `string[]` | Array of hex colors across lifetime (supports alpha: `#rrggbbaa`) |
| `mode` | `string` | `"blend"` (smooth), `"random"` (pick random from gradient) |

#### `size_over_life` — Size Curve
| Property | Type | Description |
|----------|------|-------------|
| `curve` | `number[]` | Size multiplier values across lifetime (4+ values for bezier) |
| `mode` | `string` | `"linear"`, `"bezier"` |

#### `rotation_over_life` — Rotation
| Property | Type | Description |
|----------|------|-------------|
| `angular_velocity` | `[x, y, z]` | Rotation speed (degrees/sec) |
| `randomize` | `boolean` | Randomize initial rotation |

#### `noise` — Turbulence Noise
| Property | Type | Description |
|----------|------|-------------|
| `strength` | `number` | Noise displacement strength (scene units) |
| `frequency` | `number` | Noise spatial frequency (higher = smaller features) |
| `scroll_speed` | `number` | Noise animation speed (units/sec) |
| `octaves` | `number` | Noise complexity layers (1 - 4) |
| `quality` | `string` | `"low"`, `"medium"`, `"high"` |

#### `collision` — World Collision
| Property | Type | Description |
|----------|------|-------------|
| `enabled` | `boolean` | Enable particle-world collision |
| `bounce` | `number` | Bounciness factor (0 = stick, 1 = perfect bounce) |
| `lifetime_loss` | `number` | Lifetime reduction on collision (0 - 1, 1 = die instantly) |
| `dampen` | `number` | Velocity damping on collision (0 - 1) |
| `type` | `string` | `"world"`, `"planes"` |

#### `sub_emitter` — Spawn Child Particles
| Property | Type | Description |
|----------|------|-------------|
| `trigger` | `string` | `"collision"`, `"death"`, `"birth"` |
| `inherit_color` | `boolean` | Child inherits parent color |
| `inherit_size` | `number` | Size inheritance factor (0 - 1) |
| `emit_count` | `number` | Particles spawned per trigger |
| `system` | `string` | Name of sub-emitter particle system |

#### `shape` — Emission Shape
| Property | Type | Description |
|----------|------|-------------|
| `type` | `string` | `"cone"`, `"sphere"`, `"box"`, `"edge"`, `"mesh"` |
| `angle` | `number` | Cone angle (degrees) |
| `radius` | `number` | Shape radius (scene units) |
| `scale` | `[x, y, z]` | Box dimensions |
| `emit_from` | `string` | `"base"`, `"surface"`, `"volume"` |

#### `renderer` — Rendering Settings
| Property | Type | Description |
|----------|------|-------------|
| `material` | `string` | Particle material path |
| `render_mode` | `string` | `"billboard"`, `"stretched_billboard"`, `"mesh"` |
| `sort_mode` | `string` | `"distance"`, `"age"`, `"none"` |
| `max_size` | `number` | Maximum rendered size (screen pixels or scene units) |
| `alignment` | `string` | Billboard alignment: `"view"`, `"velocity"` |
| `length_scale` | `number` | Stretch factor for velocity billboards |
| `speed_scale` | `number` | Speed-dependent stretch |

#### `trails` — Particle Trails
| Property | Type | Description |
|----------|------|-------------|
| `enabled` | `boolean` | Enable trail rendering |
| `width` | `number` | Trail width (scene units) |
| `lifetime` | `number` | Trail segment lifetime (seconds) |
| `color_over_trail` | `string[]` | Color gradient along trail |
| `min_vertex_distance` | `number` | Minimum distance between trail vertices |
| `world_space` | `boolean` | Trails in world space (vs local) |

#### `texture_sheet` — Sprite Sheet Animation
| Property | Type | Description |
|----------|------|-------------|
| `tiles_x` | `number` | Horizontal tiles in sprite sheet |
| `tiles_y` | `number` | Vertical tiles in sprite sheet |
| `animation` | `string` | `"whole_sheet"`, `"single_row"` |
| `frame_rate` | `number` | Frames per second |
| `start_frame` | `number` | First frame index (0-based) |
| `cycles` | `number` | Animation loop count |

### Integration Patterns

#### Pattern 1: Simple Fire Embers (Looping)
**When to use:** Campfires, torches, forge fires.

```holoscript
particles "CampfireEmbers" @looping {
  rate: 150
  max_particles: 800
  start_lifetime: [1, 3]
  start_speed: [1, 4]
  start_size: [0.01, 0.04]
  gravity_modifier: -0.3  // Rise upward

  emission {
    rate_over_time: 150
    burst_count: 20
    burst_interval: 1.0
  }

  velocity {
    direction: [0, 1, 0]
    speed: 2
    spread: 40
  }

  color_over_life {
    gradient: ["#ffff00", "#ff8800", "#ff2200", "#00000000"]  // Yellow → Red → Fade
    mode: "blend"
  }

  size_over_life {
    curve: [1.0, 0.8, 0.3, 0.0]  // Shrink over lifetime
    mode: "bezier"
  }

  noise {
    strength: 0.6
    frequency: 3.0
    scroll_speed: 0.2
  }

  trails {
    enabled: true
    width: 0.01
    lifetime: 0.2
    color_over_trail: ["#ffcc00", "#00000000"]
    min_vertex_distance: 0.01
    world_space: true
  }

  renderer {
    material: "particles/ember_additive"
    render_mode: "billboard"
    sort_mode: "distance"
  }
}
```

**Unity compilation:**
```csharp
ParticleSystem emberSystem = gameObject.AddComponent<ParticleSystem>();
var main = emberSystem.main;
main.startLifetime = new ParticleSystem.MinMaxCurve(1f, 3f);
main.startSpeed = new ParticleSystem.MinMaxCurve(1f, 4f);
main.startSize = new ParticleSystem.MinMaxCurve(0.01f, 0.04f);
main.gravityModifier = -0.3f;
main.loop = true;

var emission = emberSystem.emission;
emission.rateOverTime = 150f;
emission.SetBurst(0, new ParticleSystem.Burst(0f, 20));

var colorOverLifetime = emberSystem.colorOverLifetime;
colorOverLifetime.enabled = true;
Gradient gradient = new Gradient();
gradient.SetKeys(
  new GradientColorKey[] { /* yellow, orange, red */ },
  new GradientAlphaKey[] { /* 1.0, 1.0, 1.0, 0.0 */ }
);
colorOverLifetime.color = gradient;

var trails = emberSystem.trails;
trails.enabled = true;
trails.widthOverTrail = 0.01f;
trails.lifetime = 0.2f;
```

#### Pattern 2: Explosion (One-Shot Burst)
**When to use:** Explosions, impacts, magical effects.

```holoscript
vfx "Explosion" @oneshot {
  max_particles: 500
  start_lifetime: [0.5, 2.0]
  start_speed: [5, 15]
  start_size: [0.2, 0.8]

  emission {
    burst_count: 200  // Emit 200 particles instantly
    burst_interval: 0
  }

  velocity {
    direction: [0, 1, 0]
    speed: 10
    spread: 180  // Full hemisphere
  }

  force {
    gravity: [0, -9.81, 0]
    drag: 0.5
  }

  collision {
    enabled: true
    bounce: 0.3
    lifetime_loss: 0.2
    type: "world"
  }

  sub_emitter {
    trigger: "collision"
    inherit_color: true
    inherit_size: 0.5
    emit_count: 5
    system: "SmokePuff"
  }

  texture_sheet {
    tiles_x: 8
    tiles_y: 8
    animation: "whole_sheet"
    frame_rate: 30
    start_frame: 0
    cycles: 1
  }

  renderer {
    material: "particles/explosion_atlas"
    render_mode: "stretched_billboard"
    length_scale: 0.5
    speed_scale: 0.1
  }
}
```

**Key features:**
- `@oneshot` — Emits once, then stops
- `spread: 180` — Full hemisphere explosion
- `sub_emitter` — Spawns smoke puffs on particle collision
- `texture_sheet` — 8×8 sprite sheet animation (64 frames)

#### Pattern 3: Rain System
**When to use:** Weather effects (rain, snow, hail).

```holoscript
particle_system "RainDrops" @looping {
  rate: 3000
  max_particles: 10000
  start_lifetime: [1.0, 2.0]
  start_speed: [8, 12]
  start_size: [0.005, 0.015]
  start_color: #aaccff
  gravity_modifier: 1.5  // Fall faster than normal gravity

  emission {
    rate_over_time: 3000
  }

  shape {
    type: "box"
    scale: [50, 0, 50]  // Large area above player
    emit_from: "volume"
  }

  velocity {
    direction: [0, -1, 0]
    speed: 10
    spread: 5  // Slight wind drift
  }

  collision {
    enabled: true
    bounce: 0.1
    lifetime_loss: 1.0  // Die on impact
    type: "world"
  }

  sub_emitter {
    trigger: "death"
    inherit_color: false
    emit_count: 3
    system: "RainSplash"
  }

  renderer {
    material: "particles/raindrop_streak"
    render_mode: "stretched_billboard"
    length_scale: 2.0
    speed_scale: 0.3
  }
}
```

**Key features:**
- `shape: box` — Rain falls from large area above player
- `gravity_modifier: 1.5` — Rain falls faster than normal gravity
- `sub_emitter: death` — Spawns splash particles when raindrops hit ground
- `stretched_billboard` — Raindrops stretch based on velocity

### Performance Optimization

#### Quest 3 (Mobile VR)
- **Max particles:** 5,000 total (all systems combined)
- **Avoid:** Collision, sub-emitters, trails (expensive)
- **Texture size:** 128×128 for particle sprites
- **Sorting:** Use `"none"` instead of `"distance"` (5-10% faster)

```holoscript
// Mobile-optimized fire
particles "MobileEmbers" @looping {
  max_particles: 500  // Reduced from 800
  // ... same config ...

  collision { enabled: false }  // Disable collision
  trails { enabled: false }     // Disable trails

  renderer {
    sort_mode: "none"  // No sorting (faster)
  }
}
```

#### Desktop VR / PCVR
- **Max particles:** 50,000 total
- **Use:** GPU compute for high particle counts (see `GPUParticleTrait`)
- **Sorting:** `"distance"` for correct transparency

#### WebGPU
- **Max particles:** 20,000
- **Avoid:** Mesh rendering mode (billboards only)
- **Compression:** Use WebP for sprite sheets

### AAA-Quality Examples

#### Example 1: Photorealistic Smoke
```holoscript
emitter "ForgeSmoke" @looping {
  rate: 80
  max_particles: 400
  start_lifetime: [3, 6]
  start_speed: [0.3, 0.8]
  start_size: [0.2, 0.5]
  gravity_modifier: -0.05  // Slight upward drift

  velocity {
    direction: [0, 1, 0.1]  // Mostly upward, slight drift
    speed: 0.5
    spread: 20
  }

  color_over_life {
    gradient: [
      "#44444488",  // Dark gray, semi-transparent
      "#33333344",  // Fade to lighter gray
      "#22222200"   // Fade to invisible
    ]
    mode: "blend"
  }

  size_over_life {
    curve: [0.5, 1.0, 1.5, 2.0]  // Grow over lifetime (smoke expands)
    mode: "bezier"
  }

  noise {
    strength: 0.3
    frequency: 1.5
    scroll_speed: 0.08
    octaves: 2
  }

  shape {
    type: "cone"
    angle: 15
    radius: 0.4
    emit_from: "base"
  }

  renderer {
    material: "particles/smoke_soft"
    render_mode: "billboard"
    sort_mode: "distance"  // Correct alpha blending
  }
}
```

**Realistic parameters:**
- `size_over_life: [0.5, 1.0, 1.5, 2.0]` — Smoke expands as it rises (realistic fluid dynamics)
- `color gradient` — Starts dark (dense), fades to light (diluted)
- `gravity_modifier: -0.05` — Slight buoyancy (hot smoke rises)

#### Example 2: Magical Sparkles (Fantasy Effect)
```holoscript
particles "MagicSparkles" @looping {
  rate: 100
  max_particles: 500
  start_lifetime: [1, 3]
  start_speed: [0.2, 0.8]
  start_size: [0.02, 0.05]
  gravity_modifier: -0.2  // Float upward

  emission {
    rate_over_time: 100
  }

  velocity {
    direction: [0, 1, 0]
    speed: 0.5
    spread: 30
  }

  color_over_life {
    gradient: [
      "#ffffaa",  // Bright yellow
      "#aaccff",  // Shift to blue
      "#ff99ff",  // Shift to magenta
      "#00000000" // Fade out
    ]
    mode: "blend"
  }

  size_over_life {
    curve: [0.5, 1.0, 1.5, 0.0]  // Grow then shrink
    mode: "bezier"
  }

  rotation_over_life {
    angular_velocity: [0, 0, 180]  // Spin around Z-axis
    randomize: true
  }

  noise {
    strength: 0.4
    frequency: 2.0
    scroll_speed: 0.15
    octaves: 3
  }

  renderer {
    material: "particles/star_additive"  // Additive blend for glow
    render_mode: "billboard"
    max_size: 0.1
  }
}
```

**Fantasy effect techniques:**
- `color_over_life` with multiple hue shifts (yellow → blue → magenta)
- `rotation_over_life` for spinning particles
- `additive` blend mode for glowing effect
- `octaves: 3` for complex turbulence

---

## Post-Processing

### Overview

Screen-space post-processing effects for cinematic look, atmospheric effects, and stylization. Supports bloom, depth-of-field, color grading, tone mapping, ambient occlusion, screen-space reflections, motion blur, and more.

**Domain type**: `postfx`
**Keywords**: `post_processing`, `post_fx`, `render_pipeline`
**Compiler function**: `compilePostProcessingBlock()`

### When to Use vs Trait-Level

**Use scene-level `post_processing` blocks when:**
- Effect configuration is **static** (fixed at compile time)
- Targeting **multiple platforms** (Unity URP/HDRP, Unreal, R3F)
- Need **artist-friendly** named effect presets

**Use trait-level when:**
- Need **runtime effect control** (dynamic DoF focus, bloom threshold)
- Implementing **custom post-processing shaders**
- Require **per-frame property updates**

### Full Syntax Reference

**Keywords:**
- `post_processing` — Standard post-processing pipeline
- `post_fx` — Shorthand for post effects
- `render_pipeline` — Full render pipeline configuration

**Effect Sub-Blocks:**

#### `bloom` — Bright Light Glow
| Property | Type | Default | Range | Description |
|----------|------|---------|-------|-------------|
| `intensity` | `number` | `0.5` | `0.0` - `∞` | Bloom strength |
| `threshold` | `number` | `1.0` | `0.0` - `∞` | Brightness threshold for bloom (HDR) |
| `scatter` | `number` | `0.7` | `0.0` - `1.0` | Bloom spread/diffusion |
| `tint` | `string` (hex) | `#ffffff` | - | Bloom color tint |
| `clamp` | `number` | `65000` | `0` - `65535` | Maximum bloom brightness |
| `high_quality` | `boolean` | `false` | - | Enable high-quality bloom (slower) |

#### `depth_of_field` — Camera Bokeh
| Property | Type | Default | Range | Description |
|----------|------|---------|-------|-------------|
| `aperture` | `number` | `5.6` | `1.0` - `22.0` | f-stop aperture (lower = more blur) |
| `focal_length` | `number` | `50` | `10` - `300` | Lens focal length (mm) |
| `focus_distance` | `number` | `10` | `0.1` - `∞` | Distance to focus plane (meters) |
| `bokeh_shape` | `string` | `"circle"` | - | Bokeh shape: `"circle"`, `"hexagon"`, `"octagon"` |
| `near_blur` | `number` | `0.5` | `0.0` - `1.0` | Near field blur intensity |
| `far_blur` | `number` | `1.0` | `0.0` - `1.0` | Far field blur intensity |

#### `color_grading` — Color Correction
| Property | Type | Default | Range | Description |
|----------|------|---------|-------|-------------|
| `temperature` | `number` | `6500` | `1000` - `20000` | Color temperature (Kelvin, 6500 = daylight) |
| `tint_offset` | `number` | `0` | `-100` - `100` | Green-magenta tint shift |
| `contrast` | `number` | `1.0` | `0.0` - `2.0` | Contrast multiplier |
| `saturation` | `number` | `1.0` | `0.0` - `2.0` | Color saturation multiplier |
| `lift` | `[r, g, b]` | `[0,0,0]` | `-1.0` - `1.0` | Shadow color adjustment |
| `gamma` | `[r, g, b]` | `[1,1,1]` | `0.1` - `5.0` | Midtone color adjustment |
| `gain` | `[r, g, b]` | `[1,1,1]` | `0.0` - `5.0` | Highlight color adjustment |
| `hue_shift` | `number` | `0` | `-180` - `180` | Global hue rotation (degrees) |
| `posterize_steps` | `number` | - | `2` - `256` | Posterization band count (stylized) |

#### `tone_mapping` — HDR to LDR
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `mode` | `string` | `"ACES"` | Algorithm: `"ACES"`, `"Neutral"`, `"Filmic"`, `"Reinhard"` |
| `exposure` | `number` | `1.0` | Exposure compensation (EV) |
| `white_point` | `number` | `6500` | White point temperature (Kelvin) |

#### `vignette` — Edge Darkening
| Property | Type | Default | Range | Description |
|----------|------|---------|-------|-------------|
| `intensity` | `number` | `0.3` | `0.0` - `1.0` | Darkening intensity |
| `smoothness` | `number` | `0.5` | `0.0` - `1.0` | Edge softness |
| `roundness` | `number` | `1.0` | `0.0` - `1.0` | Shape roundness (0 = rect, 1 = circle) |
| `color` | `string` (hex) | `#000000` | - | Vignette color |

#### `ambient_occlusion` / `ssao` — Contact Shadows
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `intensity` | `number` | `1.0` | AO darkening strength |
| `radius` | `number` | `0.5` | Sample radius (scene units) |
| `quality` | `string` | `"medium"` | `"low"`, `"medium"`, `"high"`, `"ultra"` |
| `sample_count` | `number` | `8` | Ray sample count (higher = better quality) |
| `thickness` | `number` | `0.5` | Contact shadow thickness |

#### `screen_space_reflections` / `ssr` — Reflections
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `max_distance` | `number` | `100` | Max ray trace distance |
| `thickness` | `number` | `0.1` | Ray thickness (scene units) |
| `quality` | `string` | `"medium"` | Quality preset |
| `step_count` | `number` | `64` | Ray march step count |
| `resolution` | `string` | `"full"` | `"full"`, `"half"`, `"quarter"` |
| `fade_distance` | `number` | `10` | Reflection fade distance |

#### `motion_blur` — Camera Motion Blur
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `intensity` | `number` | `0.5` | Blur strength |
| `sample_count` | `number` | `10` | Motion samples (higher = smoother) |
| `max_velocity` | `number` | `20` | Maximum velocity contribution |

#### `chromatic_aberration` — Lens Aberration
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `intensity` | `number` | `0.05` | Aberration strength (0.0 - 1.0) |
| `max_samples` | `number` | `8` | Quality samples |

#### `volumetric_fog` — Atmospheric Fog
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `density` | `number` | `0.02` | Fog density |
| `height_falloff` | `number` | `0.5` | Height-based falloff |
| `color` | `string` (hex) | `#aabbcc` | Fog color |
| `max_distance` | `number` | `500` | Maximum render distance |
| `anisotropy` | `number` | `0.6` | Scattering directionality (-1 to 1) |

#### `anti_aliasing` / `fxaa` / `smaa` / `taa` — Anti-Aliasing
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `mode` | `string` | `"TAA"` | AA algorithm: `"TAA"`, `"FXAA"`, `"SMAA"` |
| `quality` | `string` | `"medium"` | Quality level |
| `sharpness` | `number` | `0.5` | Output sharpening (TAA) |

### Integration Patterns

#### Pattern 1: Cinematic Film Look
**When to use:** Narrative experiences, cutscenes, story-driven games.

```holoscript
post_processing "CinematicLook" {
  bloom {
    intensity: 0.8
    threshold: 1.0
    scatter: 0.7
    tint: #ffeecc  // Warm glow
  }

  depth_of_field {
    aperture: 2.8      // Wide aperture (shallow DoF)
    focal_length: 50   // Standard lens
    focus_distance: 10 // Focus at 10 meters
  }

  color_grading {
    temperature: 6500
    contrast: 1.1      // Slight contrast boost
    saturation: 1.2    // Rich colors
    lift: [0.0, 0.0, 0.05]   // Lift shadows (blue tint)
    gamma: [1.0, 1.0, 1.0]
    gain: [1.0, 1.0, 1.0]
  }

  tone_mapping {
    mode: "ACES"       // Filmic tone curve
    exposure: 1.0
  }

  vignette {
    intensity: 0.3
    smoothness: 0.5
  }

  anti_aliasing {
    mode: "TAA"
    sharpness: 0.5
  }
}
```

**Unity compilation:**
```csharp
// Unity URP Volume Profile
var profile = ScriptableObject.CreateInstance<VolumeProfile>();

var bloom = profile.Add<Bloom>();
bloom.intensity.value = 0.8f;
bloom.threshold.value = 1.0f;
bloom.scatter.value = 0.7f;
bloom.tint.value = new Color(1.0f, 0.93f, 0.8f);

var dof = profile.Add<DepthOfField>();
dof.focusDistance.value = 10f;
dof.aperture.value = 2.8f;
dof.focalLength.value = 50f;

var colorGrading = profile.Add<ColorAdjustments>();
colorGrading.contrast.value = 10f;  // Unity uses -100 to 100 range
colorGrading.saturation.value = 20f;

var tonemapping = profile.Add<Tonemapping>();
tonemapping.mode.value = TonemappingMode.ACES;
```

#### Pattern 2: Atmospheric Environment
**When to use:** Outdoor scenes, weather effects, mood lighting.

```holoscript
post_fx "Atmospheric" {
  volumetric_fog {
    density: 0.02
    height_falloff: 0.5
    color: #aabbcc
    max_distance: 500
    anisotropy: 0.6
  }

  fog {
    color: #c0c0d0
    density: 0.01
    mode: "exponential_squared"
    start: 10
    end: 200
  }

  god_rays {
    intensity: 0.5
    weight: 0.6
    density: 0.3
    decay: 0.95
    exposure_control: true
    sample_count: 64
  }

  ambient_occlusion {
    intensity: 1.2
    radius: 0.5
    quality: "high"
  }

  screen_space_reflections {
    max_distance: 100
    thickness: 0.1
    quality: "medium"
    step_count: 64
  }
}
```

#### Pattern 3: Stylized Toon Look
**When to use:** Cartoon games, cel-shaded art style, anime-inspired visuals.

```holoscript
render_pipeline "ToonShading" {
  outline {
    width: 2.0
    color: #000000
    depth_threshold: 0.1
    normal_threshold: 0.5
    mode: "depth_normal"
  }

  color_grading {
    saturation: 1.5      // Vibrant colors
    contrast: 1.3        // High contrast
    temperature: 5500
    posterize_steps: 6   // Cel-shaded bands
  }

  taa {
    enabled: true
    jitter_spread: 0.5
    sharpness: 0.8
  }

  bloom {
    intensity: 0.3
    threshold: 0.8
    scatter: 0.5
  }
}
```

**Key stylization techniques:**
- `outline` — Edge detection outlines (Sobel filter)
- `posterize_steps: 6` — Reduce color bands (cel-shading)
- `saturation: 1.5` + `contrast: 1.3` — Bold, vibrant look

### Performance Optimization

#### Quest 3 (Mobile VR)
- **Max effects:** Bloom + AA only (2 effects maximum)
- **Avoid:** SSR, volumetric fog, motion blur (too expensive)
- **AA mode:** Use `"FXAA"` (cheapest, ~2ms) instead of TAA

```holoscript
// Mobile-optimized post-processing
post_processing "QuestOptimized" {
  bloom {
    intensity: 0.4
    threshold: 1.2
    scatter: 0.6
    high_quality: false  // Disable high-quality bloom
  }

  fxaa {
    quality: "low"
    subpixel_quality: 0.75
  }

  vignette {
    intensity: 0.2
    smoothness: 0.6
  }
}
```

**Performance budget:**
- Bloom (low quality): ~3ms
- FXAA (low quality): ~2ms
- Vignette: ~0.5ms
- **Total:** ~5.5ms (within 11.1ms frame budget at 90Hz)

#### Desktop VR / PCVR
- **Max effects:** Full stack (bloom, DoF, SSAO, SSR, color grading, TAA)
- **AA mode:** Use `"TAA"` for best quality
- **Resolution:** Full resolution for all effects

```holoscript
// Desktop VR full-quality
post_processing "DesktopVR" {
  bloom {
    intensity: 0.8
    threshold: 1.0
    scatter: 0.7
    high_quality: true  // Enable high-quality bloom
  }

  depth_of_field {
    aperture: 2.8
    focal_length: 50
    focus_distance: 10
  }

  ssao {
    intensity: 1.5
    radius: 0.5
    quality: "ultra"
    sample_count: 16
  }

  ssr {
    max_distance: 100
    resolution: "full"  // Full resolution SSR
    quality: "high"
    step_count: 128
  }

  color_grading {
    temperature: 6500
    contrast: 1.1
    saturation: 1.2
  }

  tone_mapping {
    mode: "ACES"
    exposure: 1.0
  }

  taa {
    mode: "TAA"
    sharpness: 0.5
    jitter_spread: 0.75
  }
}
```

**Performance budget (90Hz VR):**
- Bloom (high): ~4ms
- DoF: ~3ms
- SSAO (ultra): ~4ms
- SSR (high): ~5ms
- Color grading: ~1ms
- TAA: ~2ms
- **Total:** ~19ms (acceptable for desktop VR with GPU headroom)

#### WebGPU
- **Max effects:** Bloom, color grading, FXAA
- **Avoid:** SSR, volumetric fog (no compute shader support in WebGPU 1.0)

### AAA-Quality Examples

#### Example 1: AAA Cinematic Cutscene
```holoscript
post_processing "AAACutscene" {
  bloom {
    intensity: 1.0
    threshold: 0.9
    scatter: 0.8
    tint: #ffffee  // Warm film-like glow
    high_quality: true
  }

  depth_of_field {
    aperture: 1.8      // Very wide aperture (cinematic)
    focal_length: 85   // Portrait lens
    focus_distance: 3  // Focus on character at 3m
    bokeh_shape: "hexagon"
  }

  color_grading {
    temperature: 6200
    contrast: 1.15
    saturation: 1.1
    lift: [0.01, 0.005, 0.0]      // Lift shadows (slightly warm)
    gamma: [1.0, 0.98, 0.95]      // Gamma (cooler highlights)
    gain: [1.05, 1.02, 1.0]       // Gain (warm highlights)
    hue_shift: 5                  // Slight orange shift
  }

  tone_mapping {
    mode: "ACES"       // Filmic S-curve
    exposure: 0.9      // Slightly underexposed (moody)
  }

  vignette {
    intensity: 0.4
    smoothness: 0.4
    roundness: 0.9
  }

  film_grain {
    intensity: 0.15    // Film grain texture
    response: 0.8
    size: 1.0
  }

  chromatic_aberration {
    intensity: 0.03    // Subtle lens aberration
  }

  motion_blur {
    intensity: 0.5
    sample_count: 12
  }

  taa {
    mode: "TAA"
    sharpness: 0.6
    jitter_spread: 0.75
  }
}
```

**Cinematic techniques:**
- `aperture: 1.8` — Shallow depth of field (subject isolation)
- `lift/gamma/gain` — Three-way color grading (Hollywood-style)
- `film_grain` — Analog film texture
- `chromatic_aberration` — Lens imperfection (realism)
- `hue_shift: 5` — Slight orange-teal grade (common in films)

---

## Audio Sources

### Overview

Spatial or global audio emitters with distance attenuation, doppler effect, and HRTF (head-related transfer function) support.

**Domain type**: `audio`
**Keyword**: `audio_source`
**Compiler function**: `compileAudioSourceBlock()`

### When to Use vs Trait-Level

**Use scene-level `audio_source` blocks when:**
- Audio configuration is **static** (fixed at compile time)
- Need **3D spatial audio** with distance attenuation
- Targeting **multiple platforms** (Unity, Unreal, R3F)

**Use trait-level (`AudioTrait`) when:**
- Need **runtime audio control** (dynamic volume, pitch, playback)
- Implementing **custom audio DSP** (filters, effects)
- Require **procedural audio synthesis**

### Full Syntax Reference

**Properties:**

| Property | Type | Default | Range | Description |
|----------|------|---------|-------|-------------|
| `clip` | `string` | - | - | Audio file path (WAV, OGG, MP3) |
| `volume` | `number` | `1.0` | `0.0` - `1.0` | Playback volume |
| `pitch` | `number` | `1.0` | `0.1` - `3.0` | Playback pitch multiplier |
| `spatial_blend` | `number` | `0.0` | `0.0` - `1.0` | 2D-3D blend (0 = stereo, 1 = fully spatial) |
| `min_distance` | `number` | `1` | `0.01` - `∞` | Distance at full volume (meters) |
| `max_distance` | `number` | `50` | `0.01` - `∞` | Distance at zero volume (meters) |
| `rolloff_mode` | `string` | `"logarithmic"` | - | `"logarithmic"`, `"linear"`, `"custom"` |
| `loop` | `boolean` | `false` | - | Loop playback |
| `play_on_awake` | `boolean` | `false` | - | Auto-play on scene load |
| `doppler_level` | `number` | `0.0` | `0.0` - `5.0` | Doppler effect strength |
| `spread` | `number` | `0` | `0` - `360` | Spatial spread angle (degrees) |
| `priority` | `number` | `128` | `0` - `255` | Audio priority (0 = highest, 255 = lowest) |

**Trait decorators:**
- `@spatial` — Enable 3D positional audio
- `@hrtf` — Enable head-related transfer function (VR)
- `@3d` — Alias for `@spatial`
- `@stereo` — Force stereo (non-spatial)
- `@spatialized` — Alias for `@spatial`

### Integration Patterns

#### Pattern 1: 3D Spatial Audio (HRTF)
**When to use:** VR experiences, 3D environments, positional sounds.

```holoscript
audio_source "Waterfall" @spatial @hrtf {
  clip: "sounds/waterfall_loop.ogg"
  volume: 0.8
  pitch: 1.0
  spatial_blend: 1.0       // Fully spatial
  min_distance: 1
  max_distance: 50
  rolloff_mode: "logarithmic"  // Realistic distance falloff
  loop: true
  play_on_awake: true
  doppler_level: 0.5       // Doppler effect for moving listener
  spread: 60               // Wide spatial spread
  priority: 128
}
```

**Unity compilation:**
```csharp
AudioSource waterfallSource = gameObject.AddComponent<AudioSource>();
waterfallSource.clip = Resources.Load<AudioClip>("sounds/waterfall_loop");
waterfallSource.volume = 0.8f;
waterfallSource.spatialBlend = 1.0f;  // 3D
waterfallSource.minDistance = 1f;
waterfallSource.maxDistance = 50f;
waterfallSource.rolloffMode = AudioRolloffMode.Logarithmic;
waterfallSource.loop = true;
waterfallSource.playOnAwake = true;
waterfallSource.dopplerLevel = 0.5f;
waterfallSource.spread = 60f;
waterfallSource.priority = 128;
waterfallSource.Play();
```

**Realistic parameters:**
- `rolloff_mode: "logarithmic"` — Realistic inverse-square law attenuation
- `min_distance: 1` — Full volume within 1 meter
- `max_distance: 50` — Audible up to 50 meters (large waterfall)
- `spread: 60` — Wide spatial spread (waterfall is large source)

#### Pattern 2: Non-Spatial Background Music
**When to use:** Menu music, background ambience, UI sounds.

```holoscript
audio_source "BackgroundMusic" {
  clip: "sounds/ambient_music.ogg"
  volume: 0.4
  pitch: 1.0
  spatial_blend: 0.0  // Non-spatial (stereo)
  loop: true
  play_on_awake: true
  priority: 255       // Lowest priority (can be culled)
}
```

#### Pattern 3: One-Shot Sound Effect
**When to use:** Triggered sounds (footsteps, gunshots, impacts).

```holoscript
sound_emitter "FootstepEmitter" @spatial {
  clip: "sounds/footstep_stone.ogg"
  volume: 0.6
  pitch: 1.0
  spatial_blend: 1.0
  min_distance: 0.5
  max_distance: 15
  rolloff_mode: "logarithmic"
  loop: false           // One-shot
  play_on_awake: false  // Triggered manually
  randomize_pitch: true
  pitch_range: [0.9, 1.1]  // Vary pitch for realism
}
```

**Key features:**
- `randomize_pitch: true` — Avoids repetition (footsteps sound unique)
- `pitch_range: [0.9, 1.1]` — 10% pitch variation
- `loop: false` — One-shot sound

### Performance Optimization

#### Quest 3 (Mobile VR)
- **Max audio sources:** 16 total (8 spatial + 8 stereo)
- **HRTF:** Use built-in Oculus Spatializer (free, optimized)
- **Avoid:** High `spread` values (expensive spatialization)

```holoscript
// Mobile-optimized spatial audio
audio_source "MobileWaterfall" @spatial {
  clip: "sounds/waterfall_mono.ogg"  // Mono audio (required for spatial)
  volume: 0.8
  spatial_blend: 1.0
  min_distance: 1
  max_distance: 30   // Reduced from 50 (less CPU)
  rolloff_mode: "linear"  // Linear is cheaper than logarithmic
  loop: true
  spread: 0          // No spread (cheaper)
}
```

**Performance tips:**
- Use **mono audio** for spatial sources (stereo is non-spatial)
- Use `rolloff_mode: "linear"` (cheaper than logarithmic)
- Reduce `max_distance` (fewer audio samples computed)
- Set `spread: 0` (point source, cheapest)

#### Desktop VR / PCVR
- **Max audio sources:** 64 total
- **HRTF:** Use Steam Audio or Oculus Spatializer
- **Rolloff:** Use `"logarithmic"` for realism

### AAA-Quality Examples

#### Example 1: Realistic River Flow
```holoscript
audio_source "RiverFlow" @spatial @hrtf {
  clip: "sounds/river_gentle.ogg"
  volume: 0.65
  pitch: 1.0
  spatial_blend: 1.0
  min_distance: 2      // Full volume within 2 meters
  max_distance: 40     // Audible up to 40 meters
  rolloff_mode: "logarithmic"
  loop: true
  play_on_awake: true
  doppler_level: 0.3   // Subtle doppler (moving listener)
  spread: 90           // Wide spread (river is long source)
}
```

**Realistic parameters:**
- `min_distance: 2` — Rivers are loud up close
- `spread: 90` — Wide spatial spread (river is extended source, not point)
- `rolloff_mode: "logarithmic"` — Realistic outdoor sound propagation

---

## Reverb Zones

### Overview

Spatial volumes that apply room acoustics simulation (reverberation, early reflections, diffusion).

**Domain type**: `audio`
**Keyword**: `reverb_zone`
**Handler**: `packages/core/src/traits/ReverbZoneTrait.ts`

### When to Use vs Trait-Level

**Use scene-level `reverb_zone` blocks when:**
- Room acoustics are **static** (fixed architecture)
- Need **preset-based reverb** (cave, cathedral, room)
- Targeting **multiple platforms**

**Use trait-level (`ReverbZoneTrait`) when:**
- Need **runtime reverb control** (dynamic IR switching)
- Implementing **custom convolution reverb**
- Require **real-time DSP adjustments**

### Full Syntax Reference

**Properties:**

| Property | Type | Default | Range | Description |
|----------|------|---------|-------|-------------|
| `preset` | `string` | `"room"` | - | Preset: `"room"`, `"hall"`, `"cathedral"`, `"cave"`, `"outdoor"`, `"bathroom"`, `"studio"`, `"custom"` |
| `min_distance` | `number` | - | `0.1` - `∞` | Inner zone radius (full effect) |
| `max_distance` | `number` | - | `0.1` - `∞` | Outer zone radius (fade out) |
| `size` | `number` | `10` | `1` - `100` | Zone size (meters) |
| `decay_time` | `number` | `1.5` | `0.1` - `20.0` | Reverb tail length (seconds) |
| `damping` | `number` | `0.5` | `0.0` - `1.0` | High-frequency damping |
| `diffusion` | `number` | `0.7` | `0.0` - `1.0` | Reverb diffusion (0-100) |
| `pre_delay` | `number` | `20` | `0` - `100` | Pre-delay in milliseconds |
| `wet_level` | `number` | `0.3` | `0.0` - `1.0` | Reverb mix level |
| `dry_level` | `number` | `1.0` | `0.0` - `1.0` | Dry signal level |
| `shape` | `string` | `"box"` | - | Zone shape: `"box"`, `"sphere"`, `"convex"` |
| `priority` | `number` | `0` | `0` - `100` | Priority when zones overlap |
| `blend_distance` | `number` | `2` | `0.1` - `∞` | Smooth transition distance |

### Integration Patterns

#### Pattern 1: Cave Reverb
**When to use:** Caves, underground tunnels, enclosed stone spaces.

```holoscript
reverb_zone "CaveReverb" {
  preset: "cave"
  min_distance: 5
  max_distance: 30
  room: -1000
  room_hf: -500
  decay_time: 3.0      // Long reverb tail
  reflections: -200
  reflections_delay: 0.02
  reverb_level: -100
  reverb_delay: 0.04
  diffusion: 100       // High diffusion (scattered reflections)
  density: 100
}
```

**Unity compilation:**
```csharp
AudioReverbZone caveReverb = gameObject.AddComponent<AudioReverbZone>();
caveReverb.reverbPreset = AudioReverbPreset.Cave;
caveReverb.minDistance = 5f;
caveReverb.maxDistance = 30f;
caveReverb.room = -1000;
caveReverb.roomHF = -500;
caveReverb.decayTime = 3.0f;
caveReverb.reflections = -200;
caveReverb.reflectionsDelay = 0.02f;
caveReverb.reverb = -100;
caveReverb.reverbDelay = 0.04f;
caveReverb.diffusion = 100f;
caveReverb.density = 100f;
```

**Realistic parameters:**
- `decay_time: 3.0` — Long reverb tail (stone reflections)
- `diffusion: 100` — Scattered reflections (rough stone surfaces)
- `room_hf: -500` — Damped high frequencies (stone absorbs highs)

#### Pattern 2: Cathedral Reverb
**When to use:** Large churches, cathedrals, concert halls.

```holoscript
reverb_zone "CathedralReverb" {
  preset: "cathedral"
  min_distance: 10
  max_distance: 100
  room: -800
  room_hf: -200
  decay_time: 5.5      // Very long reverb tail
  reflections: -400
  diffusion: 80
  density: 90
}
```

### Performance Optimization

#### Quest 3 (Mobile VR)
- **Max reverb zones:** 2 total (overlapping zones blend)
- **Use presets:** Avoid custom IR convolution (expensive)

#### Desktop VR / PCVR
- **Max reverb zones:** 8 total
- **Custom IR:** Enable impulse response convolution for realism

---

## Wind Zones

### Overview

Directional wind with turbulence, gusting, and per-object force application.

**Domain type**: `physics`
**Keyword**: `wind_zone`
**Handler**: `packages/core/src/traits/WindTrait.ts`

### Full Syntax Reference

**Properties:**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `direction` | `[x, y, z]` | `[1, 0, 0]` | Normalized wind direction |
| `strength` | `number` | `5` | Base wind strength (m/s) |
| `turbulence` | `number` | `0.3` | Turbulence intensity (0-1) |
| `turbulence_frequency` | `number` | `1.0` | How fast turbulence changes |
| `pulse` | `boolean` | `false` | Whether wind pulses on/off |
| `pulse_frequency` | `number` | `0.5` | Pulses per second |
| `falloff` | `string` | `"none"` | Distance falloff mode |
| `radius` | `number` | `100` | Effective radius |
| `affects` | `string[]` | `[]` | Tags of objects to affect (empty = all) |
| `gust_chance` | `number` | `0.01` | Random gust probability per frame |
| `gust_multiplier` | `number` | `2.0` | Gust strength multiplier |

### Integration Patterns

#### Pattern 1: Desert Wind
**When to use:** Outdoor environments, sandstorms, deserts.

```holoscript
wind_zone "DesertWindCorridor" {
  direction: [1, 0.2, 0]  // Mostly horizontal, slight uplift
  strength: 15
  turbulence: 0.4
  pulse_frequency: 2.0
  radius: 25
}
```

---

## Gravity Zones

### Overview

Regions with altered gravity (stronger, weaker, reversed, or directional).

**Domain type**: `physics`
**Keyword**: `gravity_zone`

### Full Syntax Reference

**Properties:**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `strength` | `number` | `9.81` | Gravity strength (negative = reverse) |
| `shape` | `string` | `"sphere"` | Zone shape (`"sphere"`, `"box"`) |
| `radius` | `number` | `10` | Zone extent |
| `falloff` | `string` | `"none"` | Strength falloff (`"none"`, `"linear"`, `"inverse_square"`) |

### Integration Patterns

#### Pattern 1: Heavy Gravity Pit
**When to use:** Trap zones, hazard areas, black hole effects.

```holoscript
gravity_zone "HeavyGravityPit" @persistent {
  strength: 20         // 2× Earth gravity
  shape: "sphere"
  radius: 10
  falloff: "linear"
}
```

---

## Articulations

### Overview

Multi-body physics chains (robot arms, cranes, mechanisms) with various joint types.

**Domain type**: `physics`
**Keyword**: `articulation`

### Full Syntax Reference

**Articulation properties:**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `solver_iterations` | `number` | `10` | Physics solver iteration count |
| `immovable_base` | `boolean` | `false` | Whether the base link is fixed in space |

**Joint types:**
- `hinge` — Revolute joint (1 rotational DOF)
- `slider` / `prismatic` — Prismatic joint (1 linear DOF)
- `ball_socket` — Spherical joint (3 rotational DOF)
- `fixed_joint` — Rigid connection (breakable)
- `d6_joint` — Configurable 6-DOF joint
- `spring_joint` — Spring-damper connection

### Integration Patterns

#### Pattern 1: Industrial Robot Arm
**When to use:** Robot arms, mechanical assemblies, cranes.

```holoscript
articulation "IndustrialRobotArm" @kinematic {
  solver_iterations: 16
  immovable_base: true

  hinge "Shoulder" {
    axis: [0, 1, 0]
    limits: [-90, 90]
    damping: 0.5
    stiffness: 100
    motor_force: 50
  }

  hinge "Elbow" {
    axis: [1, 0, 0]
    limits: [-120, 0]
    damping: 0.3
    stiffness: 80
  }

  slider "LinearActuator" {
    axis: [0, 0, 1]
    limits: [0, 0.5]
    damping: 1.0
    spring_force: 200
  }

  ball_socket "Wrist" {
    swing_limit: 45
    twist_limit: 90
    damping: 0.2
  }

  fixed_joint "GripperMount" {
    break_force: 500
    break_torque: 200
  }
}
```

**URDF export:**
```xml
<robot name="IndustrialRobotArm">
  <joint name="Shoulder" type="revolute">
    <axis xyz="0 1 0"/>
    <limit lower="-1.571" upper="1.571" effort="50" velocity="1.0"/>
    <dynamics damping="0.5" friction="0.0"/>
  </joint>
  <!-- ... -->
</robot>
```

---

## Integration Patterns

### Pattern 1: Object Combining Multiple Blocks
**When to use:** Interactive objects with physics, audio, and particles.

```holoscript
object "InteractiveBarrel" @grabbable @throwable @breakable {
  src: "models/barrel.glb"
  position: [3, 0.5, 1]

  // Physics
  physics {
    collider convex {
      vertex_limit: 64
    }
    rigidbody {
      mass: 15
      drag: 0.1
      use_gravity: true
    }
    friction: 0.6
    restitution: 0.3
  }

  // Audio (triggered on impact)
  audio_source "BarrelImpact" @spatial {
    clip: "sounds/barrel_impact.ogg"
    volume: 0.8
    spatial_blend: 1.0
    min_distance: 1
    max_distance: 20
    loop: false
    play_on_awake: false
  }

  // Particle effect (triggered on break)
  particles "WoodSplinters" @burst {
    max_particles: 100
    start_lifetime: [0.5, 1.5]
    start_speed: [2, 8]
    // ... particle modules
  }

  onCollision: {
    audio.play("BarrelImpact")
  }

  onBreak: {
    particles.emit("WoodSplinters")
  }
}
```

### Pattern 2: Template with Reusable Blocks
**When to use:** Consistent object types (crates, props, pickups).

```holoscript
template "PhysicsCrate" {
  @physics
  @grabbable
  @collidable

  geometry: "cube"
  mass: 5.0

  physics {
    collider box {
      size: [1, 1, 1]
      is_trigger: false
    }
    rigidbody {
      mass: 5
      drag: 0.1
      use_gravity: true
    }
    friction: 0.6
    restitution: 0.2
  }
}

// Instantiate with overrides
object "Crate1" using "PhysicsCrate" {
  position: [2, 1, -2]
  color: #8b4513
}
```

---

## Cross-Platform Compilation

### Material Compilation

| Target | Function | Output |
|--------|----------|--------|
| Unity C# | `materialToUnity()` | `Material` + `Shader.Find()` + property setup |
| Unreal C++ | `materialToUnreal()` | `UMaterialInstanceDynamic` setup |
| Godot GDScript | `materialToGodot()` | `StandardMaterial3D` setup |
| R3F/Three.js | `materialToR3F()` | `<meshStandardMaterial>` JSX |
| USD | `materialToUSD()` | `UsdPreviewSurface` shader prim |
| glTF | `materialToGLTF()` | `pbrMetallicRoughness` JSON |

---

## Performance Optimization

### Platform Resource Budgets

From `packages/core/src/compiler/safety/ResourceBudgetAnalyzer.ts`:

| Resource | Quest 3 | Desktop VR | WebGPU | Mobile AR |
|----------|---------|-----------|--------|-----------|
| Particles | 5,000 | 50,000 | 20,000 | 2,000 |
| Physics Bodies | 200 | 2,000 | 500 | 50 |
| Audio Sources | 16 | 64 | 32 | 8 |
| Mesh Instances | 500 | 5,000 | 2,000 | 200 |
| Shader Passes | 4 | 16 | 8 | 2 |
| Draw Calls | 200 | 2,000 | 500 | 100 |
| Memory (MB) | 512 | 4,096 | 1,024 | 256 |

---

## AAA-Quality Scene Examples

### Example: Blacksmith's Forge Workshop

Full integrated scene demonstrating all five perception block types.

```holoscript
// ============================================================================
// Production Scene: Blacksmith's Forge Workshop
// ============================================================================
// Integrates: materials, physics, particles, post-processing, audio
// Target platforms: Desktop VR, Quest 3, WebGPU
// ============================================================================

// ── Materials ──────────────────────────────────────────────────────────────

pbr_material "ForgeAnvilSteel" @pbr {
  baseColor: #333344
  roughness: 0.25
  metallic: 1.0
  albedo_map {
    source: "textures/anvil_albedo.png"
    tiling: [1, 1]
    filtering: "anisotropic"
  }
  normal_map {
    source: "textures/anvil_normal.png"
    strength: 1.5
  }
  ao_map {
    source: "textures/anvil_ao.png"
    intensity: 0.9
  }
}

subsurface_material "GlowingIngot" @sss {
  baseColor: #ff4400
  roughness: 0.6
  metallic: 0.8
  subsurface_color: #ff2200
  subsurface_radius: [2.0, 0.5, 0.1]
  emissiveIntensity: 3.0
  emission_map: "textures/ingot_heat_emission.png"
}

glass_material "ForgeWindowGlass" @transparent {
  baseColor: #eeddcc
  opacity: 0.2
  IOR: 1.52
  transmission: 0.85
  roughness: 0.15
}

// ── Force Fields ───────────────────────────────────────────────────────────

wind_zone "ForgeChimneyDraft" {
  direction: [0, 1, 0]
  strength: 3
  turbulence: 0.4
  radius: 4
}

gravity_zone "HammerDropZone" @persistent {
  strength: 15
  shape: "box"
  radius: 2
}

// ── Articulation ───────────────────────────────────────────────────────────

articulation "BellowsMechanism" {
  solver_iterations: 10

  hinge "BellowsHinge" {
    axis: [1, 0, 0]
    limits: [-30, 30]
    damping: 0.8
    stiffness: 60
    motor_force: 25
  }

  spring_joint "BellowsSpring" {
    spring_force: 150
    damper_force: 30
    min_distance: 0.05
    max_distance: 0.4
  }
}

// ── Particles ──────────────────────────────────────────────────────────────

particles "ForgeFireEmbers" @looping {
  rate: 150
  max_particles: 800
  start_lifetime: [1, 3]
  start_speed: [1, 4]
  start_size: [0.01, 0.04]
  gravity_modifier: -0.3

  emission {
    rate_over_time: 150
    burst_count: 20
    burst_interval: 1.0
  }

  velocity {
    direction: [0, 1, 0]
    speed: 2
    spread: 40
  }

  color_over_life {
    gradient: ["#ffff00", "#ff8800", "#ff2200", "#00000000"]
    mode: "blend"
  }

  size_over_life {
    curve: [1.0, 0.8, 0.3, 0.0]
    mode: "bezier"
  }

  noise {
    strength: 0.6
    frequency: 3.0
    scroll_speed: 0.2
  }

  trails {
    enabled: true
    width: 0.01
    lifetime: 0.2
    color_over_trail: ["#ffcc00", "#00000000"]
    min_vertex_distance: 0.01
    world_space: true
  }

  renderer {
    material: "particles/ember_additive"
    render_mode: "billboard"
    sort_mode: "distance"
  }
}

emitter "ForgeSmoke" @looping {
  rate: 80
  max_particles: 400
  start_lifetime: [3, 6]
  start_speed: [0.3, 0.8]
  start_size: [0.2, 0.5]
  gravity_modifier: -0.05

  velocity {
    direction: [0, 1, 0.1]
    speed: 0.5
    spread: 20
  }

  color_over_life {
    gradient: ["#44444488", "#33333344", "#22222200"]
    mode: "blend"
  }

  size_over_life {
    curve: [0.5, 1.0, 1.5, 2.0]
    mode: "bezier"
  }

  noise {
    strength: 0.3
    frequency: 1.5
    scroll_speed: 0.08
  }

  shape {
    type: "cone"
    angle: 15
    radius: 0.4
    emit_from: "base"
  }

  renderer {
    material: "particles/smoke_soft"
    render_mode: "billboard"
    sort_mode: "distance"
  }
}

// ── Post-Processing ────────────────────────────────────────────────────────

post_processing "ForgeAtmosphere" {
  bloom {
    intensity: 1.2
    threshold: 0.8
    scatter: 0.65
    tint: #ffddaa
  }

  ambient_occlusion {
    intensity: 1.8
    radius: 0.4
    quality: "high"
  }

  depth_of_field {
    aperture: 2.0
    focal_length: 35
    focus_distance: 4
  }

  color_grading {
    temperature: 4500
    contrast: 1.15
    saturation: 0.9
    lift: [0.02, 0.01, 0.0]
    gamma: [1.0, 0.98, 0.95]
  }

  tone_mapping {
    mode: "ACES"
    exposure: 0.8
  }

  vignette {
    intensity: 0.4
    smoothness: 0.4
  }

  volumetric_fog {
    density: 0.015
    height_falloff: 0.3
    color: #aa8866
    max_distance: 30
  }

  anti_aliasing {
    mode: "TAA"
    sharpness: 0.5
  }
}

// ── Audio ──────────────────────────────────────────────────────────────────

audio_source "FireCrackling" @spatial @hrtf {
  clip: "sounds/fire_crackle_loop.ogg"
  volume: 0.75
  pitch: 1.0
  spatial_blend: 1.0
  min_distance: 1
  max_distance: 20
  rolloff_mode: "logarithmic"
  loop: true
  play_on_awake: true
  doppler_level: 0.2
  spread: 120
}

reverb_zone "WorkshopReverb" {
  preset: "room"
  min_distance: 2
  max_distance: 12
  room: -500
  room_hf: -200
  decay_time: 1.2
  reflections: -100
  diffusion: 80
  density: 90
}

// ── Composition ────────────────────────────────────────────────────────────

composition "Blacksmith Forge Workshop" {
  environment {
    skybox: "twilight_warm"
    ambient_light: 0.25
    gravity: -9.81
    shadows: true
  }

  // Scene-local audio
  audio_source "AnvilStrike" @spatial {
    clip: "sounds/anvil_hammer.ogg"
    volume: 0.9
    spatial_blend: 1.0
    min_distance: 2
    max_distance: 30
    loop: false
    play_on_awake: false
  }

  ambience "ForgeAmbient" @spatial {
    clip: "sounds/forge_ambient_loop.ogg"
    volume: 0.4
    loop: true
    play_on_awake: true
    spatial_blend: 0.3
    spread: 180
  }

  audio_mixer "ForgeMixer" {
    master_volume: 1.0
    sfx_volume: 0.9
    ambient_volume: 0.5
    music_volume: 0.3
  }

  // Scene objects with physics
  object "Anvil" @collidable {
    src: "models/anvil.glb"
    position: [0, 0.5, 0]

    physics {
      collider convex {
        vertex_limit: 128
      }
      rigidbody {
        mass: 200
        use_gravity: true
        is_kinematic: true
      }
      friction: 0.8
      restitution: 0.1
    }
  }

  object "HotIngot" @grabbable {
    geometry: "cube"
    position: [0, 0.85, 0]
    scale: [0.3, 0.1, 0.1]
    color: #ff4400

    physics {
      collider box {
        size: [0.3, 0.1, 0.1]
      }
      rigidbody {
        mass: 5
        use_gravity: true
        drag: 0.05
      }
      friction: 0.5
    }
  }

  object "Hammer" @grabbable @throwable {
    src: "models/hammer.glb"
    position: [0.5, 0.8, 0.3]

    physics {
      collider capsule {
        radius: 0.05
        height: 0.4
      }
      rigidbody {
        mass: 3
        use_gravity: true
        angular_damping: 0.1
      }
    }

    onGrab: {
      haptic.feedback("medium")
    }
  }

  // Static geometry
  object "Floor" @collidable {
    geometry: "plane"
    position: [0, 0, 0]
    scale: [10, 1, 8]
    color: #554433
  }

  // Lighting
  point_light "ForgeFire" {
    position: [-2, 1.5, 0]
    color: #ff8833
    intensity: 2.0
    range: 8
  }

  point_light "IncandescentBulb" {
    position: [0, 3.5, 0]
    color: #ffddaa
    intensity: 0.6
    range: 10
  }

  directional_light "MoonlightThroughWindow" {
    position: [0, 5, -5]
    color: #aabbff
    intensity: 0.15
  }
}
```

**Scene features:**
- **4 materials** — PBR steel, SSS glowing metal, glass, stone
- **2 force fields** — Wind (chimney draft), gravity (hammer drop zone)
- **1 articulation** — Bellows mechanism (hinge + spring joint)
- **2 particle systems** — Fire embers (with trails), smoke
- **1 post-processing pipeline** — Bloom, SSAO, DoF, color grading, volumetric fog, TAA
- **5 audio elements** — Spatial fire crackle, anvil SFX, ambient soundscape, reverb zone, mixer

**Platform targets:**
- Unity (URP/HDRP)
- Unreal Engine 5
- Godot 4
- React Three Fiber (R3F)
- WebGPU
- USD (Universal Scene Description)
- URDF (robot simulation)

---

## Further Reading

- **Perception test files**: `examples/perception-tests/01-06` — Individual block type test suites
- **Trait constraints**: `packages/core/src/traits/traitConstraints.ts`
- **Resource budgets**: `packages/core/src/compiler/safety/ResourceBudgetAnalyzer.ts`
- **GPU particles**: `packages/core/src/traits/GPUParticleTrait.ts`
- **Wind handler**: `packages/core/src/traits/WindTrait.ts`
- **Reverb handler**: `packages/core/src/traits/ReverbZoneTrait.ts`
- **Compiler mixin**: `packages/core/src/compiler/DomainBlockCompilerMixin.ts`

---

**END OF GUIDE**

*HoloScript v4.2 — Production-Quality Perception & Simulation Stack*
*© 2026 HoloScript Contributors — MIT License*
