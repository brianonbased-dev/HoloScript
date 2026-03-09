# Interactive Cube

A grabbable, throwable cube with full physics. The most common "first interactive object" in VR.

## Full Source

```holo
composition "Interactive Cube" {
  environment {
    skybox: "studio"
    ambient_light: 0.6
    gravity: -9.81
  }

  object "Cube" {
    @grabbable
    @throwable
    @physics
    @collidable
    @glowing

    position: [0, 1.2, -2]
    scale: [0.3, 0.3, 0.3]
    color: "#e84545"
    glow_intensity: 0.4

    physics {
      mass: 0.5
      friction: 0.6
      bounciness: 0.3
      angular_drag: 0.2
    }

    on_grab {
      this.glow_intensity = 1.5
      this.color = "#ff8800"
      haptic_feedback("dominant", 0.4, 80ms)
      play_sound("grab.wav")
    }

    on_release {
      this.glow_intensity = 0.4
      this.color = "#e84545"
    }

    on_throw {
      this.glow_intensity = 2.0
      haptic_feedback("dominant", 0.8, 120ms)
      play_sound("whoosh.wav")
    }

    on_collision(other) {
      impact_force = velocity.magnitude
      if (impact_force > 3) {
        play_sound("impact_hard.wav")
        haptic_feedback("both", 0.6, 50ms)
      } else {
        play_sound("impact_soft.wav")
      }
    }
  }

  // Floor to land on
  object "Floor" {
    @collidable
    position: [0, -0.1, -2]
    scale: [4, 0.2, 4]
    color: "#333344"
  }

  // Reset button
  object "ResetButton" {
    @clickable
    @hoverable
    @glowing

    position: [1.2, 0.8, -2]
    scale: [0.15, 0.15, 0.05]
    color: "#44aaff"
    glow_color: "#44aaff"
    text: "RESET"

    on_hover_enter { this.color = "#88ccff" }
    on_hover_exit  { this.color = "#44aaff" }

    on_click {
      Cube.position = [0, 1.2, -2]
      Cube.velocity = [0, 0, 0]
      Cube.angular_velocity = [0, 0, 0]
      play_sound("click.wav")
    }
  }
}
```

## What This Demonstrates

| Feature                 | Trait / Property                |
| ----------------------- | ------------------------------- |
| Pick up in VR           | `@grabbable`                    |
| Throw with velocity     | `@throwable`                    |
| Realistic fall & bounce | `@physics` + `physics {}` block |
| Land on surfaces        | `@collidable`                   |
| Glow on interact        | `@glowing` + `glow_intensity`   |
| Haptic feedback         | `haptic_feedback()`             |
| Collision sounds        | `on_collision(other)`           |
| UI button               | `@clickable` + `@hoverable`     |

## Key Concepts

### Physics Block

```holo
physics {
  mass: 0.5         // kg — lighter = flies further when thrown
  friction: 0.6     // 0-1 — how much it slides on surfaces
  bounciness: 0.3   // 0-1 — how much it bounces
  angular_drag: 0.2 // how fast spinning slows down
}
```

### Grab Events

```holo
on_grab    { /* user picked it up */ }
on_release { /* user let go (may or may not be thrown) */ }
on_throw   { /* user released with velocity > threshold */ }
```

### Collision Response

```holo
on_collision(other) {
  impact_force = velocity.magnitude  // speed at impact
  // play different sounds based on force
}
```

## Compile & Run

```bash
holoscript preview interactive-cube.holo

# Export to web
holoscript compile interactive-cube.holo --target threejs

# Export to VRChat
holoscript compile interactive-cube.holo --target vrchat
```

## Extend It

- Add `@stackable` to pile cubes on each other
- Add `@destructible` for satisfying break effects
- Use a `template "Cube"` and spawn multiples
- Add `@audio` with 3D spatial sound on impact

## See Also

- [Hello World](/examples/hello-world) — simpler first scene
- [Physics Playground](/examples/physics-playground) — more complex physics
- [Arena Game](/examples/arena-game) — full game using projectiles + physics
- [@throwable trait](/traits/interaction)
