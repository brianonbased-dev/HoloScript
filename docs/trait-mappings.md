# HoloScript Trait-to-Backend Mappings — Cross-Target Specification

> **Date**: 2026-04-13 | **Source**: Direct audit of 41 compiler files + 4 trait maps | **Traits**: 388 trait files, 369 registered handlers, 116 constant modules

HoloScript traits are declarative annotations (`@grabbable`, `@physics`, `@haptic`) that compile to platform-native code. This document shows exactly what each trait becomes on each target. 41 compiler implementations exist (verify via `find *Compiler.ts`); the cross-target tables below cover the 11 with the deepest trait mapping.

## Trait Resolution Pipeline

```text
.holo source                Parser                     Compiler                  Runtime
─────────────────  ──────────────────────────  ──────────────────────────  ─────────────────────
object "Cube"      HoloCompositionParser.ts    R3FCompiler (or target)    VRTraitRegistry
  @grabbable       ─► tokenize @+IDENTIFIER    ─► R3FNode.traits Map     ─► grabbableHandler
  @physics         ─► parseTraitConfig()       ─► compileObjectDecl()    ─► onAttach()
{                  ─► HoloObjectTrait AST      ─► native code output     ─► onUpdate(delta)
  position: [0,1,0]                                                      ─► onDetach()
}
```

**Key files in pipeline:**

| Stage     | File                                       | LOC   |
| --------- | ------------------------------------------ | ----- |
| Parse     | `core/src/parser/HoloCompositionParser.ts` | 6,186 |
| Compile   | `core/src/compiler/R3FCompiler.ts`         | 4,002 |
| Registry  | `core/src/traits/VRTraitSystem.ts`         | 2,424 |
| Constants | `core/src/traits/constants/` (116 files)   | —     |

**Two architectural patterns:**

- **Inline handling** (Unity, Godot, Unreal, OpenXR) — `if/switch` on trait name inside compiler
- **External trait maps** (visionOS, AndroidXR, AI Glasses, NIR) — dedicated `*TraitMap.ts` files

---

## Cross-Target Mapping Tables

Legend: **F** = full | **P** = partial | **C** = comment/stub | **—** = unsupported

### Interaction Traits

| Trait            | R3F | Unity | Godot | Unreal | visionOS | AndroidXR | OpenXR | Babylon | URDF | NIR |
| ---------------- | --- | ----- | ----- | ------ | -------- | --------- | ------ | ------- | ---- | --- |
| `@grabbable`     | C   | F     | P     | F      | F        | F         | P      | F       | —    | —   |
| `@physics`       | C   | F     | F     | F      | F        | F         | P      | F       | F    | —   |
| `@hand_tracking` | C   | F     | P     | F      | F        | F         | F      | P       | —    | P   |
| `@haptic`        | C   | F     | P     | F      | F        | F         | F      | P       | —    | —   |
| `@eye_tracking`  | C   | F     | P     | F      | F        | F         | P      | P       | —    | P   |
| `@hoverable`     | F   | F     | F     | F      | F        | F         | P      | F       | —    | —   |
| `@throwable`     | C   | F     | F     | F      | P        | P         | P      | F       | —    | —   |
| `@scalable`      | F   | F     | F     | F      | F        | F         | P      | F       | —    | —   |

### Spatial & AR Traits

| Trait              | R3F | Unity | Godot | Unreal | visionOS | AndroidXR | OpenXR | Babylon | URDF | NIR |
| ------------------ | --- | ----- | ----- | ------ | -------- | --------- | ------ | ------- | ---- | --- |
| `@anchor`          | C   | F     | P     | F      | F        | F         | F      | F       | —    | —   |
| `@plane_detection` | C   | F     | P     | F      | F        | F         | C      | P       | —    | —   |
| `@image_tracking`  | —   | F     | —     | F      | F        | F         | —      | —       | —    | —   |
| `@passthrough`     | —   | F     | P     | F      | F        | F         | F      | —       | —    | —   |
| `@spatial_audio`   | F   | F     | F     | F      | F        | F         | P      | F       | —    | —   |
| `@networked`       | C   | F     | F     | F      | F        | F         | —      | C       | F    | —   |
| `@lod`             | F   | F     | F     | F      | P        | P         | —      | F       | —    | —   |

### Rendering Traits

