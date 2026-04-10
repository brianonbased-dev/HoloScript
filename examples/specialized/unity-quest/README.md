# Unity Quest - Platform-Optimized Obstacle Course

A comprehensive Unity + Quest example demonstrating platform-specific optimizations, XR Interaction Toolkit integration, and Quest 2/3 features.

## Overview

This example shows how to build performant VR experiences for Meta Quest with HoloScript, automatically handling platform-specific optimizations like ASTC texture compression, mobile shaders, and foveated rendering.

**Platforms:** `unity-quest`, `unity-pcvr`

- Meta Quest 2 (72-90 FPS)
- Meta Quest 3 (90-120 FPS with eye tracking)
- PCVR / SteamVR (90-120 FPS)

## Features

### Quest-Specific Optimizations

- **ASTC Texture Compression**: Automatic mobile-optimized textures
- **Mobile Shaders**: Lightweight `mobile/diffuse` and `mobile/unlit` shaders
- **Foveated Rendering**: Quest 3 eye tracking for performance
- **Baked Lighting**: Pre-baked lightmaps (no realtime GI)
- **LOD Groups**: Level-of-detail for distant objects
- **Thermal Management**: Sustained performance mode

### Unity XR Interaction Toolkit

- **XR Origin**: Complete VR rig with camera and controllers
- **Continuous Movement**: Smooth locomotion with thumbsticks
- **Teleportation**: Arc-based teleport system
- **Grab Interactions**: Physics-based object grabbing
- **Ray Interactions**: UI and distant object selection
- **Haptic Feedback**: Controller vibration on grab/release

### Quest Features

- **Hand Tracking**: Controller-free interaction (Quest 2/3)
- **Passthrough**: Mixed reality mode toggle
- **Guardian Boundary**: Visualize play area boundaries
- **Oculus Integration**: Native Quest SDK features

### Gameplay

- Moving platforms with physics
- Rotating obstacles
- Grabbable objects
- Target shooting
- Performance HUD (FPS, timer, score)

## Quick Start

### 1. Compile to Unity

```bash
holoscript compile quest-obstacle-course.holo --target unity --platform quest --output ./build/unity_quest/
```

**Output:**

```
build/unity_quest/
├── Scripts/
│   ├── GameManager.cs
│   ├── PlayerController.cs
│   ├── ObstacleBehaviors.cs
│   └── QuestFeatures.cs
├── Prefabs/
│   ├── XR_Origin.prefab
│   ├── Platform.prefab
│   ├── GrabbableBox.prefab
│   └── Target.prefab
├── Materials/
│   ├── Ground_Mobile.mat
│   ├── Platform_Mobile.mat
│   └── Obstacle_Unlit.mat
└── README.md
```

### 2. Unity Project Setup

**Minimum Requirements:**

- Unity 2021.3 LTS or newer (2022.3 LTS recommended)
- Android Build Support module
- Oculus XR Plugin

**Installation:**

```
1. Create new Unity 2022.3 LTS project
2. Window > Package Manager > Unity Registry
   - Install "XR Interaction Toolkit" (2.5.2+)
   - Install "XR Plugin Management" (4.4.0+)
   - Install "Input System" (1.7.0+)

3. Edit > Project Settings > XR Plug-in Management
   - Android tab > Check "Oculus"

4. Edit > Project Settings > Player
   - Android Settings:
     - Minimum API Level: Android 10.0 (API 29)
     - Scripting Backend: IL2CPP
     - ARM64: ✓

5. Copy HoloScript output to Assets/
   - Assets/Scripts/QuestObstacleCourse/
   - Assets/Prefabs/QuestObstacleCourse/
   - Assets/Materials/QuestObstacleCourse/
```

### 3. Import HoloScript Output

```bash
# Copy generated files
cp -r build/unity_quest/Scripts Assets/Scripts/QuestObstacleCourse/
cp -r build/unity_quest/Prefabs Assets/Prefabs/QuestObstacleCourse/
cp -r build/unity_quest/Materials Assets/Materials/QuestObstacleCourse/

# In Unity:
# 1. Drag XR_Origin prefab into scene
# 2. Drag GameManager prefab into scene
# 3. Delete default Main Camera
# 4. Press Play to test in editor (with VR headset connected)
```

### 4. Build for Quest

```
File > Build Settings
- Platform: Android
- Texture Compression: ASTC
- Run Device: Quest 2/Quest 3

Build and Run (Quest connected via USB or WiFi)
```

**Deploy to Quest:**

```bash
# Via Oculus Developer Hub (recommended)
1. Enable Developer Mode in Meta Quest app
2. Connect Quest via USB
3. Open Oculus Developer Hub
4. Drag .apk to install

# Or via ADB
adb install -r YourGame.apk
```

