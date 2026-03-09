# VRChat World - Social Hub

A comprehensive VRChat world example demonstrating VRChat SDK3, Udon# scripting, and social VR features like mirrors, video players, and portals.

## Overview

Build complete VRChat worlds with HoloScript, automatically generating Unity projects with VRChat SDK3 and Udon# scripts for custom behaviors.

**Features:**

- VRChat mirrors (desktop/VR toggleable)
- AVPro video players (YouTube/Twitch support)
- Avatar pedestals
- VRC_Pickup objects (physics-synced)
- Portals to other worlds
- Udon# scripts for custom interactions
- Networked multiplayer (up to 32 players)

## Quick Start

### 1. Prerequisites

**VRChat Account:**

- Create account at [VRChat.com](https://vrchat.com)
- Complete Trust & Safety tutorial in-game
- Reach "New User" rank (required for world uploads)

**Unity Setup:**

- Unity 2022.3.6f1 (VRChat-approved version, **EXACT VERSION REQUIRED**)
- VRChat SDK3 - Worlds
- UdonSharp (optional but recommended)

### 2. Compile to VRChat

```bash
holoscript compile social-hub-world.holo --target vrchat --output ./build/vrchat/
```

**Output:**

```
build/vrchat/
├── Assets/
│   ├── Scripts/
│   │   └── Udon/
│   │       ├── MirrorToggle.cs
│   │       ├── VideoPlayerController.cs
│   │       ├── ColorChanger.cs
│   │       └── PlayerEventsGlobal.cs
│   ├── Prefabs/
│   │   ├── Mirror.prefab
│   │   ├── VideoPlayer.prefab
│   │   ├── AvatarPedestal.prefab
│   │   └── Portal.prefab
│   ├── Scenes/
│   │   └── SocialHub.unity
│   └── Materials/
└── README.md
```

### 3. Unity Project Setup

**Step-by-step:**

1. **Install Unity Hub** and Unity 2022.3.6f1 (EXACT version)

2. **Create VRChat Project:**

   ```
   Unity Hub > New Project
   Template: 3D
   Unity Version: 2022.3.6f1
   Project Name: VRChatSocialHub
   ```

3. **Import VRChat SDK:**
   - Download VRChat SDK3 from [VRChat Creator Companion](https://vrchat.com/home/download)
   - Or use VCC (recommended): Install Creator Companion → Create Project → Import SDK

4. **Import HoloScript Output:**

   ```bash
   cp -r build/vrchat/Assets/* YourProject/Assets/VRChatWorld/
   ```

5. **Open Scene:**

   ```
   Assets/Scenes/SocialHub.unity
   ```

6. **Configure VRC Scene Descriptor:**
   - Find `VRCWorld` GameObject in Hierarchy
   - Inspector > VRC Scene Descriptor
   - Set spawn points, capacity, etc.

### 4. Test Locally

```
VRChat SDK > Build & Test > Last Build
```

- Launches VRChat in test mode
- Can walk around world locally
- Test mirrors, video players, pickups

### 5. Upload to VRChat

```
1. VRChat SDK > Show Control Panel
2. Authentication > Sign in with VRChat account
3. Builder tab > Build & Publish for Windows
4. Fill in world details:
   - Name: "Social Hub"
   - Description: "A HoloScript-generated social VR world"
   - Capacity: 32
   - Tags: social, hangout
   - Content Warnings: (none)
   - Thumbnail: (upload image)

5. Click "Upload"
6. Wait for upload to complete (~5-10 minutes)
7. World is now live on VRChat!
```

**Access your world:**

- VRChat > Menu > Worlds > Mine
- Select "Social Hub"
- Create Instance (Public, Friends+, Invite Only)

## VRChat Features

### Mirrors

VRChat mirrors reflect avatars and environment:

```holoscript
object#mirror @vrchat_mirror {
  unity_components: ["VRC_MirrorReflection"]

  mirror_settings {
    reflect_layers: ["Default", "PlayerLocal", "Player"]
    disable_pixel_lights: false
  }

  udon_behavior#mirror_toggle {
    on_interact() {
      toggle_mirror()
    }
  }
}
```

**Performance:**

- Mirrors are expensive (render scene twice)
- Add toggle button for low-end PCs/Quest
- Desktop: High quality
- Quest: Lower quality or disabled

### AVPro Video Players

Stream YouTube/Twitch/direct video URLs:

```holoscript
object#video_screen @vrchat_video_player {
  unity_components: ["VRC_AVProVideoPlayer"]

  video_player_settings {
    use_avpro: true  // AVPro supports livestreams
    default_url: "https://www.youtube.com/watch?v=..."
    auto_play: false
    loop: true

    audio_mode: "spatial"  // 3D audio
  }

  udon_behavior#video_controller {
    function load_url(url) {
      video_player.load_url: url
      send_custom_network_event: "OnURLChanged"
    }
  }
}
```

**Supported URLs:**

- YouTube: `https://www.youtube.com/watch?v=VIDEO_ID`
- Twitch: `https://www.twitch.tv/CHANNEL`
- Direct: `https://example.com/video.mp4`

**Permissions:**

- Only instance owner can change URL (default)
- Or set `allow_url_change: "anyone"` (risky)

### Avatar Pedestals

Let players try different avatars:

```holoscript
object#avatar_pedestal @vrchat_avatar_pedestal {
  unity_components: ["VRC_AvatarPedestal"]

  avatar_pedestal_settings {
    avatar_id: "avtr_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    placement: "pedestal"
  }

  on_interact(player) {
    switch_avatar: avatar_id
  }
}
```

**Setup:**

1. Upload avatar to VRChat first
2. Get Avatar ID from VRChat SDK
3. Paste ID into `avatar_id` field

### Pickups (VRC_Pickup)

Physics objects players can grab and throw:

```holoscript
object#ball @vrchat_pickup {
  unity_components: ["VRC_Pickup"]

  physics {
    type: "dynamic"
    mass: 0.5
    use_auto_hold: true  // VRChat-specific
  }

  pickup_settings {
    disallow_theft: false  // Others can steal it
    exact_gun: false  // Hand attachment, not gun
    orientation: "grip"

    throw_velocity_boost_scale: 1.1
  }

  udon_behavior#ball_pickup {
    on_pickup() {
      play_sound: "pickup.wav"
    }

    on_pickup_use_down() {
      // Use button pressed (trigger on controller)
      apply_force: { x: 0, y: 10, z: 0 }
    }
  }
}
```

**Pickup modes:**

- `orientation: "grip"` - Natural hand hold
- `orientation: "gun"` - Points forward like a gun

### Portals

Teleport to other VRChat worlds:

```holoscript
object#portal @vrchat_portal {
  unity_components: ["VRC_PortalMarker"]

  portal_settings {
    target_world_id: "wrld_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    room_id: ""  // Any instance
  }
}
```

**Get World ID:**

1. Open target world in VRChat
2. Menu > World Info > Copy World ID
3. Paste into `target_world_id`

## Udon# Scripting

### Udon Basics

Udon is VRChat's scripting system (sandboxed C#):

```holoscript
udon_behavior#color_changer {
  program: "ColorChanger"

  variables {
    current_color: #ff0000
    target_object: null
  }

  synced_variables {
    networked_color: #ff0000  // Synced across all players
  }

  on_interact() {
    // Change color locally
    current_color = random_color()
    networked_color = current_color

    // Sync to network
    request_serialization()
  }

  on_deserialization() {
    // Receive network update
    current_color = networked_color
    target_object.material.color = current_color
  }
}
```

**Key concepts:**

- `variables`: Local only
- `synced_variables`: Networked (owner → all clients)
- `request_serialization()`: Send update to network
- `on_deserialization()`: Receive network update

### Udon Events

**VRChat-specific events:**

```holoscript
udon_behavior {
  on_player_joined(player) {
    // New player joined instance
    player_name = player.display_name
    show_notification: "{{ player_name }} joined!"
  }

  on_player_left(player) {
    // Player left instance
  }

  on_owner_transferred_to(player) {
    // Ownership of this object transferred
  }

  on_interact() {
    // Player clicked/triggered this object
  }

  on_trigger_enter(other) {
    // Physics trigger zone entered
  }
}
```

### Network Events (RPC)

Send events across network:

```holoscript
udon_behavior {
  function broadcast_message(message) {
    send_custom_network_event: "OnMessageReceived", message
  }

  on_custom_network_event("OnMessageReceived", data) {
    show_notification: data.message
  }
}
```

**Network modes:**

- `send_custom_network_event` - Send to all clients
- `send_custom_network_event_target` - Send to specific player
- `send_custom_network_event_owner` - Send to object owner

## World Optimization

### Performance Targets

**Desktop VR:**

- Target: 90 FPS
- Draw Calls: <1000
- Lightmap Resolution: 2048x2048
- Shadow Distance: 80m

**Quest:**

- Target: 72 FPS
- Draw Calls: <300
- Lightmap Resolution: 512x512
- Shadow Distance: 30m
- Mobile shaders only

### Optimization Checklist

- [ ] Use baked lighting (not realtime)
- [ ] Compress textures (ASTC for Quest, DXT for PC)
- [ ] Enable occlusion culling
- [ ] Limit dynamic shadows to 2-3 lights
- [ ] Use LODs for complex models
- [ ] Keep polycount <100k triangles (Quest)
- [ ] Audio: Compress to Vorbis
- [ ] Mirrors: Toggle-able, reflect limited layers
- [ ] Video players: Max 2 per world
- [ ] Pickups: Use `use_auto_hold` for physics optimization

### VRChat SDK Validation

Before upload:

```
VRChat SDK > Validation
- Checks: All green checkmarks
- Warnings: Review and fix (yellow)
- Errors: MUST fix before upload (red)
```

**Common issues:**

- Missing audio sources on video players
- Unassigned spawn points
- Shader not VRChat-compatible
- Texture size >2048x2048

## Troubleshooting

### World Won't Upload

**Error**: "Missing VRC Scene Descriptor"

**Fix**:

1. Ensure `VRCWorld` GameObject exists in scene
2. Has `VRC_SceneDescriptor` component
3. Spawn points assigned

### Mirror Not Working

1. Check `VRC_MirrorReflection` component exists
2. Verify Reflect Layers include "Player" and "PlayerLocal"
3. Test in VRChat (not Unity Play Mode)

### Video Player No Audio

1. Add `AudioSource` component to video player object
2. Set to 3D Spatial Blend
3. VRC_AVProVideoPlayer > Audio Source: (assign)

### Udon Script Errors

1. Check for typos in variable names
2. Ensure `request_serialization()` called after synced variable change
3. Verify `send_custom_network_event` has matching `on_custom_network_event`
4. Check Unity Console for Udon compile errors

### Quest Performance Issues

1. Switch to mobile shaders
2. Reduce lightmap resolution to 512
3. Disable mirrors on Quest (platform-specific)
4. Limit particle effects
5. Use VRChat SDK > Build & Test for Quest

## Advanced Features

### Station (Seated Interaction)

```holoscript
object#chair @vrchat_station {
  unity_components: ["VRC_Station"]

  station_settings {
    seated: true
    lock_on_entry: false
    disable_station_exit: false

    sitting_pose: "sitting_idle"
    standing_pose: "standing_idle"
  }

  on_player_seated(player) {
    show_notification: "{{ player.name }} sat down"
  }
}
```

### Object Pool (Spawn System)

```holoscript
udon_behavior#object_spawner {
  program: "ObjectPoolSpawner"

  variables {
    prefab: ball_prefab
    max_objects: 10
    current_count: 0
  }

  function spawn_object() {
    if (current_count < max_objects) {
      instance = instantiate: prefab
      current_count += 1
    }
  }
}
```

### Trigger Zone

```holoscript
object#safe_zone @trigger {
  physics {
    trigger: true
  }

  udon_behavior#zone_trigger {
    on_trigger_enter(other) {
      if (other.tag == "Player") {
        show_message: "Safe Zone!"
      }
    }
  }
}
```

## Resources

- [VRChat Creator Docs](https://creators.vrchat.com/)
- [Udon Documentation](https://udonsharp.docs.vrchat.com/)
- [VRChat SDK Download](https://vrchat.com/home/download)
- [VRChat Creator Companion](https://vcc.docs.vrchat.com/)
- [VRChat Optimization Tips](https://creators.vrchat.com/worlds/creating-your-first-world/#optimization)

---

**Ready to build social VR?** Compile to VRChat, upload your world, and invite friends!
