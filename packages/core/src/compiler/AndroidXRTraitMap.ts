/**
 * Android XR Trait Mapping System
 *
 * Maps HoloScript traits to Android XR SceneCore components, ARCore providers,
 * and Filament rendering primitives with Kotlin code generation.
 * Used by AndroidXRCompiler for trait-to-native conversion.
 *
 * Platform stack:
 *   - Jetpack XR SceneCore (entities, components, ECS)
 *   - ARCore for Jetpack XR (perception, anchors, hand tracking)
 *   - Filament (PBR rendering, lighting, shadows)
 *   - Jetpack Compose for XR (spatial UI)
 *   - Oboe / SoundPool / MediaPlayer (spatial audio)
 *
 * @version 1.0.0
 */

// =============================================================================
// ANDROID XR COMPONENT TYPES
// =============================================================================

export type AndroidXRComponent =
  | 'MovableComponent'
  | 'ResizableComponent'
  | 'InteractableComponent'
  | 'GltfModelEntity'
  | 'PanelEntity'
  | 'SurfaceEntity'
  | 'AnchorEntity'
  | 'SpatialSoundPool'
  | 'SpatialMediaPlayer'
  | 'PointSourceParams'
  | 'SoundFieldAttributes'
  | 'SpatialEnvironment'
  | 'HandTrackingProvider'
  | 'PlaneTrackable'
  | 'CollisionComponent'
  | 'PhysicsComponent'
  | 'LightManager'
  | 'ParticleSystem'
  | 'BillboardNode'
  | 'AccessibilityDelegate';

export type TraitImplementationLevel =
  | 'full'          // Generates complete Kotlin/Android XR code
  | 'partial'       // Generates some code with TODOs
  | 'comment'       // Only generates documentation comment
  | 'unsupported';  // Not available in Android XR

export interface AndroidXRTraitMapping {
  /** HoloScript trait name */
  trait: string;
  /** Android XR components to add */
  components: AndroidXRComponent[];
  /** Implementation completeness */
  level: TraitImplementationLevel;
  /** Required Kotlin/Android imports */
  imports?: string[];
  /** Required minimum SDK version */
  minSdkVersion?: number;
  /** Code generator function */
  generate: (varName: string, config: Record<string, unknown>) => string[];
}

// =============================================================================
// PHYSICS TRAITS
// =============================================================================

export const PHYSICS_TRAIT_MAP: Record<string, AndroidXRTraitMapping> = {
  collidable: {
    trait: 'collidable',
    components: ['CollisionComponent'],
    level: 'partial',
    imports: ['androidx.xr.scenecore.Entity', 'com.google.android.filament.utils.Float3'],
    generate: (varName, config) => {
      const mode = config.mode || 'default';
      return [
        `// @collidable -- collision detection via SceneCore InteractableComponent`,
        `// Android XR uses input events for collision; mode: ${mode}`,
        `val ${varName}Interactable = InteractableComponent.create(session, executor) { event ->`,
        `    // Handle collision/input events`,
        `}`,
        `${varName}.addComponent(${varName}Interactable)`,
      ];
    },
  },

  physics: {
    trait: 'physics',
    components: ['CollisionComponent', 'PhysicsComponent'],
    level: 'partial',
    imports: [
      'androidx.xr.scenecore.Entity',
      'com.google.android.filament.utils.Float3',
    ],
    generate: (varName, config) => {
      const mass = config.mass ?? 1.0;
      const mode = config.kinematic ? 'kinematic' : 'dynamic';
      const friction = config.friction ?? 0.5;
      const restitution = config.restitution ?? 0.3;
      return [
        `// @physics -- Android XR SceneCore spatial physics component`,
        `// Mode: ${mode}, mass: ${mass}, friction: ${friction}, restitution: ${restitution}`,
        `val ${varName}Physics = PhysicsComponent.create(session)`,
        `${varName}Physics.mass = ${mass}f`,
        `${varName}Physics.friction = ${friction}f`,
        `${varName}Physics.restitution = ${restitution}f`,
        `${varName}Physics.mode = PhysicsMode.${String(mode).toUpperCase()}`,
        `${varName}.addComponent(${varName}Physics)`,
      ];
    },
  },

  static: {
    trait: 'static',
    components: ['CollisionComponent', 'PhysicsComponent'],
    level: 'partial',
    generate: (varName) => [
      `// @static -- static physics body (no movement, collisions only)`,
      `val ${varName}Physics = PhysicsComponent.create(session)`,
      `${varName}Physics.mode = PhysicsMode.STATIC`,
      `${varName}.addComponent(${varName}Physics)`,
    ],
  },

  kinematic: {
    trait: 'kinematic',
    components: ['CollisionComponent', 'PhysicsComponent'],
    level: 'partial',
    generate: (varName) => [
      `// @kinematic -- kinematic physics body (script-driven movement)`,
      `val ${varName}Physics = PhysicsComponent.create(session)`,
      `${varName}Physics.mode = PhysicsMode.KINEMATIC`,
      `${varName}.addComponent(${varName}Physics)`,
    ],
  },

  cloth: {
    trait: 'cloth',
    components: ['PhysicsComponent'],
    level: 'comment',
    imports: ['com.google.android.filament.utils.Float3'],
    generate: (varName, config) => {
      const stiffness = config.stiffness ?? 0.8;
      const damping = config.damping ?? 0.02;
      const iterations = config.iterations ?? 10;
      return [
        `// @cloth -- Position-Based Dynamics cloth simulation`,
        `// Android XR: no built-in cloth; implement via Filament compute shader`,
        `// stiffness: ${stiffness}, damping: ${damping}, iterations: ${iterations}`,
        `// TODO: integrate Vulkan compute pipeline for PBD cloth on ${varName}`,
      ];
    },
  },

  soft_body: {
    trait: 'soft_body',
    components: ['PhysicsComponent'],
    level: 'comment',
    generate: (varName, config) => {
      const compliance = config.compliance ?? 0.0001;
      const damping = config.damping ?? 0.01;
      return [
        `// @soft_body -- XPBD soft body simulation`,
        `// Android XR: no built-in soft body; implement via Vulkan compute`,
        `// compliance: ${compliance}, damping: ${damping}`,
        `// TODO: integrate Vulkan compute pipeline for XPBD on ${varName}`,
      ];
    },
  },

  fluid: {
    trait: 'fluid',
    components: [],
    level: 'comment',
    generate: (varName, config) => {
      const particleCount = config.particle_count ?? 10000;
      const viscosity = config.viscosity ?? 0.01;
      return [
        `// @fluid -- SPH fluid simulation via Vulkan compute`,
        `// Android XR: no built-in fluid; implement via Vulkan compute pipeline`,
        `// particles: ${particleCount}, viscosity: ${viscosity}`,
        `// TODO: implement SPH compute shader for ${varName}`,
      ];
    },
  },
};

// =============================================================================
// INTERACTION TRAITS
// =============================================================================

