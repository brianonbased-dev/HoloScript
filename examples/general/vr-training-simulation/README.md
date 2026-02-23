# VR Training Simulation - Workplace Safety

**Universal HoloScript example demonstrating corporate training use cases.**

## Overview

This example showcases HoloScript's capabilities for creating professional VR training simulations. It demonstrates a complete workplace safety training program that can be deployed across multiple platforms without code changes.

### Key Features

✓ **Interactive Training Modules**
- Hazard identification challenges
- Proper lifting technique demonstrations
- Emergency response procedures

✓ **Guided Learning Experience**
- AI instructor avatar with voice narration
- Visual path guidance with waypoint markers
- Real-time progress tracking with HUD

✓ **Accessibility**
- Multi-language support (6 languages)
- Subtitles and audio descriptions
- Colorblind modes
- Desktop/mobile fallback for non-VR users

✓ **Completion Tracking**
- Points-based scoring system
- Downloadable PDF certificates
- Analytics and reporting

## 🎯 Learning Objectives

After completing this example, you'll learn how to:

1. **Structure training simulations** with zones and modules
2. **Create interactive objects** with collision, physics, and behaviors
3. **Implement guided navigation** with waypoints and visual paths
4. **Build UI overlays** for progress tracking and feedback
5. **Add audio/visual effects** for immersive experiences
6. **Export to multiple platforms** from a single HoloScript file

## Quick Start

### Compile to Your Platform

```bash
# Unity (recommended for Quest/PCVR)
holoscript compile workplace-safety.holo --target unity --output ./output/unity/

# Unreal Engine (high-fidelity visuals)
holoscript compile workplace-safety.holo --target unreal --output ./output/unreal/

# WebXR (browser-based, no headset required)
holoscript compile workplace-safety.holo --target webxr --output ./output/webxr/

# Godot (open-source alternative)
holoscript compile workplace-safety.holo --target godot --output ./output/godot/
```

### Run the Experience

#### Unity (Quest/PCVR)
1. Import compiled scripts into Unity project
2. Ensure XR Interaction Toolkit is installed
3. Build for your target VR platform (Quest, PCVR, etc.)
4. Deploy to headset

#### Unreal Engine
1. Import compiled C++ files into Unreal project
2. Enable VR plugins (OpenXR, SteamVR)
3. Package for VR platform
4. Deploy

#### WebXR (Browser)
1. Host compiled HTML/JS files on web server
2. Open in WebXR-compatible browser (Chrome, Firefox)
3. Click "Enter VR" button
4. Use headset or desktop/mobile fallback mode

#### Godot
1. Import compiled GDScript files into Godot project
2. Configure OpenXR settings
3. Export for target platform
4. Deploy

## 📖 Code Walkthrough

### Environment Setup (Lines 33-64)

```holoscript
environment#warehouse @indoor @realistic {
  skybox: "warehouse_hdri"
  ambient_light: { intensity: 0.4, color: #e8e8e8 }
  fog: { density: 0.001, color: #d0d0d0, start: 20, end: 100 }
}
```

Creates a realistic warehouse environment with proper lighting and atmosphere.

### Training Stations (Lines 111-304)

Each station is a self-contained `zone` with:
- Interactive objects (hazards, equipment)
- Feedback mechanisms (tooltips, popups, scoring)
- Completion tracking

**Station 1: Hazard Identification**
- Identify wet floor hazard
- Clear blocked emergency exit
- Learn hazard reporting procedures

**Station 2: Proper Lifting Technique**
- Follow correct posture (knees bent, back straight)
- Lift and place objects safely
- Real-time posture feedback

**Station 3: Emergency Response**
- Locate fire extinguisher
- Activate fire alarm
- Practice evacuation procedures

### Guided Navigation (Lines 309-403)

```holoscript
path#training_route @visual_guide {
  waypoints: [
    { x: 0, z: 0, label: "Start" },
    { x: 5, z: 5, label: "Hazard Identification" },
    // ...
  ]
  visualize_path: true
  show_arrows: true
}
```

Creates a visual path guiding trainees through the experience.

### Progress Tracking (Lines 407-455)

