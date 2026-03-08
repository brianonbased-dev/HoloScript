# Basic Syntax Reference (`.hs`)

Complete reference for HoloScript's basic `.hs` format - the simplest way to create 3D scenes.

## Overview

The `.hs` format is designed for:
- **Learning** - Easiest format to understand
- **Prototyping** - Quick scene creation
- **Static scenes** - Non-interactive visualizations
- **Declarative content** - Configuration-driven 3D

## Basic Object Declaration

The fundamental building block is the `object` keyword:

```holoscript
object "SimpleBox" {
  geometry: "box"
}
```

### With Position

```holoscript
object "PositionedSphere" {
  geometry: "sphere"
  position: { x: 2, y: 1, z: 0 }
}
```

### Full Transform

```holoscript
object "FullTransform" {
  geometry: "cylinder"
  position: { x: -2, y: 1, z: 0 }
  rotation: { x: 0, y: 45, z: 0 }
  scale: { x: 1, y: 2, z: 1 }
}
```

## Geometry Types

### Basic Primitives

```holoscript
object "Box" { geometry: "box" }
object "Sphere" { geometry: "sphere" }
object "Cylinder" { geometry: "cylinder" }
object "Cone" { geometry: "cone" }
object "Plane" { geometry: "plane" }
object "Torus" { geometry: "torus" }
object "Capsule" { geometry: "capsule" }
```

### Special Geometries

```holoscript
object "Heart" { geometry: "heart" }
object "Star" { geometry: "star" }
object "Crystal" { geometry: "crystal" }
object "Gem" { geometry: "gem" }
object "Gear" { geometry: "gear" }
object "Lightning" { geometry: "lightning" }
```

## Colors

### Named Colors

```holoscript
object "RedCube" {
  geometry: "box"
  color: "red"
}
```

### Hex Colors

```holoscript
object "BlueSphere" {
  geometry: "sphere"
  color: "#0088ff"
}
```

### Preset Colors

```holoscript
object "NeonBox" {
  geometry: "box"
  color: "neon"
}
```

Available presets: `neon`, `hologram`, `energy`, `ice`, `fire`, `forest`, and more.

## Materials

```holoscript
// Shiny metal
object "MetalSphere" {
  geometry: "sphere"
  material: "metal"
  color: "silver"
}

// Transparent glass
object "GlassBox" {
  geometry: "box"
  material: "glass"
  color: "#88ccff"
}
```

### Available Materials

- `standard` - Default material
- `metal` - Metallic surfaces
- `glass` - Transparent glass
- `plastic` - Plastic appearance
- `rubber` - Matte rubber
- `wood` - Wood grain
- `fabric` - Cloth texture
- `hologram` - Holographic effect
- `neon` - Neon glow

## Visual Effects

### Glow

```holoscript
object "GlowingSphere" {
  geometry: "sphere"
  color: "cyan"
  glow: true
}
```

### Emissive

```holoscript
object "EmissiveBox" {
  geometry: "box"
  color: "orange"
  emissive: true
  emissiveIntensity: 2.0
}
```

### Transparency

```holoscript
object "TransparentSphere" {
  geometry: "sphere"
  color: "blue"
  opacity: 0.5
}
```

### Wireframe

```holoscript
object "WireframeBox" {
  geometry: "box"
  wireframe: true
}
```

## Size Properties

### Box Dimensions

```holoscript
object "CustomBox" {
  geometry: "box"
  width: 2.0
  height: 1.0
  depth: 3.0
}
```

### Sphere Radius

```holoscript
object "LargeSphere" {
  geometry: "sphere"
  radius: 1.5
}
```

### Cylinder Dimensions

```holoscript
object "TallCylinder" {
  geometry: "cylinder"
  radius: 0.5
  height: 3.0
}
```

## Animations

### Basic Animation

```holoscript
object "SpinningCube" {
  geometry: "box"
  color: "purple"
  animate: "spin"
}
```

### Animation Types

- `pulse` - Scale pulse effect
- `float` - Up/down floating
- `bounce` - Bouncing motion
- `spin` - Rotation
- `flicker` - Opacity flicker
- `grow-shrink` - Size change
- `oscillate` - Back and forth

### Custom Animation Speed

```holoscript
// Fast spin (3x speed)
object "FastSpin" {
  geometry: "sphere"
  animate: "spin"
  animSpeed: 3.0
}

// Slow float (0.5x speed)
object "SlowFloat" {
  geometry: "sphere"
  animate: "float"
  animSpeed: 0.5
}
```

## Physics

```holoscript
object "PhysicsBox" {
  geometry: "box"
  physics: true
  mass: 10
}

object "HeavyBall" {
  geometry: "sphere"
  physics: true
  mass: 100
  friction: 0.8
  restitution: 0.3  // Bounciness
}
```

## Visibility

```holoscript
object "HiddenObject" {
  geometry: "box"
  visible: false
}
```

## Shadows and Lighting

```holoscript
object "ShadowCaster" {
  geometry: "box"
  castShadow: true
  receiveShadow: true
}
```

## Layering

```holoscript
object "ForegroundObject" {
  geometry: "box"
  layer: 1
  renderOrder: 10
}
```

## Parent-Child Grouping

```holoscript
object "ParentGroup" {
  geometry: "box"
  position: { x: 0, y: 0, z: 0 }

  child "ChildSphere" {
    geometry: "sphere"
    position: { x: 1, y: 1, z: 0 }  // Relative to parent
  }

  child "ChildCylinder" {
    geometry: "cylinder"
    position: { x: -1, y: 1, z: 0 }
  }
}
```

## Complete Example

```holoscript
object "FullyConfiguredObject" {
  // Identity
  id: "demo-object-001"
  name: "Demonstration Object"

  // Geometry
  geometry: "box"
  width: 2.0
  height: 1.0
  depth: 1.0

  // Transform
  position: { x: 0, y: 2, z: -5 }
  rotation: { x: 0, y: 45, z: 0 }
  scale: { x: 1, y: 1, z: 1 }

  // Appearance
  color: "#ff6b6b"
  material: "metal"
  opacity: 1.0

  // Visual effects
  glow: true
  emissive: true
  emissiveIntensity: 1.5

  // Animation
  animate: "float"
  animSpeed: 1.0

  // Physics
  physics: true
  mass: 10
  friction: 0.5
  restitution: 0.7

  // Rendering
  castShadow: true
  receiveShadow: true
  visible: true
  wireframe: false
  layer: 1
  renderOrder: 5
}
```

## Syntax Rules

For AI agents generating `.hs` code:

1. **Format**: Use `object "Name" { property: value }` syntax
2. **Properties**: camelCase property names
3. **Transforms**: Use `{ x, y, z }` objects for position/rotation/scale
4. **Colors**: Named colors or hex format `#RRGGBB`
5. **Names**: Always quote object names
6. **Booleans**: Use `true`/`false` (lowercase)
7. **Numbers**: Integers or floats (e.g., `1.0`, `10`)

## Limitations

The `.hs` format **does NOT support**:

- Interactivity (click handlers, VR grab)
- Templates/reusability
- State management
- Event handlers
- Complex logic

For these features, use [`.hsplus`](./reference-hsplus-templates) or [`.holo`](./reference-holo-entity) formats.

## Next Steps

- [Templates & Decorators (`.hsplus`)](./reference-hsplus-templates)
- [Cross-Format Comparison](./comparison-simple-scene)
- [Examples Gallery](/examples/)
