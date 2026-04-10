# Syntax Reference

Complete reference for HoloScript syntax across all three file formats.

## File Formats Overview

| Extension | Style           | Best For                    |
| --------- | --------------- | --------------------------- |
| `.hs`     | Object-centric  | Simple prototypes, learning |
| `.hsplus` | Object + Traits | Production VR/AR apps       |
| `.holo`   | Scene-centric   | AI generation, full worlds  |

---

## .hs / .hsplus Syntax

### Objects (Orbs)

```hs
composition objectName {
  property: value
  nested: { x: 0, y: 1, z: 2 }
}
```

**Common properties:**

- `position` - `{ x: 0, y: 0, z: 0 }` or `[0, 0, 0]`
- `rotation` - Euler angles or quaternion
- `scale` - Number or `{ x, y, z }`
- `color` - Hex string `"#00ffff"`
- `visible` - Boolean

### Functions

```hs
function doSomething(param1, param2) {
  // function body
  target.property = value
}
```

### Connections

```hs
connect objectA to objectB as "connectionName"
```

### Execution

```hs
execute functionName
```

### VR Traits (.hsplus only)

```hsplus
composition interactiveObject {
  @grabbable
  @throwable
  @physics

  position: [0, 1, -2]
}
```

**Trait with parameters:**

```hsplus
composition configuredObject {
  @grabbable(snap_to_hand: true, haptic_on_grab: 0.7)
  @physics(mass: 2.0, drag: 0.1)
  @networked(sync_rate: 30hz)
}
```

### State (.hsplus)

```hsplus
@state {
  health: 100
  isAlive: true
  items: []
}

composition player {
  health: ${state.health}

  @on_damage => state.health -= 10
}
```

### Networked Objects (.hsplus)

```hsplus
networked_object syncedPlayer {
  sync_rate: 20hz
  position: synced
  rotation: synced

  state {
    score: 0
  }
}
```

---

## .holo Syntax (Compositions)

### Basic Structure

```holo
composition "Scene Name" {
  environment { }

  template "TypeName" { }

  object "ObjectName" { }

  spatial_group "GroupName" { }

  logic { }
}
```

### Environment

```holo
environment {
  skybox: "nebula"           // preset or URL
  ambient_light: 0.3         // 0.0 - 1.0
  gravity: -9.81             // m/s²
  fog: { color: "#ffffff", density: 0.01 }
}
```

### Templates

```holo
template "Enemy" {
  state {
    health: 100
    speed: 5
  }

  action attack(target) {
    target.health -= 10
  }

  action die() {
    this.destroy()
  }
}
```

### Objects

```holo
object "PlayerSword" {
  @grabbable
  @throwable
  @glowing

  position: [0, 1, -2]
  color: "#00ffff"

  on_grab: { this.glow_intensity = 2.0 }
}
```

### Objects Using Templates

```holo
object "Goblin_1" using "Enemy" {
  position: [5, 0, 10]
  color: "#00ff00"

  state {
    health: 50  // Override template default
  }
}
```

### Spatial Groups

```holo
spatial_group "Battlefield" {
  position: [0, 0, 50]

  object "Enemy_1" using "Enemy" { position: [0, 0, 0] }
  object "Enemy_2" using "Enemy" { position: [5, 0, 0] }
  object "Enemy_3" using "Enemy" { position: [10, 0, 0] }
}
```

### Logic Block

```holo
logic {
  on_player_enter(zone) {
    spawn_enemies(5)
  }

  on_enemy_death(enemy) {
    player.score += 10
  }

  every 1s {
    check_win_condition()
  }
}
```

---

## Value Types

| Type      | Example                           |
| --------- | --------------------------------- |
| Number    | `42`, `3.14`, `-10`               |
| String    | `"hello"`, `'world'`              |
| Boolean   | `true`, `false`                   |
| Array     | `[1, 2, 3]`, `["a", "b"]`         |
| Object    | `{ x: 0, y: 1, z: 2 }`            |
| Vector3   | `[x, y, z]`                       |
| Color     | `"#00ffff"`, `"rgb(0, 255, 255)"` |
| Time      | `1s`, `500ms`, `2min`             |
| Frequency | `30hz`, `60fps`                   |

---

## Comments

```hs
// Single line comment

/*
  Multi-line
  comment
*/

/**
 * Documentation comment
 * @param target The object to affect
 */
```

---

## Reserved Keywords

```
orb, object, template, composition, environment
function, action, connect, execute
state, logic, spatial_group
using, as, to, with
if, else, for, while, every
on, true, false, null
```