## Platform Differences

### Quest 2

- **Target FPS**: 72 Hz (90 Hz experimental)
- **Rendering**: Multiview stereo
- **Textures**: ASTC 6x6 compression
- **Shaders**: Mobile/Diffuse, Mobile/Unlit
- **Shadows**: Medium quality, 20m distance
- **Particles**: <100 per effect
- **Draw Calls**: <200
- **Lightmaps**: 512x512

### Quest 3

- **Target FPS**: 90 Hz (120 Hz capable)
- **Rendering**: Multiview + foveated rendering (eye tracking)
- **Textures**: ASTC 6x6 or 8x8
- **Features**: Full-color passthrough, hand tracking 2.1
- **Shadows**: High quality possible, 30m distance
- **Particles**: <200 per effect
- **Draw Calls**: <300
- **Lightmaps**: 1024x1024

### PCVR (SteamVR/Oculus Link)

- **Target FPS**: 90-120 Hz (Valve Index 144 Hz)
- **Rendering**: Single-pass instanced
- **Textures**: No compression (DDS/PNG)
- **Shaders**: Standard PBR, realtime lighting
- **Shadows**: High/Very High, 100m distance
- **Particles**: <1000 per effect
- **Draw Calls**: <1000
- **Lightmaps**: 2048x2048 or realtime GI

## Unity XR Interaction Toolkit Integration

### XR Origin Setup

HoloScript generates a complete XR Origin rig:

**Components:**

- `XROrigin` - Root tracking object
- `Camera Offset` - Playspace center
- `Main Camera` - VR stereo camera
- `LeftHand Controller` - Left XR controller
- `RightHand Controller` - Right XR controller
- `Character Controller` - Collision capsule
- `Locomotion System` - Movement provider

### Interaction System

**XR Grab Interactable:**

```csharp
public class GrabbableBox : MonoBehaviour
{
    private XRGrabInteractable grabInteractable;

    void Start()
    {
        grabInteractable = GetComponent<XRGrabInteractable>();

        grabInteractable.selectEntered.AddListener(OnGrab);
        grabInteractable.selectExited.AddListener(OnRelease);
    }

    void OnGrab(SelectEnterEventArgs args)
    {
        // Haptic feedback
        args.interactorObject.transform.GetComponent<XRController>()
            ?.SendHapticImpulse(0.5f, 0.1f);
    }

    void OnRelease(SelectExitEventArgs args)
    {
        // Throw physics applied automatically
    }
}
```

**XR Simple Interactable (Targets):**

```csharp
public class Target : MonoBehaviour
{
    private XRSimpleInteractable interactable;

    void Start()
    {
        interactable = GetComponent<XRSimpleInteractable>();
        interactable.selectEntered.AddListener(OnHit);
    }

    void OnHit(SelectEnterEventArgs args)
    {
        // Play hit effect
        PlayHitAnimation();

        // Destroy and respawn
        Destroy(gameObject, 0.2f);
    }
}
```

## Performance Optimization

### Mobile Shaders

HoloScript auto-selects mobile shaders for Quest:

**Standard → Mobile/Diffuse:**

- 3x faster rendering
- Baked lighting only
- No realtime reflections
- Limited texture slots

**Unlit → Mobile/Unlit:**

- 5x faster rendering
- No lighting calculations
- Emission supported
- Best for UI, particles, effects

### Texture Compression

**ASTC Settings:**

```holoscript
material {
  texture_compression: "astc_6x6"  // Good balance
  // or "astc_4x4" (higher quality, larger)
  // or "astc_8x8" (lower quality, smaller)
}
```

**Quest Recommendations:**

- Base color textures: ASTC 6x6
- Normal maps: ASTC 6x6 or 8x8
- UI textures: ASTC 4x4 (crisp text)
- Particles: ASTC 8x8 (small anyway)

### LOD (Level of Detail)

```holoscript
lod_group {
  lod_0: { distance: 0, mesh: "high.mesh" }    // 0-20m
  lod_1: { distance: 20, mesh: "medium.mesh" } // 20-50m
  lod_2: { distance: 50, mesh: "low.mesh" }    // 50-100m
}
```

**LOD Best Practices:**

- LOD 0: Full detail (100% triangles)
- LOD 1: 50% triangles
- LOD 2: 25% triangles
- LOD 3: Billboard or cull

### Occlusion Culling

Quest supports occlusion culling:

```
Window > Rendering > Occlusion Culling
1. Mark static objects
2. Bake occlusion data
3. ~10-30% performance gain in complex scenes
```

### Physics Optimization

