# Virtual Art Gallery - Cultural/Educational Experience

**Universal HoloScript example demonstrating immersive cultural experiences.**

## Overview

This example showcases HoloScript's capabilities for creating virtual museum and gallery experiences. Visitors can explore curated art exhibitions in VR or on their desktop, with interactive audio guides, detailed artwork information, and accessible navigation.

### Key Features

✓ **Multiple Exhibition Rooms**

- Entrance hall with language selection
- Impressionism room (paintings)
- Modern art room (3D sculptures, digital art)
- Realistic gallery lighting and ambiance

✓ **Interactive Audio Guide System**

- Multi-language narration (6 languages)
- Synchronized subtitles
- Playback controls
- Artwork metadata overlays

✓ **VR Navigation**

- Teleportation (comfort-focused)
- Smooth locomotion (optional)
- Minimap for orientation
- Desktop/mobile fallback modes

✓ **Accessibility Features**

- Subtitles for audio guides
- High contrast mode
- Colorblind-friendly options
- Motion sickness mitigation (comfort vignette)

## 🎯 Learning Objectives

After completing this example, you'll learn how to:

1. **Design spatial gallery layouts** for VR navigation
2. **Implement multi-language systems** with localization
3. **Create interactive exhibits** with metadata and audio
4. **Handle VR navigation patterns** (teleport vs. smooth movement)
5. **Optimize lighting for art presentation** (spotlights, ambient light)
6. **Build accessible cultural experiences** for diverse audiences

## Quick Start

### Compile to Your Platform

```bash
# WebXR (recommended for browser-based deployment)
holoscript compile museum-exhibition.holo --target webxr --output ./output/webxr/

# Babylon.js (high-quality rendering)
holoscript compile museum-exhibition.holo --target babylonjs --output ./output/babylon/

# Unity (Quest/PCVR)
holoscript compile museum-exhibition.holo --target unity --output ./output/unity/
```

### Run the Experience

#### WebXR (Browser - Easiest)

1. Host compiled files on web server
2. Open URL in browser (desktop or VR headset)
3. Click "Enter VR" for immersive mode, or use desktop view
4. Select language to begin tour

**Platform Support:**

- **Desktop**: Chrome, Firefox, Edge (mouse + keyboard)
- **VR**: Quest Browser, Steam VR Browser
- **Mobile**: Limited support (use AR version for mobile)

#### Babylon.js

1. Import compiled Babylon.js scene into web project
2. Add Babylon.js library (npm install @babylonjs/core)
3. Serve via web server
4. Enhanced graphics compared to WebXR

#### Unity (Quest/PCVR)

1. Import compiled C# scripts into Unity project
2. Install XR Interaction Toolkit
3. Build for Quest or PCVR
4. Best visual quality and performance

## 📖 Code Walkthrough

### Gallery Environment (Lines 19-37)

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

Creates a quiet, contemplative museum atmosphere with subtle ambient sound.

### Language Selection (Lines 84-141)

```holoscript
object#language_selector @interactive {
  ui#language_panel @interactive {
    grid#language_buttons {
      buttons: [
        { label: "English", code: "en", flag: "🇬🇧" },
        { label: "Español", code: "es", flag: "🇪🇸" },
        // ... more languages
      ]

      for_each_button {
        button {
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

Interactive podium for selecting interface and audio guide language.

### Interactive Artwork (Lines 188-255)

```holoscript
artwork#monet_lilies @interactive @audio_guided {
  position: { x: -7, y: 2.5, z: -6.5 }
  frame_style: "ornate_gold"

  painting {
    texture: "monet_water_lilies.jpg"
    glossy: true
  }

  light#artwork_spot @focused {
    type: "spot"
    intensity: 2.0
    angle: 25
    target: this
  }

  metadata {
    artist: "Claude Monet"
    title: "Water Lilies"
    year: "1914-1917"
    medium: "Oil on canvas"
    description: localize("MONET_LILIES_DESC")
    audio_guide: "audio/monet_lilies_{language}.mp3"
  }

  on_interact {
    show_artwork_detail_panel: this
    play_audio_guide: metadata.audio_guide
  }
}
```

Framed painting with dedicated spotlight and interactive audio guide.

### 3D Sculpture (Lines 489-550)

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
    material: "white_marble"

    animate {
      property: "rotation_y"
      from: 0
      to: 360
      duration: 60
      loop: true
    }
  }

  on_interact {
    toggle_animation: pedestal.rotation
  }
}
```

