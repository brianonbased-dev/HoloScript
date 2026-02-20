# HoloScript Video Tutorial Outline - Specialized Examples

Video tutorial scripts for demonstrating HoloScript's specialized platform capabilities (robotics, IoT, multiplayer, mobile VR, social VR).

## Series Overview

**Target Audience**: Intermediate to advanced developers who completed general HoloScript tutorials
**Prerequisites**: Familiarity with HoloScript syntax, completed at least 2 general examples
**Total Series Length**: ~60-75 minutes across 5 videos
**Format**: Screen recording + voiceover, with code walkthroughs and live compilation

## Video 1: Robotics Simulation (12-15 minutes)

### Title
"Build Industrial Robots with HoloScript - UR5 Arm Simulation (URDF/SDF/ROS2)"

### Learning Objectives
- Understand URDF (Unified Robot Description Format) and SDF (Simulation Description Format)
- Build robot kinematics with links and joints
- Configure PID controllers for joint control
- Export to Gazebo and ROS2

### Outline

**[0:00-1:30] Introduction**
- "Welcome! Today we're building an industrial robot arm"
- Show final result: UR5 arm in Gazebo, ROS2 control
- "Single HoloScript file compiles to URDF, SDF, and ROS2 launch files"

**[1:30-3:00] Robotics Fundamentals**
- Explain URDF vs SDF
  - URDF: ROS standard, simple
  - SDF: Gazebo format, more features
- Show robot structure: base → links → joints → end effector
- 6 DOF (Degrees of Freedom) explained

**[3:00-5:00] Creating the Robot Base**
```holoscript
robot#ur5_arm @industrial @6dof {
  link#base_link @fixed {
    inertial {
      mass: 4.0
      inertia: { ixx: 0.00443, iyy: 0.00443, izz: 0.0072 }
    }
  }
}
```
- Explain inertial properties
- Why accurate mass/inertia matters for physics

**[5:00-8:00] Adding Joints and Controllers**
```holoscript
joint#shoulder_pan @revolute {
  axis: { x: 0, y: 0, z: 1 }  // Rotate around Z
  limits {
    effort: 150  // Nm torque
    velocity: 180  // deg/s
    range: { min: -360, max: 360 }
  }

  controller @position_control {
    type: "pid"
    gains: { p: 100, i: 0.01, d: 10 }
  }
}
```
- Revolute vs prismatic vs fixed joints
- PID tuning basics (P = proportional, I = integral, D = derivative)

**[8:00-10:00] Sensors and Visualization**
- Add joint state sensors
- Configure visual meshes
- Collision meshes vs visual meshes

**[10:00-12:00] Compilation and Testing**
```bash
holoscript compile robot-arm-simulation.holo \
  --target urdf --output ./build/urdf/

holoscript compile robot-arm-simulation.holo \
  --target sdf --output ./build/sdf/
```
- Load URDF in RViz (ROS visualizer)
- Load SDF in Gazebo simulator
- Send joint commands via ROS2 topics

**[12:00-13:00] Advanced Topics Preview**
- Inverse kinematics (IK)
- Path planning
- Grasp planning
- Integration with MoveIt2

**[13:00-15:00] Wrap-Up**
- Show compiled URDF/SDF code
- "Single HoloScript source → multiple robot formats"
- Next steps: Try adding a gripper, modify joint limits
- Resources: ROS2 docs, Gazebo tutorials

---

## Video 2: IoT Digital Twins (12-15 minutes)

### Title
"Smart Factory IoT with HoloScript - Azure Digital Twins & DTDL"

### Learning Objectives
- Understand Digital Twins Definition Language (DTDL)
- Model IoT devices with telemetry and commands
- Implement predictive maintenance rules
- Export to Azure Digital Twins

### Outline

**[0:00-1:30] Introduction**
- "Building a smart factory digital twin"
- Show final result: Azure Digital Twins dashboard with live telemetry
- "HoloScript compiles to DTDL for Azure/AWS IoT"

