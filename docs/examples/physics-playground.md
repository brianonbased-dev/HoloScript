# Physics Playground

Balls, ramps, a ball pit, and a Newton's Cradle — a complete physics showcase demonstrating mass, friction, bounciness, and constraints.

## Full Source

```holo
composition "Physics Playground" {
  environment {
    skybox: "outdoor"
    ambient_light: 0.7
    gravity: -9.81
  }

  // ==========================================
  // RAMP + ROLLING BALL
  // ==========================================

  object "Ramp" {
    @collidable

    position: [0, 0.8, -5]
    scale: [2, 0.1, 3]
    rotation: [-25, 0, 0]
    color: "#4466aa"
  }

  object "RollingBall" {
    @physics
    @collidable
    @grabbable
    @glowing

    position: [0, 2.2, -3.8]
    scale: 0.3
    color: "#ff4444"
    glow_intensity: 0.3

    physics {
      mass: 1.0
      friction: 0.2
      bounciness: 0.6
      angular_drag: 0.05
    }
  }

  // ==========================================
  // BALL PIT
  // ==========================================

  // Container walls
  object "Pit_Floor"  { @collidable position: [4, 0, -5] scale: [3, 0.1, 3] color: "#22aa44" }
  object "Pit_Wall_N" { @collidable position: [4, 0.6, -3.6] scale: [3, 1.2, 0.1] color: "#1a7733" }
  object "Pit_Wall_S" { @collidable position: [4, 0.6, -6.4] scale: [3, 1.2, 0.1] color: "#1a7733" }
  object "Pit_Wall_E" { @collidable position: [5.6, 0.6, -5] scale: [0.1, 1.2, 3] color: "#1a7733" }
  object "Pit_Wall_W" { @collidable position: [2.4, 0.6, -5] scale: [0.1, 1.2, 3] color: "#1a7733" }

  template "PitBall" {
    @physics
    @collidable

    physics {
      mass: 0.2
      bounciness: 0.7
      friction: 0.3
    }
  }

  object "SpawnButton" {
    @clickable
    @hoverable
    @glowing

    position: [4, 1.8, -5]
    scale: 0.2
    color: "#ffaa00"
    text: "SPAWN"

    on_click {
      repeat 5 times {
        spawn "PitBall" at [
          random(3.0, 5.0),
          2.5,
          random(-6.0, -4.0)
        ] with {
          scale: random(0.1, 0.25),
          color: random_color()
        }
      }
      haptic_feedback("dominant", 0.4, 60ms)
    }
  }

  object "ClearButton" {
    @clickable
    @hoverable

    position: [4, 2.2, -5]
    scale: 0.15
    color: "#ff4444"
    text: "CLEAR"

    on_click {
      destroy all instances_of("PitBall")
    }
  }

  // ==========================================
  // NEWTON'S CRADLE
  // ==========================================

  object "CradleBar_Top" {
    position: [-4, 2.5, -5]
    scale: [2.5, 0.05, 0.05]
    color: "#888888"
  }

  template "CradleBall" {
    @physics
    @collidable

    scale: 0.2
    color: "#cccccc"

    physics {
      mass: 0.5
      bounciness: 0.98
      friction: 0.01
      angular_drag: 0.0
    }

    constraint {
      type: "pendulum"
      anchor: parent.position + [0, 1.2, 0]
      length: 1.2
    }
  }

  object "CB1" using "CradleBall" { position: [-5.0, 1.3, -5] }
  object "CB2" using "CradleBall" { position: [-4.5, 1.3, -5] }
  object "CB3" using "CradleBall" { position: [-4.0, 1.3, -5] }
  object "CB4" using "CradleBall" { position: [-3.5, 1.3, -5] }
  object "CB5" using "CradleBall" { position: [-3.0, 1.3, -5] }

  // Pull-back trigger
  object "PullBack" {
    @clickable
    @glowing

    position: [-4, 1.5, -4]
    scale: 0.15
    color: "#00aaff"
    text: "PULL"

    on_click {
      // Swing first ball back
      CB1.apply_impulse([-0.5, 0.8, 0])
    }
  }

  // ==========================================
  // DOMINOS
  // ==========================================

  template "Domino" {
    @physics
    @collidable

    scale: [0.08, 0.3, 0.15]
    color: "#884422"

    physics {
      mass: 0.3
      friction: 0.5
      bounciness: 0.1
      angular_drag: 0.5
    }
  }

  // Row of dominos
  object "D1"  using "Domino" { position: [-1.5, 0.15, -8] }
  object "D2"  using "Domino" { position: [-1.2, 0.15, -8] }
  object "D3"  using "Domino" { position: [-0.9, 0.15, -8] }
  object "D4"  using "Domino" { position: [-0.6, 0.15, -8] }
  object "D5"  using "Domino" { position: [-0.3, 0.15, -8] }
  object "D6"  using "Domino" { position: [0.0,  0.15, -8] }
  object "D7"  using "Domino" { position: [0.3,  0.15, -8] }
  object "D8"  using "Domino" { position: [0.6,  0.15, -8] }

  object "ToppleTrigger" {
    @clickable
    @glowing

    position: [-1.8, 0.5, -8]
    scale: 0.12
    color: "#ff6600"
    text: "TOPPLE"

    on_click {
      D1.apply_impulse([2, 0.5, 0])
    }
  }

  // Main floor
  object "Floor" {
    @collidable
    position: [0, -0.1, -5]
    scale: [16, 0.2, 10]
    color: "#222233"
  }
}
```

## Features Demonstrated

| Feature | How |
| --- | --- |
| Rolling on ramps | Low `friction` + slope |
| Bouncing ball pit | High `bounciness` on pit walls |
| Newton's Cradle | Near-perfect `bounciness: 0.98`, pendulum `constraint` |
| Falling dominos | `apply_impulse()` chain reaction |
| Spawn & destroy | `spawn "Template"` / `destroy all instances_of()` |

## Physics Properties Reference

```holo
physics {
  mass: 1.0          // kg — heavier = harder to move, falls same speed
  friction: 0.5      // 0 = frictionless ice, 1 = very grippy
  bounciness: 0.5    // 0 = no bounce (clay), 1 = perfect bounce
  angular_drag: 0.2  // how fast spinning stops (0 = spins forever)
  linear_drag: 0.0   // air resistance
}
```

## Constraints

```holo
constraint {
  type: "pendulum"       // pendulum | hinge | slider | fixed
  anchor: [x, y, z]     // world-space anchor point
  length: 1.2            // pendulum arm length
}
```

## Compile & Run

```bash
holoscript preview physics-playground.holo

holoscript compile physics-playground.holo --target threejs
holoscript compile physics-playground.holo --target unity
```

## Extend It

- Add a `@grabbable` cannon that fires balls
- Make dominos `@destructible` — they shatter when hit hard enough
- Add `@collidable` floor with different friction zones

## See Also

- [Interactive Cube](/examples/interactive-cube) — basic @physics setup
- [Arena Game](/examples/arena-game) — physics projectiles
- [Traits: Physics](/traits/physics)
