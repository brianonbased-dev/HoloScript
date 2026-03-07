# Cross-Compilation Benchmark Suite

> Comprehensive compatibility analysis of HoloScript compositions across all compilation targets.
> Generated from compiler source analysis at `packages/core/src/compiler/`.

## Overview

This benchmark documents which HoloScript verticals compile to which platform targets,
including expected output formats, estimated sizes, required traits, and known feature gaps.

**Verticals tested:** Healthcare, Industrial IoT, Robotics, visionOS, Gaming, Web3, E-Commerce
**Compilation targets:** Three.js (R3F), Unity, Unreal, Godot, URDF, SDF, DTDL, visionOS, VRChat, WebGPU, Babylon.js

---

## 1. Representative Compositions

| Vertical | Composition | Source File | Objects | Traits Used |
|---|---|---|---|---|
| Healthcare | Healthcare Starter | `examples/domain-starters/healthcare/healthcare-starter.holo` | 12 | `@billboard`, `@anchor`, `@clickable`, `@glowing`, `@hand_tracked`, `@scalable`, `@rotatable` |
| Industrial IoT | Industrial IoT Starter | `examples/domain-starters/industrial-iot/industrial-iot-starter.holo` | 10 | `@clickable`, `@glowing`, `@collidable` |
| Robotics | UR5 Robot Arm | `examples/specialized/robotics/robot-arm-simulation.holo` | 25+ | `@collidable`, `@rotatable`, `@grabbable`, `@physics`, `@glowing`, `@clickable`, `@sensor` |
| visionOS | visionOS Productivity Space | `examples/platforms/visionos-app.holo` | 11 | `@window`, `@resizable`, `@eye_tracked`, `@hand_tracked`, `@volumetric`, `@scalable`, `@ornament`, `@portal`, `@palm_menu`, `@spatial_video` |
| Gaming | Spatial RPG | `examples/showcase/spatial-rpg.holo` | 15+ | `@networked`, `@collidable`, `@agent`, `@interactive`, `@dialogue`, `@spatial` |
| Web3 | NFT Marketplace | `examples/nft-marketplace-basic.holo` | N/A (contract-level) | N/A (uses NFT marketplace AST, not HoloComposition) |
| E-Commerce | Product Viewer | `examples/product-viewer.holo` | 6 | `@collidable`, `@grabbable`, `@animated`, `@glowing`, `@pointable` |

---

## 2. Compatibility Matrix

Legend:
- **F** = Full support (all traits compile, no known gaps)
- **P** = Partial support (core geometry/scene compiles, some traits emit TODOs or comments)
- **M** = Minimal support (basic structure only, most domain-specific traits unsupported)
- **N** = Not applicable / no compiler pathway
- **S** = Specialized (uses dedicated compiler, not general HoloComposition pipeline)

| Vertical \ Target | R3F (Three.js) | Unity | Unreal | Godot | URDF | SDF | DTDL | visionOS | VRChat | WebGPU | Babylon.js |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Healthcare** | F | F | P | F | N | N | N | F | P | P | F |
| **Industrial IoT** | F | F | P | F | N | N | **S** | P | N | F | F |
| **Robotics** | P | P | P | P | **S** | **S** | M | N | N | M | P |
| **visionOS** | P | P | M | M | N | N | N | **S** | M | M | P |
| **Gaming** | F | F | F | F | N | N | N | P | F | P | F |
| **Web3** | N | N | N | N | N | N | N | N | N | N | N |
| **E-Commerce** | F | F | P | F | N | N | N | F | P | P | F |

> **Note on Web3:** The NFT Marketplace vertical uses a dedicated `NFTMarketplaceCompiler` that accepts
> `NFTMarketplaceAST` (not `HoloComposition`). It outputs Solidity contracts, deployment scripts, and
> gas analysis reports. It does not compile to any of the scene-based targets listed above.

---

## 3. Detailed Composition-Target Analysis

### 3.1 Healthcare Starter

**Source:** `examples/domain-starters/healthcare/healthcare-starter.holo`
**Primary use:** Patient monitoring dashboards, AR anatomy viewing, guided procedure steps.
**Listed platforms:** `ios`, `android`, `openxr`

