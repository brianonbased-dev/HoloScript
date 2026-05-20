# Godot Compiler

**Target**: `--target godot` | **Output**: GDScript | **Platform**: Godot Engine 4.x

Compiles HoloScript to GDScript for Godot Engine 4.x (including physics, XR, UI, audio, timelines).

## Usage

```bash
holoscript compile scene.holo --target godot --output ./scenes/
```

## Physics Scenes (validated)

HoloScript physics traits map cleanly to Godot 4 nodes:

- `@physics` + `@rigid` / `@static` → RigidBody3D + CollisionShape3D
- `shape: sphere|box|capsule` → corresponding CollisionShape
- `@grabbable`, `@throwable`, `@collidable` → Godot interaction + physics bodies
- Mass, friction, restitution, etc. → Godot physics material properties

**Minimal validated physics example** (compiles and produces valid GDScript with RigidBody3D):

```holo
composition "Physics Ball" {
  object "Ball" {
    @physics
    @rigid
    shape: sphere(0.5)
    mass: 1.0
    position: [0, 5, 0]
    color: "#ff8800"
  }
  floor "Ground" {
    @physics
    @static
    shape: box(10, 0.1, 10)
    position: [0, 0, 0]
  }
}
```

Compile:

```bash
holoscript compile physics-ball.holo --target godot --output ./godot-scenes/
```

The emitted GDScript creates a Node3D with RigidBody3D child for the ball and a static body for the floor — ready to import into Godot 4.3+.

**Evidence**: GodotCompiler.ts explicitly emits RigidBody3D, CollisionShape3D, PhysicsMaterial, etc. for the physics trait family (see physics body construction paths).

---

## See Also

- [Publishing & platform terms](/guides/publishing-platform-terms)
- [Platform Overview](/compilers/)
- [Unity Compiler](/compilers/unity)
- [Unreal Compiler](/compilers/unreal)
