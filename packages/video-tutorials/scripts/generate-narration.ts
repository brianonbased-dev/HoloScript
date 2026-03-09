#!/usr/bin/env tsx
/**
 * ElevenLabs TTS narration generator for HoloScript tutorial videos.
 *
 * Prerequisites:
 *   ELEVENLABS_API_KEY environment variable must be set.
 *   npm install elevenlabs (not included by default — add when ready to use)
 *
 * Usage:
 *   tsx scripts/generate-narration.ts --script unity-compiler
 *   tsx scripts/generate-narration.ts --script syntax-introduction
 *   tsx scripts/generate-narration.ts --all
 *
 * Input:  src/content/{script-slug}-narration.txt
 * Output: public/narration/{script-slug}.mp3
 *
 * Narration file format:
 *   [0:00] Welcome to HoloScript. In this video we'll...
 *   [0:08] First, we define our scene container.
 *   [0:14] Now let's add an object with a mesh...
 *   (timing hints are stripped — only the text is sent to TTS)
 *
 * Remotion usage:
 *   import { Audio, staticFile } from "remotion";
 *   <Audio src={staticFile("narration/unity-compiler.mp3")} />
 *
 * ElevenLabs Eleven v3 model ("aria" or "adam") supports:
 *   - SSML: <break time="1s"/> for pauses
 *   - Emotion: <express-as style="excited"> ... </express-as>
 *   - Emphasis: <emphasis level="strong"> word </emphasis>
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import path from 'path';

// ─── Configuration ────────────────────────────────────────────────────────────

const CONTENT_DIR = path.resolve('./src/content');
const OUTPUT_DIR = path.resolve('./public/narration');
const API_KEY = process.env.ELEVENLABS_API_KEY;

// Voice selection — change to preferred voice ID from ElevenLabs
// Browse voices: https://elevenlabs.io/voice-library
const VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // "Rachel" — clear, professional

// Model selection
// - eleven_multilingual_v2: Best quality, 32 languages
// - eleven_turbo_v2_5: Fastest, lowest cost
// - eleven_flash_v2_5: Ultra-low latency
const MODEL_ID = 'eleven_multilingual_v2';

// ─── Narration scripts (inline — edit or load from files) ─────────────────────

const SCRIPTS: Record<string, string[]> = {
  'syntax-introduction': [
    "Welcome to HoloScript. In this video, we'll walk through the core syntax you need to know to start building 3D scenes.",
    "<break time='0.8s'/> We start with the scene declaration. Every HoloScript file has a named scene as its root container.",
    "<break time='0.5s'/> Next, we add objects. An object has three key properties: its mesh defines the geometry, its material defines the surface appearance, and position places it in 3D space.",
    "<break time='0.5s'/> You can add as many objects as you need. Parent-child relationships mean child transforms inherit from their parent.",
    "<break time='0.5s'/> Lighting is next. HoloScript supports six light types. The directional light simulates sunlight — it has direction and can cast soft shadows.",
    "<break time='0.5s'/> Every scene needs a camera. The perspective camera behaves like a real camera lens. You set the field of view, position it in space, and point it at your scene.",
    "<break time='0.5s'/> Finally, traits. Traits add behavior without writing any logic code. With over fifteen hundred built-in traits, you can make objects interactable, add physics, or enable networking in a single line.",
    "<break time='1s'/> That's the core HoloScript syntax. In the next video, we'll take this scene and compile it to Unity C# with one function call.",
  ],

  'unity-compiler': [
    "HoloScript compiles to eighteen different targets — and Unity is the most popular. Let's see exactly how it works.",
    "<break time='0.8s'/> We start with a simple scene: a blue cube with a directional light and a perspective camera.",
    "<break time='0.5s'/> To compile, we import UnityCompiler from the core package. We configure it with a namespace, class name, and whether to use the Universal Render Pipeline.",
    "<break time='0.5s'/> A single call to compiler.compile() takes our HoloComposition and returns a complete C# string.",
    "<break time='0.5s'/> The generated code starts with a namespace declaration and a MonoBehaviour class that matches our scene name.",
    "<break time='0.5s'/> The Awake method builds the entire scene at runtime — GameObjects, MeshRenderers, Materials, Lights, and Cameras — all wired together automatically.",
    "<break time='1s'/> The same .holo file compiles to Godot, Babylon.js, Vision Pro, VRChat, and more. Write once, run everywhere.",
  ],
  'traits-deep-dive': [
    'Traits are the behavioral backbone of HoloScript. With over fifteen hundred built-in behaviors, you can do almost anything without writing custom logic.',
    "<break time='0.8s'/> Physics traits come in three core forms: PhysicsBody for full rigid-body simulation, Kinematic for controller-driven movement, and StaticCollider for immovable geometry that other objects react to.",
    "<break time='0.5s'/> Interaction traits wire up user input in a single line. Hoverable highlights an object when the cursor is near. Grabbable lets users pick it up. ProximityTrigger fires events when any player enters a radius you define.",
    "<break time='0.5s'/> Animation traits bring objects to life procedurally. Rotate spins an object on any axis at a given speed. Float bobs it up and down with a sine wave. Pulse scales it in and out rhythmically.",
    "<break time='0.5s'/> Many traits accept parameters. You pass named arguments directly in the trait declaration — setting the axis, speed, amplitude, and frequency exactly as you need them.",
    "<break time='0.5s'/> Finding the right trait is easy from the command line. Run npx holoscript traits --search with any keyword and get a filtered list of matching traits with their parameter signatures.",
    "<break time='0.8s'/> Traits compose cleanly — stack as many as you need on one object and they all run in parallel. In the next video we look at state blocks and reactive logic.",
  ],

  'state-and-logic': [
    "HoloScript gives you reactive state and logic without any framework boilerplate. Let's walk through how it works.",
    "<break time='0.8s'/> A state block lives inside any object and holds named properties with initial values. These properties are tracked — change them and the scene responds automatically.",
    "<break time='0.5s'/> The when() binding creates a reactive rule. You describe a condition and the block that runs when that condition becomes true. It re-evaluates every time the referenced state changes.",
    "<break time='0.5s'/> Event handlers use the on keyword followed by an event name. The most common is on click, which fires when a user interacts with the object. Inside, you can mutate state, trigger animations, or call actions.",
    "<break time='0.5s'/> Timers are built in. after() runs a block once after a delay. every() runs it repeatedly on an interval. Both are declarative — no setTimeout boilerplate, no cleanup to manage.",
    "<break time='0.5s'/> Computed properties derive their value from other state. You declare them with a formula and HoloScript keeps them in sync. Use them in conditions, trait parameters, or material expressions.",
    "<break time='0.8s'/> State and logic are fully preserved across all compile targets — Unity, Godot, Babylon, VRChat. The compiler translates your reactive rules into the native event system of each platform.",
  ],

  'timelines-and-animation': [
    'HoloScript has a first-class animation system built into the language. You can drive any property over time with keyframes, timelines, or procedural traits.',
    "<break time='0.8s'/> A keyframe animation uses from and to blocks. You specify the starting property values, the ending values, and the duration. The compiler generates the platform-native interpolation automatically.",
    "<break time='0.5s'/> Timeline blocks let you sequence multiple animations with at() calls. Each at() takes a timestamp and a property block. You can orchestrate entire cinematic sequences declaratively.",
    "<break time='0.5s'/> HoloScript ships with fourteen easing functions: linear, ease-in, ease-out, ease-in-out, cubic-bezier, and the crowd favourite — spring, which simulates a physically-based spring with stiffness and damping parameters.",
    "<break time='0.5s'/> Procedural animation traits like Rotate, Float, and Pulse run continuously without keyframes. They are parameterised and stack with explicit keyframe animations on the same object.",
    "<break time='0.5s'/> You can trigger named animations from event handlers. Define an animation block with a name, then call play('animation-name') from any on click or when() block.",
    "<break time='0.8s'/> Animation data compiles to Unity AnimationClips, Godot AnimationPlayer tracks, or CSS keyframes in Babylon — the right representation for each target, from a single source.",
  ],

  'npcs-and-dialogue': [
    'HoloScript makes it straightforward to add characters with dialogue, patrol routes, and conditional conversation trees.',
    "<break time='0.8s'/> Attach the NPC trait to any object and give it a name and a role. These become the character's identity across all compile targets, including VRChat where they map to UdonSharp components.",
    "<break time='0.5s'/> Dialogue trees are written inline. A dialogue block has a prompt and an options array. Each option has label text and a branch block that runs when the player selects it.",
    "<break time='0.5s'/> Branches can check state. You guard an option with a when() condition so dialogue choices only appear when the player has reached the right point in the story.",
    "<break time='0.5s'/> Patrol waypoints are an array of positions on the NPC object. The character moves through them in order, looping by default, at a speed you configure as a trait parameter.",
    "<break time='0.5s'/> Dialogue can be triggered automatically. Use ProximityTrigger to start a conversation when the player enters a radius, or on click to begin it on interaction.",
    "<break time='0.8s'/> NPC behaviour compiles to native state machines on each platform. In the next video we look at templates and reuse so you can share NPC blueprints across scenes.",
  ],

  'templates-and-reuse': [
    'As scenes grow, reuse becomes essential. HoloScript has a powerful template system that keeps your code DRY across files and projects.',
    "<break time='0.8s'/> A template is a blueprint with a params block. You declare typed parameters with defaults, then use those parameters anywhere inside the template body — in positions, materials, trait arguments, and state values.",
    "<break time='0.5s'/> To instantiate a template, use the use keyword followed by the template name and a params block with your values. The compiler inlines the full object tree at that point.",
    "<break time='0.5s'/> The scatter keyword places a template multiple times procedurally. You give it a count, a volume, and optional seed for deterministic randomness. It's how you populate forests, crowds, and debris fields.",
    "<break time='0.5s'/> Scene imports let one .holo file reference objects or templates from another file. Use the import keyword at the top of your scene, just like a module import in TypeScript.",
    "<break time='0.5s'/> Templates can be published to npm. Any package tagged with the holoscript-template keyword appears in the official template registry. Install with pnpm and import by package name.",
    "<break time='0.8s'/> Shared templates mean your team maintains one source of truth for common objects. In the next section we go deeper into the compiler targets, starting with Godot.",
  ],

  'godot-compiler': [
    'Godot is one of the most popular open-source game engines, and HoloScript compiles your scenes directly to GDScript.',
    "<break time='0.8s'/> The generated script extends Node3D, which is the standard base class for spatial objects in Godot 4. Every object in your scene becomes a child node attached in the _ready() lifecycle method.",
    "<break time='0.5s'/> Meshes become MeshInstance3D nodes with an ArrayMesh resource. Materials map to StandardMaterial3D with your colour, roughness, and metallic values set as properties.",
    "<break time='0.5s'/> Lights compile to DirectionalLight3D, OmniLight3D, or SpotLight3D depending on the type. The intensity and shadow settings translate directly to Godot's energy and shadow_enabled properties.",
    "<break time='0.5s'/> Physics traits map to RigidBody3D for dynamic objects and StaticBody3D for colliders. The collision shape is inferred from the mesh type automatically.",
    "<break time='0.5s'/> Compiling is one command: npx holoscript compile --target godot. You get a .gd file ready to attach to any Godot node, with no manual setup required.",
    "<break time='0.8s'/> The same scene also compiles to Babylon.js, Unity, and all other targets. Next, let's look at the Babylon.js compiler and how it runs in any browser.",
  ],

  'babylon-compiler': [
    'Babylon.js is a powerful 3D engine that runs entirely in the browser, and HoloScript compiles your scenes to clean TypeScript that uses its full API.',
    "<break time='0.8s'/> The entry point is a createScene() function that takes a Babylon Engine and returns a Scene. This is the standard Babylon.js pattern — your generated code integrates directly into any existing app.",
    "<break time='0.5s'/> Meshes are created with MeshBuilder.CreateBox, CreateSphere, or CreateCylinder depending on the geometry type. Each call receives a size options object derived from your HoloScript dimensions.",
    "<break time='0.5s'/> Materials compile to PBRMaterial, which models physically-based rendering. The albedoColor, metallic, and roughness properties map one-to-one from your HoloScript material block.",
    "<break time='0.5s'/> Cameras compile to ArcRotateCamera with your field of view and initial position. The camera target is set from your lookat value, or defaults to the scene origin.",
    "<break time='0.5s'/> Traits like Hoverable and Grabbable compile to Babylon's ActionManager with ExecuteCodeAction. All interactions are fully wired up — no manual event registration needed.",
    "<break time='0.8s'/> Because Babylon runs in any browser with WebGL support, your HoloScript scene is instantly accessible on desktop, mobile, and VR headsets via WebXR. Next we look at Apple Vision Pro.",
  ],

  'visionos-compiler': [
    'Apple Vision Pro runs visionOS, and HoloScript compiles your scenes to native Swift using the RealityKit framework.',
    "<break time='0.8s'/> The generated code creates a RealityView closure, which is the SwiftUI component for displaying 3D content in visionOS. Your scene is built inside the make closure using RealityKit entities.",
    "<break time='0.5s'/> Each object becomes an Entity with components attached. The ModelComponent holds the mesh and material. The Transform component sets position, rotation, and scale from your HoloScript values.",
    "<break time='0.5s'/> Meshes use MeshResource.generateBox, generateSphere, or generateCylinder. Materials map to SimpleMaterial with a color property derived from your hex colour value.",
    "<break time='0.5s'/> Physics traits compile to PhysicsBodyComponent and CollisionComponent. Apple's physics engine handles the simulation — you get realistic rigid-body behaviour with no extra code.",
    "<break time='0.5s'/> Interaction traits like Hoverable and Grabbable use RealityKit's InputTargetComponent and HoverEffectComponent. These integrate with the Vision Pro's hand-tracking input system automatically.",
    "<break time='0.8s'/> The output runs natively on visionOS and can also target iOS and macOS via the same RealityKit API. Next, let's look at the URDF compiler for robotics.",
  ],

  'urdf-compiler': [
    'URDF — the Unified Robot Description Format — is the standard way to describe robot geometry and kinematics for ROS and ROS2. HoloScript compiles directly to it.',
    "<break time='0.8s'/> The root element of every URDF file is a robot element with a name attribute. HoloScript uses your scene name as the robot name, keeping things consistent across tools.",
    "<break time='0.5s'/> Each object in your scene becomes a link element with visual and collision geometry. The mesh type determines the geometry element — box, cylinder, or sphere — with dimensions pulled from your object.",
    "<break time='0.5s'/> The parent-child hierarchy in your HoloScript scene maps directly to the kinematic tree in URDF. Each child object gets a joint element connecting it to its parent link.",
    "<break time='0.5s'/> Joint types are inferred from traits. A static child becomes a fixed joint. A rotating part with the Rotate trait becomes a continuous or revolute joint with the axis set from the trait parameters.",
    "<break time='0.5s'/> Material colours compile to the material element inside each visual block with an RGBA colour value. This drives visualisation in RViz and Gazebo.",
    "<break time='0.8s'/> The Python bindings package also exposes export_urdf() so you can generate URDF programmatically in automation scripts. Next we look at VRChat.",
  ],

  'vrchat-compiler': [
    "VRChat is one of the most popular social VR platforms, and HoloScript compiles your scenes to UdonSharp, the C# scripting layer built on VRChat's Udon VM.",
    "<break time='0.8s'/> Each interactive object generates a class that extends UdonSharpBehaviour. The class name matches your object name, keeping things organised in the VRChat SDK inspector.",
    "<break time='0.5s'/> The BehaviourSyncMode attribute is set based on your scene's networking traits. Objects with multiplayer sync get Manual or Continuous sync modes; local-only objects get NoVariableSync.",
    "<break time='0.5s'/> The Interact() override handles click events. When a player points and clicks the object in VRChat, this method fires. Any on click logic from your HoloScript compiles directly into this method.",
    "<break time='0.5s'/> State variables decorated with UdonSynced are generated from any state properties you mark as synced. VRChat handles the network replication automatically.",
    "<break time='0.5s'/> Physics traits generate Rigidbody and VRCObjectSync components. Players in the room see consistent physics simulation without any manual network code.",
    "<break time='0.8s'/> VRChat worlds built with HoloScript share the same source as your Unity, Godot, and web builds. Next we look at the WebGPU compiler for next-generation browser graphics.",
  ],

  'webgpu-compiler': [
    'WebGPU is the next-generation graphics API for the web, replacing WebGL with lower-level GPU access and compute shader support. HoloScript compiles to it natively.',
    "<break time='0.8s'/> The generated code starts by requesting a GPUAdapter and GPUDevice. These are the entry points to the GPU in WebGPU. The compiler wraps this in an async init function with proper error handling.",
    "<break time='0.5s'/> Geometry is uploaded as vertex buffers using GPUBuffer with the VERTEX usage flag. Index buffers handle mesh connectivity. The data layout matches the WGSL shader's input attributes exactly.",
    "<break time='0.5s'/> Shaders are written in WGSL — the WebGPU Shading Language — and embedded as template literal strings. The compiler generates physically-based WGSL shaders from your material properties.",
    "<break time='0.5s'/> The render pipeline is created with GPUDevice.createRenderPipeline(), specifying the vertex and fragment stages, primitive topology, and depth-stencil state. Your scene structure drives all of these settings.",
    "<break time='0.5s'/> Compute shaders are available for simulation traits. Physics, particle systems, and GPU-accelerated animations all compile to compute passes that run before the render pass.",
    "<break time='0.8s'/> WebGPU runs in Chrome, Edge, and Firefox Nightly today, with broader support shipping fast. Next, let's look at the React Three Fiber compiler.",
  ],

  'r3f-compiler': [
    'React Three Fiber is the most popular way to use Three.js in React applications. HoloScript compiles your scenes to idiomatic R3F TypeScript components.',
    "<break time='0.8s'/> The output is a TSX component that returns a Canvas element wrapping your scene graph. The Canvas component from @react-three/fiber sets up the WebGL renderer and the React reconciler.",
    "<break time='0.5s'/> Each object in your HoloScript scene becomes a mesh JSX element with geometry and material children. Box, sphere, and cylinder geometries use the corresponding R3F geometry primitives with args arrays.",
    "<break time='0.5s'/> Materials compile to meshStandardMaterial elements with color, roughness, and metalness props. This maps to Three.js MeshStandardMaterial under the hood, giving you PBR rendering in the browser.",
    "<break time='0.5s'/> Animation traits use the useFrame hook. The compiler generates a ref for the mesh and a useFrame callback that updates the rotation or position every frame using the clock delta.",
    "<break time='0.5s'/> Interaction traits like Hoverable and Grabbable use R3F's onPointerOver, onPointerOut, and onClick event props. State for hover and grab is managed with React useState.",
    "<break time='0.8s'/> The generated component integrates into any React application — Next.js, Vite, or Create React App. Add it to a page and your HoloScript scene renders immediately. Next we look at iOS.",
  ],

  'ios-compiler': [
    'HoloScript compiles to native iOS Swift using UIKit and SceneKit, so your 3D scenes run on iPhone and iPad without any web layer.',
    "<break time='0.8s'/> The generated code creates a UIViewController subclass. In viewDidLoad, it sets up an SCNView — SceneKit's rendering view — and attaches it to the view hierarchy.",
    "<break time='0.5s'/> The SCNScene is constructed programmatically. Each object in your HoloScript scene becomes an SCNNode with an SCNGeometry attached. Box, sphere, and cylinder map to SCNBox, SCNSphere, and SCNCylinder.",
    "<break time='0.5s'/> Materials compile to SCNMaterial instances. The diffuse contents property receives a UIColor created from your hex value. Roughness and metalness map to SceneKit's physical material properties.",
    "<break time='0.5s'/> Lights become SCNLight nodes with type set to directional, omni, or spot. The SCNNode holding the light is positioned and oriented to match your HoloScript light definition.",
    "<break time='0.5s'/> The SCNCamera node is set from your camera block. Field of view, position, and lookat translate directly. SCNView.allowsCameraControl gives users free orbit navigation.",
    "<break time='0.8s'/> The output is a single Swift file you drop into an Xcode project. It runs on iOS 13 and later, targeting hundreds of millions of devices. Next we look at the Android compiler.",
  ],

  'android-compiler': [
    'HoloScript compiles to native Android using ARCore and the Sceneform SDK, so your 3D scenes run on Android devices with full augmented reality support.',
    "<break time='0.8s'/> The generated code is an Android XML layout file and a Kotlin Activity. The layout uses CoordinatorLayout as the root, with an ArSceneView filling the screen.",
    "<break time='0.5s'/> ArSceneView is the ARCore rendering surface. It handles camera permission requests, AR session lifecycle, and the frame loop. Your generated Activity just configures it and adds nodes.",
    "<break time='0.5s'/> Each object in your HoloScript scene compiles to a Renderable built with ModelRenderable or ShapeFactory. The renderable is then attached to an AnchorNode placed in the AR scene.",
    "<break time='0.5s'/> Materials use MaterialFactory.makeOpaqueWithColor or makeTransparentWithColor with a Color object derived from your material definition. More complex materials use Sceneform's material builder API.",
    "<break time='0.5s'/> Interaction traits register a setOnTapListener on each TransformableNode. Tapping the object in the AR view fires the on click handler compiled from your HoloScript event block.",
    "<break time='0.8s'/> The output targets Android API 24 and above, covering nearly all active Android devices. Next we look at the OpenXR compiler for cross-platform VR headsets.",
  ],

  'openxr-compiler': [
    'OpenXR is the open standard for VR and AR runtime APIs, supported by Meta, Valve, Microsoft, and every major headset manufacturer. HoloScript compiles to OpenXR C++.',
    "<break time='0.8s'/> The generated code initialises an XrInstance using XrInstanceCreateInfo. You specify the application name, engine name, and the list of extensions your scene needs — such as XR_KHR_opengl_enable or XR_KHR_vulkan_enable.",
    "<break time='0.5s'/> An XrSession is created from the instance and bound to the graphics API of your choice. The session drives the render loop — you poll for session state changes and render frames only when the session is active.",
    "<break time='0.5s'/> Geometry is rendered using your chosen graphics backend through the OpenXR extension mechanism. The compiler generates the bridge code connecting OpenXR frame data to your renderer.",
    "<break time='0.5s'/> Input is handled through XrActionSet and XrAction objects. Interaction traits like Grabbable compile to action bindings for the controller squeeze input, mapped across all supported hardware profiles.",
    "<break time='0.5s'/> The XrSpace API handles world-locked anchors. Static objects in your scene become reference-space anchors that stay fixed in the physical environment regardless of headset movement.",
    "<break time='0.8s'/> Because OpenXR is hardware-agnostic, one compiled binary runs on Meta Quest, Valve Index, HTC Vive, and Windows Mixed Reality. Next we look at DTDL for IoT digital twins.",
  ],

  'dtdl-compiler': [
    "DTDL — the Digital Twins Definition Language — is Microsoft's JSON-LD format for describing IoT devices and digital twins. HoloScript compiles your scenes to DTDL interfaces.",
    "<break time='0.8s'/> Each object in your HoloScript scene becomes a DTDL interface with a unique dtmi identifier. The naming convention follows the pattern dtmi colon your-scene-name colon object-name semicolon version.",
    "<break time='0.5s'/> State properties compile to DTDL Property content entries. A numeric state value becomes a Property with schema float or integer. A string state value becomes a Property with schema string.",
    "<break time='0.5s'/> Sensor traits generate Telemetry content entries. Telemetry represents streaming data from a device — temperature, position, acceleration — rather than static configuration properties.",
    "<break time='0.5s'/> Event handlers on your objects compile to DTDL Command content entries. A Command has a name, optional request schema, and optional response schema, matching your on click or custom event signature.",
    "<break time='0.5s'/> Nested objects create component relationships in DTDL. A child object becomes a Component content entry referencing the child interface, preserving the hierarchy from your HoloScript scene.",
    "<break time='0.8s'/> The output is fully compatible with Azure Digital Twins, IoT Hub device models, and any DTDL-aware toolchain. Next let's look at the Unreal Engine compiler.",
  ],

  'unreal-compiler': [
    'Unreal Engine is the industry standard for high-fidelity real-time 3D, and HoloScript compiles your scenes to native Unreal C++ — both the header and the source file together.',
    "<break time='0.8s'/> The generated header file uses the standard Unreal macro pattern: UCLASS() above the class declaration, and GENERATED_BODY() as the first line inside. The class extends AActor, Unreal's base spatial entity.",
    "<break time='0.5s'/> Components are declared in the header as UPROPERTY() pointers. A UStaticMeshComponent pointer is created for each object, and a UPointLightComponent or UDirectionalLightComponent for each light.",
    "<break time='0.5s'/> The source file implements the constructor and BeginPlay. The constructor calls CreateDefaultSubobject for each component and sets up the attachment hierarchy. BeginPlay configures materials and parameters at runtime.",
    "<break time='0.5s'/> Materials are applied through UMaterialInstanceDynamic. The compiler creates a dynamic instance from a base material asset and sets scalar and vector parameters from your HoloScript material block.",
    "<break time='0.5s'/> Physics traits add UChaosPhysicsConstraintComponent bindings or set bSimulatePhysics on the mesh component. The PhysicsBody trait maps to full Chaos physics simulation.",
    "<break time='0.8s'/> The header and source pair compile into Unreal's build system without modification. Drop them into any UE5 project's Source folder and rebuild. Next we look at the WebAssembly compiler.",
  ],

  'wasm-compiler': [
    "WebAssembly lets you run near-native performance code in any browser. HoloScript's WASM compiler generates JavaScript bindings that load and call a compiled WebAssembly module.",
    "<break time='0.8s'/> The generated JavaScript uses WebAssembly.instantiate() to load the compiled .wasm binary. The promise resolves with an exports object containing all the functions your HoloScript scene exposes.",
    "<break time='0.5s'/> Each object with interactive traits generates a typed binding function. The binding handles memory management — allocating linear memory for data, calling the WASM function, and reading back the result.",
    "<break time='0.5s'/> State properties compile to getter and setter functions exported from the WASM module. The JavaScript bindings wrap these with proper type coercions so they feel like native JavaScript properties.",
    "<break time='0.5s'/> Heavy computation traits — particle systems, collision detection, pathfinding — are ideal WASM targets. The compiler routes these to WASM while keeping DOM interaction in JavaScript.",
    "<break time='0.5s'/> The build pipeline uses Emscripten or wasm-pack depending on whether your scene uses C++ or Rust internals. The output is a .wasm file plus the generated JS bindings, ready to deploy as static assets.",
    "<break time='0.8s'/> WASM modules run at near-native speed across Chrome, Firefox, Safari, and Edge. In the next video we look at Universal Scene Description for the USD pipeline.",
  ],

  'usd-compiler': [
    "Universal Scene Description — USD — is Pixar's open framework for 3D scene interchange, used across film, games, and XR pipelines. HoloScript compiles to USDA, the human-readable text format.",
    "<break time='0.8s'/> A USDA file starts with a header line declaring the USD version. The default prim is declared next — this is the root of your scene, matching your HoloScript scene name.",
    "<break time='0.5s'/> Objects compile to def Xform prims for groups and def Mesh prims for geometry. The Xform holds the transform matrix derived from your position, rotation, and scale values.",
    "<break time='0.5s'/> Mesh geometry is stored as point positions, face vertex counts, and face vertex indices. The compiler triangulates all geometry and emits the arrays in the standard USD mesh schema format.",
    "<break time='0.5s'/> Materials become def Material prims using the UsdPreviewSurface shader schema. The diffuseColor, roughness, and metallic inputs map directly from your HoloScript material properties.",
    "<break time='0.5s'/> Lights use the UsdLux schema: DistantLight for directional, SphereLight for point, SpotLight for spot. Intensity, colour, and angle properties are set from your HoloScript light block.",
    "<break time='0.8s'/> USDA files open directly in Pixar's usdview, NVIDIA Omniverse, Apple's Reality Composer Pro, and Blender with the USD plugin. Next we look at the Python bindings for automation.",
  ],

  'python-bindings': [
    'HoloScript has a Python package — holoscript — that brings the full compiler pipeline to your Python scripts and automation workflows.',
    "<break time='0.8s'/> Install it with pip install holoscript. The package is a pure Python wrapper around the Node.js core, using subprocess to call the CLI and returning structured results as Python dictionaries.",
    "<break time='0.5s'/> The parse_file() function takes a path to a .holo file and returns a parsed composition object. You can inspect the object tree, validate it, or pass it directly to compile_to_target().",
    "<break time='0.5s'/> compile_to_target() accepts the composition and a target string — unity, godot, babylon, urdf, and all other supported targets. It returns the generated source code as a string.",
    "<break time='0.5s'/> The robotics module adds domain-specific helpers. export_urdf() compiles a .holo file and writes the URDF to disk in one call. generate_ros2_launch() produces a complete ROS2 launch file from your scene.",
    "<break time='0.5s'/> Python's ecosystem makes holoscript a natural fit for ML pipelines. You can generate thousands of synthetic URDF robot variants programmatically, or batch-compile scenes from procedurally generated compositions.",
    "<break time='0.8s'/> The Python package is published to PyPI using OIDC trusted publishing from a GitHub Actions workflow — no stored secrets required. Next we look at MCP server integration.",
  ],

  'mcp-server-integration': [
    'The Model Context Protocol — MCP — lets AI assistants like Claude discover and call your tools directly. HoloScript ships an MCP server that teaches Claude the entire HoloScript API.',
    "<break time='0.8s'/> The server is defined in a SKILL.md file that documents the API in a format optimised for language models. Claude reads this file at the start of each session and understands what HoloScript can do.",
    "<break time='0.5s'/> The holoscript-language MCP server registers multiple tools. brittney_scan_project analyses an existing codebase and maps it to HoloScript equivalents. generate_scene takes a natural language prompt and returns a .holo file.",
    "<break time='0.5s'/> Tool calls happen through MCP's standard JSON-RPC protocol. When you ask Claude to generate a VR scene, it calls generate_scene with your description as the argument and returns the complete HoloScript source.",
    "<break time='0.5s'/> To activate the server, add an entry to .claude/settings.json under the mcpServers key. Point it at the holoscript MCP server binary and it starts automatically with your Claude session.",
    "<break time='0.5s'/> Multiple MCP servers compose together. The brittney-hololand server connects HoloScript to the Hololand asset library. The semantic-search-hub server adds knowledge retrieval across all your project documentation.",
    "<break time='0.8s'/> With MCP, your entire HoloScript workflow becomes AI-native — from scene generation to compilation to deployment. Next we look at the LLM provider SDK.",
  ],

  'llm-provider-sdk': [
    'The @holoscript/llm-provider package gives you a unified interface for generating HoloScript scenes with OpenAI, Anthropic, or Google Gemini — switchable with a single config change.',
    "<break time='0.8s'/> createProvider() is the entry point. Pass it a provider name — openai, anthropic, or gemini — along with your API key and model preference. It returns a provider instance with a consistent interface.",
    "<break time='0.5s'/> generateText() is the core method. Give it a prompt string and it returns the model's response. For scene generation, you craft a system prompt that instructs the model to output valid HoloScript syntax.",
    "<break time='0.5s'/> The package includes tested prompt templates for common scene generation tasks. Import the sceneGenerationPrompt helper, pass your description, and get a prompt string engineered for reliable .holo output.",
    "<break time='0.5s'/> streamText() returns an async iterable of token chunks. Use it in a streaming UI to show generated HoloScript appearing in real time as the model writes it.",
    "<break time='0.5s'/> batchGenerate() accepts an array of prompts and runs them concurrently with configurable parallelism and retry logic. It's the foundation for dataset generation, variation synthesis, and A/B testing prompts.",
    "<break time='0.8s'/> The provider SDK has forty-six unit tests and ships with a Mock provider for offline testing. Next we look at the security sandbox for safe execution of untrusted .holo files.",
  ],

  'security-sandbox': [
    'When you accept .holo files from untrusted sources — user uploads, third-party integrations, AI-generated content — you need to execute them safely. The @holoscript/security-sandbox package handles that.',
    "<break time='0.8s'/> The threat model covers three attack surfaces: malicious HoloScript that tries to exfiltrate secrets through trait side effects, resource exhaustion from deeply nested scenes, and prototype pollution through crafted object literals.",
    "<break time='0.5s'/> createSandbox() initialises a sandboxed execution context. You configure resource limits at creation time: maximum memory in megabytes, maximum execution time in milliseconds, and the allowed trait whitelist.",
    "<break time='0.5s'/> sandbox.execute() takes a .holo source string and runs it inside the vm2 sandbox. The sandbox intercepts all I/O, blocks network access, and prevents access to process or require.",
    "<break time='0.5s'/> If execution exceeds the time limit, the sandbox kills it and rejects the promise with a TimeoutError. If memory usage crosses the limit, a MemoryLimitError is thrown before the process OOMs.",
    "<break time='0.5s'/> Every execution attempt is written to an audit log with the source hash, resource usage, outcome, and timestamp. This log feeds into your security monitoring pipeline for anomaly detection.",
    "<break time='0.8s'/> The sandbox is used in the HoloScript cloud API to safely process user-submitted scenes at scale. Next we look at the CI/CD integration pipeline.",
  ],

  'ci-cd-integration': [
    "HoloScript's GitHub Actions pipeline automates building, testing, and releasing your scenes and packages on every push.",
    "<break time='0.8s'/> The render-videos.yml workflow triggers on pushes to main and on pull requests. It checks out the code, installs dependencies with pnpm install using the frozen lockfile flag, and builds the core package.",
    "<break time='0.5s'/> The test step runs vitest in the packages/core directory, executing all seventy-two E2E export tests across all fifteen compiler targets. If any test fails, the workflow fails and the PR is blocked.",
    "<break time='0.5s'/> Code coverage is collected with the @vitest/coverage-v8 reporter. The coverage report is uploaded to Codecov, which enforces the eighty percent threshold configured in codecov.yml.",
    "<break time='0.5s'/> Security scans run in a parallel job using Snyk for dependency vulnerabilities and CodeQL for source code analysis. Critical or high severity findings fail the workflow and notify the security channel.",
    "<break time='0.5s'/> Release automation triggers on version tags matching v-star. It builds all packages, generates TypeDoc API reference, publishes npm packages, and creates a GitHub Release with the changelog.",
    "<break time='0.8s'/> The pipeline gives you confidence that every merge to main is fully tested, secure, and ready to ship. In the final video we look at creating custom traits to extend HoloScript.",
  ],

  'custom-trait-creation': [
    "HoloScript's trait system is open for extension. You can create, test, and publish your own traits with the same interface as the fifteen hundred built-in ones.",
    "<break time='0.8s'/> A trait is a TypeScript object that implements the TraitDefinition interface. The key method is compile(), which receives the trait's parameters and the current compile target, and returns the generated code string.",
    "<break time='0.5s'/> Let's write a HealthBar trait. The definition has a name, a parameters schema with maxHealth and barColor, and a compile() method that switches on the target to emit Unity C#, Godot GDScript, or Babylon TypeScript.",
    "<break time='0.5s'/> Registering the trait is one call: TraitRegistry.register(healthBarTrait). After registration, any HoloScript file can use the HealthBar trait by name and the compiler will resolve it automatically.",
    "<break time='0.5s'/> Testing uses the standard vitest setup. Import createComposition() from the test helpers, attach your trait to an object, run the relevant compiler, and assert on the generated code string.",
    "<break time='0.5s'/> To publish, create an npm package with a holoscript-trait keyword in package.json. The official registry discovers packages by keyword, so your trait appears in npx holoscript traits --search results automatically.",
    "<break time='0.8s'/> Custom traits are how the HoloScript ecosystem grows. Every domain — robotics, IoT, XR, simulation — can add its own behaviours while sharing the same compile-once infrastructure. That's the full HoloScript platform.",
  ],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseScript(slug: string): string {
  // Try loading from file first
  const filePath = path.join(CONTENT_DIR, `${slug}-narration.txt`);
  if (existsSync(filePath)) {
    const raw = readFileSync(filePath, 'utf8');
    // Strip timing hints like [0:00]
    return raw
      .split('\n')
      .map((line) => line.replace(/^\s*\[\d+:\d+\]\s*/, '').trim())
      .filter(Boolean)
      .join(' ');
  }

  // Fall back to inline scripts
  const lines = SCRIPTS[slug];
  if (lines) return lines.join(' ');

  throw new Error(
    `No narration script found for '${slug}'. Create src/content/${slug}-narration.txt`
  );
}