| Target | Output Format | Est. Output Size | Required Traits | Feature Gaps |
|---|---|---|---|---|
| **R3F (Three.js)** | JSX/TSX (React Three Fiber) | ~8-12 KB | `@billboard`, `@anchor`, `@clickable`, `@glowing`, `@hand_tracked`, `@scalable`, `@rotatable` | Hand gesture recognition requires external library (e.g., `@react-three/xr`). `@hand_tracked` generates skeleton setup but gesture handlers emit TODO comments. |
| **Unity** | C# MonoBehaviour `.cs` | ~15-20 KB | Same as above | Full support. `@hand_tracked` maps to XR Interaction Toolkit. `@billboard` maps to `LookAt` constraint. UI panels emit Unity Canvas elements. |
| **Unreal** | C++ `.h` + `.cpp` | ~25-35 KB (header + source) | Same | `@billboard` maps to UBillboardComponent but spatial UI panels require UMG Widget setup which is partially generated. `@hand_tracked` generates Enhanced Input bindings with TODO placeholders for hand mesh setup. |
| **Godot** | GDScript `.gd` | ~10-14 KB | Same | Full trait support. `@hand_tracked` maps to XRController3D nodes. `@billboard` uses `look_at()` in `_process()`. UI via CanvasLayer + Control. |
| **visionOS** | Swift `.swift` (RealityKit) | ~12-18 KB | Same | **Primary target.** Full RealityKit support. `@hand_tracked` maps to HandTrackingProvider. `@anchor` maps to AnchoringComponent. `@billboard` maps to BillboardComponent. Gesture DSL maps to SpatialTapGesture/DragGesture. |
| **VRChat** | UdonSharp `.cs` + prefab hierarchy | ~18-25 KB | `@clickable`, `@glowing`, `@billboard` | `@hand_tracked` unsupported (VRChat uses its own gesture system). `@anchor` degrades to world-locked position. Spatial UI limited to Canvas world-space. |
| **WebGPU** | JavaScript + WGSL shaders | ~20-30 KB | `@glowing`, `@clickable` | No native UI system; `@billboard` requires custom render pass. `@hand_tracked` not applicable. Material-only rendering; UI panels must use HTML overlay. |
| **Babylon.js** | TypeScript | ~12-16 KB | Same as R3F | Full support via `@babylonjs/core`. `@hand_tracked` through WebXR hand tracking feature. `@billboard` via `billboardMode`. Spatial audio via `Sound` with `spatialSound: true`. |
| **URDF** | N/A | - | - | Healthcare compositions lack `@physics`, joints, and inertial data required for robot descriptions. |
| **SDF** | N/A | - | - | Same as URDF; no robotics-relevant scene structure. |
| **DTDL** | N/A | - | - | Healthcare composition uses UI-centric patterns, not IoT sensor telemetry/digital twin models. Could theoretically model patient vitals as DTDL telemetry but no automated mapping exists. |

**Compiler files referenced:**
- `packages/core/src/compiler/R3FCompiler.ts`
- `packages/core/src/compiler/UnityCompiler.ts`
- `packages/core/src/compiler/UnrealCompiler.ts`
- `packages/core/src/compiler/GodotCompiler.ts`
- `packages/core/src/compiler/VisionOSCompiler.ts`
- `packages/core/src/compiler/VRChatCompiler.ts`
- `packages/core/src/compiler/WebGPUCompiler.ts`
- `packages/core/src/compiler/BabylonCompiler.ts`

---

### 3.2 Industrial IoT Starter

**Source:** `examples/domain-starters/industrial-iot/industrial-iot-starter.holo`
**Primary use:** Digital twin factory floor, sensor telemetry, predictive maintenance, KPI dashboards.
**Listed platforms:** `dtdl`, `openxr`, `webgpu`

| Target | Output Format | Est. Output Size | Required Traits | Feature Gaps |
|---|---|---|---|---|
| **DTDL** | JSON (DTDL v3 Interfaces) | ~8-15 KB (multiple interface files) | `behavior "DigitalTwin"`, `behavior "MotorTwin"`, `behavior "IoTGateway"` | **Primary target.** Maps `@state` to DTDL Properties, `behavior` telemetry to DTDL Telemetry, actions to DTDL Commands, object hierarchy to DTDL Relationships. `system "DigitalTwinSync"` models map directly. Trait `@glowing`/`@clickable` are silently ignored (UI-only). |
| **R3F (Three.js)** | JSX/TSX | ~10-14 KB | `@clickable`, `@glowing`, `@collidable` | Full scene rendering. Sensor telemetry behaviors generate TODO stubs for WebSocket integration. KPIDashboard generates an HTML overlay component. |
| **Unity** | C# MonoBehaviour | ~18-22 KB | Same | Full support. IoT behaviors generate Azure Digital Twins SDK integration stubs. Sensor visualization uses emission/color changes in Update(). |
| **Unreal** | C++ | ~28-35 KB | Same | Core scene geometry compiles. IoT-specific behaviors (DigitalTwin, IoTGateway, PredictiveMaintenance) emit structured TODO blocks referencing Azure IoT Hub C++ SDK. |
| **Godot** | GDScript | ~12-16 KB | Same | Full scene support. IoT behaviors emit GDScript stubs with HTTPClient for REST API telemetry polling. |
| **WebGPU** | JavaScript + WGSL | ~18-25 KB | `@glowing` | **Favored for dashboards.** Generates GPU-accelerated KPI visualization. Sensor data requires external fetch. No built-in UI; relies on DOM overlay for dashboard panels. |
| **Babylon.js** | TypeScript | ~14-18 KB | Same as R3F | Full scene rendering. Real-time telemetry visualization via Babylon.js GUI. |
| **visionOS** | Swift (RealityKit) | ~14-18 KB | `@clickable`, `@glowing` | Scene compiles but IoT-specific behaviors (MQTT, OPC-UA, Azure) require bridging to native Swift networking. Digital twin sync patterns generate Foundation URLSession stubs. |
| **VRChat** | N/A | - | - | IoT/digital twin composition has no social/avatar interaction patterns required for meaningful VRChat output. |
| **URDF** | N/A | - | - | No robot link/joint structure. Conveyor belt could theoretically map to a prismatic joint but no automated path exists. |
| **SDF** | N/A | - | - | Same as URDF; factory floor lacks physics simulation structure. Could benefit from future `EnvironmentToSDF` pass for Gazebo visualization. |

