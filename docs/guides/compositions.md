# Compositions

The `.holo` format uses **compositions** to define complete scenes. This guide covers all composition features.

## Basic Structure

```holo
composition "Scene Name" {
  environment { }

  template "TemplateName" { }

  object "ObjectName" { }

  spatial_group "GroupName" { }

  logic { }
}
```

Every `.holo` file contains exactly one composition.

---

## Environment Block

Configure the world settings:

```holo
environment {
  // Skybox - preset name or URL
  skybox: "sunset"
  // skybox: "https://example.com/skybox.hdr"

  // Lighting
  ambient_light: 0.4          // 0.0 - 1.0
  ambient_color: "#ffffff"

  // Physics
  gravity: -9.81              // m/s²
  // gravity: [0, -9.81, 0]   // Vector form

  // Atmosphere
  fog: {
    enabled: true
    color: "#cccccc"
    density: 0.02
    // Or use linear: start: 10, end: 100
  }

  // Audio
  reverb: "large_hall"
  master_volume: 0.8

  // Rendering
  exposure: 1.0
  tone_mapping: "aces"
}
```

### Skybox Presets

| Name         | Description        |
| ------------ | ------------------ |
| `"clear"`    | Clear blue sky     |
| `"sunset"`   | Orange/pink sunset |
| `"night"`    | Starry night       |
| `"nebula"`   | Space nebula       |
| `"overcast"` | Cloudy gray        |
| `"gradient"` | Simple gradient    |
| `"dark"`     | Nearly black       |

---

## Templates

Templates define reusable object types:

```holo
template "Enemy" {
  // Default traits
  @physics
  @collidable
  @destructible

  // Default properties
  scale: 1.0
  color: "#ff0000"

  // State
  state {
    health: 100
    speed: 5
    is_alive: true
  }

  // Actions (like methods)
  action take_damage(amount) {
    state.health -= amount

    if (state.health <= 0) {
      this.die()
    }
  }

  action die() {
    state.is_alive = false
    play_sound("death.wav")
    spawn "Explosion" at this.position
    destroy this with { delay: 100ms }
  }

  // Lifecycle hooks
  on_spawn {
    find_player()
  }

  // Update loop
  every 100ms {
    if (state.is_alive) {
      move_towards(player.position, state.speed)
    }
  }
}
```

### Using Templates

```holo
// Basic usage
object "Goblin" using "Enemy" {
  position: [5, 0, 10]
}

// Override defaults
object "BossGoblin" using "Enemy" {
  position: [0, 0, 50]
  scale: 3.0
  color: "#ff00ff"

  state {
    health: 500      // Override
    speed: 3         // Override
  }
}
```

### Template Inheritance

```holo
template "Creature" {
  @physics
  @collidable

  state {
    health: 100
  }
}

template "Enemy" extends "Creature" {
  @destructible

  state {
    aggression: 50  // Added to Creature's state
  }
}

template "Boss" extends "Enemy" {
  state {
    health: 1000    // Override
    phase: 1
  }
}
```

---

## Objects

Objects are instances in the scene:

```holo
object "ObjectName" {
  // Traits
  @grabbable
  @physics

  // Transform
  position: [x, y, z]
  rotation: [x, y, z]       // Euler degrees
  scale: 1.0                // Uniform
  scale: [x, y, z]          // Non-uniform

  // Visual
  color: "#00ffff"
  model: "path/to/model.glb"
  material: "metal"
  visible: true

  // State
  state {
    custom_property: value
  }

  // Events
  on_grab: { }
  on_click: { }
  on_collision(other): { }
}
```

### Event Handlers

```holo
object "InteractiveButton" {
  @clickable
  @hoverable

  // Inline handler
  on_click: {
    play_sound("click.wav")
    GameManager.toggle_door()
  }

  // Multi-line handler
  on_hover_enter: {
    this.color = "#00ffff"
    this.scale = 1.2
  }

  on_hover_exit: {
    this.color = "#ffffff"
    this.scale = 1.0
  }
}
```

---

## Spatial Groups

Group objects together with shared transform:

```holo
spatial_group "EnemyCamp" {
  // Group transform - all children inherit this
  position: [100, 0, 50]
  rotation: [0, 45, 0]

  // Children use local coordinates
  object "Tent_1" {
    position: [0, 0, 0]      // World: [100, 0, 50]
  }

  object "Tent_2" {
    position: [5, 0, 0]      // World: [105, 0, 50]
  }

  object "Campfire" {
    @glowing
    position: [2.5, 0, 2]
  }

  // Nested groups
  spatial_group "Guards" {
    position: [0, 0, -5]

    object "Guard_1" using "Enemy" { position: [-2, 0, 0] }
    object "Guard_2" using "Enemy" { position: [2, 0, 0] }
  }
}
```

### Dynamic Groups

```holo
spatial_group "SpawnZone" {
  @trigger

  position: [0, 0, 0]

  on_player_enter: {
    spawn_enemies_in_group(5)
  }

  action spawn_enemies_in_group(count) {
    repeat count times {
      spawn "Enemy" in this at random_local_position()
    }
  }
}
```

---

## Logic Block

Define game rules and global behaviors:

```holo
logic {
  // Event-based
  on_scene_load {
    initialize_game()
  }

  on_player_death {
    show_game_over()
    delay 3s then restart_scene()
  }

  // Trigger-based
  on_player_enter("BossRoom") {
    lock_doors()
    spawn "BossEnemy" at boss_spawn_point
    play_music("boss_theme.mp3")
  }

  on_player_exit("SafeZone") {
    enable_enemy_spawning()
  }

  // Time-based
  every 30s {
    spawn_wave()
  }

  every frame {
    update_ui()
  }

  // Condition-based
  when Player.health < 20 {
    show_low_health_warning()
  }

  when all_enemies_dead {
    complete_wave()
    if (current_wave >= max_waves) {
      victory()
    }
  }
}
```

### Logic Functions

```holo
logic {
  // Define functions in logic block
  function spawn_wave() {
    wave_count++
    enemy_count = 5 + wave_count * 2

    repeat enemy_count times {
      spawn "Enemy" at random_spawn_point()
    }
  }

  function check_victory() {
    if (score >= target_score) {
      victory()
    }
  }
}
```

---

## Control Flow

### Conditionals

```holo
object "DynamicDoor" {
  @if Player.has_key {
    color: "#00ff00"
    collision: false
  } @else {
    color: "#ff0000"
    collision: true
  }
}
```

### Loops

```holo
// Static generation
@for i in range(0, 10) {
  object "Pillar_${i}" {
    position: [i * 2, 0, 0]
  }
}

// With nested loops
@for x in range(-5, 5) {
  @for z in range(-5, 5) {
    object "Tile_${x}_${z}" {
      position: [x, 0, z]
    }
  }
}
```

---

## Complete Example

```holo
composition "Dungeon Level 1" {
  environment {
    skybox: "dark"
    ambient_light: 0.2
    fog: { color: "#111111", density: 0.05 }
  }

  template "Torch" {
    @glowing(color: "#ff6600", intensity: 2, range: 5)
    @animated(flicker: true)
    @spatial_audio

    audio: "fire_crackle.wav"
  }

  template "Skeleton" {
    @physics
    @collidable
    @destructible

    model: "skeleton.glb"

    state { health: 50, damage: 10 }

    action attack(target) {
      play_animation("attack")
      target.take_damage(state.damage)
    }
  }

  spatial_group "Entrance" {
    position: [0, 0, 0]

    object "Door" using "HeavyDoor" { position: [0, 0, 5] }
    object "Torch_L" using "Torch" { position: [-2, 2, 5] }
    object "Torch_R" using "Torch" { position: [2, 2, 5] }
  }

  spatial_group "MainHall" {
    position: [0, 0, 20]

    @for i in range(0, 6) {
      object "Pillar_${i}" {
        position: [(i % 2 == 0 ? -3 : 3), 0, i * 5]
      }
      object "Torch_${i}" using "Torch" {
        position: [(i % 2 == 0 ? -3 : 3), 2.5, i * 5]
      }
    }

    object "Skeleton_1" using "Skeleton" { position: [0, 0, 10] }
    object "Skeleton_2" using "Skeleton" { position: [-2, 0, 15] }
    object "Skeleton_3" using "Skeleton" { position: [2, 0, 15] }
  }

  object "Player" {
    @collidable
    position: [0, 1.6, 0]

    state { health: 100, keys: 0 }
  }

  logic {
    on_scene_load {
      play_music("dungeon_ambient.mp3")
    }

    on_all_skeletons_dead {
      open_treasure_room()
    }
  }
}
```
