# Templates & Reuse

Welcome to Lesson 1.8! In this lesson, you'll learn how to create reusable components using templates - one of HoloScript's most powerful features.

## Why Templates?

Without templates, you'd repeat code:

```hs
// Repetitive - Don't do this!
composition button1 {
  @clickable
  geometry: "cube"
  scale: [0.2, 0.1, 0.2]
  color: "#0066ff"
  onClick: { audio.play("click.mp3") }
}

composition button2 {
  @clickable
  geometry: "cube"
  scale: [0.2, 0.1, 0.2]
  color: "#0066ff"
  onClick: { audio.play("click.mp3") }
}

composition button3 {
  @clickable
  geometry: "cube"
  scale: [0.2, 0.1, 0.2]
  color: "#0066ff"
  onClick: { audio.play("click.mp3") }
}
```

With templates, you define once and reuse:

```hs
template Button {
  @clickable
  geometry: "cube"
  scale: [0.2, 0.1, 0.2]
  color: "#0066ff"
  onClick: { audio.play("click.mp3") }
}

// Instantiate
object button1 using Button { position: [0, 1, -1] }
object button2 using Button { position: [0.5, 1, -1] }
object button3 using Button { position: [1, 1, -1] }
```

## Basic Template Syntax

### Defining a Template

```hs
template TemplateName {
  // Properties and traits that all instances share
  geometry: "cube"
  @grabbable

  onGrab: {
    // Shared behavior
  }
}
```

### Using a Template

```hs
object myInstance using TemplateName {
  // Override or add properties
  position: [0, 1, 0]
  color: "#ff0000"
}
```

## Parameters

Templates can accept parameters:

```hs
template ColoredBox {
  params {
    boxColor: string = "#ffffff"
    boxSize: number = 1.0
  }

  geometry: "cube"
  color: params.boxColor
  scale: params.boxSize
}

// Usage with parameters
object redBox using ColoredBox {
  boxColor: "#ff0000"
  boxSize: 0.5
  position: [0, 1, 0]
}

object blueBox using ColoredBox {
  boxColor: "#0000ff"
  boxSize: 1.5
  position: [2, 1, 0]
}
```

### Parameter Types

```hs
template Enemy {
  params {
    health: number = 100       // Default value
    name: string               // Required (no default)
    isAggressive: boolean = true
    spawnPosition: array = [0, 0, 0]
    stats: object = { attack: 10, defense: 5 }
  }
}
```

## Template Inheritance

Templates can extend other templates:

```hs
template Interactable {
  @hoverable
  @clickable

  onHoverEnter: {
    this.scale = 1.1
  }

  onHoverExit: {
    this.scale = 1.0
  }
}

template Button extends Interactable {
  geometry: "cube"
  scale: [0.3, 0.1, 0.3]

  onClick: {
    audio.play("click.mp3")
  }
}

template ToggleButton extends Button {
  isOn: false

  onClick: {
    this.isOn = !this.isOn
    this.color = this.isOn ? "#00ff00" : "#ff0000"
    audio.play("toggle.mp3")
  }
}
```

## Composition (Nested Objects)

Templates can include child objects:

```hs
template Table {
  geometry: "cube"
  scale: [1, 0.05, 0.6]
  color: "#8B4513"

  composition leg1 {
    geometry: "cylinder"
    scale: [0.05, 0.4, 0.05]
    position: [-0.4, -0.22, -0.25]
    color: "#8B4513"
  }

  composition leg2 {
    geometry: "cylinder"
    scale: [0.05, 0.4, 0.05]
    position: [0.4, -0.22, -0.25]
    color: "#8B4513"
  }

  composition leg3 {
    geometry: "cylinder"
    scale: [0.05, 0.4, 0.05]
    position: [-0.4, -0.22, 0.25]
    color: "#8B4513"
  }

  composition leg4 {
    geometry: "cylinder"
    scale: [0.05, 0.4, 0.05]
    position: [0.4, -0.22, 0.25]
    color: "#8B4513"
  }
}

// Use the table
object diningTable using Table {
  position: [0, 0.5, -2]
}
```

## Slots

Templates can define customizable slots:

```hs
template Panel {
  geometry: "plane"
  scale: [1, 0.5, 1]
  color: "#333333"

  slot header {
    position: [0, 0.2, 0.01]
  }

  slot content {
    position: [0, 0, 0.01]
  }

  slot footer {
    position: [0, -0.2, 0.01]
  }
}

object infoPanel using Panel {
  position: [0, 1.5, -2]

  header: {
    composition title {
      @billboard
      text: "Welcome"
    }
  }

  content: {
    composition description {
      @billboard
      text: "Click to continue"
    }
  }
}
```

## Importing Templates

Templates can be imported from other files:

### templates/ui.hs

```hs
export template Button {
  @clickable
  geometry: "cube"
  scale: [0.2, 0.1, 0.2]

  onClick: {
    audio.play("click.mp3")
  }
}

export template Slider {
  @draggable
  geometry: "cylinder"
}
```

### main.hs

```hs
import { Button, Slider } from "./templates/ui.hs"

object startButton using Button {
  position: [0, 1, -2]
  color: "#00ff00"
}

object volumeSlider using Slider {
  position: [0, 1.5, -2]
}
```

## Template Libraries

HoloScript includes built-in template libraries:

```hs
import { VRButton, VRSlider, VRPanel } from "@holoscript/ui"
import { Enemy, NPC, Spawner } from "@holoscript/game"
import { Teleporter, Locomotion } from "@holoscript/vr"

object mainMenu using VRPanel {
  object startBtn using VRButton {
    label: "Start Game"
    onClick: { scene.switch("level1") }
  }
}
```

## Best Practices

### 1. Name Templates with PascalCase

```hs
// ✓ Good
template InteractiveButton { }
template EnemySpawner { }

// ✗ Avoid
template interactive_button { }
template enemyspawner { }
```

### 2. Provide Sensible Defaults

```hs
template Button {
  params {
    label: string = "Click Me"
    color: string = "#0066ff"
    size: number = 1.0
    sound: string = "click.mp3"
  }
  // ...
}
```

### 3. Keep Templates Focused

```hs
// ✓ Good - Single responsibility
template HealthBar { }
template Inventory { }
template MiniMap { }

// ✗ Avoid - Too much in one template
template GameUI {
  // healthbar + inventory + minimap + chat + ...
}
```

### 4. Document Your Templates

```hs
/**
 * Interactive button for VR interfaces
 *
 * @param label - Button text
 * @param color - Button color (hex)
 * @param onClick - Handler function
 *
 * @example
 * object btn using Button { label: "Start", color: "#00ff00" }
 */
template Button {
  params {
    label: string = "Click"
    color: string = "#0066ff"
  }
  // ...
}
```

## Complete Example

```hs
// Define reusable templates
template Target {
  params {
    points: number = 10
    hitSound: string = "hit.mp3"
  }

  @collidable
  @destructible

  geometry: "sphere"
  scale: 0.3
  color: "#ff0000"
  health: 1

  onCollision(event): {
    if (event.object.tag === "projectile") {
      this.health -= 1
      audio.play(params.hitSound)

      if (this.health <= 0) {
        score.add(params.points)
        particles.emit("explosion", this.position)
        this.destroy()
      }
    }
  }
}

template TargetRow {
  params {
    count: number = 5
    spacing: number = 0.8
  }

  // Programmatically create targets
  onCreate: {
    for (let i = 0; i < params.count; i++) {
      spawn(Target, {
        position: [i * params.spacing - (params.count * params.spacing / 2), 0, 0],
        points: (i + 1) * 10
      })
    }
  }
}

// Use in scene
composition "Shooting Gallery" {
  object row1 using TargetRow {
    count: 5
    spacing: 1.0
    position: [0, 2, -5]
  }

  object row2 using TargetRow {
    count: 7
    spacing: 0.8
    position: [0, 3, -6]
  }
}
```

## Quiz

1. What keyword defines a template?
2. How do you use a template to create an object?
3. What's the syntax for template parameters?
4. Can templates extend other templates?
5. How do you import templates from other files?

<details>
<summary>Answers</summary>

1. `template`
2. `object name using TemplateName { }`
3. `params { paramName: type = defaultValue }`
4. Yes, using `extends`: `template Child extends Parent { }`
5. `import { TemplateName } from "./path/to/file.hs"`

</details>

---

**Estimated time:** 25 minutes  
**Difficulty:** ⭐ Beginner  
**Next:** [Lesson 1.9 - Project Structure](./09-project-structure.md)