**[1:30-3:00] Digital Twin Fundamentals**
- What is a digital twin?
- DTDL (Digital Twins Definition Language) explained
- Components: Devices, Telemetry, Properties, Commands, Relationships

**[3:00-5:30] Creating IoT Devices**
```holoscript
device#conveyor_1 @iot_device @actuator {
  @dtdl_interface {
    id: "dtmi:factory:conveyor;1"
    version: "1.0.0"
  }

  telemetry {
    speed: {
      type: "double"
      unit: "metresPerSecond"
      schema: { min: 0.0, max: 5.0 }
    }
    vibration: {
      type: "double"
      unit: "metersPerSecondSquared"
    }
  }
}
```
- Telemetry vs properties
- Units and schemas
- Data types in DTDL

**[5:30-8:00] Device Commands**
```holoscript
commands {
  start: {
    on_execute(params) {
      motor_status = "running"
      target_speed = params.speed
      send_telemetry: { speed: target_speed }
    }
  }

  stop: {
    on_execute() {
      motor_status = "stopped"
      send_telemetry: { speed: 0.0 }
    }
  }
}
```
- Synchronous vs asynchronous commands
- Command parameters
- Response payloads

**[8:00-10:00] Predictive Maintenance**
```holoscript
maintenance_rule#vibration_monitor {
  condition: vibration > 2.5
  severity: "warning"

  on_trigger {
    create_work_order: {
      title: "Check conveyor bearings"
      priority: "medium"
      assignee: "maintenance_team"
    }

    send_notification: "Vibration threshold exceeded"
  }
}
```
- Rule-based monitoring
- Threshold alerts
- Work order generation

**[10:00-12:00] Compilation and Azure Integration**
```bash
holoscript compile smart-factory-twin.holo \
  --target dtdl --output ./build/dtdl/

# Upload to Azure Digital Twins
az dt model create --models ./build/dtdl/conveyor.json
```
- Show compiled DTDL JSON
- Azure portal walkthrough
- Create twin instances
- Send test telemetry

**[12:00-13:30] Relationships and Hierarchy**
- Factory → ProductionLine → Conveyor → Sensor
- Modeling equipment hierarchies
- Graph queries in Azure Digital Twins

**[13:30-15:00] Wrap-Up**
- Use cases: Predictive maintenance, energy optimization, quality control
- Next steps: Add more devices, complex rules
- Resources: Azure Digital Twins docs, DTDL spec

---

## Video 3: Multiplayer VR (13-16 minutes)

### Title
"Build Multiplayer VR Experiences with HoloScript - Photon, Mirror, WebRTC"

### Learning Objectives
- Understand VR networking fundamentals
- Implement player synchronization
- Add spatial voice chat
- Support multiple networking backends

### Outline

**[0:00-1:30] Introduction**
- "Creating a collaborative VR meeting space"
- Show 4 players in VR interacting, voice chat, shared whiteboard
- "HoloScript supports Photon, Mirror, WebRTC from one source"

**[1:30-3:00] Networking Fundamentals**
- Client-server vs peer-to-peer
- Object ownership
- Network synchronization strategies
- Photon (Unity) vs Mirror (Unity) vs WebRTC (Browser)

**[3:00-5:30] Setting Up Networking**
```holoscript
network_manager#multiplayer @photon {
  app_id: "your_photon_app_id"
  region: "us"

  max_players_per_room: 16
  room_name: "VRMeeting"

  serialization_rate: 20  // 20 Hz
  send_rate: 20
}
```
- Photon app ID setup
- Room configuration
- Serialization vs send rate

**[5:30-8:00] Player Synchronization**
```holoscript
player#vr_rig @networked {
  ownership: "player"  // Each player owns their rig

  transform_sync {
    position: true
    rotation: true
    scale: false  // VR rigs don't scale

    send_rate: 20  // 20 Hz
    interpolation: "lerp"  // Smooth movement
  }

  // Sync controllers
  controller#left_hand @networked {
    transform_sync { send_rate: 20 }
  }

  controller#right_hand @networked {
    transform_sync { send_rate: 20 }
  }
}
```
- Transform synchronization
- Interpolation for smooth movement
- Controller tracking sync

