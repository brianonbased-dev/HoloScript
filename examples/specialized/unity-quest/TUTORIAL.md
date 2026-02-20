# HoloScript Unity Quest Tutorial

Learn how to build optimized VR experiences for Meta Quest using HoloScript and Unity XR Interaction Toolkit.

## Key Concepts

### 1. Platform Configuration

```holoscript
platform_config#quest {
  @unity_target {
    platform: "android"
    build_target: "oculus"

    graphics {
      api: "vulkan"           // Quest graphics API
      color_space: "gamma"    // Faster than linear on mobile
      msaa: 2                 // 2x antialiasing (not 4x/8x)

      texture_compression: "astc"  // Quest-specific
      shader_quality: "medium"
      shadow_distance: 20     // Limit for performance
    }

    performance {
      target_framerate: 90    // Quest 3 (72 for Quest 2)
      thermal_headroom: "sustained"
    }
  }
}
```

**Platform targets**: `"quest"` (mobile), `"pcvr"` (high-end desktop)

### 2. Unity XR Origin (Player Rig)

```holoscript
player#xr_rig @unity_xr_toolkit {
  unity_components: ["XROrigin", "CharacterController"]

  camera#main @vr {
    tag: "MainCamera"
    clear_flags: "skybox"
  }

  character_controller {
    height: 1.8
    radius: 0.3
  }

  locomotion#continuous_move @unity_xr {
    unity_components: ["ContinuousMoveProvider"]

    movement {
      speed: 2.0        // m/s
      use_gravity: true
    }

    input {
      left_hand_move: "primary2daxis"  // Thumbstick
    }
  }
}
```

**Unity Components Generated:**
- `XROrigin` - Root tracking space
- `Camera` - Stereo VR camera
- `CharacterController` - Collision capsule
- `ContinuousMoveProvider` - Smooth locomotion
- `TeleportationProvider` - Teleport system

### 3. VR Controllers

```holoscript
controller#left_hand @vr @unity_xr {
  hand: "left"

  unity_components: [
    "XRController",           // Input tracking
    "XRRayInteractor",        // Ray for UI/distant
    "XRDirectInteractor",     // Grab nearby objects
    "LineRenderer"            // Visual ray
  ]

  model {
    source: "quest_controller_left.prefab"
  }

  // Ray for UI
  ray_interactor {
    max_raycast_distance: 10
    line_type: "bezier_curve"
    valid_color: #00ffff
  }

  // Direct grab
  direct_interactor {
    attach_transform: "attach_point"
    force_grab: true
  }

  // Haptics
  haptics {
    grab_intensity: 0.5
    grab_duration: 0.1
  }

  // Input mapping
  input_actions {
    grip: "grip"
    trigger: "trigger"
    primary_button: "primarybutton"    // X button
    thumbstick: "primary2daxis"
  }
}
```

**XR Controller Flow:**
1. **XRController** reads input from Quest controller
2. **XRRayInteractor** casts ray for distant selection
3. **XRDirectInteractor** detects nearby grabbable objects
4. **LineRenderer** visualizes ray beam

### 4. Mobile Shader Optimization

```holoscript
material {
  base_color: #90ee90
  metallic: 0.0
  roughness: 0.8

  shader: "mobile/diffuse"  // Quest optimization

  texture_compression: "astc_6x6"
}
```

**Shader Hierarchy (Fastest → Slowest):**
- `mobile/unlit` - No lighting (particles, UI, effects)
- `mobile/diffuse` - Simple baked lighting
- `mobile/bumped_diffuse` - With normal maps
- `standard` - Full PBR (PCVR only, too slow for Quest)

**ASTC Texture Compression:**
- `astc_4x4` - High quality (2:1 compression)
- `astc_6x6` - **Recommended** (4:1 compression)
- `astc_8x8` - Lower quality (6:1 compression)

### 5. Grabbable Objects (XR Grab Interactable)

```holoscript
object#box @grabbable @unity_xr_interactable {
  unity_components: ["XRGrabInteractable", "Rigidbody"]

  type: "cube"
  size: { x: 0.3, y: 0.3, z: 0.3 }

  material {
    shader: "mobile/diffuse"
  }

  physics {
    type: "dynamic"
    mass: 1.0
    use_gravity: true
  }

  grab_settings {
    attach_ease_in_time: 0.15       // Smooth grab
    throw_on_detach: true           // Enable throwing
    throw_smoothing_duration: 0.25

    velocity_tracking: "average"    // Physics throwing
  }

  on_grab(hand) {
    hand.send_haptic_impulse: { intensity: 0.5, duration: 0.1 }
  }

  on_release(hand) {
    hand.send_haptic_impulse: { intensity: 0.3, duration: 0.05 }
  }
}
```

