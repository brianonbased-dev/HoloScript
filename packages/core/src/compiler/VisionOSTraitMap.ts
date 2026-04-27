/**
 * VisionOS Trait Mapping System
 *
 * Maps HoloScript traits to RealityKit components and Swift code.
 * Used by VisionOSCompiler for trait-to-native conversion.
 *
 * @version 1.0.0
 */

// =============================================================================
// TRAIT MAPPING TYPES
// =============================================================================

export type RealityKitComponent =
  | 'CollisionComponent'
  | 'PhysicsBodyComponent'
  | 'InputTargetComponent'
  | 'HoverEffectComponent'
  | 'ModelComponent'
  | 'SpatialAudioComponent'
  | 'AmbientAudioComponent'
  | 'AnchoringComponent'
  | 'AccessibilityComponent'
  | 'ImageBasedLightComponent'
  | 'PointLightComponent'
  | 'DirectionalLightComponent'
  | 'SpotLightComponent'
  | 'ParticleEmitterComponent'
  | 'VideoPlayerComponent'
  | 'PortalComponent'
  | 'WorldComponent'
  | 'OpacityComponent'
  | 'GroundingShadowComponent'
  | 'BillboardComponent'
  | 'ReverbComponent';

export type TraitImplementationLevel =
  | 'full' // Generates complete RealityKit code
  | 'partial' // Generates some code with TODOs
  | 'comment' // Only generates documentation comment
  | 'unsupported'; // Not available in RealityKit

export interface TraitMapping {
  /** HoloScript trait name */
  trait: string;
  /** RealityKit components to add */
  components: RealityKitComponent[];
  /** Implementation completeness */
  level: TraitImplementationLevel;
  /** Required Swift imports */
  imports?: string[];
  /** Required visionOS version */
  minVersion?: string;
  /** Code generator function */
  generate: (varName: string, config: Record<string, unknown>) => string[];
}

// =============================================================================
// PHYSICS TRAITS
// =============================================================================

export const PHYSICS_TRAIT_MAP: Record<string, TraitMapping> = {
  collidable: {
    trait: 'collidable',
    components: ['CollisionComponent'],
    level: 'full',
    generate: (varName, config) => {
      const mode = config.mode || 'default';
      return [
        `${varName}.components.set(CollisionComponent(shapes: [.generateConvex(from: ${varName}Mesh)], mode: .${mode}))`,
      ];
    },
  },

  physics: {
    trait: 'physics',
    components: ['CollisionComponent', 'PhysicsBodyComponent'],
    level: 'full',
    generate: (varName, config) => {
      const mass = config.mass ?? 1.0;
      const mode = config.kinematic ? 'kinematic' : 'dynamic';
      const friction = config.friction ?? 0.5;
      const restitution = config.restitution ?? 0.3;
      return [
        `${varName}.components.set(CollisionComponent(shapes: [.generateConvex(from: ${varName}Mesh)]))`,
        `var ${varName}Physics = PhysicsBodyComponent(massProperties: .init(mass: ${mass}), mode: .${mode})`,
        `${varName}Physics.material = .init(friction: ${friction}, restitution: ${restitution})`,
        `${varName}.components.set(${varName}Physics)`,
      ];
    },
  },

  static: {
    trait: 'static',
    components: ['CollisionComponent', 'PhysicsBodyComponent'],
    level: 'full',
    generate: (varName) => [
      `${varName}.components.set(CollisionComponent(shapes: [.generateConvex(from: ${varName}Mesh)]))`,
      `${varName}.components.set(PhysicsBodyComponent(mode: .static))`,
    ],
  },

  kinematic: {
    trait: 'kinematic',
    components: ['CollisionComponent', 'PhysicsBodyComponent'],
    level: 'full',
    generate: (varName) => [
      `${varName}.components.set(CollisionComponent(shapes: [.generateConvex(from: ${varName}Mesh)]))`,
      `${varName}.components.set(PhysicsBodyComponent(mode: .kinematic))`,
    ],
  },

  cloth: {
    trait: 'cloth',
    components: ['CollisionComponent', 'PhysicsBodyComponent'],
    level: 'full',
    imports: ['RealityKit', 'Metal'],
    generate: (varName, config) => {
      const stiffness = config.stiffness ?? 0.8;
      const damping = config.damping ?? 0.02;
      const iterations = config.iterations ?? 10;
      const gravity = config.gravity ?? -9.81;
      const windStrength = config.wind_strength ?? 0;
      return [
        `// @cloth — Position-Based Dynamics cloth simulation`,
        `var ${varName}ClothSystem = ClothSimulationComponent()`,
        `${varName}ClothSystem.stiffness = ${stiffness}`,
        `${varName}ClothSystem.damping = ${damping}`,
        `${varName}ClothSystem.solverIterations = ${iterations}`,
        `${varName}ClothSystem.gravity = SIMD3<Float>(0, ${gravity}, 0)`,
        ...(windStrength
          ? [`${varName}ClothSystem.wind = SIMD3<Float>(${windStrength}, 0, 0)`]
          : []),
        `${varName}.components.set(${varName}ClothSystem)`,
        ``,
        `// Register cloth ECS system for Metal compute dispatch`,
        `ClothSimulationSystem.registerSystem()`,
        `ClothSimulationSystem.configure(device: MTLCreateSystemDefaultDevice()!)`,
      ];
    },
  },

  soft_body: {
    trait: 'soft_body',
    components: ['CollisionComponent', 'PhysicsBodyComponent'],
    level: 'full',
    imports: ['RealityKit', 'Metal'],
    generate: (varName, config) => {
      const compliance = config.compliance ?? 0.0001;
      const damping = config.damping ?? 0.01;
      const iterations = config.iterations ?? 8;
      const volumeStiffness = config.volume_stiffness ?? 1.0;
      const pressure = config.pressure ?? 1.0;
      return [
        `// @soft_body — Extended PBD (XPBD) soft body simulation`,
        `var ${varName}SoftBody = SoftBodyComponent()`,
        `${varName}SoftBody.compliance = ${compliance}`,
        `${varName}SoftBody.damping = ${damping}`,
        `${varName}SoftBody.solverIterations = ${iterations}`,
        `${varName}SoftBody.volumeStiffness = ${volumeStiffness}`,
        `${varName}SoftBody.pressure = ${pressure}`,
        `${varName}.components.set(${varName}SoftBody)`,
        `${varName}.components.set(CollisionComponent(shapes: [.generateConvex(from: ${varName}Mesh)]))`,
        ``,
        `// Register soft body ECS system`,
        `SoftBodySimulationSystem.registerSystem()`,
        `SoftBodySimulationSystem.configure(device: MTLCreateSystemDefaultDevice()!)`,
      ];
    },
  },

  fluid: {
    trait: 'fluid',
    components: ['CollisionComponent'],
    level: 'full',
    imports: ['RealityKit', 'Metal'],
    generate: (varName, config) => {
      const particleCount = config.particle_count ?? 10000;
      const viscosity = config.viscosity ?? 0.01;
      const restDensity = config.rest_density ?? 1000;
      const smoothingRadius = config.smoothing_radius ?? 0.04;
      const surfaceTension = config.surface_tension ?? 0.0728;
      return [
        `// @fluid — SPH (Smoothed Particle Hydrodynamics) fluid via Metal compute`,
        `var ${varName}Fluid = FluidSimulationComponent()`,
        `${varName}Fluid.particleCount = ${particleCount}`,
        `${varName}Fluid.viscosity = ${viscosity}`,
        `${varName}Fluid.restDensity = ${restDensity}`,
        `${varName}Fluid.smoothingRadius = ${smoothingRadius}`,
        `${varName}Fluid.surfaceTension = ${surfaceTension}`,
        `${varName}.components.set(${varName}Fluid)`,
        ``,
        `// SPH kernel dispatch — density, pressure, viscosity, integration passes`,
        `FluidSimulationSystem.registerSystem()`,
        `FluidSimulationSystem.configure(`,
        `    device: MTLCreateSystemDefaultDevice()!,`,
        `    maxParticles: ${particleCount}`,
        `)`,
      ];
    },
  },
};

// =============================================================================
// INTERACTION TRAITS
// =============================================================================