export const INTERACTION_TRAIT_MAP: Record<string, AndroidXRTraitMapping> = {
  grabbable: {
    trait: 'grabbable',
    components: ['MovableComponent', 'InteractableComponent'],
    level: 'full',
    imports: [
      'androidx.xr.scenecore.MovableComponent',
      'androidx.xr.scenecore.InteractableComponent',
      'androidx.xr.scenecore.InputEvent',
    ],
    generate: (varName, config) => {
      const _snapToHand = config.snap_to_hand ?? false;
      return [
        `// @grabbable -- MovableComponent enables drag-to-move in Android XR`,
        `val ${varName}Movable = MovableComponent.createSystemMovable(session)`,
        `${varName}.addComponent(${varName}Movable)`,
        `val ${varName}Interactable = InteractableComponent.create(session, executor) { event ->`,
        `    if (event.source == InputEvent.Source.HANDS && event.action == InputEvent.Action.ACTION_DOWN) {`,
        `        // Grab initiated`,
        `    }`,
        `}`,
        `${varName}.addComponent(${varName}Interactable)`,
      ];
    },
  },

  hoverable: {
    trait: 'hoverable',
    components: ['InteractableComponent'],
    level: 'full',
    imports: [
      'androidx.xr.scenecore.InteractableComponent',
      'androidx.xr.scenecore.InputEvent',
    ],
    generate: (varName, config) => {
      const highlightColor = config.highlight_color || '#ffffff';
      return [
        `// @hoverable -- InteractableComponent with HOVER_ENTER/HOVER_EXIT`,
        `val ${varName}Interactable = InteractableComponent.create(session, executor) { event ->`,
        `    when (event.action) {`,
        `        InputEvent.Action.ACTION_HOVER_ENTER -> { /* highlight: ${highlightColor} */ }`,
        `        InputEvent.Action.ACTION_HOVER_EXIT -> { /* remove highlight */ }`,
        `    }`,
        `}`,
        `${varName}.addComponent(${varName}Interactable)`,
      ];
    },
  },

  clickable: {
    trait: 'clickable',
    components: ['InteractableComponent'],
    level: 'full',
    imports: [
      'androidx.xr.scenecore.InteractableComponent',
      'androidx.xr.scenecore.InputEvent',
    ],
    generate: (varName) => [
      `// @clickable -- tap/click handling via InteractableComponent`,
      `val ${varName}Interactable = InteractableComponent.create(session, executor) { event ->`,
      `    if (event.action == InputEvent.Action.ACTION_UP) {`,
      `        // Click/tap handler for ${varName}`,
      `    }`,
      `}`,
      `${varName}.addComponent(${varName}Interactable)`,
    ],
  },

  draggable: {
    trait: 'draggable',
    components: ['MovableComponent', 'InteractableComponent'],
    level: 'full',
    imports: [
      'androidx.xr.scenecore.MovableComponent',
    ],
    generate: (varName, config) => {
      const axis = config.constrain_axis;
      const lines = [
        `// @draggable -- MovableComponent for drag interaction`,
        `val ${varName}Movable = MovableComponent.createSystemMovable(session)`,
        `${varName}.addComponent(${varName}Movable)`,
      ];
      if (axis) {
        lines.push(`// Constrain drag to axis: ${axis}`);
      }
      return lines;
    },
  },

  throwable: {
    trait: 'throwable',
    components: ['MovableComponent', 'InteractableComponent', 'PhysicsComponent'],
    level: 'partial',
    imports: [
      'androidx.xr.scenecore.MovableComponent',
      'androidx.xr.scenecore.InteractableComponent',
      'androidx.xr.scenecore.InputEvent',
    ],
    generate: (varName, config) => {
      const maxVelocity = config.max_velocity ?? 10;
      return [
        `// @throwable -- drag + release with velocity`,
        `val ${varName}Movable = MovableComponent.createSystemMovable(session)`,
        `${varName}.addComponent(${varName}Movable)`,
        `val ${varName}Interactable = InteractableComponent.create(session, executor) { event ->`,
        `    if (event.action == InputEvent.Action.ACTION_UP) {`,
        `        // Apply velocity on release, max: ${maxVelocity}`,
        `    }`,
        `}`,
        `${varName}.addComponent(${varName}Interactable)`,
      ];
    },
  },

  pointable: {
    trait: 'pointable',
    components: ['InteractableComponent'],
    level: 'full',
    imports: [
      'androidx.xr.scenecore.InteractableComponent',
      'androidx.xr.scenecore.InputEvent',
    ],
    generate: (varName) => [
      `// @pointable -- responds to both hand and controller pointing`,
      `val ${varName}Interactable = InteractableComponent.create(session, executor) { event ->`,
      `    // Source: event.source (HANDS or CONTROLLER)`,
      `    // Pointer: event.pointerType (LEFT or RIGHT)`,
      `}`,
      `${varName}.addComponent(${varName}Interactable)`,
    ],
  },

  scalable: {
    trait: 'scalable',
    components: ['ResizableComponent'],
    level: 'full',
    imports: [
      'androidx.xr.scenecore.ResizableComponent',
      'androidx.xr.scenecore.ResizeEvent',
    ],
    generate: (varName, config) => {
      const minScale = config.min_scale ?? 0.1;
      const maxScale = config.max_scale ?? 3.0;
      return [
        `// @scalable -- ResizableComponent with min/max constraints`,
        `val ${varName}Resizable = ResizableComponent.create(session) { event ->`,
        `    if (event.resizeState == ResizeEvent.ResizeState.END) {`,
        `        val s = event.newSize`,
        `        // Clamp scale between ${minScale} and ${maxScale}`,
        `    }`,
        `}`,
        `${varName}Resizable.minimumEntitySize = FloatSize3d(${minScale}f, ${minScale}f, ${minScale}f)`,
        `${varName}.addComponent(${varName}Resizable)`,
      ];
    },
  },

  rotatable: {
    trait: 'rotatable',
    components: ['InteractableComponent'],
    level: 'partial',
    imports: [
      'androidx.xr.scenecore.InteractableComponent',
      'androidx.xr.runtime.math.Quaternion',
    ],
    generate: (varName, config) => {
      const axis = String(config.axis || 'y');
      return [
        `// @rotatable -- rotation via InteractableComponent gesture tracking`,
        `// Constrained to axis: ${axis}`,
        `val ${varName}Interactable = InteractableComponent.create(session, executor) { event ->`,
        `    if (event.action == InputEvent.Action.ACTION_MOVE) {`,
        `        val rotation = Quaternion.fromEulerAngles(0f, event.delta.y, 0f)`,
        `        ${varName}.setPose(Pose(${varName}.pose.translation, rotation))`,
        `    }`,
        `}`,
        `${varName}.addComponent(${varName}Interactable)`,
      ];
    },
  },
};

// =============================================================================
// AUDIO TRAITS
// =============================================================================

