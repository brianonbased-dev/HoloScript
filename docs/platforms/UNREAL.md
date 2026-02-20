# Unreal Engine Integration Guide

Compile HoloScript to Unreal Engine C++ for high-fidelity VR experiences.

## Quick Start

### 1. Compile to Unreal

```bash
holoscript compile my-experience.holo --target unreal --output ./build/unreal/
```

**Output structure:**
```
build/unreal/
├── Source/
│   ├── MyExperience.h
│   ├── MyExperience.cpp
│   ├── Actors/
│   └── Components/
├── Content/
│   └── Blueprints/
└── README.md
```

### 2. Unreal Project Setup

**Minimum requirements:**
- Unreal Engine 5.1 or newer
- C++ compiler (Visual Studio 2022 on Windows)
- VR Template (or enable VR plugins manually)

**Enable VR plugins:**
```
Edit > Plugins
✓ OpenXR
✓ Enhanced Input
```

### 3. Import HoloScript Output

1. Copy `build/unreal/Source/` to `YourProject/Source/`
2. Copy `build/unreal/Content/` to `YourProject/Content/`
3. Right-click .uproject → Generate Visual Studio project files
4. Build solution in Visual Studio
5. Open in Unreal Editor

## Platform-Specific Builds

### PCVR (SteamVR)

**Project Settings:**
```
Edit > Project Settings
- Platforms > Windows > Target RHI: DirectX 12
- VR > Start in VR: True
- VR > Enable Stereo Rendering: True
```

**Target:** 90-120 FPS

### Quest (via Link/Air Link)

**Project Settings:**
```
- Platforms > Android
- Build > Support Vulkan: True
- Rendering > Mobile Multi-View: True
```

**Optimize:**
- Forward Shading Renderer
- Mobile HDR: False
- Target 72-90 FPS

### Standalone VR (Valve Index, Vive)

**Settings:**
- OpenXR as primary VR plugin
- Steam VR as fallback
- Motion controller support enabled

## HoloScript → Unreal Mappings

| HoloScript | Unreal Equivalent |
|------------|------------------|
| `composition` | Level with Game Mode |
| `object#name` | Actor with Components |
| `@physics` | Static Mesh + Physics |
| `@interactive` | Grab Component (VR) |
| `camera#player @vr` | Pawn with VR Camera |
| `light#sun` | Directional Light Actor |
| `audio#bgm` | Audio Component |
| `ui#hud` | Widget Blueprint |

## Example: VR Interaction

**HoloScript:**
```holoscript
object#cube @physics @interactive {
  type: "cube"
  mass: 1.0

  on_grab {
    vibrate_controller: { intensity: 0.8 }
  }
}
```

**Generated Unreal C++ Header:**
```cpp
// CubeActor.h
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "CubeActor.generated.h"

UCLASS()
class MYPROJECT_API ACubeActor : public AActor
{
    GENERATED_BODY()

public:
    ACubeActor();

    UPROPERTY(VisibleAnywhere)
    UStaticMeshComponent* MeshComponent;

    UPROPERTY(VisibleAnywhere)
    UGrabComponent* GrabComponent;

    UFUNCTION()
    void OnGrab(UMotionControllerComponent* Controller);
};
```

**Generated Unreal C++ Source:**
```cpp
// CubeActor.cpp
#include "CubeActor.h"

ACubeActor::ACubeActor()
{
    MeshComponent = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
    RootComponent = MeshComponent;

    MeshComponent->SetSimulatePhysics(true);
    MeshComponent->SetMassOverrideInKg(NAME_None, 1.0f, true);

    GrabComponent = CreateDefaultSubobject<UGrabComponent>(TEXT("Grab"));
    GrabComponent->OnGrabbed.AddDynamic(this, &ACubeActor::OnGrab);
}

void ACubeActor::OnGrab(UMotionControllerComponent* Controller)
{
    Controller->PlayHapticEffect(HapticEffect, 0.8f);
}
```

## Performance Tips

### Target Frame Rates
- **PCVR (Index, Vive)**: 90-120 FPS
- **Quest via Link**: 72-90 FPS
- **PSVR2**: 90-120 FPS

### Optimization Checklist
- [ ] Use Forward Shading Renderer (VR-optimized)
- [ ] Enable Instanced Stereo Rendering
- [ ] Use LODs (3-4 levels recommended)
- [ ] Bake lighting where possible
- [ ] Limit dynamic lights to 3-4
- [ ] Use Nanite for complex geometry (UE5)
- [ ] Enable Lumen for high-end PCVR (UE5)

### Unreal Insights Profiler
```
Session Frontend > Insights
- Frame time: <11.1ms (90 FPS) or <8.3ms (120 FPS)
- GPU time: <11.1ms
- Draw calls: <500-1000
```

### Shader Complexity View
```
Alt + 8 (in viewport)
Green = Good
Yellow = Moderate
Red = Too complex
```

## Troubleshooting

### C++ Compile Errors
1. Regenerate project files (right-click .uproject)
2. Clean solution in Visual Studio
3. Rebuild

### VR not launching
1. Enable OpenXR plugin
2. Set "Start in VR" to True
3. Check SteamVR is running

### Poor Quest performance
- Switch to Forward Renderer
- Disable Lumen (use baked lighting)
- Reduce texture sizes
- Use Mobile Preview (ES3.1) for testing

### Black screen in VR
- Check VR Preview mode (Alt + P)
- Ensure VR Camera is at player start
- Verify HMD is primary display

## Advanced Features

### Blueprints Integration
HoloScript objects can be extended with Blueprints:
```
1. Find generated Actor in Content Browser
2. Right-click > Create Blueprint Class
3. Add custom Blueprint logic
```

### Material System
```holoscript
object#gem {
  material {
    type: "pbr"
    base_color: #00ffff
    metallic: 1.0
    roughness: 0.1
    emissive: #00ffff
    emissive_intensity: 5.0
  }
}
```

Compiles to Unreal Material with PBR nodes.

### Niagara Particles
```holoscript
particle_effect#explosion {
  type: "burst"
  particle_count: 100
  lifetime: 2.0
  color: #ff8800
  size: { min: 0.1, max: 0.5 }
}
```

### Metasounds Audio
```holoscript
audio#3d_sound @positional {
  source: "explosion.wav"
  attenuation: {
    min_distance: 1
    max_distance: 50
    rolloff: "linear"
  }
}
```

## Packaging for Distribution

### Windows PCVR
```
File > Package Project > Windows (64-bit)
- Shipping configuration
- Include prerequisites
```

### Quest (Android)
```
File > Package Project > Android (Multi)
- Development or Shipping
- Deploy via SideQuest or Meta Store
```

## Resources

- [Unreal VR Documentation](https://docs.unrealengine.com/5.1/en-US/developing-for-virtual-reality-in-unreal-engine/)
- [OpenXR Plugin](https://docs.unrealengine.com/5.1/en-US/openxr-in-unreal-engine/)
- [Performance Guidelines](https://docs.unrealengine.com/5.1/en-US/performance-and-profiling-in-unreal-engine/)

---

**Ready for high-fidelity VR?** Compile your HoloScript and experience Unreal's stunning graphics!