export const INTERACTION_TRAIT_MAP: Record<string, TraitMapping> = {
  grabbable: {
    trait: 'grabbable',
    components: ['CollisionComponent', 'PhysicsBodyComponent', 'InputTargetComponent'],
    level: 'full',
    generate: (varName, config) => {
      const mass = config.mass ?? 1.0;
      const snapToHand = config.snap_to_hand ?? false;
      const lines = [
        `${varName}.components.set(CollisionComponent(shapes: [.generateConvex(from: ${varName}Mesh)]))`,
        `${varName}.components.set(PhysicsBodyComponent(massProperties: .init(mass: ${mass}), mode: .dynamic))`,
        `${varName}.components.set(InputTargetComponent(allowedInputTypes: .indirect))`,
      ];
      if (snapToHand) {
        lines.push(`// snap_to_hand: true — implement via DragGesture handler`);
      }
      return lines;
    },
  },

  hoverable: {
    trait: 'hoverable',
    components: ['InputTargetComponent', 'HoverEffectComponent'],
    level: 'full',
    minVersion: '1.0',
    generate: (varName, config) => {
      const highlightColor = config.highlight_color || '#ffffff';
      return [
        `${varName}.components.set(InputTargetComponent())`,
        `${varName}.components.set(HoverEffectComponent())`,
        `// Highlight color: ${highlightColor} — configure via RealityKit material states`,
      ];
    },
  },

  clickable: {
    trait: 'clickable',
    components: ['InputTargetComponent', 'CollisionComponent'],
    level: 'full',
    generate: (varName) => [
      `${varName}.components.set(CollisionComponent(shapes: [.generateConvex(from: ${varName}Mesh)]))`,
      `${varName}.components.set(InputTargetComponent(allowedInputTypes: .indirect))`,
      `// Use .gesture(TapGesture().targetedToEntity(${varName})) for tap handling`,
    ],
  },

  draggable: {
    trait: 'draggable',
    components: ['InputTargetComponent', 'CollisionComponent'],
    level: 'full',
    generate: (varName, config) => {
      const axis = config.constrain_axis;
      const lines = [
        `${varName}.components.set(CollisionComponent(shapes: [.generateConvex(from: ${varName}Mesh)]))`,
        `${varName}.components.set(InputTargetComponent(allowedInputTypes: .indirect))`,
      ];
      if (axis) {
        lines.push(`// Constrain drag to axis: ${axis}`);
      }
      return lines;
    },
  },

  throwable: {
    trait: 'throwable',
    components: ['CollisionComponent', 'PhysicsBodyComponent', 'InputTargetComponent'],
    level: 'full',
    generate: (varName, config) => {
      const maxVelocity = config.max_velocity ?? 10;
      return [
        `${varName}.components.set(CollisionComponent(shapes: [.generateConvex(from: ${varName}Mesh)]))`,
        `${varName}.components.set(PhysicsBodyComponent(massProperties: .init(mass: 1.0), mode: .dynamic))`,
        `${varName}.components.set(InputTargetComponent())`,
        `// Max velocity: ${maxVelocity} — clamp in gesture handler`,
      ];
    },
  },

  pointable: {
    trait: 'pointable',
    components: ['InputTargetComponent'],
    level: 'full',
    generate: (varName) => [
      `${varName}.components.set(InputTargetComponent(allowedInputTypes: [.indirect, .direct]))`,
    ],
  },

  scalable: {
    trait: 'scalable',
    components: ['InputTargetComponent', 'CollisionComponent'],
    level: 'full',
    generate: (varName, config) => {
      const minScale = config.min_scale ?? 0.1;
      const maxScale = config.max_scale ?? 3.0;
      return [
        `${varName}.components.set(InputTargetComponent())`,
        `${varName}.components.set(CollisionComponent(shapes: [.generateConvex(from: ${varName}Mesh)]))`,
        `// @scalable — attach MagnifyGesture in SwiftUI view:`,
        `// .gesture(MagnifyGesture().targetedToEntity(${varName}).onChanged { value in`,
        `//     let s = Float(value.magnification) * initialScale`,
        `//     let clamped = min(max(s, ${minScale}), ${maxScale})`,
        `//     value.entity.setScale(SIMD3<Float>(repeating: clamped), relativeTo: value.entity.parent)`,
        `// })`,
      ];
    },
  },

  rotatable: {
    trait: 'rotatable',
    components: ['InputTargetComponent', 'CollisionComponent'],
    level: 'full',
    generate: (varName, config) => {
      const axis = String(config.axis || 'y');
      const axisMap: Record<string, string> = { x: '.x', y: '.y', z: '.z' };
      return [
        `${varName}.components.set(InputTargetComponent())`,
        `${varName}.components.set(CollisionComponent(shapes: [.generateConvex(from: ${varName}Mesh)]))`,
        `// @rotatable — attach RotateGesture3D in SwiftUI view:`,
        `// .gesture(RotateGesture3D(constrainedToAxis: ${axisMap[axis] || '.y'}).targetedToEntity(${varName}).onChanged { value in`,
        `//     let rotTransform = Transform(AffineTransform3D(rotation: value.rotation))`,
        `//     value.entity.transform.rotation = sourceRotation * rotTransform.rotation`,
        `// })`,
      ];
    },
  },
};

// =============================================================================
// AUDIO TRAITS
// =============================================================================

export const AUDIO_TRAIT_MAP: Record<string, TraitMapping> = {
  audio: {
    trait: 'audio',
    components: ['AmbientAudioComponent'],
    level: 'full',
    imports: ['AVFoundation'],
    generate: (varName, config) => {
      const src = config.src || config.source || '';
      const loop = config.loop ?? false;
      return [
        `if let audioResource = try? await AudioFileResource(named: "${src}") {`,
        `    let controller = ${varName}.prepareAudio(audioResource)`,
        loop ? `    controller.gain = .decibels(-6)` : '',
        `    controller.play()`,
        `}`,
      ].filter(Boolean);
    },
  },

  spatial_audio: {
    trait: 'spatial_audio',
    components: ['SpatialAudioComponent'],
    level: 'full',
    generate: (varName, config) => {
      const refDistance = config.refDistance ?? 1.0;
      const rolloff = config.rolloff ?? 1.0;
      return [
        `var ${varName}SpatialAudio = SpatialAudioComponent()`,
        `${varName}SpatialAudio.gain = .decibels(0)`,
        `${varName}SpatialAudio.directivity = .beam(focus: 0.5)`,
        `${varName}.components.set(${varName}SpatialAudio)`,
        `// Reference distance: ${refDistance}, rolloff: ${rolloff}`,
      ];
    },
  },

  ambisonics: {
    trait: 'ambisonics',
    components: ['AmbientAudioComponent'],
    level: 'full',
    generate: (varName, config) => {
      const src = config.src || config.source || 'ambisonic_soundscape';
      const loop = config.loop ?? true;
      return [
        `// @ambisonics — AmbientAudioComponent renders with 3DOF (head + source rotation)`,
        `${varName}.components.set(AmbientAudioComponent())`,
        `if let resource = try? await AudioFileResource(named: "${src}", configuration: .init(shouldLoop: ${loop}, loadingStrategy: .stream)) {`,
        `    ${varName}.playAudio(resource)`,
        `}`,
      ];
    },
  },

  reverb_zone: {
    trait: 'reverb_zone',
    components: ['ReverbComponent'],
    level: 'full',
    minVersion: '2.0',
    generate: (varName, config) => {
      const preset = String(config.preset || 'largeRoom');
      const presetMap: Record<string, string> = {
        smallRoom: '.smallRoom',
        mediumRoom: '.mediumRoom',
        largeRoom: '.largeRoom',
        veryLargeRoom: '.veryLargeRoom',
        automatic: '.automatic',
      };
      return [
        `// @reverb_zone — one active ReverbComponent per entity hierarchy`,
        `${varName}.components.set(ReverbComponent(reverb: .preset(${presetMap[preset] || '.largeRoom'})))`,
      ];
    },
  },

  audio_occlusion: {
    trait: 'audio_occlusion',
    components: ['SpatialAudioComponent', 'CollisionComponent'],
    level: 'full',
    generate: (varName, config) => {
      const focus = config.focus ?? 0.25;
      return [
        `// @audio_occlusion — RealityKit ray-traces occlusion automatically`,
        `// Entities with CollisionComponent block audio from SpatialAudioComponent sources`,
        `var ${varName}SpatialAudio = SpatialAudioComponent()`,
        `${varName}SpatialAudio.directivity = .beam(focus: ${focus})`,
        `${varName}SpatialAudio.distanceAttenuation = .rolloff(factor: 1.0)`,
        `${varName}.components.set(${varName}SpatialAudio)`,
        `${varName}.components.set(CollisionComponent(shapes: [.generateConvex(from: ${varName}Mesh)]))`,
      ];
    },
  },

  head_tracked_audio: {
    trait: 'head_tracked_audio',
    components: ['SpatialAudioComponent'],
    level: 'full',
    generate: (varName) => [
      `var ${varName}Audio = SpatialAudioComponent()`,
      `${varName}Audio.isHeadTracked = true`,
      `${varName}.components.set(${varName}Audio)`,
    ],
  },
};

// =============================================================================
// AR/XR TRAITS
// =============================================================================