export const AUDIO_TRAIT_MAP: Record<string, AndroidXRTraitMapping> = {
  audio: {
    trait: 'audio',
    components: ['SpatialSoundPool'],
    level: 'full',
    imports: [
      'android.media.AudioAttributes',
      'android.media.SoundPool',
    ],
    generate: (varName, config) => {
      const src = config.src || config.source || '';
      const loop = config.loop ?? false;
      const volume = config.volume ?? 1.0;
      return [
        `// @audio -- SoundPool playback`,
        `val ${varName}SoundPool = SoundPool.Builder()`,
        `    .setAudioAttributes(AudioAttributes.Builder()`,
        `        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)`,
        `        .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION).build())`,
        `    .build()`,
        `val ${varName}SoundId = ${varName}SoundPool.load(context.assets.openFd("${src}"), 0)`,
        `${varName}SoundPool.setOnLoadCompleteListener { pool, id, status ->`,
        `    if (status == 0) pool.play(id, ${volume}f, ${volume}f, 1, ${loop ? -1 : 0}, 1.0f)`,
        `}`,
      ];
    },
  },

  spatial_audio: {
    trait: 'spatial_audio',
    components: ['SpatialSoundPool', 'PointSourceParams'],
    level: 'full',
    imports: [
      'android.media.AudioAttributes',
      'android.media.SoundPool',
      'androidx.xr.scenecore.SpatialSoundPool',
      'androidx.xr.scenecore.PointSourceParams',
    ],
    generate: (varName, config) => {
      const refDistance = config.refDistance ?? 1.0;
      const rolloff = config.rolloff ?? 1.0;
      return [
        `// @spatial_audio -- SpatialSoundPool with PointSourceParams`,
        `// Reference distance: ${refDistance}, rolloff: ${rolloff}`,
        `if (session.scene.spatialCapabilities.contains(SpatialCapability.SPATIAL_AUDIO)) {`,
        `    val ${varName}SoundPool = SoundPool.Builder()`,
        `        .setAudioAttributes(AudioAttributes.Builder()`,
        `            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)`,
        `            .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION).build())`,
        `        .build()`,
        `    val ${varName}PointSource = PointSourceParams(${varName})`,
        `    val ${varName}SoundId = ${varName}SoundPool.load(context.assets.openFd("audio.mp3"), 0)`,
        `    ${varName}SoundPool.setOnLoadCompleteListener { pool, id, status ->`,
        `        if (status == 0) SpatialSoundPool.play(session, pool, id, ${varName}PointSource, 1f, 0, -1, 1f)`,
        `    }`,
        `}`,
      ];
    },
  },

  ambisonics: {
    trait: 'ambisonics',
    components: ['SpatialMediaPlayer', 'SoundFieldAttributes'],
    level: 'full',
    imports: [
      'android.media.MediaPlayer',
      'android.media.AudioAttributes',
      'androidx.xr.scenecore.SpatialMediaPlayer',
      'androidx.xr.scenecore.SoundFieldAttributes',
      'androidx.xr.scenecore.SpatializerConstants',
    ],
    generate: (varName, config) => {
      const src = config.src || config.source || 'ambisonic_soundscape';
      const _loop = config.loop ?? true;
      const order = String(config.order || 'FIRST_ORDER');
      return [
        `// @ambisonics -- SoundFieldAttributes for ambisonic playback`,
        `if (session.scene.spatialCapabilities.contains(SpatialCapability.SPATIAL_AUDIO)) {`,
        `    val ${varName}SoundField = SoundFieldAttributes(SpatializerConstants.AmbisonicsOrder.${order})`,
        `    val ${varName}Player = MediaPlayer()`,
        `    ${varName}Player.reset()`,
        `    ${varName}Player.setDataSource(context.assets.openFd("${src}"))`,
        `    SpatialMediaPlayer.setSoundFieldAttributes(session, ${varName}Player, ${varName}SoundField)`,
        `    ${varName}Player.setAudioAttributes(AudioAttributes.Builder()`,
        `        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)`,
        `        .setUsage(AudioAttributes.USAGE_MEDIA).build())`,
        `    ${varName}Player.prepare()`,
        `    ${varName}Player.isLooping = true`,
        `    ${varName}Player.start()`,
        `}`,
      ];
    },
  },

  reverb_zone: {
    trait: 'reverb_zone',
    components: [],
    level: 'comment',
    generate: (varName, config) => {
      const preset = String(config.preset || 'largeRoom');
      return [
        `// @reverb_zone -- no built-in reverb zone in Android XR SceneCore`,
        `// Preset: ${preset}`,
        `// TODO: implement reverb via Oboe AudioEffect or OpenSL ES for ${varName}`,
      ];
    },
  },

  audio_occlusion: {
    trait: 'audio_occlusion',
    components: ['SpatialSoundPool', 'PointSourceParams'],
    level: 'comment',
    generate: (varName) => [
      `// @audio_occlusion -- Android XR does not auto-occlude spatial audio`,
      `// TODO: implement raycast-based occlusion attenuation for ${varName}`,
    ],
  },

  head_tracked_audio: {
    trait: 'head_tracked_audio',
    components: ['SpatialMediaPlayer', 'PointSourceParams'],
    level: 'partial',
    imports: [
      'android.media.MediaPlayer',
      'androidx.xr.scenecore.SpatialMediaPlayer',
      'androidx.xr.scenecore.PointSourceParams',
    ],
    generate: (varName) => [
      `// @head_tracked_audio -- audio anchored to head position`,
      `// Android XR: use PointSourceParams with a head-relative entity`,
      `val ${varName}PointSource = PointSourceParams(session.scene.mainPanelEntity)`,
      `// TODO: configure head-locked audio source for ${varName}`,
    ],
  },
};

// =============================================================================
// AR/XR TRAITS
// =============================================================================

