# Perception & Simulation Stack Guide

> Comprehensive reference for HoloScript's scene-level perception primitives: materials, physics, particles, post-processing, audio, force fields, and articulations.

**Version**: 4.2
**Source**: `packages/core/src/compiler/DomainBlockCompilerMixin.ts`, trait handlers in `packages/core/src/traits/`
**Grammar**: `packages/tree-sitter-holoscript/grammar.js` (domain block rules)

---

## Table of Contents

1. [Overview](#overview)
2. [Material Blocks](#material-blocks)
   - [pbr_material](#pbr_material)
   - [subsurface_material](#subsurface_material)
   - [unlit_material](#unlit_material)
   - [glass_material](#glass_material)
   - [toon_material](#toon_material)
   - [shader](#shader)
3. [Physics Blocks](#physics-blocks)
   - [collider](#collider)
   - [rigidbody](#rigidbody)
   - [physics (container)](#physics-container)
4. [Force Field Blocks](#force-field-blocks)
   - [gravity_zone](#gravity_zone)
   - [wind_zone](#wind_zone)
   - [buoyancy_zone](#buoyancy_zone)
   - [magnetic_field](#magnetic_field)
   - [drag_zone](#drag_zone)
5. [Articulation Blocks](#articulation-blocks)
   - [articulation](#articulation)
   - [Joint Sub-Blocks](#joint-sub-blocks)
6. [Particle Blocks](#particle-blocks)
   - [particles / emitter / vfx / particle_system](#particle-keywords)
   - [Particle Module Sub-Blocks](#particle-module-sub-blocks)
7. [Post-Processing Blocks](#post-processing-blocks)
   - [post_processing / post_fx / render_pipeline](#post-processing-keywords)
   - [Post-Processing Effect Sub-Blocks](#post-processing-effect-sub-blocks)
8. [Audio Blocks](#audio-blocks)
   - [audio_source](#audio_source)
   - [audio_listener](#audio_listener)
   - [reverb_zone](#reverb_zone)
   - [audio_mixer](#audio_mixer)
   - [ambience](#ambience)
   - [sound_emitter](#sound_emitter)
9. [Trait Integration Patterns](#trait-integration-patterns)
10. [Cross-Platform Compilation](#cross-platform-compilation)
11. [Performance Considerations](#performance-considerations)
12. [Production Scene Example](#production-scene-example)

---

## Overview

The Perception & Simulation Stack is HoloScript's v4.2 layer for declaring scene-level rendering, physics, audio, particles, and post-processing. These are first-class domain blocks parsed by the tree-sitter grammar and compiled by `DomainBlockCompilerMixin.ts` to every supported target platform (Unity, Unreal, Godot, R3F, WebGPU, VRChat, USD, URDF, and more).

**Key architecture points:**

- All perception blocks are parsed as `HoloDomainBlock` AST nodes (domain type: `material`, `physics`, `vfx`, `postfx`, `audio`)
- Each block has a `keyword`, `name`, `traits` (decorators), `properties`, optional `children` (sub-blocks), and optional `eventHandlers`
- Blocks can appear at the **top level** of a file or **inside a composition**
- Trait handlers in `packages/core/src/traits/` provide runtime behavior (attach, detach, update, event loops)
- The `ResourceBudgetAnalyzer` enforces per-platform resource limits at compile time

**Handler implementation pattern** (all trait handlers follow this):

```typescript
export const handler: TraitHandler<Config> = {
  name: 'trait_name',
  defaultConfig: {
    /* ... */
  },
  onAttach(node, config, context) {
    /* initialization */
  },
  onDetach(node, config, context) {
    /* cleanup */
  },
  onUpdate(node, config, context, delta) {
    /* per-frame */
  },
  onEvent(node, config, context, event) {
    /* event response */
  },
};
```

---

## Material Blocks

**Domain type**: `material`
**Compiler function**: `compileMaterialBlock()` in `DomainBlockCompilerMixin.ts`
**Compiled type**: `CompiledMaterial`

Materials define surface appearance. The compiler extracts properties ending in `_map` as texture maps and treats everything else as scalar material properties.

### pbr_material

Physically-based rendering material with roughness-metallic workflow.

**Properties:**

| Property             | Type              | Default | Description                                  |
| -------------------- | ----------------- | ------- | -------------------------------------------- |
| `baseColor`          | `string` (hex)    | -       | Surface albedo color                         |
| `roughness`          | `number`          | `0.5`   | Surface roughness (0 = mirror, 1 = diffuse)  |
| `metallic`           | `number`          | `0.0`   | Metalness (0 = dielectric, 1 = metal)        |
| `opacity`            | `number`          | `1.0`   | Surface opacity (< 1.0 enables transparency) |
| `IOR`                | `number`          | `1.5`   | Index of refraction                          |
| `emissive_color`     | `string` (hex)    | -       | Self-illumination color                      |
| `emissive_intensity` | `number`          | `1.0`   | Emission brightness multiplier               |
| `albedo_map`         | `string` or block | -       | Diffuse/albedo texture path                  |
| `normal_map`         | `string` or block | -       | Normal map texture path                      |
| `roughness_map`      | `string`          | -       | Roughness texture path                       |
| `metallic_map`       | `string`          | -       | Metalness texture path                       |
| `ao_map`             | `string` or block | -       | Ambient occlusion texture path               |
| `emission_map`       | `string`          | -       | Emission texture path                        |
| `height_map`         | `string` or block | -       | Parallax/height map texture path             |

**Texture map sub-block properties** (when using structured form):

| Property    | Type               | Default      | Description                                   |
| ----------- | ------------------ | ------------ | --------------------------------------------- |
| `source`    | `string`           | -            | Texture file path                             |
| `tiling`    | `[number, number]` | `[1, 1]`     | UV tiling multiplier                          |
| `filtering` | `string`           | `"bilinear"` | `"bilinear"`, `"trilinear"`, `"anisotropic"`  |
| `strength`  | `number`           | `1.0`        | Effect intensity (normal maps)                |
| `format`    | `string`           | `"directx"`  | Normal map format (`"opengl"` or `"directx"`) |
| `intensity` | `number`           | `1.0`        | Effect intensity (AO maps)                    |
| `scale`     | `number`           | `0.05`       | Displacement scale (height maps)              |
| `channel`   | `string`           | `"r"`        | Source channel (`"r"`, `"g"`, `"b"`, `"a"`)   |

**Example:**

```holoscript
pbr_material "HardwoodFloor" {
  albedo_map {
    source: "textures/hardwood_albedo.png"
    tiling: [4, 4]
    filtering: "anisotropic"
  }
  normal_map {
    source: "textures/hardwood_normal.png"
    strength: 1.2
  }
  roughness: 0.55
  metallic: 0.0
}
```

### subsurface_material

Material with subsurface scattering (SSS) for skin, wax, marble, and similar translucent surfaces.

**Additional properties** (beyond PBR):

| Property            | Type                       | Default           | Description                                 |
| ------------------- | -------------------------- | ----------------- | ------------------------------------------- |
| `subsurface_color`  | `string` (hex)             | -                 | Color of light transmitted through material |
| `subsurface_radius` | `[number, number, number]` | `[1.0, 0.2, 0.1]` | RGB scatter radius in scene units           |
| `subsurface_map`    | `string`                   | -                 | Subsurface intensity map                    |
| `thickness_map`     | `string`                   | -                 | Surface thickness map                       |

**Example:**

```holoscript
subsurface_material "HumanSkin" @sss {
  baseColor: #ddb8a0
  roughness: 0.4
  metallic: 0.0
  subsurface_color: #cc4422
  subsurface_radius: [1.0, 0.2, 0.1]
  subsurface_map: "textures/skin_subsurface.png"
  thickness_map: "textures/skin_thickness.png"
  normal_map {
    source: "textures/skin_normal.png"
    strength: 0.8
  }
}
```

### unlit_material

Material that ignores scene lighting. Used for HUDs, holographic overlays, and UI elements.

**Properties:**

| Property       | Type           | Default | Description               |
| -------------- | -------------- | ------- | ------------------------- |
| `baseColor`    | `string` (hex) | -       | Surface color             |
| `opacity`      | `number`       | `1.0`   | Transparency              |
| `emission_map` | `string`       | -       | Self-illumination texture |
| `double_sided` | `boolean`      | `false` | Render both faces         |

**Example:**

```holoscript
unlit_material "HologramOverlay" @transparent {
  baseColor: #00ffaa
  opacity: 0.6
  emission_map: "textures/hologram_emission.png"
  double_sided: true
}
```

### glass_material

Transparent material with physically accurate transmission and refraction.

**Additional properties:**

| Property            | Type           | Default | Description                      |
| ------------------- | -------------- | ------- | -------------------------------- |
| `IOR`               | `number`       | `1.5`   | Index of refraction              |
| `transmission`      | `number`       | `0.95`  | Light transmission factor (0-1)  |
| `thickness`         | `number`       | `0.01`  | Glass panel thickness (meters)   |
| `attenuation_color` | `string` (hex) | -       | Color tint for transmitted light |

**Example:**

```holoscript
glass_material "ArchitecturalGlass" @transparent {
  baseColor: #ffffff
  opacity: 0.15
  IOR: 1.52
  transmission: 0.95
  roughness: 0.02
  thickness: 0.01
  attenuation_color: #eeffee
}
```

### toon_material

Cel-shaded material with outline and stepped shading.

**Properties:**

| Property        | Type           | Default   | Description                      |
| --------------- | -------------- | --------- | -------------------------------- |
| `baseColor`     | `string` (hex) | -         | Surface color                    |
| `outline_width` | `number`       | `0.02`    | Outline thickness                |
| `outline_color` | `string` (hex) | `#000000` | Outline color                    |
| `shade_steps`   | `number`       | `3`       | Number of discrete shading bands |
| `specular_size` | `number`       | `0.2`     | Size of specular highlight       |
| `rim_light`     | `number`       | `0.4`     | Rim lighting intensity           |
| `rim_color`     | `string` (hex) | `#ffffff` | Rim light color                  |

**Example:**

```holoscript
toon_material "CartoonCharacter" @cel_shaded {
  baseColor: #ff6633
  outline_width: 0.02
  outline_color: #000000
  shade_steps: 3
  specular_size: 0.2
  rim_light: 0.4
  rim_color: #ffffff
}
```

### shader

Custom shader with multiple passes and output connections.

**Sub-blocks:**

- **`pass "Name" { ... }`**: Shader pass with `vertex`, `fragment`, `blend` properties
- **`output -> target`**: Shader connection wiring (e.g., `heightBlend -> material.baseColor`)

**Example:**

```holoscript
shader "CustomTerrain" {
  pass "ForwardBase" {
    vertex: "shaders/terrain.vert"
    fragment: "shaders/terrain.frag"
    blend: "opaque"
  }
  pass "ShadowCaster" {
    vertex: "shaders/terrain_shadow.vert"
    fragment: "shaders/terrain_shadow.frag"
  }
  roughness: 0.7
  tiling_scale: 4.0
  heightBlend -> material.baseColor
  normalOut -> material.normal
}
```

**Trait integration:** Materials support trait decorators: `@pbr`, `@transparent`, `@sss`, `@cel_shaded`. These are stored in `block.traits[]` and influence compile-time validation and platform-specific optimizations.

---

## Physics Blocks

**Domain type**: `physics`
**Compiler function**: `compilePhysicsBlock()` in `DomainBlockCompilerMixin.ts`
**Compiled type**: `CompiledPhysics`

Physics blocks declare colliders, rigidbodies, and force fields. They can be nested inside objects or stand alone.

### collider

Collision shape for physics interaction. Can be used standalone on an object or nested inside a `physics` container block.

**Collider shapes**: `box`, `sphere`, `capsule`, `mesh`, `convex`, `cylinder`, `heightfield`

**Properties (by shape):**

| Property          | Type                       | Default     | Description                            |
| ----------------- | -------------------------- | ----------- | -------------------------------------- |
| `size`            | `[number, number, number]` | `[1,1,1]`   | Box dimensions                         |
| `radius`          | `number`                   | `0.5`       | Sphere/capsule radius                  |
| `height`          | `number`                   | `1.0`       | Capsule/cylinder height                |
| `direction`       | `string`                   | `"y"`       | Capsule axis direction                 |
| `is_trigger`      | `boolean`                  | `false`     | Trigger volume (no physical collision) |
| `offset`          | `[number, number, number]` | `[0,0,0]`   | Center offset from object origin       |
| `convex`          | `boolean`                  | `false`     | Use convex hull (mesh colliders)       |
| `vertex_limit`    | `number`                   | `64`        | Max vertices for convex hull           |
| `skin_width`      | `number`                   | `0.01`      | Contact skin thickness                 |
| `cooking_options` | `string`                   | `"default"` | Mesh cook options                      |
| `resolution`      | `[number, number]`         | -           | Heightfield grid resolution            |
| `height_scale`    | `number`                   | -           | Heightfield vertical scale             |
| `source`          | `string`                   | -           | Heightfield data source path           |

**Example (standalone on object):**

```holoscript
object "InvisibleWall" {
  geometry: "cube"
  position: [0, 2, -10]
  visible: false

  collider box {
    size: [20, 4, 0.1]
    is_trigger: false
  }
}
```

### rigidbody

Dynamic physics body with mass and damping.

**Properties:**

| Property            | Type                       | Default | Description                       |
| ------------------- | -------------------------- | ------- | --------------------------------- |
| `mass`              | `number`                   | `1.0`   | Body mass in kg                   |
| `drag`              | `number`                   | `0.0`   | Linear drag coefficient           |
| `angular_damping`   | `number`                   | `0.05`  | Rotational drag                   |
| `use_gravity`       | `boolean`                  | `true`  | Affected by gravity               |
| `is_kinematic`      | `boolean`                  | `false` | Script-controlled (not simulated) |
| `freeze_rotation_x` | `boolean`                  | `false` | Lock X-axis rotation              |
| `freeze_rotation_y` | `boolean`                  | `false` | Lock Y-axis rotation              |
| `freeze_rotation_z` | `boolean`                  | `false` | Lock Z-axis rotation              |
| `inertia`           | `[number, number, number]` | auto    | Inertia tensor diagonal           |

**Example:**

```holoscript
object "FallingBox" {
  geometry: "cube"
  position: [3, 8, 0]
  color: #cc3333

  rigidbody {
    mass: 10
    use_gravity: true
  }
}
```

### physics (container)

Container block that wraps collider(s), rigidbody, force fields, and flat physics properties together.

**Flat properties:**

| Property      | Type     | Default | Description                                    |
| ------------- | -------- | ------- | ---------------------------------------------- |
| `friction`    | `number` | `0.5`   | Surface friction coefficient                   |
| `restitution` | `number` | `0.0`   | Bounciness (0 = no bounce, 1 = perfect bounce) |

**Example (full physics block):**

```holoscript
object "HeavyBoulder" @grabbable {
  geometry: "sphere"
  position: [0, 5, 0]
  scale: [1.5, 1.5, 1.5]

  physics {
    collider sphere {
      radius: 0.75
      is_trigger: false
    }

    rigidbody {
      mass: 50
      drag: 0.2
      angular_damping: 0.1
      use_gravity: true
    }

    friction: 0.7
    restitution: 0.15
  }
}
```

**Trait requirements:** The `@physics` trait requires `@collidable`. `@grabbable` requires `@physics`. `@throwable` requires `@grabbable`. These constraints are enforced at compile time by `traitConstraints.ts`.

---

## Force Field Blocks

**Domain type**: `physics`
**Compiler**: Extracted as `CompiledForceField` from `compilePhysicsBlock()`

Force fields are spatial volumes that apply continuous forces to physics bodies within their radius. They can stand alone at the top level or nest inside `physics` container blocks.

### gravity_zone

Region with altered gravity.

**Properties:**

| Property   | Type     | Default    | Description                                                 |
| ---------- | -------- | ---------- | ----------------------------------------------------------- |
| `strength` | `number` | `9.81`     | Gravity strength (negative = reverse)                       |
| `shape`    | `string` | `"sphere"` | Zone shape (`"sphere"`, `"box"`)                            |
| `radius`   | `number` | `10`       | Zone extent                                                 |
| `falloff`  | `string` | `"none"`   | Strength falloff (`"none"`, `"linear"`, `"inverse_square"`) |

**Example:**

```holoscript
gravity_zone "HeavyGravityPit" @persistent {
  strength: 20
  shape: "sphere"
  radius: 10
  falloff: "linear"
}
```

### wind_zone

Directional wind with turbulence and gusting.

**Properties:**

| Property               | Type                       | Default     | Description                             |
| ---------------------- | -------------------------- | ----------- | --------------------------------------- |
| `direction`            | `[number, number, number]` | `[1, 0, 0]` | Normalized wind direction               |
| `strength`             | `number`                   | `5`         | Base wind strength (m/s)                |
| `turbulence`           | `number`                   | `0.3`       | Turbulence intensity (0-1)              |
| `turbulence_frequency` | `number`                   | `1.0`       | How fast turbulence changes             |
| `pulse`                | `boolean`                  | `false`     | Whether wind pulses on/off              |
| `pulse_frequency`      | `number`                   | `0.5`       | Pulses per second                       |
| `falloff`              | `string`                   | `"none"`    | Distance falloff mode                   |
| `radius`               | `number`                   | `100`       | Effective radius                        |
| `affects`              | `string[]`                 | `[]`        | Tags of objects to affect (empty = all) |
| `gust_chance`          | `number`                   | `0.01`      | Random gust probability per frame       |
| `gust_multiplier`      | `number`                   | `2.0`       | Gust strength multiplier                |

**Handler**: `packages/core/src/traits/WindTrait.ts`
**Runtime behavior**: Uses Perlin-like noise for turbulence, smooth pulsing via sine wave, random gusts with configurable duration. Emits `wind_zone_update`, `on_gust_start`, `on_wind_change` events.

**Example:**

```holoscript
wind_zone "DesertWindCorridor" {
  direction: [1, 0.2, 0]
  strength: 15
  turbulence: 0.4
  pulse_frequency: 2.0
  radius: 25
}
```

### buoyancy_zone

Fluid volume that applies buoyancy forces to submerged objects.

**Properties:**

| Property         | Type                       | Default   | Description                                            |
| ---------------- | -------------------------- | --------- | ------------------------------------------------------ |
| `density`        | `number`                   | `1025`    | Fluid density (kg/m^3, water = 1000, saltwater = 1025) |
| `surface_height` | `number`                   | `0`       | Y-level of the fluid surface                           |
| `flow_direction` | `[number, number, number]` | `[0,0,0]` | Current direction and strength                         |
| `damping`        | `number`                   | `0.8`     | Velocity damping for submerged objects                 |

**Example:**

```holoscript
buoyancy_zone "OceanSurface" @water {
  density: 1025
  surface_height: 0
  flow_direction: [0.1, 0, 0.05]
  damping: 0.8
}
```

### magnetic_field

Attracts or repels physics bodies along an axis.

**Properties:**

| Property   | Type                       | Default     | Description              |
| ---------- | -------------------------- | ----------- | ------------------------ |
| `strength` | `number`                   | -           | Field strength           |
| `polarity` | `string`                   | `"attract"` | `"attract"` or `"repel"` |
| `axis`     | `[number, number, number]` | `[0,1,0]`   | Field alignment axis     |
| `range`    | `number`                   | -           | Effective range          |

**Example:**

```holoscript
magnetic_field "LabMagnet" {
  strength: 50
  polarity: "attract"
  axis: [0, 1, 0]
  range: 5
}
```

### drag_zone

Region that applies linear and angular drag to objects passing through.

**Properties:**

| Property       | Type                       | Default | Description              |
| -------------- | -------------------------- | ------- | ------------------------ |
| `linear_drag`  | `number`                   | -       | Linear velocity damping  |
| `angular_drag` | `number`                   | -       | Angular velocity damping |
| `shape`        | `string`                   | `"box"` | Zone shape               |
| `size`         | `[number, number, number]` | -       | Zone dimensions          |

**Example:**

```holoscript
drag_zone "ViscousFluid" {
  linear_drag: 2.0
  angular_drag: 1.5
  shape: "box"
  size: [4, 4, 4]
}
```

---

## Articulation Blocks

**Domain type**: `physics`
**Compiler**: Extracted as `CompiledJoint[]` from `compilePhysicsBlock()`

Articulations model multi-body chains (robot arms, cranes, mechanisms) with various joint types.

### articulation

Top-level container for a chain of joints.

**Properties:**

| Property            | Type      | Default | Description                             |
| ------------------- | --------- | ------- | --------------------------------------- |
| `solver_iterations` | `number`  | `10`    | Physics solver iteration count          |
| `immovable_base`    | `boolean` | `false` | Whether the base link is fixed in space |

### Joint Sub-Blocks

Each joint type is declared as a named sub-block inside `articulation`:

#### hinge

Revolute joint -- rotates around a single axis.

| Property      | Type                       | Default   | Description              |
| ------------- | -------------------------- | --------- | ------------------------ |
| `axis`        | `[number, number, number]` | `[0,0,1]` | Rotation axis            |
| `limits`      | `[number, number]`         | -         | Min/max angle in degrees |
| `damping`     | `number`                   | `0.0`     | Joint damping            |
| `stiffness`   | `number`                   | `0.0`     | Joint stiffness          |
| `motor_force` | `number`                   | `0.0`     | Motor drive force        |

#### slider

Prismatic joint -- slides along a single axis.

| Property       | Type                       | Default   | Description             |
| -------------- | -------------------------- | --------- | ----------------------- |
| `axis`         | `[number, number, number]` | `[0,0,1]` | Slide axis              |
| `limits`       | `[number, number]`         | -         | Min/max travel distance |
| `damping`      | `number`                   | `0.0`     | Joint damping           |
| `spring_force` | `number`                   | `0.0`     | Return spring force     |
| `motor_speed`  | `number`                   | `0.0`     | Motor speed             |
| `motor_force`  | `number`                   | `0.0`     | Motor drive force       |

#### ball_socket

Spherical joint -- 3 rotational degrees of freedom.

| Property      | Type     | Default | Description               |
| ------------- | -------- | ------- | ------------------------- |
| `swing_limit` | `number` | -       | Max swing angle (degrees) |
| `twist_limit` | `number` | -       | Max twist angle (degrees) |
| `damping`     | `number` | `0.0`   | Joint damping             |

#### fixed_joint

Rigid connection that can break under force.

| Property       | Type     | Default | Description               |
| -------------- | -------- | ------- | ------------------------- |
| `break_force`  | `number` | `inf`   | Force threshold to break  |
| `break_torque` | `number` | `inf`   | Torque threshold to break |

#### d6_joint

Configurable 6-degree-of-freedom joint.

| Property       | Type     | Default    | Description                         |
| -------------- | -------- | ---------- | ----------------------------------- |
| `x_motion`     | `string` | `"locked"` | `"locked"`, `"limited"`, `"free"`   |
| `y_motion`     | `string` | `"locked"` | `"locked"`, `"limited"`, `"free"`   |
| `z_motion`     | `string` | `"locked"` | `"locked"`, `"limited"`, `"free"`   |
| `swing1_limit` | `number` | -          | Swing limit around Y axis (degrees) |
| `swing2_limit` | `number` | -          | Swing limit around Z axis (degrees) |
| `twist_limit`  | `number` | -          | Twist limit (degrees)               |

#### spring_joint

Joint connected by a spring with configurable elasticity.

| Property       | Type     | Default | Description             |
| -------------- | -------- | ------- | ----------------------- |
| `spring_force` | `number` | -       | Spring constant         |
| `damper_force` | `number` | -       | Damper coefficient      |
| `min_distance` | `number` | -       | Minimum spring distance |
| `max_distance` | `number` | -       | Maximum spring distance |
| `tolerance`    | `number` | `0.01`  | Distance tolerance      |

#### prismatic

Alias for `slider` with motor capabilities.

**Full articulation example:**

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

**URDF export**: Articulations compile to URDF `<joint>` elements. `hinge` maps to `revolute`, `slider`/`prismatic` to `prismatic`, `ball_socket` to `ball`, `fixed_joint` to `fixed`, `d6_joint` to `floating`. See `physicsToURDF()`.

---

## Particle Blocks

**Domain type**: `vfx`
**Compiler function**: `compileParticleBlock()` in `DomainBlockCompilerMixin.ts`
**Compiled type**: `CompiledParticleSystem`
**GPU Handler**: `packages/core/src/traits/GPUParticleTrait.ts`

### Particle Keywords

Four interchangeable keywords create particle systems:

| Keyword           | Typical Use                          |
| ----------------- | ------------------------------------ |
| `particles`       | General-purpose particle system      |
| `emitter`         | Point or shaped emitter              |
| `vfx`             | Visual effects (explosions, impacts) |
| `particle_system` | Explicit system declaration          |

**Top-level properties:**

| Property           | Type                     | Default   | Description                                    |
| ------------------ | ------------------------ | --------- | ---------------------------------------------- |
| `rate`             | `number`                 | -         | Emission rate (particles/second)               |
| `max_particles`    | `number`                 | `1000`    | Maximum active particle count                  |
| `start_lifetime`   | `number` or `[min, max]` | `2.0`     | Particle lifetime in seconds                   |
| `start_speed`      | `number` or `[min, max]` | `1.0`     | Initial velocity magnitude                     |
| `start_size`       | `number` or `[min, max]` | `0.1`     | Initial particle size                          |
| `start_color`      | `string` (hex)           | `#ffffff` | Initial particle color                         |
| `gravity_modifier` | `number`                 | `0.0`     | Gravity scale (-1 = rise, 0 = float, 1 = fall) |
| `simulation_space` | `string`                 | `"local"` | `"local"` or `"world"`                         |

**Trait decorators:** `@looping` (continuous emission), `@burst` (one-shot burst), `@oneshot` (play once), `@gpu` (GPU compute).

### Particle Module Sub-Blocks

Modules are named sub-blocks that configure specific aspects of particle behavior:

#### emission

| Property         | Type     | Description            |
| ---------------- | -------- | ---------------------- |
| `rate_over_time` | `number` | Steady emission rate   |
| `burst_count`    | `number` | Particles per burst    |
| `burst_interval` | `number` | Seconds between bursts |

#### lifetime

| Property | Type     | Description                                   |
| -------- | -------- | --------------------------------------------- |
| `min`    | `number` | Minimum lifetime                              |
| `max`    | `number` | Maximum lifetime                              |
| `curve`  | `string` | Easing curve (`"ease_out"`, `"linear"`, etc.) |

#### velocity

| Property    | Type                       | Description                |
| ----------- | -------------------------- | -------------------------- |
| `direction` | `[number, number, number]` | Emission direction         |
| `speed`     | `number`                   | Velocity magnitude         |
| `spread`    | `number`                   | Cone angle in degrees      |
| `randomize` | `boolean`                  | Add velocity randomization |

#### force

| Property     | Type                       | Description          |
| ------------ | -------------------------- | -------------------- |
| `gravity`    | `[number, number, number]` | Gravity force vector |
| `wind`       | `[number, number, number]` | Wind force vector    |
| `turbulence` | `number`                   | Turbulence intensity |
| `drag`       | `number`                   | Velocity damping     |

#### color_over_life

| Property   | Type       | Description                         |
| ---------- | ---------- | ----------------------------------- |
| `gradient` | `string[]` | Array of hex colors across lifetime |
| `mode`     | `string`   | `"blend"`, `"random"`               |

#### size_over_life

| Property | Type       | Description                            |
| -------- | ---------- | -------------------------------------- |
| `curve`  | `number[]` | Size multiplier values across lifetime |
| `mode`   | `string`   | `"linear"`, `"bezier"`                 |

#### rotation_over_life

| Property           | Type                       | Description                  |
| ------------------ | -------------------------- | ---------------------------- |
| `angular_velocity` | `[number, number, number]` | Rotation speed (degrees/sec) |
| `randomize`        | `boolean`                  | Randomize rotation           |

#### noise

| Property       | Type     | Description                   |
| -------------- | -------- | ----------------------------- |
| `strength`     | `number` | Noise displacement strength   |
| `frequency`    | `number` | Noise spatial frequency       |
| `scroll_speed` | `number` | Noise animation speed         |
| `octaves`      | `number` | Noise complexity layers       |
| `quality`      | `string` | `"low"`, `"medium"`, `"high"` |

#### collision

| Property        | Type      | Description                           |
| --------------- | --------- | ------------------------------------- |
| `enabled`       | `boolean` | Enable particle-world collision       |
| `bounce`        | `number`  | Bounciness factor                     |
| `lifetime_loss` | `number`  | Lifetime reduction on collision (0-1) |
| `dampen`        | `number`  | Velocity damping on collision         |
| `type`          | `string`  | `"world"`, `"planes"`                 |

#### sub_emitter

| Property        | Type      | Description                         |
| --------------- | --------- | ----------------------------------- |
| `trigger`       | `string`  | `"collision"`, `"death"`, `"birth"` |
| `inherit_color` | `boolean` | Child inherits parent color         |
| `inherit_size`  | `number`  | Size inheritance factor             |
| `emit_count`    | `number`  | Particles spawned per trigger       |
| `system`        | `string`  | Name of sub-emitter particle system |

#### shape

| Property    | Type                       | Description                                       |
| ----------- | -------------------------- | ------------------------------------------------- |
| `type`      | `string`                   | `"cone"`, `"sphere"`, `"box"`, `"edge"`, `"mesh"` |
| `angle`     | `number`                   | Cone angle (degrees)                              |
| `radius`    | `number`                   | Shape radius                                      |
| `scale`     | `[number, number, number]` | Box dimensions                                    |
| `emit_from` | `string`                   | `"base"`, `"surface"`, `"volume"`                 |

#### renderer

| Property       | Type     | Description                                      |
| -------------- | -------- | ------------------------------------------------ |
| `material`     | `string` | Particle material path                           |
| `render_mode`  | `string` | `"billboard"`, `"stretched_billboard"`, `"mesh"` |
| `sort_mode`    | `string` | `"distance"`, `"age"`, `"none"`                  |
| `max_size`     | `number` | Maximum rendered size                            |
| `alignment`    | `string` | Billboard alignment (`"view"`, `"velocity"`)     |
| `length_scale` | `number` | Stretch factor for velocity billboards           |
| `speed_scale`  | `number` | Speed-dependent stretch                          |

#### trails

| Property              | Type       | Description                             |
| --------------------- | ---------- | --------------------------------------- |
| `enabled`             | `boolean`  | Enable trail rendering                  |
| `width`               | `number`   | Trail width                             |
| `lifetime`            | `number`   | Trail segment lifetime                  |
| `color_over_trail`    | `string[]` | Color gradient along trail              |
| `min_vertex_distance` | `number`   | Minimum distance between trail vertices |
| `world_space`         | `boolean`  | Trails in world space                   |

#### texture_sheet

| Property      | Type     | Description                      |
| ------------- | -------- | -------------------------------- |
| `tiles_x`     | `number` | Horizontal tiles in sprite sheet |
| `tiles_y`     | `number` | Vertical tiles in sprite sheet   |
| `animation`   | `string` | `"whole_sheet"`, `"single_row"`  |
| `frame_rate`  | `number` | Frames per second                |
| `start_frame` | `number` | First frame index                |
| `cycles`      | `number` | Animation loop count             |

#### inherit_velocity

| Property     | Type     | Description                 |
| ------------ | -------- | --------------------------- |
| `mode`       | `string` | `"current"`, `"initial"`    |
| `multiplier` | `number` | Velocity inheritance factor |

**Full particle system example:**

```holoscript
particles "CampfireSmoke" @looping {
  rate: 500
  max_particles: 2000
  start_lifetime: [2, 4]
  start_speed: [0.5, 1.5]
  start_size: [0.1, 0.3]
  gravity_modifier: 0.1
  simulation_space: "world"

  emission {
    rate_over_time: 500
    burst_count: 10
    burst_interval: 0.5
  }

  velocity {
    direction: [0, 1, 0]
    speed: 1.5
    spread: 25
    randomize: true
  }

  color_over_life {
    gradient: ["#ff6600", "#888888", "#00000000"]
    mode: "blend"
  }

  size_over_life {
    curve: [1.0, 1.5, 0.0]
    mode: "bezier"
  }

  noise {
    strength: 0.3
    frequency: 2.0
    scroll_speed: 0.1
    octaves: 2
  }

  shape {
    type: "cone"
    angle: 25
    radius: 0.3
    emit_from: "base"
  }

  renderer {
    material: "particles/smoke_additive"
    render_mode: "billboard"
    sort_mode: "distance"
  }
}
```

**GPU Particle Trait** (`GPUParticleTrait.ts`): For GPU-accelerated particle systems with millions of particles. Key config: `count` (max particles), `emission_rate`, `lifetime`, `initial_velocity`, `velocity_variance`, `spread_angle`, `forces[]` (gravity/wind/vortex/attractor/turbulence), `color_over_life[]`, `size_over_life[]`, `collision`, `spatial_hash`, `blend_mode`.

---

## Post-Processing Blocks

**Domain type**: `postfx`
**Compiler function**: `compilePostProcessingBlock()` in `DomainBlockCompilerMixin.ts`
**Compiled type**: `CompiledPostProcessing`

### Post-Processing Keywords

Three interchangeable keywords:

| Keyword           | Typical Use                        |
| ----------------- | ---------------------------------- |
| `post_processing` | Standard post-processing pipeline  |
| `post_fx`         | Shorthand for post effects         |
| `render_pipeline` | Full render pipeline configuration |

Post-processing blocks can be **named** or **unnamed** and placed at the top level or inside compositions.

### Post-Processing Effect Sub-Blocks

#### bloom

| Property       | Type           | Default   | Description                    |
| -------------- | -------------- | --------- | ------------------------------ |
| `intensity`    | `number`       | `0.5`     | Bloom strength                 |
| `threshold`    | `number`       | `1.0`     | Brightness threshold for bloom |
| `scatter`      | `number`       | `0.7`     | Bloom spread                   |
| `tint`         | `string` (hex) | `#ffffff` | Bloom color tint               |
| `clamp`        | `number`       | `65000`   | Maximum bloom brightness       |
| `high_quality` | `boolean`      | `false`   | Enable high-quality bloom      |

#### depth_of_field

| Property         | Type     | Default    | Description                         |
| ---------------- | -------- | ---------- | ----------------------------------- |
| `aperture`       | `number` | `5.6`      | f-stop aperture (lower = more blur) |
| `focal_length`   | `number` | `50`       | Lens focal length (mm)              |
| `focus_distance` | `number` | `10`       | Distance to focus plane (meters)    |
| `bokeh_shape`    | `string` | `"circle"` | Bokeh shape                         |
| `near_blur`      | `number` | `0.5`      | Near field blur intensity           |
| `far_blur`       | `number` | `1.0`      | Far field blur intensity            |

#### color_grading

| Property          | Type                       | Default   | Description                      |
| ----------------- | -------------------------- | --------- | -------------------------------- |
| `temperature`     | `number`                   | `6500`    | Color temperature (Kelvin)       |
| `tint_offset`     | `number`                   | `0`       | Green-magenta tint shift         |
| `contrast`        | `number`                   | `1.0`     | Contrast multiplier              |
| `saturation`      | `number`                   | `1.0`     | Color saturation multiplier      |
| `lift`            | `[number, number, number]` | `[0,0,0]` | Shadow color adjustment (RGB)    |
| `gamma`           | `[number, number, number]` | `[1,1,1]` | Midtone color adjustment (RGB)   |
| `gain`            | `[number, number, number]` | `[1,1,1]` | Highlight color adjustment (RGB) |
| `hue_shift`       | `number`                   | `0`       | Global hue rotation (degrees)    |
| `posterize_steps` | `number`                   | -         | Posterization band count         |

#### tone_mapping

| Property      | Type     | Default  | Description                                                |
| ------------- | -------- | -------- | ---------------------------------------------------------- |
| `mode`        | `string` | `"ACES"` | Algorithm: `"ACES"`, `"Neutral"`, `"Filmic"`, `"Reinhard"` |
| `exposure`    | `number` | `1.0`    | Exposure compensation                                      |
| `white_point` | `number` | `6500`   | White point temperature                                    |

#### vignette

| Property     | Type           | Default   | Description         |
| ------------ | -------------- | --------- | ------------------- |
| `intensity`  | `number`       | `0.3`     | Darkening intensity |
| `smoothness` | `number`       | `0.5`     | Edge softness       |
| `roundness`  | `number`       | `1.0`     | Shape roundness     |
| `color`      | `string` (hex) | `#000000` | Vignette color      |

#### ambient_occlusion / ssao

| Property                   | Type     | Default    | Description                              |
| -------------------------- | -------- | ---------- | ---------------------------------------- |
| `intensity`                | `number` | `1.0`      | AO darkening strength                    |
| `radius`                   | `number` | `0.5`      | Sample radius                            |
| `quality`                  | `string` | `"medium"` | `"low"`, `"medium"`, `"high"`, `"ultra"` |
| `thickness_modifier`       | `number` | `1.0`      | Thickness heuristic                      |
| `sample_count`             | `number` | `8`        | Ray sample count                         |
| `direct_lighting_strength` | `number` | `0.0`      | AO influence on direct lighting          |
| `thickness`                | `number` | `0.5`      | Contact shadow thickness                 |

#### screen_space_reflections / ssr

| Property        | Type     | Default    | Description                     |
| --------------- | -------- | ---------- | ------------------------------- |
| `max_distance`  | `number` | `100`      | Max trace distance              |
| `thickness`     | `number` | `0.1`      | Ray thickness                   |
| `quality`       | `string` | `"medium"` | Quality preset                  |
| `step_count`    | `number` | `64`       | Ray march step count            |
| `max_steps`     | `number` | `128`      | Maximum ray steps               |
| `resolution`    | `string` | `"full"`   | `"full"`, `"half"`, `"quarter"` |
| `fade_distance` | `number` | `10`       | Reflection fade distance        |

#### motion_blur

| Property       | Type     | Default | Description                   |
| -------------- | -------- | ------- | ----------------------------- |
| `intensity`    | `number` | `0.5`   | Blur strength                 |
| `sample_count` | `number` | `10`    | Motion samples                |
| `max_velocity` | `number` | `20`    | Maximum velocity contribution |

#### chromatic_aberration

| Property      | Type     | Default | Description         |
| ------------- | -------- | ------- | ------------------- |
| `intensity`   | `number` | `0.05`  | Aberration strength |
| `max_samples` | `number` | `8`     | Quality samples     |

#### volumetric_fog

| Property         | Type           | Default   | Description               |
| ---------------- | -------------- | --------- | ------------------------- |
| `density`        | `number`       | `0.02`    | Fog density               |
| `height_falloff` | `number`       | `0.5`     | Height-based falloff      |
| `color`          | `string` (hex) | `#aabbcc` | Fog color                 |
| `max_distance`   | `number`       | `500`     | Maximum render distance   |
| `anisotropy`     | `number`       | `0.6`     | Scattering directionality |

#### fog

| Property  | Type           | Default    | Description                                          |
| --------- | -------------- | ---------- | ---------------------------------------------------- |
| `color`   | `string` (hex) | -          | Fog color                                            |
| `density` | `number`       | `0.01`     | Density coefficient                                  |
| `mode`    | `string`       | `"linear"` | `"linear"`, `"exponential"`, `"exponential_squared"` |
| `start`   | `number`       | `10`       | Near fog distance (linear mode)                      |
| `end`     | `number`       | `200`      | Far fog distance (linear mode)                       |

#### god_rays

| Property           | Type      | Default | Description         |
| ------------------ | --------- | ------- | ------------------- |
| `intensity`        | `number`  | `0.5`   | Ray intensity       |
| `weight`           | `number`  | `0.6`   | Sample weight       |
| `density`          | `number`  | `0.3`   | Ray density         |
| `decay`            | `number`  | `0.95`  | Light decay rate    |
| `exposure_control` | `boolean` | `true`  | Exposure adaptation |
| `sample_count`     | `number`  | `64`    | Quality samples     |

#### anti_aliasing / fxaa / smaa / taa

| Property           | Type     | Default    | Description                                |
| ------------------ | -------- | ---------- | ------------------------------------------ |
| `mode`             | `string` | `"TAA"`    | AA algorithm (`"TAA"`, `"FXAA"`, `"SMAA"`) |
| `quality`          | `string` | `"medium"` | Quality level                              |
| `sharpness`        | `number` | `0.5`      | Output sharpening                          |
| `jitter_spread`    | `number` | `0.75`     | TAA jitter spread                          |
| `subpixel_quality` | `number` | `0.75`     | FXAA subpixel quality                      |
| `edge_threshold`   | `number` | `0.166`    | FXAA edge detection threshold              |

#### film_grain

| Property                 | Type     | Default | Description               |
| ------------------------ | -------- | ------- | ------------------------- |
| `intensity`              | `number` | `0.1`   | Grain strength            |
| `response`               | `number` | `0.8`   | Luminance response        |
| `size`                   | `number` | `1.0`   | Grain size                |
| `luminance_contribution` | `number` | `0.5`   | Luminance-dependent grain |

#### lens_flare

| Property        | Type      | Default | Description              |
| --------------- | --------- | ------- | ------------------------ |
| `intensity`     | `number`  | `0.5`   | Flare intensity          |
| `starburst`     | `boolean` | `false` | Enable starburst pattern |
| `ghost_count`   | `number`  | `4`     | Number of ghost images   |
| `ghost_spacing` | `number`  | `0.3`   | Spacing between ghosts   |
| `halo_radius`   | `number`  | `0.5`   | Halo ring radius         |

#### outline

| Property           | Type           | Default          | Description             |
| ------------------ | -------------- | ---------------- | ----------------------- |
| `width`            | `number`       | `2.0`            | Outline width (pixels)  |
| `color`            | `string` (hex) | `#000000`        | Outline color           |
| `depth_threshold`  | `number`       | `0.1`            | Depth edge sensitivity  |
| `normal_threshold` | `number`       | `0.5`            | Normal edge sensitivity |
| `mode`             | `string`       | `"depth_normal"` | Detection mode          |

#### pixelate

| Property     | Type               | Default | Description       |
| ------------ | ------------------ | ------- | ----------------- |
| `resolution` | `[number, number]` | -       | Target resolution |
| `pixel_size` | `number`           | `4`     | Pixel block size  |

**Example:**

```holoscript
post_processing "CinematicLook" {
  bloom {
    intensity: 0.8
    threshold: 1.0
    scatter: 0.7
    tint: #ffeecc
  }

  depth_of_field {
    aperture: 2.8
    focal_length: 50
    focus_distance: 10
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

---

## Audio Blocks

**Domain type**: `audio`
**Compiler function**: `compileAudioSourceBlock()` in `DomainBlockCompilerMixin.ts`
**Compiled type**: `CompiledAudioSource`

### audio_source

Spatial or global audio emitter.

**Properties:**

| Property        | Type      | Default         | Description                                 |
| --------------- | --------- | --------------- | ------------------------------------------- |
| `clip`          | `string`  | -               | Audio file path                             |
| `volume`        | `number`  | `1.0`           | Playback volume (0-1)                       |
| `pitch`         | `number`  | `1.0`           | Playback pitch multiplier                   |
| `spatial_blend` | `number`  | `0.0`           | 2D-3D blend (0 = stereo, 1 = fully spatial) |
| `min_distance`  | `number`  | `1`             | Distance at full volume                     |
| `max_distance`  | `number`  | `50`            | Distance at zero volume                     |
| `rolloff_mode`  | `string`  | `"logarithmic"` | `"logarithmic"`, `"linear"`, `"custom"`     |
| `loop`          | `boolean` | `false`         | Loop playback                               |
| `play_on_awake` | `boolean` | `false`         | Auto-play on scene load                     |
| `doppler_level` | `number`  | `0.0`           | Doppler effect strength                     |
| `spread`        | `number`  | `0`             | Spatial spread angle (degrees, 0-360)       |
| `priority`      | `number`  | `128`           | Audio priority (0 = highest)                |

**Trait decorators:** `@spatial` (3D positional), `@hrtf` (head-related transfer function), `@3d`, `@stereo`, `@spatialized`.

**Example:**

```holoscript
audio_source "Waterfall" @spatial @hrtf {
  clip: "sounds/waterfall_loop.ogg"
  volume: 0.8
  pitch: 1.0
  spatial_blend: 1.0
  min_distance: 1
  max_distance: 50
  rolloff_mode: "logarithmic"
  loop: true
  play_on_awake: true
  doppler_level: 0.5
  spread: 60
  priority: 128
}
```

### audio_listener

Camera/player ear position for spatial audio.

**Properties:**

| Property         | Type                       | Default     | Description             |
| ---------------- | -------------------------- | ----------- | ----------------------- |
| `position`       | `[number, number, number]` | `[0,0,0]`   | Listener world position |
| `hrtf_profile`   | `string`                   | `"default"` | HRTF profile name       |
| `global_volume`  | `number`                   | `1.0`       | Master volume           |
| `speed_of_sound` | `number`                   | `343`       | Speed of sound (m/s)    |
| `distance_model` | `string`                   | `"inverse"` | Attenuation model       |

**Example:**

```holoscript
audio_listener "PlayerEar" @hrtf {
  position: [0, 1.7, 0]
  hrtf_profile: "default"
  global_volume: 1.0
  speed_of_sound: 343
  distance_model: "inverse"
}
```

### reverb_zone

Spatial volume that applies room acoustics simulation.

**Handler**: `packages/core/src/traits/ReverbZoneTrait.ts`

**Properties:**

| Property               | Type     | Default  | Description                                                                                            |
| ---------------------- | -------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `preset`               | `string` | `"room"` | Preset: `"room"`, `"hall"`, `"cathedral"`, `"cave"`, `"outdoor"`, `"bathroom"`, `"studio"`, `"custom"` |
| `min_distance`         | `number` | -        | Inner zone radius (full effect)                                                                        |
| `max_distance`         | `number` | -        | Outer zone radius (fade out)                                                                           |
| `size`                 | `number` | `10`     | Zone size                                                                                              |
| `decay_time`           | `number` | `1.5`    | Reverb tail length (seconds)                                                                           |
| `damping`              | `number` | `0.5`    | High-frequency damping                                                                                 |
| `diffusion`            | `number` | `0.7`    | Reverb diffusion (0-100)                                                                               |
| `pre_delay`            | `number` | `20`     | Pre-delay in ms                                                                                        |
| `wet_level`            | `number` | `0.3`    | Reverb mix level                                                                                       |
| `dry_level`            | `number` | `1.0`    | Dry signal level                                                                                       |
| `shape`                | `string` | `"box"`  | Zone shape: `"box"`, `"sphere"`, `"convex"`                                                            |
| `priority`             | `number` | `0`      | Priority when zones overlap                                                                            |
| `blend_distance`       | `number` | `2`      | Smooth transition distance                                                                             |
| `impulse_response_url` | `string` | `""`     | Custom IR convolution URL                                                                              |
| `room`                 | `number` | -        | Room filter level (dB)                                                                                 |
| `room_hf`              | `number` | -        | High-frequency room filter                                                                             |
| `reflections`          | `number` | -        | Early reflections level (dB)                                                                           |
| `reflections_delay`    | `number` | -        | Reflections delay (seconds)                                                                            |
| `reverb_level`         | `number` | -        | Late reverb level (dB)                                                                                 |
| `reverb_delay`         | `number` | -        | Late reverb delay (seconds)                                                                            |
| `density`              | `number` | -        | Echo density (0-100)                                                                                   |

**Runtime behavior**: Smooth blend between zones using `blend_distance`, per-listener zone tracking, convolver IR loading. Emits `reverb_zone_register`, `reverb_zone_enter`, `reverb_zone_exit`, `reverb_update_mix` events.

**Example:**

```holoscript
reverb_zone "CaveReverb" {
  preset: "cave"
  min_distance: 5
  max_distance: 30
  room: -1000
  room_hf: -500
  decay_time: 3.0
  reflections: -200
  reflections_delay: 0.02
  reverb_level: -100
  reverb_delay: 0.04
  diffusion: 100
  density: 100
}
```

### audio_mixer

Channel mixing and volume control for audio groups.

**Properties:**

| Property              | Type      | Default | Description               |
| --------------------- | --------- | ------- | ------------------------- |
| `master_volume`       | `number`  | `1.0`   | Master bus volume         |
| `music_volume`        | `number`  | `1.0`   | Music bus volume          |
| `sfx_volume`          | `number`  | `1.0`   | Sound effects bus volume  |
| `ambient_volume`      | `number`  | `1.0`   | Ambient bus volume        |
| `voice_volume`        | `number`  | `1.0`   | Voice/dialogue bus volume |
| `ducking_enabled`     | `boolean` | `false` | Enable audio ducking      |
| `ducking_threshold`   | `number`  | `0.8`   | Ducking trigger threshold |
| `ducking_ratio`       | `number`  | `0.3`   | Ducking reduction ratio   |
| `low_pass_frequency`  | `number`  | `22000` | Low-pass filter cutoff    |
| `high_pass_frequency` | `number`  | `20`    | High-pass filter cutoff   |

**Example:**

```holoscript
audio_mixer "MasterMixer" {
  master_volume: 1.0
  music_volume: 0.7
  sfx_volume: 0.9
  ambient_volume: 0.6
  voice_volume: 1.0
  ducking_enabled: true
  ducking_threshold: 0.8
  ducking_ratio: 0.3
}
```

### ambience

Background environmental soundscape, typically with low spatial blend for wide coverage.

Uses the same properties as `audio_source` but semantically represents ambient background audio.

**Example:**

```holoscript
ambience "ForestAmbient" @spatial {
  clip: "sounds/forest_birds_wind.ogg"
  volume: 0.5
  loop: true
  play_on_awake: true
  spatial_blend: 0.3
  spread: 360
  min_distance: 0
  max_distance: 100
  rolloff_mode: "linear"
}
```

### sound_emitter

Point emitter for triggered sound effects (footsteps, UI, impacts).

Same property set as `audio_source` plus:

| Property          | Type               | Default      | Description                |
| ----------------- | ------------------ | ------------ | -------------------------- |
| `randomize_pitch` | `boolean`          | `false`      | Enable pitch randomization |
| `pitch_range`     | `[number, number]` | `[1.0, 1.0]` | Min/max pitch range        |

**Example:**

```holoscript
sound_emitter "FootstepEmitter" @spatial {
  clip: "sounds/footstep_stone.ogg"
  volume: 0.6
  spatial_blend: 1.0
  min_distance: 0.5
  max_distance: 15
  rolloff_mode: "logarithmic"
  loop: false
  play_on_awake: false
  randomize_pitch: true
  pitch_range: [0.9, 1.1]
}
```

**Advanced audio traits** (separate handler files):

- **AudioPortalTrait** (`AudioPortalTrait.ts`): Sound transmission through openings (doors, windows). Models diffraction, transmission loss, and frequency filtering between reverb zones.
- **HeadTrackedAudioTrait** (`HeadTrackedAudioTrait.ts`): Audio that compensates for VR head rotation to maintain stable world-anchored positioning. Supports `world`, `head`, and `hybrid` anchor modes.

---

## Trait Integration Patterns

Perception blocks integrate with HoloScript's trait system at multiple levels:

### 1. Trait Decorators on Blocks

```holoscript
// @spatial and @hrtf are traits applied to the audio_source block
audio_source "Waterfall" @spatial @hrtf {
  clip: "sounds/waterfall_loop.ogg"
  spatial_blend: 1.0
}

// @looping is a trait that controls emission behavior
particles "Fireflies" @looping {
  rate: 50
  max_particles: 200
}
```

Decorators are stored in `block.traits[]` and read by compilers and the runtime `TraitBinder`.

### 2. Trait Requirements and Conflicts

From `packages/core/src/traits/traitConstraints.ts`:

```
@physics    requires  @collidable
@grabbable  requires  @physics
@throwable  requires  @grabbable
@breakable  requires  @physics, @collidable
@cloth      requires  @mesh
@soft_body  requires  @mesh
@static     conflicts @physics, @grabbable, @throwable
```

The compiler validates these constraints at compile time and emits errors with suggested fixes.

### 3. Objects Combining Perception Blocks with Traits

```holoscript
object "InteractiveBarrel" @grabbable @throwable @breakable {
  src: "models/barrel.glb"
  position: [3, 0.5, 1]

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
}
```

### 4. Templates with Perception Blocks

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

### 5. Registered Trait Constants

The following trait categories are registered as constants:

**Rendering traits** (`packages/core/src/traits/constants/rendering.ts`):
`advanced_pbr`, `clearcoat`, `anisotropy`, `sheen`, `subsurface_scattering`, `sss_burley`, `sss_christensen`, `sss_random_walk`, `iridescence`, `transmission`, `dispersion`, `ssao`, `ssr`, `ssgi`, `taa`, `motion_blur`, `depth_of_field`, `dof_bokeh`, `chromatic_aberration`, `lens_flare`, `film_grain`, `vignette`, `post_processing_stack`

**Audio traits** (`packages/core/src/traits/constants/audio.ts`):
`spatial_audio`, `voice`, `reactive_audio`, `ambisonics`, `hrtf`, `reverb_zone`, `audio_occlusion`, `audio_portal`, `audio_material`, `head_tracked_audio`

---

## Cross-Platform Compilation

`DomainBlockCompilerMixin.ts` exports target-specific code generators for each perception domain:

### Material Compilation

| Target         | Function             | Output                                               |
| -------------- | -------------------- | ---------------------------------------------------- |
| R3F/Three.js   | `materialToR3F()`    | `<meshStandardMaterial>` / `<meshBasicMaterial>` JSX |
| Unity C#       | `materialToUnity()`  | `Material` + `Shader.Find()` + property setup        |
| Unreal C++     | `materialToUnreal()` | `UMaterialInstanceDynamic` setup                     |
| Godot GDScript | `materialToGodot()`  | `StandardMaterial3D` setup                           |
| USD            | `materialToUSD()`    | `UsdPreviewSurface` shader prim                      |
| glTF           | `materialToGLTF()`   | `pbrMetallicRoughness` JSON object                   |

### Physics Compilation

| Target         | Function            | Output                                                |
| -------------- | ------------------- | ----------------------------------------------------- |
| Unity C#       | `physicsToUnity()`  | `Rigidbody`, `Collider`, `WindZone` components        |
| Unreal C++     | `physicsToUnreal()` | `UStaticMeshComponent`, `UPhysicsConstraintComponent` |
| Godot GDScript | `physicsToGodot()`  | `RigidBody3D`, `CollisionShape3D`, joint nodes        |
| URDF           | `physicsToURDF()`   | `<joint>`, `<collision>`, `<inertial>` XML elements   |

### Particle Compilation

| Target         | Function              | Output                                      |
| -------------- | --------------------- | ------------------------------------------- |
| R3F/Three.js   | `particlesToR3F()`    | `<ParticleSystem>` JSX with module children |
| Unity C#       | `particlesToUnity()`  | `ParticleSystem` component + `main` module  |
| Unreal C++     | `particlesToUnreal()` | `UNiagaraComponent` setup                   |
| Godot GDScript | `particlesToGodot()`  | `GPUParticles3D` node                       |

### Post-Processing Compilation

| Target         | Function                   | Output                                          |
| -------------- | -------------------------- | ----------------------------------------------- |
| R3F/Three.js   | `postProcessingToR3F()`    | `<EffectComposer>` with child effect components |
| Unity C#       | `postProcessingToUnity()`  | URP Volume Profile comments                     |
| Unreal C++     | `postProcessingToUnreal()` | `UPostProcessComponent` settings                |
| Godot GDScript | `postProcessingToGodot()`  | `WorldEnvironment` + `Environment`              |

### Audio Compilation

| Target       | Function                | Output                                       |
| ------------ | ----------------------- | -------------------------------------------- |
| R3F/Three.js | `audioSourceToR3F()`    | `<PositionalAudio>` or `<Audio>` JSX         |
| Unity C#     | `audioSourceToUnity()`  | `AudioSource` / `AudioReverbZone` components |
| Unreal C++   | `audioSourceToUnreal()` | `UAudioComponent` with attenuation           |

---

## Performance Considerations

### Platform Resource Budgets

From `packages/core/src/compiler/safety/ResourceBudgetAnalyzer.ts`:

| Resource       | Quest 3 | Desktop VR | WebGPU | Mobile AR |
| -------------- | ------- | ---------- | ------ | --------- |
| Particles      | 5,000   | 50,000     | 20,000 | 2,000     |
| Physics Bodies | 200     | 2,000      | 500    | 50        |
| Audio Sources  | 16      | 64         | 32     | 8         |
| Mesh Instances | 500     | 5,000      | 2,000  | 200       |
| Shader Passes  | 4       | 16         | 8      | 2         |
| Draw Calls     | 200     | 2,000      | 500    | 100       |
| Memory (MB)    | 512     | 4,096      | 1,024  | 256       |

### Trait Resource Costs

Each trait/block adds known resource costs:

| Trait       | Particles | Physics | Audio | Draw Calls | Memory |
| ----------- | --------- | ------- | ----- | ---------- | ------ |
| `@particle` | +100      | -       | -     | +1         | +2 MB  |
| `@physics`  | -         | +1      | -     | -          | -      |
| `@audio`    | -         | -       | +1    | -          | -      |
| `@vfx`      | +200      | -       | -     | +2         | -      |
| `@shader`   | -         | -       | -     | +1         | -      |
| `@gaussian` | -         | -       | -     | -          | +10 MB |

### Optimization Guidelines

1. **Particles**: Use `@looping` only when needed; `@oneshot` systems reclaim particles faster. Keep `max_particles` within platform budget. Use `simulation_space: "world"` only when particles must persist after emitter moves.

2. **Physics**: Use `is_kinematic: true` for animated objects that don't need simulation. Use trigger colliders (`is_trigger: true`) instead of rigidbodies for detection-only zones. Convex colliders are significantly cheaper than mesh colliders.

3. **Post-Processing**: On Quest 3, limit to bloom + single AA mode. Avoid `volumetric_fog` and `ssr` on mobile. `fxaa` is cheapest; `taa` provides best quality but requires motion vectors.

4. **Audio**: Keep spatial audio source count within platform budget. Use `rolloff_mode: "linear"` for cheaper distance calculations. Reduce `spread` to lower spatialization cost. Reverb zones with `preset` are cheaper than custom IR convolution.

5. **Materials**: Subsurface scattering (`@sss`) is expensive; limit to hero objects. Toon materials with outlines require an extra pass. Glass/transmission materials require depth pre-pass.

6. **Articulations**: Increase `solver_iterations` only when joint instability occurs. Each joint in an articulation chain adds one physics body to the budget.

7. **VR-specific** (from `G.003.09` rule): NEVER put per-pixel classifiers in the VR render loop (11.1ms frame budget at 90Hz). Use tiered LOD for particle systems and physics.

---

## Production Scene Example

The following composition demonstrates all five perception block types working together in a blacksmith's forge workshop:

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

material "StoneBrick" @pbr {
  baseColor: #665544
  roughness: 0.9
  metallic: 0.0
  albedo_map {
    source: "textures/stone_albedo.png"
    tiling: [4, 4]
    filtering: "trilinear"
  }
  normal_map {
    source: "textures/stone_normal.png"
    strength: 1.2
  }
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

This scene declares 4 materials (PBR, SSS, glass, standard), 2 force fields (wind, gravity), 1 articulation (bellows mechanism with 2 joints), 2 particle systems (embers with trails + smoke), a full post-processing pipeline (bloom, AO, DoF, color grading, volumetric fog, TAA), and 5 audio elements (spatial fire crackle, anvil SFX, ambient soundscape, reverb zone, mixer). It compiles to Unity, Unreal, Godot, R3F, WebGPU, USD, and URDF targets.

---

## Further Reading

- **Perception test files**: `examples/perception-tests/01-06` -- individual block type test suites
- **Trait constraints**: `packages/core/src/traits/traitConstraints.ts`
- **Resource budgets**: `packages/core/src/compiler/safety/ResourceBudgetAnalyzer.ts`
- **GPU particles**: `packages/core/src/traits/GPUParticleTrait.ts`
- **Wind handler**: `packages/core/src/traits/WindTrait.ts`
- **Reverb handler**: `packages/core/src/traits/ReverbZoneTrait.ts`
- **Audio portal**: `packages/core/src/traits/AudioPortalTrait.ts`
- **Head-tracked audio**: `packages/core/src/traits/HeadTrackedAudioTrait.ts`
- **Fluid simulation**: `packages/core/src/traits/FluidSimulationTrait.ts`
- **Compiler mixin**: `packages/core/src/compiler/DomainBlockCompilerMixin.ts`
- **AST types**: `packages/core/src/parser/HoloCompositionTypes.ts`