| Trait       | R3F | Unity | Godot | Unreal | visionOS | AndroidXR | OpenXR | Babylon | URDF | NIR |
| ----------- | --- | ----- | ----- | ------ | -------- | --------- | ------ | ------- | ---- | --- |
| `@shader`   | F   | F     | F     | F      | F        | F         | P      | F       | —    | —   |
| `@emissive` | F   | F     | F     | F      | F        | F         | P      | F       | P    | —   |
| `@material` | F   | F     | F     | F      | F        | F         | P      | F       | P    | —   |
| `@draft`    | F   | —     | —     | —      | —        | —         | —      | —       | —    | —   |

### AI & Behavior Traits

| Trait            | R3F | Unity | Godot | Unreal | visionOS | AndroidXR | OpenXR | Babylon | URDF | NIR |
| ---------------- | --- | ----- | ----- | ------ | -------- | --------- | ------ | ------- | ---- | --- |
| `@ai_agent`      | C   | F     | F     | F      | P        | P         | —      | P       | F    | F   |
| `@behavior_tree` | C   | F     | F     | F      | P        | P         | —      | P       | F    | F   |
| `@snn`           | —   | —     | —     | —      | —        | —         | —      | —       | —    | F   |
| `@npc`           | C   | F     | F     | F      | P        | P         | —      | P       | F    | F   |

### Robotics Traits (URDF/ROS 2)

| Trait        | URDF Element                                         | ROS 2 Integration       |
| ------------ | ---------------------------------------------------- | ----------------------- |
| `@physics`   | `<inertial>` with `<mass>` + `<inertia>` tensor      | Gazebo physics sim      |
| `@sensor`    | `<sensor>` plugin (camera, IMU, lidar, force-torque) | `sensor_msgs/` topics   |
| `@actuator`  | `<transmission>` + `ros2_control`                    | Joint controllers       |
| `@joint`     | `<joint>` (revolute, prismatic, continuous)          | MoveIt2 planning        |
| `@camera`    | `<sensor type="camera">`                             | `sensor_msgs/Image`     |
| `@lidar`     | `<sensor type="ray">`                                | `sensor_msgs/LaserScan` |
| `@ai_agent`  | ROS 2 `nav2` stack                                   | BehaviorTree.CPP        |
| `@networked` | DDS topics                                           | Inter-robot comms       |

---

## Native Code Examples

### `@grabbable` — Same Trait, 6 Native Outputs

**Unity** (`UnityCompiler.ts:465–615`):

```csharp
var cubeRB = cubeGO.AddComponent<Rigidbody>();
cubeRB.mass = 2.5f;
cubeRB.useGravity = true;
var cubeGrab = cubeGO.AddComponent<XRGrabInteractable>();
```

**visionOS** (`VisionOSTraitMap.ts:116–141`):

```swift
cube.components.set(InputTargetComponent(allowedInputTypes: .indirect))
cube.components.set(HoverEffectComponent())
let dragGesture = DragGesture()
    .targetedToEntity(cube)
    .onChanged { value in
        cube.position = /* calculate from translation */
    }
```

**AndroidXR** (`AndroidXRTraitMap.ts:88–100`):

```kotlin
val cubeMovable = MovableComponent.createSystemMovable(session)
cube.addComponent(cubeMovable)
val cubeInteractable = InteractableComponent.create(session, executor) { event ->
    if (event.source == InputEvent.Source.HANDS &&
        event.action == InputEvent.Action.ACTION_DOWN) {
        // Grab initiated
    }
}
```

**OpenXR** (`OpenXRCompiler.ts`):

```cpp
bool cube_grabbed = false;
XrActionStateFloat grabState;
xrGetActionStateFloat(session, &getInfo, &grabState);
if (grabState.currentState > 0.8f && !cube_grabbed) {
    cube_grabbed = true;
}
```

**Godot** (`GodotCompiler.ts`):

```gdscript
var cube_body = RigidBody3D.new()
cube_body.mass = 2.5
# XRController3D grab signal connection
```

**Unreal** (`UnrealCompiler.ts`):

```cpp
auto* CubeGrab = NewObject<UGrabComponent>(CubeActor);
CubeGrab->SetupAttachment(CubeActor->GetRootComponent());
CubeGrab->RegisterComponent();
```

---

### `@physics` — Same Trait, 5 Native Outputs

**Unity**:

```csharp
var cubeRB = cubeGO.AddComponent<Rigidbody>();
cubeRB.mass = 2.5f;
cubeRB.useGravity = true;
cubeRB.isKinematic = false;
```

**visionOS** (`VisionOSTraitMap.ts:57–76`):

```swift
cube.components.set(CollisionComponent(
    shapes: [.generateConvex(from: cubeMesh)]
))
var cubePhysics = PhysicsBodyComponent(
    massProperties: .init(mass: 2.5),
    mode: .dynamic
)
cube.components.set(cubePhysics)
```

**URDF** (`URDFCompiler.ts`):

```xml
<inertial>
  <mass value="2.5"/>
  <inertia ixx="0.1" ixy="0" ixz="0"
           iyy="0.1" iyz="0" izz="0.1"/>
</inertial>
```

**OpenXR** (`OpenXRCompiler.ts`):

```cpp
glm::vec3 cube_velocity(0.0f);
float cube_mass = 2.5f;
// Physics step:
cube_velocity.y -= 9.81f * deltaTime;
cube_position += cube_velocity * deltaTime;
```

**Godot**:

```gdscript
var cube_body = RigidBody3D.new()
cube_body.mass = 2.5
cube_body.gravity_scale = 1.0
```

---

### `@hand_tracking` — Platform Divergence

**OpenXR** (full 26-joint skeleton, `OpenXRCompiler.ts:1016–1076`):

```cpp
XrHandTrackerCreateInfoEXT createInfo{XR_TYPE_HAND_TRACKER_CREATE_INFO_EXT};
createInfo.hand = XR_HAND_LEFT_EXT;
createInfo.handJointSet = XR_HAND_JOINT_SET_DEFAULT_EXT;
xrCreateHandTrackerEXT(session, &createInfo, &handTrackerLeft);

// Per-frame:
XrHandJointLocationsEXT locations{XR_TYPE_HAND_JOINT_LOCATIONS_EXT};
std::array<XrHandJointLocationEXT, XR_HAND_JOINT_COUNT_EXT> jointLocations;
xrLocateHandJointsEXT(handTrackerLeft, &locateInfo, &locations);
```

**NIR** (spike-encoded gesture classification, `NIRTraitMap.ts:702–735`):

```python
nodes: [
  { id: "hand_pose_encoder", type: "SpikeEncoder",
    params: { method: "rate", max_frequency: 100, dt: 0.001 } },
  { id: "gesture_classifier", type: "LIF",
    params: { tau: [0.02]*256, v_threshold: [1.0]*256 } }
],
edges: [
  { from: "hand_pose_encoder", to: "gesture_classifier",
    weight: { shape: [78, 256] } }
]
```

---

### `@anchor` — Spatial Anchor Across Platforms

**OpenXR** (`OpenXRCompiler.ts:601–618`):

```cpp
XrSpatialAnchorMSFT cube_anchor = XR_NULL_HANDLE;
XrSpatialAnchorCreateInfoMSFT anchorInfo{XR_TYPE_SPATIAL_ANCHOR_CREATE_INFO_MSFT};
anchorInfo.space = appSpace;
anchorInfo.pose.position = {0.0f, 1.5f, -2.0f};
xrCreateSpatialAnchorMSFT(session, &anchorInfo, &cube_anchor);
```

**visionOS** (`VisionOSTraitMap.ts:255–270`):

```swift
let cubeAnchor = AnchorEntity(.world(transform: cubeTransform))
cube.setParent(cubeAnchor)
```

---

## Platform Coverage Summary

| Platform       | Full | Partial | Comment | Unsupported | Trait Map File                            |
| -------------- | ---- | ------- | ------- | ----------- | ----------------------------------------- |
| **Unity**      | 75+  | 15      | 10      | 5           | Inline (`UnityCompiler.ts`, 918 LOC)      |
| **Unreal**     | 80+  | 10      | 5       | 10          | Inline (`UnrealCompiler.ts`, 851 LOC)     |
| **visionOS**   | 100+ | 5       | 2       | 0           | `VisionOSTraitMap.ts` (1,329 LOC)         |
| **AndroidXR**  | 100+ | 3       | 2       | 0           | `AndroidXRTraitMap.ts` (3,632 LOC)        |
| **Godot**      | 60+  | 20      | 10      | 15          | Inline (`GodotCompiler.ts`, 859 LOC)      |
| **BabylonJS**  | 50+  | 25      | 15      | 15          | Inline (`BabylonCompiler.ts`, 971 LOC)    |
| **R3F**        | 30+  | 20      | 40      | 15          | Inline (`R3FCompiler.ts`, 4,002 LOC)      |
| **OpenXR**     | 20+  | 30      | 40      | 15          | Inline (`OpenXRCompiler.ts`, 1,213 LOC)   |
| **NIR**        | 25   | 10      | 5       | 65          | `NIRTraitMap.ts` (983 LOC)                |
| **AI Glasses** | 23   | 12      | 13      | 60          | `AIGlassesTraitMap.ts` (1,373 LOC)        |
| **URDF**       | 15   | 5       | 0       | 85          | Inline (`URDFCompiler.ts`, 2,030 LOC)     |

