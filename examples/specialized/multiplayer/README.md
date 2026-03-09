# Multiplayer VR - Collaborative Meeting Space

A comprehensive multiplayer VR example demonstrating networked collaboration with voice chat, shared whiteboards, and synchronized interactions.

## Overview

Build real-time collaborative VR experiences with HoloScript's built-in networking system. Supports up to 16 simultaneous users with spatial voice chat, shared object manipulation, and cross-platform compatibility.

**Use Cases:**

- Virtual meetings and conferences
- Remote collaboration and design reviews
- Training simulations with multiple participants
- Social VR experiences
- Multiplayer VR games

## Features

### Networking

- **Lobby System**: Create/join rooms with matchmaking
- **Auto Synchronization**: Player positions, rotations, actions
- **Ownership Transfer**: Request ownership when grabbing objects
- **Master Client**: Authoritative server for critical state
- **Reconnection**: Auto-reconnect on network interruption

### Voice Chat

- **Spatial Audio**: 3D positional voice (closer = louder)
- **Voice Detection**: Auto-detect or push-to-talk modes
- **Opus Codec**: High-quality, low-latency audio
- **Visual Indicators**: See who's speaking with particle effects

### Shared Interactions

- **Collaborative Whiteboard**: Draw together in real-time
- **Grabbable Objects**: Pick up and pass objects between players
- **Document Sharing**: Synchronized slide presentations
- **Video Playback**: Watch videos together (synced play/pause)

### Cross-Platform

- ✅ Quest 2/3 (standalone)
- ✅ PCVR (SteamVR, Oculus Link)
- ✅ WebXR (browser-based, experimental)
- ✅ Mixed reality (Quest + PCVR in same room)

## Quick Start

### 1. Compile to Unity with Photon

```bash
holoscript compile vr-meeting-space.holo --target unity --network photon --output ./build/unity/
```

**Output:**

```
build/unity/
├── Scripts/
│   ├── NetworkManager.cs
│   ├── PlayerController.cs
│   ├── VoiceChat.cs
│   └── SyncedObjects/
├── Prefabs/
│   ├── PlayerRig.prefab
│   ├── Whiteboard.prefab
│   └── NetworkManager.prefab
└── README.md
```

### 2. Setup Photon Account