export const AR_TRAIT_MAP: Record<string, TraitMapping> = {
  anchor: {
    trait: 'anchor',
    components: ['AnchoringComponent'],
    level: 'full',
    generate: (varName, config) => {
      const target = String(config.anchor_type || 'plane');
      const targetMap: Record<string, string> = {
        plane: '.plane(.horizontal, classification: .any, minimumBounds: SIMD2<Float>(0.1, 0.1))',
        vertical: '.plane(.vertical, classification: .any, minimumBounds: SIMD2<Float>(0.1, 0.1))',
        image: '.image(group: "ImageTargets", name: "target")',
        face: '.face',
        hand: '.hand(.left, location: .palm)',
        world: '.world(transform: .identity)',
      };
      return [
        `${varName}.components.set(AnchoringComponent(${targetMap[target] || '.world(transform: .identity)'}))`,
      ];
    },
  },

  plane_detection: {
    trait: 'plane_detection',
    components: [],
    level: 'full',
    imports: ['ARKit'],
    generate: (varName, config) => {
      const types = (config.types as string[]) || ['horizontal', 'vertical'];
      const alignments = types.map((t: string) => `.${t}`).join(', ');
      return [
        `// @plane_detection — ARKit PlaneDetectionProvider (requires Full Space)`,
        `// Info.plist: NSWorldSensingUsageDescription`,
        `let ${varName}PlaneProvider = PlaneDetectionProvider(alignments: [${alignments}])`,
        `try await arkitSession.run([${varName}PlaneProvider])`,
        `Task {`,
        `    for await update in ${varName}PlaneProvider.anchorUpdates {`,
        `        let anchor = update.anchor`,
        `        let extent = anchor.geometry.extent`,
        `        switch update.event {`,
        `        case .added, .updated:`,
        `            let plane = ModelEntity(mesh: .generatePlane(width: extent.width, height: extent.height))`,
        `            plane.transform = Transform(matrix: anchor.originFromAnchorTransform * extent.anchorFromExtentTransform)`,
        `        case .removed: break`,
        `        }`,
        `    }`,
        `}`,
      ];
    },
  },

  mesh_detection: {
    trait: 'mesh_detection',
    components: [],
    level: 'full',
    imports: ['ARKit'],
    generate: (varName) => [
      `// @mesh_detection — ARKit SceneReconstructionProvider (requires Full Space)`,
      `// Info.plist: NSWorldSensingUsageDescription`,
      `let ${varName}SceneProvider = SceneReconstructionProvider()`,
      `try await arkitSession.run([${varName}SceneProvider])`,
      `Task {`,
      `    for await update in ${varName}SceneProvider.anchorUpdates {`,
      `        let anchor = update.anchor`,
      `        switch update.event {`,
      `        case .added, .updated:`,
      `            let shape = try await ShapeResource.generateStaticMesh(from: anchor)`,
      `            let meshEntity = ModelEntity()`,
      `            meshEntity.model = .init(mesh: .generateSphere(radius: 0), materials: [OcclusionMaterial()])`,
      `            meshEntity.collision = CollisionComponent(shapes: [shape], isStatic: true)`,
      `            meshEntity.physicsBody = PhysicsBodyComponent(mode: .static)`,
      `            meshEntity.transform = Transform(matrix: anchor.originFromAnchorTransform)`,
      `        case .removed: break`,
      `        }`,
      `    }`,
      `}`,
    ],
  },

  hand_tracking: {
    trait: 'hand_tracking',
    components: [],
    level: 'full',
    imports: ['ARKit'],
    generate: (varName) => [
      `// @hand_tracking — ARKit HandTrackingProvider (requires Full Space)`,
      `// Info.plist: NSHandsTrackingUsageDescription`,
      `let ${varName}HandProvider = HandTrackingProvider()`,
      `try await arkitSession.run([${varName}HandProvider])`,
      `Task {`,
      `    for await update in ${varName}HandProvider.anchorUpdates {`,
      `        let anchor = update.anchor`,
      `        guard anchor.isTracked, let skeleton = anchor.handSkeleton else { continue }`,
      `        let tips: [HandSkeleton.JointName] = [.thumbTip, .indexFingerTip, .middleFingerTip, .ringFingerTip, .littleFingerTip]`,
      `        for joint in tips {`,
      `            let j = skeleton.joint(joint)`,
      `            guard j.isTracked else { continue }`,
      `            let worldPos = anchor.originFromAnchorTransform * j.anchorFromJointTransform`,
      `            // chirality: anchor.chirality (.left / .right)`,
      `        }`,
      `    }`,
      `}`,
    ],
  },

  eye_tracking: {
    trait: 'eye_tracking',
    components: ['HoverEffectComponent', 'InputTargetComponent', 'CollisionComponent'],
    level: 'full',
    generate: (varName) => [
      `// @eye_tracking — raw gaze data is system-private on visionOS`,
      `// Use HoverEffectComponent for gaze-driven visual feedback`,
      `${varName}.components.set(InputTargetComponent())`,
      `${varName}.components.set(CollisionComponent(shapes: [.generateConvex(from: ${varName}Mesh)]))`,
      `${varName}.components.set(HoverEffectComponent())`,
    ],
  },

  occlusion: {
    trait: 'occlusion',
    components: [],
    level: 'full',
    generate: (_varName) => [
      `// @occlusion — RealityKit handles automatically`,
      `// Ensure object has ModelComponent with proper materials`,
    ],
  },

  light_estimation: {
    trait: 'light_estimation',
    components: ['ImageBasedLightComponent'],
    level: 'full',
    generate: (varName) => [
      `// @light_estimation — ARKit provides environmental lighting automatically`,
      `${varName}.components.set(ImageBasedLightReceiverComponent(imageBasedLight: root))`,
    ],
  },

  world_anchor: {
    trait: 'world_anchor',
    components: ['AnchoringComponent'],
    level: 'full',
    generate: (varName, config) => {
      const persistent = config.persistent ?? true;
      return [
        `${varName}.components.set(AnchoringComponent(.world(transform: .identity)))`,
        persistent
          ? `// Persist via WorldTrackingProvider.addAnchor()`
          : `// Non-persistent world anchor`,
      ];
    },
  },

  geospatial: {
    trait: 'geospatial',
    components: [],
    level: 'unsupported',
    generate: (_, config) => [
      `// @geospatial — NOT available on visionOS (no GPS module on Apple Vision Pro)`,
      `// Latitude: ${config.latitude}, Longitude: ${config.longitude}`,
      `// Workaround: use WorldAnchor with GPS coordinates from a paired iPhone`,
    ],
  },
};

// =============================================================================
// VISUAL TRAITS
// =============================================================================

export const VISUAL_TRAIT_MAP: Record<string, TraitMapping> = {
  visible: {
    trait: 'visible',
    components: [],
    level: 'full',
    generate: (varName, config) => {
      const visible = config.visible ?? true;
      return [visible ? '' : `${varName}.isEnabled = false`].filter(Boolean);
    },
  },

  invisible: {
    trait: 'invisible',
    components: [],
    level: 'full',
    generate: (varName) => [`${varName}.isEnabled = false`],
  },

  billboard: {
    trait: 'billboard',
    components: ['BillboardComponent'],
    level: 'full',
    generate: (varName) => [
      `// @billboard — built-in RealityKit BillboardComponent (privacy-preserving)`,
      `${varName}.components.set(BillboardComponent())`,
    ],
  },

  particle_emitter: {
    trait: 'particle_emitter',
    components: ['ParticleEmitterComponent'],
    level: 'full',
    minVersion: '2.0',
    generate: (varName, config) => {
      const rate = config.rate ?? 100;
      const lifetime = config.lifetime ?? 1.0;
      return [
        `var ${varName}Particles = ParticleEmitterComponent()`,
        `${varName}Particles.emitterShape = .sphere`,
        `${varName}Particles.birthRate = ${rate}`,
        `${varName}Particles.lifeSpan = ${lifetime}`,
        `${varName}.components.set(${varName}Particles)`,
      ];
    },
  },

  animated: {
    trait: 'animated',
    components: [],
    level: 'full',
    generate: (varName, config) => {
      const clip = config.clip || '';
      const loop = config.loop ?? true;
      const speed = config.speed ?? 1.0;
      const transition = config.transition ?? 0.25;
      const lines = [`// @animated — play animation from USDZ or programmatic AnimationResource`];
      if (clip) {
        lines.push(
          `if let animation = ${varName}.availableAnimations.first(where: { $0.name == "${clip}" }) {`,
          `    let controller = ${varName}.playAnimation(animation${loop ? '.repeat(duration: .infinity)' : ''}, transitionDuration: ${transition})`,
          `    controller.speed = ${speed}`,
          `}`
        );
      } else {
        lines.push(
          `for animation in ${varName}.availableAnimations {`,
          `    let controller = ${varName}.playAnimation(animation${loop ? '.repeat(duration: .infinity)' : ''}, transitionDuration: ${transition})`,
          `    controller.speed = ${speed}`,
          `}`
        );
      }
      return lines;
    },
  },

  lod: {
    trait: 'lod',
    components: [],
    level: 'full',
    generate: (varName, config) => {
      const distances = config.distances || [5, 15];
      const d = distances as number[];
      return [
        `// @lod — no built-in LOD in RealityKit; use custom ECS System`,
        `// Requires WorldTrackingProvider for camera position (Full Space only)`,
        `struct ${varName}LODComponent: Component, Codable {`,
        `    var thresholds: [Float] = [${d[0] ?? 5}, ${d[1] ?? 15}]`,
        `    var currentLevel: Int = 0`,
        `}`,
        `${varName}LODComponent.registerComponent()`,
        `// LODSystem.update(): query camera distance, swap ModelComponent.mesh via level thresholds`,
        `${varName}.components.set(${varName}LODComponent())`,
      ];
    },
  },

  shadow_caster: {
    trait: 'shadow_caster',
    components: ['GroundingShadowComponent'],
    level: 'full',
    generate: (varName) => [
      `${varName}.components.set(GroundingShadowComponent(castsShadow: true))`,
    ],
  },

  shadow_receiver: {
    trait: 'shadow_receiver',
    components: ['GroundingShadowComponent'],
    level: 'full',
    generate: (varName) => [
      `${varName}.components.set(GroundingShadowComponent(castsShadow: false))`,
    ],
  },
};

// =============================================================================
// ACCESSIBILITY TRAITS
// =============================================================================

export const ACCESSIBILITY_TRAIT_MAP: Record<string, TraitMapping> = {
  accessible: {
    trait: 'accessible',
    components: ['AccessibilityComponent'],
    level: 'full',
    generate: (varName, config) => {
      const label = config.label || '';
      const hint = config.hint || '';
      const isButton = config.isButton ?? false;
      const lines = [`var ${varName}Accessibility = AccessibilityComponent()`];
      if (label) lines.push(`${varName}Accessibility.label = "${label}"`);
      if (hint) lines.push(`${varName}Accessibility.hint = "${hint}"`);
      if (isButton) lines.push(`${varName}Accessibility.isButton = true`);
      lines.push(`${varName}.components.set(${varName}Accessibility)`);
      return lines;
    },
  },

  alt_text: {
    trait: 'alt_text',
    components: ['AccessibilityComponent'],
    level: 'full',
    generate: (varName, config) => {
      const text = config.text || '';
      return [
        `var ${varName}Accessibility = AccessibilityComponent()`,
        `${varName}Accessibility.label = "${text}"`,
        `${varName}.components.set(${varName}Accessibility)`,
      ];
    },
  },

  high_contrast: {
    trait: 'high_contrast',
    components: [],
    level: 'full',
    generate: (varName) => [
      `// @high_contrast — SwiftUI: @Environment(\\.colorSchemeContrast) var contrast`,
      `// UIKit: UIAccessibility.isDarkerSystemColorsEnabled`,
      `if UIAccessibility.isDarkerSystemColorsEnabled {`,
      `    // Apply high-contrast materials (WCAG 7:1 ratio)`,
      `    var ${varName}Material = SimpleMaterial()`,
      `    ${varName}Material.color = .init(tint: .black)`,
      `    ${varName}.model?.materials = [${varName}Material]`,
      `}`,
    ],
  },

  motion_reduced: {
    trait: 'motion_reduced',
    components: [],
    level: 'full',
    generate: (varName) => [
      `// @motion_reduced — SwiftUI: @Environment(\\.accessibilityReduceMotion) var reduceMotion`,
      `if UIAccessibility.isReduceMotionEnabled {`,
      `    // Skip animations, use instant transitions`,
      `    ${varName}.stopAllAnimations()`,
      `} else {`,
      `    for animation in ${varName}.availableAnimations {`,
      `        ${varName}.playAnimation(animation.repeat(duration: .infinity))`,
      `    }`,
      `}`,
    ],
  },
};

