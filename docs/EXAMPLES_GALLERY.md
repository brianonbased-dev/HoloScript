# HoloScript Examples Gallery

Visual showcase of all HoloScript examples demonstrating universal platform compilation.

## 🎯 Quick Navigation

| Category        | Examples   | Platforms                         | Best For                   |
| --------------- | ---------- | --------------------------------- | -------------------------- |
| **General**     | 4 examples | Unity, Unreal, Godot, WebXR       | Learning HoloScript basics |
| **Specialized** | 5 examples | URDF, DTDL, Photon, VRChat, Quest | Production deployments     |

**[View Full Catalog →](../examples/INDEX.md)** | **[Browse Examples →](../examples/)**

---

## 🏢 General Examples

### VR Training Simulation

**Corporate safety training with interactive hazard identification**

```holoscript
composition "WorkplaceSafety" {
  object#wet_floor @hazard @interactive {
    on_interact {
      show_popup: "✓ Hazard Identified"
      award_points: 10
    }
  }
}
```

**Platforms**: Unity • Unreal • Godot • WebXR
**Use Cases**: Employee onboarding, safety training, compliance
**Features**: Hazard detection, progress tracking, certificates
**Lines**: 609 | **Difficulty**: ⭐ Beginner

**[View Example →](../examples/general/vr-training-simulation/)**

---

### AR Furniture Preview

**"Try before you buy" e-commerce AR experience**

```holoscript
ar_session#furniture_preview @mobile {
  plane_detection: "horizontal"

  on_plane_detected {
    spawn_object: selected_furniture
    enable_gestures: ["pinch", "drag", "rotate"]
  }
}
```

**Platforms**: ARKit (iOS) • ARCore (Android) • WebXR AR
**Use Cases**: E-commerce, interior design, retail
**Features**: Plane detection, material variants, gesture controls
**Lines**: 873 | **Difficulty**: ⭐ Beginner

**[View Example →](../examples/general/ar-furniture-preview/)**

---

### Virtual Art Gallery

**Museum exhibition with multi-language audio guides**

```holoscript
artwork#monet_lilies @interactive @audio_guided {
  on_interact {
    show_artwork_detail_panel: this
    play_audio_guide: audio_guide_files[current_language]
  }
}
```

**Platforms**: Unity • Unreal • Babylon.js • WebXR
**Use Cases**: Museums, galleries, cultural education
**Features**: Audio guides, teleportation, minimap, multi-language
**Lines**: 888 | **Difficulty**: ⭐⭐ Intermediate

**[View Example →](../examples/general/virtual-art-gallery/)**

---

### VR Game Demo

**Fast-paced VR shooter with physics and AI**

```holoscript
weapon#pistol @grabbable {
  on_trigger_pressed {
    spawn_projectile: {
      velocity: controller.forward * 20
      damage: 10
    }
  }
}

enemy#target @ai @physics {
  behavior: "patrol"
  on_hit { health -= damage }
}
```

**Platforms**: Unity • Unreal • Godot
**Use Cases**: Gaming, entertainment, arcade VR
**Features**: Physics weapons, enemy AI, scoring, state machine
**Lines**: 808 | **Difficulty**: ⭐⭐ Intermediate

**[View Example →](../examples/general/vr-game-demo/)**

---

## 🔬 Specialized Examples

### Robotics Simulation

**Industrial robot arm (UR5) with ROS2/Gazebo export**

```holoscript
robot#ur5_arm @industrial @6dof {
  link#base_link @fixed {
    inertial {
      mass: 4.0
      inertia: { ixx: 0.00443, iyy: 0.00443, izz: 0.0072 }
    }
  }

  joint#shoulder_pan @revolute {
    axis: { x: 0, y: 0, z: 1 }
    limits {
      effort: 150  // Nm torque
      velocity: 180  // deg/s
    }
    controller @position_control {
      type: "pid"
      gains: { p: 100, i: 0.01, d: 10 }
    }
  }
}
```