**Grab Modes:**
- **Single Grab**: One controller at a time
- **Multiple Grab**: Both controllers (two-handed)
- **Velocity Tracking**: Throw physics based on hand velocity

### 6. XR Simple Interactable (Buttons/Targets)

```holoscript
object#target @interactive @unity_xr_interactable {
  unity_components: ["XRSimpleInteractable"]

  type: "sphere"
  size: { radius: 0.3 }

  material {
    shader: "mobile/unlit"
    emission: #ff1493
  }

  on_select_entered(interactor) {
    // Interactor = ray or direct grab
    hit_target: this
    play_sound: "hit.wav"

    animation#pop {
      type: "scale"
      keyframes {
        0.0: { scale: 1.0 }
        0.1: { scale: 1.5 }
        0.2: { scale: 0.0 }
      }
      on_complete {
        destroy: this
      }
    }
  }
}
```

**XR Simple Interactable** = Lightweight interaction (no physics, just selection)

### 7. Teleportation System

```holoscript
teleport_system @unity_xr {
  unity_components: ["TeleportationProvider"]

  raycast {
    max_distance: 10
    valid_layers: ["Teleportable"]
  }

  visual {
    arc_line: true
    reticle: "teleport_reticle"
    valid_color: #00ff00
    invalid_color: #ff0000
  }
}

object#platform @teleportable {
  layer: "Teleportable"
  // Rest of platform setup...
}
```

**Teleport Flow:**
1. Player aims with controller (arc ray)
2. System raycasts for "Teleportable" layer
3. Valid = green arc, Invalid = red arc
4. Release button = teleport to reticle position

### 8. LOD (Level of Detail)

```holoscript
object#ground {
  lod_group {
    lod_0: { distance: 0, mesh: "ground_high.mesh" }    // 0-20m
    lod_1: { distance: 20, mesh: "ground_medium.mesh" } // 20-50m
    lod_2: { distance: 50, mesh: "ground_low.mesh" }    // 50+m
  }
}
```

**LOD Recommendations (Quest):**
- **LOD 0** (0-10m): 100% detail
- **LOD 1** (10-30m): 50% triangles
- **LOD 2** (30-50m): 25% triangles
- **LOD 3** (50m+): Cull or billboard

