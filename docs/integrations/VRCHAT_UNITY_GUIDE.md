# VRChat & Unity Export Guide

Complete guide for exporting HoloScript to VRChat worlds and Unity projects.

---

## Overview

HoloScript provides two paths to Unity:

| Package                     | Target          | Output                      | Status   |
| --------------------------- | --------------- | --------------------------- | -------- |
| `@holoscript/vrchat-export` | VRChat          | UdonSharp scripts + prefabs | ✅ Alpha |
| `@holoscript/unity-adapter` | Unity (general) | C# MonoBehaviours + prefabs | ✅ Ready |

```
                    ┌─────────────────────────┐
                    │   .hsplus (HoloScript)  │
                    └───────────┬─────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
    │ three-adapter   │ │ unity-adapter   │ │ vrchat-export   │
    │ (Web/WebXR)     │ │ (Unity C#)      │ │ (VRChat/Udon)   │
    └─────────────────┘ └─────────────────┘ └─────────────────┘
              │                 │                 │
              ▼                 ▼                 ▼
    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
    │ Browser / Quest │ │ Unity Project   │ │ VRChat World    │
    │ via WebXR       │ │ Any platform    │ │ PC / Quest      │
    └─────────────────┘ └─────────────────┘ └─────────────────┘
```

---

## VRChat Export (Udon)

### Prerequisites

1. **Unity 2022.3.22f1** (VRChat current version)
2. **VRChat Creator Companion** installed
3. **VRChat SDK** (World SDK 3.5+)
4. **UdonSharp** package

### Quick Start

```bash
# Install
npm install @holoscript/vrchat-export

# Export via CLI
holoscript export --target vrchat --output ./my-vrchat-world
```

### Programmatic Export

```typescript
import { HoloScriptPlusParser } from '@holoscript/core';
import { exportToVRChat } from '@holoscript/vrchat-export';

const parser = new HoloScriptPlusParser();
const { ast } = parser.parse(`
  composition "MyVRChatWorld" {
    environment {
      name: "My VRChat World"
      spawn_point: [0, 0, 0]
      max_players: 32
    }

    template "Ball" {
      @grabbable
      @throwable
      geometry: "sphere"
      color: "#ff0000"
    }

    template "Platform" {
      @climbable
      geometry: "box"
    }

    object "Ball" using "Ball" {
      position: [0, 1, 0]
    }

    object "Platform" using "Platform" {
      position: [0, -0.5, 0]
      scale: [10, 1, 10]
    }
  }
`);

const result = await exportToVRChat(ast, {
  outputDir: './VRChatWorld/Assets/HoloScript',
  projectName: 'MyWorld',
});

console.log(`Generated ${result.stats.prefabCount} prefabs`);
console.log(`Generated ${result.stats.scriptCount} UdonSharp scripts`);
```

### HoloScript to Udon Trait Mapping

| HoloScript Trait   | VRChat/Udon Equivalent     |
| ------------------ | -------------------------- |
| `@grabbable`       | VRC_Pickup                 |
| `@throwable`       | VRC_Pickup + ThrowVelocity |
| `@portal`          | VRCPortalMarker            |
| `@synced`          | UdonSynced variable        |
| `@networked`       | Manual sync + ownership    |
| `@audio`           | VRC_SpatialAudioSource     |
| `@video`           | VRC_AVProVideoPlayer       |
| `@mirror`          | VRC_MirrorReflection       |
| `@avatar_pedestal` | VRC_AvatarPedestal         |

### VRChat-Specific Syntax

```hsplus
composition "MyCoolWorld" {
  environment {
    name: "My Cool World"
    spawn_point: [0, 0, 0]
    respawn_height: -10
    max_players: 32
  }

  // VRChat pickup template
  template "Pickup" {
    @grabbable
    geometry: "box"
    pickupable: true
    auto_hold: "auto_detect"
    proximity: 0.1
  }

  // Synced template (network replicated)
  template "NetworkedBall" {
    @grabbable
    @synced
    geometry: "sphere"
    sync_mode: "manual"
    owner_only: true
  }

  // Portal template
  template "WorldPortal" {
    geometry: "portal"
    world_id: "wrld_xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    instance_type: "public"
  }

  object "Pickup" using "Pickup" {
    position: [0, 1, 0]
  }

  object "NetworkedBall" using "NetworkedBall" {
    position: [0, 2, 0]
  }

  object "WorldPortal" using "WorldPortal" {
    position: [5, 0, 0]
  }
}
```

### Export Workflow

```
1. Write HoloScript (.hsplus)
        │
        ▼
2. Run: holoscript export --target vrchat
        │
        ▼
3. Open Unity with VRChat SDK
        │
        ▼
4. Import generated files to Assets/
        │
        ▼
5. Build & Test (VRChat SDK → Build & Test)
        │
        ▼
6. Upload to VRChat
```