**Platforms**: URDF • SDF • Gazebo • ROS2
**Use Cases**: Manufacturing, automation, robotics research
**Features**: Inverse kinematics, path planning, sensors, PID control
**Lines**: 789 | **Difficulty**: ⭐⭐⭐ Advanced

**[View Example →](../examples/specialized/robotics/)**

---

### IoT Digital Twin

**Smart factory with Azure Digital Twins integration**

```holoscript
device#conveyor_1 @iot_device @actuator {
  @dtdl_interface {
    id: "dtmi:factory:conveyor;1"
  }

  telemetry {
    speed: { type: "double", unit: "metresPerSecond" }
    vibration: { type: "double", unit: "metersPerSecondSquared" }
  }

  commands {
    start: {
      on_execute(params) {
        motor_status = "running"
        target_speed = params.speed
      }
    }
  }

  maintenance_rule#vibration_monitor {
    condition: vibration > 2.5
    on_trigger {
      create_work_order: "Check bearings"
    }
  }
}
```

**Platforms**: DTDL • Azure Digital Twins • AWS IoT TwinMaker
**Use Cases**: Industrial IoT, predictive maintenance, smart factories
**Features**: Telemetry streaming, predictive rules, cloud integration
**Lines**: 730 | **Difficulty**: ⭐⭐⭐ Advanced

**[View Example →](../examples/specialized/iot/)**

---

### Multiplayer VR

**Collaborative meeting space with voice chat**

```holoscript
network_manager#multiplayer @photon {
  max_players_per_room: 16

  player#vr_rig @networked {
    transform_sync {
      position: true
      rotation: true
      send_rate: 20  // 20 Hz
    }

    voice_chat @photon_voice {
      spatial_audio: true
      min_distance: 2.0
      max_distance: 20.0
    }
  }

  object#whiteboard @drawable @networked {
    ownership: "shared"  // Multiple users can draw

    on_draw(stroke_data) {
      send_rpc: "DrawStroke", [stroke_data.points, stroke_data.color]
    }
  }
}
```

**Platforms**: Unity (Photon/Mirror) • Unreal (Replication) • WebRTC
**Use Cases**: Remote collaboration, social VR, virtual meetings
**Features**: Voice chat, shared whiteboard, video sync, networking
**Lines**: 806 | **Difficulty**: ⭐⭐⭐ Advanced

**[View Example →](../examples/specialized/multiplayer/)**

---

### Unity Quest Optimization

**Platform-optimized VR for Quest 2/3**

```holoscript
platform_config#quest {
  @unity_target {
    graphics {
      api: "vulkan"
      texture_compression: "astc_6x6"
      shader_quality: "medium"
    }

    performance {
      target_framerate: 90  // Quest 3
      thermal_headroom: "sustained"
    }
  }
}

object#ground @optimized {
  material {
    shader: "mobile/diffuse"  // Quest-optimized
    texture_compression: "astc_6x6"
  }

  lod_group {
    lod_0: { distance: 0, mesh: "high.mesh" }
    lod_1: { distance: 20, mesh: "medium.mesh" }
    lod_2: { distance: 50, mesh: "low.mesh" }
  }
}

foveated_rendering @quest3_feature {
  enabled: true  // Eye tracking optimization
}
```

**Platforms**: Unity for Quest 2/3 • PCVR (auto-upgrade)
**Use Cases**: Mobile VR optimization, Quest deployment
**Features**: ASTC textures, LODs, mobile shaders, foveated rendering
**Lines**: 817 | **Difficulty**: ⭐⭐⭐ Advanced

**[View Example →](../examples/specialized/unity-quest/)**

---

### VRChat World

**Social hub with mirrors, video players, and Udon#**

