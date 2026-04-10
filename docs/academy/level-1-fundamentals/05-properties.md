# Properties Deep Dive

Welcome to Lesson 1.5! In this lesson, you'll master all the properties available in HoloScript for customizing your 3D objects.

## Property Categories

Properties in HoloScript are organized into categories:

| Category      | Examples                          |
| ------------- | --------------------------------- |
| **Transform** | position, rotation, scale         |
| **Visual**    | color, opacity, material, visible |
| **Geometry**  | width, height, depth, radius      |
| **Behavior**  | castShadow, receiveShadow         |
| **Custom**    | Any user-defined property         |

## Transform Properties

### position

The location in 3D space as `[x, y, z]`:

```hs
composition cube {
  position: [0, 1.5, -2]
  // x: 0 (center)
  // y: 1.5 (1.5 meters up)
  // z: -2 (2 meters in front)
}
```

**Coordinate System:**

- **X** - Left (-) to Right (+)
- **Y** - Down (-) to Up (+)
- **Z** - In front (-) to Behind (+)

### rotation

Euler angles in degrees as `[pitch, yaw, roll]`:

```hs
composition rotated {
  rotation: [45, 180, 0]
  // pitch: 45° (tilted forward)
  // yaw: 180° (facing backward)
  // roll: 0° (no roll)
}
```

### scale

Size multiplier (uniform or `[x, y, z]`):

```hs
// Uniform scaling
composition big {
  scale: 2    // 2x size in all dimensions
}

// Non-uniform scaling
composition stretched {
  scale: [1, 2, 0.5]  // Normal width, 2x height, half depth
}
```

### pivot

The rotation/scale center point:

```hs
composition door {
  pivot: [-0.5, 0, 0]    // Pivot at left edge for door-like rotation
  rotation: [0, 90, 0]   // Open 90 degrees
}
```

## Visual Properties

### color

Object color using hex or color names:

```hs
composition colors {
  color: "#ff5733"      // Hex color
  color: "coral"        // CSS color name
  color: "rgb(255,87,51)"  // RGB format
}
```

### opacity

Transparency from 0 (invisible) to 1 (opaque):

```hs
composition ghost {
  color: "#ffffff"
  opacity: 0.3     // 70% transparent
}
```

### visible

Toggle visibility:

```hs
composition hidden {
  visible: false   // Invisible but still exists in scene
}
```

### material

Comprehensive material definition:

```hs
composition detailed {
  material: {
    // Base color
    color: "#4a90d9"

    // PBR properties
    metalness: 0.8       // 0-1, how metallic
    roughness: 0.2       // 0-1, surface roughness

    // Emission (glow)
    emissive: "#0066ff"
    emissiveIntensity: 0.5

    // Textures
    map: "textures/diffuse.jpg"
    normalMap: "textures/normal.jpg"
    roughnessMap: "textures/roughness.jpg"
    metalnessMap: "textures/metalness.jpg"

    // Transparency
    transparent: true
    opacity: 0.9

    // Additional
    side: "double"       // "front", "back", "double"
    wireframe: false
    flatShading: false
  }
}
```

### castShadow / receiveShadow

Shadow behavior:

```hs
composition shadowCaster {
  castShadow: true       // This object casts shadows
  receiveShadow: false   // But doesn't receive them
}
```

## Geometry Properties

Different geometry types have specific properties:

### Cube / Box

```hs
composition box {
  geometry: "cube"
  width: 1       // X dimension
  height: 2      // Y dimension
  depth: 0.5     // Z dimension
}
```

### Sphere

```hs
composition ball {
  geometry: "sphere"
  radius: 0.5
  widthSegments: 32      // Horizontal detail
  heightSegments: 16     // Vertical detail
}
```

### Cylinder

```hs
composition column {
  geometry: "cylinder"
  radiusTop: 0.3
  radiusBottom: 0.5      // Tapered
  height: 2.0
  radialSegments: 32
  openEnded: false       // Closed ends
}
```

### Plane

