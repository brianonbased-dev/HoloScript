# Real-World Examples

Production-ready HoloScript examples demonstrating practical use cases.

## Examples

### [VR Showroom](vr-showroom.holo)

E-commerce virtual shopping experience with:

- Product displays with grab-to-inspect
- Shopping cart system
- Payment flow
- Spatial lighting

**Target:** Three.js, Unity, VRChat

### [Escape Room](escape-room.holo)

Multiplayer puzzle game with:

- Combination locks
- Pressure plate sequences
- Symbol matching puzzles
- Networked game state
- Timer system

**Target:** VRChat, OpenXR

### [Medical Training](medical-training.holo)

AR surgical training simulator with:

- Anatomical 3D models
- Hand-tracked tool interaction
- Step-by-step procedures
- Precision feedback
- Progress tracking

**Target:** iOS (ARKit), visionOS

## Compiling

```bash
# VR Showroom to Three.js
holoscript compile vr-showroom.holo --target threejs

# Escape Room to VRChat
holoscript compile escape-room.holo --target vrchat

# Medical Training to iOS
holoscript compile medical-training.holo --target ios
```

## Features Demonstrated

| Example          | Features                                                      |
| ---------------- | ------------------------------------------------------------- |
| VR Showroom      | @grabbable, @rotatable, UI panels, audio, state management    |
| Escape Room      | @networked, @trigger, templates, puzzles, multiplayer sync    |
| Medical Training | @hand_tracked, @anchor, gestures, haptics, precision tracking |

## Requirements

- HoloScript CLI v3.0+
- Target SDK installed (Unity, Xcode, etc.)

## License

MIT - See [LICENSE](../../LICENSE)