```holoscript
ui#progress_hud @always_visible @top_left {
  progress_bar#hazards {
    label: "Hazard Identification"
    track_completion: ["hazard_1", "hazard_2"]
  }
  // ...
}
```

Real-time HUD showing completion status and score.

### Completion Certificate (Lines 459-526)

```holoscript
on_interact {
  if (all_modules_complete && player.score >= 50) {
    export_certificate: {
      format: "PDF"
      filename: "safety_training_{player.name}_{date}.pdf"
    }
  }
}
```

Generates downloadable certificates upon successful completion.

## 🎓 Use Cases

### Corporate Training
- Employee onboarding
- Safety certification
- Compliance training
- Annual refresher courses

### Educational Institutions
- Vocational training programs
- Safety engineering courses
- OSHA certification prep

### Industrial
- Warehouse operations training
- Manufacturing safety protocols
- Construction site safety

## ⚙️ Customization

### Changing Training Content

Edit the training stations (lines 111-304) to customize:
- Hazard types and scenarios
- Equipment and procedures
- Scoring criteria
- Feedback messages

### Adding New Modules

```holoscript
zone#new_training_module @training_module {
  position: { x: X, z: Z }

  // Add interactive objects, instructions, scoring
}
```

### Language Localization

Update settings (lines 586-607):
```holoscript
settings {
  supported_languages: ["en", "es", "zh", "fr", "de", "ja"]
  default_language: "en"
}
```

Add translated audio files and text overlays.

### Branding

Replace textures and models:
- `certificate_template.png` - Company logo/branding
- `safety_instructor.glb` - Custom avatar
- `warehouse_hdri` - Custom environment

## 📊 Analytics & Reporting

The experience tracks:
- Module completion rates
- Time spent per module
- Scoring per attempt
- Common failure points
- User interactions

Export settings (lines 602-606):
```holoscript
settings {
  track_completion: true
  track_time_spent: true
  track_attempts: true
  export_report: true
}
```

## 🔧 Technical Details

### Performance Targets
- **VR (Unity/Unreal)**: 90 FPS on Quest 2/Pro
- **WebXR**: 60 FPS on mid-range laptops
- **Godot**: 72 FPS on Steam Deck

### Asset Requirements
- 3D Models: GLB/GLTF format
- Textures: 2K max resolution (optimize for mobile)
- Audio: MP3/OGG, compressed
- Total package: < 100 MB

### Platform-Specific Notes

**Unity**
- Uses XR Interaction Toolkit for controllers
- Requires Unity 2021.3 LTS or newer
- Quest build requires Android SDK

**Unreal**
- Compiled to C++ (header + source files)
- Requires Unreal 5.1+
- OpenXR plugin required

**WebXR**
- Three.js-based implementation
- Works in Chrome/Firefox/Edge
- No installation required
- Progressive Web App compatible

**Godot**
- GDScript output
- Godot 4.1+ with OpenXR
- Lightest compilation target

## 🎨 Art Style

This example uses **industrial realism**:
- Neutral color palette (grays, yellows, safety orange)
- Weathered textures for authenticity
- Clear signage and labeling
- OSHA-compliant visual design

Easily adaptable to other styles:
- Stylized/cartoonish (gaming companies)
- High-fidelity photorealism (enterprise)
- Minimalist/abstract (artistic installations)

## 📚 Further Reading

- [HoloScript Language Reference](../../../docs/LANGUAGE_REFERENCE.md)
- [Physics System Guide](../../../docs/PHYSICS_GUIDE.md)
- [UI/UX Best Practices](../../../docs/UX_GUIDE.md)
- [Multi-Platform Deployment](../../../docs/DEPLOYMENT_GUIDE.md)

## 🤝 Contributing

Improvements welcome! Ideas:
- Additional training modules (chemical safety, PPE usage)
- More accessibility features (sign language avatars)
- Multiplayer collaborative training scenarios
- Advanced analytics integration
- Mobile AR companion app

## 📄 License

This example is provided under the MIT License. Use freely in commercial or educational projects.

---

**Built with HoloScript** - Write once, deploy everywhere. 🌐