**Simplified Collision:**

```holoscript
collision {
  type: "box"  // Not "mesh" (too expensive)
  layer: "Default"
}
```

**Fixed Timestep:**

```holoscript
performance {
  fixed_timestep: 0.0111  // 90 Hz physics
}
```

## Quest-Specific Features

### Hand Tracking

Enable hand tracking for controller-free interaction:

```holoscript
hand_tracking#both_hands @quest_feature {
  enabled: true

  hands {
    left: "hand_left_skeleton"
    right: "hand_right_skeleton"
  }

  gestures {
    pinch: true  // Select/grab
    point: true  // UI ray
    fist: true   // Custom action
  }

  fallback_mode: "controllers"
}
```

**Unity Setup:**

```
1. Oculus > Tools > Hand Tracking
2. Project Settings > Oculus > Hand Tracking Support: Controllers And Hands
3. Add OVRHand component to controller GameObjects
```

### Passthrough (Mixed Reality)

Toggle passthrough for mixed reality:

```holoscript
passthrough#mr_mode @quest3_feature {
  enabled: false

  settings {
    opacity: 0.8
    color_mode: "full_color"  // Quest 3 only
  }

  toggle_button {
    input: "secondary_button"  // Y/B button
  }
}
```

**Unity Implementation:**

```csharp
using UnityEngine.XR;

void TogglePassthrough()
{
    OVRManager.instance.isInsightPassthroughEnabled = !OVRManager.instance.isInsightPassthroughEnabled;

    if (OVRManager.instance.isInsightPassthroughEnabled)
    {
        Camera.main.clearFlags = CameraClearFlags.SolidColor;
        Camera.main.backgroundColor = Color.clear;
    }
    else
    {
        Camera.main.clearFlags = CameraClearFlags.Skybox;
    }
}
```

### Guardian Boundary

Visualize play area boundaries:

```holoscript
guardian#boundary @quest_feature {
  visualization {
    enabled: true
    fade_distance: 0.3  // 30cm
    color: #00ffff
  }
}
```

**Unity:**

```csharp
OVRManager.boundary.SetVisible(true);
float distance = OVRManager.boundary.GetClosestPointToNode(OVRPlugin.BoundaryType.PlayArea);
```

## Troubleshooting

### Low FPS on Quest

**Symptoms**: <72 FPS, stuttering, thermal throttling

**Fixes:**

1. Reduce shadow distance to 20m or disable
2. Use Mobile/Diffuse shaders, not Standard
3. Compress textures with ASTC 6x6 or 8x8
4. Reduce particle counts to <100 per effect
5. Enable occlusion culling
6. Use LODs for complex models
7. Profile with Oculus Developer Hub

### Controllers Not Working

1. Check XR Plug-in Management > Android > Oculus enabled
2. Verify Input System package installed
3. Ensure XRController components on hand GameObjects
4. Check Input Actions asset configured

### Grab Not Working

1. XRGrabInteractable component on object
2. Collider component (trigger or solid)
3. Rigidbody component (use gravity: true)
4. Interaction Layer: Default
5. XRDirectInteractor on controllers

### Teleport Not Working

1. Ground plane has layer "Teleportable"
2. TeleportationProvider in scene
3. XRRayInteractor on controllers
4. Teleportation Area or Anchors on ground

## Advanced Features

### Custom Input Actions

Use Unity Input System for custom controls:

```csharp
using UnityEngine.InputSystem;

public InputActionReference jumpAction;

void Update()
{
    if (jumpAction.action.WasPressedThisFrame())
    {
        Jump();
    }
}
```

### Physics Hands

Realistic hand collision with physics:

```holoscript
controller#left_hand {
  physics_hand {
    enabled: true
    hand_layer: "PhysicsHand"
    collision_detection: "continuous"
  }
}
```

### Adaptive Performance

Quest can dynamically adjust quality:

```csharp
using UnityEngine.AdaptivePerformance;

AdaptivePerformanceScaler scaler;

void Start()
{
    scaler = GetComponent<AdaptivePerformanceScaler>();
    scaler.enabled = true;  // Auto-adjust quality for stable FPS
}
```

## Resources

- [Unity XR Interaction Toolkit Docs](https://docs.unity3d.com/Packages/com.unity.xr.interaction.toolkit@latest)
- [Oculus Developer Documentation](https://developer.oculus.com/documentation/unity/)
- [Quest Performance Best Practices](https://developer.oculus.com/resources/mobile-performance/)
- [Unity Quest Optimization Guide](https://learn.unity.com/tutorial/oculus-quest-development)

---

**Ready for Quest?** Compile to Unity, optimize for mobile, and deploy to Meta Quest!
