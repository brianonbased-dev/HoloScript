# HoloScript Multiplayer VR Tutorial

Learn how to build networked VR experiences with HoloScript's multiplayer system.

## Key Concepts

### 1. Network Manager

```holoscript
network_manager#multiplayer @photon {
  app_id: "YOUR_PHOTON_APP_ID"
  region: "us"  // us, eu, asia, jp, etc.
  max_players_per_room: 16

  matchmaking {
    mode: "random"  // Join any available room
  }

  send_rate: 20  // Network updates per second
}
```

**Network backends**: `@photon` (Photon PUN2), `@mirror` (Unity Mirror), `@webrtc` (WebXR), `@unreal_replication`

### 2. Lobby System

```holoscript
ui#lobby_screen {
  room_list_view {
    on_room_discovered(room_info) {
      add_room_entry: {
        room_name: room_info.name
        player_count: room_info.player_count
        max_players: room_info.max_players
      }
    }

    on_room_clicked(room_id) {
      network_manager.join_room: room_id
      hide_lobby()
    }
  }

  button#quick_join {
    on_click {
      network_manager.join_random_room()
      hide_lobby()
    }
  }
}
```

**Lobby functions**:

- `join_room(id)` - Join specific room
- `join_random_room()` - Quick match
- `create_room(options)` - Create new room
- `leave_room()` - Exit to lobby

### 3. Networked Player Rig

```holoscript
player#vr_rig @networked @photon_view {
  network_id: auto  // Assigned by network
  ownership: "mine"  // This player controls this rig

  transform_sync {
    position: true
    rotation: true
    send_rate: 20  // 20 Hz
    interpolation: "lerp"
  }

  camera#head @synced {
    position: { x: 0, y: 1.7, z: 0 }

    network_sync {
      position: true
      rotation: true
    }
  }

  controller#left_hand @synced {
    hand: "left"

    network_sync {
      position: true
      rotation: true
      button_states: true  // Sync grab/trigger
    }
  }

  controller#right_hand @synced {
    hand: "right"

    network_sync {
      position: true
      rotation: true
      button_states: true
    }
  }
}
```

**What gets synced**:

- Head position/rotation (HMD tracking)
- Left/right hand position/rotation
- Button states (grab, trigger, thumbstick)
- Custom properties (health, score, etc.)

### 4. Network Ownership

```holoscript
object#cube @grabbable @networked {
  network_id: auto
  ownership: "request"  // Request from current owner

  on_grab(hand) {
    network_request_ownership: this

    on_ownership_granted {
      attach_to_hand: hand
      send_rpc: "OnObjectGrabbed", [network_id]
    }

    on_ownership_denied {
      show_message: "Someone else is holding this"
    }
  }

  on_release(hand) {
    detach_from_hand: hand
    send_rpc: "OnObjectReleased", [network_id]
  }
}
```

**Ownership modes**:

- `"mine"` - Only I can modify (my player rig)
- `"request"` - Ask current owner to transfer
- `"master_client"` - Only room master can modify
- `"shared"` - Multiple users can modify (whiteboard)
- `"scene"` - Static, no one owns it

### 5. Transform Synchronization

```holoscript
object#ball @networked {
  transform_sync {
    position: true
    rotation: true
    scale: false  // Don't sync scale

    // Send strategy
    send_rate: 20  // Updates per second
    interpolation: "lerp"  // Smooth between updates
    extrapolation: false  // Don't predict future

    // Bandwidth optimization
    position_threshold: 0.01  // Only send if moved >1cm
    rotation_threshold: 5  // Only send if rotated >5 degrees
  }
}
```

**Interpolation modes**:

- `"none"` - Teleport to new position (choppy)
- `"lerp"` - Linear interpolation (smooth)
- `"slerp"` - Spherical interpolation (for rotation)

### 6. RPCs (Remote Procedure Calls)

```holoscript
// Send RPC to all players
button#ring_bell {
  on_click {
    send_rpc_all: "PlayBellSound", []
  }
}

// Receive RPC
on_rpc("PlayBellSound", sender, params) {
  audio_source.play: "bell.wav"
}

// Send RPC to specific player
on_player_joined(player) {
  send_rpc: "ShowWelcomeMessage", player.id, ["Welcome!"]
}

// Send RPC to others (not self)
on_hit_target() {
  send_rpc_others: "ShowHitEffect", [target_position]
}
```

**RPC Best Practices**:

- Use for events, not continuous updates (use sync for that)
- Keep parameters small (<1KB)
- Don't send >30 RPCs/second per player
- Validate sender on critical RPCs

### 7. Voice Chat

