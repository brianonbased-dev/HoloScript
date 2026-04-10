# World Builder Demo

A complete VR world-building sandbox in ~100 lines of HoloScript. This demo showcases the power of compositions, templates, spatial groups, reactive state, physics, and networking.

## The Complete Code

```holo
composition "World Builder Sandbox" {
  environment {
    skybox: "gradient"
    ambient_light: 0.5
    gravity: -9.81
    fog: { color: "#88aaff", density: 0.005 }
  }

  @state {
    selected_tool: "cube"
    grid_snap: true
    object_count: 0
    build_mode: true
  }

  // Buildable block templates
  template "BuildBlock" {
    @grabbable(snap_to_hand: true)
    @physics(mass: 1)
    @collidable
    @stackable(snap_distance: 0.1)
    @networked

    scale: 0.5

    on_grab: {
      haptic_feedback("dominant", 0.3)
      this.color = blend(this.color, "#ffffff", 0.3)
    }

    on_release: {
      if (@state.grid_snap) {
        this.position = snap_to_grid(this.position, 0.5)
      }
      this.color = this.base_color
      @state.object_count++
    }
  }

  template "ToolButton" {
    @clickable
    @hoverable
    @glowing(intensity: 0.5)

    on_hover_enter: { this.scale = 1.2; this.glow_intensity = 1.5 }
    on_hover_exit: { this.scale = 1.0; this.glow_intensity = 0.5 }
  }

  // Tool palette (floating UI)
  spatial_group "ToolPalette" {
    position: [-1.5, 1.2, -1]
    rotation: [0, 30, 0]
    @world_locked

    object "CubeTool" using "ToolButton" {
      position: [0, 0, 0]
      model: "primitives/cube.glb"
      color: "#ff6b6b"
      on_click: { @state.selected_tool = "cube"; spawn_block("cube") }
    }

    object "SphereTool" using "ToolButton" {
      position: [0.3, 0, 0]
      model: "primitives/sphere.glb"
      color: "#4ecdc4"
      on_click: { @state.selected_tool = "sphere"; spawn_block("sphere") }
    }

    object "CylinderTool" using "ToolButton" {
      position: [0.6, 0, 0]
      model: "primitives/cylinder.glb"
      color: "#ffe66d"
      on_click: { @state.selected_tool = "cylinder"; spawn_block("cylinder") }
    }

    object "GridToggle" using "ToolButton" {
      position: [0.3, -0.3, 0]
      model: "icons/grid.glb"
      color: @state.grid_snap ? "#00ff00" : "#666666"
      on_click: { @state.grid_snap = !@state.grid_snap }
    }

    object "CountDisplay" {
      @billboard
      position: [0.3, 0.3, 0]
      text: "Objects: ${@state.object_count}"
    }
  }

  // Build platform with grid
  object "BuildPlatform" {
    @collidable
    position: [0, 0, 0]
    model: "platform_grid.glb"
    scale: [10, 0.1, 10]
    material: "grid_holographic"
  }

  // Spawn zone for new blocks
  object "SpawnPoint" {
    @trigger
    position: [0, 1.5, -0.8]
    visible: false
  }

  logic {
    function spawn_block(shape) {
      let block = spawn "BuildBlock" at SpawnPoint.position
      block.model = "primitives/${shape}.glb"
      block.base_color = random_color()
      block.color = block.base_color
      play_sound("spawn.wav", SpawnPoint.position)
    }

    on_scene_load {
      play_ambient("creative_ambient.mp3")
    }

    when @state.object_count > 50 {
      notify("You're building something amazing!")
    }

    when @state.object_count > 100 {
      notify("Master builder status unlocked!")
    }
  }
}
```

## What This Demonstrates

### 1. Reactive Global State

```holo
@state {
  selected_tool: "cube"
  grid_snap: true
  object_count: 0
}
```

State is reactive - UI updates automatically when values change.

### 2. Templates for Reusability

```holo
template "BuildBlock" {
  @grabbable @physics @collidable @stackable @networked
  // ... shared behavior
}
```

One template, unlimited instances with all traits.

### 3. Spatial Groups for UI

```holo
spatial_group "ToolPalette" {
  @world_locked
  position: [-1.5, 1.2, -1]
  // Child objects maintain relative positions
}
```

Group objects together, all children move as one.

### 4. Dynamic Spawning

```holo
function spawn_block(shape) {
  let block = spawn "BuildBlock" at SpawnPoint.position
  block.model = "primitives/${shape}.glb"
}
```

Create objects at runtime from templates.

### 5. Condition-Based Logic

```holo
when @state.object_count > 50 {
  notify("You're building something amazing!")
}
```

Reactive triggers that fire when conditions are met.

---

## Running This Demo

### Option 1: HoloScript CLI

```bash
holoscript preview world-builder.holo
```

### Option 2: Compile to Target

```bash
# For web (Three.js)
holoscript compile world-builder.holo --target threejs

# For Unity
holoscript compile world-builder.holo --target unity

# For VRChat
holoscript compile world-builder.holo --target vrchat
```

---

## Extending the Demo

### Add Undo/Redo

```holo
@state {
  history: []
  history_index: -1
}

function undo() {
  if (@state.history_index > 0) {
    @state.history_index--
    restore_state(@state.history[@state.history_index])
  }
}
```

### Add Save/Load

```holo
object "SaveButton" using "ToolButton" {
  on_click: {
    let snapshot = serialize_scene()
    save_to_cloud("my-build", snapshot)
    notify("Saved!")
  }
}
```

### Add Multiplayer

```holo
@networked_state {
  sync_rate: 20hz
  authority: "host"
}

// All BuildBlocks are already @networked in template!
```

---

## The HoloScript Advantage

| Traditional Code          | HoloScript                  |
| ------------------------- | --------------------------- |
| 500+ lines React/Three.js | ~100 lines .holo            |
| Separate physics library  | `@physics` trait            |
| Custom networking code    | `@networked` trait          |
| Build UI components       | `spatial_group` + templates |
| State management library  | `@state { }`                |

**This demo compiles to**: Three.js, Unity, VRChat, Babylon.js, Quest native, and more.
