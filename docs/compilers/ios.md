# iOS Compiler (ARKit)

**Target**: `--target ios` | **Output**: Swift + ARKit | **Platform**: iOS 15+

## iOS Compiler (ARKit)

Compiles HoloScript to Swift code for iOS augmented reality apps.

### Features

- SwiftUI + ARKit integration
- ARSCNView with SceneKit nodes
- Automatic plane detection and hit testing
- World tracking configuration
- Gesture recognizers for interaction
- Spatial audio with SceneKit

### Usage

```bash
holoscript compile ar-scene.holo --target ios --output ./HoloApp/
```

### Output Files

- `GeneratedARSceneView.swift` - SwiftUI view with AR session
- `GeneratedARScene.swift` - SceneKit scene setup
- `GeneratedARSceneState.swift` - ObservableObject state management
- `Info.plist` - Required permissions (camera, etc.)

### Requirements

- iOS 15.0+ (ARKit 5)
- iOS 17.0+ recommended for latest features

### Example

```holo
composition "iOS AR Demo" {
  environment {
    plane_detection: true
    light_estimation: true
  }

  object "ARCube" {
    @anchor
    @clickable
    geometry: "cube"
    position: [0, 0, -0.5]
    scale: [0.1, 0.1, 0.1]
    color: "#00ff00"
  }

  object "InfoPanel" {
    @billboard
    geometry: "plane"
    position: [0, 0.2, -0.5]
    texture: "info-panel.png"
  }
}
```

## See Also

- [Platform Overview](/compilers/)
- [visionOS Compiler](/compilers/vision-os)
- [AR/Spatial Traits](/traits/spatial)