**Compiler files referenced:**
- `packages/core/src/compiler/DTDLCompiler.ts` -- Maps composition to DTDL v3 interfaces; `@state` -> Properties, `emit()` -> Telemetry, handlers -> Commands, hierarchy -> Relationships, traits -> Components.
- `packages/core/src/compiler/WebGPUCompiler.ts`
- `packages/core/src/compiler/BabylonCompiler.ts`

---

### 3.3 Robotics (UR5 Robot Arm)

**Source:** `examples/specialized/robotics/robot-arm-simulation.holo`
**Primary use:** 6-DOF industrial robot simulation, ROS 2 integration, collision detection, path planning.
**Listed platforms:** `urdf`, `sdf`, `gazebo`, `ros2`

| Target | Output Format | Est. Output Size | Required Traits | Feature Gaps |
|---|---|---|---|---|
| **URDF** | XML `.urdf` | ~15-25 KB | `@collidable`, `@rotatable`, `@physics`, `@grabbable`, `@sensor`, `behavior "RevoluteJoint"`, `behavior "PrismaticJoint"` | **Primary target.** Objects map to URDF `<link>` elements with visual/collision geometry. `@collidable` generates `<collision>`. `behavior "RevoluteJoint"` maps to `<joint type="revolute">` with axis, limits, max velocity/torque. `behavior "PrismaticJoint"` maps to `<joint type="prismatic">`. `@sensor` generates Gazebo plugin tags when `includeGazeboPlugins: true`. `behavior "FTSensor"` maps to `<gazebo><sensor type="force_torque">`. `mass` property maps to `<inertial>`. **Gap:** Inertia tensors are auto-approximated from geometry (box/cylinder/sphere) -- complex meshes need manual `ixx/iyy/izz`. ROS 2 system blocks (`system "ROS2Bridge"`) emit XML comments, not native URDF elements. |
| **SDF** | XML `.sdf` (v1.8) | ~20-35 KB | Same as URDF | **Primary target.** Richer output than URDF: includes world physics config (`<physics>`), scene (`<scene>`), ground plane, sun light. Objects map to `<model><link>` with visual/collision/inertial. Joints map to `<joint>`. Sensors map to `<sensor>` elements (camera, IMU, force-torque, contact). Environment maps to `<scene>` properties. **Gap:** Motion programs (PickAndPlace, Welding, Painting sequences) are not expressible in SDF -- they emit XML comments only. Calibration/maintenance systems are informational-only in SDF output. |
| **R3F (Three.js)** | JSX/TSX | ~12-16 KB | `@collidable`, `@rotatable`, `@grabbable`, `@glowing` | Scene geometry renders correctly. Joint behaviors generate `useFrame()` hooks for rotation animation but lack inverse kinematics. Physics joints require `@react-three/rapier` integration (generates import stubs). `@sensor` traits emit TODO comments. ROS 2 topics not mapped. |
| **Unity** | C# MonoBehaviour | ~25-30 KB | Same | Good visual fidelity. Joint behaviors map to `HingeJoint` / `ConfigurableJoint`. `@sensor` can map to Camera/physics raycasts. ROS 2 integration requires ROS-TCP-Connector Unity package (generates stubs). `mass` maps to Rigidbody.mass. |
| **Unreal** | C++ | ~35-45 KB | Same | Joint behaviors map to `UPhysicsConstraintComponent`. `@sensor` maps to scene capture / ray trace components. ROS 2 integration generates rclUE plugin stubs. Largest output size due to header + source split. |
| **Godot** | GDScript | ~15-20 KB | Same | Joint behaviors map to `HingeJoint3D` / `SliderJoint3D`. `@sensor` generates `RayCast3D` nodes. No native ROS 2 bridge. Motion programs emit GDScript function stubs. |
| **visionOS** | N/A | - | - | Industrial robot simulation requires real-time physics simulation loops incompatible with RealityKit's declarative model. Could generate a static visualization but joint simulation and ROS 2 topics have no mapping. |
| **VRChat** | N/A | - | - | Robot arm simulation requires physics constraints and sensor systems not available in VRChat SDK3. |
| **WebGPU** | JavaScript + WGSL | ~10-15 KB | `@collidable` (geometry only) | Generates visual mesh rendering. No physics simulation. Joint behaviors ignored. Only useful as a static 3D viewer. |
| **Babylon.js** | TypeScript | ~15-20 KB | `@collidable`, `@rotatable`, `@grabbable` | Scene renders with Havok physics joints. Better than R3F for physics simulation. `@sensor` emits stubs. No ROS 2 integration. |
| **DTDL** | JSON (DTDL v3) | ~5-8 KB | State, behaviors with telemetry | Minimal output. Robot joints could map to DTDL properties (angle, velocity), sensors to telemetry. But no spatial/kinematic representation. Only useful for monitoring, not simulation. |