// =============================================================================
// UI TRAITS (SPATIAL)
// =============================================================================

export const UI_TRAIT_MAP: Record<string, TraitMapping> = {
  ui_floating: {
    trait: 'ui_floating',
    components: [],
    level: 'full',
    generate: (varName, config) => {
      const distance = config.distance ?? 0.3;
      return [
        `// @ui_floating — ViewAttachmentComponent (visionOS 2.0+)`,
        `let ${varName}Panel = Entity()`,
        `${varName}Panel.components.set(ViewAttachmentComponent(rootView:`,
        `    VStack {`,
        `        Text("${config.title || 'Info'}")`,
        `            .font(.headline)`,
        `    }`,
        `    .padding()`,
        `    .glassBackgroundEffect()`,
        `))`,
        `${varName}Panel.position = SIMD3<Float>(0, Float(${distance}), 0)`,
        `${varName}.addChild(${varName}Panel)`,
      ];
    },
  },

  ui_anchored: {
    trait: 'ui_anchored',
    components: ['AnchoringComponent'],
    level: 'full',
    generate: (varName, config) => {
      const to = String(config.to || 'world');
      const anchorMap: Record<string, string> = {
        world: '.world(transform: .identity)',
        head: '.head',
        left_hand: '.hand(.left, location: .palm)',
        right_hand: '.hand(.right, location: .palm)',
      };
      return [
        `${varName}.components.set(AnchoringComponent(${anchorMap[to] || '.world(transform: .identity)'}))`,
      ];
    },
  },

  ui_hand_menu: {
    trait: 'ui_hand_menu',
    components: ['AnchoringComponent'],
    level: 'full',
    generate: (varName, config) => {
      const hand = config.hand || 'left';
      const trigger = config.trigger || 'palm_up';
      return [
        `${varName}.components.set(AnchoringComponent(.hand(.${hand}, location: .palm)))`,
        `// Trigger: ${trigger} — implement gesture detection`,
      ];
    },
  },

  ui_billboard: {
    trait: 'ui_billboard',
    components: ['BillboardComponent'],
    level: 'full',
    generate: (varName) => [
      `// @ui_billboard — BillboardComponent keeps UI facing the user`,
      `${varName}.components.set(BillboardComponent())`,
    ],
  },

  ui_docked: {
    trait: 'ui_docked',
    components: [],
    level: 'full',
    generate: (varName, config) => {
      const position = String(config.position || 'bottom');
      const posMap: Record<string, string> = {
        bottom: '.scene(.bottom)',
        top: '.scene(.top)',
        leading: '.scene(.leading)',
        trailing: '.scene(.trailing)',
      };
      return [
        `// @ui_docked — SwiftUI .ornament() modifier on window content`,
        `// .ornament(visibility: .visible, attachmentAnchor: ${posMap[position] || '.scene(.bottom)'}, contentAlignment: .${position}) {`,
        `//     HStack {`,
        `//         // ${varName} docked controls`,
        `//     }`,
        `//     .padding()`,
        `//     .glassBackgroundEffect()`,
        `// }`,
      ];
    },
  },
};

// =============================================================================
// PORTAL/VOLUME TRAITS (visionOS specific)
// =============================================================================

export const PORTAL_TRAIT_MAP: Record<string, TraitMapping> = {
  portal: {
    trait: 'portal',
    components: ['PortalComponent', 'WorldComponent'],
    level: 'full',
    minVersion: '1.0',
    generate: (varName, config) => {
      const _targetWorld = config.target_world || 'portalWorld';
      return [
        `let ${varName}World = Entity()`,
        `${varName}World.components.set(WorldComponent())`,
        `${varName}.components.set(PortalComponent(target: ${varName}World))`,
        `// Add content to ${varName}World for portal interior`,
      ];
    },
  },

  volume: {
    trait: 'volume',
    components: [],
    level: 'full',
    generate: (varName, config) => {
      const size = config.size || [0.6, 0.4, 0.4];
      const s = size as number[];
      return [
        `// @volume — Scene-level: add WindowGroup to your App struct`,
        `// WindowGroup(id: "${varName}Volume") {`,
        `//     ${varName}VolumetricView()`,
        `// }`,
        `// .windowStyle(.volumetric)`,
        `// .defaultSize(width: ${s[0]}, height: ${s[1]}, depth: ${s[2]}, in: .meters)`,
        `//`,
        `// Open with: openWindow(id: "${varName}Volume")`,
      ];
    },
  },

  immersive: {
    trait: 'immersive',
    components: [],
    level: 'full',
    generate: (varName, config) => {
      const style = String(config.style || 'mixed');
      const styleMap: Record<string, string> = {
        mixed: '.mixed',
        progressive: '.progressive',
        full: '.full',
      };
      return [
        `// @immersive — Scene-level: add ImmersiveSpace to your App struct`,
        `// ImmersiveSpace(id: "${varName}Space") {`,
        `//     ${varName}ImmersiveView()`,
        `// }`,
        `// .immersionStyle(selection: $immersionStyle, in: ${styleMap[style] || '.mixed'})`,
        `//`,
        `// Open:    let result = await openImmersiveSpace(id: "${varName}Space")`,
        `// Dismiss: await dismissImmersiveSpace()`,
      ];
    },
  },
};

// =============================================================================
// V43 AI/XR TRAIT MAP
// =============================================================================

