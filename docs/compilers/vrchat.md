# VRChat Compiler

**Target**: `--target vrchat` | **Output**: UdonSharp C# | **Platform**: VRChat SDK3

## VRChat Compiler

Compiles HoloScript to VRChat SDK3 worlds with UdonSharp scripts.

### Features

- UdonSharp C# scripts for interactions
- Unity scene structure compatible with VRChat SDK3
- VRC_Pickup, VRC_Trigger, VRC_ObjectSync components
- Avatar pedestals, mirrors, portals
- Spatial audio with VRC_SpatialAudioSource

### Usage

```bash
holoscript compile my-world.holo --target vrchat --output ./vrchat-output/
```

### Output Files

- `WorldSetup.cs` - Main world setup script
- `*_Udon.cs` - Individual Udon scripts for interactive objects
- `PrefabHierarchy.txt` - Unity prefab structure
- `WorldDescriptor.json` - VRChat world configuration

### Example

```holo
composition "VRChat Demo" {
  environment {
    skybox: "sunset"
    ambient_light: 0.4
  }

  object "PickupCube" {
    @grabbable
    @networked
    geometry: "cube"
    position: [0, 1, 0]
    color: "#ff6600"
  }

  object "WorldPortal" {
    @portal
    geometry: "torus"
    position: [5, 1.5, 0]
    destination: "wrld_12345678"
  }
}
```

## See Also

- [Platform Overview](/compilers/)
- [VRChat Unity Workflow](/compilers/vrchat-unity-workflow)
- [VRChat Optimization](/compilers/vrchat-optimization)
