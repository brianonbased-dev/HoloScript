# Multiplayer Sync

Networked objects and real-time state synchronization across multiple players — from shared grabbable objects to a host-authoritative game state.

## Full Source

```holo
composition "Multiplayer Room" {
  environment {
    skybox: "sky"
    ambient_light: 0.6
    max_players: 8
  }

  // ==========================================
  // SHARED GRABBABLE BALL
  // Everyone can see it; ownership transfers on grab
  // ==========================================

  object "SharedBall" {
    @grabbable
    @throwable
    @physics
    @collidable
    @networked(sync: "position,rotation,velocity")

    position: [0, 1.5, -4]
    scale: 0.25
    color: "#00aaff"

    on_grab {
      // Request ownership — only the owner can move it
      request_ownership(this)
      this.color = local_player.color
    }

    on_release {
      release_ownership(this)
    }
  }

  // ==========================================
  // SYNCED BUTTONS (host-authoritative state)
  // ==========================================

  object "RoomManager" {
    @networked
    @host_only

    state {
      lights_on: true
      music_playing: false
      door_open: false
      visitor_count: 0
    }

    on_player_join(player) {
      state.visitor_count++
      broadcast "player_joined" with { name: player.display_name }
    }

    on_player_leave(player) {
      broadcast "player_left" with { name: player.display_name }
    }

    action toggle_lights() {
      state.lights_on = !state.lights_on
    }

    action toggle_music() {
      state.music_playing = !state.music_playing
    }

    action set_door(open) {
      state.door_open = open
    }
  }

  object "LightSwitch" {
    @clickable
    @networked(sync: "color")
    @glowing

    position: [2, 1.2, -3]
    scale: [0.1, 0.2, 0.05]

    color: "${RoomManager.state.lights_on ? '#ffff00' : '#444444'}"
    glow_color: "#ffff00"

    on_click {
      RoomManager.toggle_lights()
    }
  }

  object "RoomLight" {
    @reactive

    position: [0, 3, -4]
    visible: "${RoomManager.state.lights_on}"
    intensity: 1.5
    light_color: "#fff8e0"
  }

  // ==========================================
  // PLAYER PRESENCE — name tags above each player
  // ==========================================

  template "NameTag" {
    @billboard
    @reactive

    scale: [0.4, 0.1, 0.01]
    offset: [0, 0.3, 0]   // above the player avatar
    background: "#000000aa"
  }

  // ==========================================
  // SHARED WHITEBOARD — anyone can draw
  // ==========================================

  object "Whiteboard" {
    @drawable
    @networked(sync: "canvas_state")
    @collidable

    position: [-3, 1.5, -5]
    scale: [2, 1.5, 0.05]
    color: "#ffffff"

    on_draw(stroke) {
      // stroke is automatically synced to all players
      this.canvas_state.add_stroke(stroke)
    }

    on_clear {
      this.canvas_state.clear()
    }
  }

  object "MarkerRight" {
    @hand_tracked(hand: "right")
    @draws_on("Whiteboard")
    @glowing

    scale: 0.03
    color: "#ff0000"
    glow_color: "#ff0000"
  }

  object "ClearBoardBtn" {
    @clickable
    @glowing

    position: [-3, 0.6, -4.5]
    scale: 0.12
    color: "#ff4444"
    text: "CLEAR"

    on_click { Whiteboard.clear() }
  }

  // ==========================================
  // VISITOR COUNTER
  // ==========================================

  object "VisitorDisplay" {
    @billboard
    @reactive

    position: [0, 3.5, -4]
    text: "Visitors today: ${RoomManager.state.visitor_count}"
    font_size: 0.12
  }

  // ==========================================
  // CHAT LOG (last 5 messages)
  // ==========================================

  object "ChatLog" {
    @networked
    @billboard
    @reactive

    position: [3, 2, -4]
    scale: [1.2, 0.8, 0.01]

    state {
      messages: []
    }

    on_receive("player_joined", data) {
      this.state.messages.unshift("→ " + data.name + " joined")
      if (this.state.messages.length > 5) {
        this.state.messages.pop()
      }
    }

    on_receive("player_left", data) {
      this.state.messages.unshift("← " + data.name + " left")
      if (this.state.messages.length > 5) {
        this.state.messages.pop()
      }
    }

    text: "${state.messages.join('\n')}"
  }

  // Floor
  object "Floor" {
    @collidable
    position: [0, -0.1, -4]
    scale: [12, 0.2, 8]
    color: "#1a1a2e"
  }
}
```

## Networking Concepts

### Ownership Model

```holo
// Request exclusive write access
request_ownership(object)

// Allow others to take over
release_ownership(object)
```

Only the owner can move a `@networked` object. Other players see a read-only copy.

### `@networked` Sync Modes

```holo
@networked                            // sync all default properties
@networked(sync: "position,rotation") // sync specific properties only
@networked(sync: "state")             // sync state block only
@host_only                            // object only exists on host
```

### Host Authority

```holo
object "GameManager" {
  @networked
  @host_only   // only the host runs this logic; clients receive broadcasts

  action do_something() {
    broadcast "event_name" with { data: value }
  }
}
```

### Listening to Broadcasts

```holo
object "Listener" {
  on_receive("event_name", data) {
    // runs on all clients when host broadcasts
  }
}
```

### State Sync

```holo
object "SharedState" {
  @networked

  state {
    count: 0       // auto-synced to all players
    label: "hello"
  }
}
```

## Compile & Run

```bash
# Local test with two browser windows
holoscript preview multiplayer.holo

# Deploy to VRChat (built-in networking via UdonSharp)
holoscript compile multiplayer.holo --target vrchat

# Unity Netcode
holoscript compile multiplayer.holo --target unity
```

## Extend It

- Add voice chat zones with `@spatial_audio`
- Implement a voting system using `@host_only` tally object
- Add `@persistent` to save state across sessions

## See Also

- [Arena Game](/examples/arena-game) — full multiplayer game
- [Traits: Social & Multiplayer](/traits/social)