export const V43_TRAIT_MAP: Record<string, TraitMapping> = {
  spatial_persona: {
    trait: 'spatial_persona',
    components: [],
    level: 'full',
    minVersion: '2.0',
    imports: ['GroupActivities'],
    generate: (varName, config) => {
      const style = String(config.style || 'realistic');
      return [
        `// @spatial_persona — visionOS 2.0 Spatial Persona (GroupActivities)`,
        `// Requires SharePlay session; persona renders at ${varName} position`,
        `let ${varName}PersonaStyle: SpatialPersonaStyle = .${style}`,
        `let ${varName}SpatialTemplate = SpatialTemplate(settings: SpatialTemplateSettings())`,
        `let ${varName}Coordinator = SystemCoordinator()`,
        `Task {`,
        `    for await session in GroupStateObserver().isSpatialSharePlayActive.values {`,
        `        guard session else { continue }`,
        `        await SystemCoordinator.requestForegroundPresentation(`,
        `            .spatialPersona(style: ${varName}PersonaStyle),`,
        `            template: ${varName}SpatialTemplate`,
        `        )`,
        `    }`,
        `}`,
        `${varName}.components.set(OpacityComponent(opacity: 1.0))`,
      ];
    },
  },

  shareplay: {
    trait: 'shareplay',
    components: [],
    level: 'full',
    minVersion: '1.0',
    imports: ['GroupActivities'],
    generate: (varName, config) => {
      const activity = String(config.activity_type || 'custom');
      return [
        `// @shareplay — SharePlay GroupActivity (activity: ${activity})`,
        `struct ${varName}Activity: GroupActivity {`,
        `    var metadata = GroupActivityMetadata()`,
        `    init() {`,
        `        metadata.title = "${activity}"`,
        `        metadata.type = .generic`,
        `    }`,
        `}`,
        ``,
        `// Activate session and set up GroupSessionMessenger`,
        `func ${varName}ActivateSharePlay() {`,
        `    Task {`,
        `        for await session in ${varName}Activity.sessions() {`,
        `            await session.join(activationConditions: [.always])`,
        `            let messenger = GroupSessionMessenger(session: session)`,
        `            // Send: try? await messenger.send("event", to: .all)`,
        `            // Receive: for await (msg, _) in messenger.messages(of: String.self) { handle(msg) }`,
        `            _ = messenger`,
        `        }`,
        `    }`,
        `}`,
      ];
    },
  },

  object_tracking: {
    trait: 'object_tracking',
    components: ['AnchoringComponent'],
    level: 'full',
    minVersion: '2.0',
    imports: ['ARKit'],
    generate: (varName, config) => {
      const referenceObject = String(config.reference_object || 'MyObject');
      return [
        `// @object_tracking — ARKit ObjectTrackingProvider (visionOS 2.0)`,
        `// Info.plist: NSWorldSensingUsageDescription`,
        `// Load .referenceobject bundle from app bundle for ${referenceObject}`,
        `let ${varName}RefObjURL = Bundle.main.url(forResource: "${referenceObject}", withExtension: "referenceobject")!`,
        `let ${varName}RefObj = try await ReferenceObject(from: ${varName}RefObjURL)`,
        `let ${varName}ObjProvider = ObjectTrackingProvider(referenceObjects: [${varName}RefObj])`,
        `try await arkitSession.run([${varName}ObjProvider])`,
        `Task {`,
        `    for await update in ${varName}ObjProvider.anchorUpdates {`,
        `        switch update.event {`,
        `        case .added, .updated:`,
        `            // Place ${varName} at tracked object anchor`,
        `            ${varName}.transform = Transform(matrix: update.anchor.originFromAnchorTransform)`,
        `        case .removed:`,
        `            ${varName}.transform = Transform()`,
        `        }`,
        `    }`,
        `}`,
        `// Info.plist: NSWorldSensingUsageDescription required`,
      ];
    },
  },

  scene_reconstruction: {
    trait: 'scene_reconstruction',
    components: [],
    level: 'full',
    minVersion: '1.0',
    imports: ['ARKit'],
    generate: (varName, config) => {
      const mode = String(config.mode || 'mesh');
      return [
        `// @scene_reconstruction — SceneReconstructionProvider (mode: ${mode})`,
        `// Info.plist: NSWorldSensingUsageDescription`,
        `let ${varName}SceneProvider = SceneReconstructionProvider(modes: [.${mode}])`,
        `try await arkitSession.run([${varName}SceneProvider])`,
        `Task {`,
        `    for await update in ${varName}SceneProvider.anchorUpdates {`,
        `        // handle MeshAnchor updates`,
        `    }`,
        `}`,
      ];
    },
  },

  volumetric_window: {
    trait: 'volumetric_window',
    components: ['ModelComponent'],
    level: 'full',
    minVersion: '1.0',
    generate: (varName, config) => {
      const width = Number(config.width || 0.5);
      const height = Number(config.height || 0.5);
      const depth = Number(config.depth || 0.5);
      return [
        `// @volumetric_window — WindowGroup with volumetric style`,
        `// In App.swift: WindowGroup { ContentView() }.windowStyle(.volumetric)`,
        `// .defaultSize(width: ${width}, height: ${height}, depth: ${depth}, in: .meters)`,
        `${varName}.components.set(ModelComponent(mesh: .generateBox(size: [${width}, ${height}, ${depth}]), materials: []))`,
      ];
    },
  },

  spatial_navigation: {
    trait: 'spatial_navigation',
    components: ['AnchoringComponent'],
    level: 'full',
    minVersion: '1.0',
    imports: ['ARKit', 'SwiftUI'],
    generate: (varName, config) => {
      // Honors SpatialNavigationConfig (packages/core/src/traits/SpatialNavigationTrait.ts):
      //   navigation_mode: 'walking' | 'driving' | 'cycling' | 'indoor'
      //   path_visualization: 'arrow' | 'line' | 'breadcrumb' | 'holographic'
      //   waypoint_radius_m: number
      //   path_color: '#RRGGBB'
      const mode = String(config.navigation_mode ?? config.mode ?? 'walking');
      const viz = String(config.path_visualization ?? 'arrow');
      const waypointRadius = Number(config.waypoint_radius_m ?? 2.0);
      const rawColor = String(config.path_color ?? '#00aaff').replace('#', '');
      const r = parseInt(rawColor.slice(0, 2) || '00', 16) / 255;
      const g = parseInt(rawColor.slice(2, 4) || 'aa', 16) / 255;
      const b = parseInt(rawColor.slice(4, 6) || 'ff', 16) / 255;
      const isIndoor = mode === 'indoor';
      if (isIndoor) {
        // Indoor / menu-driven navigation -> SwiftUI NavigationSplitView pattern.
        return [
          `// @spatial_navigation — indoor mode (NavigationSplitView, ${viz} viz)`,
          `// In your App / RootView:`,
          `// NavigationSplitView {`,
          `//     List(${varName}NavWaypoints, selection: $${varName}SelectedWaypoint) { wp in`,
          `//         Text(wp.label)`,
          `//     }`,
          `// } detail: {`,
          `//     ${varName.charAt(0).toUpperCase() + varName.slice(1)}WaypointDetail(id: $${varName}SelectedWaypoint)`,
          `// }`,
          `${varName}.components.set(AnchoringComponent(.world(transform: matrix_identity_float4x4)))`,
          `var ${varName}NavWaypoints: [SpatialWaypoint] = []`,
          `var ${varName}SelectedWaypoint: SpatialWaypoint.ID? = nil`,
          `let ${varName}WaypointRadius: Float = ${waypointRadius}`,
        ];
      }
      // Outdoor / world-scale: ARKit WorldTrackingProvider + per-waypoint anchors,
      // path rendered as RealityKit entity chain. Path color preserved from config.
      return [
        `// @spatial_navigation — ${mode} mode, ${viz} path viz`,
        `// Info.plist: NSWorldSensingUsageDescription required`,
        `let ${varName}WorldProvider = WorldTrackingProvider()`,
        `try await arkitSession.run([${varName}WorldProvider])`,
        `var ${varName}NavWaypoints: [(id: String, anchor: WorldAnchor, reached: Bool)] = []`,
        `var ${varName}CurrentWaypoint = 0`,
        `let ${varName}WaypointRadius: Float = ${waypointRadius}`,
        `let ${varName}PathColor = SimpleMaterial(color: .init(red: ${r.toFixed(3)}, green: ${g.toFixed(3)}, blue: ${b.toFixed(3)}, alpha: 1.0), isMetallic: false)`,
        `Task {`,
        `    for await update in ${varName}WorldProvider.anchorUpdates {`,
        `        // Render ${viz} path between consecutive waypoints; advance currentWaypoint`,
        `        // when player transform is within ${varName}WaypointRadius of next anchor.`,
        `    }`,
        `}`,
      ];
    },
  },

  eye_tracked: {
    trait: 'eye_tracked',
    components: ['InputTargetComponent', 'HoverEffectComponent'],
    level: 'full',
    minVersion: '1.0',
    generate: (varName, _config) => [
      `${varName}.components.set(InputTargetComponent())`,
      `${varName}.components.set(HoverEffectComponent())`,
      `// Eye tracking: entity responds to gaze via SwiftUI .onHover or RealityView gesture`,
    ],
  },

  realitykit_mesh: {
    trait: 'realitykit_mesh',
    components: ['ModelComponent'],
    level: 'full',
    minVersion: '1.0',
    generate: (varName, config) => {
      const shape = String(config.shape || 'box');
      const shapeMap: Record<string, string> = {
        box: '.generateBox(size: [0.1, 0.1, 0.1])',
        sphere: '.generateSphere(radius: 0.05)',
        cylinder: '.generateCylinder(height: 0.1, radius: 0.05)',
        plane: '.generatePlane(width: 0.5, height: 0.5)',
      };
      return [
        `${varName}.components.set(ModelComponent(mesh: .${shapeMap[shape] || shapeMap['box']}, materials: [SimpleMaterial()]))`,
      ];
    },
  },

  eye_hand_fusion: {
    trait: 'eye_hand_fusion',
    components: ['InputTargetComponent'],
    level: 'partial',
    minVersion: '2.0',
    imports: ['ARKit'],
    generate: (varName, _config) => [
      `// @eye_hand_fusion — combined eye + hand tracking (visionOS 2.0)`,
      `let ${varName}HandProvider = HandTrackingProvider()`,
      `try await arkitSession.run([${varName}HandProvider])`,
      `// Fuse HandAnchor index-tip joint with gaze raycast for confirmed interaction`,
      `Task {`,
      `    for await update in ${varName}HandProvider.anchorUpdates {`,
      `        let hand = update.anchor`,
      `        guard let indexTip = hand.handSkeleton?.joint(.indexFingerTip),`,
      `              indexTip.isTracked else { continue }`,
      `        let tipWorld = hand.originFromAnchorTransform * indexTip.anchorFromJointTransform`,
      `        let tipPos = SIMD3<Float>(tipWorld.columns.3.x, tipWorld.columns.3.y, tipWorld.columns.3.z)`,
      `        // Get gaze ray from WorldTrackingProvider or RealityView input`,
      `        // When finger tip is within 5cm of target: treat as pinch-select`,
      `        if let gazeTarget = ${varName}LastGazeHit {`,
      `            let dist = length(tipPos - gazeTarget)`,
      `            if dist < 0.05 {`,
      `                // Confirmed: eye + hand converge on ${varName}`,
      `            }`,
      `        }`,
      `    }`,
      `}`,
      `var ${varName}LastGazeHit: SIMD3<Float>? = nil`,
    ],
  },

  // AI Generation traits — comment-level stubs (GPU compute not native to RealityKit)
  controlnet: {
    trait: 'controlnet',
    components: [],
    level: 'partial',
    imports: ['CoreML', 'Foundation'],
    generate: (_varName, config) => {
      const model = String(config.model || 'canny');
      const endpoint = String(config.endpoint || '');
      return [
        `// @controlnet — ControlNet image generation (model: ${model})`,
        `// Attempts local CoreML inference; falls back to remote endpoint if model unavailable`,
        `func controlnetInfer_${model.replace(/[^a-zA-Z0-9]/g, '_')}(prompt: String, conditioning: CIImage) async throws -> CIImage {`,
        `    let modelName = "${model.replace(/[^a-zA-Z0-9_]/g, '_')}ControlNet"`,
        `    if let modelURL = Bundle.main.url(forResource: modelName, withExtension: "mlmodelc"),`,
        `       let mlModel = try? MLModel(contentsOf: modelURL) {`,
        `        // CoreML inference path`,
        `        let input = try MLDictionaryFeatureProvider(dictionary: [`,
        `            "prompt": MLFeatureValue(string: prompt),`,
        `        ])`,
        `        let output = try mlModel.prediction(from: input)`,
        `        let pixBuf = output.featureValue(for: "generated_image")?.imageBufferValue`,
        `        return pixBuf.map { CIImage(cvPixelBuffer: $0) } ?? CIImage.empty()`,
        `    }`,
        ...(endpoint
          ? [
              `    // Remote inference fallback`,
              `    var req = URLRequest(url: URL(string: "${endpoint}")!)`,
              `    req.httpMethod = "POST"`,
              `    req.setValue("application/json", forHTTPHeaderField: "Content-Type")`,
              `    req.httpBody = try JSONSerialization.data(withJSONObject: ["prompt": prompt, "model": "${model}"])`,
              `    let (data, _) = try await URLSession.shared.data(for: req)`,
              `    // Decode base64 PNG from response`,
              `    if let b64 = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["image"] as? String,`,
              `       let imgData = Data(base64Encoded: b64),`,
              `       let nsImg = NSImage(data: imgData) {`,
              `        return CIImage(data: imgData) ?? CIImage.empty()`,
              `    }`,
              `    return CIImage.empty()`,
            ]
          : [`    return CIImage.empty() // No remote endpoint configured`]),
        `}`,
      ];
    },
  },

  ai_texture_gen: {
    trait: 'ai_texture_gen',
    components: ['ModelComponent'],
    level: 'partial',
    imports: ['CoreML', 'RealityKit', 'Foundation'],
    generate: (varName, config) => {
      const style = String(config.style || 'photorealistic');
      const resolution = Number(config.resolution || 512);
      return [
        `// @ai_texture_gen — AI texture generation (style: ${style}, ${resolution}x${resolution})`,
        `func ${varName}GenerateTexture(prompt: String) async throws -> TextureResource {`,
        `    let modelName = "AITextureGen_${style.replace(/[^a-zA-Z0-9_]/g, '_')}"`,
        `    if let modelURL = Bundle.main.url(forResource: modelName, withExtension: "mlmodelc"),`,
        `       let mlModel = try? MLModel(contentsOf: modelURL) {`,
        `        let input = try MLDictionaryFeatureProvider(dictionary: ["prompt": MLFeatureValue(string: prompt)])`,
        `        let output = try mlModel.prediction(from: input)`,
        `        if let pixBuf = output.featureValue(for: "texture")?.imageBufferValue {`,
        `            return try await TextureResource(from: CIImage(cvPixelBuffer: pixBuf))`,
        `        }`,
        `    }`,
        `    // Fallback: solid color placeholder at ${resolution}x${resolution}`,
        `    return try await TextureResource.generate(from: CIImage(color: .gray, extent: CGRect(x: 0, y: 0, width: ${resolution}, height: ${resolution})))`,
        `}`,
        ``,
        `// Assign generated texture to ${varName} ModelComponent`,
        `Task {`,
        `    if let texture = try? await ${varName}GenerateTexture(prompt: "A ${style} material") {`,
        `        var mat = PhysicallyBasedMaterial()`,
        `        mat.baseColor = .init(texture: .init(texture))`,
        `        ${varName}.components.set(ModelComponent(mesh: .generateBox(size: 0.1), materials: [mat]))`,
        `    }`,
        `}`,
      ];
    },
  },

  diffusion_realtime: {
    trait: 'diffusion_realtime',
    components: [],
    level: 'partial',
    imports: ['Metal', 'MetalPerformanceShaders', 'CoreML'],
    generate: (varName, config) => {
      const backend = String(config.backend || 'metal');
      const steps = Number(config.steps || 20);
      return [
        `// @diffusion_realtime — real-time diffusion rendering (backend: ${backend}, steps: ${steps})`,
        `let ${varName}MtlDevice = MTLCreateSystemDefaultDevice()!`,
        `let ${varName}CommandQueue = ${varName}MtlDevice.makeCommandQueue()!`,
        ...(backend === 'metal'
          ? [
              `// Metal Performance Shaders diffusion pipeline`,
              `let ${varName}MatMul = MPSMatrixMultiplication(`,
              `    device: ${varName}MtlDevice,`,
              `    transposeLeft: false,`,
              `    transposeRight: false,`,
              `    resultRows: 64, resultColumns: 64, interiorColumns: 64,`,
              `    alpha: 1.0, beta: 0.0`,
              `)`,
              `// Run ${steps} denoising steps on GPU command buffer`,
              `let ${varName}CmdBuf = ${varName}CommandQueue.makeCommandBuffer()!`,
              `// Encode denoising U-Net passes here (${steps} steps)`,
              `${varName}CmdBuf.commit()`,
              `${varName}CmdBuf.waitUntilCompleted()`,
            ]
          : [
              `// CoreML diffusion pipeline`,
              `if let modelURL = Bundle.main.url(forResource: "DiffusionUNet", withExtension: "mlmodelc"),`,
              `   let unet = try? MLModel(contentsOf: modelURL, configuration: { let c = MLModelConfiguration(); c.computeUnits = .all; return c }()) {`,
              `    // Run ${steps} denoising steps via CoreML`,
              `    for step in 0..<${steps} {`,
              `        let t = MLFeatureValue(double: Double(step) / ${steps}.0)`,
              `        let _ = try? unet.prediction(from: MLDictionaryFeatureProvider(dictionary: ["timestep": t]))`,
              `    }`,
              `}`,
            ]),
      ];
    },
  },

  ai_upscaling: {
    trait: 'ai_upscaling',
    components: [],
    level: 'partial',
    imports: ['CoreML', 'CoreImage'],
    generate: (varName, config) => {
      const factor = Number(config.factor || 2);
      const modelName = String(config.model || 'SuperResolutionModel');
      return [
        `// @ai_upscaling — CoreML super-resolution (factor: ${factor}x)`,
        `func ${varName}Upscale(ciImage: CIImage) -> CIImage? {`,
        `    guard let modelURL = Bundle.main.url(forResource: "${modelName}", withExtension: "mlmodelc"),`,
        `          let mlModel = try? MLModel(contentsOf: modelURL),`,
        `          let coreMLFilter = try? CIFilter(name: "CICoreMLModelFilter", parameters: [`,
        `              "inputImage": ciImage,`,
        `              "inputModel": mlModel`,
        `          ]) else {`,
        `        // Fallback: Lanczos upscaling`,
        `        let scaleFilter = CIFilter.lanczosScaleTransform()`,
        `        scaleFilter.inputImage = ciImage`,
        `        scaleFilter.scale = Float(${factor})`,
        `        scaleFilter.aspectRatio = 1.0`,
        `        return scaleFilter.outputImage`,
        `    }`,
        `    return coreMLFilter.outputImage`,
        `}`,
      ];
    },
  },

  ai_inpainting: {
    trait: 'ai_inpainting',
    components: [],
    level: 'partial',
    imports: ['CoreML', 'CoreImage', 'Vision'],
    generate: (varName, config) => {
      const modelName = String(config.model || 'InpaintingModel');
      return [
        `// @ai_inpainting — CoreML mask-based inpainting`,
        `func ${varName}Inpaint(image: CIImage, mask: CIImage) -> CIImage? {`,
        `    // Step 1: try CoreML inpainting model`,
        `    if let modelURL = Bundle.main.url(forResource: "${modelName}", withExtension: "mlmodelc"),`,
        `       let mlModel = try? MLModel(contentsOf: modelURL),`,
        `       let filter = try? CIFilter(name: "CICoreMLModelFilter", parameters: [`,
        `           "inputImage": image, "inputModel": mlModel`,
        `       ]) {`,
        `        return filter.outputImage`,
        `    }`,
        `    // Fallback: blend with blurred source behind mask`,
        `    let blurred = image.applyingGaussianBlur(sigma: 8)`,
        `    let blendFilter = CIFilter.blendWithMask()`,
        `    blendFilter.inputImage = blurred`,
        `    blendFilter.backgroundImage = image`,
        `    blendFilter.maskImage = mask`,
        `    return blendFilter.outputImage`,
        `}`,
      ];
    },
  },

  neural_link: {
    trait: 'neural_link',
    components: [],
    level: 'partial',
    imports: ['CoreBluetooth', 'Combine'],
    generate: (varName, config) => {
      const interfaceType = String(config.interface_type || 'bci');
      const sampleRate = Number(config.sample_rate || 250);
      const channels = Number(config.channels || 8);
      return [
        `// @neural_link — BCI/neural interface via CoreBluetooth (interface: ${interfaceType})`,
        `// Sample rate: ${sampleRate}Hz, Channels: ${channels}`,
        `class ${varName}NeuralLinkManager: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {`,
        `    private var centralManager: CBCentralManager!`,
        `    private var neuralPeripheral: CBPeripheral?`,
        `    private let dataPublisher = PassthroughSubject<[Float], Never>()`,
        `    private let sampleRate = ${sampleRate}`,
        `    private let channelCount = ${channels}`,
        ``,
        `    override init() {`,
        `        super.init()`,
        `        centralManager = CBCentralManager(delegate: self, queue: .main)`,
        `    }`,
        ``,
        `    func centralManagerDidUpdateState(_ central: CBCentralManager) {`,
        `        if central.state == .poweredOn {`,
        `            central.scanForPeripherals(withServices: nil) // filter by service UUID in production`,
        `        }`,
        `    }`,
        ``,
        `    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,`,
        `                        advertisementData: [String: Any], rssi RSSI: NSNumber) {`,
        `        neuralPeripheral = peripheral`,
        `        centralManager.stopScan()`,
        `        centralManager.connect(peripheral)`,
        `    }`,
        ``,
        `    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {`,
        `        guard let data = characteristic.value else { return }`,
        `        let samples = data.withUnsafeBytes { Array($0.bindMemory(to: Float.self)) }`,
        `        dataPublisher.send(samples)`,
        `    }`,
        `}`,
      ];
    },
  },

  neural_forge: {
    trait: 'neural_forge',
    components: [],
    level: 'full',
    imports: ['CoreML'],
    generate: (varName, config) => {
      const modelPath = String(config.model_path || 'TrainableModel');
      const epochs = Number(config.epochs || 5);
      return [
        `// @neural_forge — on-device CoreML model training (epochs: ${epochs})`,
        `func ${varName}Train(dataset: MLArrayBatchProvider) async throws {`,
        `    guard let modelURL = Bundle.main.url(forResource: "${modelPath}", withExtension: "mlmodelc") else {`,
        `        throw NSError(domain: "NeuralForge", code: 1, userInfo: [NSLocalizedDescriptionKey: "Model ${modelPath} not found"])`,
        `    }`,
        `    let updateConfig = MLUpdateTask.ProgressHandlers(`,
        `        contextEvaluated: { ctx in`,
        `            print("${varName} epoch \\(ctx.metrics[.epoch]!): loss \\(ctx.metrics[.lossValue]!)")`,
        `        }`,
        `    )`,
        `    let task = try MLUpdateTask(`,
        `        forModelAt: modelURL,`,
        `        trainingData: dataset,`,
        `        configuration: nil,`,
        `        progressHandlers: updateConfig`,
        `    )`,
        `    task.resume()`,
        `    // Updated model written back to modelURL after ${epochs} epochs`,
        `}`,
      ];
    },
  },

  embedding_search: {
    trait: 'embedding_search',
    components: [],
    level: 'full',
    imports: ['CoreData', 'Foundation'],
    generate: (varName, config) => {
      const dimensions = Number(config.dimensions || 1536);
      const storeName = String(config.store_name || varName.toLowerCase() + '_embeddings');
      return [
        `// @embedding_search — CoreData vector index (dimensions: ${dimensions})`,
        `// CoreData model: entity "EmbeddingEntry" with id:String, text:String, embeddingData:BinaryData`,
        `let ${varName}Container = NSPersistentContainer(name: "${storeName}")`,
        `${varName}Container.loadPersistentStores { _, error in`,
        `    if let error { fatalError("CoreData load failed: \\(error)") }`,
        `}`,
        ``,
        `func ${varName}Upsert(id: String, text: String, embedding: [Float]) {`,
        `    let ctx = ${varName}Container.viewContext`,
        `    let entry = NSEntityDescription.insertNewObject(forEntityName: "EmbeddingEntry", into: ctx)`,
        `    entry.setValue(id, forKey: "id")`,
        `    entry.setValue(text, forKey: "text")`,
        `    entry.setValue(Data(bytes: embedding, count: embedding.count * MemoryLayout<Float>.size), forKey: "embeddingData")`,
        `    try? ctx.save()`,
        `}`,
        ``,
        `func ${varName}CosineSimilarity(_ a: [Float], _ b: [Float]) -> Float {`,
        `    guard a.count == b.count else { return 0 }`,
        `    let dot = zip(a, b).map(*).reduce(0, +)`,
        `    let normA = a.map { $0 * $0 }.reduce(0, +).squareRoot()`,
        `    let normB = b.map { $0 * $0 }.reduce(0, +).squareRoot()`,
        `    return normA * normB == 0 ? 0 : dot / (normA * normB)`,
        `}`,
        ``,
        `func ${varName}Search(query: [Float], topK: Int = 5) -> [(String, Float)] {`,
        `    let req = NSFetchRequest<NSManagedObject>(entityName: "EmbeddingEntry")`,
        `    let all = (try? ${varName}Container.viewContext.fetch(req)) ?? []`,
        `    return all.compactMap { obj -> (String, Float)? in`,
        `        guard let id = obj.value(forKey: "id") as? String,`,
        `              let data = obj.value(forKey: "embeddingData") as? Data else { return nil }`,
        `        let vec = data.withUnsafeBytes { Array($0.bindMemory(to: Float.self)) }`,
        `        return (id, ${varName}CosineSimilarity(query, vec))`,
        `    }.sorted { $0.1 > $1.1 }.prefix(topK).map { $0 }`,
        `}`,
      ];
    },
  },

  ai_npc_brain: {
    trait: 'ai_npc_brain',
    components: [],
    level: 'partial',
    imports: ['Foundation'],
    generate: (varName, config) => {
      const model = String(config.model || 'llm');
      const personality = String(config.personality || 'helpful assistant');
      const memorySlots = Number(config.memory_slots || 10);
      const endpoint = String(config.endpoint || '');
      return [
        `// @ai_npc_brain — AI NPC reasoning (model: ${model}, personality: ${personality})`,
        `var ${varName}Memory: [String] = []`,
        `let ${varName}MaxMemory = ${memorySlots}`,
        ``,
        `func ${varName}Think(perception: String) async -> String {`,
        `    ${varName}Memory.append(perception)`,
        `    if ${varName}Memory.count > ${varName}MaxMemory { ${varName}Memory.removeFirst() }`,
        `    let context = ${varName}Memory.joined(separator: "\\n")`,
        `    let systemPrompt = "You are a ${personality}. Respond in character."`,
        ...(endpoint
          ? [
              `    // Remote LLM inference via API`,
              `    var req = URLRequest(url: URL(string: "${endpoint}/v1/chat/completions")!)`,
              `    req.httpMethod = "POST"`,
              `    req.setValue("application/json", forHTTPHeaderField: "Content-Type")`,
              `    let payload: [String: Any] = [`,
              `        "model": "${model}",`,
              `        "messages": [`,
              `            ["role": "system", "content": systemPrompt],`,
              `            ["role": "user", "content": context],`,
              `        ]`,
              `    ]`,
              `    req.httpBody = try? JSONSerialization.data(withJSONObject: payload)`,
              `    if let (data, _) = try? await URLSession.shared.data(for: req),`,
              `       let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],`,
              `       let choices = json["choices"] as? [[String: Any]],`,
              `       let reply = (choices.first?["message"] as? [String: Any])?["content"] as? String {`,
              `        return reply`,
              `    }`,
              `    return ""`,
            ]
          : [
              `    // On-device CoreML LLM (requires compatible .mlpackage)`,
              `    if let modelURL = Bundle.main.url(forResource: "${model.replace(/[^a-zA-Z0-9_]/g, '_')}", withExtension: "mlpackage"),`,
              `       let llm = try? MLModel(contentsOf: modelURL) {`,
              `        let input = try? MLDictionaryFeatureProvider(dictionary: [`,
              `            "system_prompt": MLFeatureValue(string: systemPrompt),`,
              `            "user_input": MLFeatureValue(string: context),`,
              `        ])`,
              `        if let result = try? llm.prediction(from: input!),`,
              `           let reply = result.featureValue(for: "response")?.stringValue {`,
              `            return reply`,
              `        }`,
              `    }`,
              `    return "..."`,
            ]),
        `}`,
      ];
    },
  },

  vector_db: {
    trait: 'vector_db',
    components: [],
    level: 'partial',
    imports: ['Foundation'],
    generate: (varName, config) => {
      const backend = String(config.backend || 'pinecone');
      const collection = String(config.collection || varName.toLowerCase() + '_vectors');
      const isPinecone = backend === 'pinecone';
      const isFaiss = backend === 'faiss';
      return [
        `// @vector_db — vector database (backend: ${backend})`,
        ...(isFaiss
          ? [
              `// FAISS-style in-process flat L2 index (no native Swift FAISS binding — stub)`,
              `var ${varName}FaissIndex: [[Float]] = []`,
              `var ${varName}FaissIds: [String] = []`,
              ``,
              `func ${varName}FaissAdd(id: String, vec: [Float]) {`,
              `    ${varName}FaissIndex.append(vec); ${varName}FaissIds.append(id)`,
              `}`,
              ``,
              `func ${varName}FaissSearch(query: [Float], k: Int = 5) -> [(String, Float)] {`,
              `    return zip(${varName}FaissIds, ${varName}FaissIndex)`,
              `        .map { (id, vec) -> (String, Float) in`,
              `            let dist = zip(query, vec).map { ($0 - $1) * ($0 - $1) }.reduce(0, +)`,
              `            return (id, dist)`,
              `        }`,
              `        .sorted { $0.1 < $1.1 }`,
              `        .prefix(k).map { $0 }`,
              `}`,
            ]
          : [
              `let ${varName}VdbSession = URLSession.shared`,
              `let ${varName}VdbBase = ${isPinecone ? `ProcessInfo.processInfo.environment["PINECONE_HOST"] ?? ""` : `"http://localhost:8000"`}`,
              ``,
              `func ${varName}VdbUpsert(id: String, embedding: [Float], metadata: [String: String] = [:]) async throws {`,
              `    let vectors = embedding.map { String($0) }.joined(separator: ",")`,
              `    let meta = metadata.map { "\\"\\($0.key)\\":\\"\\($0.value)\\"" }.joined(separator: ",")`,
              ...(isPinecone
                ? [
                    `    let body = """{"vectors":[{"id":"\\(id)","values":[\\(vectors)],"metadata":{\\(meta)}}]}"""`,
                    `    var req = URLRequest(url: URL(string: "\\(${varName}VdbBase)/vectors/upsert")!)`,
                    `    req.httpMethod = "POST"`,
                    `    req.setValue("application/json", forHTTPHeaderField: "Content-Type")`,
                    `    req.setValue(ProcessInfo.processInfo.environment["PINECONE_API_KEY"] ?? "", forHTTPHeaderField: "Api-Key")`,
                    `    req.httpBody = body.data(using: .utf8)`,
                  ]
                : [
                    `    let body = """{"embeddings":[\\(vectors)],"metadatas":[{\\(meta)}],"ids":["\\(id)"]}"""`,
                    `    var req = URLRequest(url: URL(string: "\\(${varName}VdbBase)/api/v1/collections/${collection}/add")!)`,
                    `    req.httpMethod = "POST"`,
                    `    req.setValue("application/json", forHTTPHeaderField: "Content-Type")`,
                    `    req.httpBody = body.data(using: .utf8)`,
                  ]),
              `    let (_, resp) = try await ${varName}VdbSession.data(for: req)`,
              `    guard (resp as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }`,
              `}`,
              ``,
              `func ${varName}VdbQuery(queryEmbedding: [Float], topK: Int = 5) async throws -> Data {`,
              `    let vectors = queryEmbedding.map { String($0) }.joined(separator: ",")`,
              ...(isPinecone
                ? [
                    `    let body = """{"vector":[\\(vectors)],"topK":${`\\(topK)`},"includeMetadata":true}"""`,
                    `    var req = URLRequest(url: URL(string: "\\(${varName}VdbBase)/query")!)`,
                    `    req.setValue(ProcessInfo.processInfo.environment["PINECONE_API_KEY"] ?? "", forHTTPHeaderField: "Api-Key")`,
                  ]
                : [
                    `    let body = """{"query_embeddings":[\\(vectors)],"n_results":${`\\(topK)`}}"""`,
                    `    var req = URLRequest(url: URL(string: "\\(${varName}VdbBase)/api/v1/collections/${collection}/query")!)`,
                  ]),
              `    req.httpMethod = "POST"`,
              `    req.setValue("application/json", forHTTPHeaderField: "Content-Type")`,
              `    req.httpBody = body.data(using: .utf8)`,
              `    let (data, _) = try await ${varName}VdbSession.data(for: req)`,
              `    return data`,
              `}`,
            ]),
      ];
    },
  },

  vision: {
    trait: 'vision',
    components: [],
    level: 'full',
    imports: ['Vision', 'CoreImage'],
    generate: (varName, config) => {
      const task = String(config.task || 'classification');
      const requestType: Record<string, string> = {
        text_recognition: 'VNRecognizeTextRequest',
        classification: 'VNClassifyImageRequest',
        face_detection: 'VNDetectFaceRectanglesRequest',
        body_pose: 'VNDetectHumanBodyPoseRequest',
        barcode: 'VNDetectBarcodesRequest',
        animal_recognition: 'VNRecognizeAnimalsRequest',
        hand_pose: 'VNDetectHumanHandPoseRequest',
        object_detection: 'VNDetectRectanglesRequest',
      };
      const req = requestType[task] ?? 'VNClassifyImageRequest';
      return [
        `// @vision — Vision framework (task: ${task})`,
        `let ${varName}Request = ${req}()`,
        `func ${varName}Analyze(pixelBuffer: CVPixelBuffer) -> [VNObservation] {`,
        `    let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, options: [:])`,
        `    try? handler.perform([${varName}Request])`,
        `    return ${varName}Request.results ?? []`,
        `}`,
      ];
    },
  },

  spatial_awareness: {
    trait: 'spatial_awareness',
    components: [],
    level: 'full',
    minVersion: '1.0',
    imports: ['ARKit'],
    generate: (varName, _config) => [
      `// @spatial_awareness — ARKit spatial scene understanding`,
      `let ${varName}PlaneDetection = PlaneDetectionProvider(alignments: [.horizontal, .vertical])`,
      `let ${varName}SceneReconstruction = SceneReconstructionProvider()`,
      `let ${varName}ArSession = ARKitSession()`,
      ``,
      `func ${varName}StartSpatialAwareness() {`,
      `    Task {`,
      `        try await ${varName}ArSession.run([${varName}PlaneDetection, ${varName}SceneReconstruction])`,
      `        for await update in ${varName}PlaneDetection.anchorUpdates {`,
      `            let plane = update.anchor`,
      `            // plane.classification: .floor, .wall, .ceiling, .table, .seat, .window, .door`,
      `            // plane.geometry: PlaneGeometry with extent and vertices`,
      `            _ = plane`,
      `        }`,
      `    }`,
      `}`,
    ],
  },

  neural_animation: {
    trait: 'neural_animation',
    components: [],
    level: 'full',
    imports: ['CoreML', 'RealityKit'],
    generate: (varName, config) => {
      const style = String(config.style || 'motion_matching');
      const modelAsset = String(config.model_asset || `neural_anim_${style}`);
      return [
        `// @neural_animation — CoreML pose prediction + AnimationPlaybackController (style: ${style})`,
        `func ${varName}PredictPose(inputFeatures: MLFeatureProvider) throws -> [simd_float4x4] {`,
        `    guard let modelURL = Bundle.main.url(forResource: "${modelAsset}", withExtension: "mlmodelc"),`,
        `          let model = try? MLModel(contentsOf: modelURL) else { return [] }`,
        `    let result = try model.prediction(from: inputFeatures)`,
        `    guard let poseData = result.featureValue(for: "joint_transforms")?.multiArrayValue else { return [] }`,
        `    let jointCount = poseData.shape[0].intValue`,
        `    return (0..<jointCount).map { i -> simd_float4x4 in`,
        `        let base = i * 16`,
        `        return simd_float4x4(columns: (`,
        `            SIMD4<Float>(Float(poseData[base]),   Float(poseData[base+1]),  Float(poseData[base+2]),  Float(poseData[base+3])),`,
        `            SIMD4<Float>(Float(poseData[base+4]),  Float(poseData[base+5]),  Float(poseData[base+6]),  Float(poseData[base+7])),`,
        `            SIMD4<Float>(Float(poseData[base+8]),  Float(poseData[base+9]),  Float(poseData[base+10]), Float(poseData[base+11])),`,
        `            SIMD4<Float>(Float(poseData[base+12]), Float(poseData[base+13]), Float(poseData[base+14]), Float(poseData[base+15]))`,
        `        ))`,
        `    }`,
        `}`,
        ``,
        `// Drive ${varName} AnimationPlaybackController with predicted joint matrices`,
        `func ${varName}ApplyPoses(_ entity: ModelEntity, joints: [simd_float4x4]) {`,
        `    guard let skeleton = entity.model?.mesh.contents.skeletons.first else { return }`,
        `    let controller = entity.playAnimation(AnimationResource.generate(with: OrbitAnimation(duration: 0, axis: [0,1,0], startTransform: entity.transform)))`,
        `    for (i, mat) in joints.prefix(skeleton.jointNames.count).enumerated() {`,
        `        entity.jointTransforms[i] = Transform(matrix: mat)`,
        `    }`,
        `    _ = controller`,
        `}`,
      ];
    },
  },

  ai_vision: {
    trait: 'ai_vision',
    components: [],
    level: 'full',
    imports: ['Vision', 'CoreML'],
    generate: (varName, config) => {
      const task = String(config.task || 'detection');
      const modelName = String(config.model || 'CustomVisionModel');
      return [
        `// @ai_vision — AI vision processing (task: ${task}, model: ${modelName})`,
        `func ${varName}BuildRequest() -> VNRequest {`,
        `    if let modelURL = Bundle.main.url(forResource: "${modelName}", withExtension: "mlmodelc"),`,
        `       let mlModel = try? MLModel(contentsOf: modelURL),`,
        `       let vnModel = try? VNCoreMLModel(for: mlModel) {`,
        `        return VNCoreMLRequest(model: vnModel) { req, _ in`,
        `            let obs = req.results as? [VNRecognizedObjectObservation] ?? []`,
        `            // obs[i].labels[0].identifier, obs[i].boundingBox`,
        `            _ = obs`,
        `        }`,
        `    }`,
        `    return VNDetectRectanglesRequest()`,
        `}`,
        `let ${varName}Request = ${varName}BuildRequest()`,
        `func ${varName}Analyze(pixelBuffer: CVPixelBuffer) -> [VNObservation] {`,
        `    let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, options: [:])`,
        `    try? handler.perform([${varName}Request])`,
        `    return ${varName}Request.results ?? []`,
        `}`,
      ];
    },
  },
};

