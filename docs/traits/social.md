# Social & Multiplayer Traits

> Part of the HoloScript Traits reference. Browse: [Social/Multiplayer](/traits/social) · [Web3](/traits/web3) · [All Traits](/traits/)

## Social/Multiplayer Traits

### @networked

Network synchronization.

```hsplus
object SharedCube @networked {
  sync_position: true
  sync_rotation: true
  sync_rate: 20
}
```

| Config            | Type    | Default | Description             |
| ----------------- | ------- | ------- | ----------------------- |
| `sync_position`   | boolean | true    | Sync position           |
| `sync_rotation`   | boolean | true    | Sync rotation           |
| `sync_scale`      | boolean | false   | Sync scale              |
| `sync_rate`       | number  | 20      | Updates per second      |
| `interpolation`   | boolean | true    | Smooth updates          |
| `ownership_model` | string  | 'host'  | 'host', 'any', 'sticky' |

**Events:**

- `network_spawn` - Object spawned
- `network_despawn` - Object despawned
- `network_owner_changed` - Ownership transferred

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