**[8:00-10:30] Spatial Voice Chat**
```holoscript
voice_chat @photon_voice {
  spatial_audio: true

  audio_settings {
    min_distance: 2.0   // Full volume within 2m
    max_distance: 20.0  // Silent beyond 20m
    rolloff: "logarithmic"
  }

  echo_cancellation: true
  noise_suppression: true

  codec: "opus"
  bitrate: 48000
}
```
- Spatial vs non-spatial audio
- Distance attenuation
- Audio quality settings
- Photon Voice vs Unity Voice vs WebRTC

**[10:30-12:30] Shared Objects**
```holoscript
object#whiteboard @drawable @networked {
  ownership: "shared"  // Multiple users can draw

  on_draw(stroke_data) {
    // Send to all clients
    send_rpc: "DrawStroke", [
      stroke_data.points,
      stroke_data.color,
      stroke_data.thickness
    ]
  }

  on_rpc_received("DrawStroke", points, color, thickness) {
    draw_line: {
      points: points
      color: color
      thickness: thickness
    }
  }
}
```
- RPCs (Remote Procedure Calls)
- Ownership models
- Shared vs per-player objects

**[12:30-14:00] Compilation for Different Backends**
```bash
# Photon (Unity)
holoscript compile vr-meeting-space.holo \
  --target unity --networking photon

# Mirror (Unity)
holoscript compile vr-meeting-space.holo \
  --target unity --networking mirror

# WebRTC (Browser)
holoscript compile vr-meeting-space.holo \
  --target webxr --networking webrtc
```
- Platform-specific compilation
- Testing locally
- Deploying multiplayer servers

**[14:00-15:00] Late Joiners and State Sync**
- OnPlayerJoined events
- Syncing existing state to new players
- Master client responsibilities

**[15:00-16:00] Wrap-Up**
- Use cases: Remote meetings, social VR, collaborative work
- Next steps: Add avatars, more interactions
- Resources: Photon docs, Mirror docs, WebRTC specs

---

## Video 4: Unity Quest Optimization (11-14 minutes)

### Title
"Mobile VR Optimization with HoloScript - Quest 2/3 Performance Tuning"

### Learning Objectives
- Understand mobile VR constraints (Quest 2/3)
- Implement LODs, texture compression, shader optimization
- Use XR Interaction Toolkit
- Achieve 90 FPS on Quest 3

### Outline

**[0:00-1:30] Introduction**
- "Optimizing VR for Quest standalone headsets"
- Show side-by-side: PCVR vs Quest (performance comparison)
- "HoloScript auto-generates Quest-optimized Unity projects"

**[1:30-3:00] Quest Performance Constraints**
- Quest 2: Snapdragon XR2, 6GB RAM, 72Hz/90Hz/120Hz
- Quest 3: Snapdragon XR2 Gen 2, 8GB RAM, 90Hz/120Hz
- Mobile GPU limitations
- Thermal throttling
- Target: <300 draw calls, <100k triangles, 90 FPS

**[3:00-5:30] Platform-Specific Configuration**
```holoscript
platform_config#quest {
  @unity_target {
    graphics {
      api: "vulkan"  // Quest uses Vulkan
      texture_compression: "astc_6x6"  // Mobile compression
      shader_quality: "medium"
      msaa: "2x"  // Multi-sample anti-aliasing
    }

    performance {
      target_framerate: 90  // Quest 3
      thermal_headroom: "sustained"  // Avoid throttling
    }
  }
}
```
- Vulkan vs OpenGL
- ASTC texture compression (6x6 block size)
- Mobile shader variants

**[5:30-8:00] LODs (Level of Detail)**
```holoscript
object#rock @optimized {
  model: "rock_base.glb"

  lod_group {
    lod_0: {
      distance: 0
      mesh: "rock_high.mesh"    // 5000 triangles
    }
    lod_1: {
      distance: 20
      mesh: "rock_medium.mesh"  // 1000 triangles
    }
    lod_2: {
      distance: 50
      mesh: "rock_low.mesh"     // 200 triangles
    }
  }

  culling_distance: 100  // Don't render beyond 100m
}
```
- LOD distances
- Triangle budgets per LOD
- Occlusion culling