**Compiler files referenced:**
- `packages/core/src/compiler/URDFCompiler.ts` -- Maps objects to links, joints (revolute/prismatic/continuous/fixed/floating/planar), sensors to Gazebo plugins, actuators to ros2_control transmissions. Supports Gazebo Classic and Ignition/Garden+, MoveIt 2, RViz2, Isaac Sim.
- `packages/core/src/compiler/SDFCompiler.ts` -- Maps composition to SDF world with physics config, scene, ground plane, models, joints, sensors. More feature-rich than URDF: supports environments, lights, and world-level settings.
- `packages/core/src/compiler/DomainBlockCompilerMixin.ts` -- `physicsToURDF()`, `physicsToSDF()`, `materialToSDF()` converters.

---

### 3.4 visionOS Productivity Space

**Source:** `examples/platforms/visionos-app.holo`
**Primary use:** Apple Vision Pro spatial computing -- volumetric windows, hand/eye tracking, SharePlay.
**Listed platforms:** `visionos`

| Target | Output Format | Est. Output Size | Required Traits | Feature Gaps |
|---|---|---|---|---|
| **visionOS** | Swift `.swift` (RealityKit + SwiftUI) | ~20-30 KB | `@window`, `@resizable`, `@eye_tracked`, `@hand_tracked`, `@volumetric`, `@scalable`, `@ornament`, `@portal`, `@palm_menu`, `@spatial_video` | **Primary target.** Full trait mapping via `VisionOSTraitMap.ts`. `@window` generates `WindowGroup`/`ImmersiveSpace`. `@volumetric` maps to `RealityView`. `@eye_tracked` maps to `InputTargetComponent` + `HoverEffectComponent`. `@hand_tracked` maps to `HandTrackingProvider`. `@ornament` maps to SwiftUI `.ornament()` modifier. `@portal` maps to `PortalComponent` + `WorldComponent`. `@spatial_video` maps to `AVPlayer` with spatial audio. SharePlay generates `GroupActivity` stubs. **Gap:** `@palm_menu` is partially implemented (generates comment with documentation reference). |
| **R3F (Three.js)** | JSX/TSX | ~10-14 KB | `@hand_tracked`, `@scalable`, `@rotatable` | `@window`, `@ornament`, `@portal`, `@spatial_video`, `@palm_menu` have no Three.js equivalent. Scene compiles as 3D objects without windowing system. `@eye_tracked` degrades to raycaster hover. SharePlay block ignored entirely. |
| **Unity** | C# MonoBehaviour | ~15-20 KB | `@hand_tracked`, `@scalable`, `@rotatable` | `@window` generates Canvas-based UI panels but not native OS windows. `@volumetric` maps to 3D GameObjects. `@eye_tracked` generates XR Gaze Interactor setup. `@ornament`, `@portal`, `@spatial_video` partially map to Unity PolySpatial for visionOS deployment. `@palm_menu` unsupported. |
| **Unreal** | C++ | ~20-25 KB | Limited trait support | Most visionOS-specific traits emit TODO comments. `@hand_tracked` maps to Enhanced Input motioncontroller bindings. `@window` has no equivalent. |
| **Godot** | GDScript | ~8-12 KB | Limited | `@window` maps to `Window` node (not spatial windows). Most visionOS-specific traits (`@ornament`, `@portal`, `@spatial_video`) unsupported. |
| **VRChat** | UdonSharp | ~10-14 KB | `@hand_tracked` (partial) | Volumetric windows map to world-space Canvas. `@portal` maps to VRC_Portal. Most visionOS traits unsupported. |
| **WebGPU** | JavaScript + WGSL | ~8-12 KB | Geometry only | Only 3D objects (3DChart, GlobeModel) render. No windowing, no hand/eye tracking, no spatial audio. |
| **Babylon.js** | TypeScript | ~12-16 KB | `@hand_tracked`, `@scalable` | WebXR hand tracking for compatible traits. `@window` generates Babylon.js GUI floating panels. `@portal` not available. `@spatial_video` uses Babylon.js `VideoTexture`. |
| **URDF / SDF / DTDL** | N/A | - | - | No robotics or IoT content to map. |

**Compiler files referenced:**
- `packages/core/src/compiler/VisionOSCompiler.ts` -- Full RealityKit + SwiftUI generation.
- `packages/core/src/compiler/VisionOSTraitMap.ts` -- Trait-to-RealityKit component mapping with implementation level annotations (`full`, `partial`, `comment`, `unsupported`).