```hs
composition floor {
  geometry: "plane"
  width: 10
  height: 10
  widthSegments: 1
  heightSegments: 1
}
```

### Torus (Donut)

```hs
composition donut {
  geometry: "torus"
  radius: 1.0            // Distance from center
  tube: 0.3              // Tube thickness
  radialSegments: 16
  tubularSegments: 48
  arc: 6.28              // Full circle (2π)
}
```

## State Properties

Custom properties for your application logic:

```hs
composition player {
  // Game state
  health: 100
  score: 0
  isAlive: true
  inventory: []

  // Settings
  speed: 5.0
  jumpHeight: 2.0

  // Nested state
  stats: {
    strength: 10
    agility: 8
    wisdom: 12
  }
}
```

Access state in event handlers:

```hs
composition enemy {
  health: 100

  onHit: {
    this.health -= 10
    if (this.health <= 0) {
      this.visible = false
    }
  }
}
```

## Property Binding

Properties can reference other values:

### Static Values

```hs
composition static {
  size: 2
  position: [0, this.size / 2, 0]  // Computed from size
}
```

### Template Parameters

```hs
template Button {
  params {
    label: string = "Click"
    color: string = "#0066ff"
    size: number = 1
  }

  composition button {
    geometry: "cube"
    scale: params.size
    material: { color: params.color }
  }
}

// Using the template
Button { label: "Submit", color: "#00ff00", size: 1.5 }
```

## Animation Properties

Properties that change over time:

```hs
composition spinner {
  geometry: "cube"

  animation spin {
    property: "rotation.y"
    from: 0
    to: 360
    duration: 2000    // 2 seconds
    loop: infinite
    easing: "linear"
  }
}
```

Animatable properties:

- `position.x`, `position.y`, `position.z`
- `rotation.x`, `rotation.y`, `rotation.z`
- `scale` (uniform) or `scale.x`, `scale.y`, `scale.z`
- `opacity`
- `material.emissiveIntensity`
- Any numeric custom property

## Property Type Reference

| Type         | Example          | Description         |
| ------------ | ---------------- | ------------------- |
| `number`     | `1.5`            | Numeric value       |
| `string`     | `"hello"`        | Text value          |
| `boolean`    | `true`           | True/false          |
| `array`      | `[1, 2, 3]`      | List of values      |
| `object`     | `{ x: 1, y: 2 }` | Key-value pairs     |
| `color`      | `"#ff0000"`      | Hex color code      |
| `vector3`    | `[x, y, z]`      | 3D coordinate       |
| `quaternion` | `[x, y, z, w]`   | Rotation quaternion |

## Complete Example

```hs
composition interactiveObject {
  // Transform
  position: [0, 1.5, -2]
  rotation: [0, 45, 0]
  scale: 0.5

  // Visual
  geometry: "sphere"
  material: {
    color: "#4a90d9"
    metalness: 0.6
    roughness: 0.3
    emissive: "#000000"
  }
  castShadow: true
  receiveShadow: true

  // State
  isActivated: false
  pulseSpeed: 1.0

  // Behavior
  @grabbable
  @hoverable

  onHoverEnter: {
    this.material.emissive = "#4a90d9"
  }

  onHoverExit: {
    this.material.emissive = "#000000"
  }

  onGrab: {
    this.isActivated = true
  }
}
```

## Quiz

1. What's the difference between `scale: 2` and `scale: [2, 2, 2]`?
2. How do you make an object invisible but still interactive?
3. What property controls how shiny a surface looks?
4. How would you animate the Y position of an object?
5. What's the purpose of the `pivot` property?

<details>
<summary>Answers</summary>

1. They're equivalent - both scale uniformly by 2x
2. Set `visible: false` but the object remains in the scene graph
3. `roughness` (0 = shiny, 1 = rough) and `metalness`
4. Create an animation with `property: "position.y"`
5. Sets the center point for rotation and scaling operations

</details>

---

**Estimated time:** 30 minutes  
**Difficulty:** ⭐ Beginner  
**Next:** [Lesson 1.6 - Introduction to Traits](./06-traits-intro.md)