export const AR_TRAIT_MAP: Record<string, AndroidXRTraitMapping> = {
  anchor: {
    trait: 'anchor',
    components: ['AnchorEntity'],
    level: 'full',
    imports: [
      'androidx.xr.scenecore.AnchorEntity',
      'androidx.xr.arcore.Anchor',
    ],
    generate: (varName, config) => {
      const target = String(config.anchor_type || 'plane');
      const lines = [
        `// @anchor -- AnchorEntity for world-locked placement (type: ${target})`,
      ];
      if (target === 'plane') {
        lines.push(
          `val ${varName}AnchorPlacement = AnchorPlacement.createForPlanes(`,
          `    anchorablePlaneOrientations = setOf(PlaneOrientation.HORIZONTAL),`,
          `    anchorablePlaneSemanticTypes = setOf(PlaneSemanticType.FLOOR, PlaneSemanticType.TABLE)`,
          `)`,
          `val ${varName}Movable = MovableComponent.createAnchorable(session, setOf(${varName}AnchorPlacement))`,
          `${varName}.addComponent(${varName}Movable)`,
        );
      } else if (target === 'vertical') {
        lines.push(
          `val ${varName}AnchorPlacement = AnchorPlacement.createForPlanes(`,
          `    anchorablePlaneOrientations = setOf(PlaneOrientation.VERTICAL)`,
          `)`,
          `val ${varName}Movable = MovableComponent.createAnchorable(session, setOf(${varName}AnchorPlacement))`,
          `${varName}.addComponent(${varName}Movable)`,
        );
      } else {
        lines.push(
          `val ${varName}Anchor = Anchor.create(session, ${varName}.pose)`,
          `when (${varName}Anchor) {`,
          `    is AnchorCreateSuccess -> {`,
          `        AnchorEntity.create(session, ${varName}Anchor.anchor).apply {`,
          `            parent = session.scene.activitySpace`,
          `            addChild(${varName})`,
          `        }`,
          `    }`,
          `}`,
        );
      }
      return lines;
    },
  },

  plane_detection: {
    trait: 'plane_detection',
    components: ['PlaneTrackable'],
    level: 'full',
    imports: [
      'com.google.ar.core.Config',
      'com.google.ar.core.Plane',
      'com.google.ar.core.TrackingState',
    ],
    generate: (varName, config) => {
      const types = (config.types as string[]) || ['horizontal', 'vertical'];
      return [
        `// @plane_detection -- ARCore plane detection (types: ${types.join(', ')})`,
        `// android.permission.SCENE_UNDERSTANDING_COARSE required`,
        `xrSession.scene.configure { config ->`,
        `    config.planeFindingMode = Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL`,
        `}`,
        `xrSession.scene.addOnUpdateListener { frame ->`,
        `    for (plane in frame.getUpdatedTrackables(Plane::class.java)) {`,
        `        if (plane.trackingState == TrackingState.TRACKING) {`,
        `            val ${varName}Anchor = plane.createAnchor(plane.centerPose)`,
        `            // Place ${varName} at detected plane`,
        `        }`,
        `    }`,
        `}`,
      ];
    },
  },

  mesh_detection: {
    trait: 'mesh_detection',
    components: [],
    level: 'partial',
    imports: [
      'com.google.ar.core.Config',
    ],
    generate: (varName) => [
      `// @mesh_detection -- ARCore scene mesh reconstruction`,
      `// android.permission.SCENE_UNDERSTANDING_COARSE required`,
      `xrSession.scene.configure { config ->`,
      `    config.depthMode = Config.DepthMode.AUTOMATIC`,
      `}`,
      `// TODO: process depth frames for scene mesh reconstruction for ${varName}`,
    ],
  },

  hand_tracking: {
    trait: 'hand_tracking',
    components: ['HandTrackingProvider'],
    level: 'full',
    imports: [
      'androidx.xr.arcore.Hand',
      'androidx.xr.arcore.HandJointType',
      'androidx.xr.arcore.HandTrackingMode',
    ],
    generate: (varName) => [
      `// @hand_tracking -- ARCore for Jetpack XR HandTrackingProvider`,
      `// android.permission.HAND_TRACKING required`,
      `val ${varName}Config = session.config.copy(handTracking = HandTrackingMode.BOTH)`,
      `session.configure(${varName}Config)`,
      ``,
      `Hand.left(session)?.state?.collect { handState ->`,
      `    val palmPose = handState.handJoints[HandJointType.HAND_JOINT_TYPE_PALM] ?: return@collect`,
      `    val worldPose = session.scene.perceptionSpace.transformPoseTo(palmPose, session.scene.activitySpace)`,
      `    // Joint types: THUMB_TIP, INDEX_TIP, MIDDLE_TIP, RING_TIP, etc.`,
      `}`,
      `Hand.right(session)?.state?.collect { handState ->`,
      `    val palmPose = handState.handJoints[HandJointType.HAND_JOINT_TYPE_PALM] ?: return@collect`,
      `    val worldPose = session.scene.perceptionSpace.transformPoseTo(palmPose, session.scene.activitySpace)`,
      `}`,
    ],
  },

  eye_tracking: {
    trait: 'eye_tracking',
    components: ['InteractableComponent'],
    level: 'partial',
    imports: [
      'androidx.xr.scenecore.InteractableComponent',
      'androidx.xr.scenecore.InputEvent',
    ],
    generate: (varName) => [
      `// @eye_tracking -- Android XR eye tracking via gaze input events`,
      `// Eye gaze data surfaces through InputEvent hover actions`,
      `val ${varName}Interactable = InteractableComponent.create(session, executor) { event ->`,
      `    when (event.action) {`,
      `        InputEvent.Action.ACTION_HOVER_ENTER -> { /* gaze entered ${varName} */ }`,
      `        InputEvent.Action.ACTION_HOVER_EXIT -> { /* gaze exited ${varName} */ }`,
      `    }`,
      `}`,
      `${varName}.addComponent(${varName}Interactable)`,
    ],
  },

  occlusion: {
    trait: 'occlusion',
    components: [],
    level: 'partial',
    imports: [
      'com.google.ar.core.Config',
    ],
    generate: (_varName) => [
      `// @occlusion -- ARCore depth-based occlusion`,
      `xrSession.scene.configure { config ->`,
      `    config.depthMode = Config.DepthMode.AUTOMATIC`,
      `}`,
      `// Occlusion is handled automatically when depth mode is enabled`,
    ],
  },

  light_estimation: {
    trait: 'light_estimation',
    components: ['LightManager'],
    level: 'full',
    imports: [
      'com.google.ar.core.Config',
      'com.google.android.filament.LightManager',
    ],
    generate: (varName) => [
      `// @light_estimation -- ARCore environmental HDR light estimation`,
      `xrSession.scene.configure { config ->`,
      `    config.lightEstimationMode = Config.LightEstimationMode.ENVIRONMENTAL_HDR`,
      `}`,
      `// Filament IBL is automatically updated from ARCore light estimate for ${varName}`,
    ],
  },

  world_anchor: {
    trait: 'world_anchor',
    components: ['AnchorEntity'],
    level: 'full',
    imports: [
      'androidx.xr.scenecore.AnchorEntity',
      'androidx.xr.arcore.Anchor',
      'androidx.xr.arcore.AnchorPersistenceMode',
    ],
    generate: (varName, config) => {
      const persistent = config.persistent ?? true;
      const lines = [
        `// @world_anchor -- persistent world-locked anchor`,
        `val ${varName}AnchorResult = Anchor.create(session, ${varName}.pose)`,
        `when (${varName}AnchorResult) {`,
        `    is AnchorCreateSuccess -> {`,
        `        val ${varName}AnchorEntity = AnchorEntity.create(session, ${varName}AnchorResult.anchor)`,
        `        ${varName}AnchorEntity.parent = session.scene.activitySpace`,
        `        ${varName}AnchorEntity.addChild(${varName})`,
      ];
      if (persistent) {
        lines.push(
          `        // Persist anchor for cross-session retrieval`,
          `        val ${varName}Uuid = ${varName}AnchorResult.anchor.persist()`,
          `        // Retrieve later: Anchor.load(session, ${varName}Uuid)`,
        );
      }
      lines.push(
        `    }`,
        `}`,
      );
      return lines;
    },
  },

  geospatial: {
    trait: 'geospatial',
    components: ['AnchorEntity'],
    level: 'partial',
    imports: [
      'com.google.ar.core.GeospatialPose',
      'com.google.ar.core.Earth',
    ],
    generate: (varName, config) => {
      const lat = config.latitude ?? 0;
      const lng = config.longitude ?? 0;
      const alt = config.altitude ?? 0;
      return [
        `// @geospatial -- ARCore Geospatial API (supported on Android XR)`,
        `// Latitude: ${lat}, Longitude: ${lng}, Altitude: ${alt}`,
        `val ${varName}Earth = xrSession.earth`,
        `if (${varName}Earth?.trackingState == TrackingState.TRACKING) {`,
        `    val ${varName}GeoAnchor = ${varName}Earth.createAnchor(${lat}, ${lng}, ${alt}, 0f, 0f, 0f, 1f)`,
        `    // Attach ${varName} to geospatial anchor`,
        `}`,
      ];
    },
  },
};

// =============================================================================
// VISUAL TRAITS
// =============================================================================