**[8:00-10:00] Mobile Shaders and Materials**
```holoscript
object#ground {
  material {
    shader: "mobile/diffuse"  // Quest-optimized shader
    texture_compression: "astc_6x6"

    base_texture: "ground_albedo.png"  // 1024x1024 max
    // NO normal maps on Quest (too expensive)
    // NO metallic/roughness (use simple shaders)

    lightmap: true  // Baked lighting only
  }
}
```
- Mobile vs PC shaders
- Texture size limits
- Baked vs realtime lighting

**[10:00-11:30] Foveated Rendering (Quest 3)**
```holoscript
foveated_rendering @quest3_feature {
  enabled: true

  mode: "dynamic"  // Eye tracking-based (Quest 3 only)
  level: "medium"  // low, medium, high

  // Renders center at full res, periphery at lower res
  center_quality: "high"
  periphery_quality: "low"
}
```
- Fixed vs dynamic foveated rendering
- Quest 3 eye tracking
- Performance gains

**[11:30-13:00] XR Interaction Toolkit Integration**
- Teleportation vs continuous movement
- Grab interactions
- UI canvases in VR
- Compiled Unity XR Toolkit scripts

**[13:00-14:00] Wrap-Up**
- Performance profiling tools
- Quest developer hub
- Testing on device vs Link
- Resources: Quest developer docs, Unity XR Toolkit

---

## Video 5: VRChat Worlds (14-17 minutes)

### Title
"Create VRChat Worlds with HoloScript - Udon, Mirrors, Video Players"

### Learning Objectives
- Understand VRChat SDK3 and Udon scripting
- Implement VRChat-specific features (mirrors, video players, portals)
- Network custom behaviors with Udon
- Upload and publish VRChat worlds

### Outline

**[0:00-1:30] Introduction**
- "Building social VR worlds for VRChat"
- Show finished world: mirror, video player, portals, 32 players
- "HoloScript generates Unity + VRChat SDK + Udon scripts"