```holoscript
vrchat_world#config @vrchat_sdk3 {
  capacity { maximum: 32 }

  object#mirror @vrchat_mirror {
    unity_components: ["VRC_MirrorReflection"]

    udon_behavior#mirror_toggle {
      on_interact() {
        toggle_mirror()
      }
    }
  }

  object#video_screen @vrchat_video_player {
    unity_components: ["VRC_AVProVideoPlayer"]

    udon_behavior#video_controller {
      function load_url(url) {
        video_player.load_url: url
        send_custom_network_event: "OnURLChanged"
      }
    }
  }

  object#portal @vrchat_portal {
    target_world_id: "wrld_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
  }
}
```

**Platforms**: Unity + VRChat SDK3 + Udon#
**Use Cases**: Social VR, user-generated content, VRChat worlds
**Features**: Mirrors, video players, portals, Udon# scripting, networking
**Lines**: 768 | **Difficulty**: ⭐⭐⭐ Advanced

**[View Example →](../examples/specialized/vrchat/)**

---

## 📊 Platform Comparison Matrix

| Example          | Unity | Unreal | Godot | WebXR | URDF/SDF | DTDL | VRChat |
| ---------------- | ----- | ------ | ----- | ----- | -------- | ---- | ------ |
| VR Training      | ✅    | ✅     | ✅    | ✅    | ❌       | ❌   | ❌     |
| AR Furniture     | ✅    | ❌     | ❌    | ✅    | ❌       | ❌   | ❌     |
| Virtual Gallery  | ✅    | ✅     | ✅    | ✅    | ❌       | ❌   | ❌     |
| VR Game          | ✅    | ✅     | ✅    | ❌    | ❌       | ❌   | ❌     |
| Robotics         | ❌    | ❌     | ❌    | ❌    | ✅       | ❌   | ❌     |
| IoT Digital Twin | ❌    | ❌     | ❌    | ❌    | ❌       | ✅   | ❌     |
| Multiplayer VR   | ✅    | ✅     | ❌    | ✅    | ❌       | ❌   | ❌     |
| Unity Quest      | ✅    | ❌     | ❌    | ❌    | ❌       | ❌   | ❌     |
| VRChat World     | ✅    | ❌     | ❌    | ❌    | ❌       | ❌   | ✅     |

## 🎨 Feature Comparison

| Feature                | Examples Using It                             | Platforms                    |
| ---------------------- | --------------------------------------------- | ---------------------------- |
| **Physics**            | VR Game, Unity Quest, Multiplayer, VRChat     | Unity, Unreal, Godot         |
| **Networking**         | Multiplayer VR, VRChat World                  | Photon, Mirror, WebRTC, Udon |
| **Voice Chat**         | Multiplayer VR, VRChat World                  | Photon Voice, WebRTC         |
| **AI/Pathfinding**     | VR Game (enemy AI), Robotics (IK)             | Unity, Unreal, Godot, ROS2   |
| **AR Plane Detection** | AR Furniture                                  | ARKit, ARCore, WebXR         |
| **Teleportation**      | VR Training, Virtual Gallery, Unity Quest     | Unity, Unreal, Godot, WebXR  |
| **Audio**              | Virtual Gallery (guides), Multiplayer (voice) | All platforms                |
| **IoT Integration**    | IoT Digital Twin                              | Azure, AWS                   |
| **Robotics**           | Robotics Simulation                           | URDF, SDF, Gazebo, ROS2      |
| **Social VR**          | VRChat World                                  | VRChat, Udon#                |

## 📈 Complexity & Learning Path

### Beginner Path (Start Here)

1. **VR Training Simulation** (⭐) - 2 hours
   - Learn: Objects, interactions, events, UI
   - Compile to: Unity, Unreal, Godot

2. **AR Furniture Preview** (⭐) - 3 hours
   - Learn: AR concepts, plane detection, gestures
   - Compile to: ARKit, ARCore, WebXR

### Intermediate Path

