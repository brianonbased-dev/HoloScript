# 3.3 Advanced Networking

Build real-time multiplayer experiences with HoloScript's networking layer.

## Networking Architecture

HoloScript's networking uses a **server-authoritative** model with client-side prediction:

```
┌──────────┐    WebSocket/WebRTC   ┌──────────────┐
│ Client A │◄─────────────────────►│  Game Server │
└──────────┘                       └──────────────┘
                                         │
┌──────────┐    WebSocket/WebRTC         │
│ Client B │◄────────────────────────────┘
└──────────┘
```

## The `@networked` Trait

```holoscript
orb player_avatar {
  @networked
  @physics
  @animated
  position: [0, 0, 0]
  rotation: [0, 0, 0]
}
```

By default, `@networked` objects sync `position`, `rotation`, and `scale` at 20Hz.

## Ownership and Authority

```holoscript
orb player_avatar {
  @networked
  ownership: "local_player"   // "local_player" | "server" | "host" | "any"
  authority: "owner"          // who can write to this object
}
```

| Ownership      | Description                                            |
| -------------- | ------------------------------------------------------ |
| `local_player` | Each player owns their own avatar                      |
| `server`       | Server has full authority (NPCs, game logic)           |
| `host`         | The host player owns the object                        |
| `any`          | First player to grab takes ownership (`@transferable`) |

## Synced Properties

Control exactly which properties are networked:

```holoscript
orb chest {
  @networked

  position: [5, 0, 2]
  is_open: false
  contents: []

  sync: {
    position:   { rate: 10, interpolate: true }
    is_open:    { rate: 0, on_change: true }   // only send on change
    contents:   { reliable: true }              // guaranteed delivery
    rotation:   false                           // don't sync
  }
}
```

## Remote Procedure Calls (RPCs)

```holoscript
orb weapon {
  @networked

  rpc "fire" {
    target: "all"         // "all" | "owner" | "server" | "others"
    reliable: false       // UDP-like (lower latency for fast updates)
    params: {
      origin:    { type: "vector3" }
      direction: { type: "vector3" }
    }

    on_call: {
      spawn_projectile: {
        position:  "$origin"
        velocity:  "$direction * 20"
        owner:     "$caller"
      }
    }
  }
}

// Call it from client:
// weapon.fire({ origin: [0, 1, 0], direction: [0, 0, 1] })
```

## Lag Compensation

```holoscript
orb projectile {
  @networked
  @physics
  ownership: "server"
  lag_compensation: true    // Server rewinds state for hit detection

  on_collision: {
    server_only: true       // Only the server processes collisions
    emit: "projectile_hit"
    value: {
      target:   "$collision.target",
      position: "$collision.point",
    }
  }
}
```

## Client-Side Prediction

```holoscript
orb player_movement {
  @networked
  ownership: "local_player"

  prediction: {
    enabled: true
    reconcile: true          // Reconcile with server state
    reconcile_threshold: 0.1 // Snap if > 0.1m off
  }

  on_input "move": {
    // Applied immediately (prediction)
    position += "$input.direction * speed * $delta_time"
  }
}
```

## Network Rooms / Sessions

```holoscript
composition "Multiplayer Arena" {
  @networked_room
  max_players: 8
  visibility: "public"

  on_player_join: {
    spawn_at: "spawn_points[$player_index % 4]"
    emit: "player_joined"
    value: { player_id: "$player.id", name: "$player.name" }
  }

  on_player_leave: {
    despawn: "$player.avatar_id"
    emit: "player_left"
  }
}
```

## Lobby System

```holoscript
state_store "lobby" {
  @networked
  @owner_only_write

  players: []
  ready_count: 0
  game_started: false
  countdown: 0
}

orb ready_button {
  @networked
  @clickable
  ownership: "local_player"

  on_click: {
    rpc "set_ready" {
      target: "server"
      reliable: true
    }
  }
}
```

## Networked Physics

```holoscript
orb physics_object {
  @networked
  @physics
  ownership: "server"

  physics_sync: {
    position:  true
    rotation:  true
    velocity:  true          // Sync velocity for prediction
    angular_velocity: true
    interpolate: true
    extrapolate: true        // Dead reckoning
  }
}
```

## Security: Server-Side Validation

```holoscript
orb score_manager {
  @networked
  ownership: "server"

  rpc "add_score" {
    target: "server"
    reliable: true
    server_only: true     // Only server processes this

    params: {
      amount: { type: "integer", min: 0, max: 100 }
    }

    on_call: {
      // Validate: was the caller near a coin?
      validate: "distance($caller.position, $coin.position) < 2.0"
      game.score[$caller.id] += "$amount"
    }
  }
}
```

## Bandwidth Optimization

```holoscript
orb crowd_npc {
  @networked
  ownership: "server"

  // Only sync to nearby players
  interest_management: {
    mode: "distance"
    radius: 20.0
  }

  // Reduce update rate when far away
  lod_sync: {
    near:   { distance: 5.0,  rate: 30 }
    mid:    { distance: 15.0, rate: 10 }
    far:    { distance: 30.0, rate: 5  }
    cull:   { distance: 50.0           }
  }
}
```

## Debugging Network Issues

```holoscript
// holoscript.config.ts
export default {
  network: {
    debug: {
      show_latency:     true,
      show_packet_loss: true,
      show_bandwidth:   true,
      simulate_lag:     50,   // ms (dev only)
      simulate_loss:    0.02, // 2% packet loss (dev only)
    },
  },
};
```

## Best Practices

- Always validate inputs on the server — never trust the client
- Use `reliable: false` for position updates (UDP-like), `reliable: true` for game events
- Implement interest management for scenes with > 20 networked objects
- Use dead reckoning (`extrapolate: true`) to reduce jitter
- Cap `max_players` at a number your server can handle (test with load simulation)

## Exercise

Build a cooperative puzzle room for 2 players:

1. Two levers that must be pulled simultaneously to open a door
2. Server validates both are pulled within 1 second of each other
3. Door opens with a networked animation
4. Score incremented for both players
5. State resets if one player lets go

```holoscript
state_store "puzzle_1" {
  @networked
  @owner_only_write: "server"

  lever_a_pulled: false
  lever_b_pulled: false
  solved: false
}

orb lever_a {
  @networked
  @grabbable
  ownership: "any"

  on_grab: {
    rpc "pull_lever" { target: "server" params: { lever: "a" } }
  }

  on_release: {
    rpc "release_lever" { target: "server" params: { lever: "a" } }
  }
}
```
