# OpenXR HAL Trait

> Part of the HoloScript Traits reference. Browse: [Spatial](/traits/spatial) · [Advanced](/traits/advanced) · [All Traits](/traits/)

The `@openxr_hal` trait is the **Hardware Abstraction Layer** for XR devices. It wraps the WebXR Device API to provide a unified interface across Meta Quest, Valve Index, HTC Vive, Apple Vision Pro, Pico 4, and any future OpenXR-compatible headset.

All haptic traits (`@haptic`, `@force_feedback`, `@hd_haptics`) require `@openxr_hal` to be present on the scene root or a parent object.

## Quick Start

```hsplus
composition "VR Experience" {
  object "XRRig" @openxr_hal {
    // OpenXR is ready — haptics, hand tracking, and eye tracking work
  }
}
```

---

## Configuration

```hsplus
object "XRRig" @openxr_hal(
  preferred_refresh_rate: 90,
  enable_passthrough: false,
  enable_hand_tracking: true,
  enable_eye_tracking: false,
  fallback_mode: "simulate"
) { }
```

| Config                   | Type   | Default      | Description                                                       |
| ------------------------ | ------ | ------------ | ----------------------------------------------------------------- |
| `preferred_refresh_rate` | number | `0`          | Target refresh rate in Hz. `0` = device default.                  |
| `enable_passthrough`     | bool   | `false`      | Request passthrough (AR) if available.                            |
| `enable_hand_tracking`   | bool   | `false`      | Request `hand-tracking` optional feature.                         |
| `enable_eye_tracking`    | bool   | `false`      | Request eye tracking permission.                                  |
| `fallback_mode`          | string | `"simulate"` | `"simulate"` (dev mock), `"error"`, or `"desktop"`.               |
| `simulate_haptics`       | bool   | `true`       | Log haptic calls in simulation mode instead of silently ignoring. |

---

## Session Lifecycle

### Starting a Session

```hsplus
logic {
  on_ready() {
    emit "request_xr_session" { mode: "immersive-vr" }
  }

  on_event("openxr_session_start", event) {
    log("Session started on:", event.deviceProfile.name)
    log("Features:", event.featuresAvailable)
  }

  on_event("openxr_simulated", event) {
    log("Running in simulation mode:", event.reason)
  }
}
```

### Session Modes

| Mode           | Description                      |
| -------------- | -------------------------------- |
| `immersive-vr` | Full VR immersive mode (default) |
| `immersive-ar` | AR with passthrough              |
| `inline`       | Non-immersive (desktop/preview)  |

---

## Events

### Outgoing (listen via `on_event`)

| Event                      | Payload                                            | Description                        |
| -------------------------- | -------------------------------------------------- | ---------------------------------- |
| `openxr_ready`             | `{ deviceProfile, capabilities }`                  | Device detected and session ready. |
| `openxr_session_start`     | `{ mode, deviceProfile, featuresAvailable }`       | XR session started.                |
| `openxr_session_end`       | `{ reason, errorCount }`                           | Session ended.                     |
| `openxr_session_resumed`   | `{ node }`                                         | Session became visible again.      |
| `openxr_simulated`         | `{ reason }`                                       | Falling back to simulation.        |
| `openxr_frame`             | `{ delta, performanceLevel, sessionVisible }`      | Per-frame update (60–144 Hz).      |
| `xr_input_source_update`   | `{ source, pose, timestamp }`                      | Controller pose + profile.         |
| `controller_data`          | `{ hand, buttons, axes, triggerValue, gripValue }` | Gamepad button/axis state.         |
| `hand_data`                | `{ hand, joints, pinchStrength, gripStrength }`    | Hand skeleton joint poses.         |
| `eye_gaze_update`          | `{ origin, direction, timestamp }`                 | Eye gaze ray in world space.       |
| `haptic_triggered`         | `{ hand, intensity, duration, success }`           | Haptic feedback result.            |
| `openxr_features_detected` | `{ features, handTracking, eyeTracking }`          | Available WebXR features.          |

### Incoming (trigger via `emit`)

| Event                | Payload                                          | Description              |
| -------------------- | ------------------------------------------------ | ------------------------ |
| `request_xr_session` | `{ mode }`                                       | Start an XR session.     |
| `end_xr_session`     | `{}`                                             | End the current session. |
| `trigger_haptic`     | `{ hand, intensity, duration, actuator_index? }` | Fire haptic feedback.    |

---

## Device Profiles

The trait auto-detects the connected device and exposes a `deviceProfile`:

```typescript
{
  type: "quest_3",
  name: "Meta Quest 3",
  hapticCapabilities: ["rumble", "hd_haptics"],
  trackingCapabilities: ["controller", "hand", "eye"],
  renderCapabilities: ["passthrough", "depth_sensing", "mesh_detection"],
  refreshRates: [72, 90, 120],
  resolution: { width: 2064, height: 2208 },
  controllers: {
    left:  { hapticActuators: 1, supportsHDHaptics: true, ... },
    right: { hapticActuators: 1, supportsHDHaptics: true, ... }
  }
}
```

Supported profiles: `quest_3`, `quest_pro`, `vive_xr_elite`, `valve_index`, `vision_pro`, `pico_4`, `generic_openxr`.

---

## Hand Tracking

When `enable_hand_tracking: true` and the device supports it, joint poses stream via `hand_data` events at frame rate. Each event includes all 25 XRHand joints with position, orientation, and radius — obtained directly from `XRFrame.getJointPose()`.

```hsplus
logic {
  on_event("hand_data", event) {
    const tip = event.joints["index-finger-tip"]
    if (tip && event.pinchStrength > 0.9) {
      emit "pinch_action" { position: tip.position }
    }
  }
}
```

---

## Eye Tracking

When `enable_eye_tracking: true` and the device grants permission, gaze ray data streams at frame rate via `eye_gaze_update`. The ray is computed from `XRFrame.getPose()` on the gaze input source.

```hsplus
logic {
  on_event("eye_gaze_update", event) {
    // event.origin + event.direction = world-space gaze ray
    const hit = raycast(event.origin, event.direction)
    if (hit) { highlight(hit.object) }
  }
}
```

---

## Performance Levels

The trait tracks rendering performance and exposes it via `openxr_frame` events:

| Level    | Frame Time |
| -------- | ---------- |
| `max`    | < 8.33 ms  |
| `high`   | 8–11 ms    |
| `medium` | 11–16 ms   |
| `low`    | > 16.67 ms |

Use this to adaptively lower fidelity when the device struggles.

---

## Simulation Mode

In browsers without WebXR (or in Node.js for testing), `fallback_mode: "simulate"` creates a mock session with a simulated `quest_3` profile. All events fire normally, controller poses return neutral values. Haptic calls log to console when `simulate_haptics: true`.

---

## See Also

- [Spatial Traits](/traits/spatial)
- [Interaction Traits](/traits/interaction)
- [Advanced Traits](/traits/advanced)
