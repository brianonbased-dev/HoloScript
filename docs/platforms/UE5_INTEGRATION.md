# Unreal Engine 5 Integration Guide (v3.5)

HoloScript v3.4 introduced a high-performance Unreal Engine 5 (UE5) compiler target that converts `.holo` files directly into C++ Source. This guide covers how to integrate, extend, and optimize these generated actors in your UE5 projects.

---

## 🏗️ Architecture Overview

The UE5 target compiles HoloScript compositions into **AActor**-derived C++ classes. Each HoloScript `object` is mapped to an appropriate **UActorComponent**.

| HoloScript Construct | UE5 Equivalent                                          |
| :------------------- | :------------------------------------------------------ |
| `object`             | `AActor` or `USceneComponent`                           |
| `geometry: "cube"`   | `UStaticMeshComponent` (Cube mesh)                      |
| `light`              | `ULightComponent` (Point, Spot, or Directional)         |
| `@physics`           | `SetSimulatePhysics(true)` on root component            |
| `@networked`         | `AActor::SetReplicates(true)` + `UPROPERTY(Replicated)` |

---

## 🛠️ Integration Steps

### 1. Compile the Script

Run the HoloScript CLI to generate the C++ source files.

```bash
holoscript compile my-scene.holo --target unreal --output ./Source/MyProject/Generated/
```

### 2. Add to Unreal Project

1. Copy the generated `.h` and `.cpp` files to your project's `Source` directory.
2. In Unreal Editor, select **Tools > Refresh Visual Studio Project**.
3. Compile the project in your IDE or via Unreal's Live Coding.

### 3. Usage in Blueprint

Once compiled, your HoloScript scene appears as a standard C++ Actor class. You can:

- Drag and drop it into the level.
- Spawn it via `SpawnActorFromClass`.
- Build Child Blueprints from it to add visual assets or Niagara effects.

---

## 🔗 The HoloBridge C++ Class

For dynamic script execution (non-compiled mode), use the `UHoloBridgeComponent`.

```cpp
// MyActor.h
UCLASS()
class MYPROJECT_API AMyInteractiveActor : public AActor {
    GENERATED_BODY()

public:
    UPROPERTY(VisibleAnywhere)
    UHoloBridgeComponent* HoloBridge;

    virtual void BeginPlay() override;
};

// MyActor.cpp
void AMyInteractiveActor::BeginPlay() {
    Super::BeginPlay();
    HoloBridge->LoadScript("path/to/script.holo");
}
```

---

## ⚡ Optimization & Best Practices

### Nanite & Lumen

The HoloScript compiler automatically flags generated meshes for Nanite if the vertex count exceeds 10,000. To force Nanite for specific objects:

```holo
object HighPolyModel {
    geometry: "models/statue.fbx"
    unreal_options: {
        nanite: true
        lumen_detail: 2.0
    }
}
```

### Niagara Particles

You can trigger Niagara systems from HoloScript events:

```hsplus
object Torch {
    @onItemIgnited: {
        self.trigger_particle("NS_Fire")
    }
}
```

---

## 🚩 Security & Constraints

- **Private Variables**: Variables in HoloScript are mapped to `private` C++ members with `public` Getters/Setters.
- **Multithreading**: Script-driven transforms are executed on the Game Thread during `Tick`. Heavy logic should be moved to specialized C++ `Async` tasks if possible.
