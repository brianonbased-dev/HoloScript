# HoloScript Tutorial: Building a Virtual Art Gallery

This step-by-step tutorial breaks down the `museum-exhibition.holo` example, explaining how to create immersive cultural and educational VR experiences.

## Table of Contents

1. [Gallery Environment Design](#gallery-environment-design)
2. [Multi-Language System](#multi-language-system)
3. [Interactive Artwork](#interactive-artwork)
4. [Audio Guide System](#audio-guide-system)
5. [3D Sculptures & Digital Art](#3d-sculptures--digital-art)
6. [VR Navigation Patterns](#vr-navigation-patterns)
7. [Accessibility Features](#accessibility-features)
8. [Analytics & Engagement](#analytics--engagement)

---

## 1. Gallery Environment Design

### Creating Museum Atmosphere

```holoscript
environment#gallery @indoor @museum_lighting {
  skybox: "gallery_interior_hdri"
  ambient_light: { intensity: 0.2, color: #f5f5f0 }
  fog: { density: 0.0002, color: #e8e8e0, start: 30, end: 80 }

  audio#ambient_sound @environmental {
    source: "museum_ambience.mp3"
    loop: true
    volume: 0.15
  }
}
```

**Key elements:**

- **Low ambient light** (0.2 intensity) - Museums use focused lighting, not bright overhead lights
- **Warm color** (#f5f5f0) - Slightly warm white, common in galleries
- **Subtle fog** - Adds depth and atmospheric perspective
- **Quiet ambient sound** - Footsteps echo, distant murmurs (15% volume)

### Gallery Floor & Walls

```holoscript
zone#entrance_hall @navigable {
  floor#marble @physics {
    material: "marble_white_polished"
    size: { x: 15, y: 0, z: 20 }
    collision: true

    reflection {
      enabled: true
      intensity: 0.3
      blur: 0.1
    }
  }

  walls#gallery_walls @static {
    material: "gallery_wall_white"
    height: 5
    thickness: 0.3
  }
}
```

**Design choices:**

- `@navigable` - Players can walk/teleport here
- `reflection` on floor - Polished marble reflects light and artwork
- White walls - Neutral backdrop that doesn't distract from art
- 5-meter ceiling height - Tall enough for large works, not warehouse-scale

### Museum Lighting System

```holoscript
spatial_group#ceiling_lights {
  repeat(8, x_axis, 2) {
    light#spot @museum_lighting {
      type: "spot"
      intensity: 1.5
      color: #fff5e6  // Warm white
      angle: 30
      range: 10
      cast_shadows: true
      shadow_softness: "soft"

      target: { y: 2.5, z: 6.5 }
    }
  }
}
```

**Track lighting pattern:**

- `repeat(8, x_axis, 2)` - 8 lights spaced 2 meters apart
- `angle: 30` - Narrow beam focused on wall
- `target: {y: 2.5}` - Aimed at artwork hanging height
- Warm white (#fff5e6) - Standard for museums (avoids UV damage to real art)

---

## 2. Multi-Language System

### Language Selection UI

```holoscript
object#language_selector @interactive {
  model: "info_podium.glb"

  ui#language_panel @interactive {
    grid#language_buttons {
      columns: 3
      gap: 10

      buttons: [
        { label: "English", code: "en", flag: "🇬🇧" },
        { label: "Español", code: "es", flag: "🇪🇸" },
        { label: "Français", code: "fr", flag: "🇫🇷" },
        // ... more languages
      ]

      for_each_button {
        button {
          size: { x: 120, y: 50 }
          text: "{button.flag} {button.label}"

          on_tap {
            set_language: button.code
            enable_audio_guide: true
          }
        }
      }
    }
  }
}
```

**Implementation:**

1. **Podium model** - Physical object visitors interact with
2. **Grid layout** - 3 columns of language buttons
3. **Flag emojis** - Visual recognition (🇬🇧, 🇪🇸, etc.)
4. **Tap handler** - Sets global language, enables audio guide

### Localization Pattern

```holoscript
ui#room_label @text {
  text: localize("IMPRESSIONISM_ROOM_TITLE")
  // Returns: "Impressionism: Light and Color" (en)
  // Returns: "Impresionismo: Luz y Color" (es)
  // Returns: "Impressionnisme : Lumière et Couleur" (fr)
}
```

**Localization files structure:**

```
lang/
├── en.json
├── es.json
├── fr.json
└── ...
```

**en.json:**

```json
{
  "IMPRESSIONISM_ROOM_TITLE": "Impressionism: Light and Color",
  "MONET_LILIES_DESC": "Series of approximately 250 oil paintings...",
  "PLAY_AUDIO_GUIDE": "Play Audio Guide"
}
```

---

## 3. Interactive Artwork

### Framed Painting with Metadata

```holoscript
artwork#monet_lilies @interactive @audio_guided {
  position: { x: -7, y: 2.5, z: -6.5 }
  frame_style: "ornate_gold"
  frame_size: { x: 2.5, y: 1.8, z: 0.1 }

  painting {
    texture: "monet_water_lilies.jpg"
    size: { x: 2.3, y: 1.6 }
    glossy: true  // Oil painting sheen
  }

  metadata {
    artist: "Claude Monet"
    title: "Water Lilies"
    year: "1914-1917"
    medium: "Oil on canvas"
    dimensions: "200 cm × 200 cm"
    description: localize("MONET_LILIES_DESC")
    audio_guide: "audio/monet_lilies_{language}.mp3"
  }
}
```

**Key features:**

- `position: {y: 2.5}` - Eye level (1.7m player + 0.8m offset)
- `frame_style` - Adds ornate gold frame around painting
- `glossy: true` - Simulates oil paint texture
- `metadata` - Structured data for info panels

### Dedicated Artwork Spotlight

```holoscript
light#artwork_spot @focused {
  type: "spot"
  intensity: 2.0
  color: #fff5e6
  angle: 25
  position: { y: 1, z: -1 }
  target: this  // Points at parent artwork
  cast_shadows: false  // Don't shadow the painting!
}
```

**Lighting technique:**

- `angle: 25` - Narrow beam (museum standard: 15-30°)
- `position: {y: 1, z: -1}` - Above and in front
- `target: this` - Always points at artwork, even if moved
- `cast_shadows: false` - Avoids shadows on the art itself

### Information Plaque

```holoscript
object#plaque @interactive {
  type: "plane"
  size: { x: 0.4, y: 0.25 }
  position: { x: 1.5, y: -1.2, z: 0.05 }  // Bottom-right of frame
  material: "brass_plaque"

  ui#plaque_text @small_text {
    text: "{metadata.artist}\n\"{metadata.title}\"\n{metadata.year}"
    font: "serif"
    font_size: 12
    color: #000000
    align: "center"
  }
}
```

**Positioning:**

- `x: 1.5` - To the right of artwork
- `y: -1.2` - Below the frame
- `z: 0.05` - Slightly in front of wall (avoid z-fighting)

### Proximity & Interaction

```holoscript
on_approach(distance < 2) {
  show_interaction_hint: "Tap for more information"
}

on_interact {
  show_artwork_detail_panel: this
  play_audio_guide: metadata.audio_guide
}
```

**User flow:**

1. Player walks toward artwork
2. At 2 meters: hint appears
3. Player taps/clicks artwork
4. Detail panel opens + audio guide plays

---

## 4. Audio Guide System

### Global Audio Guide Manager

```holoscript
system#audio_guide @global {
  enabled: false  // Enabled after language selection

  current_audio: null
  subtitles_enabled: true

  on_play(audio_file) {
    // Stop current audio
    if (current_audio) {
      stop_audio: current_audio
    }

    // Play new audio with language substitution
    current_audio = play_audio: {
      source: audio_file.replace("{language}", selected_language)
      volume: 0.7
      spatial: false  // Non-spatial for narration
    }

    // Load subtitles
    if (subtitles_enabled) {
      load_subtitles: audio_file.replace(".mp3", ".vtt")
      show_subtitle_panel: true
    }
  }
}
```

**Key patterns:**

- `@global` - One audio guide system for entire gallery
- Language substitution - `monet_{language}.mp3` → `monet_en.mp3`, `monet_es.mp3`
- Non-spatial audio - Narration doesn't come from artwork, it's "in your head"
- VTT subtitles - WebVTT format for synchronized text

### Audio Control UI

```holoscript
ui#audio_controls @floating @bottom {
  position: "bottom_center"
  size: { x: 400, y: 80 }
  background: #000000cc
  visible: false  // Hidden until audio plays

  text#now_playing {
    content: "🎧 {current_artwork.metadata.title} - {current_artwork.metadata.artist}"
    color: #ffffff
  }

  progress_bar#audio_progress {
    width: 380
    height: 8
    color: #4caf50
    value: audio.current_time / audio.duration
  }

  button_group#playback_controls {
    button#stop {
      icon: "stop.svg"
      on_tap { audio_guide.stop() }
    }

    button#toggle_subtitles {
      icon: subtitles_enabled ? "subtitles_on.svg" : "subtitles_off.svg"
      on_tap { toggle_subtitles: true }
    }
  }
}
```

**UI elements:**

- Progress bar updates in real-time
- Stop button ends narration
- Subtitle toggle switches between on/off

### Subtitle Panel

```holoscript
ui#subtitle_panel @floating @bottom {
  position: "bottom_center"
  offset_y: 100  // Above audio controls
  size: { x: 600, y: 100 }
  background: #000000dd
  visible: false

  text#subtitle_text {
    font_size: 18
    color: #ffffff
    align: "center"
    content: current_subtitle_text  // From VTT file
  }
}
```

**WebVTT format example:**

```
WEBVTT

00:00:00.000 --> 00:00:05.000
Claude Monet's "Water Lilies" series represents over 250 oil paintings.

00:00:05.000 --> 00:00:10.000
Created during the last thirty years of his life, the works depict Monet's flower garden at Giverny.
```

---

## 5. 3D Sculptures & Digital Art

### Interactive 3D Sculpture

```holoscript
sculpture#abstract_metal @interactive @3d_artwork {
  model: "abstract_sculpture.glb"
  scale: { x: 2, y: 2, z: 2 }

  material {
    type: "metallic"
    color: #c0c0c0
    metallic: 1.0
    roughness: 0.2
    reflectivity: 0.8
  }

  object#pedestal @static {
    type: "cylinder"
    size: { radius: 1.5, height: 1 }
    material: "white_marble"
    position: { y: -1 }

    animate {
      property: "rotation_y"
      from: 0
      to: 360
      duration: 60
      loop: true
      easing: "linear"
    }
  }

  on_interact {
    toggle_animation: pedestal.rotation
  }
}
```

**PBR Material:**

- `metallic: 1.0` - Fully metallic (not plastic)
- `roughness: 0.2` - Polished surface (0 = mirror, 1 = matte)
- `reflectivity: 0.8` - Reflects environment

**Rotating pedestal:**

- 360° rotation over 60 seconds
- User can pause/resume by tapping

### Interactive Digital Art

```holoscript
artwork#digital_interactive @interactive @digital_art {
  type: "screen"
  size: { x: 3, y: 2 }
  emissive: true
  emissive_intensity: 1.5

  shader#generative_art @animated {
    type: "fragment"
    source: "shaders/generative_art.glsl"
    uniforms: {
      time: { type: "float", value: 0, animate: true },
      color_palette: { type: "vec3[]", value: [#ff0000, #00ff00, #0000ff] },
      complexity: { type: "float", value: 0.5 }
    }

    on_frame {
      uniforms.time += delta_time
    }
  }

  ui#art_controls @contextual {
    slider#complexity {
      label: "Complexity"
      min: 0
      max: 1
      value: 0.5

      on_change {
        shader.uniforms.complexity = this.value
      }
    }

    button#randomize {
      label: "Randomize Colors"
      on_tap {
        shader.uniforms.color_palette = generate_random_palette()
      }
    }
  }
}
```

**Generative art:**

- GLSL fragment shader for real-time effects
- User-adjustable complexity slider
- Randomize button changes color palette
- `emissive: true` - Screen glows (doesn't need external light)

---

## 6. VR Navigation Patterns

### Teleportation System

```holoscript
controller#left_hand @navigation {
  model: "vr_controller_left.glb"

  teleport {
    enabled: true
    arc_color: #00ff00
    valid_surface_color: #00ff00
    invalid_surface_color: #ff0000
    max_distance: 10

    validation {
      require_navigable_zone: true
      prevent_through_walls: true
    }
  }
}
```

**Teleport validation:**

1. Player aims controller at floor
2. Arc shows trajectory (green = valid, red = invalid)
3. Reticle appears at landing spot
4. Release button → instant teleport
5. Prevents teleporting through walls or into non-navigable zones

### Smooth Locomotion (Optional)

```holoscript
controller#right_hand @interaction {
  smooth_movement {
    enabled: true
    speed: 2.0
    acceleration: 1.5
    comfort_vignette: true
  }
}
```

**Comfort vignette:**

- Darkens peripheral vision during movement
- Reduces motion sickness by 60-70%
- Only affects movement, not stationary viewing

### Desktop/Mobile Fallback

```holoscript
camera#player @vr @first_person {
  // ... VR settings ...

  fallback_mode: "first_person_walk"
  movement_speed: 2.5
  mouse_look: true
  touch_look: true  // Mobile gyroscope

  ui#crosshair @desktop_only {
    type: "sprite"
    texture: "crosshair.png"
    size: { x: 24, y: 24 }
    position: "screen_center"
  }
}
```

**Automatic fallback:**

- VR headset connected → VR mode
- Desktop browser → mouse + keyboard (WASD)
- Mobile browser → touch + gyroscope

---

## 7. Accessibility Features

### Settings Menu

```holoscript
settings {
  // Language
  supported_languages: ["en", "es", "fr", "de", "zh", "ja"]
  default_language: "en"

  // Audio
  subtitles_enabled: true
  ambient_volume: 0.15
  narration_volume: 0.7

  // Visual
  high_contrast_mode: false
  colorblind_mode: "none"
  reduce_motion: false

  // Navigation
  teleport_enabled: true
  smooth_movement_enabled: false
  comfort_vignette: true
  turn_snap_angle: 30
}
```

### High Contrast Mode

```holoscript
if (settings.high_contrast_mode) {
  walls.material = "pure_white"
  floor.material = "pure_black"
  ui.text_color = #000000
  ui.background = #ffffff
  artwork.border_width = 5
  artwork.border_color = #000000
}
```

### Colorblind Modes

```holoscript
if (settings.colorblind_mode == "protanopia") {
  // Red-blind: shift reds to orange/brown
  adjust_color_palette: "protanopia_safe"
}
```

### Reduce Motion

```holoscript
if (settings.reduce_motion) {
  // Disable animations
  disable_all_animations: true
  teleport.show_arc = false  // Instant teleport
  smooth_movement.enabled = false
}
```

---

## 8. Analytics & Engagement

### Tracking Visitor Behavior

```holoscript
on_artwork_viewed {
  track_event: {
    event: "artwork_view",
    properties: {
      artwork_id: artwork.id,
      artist: artwork.metadata.artist,
      room: current_room,
      duration: view_duration,
      audio_guide_played: audio_guide_used,
      timestamp: Date.now()
    }
  }
}
```

### Engagement Metrics

```holoscript
track_metrics: {
  // Time-based
  total_session_time: session_duration,
  time_per_room: room_durations,
  time_per_artwork: artwork_durations,

  // Interaction-based
  artworks_viewed: viewed_count,
  artworks_with_audio: audio_count,
  audio_completion_rate: completed_audio / started_audio,

  // Navigation
  teleport_count: teleport_uses,
  smooth_movement_time: smooth_move_duration,

  // Language
  selected_language: user_language,

  // Accessibility
  subtitles_used: subtitles_enabled,
  high_contrast_used: high_contrast_mode
}
```

### Popular Artwork Heatmap

```holoscript
on_frame {
  if (player.looking_at_artwork) {
    increment_heatmap: {
      artwork_id: current_artwork.id,
      gaze_position: player.gaze_target,
      duration: delta_time
    }
  }
}
```

**Heatmap uses:**

- Identify most popular artworks
- Optimize gallery layout (put popular pieces in high-traffic areas)
- A/B test different arrangements

---

## Performance Optimization

### Level of Detail (LOD)

```holoscript
sculpture#detailed_statue {
  model: "statue_high.glb"

  lod {
    level_0: { model: "statue_high.glb", distance: 5 }
    level_1: { model: "statue_medium.glb", distance: 15 }
    level_2: { model: "statue_low.glb", distance: 30 }
  }
}
```

### Texture Compression

```holoscript
painting {
  texture: "monet_lilies.jpg"
  compression: "basis_universal"  // Smaller file size, GPU-friendly
  mipmap: true  // Sharper at distance
}
```

### Occlusion Culling

```holoscript
zone#impressionism_room {
  occlusion_culling: true  // Don't render objects behind walls
  frustum_culling: true    // Don't render objects outside camera view
}
```

---

## Next Steps

Now that you understand virtual gallery creation, try:

1. **Add more art periods** - Renaissance, Baroque, Contemporary
2. **Implement curator mode** - Let users arrange their own exhibitions
3. **Add social features** - Group tours with voice chat
4. **Create AR companion app** - Museum wayfinding on phones
5. **Integrate with museum APIs** - Real collection data

### Additional Resources

- [HoloScript VR Guide](../../../docs/VR_GUIDE.md) - Complete VR features
- [Localization System](../../../docs/LOCALIZATION.md) - Multi-language support
- [Audio System](../../../docs/AUDIO.md) - Spatial and non-spatial audio
- [Museum Lighting Standards](https://www.iesna.org/) - Professional gallery lighting

## Key Concepts

| Concept             | Description                                                             |
| ------------------- | ----------------------------------------------------------------------- |
| `environment`       | Defines scene-wide atmosphere: skybox, lighting, fog, and ambient audio |
| `zone`              | A navigable region of the gallery, grouping related objects             |
| `artwork`           | A special object type for paintings, sculptures, and digital art        |
| `metadata`          | Structured data attached to artworks: artist, year, medium, description |
| `audio_guide`       | Narrated content triggered when a visitor interacts with an artwork     |
| `spatial_group`     | Repeats objects at regular intervals (e.g., ceiling lights)             |
| `on_approach`       | Event triggered when player enters a proximity radius                   |
| `localize()`        | Returns translated text based on the visitor's selected language        |
| `lod`               | Level of Detail — switches model complexity based on viewing distance   |
| `occlusion_culling` | Skips rendering of objects behind walls for better performance          |

---

## Best Practices

### Gallery Design

- Keep ceiling heights between 4–6 metres for a realistic museum feel
- Use narrow spot lights (15–30° angle) aimed at individual artworks
- Place paintings at eye level — `y: 2.5` (eye height 1.7m + 0.8m offset)
- Maintain neutral white walls so art remains the visual focus

### Performance

- Use LOD for all 3D sculptures with at least 2 detail levels
- Enable `occlusion_culling: true` on every gallery room/zone
- Compress artwork textures with Basis Universal
- Limit shadow casters to primary spot lights only

### Localization

- Use the `localize()` function for all user-facing strings
- Store translations in per-language JSON files under `lang/`
- Include at minimum English, Spanish, and French for broad coverage
- Test all audio guide filenames in all supported languages before release

### Accessibility

- Always provide subtitles when audio guide is available
- Include a high contrast mode for visitors with visual impairments
- Support both teleportation and smooth locomotion for different comfort levels
- Test with and without a VR headset (desktop/mobile fallback)

---

**Questions?** Join the HoloScript community on Discord or open an issue on GitHub.

**Happy building!** 🚀