**[1:30-3:00] VRChat Platform Overview**
- VRChat SDK3 architecture
- Udon (VRChat's scripting language)
- World vs Avatar uploads
- Trust & Safety system
- Unity version requirement (2022.3.6f1 EXACT)

**[3:00-5:00] World Configuration**
```holoscript
vrchat_world#config @vrchat_sdk3 {
  world_name: "Social Hub - HoloScript Demo"
  author: "YourName"
  description: "A social VRChat world"

  capacity {
    recommended: 16  // Soft cap
    maximum: 32      // Hard cap
  }

  spawn_points {
    count: 8
    spread_radius: 5
  }

  tags: ["social", "hangout", "music"]
}
```
- Capacity tiers
- Spawn point setup
- World tags and discovery

**[5:00-7:00] VRChat Mirrors**
```holoscript
object#mirror @vrchat_mirror {
  unity_components: ["VRC_MirrorReflection"]

  mirror_settings {
    reflect_layers: ["Default", "PlayerLocal", "Player"]
    disable_pixel_lights: false
    custom_culling_mask: ["Water", "UI"]  // Don't reflect
  }

  udon_behavior#mirror_toggle {
    on_interact() {
      toggle_mirror()  // Performance optimization
    }
  }
}
```
- Mirror performance impact
- Layer configuration
- Toggle for low-end users

**[7:00-9:30] AVPro Video Players**
```holoscript
object#video_screen @vrchat_video_player {
  unity_components: ["VRC_AVProVideoPlayer"]

  video_player_settings {
    use_avpro: true  // YouTube/Twitch support
    default_url: "https://www.youtube.com/watch?v=..."
    auto_play: false
    loop: true

    audio_mode: "spatial"
    spatial_audio_settings {
      min_distance: 5
      max_distance: 50
      rolloff: "logarithmic"
    }
  }

  udon_behavior#video_controller {
    function load_url(url) {
      video_player.load_url: url
      send_custom_network_event: "OnURLChanged"
    }
  }
}
```
- AVPro vs Unity Video Player
- YouTube/Twitch streaming
- Spatial audio for videos
- URL permissions (master only)

**[9:30-11:30] Udon Networking**
```holoscript
udon_behavior#color_changer {
  program: "ColorChanger"

  synced_variables {
    networked_color: #ff0000  // Synced to all clients
  }

  on_interact() {
    networked_color = random_color()
    request_serialization()  // Broadcast update
  }

  on_deserialization() {
    // Receive network update
    target_object.material.color = networked_color
  }
}
```
- Synced variables
- Serialization/deserialization
- Network events (RPCs)

**[11:30-13:00] VRC_Pickup and Portals**
- Grabbable objects with VRC_Pickup
- Physics sync
- Portals to other worlds
- Avatar pedestals

**[13:00-15:00] Compilation and Upload**
```bash
# Compile to VRChat target
holoscript compile social-hub-world.holo \
  --target vrchat --output ./build/vrchat/

# Import to Unity project with VRChat SDK
# VRChat SDK > Build & Test (local testing)
# VRChat SDK > Build & Publish (upload to VRChat)
```
- Unity project setup
- VRChat SDK control panel
- World validation
- Upload process

**[15:00-16:00] Optimization for VRChat**
- Desktop vs Quest performance targets
- Draw calls: <1000 (desktop), <300 (Quest)
- Lightmap compression
- Shader compatibility
- SDK validation checks

**[16:00-17:00] Wrap-Up**
- VRChat Creator Companion
- World analytics
- Community guidelines
- Next steps: Add more Udon behaviors, optimize for Quest
- Resources: VRChat creator docs, Udon documentation

---

## Production Notes

### Recording Setup
- **Resolution**: 1920x1080 (1080p)
- **Frame Rate**: 60 FPS
- **Recording Software**: OBS Studio or Camtasia
- **Screen Layout**:
  - Left 60%: Code editor (VS Code with HoloScript syntax highlighting)
  - Right 40%: Terminal/output window
  - Switch to fullscreen for Unity/Unreal/Gazebo demos

### Audio
- **Microphone**: Clear voiceover (no background noise)
- **Background Music**: Light ambient music at -30dB during intro/outro
- **Sound Effects**: Keyboard typing, compilation success/error sounds

### Visual Aids
- **Syntax Highlighting**: HoloScript code in blue/purple theme
- **Annotations**: Arrows, circles, text callouts for key concepts
- **Split Screen**: Before/after comparisons
- **Picture-in-Picture**: Show final result in corner while editing code

### Editing
- **Intro**: 5-10 seconds, title card, channel branding
- **Chapters**: YouTube chapters at each major section
- **Speed Up**: Compilation/loading screens at 2x-4x speed
- **Captions**: Auto-generated + manual corrections
- **Outro**: 10 seconds, "Like & Subscribe" CTA, next video preview

### Publishing
- **Platform**: YouTube, Vimeo (for higher quality)
- **Playlist**: "HoloScript Specialized Examples"
- **Thumbnail**: Screenshot of final result + video number
- **Description**:
  - Link to example source code
  - Link to documentation
  - Timestamps for chapters
  - Prerequisites and resources
- **Tags**: holoscript, vr, ar, unity, unreal, robotics, iot, multiplayer, quest, vrchat

### Companion Materials
- **GitHub Repo**: Link to example source code
- **Written Tutorial**: Blog post version of video
- **Cheat Sheet**: PDF with key commands and concepts
- **Discussion**: Forum thread for Q&A

---

## Filming Schedule

**Week 1**: Videos 1-2 (Robotics, IoT)
**Week 2**: Videos 3-4 (Multiplayer, Quest)
**Week 3**: Video 5 (VRChat)
**Week 4**: Editing, thumbnail creation, publishing

**Total Production Time**: ~40-50 hours across 4 weeks

---

**Questions?** Contact the content team or open an issue on GitHub.
