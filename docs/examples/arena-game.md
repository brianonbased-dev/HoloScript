# VR Arena Game

A complete VR battle arena in ~100 lines of HoloScript. This demonstrates templates, spawning, physics, networking, and game logic.

## Full Source

```holo
composition "Battle Arena" {
  environment {
    skybox: "arena_dark"
    ambient_light: 0.3
    gravity: -9.81
  }

  // ===================
  // TEMPLATES
  // ===================

  template "Enemy" {
    @physics
    @collidable
    @destructible
    @networked
    @glowing

    scale: 0.5
    glow_color: "#ff0000"

    state {
      health: 100
      speed: 3
      target: null
    }

    action take_damage(amount) {
      state.health -= amount
      flash_color("#ffffff", 100ms)

      if (state.health <= 0) {
        this.die()
      }
    }

    action die() {
      spawn "Explosion" at this.position
      GameManager.add_score(10)
      destroy this with { effect: "shatter" }
    }

    every 100ms {
      if (state.target) {
        move_towards(state.target.position, state.speed)
      }
    }
  }

  template "Projectile" {
    @physics
    @trigger
    @glowing

    scale: 0.1
    glow_color: "#00ffff"
    glow_intensity: 2

    lifetime: 5s

    on_trigger_enter(other) {
      if (other.has_template("Enemy")) {
        other.take_damage(25)
        destroy this
      }
    }
  }

  template "Explosion" {
    @emissive
    @spatial_audio

    color: "#ff4400"
    audio: "explosion.wav"

    on_spawn {
      animate scale from 0.1 to 2 over 200ms
      animate opacity from 1 to 0 over 500ms
      delay 500ms then destroy this
    }
  }

  // ===================
  // GAME OBJECTS
  // ===================

  object "GameManager" {
    @networked
    @host_only

    state {
      score: 0
      wave: 1
      enemies_remaining: 0
      game_active: false
    }

    action start_game() {
      state.score = 0
      state.wave = 1
      state.game_active = true
      spawn_wave()
    }

    action spawn_wave() {
      enemy_count = 3 + state.wave * 2
      state.enemies_remaining = enemy_count

      repeat enemy_count times {
        spawn "Enemy" at random_arena_position() with {
          target: get_player()
        }
      }
    }

    action add_score(points) {
      state.score += points
      state.enemies_remaining--

      if (state.enemies_remaining <= 0) {
        state.wave++
        delay 3s then spawn_wave()
      }
    }
  }

  object "PlayerGun" {
    @hand_tracked(hand: "right")
    @grabbable

    model: "blaster.glb"

    on_trigger_press {
      direction = this.forward
      spawn "Projectile" at this.muzzle_position with {
        velocity: direction * 20
      }
      play_sound("laser.wav")
      haptic_feedback("right", 0.3, 50ms)
    }
  }

  object "ScoreDisplay" {
    @billboard

    position: [0, 3, -5]

    text: "Wave: ${GameManager.state.wave}  Score: ${GameManager.state.score}"
  }

  object "StartButton" {
    @clickable
    @glowing

    position: [0, 1, -3]
    color: "#00ff00"
    text: "START"

    visible: !GameManager.state.game_active

    on_click {
      GameManager.start_game()
      this.visible = false
    }
  }

  // ===================
  // ARENA
  // ===================

  spatial_group "Arena" {
    object "Floor" {
      @collidable
      position: [0, 0, 0]
      scale: [20, 0.1, 20]
      color: "#1a1a2e"
    }

    object "Wall_N" { @collidable position: [0, 2, -10] scale: [20, 4, 0.5] }
    object "Wall_S" { @collidable position: [0, 2, 10] scale: [20, 4, 0.5] }
    object "Wall_E" { @collidable position: [10, 2, 0] scale: [0.5, 4, 20] }
    object "Wall_W" { @collidable position: [-10, 2, 0] scale: [0.5, 4, 20] }
  }

  // ===================
  // UTILITY FUNCTIONS
  // ===================

  function random_arena_position() {
    return [
      random(-8, 8),
      0.5,
      random(-8, 8)
    ]
  }
}
```

## Features Demonstrated

| Feature          | Where                                     |
| ---------------- | ----------------------------------------- |
| Templates        | `Enemy`, `Projectile`, `Explosion`        |
| Physics          | Enemy movement, projectile velocity       |
| Networking       | `@networked`, `@host_only` on GameManager |
| State management | Score, wave, health tracking              |
| Spawning         | Dynamic enemy and projectile creation     |
| VR input         | Hand tracking, trigger press, haptics     |
| Audio            | Spatial audio on weapons and explosions   |
| Reactive UI      | Score display updates automatically       |

## Breakdown

### 1. Templates Define Reusable Objects

```holo
template "Enemy" {
  state { health: 100 }
  action take_damage(amount) { ... }
}
```

### 2. GameManager Controls State

```holo
object "GameManager" {
  @networked
  @host_only

  state { score: 0, wave: 1 }
  action start_game() { ... }
}
```

### 3. VR Hand Tracking for Weapons

```holo
object "PlayerGun" {
  @hand_tracked(hand: "right")

  on_trigger_press {
    spawn "Projectile" at this.muzzle_position
  }
}
```

### 4. Reactive UI

```holo
object "ScoreDisplay" {
  text: "Score: ${GameManager.state.score}"
  // Auto-updates when score changes!
}
```

## Compile & Deploy

```bash
# Preview locally
holoscript preview arena.holo

# Compile to VRChat
holoscript compile arena.holo --target vrchat

# Compile to Unity
holoscript compile arena.holo --target unity
```

## Extend It

Ideas to add:

- Power-ups (health, speed, multi-shot)
- Different enemy types
- Boss waves every 5 levels
- Leaderboard with `@persistent`
- Co-op multiplayer