Metallic sculpture on rotating pedestal (user can pause/resume rotation).

### Audio Guide System (Lines 627-691)

```holoscript
system#audio_guide @global {
  on_play(audio_file) {
    current_audio = play_audio: {
      source: audio_file.replace("{language}", selected_language)
      volume: 0.7
      spatial: false
    }

    if (subtitles_enabled) {
      load_subtitles: audio_file.replace(".mp3", ".vtt")
      show_subtitle_panel: true
    }
  }
}
```

Global audio guide system with language substitution and subtitles.

### VR Navigation (Lines 800-855)

```holoscript
camera#player @vr @first_person {
  controller#left_hand @navigation {
    teleport {
      enabled: true
      arc_color: #00ff00
      max_distance: 10
      require_navigable_zone: true
    }
  }

  controller#right_hand @interaction {
    ray_interact: true
    smooth_movement {
      enabled: true
      speed: 2.0
      comfort_vignette: true
    }
  }

  fallback_mode: "first_person_walk"
  movement_speed: 2.5
  mouse_look: true
}
```

VR teleportation + smooth movement with desktop/mobile fallback.

## 🎓 Use Cases

### Museums & Galleries

- Virtual exhibitions during closures
- Preservation of fragile/inaccessible works
- Remote access for distant audiences
- Educational tours for students

### Cultural Institutions

- Heritage site virtual tours
- Archaeological site preservation
- Historical reconstruction
- Archive digitization

### Educational

- Art history courses
- Virtual field trips
- Homeschool curricula
- Accessibility for students with disabilities

### Commercial

- Art dealerships and auctions
- Trade show virtual booths
- Artist portfolio showcases
- NFT galleries

## ⚙️ Customization

### Adding New Artwork

```holoscript
artwork#new_piece @interactive @audio_guided {
  position: { x: X, y: 2.5, z: Z }
  frame_style: "ornate_gold"  // or "simple_wood", "modern_black"

  painting {
    texture: "artwork_image.jpg"
    size: { x: 2.0, y: 1.6 }
  }

  metadata {
    artist: "Artist Name"
    title: "Artwork Title"
    year: "YYYY"
    medium: "Medium type"
    description: "Artwork description"
    audio_guide: "audio/artwork_{language}.mp3"
  }

  on_interact {
    show_artwork_detail_panel: this
    play_audio_guide: metadata.audio_guide
  }
}
```

### Creating New Exhibition Rooms

```holoscript
zone#new_room @navigable @exhibition {
  position: { x: X, z: Z }

  floor#parquet @physics {
    material: "oak_parquet"
    size: { x: 20, y: 0, z: 15 }
  }

  walls @static {
    material: "gallery_wall_white"
    height: 5
  }

  // Add lighting, artwork, etc.
}
```

### Changing Gallery Theme

Update materials and lighting (lines 39-163):

```holoscript
environment#gallery @indoor @museum_lighting {
  ambient_light: { intensity: 0.3, color: #ffffff }  // Brighter, cooler
}

walls @static {
  material: "gallery_wall_black"  // Modern dark gallery
}
```

### Multi-Language Content

Update translations in your localization files:

```holoscript
// en.json
{
  "MONET_LILIES_DESC": "Series of approximately 250 oil paintings by Claude Monet...",
  "PLAY_AUDIO_GUIDE": "Play Audio Guide"
}

// es.json
{
  "MONET_LILIES_DESC": "Serie de aproximadamente 250 pinturas al óleo de Claude Monet...",
  "PLAY_AUDIO_GUIDE": "Reproducir Audioguía"
}
```

## 📊 Analytics & Engagement

Track visitor behavior:

- Most viewed artworks
- Average time per artwork
- Audio guide completion rates
- Room visitation patterns
- Language preferences

```holoscript
on_artwork_viewed {
  track_event: {
    event: "artwork_view",
    properties: {
      artwork_id: artwork.id,
      artist: artwork.metadata.artist,
      room: current_room,
      duration: view_duration,
      audio_played: audio_guide_used
    }
  }
}
```

## 🔧 Technical Details

### Performance Targets

- **WebXR**: 60 FPS on desktop, 72 FPS on Quest
- **Babylon.js**: 60 FPS with high-quality shadows and reflections
- **Unity**: 90 FPS on PCVR, 72 FPS on Quest 2

### Asset Optimization

- **Paintings**: 2K textures (1024x1024 to 2048x2048)
- **3D Models**: <20,000 triangles for sculptures
- **Audio**: MP3 128kbps for narration, 96kbps for ambient
- **Total Size**: <200 MB for complete gallery

### Lighting Best Practices

**For Paintings:**

- Spot lights at 30° angle
- Warm white (3000K - 3500K)
- Intensity: 2.0 - 2.5
- No colored gels (neutral lighting)

**For Sculptures:**

- Multiple spot lights (3-4 angles)
- Higher intensity (2.5 - 3.0)
- Cast shadows enabled
- Reflective floor for added depth

### Platform-Specific Features

**WebXR**

- ✅ Works in browser (no install)
- ✅ Desktop + VR modes
- ⚠️ Lower graphics quality
- ⚠️ Limited hand tracking

**Babylon.js**

- ✅ Advanced PBR materials
- ✅ Real-time reflections
- ✅ Better shadow quality
- ❌ Requires WebGL 2.0

**Unity**

- ✅ Highest visual fidelity
- ✅ Hand tracking on Quest
- ✅ Best performance
- ❌ Requires native build

## 🎨 Design Best Practices

### Gallery Layout

1. **Avoid Overcrowding**: 2-3 meters between artworks
2. **Clear Sightlines**: Unobstructed views from entrance
3. **Seating Areas**: Benches for contemplation
4. **Logical Flow**: Guide visitors through chronological/thematic order

### VR Comfort

- **Teleportation Default**: Less motion sickness than smooth movement
- **Comfort Vignette**: Reduce peripheral vision during movement
- **Snap Turning**: 30° increments instead of smooth rotation
- **Rest Areas**: Benches where users can pause

### Accessibility

```holoscript
settings {
  subtitles_enabled: true
  high_contrast_mode: false
  colorblind_mode: "none"  // "protanopia", "deuteranopia", "tritanopia"
  reduce_motion: false
}
```

## 📚 Further Reading

- [HoloScript VR Guide](../../../docs/VR_GUIDE.md)
- [Localization System](../../../docs/LOCALIZATION.md)
- [Audio System Documentation](../../../docs/AUDIO_GUIDE.md)
- [WebXR Specification](https://www.w3.org/TR/webxr/)
- [Museum Lighting Standards](https://www.iesna.org/)

## 🤝 Contributing

Improvements welcome! Ideas:

- Additional art periods (Renaissance, Baroque, Contemporary)
- Curator mode (arrange your own exhibitions)
- Social features (group tours, voice chat)
- AR companion app (museum wayfinding)
- Integration with museum APIs

## 📄 License

This example is provided under the MIT License. Use freely in educational and cultural projects.

---

**Built with HoloScript** - Write once, deploy everywhere. 🌐

**Perfect for**: Museums, galleries, educational institutions, cultural preservation, virtual exhibitions.