export const VISUAL_TRAIT_MAP: Record<string, AndroidXRTraitMapping> = {
  visible: {
    trait: 'visible',
    components: [],
    level: 'full',
    generate: (varName, config) => {
      const visible = config.visible ?? true;
      return [visible ? '' : `${varName}.setEnabled(false)`].filter(Boolean);
    },
  },

  invisible: {
    trait: 'invisible',
    components: [],
    level: 'full',
    generate: (varName) => [`${varName}.setEnabled(false)`],
  },

  billboard: {
    trait: 'billboard',
    components: ['BillboardNode'],
    level: 'partial',
    imports: [
      'androidx.xr.runtime.math.Quaternion',
    ],
    generate: (varName) => [
      `// @billboard -- face entity toward camera each frame`,
      `// Android XR: no built-in BillboardComponent; update rotation in frame callback`,
      `xrSession.scene.addOnUpdateListener { _ ->`,
      `    val camPose = xrSession.scene.activitySpace.pose`,
      `    val lookAt = Quaternion.lookRotation(`,
      `        camPose.translation - ${varName}.pose.translation,`,
      `        Vector3(0f, 1f, 0f)`,
      `    )`,
      `    ${varName}.setPose(Pose(${varName}.pose.translation, lookAt))`,
      `}`,
    ],
  },

  particle_emitter: {
    trait: 'particle_emitter',
    components: ['ParticleSystem'],
    level: 'comment',
    generate: (varName, config) => {
      const rate = config.rate ?? 100;
      const lifetime = config.lifetime ?? 1.0;
      return [
        `// @particle_emitter -- no built-in particle system in SceneCore`,
        `// Rate: ${rate}, lifetime: ${lifetime}s`,
        `// TODO: implement via Filament particle renderer or custom compute shader for ${varName}`,
      ];
    },
  },

  animated: {
    trait: 'animated',
    components: ['GltfModelEntity'],
    level: 'full',
    imports: [
      'androidx.xr.scenecore.GltfModelEntity',
      'androidx.xr.scenecore.GltfModel',
    ],
    generate: (varName, config) => {
      const clip = config.clip || '';
      const loop = config.loop ?? true;
      return [
        `// @animated -- GltfModelEntity animation playback`,
        clip
          ? `${varName}Entity.startAnimation(loop = ${loop}, animationName = "${clip}")`
          : `${varName}Entity.startAnimation(loop = ${loop})`,
        `// Animation state: ${varName}Entity.getAnimationState()`,
      ];
    },
  },

  lod: {
    trait: 'lod',
    components: [],
    level: 'partial',
    generate: (varName, config) => {
      const distances = config.distances || [5, 15];
      const d = distances as number[];
      return [
        `// @lod -- level-of-detail switching`,
        `// Android XR: no built-in LOD; implement distance check in frame callback`,
        `// Thresholds: [${d[0] ?? 5}, ${d[1] ?? 15}] meters`,
        `xrSession.scene.addOnUpdateListener { _ ->`,
        `    val camPos = xrSession.scene.activitySpace.pose.translation`,
        `    val dist = Vector3.distance(camPos, ${varName}.pose.translation)`,
        `    when {`,
        `        dist < ${d[0] ?? 5}f -> { /* high detail */ }`,
        `        dist < ${d[1] ?? 15}f -> { /* medium detail */ }`,
        `        else -> { /* low detail */ }`,
        `    }`,
        `}`,
      ];
    },
  },

  shadow_caster: {
    trait: 'shadow_caster',
    components: ['LightManager'],
    level: 'partial',
    imports: [
      'com.google.android.filament.LightManager',
    ],
    generate: (varName) => [
      `// @shadow_caster -- enable shadow casting via Filament`,
      `// Filament: castShadows = true on the renderable for ${varName}`,
      `// renderableManager.setCastShadows(${varName}RenderableInstance, true)`,
    ],
  },

  shadow_receiver: {
    trait: 'shadow_receiver',
    components: ['LightManager'],
    level: 'partial',
    imports: [
      'com.google.android.filament.LightManager',
    ],
    generate: (varName) => [
      `// @shadow_receiver -- enable shadow receiving via Filament`,
      `// Filament: receiveShadows = true on the renderable for ${varName}`,
      `// renderableManager.setReceiveShadows(${varName}RenderableInstance, true)`,
    ],
  },
};

// =============================================================================
// ACCESSIBILITY TRAITS
// =============================================================================

export const ACCESSIBILITY_TRAIT_MAP: Record<string, AndroidXRTraitMapping> = {
  accessible: {
    trait: 'accessible',
    components: ['AccessibilityDelegate'],
    level: 'full',
    imports: [
      'android.view.accessibility.AccessibilityNodeInfo',
    ],
    generate: (varName, config) => {
      const label = config.label || '';
      const hint = config.hint || '';
      const isButton = config.isButton ?? false;
      return [
        `// @accessible -- Android accessibility support for ${varName}`,
        `${varName}.contentDescription = "${label}"`,
        ...(hint ? [`// Hint: ${hint}`] : []),
        ...(isButton ? [`// Role: Button -- set accessibilityClassName = "android.widget.Button"`] : []),
        `${varName}.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES`,
      ];
    },
  },

  alt_text: {
    trait: 'alt_text',
    components: ['AccessibilityDelegate'],
    level: 'full',
    generate: (varName, config) => {
      const text = config.text || '';
      return [
        `// @alt_text -- contentDescription for TalkBack`,
        `${varName}.contentDescription = "${text}"`,
      ];
    },
  },

  high_contrast: {
    trait: 'high_contrast',
    components: [],
    level: 'full',
    generate: (varName) => [
      `// @high_contrast -- Android accessibility high contrast mode`,
      `val ${varName}HighContrast = Settings.Secure.getInt(`,
      `    context.contentResolver,`,
      `    Settings.Secure.ACCESSIBILITY_HIGH_TEXT_CONTRAST_ENABLED, 0`,
      `) == 1`,
      `if (${varName}HighContrast) {`,
      `    // Apply high-contrast materials (WCAG 7:1 ratio)`,
      `}`,
    ],
  },

  motion_reduced: {
    trait: 'motion_reduced',
    components: [],
    level: 'full',
    generate: (varName) => [
      `// @motion_reduced -- respect Android reduce-motion preference`,
      `val ${varName}ReduceMotion = Settings.Global.getFloat(`,
      `    context.contentResolver,`,
      `    Settings.Global.ANIMATOR_DURATION_SCALE, 1.0f`,
      `) == 0f`,
      `if (${varName}ReduceMotion) {`,
      `    // Skip animations, use instant transitions`,
      `} else {`,
      `    // Play animations normally`,
      `}`,
    ],
  },
};

// =============================================================================
// UI TRAITS (SPATIAL)
// =============================================================================

