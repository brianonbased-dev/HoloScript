# HoloScript VRChat World Tutorial

Learn how to build VRChat worlds with HoloScript, VRChat SDK3, and Udon# scripting.

## Key Concepts

### 1. VRChat World Configuration

```holoscript
vrchat_world#config @vrchat_sdk3 {
  world_name: "Social Hub - HoloScript Demo"
  author: "Your Name"
  description: "A social VRChat world"

  capacity {
    recommended: 16  // Soft cap
    maximum: 32      // Hard cap
  }

  spawn_points {
    count: 8
    spread_radius: 5  // Spawn within 5m radius
  }

  world_settings {
    allow_avatars: true
    force_avatar_scaling: false  // Allow tall/small avatars

    respawn_height: -100  // Respawn if fall below Y=-100
  }

  tags: ["social", "hangout", "music"]
}
```

**Capacity tiers:**

- 1-16: Small/Medium world
- 17-32: Large world
- 33-80: Massive world (performance intensive)

### 2. Spawn Points

```holoscript
for i in range(8) {
  object#spawn_point_{i} @vrchat_spawn {
    unity_components: ["VRC_SceneDescriptor.SpawnLocation"]

    position: {
      x: cos(i * 45) * 5,
      y: 0.5,
      z: sin(i * 45) * 5
    }

    rotation: { y: i * 45 + 180 }  // Face center

    spawn_order: i
  }
}
```

**Spawn behavior:**

- Players spawn at random spawn point
- `spawn_order` can prioritize certain spawns
- Must have at least 1 spawn point

### 3. VRChat Mirror

```holoscript
object#mirror @vrchat_mirror {
  unity_components: ["VRC_MirrorReflection"]

  type: "plane"
  size: { x: 5, y: 3 }

  material {
    shader: "vrchat/mobile/mirror"
  }

  mirror_settings {
    disable_pixel_lights: false
    reflect_layers: ["Default", "PlayerLocal", "Player"]

    custom_culling_mask: ["Water", "UI"]  // Don't reflect these
  }

  udon_behavior#mirror_toggle {
    variables {
      is_enabled: true
    }

    on_interact() {
      is_enabled = !is_enabled

      if (is_enabled) {
        enable_mirror()
      } else {
        disable_mirror()
      }
    }
  }
}
```

**Mirror layers:**

- `PlayerLocal` - Your own avatar (in mirrors)
- `Player` - Other players' avatars
- `Default` - Environment objects
- `UI` - World UI (usually excluded)

**Performance:**

- Mirrors render scene twice (expensive)
- Desktop: 1-2 mirrors OK
- Quest: 0-1 mirrors, lower resolution
- Always add toggle for low-end users

### 4. AVPro Video Player

```holoscript
object#video_screen @vrchat_video_player {
  unity_components: ["VRC_AVProVideoPlayer"]

  type: "plane"
  size: { x: 6, y: 4 }

  material {
    shader: "vrchat/mobile/unlit"
    main_texture: video_texture  // Assigned by AVPro
  }

  video_player_settings {
    use_avpro: true  // Supports YouTube/Twitch
    use_unity_video: false

    default_url: "https://www.youtube.com/watch?v=..."
    auto_play: false
    loop: true
    volume: 0.5

    audio_mode: "spatial"  // 3D positional audio
    spatial_audio_settings {
      min_distance: 5   // Full volume within 5m
      max_distance: 50  // Silent beyond 50m
      rolloff: "logarithmic"
    }
  }

  udon_behavior#video_controller {
    variables {
      current_url: ""
      is_playing: false
    }

    function play_video() {
      video_player.play()
      is_playing = true

      send_custom_network_event: "OnVideoPlayed"
    }

    function pause_video() {
      video_player.pause()
      is_playing = false

      send_custom_network_event: "OnVideoPaused"
    }

    function load_url(url) {
      current_url = url
      video_player.load_url: url

      send_custom_network_event: "OnURLChanged"
    }

    // Network sync
    on_custom_network_event("OnVideoPlayed") {
      video_player.play()
    }

    on_custom_network_event("OnVideoPaused") {
      video_player.pause()
    }

    on_custom_network_event("OnURLChanged") {
      video_player.load_url: current_url
    }
  }
}
```

**Video player types:**

- **AVPro**: YouTube, Twitch, livestreams (recommended)
- **Unity Video**: Direct MP4/WebM URLs only

**Supported platforms:**

- Desktop: Full support
- Quest: Limited (direct MP4 URLs only, no YouTube/Twitch)

### 5. Avatar Pedestals

