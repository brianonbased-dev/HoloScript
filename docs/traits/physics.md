# Physics Traits

> Part of the HoloScript Traits reference. Browse: [Interaction](/traits/interaction) · [AI & Behavior](/traits/ai-behavior) · [All Traits](/traits/)

## Physics Traits

### @cloth

Real-time cloth simulation with wind, gravity, and tearing.

```hsplus
object Cape @cloth(resolution: 32, stiffness: 0.8) {
  geometry: 'plane'
}
```

| Config           | Type    | Default | Description                    |
| ---------------- | ------- | ------- | ------------------------------ |
| `resolution`     | number  | 32      | Grid resolution (NxN vertices) |
| `stiffness`      | number  | 0.8     | Constraint stiffness (0-1)     |
| `damping`        | number  | 0.01    | Velocity damping               |
| `mass`           | number  | 1.0     | Total cloth mass               |
| `gravity_scale`  | number  | 1.0     | Gravity multiplier             |
| `wind_response`  | number  | 0.5     | Wind force multiplier          |
| `self_collision` | boolean | false   | Enable self-collision          |
| `tearable`       | boolean | false   | Allow tearing                  |
| `tear_threshold` | number  | 100     | Force required to tear         |
| `pin_vertices`   | Array   | []      | Pinned vertex coordinates      |

**Events:**

- `cloth_create` - Simulation initialized
- `cloth_destroy` - Simulation destroyed
- `cloth_pin_vertex` - Vertex pinned
- `cloth_unpin_vertex` - Vertex unpinned
- `cloth_tear` - Cloth torn (if tearable)

---

### @fluid

Particle-based fluid simulation.

```hsplus
object Water @fluid(particle_count: 10000, viscosity: 0.01) {
  geometry: 'cube'
}
```

| Config              | Type    | Default   | Description                 |
| ------------------- | ------- | --------- | --------------------------- |
| `particle_count`    | number  | 10000     | Maximum particles           |
| `viscosity`         | number  | 0.01      | Fluid thickness             |
| `surface_tension`   | number  | 0.1       | Surface tension force       |
| `color`             | string  | '#0088ff' | Fluid color                 |
| `spawn_rate`        | number  | 100       | Particles per second        |
| `lifetime`          | number  | 10        | Particle lifetime (seconds) |
| `gravity_scale`     | number  | 1.0       | Gravity multiplier          |
| `collision_enabled` | boolean | true      | Collide with objects        |

**Events:**

- `fluid_create` - Simulation started
- `fluid_destroy` - Simulation stopped
- `fluid_add_emitter` - Emitter added
- `fluid_remove_emitter` - Emitter removed

---

### @rope

Segment-based rope physics with tension and slack.

```hsplus
object SwingingRope @rope(segments: 20, length: 5) {
  start: [0, 5, 0]
  end: [0, 0, 0]
}
```

| Config              | Type    | Default   | Description                |
| ------------------- | ------- | --------- | -------------------------- |
| `segments`          | number  | 10        | Number of segments         |
| `length`            | number  | 1.0       | Total rope length (meters) |
| `stiffness`         | number  | 0.9       | Segment stiffness          |
| `damping`           | number  | 0.1       | Velocity damping           |
| `gravity`           | number  | 9.81      | Gravity force              |
| `thickness`         | number  | 0.02      | Visual thickness           |
| `color`             | string  | '#8B4513' | Rope color                 |
| `collision_enabled` | boolean | true      | Collide with objects       |

**State:**

- `points` - Array of `{x, y, z}` positions (segments + 1 points)
- `isSimulating` - Whether simulation is active
- `tension` - Current rope tension

**Events:**

- `rope_create` - Rope initialized
- `rope_destroy` - Rope destroyed
- `rope_break` - Rope broken (if breakable)

---

### @soft_body

Deformable soft body physics.

```hsplus
object JellyBlob @soft_body(pressure: 1.0, volume_conservation: 0.9) {
  geometry: 'sphere'
}
```

| Config                | Type   | Default | Description                  |
| --------------------- | ------ | ------- | ---------------------------- |
| `pressure`            | number | 1.0     | Internal pressure            |
| `volume_conservation` | number | 0.9     | How much volume is preserved |
| `stiffness`           | number | 0.5     | Edge stiffness               |
| `damping`             | number | 0.1     | Velocity damping             |
| `mass`                | number | 1.0     | Total mass                   |

**Events:**

- `soft_body_create` - Simulation initialized
- `soft_body_destroy` - Simulation destroyed
- `soft_body_deform` - Significant deformation occurred

---

### @buoyancy

Water buoyancy simulation.

```hsplus
object Boat @buoyancy(water_level: 0, density: 0.7) {
  geometry: 'model/boat.glb'
}
```

| Config         | Type   | Default | Description                 |
| -------------- | ------ | ------- | --------------------------- |
| `water_level`  | number | 0       | Y-position of water surface |
| `density`      | number | 1.0     | Object density (< 1 floats) |
| `drag`         | number | 0.5     | Water resistance            |
| `angular_drag` | number | 0.3     | Rotational resistance       |

---

### @destruction

Breakable objects with fracture simulation.

```hsplus
object Vase @destruction(fracture_count: 8, break_threshold: 50) {
  geometry: 'model/vase.glb'
}
```

| Config            | Type   | Default | Description            |
| ----------------- | ------ | ------- | ---------------------- |
| `fracture_count`  | number | 8       | Number of fragments    |
| `break_threshold` | number | 50      | Impact force to break  |
| `debris_lifetime` | number | 5       | Seconds before cleanup |
| `explosion_force` | number | 10      | Fragment scatter force |

**Events:**

- `destruction_break` - Object broken
- `destruction_fragment` - Fragment created

---

## See Also

- [Interaction Traits](/traits/interaction)
- [Visual Traits](/traits/visual)
- [API Reference](/api/)
