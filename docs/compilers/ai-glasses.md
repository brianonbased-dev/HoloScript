# AI Glasses Compiler

Compiles HoloScript to AI glasses platforms — Meta Ray-Bans, Snap Spectacles, Android XR glasses, and Apple AI glasses. Unlike full VR headsets, AI glasses are always-on, hands-free, and ambient: they overlay information on the real world while the wearer moves naturally.

## Overview

The AI glasses compiler (`--target ai-glasses`) generates platform-appropriate output for the thin-client wearable glasses tier. These devices have:

- **No controllers** — input via voice, head-pose, hand gestures, eye gaze
- **Always-on display** — semi-transparent overlays on real world
- **Edge inference only** — lightweight models, no heavy GPU
- **Tight battery budget** — experiences must be < 5W total
- **Social context** — other people can see you wearing them

```bash
holoscript compile experience.holo --target ai-glasses --glasses-platform snap --output ./glasses/
```

## Supported Platforms

| Platform             | Device                 | SDK                   | Output Format     |
| -------------------- | ---------------------- | --------------------- | ----------------- |
| `meta-raybans`       | Meta Ray-Ban Stories   | Meta View SDK         | JavaScript + HTML |
| `snap`               | Snap Spectacles 3      | Lens Studio (Snap OS) | Lens Script + AR  |
| `android-xr-glasses` | Android XR glasses     | Android XR SDK        | Kotlin + Jetpack  |
| `apple-ai-glasses`   | Apple AI glasses       | visionOS Light        | SwiftUI + ARKit   |
| `generic`            | Generic OpenXR glasses | OpenXR + WebXR        | C++ / JS          |

## Trait Profile for AI Glasses

AI glasses have a restricted trait set due to hardware constraints:

| Trait              | Support | Notes                                  |
| ------------------ | ------- | -------------------------------------- |
| `@voice_activated` | ✅ Full | Primary input method                   |
| `@eye_tracked`     | ✅ Full | Foveated attention, gaze selection     |
| `@billboard`       | ✅ Full | Text/info always facing user           |
| `@spatial_audio`   | ✅ Full | 3D audio via bone conduction / earbuds |
| `@anchor`          | ✅ Full | World-locked info anchors              |
| `@llm_agent`       | ⚠️ Edge | Lightweight quantized model only       |
| `@physics`         | ❌ Skip | Too GPU-heavy for glasses              |
| `@particle`        | ❌ Skip | Battery cost too high                  |
| `@networked`       | ✅ WiFi | Sync via companion app                 |
| `@hitl`            | ✅ Full | Glasses are a primary HITL interface   |

## Example

```holo
composition "WorkplaceAssistant" {
  template "InfoLabel" {
    @billboard
    @anchor
    @voice_activated

    geometry: "plane"
    scale: [0.3, 0.15, 0.001]
    color: "#0088ff"
    opacity: 0.85
  }

  agent "WorkplacePilot" {
    @llm_agent
    @voice_activated
    @eye_tracked

    on_gaze_dwell(target, duration: 1.5) {
      info = llm.identify(camera.frame, target)
      spawn "InfoLabel" at gaze.hit_point with { text: info }
    }

    on_voice("help me with this") {
      llm.assist(camera.frame)
    }
  }
}
```

## Output (Snap Spectacles)

```
glasses/
  Lens/
    Scripts/
      WorkplaceAssistant.js   # Lens Studio JavaScript
      VoiceML.js              # Voice recognition module
    Resources/
      InfoLabel.material
    Public/
      lens.json               # Lens manifest
```

## Design Principles for AI Glasses

1. **3-second rule** — any response must appear within 3 seconds of intent
2. **Glanceable** — information readable in < 1 second
3. **Dismissible** — everything disappears on voice or gesture
4. **Battery aware** — use `@low_power` trait for ambient experiences
5. **Social** — no content that embarrasses the wearer in public

## Compiler Options

| Option                     | Default   | Description                            |
| -------------------------- | --------- | -------------------------------------- |
| `--glasses-platform`       | `generic` | Target platform (see table above)      |
| `--glasses-edge-llm`       | `false`   | Include edge LLM inference bundle      |
| `--glasses-battery-budget` | `5`       | Max Watts; trims heavy traits          |
| `--glasses-companion-sync` | `false`   | Generate companion phone app sync code |

## See Also

- [Android XR Compiler](/compilers/android-xr) — Full Android XR headsets
- [OpenXR Spatial Entities](/compilers/openxr-spatial) — World anchoring
- [visionOS Compiler](/compilers/vision-os) — Apple Vision Pro (full headset)