export const UI_TRAIT_MAP: Record<string, AndroidXRTraitMapping> = {
  ui_floating: {
    trait: 'ui_floating',
    components: ['PanelEntity'],
    level: 'full',
    imports: [
      'androidx.xr.compose.spatial.SpatialPanel',
      'androidx.xr.compose.subspace.layout.SubspaceModifier',
    ],
    generate: (varName, config) => {
      const distance = config.distance ?? 0.3;
      return [
        `// @ui_floating -- SpatialPanel with offset position`,
        `SpatialPanel(SubspaceModifier.width(400f).height(300f)) {`,
        `    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {`,
        `        Text("${config.title || 'Info'}", style = MaterialTheme.typography.headlineSmall)`,
        `    }`,
        `}`,
        `// Position ${varName} at offset ${distance}m above parent`,
      ];
    },
  },

  ui_anchored: {
    trait: 'ui_anchored',
    components: ['PanelEntity', 'AnchorEntity'],
    level: 'full',
    imports: [
      'androidx.xr.compose.spatial.SpatialPanel',
      'androidx.xr.scenecore.AnchorEntity',
    ],
    generate: (varName, config) => {
      const to = String(config.to || 'world');
      return [
        `// @ui_anchored -- SpatialPanel anchored to ${to}`,
        `SpatialPanel(SubspaceModifier.width(400f).height(300f)) {`,
        `    // ${varName} anchored UI content`,
        `}`,
        ...(to === 'world' ? [
          `// Anchor to world via AnchorEntity`,
          `val ${varName}Anchor = Anchor.create(session, Pose())`,
        ] : []),
        ...(to.includes('hand') ? [
          `// Anchor to hand -- track via Hand.left/right(session)`,
        ] : []),
      ];
    },
  },

  ui_hand_menu: {
    trait: 'ui_hand_menu',
    components: ['PanelEntity', 'HandTrackingProvider'],
    level: 'partial',
    imports: [
      'androidx.xr.compose.spatial.SpatialPanel',
      'androidx.xr.arcore.Hand',
      'androidx.xr.arcore.HandJointType',
    ],
    generate: (varName, config) => {
      const hand = config.hand || 'left';
      const trigger = config.trigger || 'palm_up';
      return [
        `// @ui_hand_menu -- SpatialPanel attached to ${hand} hand`,
        `// Trigger: ${trigger}`,
        `Hand.${hand}(session)?.state?.collect { handState ->`,
        `    val palmPose = handState.handJoints[HandJointType.HAND_JOINT_TYPE_PALM]`,
        `    if (palmPose != null) {`,
        `        // Position ${varName} panel at palm location`,
        `        val worldPose = session.scene.perceptionSpace.transformPoseTo(palmPose, session.scene.activitySpace)`,
        `    }`,
        `}`,
      ];
    },
  },

  ui_billboard: {
    trait: 'ui_billboard',
    components: ['PanelEntity', 'BillboardNode'],
    level: 'partial',
    generate: (varName) => [
      `// @ui_billboard -- SpatialPanel that faces the user`,
      `// Android XR: update rotation in frame callback to face camera`,
      `SpatialPanel(SubspaceModifier.width(400f).height(300f)) {`,
      `    // ${varName} billboard UI content`,
      `}`,
      `// TODO: update ${varName} rotation to face camera each frame`,
    ],
  },

  ui_docked: {
    trait: 'ui_docked',
    components: ['PanelEntity'],
    level: 'full',
    imports: [
      'androidx.xr.compose.spatial.Orbiter',
      'androidx.xr.compose.spatial.OrbiterEdge',
    ],
    generate: (varName, config) => {
      const position = String(config.position || 'bottom');
      const edgeMap: Record<string, string> = {
        bottom: 'OrbiterEdge.Bottom',
        top: 'OrbiterEdge.Top',
        leading: 'OrbiterEdge.Start',
        trailing: 'OrbiterEdge.End',
      };
      return [
        `// @ui_docked -- Orbiter docked to panel edge`,
        `Orbiter(position = ${edgeMap[position] || 'OrbiterEdge.Bottom'}, offset = 96.dp) {`,
        `    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {`,
        `        // ${varName} docked controls`,
        `    }`,
        `}`,
      ];
    },
  },
};

// =============================================================================
// ENVIRONMENT / IMMERSIVE TRAITS
// =============================================================================

export const ENVIRONMENT_TRAIT_MAP: Record<string, AndroidXRTraitMapping> = {
  portal: {
    trait: 'portal',
    components: [],
    level: 'comment',
    generate: (varName, config) => {
      const _targetWorld = config.target_world || 'portalWorld';
      return [
        `// @portal -- no built-in portal in Android XR SceneCore`,
        `// TODO: implement portal via Filament stencil buffer + secondary scene for ${varName}`,
      ];
    },
  },

  volume: {
    trait: 'volume',
    components: ['SpatialEnvironment'],
    level: 'full',
    imports: [
      'androidx.xr.compose.spatial.Subspace',
    ],
    generate: (varName, config) => {
      const size = config.size || [0.6, 0.4, 0.4];
      const s = size as number[];
      return [
        `// @volume -- Subspace volumetric content container`,
        `// Size: ${s[0]}m x ${s[1]}m x ${s[2]}m`,
        `Subspace {`,
        `    // ${varName} volumetric content`,
        `    // Entities placed here are rendered in 3D space`,
        `}`,
      ];
    },
  },

  immersive: {
    trait: 'immersive',
    components: ['SpatialEnvironment'],
    level: 'full',
    imports: [
      'androidx.xr.scenecore.SpatialEnvironment',
      'androidx.xr.scenecore.GltfModel',
      'androidx.xr.scenecore.ExrImage',
    ],
    generate: (varName, config) => {
      const style = String(config.style || 'mixed');
      const lines = [
        `// @immersive -- SpatialEnvironment configuration (style: ${style})`,
      ];
      if (style === 'full') {
        lines.push(
          `val ${varName}Geometry = GltfModel.create(session, Paths.get("environment.glb"))`,
          `val ${varName}Skybox = ExrImage.createFromZip(session, Paths.get("skybox.zip"))`,
          `session.scene.spatialEnvironment.preferredSpatialEnvironment =`,
          `    SpatialEnvironment.SpatialEnvironmentPreference(${varName}Skybox, ${varName}Geometry)`,
          `session.scene.spatialEnvironment.setPassthroughOpacityPreference(0.0f)`,
        );
      } else if (style === 'mixed') {
        lines.push(
          `// Mixed mode: passthrough with virtual overlay`,
          `session.scene.spatialEnvironment.setPassthroughOpacityPreference(0.5f)`,
        );
      } else {
        lines.push(
          `// Passthrough mode`,
          `session.scene.spatialEnvironment.setPassthroughOpacityPreference(1.0f)`,
        );
      }
      return lines;
    },
  },
};

// =============================================================================
// V43 AI/XR TRAIT MAP
// =============================================================================