```holoscript
voice_chat#player_voice @photon_voice {
  enabled: true
  codec: "opus"  // High quality, low bandwidth

  input {
    device: "default_microphone"
    sample_rate: 48000  // 48 kHz
    bitrate: 30000  // 30 kbps
  }

  spatial_audio {
    enabled: true
    min_distance: 2.0  // Full volume within 2m
    max_distance: 20.0  // Silent beyond 20m
    rolloff: "linear"  // or "logarithmic", "custom"
  }

  voice_detection {
    mode: "auto"  // Voice activation
    threshold: 0.01  // Sensitivity
  }

  // Visual feedback
  indicator {
    type: "particle_ring"
    position: { x: 0, y: 0.2, z: 0 }  // Above head
    color: #00ff00
    intensity: voice_volume  // Animated by voice
  }
}
```

**Voice modes**:

- `"auto"` - Voice activation (speaks when loud enough)
- `"push_to_talk"` - Hold button to speak
- `"always_on"` - Constantly transmitting

### 8. Shared Whiteboard

```holoscript
object#whiteboard @networked @drawable {
  network_id: "whiteboard_1"
  ownership: "shared"  // Multiple users can draw

  drawing_system {
    brush {
      size: 0.02
      color: player_color
    }

    on_draw(stroke_data) {
      apply_stroke: stroke_data

      // Send incremental stroke (efficient)
      send_rpc: "DrawStroke", [
        stroke_data.points,      // Array of positions
        stroke_data.color,       // RGB
        stroke_data.brush_size   // Float
      ]
    }

    on_erase(erase_data) {
      clear_area: erase_data.bounds
      send_rpc: "EraseArea", [erase_data.bounds]
    }
  }

  button#clear_board {
    on_click {
      if (network_is_master_client) {
        send_rpc_all: "ClearWhiteboard", []
      }
    }
  }
}
```

**Whiteboard sync strategy**:

- ✅ Send strokes as point arrays (~100 bytes each)
- ❌ Don't send full texture (~8MB) on every change
- ✅ New player joins → master sends compressed texture once
- ✅ Incremental updates for all subsequent strokes

### 9. Synchronized Video Player

```holoscript
object#video_screen @networked {
  network_id: "video_player"
  ownership: "master_client"

  material {
    video_texture {
      source: "presentation.mp4"

      playback {
        is_playing: false
        current_time: 0.0

        network_sync {
          properties: ["is_playing", "current_time"]
          sync_rate: 2  // Sync every 0.5s
        }
      }
    }
  }

  button#play_pause {
    on_click {
      is_playing = !is_playing
      send_rpc_all: "SetVideoPlayback", [is_playing, current_time]
    }
  }

  // Seek bar
  slider#progress {
    on_value_changed(progress) {
      current_time = progress * video_duration
      send_rpc_all: "SeekVideo", [current_time]
    }
  }
}
```

**Video sync challenges**:

- Network latency → players see different frames
- Solution: Master client is authoritative
- Periodic re-sync every 5s to prevent drift

### 10. Network Callbacks

```holoscript
on_connected_to_server() {
  log: "Connected to Photon"
  show_lobby()
}

on_joined_room() {
  log: "Joined room: {{ network_current_room.name }}"
  hide_lobby()
  spawn_player()
}

on_player_joined(player) {
  log: "{{ player.nickname }} joined"

  show_notification: {
    text: "{{ player.nickname }} joined the meeting"
    duration: 3
  }

  // Sync current state to new player
  if (network_is_master_client) {
    send_rpc: "SyncRoomState", player.id, [
      whiteboard.data,
      video_player.current_time
    ]
  }
}

on_player_left(player) {
  log: "{{ player.nickname }} left"

  show_notification: {
    text: "{{ player.nickname }} left the meeting"
    duration: 3
  }

  // Clean up player's objects
  destroy_player_objects: player.id
}

on_master_client_switched(new_master) {
  log: "Master client is now: {{ new_master.nickname }}"

  // Critical objects re-assign ownership
  if (network_is_master_client) {
    take_ownership: [whiteboard, video_player]
  }
}

on_disconnected(reason) {
  show_error: {
    title: "Disconnected"
    message: reason
  }

  show_lobby()
}
```

**Network lifecycle**:

1. Connect to Photon Cloud
2. Join or create room
3. Spawn player prefab (networked)
4. Sync with existing players
5. Play/interact
6. Leave room or disconnect

## Workflow

1. **Setup Network Manager** - Configure Photon/Mirror/WebRTC
2. **Create Lobby UI** - Room list, join/create buttons
3. **Define Player Rig** - VR rig with network sync
4. **Add Voice Chat** - Spatial audio for communication
5. **Create Shared Objects** - Whiteboard, video, grabbables
6. **Export & Test** - Compile to Unity, build for Quest
7. **Deploy** - Publish to App Lab or SideQuest

