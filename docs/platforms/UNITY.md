# Unity Integration Guide

Compile HoloScript to Unity C# scripts for Quest, PCVR, and mobile platforms.

## Quick Start

### 1. Compile to Unity

```bash
holoscript compile my-experience.holo --target unity --output ./build/unity/
```

**Output structure:**
```
build/unity/
├── Scripts/
│   ├── MyExperienceManager.cs
│   ├── ObjectControllers/
│   └── Systems/
├── Prefabs/
└── README.md
```

### 2. Unity Project Setup

**Minimum requirements:**
- Unity 2021.3 LTS or newer
- XR Interaction Toolkit (for VR)
- TextMeshPro (for UI)

**Install via Package Manager:**
```
Window > Package Manager
+ > Add package by name
- com.unity.xr.interaction.toolkit
- com.unity.textmeshpro
```

### 3. Import HoloScript Output

1. Copy `build/unity/Scripts/` to `Assets/Scripts/HoloScript/`
2. Copy `build/unity/Prefabs/` to `Assets/Prefabs/HoloScript/`
3. Drag `MyExperienceManager` prefab into scene
4. Press Play

## Platform-Specific Builds

### Quest/Quest 2/Quest 3

**Build Settings:**
```
File > Build Settings
Platform: Android
Texture Compression: ASTC
Run Device: Quest 2
```

**XR Settings:**
```
Edit > Project Settings > XR Plug-in Management
✓ Oculus
```

**Optimize:**
- Graphics API: Vulkan
- Color Space: Gamma (faster)
- Target 72 FPS (Quest 2) or 90 FPS (Quest 3)

### PCVR (SteamVR)

**Build Settings:**
```
Platform: Windows
Architecture: x86_64
```

**XR Settings:**
```
✓ OpenXR
- Interaction Profiles: Add HTC Vive, Valve Index, etc.
```

**Optimize:**
- Target 90 FPS minimum
- Enable Multi-Pass or Single-Pass Instanced

### Mobile AR (ARFoundation)

**Build Settings:**
```
iOS: iOS
Android: Android
```

**AR Settings:**
```
✓ AR Foundation
✓ ARKit (iOS) or ARCore (Android)
```

## HoloScript → Unity Mappings

| HoloScript | Unity Equivalent |
|------------|------------------|
| `composition` | Scene with manager MonoBehaviour |
| `object#name` | GameObject with components |
| `@physics` | Rigidbody + Collider |
| `@interactive` | XR Grab Interactable |
| `camera#player @vr` | XR Rig |
| `light#sun` | Directional Light |
| `audio#bgm` | AudioSource |
| `ui#hud` | Canvas with TextMeshPro |

## Example: VR Interaction

**HoloScript:**
```holoscript
object#cube @physics @interactive {
  type: "cube"
  mass: 1.0

  on_grab {
    vibrate_controller: { intensity: 0.5 }
  }

  on_release {
    apply_force: { x: 0, y: 2, z: 1 }
  }
}
```

**Generated Unity C#:**
```csharp
public class CubeController : MonoBehaviour
{
    private Rigidbody rb;
    private XRGrabInteractable grabInteractable;

    void Start()
    {
        rb = GetComponent<Rigidbody>();
        grabInteractable = GetComponent<XRGrabInteractable>();

        grabInteractable.selectEntered.AddListener(OnGrab);
        grabInteractable.selectExited.AddListener(OnRelease);
    }

    void OnGrab(SelectEnterEventArgs args)
    {
        args.interactorObject.transform.GetComponent<XRController>()
            ?.SendHapticImpulse(0.5f, 0.1f);
    }

    void OnRelease(SelectExitEventArgs args)
    {
        rb.AddForce(new Vector3(0, 2, 1), ForceMode.Impulse);
    }
}
```

## Performance Tips

### Target Frame Rates
- **Quest 2**: 72 FPS (90 FPS if optimized)
- **Quest 3**: 90 FPS (120 FPS capable)
- **PCVR**: 90-120 FPS

### Optimization Checklist
- [ ] Use ASTC texture compression (Quest)
- [ ] Enable GPU Instancing on materials
- [ ] Use Occlusion Culling
- [ ] Limit draw calls to <100
- [ ] Use LOD Groups for distant objects
- [ ] Keep shadow distance low (20-30m)
- [ ] Disable unnecessary physics calculations

### Unity Profiler
```
Window > Analysis > Profiler
- CPU Usage: <11ms (90 FPS) or <13.9ms (72 FPS)
- GPU: <11ms
- Check for GC spikes (object pooling recommended)
```

## Troubleshooting

### "XR Interaction Toolkit not found"
Install via Package Manager (see Setup above).

### "TextMeshPro not found"
`Window > TextMeshPro > Import TMP Essential Resources`

### VR not launching
1. Check XR Plug-in Management settings
2. Ensure XR Rig is in scene
3. Verify controller input actions

### Poor Quest performance
- Reduce texture sizes to 1024x1024 or lower
- Use baked lighting instead of real-time
- Limit dynamic shadows
- Profile with Oculus Developer Hub

## Advanced Features

### Custom Shaders
HoloScript shader blocks compile to Unity ShaderLab:
```holoscript
shader#hologram {
  properties {
    _Color: color = #00ffff
    _Alpha: float = 0.5
  }
}
```

### Physics Events
```holoscript
on_collision(other) {
  if (other.tag == "Enemy") {
    take_damage: 10
  }
}
```

### Animation Controller
```holoscript
object#character {
  animator {
    controller: "CharacterAnimator"
    parameters: {
      speed: player.velocity.magnitude
      is_grounded: physics.is_grounded
    }
  }
}
```

## Resources

- [Unity XR Interaction Toolkit](https://docs.unity3d.com/Packages/com.unity.xr.interaction.toolkit@latest)
- [Quest Development](https://developer.oculus.com/documentation/unity/)
- [Unity Performance Optimization](https://learn.unity.com/tutorial/fixing-performance-problems)

---

**Ready to build?** Compile your HoloScript, import to Unity, and deploy to Quest!
