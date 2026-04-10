# HoloScript Tutorial: Building a VR Training Simulation

This step-by-step tutorial breaks down the `workplace-safety.holo` example, explaining each concept and how to apply them to your own VR training simulations.

## Table of Contents

1. [Composition Structure](#composition-structure)
2. [Environment Setup](#environment-setup)
3. [Creating Interactive Objects](#creating-interactive-objects)
4. [Training Modules](#training-modules)
5. [Navigation & Guidance](#navigation--guidance)
6. [Progress Tracking](#progress-tracking)
7. [Completion & Certification](#completion--certification)
8. [Platform Deployment](#platform-deployment)

---

## 1. Composition Structure

Every HoloScript file starts with a `composition` - the top-level container:

```holoscript
composition "WorkplaceSafetyTraining" {
  // All your content goes here
}
```

**Why compositions?**

- Encapsulate entire experiences
- Define metadata and settings
- Enable modular design (combine multiple compositions)
- Allow cross-platform compilation

**Best practices:**

- Use descriptive names (PascalCase)
- Group related elements logically
- Comment your structure for maintainability

---

## 2. Environment Setup

### Creating the Environment

```holoscript
environment#warehouse @indoor @realistic {
  skybox: "warehouse_hdri"
  ambient_light: { intensity: 0.4, color: #e8e8e8 }
  fog: { density: 0.001, color: #d0d0d0, start: 20, end: 100 }
}
```

**Breaking it down:**

- `environment#warehouse` - Creates named environment
- `@indoor @realistic` - Traits that affect rendering (lighting, reverb)
- `skybox` - 360° background image
- `ambient_light` - Base lighting for the scene
- `fog` - Atmospheric depth effect

### Creating Zones

Zones are spatial containers for organizing content:

```holoscript
zone#training_area @navigable @safe_zone {
  floor#concrete @physics {
    material: "concrete_weathered"
    size: { x: 30, z: 40 }
    collision: true
  }

  light#overhead_lights @industrial {
    type: "directional"
    intensity: 1.2
    cast_shadows: true
  }
}
```

**Key concepts:**

- `zone` - 3D region with optional boundaries
- `@navigable` - Players can walk/teleport here
- `floor` with `@physics` - Provides collision detection
- Multiple lights for realistic illumination

---

## 3. Creating Interactive Objects

### Basic Interactive Object

```holoscript
object#wet_floor @hazard @interactive {
  type: "plane"
  texture: "wet_floor.png"
  size: { x: 2, z: 2 }
  position: { y: 0.01 }

  on_interact {
    show_popup: {
      title: "✓ Hazard Identified"
      message: "Wet floor detected. Proper response: Walk around, report to supervisor."
      award_points: 10
    }
    mark_complete: "hazard_1"
  }
}
```

**Key features:**

- `@interactive` - Makes object clickable/grabbable
- `on_interact` - Event handler for player interaction
- `show_popup` - Display feedback to player
- `award_points` - Track scoring
- `mark_complete` - Update progress tracking

### Physics-Enabled Objects

```holoscript
object#box_to_lift @physics @interactive {
  type: "cube"
  size: { x: 0.5, y: 0.5, z: 0.5 }
  material: "cardboard"
  mass: 10
  position: { y: 0.25 }

  on_grab {
    if (player.posture == "squat" && player.back_straight) {
      show_feedback: { message: "✓ Excellent! Knees bent, back straight.", color: #00ff00 }
      award_points: 20
    } else {
      show_feedback: { message: "✗ Incorrect posture.", color: #ff0000 }
      vibrate_controllers: { intensity: 0.3, duration: 0.2 }
    }
  }
}
```

**Physics properties:**

- `@physics` - Enables collision and gravity
- `mass` - Weight affects physics simulation
- `on_grab` - Event fired when player grabs object
- `player.posture` - Access player state for validation
- `vibrate_controllers` - Haptic feedback

### Nested Objects

```holoscript
object#forklift @static @industrial {
  model: "forklift.glb"
  position: { x: -10, y: 0, z: 15 }
  rotation: { y: 90 }

  // Child object inherits parent's transform
  object#forklift_warning @interactive @hazard {
    type: "plane"
    texture: "forklift_caution.png"
    position: { x: 0, y: 1.5, z: 1.5 }  // Relative to parent
    billboard: true  // Always faces player

    on_interact {
      show_tooltip: "⚠️ HAZARD: Forklift operating area. Stay clear!"
      play_audio: "warning_beep.mp3"
    }
  }
}
```

**Nesting benefits:**

- Hierarchical transforms (children move with parent)
- Logical grouping
- Easier scene management

---

## 4. Training Modules

### Module Structure

Each training module is a self-contained `zone`:

```holoscript
zone#hazard_station @training_module {
  position: { x: 5, z: 5 }

  // Module-specific objects and interactions
  object#hazard1 @interactive { /* ... */ }
  object#hazard2 @interactive { /* ... */ }

  // Module completion logic
  on_all_hazards_identified {
    mark_module_complete: "hazard_identification"
    trigger_event: "hazard_station_complete"
  }
}
```

### Conditional Interactions

```holoscript
object#blocked_exit @hazard @interactive {
  model: "emergency_door.glb"

  object#obstruction @moveable {
    model: "pallet_stack.glb"
    physics: true
  }

  on_interact {
    if (obstruction.is_moved) {
      show_popup: {
        title: "✓ Hazard Corrected"
        message: "Emergency exit cleared!"
        award_points: 15
      }
      mark_complete: "hazard_2"
    } else {
      show_hint: "Move the pallets to clear the emergency exit"
    }
  }
}
```

**Key pattern:**

- Check conditions before awarding completion
- Provide hints when conditions not met
- Use object state (`is_moved`) to track progress

### Placement Zones

```holoscript
object#target_shelf @placement_zone {
  type: "cube"
  size: { x: 1, y: 0.05, z: 1 }
  material: "highlight_platform"
  position: { x: 2, y: 1.5 }
  opacity: 0.5

  on_object_placed(box_to_lift) {
    show_popup: {
      title: "✓ Lifting Module Complete"
      message: "You've demonstrated proper lifting technique!"
    }
  }
}
```

**Use cases:**

- Sorting/organization tasks
- Assembly training
- Inventory management simulations

---

## 5. Navigation & Guidance

### Visual Path System

```holoscript
path#training_route @visual_guide {
  waypoints: [
    { x: 0, z: 0, label: "Start" },
    { x: 5, z: 5, label: "Hazard Identification" },
    { x: 15, z: 10, label: "Lifting Technique" },
    { x: -8, z: 20, label: "Emergency Response" }
  ]

  visualize_path: true
  path_color: #00ff00
  path_width: 0.3
  show_arrows: true

  for_each_waypoint {
    spawn_marker: {
      type: "holographic_arrow"
      color: #00aaff
      height: 2
      pulse: true
    }
  }
}
```

**Features:**

- Visual path line connecting waypoints
- Animated arrows showing direction
- Waypoint labels for orientation
- Customizable appearance

### AI Instructor Avatar

```holoscript
object#instructor_avatar @ai_guide @always_visible {
  model: "safety_instructor.glb"
  position: { y: 0, z: 2 }

  behavior {
    follow_player: true
    distance: 3
    face_player: true
  }

  ui#speech_bubble @contextual {
    type: "panel"
    size: { x: 2, y: 1 }
    position: "above_head"
    background: #ffffff
    opacity: 0.95
  }

  audio#narration @voice_over {
    voice: "professional_female"
    language: "en-US"
    show_subtitles: true
    subtitle_language: ["en", "es", "zh"]
  }

  script {
    on_training_start {
      say: "Welcome to Workplace Safety Training."
      wait: 3
      say: "Follow the green path to the first station."
      point_to: hazard_station
    }

    on_hazard_station_complete {
      say: "Great work! Next, let's learn proper lifting technique."
      point_to: lifting_station
    }
  }
}
```

**Key features:**

- `behavior` block defines movement AI
- `speech_bubble` for visual text
- `audio#narration` with voice synthesis
- `script` sequences instructions based on events
- Multi-language subtitle support

---

## 6. Progress Tracking

### HUD Progress Panel

```holoscript
ui#progress_hud @always_visible @top_left {
  type: "panel"
  size: { x: 300, y: 200 }
  background: #00000080  // Semi-transparent black
  border_radius: 5

  text#title {
    content: "Training Progress"
    font_size: 20
    color: #ffffff
    bold: true
    position: { x: 10, y: 10 }
  }

  progress_bar#hazards {
    label: "Hazard Identification"
    position: { x: 10, y: 50 }
    width: 280
    height: 30
    color: #ff9900
    track_completion: ["hazard_1", "hazard_2"]  // Auto-updates
  }

  text#score {
    content: "Score: {player.score} / 70"
    font_size: 16
    color: #ffff00
    update_on: "score_change"  // Live updates
  }
}
```

**UI positioning:**

- `@top_left`, `@top_right`, `@bottom_left`, `@bottom_right` - Screen corners
- Pixel positions for precise layout
- Dynamic content with `{variable}` syntax
- Auto-update triggers

### Completion Tracking

```holoscript
// In your interactive objects:
on_interact {
  mark_complete: "hazard_1"  // Mark individual task
  award_points: 10
}

// Check overall completion:
if (all_modules_complete && player.score >= 50) {
  show_completion_screen: true
}
```

---

## 7. Completion & Certification

### Certificate Generation

```holoscript
zone#exit_zone @completion {
  object#certificate_podium @interactive {
    object#certificate @document {
      type: "plane"
      texture: "certificate_template.png"

      ui#certificate_text @generated {
        text: "CERTIFICATE OF COMPLETION\n\nWorkplace Safety Training\n\n{player.name}\n\n{current_date}\n\nScore: {player.score}/70"
        font: "serif"
        font_size: 24
        align: "center"
      }
    }

    on_interact {
      if (all_modules_complete && player.score >= 50) {
        show_popup: {
          title: "🎉 Training Complete!"
          message: "Certificate saved to your profile."
          buttons: ["Download Certificate", "Retake Training", "Exit"]
        }

        on_button_click("Download Certificate") {
          export_certificate: {
            format: "PDF"
            filename: "safety_training_{player.name}_{date}.pdf"
          }
        }
      } else {
        show_popup: {
          title: "Training Incomplete"
          message: "Complete all modules with score of 50+ to earn certificate."
        }
      }
    }
  }
}
```

**Certificate features:**

- Dynamic text with player data
- Conditional display (only if passed)
- PDF export for records
- Retake option for failed attempts

### Celebration Effects

```holoscript
particle_effect#celebration @conditional {
  trigger: "training_complete"
  type: "confetti"
  duration: 5
  emit_rate: 100
  gravity: -9.8
  colors: [#ff0000, #00ff00, #0000ff, #ffff00]
  spread: 360
}
```

---

## 8. Platform Deployment

### VR Controls

```holoscript
camera#player_camera @vr @first_person {
  fov: 90
  near: 0.1
  far: 100

  controller#left_hand @interaction {
    model: "vr_controller_left.glb"
    haptic_feedback: true
    ray_interact: true
    ray_color: #00ff00
  }

  controller#right_hand @interaction {
    model: "vr_controller_right.glb"
    haptic_feedback: true
    ray_interact: true
    teleport_enabled: true
    grab_enabled: true
  }
}
```

### Desktop/Mobile Fallback

```holoscript
camera#player_camera @vr @first_person {
  // ... VR settings above ...

  // Automatically used when VR not available
  fallback_mode: "first_person_walk"
  mouse_look: true
  movement_speed: 3

  ui#crosshair @desktop_only {
    type: "sprite"
    texture: "crosshair.png"
    size: { x: 32, y: 32 }
    position: "screen_center"
  }
}
```

### Settings & Configuration

```holoscript
settings {
  // Language support
  supported_languages: ["en", "es", "zh", "fr"]
  default_language: "en"

  // Accessibility
  subtitles_enabled: true
  audio_cues: true
  colorblind_mode: "none"

  // Difficulty
  show_hints: true
  auto_progression: false
  time_limit: null

  // Analytics
  track_completion: true
  track_time_spent: true
  export_report: true
}
```

---

## Next Steps

Now that you understand the core concepts, try:

1. **Modify the example** - Change hazards, add new modules
2. **Create your own training** - Apply these patterns to your domain
3. **Explore advanced features** - Multiplayer, AI NPCs, procedural generation
4. **Deploy to multiple platforms** - Test Unity vs Unreal vs WebXR

### Additional Resources

- [HoloScript Language Reference](../../../docs/LANGUAGE_REFERENCE.md) - Complete syntax guide
- [Physics System Documentation](../../../docs/PHYSICS_GUIDE.md) - Advanced physics features
- [UI/UX Best Practices](../../../docs/UX_GUIDE.md) - Design guidelines for VR
- [Platform Deployment Guide](../../../docs/DEPLOYMENT_GUIDE.md) - Platform-specific tips

---

## Key Concepts

| Concept         | Description                                                  |
| --------------- | ------------------------------------------------------------ |
| `composition`   | Top-level container for an entire HoloScript experience      |
| `metadata`      | Declares name, author, version, platforms, and tags          |
| `object`        | A 3D entity with geometry, material, position, and behaviors |
| `behavior`      | A named script block attached to an object or system         |
| `system`        | A global controller that manages scene-wide logic            |
| `@interactive`  | Trait making an object respond to player input               |
| `@physics`      | Trait enabling gravity, collision, and rigid-body dynamics   |
| `on_interact`   | Event handler fired when player interacts with an object     |
| `mark_complete` | Flags a task as finished for progress tracking               |

---

## Best Practices

### Code Organization

- Group related objects inside named `zone` blocks for clarity
- Use descriptive IDs (`hazard_station`, `lifting_area`) not generic ones (`zone1`)
- Comment your `.holo` files — future maintainers will thank you

### Performance

- Keep texture resolutions at or below 2K for mobile VR
- Use LOD distances for objects farther than 15 metres
- Limit physics-enabled objects to under 50 simultaneously active

### Reusability

- Extract shared behaviors into named templates
- Store localized strings in a `settings` block, not inline
- Version your `.holo` files using `metadata { version: '...' }`

### Multiplayer Safety

- Validate all completion logic server-side when possible
- Use `syncToHost: true` for score-critical behaviors
- Test with two simultaneous players before releasing

---

**Questions?** Join the HoloScript community on Discord or open an issue on GitHub.

**Happy building!** 🚀
