# Android Compiler (ARCore)

**Target**: `--target android` | **Output**: Kotlin + ARCore | **Platform**: Android SDK 26+

## Android Compiler (ARCore)

Compiles HoloScript to Kotlin code for Android augmented reality apps.

### Features

- Kotlin Activity with ARCore Session
- Sceneform or Filament rendering
- Plane detection and hit testing
- Touch gesture handling
- Jetpack Compose UI integration
- Spatial audio integration

### Usage

```bash
holoscript compile ar-scene.holo --target android --output ./app/src/main/java/
```

### Output Files

- `GeneratedARSceneActivity.kt` - Main Activity with AR session
- `GeneratedARSceneState.kt` - ViewModel state management
- `NodeFactory.kt` - Sceneform node creation
- `AndroidManifest.xml` - Permissions and ARCore metadata
- `build.gradle.kts` - Dependencies

### Requirements

- Android SDK 26+ (ARCore 1.0)
- Android SDK 34 recommended

### Example

```holo
composition "Android AR Demo" {
  environment {
    plane_detection: true
    depth_mode: "automatic"
  }

  object "PlacedModel" {
    @anchor
    @draggable
    geometry: "model/robot.glb"
    position: [0, 0, 0]
    scale: [0.5, 0.5, 0.5]
  }

  object "InfoBubble" {
    @billboard
    geometry: "sphere"
    position: [0, 0.3, 0]
    color: "#0088ff"
    opacity: 0.8
  }
}
```

## See Also

- [Platform Overview](/compilers/)
- [Android XR Compiler](/compilers/android-xr)
- [AR/Spatial Traits](/traits/spatial)
