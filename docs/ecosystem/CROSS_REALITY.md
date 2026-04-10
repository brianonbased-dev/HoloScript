# HoloScript Cross-Reality Patterns

> Bridging AR, VR, and the physical world

## Overview

Cross-reality (XR) applications span multiple devices and modalities - from fully immersive VR to see-through AR to 2D dashboards. HoloScript provides patterns for building experiences that work seamlessly across these boundaries.

## The Reality Spectrum

```
Physical  ◄────────────────────────────────────────────►  Virtual
   │                                                        │
   │  AR Overlay    AR Anchored    Mixed Reality    VR     │
   │  (HUD info)    (placed obj)   (interactive)   (full)  │
   │                                                        │
   └─ Phone AR ─── HoloLens ─── Quest Passthrough ─── VR ──┘
```

## Core Concepts

### 1. Adaptive Rendering

```holoscript
composition SharedSpace {
  // Base scene definition
  objects {
    model#machine {
      position: [0, 0, 0]
      model: "assets/machine.gltf"
    }
  }

  // Adapt to device capabilities
  @adaptive_rendering {
    vr: {
      quality: "high",
      shadows: true,
      reflections: true
    }
    ar_headset: {
      quality: "medium",
      shadows: "blob",
      occlusion: true
    }
    ar_phone: {
      quality: "low",
      shadows: false,
      lod_bias: 1
    }
    desktop: {
      quality: "ultra",
      ray_tracing: true
    }
  }
}
```

### 2. Shared Anchors

```holoscript
// Define a persistent spatial anchor
anchor#table {
  // Physical world position (set during calibration)
  @persistent_anchor(
    id: "conference_table_001",
    provider: "azure_spatial_anchors"
  )

  // Content attached to anchor
  children: [
    hologram#blueprints {
      position: [0, 0.1, 0]  // 10cm above table
      scale: 0.5
    }
  ]
}
```

### 3. Multi-Device Sync

```holoscript
composition CollaborativeReview {
  @shared_world(
    server: "wss://holoscript.io/sync",
    room: "review_session_123"
  )

  objects {
    // Synchronized across all devices
    model#product {
      @networked(
        sync: ["position", "rotation", "annotations"],
        authority: "host"
      )
    }

    // Per-user avatars
    @for_each(user in session.users) {
      avatar#${user.id} {
        @avatar_embodiment(user: user.id)
        @voice_proximity(range: 5)
      }
    }
  }
}
```

## Device-Specific Features

### VR Mode

```holoscript
@vr_mode {
  // Full immersion features
  locomotion: "teleport"
  hand_tracking: true
  haptics: true

  // Comfort settings
  vignette_on_move: true
  snap_turn: 45
}
```

### AR Passthrough

```holoscript
@ar_passthrough {
  // See-through mixed reality
  occlusion: "depth_sensor"
  lighting_estimation: true

  // Physical world integration
  plane_detection: true
  mesh_detection: true
}
```

### Mobile AR

```holoscript
@ar_phone {
  // ARCore/ARKit features
  image_tracking: ["markers/logo.png"]
  face_tracking: false

  // UI adaptations
  touch_controls: true
  ar_session_ui: true
}
```

## Pattern: Spectator Mode

Allow non-XR users to observe and interact with XR sessions:

```holoscript
composition SpectatorView {
  // Main XR experience
  @vr_mode { ... }

  // Spectator camera for streaming/recording
  camera#spectator {
    @spectator(
      follow: session.host,
      view: "third_person",
      distance: 3
    )

    // Stream to external viewers
    @streamable(
      platforms: ["twitch", "youtube"],
      quality: "1080p"
    )
  }

  // Web viewer for non-XR participants
  @web_viewer {
    controls: "orbit"
    quality: "adaptive"

    // Limited interaction
    can_annotate: true
    can_move_objects: false
  }
}
```

## Pattern: AR Data Overlay

Overlay IoT/digital twin data in AR:

```holoscript
composition ARFactoryOverlay {
  @ar_passthrough

  // Load digital twin data
  @import twin from "./factory_twin.holo"

  // AR annotations for each machine
  @for_each(machine in twin.machines) {
    overlay#${machine.id} {
      @ar_anchor(
        type: "marker",
        marker: "markers/${machine.id}.png"
      )

      // Floating status panel
      panel#status {
        position: [0, 0.5, 0]  // Above machine
        @billboard  // Always face user

        content: {
          title: machine.name
          status: machine.state.status
          metrics: [
            { label: "OEE", value: machine.oee },
            { label: "Output", value: machine.output }
          ]
        }
      }

      // Alert indicator
      @if(machine.alerts.length > 0) {
        indicator#alert {
          @glowing(color: "red", intensity: 2)
          @pulsing(frequency: 1)
        }
      }
    }
  }
}
```

## Pattern: AR-VR Bridging

Connect AR and VR users in the same space:

```holoscript
composition BridgedWorkspace {
  @shared_world

  // Define the shared coordinate system
  @world_origin(
    ar_anchor: "room_center",
    vr_origin: [0, 0, 0]
  )

  // VR user sees full virtual environment
  @for_device("vr") {
    environment {
      skybox: "studio_hdr"
      floor: true
    }
  }

  // AR user sees overlays on physical world
  @for_device("ar") {
    environment {
      skybox: "passthrough"
      floor: false  // Use physical floor
    }
  }

  objects {
    // Shared interactive object
    model#prototype {
      @networked
      @grabbable(
        vr: { hand_tracking: true },
        ar: { tap_to_place: true }
      )
    }

    // VR-only decoration
    @for_device("vr") {
      decoration#plants { ... }
    }

    // AR-only helper UI
    @for_device("ar") {
      ui#placement_guide { ... }
    }
  }
}
```

## Sync Protocols

### WebRTC for Real-Time

```holoscript
@sync_transport(
  protocol: "webrtc",
  ice_servers: ["stun:stun.l.google.com:19302"]
)
```

### WebSocket for Reliability

```holoscript
@sync_transport(
  protocol: "websocket",
  fallback: true,
  reconnect: { max_attempts: 5, backoff: "exponential" }
)
```

## Performance Optimization

### Foveated Rendering

```holoscript
@foveated_rendering(
  enabled: true,
  mode: "eye_tracked",  // or "fixed"
  inner_radius: 0.3,
  outer_falloff: 0.5
)
```

### Level of Detail

```holoscript
model#complex {
  @lod(
    levels: [
      { distance: 0, model: "high.gltf" },
      { distance: 5, model: "medium.gltf" },
      { distance: 15, model: "low.gltf" },
      { distance: 30, model: "billboard" }
    ]
  )
}
```

### Network Optimization

```holoscript
@network_optimization {
  // Reduce sync frequency for distant objects
  distance_culling: 50,
  interest_management: true,

  // Compress transform updates
  position_precision: 0.001,  // 1mm
  rotation_precision: 0.01    // ~0.5 degrees
}
```

## Best Practices

1. **Design for the lowest common denominator** - Ensure core experience works on mobile AR
2. **Use progressive enhancement** - Add features for capable devices
3. **Test on all target devices** - Performance varies wildly
4. **Handle device switching** - Users may join from different devices
5. **Provide fallback controls** - Not everyone has hand tracking

## Next Steps

- [IoT Integration](./IOT_INTEGRATION.md) - Connect physical sensors
- [Digital Twins](./DIGITAL_TWINS.md) - Synchronize real-world data
- [Robotics Guide](./ROBOTICS_GUIDE.md) - AR for robot programming

## References

- [OpenXR Specification](https://www.khronos.org/openxr/)
- [WebXR Device API](https://www.w3.org/TR/webxr/)
- [Azure Spatial Anchors](https://docs.microsoft.com/azure/spatial-anchors/)
- [ARCore](https://developers.google.com/ar)
- [ARKit](https://developer.apple.com/arkit/)