**AI Glasses constraint breakdown** (`AIGlassesTraitMap.ts`):

- 55.6% traits blocked by form factor (no 3D rendering, no depth sensors, no hand tracking)
- 21.3% fully supported (2D overlays, voice, touchpad, notifications)

---

## Platform-Exclusive Traits

### visionOS Only (Apple Vision Pro)

| Trait              | Native Code             | Requires             |
| ------------------ | ----------------------- | -------------------- |
| `@spatial_persona` | `SpatialPersonaSession` | visionOS 2.0+        |
| `@shareplay`       | `GroupSession`          | FaceTime integration |
| `@object_capture`  | `ObjectCaptureSession`  | Photogrammetry       |

### AndroidXR Only (Google)

| Trait            | Native Code                              | Requires   |
| ---------------- | ---------------------------------------- | ---------- |
| `@face_tracking` | `FaceTrackingComponent` (68 blendshapes) | ARCore     |
| `@follows_head`  | `FollowsHeadComponent`                   | Jetpack XR |
| `@drm_video`     | `DRMVideoComponent`                      | Widevine   |

### NIR Only (Neuromorphic)

| Trait            | Native Code                         | Hardware                       |
| ---------------- | ----------------------------------- | ------------------------------ |
| `@snn`           | LIF/CubaLIF neurons, spike encoders | Loihi 2, SpiNNaker 2, SynSense |
| `@hand_tracking` | Spike-train gesture classifier      | Neuromorphic coprocessor       |

---

## Trait Handler Lifecycle

Every trait handler in `VRTraitSystem.ts` follows this interface:

```typescript
interface TraitHandler<T = unknown> {
  name: VRTraitName;
  defaultConfig: T;
  onAttach?(node, config, context): void; // Scene enter
  onUpdate?(node, config, context, delta): void; // Per-frame
  onEvent?(node, config, context, event): void; // Reactive
  onDetach?(node, context): void; // Scene exit
}
```

Example — `@grabbable` handler (`VRTraitSystem.ts:468–576`):

```typescript
const grabbableHandler: TraitHandler<GrabbableTrait> = {
  name: 'grabbable',
  defaultConfig: {
    snap_to_hand: true,
    two_handed: false,
    haptic_on_grab: 0.5,
    distance_grab: false,
    max_grab_distance: 3,
  },
  onAttach(node, _config, _context) {
    (node as any).__grabState = {
      isGrabbed: false,
      grabbingHand: null,
      grabOffset: [0, 0, 0],
    };
  },
  onUpdate(node, config, context, delta) {
    // Check VR hand input, apply physics constraints
  },
  onDetach(node) {
    delete (node as any).__grabState;
  },
};
```

---

## Verification

To verify trait coverage for any compiler:

```bash
# Count registered handlers (369 as of 2026-04-13)
grep -c "this.register" packages/core/src/traits/VRTraitSystem.ts

# Count trait files (388 as of 2026-04-13)
find packages/core/src/traits -maxdepth 1 -name "*.ts" -not -name "*.test.*" | wc -l

# Count constant modules (116 as of 2026-04-13)
find packages/core/src/traits/constants -maxdepth 1 -name "*.ts" | wc -l

# Count compiler implementations (41 as of 2026-04-13)
find packages/core/src/compiler -name "*Compiler.ts" -not -name "CompilerBase*" -not -name "*.test.*" | wc -l

# List all trait map files
ls packages/core/src/compiler/*TraitMap*.ts

# Count traits handled by a specific compiler
grep -c "trait\|@" packages/core/src/compiler/UnityCompiler.ts
```
