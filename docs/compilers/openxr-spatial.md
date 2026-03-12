# OpenXR Spatial Entities Compiler

Compiles HoloScript spatial anchoring definitions to the [OpenXR Spatial Entities](https://registry.khronos.org/OpenXR/specs/1.0/html/xrspec.html#XR_EXT_spatial_entity) extension — the Khronos standard for persistent, world-locked AR anchors across platforms.

## Overview

The OpenXR Spatial Entities compiler (`--target openxr-spatial`) generates C++ or JSON configuration for the OpenXR `XR_EXT_spatial_entity` and `XR_MSFT_scene_understanding` extensions. These are the standard mechanisms for:

- **Persistent world anchors** — objects that stay stuck to real surfaces across sessions
- **Plane detection** — horizontal and vertical surface tracking
- **Scene understanding** — semantic labels on detected surfaces (floor, wall, table, ceiling)
- **Cross-device persistence** — anchors shared between users on Meta Quest, HoloLens, PICO, and Magic Leap

```bash
holoscript compile anchors.holo --target openxr-spatial --output ./xr/
```

## Spatial Anchor Traits

| HoloScript Trait   | OpenXR Extension                         | Behaviour                               |
| ------------------ | ---------------------------------------- | --------------------------------------- |
| `@anchor`          | `XR_EXT_spatial_entity`                  | Create + persist spatial anchor         |
| `@world_locked`    | `XrSpatialEntityFlagsEXT`                | Lock to physical world position         |
| `@plane_detected`  | `XR_MSFT_scene_understanding`            | Snap to detected plane                  |
| `@tracked`         | `XrSpaceLocationFlags`                   | Track with 6DOF pose                    |
| `@hand_tracked`    | `XR_EXT_hand_tracking`                   | Hand joint anchor                       |
| `@eye_tracked`     | `XR_EXT_eye_gaze_interaction`            | Gaze-stabilized anchor                  |
| `@persistent`      | `xrSaveSpaceXR_EXT_spatial_entity`       | Save anchor UUID across sessions        |

## Example

```holo
composition "PersistentARNotes" {
  template "StickyNote" {
    @anchor
    @world_locked
    @persistent

    geometry: "plane"
    scale: [0.2, 0.15, 0.01]
    color: "#ffff88"

    state {
      uuid: ""
      text: "Note content here"
    }

    on_place {
      this.uuid = spatial.createAnchor(this.position, this.rotation)
      spatial.saveAnchor(this.uuid)
    }

    on_load {
      spatial.loadAnchor(this.uuid)
    }
  }

  logic {
    on_plane_detected(plane) {
      if (plane.label == "table") {
        spawn "StickyNote" at plane.center
      }
    }
  }
}
```

## Output

```
xr/
  anchors.h            # C++ OpenXR extension calls
  anchor_config.json   # Anchor UUIDs and poses
  spatial_mesh.json    # Detected planes / mesh
```

**Generated C++ (excerpt):**

```cpp
// Create persistent spatial anchor
XrSpatialEntityFlagsEXT flags = XR_SPATIAL_ENTITY_PERSIST_BIT_EXT;
XrCreateSpatialEntityInfoMSFT createInfo{XR_TYPE_CREATE_SPATIAL_ENTITY_INFO_MSFT};
createInfo.pose = anchorPose;
xrCreateSpatialEntityMSFT(session, &createInfo, &spatialAnchor);
xrSaveSpatialEntityMSFT(session, &saveInfo);  // Persist across sessions
```

## Supported Runtimes

| Runtime              | Device              | Required Extension               |
| -------------------- | ------------------- | -------------------------------- |
| Meta OpenXR          | Quest 2/3/Pro       | `XR_FB_spatial_entity`           |
| Microsoft OpenXR     | HoloLens 2          | `XR_MSFT_spatial_anchor`         |
| PICO OpenXR          | PICO 4              | `XR_EXT_spatial_entity`          |
| Magic Leap OpenXR    | Magic Leap 2        | `XR_ML_localization_map`         |
| SteamVR              | Index / Vive        | `XR_EXT_spatial_entity` (limited)|

## Compiler Options

| Option                  | Default   | Description                                 |
| ----------------------- | --------- | ------------------------------------------- |
| `--oxr-runtime`         | `generic` | Target runtime: `meta`, `msft`, `pico`, `ml` |
| `--oxr-persistence`     | `true`    | Enable cross-session anchor persistence     |
| `--oxr-plane-detection` | `true`    | Enable plane detection                      |
| `--oxr-scene-mesh`      | `false`   | Enable full environment mesh                |
| `--oxr-sharing`         | `false`   | Enable anchor sharing between users         |

## See Also

- [OpenXR Compiler](/compilers/openxr) — Base OpenXR output
- [AR Compiler](/compilers/ar) — Generic browser AR
- [visionOS Compiler](/compilers/vision-os) — Apple Vision Pro