3. **Virtual Art Gallery** (⭐⭐) - 4 hours
   - Learn: Locomotion, audio, UI systems
   - Compile to: Unity, Unreal, Babylon.js

4. **VR Game Demo** (⭐⭐) - 5 hours
   - Learn: Game mechanics, physics, AI, state machines
   - Compile to: Unity, Unreal, Godot

### Advanced Path (Production Ready)

5. **Unity Quest** (⭐⭐⭐) - 6 hours
   - Learn: Platform optimization, mobile VR
   - Compile to: Unity (Quest 2/3, PCVR)

6. **Multiplayer VR** (⭐⭐⭐) - 8 hours
   - Learn: Networking, voice chat, synchronization
   - Compile to: Photon, Mirror, WebRTC

7. **Robotics Simulation** (⭐⭐⭐) - 8 hours
   - Learn: URDF/SDF, kinematics, path planning
   - Compile to: URDF, SDF, Gazebo, ROS2

8. **IoT Digital Twin** (⭐⭐⭐) - 7 hours
   - Learn: DTDL, telemetry, Azure integration
   - Compile to: DTDL, Azure Digital Twins

9. **VRChat World** (⭐⭐⭐) - 10 hours
   - Learn: VRChat SDK, Udon#, social VR
   - Compile to: VRChat SDK3, Udon#

**Total Learning Time**: ~53 hours (beginner to advanced)

## 🚀 Quick Start with Any Example

```bash
# 1. Choose an example
cd examples/general/vr-training-simulation

# 2. Compile to your target platform
holoscript compile workplace-safety.holo --target unity --output ./build/

# 3. Import to Unity/Unreal/etc
# Follow the example's README for platform-specific steps

# 4. Build and deploy
# Each example includes deployment instructions
```

## 💡 Use Case Selector

**I want to build...**

- 🏢 **Corporate training** → VR Training Simulation
- 🛋️ **E-commerce AR** → AR Furniture Preview
- 🎨 **Museum/culture** → Virtual Art Gallery
- 🎮 **VR game** → VR Game Demo
- 🤖 **Robot simulation** → Robotics Simulation
- 🏭 **IoT/smart factory** → IoT Digital Twin
- 👥 **Multiplayer VR** → Multiplayer VR
- 📱 **Quest app** → Unity Quest
- 🌐 **VRChat world** → VRChat World

## 📦 What You Get with Each Example

Every example includes:

✅ **Complete .holo source** (600-900 lines)
✅ **README.md** - Quick start, features, deployment
✅ **TUTORIAL.md** - Concepts, best practices, workflow
✅ **Compilation targets** - 2-18 platforms per example
✅ **Production-ready** - Not just demos, but starting points

## 🌍 Deployment Targets

### General Examples (18+ platforms total)

- **Unity**: Quest, PCVR, Mobile, Desktop
- **Unreal**: PCVR, Console, High-end desktop
- **Godot**: Open-source, lightweight
- **WebXR**: Browser-based, no installation
- **ARKit**: iOS AR apps
- **ARCore**: Android AR apps

### Specialized Examples (Niche platforms)

- **URDF/SDF**: Robot simulators (Gazebo, ROS2)
- **DTDL**: IoT platforms (Azure, AWS)
- **Photon/Mirror**: Unity networking
- **WebRTC**: Browser multiplayer
- **VRChat SDK**: Social VR worlds
- **Udon#**: VRChat scripting

## 📚 Additional Resources

- **[Examples Index](../examples/INDEX.md)** - Full searchable catalog
- **[Getting Started](GETTING_STARTED.md)** - HoloScript basics
- **[Platform Guides](platforms/)** - Unity, Unreal, WebXR integration
- **[API Reference](api/)** - Complete language reference

---

**Ready to build?** Pick an example, compile it, and deploy to your target platform. All examples are production-ready starting points! 🚀

**[Browse All Examples →](../examples/)** | **[View Catalog →](../examples/INDEX.md)**