---

### 3.5 Gaming (Spatial RPG)

**Source:** `examples/showcase/spatial-rpg.holo`
**Primary use:** Multiplayer spatial RPG with combat, quests, NPCs, terrain, day/night cycle.
**Listed platforms:** `visionos` (in file header, but broadly applicable)

| Target | Output Format | Est. Output Size | Required Traits | Feature Gaps |
|---|---|---|---|---|
| **R3F (Three.js)** | JSX/TSX | ~15-25 KB | `@networked`, `@collidable`, `@agent`, `@interactive`, `@dialogue` | Full scene rendering. `@networked` generates sync hooks (position, health, animation). `@agent` maps to state machine components. `@interactive` generates click/hover handlers. `@dialogue` generates UI overlay dialog tree. Terrain, spawn groups, waypoints all generate helper components. **Gap:** Combat system module generates stubs only; no actual damage calculation rendered. |
| **Unity** | C# MonoBehaviour | ~30-40 KB | Same | **Strongest target for gaming.** `@networked` maps to Unity Netcode for GameObjects. `@collidable` maps to Collider + Rigidbody. `@agent` maps to NavMeshAgent with FSM. `@dialogue` maps to ScriptableObject dialog system. Terrain generates Unity Terrain API calls. Spawn groups generate ObjectPool pattern. Zones map to trigger volumes. |
| **Unreal** | C++ | ~40-55 KB | Same | Full support. `@networked` generates UE5 replication macros (`UPROPERTY(Replicated)`). `@agent` maps to AIController + BehaviorTree stubs. `@dialogue` maps to DialogueWave assets. Terrain generates landscape import. Largest output due to Blueprint JSON generation option. |
| **Godot** | GDScript | ~18-25 KB | Same | Full support. `@networked` maps to Godot 4 multiplayer API (MultiplayerSpawner, MultiplayerSynchronizer). `@agent` maps to NavigationAgent3D. `@dialogue` generates dialog Resource. Terrain uses Godot 4 Terrain3D plugin stubs. |
| **VRChat** | UdonSharp + prefabs | ~25-35 KB | `@collidable`, `@interactive` | Social hub features compile well. `@networked` maps to VRC_ObjectSync. `@dialogue` maps to world-space canvas with Udon interaction. `@agent` (AI NPCs) unsupported -- VRChat has no server-side AI. Combat system heavily limited by VRChat SDK constraints. Terrain, spawn groups, and waypoints generate static placements only. **Gap:** No server-authoritative combat; no persistent quest state. |
| **visionOS** | Swift (RealityKit) | ~15-20 KB | `@collidable`, `@interactive` | Scene geometry and spatial zones compile. `@networked` generates SharePlay activity stubs. `@agent` partially maps to RealityKit entity behaviors. `@dialogue` generates SwiftUI overlay. **Gap:** Terrain not supported in RealityKit. Spawn groups generate static entity placement. Combat system requires custom ECS components. |
| **WebGPU** | JavaScript + WGSL | ~12-18 KB | Geometry only | Renders scene geometry and lighting. All gameplay systems (combat, networking, AI, dialogue) require external implementation. Only useful as a visual test. |
| **Babylon.js** | TypeScript | ~18-25 KB | `@collidable`, `@interactive`, `@agent` | Good gaming support. Physics via Havok. `@networked` generates Colyseus.js integration stubs. `@agent` generates navigation mesh AI stubs. `@dialogue` generates Babylon.js GUI dialog. Terrain uses `CreateGroundFromHeightMap()`. |
| **URDF / SDF / DTDL** | N/A | - | - | No robotics or IoT content. |

**Compiler files referenced:**
- `packages/core/src/compiler/UnityCompiler.ts`
- `packages/core/src/compiler/UnrealCompiler.ts`
- `packages/core/src/compiler/GodotCompiler.ts`
- `packages/core/src/compiler/VRChatCompiler.ts`
- `packages/core/src/compiler/R3FCompiler.ts`

---

### 3.6 Web3 (NFT Marketplace)

**Source:** `examples/nft-marketplace-basic.holo`
**Primary use:** Solidity smart contract generation for ERC-1155 NFT marketplaces.
**Listed platforms:** N/A (outputs Solidity, not scene code)

| Target | Output Format | Est. Output Size | Required Traits | Feature Gaps |
|---|---|---|---|---|
| **NFTMarketplaceCompiler** | Solidity `.sol` + deployment scripts + gas analysis | ~30-50 KB (contracts + scripts + report) | `nft marketplace` AST: `contract`, `marketplace`, `royalties`, `lazyMinting`, `gasOptimization` | **Dedicated compiler.** Generates ERC-1155 with ERC-2981 royalties, lazy minting with cryptographic vouchers, marketplace with listings/auctions/offers, multi-chain deployment scripts (Base, Polygon, Ethereum L2s). Gas optimization with static analysis and storage packing. **Not a HoloComposition target -- uses separate NFTMarketplaceAST.** |
| **All scene targets** | N/A | - | - | NFT marketplace compositions use the `nft marketplace` block syntax, which is parsed into `NFTMarketplaceAST`, not `HoloComposition`. No scene-based compiler accepts this AST type. A future bridge could generate a 3D gallery scene from NFT metadata, but no such pathway exists today. |