async function generateAudio(text: string, outputPath: string): Promise<void> {
  if (!API_KEY) {
    throw new Error(
      'ELEVENLABS_API_KEY environment variable is not set.\n' +
        'Get your key at https://elevenlabs.io/app/settings/api-keys'
    );
  }

  // Dynamic import — package may not be installed yet
  let ElevenLabs: any;
  try {
    const mod = await import('elevenlabs');
    ElevenLabs = mod.ElevenLabsClient ?? mod.default;
  } catch {
    throw new Error(
      'elevenlabs package not installed. Run:\n' +
        '  pnpm --filter @holoscript/video-tutorials add elevenlabs'
    );
  }

  const client = new ElevenLabs({ apiKey: API_KEY });

  console.log(`  Generating audio (${text.length} chars)...`);

  const audioStream = await client.textToSpeech.convert(VOICE_ID, {
    model_id: MODEL_ID,
    text,
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.8,
      style: 0.2,
      use_speaker_boost: true,
    },
  });

  // Collect stream to buffer
  const chunks: Buffer[] = [];
  for await (const chunk of audioStream) {
    chunks.push(Buffer.from(chunk));
  }
  const buffer = Buffer.concat(chunks);
  writeFileSync(outputPath, buffer);
  console.log(`  ✅ Saved ${(buffer.length / 1024).toFixed(1)} KB → ${outputPath}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const scriptIndex = args.indexOf('--script');
  const slug = scriptIndex >= 0 ? args[scriptIndex + 1] : null;
  const all = args.includes('--all');

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  if (!slug && !all) {
    console.log('Usage:');
    console.log('  tsx scripts/generate-narration.ts --script <slug>');
    console.log('  tsx scripts/generate-narration.ts --all');
    console.log('\nAvailable scripts:');
    Object.keys(SCRIPTS).forEach((s) => console.log(`  • ${s}`));
    process.exit(0);
  }

  const slugs = all ? Object.keys(SCRIPTS) : [slug!];

  for (const s of slugs) {
    console.log(`\n🎙  Narrating: ${s}`);
    const text = parseScript(s);
    const outputPath = path.join(OUTPUT_DIR, `${s}.mp3`);
    await generateAudio(text, outputPath);
  }

  console.log('\n✅ Narration generation complete.');
  console.log('   Reference in Remotion:');
  console.log("   <Audio src={staticFile('narration/<slug>.mp3')} />");
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