export const V43_TRAIT_MAP: Record<string, AndroidXRTraitMapping> = {
  spatial_persona: {
    trait: 'spatial_persona',
    components: [],
    level: 'comment',
    generate: (varName, config) => {
      const style = String(config.style || 'realistic');
      return [
        `// @spatial_persona -- no built-in persona system in Android XR`,
        `// Style: ${style}`,
        `// TODO: implement avatar/persona rendering for ${varName}`,
      ];
    },
  },

  shareplay: {
    trait: 'shareplay',
    components: [],
    level: 'comment',
    generate: (varName, config) => {
      const activity = String(config.activity_type || 'custom');
      return [
        `// @shareplay -- no direct SharePlay equivalent on Android XR`,
        `// Activity type: ${activity}`,
        `// TODO: implement via WebRTC, Nearby Connections, or custom multiplayer for ${varName}`,
      ];
    },
  },

  object_tracking: {
    trait: 'object_tracking',
    components: [],
    level: 'comment',
    imports: [
      'com.google.ar.core.Config',
    ],
    generate: (varName, config) => {
      const referenceObject = String(config.reference_object || 'MyObject');
      return [
        `// @object_tracking -- ARCore object tracking for reference: ${referenceObject}`,
        `// TODO: ARCore Augmented Images or object recognition pipeline for ${varName}`,
      ];
    },
  },

  scene_reconstruction: {
    trait: 'scene_reconstruction',
    components: [],
    level: 'partial',
    imports: [
      'com.google.ar.core.Config',
    ],
    generate: (varName, config) => {
      const mode = String(config.mode || 'mesh');
      return [
        `// @scene_reconstruction -- ARCore depth-based scene reconstruction (mode: ${mode})`,
        `xrSession.scene.configure { config ->`,
        `    config.depthMode = Config.DepthMode.AUTOMATIC`,
        `}`,
        `// TODO: process depth frames to reconstruct scene mesh for ${varName}`,
      ];
    },
  },

  volumetric_window: {
    trait: 'volumetric_window',
    components: ['SpatialEnvironment'],
    level: 'full',
    imports: [
      'androidx.xr.compose.spatial.Subspace',
      'androidx.xr.compose.subspace.layout.SubspaceModifier',
    ],
    generate: (varName, config) => {
      const width = Number(config.width || 0.5);
      const height = Number(config.height || 0.5);
      const depth = Number(config.depth || 0.5);
      return [
        `// @volumetric_window -- 3D content volume (${width}m x ${height}m x ${depth}m)`,
        `Subspace {`,
        `    // ${varName} volumetric content`,
        `    val ${varName}Model = GltfModel.create(session, Paths.get("${varName}.glb"))`,
        `    val ${varName}Entity = GltfModelEntity.create(session, ${varName}Model)`,
        `    ${varName}Entity.setPose(Pose(Vector3(0f, 0f, 0f), Quaternion.identity()))`,
        `}`,
      ];
    },
  },

  spatial_navigation: {
    trait: 'spatial_navigation',
    components: [],
    level: 'comment',
    generate: (varName) => [
      `// @spatial_navigation -- spatial navigation for ${varName}`,
      `// TODO: implement spatial navigation via Jetpack Compose for XR layouts`,
    ],
  },

  eye_tracked: {
    trait: 'eye_tracked',
    components: ['InteractableComponent'],
    level: 'partial',
    imports: [
      'androidx.xr.scenecore.InteractableComponent',
      'androidx.xr.scenecore.InputEvent',
    ],
    generate: (varName) => [
      `// @eye_tracked -- gaze-driven interaction via hover events`,
      `val ${varName}Interactable = InteractableComponent.create(session, executor) { event ->`,
      `    when (event.action) {`,
      `        InputEvent.Action.ACTION_HOVER_ENTER -> { /* gaze entered */ }`,
      `        InputEvent.Action.ACTION_HOVER_EXIT -> { /* gaze exited */ }`,
      `    }`,
      `}`,
      `${varName}.addComponent(${varName}Interactable)`,
    ],
  },

  realitykit_mesh: {
    trait: 'realitykit_mesh',
    components: ['GltfModelEntity'],
    level: 'full',
    imports: [
      'androidx.xr.scenecore.GltfModelEntity',
      'androidx.xr.scenecore.GltfModel',
    ],
    generate: (varName, config) => {
      const shape = String(config.shape || 'box');
      return [
        `// @realitykit_mesh -- GltfModelEntity from primitive (shape: ${shape})`,
        `// Android XR: use glTF models for geometry instead of programmatic shapes`,
        `val ${varName}Model = GltfModel.create(session, Paths.get("primitives/${shape}.glb"))`,
        `val ${varName}Entity = GltfModelEntity.create(session, ${varName}Model)`,
      ];
    },
  },

  eye_hand_fusion: {
    trait: 'eye_hand_fusion',
    components: ['InteractableComponent', 'HandTrackingProvider'],
    level: 'partial',
    imports: [
      'androidx.xr.scenecore.InteractableComponent',
      'androidx.xr.arcore.Hand',
      'androidx.xr.arcore.HandJointType',
    ],
    generate: (varName) => [
      `// @eye_hand_fusion -- combined eye gaze + hand tracking`,
      `val ${varName}Interactable = InteractableComponent.create(session, executor) { event ->`,
      `    if (event.source == InputEvent.Source.HANDS) {`,
      `        // Correlate hand input with gaze hover state`,
      `    }`,
      `}`,
      `${varName}.addComponent(${varName}Interactable)`,
      `// TODO: fuse gaze raycast with hand joint positions for ${varName}`,
    ],
  },

  // AI Generation traits -- comment-level stubs
  controlnet: {
    trait: 'controlnet',
    components: [],
    level: 'comment',
    generate: (_varName, config) => [
      `// @controlnet -- ControlNet image generation (model: ${String(config.model || 'canny')})`,
      `// TODO: route to TensorFlow Lite or remote inference endpoint`,
    ],
  },

  ai_texture_gen: {
    trait: 'ai_texture_gen',
    components: ['GltfModelEntity'],
    level: 'comment',
    generate: (varName, config) => [
      `// @ai_texture_gen -- AI texture generation (style: ${String(config.style || 'photorealistic')})`,
      `// TODO: generate texture via TFLite or API, assign to ${varName} Filament material`,
    ],
  },

  diffusion_realtime: {
    trait: 'diffusion_realtime',
    components: [],
    level: 'comment',
    generate: (_varName, config) => [
      `// @diffusion_realtime -- real-time diffusion rendering (backend: ${String(config.backend || 'vulkan')})`,
      `// TODO: integrate Vulkan compute pipeline or TFLite diffusion model`,
    ],
  },

  ai_upscaling: {
    trait: 'ai_upscaling',
    components: [],
    level: 'comment',
    generate: (_varName, config) => [
      `// @ai_upscaling -- AI upscaling (factor: ${String(config.factor || 2)}x)`,
      `// TODO: apply TFLite super-resolution model to texture`,
    ],
  },

  ai_inpainting: {
    trait: 'ai_inpainting',
    components: [],
    level: 'comment',
    generate: () => [
      `// @ai_inpainting -- AI inpainting`,
      `// TODO: apply mask-based inpainting via TFLite`,
    ],
  },

  neural_link: {
    trait: 'neural_link',
    components: [],
    level: 'comment',
    generate: (_varName, config) => [
      `// @neural_link -- neural interface link (interface: ${String(config.interface_type || 'bci')})`,
      `// TODO: implement BCI signal processing pipeline`,
    ],
  },

  neural_forge: {
    trait: 'neural_forge',
    components: [],
    level: 'comment',
    generate: () => [
      `// @neural_forge -- neural network model forge`,
      `// TODO: integrate on-device TFLite model training / NNAPI`,
    ],
  },

  embedding_search: {
    trait: 'embedding_search',
    components: [],
    level: 'comment',
    generate: (_varName, config) => [
      `// @embedding_search -- vector embedding search (dimensions: ${String(config.dimensions || 1536)})`,
      `// TODO: implement local vector index (e.g. SQLite FTS5 + embeddings)`,
    ],
  },

  ai_npc_brain: {
    trait: 'ai_npc_brain',
    components: [],
    level: 'comment',
    generate: (_varName, config) => [
      `// @ai_npc_brain -- AI NPC brain (model: ${String(config.model || 'llm')})`,
      `// TODO: integrate local LLM (Gemini Nano) or API-based NPC reasoning`,
    ],
  },

  vector_db: {
    trait: 'vector_db',
    components: [],
    level: 'comment',
    generate: () => [
      `// @vector_db -- vector database`,
      `// TODO: integrate local or remote vector store (e.g. Chroma, Pinecone)`,
    ],
  },

  vision: {
    trait: 'vision',
    components: [],
    level: 'comment',
    imports: ['com.google.mlkit.vision'],
    generate: (_varName, config) => [
      `// @vision -- ML Kit Vision (task: ${String(config.task || 'classification')})`,
      `// TODO: configure ML Kit pipeline for ${String(config.task || 'classification')}`,
    ],
  },

  spatial_awareness: {
    trait: 'spatial_awareness',
    components: [],
    level: 'partial',
    imports: [
      'com.google.ar.core.Config',
    ],
    generate: () => [
      `// @spatial_awareness -- spatial scene understanding`,
      `// TODO: combine plane detection + depth mode for scene understanding`,
      `xrSession.scene.configure { config ->`,
      `    config.planeFindingMode = Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL`,
      `    config.depthMode = Config.DepthMode.AUTOMATIC`,
      `}`,
    ],
  },

  neural_animation: {
    trait: 'neural_animation',
    components: [],
    level: 'comment',
    generate: (_varName, config) => [
      `// @neural_animation -- neural network-driven animation (style: ${String(config.style || 'motion_matching')})`,
      `// TODO: integrate TFLite pose prediction with GltfModelEntity animation`,
    ],
  },

  ai_vision: {
    trait: 'ai_vision',
    components: [],
    level: 'comment',
    imports: ['com.google.mlkit.vision'],
    generate: (_varName, config) => [
      `// @ai_vision -- AI vision processing (task: ${String(config.task || 'detection')})`,
      `// TODO: configure ML Kit object detection or custom TFLite model`,
    ],
  },
};