---

## Unity Export (General)

For non-VRChat Unity projects using standard XR frameworks.

### Prerequisites

1. **Unity 2021.3+** (LTS recommended)
2. **XR Plugin Management** package
3. **XR Interaction Toolkit** (or Oculus/SteamVR SDK)

### Quick Start

```bash
npm install @holoscript/unity-adapter
```

### Programmatic Export

```typescript
import { exportToUnity } from '@holoscript/unity-adapter';

const result = await exportToUnity(ast, {
  outputDir: './UnityProject/Assets/HoloScript',
  projectName: 'MyVRGame',
  xrFramework: 'xr-interaction-toolkit', // or 'oculus', 'steamvr'
});
```

### XR Framework Options

| Framework                | Best For                          |
| ------------------------ | --------------------------------- |
| `xr-interaction-toolkit` | Cross-platform (Quest, PC VR, AR) |
| `oculus`                 | Meta Quest optimization           |
| `steamvr`                | PC VR via SteamVR/OpenVR          |
| `none`                   | Non-XR Unity projects             |

---

## Side-by-Side Comparison

### Same HoloScript, Different Targets

**Source (.hsplus):**

```hsplus
composition "BallDemo" {
  template "Ball" {
    @grabbable
    geometry: "sphere"
    color: "#ff0000"
  }

  object "Ball" using "Ball" {
    position: [0, 1, 0]
  }
}
```

**VRChat Export (UdonSharp):**

```csharp
using UdonSharp;
using VRC.SDKBase;
using VRC.Udon;

public class Ball : UdonSharpBehaviour
{
    [UdonSynced] private Vector3 position;

    void Start()
    {
        transform.position = new Vector3(0, 1, 0);
    }

    public override void OnPickup()
    {
        Networking.SetOwner(Networking.LocalPlayer, gameObject);
    }
}
```

**Unity Export (C#):**

```csharp
using UnityEngine;
using UnityEngine.XR.Interaction.Toolkit;

public class Ball : MonoBehaviour
{
    private void Awake()
    {
        transform.position = new Vector3(0, 1, 0);
    }

    public void OnSelectEntered(SelectEnterEventArgs args)
    {
        Debug.Log($"{gameObject.name} grabbed");
    }
}
```

---

## Best Practices

### 1. Design for Multiple Targets

```hsplus
composition "CrossPlatformItem" {
  // Use standard traits that map to both VRChat and Unity
  template "Item" {
    @grabbable
    @physics
    geometry: "sphere"
  }

  object "Item" using "Item" {
    position: [0, 1, 0]
  }
}
```

### 2. Use Conditional Compilation

```hsplus
// VRChat-specific
@if target == "vrchat" {
  portal#spawn {
    world_id: "wrld_xxx"
  }
}

// Unity-specific
@if target == "unity" {
  teleporter#spawn {
    scene: "MainMenu"
  }
}
```

### 3. Test in Web First

The Three.js adapter provides instant preview:

```typescript
// Fast iteration in browser
import { createWorld } from '@holoscript/three-adapter';

const world = createWorld({ container: document.body });
await world.loadFile('./scene.hsplus');
world.start();
```

Then export to Unity/VRChat when ready.

---

## CLI Commands

```bash
# Export to VRChat
holoscript export scene.hsplus --target vrchat --output ./VRChatProject

# Export to Unity
holoscript export scene.hsplus --target unity --output ./UnityProject/Assets

# Preview in browser first
holoscript dev scene.hsplus
```

---

## Troubleshooting

### VRChat Export Issues

| Issue                  | Solution                       |
| ---------------------- | ------------------------------ |
| "UdonSharp not found"  | Install UdonSharp via VCC      |
| "SDK version mismatch" | Use Unity 2022.3.22f1          |
| "Pickup not working"   | Add Rigidbody, set isKinematic |
| "Sync not working"     | Check ownership transfer       |

### Unity Export Issues

| Issue                        | Solution                          |
| ---------------------------- | --------------------------------- |
| "XRGrabInteractable missing" | Install XR Interaction Toolkit    |
| "Namespace conflict"         | Change `projectName` in config    |
| "Prefab won't import"        | Check Unity version compatibility |

---

## See Also

- [HoloScript Language Reference](./HOLOSCRIPT_REFERENCE.md)
- [Three.js Adapter](../packages/three-adapter/README.md)
- [VRChat Creator Companion](https://vcc.docs.vrchat.com/)
- [Unity XR Interaction Toolkit](https://docs.unity3d.com/Packages/com.unity.xr.interaction.toolkit@2.5/manual/index.html)

---

## License

MIT - HoloScript packages are open source.
