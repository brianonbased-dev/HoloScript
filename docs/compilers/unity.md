# Unity Compiler

**Target**: `--target unity` | **Output**: C# MonoBehaviour | **Platform**: Unity Engine (2021+)

Compiles HoloScript to Unity-compatible C# code with MonoBehaviour scripts, prefab hierarchies, and scene setup.

## Usage

```bash
holoscript compile scene.holo --target unity --output ./Assets/Generated/
```

## Output Files

- `GeneratedScene.cs` — MonoBehaviour with component setup
- `GeneratedScene.prefab` — Unity prefab (when enabled)
- `GeneratedScene_Materials/` — Material assets

## Options

```bash
# Generate prefabs
holoscript compile scene.holo --target unity --prefabs

# Target specific Unity version
holoscript compile scene.holo --target unity --unity-version 2023.2
```

## Example

```holo
composition "Unity Demo" {
  object "Player" {
    @physics
    @collidable
    @grabbable
    geometry: "capsule"
    position: [0, 1, 0]
  }

  light "Sun" {
    type: "directional"
    intensity: 2.0
    cast_shadows: true
  }
}
```

## Trait Support

| Trait | Unity Component |
|-------|----------------|
| `@physics` | Rigidbody |
| `@collidable` | Collider |
| `@grabbable` | XR Grab Interactable |
| `@networked` | Unity Netcode |
| `@animation` | Animator |

## See Also

- [Platform Overview](/compilers/)
- [Unreal Compiler](/compilers/unreal)
- [Godot Compiler](/compilers/godot)
- [Interaction Traits](/traits/interaction)
