# AR Compiler

Compiles HoloScript to browser-native Augmented Reality via WebXR — placing HoloScript spatial objects in the physical world through the device camera, with no app download required.

## Overview

The AR compiler (`--target ar`) generates a WebXR `immersive-ar` session application aligned with the [WebXR Device API](https://www.w3.org/TR/webxr/). It works on any AR-capable device browser:

- Android Chrome (ARCore)
- iOS Chrome / Safari (via WebXR viewer or Safari 17+)
- Meta Browser (Quest passthrough)

This differs from the platform-specific compilers ([iOS ARKit](/compilers/ios), [Android ARCore](/compilers/android)) by targeting the browser layer — no Xcode, no Android Studio, instant deployment via URL.

```bash
holoscript compile experience.holo --target ar --output ./web/
```

## Output Structure

```
web/
  index.html        # WebXR entry point
  ar-bundle.js      # Compiled scene + AR logic
  assets/           # 3D models, textures
  manifest.json     # PWA manifest for home-screen install
```

## Trait → AR Behaviour

| HoloScript Trait  | AR Behaviour                         |
| ----------------- | ------------------------------------ |
| `@anchor`         | World-locked via hit test            |
| `@plane_detected` | Surface detection + snapping         |
| `@collidable`     | Mesh occlusion against real surfaces |
| `@tracked`        | 6DOF pose tracking                   |
| `@grabbable`      | Touch/pinch to move in AR            |
| `@pointable`      | Gaze/screen-tap selection            |
| `@spatial_audio`  | 3D positioned audio                  |

## Example

```holo
composition "FurniturePlacer" {
  template "Chair" {
    @anchor
    @plane_detected
    @grabbable
    @collidable

    geometry: "model/chair.glb"
    scale: [1, 1, 1]

    on_place {
      this.locked = true
      ui.show("Chair placed! Tap to move.")
    }

    on_grab {
      this.locked = false
    }
  }

  logic {
    on_plane_detected(plane) {
      if (plane.label == "floor") {
        ui.show_reticle(plane.center)
      }
    }

    on_tap {
      spawn "Chair" at reticle.position
    }
  }
}
```

## Compiler Options

| Option               | Default       | Description                             |
| -------------------- | ------------- | --------------------------------------- |
| `--ar-occlusion`     | `false`       | Enable depth-based real-world occlusion |
| `--ar-lighting`      | `true`        | Match ambient light to real environment |
| `--ar-plane-types`   | `floor,table` | Plane types to detect                   |
| `--ar-hit-test`      | `true`        | Enable tap-to-place                     |
| `--ar-dom-overlay`   | `true`        | Allow HTML UI overlaid on camera        |
| `--ar-depth-sensing` | `false`       | Enable raw depth data (ARCore only)     |

## Progressive AR (No Headset Needed)

The AR output degrades gracefully:

| Capability Available | Experience                        |
| -------------------- | --------------------------------- |
| WebXR immersive-ar   | Full AR with camera passthrough   |
| WebXR inline         | 3D viewer on flat screen          |
| No WebXR             | Static 3D model viewer (Three.js) |

## Device Compatibility

| Device/Browser          | Mode                 | Notes                          |
| ----------------------- | -------------------- | ------------------------------ |
| Android Chrome (ARCore) | Full immersive-ar    | Best experience                |
| iOS Safari 17+          | Limited immersive-ar | Hit test + anchors             |
| iOS WebXR Viewer        | Full immersive-ar    | Via Mozllia WebXR Viewer app   |
| Meta Quest (browser)    | Passthrough AR       | `--ar-occlusion` not supported |
| Desktop Chrome          | Inline 3D only       | Graceful fallback              |

## See Also

- [iOS Compiler](/compilers/ios) — Native ARKit for App Store distribution
- [Android Compiler](/compilers/android) — Native ARCore
- [OpenXR Spatial Entities](/compilers/openxr-spatial) — Persistent AR anchors
- [visionOS Compiler](/compilers/vision-os) — Apple Vision Pro