1. Create free account at [Photon Engine](https://www.photonengine.com/)
2. Create a new Photon PUN2 app
3. Copy your App ID
4. Update in HoloScript or Unity:

```holoscript
network_manager#multiplayer @photon {
  app_id: "YOUR_PHOTON_APP_ID_HERE"
  region: "us"
}
```

Or in Unity:

```
Window > Photon Unity Networking > PUN Wizard
Paste App ID > Setup Project
```

### 3. Import to Unity

```bash
# 1. Open Unity 2021.3+ project
# 2. Install Photon PUN2
Window > Package Manager > My Assets > PUN 2 - FREE > Import

# 3. Install Photon Voice
Window > Package Manager > My Assets > Photon Voice 2 > Import

# 4. Copy HoloScript output
cp -r build/unity/Scripts Assets/Scripts/VRMeeting/
cp -r build/unity/Prefabs Assets/Prefabs/VRMeeting/

# 5. Drag NetworkManager prefab into scene
# 6. Press Play
```

### 4. Build for Quest

```
File > Build Settings
Platform: Android
Texture Compression: ASTC

Player Settings:
- XR Plug-in Management > Oculus
- Minimum API Level: Android 10.0 (API 29)
- Scripting Backend: IL2CPP

Build and deploy to Quest via Oculus Developer Hub or adb
```

## Network Backends

HoloScript supports multiple network backends:

### Photon (Recommended for Unity)

**Pros:**

- Free tier (20 CCU)
- Global infrastructure
- Built-in matchmaking
- Easy setup

**Cons:**

- Paid for >20 players
- Requires internet

```holoscript
network_manager @photon {
  app_id: "YOUR_APP_ID"
  max_players_per_room: 16
}
```

### Unity Mirror (Self-Hosted)

**Pros:**

- Free, open source
- Full control
- LAN support

**Cons:**

- Requires server setup
- More configuration

```holoscript
network_manager @mirror {
  transport: "kcp"  // or "telepathy", "websocket"
  max_connections: 16
}
```

### Unreal Replication (Native)

**Pros:**

- Native to Unreal
- High performance
- No external dependencies

**Cons:**

- Unreal-only

```holoscript
network_manager @unreal_replication {
  net_update_frequency: 60
  min_net_update_frequency: 2
}
```

### WebRTC (WebXR)

**Pros:**

- Browser-based
- Peer-to-peer option
- No installation

**Cons:**

- Experimental
- NAT traversal issues
- Lower player count

```holoscript
network_manager @webrtc {
  signaling_server: "wss://your-signaling.com"
  max_peers: 8
}
```

## Multiplayer Concepts

### Player Synchronization

Every player gets a networked VR rig:

```holoscript
player#vr_rig @networked {
  network_id: auto
  ownership: "mine"

  transform_sync {
    position: true
    rotation: true
    send_rate: 20  // 20 updates/sec
  }
}
```

**What's synced:**

- Head position/rotation (HMD)
- Left hand position/rotation
- Right hand position/rotation
- Button states (grab, trigger)
- Voice audio stream

### Object Ownership

When you grab an object, you request ownership:

```holoscript
on_grab(object) {
  network_request_ownership: object

  on_ownership_granted {
    attach_to_hand: object
    send_rpc: "OnObjectGrabbed", [object.network_id]
  }
}
```

**Ownership modes:**

- `"mine"` - Only owner can modify
- `"request"` - Request from current owner
- `"shared"` - Multiple users can modify (whiteboard)
- `"master_client"` - Only master client can modify

### RPCs (Remote Procedure Calls)

Call functions on all clients:

```holoscript
// Send to all
send_rpc_all: "ClearWhiteboard", []

// Send to specific player
send_rpc: "SendChatMessage", player_id, ["Hello!"]

// Send to others (not self)
send_rpc_others: "PlaySound", ["notification.wav"]
```

### State Synchronization

Sync variables across network:

```holoscript
current_page: 0  // Local value

network_sync {
  property: "current_page"
  sync_rate: 1  // Only sync on change
}

on_value_changed {
  send_rpc_all: "SetDocumentPage", [current_page]
}
```

## Voice Chat Setup

### Photon Voice

```holoscript
voice_chat#player_voice @photon_voice {
  codec: "opus"
  sample_rate: 48000
  bitrate: 30000  // 30 kbps

  spatial_audio {
    enabled: true
    min_distance: 2.0
    max_distance: 20.0
    rolloff: "linear"
  }

  voice_detection {
    mode: "auto"  // Voice activation
    threshold: 0.01
  }
}
```

**Unity Setup:**

1. Install Photon Voice 2 from Asset Store
2. Add `PhotonVoiceNetwork` component to scene
3. Add `Recorder` to player prefab
4. Add `Speaker` with `AudioSource` for 3D audio

### WebRTC Voice (WebXR)

```holoscript
voice_chat @webrtc {
  peer_connection {
    audio: true
    audio_constraints: {
      echoCancellation: true
      noiseSuppression: true
      autoGainControl: true
    }
  }
}
```

## Shared Whiteboard

The whiteboard syncs drawing strokes, not the full texture (efficient):

```holoscript
object#whiteboard @drawable {
  drawing_system {
    on_draw(stroke_data) {
      apply_stroke: stroke_data

      // Only send stroke points, not entire image
      send_rpc: "DrawStroke", [
        stroke_data.points,
        stroke_data.color,
        stroke_data.brush_size
      ]
    }
  }
}
```

**Optimization:**

- Strokes sent as point arrays
- Compressed with delta encoding
- Accumulated locally, synced incrementally
- ~100 bytes per stroke vs ~8MB for full texture

## Performance Optimization

### Bandwidth Usage

Target: <100 kbps per player (without voice)

**Optimization strategies:**

- Reduce `send_rate` for non-critical objects
- Use `interpolation` for smooth movement at lower rates
- Only sync when values change significantly
- Compress vector data (quantize floats)

```holoscript
transform_sync {
  send_rate: 10  // Reduce from 20 for distant players
  interpolation: "lerp"

  // Only send if change > threshold
  position_threshold: 0.01  // 1cm
  rotation_threshold: 5  // 5 degrees
}
```

### Network Culling

Don't sync objects far from players:

```holoscript
object#distant_object @networked {
  network_culling {
    enabled: true
    max_distance: 50  // Don't sync beyond 50m
  }
}
```

### Interest Management

Photon can cull based on player zones:

```holoscript
network_manager {
  interest_management: "zone"

  zones {
    meeting_room: { x: 0, y: 0, z: 0, radius: 10 }
    breakout_room: { x: 30, y: 0, z: 0, radius: 10 }
  }
}
```

Only sync objects in player's current zone.

## Troubleshooting

### Players not seeing each other

1. Check Photon App ID is correct
2. Verify players in same room: `Debug.Log(PhotonNetwork.CurrentRoom.Name)`
3. Check player prefab has `PhotonView` component
4. Ensure `ObservedComponents` includes `Transform` and `PlayerController`

### Voice chat not working

1. Verify microphone permissions (Quest: Settings > Apps > Your App > Permissions)
2. Check `Recorder` component attached to player
3. Ensure `Speaker` has `AudioSource` with 3D spatial blend
4. Test with `Photon Voice > Demos > Demo Voice`

### High latency

1. Select closer region in `network_manager.region`
2. Reduce `send_rate` to 10-15 Hz
3. Use `serialization_rate: 5` for less critical objects
4. Check internet connection (4G/5G on Quest)

### Objects not syncing

1. Verify object has `PhotonView` component
2. Check `ViewID` is assigned (not 0)
3. Ensure `ObservedComponents` includes the script with synced variables
4. Use `PhotonView.IsMine` to check ownership

## Advanced Features

### Teleportation with Network Sync

```holoscript
on_teleport(target_position) {
  transform.position = target_position
  send_rpc_all: "OnPlayerTeleported", [network_id, target_position]
}
```

### Custom Matchmaking

```holoscript
network_manager {
  matchmaking {
    custom_properties {
      skill_level: 5
      language: "en"
      game_mode: "meeting"
    }

    expected_properties {
      skill_level: 5
      language: "en"
    }
  }
}
```

### Persistence (Save Room State)

```holoscript
on_master_client_event {
  save_room_state: {
    whiteboard_data: whiteboard.drawing_texture.serialize()
    object_positions: collect_all_object_transforms()
  }

  // Store in Photon custom room properties
  network_set_room_property: "room_state", saved_state
}
```

## Resources

- [Photon PUN2 Documentation](https://doc.photonengine.com/pun/current/getting-started/pun-intro)
- [Photon Voice Documentation](https://doc.photonengine.com/voice/current/getting-started/voice-intro)
- [Unity Netcode Examples](https://docs-multiplayer.unity3d.com/)
- [VR Networking Best Practices](https://developer.oculus.com/documentation/unity/unity-multiplayer-networking/)

---

**Ready to connect?** Compile to Unity, add your Photon App ID, and join your first VR meeting!
