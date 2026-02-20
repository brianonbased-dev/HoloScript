# Getting Started with HoloScript

**Write once, deploy everywhere.** HoloScript is a universal language for creating VR, AR, and 3D experiences that compile to any platform.

## What is HoloScript?

HoloScript is a declarative language designed specifically for spatial computing. Instead of writing Unity C#, Unreal C++, WebXR JavaScript, and Godot GDScript separately, you write **one HoloScript file** that compiles to all platforms.

### Why HoloScript?

✓ **Universal**: One codebase → Unity, Unreal, Godot, WebXR, Quest, ARKit, ARCore
✓ **Declarative**: Describe what you want, not how to build it
✓ **Readable**: Clean syntax focused on spatial concepts
✓ **Powerful**: From simple AR markers to complex VR games

## Installation

### Prerequisites

- **Node.js** 18+ (for compiler)
- **pnpm** (recommended) or npm

### Install HoloScript

```bash
# Using pnpm (recommended)
pnpm add -g @holoscript/cli

# Using npm
npm install -g @holoscript/cli

# Verify installation
holoscript --version
```

## Your First HoloScript Experience

### 1. Create a Simple VR Scene

Create `hello-vr.holo`:

```holoscript
composition "HelloVR" {
  environment#space {
    skybox: "starfield"
    ambient_light: { intensity: 0.3, color: #ffffff }
  }

  zone#greeting {
    object#welcome_cube @interactive {
      type: "cube"
      size: { x: 1, y: 1, z: 1 }
      material: "hologram"
      position: { x: 0, y: 1.5, z: 2 }

      animate {
        property: "rotation_y"
        from: 0
        to: 360
        duration: 3
        loop: true
      }

      on_interact {
        show_popup: {
          title: "Welcome to HoloScript!"
          message: "This cube compiles to Unity, Unreal, Godot, WebXR, and more."
        }
      }
    }
  }

  camera#player @vr @first_person {
    position: { x: 0, y: 1.7, z: 0 }
  }
}
```

### 2. Compile to Your Platform

```bash
# WebXR (browser-based, easiest to test)
holoscript compile hello-vr.holo --target webxr --output ./build/webxr/

# Unity (Quest/PCVR)
holoscript compile hello-vr.holo --target unity --output ./build/unity/

# Unreal Engine
holoscript compile hello-vr.holo --target unreal --output ./build/unreal/

# Godot
holoscript compile hello-vr.holo --target godot --output ./build/godot/
```

### 3. Run the Experience

**WebXR (Fastest way to test):**
```bash
cd build/webxr
npx serve .
# Open http://localhost:3000 in browser
```

**Unity:**
1. Open Unity project
2. Import scripts from `build/unity/`
3. Press Play

**Unreal/Godot:** See platform-specific guides.

## Core Concepts

### Compositions

Every HoloScript file is a `composition` - a self-contained VR/AR experience:

```holoscript
composition "MyExperience" {
  // Your content here
}
```

### Environments

Set the scene's atmosphere:

```holoscript
environment#outdoor {
  skybox: "sunset_hdri"
  ambient_light: { intensity: 0.5, color: #ffe8d0 }
  fog: { density: 0.001, color: #ffccaa }
}
```

### Zones

Spatial containers for organizing content:

```holoscript
zone#main_area @navigable {
  floor#ground @physics {
    material: "grass"
    size: { x: 20, z: 20 }
    collision: true
  }

  // Objects in this zone...
}
```

### Objects

3D objects with properties and behaviors:

```holoscript
object#my_object {
  type: "cube"  // or "sphere", "plane", "custom_model"
  size: { x: 1, y: 1, z: 1 }
  material: "metal"
  position: { x: 0, y: 1, z: 0 }
  rotation: { x: 0, y: 45, z: 0 }
  scale: { x: 1, y: 1, z: 1 }
}
```

### Interactions

Make objects respond to player actions:

```holoscript
object#button @interactive {
  type: "cube"

  on_interact {
    play_audio: "click.mp3"
    change_color: #00ff00
    show_toast: "Button pressed!"
  }

  on_grab {
    vibrate_controller: { intensity: 0.5 }
  }

  on_release {
    // Return to original position
    animate_to: { position: original_position }
  }
}
```

### Animations

Bring objects to life:

```holoscript
object#rotating_platform {
  animate {
    property: "rotation_y"
    from: 0
    to: 360
    duration: 10
    loop: true
    easing: "linear"
  }
}

object#floating_crystal {
  animate {
    property: "position_y"
    from: 1
    to: 1.5
    duration: 2
    loop: true
    easing: "ease_in_out"
  }
}
```

### Lights

Illuminate your scene:

```holoscript
light#sun {
  type: "directional"
  intensity: 1.5
  color: #fff8e6
  rotation: { x: -50, y: 30 }
  cast_shadows: true
}

light#point_glow {
  type: "point"
  intensity: 2.0
  color: #00ffff
  position: { x: 0, y: 2, z: 0 }
  range: 10
}
```

### Camera (Player)

Define the player's viewpoint:

```holoscript
camera#player @vr @first_person {
  fov: 90
  position: { x: 0, y: 1.7, z: 0 }

  controller#left_hand {
    model: "vr_controller_left.glb"
    teleport_enabled: true
  }

  controller#right_hand {
    model: "vr_controller_right.glb"
    ray_interact: true
    grab_enabled: true
  }
}
```

## Common Patterns

### AR Marker Detection

```holoscript
ar_session#furniture_viewer {
  plane_detection: "horizontal"

  on_plane_detected {
    spawn_object: {
      model: "chair.glb"
      position: detected_plane.center
    }
  }
}
```

### Physics & Collision

```holoscript
object#ball @physics {
  type: "sphere"
  mass: 1.0
  friction: 0.5
  bounciness: 0.7

  on_collision(other) {
    play_audio: "bounce.mp3"
  }
}
```

### UI Overlays

```holoscript
ui#score_display @top_right {
  text: "Score: {player.score}"
  font_size: 24
  color: #ffff00
}
```

### Audio

```holoscript
audio#background_music @environmental {
  source: "music.mp3"
  loop: true
  volume: 0.3
  spatial: false
}

audio#footsteps @positional {
  source: "step.mp3"
  position: player.position
  max_distance: 10
}
```

## Next Steps

### Explore Examples

```bash
cd examples/general/

# Corporate training
cd vr-training-simulation/

# E-commerce AR
cd ar-furniture-preview/

# Cultural experiences
cd virtual-art-gallery/

# VR gaming
cd vr-game-demo/
```

### Platform-Specific Guides

- [Unity Integration](./platforms/UNITY.md) - Quest, PCVR
- [Unreal Integration](./platforms/UNREAL.md) - High-fidelity VR
- [WebXR Integration](./platforms/WEBXR.md) - Browser-based
- [Godot Integration](./platforms/GODOT.md) - Open-source

### Advanced Topics

- [Language Reference](./LANGUAGE_REFERENCE.md) - Complete syntax
- [Physics System](./PHYSICS_GUIDE.md) - Collision, gravity, forces
- [Animation System](./ANIMATION_GUIDE.md) - Keyframes, procedural
- [Audio Guide](./AUDIO_GUIDE.md) - Spatial, environmental
- [Performance Optimization](./OPTIMIZATION.md) - 90 FPS for VR

## Compilation Targets

HoloScript compiles to:

| Target | Description | Use Case |
|--------|-------------|----------|
| `unity` | C# scripts for Unity | Quest, PCVR, mobile |
| `unreal` | C++ for Unreal Engine | High-fidelity VR |
| `godot` | GDScript for Godot | Open-source projects |
| `webxr` | Three.js/JavaScript | Browser-based VR/AR |
| `babylonjs` | Babylon.js scenes | WebXR with better graphics |
| `arkit` | Swift for iOS AR | iPhone/iPad AR apps |
| `arcore` | Kotlin for Android AR | Android AR apps |
| `vrchat` | Udon scripts | Social VR worlds |

## Tips & Best Practices

### 1. Start Small
Begin with simple scenes, add complexity gradually.

### 2. Test Early
Compile to WebXR first (fastest iteration cycle).

### 3. Use Traits
`@interactive`, `@physics`, `@navigable` add common behaviors.

### 4. Keep Performance in Mind
- Target 90 FPS for VR
- Use LOD (level of detail) for distant objects
- Limit active particles to 100

### 5. Think Universal
Avoid platform-specific features unless necessary.

## Getting Help

- **Documentation**: [https://holoscript.dev/docs](https://holoscript.dev/docs)
- **Discord**: [https://discord.gg/holoscript](https://discord.gg/holoscript)
- **GitHub**: [https://github.com/holoscript/holoscript](https://github.com/holoscript/holoscript)
- **Examples**: `examples/` directory in this repo

## What's Next?

### Try These Examples

Pick a use case and dive in:

**General Examples (Start Here):**

- **Corporate Training** → [VR Training Simulation](../examples/general/vr-training-simulation/)
- **E-Commerce** → [AR Furniture Preview](../examples/general/ar-furniture-preview/)
- **Culture/Education** → [Virtual Art Gallery](../examples/general/virtual-art-gallery/)
- **Gaming** → [VR Game Demo](../examples/general/vr-game-demo/)

**Specialized Examples (Advanced):**

- **Robotics** → [Industrial Robot Simulation](../examples/specialized/robotics/) (URDF/SDF/ROS2)
- **IoT** → [Smart Factory Digital Twin](../examples/specialized/iot/) (Azure Digital Twins)
- **Multiplayer** → [VR Meeting Space](../examples/specialized/multiplayer/) (Photon/WebRTC)
- **Quest/Mobile** → [Platform-Optimized VR](../examples/specialized/unity-quest/) (Quest 2/3)
- **Social VR** → [VRChat World](../examples/specialized/vrchat/) (Udon#)

**[Browse all examples →](../examples/)** | **[Examples catalog →](../examples/INDEX.md)**

---

**Welcome to spatial computing.** Build anything, deploy everywhere. 🌐