```holoscript
object#avatar_pedestal @vrchat_avatar_pedestal {
  unity_components: ["VRC_AvatarPedestal"]

  type: "cylinder"
  size: { radius: 0.5, height: 0.2 }

  material {
    base_color: #6a5acd
    emission: #6a5acd
  }

  avatar_pedestal_settings {
    avatar_id: "avtr_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    placement: "pedestal"  // or "wall"

    scale: { x: 1, y: 1, z: 1 }
    rotation: { y: 90 }
  }

  on_interact(player) {
    switch_avatar: avatar_id
  }
}
```

**Avatar ID workflow:**

1. Upload avatar to VRChat via Unity
2. VRChat SDK > Build & Publish (Avatar)
3. Copy Avatar ID from VRChat website
4. Paste into `avatar_id` field in world

### 6. VRC_Pickup (Grabbable Objects)

```holoscript
object#ball @vrchat_pickup {
  unity_components: ["VRC_Pickup"]

  type: "sphere"
  size: { radius: 0.15 }

  material {
    base_color: #ff6347
  }

  physics {
    type: "dynamic"
    mass: 0.5
    use_gravity: true
    use_auto_hold: true  // VRChat optimization
  }

  pickup_settings {
    disallow_theft: false  // Others can take it
    exact_gun: false       // Not gun-style
    exact_grip: false      // Not exact hand pose

    allow_manipulation_when_equipped: true
    orientation: "grip"  // Natural hold

    throw_velocity_boost_min_speed: 3
    throw_velocity_boost_scale: 1.1
  }

  udon_behavior#ball_pickup {
    on_pickup() {
      // Player grabbed object
      play_sound: "pickup.wav"
      set_material_color: #00ff00
    }

    on_drop() {
      // Player released object
      set_material_color: #ff6347
    }

    on_pickup_use_down() {
      // Use button pressed (trigger)
      apply_force: { x: 0, y: 10, z: 0 }
      play_sound: "bounce.wav"
    }

    on_pickup_use_up() {
      // Use button released
    }
  }
}
```

**Pickup modes:**

- `orientation: "grip"` - Natural hand hold (most objects)
- `orientation: "gun"` - Points forward (guns, tools)

**Auto Hold:**

- `use_auto_hold: true` - Object locked to hand (no physics jitter)
- `use_auto_hold: false` - Physics-based hold (more realistic but jittery)

### 7. Portals (World Teleport)

```holoscript
object#portal @vrchat_portal {
  unity_components: ["VRC_PortalMarker"]

  type: "plane"
  size: { x: 2, y: 3 }

  material {
    shader: "vrchat/mobile/unlit"
    emission: #00ffff
  }

  portal_settings {
    target_world_id: "wrld_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    room_id: ""  // Empty = any instance
  }
}
```

**Portal behavior:**

- Players walk through to enter portal
- Prompts: "Visit [World Name]?"
- Can specify instance ID in `room_id` for specific room

### 8. Udon# Variables & Networking

```holoscript
udon_behavior#color_changer {
  program: "ColorChanger"

  // Local variables (not synced)
  variables {
    current_color: #ff0000
    click_count: 0
  }

  // Synced variables (owner → all clients)
  synced_variables {
    networked_color: #ff0000
    networked_count: 0
  }

  on_interact() {
    // Update local
    current_color = random_color()
    click_count += 1

    // Update synced (will broadcast)
    networked_color = current_color
    networked_count = click_count

    // Send update to all clients
    request_serialization()
  }

  // Receive network updates
  on_deserialization() {
    current_color = networked_color
    click_count = networked_count

    // Apply to scene
    target_object.material.color = current_color
  }
}
```

**Networking flow:**

1. Owner modifies `synced_variables`
2. Owner calls `request_serialization()`
3. Network sends data to all clients
4. All clients receive `on_deserialization()`
5. Clients apply updated values

### 9. Udon Custom Network Events (RPC)

```holoscript
udon_behavior#notification_system {
  function broadcast_notification(message) {
    // Send to all clients (including self)
    send_custom_network_event: "OnNotificationReceived", message
  }

  function send_to_player(player_id, message) {
    // Send to specific player
    send_custom_network_event_target: player_id, "OnNotificationReceived", message
  }

  // Receive network event
  on_custom_network_event("OnNotificationReceived", data) {
    show_notification: {
      text: data.message
      duration: 3
    }
  }
}
```

**Network event types:**

- `send_custom_network_event` - Send to all
- `send_custom_network_event_target` - Send to specific player
- `send_custom_network_event_owner` - Send to object owner

### 10. Udon Player Events

```holoscript
udon_behavior#player_tracker @global {
  variables {
    player_count: 0
  }

  on_player_joined(player) {
    player_count += 1
    player_name = player.display_name

    show_notification: {
      text: "{{ player_name }} joined! ({{ player_count }} total)"
      color: #00ff00
    }

    play_sound: "player_join.wav"
  }

  on_player_left(player) {
    player_count -= 1
    player_name = player.display_name

    show_notification: {
      text: "{{ player_name }} left ({{ player_count }} remaining)"
      color: #ff6600
    }
  }
}
```