// =============================================================================
// COMBINED TRAIT MAP
// =============================================================================

export const VISIONOS_TRAIT_MAP: Record<string, TraitMapping> = {
  ...PHYSICS_TRAIT_MAP,
  ...INTERACTION_TRAIT_MAP,
  ...AUDIO_TRAIT_MAP,
  ...AR_TRAIT_MAP,
  ...VISUAL_TRAIT_MAP,
  ...ACCESSIBILITY_TRAIT_MAP,
  ...UI_TRAIT_MAP,
  ...PORTAL_TRAIT_MAP,
  ...V43_TRAIT_MAP,
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function getTraitMapping(traitName: string): TraitMapping | undefined {
  return VISIONOS_TRAIT_MAP[traitName];
}

export function generateTraitCode(
  traitName: string,
  varName: string,
  config: Record<string, unknown>
): string[] {
  const mapping = getTraitMapping(traitName);
  if (!mapping) {
    return [`// @${traitName} — no mapping defined: ${JSON.stringify(config)}`];
  }
  return mapping.generate(varName, config);
}

export function getRequiredImports(traits: string[]): string[] {
  const imports = new Set<string>();
  for (const trait of traits) {
    const mapping = getTraitMapping(trait);
    if (mapping?.imports) {
      mapping.imports.forEach((i) => imports.add(i));
    }
  }
  return Array.from(imports);
}

export function getMinVisionOSVersion(traits: string[]): string {
  let maxVersion = '1.0';
  for (const trait of traits) {
    const mapping = getTraitMapping(trait);
    if (mapping?.minVersion) {
      if (parseFloat(mapping.minVersion) > parseFloat(maxVersion)) {
        maxVersion = mapping.minVersion;
      }
    }
  }
  return maxVersion;
}

export function listAllTraits(): string[] {
  return Object.keys(VISIONOS_TRAIT_MAP);
}

export function listTraitsByLevel(level: TraitImplementationLevel): string[] {
  return Object.entries(VISIONOS_TRAIT_MAP)
    .filter(([_, mapping]) => mapping.level === level)
    .map(([name]) => name);
}
