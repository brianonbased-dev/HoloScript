# Social & Multiplayer Traits

> Part of the HoloScript Traits reference. Browse: [Social/Multiplayer](/traits/social) · [Web3](/traits/web3) · [All Traits](/traits/)

## Social/Multiplayer Traits

### @networked

Full multiplayer state synchronization with interpolation, ownership, and connection pooling. Built on the HoloScript `SyncProtocol` with WebSocket transport and delta compression.

```hsplus
object "SharedCube" @networked(
  sync_position: true,
  sync_rotation: true,
  sync_rate: 20,
  ownership_model: "any",
  interpolation: true
) {
  position: [0, 1, -3]
}
```

| Config              | Type    | Default    | Description                                             |
| ------------------- | ------- | ---------- | ------------------------------------------------------- |
| `sync_position`     | bool    | `true`     | Replicate world position.                               |
| `sync_rotation`     | bool    | `true`     | Replicate world rotation.                               |
| `sync_scale`        | bool    | `false`    | Replicate scale.                                        |
| `sync_rate`         | number  | `20`       | Network updates per second (1–120).                     |
| `interpolation`     | bool    | `true`     | Smooth position/rotation between updates.               |
| `ownership_model`   | string  | `"host"`   | `"host"` (host owns), `"any"` (grabber owns), `"sticky"` (first grabber keeps). |
| `reliable`          | bool    | `false`    | Use reliable delivery for this object's updates.        |
| `compress_state`    | bool    | `true`     | Apply delta compression before sending.                 |
| `latency_tolerance` | number  | `150`      | Max ms of lag before interpolation extrapolates.        |

**Events — Outgoing:**

| Event                  | Payload                              | Description                    |
| ---------------------- | ------------------------------------ | ------------------------------ |
| `network_spawn`        | `{ object_id, owner_id }`            | Object created on remote peer. |
| `network_despawn`      | `{ object_id }`                      | Object removed on remote peer. |
| `network_owner_changed`| `{ object_id, old_owner, new_owner }`| Ownership transferred.         |
| `network_state_update` | `{ object_id, position?, rotation? }`| State update received.         |

**Ownership example:**

```hsplus
object "Ball" @networked(ownership_model: "any") @grabbable {
  on_grab: {
    emit "request_ownership" { object_id: this.id }
  }
  on_release: {
    emit "release_ownership" { object_id: this.id }
  }
}
```

**`@host_only` modifier** — restricts event handling to the session host, useful for authoritative game logic:

```hsplus
object "ScoreManager" @networked @host_only {
  state { scores: {} }

  action add_score(player_id, points) {
    state.scores[player_id] = (state.scores[player_id] || 0) + points
    broadcast "score_updated"
  }
}
```

---

### @lobby

Lobby/room management.

```hsplus
system Lobby @lobby {
  max_players: 8
  matchmaking: true
}
```

| Config        | Type    | Default | Description       |
| ------------- | ------- | ------- | ----------------- |
| `max_players` | number  | 16      | Max room capacity |
| `matchmaking` | boolean | false   | Auto matchmaking  |
| `visible`     | boolean | true    | Publicly listed   |
| `password`    | string  | ''      | Room password     |

**Events:**

- `lobby_join` - Player joined
- `lobby_leave` - Player left
- `lobby_full` - Room at capacity

---

### @remote_presence

Avatar representation for remote users.

```hsplus
object RemotePlayer @remote_presence {
  avatar_type: 'humanoid'
  voice_enabled: true
}
```

| Config           | Type    | Default    | Description             |
| ---------------- | ------- | ---------- | ----------------------- |
| `avatar_type`    | string  | 'humanoid' | Avatar style            |
| `voice_enabled`  | boolean | true       | Enable voice            |
| `tracking_level` | string  | 'full'     | 'head', 'upper', 'full' |

---

### @spectator

Spectator mode for observers.

```hsplus
object SpectatorCam @spectator {
  can_fly: true
  follow_player: true
}
```

| Config               | Type    | Default | Description        |
| -------------------- | ------- | ------- | ------------------ |
| `can_fly`            | boolean | true    | Free movement      |
| `follow_player`      | boolean | false   | Auto-follow player |
| `visible_to_players` | boolean | false   | Show to players    |

---


## See Also
- [Web3 Traits](/traits/web3)
- [IoT Traits](/traits/iot)
- [API Reference](/api/)