// =============================================================================
// COMBINED TRAIT MAP
// =============================================================================

export const ANDROIDXR_TRAIT_MAP: Record<string, AndroidXRTraitMapping> = {
  ...PHYSICS_TRAIT_MAP,
  ...INTERACTION_TRAIT_MAP,
  ...AUDIO_TRAIT_MAP,
  ...AR_TRAIT_MAP,
  ...VISUAL_TRAIT_MAP,
  ...ACCESSIBILITY_TRAIT_MAP,
  ...UI_TRAIT_MAP,
  ...ENVIRONMENT_TRAIT_MAP,
  ...V43_TRAIT_MAP,
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function getTraitMapping(traitName: string): AndroidXRTraitMapping | undefined {
  return ANDROIDXR_TRAIT_MAP[traitName];
}

export function generateTraitCode(
  traitName: string,
  varName: string,
  config: Record<string, unknown>
): string[] {
  const mapping = getTraitMapping(traitName);
  if (!mapping) {
    return [`// @${traitName} -- no Android XR mapping defined: ${JSON.stringify(config)}`];
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

export function getMinSdkVersion(traits: string[]): number {
  let maxSdk = 26;
  for (const trait of traits) {
    const mapping = getTraitMapping(trait);
    if (mapping?.minSdkVersion) {
      if (mapping.minSdkVersion > maxSdk) {
        maxSdk = mapping.minSdkVersion;
      }
    }
  }
  return maxSdk;
}

export function listAllTraits(): string[] {
  return Object.keys(ANDROIDXR_TRAIT_MAP);
}

export function listTraitsByLevel(level: TraitImplementationLevel): string[] {
  return Object.entries(ANDROIDXR_TRAIT_MAP)
    .filter(([_, mapping]) => mapping.level === level)
    .map(([name]) => name);
}

// =============================================================================
// COVERAGE TRACKING
// =============================================================================

export interface TraitCoverageReport {
  /** Total number of traits mapped */
  total: number;
  /** Traits with full implementation */
  full: string[];
  /** Traits with partial implementation */
  partial: string[];
  /** Traits with comment-only stubs */
  comment: string[];
  /** Traits marked as unsupported */
  unsupported: string[];
  /** Coverage percentage (full + partial / total) */
  coveragePercent: number;
  /** Full implementation percentage (full only / total) */
  fullCoveragePercent: number;
  /** Traits present in VisionOS map but missing from Android XR map */
  missingFromAndroidXR: string[];
  /** Platform comparison summary */
  platformComparison: {
    visionOSOnly: string[];
    androidXROnly: string[];
    bothPlatforms: string[];
  };
}

/**
 * Generates a comprehensive coverage report comparing Android XR trait
 * coverage against the VisionOS trait map.
 *
 * @param visionOSTraits - Array of trait names from VisionOS trait map
 * @returns TraitCoverageReport with detailed coverage analysis
 */
export function generateCoverageReport(visionOSTraits: string[]): TraitCoverageReport {
  const androidXRTraits = Object.keys(ANDROIDXR_TRAIT_MAP);

  const full = listTraitsByLevel('full');
  const partial = listTraitsByLevel('partial');
  const comment = listTraitsByLevel('comment');
  const unsupported = listTraitsByLevel('unsupported');

  const total = androidXRTraits.length;
  const coveragePercent = total > 0
    ? Math.round(((full.length + partial.length) / total) * 100 * 10) / 10
    : 0;
  const fullCoveragePercent = total > 0
    ? Math.round((full.length / total) * 100 * 10) / 10
    : 0;

  const androidXRSet = new Set(androidXRTraits);
  const visionOSSet = new Set(visionOSTraits);

  const missingFromAndroidXR = visionOSTraits.filter((t) => !androidXRSet.has(t));
  const visionOSOnly = visionOSTraits.filter((t) => !androidXRSet.has(t));
  const androidXROnly = androidXRTraits.filter((t) => !visionOSSet.has(t));
  const bothPlatforms = androidXRTraits.filter((t) => visionOSSet.has(t));

  return {
    total,
    full,
    partial,
    comment,
    unsupported,
    coveragePercent,
    fullCoveragePercent,
    missingFromAndroidXR,
    platformComparison: {
      visionOSOnly,
      androidXROnly,
      bothPlatforms,
    },
  };
}

/**
 * Returns a human-readable coverage summary string.
 */
export function getCoverageSummary(visionOSTraits: string[]): string {
  const report = generateCoverageReport(visionOSTraits);
  const lines = [
    `=== Android XR Trait Coverage Report ===`,
    `Total traits mapped: ${report.total}`,
    `  Full:        ${report.full.length} (${report.fullCoveragePercent}%)`,
    `  Partial:     ${report.partial.length}`,
    `  Comment:     ${report.comment.length}`,
    `  Unsupported: ${report.unsupported.length}`,
    ``,
    `Implementation coverage: ${report.coveragePercent}% (full + partial)`,
    `Full coverage:           ${report.fullCoveragePercent}%`,
    ``,
  ];

  if (report.missingFromAndroidXR.length > 0) {
    lines.push(`Missing from Android XR (present in VisionOS):`);
    for (const t of report.missingFromAndroidXR) {
      lines.push(`  - ${t}`);
    }
  } else {
    lines.push(`All VisionOS traits are covered in Android XR map.`);
  }

  lines.push(``);
  lines.push(`Platform comparison:`);
  lines.push(`  Both platforms: ${report.platformComparison.bothPlatforms.length}`);
  lines.push(`  VisionOS only:  ${report.platformComparison.visionOSOnly.length}`);
  lines.push(`  Android XR only: ${report.platformComparison.androidXROnly.length}`);

  return lines.join('\n');
}
