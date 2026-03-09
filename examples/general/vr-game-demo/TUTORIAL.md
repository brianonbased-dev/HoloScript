# HoloScript Tutorial: Building a VR Game

Learn how to create a complete VR shooter game with HoloScript.

## Key Concepts

### 1. Game State Machine

```holoscript
game_state_machine {
  initial_state: "main_menu"

  state#main_menu {
    on_enter {
      show_menu: true
      reset_game: true
    }
  }

  state#playing {
    on_update {
      update_gameplay()
      if (player.health <= 0) {
        transition_to: "game_over"
      }
    }
  }
}
```

**Pattern**: Explicit states prevent bugs and clarify game flow.

### 2. Weapon System

```holoscript
weapon#pistol @firearm {
  stats {
    damage: 25
    fire_rate: 0.3
    magazine_size: 12
  }

  on_fire {
    if (current_ammo > 0) {
      spawn_projectile: { damage: stats.damage }
      play_audio: gunshot
      vibrate_controller: { intensity: 0.5 }
      current_ammo -= 1
    }
  }
}
```

**Key features**:

- Stats-driven design (easy balance tweaking)
- Haptic feedback for immersion
- Ammo management

### 3. Enemy AI

```holoscript
target#moving @enemy {
  health: 50

  movement {
    type: "rail"
    path: [{ x: -5, z: 20 }, { x: 5, z: 20 }]
    loop: true
  }

  on_hit {
    health -= damage
    if (health <= 0) {
      award_score: 20
      destroy: this
    }
  }
}
```

**Movement types**:

- `"rail"` - Follow predefined path
- `"hover"` - Wander within area
- `"chase"` - Follow player (AI-driven)

### 4. Spawning System

```holoscript
system#spawner {
  spawn_rate: 1.5

  spawn_wave {
    for (i = 0; i < targets_per_wave; i++) {
      target_type = weighted_random([
        { type: "basic", weight: 0.5 },
        { type: "moving", weight: 0.3 }
      ])

      spawn_target: { type: target_type }
    }
  }
}
```

**Weighted spawning**: More common enemies have higher weights.

### 5. Scoring & Combos

```holoscript
on_target_destroyed {
  award_score: base_points
  increment_combo: 1

  if (combo > 5) {
    multiplier = 1.5
    award_score: base_points * multiplier
  }
}
```

**Combo system**: Reward consecutive hits to encourage flow.

### 6. Power-Ups

```holoscript
powerup#damage_boost @temporary {
  on_collect {
    player.damage_multiplier = 2.0
    wait: 10
    player.damage_multiplier = 1.0
  }
}
```

**Temporary buffs**: Use `wait` to automatically revert after duration.

### 7. VR Controllers

```holoscript
camera#player @vr {
  controller#right_hand @weapon {
    on_trigger_press {
      current_weapon.fire()
    }

    grab_enabled: true
    on_grab(weapon) {
      current_weapon = weapon
    }
  }
}
```

**Controller mapping**:

- Trigger → Fire
- Grip → Grab weapon
- Buttons → Reload, weapon wheel

## Performance Optimization

### Object Pooling

Instead of spawning/destroying:

```holoscript
pool#projectiles {
  size: 100
  prefab: bullet

  get_bullet() {
    return pool.get_inactive()
  }

  return_bullet(bullet) {
    bullet.active = false
    pool.return(bullet)
  }
}
```

**Benefits**: 10x faster than instantiate/destroy.

### LOD (Level of Detail)

```holoscript
target#distant {
  lod {
    level_0: { model: "high.glb", distance: 10 }
    level_1: { model: "low.glb", distance: 30 }
  }
}
```

**Result**: Distant targets use simpler models.

## Best Practices

1. **90 FPS Minimum**: VR requires smooth performance
2. **Fixed Physics Rate**: Use `fixed_update` for physics
3. **Pooling**: Reuse objects instead of create/destroy
4. **Haptic Feedback**: Every interaction should vibrate controllers
5. **Audio Feedback**: Confirm player actions with sound

## Next Steps

- Add multiplayer (see docs/MULTIPLAYER.md)
- Implement procedural levels
- Create boss battles
- Add leaderboards (online sync)

---

**Pro tip**: Start simple, playtest often, add complexity gradually.