**Compiler files referenced:**
- `packages/core/src/compiler/NFTMarketplaceCompiler.ts` -- Accepts `NFTMarketplaceAST`, outputs `NFTMarketplaceCompilationOutput` containing `CompiledContract[]`, `DeploymentScript[]`, and `GasAnalysisReport`.

---

### 3.7 E-Commerce (Product Viewer)

**Source:** `examples/product-viewer.holo`
**Primary use:** 3D product showcase with interactive rotation, color selection, info panels.
**Listed platforms:** General (web-first)

| Target | Output Format | Est. Output Size | Required Traits | Feature Gaps |
|---|---|---|---|---|
| **R3F (Three.js)** | JSX/TSX | ~6-10 KB | `@collidable`, `@grabbable`, `@animated`, `@glowing`, `@pointable` | **Primary target.** Small, clean output. `@grabbable` maps to `useDrag()` hook. `@animated` maps to `useFrame()` rotation. `@glowing` maps to emission material properties. `@pointable` maps to raycaster onPointerEnter/Leave. UI panels generate HTML overlay or `@react-three/drei` Html component. |
| **Unity** | C# MonoBehaviour | ~10-14 KB | Same | Full support. `@grabbable` maps to XR Grab Interactable. `@animated` maps to coroutine rotation. Product state maps to serialized fields with inspector UI. |
| **Unreal** | C++ | ~15-20 KB | Same | `@grabbable` maps to UGrabComponent. `@animated` maps to timeline or tick rotation. Info panel generates UMG widget stubs. Slightly oversized for a simple product viewer. |
| **Godot** | GDScript | ~8-12 KB | Same | Full support. `@grabbable` maps to RigidBody3D with InputEvent. `@animated` maps to `_process()` rotation. Clean, readable output. |
| **visionOS** | Swift (RealityKit) | ~10-14 KB | `@grabbable`, `@animated`, `@glowing` | Excellent fit for Apple Vision Pro product showcase. `@grabbable` maps to `DragGesture` + `MovableComponent`. `@animated` maps to `Transform.rotation` animation. Product state maps to `@Observable` class. |
| **VRChat** | UdonSharp | ~10-15 KB | `@grabbable`, `@glowing` | `@grabbable` maps to VRC_Pickup. Product showcase works as a social shopping experience. Info panel generates world-space Canvas. `@animated` maps to Udon Update() rotation. `@pointable` not available (no raycaster). |
| **WebGPU** | JavaScript + WGSL | ~8-12 KB | `@glowing` | Renders product with PBR material. No interaction system; `@grabbable` and `@pointable` require DOM event bridging. Useful for high-fidelity rendering only. |
| **Babylon.js** | TypeScript | ~8-12 KB | Same as R3F | Full support. `@grabbable` via pointer drag behavior. `@animated` via `scene.registerBeforeRender()`. `@glowing` via highlight layer or emission. GUI for info panels. |
| **URDF / SDF / DTDL** | N/A | - | - | Product viewer has no robotics or IoT data model to export. |

**Compiler files referenced:**
- `packages/core/src/compiler/R3FCompiler.ts`
- `packages/core/src/compiler/UnityCompiler.ts`
- `packages/core/src/compiler/BabylonCompiler.ts`
- `packages/core/src/compiler/VisionOSCompiler.ts`

---

## 4. Domain Block Support by Compiler

The `DomainBlockCompilerMixin` (`packages/core/src/compiler/DomainBlockCompilerMixin.ts`) provides
cross-cutting domain block compilation. Each function maps a compiled domain block to a platform-specific
code snippet.

| Domain Block | R3F | Unity | Unreal | Godot | visionOS | AndroidXR | Babylon.js | PlayCanvas | WebGPU | URDF | SDF | USD |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Material** | `materialToR3F` | `materialToUnity` | `materialToUnreal` | `materialToGodot` | `materialToVisionOS` | `materialToAndroidXR` | `materialToBabylon` | `materialToPlayCanvas` | `materialToWebGPU` | -- | `materialToSDF` | `materialToUSD` |
| **Physics** | `physicsToR3F` | `physicsToUnity` | `physicsToUnreal` | `physicsToGodot` | `physicsToVisionOS` | `physicsToAndroidXR` | `physicsToBabylon` | `physicsToPlayCanvas` | -- | `physicsToURDF` | `physicsToSDF` | -- |
| **Particles** | `particlesToR3F` | `particlesToUnity` | `particlesToUnreal` | `particlesToGodot` | `particlesToVisionOS` | `particlesToAndroidXR` | `particlesToBabylon` | `particlesToPlayCanvas` | -- | -- | -- | `particlesToUSD` |
| **Post-Processing** | `postProcessingToR3F` | `postProcessingToUnity` | `postProcessingToUnreal` | `postProcessingToGodot` | -- | -- | `postProcessingToBabylon` | -- | -- | -- | -- | `postProcessingToUSD` |
| **Audio Source** | `audioSourceToR3F` | `audioSourceToUnity` | `audioSourceToUnreal` | `audioSourceToGodot` | `audioSourceToVisionOS` | `audioSourceToAndroidXR` | `audioSourceToBabylon` | `audioSourceToPlayCanvas` | -- | -- | -- | `audioSourceToUSD` |
| **Weather** | `weatherToR3F` | `weatherToUnity` | `weatherToUnreal` | `weatherToGodot` | -- | `weatherToAndroidXR` | -- | -- | -- | -- | -- | `weatherToUSD` |