**Benefits:**
- 2-3x better performance in large scenes
- Automatic based on camera distance
- No visual degradation (player won't notice)

### 9. Baked Lighting (Quest Optimization)

```holoscript
lighting {
  mode: "baked"              // NOT realtime
  lightmap_resolution: 512   // Lower for Quest

  platform_override#pcvr {
    mode: "mixed"            // Realtime for PCVR
    lightmap_resolution: 2048
  }
}
```

**Lighting Modes:**
- **Baked**: Fastest, pre-computed (Quest)
- **Mixed**: Some realtime shadows (PCVR)
- **Realtime**: Fully dynamic (too slow for Quest)

**Baking Workflow:**
```
1. Mark static objects (Lighting > Static)
2. Add baked lights (Light > Mode: Baked)
3. Window > Rendering > Lighting > Generate Lighting
4. Lightmaps saved to scene folder
```

### 10. Quest-Specific Features

#### Hand Tracking

```holoscript
hand_tracking#both_hands @quest_feature {
  enabled: true

  gestures {
    pinch: true    // Grab objects
    point: true    // Ray select
    fist: true     // Custom
  }

  fallback_mode: "controllers"  // If hands not detected
}
```

#### Passthrough (Mixed Reality)

```holoscript
passthrough#mr_mode @quest3_feature {
  enabled: false

  settings {
    opacity: 0.8
    color_mode: "full_color"  // Quest 3 only
  }

  toggle_button {
    input: "secondary_button"  // Y/B button
  }
}
```

#### Foveated Rendering (Quest 3 Eye Tracking)

```holoscript
foveated_rendering @quest3_feature {
  enabled: true

  quality {
    high_fov: 30   // Full res (center)
    medium_fov: 60 // 75% res
    low_fov: 90    // 50% res (peripheral)
  }

  dynamic: true  // Adjust with eye movement
}
```

**Performance Gain**: 20-40% GPU improvement on Quest 3

## Workflow

1. **Define Platform Config** - Quest vs PCVR settings
2. **Create XR Origin** - Player rig with controllers
3. **Add Locomotion** - Continuous move + teleport
4. **Build Environment** - Mobile-optimized shaders
5. **Add Interactions** - Grabbables, buttons, targets
6. **Optimize** - LODs, baked lighting, ASTC textures
7. **Export to Unity** - Compile with Quest target
8. **Build APK** - Deploy to Quest device

## Best Practices

### Performance Targets

**Quest 2:**
- **Target**: 72 FPS (90 FPS experimental)
- **Draw Calls**: <200
- **Triangles**: <100k
- **Texture Memory**: <500 MB
- **Shadows**: Medium, 20m distance
- **Particles**: <100 per effect

**Quest 3:**
- **Target**: 90 FPS (120 FPS capable)
- **Draw Calls**: <300
- **Triangles**: <200k
- **Texture Memory**: <800 MB
- **Shadows**: High, 30m distance
- **Particles**: <200 per effect

**PCVR:**
- **Target**: 90-120 FPS
- **Draw Calls**: <1000
- **Triangles**: <1M
- **Shadows**: High/Very High
- **Realtime GI**: Enabled

### Mobile Optimization Checklist

- [ ] Use mobile shaders (`mobile/diffuse`, `mobile/unlit`)
- [ ] Enable ASTC texture compression (6x6 or 8x8)
- [ ] Bake lighting (not realtime)
- [ ] Add LODs to all models >500 triangles
- [ ] Enable occlusion culling
- [ ] Limit shadow distance to 20-30m
- [ ] Use static batching for static objects
- [ ] Reduce particle counts (<100 per effect)
- [ ] Compress audio to Vorbis
- [ ] Enable IL2CPP code stripping

### Input Best Practices

**Thumbstick:**
- Left: Move forward/backward, strafe
- Right: Smooth turn or snap turn

**Grip:**
- Grab objects (hold to keep)

**Trigger:**
- Interact with UI, shoot, select

**Primary/Secondary Buttons:**
- Context actions (jump, menu, toggle modes)

## Advanced Features

### Multi-Platform Build

Build for both Quest and PCVR from one .holo file:

```holoscript
export#unity_quest {
  target: "unity"
  platform: "quest"
  output_directory: "./build/quest/"
}

export#unity_pcvr {
  target: "unity"
  platform: "steamvr"
  output_directory: "./build/pcvr/"
}
```

### Custom Input Actions

Map custom controls with Unity Input System:

```holoscript
input_actions {
  jump: "primarybutton"
  crouch: "secondarybutton"
  sprint: "gripbutton"
}
```

### Physics Optimization

```holoscript
physics {
  fixed_timestep: 0.0111  // 90 Hz physics
  max_substeps: 2         // Limit for performance

  collision_detection: "discrete"  // Fastest
  // or "continuous" for fast-moving objects
}
```

### Adaptive Performance

Unity can auto-adjust quality:

```csharp
using UnityEngine.AdaptivePerformance;

void Start()
{
    var ap = Holder.Instance;
    if (ap != null && ap.Active)
    {
        ap.DevicePerformanceControl.PerformanceControlMode = PerformanceControlMode.Automatic;
    }
}
```

## Troubleshooting

### Build Fails

**Error**: "IL2CPP error"

**Fix**:
1. Project Settings > Player > Scripting Backend: IL2CPP
2. Install NDK via Unity Hub
3. Rebuild

### Controllers Not Tracked

1. Enable Oculus XR Plugin
2. Check XRController components exist
3. Verify hand: "left" or "right"

### Low FPS

1. Profile with Oculus Developer Hub
2. Check GPU time <11ms (90 FPS)
3. Reduce draw calls, shadows, particles

### Grab Not Working

1. Object has XRGrabInteractable component
2. Object has Rigidbody (Use Gravity: true)
3. Object has Collider
4. Controller has XRDirectInteractor

## Resources

- [Unity XR Toolkit Manual](https://docs.unity3d.com/Packages/com.unity.xr.interaction.toolkit@latest)
- [Quest Development Guide](https://developer.oculus.com/documentation/unity/unity-gs-overview/)
- [Quest Performance Tips](https://developer.oculus.com/resources/mobile-performance/)

---

**Platform-specific made easy.** Define once, optimize automatically for Quest or PCVR!
