# Examples

Learn HoloScript through practical examples. All code is copy-paste ready.

## Basic Examples

### [Hello World](/examples/hello-world)

Your first HoloScript program - a glowing greeting orb.

### Interactive Cube

A grabbable, throwable cube with physics.

### VR Controller Demo

Respond to VR controller input.

## Intermediate Examples

### Inventory System

Draggable items, slots, and equipment.

### Physics Playground

Balls, ramps, and chain reactions.

### Multiplayer Sync

Networked objects and state synchronization.

## Advanced Examples

### [Complete Game: Arena](/examples/arena-game)

A full VR battle arena in ~100 lines.

### AI Integration

Use MCP server (34+ tools) for AI-generated content.

### Multi-Platform Export

Compile to 18+ targets: Unity, Unreal, Godot, VRChat, Babylon, WebGPU, visionOS, Android XR, and more.

## Cross-Domain Examples

### Robotics (URDF/SDF)

Compile HoloScript scenes to URDF for ROS 2 robots or SDF for Gazebo simulation.

### Digital Twins (DTDL)

Define IoT digital twins that compile to Azure DTDL interfaces.

### IoT Interop (W3C WoT)

Export scene objects as W3C Web of Things Thing Descriptions for IoT device interop.

### OpenUSD Pipeline

Compile scenes to USDA for the Pixar/Apple/NVIDIA OpenUSD ecosystem.

---

## Quick Copy Examples

### Grabbable Glowing Orb

```holo
composition "Grabbable Orb" {
  environment {
    skybox: "dark"
    ambient_light: 0.2
  }

  object "MagicOrb" {
    @grabbable
    @throwable
    @glowing
    @physics

    position: [0, 1.5, -2]
    color: "#00ffff"
    glow_intensity: 1.5

    on_grab: {
      this.glow_intensity = 3.0
      haptic_feedback("dominant", 0.5)
    }

    on_release: {
      this.glow_intensity = 1.5
    }
  }
}
```

### Button with Counter

```holo
composition "Counter Button" {
  object "CounterButton" {
    @clickable
    @state

    position: [0, 1.5, -2]

    state {
      count: 0
    }

    on_click: {
      state.count++
      play_sound("click.wav")
    }
  }

  object "Display" {
    @billboard

    position: [0, 2, -2]
    text: "Count: ${CounterButton.state.count}"
  }
}
```

### Physics Ball Pit

```holo
composition "Ball Pit" {
  environment {
    gravity: -9.81
  }

  // Container walls
  object "Floor" {
    @collidable
    position: [0, 0, -5]
    scale: [5, 0.1, 5]
    color: "#333333"
  }

  // Spawn balls on click
  object "Spawner" {
    @clickable
    position: [0, 5, -5]

    on_click: {
      spawn "Ball" at [
        random(-2, 2),
        5,
        random(-7, -3)
      ]
    }
  }

  template "Ball" {
    @physics
    @collidable
    @grabbable

    scale: 0.2
    color: random_color()

    physics {
      mass: 0.5
      bounciness: 0.8
    }
  }
}
```

### Teleport Points

```holo
composition "Teleport Demo" {
  template "TeleportPad" {
    @trigger
    @glowing

    scale: [1, 0.1, 1]
    glow_color: "#00ff00"

    on_trigger_enter: {
      if (collider.is_player) {
        teleport_player(this.destination)
        play_sound("teleport.wav")
      }
    }
  }

  object "PadA" using "TeleportPad" {
    position: [0, 0, -5]
    destination: [10, 0, -5]
  }

  object "PadB" using "TeleportPad" {
    position: [10, 0, -5]
    destination: [0, 0, -5]
  }
}
```

### Networked Score Board

```holo
composition "Multiplayer Score" {
  object "ScoreManager" {
    @networked
    @host_only

    state {
      scores: {}
    }

    action add_score(player_id, points) {
      state.scores[player_id] = (state.scores[player_id] || 0) + points
      broadcast "score_updated"
    }
  }

  object "ScoreDisplay" {
    @billboard
    @reactive

    position: [0, 3, -5]

    text: format_scores(ScoreManager.state.scores)
  }

  object "ScorePickup" {
    @grabbable
    @networked

    position: [0, 1, -3]
    color: "#ffff00"

    on_grab: {
      ScoreManager.add_score(grabber.player_id, 10)
      this.respawn_at(random_position())
    }
  }
}
```

### VR Hand Menu

```holo
composition "Hand Menu" {
  object "MenuAnchor" {
    @hand_tracked(hand: "left", joint: "palm")

    visible: false
  }

  object "Menu" {
    @billboard
    parent: "MenuAnchor"

    visible: false

    template "MenuButton" {
      @clickable
      @hoverable

      scale: [0.1, 0.05, 0.01]

      on_hover_enter: { this.color = "#00ffff" }
      on_hover_exit: { this.color = "#ffffff" }
    }

    object "SettingsBtn" using "MenuButton" {
      position: [0, 0.1, 0]
      text: "Settings"
      on_click: { open_settings() }
    }

    object "ExitBtn" using "MenuButton" {
      position: [0, 0, 0]
      text: "Exit"
      on_click: { exit_game() }
    }
  }

  logic {
    on_palm_up("left") {
      Menu.visible = true
    }

    on_palm_down("left") {
      Menu.visible = false
    }
  }
}
```

---

## Source Code

All examples are available in the [examples directory](https://github.com/brianonbased-dev/holoscript/tree/main/examples) of the HoloScript repository.