**Key observations:**
- **Material** has the broadest support (13 targets including VRChat via `materialToVRChat`).
- **WebGPU** only supports Material; all other domain blocks require manual implementation.
- **URDF** and **SDF** only support Physics and (SDF) Material; they are specialized for robotics.
- **Post-Processing** is missing from visionOS, AndroidXR, PlayCanvas, WebGPU, URDF, SDF.
- **Weather** is missing from visionOS, Babylon.js, PlayCanvas, WebGPU, URDF, SDF.

---

## 5. Additional Compilation Targets (Not in Matrix)

These compilers exist in `packages/core/src/compiler/` but are not scene-target compilers for the tested verticals:

| Compiler | File | Output | Use Case |
|---|---|---|---|
| **NIRCompiler** | `NIRCompiler.ts` | JSON (NIR graph) | Neuromorphic computing (Intel Loihi 2, SpiNNaker 2, SynSense). Maps neuron/synapse traits to NIR nodes. |
| **NIRToWGSLCompiler** | `NIRToWGSLCompiler.ts` | WGSL compute shaders | WebGPU execution of spiking neural networks from NIR graphs. |
| **TSLCompiler** | `TSLCompiler.ts` | Three.js Shading Language | TSL node-based shader generation for Three.js r160+. |
| **WASMCompiler** | `WASMCompiler.ts` | WAT + JS bindings | WebAssembly compilation for high-performance state/event execution. |
| **VRRCompiler** | `VRRCompiler.ts` | TODO (not yet implemented) | Virtual Reality Reality -- 1:1 digital twins of real-world locations with geo-sync. |
| **SCMCompiler** | `SCMCompiler.ts` | Supply chain models | Supply chain management domain compiler. |
| **A2AAgentCardCompiler** | `A2AAgentCardCompiler.ts` | Agent Card JSON | Google A2A protocol agent card generation. |
| **USDPhysicsCompiler** | `USDPhysicsCompiler.ts` | USD ASCII | Universal Scene Description with physics schema. |
| **USDZPipeline** | `USDZPipeline.ts` | USDZ binary | Apple USDZ package for Quick Look / Reality Composer. |
| **GLTFPipeline** | `GLTFPipeline.ts` | glTF 2.0 JSON | Universal 3D interchange format. |
| **OpenXRCompiler** | `OpenXRCompiler.ts` | OpenXR C | OpenXR 1.1 native layer code. |
| **OpenXRSpatialEntitiesCompiler** | `OpenXRSpatialEntitiesCompiler.ts` | OpenXR C | Meta Quest Spatial Entities extension. |
| **AndroidCompiler** | `AndroidCompiler.ts` | Kotlin | Android ARCore SceneView SDK. |
| **AndroidXRCompiler** | `AndroidXRCompiler.ts` | Kotlin | Android XR SceneCore + ARCore for XR. |
| **AIGlassesCompiler** | `AIGlassesCompiler.ts` | Kotlin (Compose Glimmer) | AI glasses with transparent displays (Samsung Galaxy XR). |
| **IOSCompiler** | `IOSCompiler.ts` | Swift (ARKit) | iOS ARKit scene generation. |
| **ARCompiler** | `ARCompiler.ts` | Cross-platform AR | AR session management. |
| **PlayCanvasCompiler** | `PlayCanvasCompiler.ts` | TypeScript | PlayCanvas engine scene. |
| **StateCompiler** | `StateCompiler.ts` | State machine code | Finite state machine extraction. |
| **IncrementalCompiler** | `IncrementalCompiler.ts` | Diff output | Incremental recompilation with caching. |
| **MultiLayerCompiler** | `MultiLayerCompiler.ts` | Multiple targets | Parallel compilation to multiple targets in a single pass. |
| **TraitCompositionCompiler** | `TraitCompositionCompiler.ts` | Trait analysis | Trait dependency resolution and composition validation. |

---

## 6. Known Feature Gaps Summary

### Critical Gaps (High Impact)