**Player properties:**

- `player.display_name` - Display name
- `player.is_local` - Is this the local player?
- `player.is_master` - Is this the instance master?
- `player.is_owner` - Does this player own the object?

## Workflow

1. **Define World** - Spawn points, capacity, settings
2. **Add VRChat Features** - Mirrors, video players, portals, pedestals
3. **Create Udon Scripts** - Custom interactions, networking
4. **Optimize** - Baked lighting, LODs, Quest compatibility
5. **Export to Unity** - Compile with VRChat target
6. **Test Locally** - VRChat SDK > Build & Test
7. **Upload World** - VRChat SDK > Build & Publish
8. **Visit World** - VRChat > Worlds > Mine

## Best Practices

### World Optimization

**Desktop:**

- Baked lighting (not realtime)
- Draw calls: <1000
- Lightmap: 2048x2048
- Shadows: 2-3 dynamic lights, 80m distance

**Quest:**

- Mobile shaders only
- Draw calls: <300
- Lightmap: 512x512
- Shadows: 1 dynamic light, 30m distance
- Disable mirrors or low resolution
- No video players (or direct MP4 only)

### Udon Performance

- Minimize `on_update()` usage (runs every frame)
- Use events (`on_interact`, `on_trigger_enter`) instead
- Limit network sync rate (not every frame)
- Cache component references in `on_start()`

```holoscript
udon_behavior {
  variables {
    cached_renderer: null
  }

  on_start() {
    // Cache once
    cached_renderer = get_component: "Renderer"
  }

  on_interact() {
    // Use cache (fast)
    cached_renderer.material.color = #ff0000

    // Don't do this every frame (slow)
    // get_component: "Renderer".material.color = #ff0000
  }
}
```

### Security

**Permissions:**

- Only instance master can change video URLs (default)
- Don't expose admin-only features to all players
- Validate input in Udon scripts

**Malicious URLs:**

- Video players can load any URL (phishing risk)
- Consider whitelist of allowed domains
- Or restrict URL changes to instance master

## Advanced Features

### Trigger Zones

```holoscript
object#safe_zone @trigger {
  type: "box"
  size: { x: 10, y: 5, z: 10 }

  physics {
    trigger: true  // No collision
  }

  udon_behavior#zone_trigger {
    variables {
      players_in_zone: 0
    }

    on_trigger_enter(other) {
      if (other.tag == "Player") {
        players_in_zone += 1
        show_message: "Safe Zone! ({{ players_in_zone }} players)"
      }
    }

    on_trigger_exit(other) {
      if (other.tag == "Player") {
        players_in_zone -= 1
      }
    }
  }
}
```

### Stations (Seated Areas)

```holoscript
object#chair @vrchat_station {
  unity_components: ["VRC_Station"]

  model: "chair.glb"

  station_settings {
    seated: true
    lock_on_entry: false       // Can exit freely
    disable_station_exit: false

    sitting_pose: "sitting_idle"
  }

  on_player_seated(player) {
    show_notification: "{{ player.name }} sat down"
  }

  on_player_exited(player) {
    show_notification: "{{ player.name }} stood up"
  }
}
```

### Object Sync (Late Joiners)

```holoscript
udon_behavior#persistent_state {
  synced_variables {
    persistent_data: {}
  }

  on_player_joined(player) {
    // Late joiner receives synced state automatically
    apply_state: persistent_data
  }

  function save_state() {
    persistent_data = {
      platform_color: platform.color,
      video_url: video_player.url,
      current_time: video_player.time
    }

    request_serialization()
  }
}
```

## Troubleshooting

### Upload Fails

**Error**: "Missing VRC_SceneDescriptor"

**Fix**:

1. Create empty GameObject "VRCWorld"
2. Add component: VRC_SceneDescriptor
3. Assign spawn points

### Udon Compile Errors

Check Unity Console for:

- Syntax errors in Udon# scripts
- Missing variable declarations
- Incorrect function signatures

### Mirror Shows Black

1. Check Reflect Layers include "Player"
2. Verify shader is "vrchat/mobile/mirror"
3. Test in VRChat (not Unity)

### Video Player Not Working

1. Add AudioSource component
2. Set AudioSource to 3D Spatial
3. VRC_AVProVideoPlayer > Audio Source: (assign)
4. Test with YouTube URL in VRChat

## Resources

- [VRChat Creator Documentation](https://creators.vrchat.com/)
- [Udon# Reference](https://udonsharp.docs.vrchat.com/)
- [VRChat SDK Download](https://vrchat.com/home/download)
- [VRChat World Optimization](https://creators.vrchat.com/worlds/creating-your-first-world/#optimization)

---

**VRChat worlds made declarative.** Define once, compile to Unity with VRChat SDK + Udon#!