## Best Practices

### Bandwidth Management

- **Target**: <100 kbps per player (without voice)
- **Position updates**: 10-20 Hz
- **Rotation updates**: 10-20 Hz
- **Voice**: 20-30 kbps (Opus codec)
- **Total**: ~80 kbps per player

**Optimization**:

```holoscript
transform_sync {
  send_rate: 15  // Lower for distant players
  position_threshold: 0.02  // 2cm deadzone
  rotation_threshold: 10  // 10 degree deadzone
}
```

### Latency Compensation

- **Client-side prediction**: Move locally first, sync later
- **Interpolation**: Smooth between network updates
- **Dead reckoning**: Predict future position
- **Server authority**: Master client resolves conflicts

### Security

- **Validate RPCs**: Check sender permissions
- **Rate limiting**: Max X RPCs per second
- **Master client authority**: Critical state (scores, rules)
- **Cheat detection**: Server-side validation

```holoscript
on_rpc("SpawnObject", sender, params) {
  // Validate
  if (!sender.is_master_client) {
    log: "Unauthorized RPC from {{ sender.nickname }}"
    return
  }

  // Rate limit
  if (sender.rpc_count_this_second > 10) {
    log: "Rate limit exceeded"
    return
  }

  spawn_object: params
}
```

### Scalability

- **Room size**: 8-16 players ideal for VR
- **Zone culling**: Don't sync far objects
- **Interest management**: Only sync nearby players
- **Instancing**: Multiple rooms for >100 concurrent users

## Advanced Features

### Custom Properties (Sync Variables)

```holoscript
player#vr_rig @networked {
  // Synced properties
  health: 100
  score: 0
  player_color: #ff0000

  network_sync {
    properties: ["health", "score", "player_color"]
    sync_rate: 5  // 5 Hz (not time-critical)
  }

  on_property_changed(property_name, old_value, new_value) {
    if (property_name == "health") {
      update_health_bar: new_value
    }
  }
}
```

### Late Joiners (State Sync)

```holoscript
on_player_joined(player) {
  if (network_is_master_client) {
    // Send full room state to new player
    send_rpc: "SyncGameState", player.id, [
      current_round: 3,
      scores: all_player_scores,
      time_remaining: 120,
      whiteboard_data: whiteboard.serialize()
    ]
  }
}

on_rpc("SyncGameState", sender, params) {
  // Restore state
  current_round = params.current_round
  scores = params.scores
  time_remaining = params.time_remaining
  whiteboard.deserialize: params.whiteboard_data
}
```

### Buffered RPCs (Persistent Events)

```holoscript
// RPC persists for late joiners
send_rpc_all_buffered: "SetGameMode", ["team_deathmatch"]

// Late joiner receives this RPC on join
on_rpc("SetGameMode", sender, params) {
  game_mode = params[0]
}
```

### Reconnection Handling

```holoscript
on_disconnected(reason) {
  if (reason == "timeout") {
    attempt_reconnect: {
      max_attempts: 3
      delay: 2000  // ms

      on_reconnect_success {
        show_message: "Reconnected!"
        rejoin_previous_room()
      }

      on_reconnect_failed {
        show_error: "Connection lost"
        return_to_lobby()
      }
    }
  }
}
```

## Troubleshooting

### High Latency

- **Symptom**: Players jittery, delayed reactions
- **Cause**: Long distance to server, slow internet
- **Fix**: Select closer region, reduce `send_rate`

### Voice Cutting Out

- **Symptom**: Broken audio, robotic voice
- **Cause**: Packet loss, low bandwidth
- **Fix**: Lower voice bitrate, check WiFi signal

### Players Not Syncing

- **Symptom**: Players invisible or frozen
- **Cause**: Missing `PhotonView`, wrong `ObservedComponents`
- **Fix**: Verify prefab setup, check console errors

### Objects Stuck

- **Symptom**: Can't grab object, "ownership denied"
- **Cause**: Another player holds it, network lag
- **Fix**: Add ownership timeout, visual feedback

## Resources

- [Photon Networking Tutorial](https://doc.photonengine.com/pun/current/tutorials/pun-basics-tutorial/intro)
- [Unity Multiplayer Best Practices](https://docs.unity3d.com/Manual/UNetConcepts.html)
- [VR Multiplayer Design Patterns](https://developer.oculus.com/blog/multiplayer-best-practices-for-vr/)

---

**Multiplayer made declarative.** Define once, deploy to Photon/Mirror/WebRTC with automatic synchronization.