| Gap | Affected Verticals | Affected Targets | Severity |
|---|---|---|---|
| No `@hand_tracked` in VRChat | Healthcare, visionOS | VRChat | High -- VRChat uses its own gesture system, no direct mapping |
| No physics simulation in WebGPU | Robotics, Gaming | WebGPU | High -- WebGPU is rendering-only; physics requires external library |
| No UI system in WebGPU | Healthcare, IoT, E-Commerce | WebGPU | High -- All UI panels require HTML/DOM overlay |
| No server-side AI in VRChat | Gaming | VRChat | High -- `@agent` NPCs cannot run server logic in VRChat worlds |
| VRR Compiler not implemented | All (future) | VRR | Critical -- `VRRCompiler.ts` is a TODO stub |
| Inertia tensor approximation in URDF | Robotics | URDF | Medium -- Box/cylinder/sphere approximations may diverge from real geometry |

### Moderate Gaps

| Gap | Affected Verticals | Affected Targets | Severity |
|---|---|---|---|
| `@palm_menu` partial in visionOS | visionOS | visionOS | Medium -- Generates documentation comment only |
| IoT behaviors are stubs in game engines | Industrial IoT | Unity, Unreal, Godot | Medium -- MQTT/OPC-UA requires platform SDK integration |
| ROS 2 topics not in URDF | Robotics | URDF | Medium -- ROS 2 system blocks emit comments only; launch files must be authored separately |
| Motion programs not in SDF | Robotics | SDF | Medium -- Pick-and-place / welding sequences emit comments only |
| No terrain in visionOS | Gaming | visionOS | Medium -- RealityKit lacks native terrain generation |

### Low-Priority Gaps

| Gap | Affected Verticals | Affected Targets | Severity |
|---|---|---|---|
| Post-processing missing from WebGPU/PlayCanvas | Gaming, E-Commerce | WebGPU, PlayCanvas | Low -- Can be added manually |
| Weather system missing from Babylon.js/visionOS | Gaming | Babylon.js, visionOS | Low -- Weather is cosmetic |
| NFT marketplace has no 3D gallery bridge | Web3 | All scene targets | Low -- Separate AST type by design |

---

## 7. Compilation Command Reference

```bash
# Healthcare
holoscript compile examples/domain-starters/healthcare/healthcare-starter.holo --target visionos
holoscript compile examples/domain-starters/healthcare/healthcare-starter.holo --target unity
holoscript compile examples/domain-starters/healthcare/healthcare-starter.holo --target babylon

# Industrial IoT
holoscript compile examples/domain-starters/industrial-iot/industrial-iot-starter.holo --target dtdl
holoscript compile examples/domain-starters/industrial-iot/industrial-iot-starter.holo --target webgpu
holoscript compile examples/domain-starters/industrial-iot/industrial-iot-starter.holo --target babylon

# Robotics
holoscript compile examples/specialized/robotics/robot-arm-simulation.holo --target urdf
holoscript compile examples/specialized/robotics/robot-arm-simulation.holo --target sdf
holoscript compile examples/specialized/robotics/robot-arm-simulation.holo --target unity

# visionOS
holoscript compile examples/platforms/visionos-app.holo --target visionos
holoscript compile examples/platforms/visionos-app.holo --target r3f
holoscript compile examples/platforms/visionos-app.holo --target babylon

# Gaming
holoscript compile examples/showcase/spatial-rpg.holo --target unity
holoscript compile examples/showcase/spatial-rpg.holo --target unreal
holoscript compile examples/showcase/spatial-rpg.holo --target godot
holoscript compile examples/showcase/spatial-rpg.holo --target vrchat

# Web3 (uses NFT marketplace compiler, not --target flag)
holoscript compile examples/nft-marketplace-basic.holo

# E-Commerce
holoscript compile examples/product-viewer.holo --target r3f
holoscript compile examples/product-viewer.holo --target visionos
holoscript compile examples/product-viewer.holo --target babylon
```

---

## 8. Methodology

This benchmark was created by:

1. **Compiler source analysis** -- Reading each compiler's header documentation, import statements, and
   domain block mixin usage in `packages/core/src/compiler/*.ts`.
2. **Composition inspection** -- Analyzing the traits, objects, state, behaviors, and systems used in
   each representative composition.
3. **Trait mapping validation** -- Cross-referencing trait maps (`VisionOSTraitMap.ts`,
   `AIGlassesTraitMap.ts`, `AndroidXRTraitMap.ts`, `NIRTraitMap.ts`) for implementation levels.
4. **Domain block coverage** -- Auditing `DomainBlockCompilerMixin.ts` exported functions to map which
   compilers support which domain blocks (material, physics, particles, post-processing, audio, weather).
5. **Output size estimation** -- Based on object count, trait complexity, and typical code generation
   overhead per compiler (measured from existing test outputs and compiler emit patterns).

**Compilers analyzed:** 25+ in `packages/core/src/compiler/`
**Compositions analyzed:** 7 across all major verticals
**Domain block functions audited:** 53 exported converter functions

---

*Last updated: 2026-03-06*
*HoloScript version: v3.x (packages/core)*
*Compiler base: `packages/core/src/compiler/CompilerBase.ts` v2.0.0*
