# Objects

Objects are the fundamental building blocks of HoloScript. Everything in a scene is an object.

## Basic Syntax

### .hs and .hsplus Syntax

```hs
composition objectName {
  property: value
  anotherProperty: value
}
```

### .holo Syntax

```holo
object "Object Name" {
  property: value
}
```

---

## Properties

### Transform Properties

Every object can have position, rotation, and scale:

```hs
composition myObject {
  position: [0, 1.6, -2]     // Vector [x, y, z]
  rotation: [0, 45, 0]       // Euler angles in degrees
  scale: 1.5                 // Uniform scale
  scale: [1, 2, 1]           // Non-uniform [x, y, z]
}
```

### Visual Properties

```hs
composition myObject {
  color: "#00ffff"           // Hex color
  color: [0, 255, 255]       // RGB array
  opacity: 0.8               // 0.0 - 1.0
  visible: true              // Show/hide

  model: "path/to/model.glb" // 3D model
  material: "metal"          // Material preset
  texture: "wood.jpg"        // Texture map
}
```

### Custom Properties

Add any custom properties:

```hs
composition player {
  health: 100
  maxHealth: 100
  speed: 5
  name: "Player One"
  isAlive: true
  inventory: []
}
```

---

## Position Formats

HoloScript supports multiple position formats:

```hs
// Array format (recommended)
position: [0, 1.6, -2]

// Object format
position: { x: 0, y: 1.6, z: -2 }

// Named positions
position: spawn_point
position: player.position
```

---

## VR Traits

Add interactivity with traits (`.hsplus` and `.holo` only):

```hsplus
composition ball {
  @grabbable           // Can be picked up
  @throwable           // Can be thrown
  @physics             // Has physics
  @collidable          // Detects collisions
  @glowing             // Emits light

  position: [0, 1, -2]
}
```

### Traits with Parameters

```hsplus
composition ball {
  @grabbable(snap_to_hand: true, haptic_on_grab: 0.5)
  @throwable(velocity_multiplier: 1.5)
  @glowing(color: "#00ffff", intensity: 2.0, range: 5)

  position: [0, 1, -2]
}
```

See [VR Traits Reference](/api/traits) for all traits.

---

## Object State

### Local State

For object-specific reactive state:

```hsplus
composition enemy {
  @destructible

  position: [10, 0, 10]

  state {
    health: 100
    isAlive: true
    attackDamage: 10
  }
}
```

Access state: `enemy.state.health`

### Global State

Shared state for the entire scene (`.hsplus`):

```hsplus
@state {
  score: 0
  wave: 1
  gameActive: false
}

composition scoreDisplay {
  text: "Score: ${@state.score}"
}
```

---

## Event Handlers

Objects respond to events:

```hsplus
composition button {
  @clickable
  @hoverable

  position: [0, 1, -2]
  color: "#ffffff"

  on_click: {
    play_sound("click.wav")
    toggle_door()
  }

  on_hover_enter: {
    this.color = "#00ffff"
    this.scale = 1.1
  }

  on_hover_exit: {
    this.color = "#ffffff"
    this.scale = 1.0
  }
}
```

### Common Events

| Event                     | Trigger          |
| ------------------------- | ---------------- |
| `on_click`                | Clicked/selected |
| `on_hover_enter`          | Cursor enters    |
| `on_hover_exit`           | Cursor exits     |
| `on_grab`                 | Picked up        |
| `on_release`              | Let go           |
| `on_throw`                | Thrown           |
| `on_collision(other)`     | Hit something    |
| `on_trigger_enter(other)` | Entered trigger  |
| `on_trigger_exit(other)`  | Exited trigger   |
| `on_spawn`                | Object created   |
| `on_destroy`              | Object removed   |

---

## Object References

### By Name

```hs
composition door {
  position: [5, 0, 0]
}

function open_door() {
  door.rotation = [0, 90, 0]
}
```

### Using `this`

Inside an object, `this` refers to itself:

```hsplus
composition self_destruct_box {
  @clickable

  on_click: {
    destroy this
  }
}
```

### Finding Objects

```hs
// By name
let enemy = find("EnemyBoss")

// By tag/type
let enemies = find_all_with_tag("enemy")

// Nearest
let nearest = find_nearest("powerup", player.position)
```

---

## Object Lifecycle

### Creating Objects

```hs
// Static (defined in file)
composition staticBall {
  position: [0, 1, 0]
}

// Dynamic (spawned at runtime)
spawn "Enemy" at [10, 0, 10]
spawn "Coin" at random_position()
```

### Destroying Objects

```hs
// Immediate
destroy enemy

// With delay
destroy bullet with { delay: 100ms }

// Conditional
if (enemy.state.health <= 0) {
  destroy enemy
}
```

### Cloning Objects

```hs
let clone = clone(original)
clone.position = [0, 0, 5]
```

---

## Collision and Triggers

### Physical Collisions

Objects bounce off each other:

```hsplus
composition ball {
  @physics
  @collidable

  on_collision(other) {
    if (other.name == "goal") {
      score += 1
    }
  }
}
```

### Trigger Zones

Objects pass through but detect entry:

```hsplus
composition checkpoint {
  @trigger
  visible: false

  on_trigger_enter(player) {
    save_progress()
    play_sound("checkpoint.wav")
  }
}
```

---

## Networked Objects

For multiplayer (`.hsplus`):

```hsplus
networked_object player {
  sync_rate: 20hz

  // Synced properties
  position: synced
  rotation: synced

  // Local + synced state
  state {
    displayName: "Player"
    score: 0
    team: "blue"
  }
}
```

---

## Templates and Using

In `.holo`, define templates and create instances:

```holo
template "Coin" {
  @grabbable
  @glowing

  model: "coin.glb"
  color: "#ffcc00"

  on_grab: {
    Player.score += 10
    destroy this
  }
}

object "Coin_1" using "Coin" {
  position: [5, 1, 0]
}

object "Coin_2" using "Coin" {
  position: [10, 1, 0]
  color: "#ff0000"  // Override color
}
```

---

## Best Practices

### Naming

- Use `PascalCase` for templates: `"EnemyBoss"`
- Use `snake_case` for instances: `enemy_boss_1`
- Be descriptive: `door_to_basement` not `d1`

### Organization

- Group related objects in `spatial_group`
- Use templates for repeated objects
- Keep state minimal

### Performance

- Limit physics objects to ~100
- Use simple collision shapes
- Disable distant objects: `visible: false`
