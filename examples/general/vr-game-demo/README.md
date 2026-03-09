# VR Target Practice Game

**Universal HoloScript example demonstrating VR game development.**

## Overview

This example showcases HoloScript's gaming capabilities with a fast-paced VR shooter. Players shoot moving targets in a desert firing range, earning points and power-ups while managing ammo and health.

### Key Features

✓ **Physics-Based Combat**

- Realistic weapon handling (pistol, shotgun)
- Projectile physics with bullet tracers
- Hit detection with damage zones (body vs. headshot)

✓ **Enemy AI & Spawning**

- Multiple target types (static, moving, flying drones)
- Wave-based spawning system
- Difficulty scaling

✓ **Game Systems**

- Score tracking with combo multipliers
- Power-ups (health, ammo, damage boost)
- Leaderboards and high scores
- Game state machine (menu, playing, game over)

✓ **VR Interactions**

- Grab and fire weapons with controllers
- Haptic feedback for shooting
- Teleportation and standing gameplay
- Desktop/mobile fallback modes

## 🎯 Learning Objectives

After completing this example, you'll learn how to:

1. **Implement game loops** with state machines
2. **Create weapon systems** with physics and feedback
3. **Design enemy AI** with movement patterns
4. **Build scoring mechanics** with combos and bonuses
5. **Optimize VR games** for 90+ FPS performance

## Quick Start

### Compile to Your Platform

```bash
# Unity (recommended for Quest/PCVR)
holoscript compile target-practice.holo --target unity --output ./output/unity/

# Godot (open-source alternative)
holoscript compile target-practice.holo --target godot --output ./output/godot/

# VRChat (social VR world)
holoscript compile target-practice.holo --target vrchat --output ./output/vrchat/
```

### Run the Experience

#### Unity (Quest/PCVR)

1. Import compiled C# scripts into Unity project
2. Install XR Interaction Toolkit
3. Build for Quest or PCVR
4. Deploy and play

#### Godot

1. Import compiled GDScript files
2. Configure OpenXR
3. Export for VR platform

#### VRChat

1. Upload compiled world scripts
2. Publish to VRChat
3. Invite friends to play

## 📖 Code Walkthrough

### Weapon System (Lines 98-198)

```holoscript
weapon#pistol @firearm @physics {
  stats {
    damage: 25
    fire_rate: 0.3
    magazine_size: 12
    projectile_speed: 50
    accuracy: 0.95
  }

  on_fire {
    spawn_projectile: {
      type: "bullet"
      damage: stats.damage
      speed: stats.projectile_speed
    }
    play_audio: gunshot
    apply_recoil: recoil
    vibrate_controller: { intensity: 0.5 }
  }
}
```

### Target AI (Lines 278-377)

```holoscript
target#moving @enemy @moving {
  health: 50

  movement {
    type: "rail"
    speed: 2.0
    path: [{ x: -5, z: 20 }, { x: 5, z: 20 }]
    loop: true
  }

  on_hit {
    health -= damage
    if (health <= 0) {
      award_score: 20
      spawn_particle_effect: "explosion"
      destroy: this
    }
  }
}
```

### Wave Spawning (Lines 441-483)

```holoscript
system#spawner @game_system {
  spawn_rate: 1.5
  targets_per_wave: 10

  spawn_wave {
    for (i = 0; i < targets_per_wave; i++) {
      target_type = weighted_random([
        { type: "basic", weight: 0.5 },
        { type: "moving", weight: 0.3 },
        { type: "drone", weight: 0.2 }
      ])

      spawn_target: { type: target_type }
    }
    current_wave += 1
  }
}
```

### Game State Machine (Lines 619-662)

```holoscript
game_state_machine {
  state#main_menu {
    on_start_button_pressed {
      transition_to: "playing"
    }
  }

  state#playing {
    on_enter {
      enable_gameplay: true
      spawner.enabled = true
    }

    on_update {
      if (player.health <= 0) {
        transition_to: "game_over"
      }
    }
  }

  state#game_over {
    on_enter {
      calculate_final_score()
      save_high_score()
    }
  }
}
```

## 🎓 Use Cases

### Arcade & Entertainment

- VR arcades
- Home entertainment
- Party games

### Skill Training

- Reaction time training
- Hand-eye coordination
- VR shooter fundamentals

### Commercial

- Game studios prototyping
- VR demo experiences
- Trade show attractions

## ⚙️ Customization

### Adding New Weapons

```holoscript
weapon#rifle @firearm @physics {
  model: "assault_rifle.glb"

  stats {
    damage: 30
    fire_rate: 0.1  // Faster firing
    magazine_size: 30
    projectile_speed: 80
    accuracy: 0.90
  }
}
```

### Creating Custom Targets

```holoscript
target#boss @enemy @boss {
  health: 500
  scale: { x: 2, y: 2, z: 2 }

  on_destroyed {
    award_score: 500
    spawn_powerups: 5
    show_victory_screen()
  }
}
```

### Adjusting Difficulty

```holoscript
game_settings {
  difficulty_levels: {
    nightmare: {
      target_speed: 3.0,
      spawn_rate: 0.5,
      target_health: 5
    }
  }
}
```

## 📊 Performance Tips

### Optimization

- Target 90 FPS for VR comfort
- Use object pooling for projectiles
- Limit active particles to 100
- LOD for distant targets

### Graphics Settings

```holoscript
settings {
  graphics_quality: "high"
  shadow_quality: "medium"  // Shadows are expensive
  particle_quality: "high"
  antialiasing: true
  target_fps: 90
}
```

## 🔧 Technical Details

### Performance Targets

- **Quest 2**: 72-90 FPS
- **PCVR**: 90-120 FPS
- **VRChat**: 60+ FPS

### Platform-Specific Features

**Unity**

- ✅ Full XR Interaction Toolkit support
- ✅ Hand tracking on Quest Pro
- ✅ Best performance

**Godot**

- ✅ Open-source
- ✅ Cross-platform
- ⚠️ Less VR tooling

**VRChat**

- ✅ Social multiplayer built-in
- ✅ Easy sharing
- ⚠️ Performance constraints

## 📚 Further Reading

- [HoloScript Game Dev Guide](../../../docs/GAME_DEV_GUIDE.md)
- [Physics System](../../../docs/PHYSICS.md)
- [VR Best Practices](../../../docs/VR_GUIDE.md)
- [Performance Optimization](../../../docs/OPTIMIZATION.md)

## 🤝 Contributing

Improvements welcome! Ideas:

- Multiplayer co-op mode
- More weapon types
- Boss battles
- Procedural level generation

## 📄 License

MIT License - use freely in games.

---

**Built with HoloScript** - Write once, deploy everywhere. 🌐

**Perfect for**: VR arcades, game prototyping, skill training, entertainment.
